"""Reclaim free space in beeatlas.duckdb by rewriting it into a fresh file.

DuckDB never returns freed blocks to the filesystem: a CREATE OR REPLACE TABLE
(every loader and every dbt model does one per run) leaves the old table's
blocks on the free list and the file stays its high-water size. By 2026-10 the
file was ~40% free blocks. CHECKPOINT and VACUUM do not shrink it; the only way
down is a copy into a new file, which writes the live blocks contiguously.

The threshold reads DuckDB's free-block count, which a DELETE does not move:
deleted rows stay inside their blocks until the table is rewritten. Trim a
table with CREATE OR REPLACE ... AS SELECT, or pass --min-free 0 to force.

The copy is `COPY FROM DATABASE`, which carries every schema, table, view and
constraint. The original is replaced only after the copy verifies — same tables,
same row count per table, same view definitions — and then by an atomic rename,
so a failure at any point leaves the original untouched. View SQL may name the
catalog, which DuckDB takes from the file name; the rename keeps that name.

Runs from nightly.sh after the data build, under the publish lock: nothing else
may hold the database while it is copied, or writes made during the copy would
be lost at the rename. Stelis addresses db-relations by row content, not file
bytes, so a compacted file looks unchanged to the cache.

Usage: uv run python compact_duckdb.py [--min-free FRACTION]
"""

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path

import duckdb

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))

# Below this fraction of free blocks, a rewrite costs more than it saves.
DEFAULT_MIN_FREE = 0.25


@dataclass
class Result:
    compacted: bool
    bytes_before: int
    bytes_after: int
    free_fraction: float


def _free_fraction(con: duckdb.DuckDBPyConnection) -> float:
    total, free = con.execute("SELECT total_blocks, free_blocks FROM pragma_database_size()").fetchone()
    return free / total if total else 0.0


def _objects(con: duckdb.DuckDBPyConnection, catalog: str) -> tuple[list[str], dict[str, str]]:
    """Tables, and views with their stored SQL, in `catalog`."""
    tables = [
        f'"{s}"."{t}"' for s, t in con.execute(
            "SELECT schema_name, table_name FROM duckdb_tables() WHERE database_name = ? ORDER BY 1, 2",
            [catalog],
        ).fetchall()
    ]
    # Compared as text, not bound: dbt's external models are views over parquet
    # paths relative to data/dbt, so binding them depends on the working directory.
    views = {
        f'"{s}"."{v}"': sql for s, v, sql in con.execute(
            "SELECT schema_name, view_name, sql FROM duckdb_views() "
            "WHERE database_name = ? AND NOT internal",
            [catalog],
        ).fetchall()
    }
    return tables, views


def _row_counts(con: duckdb.DuckDBPyConnection, catalog: str, tables: list[str]) -> dict[str, int]:
    return {t: con.execute(f'SELECT count(*) FROM "{catalog}".{t}').fetchone()[0] for t in tables}


def compact(db_path: "str | Path", min_free: float = DEFAULT_MIN_FREE) -> Result:
    db_path = Path(db_path)
    tmp_path = db_path.with_name(db_path.name + ".compact")
    wal_path = db_path.with_name(db_path.name + ".wal")
    bytes_before = db_path.stat().st_size

    try:
        with duckdb.connect(str(db_path)) as con:
            con.execute("INSTALL spatial; LOAD spatial;")
            con.execute("CHECKPOINT")
            free = _free_fraction(con)
            if free < min_free:
                return Result(False, bytes_before, bytes_before, free)

            catalog = con.execute("SELECT current_database()").fetchone()[0]
            tables, views = _objects(con, catalog)
            expected = _row_counts(con, catalog, tables)

            tmp_path.unlink(missing_ok=True)
            con.execute(f"ATTACH '{tmp_path}' AS compacted")
            con.execute(f'COPY FROM DATABASE "{catalog}" TO compacted')
            if _objects(con, "compacted") != (tables, views):
                raise RuntimeError("compacted copy is missing tables or views")
            actual = _row_counts(con, "compacted", tables)
            if actual != expected:
                diff = {t: (expected[t], actual[t]) for t in tables if actual[t] != expected[t]}
                raise RuntimeError(f"compacted copy row counts differ: {diff}")
            con.execute("DETACH compacted")

        # A leftover WAL would be replayed against the new file on next open.
        if wal_path.exists():
            raise RuntimeError(f"{wal_path} exists after checkpoint; refusing to swap")
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise

    os.replace(tmp_path, db_path)
    return Result(True, bytes_before, db_path.stat().st_size, free)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--min-free", type=float, default=DEFAULT_MIN_FREE,
                        help=f"compact only above this free-block fraction (default {DEFAULT_MIN_FREE})")
    args = parser.parse_args()

    r = compact(DB_PATH, args.min_free)
    mib = 1024 * 1024
    if r.compacted:
        print(f"  compacted {DB_PATH}: {r.bytes_before / mib:.0f} MiB -> {r.bytes_after / mib:.0f} MiB "  # noqa: T201
              f"({r.free_fraction:.0%} was free)")
    else:
        print(f"  {DB_PATH}: {r.free_fraction:.0%} free, below {args.min_free:.0%} — left as is")  # noqa: T201
    return 0


if __name__ == "__main__":
    sys.exit(main())
