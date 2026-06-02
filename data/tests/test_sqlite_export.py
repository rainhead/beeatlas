"""Tests for data/sqlite_export.py — generate_sqlite() + main() orchestration."""

import sqlite3
from pathlib import Path

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq
import pytest


# ---------------------------------------------------------------------------
# Fixture: tiny parquet with a known schema and row count
# ---------------------------------------------------------------------------

PARQUET_COLUMNS = ["lat", "lon", "scientificName", "year"]
PARQUET_ROWS = [
    (47.5, -120.8, "Eucera acerba", 2024),
    (47.6, -121.0, "Bombus vosnesenskii", 2023),
    (48.1, -122.3, "Osmia lignaria", 2024),
    (46.9, -119.5, "Andrena fulva", 2022),
    (47.0, -120.0, "Halictus ligatus", 2025),
]


@pytest.fixture
def src_parquet(tmp_path: Path) -> Path:
    """Write a tiny parquet fixture to tmp_path and return its path."""
    table = pa.table(
        {
            "lat": pa.array([r[0] for r in PARQUET_ROWS], type=pa.float64()),
            "lon": pa.array([r[1] for r in PARQUET_ROWS], type=pa.float64()),
            "scientificName": pa.array([r[2] for r in PARQUET_ROWS], type=pa.string()),
            "year": pa.array([r[3] for r in PARQUET_ROWS], type=pa.int32()),
        }
    )
    path = tmp_path / "occurrences.parquet"
    pq.write_table(table, path)
    return path


# ---------------------------------------------------------------------------
# Test 1: generate_sqlite writes a SQLite file containing a table named
# "occurrences"
# ---------------------------------------------------------------------------


def test_creates_occurrences_table(src_parquet: Path, tmp_path: Path) -> None:
    from sqlite_export import generate_sqlite

    dst = tmp_path / "occurrences.db"
    generate_sqlite(src_parquet, dst)

    assert dst.exists(), "SQLite file was not created"
    con = sqlite3.connect(dst)
    tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    con.close()
    assert "occurrences" in tables, f"Expected 'occurrences' table, got: {tables}"


# ---------------------------------------------------------------------------
# Test 2: row count matches the source parquet
# ---------------------------------------------------------------------------


def test_row_count_matches(src_parquet: Path, tmp_path: Path) -> None:
    from sqlite_export import generate_sqlite

    dst = tmp_path / "occurrences.db"
    generate_sqlite(src_parquet, dst)

    con = sqlite3.connect(dst)
    count = con.execute("SELECT COUNT(*) FROM occurrences").fetchone()[0]
    con.close()
    assert count == len(PARQUET_ROWS), f"Expected {len(PARQUET_ROWS)} rows, got {count}"


# ---------------------------------------------------------------------------
# Test 3: column names match the source parquet schema
# ---------------------------------------------------------------------------


def test_column_names_match(src_parquet: Path, tmp_path: Path) -> None:
    from sqlite_export import generate_sqlite

    dst = tmp_path / "occurrences.db"
    generate_sqlite(src_parquet, dst)

    # Read parquet columns via duckdb
    parquet_cols = set(
        duckdb.execute(f"SELECT * FROM read_parquet('{src_parquet}') LIMIT 0").description or []
    )
    parquet_col_names = {desc[0] for desc in duckdb.execute(f"DESCRIBE SELECT * FROM read_parquet('{src_parquet}')").fetchall()}

    # Read SQLite columns via PRAGMA
    con = sqlite3.connect(dst)
    sqlite_cols = {row[1] for row in con.execute("PRAGMA table_info(occurrences)").fetchall()}
    con.close()

    assert sqlite_cols == parquet_col_names, (
        f"Column mismatch:\n  parquet={sorted(parquet_col_names)}\n  sqlite={sorted(sqlite_cols)}"
    )


# ---------------------------------------------------------------------------
# Test 4: calling generate_sqlite overwrites a pre-existing dst_db
# ---------------------------------------------------------------------------


def test_overwrites_existing_db(src_parquet: Path, tmp_path: Path) -> None:
    from sqlite_export import generate_sqlite

    dst = tmp_path / "occurrences.db"

    # First call
    generate_sqlite(src_parquet, dst)
    size_first = dst.stat().st_size

    # Second call on same dst — must not error or append
    generate_sqlite(src_parquet, dst)
    size_second = dst.stat().st_size

    con = sqlite3.connect(dst)
    count = con.execute("SELECT COUNT(*) FROM occurrences").fetchone()[0]
    con.close()

    assert count == len(PARQUET_ROWS), (
        f"After overwrite, expected {len(PARQUET_ROWS)} rows, got {count} (rows may have doubled)"
    )
    assert size_first == size_second, "File size changed on second call — possible append"


# ---------------------------------------------------------------------------
# Test 5: main() reads from _DBT_SANDBOX and writes to _EXPORT_DIR
# ---------------------------------------------------------------------------


def test_main_uses_sandbox_and_export_dir(src_parquet: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import sqlite_export

    sandbox_dir = tmp_path / "sandbox"
    sandbox_dir.mkdir()
    export_dir = tmp_path / "export"
    # Note: export_dir deliberately not pre-created — main() must create it

    # Copy fixture parquet into fake sandbox
    import shutil
    shutil.copy(src_parquet, sandbox_dir / "occurrences.parquet")

    monkeypatch.setattr(sqlite_export, "_DBT_SANDBOX", sandbox_dir)
    monkeypatch.setattr(sqlite_export, "_EXPORT_DIR", export_dir)

    sqlite_export.main()

    dst = export_dir / "occurrences.db"
    assert dst.exists(), "main() did not create occurrences.db in _EXPORT_DIR"

    con = sqlite3.connect(dst)
    count = con.execute("SELECT COUNT(*) FROM occurrences").fetchone()[0]
    con.close()
    assert count == len(PARQUET_ROWS), f"main() produced wrong row count: {count}"


# ---------------------------------------------------------------------------
# Hierarchy fixtures: mini taxa.csv.gz + parquet with taxon_id column
# ---------------------------------------------------------------------------

# taxon_id, ancestry, rank_level, rank, name, active
TAXA_ROWS = [
    (630955, "48460/1/47120/372739/47158/184884/47157", 33, "superfamily", "Anthophila", "true"),
    (47221, "48460/1/47120/372739/47158/184884/47157/630955", 30, "family", "Apidae", "true"),
    (52775, "48460/1/47120/372739/47158/184884/47157/630955/47221", 20, "genus", "Apis", "true"),
    (47219, "48460/1/47120/372739/47158/184884/47157/630955/47221/52775", 10, "species", "Apis mellifera", "true"),
    # bycatch: Vespidae (non-bee) — ancestry does NOT contain /630955/
    (52747, "48460/1/47120/372739/47158/184884/47157", 30, "family", "Vespidae", "true"),
]


@pytest.fixture
def taxa_csv_gz(tmp_path: Path) -> Path:
    """Write a mini taxa.csv.gz fixture and return its path."""
    import csv
    import gzip
    import io

    buf = io.StringIO()
    writer = csv.writer(buf, delimiter="\t")
    writer.writerow(["taxon_id", "ancestry", "rank_level", "rank", "name", "active"])
    for row in TAXA_ROWS:
        writer.writerow(row)
    gz_path = tmp_path / "taxa.csv.gz"
    with gzip.open(gz_path, "wt") as f:
        f.write(buf.getvalue())
    return gz_path


# lat, lon, scientificName, year, taxon_id
PARQUET_WITH_TAXON_ROWS = [
    (47.5, -120.8, "Apis mellifera", 2024, 47219),    # bee
    (47.6, -121.0, "Vespula squamosa", 2023, 52747),   # bycatch
    (48.1, -122.3, "Bombus vosnesenskii", 2024, None),  # NULL taxon_id (ok)
]


@pytest.fixture
def src_parquet_with_taxon(tmp_path: Path) -> Path:
    """Parquet fixture that includes a taxon_id column."""
    table = pa.table(
        {
            "lat": pa.array([r[0] for r in PARQUET_WITH_TAXON_ROWS], type=pa.float64()),
            "lon": pa.array([r[1] for r in PARQUET_WITH_TAXON_ROWS], type=pa.float64()),
            "scientificName": pa.array([r[2] for r in PARQUET_WITH_TAXON_ROWS], type=pa.string()),
            "year": pa.array([r[3] for r in PARQUET_WITH_TAXON_ROWS], type=pa.int32()),
            "taxon_id": pa.array([r[4] for r in PARQUET_WITH_TAXON_ROWS], type=pa.int64()),
        }
    )
    path = tmp_path / "occurrences_with_taxon.parquet"
    pq.write_table(table, path)
    return path
