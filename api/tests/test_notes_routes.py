"""Route-level integration tests for the note CRUD + read endpoints
(179-02; NOTES-01, NOTES-02, NOTES-04).

Mirrors api/tests/test_routes.py's fixture style (client/tmp_engine/_mint/
_allowlist_toml helpers, monkeypatched signing key + allowlist path) since
those fixtures are module-local to that file, not importable from
conftest.py -- duplicated here rather than redefined differently.

Session cookies embed {uid, login, role}; author_id on a written Note is a
real FK to users.id, so tests that create/edit notes always insert a
matching User row first via `_make_user`, then mint the session with that
same internal id as uid -- exactly the shape api/users.py:upsert_user
produces in the real login flow.
"""

import datetime

import pytest
from sqlalchemy.orm import Session

import api.config as config
import api.main as main
import api.session as session
from notes_store.db import make_engine
from notes_store.models import Base, Note, NoteRevision, User

ALLOWED_ORIGIN = "https://beeatlas.net"


@pytest.fixture
def client():
    return main.app.test_client()


@pytest.fixture(autouse=True)
def _base_env(monkeypatch):
    monkeypatch.setattr(config, "SESSION_SIGNING_KEY", "throwaway-test-signing-key")
    monkeypatch.setattr(config, "INAT_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(config, "WRITES_ENABLED", True)


@pytest.fixture
def tmp_engine(tmp_path, monkeypatch):
    engine = make_engine(tmp_path / "notes.db")
    Base.metadata.create_all(engine)
    monkeypatch.setattr(main, "_ENGINE", engine)
    return engine


def _mint(login="allowed_author", role="author", uid=1):
    serializer = session.make_serializer("throwaway-test-signing-key")
    return session.mint_cookie(serializer, internal_id=uid, inat_login=login, role=role)


def _allowlist_toml(tmp_path, roles: dict):
    path = tmp_path / "roles_allowlist.toml"
    body = "[roles]\n" + "\n".join(f'{login} = "{role}"' for login, role in roles.items())
    path.write_text(body)
    return path


def _make_user(engine, login="allowed_author", inat_user_id=42) -> int:
    now = datetime.datetime.now(datetime.UTC)
    with Session(engine) as db_session:
        user = User(
            inat_login=login,
            inat_user_id=inat_user_id,
            created_at=now,
            updated_at=now,
        )
        db_session.add(user)
        db_session.commit()
        return user.id


def _make_note(engine, canonical_name="apis mellifera", author_id=1, body_md="hello", status="approved"):
    now = datetime.datetime.now(datetime.UTC)
    with Session(engine) as db_session:
        note = Note(
            canonical_name=canonical_name,
            author_id=author_id,
            body=body_md,
            body_html=f"<p>{body_md}</p>",
            status=status,
            created_at=now,
            updated_at=now,
        )
        db_session.add(note)
        db_session.flush()
        db_session.add(
            NoteRevision(
                note_id=note.id,
                body=body_md,
                editor_id=str(author_id),
                revised_at=now,
                action="create",
            )
        )
        db_session.commit()
        return note.id


def _sign_in(client, monkeypatch, tmp_path, login="allowed_author", role="author", uid=1):
    allowlist_path = _allowlist_toml(tmp_path, {login: role})
    monkeypatch.setattr(main.auth.roles_module, "_ALLOWLIST", allowlist_path)
    token = _mint(login=login, role=role, uid=uid)
    client.set_cookie(session.COOKIE_NAME, token, domain="localhost")


# ---------------------------------------------------------------------------
# POST /api/notes
# ---------------------------------------------------------------------------


def test_create_note_renders_and_sanitizes(client, monkeypatch, tmp_path, tmp_engine):
    uid = _make_user(tmp_engine, login="allowed_author")
    _sign_in(client, monkeypatch, tmp_path, login="allowed_author", uid=uid)

    resp = client.post(
        "/api/notes",
        headers={"Origin": ALLOWED_ORIGIN},
        json={"canonical_name": "apis mellifera", "body_md": "**bold** note with a [link](https://example.com)"},
    )
    assert resp.status_code == 201
    note_id = resp.get_json()["id"]

    with Session(tmp_engine) as db_session:
        note = db_session.get(Note, note_id)
        assert note.canonical_name == "apis mellifera"
        assert note.author_id == uid
        assert note.status == "approved"
        assert note.body == "**bold** note with a [link](https://example.com)"
        assert "<strong>bold</strong>" in note.body_html
        assert "<script>" not in note.body_html
        assert note.created_at is not None
        assert note.updated_at is not None

        revisions = db_session.query(NoteRevision).filter_by(note_id=note.id).all()
        assert len(revisions) == 1
        assert revisions[0].action == "create"


def test_create_note_empty_body_md_is_400(client, monkeypatch, tmp_path, tmp_engine):
    uid = _make_user(tmp_engine)
    _sign_in(client, monkeypatch, tmp_path, uid=uid)

    resp = client.post(
        "/api/notes",
        headers={"Origin": ALLOWED_ORIGIN},
        json={"canonical_name": "apis mellifera", "body_md": "   "},
    )
    assert resp.status_code == 400
    with Session(tmp_engine) as db_session:
        assert db_session.query(Note).count() == 0


def test_create_note_empty_canonical_name_is_400(client, monkeypatch, tmp_path, tmp_engine):
    uid = _make_user(tmp_engine)
    _sign_in(client, monkeypatch, tmp_path, uid=uid)

    resp = client.post(
        "/api/notes",
        headers={"Origin": ALLOWED_ORIGIN},
        json={"canonical_name": "  ", "body_md": "a fine note"},
    )
    assert resp.status_code == 400
    with Session(tmp_engine) as db_session:
        assert db_session.query(Note).count() == 0


def test_create_note_body_over_length_cap_is_400(client, monkeypatch, tmp_path, tmp_engine):
    uid = _make_user(tmp_engine)
    _sign_in(client, monkeypatch, tmp_path, uid=uid)

    resp = client.post(
        "/api/notes",
        headers={"Origin": ALLOWED_ORIGIN},
        json={"canonical_name": "apis mellifera", "body_md": "x" * 5001},
    )
    assert resp.status_code == 400
    with Session(tmp_engine) as db_session:
        assert db_session.query(Note).count() == 0


def test_create_note_no_cookie_is_401(client):
    resp = client.post(
        "/api/notes",
        headers={"Origin": ALLOWED_ORIGIN},
        json={"canonical_name": "apis mellifera", "body_md": "hi"},
    )
    assert resp.status_code == 401


def test_create_note_foreign_origin_is_403(client, monkeypatch, tmp_path, tmp_engine):
    uid = _make_user(tmp_engine)
    _sign_in(client, monkeypatch, tmp_path, uid=uid)

    resp = client.post(
        "/api/notes",
        headers={"Origin": "https://evil.example.com"},
        json={"canonical_name": "apis mellifera", "body_md": "hi"},
    )
    assert resp.status_code == 403


def test_create_note_writes_disabled_is_503(client, monkeypatch, tmp_path, tmp_engine):
    uid = _make_user(tmp_engine)
    _sign_in(client, monkeypatch, tmp_path, uid=uid)
    monkeypatch.setattr(config, "WRITES_ENABLED", False)

    resp = client.post(
        "/api/notes",
        headers={"Origin": ALLOWED_ORIGIN},
        json={"canonical_name": "apis mellifera", "body_md": "hi"},
    )
    assert resp.status_code == 503


def test_create_note_forged_author_id_in_body_is_ignored(client, monkeypatch, tmp_path, tmp_engine):
    uid = _make_user(tmp_engine, login="allowed_author")
    _sign_in(client, monkeypatch, tmp_path, login="allowed_author", uid=uid)

    resp = client.post(
        "/api/notes",
        headers={"Origin": ALLOWED_ORIGIN},
        json={
            "canonical_name": "apis mellifera",
            "body_md": "hi",
            "author_id": 999999,
            "author": "someone_else_entirely",
        },
    )
    assert resp.status_code == 201
    note_id = resp.get_json()["id"]
    with Session(tmp_engine) as db_session:
        note = db_session.get(Note, note_id)
        assert note.author_id == uid


# ---------------------------------------------------------------------------
# PATCH /api/notes/<id>
# ---------------------------------------------------------------------------


def test_edit_note_by_owner_succeeds(client, monkeypatch, tmp_path, tmp_engine):
    uid = _make_user(tmp_engine, login="owner")
    note_id = _make_note(tmp_engine, author_id=uid, body_md="original")
    _sign_in(client, monkeypatch, tmp_path, login="owner", uid=uid)

    resp = client.patch(
        f"/api/notes/{note_id}",
        headers={"Origin": ALLOWED_ORIGIN},
        json={"body_md": "**updated** text"},
    )
    assert resp.status_code == 200

    with Session(tmp_engine) as db_session:
        note = db_session.get(Note, note_id)
        assert note.body == "**updated** text"
        assert "<strong>updated</strong>" in note.body_html

        revisions = db_session.query(NoteRevision).filter_by(note_id=note_id).order_by(NoteRevision.id).all()
        assert [r.action for r in revisions] == ["create", "edit"]


def test_edit_note_by_non_owner_is_403(client, monkeypatch, tmp_path, tmp_engine):
    owner_uid = _make_user(tmp_engine, login="owner")
    note_id = _make_note(tmp_engine, author_id=owner_uid, body_md="original")

    other_uid = _make_user(tmp_engine, login="someone_else")
    _sign_in(client, monkeypatch, tmp_path, login="someone_else", uid=other_uid)

    resp = client.patch(
        f"/api/notes/{note_id}",
        headers={"Origin": ALLOWED_ORIGIN},
        json={"body_md": "hijack attempt"},
    )
    assert resp.status_code == 403

    with Session(tmp_engine) as db_session:
        note = db_session.get(Note, note_id)
        assert note.body == "original"


def test_edit_note_missing_is_404(client, monkeypatch, tmp_path, tmp_engine):
    uid = _make_user(tmp_engine)
    _sign_in(client, monkeypatch, tmp_path, uid=uid)

    resp = client.patch(
        "/api/notes/999999",
        headers={"Origin": ALLOWED_ORIGIN},
        json={"body_md": "whatever"},
    )
    assert resp.status_code == 404


def test_edit_note_no_cookie_is_401(client, tmp_engine):
    uid = _make_user(tmp_engine)
    note_id = _make_note(tmp_engine, author_id=uid)

    resp = client.patch(
        f"/api/notes/{note_id}",
        headers={"Origin": ALLOWED_ORIGIN},
        json={"body_md": "whatever"},
    )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /api/notes/<id>
# ---------------------------------------------------------------------------


def test_delete_note_by_owner_is_soft_delete(client, monkeypatch, tmp_path, tmp_engine):
    uid = _make_user(tmp_engine, login="owner")
    note_id = _make_note(tmp_engine, author_id=uid, body_md="to be removed")
    _sign_in(client, monkeypatch, tmp_path, login="owner", uid=uid)

    resp = client.delete(f"/api/notes/{note_id}", headers={"Origin": ALLOWED_ORIGIN})
    assert resp.status_code == 200

    with Session(tmp_engine) as db_session:
        note = db_session.get(Note, note_id)
        assert note is not None  # row survives (soft delete)
        assert note.status == "removed"

        revisions = db_session.query(NoteRevision).filter_by(note_id=note_id).order_by(NoteRevision.id).all()
        assert [r.action for r in revisions] == ["create", "remove"]


def test_delete_note_by_non_owner_is_403(client, monkeypatch, tmp_path, tmp_engine):
    owner_uid = _make_user(tmp_engine, login="owner")
    note_id = _make_note(tmp_engine, author_id=owner_uid)

    other_uid = _make_user(tmp_engine, login="someone_else")
    _sign_in(client, monkeypatch, tmp_path, login="someone_else", uid=other_uid)

    resp = client.delete(f"/api/notes/{note_id}", headers={"Origin": ALLOWED_ORIGIN})
    assert resp.status_code == 403

    with Session(tmp_engine) as db_session:
        note = db_session.get(Note, note_id)
        assert note.status == "approved"


def test_delete_note_missing_is_404(client, monkeypatch, tmp_path, tmp_engine):
    uid = _make_user(tmp_engine)
    _sign_in(client, monkeypatch, tmp_path, uid=uid)

    resp = client.delete("/api/notes/999999", headers={"Origin": ALLOWED_ORIGIN})
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/notes/<id>/takedown (180-02; MOD-02)
# ---------------------------------------------------------------------------


def test_takedown_by_curator_succeeds(client, monkeypatch, tmp_path, tmp_engine):
    owner_uid = _make_user(tmp_engine, login="owner")
    note_id = _make_note(tmp_engine, author_id=owner_uid, body_md="original")

    curator_uid = _make_user(tmp_engine, login="curator_login")
    _sign_in(client, monkeypatch, tmp_path, login="curator_login", role="curator", uid=curator_uid)

    resp = client.post(f"/api/notes/{note_id}/takedown", headers={"Origin": ALLOWED_ORIGIN}, json={})
    assert resp.status_code == 200

    with Session(tmp_engine) as db_session:
        note = db_session.get(Note, note_id)
        assert note.status == "hidden"

        revisions = db_session.query(NoteRevision).filter_by(note_id=note_id).order_by(NoteRevision.id).all()
        assert [r.action for r in revisions] == ["create", "takedown"]
        assert revisions[-1].editor_id == str(curator_uid)


def test_takedown_by_non_curator_author_is_403(client, monkeypatch, tmp_path, tmp_engine):
    owner_uid = _make_user(tmp_engine, login="owner")
    note_id = _make_note(tmp_engine, author_id=owner_uid, body_md="original")

    author_uid = _make_user(tmp_engine, login="plain_author")
    _sign_in(client, monkeypatch, tmp_path, login="plain_author", role="author", uid=author_uid)

    resp = client.post(f"/api/notes/{note_id}/takedown", headers={"Origin": ALLOWED_ORIGIN}, json={})
    assert resp.status_code == 403

    with Session(tmp_engine) as db_session:
        note = db_session.get(Note, note_id)
        assert note.status == "approved"
        revisions = db_session.query(NoteRevision).filter_by(note_id=note_id).all()
        assert [r.action for r in revisions] == ["create"]


def test_takedown_missing_is_404(client, monkeypatch, tmp_path, tmp_engine):
    curator_uid = _make_user(tmp_engine, login="curator_login")
    _sign_in(client, monkeypatch, tmp_path, login="curator_login", role="curator", uid=curator_uid)

    resp = client.post("/api/notes/999999/takedown", headers={"Origin": ALLOWED_ORIGIN}, json={})
    assert resp.status_code == 404


def test_takedown_foreign_origin_is_403(client, monkeypatch, tmp_path, tmp_engine):
    owner_uid = _make_user(tmp_engine, login="owner")
    note_id = _make_note(tmp_engine, author_id=owner_uid)

    curator_uid = _make_user(tmp_engine, login="curator_login")
    _sign_in(client, monkeypatch, tmp_path, login="curator_login", role="curator", uid=curator_uid)

    resp = client.post(
        f"/api/notes/{note_id}/takedown",
        headers={"Origin": "https://evil.example.com"},
        json={},
    )
    assert resp.status_code == 403

    with Session(tmp_engine) as db_session:
        note = db_session.get(Note, note_id)
        assert note.status == "approved"


def test_takedown_launch_gate_off_is_503(client, monkeypatch, tmp_path, tmp_engine):
    owner_uid = _make_user(tmp_engine, login="owner")
    note_id = _make_note(tmp_engine, author_id=owner_uid)

    curator_uid = _make_user(tmp_engine, login="curator_login")
    _sign_in(client, monkeypatch, tmp_path, login="curator_login", role="curator", uid=curator_uid)
    monkeypatch.setattr(config, "WRITES_ENABLED", False)

    resp = client.post(f"/api/notes/{note_id}/takedown", headers={"Origin": ALLOWED_ORIGIN}, json={})
    assert resp.status_code == 503


def test_takedown_appends_ledger(client, monkeypatch, tmp_path, tmp_engine):
    """Reason supplied -> stored verbatim; reason omitted -> NULL, never '' (D-09)."""
    owner_uid = _make_user(tmp_engine, login="owner")
    note_with_reason = _make_note(tmp_engine, author_id=owner_uid, body_md="reasoned")
    note_without_reason = _make_note(tmp_engine, author_id=owner_uid, body_md="unreasoned")

    curator_uid = _make_user(tmp_engine, login="curator_login")
    _sign_in(client, monkeypatch, tmp_path, login="curator_login", role="curator", uid=curator_uid)

    resp = client.post(
        f"/api/notes/{note_with_reason}/takedown",
        headers={"Origin": ALLOWED_ORIGIN},
        json={"reason": "spam content"},
    )
    assert resp.status_code == 200

    resp = client.post(
        f"/api/notes/{note_without_reason}/takedown",
        headers={"Origin": ALLOWED_ORIGIN},
        json={},
    )
    assert resp.status_code == 200

    with Session(tmp_engine) as db_session:
        with_reason = (
            db_session.query(NoteRevision).filter_by(note_id=note_with_reason, action="takedown").one()
        )
        assert with_reason.reason == "spam content"

        without_reason = (
            db_session.query(NoteRevision).filter_by(note_id=note_without_reason, action="takedown").one()
        )
        assert without_reason.reason is None


def test_takedown_removed_note_is_409(client, monkeypatch, tmp_path, tmp_engine):
    """CR-01: takedown must not reclassify an author-deleted note ('removed'),
    which would collapse the author-delete vs curator-takedown distinction (D-06)."""
    owner_uid = _make_user(tmp_engine, login="owner")
    note_id = _make_note(tmp_engine, author_id=owner_uid, status="removed")

    curator_uid = _make_user(tmp_engine, login="curator_login")
    _sign_in(client, monkeypatch, tmp_path, login="curator_login", role="curator", uid=curator_uid)

    resp = client.post(f"/api/notes/{note_id}/takedown", headers={"Origin": ALLOWED_ORIGIN}, json={})
    assert resp.status_code == 409

    with Session(tmp_engine) as db_session:
        note = db_session.get(Note, note_id)
        assert note.status == "removed"
        revisions = db_session.query(NoteRevision).filter_by(note_id=note_id).all()
        assert [r.action for r in revisions] == ["create"]


def test_takedown_already_hidden_is_409(client, monkeypatch, tmp_path, tmp_engine):
    """Only an 'approved' (public) note is a valid takedown target; a note already
    taken down cannot be taken down again."""
    owner_uid = _make_user(tmp_engine, login="owner")
    note_id = _make_note(tmp_engine, author_id=owner_uid, status="hidden")

    curator_uid = _make_user(tmp_engine, login="curator_login")
    _sign_in(client, monkeypatch, tmp_path, login="curator_login", role="curator", uid=curator_uid)

    resp = client.post(f"/api/notes/{note_id}/takedown", headers={"Origin": ALLOWED_ORIGIN}, json={})
    assert resp.status_code == 409


def test_takedown_non_string_reason_is_400(client, monkeypatch, tmp_path, tmp_engine):
    """WR-01: a non-string reason is rejected with 400, not a 500 from .strip()."""
    owner_uid = _make_user(tmp_engine, login="owner")
    note_id = _make_note(tmp_engine, author_id=owner_uid)

    curator_uid = _make_user(tmp_engine, login="curator_login")
    _sign_in(client, monkeypatch, tmp_path, login="curator_login", role="curator", uid=curator_uid)

    resp = client.post(
        f"/api/notes/{note_id}/takedown",
        headers={"Origin": ALLOWED_ORIGIN},
        json={"reason": 123},
    )
    assert resp.status_code == 400

    with Session(tmp_engine) as db_session:
        note = db_session.get(Note, note_id)
        assert note.status == "approved"


# ---------------------------------------------------------------------------
# POST /api/notes/<id>/restore (180-02; MOD-02, D-07 curl-only)
# ---------------------------------------------------------------------------


def test_restore_by_curator_sets_approved(client, monkeypatch, tmp_path, tmp_engine):
    owner_uid = _make_user(tmp_engine, login="owner")
    note_id = _make_note(tmp_engine, author_id=owner_uid, body_md="original", status="hidden")

    curator_uid = _make_user(tmp_engine, login="curator_login")
    _sign_in(client, monkeypatch, tmp_path, login="curator_login", role="curator", uid=curator_uid)

    resp = client.post(f"/api/notes/{note_id}/restore", headers={"Origin": ALLOWED_ORIGIN}, json={})
    assert resp.status_code == 200

    with Session(tmp_engine) as db_session:
        note = db_session.get(Note, note_id)
        assert note.status == "approved"

        revisions = db_session.query(NoteRevision).filter_by(note_id=note_id).order_by(NoteRevision.id).all()
        assert [r.action for r in revisions] == ["create", "restore"]
        assert revisions[-1].editor_id == str(curator_uid)


def test_restore_missing_is_404(client, monkeypatch, tmp_path, tmp_engine):
    curator_uid = _make_user(tmp_engine, login="curator_login")
    _sign_in(client, monkeypatch, tmp_path, login="curator_login", role="curator", uid=curator_uid)

    resp = client.post("/api/notes/999999/restore", headers={"Origin": ALLOWED_ORIGIN}, json={})
    assert resp.status_code == 404


def test_restore_foreign_origin_is_403(client, monkeypatch, tmp_path, tmp_engine):
    owner_uid = _make_user(tmp_engine, login="owner")
    note_id = _make_note(tmp_engine, author_id=owner_uid, status="hidden")

    curator_uid = _make_user(tmp_engine, login="curator_login")
    _sign_in(client, monkeypatch, tmp_path, login="curator_login", role="curator", uid=curator_uid)

    resp = client.post(
        f"/api/notes/{note_id}/restore",
        headers={"Origin": "https://evil.example.com"},
        json={},
    )
    assert resp.status_code == 403

    with Session(tmp_engine) as db_session:
        note = db_session.get(Note, note_id)
        assert note.status == "hidden"


def test_restore_appends_ledger(client, monkeypatch, tmp_path, tmp_engine):
    owner_uid = _make_user(tmp_engine, login="owner")
    note_id = _make_note(tmp_engine, author_id=owner_uid, status="hidden")

    curator_uid = _make_user(tmp_engine, login="curator_login")
    _sign_in(client, monkeypatch, tmp_path, login="curator_login", role="curator", uid=curator_uid)

    resp = client.post(
        f"/api/notes/{note_id}/restore",
        headers={"Origin": ALLOWED_ORIGIN},
        json={"reason": "appeal accepted"},
    )
    assert resp.status_code == 200

    with Session(tmp_engine) as db_session:
        revision = db_session.query(NoteRevision).filter_by(note_id=note_id, action="restore").one()
        assert revision.reason == "appeal accepted"


def test_restore_removed_note_is_409(client, monkeypatch, tmp_path, tmp_engine):
    """CR-01 (Critical): restore must NOT resurrect an author-deleted note
    ('removed' -> 'approved'), which would republish content the author
    intentionally removed. Only a curator-hidden note may be restored."""
    owner_uid = _make_user(tmp_engine, login="owner")
    note_id = _make_note(tmp_engine, author_id=owner_uid, status="removed")

    curator_uid = _make_user(tmp_engine, login="curator_login")
    _sign_in(client, monkeypatch, tmp_path, login="curator_login", role="curator", uid=curator_uid)

    resp = client.post(f"/api/notes/{note_id}/restore", headers={"Origin": ALLOWED_ORIGIN}, json={})
    assert resp.status_code == 409

    with Session(tmp_engine) as db_session:
        note = db_session.get(Note, note_id)
        assert note.status == "removed"
        revisions = db_session.query(NoteRevision).filter_by(note_id=note_id).all()
        assert [r.action for r in revisions] == ["create"]


def test_restore_approved_note_is_409(client, monkeypatch, tmp_path, tmp_engine):
    """A non-hidden note has nothing to restore -> 409 (no status change, no ledger row)."""
    owner_uid = _make_user(tmp_engine, login="owner")
    note_id = _make_note(tmp_engine, author_id=owner_uid, status="approved")

    curator_uid = _make_user(tmp_engine, login="curator_login")
    _sign_in(client, monkeypatch, tmp_path, login="curator_login", role="curator", uid=curator_uid)

    resp = client.post(f"/api/notes/{note_id}/restore", headers={"Origin": ALLOWED_ORIGIN}, json={})
    assert resp.status_code == 409

    with Session(tmp_engine) as db_session:
        revisions = db_session.query(NoteRevision).filter_by(note_id=note_id).all()
        assert [r.action for r in revisions] == ["create"]


def test_restore_non_string_reason_is_400(client, monkeypatch, tmp_path, tmp_engine):
    """WR-01: a non-string reason is rejected with 400, not a 500 from .strip()."""
    owner_uid = _make_user(tmp_engine, login="owner")
    note_id = _make_note(tmp_engine, author_id=owner_uid, status="hidden")

    curator_uid = _make_user(tmp_engine, login="curator_login")
    _sign_in(client, monkeypatch, tmp_path, login="curator_login", role="curator", uid=curator_uid)

    resp = client.post(
        f"/api/notes/{note_id}/restore",
        headers={"Origin": ALLOWED_ORIGIN},
        json={"reason": ["not", "a", "string"]},
    )
    assert resp.status_code == 400

    with Session(tmp_engine) as db_session:
        note = db_session.get(Note, note_id)
        assert note.status == "hidden"


# ---------------------------------------------------------------------------
# GET /api/notes?species=<canonical_name>
# ---------------------------------------------------------------------------


def test_hidden_note_excluded_from_read(client, tmp_engine):
    uid = _make_user(tmp_engine, login="author_one")
    hidden_id = _make_note(
        tmp_engine, canonical_name="apis mellifera", author_id=uid, body_md="hidden note", status="hidden"
    )

    resp = client.get("/api/notes?species=apis mellifera")
    assert resp.status_code == 200
    returned_ids = [item["id"] for item in resp.get_json()]
    assert hidden_id not in returned_ids


def test_read_notes_approved_only_newest_first(client, tmp_engine):
    uid = _make_user(tmp_engine, login="author_one")
    older_id = _make_note(tmp_engine, canonical_name="apis mellifera", author_id=uid, body_md="older")
    newer_id = _make_note(tmp_engine, canonical_name="apis mellifera", author_id=uid, body_md="newer")
    # Nudge timestamps apart so ORDER BY created_at DESC is unambiguous.
    with Session(tmp_engine) as db_session:
        older = db_session.get(Note, older_id)
        older.created_at = older.created_at - datetime.timedelta(minutes=5)
        db_session.commit()

    pending_id = _make_note(
        tmp_engine, canonical_name="apis mellifera", author_id=uid, body_md="pending", status="pending"
    )
    removed_id = _make_note(
        tmp_engine, canonical_name="apis mellifera", author_id=uid, body_md="removed", status="removed"
    )

    resp = client.get("/api/notes?species=apis mellifera")
    assert resp.status_code == 200
    items = resp.get_json()

    returned_ids = [item["id"] for item in items]
    assert returned_ids == [newer_id, older_id]
    assert pending_id not in returned_ids
    assert removed_id not in returned_ids


def test_read_notes_item_shape(client, tmp_engine):
    uid = _make_user(tmp_engine, login="author_one")
    note_id = _make_note(tmp_engine, canonical_name="apis mellifera", author_id=uid, body_md="hello **world**")

    resp = client.get("/api/notes?species=apis mellifera")
    assert resp.status_code == 200
    items = resp.get_json()
    assert len(items) == 1
    item = items[0]
    assert item["id"] == note_id
    assert "html" in item
    assert item["byline"]["login"] == "author_one"
    assert item["byline"]["display_name"] is None
    assert item["byline"]["collector_url"] is None
    assert "created" in item
    assert "updated" in item
    # Anonymous caller never gets edit-source fields.
    assert "body_md" not in item
    assert "can_edit" not in item


def test_read_notes_own_note_gets_body_md_and_can_edit(client, monkeypatch, tmp_path, tmp_engine):
    uid = _make_user(tmp_engine, login="author_one")
    note_id = _make_note(tmp_engine, canonical_name="apis mellifera", author_id=uid, body_md="raw source")
    _sign_in(client, monkeypatch, tmp_path, login="author_one", uid=uid)

    resp = client.get("/api/notes?species=apis mellifera")
    assert resp.status_code == 200
    item = resp.get_json()[0]
    assert item["body_md"] == "raw source"
    assert item["can_edit"] is True


def test_read_notes_authenticated_but_not_owner_gets_no_body_md(client, monkeypatch, tmp_path, tmp_engine):
    owner_uid = _make_user(tmp_engine, login="owner")
    _make_note(tmp_engine, canonical_name="apis mellifera", author_id=owner_uid, body_md="raw source")

    other_uid = _make_user(tmp_engine, login="someone_else")
    _sign_in(client, monkeypatch, tmp_path, login="someone_else", uid=other_uid)

    resp = client.get("/api/notes?species=apis mellifera")
    assert resp.status_code == 200
    item = resp.get_json()[0]
    assert "body_md" not in item
    assert "can_edit" not in item


def test_read_notes_unknown_species_is_empty_array(client, tmp_engine):
    resp = client.get("/api/notes?species=nonexistent species")
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_read_notes_absent_species_param_is_empty_array(client, tmp_engine):
    resp = client.get("/api/notes")
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_read_notes_is_public_no_session_needed(client, tmp_engine):
    """The read route has NO @auth.require_author -- an anonymous GET (no
    cookie, no Origin header) must succeed, not 401/403, even when notes
    exist for the requested species."""
    uid = _make_user(tmp_engine, login="author_one")
    _make_note(tmp_engine, canonical_name="apis mellifera", author_id=uid)

    resp = client.get("/api/notes?species=apis mellifera")
    assert resp.status_code == 200
    assert len(resp.get_json()) == 1
