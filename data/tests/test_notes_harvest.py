"""NOTES-03 harvest tests — data/notes_harvest.py.

Fast-tier (no @pytest.mark.integration) — every test seeds a function-scoped
tmp_path SQLite store via the ORM (mirrors test_notes_store_schema.py's
_make_user helper) and a tmp_path collectors.json fixture; nothing touches a
real database or network.

Covers:
  - approved-only, newest-first (created_at desc), D-13 Note shape
  - byline reuses collectors.json (D-11/D-12); @login/None fallback for a
    login absent from collectors.json
  - species with zero approved notes do not appear as keys
  - empty store -> empty Record ({})
  - the harvest opens the store via notes_store.db.make_engine (WAL), never a
    raw sqlite3.connect (grep-level check, Pitfall 5)
"""

import datetime
import json

from sqlalchemy.orm import Session

from notes_harvest import export_notes
from notes_store.db import make_engine
from notes_store.models import Base, Note, User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_db(tmp_path, name="notes.db"):
    """Return an engine whose tables are already created (mirrors
    test_notes_store_schema.py's _make_db)."""
    path = tmp_path / name
    engine = make_engine(path)
    Base.metadata.create_all(engine)
    return engine


def _make_user(session, inat_login, inat_user_id, now):
    user = User(
        inat_user_id=inat_user_id,
        inat_login=inat_login,
        created_at=now,
        updated_at=now,
    )
    session.add(user)
    session.flush()
    return user


def _write_collectors_json(assets_dir, records):
    assets_dir.mkdir(parents=True, exist_ok=True)
    (assets_dir / "collectors.json").write_text(
        json.dumps(records), encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# test_harvest_approved_only_newest_first_with_byline
# ---------------------------------------------------------------------------


def test_harvest_approved_only_newest_first_with_byline(tmp_path):
    """approved-only, newest-first, D-13 shape, byline from collectors.json."""
    engine = _make_db(tmp_path)
    assets_dir = tmp_path / "assets"
    _write_collectors_json(
        assets_dir,
        [{"login": "alice_inat", "display_name": "Alice A."}],
    )

    t1 = datetime.datetime(2026, 7, 1, 12, 0, 0)
    t2 = datetime.datetime(2026, 7, 2, 12, 0, 0)
    t3 = datetime.datetime(2026, 7, 3, 12, 0, 0)

    with Session(engine) as session:
        alice = _make_user(session, "alice_inat", 1, t1)
        bob = _make_user(session, "bob_inat", 2, t1)

        # Two species, mixed statuses.
        session.add_all(
            [
                Note(
                    canonical_name="apis mellifera",
                    author_id=alice.id,
                    body="older approved",
                    body_html="<p>older approved</p>",
                    status="approved",
                    created_at=t1,
                    updated_at=t1,
                ),
                Note(
                    canonical_name="apis mellifera",
                    author_id=bob.id,
                    body="newer approved",
                    body_html="<p>newer approved</p>",
                    status="approved",
                    created_at=t3,
                    updated_at=t3,
                ),
                Note(
                    canonical_name="apis mellifera",
                    author_id=alice.id,
                    body="pending, excluded",
                    body_html="<p>pending, excluded</p>",
                    status="pending",
                    created_at=t2,
                    updated_at=t2,
                ),
                Note(
                    canonical_name="bombus vosnesenskii",
                    author_id=bob.id,
                    body="removed, excluded",
                    body_html="<p>removed, excluded</p>",
                    status="removed",
                    created_at=t2,
                    updated_at=t2,
                ),
            ]
        )
        session.commit()

    export_notes(engine=engine, assets_dir=assets_dir)

    out = json.loads((assets_dir / "notes.json").read_text(encoding="utf-8"))

    # bombus vosnesenskii has zero approved notes -> not a key.
    assert set(out.keys()) == {"apis mellifera"}

    apis_notes = out["apis mellifera"]
    assert len(apis_notes) == 2
    # newest-first: bob's "newer approved" (t3) before alice's "older approved" (t1)
    assert apis_notes[0]["html"] == "<p>newer approved</p>"
    assert apis_notes[1]["html"] == "<p>older approved</p>"

    # D-13 shape
    for note in apis_notes:
        assert set(note.keys()) == {"id", "html", "byline", "created", "updated"}
        assert set(note["byline"].keys()) == {"display_name", "login", "collector_url"}

    # byline: alice is in collectors.json -> display_name + collector_url
    older = apis_notes[1]
    assert older["byline"] == {
        "display_name": "Alice A.",
        "login": "alice_inat",
        "collector_url": "/collectors/alice_inat/",
    }

    # byline: bob is absent from collectors.json -> @login fallback, null url
    newer = apis_notes[0]
    assert newer["byline"] == {
        "display_name": "@bob_inat",
        "login": "bob_inat",
        "collector_url": None,
    }


# ---------------------------------------------------------------------------
# test_harvest_excludes_hidden — MOD-04 (Phase 180)
# ---------------------------------------------------------------------------


def test_harvest_excludes_hidden(tmp_path):
    """A status='hidden' note (curator takedown) never appears in export_notes() output.

    Mirrors the pending/removed exclusion already covered by
    test_harvest_approved_only_newest_first_with_byline -- `hidden` (Phase 180's
    curator-takedown status, distinct from author self-delete `removed`, D-06) is
    a third non-approved value, excluded by the same pre-existing
    `Note.status == "approved"` filter with zero new harvest code (MOD-04 by
    construction, verification only -- data/notes_harvest.py is unchanged).
    """
    engine = _make_db(tmp_path)
    assets_dir = tmp_path / "assets"
    now = datetime.datetime(2026, 7, 5, 12, 0, 0)

    with Session(engine) as session:
        erin = _make_user(session, "erin_inat", 5, now)
        session.add_all(
            [
                Note(
                    canonical_name="apis mellifera",
                    author_id=erin.id,
                    body="approved, visible",
                    body_html="<p>approved, visible</p>",
                    status="approved",
                    created_at=now,
                    updated_at=now,
                ),
                Note(
                    canonical_name="apis mellifera",
                    author_id=erin.id,
                    body="taken down by a curator, excluded",
                    body_html="<p>taken down by a curator, excluded</p>",
                    status="hidden",
                    created_at=now,
                    updated_at=now,
                ),
            ]
        )
        session.commit()

    export_notes(engine=engine, assets_dir=assets_dir)

    out = json.loads((assets_dir / "notes.json").read_text(encoding="utf-8"))

    apis_notes = out["apis mellifera"]
    assert len(apis_notes) == 1, (
        f"Expected only the approved note, got {len(apis_notes)}: {apis_notes}"
    )
    assert apis_notes[0]["html"] == "<p>approved, visible</p>"


# ---------------------------------------------------------------------------
# test_harvest_empty_store_emits_empty_record
# ---------------------------------------------------------------------------


def test_harvest_empty_store_emits_empty_record(tmp_path):
    """An empty store (no notes at all) emits an empty Record ({})."""
    engine = _make_db(tmp_path)
    assets_dir = tmp_path / "assets"

    export_notes(engine=engine, assets_dir=assets_dir)

    out = json.loads((assets_dir / "notes.json").read_text(encoding="utf-8"))
    assert out == {}


# ---------------------------------------------------------------------------
# test_harvest_missing_collectors_json_falls_back
# ---------------------------------------------------------------------------


def test_harvest_missing_collectors_json_falls_back(tmp_path):
    """No collectors.json at all -> every byline falls back to @login/None."""
    engine = _make_db(tmp_path)
    assets_dir = tmp_path / "assets"
    now = datetime.datetime(2026, 7, 4, 12, 0, 0)

    with Session(engine) as session:
        carol = _make_user(session, "carol_inat", 3, now)
        session.add(
            Note(
                canonical_name="apis mellifera",
                author_id=carol.id,
                body="note",
                body_html="<p>note</p>",
                status="approved",
                created_at=now,
                updated_at=now,
            )
        )
        session.commit()

    export_notes(engine=engine, assets_dir=assets_dir)

    out = json.loads((assets_dir / "notes.json").read_text(encoding="utf-8"))
    assert out["apis mellifera"][0]["byline"] == {
        "display_name": "@carol_inat",
        "login": "carol_inat",
        "collector_url": None,
    }


# ---------------------------------------------------------------------------
# test_harvest_uses_make_engine_not_raw_sqlite3 — Pitfall 5
# ---------------------------------------------------------------------------


def test_harvest_uses_make_engine_not_raw_sqlite3():
    """notes_harvest.py calls notes_store.db.make_engine; never a raw sqlite3.connect."""
    import inspect

    import notes_harvest

    source = inspect.getsource(notes_harvest)
    assert "make_engine" in source
    assert "sqlite3.connect" not in source
    assert "import sqlite3" not in source
