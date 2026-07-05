"""STORE-01 schema, WAL mode, multi-note-per-species, and status default tests.

Fast-tier (no @pytest.mark.integration) — all tests use function-scoped tmp_path
and never touch a real database. Each test gets its own isolated SQLite file.

Covers:
  - STORE-01: notes + note_revisions schema with expected columns
  - D-06: multiple author-owned notes per canonical_name (no unique constraint)
  - D-16: WAL mode + foreign_keys enabled on every connection
  - D-08: status defaults to 'approved'
  - NOTES-02/D-07: soft-delete keeps the note row + revision history
    (append-only note_revisions ledger)

Phase 179 (D-08) recast notes.author_id from a free-text String to an integer
FK -> users.id, and added the NOT NULL notes.body_html column — every Note
insert below first creates a real users row and supplies body_html.
"""

import sqlite3
import datetime

import pytest
from sqlalchemy.orm import Session

from notes_store.db import make_engine
from notes_store.models import Base, Note, NoteRevision, User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_db(tmp_path, name="notes.db"):
    """Return an engine whose tables are already created."""
    path = tmp_path / name
    engine = make_engine(path)
    Base.metadata.create_all(engine)
    return engine


def _make_user(session, inat_login, inat_user_id, now):
    """Insert and return a User row (author_id FK target, D-08)."""
    user = User(
        inat_user_id=inat_user_id,
        inat_login=inat_login,
        created_at=now,
        updated_at=now,
    )
    session.add(user)
    session.flush()  # assign user.id without committing
    return user


# ---------------------------------------------------------------------------
# test_schema_notes — STORE-01: tables + columns
# ---------------------------------------------------------------------------


def test_schema_notes(tmp_path):
    """create_all produces notes + note_revisions with the expected columns."""
    engine = _make_db(tmp_path)
    db_path = tmp_path / "notes.db"

    con = sqlite3.connect(db_path)

    tables = {
        row[0]
        for row in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    assert "notes" in tables, f"'notes' table missing; got {tables}"
    assert "note_revisions" in tables, f"'note_revisions' table missing; got {tables}"

    notes_cols = {row[1] for row in con.execute("PRAGMA table_info(notes)").fetchall()}
    expected_notes_cols = {
        "id",
        "canonical_name",
        "author_id",
        "body",
        "body_html",
        "status",
        "created_at",
        "updated_at",
    }
    assert expected_notes_cols <= notes_cols, (
        f"notes missing columns: {expected_notes_cols - notes_cols}"
    )

    revisions_cols = {
        row[1] for row in con.execute("PRAGMA table_info(note_revisions)").fetchall()
    }
    expected_revisions_cols = {
        "id",
        "note_id",
        "body",
        "editor_id",
        "revised_at",
        "action",
        "reason",
    }
    assert expected_revisions_cols <= revisions_cols, (
        f"note_revisions missing columns: {expected_revisions_cols - revisions_cols}"
    )

    con.close()


# ---------------------------------------------------------------------------
# test_note_revisions_reason_column_nullable — MOD-03/D-09 (Phase 180, migration 0004)
# ---------------------------------------------------------------------------


def test_note_revisions_reason_column_nullable(tmp_path):
    """note_revisions.reason exists and is nullable (D-09, migration 0004).

    A curator takedown/restore accepts an optional free-text reason (empty
    allowed, D-09) -- the column must accept NULL so a reason-less action
    never forces a placeholder value. This is verification only (D-11):
    migration 0004 (Plan 01) already added the column; nothing here changes
    production code.
    """
    engine = _make_db(tmp_path)
    db_path = tmp_path / "notes.db"

    con = sqlite3.connect(db_path)
    try:
        # PRAGMA table_info row shape: (cid, name, type, notnull, dflt_value, pk)
        cols = {
            row[1]: row
            for row in con.execute("PRAGMA table_info(note_revisions)").fetchall()
        }
        assert "reason" in cols, (
            "note_revisions missing 'reason' column (migration 0004, D-09)"
        )
        notnull = cols["reason"][3]
        assert notnull == 0, (
            f"Expected note_revisions.reason to be nullable (notnull=0), got notnull={notnull}"
        )
    finally:
        con.close()

    # And an actual insert with reason=None succeeds (belt-and-suspenders, ORM path).
    now = datetime.datetime(2026, 7, 5, 12, 0, 0)
    with Session(engine) as session:
        gina = _make_user(session, "gina_inat", 6, now)
        note = Note(
            canonical_name="apis mellifera",
            author_id=gina.id,
            body="Gina's note.",
            body_html="<p>Gina's note.</p>",
            status="approved",
            created_at=now,
            updated_at=now,
        )
        session.add(note)
        session.flush()
        session.add(
            NoteRevision(
                note_id=note.id,
                body=note.body,
                editor_id=str(gina.id),
                revised_at=now,
                action="create",
                reason=None,
            )
        )
        session.commit()


# ---------------------------------------------------------------------------
# test_multiple_notes_per_species — D-06: no unique constraint on canonical_name
# ---------------------------------------------------------------------------


def test_multiple_notes_per_species(tmp_path):
    """Two Note rows with the same canonical_name and different author_id both persist.

    This test FAILS if a UNIQUE constraint is accidentally placed on canonical_name
    (D-06 — experts each have their own attributed note; the page renders a stacked list).
    """
    engine = _make_db(tmp_path)
    now = datetime.datetime(2026, 7, 3, 12, 0, 0)

    with Session(engine) as session:
        alice = _make_user(session, "alice_inat", 1, now)
        bob = _make_user(session, "bob_inat", 2, now)
        session.add(
            Note(
                canonical_name="apis mellifera",
                author_id=alice.id,
                body="Alice's note on honey bees.",
                body_html="<p>Alice's note on honey bees.</p>",
                created_at=now,
                updated_at=now,
            )
        )
        session.add(
            Note(
                canonical_name="apis mellifera",
                author_id=bob.id,
                body="Bob's note on honey bees.",
                body_html="<p>Bob's note on honey bees.</p>",
                created_at=now,
                updated_at=now,
            )
        )
        session.commit()

    con = sqlite3.connect(tmp_path / "notes.db")
    count = con.execute(
        "SELECT count(*) FROM notes WHERE canonical_name = 'apis mellifera'"
    ).fetchone()[0]
    con.close()

    assert count == 2, (
        f"Expected 2 notes for 'apis mellifera', got {count}. "
        "Check that canonical_name has no UNIQUE constraint (D-06)."
    )


# ---------------------------------------------------------------------------
# test_wal_mode — D-16: WAL mode + foreign_keys on every connection
# ---------------------------------------------------------------------------


def test_wal_mode(tmp_path):
    """A connection from make_engine reports journal_mode=wal and foreign_keys=1."""
    from sqlalchemy import text

    engine = _make_db(tmp_path)
    with engine.connect() as conn:
        journal_mode = conn.execute(text("PRAGMA journal_mode")).scalar()
        foreign_keys = conn.execute(text("PRAGMA foreign_keys")).scalar()

    assert journal_mode.lower() == "wal", (
        f"Expected journal_mode=wal, got {journal_mode!r}"
    )
    assert foreign_keys == 1, (
        f"Expected foreign_keys=1, got {foreign_keys!r}"
    )


# ---------------------------------------------------------------------------
# test_status_default — D-08: status defaults to 'approved'
# ---------------------------------------------------------------------------


def test_status_default(tmp_path):
    """A Note inserted without an explicit status defaults to 'approved'."""
    engine = _make_db(tmp_path)
    now = datetime.datetime(2026, 7, 3, 12, 0, 0)

    with Session(engine) as session:
        carol = _make_user(session, "carol_inat", 3, now)
        note = Note(
            canonical_name="bombus vosnesenskii",
            author_id=carol.id,
            body="Carol's note on yellow-faced bumble bees.",
            body_html="<p>Carol's note on yellow-faced bumble bees.</p>",
            created_at=now,
            updated_at=now,
        )
        session.add(note)
        session.commit()
        note_id = note.id

    con = sqlite3.connect(tmp_path / "notes.db")
    status = con.execute(
        "SELECT status FROM notes WHERE id = ?", (note_id,)
    ).fetchone()[0]
    con.close()

    assert status == "approved", (
        f"Expected status='approved' (D-08 default), got {status!r}"
    )


# ---------------------------------------------------------------------------
# test_soft_delete_keeps_row_and_appends_revision — NOTES-02/D-07
# ---------------------------------------------------------------------------


def test_soft_delete_keeps_row_and_appends_revision(tmp_path):
    """Soft-delete sets status='removed', keeps the row, and appends a NoteRevision.

    The append-only note_revisions ledger accumulates one row per action
    ('create', then 'remove') — deleting a note never deletes its history
    (D-07: the same mechanism Phase 180 curator takedown reuses).
    """
    engine = _make_db(tmp_path)
    now = datetime.datetime(2026, 7, 4, 12, 0, 0)

    with Session(engine) as session:
        dave = _make_user(session, "dave_inat", 4, now)
        note = Note(
            canonical_name="bombus vosnesenskii",
            author_id=dave.id,
            body="Dave's note.",
            body_html="<p>Dave's note.</p>",
            status="approved",
            created_at=now,
            updated_at=now,
        )
        session.add(note)
        session.flush()
        session.add(
            NoteRevision(
                note_id=note.id,
                body=note.body,
                editor_id=str(dave.id),
                revised_at=now,
                action="create",
            )
        )
        session.commit()
        note_id = note.id
        dave_id = dave.id

    # Soft-delete: flip status, append a 'remove' revision — never DELETE the row.
    later = now + datetime.timedelta(days=1)
    with Session(engine) as session:
        note = session.get(Note, note_id)
        note.status = "removed"
        note.updated_at = later
        session.add(
            NoteRevision(
                note_id=note_id,
                body=note.body,
                editor_id=str(dave_id),
                revised_at=later,
                action="remove",
            )
        )
        session.commit()

    con = sqlite3.connect(tmp_path / "notes.db")
    try:
        row = con.execute(
            "SELECT status FROM notes WHERE id = ?", (note_id,)
        ).fetchone()
        assert row is not None, "note row was deleted; expected soft-delete (D-07)"
        assert row[0] == "removed", f"Expected status='removed', got {row[0]!r}"

        actions = [
            r[0]
            for r in con.execute(
                "SELECT action FROM note_revisions WHERE note_id = ? ORDER BY id",
                (note_id,),
            ).fetchall()
        ]
        assert actions == ["create", "remove"], (
            f"Expected append-only ['create', 'remove'] revision history, got {actions}"
        )
    finally:
        con.close()
