"""Users-table migration tests (D-07/D-08/D-09; WRITE-02 store foundation).

Fast-tier (no @pytest.mark.integration) — all tests use function-scoped tmp_path
or pure text inspection; none require a running server or S3 access.

Tests:
  test_users_migration_applies — alembic upgrade head creates the users table and
                                  stamps alembic_version to '0002' (0001->0002 chain)
  test_users_login_unique      — two INSERTs with the same inat_login raise
                                  sqlite3.IntegrityError (unique index enforced)
  test_users_no_downgrade      — downgrade() on the 0002 module raises
                                  NotImplementedError (Pitfall 4 guard)
"""

import importlib.util
import sqlite3
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Helpers (mirrors test_notes_migrations.py)
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
# test_users_migration_applies
# ---------------------------------------------------------------------------


def test_users_migration_applies(tmp_path, monkeypatch):
    """alembic upgrade head creates users and stamps alembic_version to '0002'.

    Proves the 0001->0002 chain runs end to end and the users table has the
    expected columns plus a unique index on inat_login.
    """
    from alembic import command

    db_path = tmp_path / "notes.db"
    cfg = _make_alembic_config(db_path, monkeypatch)
    command.upgrade(cfg, "head")

    conn = sqlite3.connect(db_path)
    try:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        assert "users" in tables, f"'users' table missing after upgrade head; got {tables}"

        version_rows = conn.execute(
            "SELECT version_num FROM alembic_version"
        ).fetchall()
        assert len(version_rows) == 1, (
            f"Expected 1 row in alembic_version, got {len(version_rows)}"
        )
        assert version_rows[0][0] == "0002", (
            f"Expected version_num='0002', got {version_rows[0][0]!r}"
        )

        columns = {
            row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()
        }
        expected_columns = {"id", "inat_user_id", "inat_login", "created_at", "updated_at"}
        assert expected_columns.issubset(columns), (
            f"users table missing expected columns; got {columns}"
        )

        indexes = conn.execute("PRAGMA index_list(users)").fetchall()
        unique_login_index = [
            idx for idx in indexes if idx[1] == "ix_users_inat_login" and idx[2] == 1
        ]
        assert unique_login_index, (
            f"Expected a unique index named ix_users_inat_login; got {indexes}"
        )
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# test_users_login_unique — T-178-02
# ---------------------------------------------------------------------------


def test_users_login_unique(tmp_path, monkeypatch):
    """Two INSERTs with the same inat_login raise sqlite3.IntegrityError."""
    from alembic import command

    db_path = tmp_path / "notes.db"
    cfg = _make_alembic_config(db_path, monkeypatch)
    command.upgrade(cfg, "head")

    conn = sqlite3.connect(db_path)
    try:
        conn.execute(
            "INSERT INTO users (inat_user_id, inat_login, created_at, updated_at) "
            "VALUES (?, ?, ?, ?)",
            (123, "beekeeper1", "2026-07-04T00:00:00", "2026-07-04T00:00:00"),
        )
        conn.commit()

        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO users (inat_user_id, inat_login, created_at, updated_at) "
                "VALUES (?, ?, ?, ?)",
                (456, "beekeeper1", "2026-07-04T00:00:01", "2026-07-04T00:00:01"),
            )
            conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# test_users_no_downgrade — Pitfall 4 / T-178-01
# ---------------------------------------------------------------------------


def test_users_no_downgrade():
    """downgrade() on the 0002 migration raises NotImplementedError.

    The authoritative notes store has no upstream to rebuild from; a downgrade
    that drops tables is unrecoverable (Pitfall 4). This test asserts the hard
    guard without invoking Alembic's runner.
    """
    mod = _load_migration_module("0002")
    with pytest.raises(NotImplementedError):
        mod.downgrade()
