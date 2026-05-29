"""Export the dbt-built occurrences table from DuckDB sandbox to a standalone SQLite file.

Usage (standalone):
    cd data && uv run python sqlite_export.py

The module can also be imported and called programmatically:
    from sqlite_export import generate_sqlite
    generate_sqlite(Path("dbt/target/sandbox/occurrences.parquet"), Path("/tmp/occurrences.db"))
"""

import json
import os
import sqlite3 as _sqlite3
from pathlib import Path

import duckdb

_DBT_SANDBOX = Path(__file__).parent / "dbt" / "target" / "sandbox"
_EXPORT_DIR = Path(os.environ.get(
    "EXPORT_DIR",
    str(Path(__file__).parent.parent / "public" / "data"),
))


def generate_sqlite(src_parquet: Path, dst_db: Path) -> None:
    """Export *src_parquet* into a SQLite database at *dst_db*.

    The destination schema is derived entirely from the parquet file —
    no hardcoded CREATE TABLE statement. Overwrites *dst_db* if it exists.

    Args:
        src_parquet: Path to the source Parquet file (typically occurrences.parquet
                     produced by dbt).
        dst_db: Destination path for the SQLite database file.
    """
    # Remove any pre-existing file so ATTACH creates a fresh database.
    if dst_db.exists():
        dst_db.unlink()

    con = duckdb.connect(":memory:")
    try:
        con.execute("INSTALL sqlite; LOAD sqlite;")
        con.execute(f"ATTACH '{dst_db}' AS out (TYPE sqlite)")
        con.execute(
            f"CREATE TABLE out.occurrences AS SELECT * FROM read_parquet('{src_parquet}')"
        )
        con.execute("DETACH out")
    finally:
        con.close()

    # Pre-serialize geo rows as a single TEXT blob so the browser worker fetches them
    # with one SQL query and one WASM→JS callback (vs 92K callbacks = ~600 ms in Firefox).
    # Column order: [lat, lon, ecdysis_id, observation_id, specimen_observation_id,
    #                year, scientificName, genus, family, source]
    _GEO_COLS = [
        "lat", "lon", "ecdysis_id", "observation_id", "specimen_observation_id",
        "year", "scientificName", "genus", "family", "source",
    ]
    with _sqlite3.connect(dst_db) as idx_con:
        actual = {row[1] for row in idx_con.execute("PRAGMA table_info(occurrences)").fetchall()}
        select_expr = ", ".join(c if c in actual else f"NULL AS {c}" for c in _GEO_COLS)
        cur = idx_con.execute(
            f"SELECT {select_expr} "
            "FROM occurrences WHERE lat IS NOT NULL AND lon IS NOT NULL"
        )
        geo_json = json.dumps(cur.fetchall())
        idx_con.execute("CREATE TABLE geo_blob(data TEXT NOT NULL)")
        idx_con.execute("INSERT INTO geo_blob(data) VALUES (?)", (geo_json,))


def main() -> None:
    """Read occurrences.parquet from _DBT_SANDBOX and write occurrences.db to _EXPORT_DIR."""
    _EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    src = _DBT_SANDBOX / "occurrences.parquet"
    dst = _EXPORT_DIR / "occurrences.db"
    generate_sqlite(src, dst)
    size_mb = dst.stat().st_size / (1024 * 1024)
    print(f"occurrences.db written to {dst} ({size_mb:.1f} MB)")  # noqa: T201


if __name__ == "__main__":
    main()
