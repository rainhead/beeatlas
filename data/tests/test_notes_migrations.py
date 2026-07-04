"""STORE-02 migration, forward-only, and run.py isolation tests.

Fast-tier (no @pytest.mark.integration) — all tests use function-scoped tmp_path
or pure text inspection; none require a running server or S3 access.

Tests:
  test_migration_applies      — alembic upgrade head creates notes + note_revisions
                                 and records revision 0001 in alembic_version (STORE-02)
  test_no_downgrade           — downgrade() on 0001 raises NotImplementedError (Pitfall 4)
  test_run_py_never_migrates  — run.py text contains no notes_store/alembic/notes.db
                                 references and no STEPS entry name contains 'migrat'
                                 or 'notes' (D-03, STORE-02)
"""

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
# test_run_py_never_migrates — D-03 / T-177-02 / STORE-02
# ---------------------------------------------------------------------------


def test_run_py_never_migrates():
    """run.py contains no alembic/notes_store/notes.db references (D-03, STORE-02).

    The nightly pipeline (run.py) must never migrate or write the authoritative
    notes store. This test inspects run.py as plain text (never imports it, since
    that would pull in the whole pipeline) and asserts:
      1. None of the banned strings appear anywhere in the file.
      2. No STEPS entry name contains 'migrat' or 'notes'.

    STEPS names are extracted by looking for quoted strings on lines that contain
    the tuple open-paren pattern that defines STEPS entries.
    """
    run_py = _DATA_DIR / "run.py"
    assert run_py.exists(), f"run.py not found at {run_py}"
    text = run_py.read_text()

    # Banned substrings: any of these appearing in run.py would mean the pipeline
    # touches the authoritative store.
    banned = ["notes_store", "alembic", "notes.db", "NOTES_DB_PATH"]
    for term in banned:
        assert term not in text, (
            f"run.py contains {term!r} — the nightly pipeline must never "
            "migrate or write the authoritative notes store (D-03, STORE-02). "
            f"Found in: {run_py}"
        )

    # Parse STEPS entry names: lines like `    ("step-name", some_callable),`
    # Extract quoted first elements of tuples from the STEPS list.
    import re

    step_names = re.findall(r'^\s*\(\s*["\']([^"\']+)["\']', text, re.MULTILINE)
    assert step_names, "Could not parse any STEPS names from run.py — regex may need updating"

    bad_steps = [
        name for name in step_names
        if "migrat" in name.lower() or "notes" in name.lower()
    ]
    assert not bad_steps, (
        f"run.py STEPS contains entries that look like notes migration/write steps: "
        f"{bad_steps}. The nightly pipeline must never migrate or write the "
        "authoritative notes store (D-03, STORE-02)."
    )
