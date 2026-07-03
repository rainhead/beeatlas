"""STORE-01 schema, WAL mode, multi-note-per-species, and status default tests.

Fast-tier (no @pytest.mark.integration) — all tests use function-scoped tmp_path
and never touch a real database. Each test gets its own isolated SQLite file.

Covers:
  - STORE-01: notes + note_revisions schema with expected columns
  - D-06: multiple author-owned notes per canonical_name (no unique constraint)
  - D-16: WAL mode + foreign_keys enabled on every connection
  - D-08: status defaults to 'approved'
"""

import sqlite3
import datetime

import pytest
from sqlalchemy.orm import Session

from notes_store.db import make_engine
from notes_store.models import Base, Note, NoteRevision


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _make_db(tmp_path, name="notes.db"):
    """Return an engine whose tables are already created."""
    path = tmp_path / name
    engine = make_engine(path)
    Base.metadata.create_all(engine)
    return engine


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
    }
    assert expected_revisions_cols <= revisions_cols, (
        f"note_revisions missing columns: {expected_revisions_cols - revisions_cols}"
    )

    con.close()


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
        session.add(
            Note(
                canonical_name="apis mellifera",
                author_id="alice_inat",
                body="Alice's note on honey bees.",
                created_at=now,
                updated_at=now,
            )
        )
        session.add(
            Note(
                canonical_name="apis mellifera",
                author_id="bob_inat",
                body="Bob's note on honey bees.",
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
        note = Note(
            canonical_name="bombus vosnesenskii",
            author_id="carol_inat",
            body="Carol's note on yellow-faced bumble bees.",
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
