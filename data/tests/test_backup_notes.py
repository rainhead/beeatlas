"""TDD RED-phase tests for backup_notes.py — consistent-snapshot backup.

These tests drive the implementation in data/backup_notes.py. They fail
until backup_notes.py exists (ImportError) and are expanded to the full
4-test suite in plan 177-06 Task 2.

Behaviors under test (from plan 177-06 Task 1):
  1. make_snapshot() returns a path ending .db.gz that exists
  2. Gunzipping the result yields a valid SQLite DB whose notes row count equals source
  3. The source is opened with ?mode=ro (read-only)
  4. backup_notes() raises KeyError when NOTES_BACKUP_BUCKET is unset
"""

import pytest


def test_make_snapshot_returns_gz(tmp_path):
    """make_snapshot() returns a .db.gz path that exists (behavior 1)."""
    import sqlite3  # noqa: F401 — needed for type check below
    from notes_store.db import make_engine
    from notes_store.models import Base
    import backup_notes  # ImportError until GREEN phase

    src_db = tmp_path / "src.db"
    engine = make_engine(src_db)
    Base.metadata.create_all(engine)
    engine.dispose()

    out_dir = tmp_path / "out"
    out_dir.mkdir()
    gz = backup_notes.make_snapshot(src_db, out_dir)

    assert gz.exists(), "make_snapshot() must return a path to an existing file"
    assert gz.name.endswith(".db.gz"), f"Expected .db.gz filename, got {gz.name!r}"


def test_backup_notes_requires_bucket(monkeypatch):
    """backup_notes() raises KeyError when NOTES_BACKUP_BUCKET is unset (behavior 4)."""
    monkeypatch.delenv("NOTES_BACKUP_BUCKET", raising=False)
    from backup_notes import backup_notes  # ImportError until GREEN phase

    with pytest.raises(KeyError):
        backup_notes()
