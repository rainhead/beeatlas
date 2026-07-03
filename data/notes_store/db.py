"""SQLAlchemy engine factory for the BeeAtlas authoritative notes store.

Follows the module-level singleton init pattern from data/config.py:
a module-level constant sourced from an env var, with a factory function
that propagates failures loudly (no try/except around engine creation).

Pattern 2 (RESEARCH.md): WAL mode + foreign_keys + synchronous=NORMAL
are set on every connection via an event hook. WAL mode enables the
Phase-179 nightly harvest to open the DB read-only while the app writes
concurrently (D-16). synchronous=NORMAL is safer than OFF and faster than
FULL for this workload.

The DB is NOT opened or migrated at import time — import this module freely.
"""

import os
from pathlib import Path

from sqlalchemy import create_engine, event

# Module-level default path. Override via NOTES_DB_PATH env var (D-15: outside
# EXPORT_DIR, public/data/, and the beeatlas.duckdb path on maderas).
NOTES_DB_PATH = Path(os.environ.get("NOTES_DB_PATH", "/opt/beeatlas-store/notes.db"))


def make_engine(db_path: "str | Path | None" = None):
    """Return a SQLAlchemy engine with WAL mode, foreign keys, and synchronous=NORMAL.

    Args:
        db_path: Path to the SQLite file. Defaults to NOTES_DB_PATH (from env).

    Failures propagate loudly — no error handling here (same stance as config.py).
    """
    path = str(db_path or NOTES_DB_PATH)
    engine = create_engine(
        f"sqlite:///{path}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def set_wal_pragmas(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA journal_mode=WAL")
        dbapi_conn.execute("PRAGMA foreign_keys=ON")
        dbapi_conn.execute("PRAGMA synchronous=NORMAL")

    return engine
