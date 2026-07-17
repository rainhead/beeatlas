"""STORE-02 migration, forward-only, and run.py isolation tests.

Fast-tier (no @pytest.mark.integration) — all tests use function-scoped tmp_path
or pure text inspection; none require a running server or S3 access.

Tests:
  test_migration_applies      — alembic upgrade head creates notes + note_revisions
                                 and records revision 0001 in alembic_version (STORE-02)
  test_no_downgrade           — downgrade() on 0001 raises NotImplementedError (Pitfall 4)
  test_run_py_never_migrates  — run.py text contains no notes_store/alembic/notes.db
                                 references and no STEPS entry name contains 'migrat'
                                 (D-03, STORE-02). The single sanctioned exception is
                                 the exact "notes-harvest" step name (Phase 179 D-09):
                                 a READ-ONLY build-time harvest that opens the store
                                 via notes_store.db.make_engine (WAL) and never writes
                                 to it -- see data/notes_harvest.py. Any OTHER
                                 'notes'-named step (e.g. a hypothetical "notes-write"
                                 or "notes-migrate") is still banned.
  test_migration_0003_backfills_body_html — 0003 backfills body_html for pre-existing
                                 rows through render_note_markdown and recasts
                                 author_id to an int FK -> users.id (D-05/D-08)
  test_no_downgrade_0003      — downgrade() on 0003 raises NotImplementedError
  test_migration_0004_adds_reason_nullable — 0004 adds a nullable reason column
                                 to note_revisions (D-09)
  test_no_downgrade_0004      — downgrade() on 0004 raises NotImplementedError
"""

import datetime
import importlib.util
import sqlite3
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_DATA_DIR = Path(__file__).parent.parent  # data/
_MIGRATIONS_DIR = _DATA_DIR / "notes_store" / "migrations"


def _make_alembic_config(db_path: Path, monkeypatch):
    """Return an Alembic Config pointed at the notes_store migrations dir.

    Sets NOTES_DB_PATH in the environment so env.py reads the right SQLite file.
    """
    from alembic.config import Config

    monkeypatch.setenv("NOTES_DB_PATH", str(db_path))
    cfg = Config()
    cfg.set_main_option("script_location", str(_MIGRATIONS_DIR))
    # prepend_sys_path so "from notes_store.models import Base" works in env.py
    cfg.set_main_option("prepend_sys_path", str(_DATA_DIR))
    # Suppress path_separator deprecation warning (Alembic >=1.13)
    cfg.set_main_option("path_separator", "os")
    return cfg


def _load_migration_module(revision: str):
    """Load a migration module from versions/ by revision prefix."""
    versions_dir = _MIGRATIONS_DIR / "versions"
    matches = list(versions_dir.glob(f"{revision}_*.py"))
    assert matches, f"No migration file found for revision {revision!r} in {versions_dir}"
    path = matches[0]
    spec = importlib.util.spec_from_file_location(f"migration_{revision}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ---------------------------------------------------------------------------
# test_migration_applies — STORE-02
# ---------------------------------------------------------------------------


def test_migration_applies(tmp_path, monkeypatch):
    """alembic upgrade to 0001 creates notes + note_revisions and stamps alembic_version.

    Verifies:
      - Both tables exist in the SQLite file after upgrading to revision 0001
      - alembic_version table has exactly 1 row
      - version_num == '0001'

    Targets revision "0001" explicitly (not "head") — head has since advanced
    past 0001 (e.g. 0002 added the users table in Phase 178-02) and this test's
    purpose is to verify the *0001* migration in isolation, not the overall chain.
    """
    from alembic import command

    db_path = tmp_path / "notes.db"
    cfg = _make_alembic_config(db_path, monkeypatch)
    command.upgrade(cfg, "0001")

    conn = sqlite3.connect(db_path)
    try:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        assert "notes" in tables, f"'notes' table missing after upgrade head; got {tables}"
        assert "note_revisions" in tables, (
            f"'note_revisions' table missing after upgrade head; got {tables}"
        )
        assert "alembic_version" in tables, (
            f"'alembic_version' ledger missing after upgrade head; got {tables}"
        )

        version_rows = conn.execute(
            "SELECT version_num FROM alembic_version"
        ).fetchall()
        assert len(version_rows) == 1, (
            f"Expected 1 row in alembic_version, got {len(version_rows)}"
        )
        assert version_rows[0][0] == "0001", (
            f"Expected version_num='0001', got {version_rows[0][0]!r}"
        )
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# test_no_downgrade — Pitfall 4 / T-177-01
# ---------------------------------------------------------------------------


def test_no_downgrade():
    """downgrade() on the 0001 migration raises NotImplementedError.

    The authoritative notes store has no upstream to rebuild from; a downgrade
    that drops tables is unrecoverable (Pitfall 4). This test asserts the hard
    guard without invoking Alembic's runner.
    """
    mod = _load_migration_module("0001")
    with pytest.raises(NotImplementedError):
        mod.downgrade()


# ---------------------------------------------------------------------------
# test_pipeline_never_migrates — D-03 / T-177-02 / STORE-02
# ---------------------------------------------------------------------------


def test_pipeline_never_migrates():
    """No pipeline module migrates or writes the authoritative notes store.

    Successor to test_run_py_never_migrates: run.py is retired (the orchestrator
    is now Stelis, ~/dev/stelis), so the pipeline surface is the top-level
    data/*.py task modules Stelis invokes. Inspected as plain text (never
    imported — that would pull in the whole pipeline):

      1. Only the SANCTIONED modules may reference the store at all:
           notes_harvest.py — read-only build-time harvest (Phase 179 D-09/D-16,
                              via notes_store.db.make_engine)
           backup_notes.py  — WAL-safe read-only snapshot to the backup bucket
         Every other top-level module must contain none of the banned strings.
      2. The sanctioned modules must never reference alembic — reading the store
         is their job; MIGRATING it is forever the operator's (D-03, STORE-02).

    (Which of these modules actually runs, and in what order, is the Stelis
    graph's contract — cross-repo verification is st-whm.)
    """
    banned = ["notes_store", "alembic", "notes.db", "NOTES_DB_PATH"]
    sanctioned = {"notes_harvest.py", "backup_notes.py"}

    modules = sorted(p for p in _DATA_DIR.glob("*.py"))
    assert modules, f"no pipeline modules found under {_DATA_DIR}"
    assert sanctioned <= {p.name for p in modules}, (
        "sanctioned store-reader module(s) missing — update this test's "
        "sanctioned set if they were renamed"
    )

    for mod in modules:
        text = mod.read_text()
        if mod.name in sanctioned:
            assert "alembic" not in text, (
                f"{mod.name} references alembic — pipeline modules read the "
                "authoritative notes store, they never migrate it (D-03, STORE-02)."
            )
            continue
        for term in banned:
            assert term not in text, (
                f"{mod.name} contains {term!r} — only {sorted(sanctioned)} may "
                "touch the authoritative notes store, read-only "
                "(D-03, STORE-02)."
            )


# ---------------------------------------------------------------------------
# test_migration_0003_backfills_body_html — D-05/D-08
# ---------------------------------------------------------------------------


def test_migration_0003_backfills_body_html(tmp_path, monkeypatch):
    """alembic upgrade 0002 -> 0003 backfills body_html and recasts author_id.

    Seeds a DB at revision 0002 with one user and one note (author_id stored
    as the pre-0003 String form), upgrades to 0003, and verifies:
      - body_html == render_note_markdown(body) for the pre-existing row
      - body_html is NOT NULL (a fresh insert omitting it is rejected)
      - author_id is stored as an integer that FK-resolves to users.id
    """
    from alembic import command

    from notes_store.render import render_note_markdown

    db_path = tmp_path / "notes.db"
    cfg = _make_alembic_config(db_path, monkeypatch)
    command.upgrade(cfg, "0002")

    now = datetime.datetime(2026, 7, 4, 12, 0, 0).isoformat(sep=" ")
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "INSERT INTO users (id, inat_user_id, inat_login, created_at, updated_at) "
            "VALUES (1, 100, 'alice_inat', ?, ?)",
            (now, now),
        )
        conn.execute(
            "INSERT INTO notes (id, canonical_name, author_id, body, status, "
            "created_at, updated_at) VALUES (1, 'apis mellifera', '1', '**x**', "
            "'approved', ?, ?)",
            (now, now),
        )
        conn.commit()
    finally:
        conn.close()

    command.upgrade(cfg, "0003")

    expected_html = render_note_markdown("**x**")

    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute(
            "SELECT body_html, author_id FROM notes WHERE id = 1"
        ).fetchone()
        assert row is not None, "seeded note row missing after upgrade to 0003"
        body_html, author_id = row
        assert body_html == expected_html, (
            f"Expected backfilled body_html == render_note_markdown('**x**') "
            f"({expected_html!r}), got {body_html!r}"
        )
        assert author_id == 1, f"Expected author_id recast to int 1, got {author_id!r}"

        # author_id FK-resolves to users.id
        fk_rows = conn.execute("PRAGMA foreign_key_list(notes)").fetchall()
        fk_targets = {(row[2], row[3], row[4]) for row in fk_rows}  # (table, from, to)
        assert ("users", "author_id", "id") in fk_targets, (
            f"Expected an author_id -> users.id FK, got {fk_rows}"
        )

        # body_html NOT NULL: an insert omitting it must fail
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO notes (id, canonical_name, author_id, body, status, "
                "created_at, updated_at) VALUES (2, 'bombus vosnesenskii', 1, "
                "'y', 'approved', ?, ?)",
                (now, now),
            )
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# test_no_downgrade_0003 — Pitfall 4 / D-05
# ---------------------------------------------------------------------------


def test_no_downgrade_0003():
    """downgrade() on the 0003 migration raises NotImplementedError."""
    mod = _load_migration_module("0003")
    with pytest.raises(NotImplementedError):
        mod.downgrade()


# ---------------------------------------------------------------------------
# test_migration_0004_adds_reason_nullable — D-09
# ---------------------------------------------------------------------------


def test_migration_0004_adds_reason_nullable(tmp_path, monkeypatch):
    """alembic upgrade 0003 -> 0004 adds a nullable reason column to note_revisions.

    Seeds a DB at revision 0003, upgrades to 0004, and verifies:
      - PRAGMA table_info(note_revisions) lists a 'reason' column with notnull == 0
      - inserting a note_revisions row WITHOUT a reason succeeds (reason stored NULL)
    """
    from alembic import command

    db_path = tmp_path / "notes.db"
    cfg = _make_alembic_config(db_path, monkeypatch)
    command.upgrade(cfg, "0003")

    now = datetime.datetime(2026, 7, 5, 12, 0, 0).isoformat(sep=" ")
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "INSERT INTO users (id, inat_user_id, inat_login, created_at, updated_at) "
            "VALUES (1, 100, 'alice_inat', ?, ?)",
            (now, now),
        )
        conn.execute(
            "INSERT INTO notes (id, canonical_name, author_id, body, body_html, "
            "status, created_at, updated_at) VALUES (1, 'apis mellifera', 1, "
            "'**x**', '<p><strong>x</strong></p>', 'approved', ?, ?)",
            (now, now),
        )
        conn.commit()
    finally:
        conn.close()

    command.upgrade(cfg, "0004")

    conn = sqlite3.connect(db_path)
    try:
        columns = conn.execute("PRAGMA table_info(note_revisions)").fetchall()
        # PRAGMA table_info row shape: (cid, name, type, notnull, dflt_value, pk)
        reason_col = next((c for c in columns if c[1] == "reason"), None)
        assert reason_col is not None, (
            f"'reason' column missing from note_revisions after upgrade to 0004; "
            f"got columns {[c[1] for c in columns]}"
        )
        assert reason_col[3] == 0, (
            f"Expected 'reason' column to be nullable (notnull=0), got notnull={reason_col[3]}"
        )

        # Inserting a note_revisions row WITHOUT a reason succeeds (NULL).
        conn.execute(
            "INSERT INTO note_revisions (id, note_id, body, editor_id, revised_at, action) "
            "VALUES (1, 1, '**x**', '1', ?, 'create')",
            (now,),
        )
        conn.commit()

        row = conn.execute(
            "SELECT reason FROM note_revisions WHERE id = 1"
        ).fetchone()
        assert row is not None, "seeded note_revisions row missing after insert"
        assert row[0] is None, f"Expected reason to be NULL, got {row[0]!r}"
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# test_no_downgrade_0004 — Pitfall 4 / D-09
# ---------------------------------------------------------------------------


def test_no_downgrade_0004():
    """downgrade() on the 0004 migration raises NotImplementedError."""
    mod = _load_migration_module("0004")
    with pytest.raises(NotImplementedError):
        mod.downgrade()
