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
    # CR-01: an Anthophila taxon below species rank (subspecies under Apis mellifera).
    # Its ancestry contains /630955/, so it is a genuine bee — it must be owned by
    # PASS 1 (is_anthophila=1 + well-formed lineage), NOT the bycatch arm.
    (999001, "48460/1/47120/372739/47158/184884/47157/630955/47221/52775/47219", 5, "subspecies", "Apis mellifera ligustica", "true"),
    # bycatch: Vespidae (non-bee) — ancestry does NOT contain /630955/
    (52747, "48460/1/47120/372739/47158/184884/47157", 30, "family", "Vespidae", "true"),
    # CR-02: an off-tree taxon (NOT under Anthophila) that a checklist canonical_name
    # could resolve to. The checklist seed must drop it via the ancestry guard so it
    # is never stamped is_anthophila=1 with a malformed '//' lineage_path. Not
    # referenced by any occurrence, so it never enters via the occurrence/bycatch arms.
    (52750, "48460/1/47120/372739/47158/184884/47157", 30, "family", "Formicidae", "true"),
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
    # CR-01: occurrence identified to a sub-species Anthophila taxon (below species).
    (46.5, -119.9, "Apis mellifera ligustica", 2025, 999001),  # sub-species bee
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


# ---------------------------------------------------------------------------
# Hierarchy tests (Wave 0 RED — _build_taxon_hierarchy not yet implemented)
# ---------------------------------------------------------------------------


def test_taxa_table_exists(src_parquet_with_taxon: Path, taxa_csv_gz: Path, tmp_path: Path) -> None:
    from sqlite_export import generate_sqlite

    dst = tmp_path / "occurrences.db"
    generate_sqlite(src_parquet_with_taxon, dst, taxa_path=taxa_csv_gz)

    con = sqlite3.connect(dst)
    tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    con.close()
    assert "taxa" in tables, f"Expected 'taxa' table, got: {tables}"


def test_zero_orphan_taxon_ids(src_parquet_with_taxon: Path, taxa_csv_gz: Path, tmp_path: Path) -> None:
    from sqlite_export import generate_sqlite

    dst = tmp_path / "occurrences.db"
    generate_sqlite(src_parquet_with_taxon, dst, taxa_path=taxa_csv_gz)

    con = sqlite3.connect(dst)
    (count,) = con.execute(
        "SELECT COUNT(*) FROM occurrences WHERE taxon_id IS NOT NULL "
        "AND taxon_id NOT IN (SELECT taxon_id FROM taxa)"
    ).fetchone()
    con.close()
    assert count == 0, f"Found {count} orphan taxon_id values"


def test_taxa_name_rank_non_null(src_parquet_with_taxon: Path, taxa_csv_gz: Path, tmp_path: Path) -> None:
    from sqlite_export import generate_sqlite

    dst = tmp_path / "occurrences.db"
    generate_sqlite(src_parquet_with_taxon, dst, taxa_path=taxa_csv_gz)

    con = sqlite3.connect(dst)
    (count,) = con.execute(
        "SELECT COUNT(*) FROM taxa "
        "WHERE taxon_id IN (SELECT DISTINCT taxon_id FROM occurrences WHERE taxon_id IS NOT NULL) "
        "AND (name IS NULL OR rank IS NULL)"
    ).fetchone()
    con.close()
    assert count == 0, f"Found {count} taxa rows with NULL name or rank for referenced taxon_ids"


def test_apidae_descendant_query(src_parquet_with_taxon: Path, taxa_csv_gz: Path, tmp_path: Path) -> None:
    from sqlite_export import generate_sqlite

    dst = tmp_path / "occurrences.db"
    generate_sqlite(src_parquet_with_taxon, dst, taxa_path=taxa_csv_gz)

    con = sqlite3.connect(dst)
    rows = con.execute(
        "SELECT taxon_id, is_anthophila FROM taxa "
        "WHERE taxon_id = 47221 OR instr(lineage_path, '/47221/') > 0"
    ).fetchall()
    con.close()
    assert len(rows) > 0, "Expected at least one Apidae descendant in taxa"
    non_bee = [r for r in rows if r[1] != 1]
    assert non_bee == [], f"Found non-Anthophila rows in Apidae descendants: {non_bee}"


def test_active_taxa_only(src_parquet_with_taxon: Path, taxa_csv_gz: Path, tmp_path: Path) -> None:
    from sqlite_export import generate_sqlite

    dst = tmp_path / "occurrences.db"
    generate_sqlite(src_parquet_with_taxon, dst, taxa_path=taxa_csv_gz)

    con = sqlite3.connect(dst)
    # Known active bee must be present
    (bee_count,) = con.execute("SELECT COUNT(*) FROM taxa WHERE taxon_id = 47219").fetchone()
    # No taxon outside the fixture's active+bycatch set should appear
    known_ids = {row[0] for row in TAXA_ROWS}
    all_taxon_ids = {row[0] for row in con.execute("SELECT taxon_id FROM taxa").fetchall()}
    con.close()
    assert bee_count == 1, "Known active bee taxon 47219 not found in taxa"
    unexpected = all_taxon_ids - known_ids
    assert unexpected == set(), f"Unexpected taxon_ids found in taxa (not in fixture): {unexpected}"


def test_orphan_assertion_raises(src_parquet_with_taxon: Path, tmp_path: Path) -> None:
    """If taxa table is empty, orphan assertion must raise ValueError."""
    from sqlite_export import _assert_no_orphan_taxon_ids
    import sqlite3 as stdlib_sqlite3

    dst = tmp_path / "bare.db"
    # Create occurrences + empty taxa manually
    con = stdlib_sqlite3.connect(dst)
    con.execute("CREATE TABLE occurrences (taxon_id INTEGER)")
    con.execute("INSERT INTO occurrences VALUES (99999)")
    con.execute("CREATE TABLE taxa (taxon_id INTEGER PRIMARY KEY)")
    con.commit()
    con.close()

    with pytest.raises(ValueError, match="orphan"):
        _assert_no_orphan_taxon_ids(dst)


def test_is_anthophila_flag(src_parquet_with_taxon: Path, taxa_csv_gz: Path, tmp_path: Path) -> None:
    from sqlite_export import generate_sqlite

    dst = tmp_path / "occurrences.db"
    generate_sqlite(src_parquet_with_taxon, dst, taxa_path=taxa_csv_gz)

    con = sqlite3.connect(dst)
    bee_flags = {row[0] for row in con.execute(
        "SELECT DISTINCT is_anthophila FROM taxa WHERE taxon_id = 47219"
    ).fetchall()}
    bycatch_flags = {row[0] for row in con.execute(
        "SELECT DISTINCT is_anthophila FROM taxa WHERE taxon_id = 52747"
    ).fetchall()}
    con.close()
    assert bee_flags == {1}, f"Bee taxon should have is_anthophila=1, got {bee_flags}"
    assert bycatch_flags == {0}, f"Bycatch taxon should have is_anthophila=0, got {bycatch_flags}"


def test_bycatch_present_in_taxa(src_parquet_with_taxon: Path, taxa_csv_gz: Path, tmp_path: Path) -> None:
    from sqlite_export import generate_sqlite

    dst = tmp_path / "occurrences.db"
    generate_sqlite(src_parquet_with_taxon, dst, taxa_path=taxa_csv_gz)

    con = sqlite3.connect(dst)
    rows = con.execute(
        "SELECT taxon_id, is_anthophila, name, rank FROM taxa WHERE taxon_id = 52747"
    ).fetchall()
    con.close()
    assert len(rows) == 1, f"Expected bycatch taxon 52747 in taxa, got {len(rows)} rows"
    taxon_id, is_anthophila, name, rank = rows[0]
    assert is_anthophila == 0, f"Bycatch taxon should have is_anthophila=0, got {is_anthophila}"
    assert name is not None, "Bycatch taxon name should not be NULL"
    assert rank is not None, "Bycatch taxon rank should not be NULL"


def test_subspecies_anthophila_not_bycatch(
    src_parquet_with_taxon: Path, taxa_csv_gz: Path, tmp_path: Path
) -> None:
    """CR-01 regression: an occurrence identified to a sub-species Anthophila taxon
    (below species rank) must be owned by PASS 1 — is_anthophila=1 with a non-null,
    well-formed lineage_path — NOT dropped into the is_anthophila=0 bycatch arm.

    Against the pre-fix code (rank filter excludes 'subspecies'; PASS 2 has no
    Anthophila guard) taxon 999001 lands in bycatch with is_anthophila=0 and a NULL
    lineage_path, so the assertions below fail.
    """
    from sqlite_export import generate_sqlite

    dst = tmp_path / "occurrences.db"
    generate_sqlite(src_parquet_with_taxon, dst, taxa_path=taxa_csv_gz)

    con = sqlite3.connect(dst)
    rows = con.execute(
        "SELECT taxon_id, rank, is_anthophila, lineage_path FROM taxa WHERE taxon_id = 999001"
    ).fetchall()
    con.close()

    assert len(rows) == 1, f"Expected sub-species taxon 999001 in taxa, got {len(rows)} rows"
    taxon_id, rank, is_anthophila, lineage_path = rows[0]
    assert rank == "subspecies", f"Expected rank 'subspecies', got {rank!r}"
    assert is_anthophila == 1, (
        f"Sub-species bee 999001 should be is_anthophila=1, got {is_anthophila} "
        "(regressed into the bycatch arm)"
    )
    assert lineage_path is not None, "Sub-species bee should have a non-null lineage_path"
    # Well-formed: starts at the Anthophila root, no empty '//' segments, ends with self.
    assert "//" not in lineage_path, f"lineage_path has an empty segment: {lineage_path!r}"
    assert lineage_path.startswith("/630955/"), (
        f"lineage_path must start at the Anthophila root: {lineage_path!r}"
    )
    assert lineage_path.endswith("/999001/"), (
        f"lineage_path must end with the taxon's own id: {lineage_path!r}"
    )


def test_offtree_checklist_taxon_not_flagged_anthophila(taxa_csv_gz: Path, tmp_path: Path) -> None:
    """CR-02 regression: a checklist canonical_name that resolves to an off-tree
    (non-Anthophila) taxon must NOT be inserted as is_anthophila=1, and must never
    produce a malformed '//' lineage_path.

    This drives the real checklist seed path: a minimal beeatlas.duckdb with
    inaturalist_data.canonical_to_taxon_id plus a checklist.parquet in the sandbox.
    Against the pre-fix code (checklist seed lacked the ancestry guard) taxon 52750
    is stamped is_anthophila=1 with lineage_path='//', and the gate does not catch it.
    """
    import sqlite_export
    from sqlite_export import generate_sqlite

    # Build a fake dbt sandbox containing checklist.parquet (canonical_name -> name).
    sandbox = tmp_path / "sandbox"
    sandbox.mkdir()
    checklist_table = pa.table({"canonical_name": pa.array(["Formicidae"], type=pa.string())})
    pq.write_table(checklist_table, sandbox / "checklist.parquet")

    # Build a minimal beeatlas.duckdb with inaturalist_data.canonical_to_taxon_id
    # mapping the checklist canonical_name to the off-tree taxon 52750 (Formicidae).
    db_path = tmp_path / "beeatlas.duckdb"
    seed = duckdb.connect(str(db_path))
    try:
        seed.execute("CREATE SCHEMA inaturalist_data")
        seed.execute(
            "CREATE TABLE inaturalist_data.canonical_to_taxon_id "
            "(canonical_name VARCHAR, taxon_id BIGINT)"
        )
        seed.execute(
            "INSERT INTO inaturalist_data.canonical_to_taxon_id VALUES ('Formicidae', 52750)"
        )
    finally:
        seed.close()

    # Parquet whose only occurrence is a genuine bee, so the orphan gate stays green
    # regardless of the checklist resolution.
    bee_only = pa.table(
        {
            "lat": pa.array([47.5], type=pa.float64()),
            "lon": pa.array([-120.8], type=pa.float64()),
            "scientificName": pa.array(["Apis mellifera"], type=pa.string()),
            "year": pa.array([2024], type=pa.int32()),
            "taxon_id": pa.array([47219], type=pa.int64()),
        }
    )
    src = tmp_path / "occ_bee_only.parquet"
    pq.write_table(bee_only, src)

    # Point the module's sandbox at our fake checklist.parquet location.
    import unittest.mock as mock

    with mock.patch.object(sqlite_export, "_DBT_SANDBOX", sandbox):
        dst = tmp_path / "occurrences.db"
        generate_sqlite(src, dst, taxa_path=taxa_csv_gz, db_path=str(db_path))

    con = sqlite3.connect(dst)
    offtree = con.execute(
        "SELECT taxon_id, is_anthophila, lineage_path FROM taxa WHERE taxon_id = 52750"
    ).fetchall()
    # No taxa row anywhere may carry a malformed '//' lineage_path.
    (malformed_count,) = con.execute(
        "SELECT COUNT(*) FROM taxa WHERE lineage_path LIKE '%//%'"
    ).fetchone()
    con.close()

    # The off-tree checklist taxon must be dropped by the ancestry guard: either it
    # is absent from taxa entirely, or (defensively) present only as is_anthophila=0.
    for taxon_id, is_anthophila, lineage_path in offtree:
        assert is_anthophila == 0, (
            f"Off-tree checklist taxon {taxon_id} must not be flagged Anthophila, "
            f"got is_anthophila={is_anthophila} lineage_path={lineage_path!r}"
        )
    assert malformed_count == 0, (
        f"Found {malformed_count} taxa rows with a malformed '//' lineage_path"
    )


def test_complex_and_bycatch_counts(src_parquet_with_taxon: Path, taxa_csv_gz: Path, tmp_path: Path) -> None:
    from sqlite_export import generate_sqlite

    dst = tmp_path / "occurrences.db"
    generate_sqlite(src_parquet_with_taxon, dst, taxa_path=taxa_csv_gz)

    con = sqlite3.connect(dst)
    (bycatch_count,) = con.execute("SELECT COUNT(*) FROM taxa WHERE is_anthophila = 0").fetchone()
    (complex_count,) = con.execute("SELECT COUNT(*) FROM taxa WHERE rank = 'complex'").fetchone()
    con.close()
    assert bycatch_count == 1, f"Expected 1 bycatch taxon in mini fixture, got {bycatch_count}"
    # complex_count just needs to be queryable (0 in mini fixture — no complex rows)
    assert complex_count >= 0, "complex-rank count query should return a non-negative integer"
