"""Tests for checklist_pipeline.load_checklist (Phase 76 / Plan 03).

Loads the WA bee checklist TSV against an isolated DuckDB and asserts:
  - checklist_data.species has the locked 11-column schema (CHECK-03 / D-04)
  - checklist_data.species_counties preserves per-(species, county) rows (D-01)
  - status='verified' on every row (D-02)
  - canonical_name = canonicalize(scientificName) on every row, IS NOT NULL
  - CREATE OR REPLACE semantics — re-running is idempotent (CHECK-02)
"""

import duckdb
import pytest

from canonical_name import canonicalize


@pytest.fixture
def checklist_db(tmp_path, monkeypatch):
    """Isolated DuckDB. load_checklist() reads DB_PATH env at call time.

    Bootstraps a minimal ecdysis_data.occurrences table because Plan 05's
    extension to load_checklist() materializes canonical_name on it; in
    production run.py STEPS guarantees ecdysis runs first (T-76-04).
    """
    db_path = str(tmp_path / "checklist.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)
    # Reload module so module-level DB_PATH constant picks up the patched env.
    import importlib
    import checklist_pipeline
    importlib.reload(checklist_pipeline)
    # Pre-create ecdysis_data.occurrences (mirrors prod ordering invariant).
    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute("CREATE TABLE ecdysis_data.occurrences (scientific_name VARCHAR)")
    con.close()
    # Redirect synonyms + unmatched paths to tmp so tests don't clobber repo files.
    monkeypatch.setattr(
        checklist_pipeline, "SYNONYMS_PATH", tmp_path / "checklist_synonyms.csv"
    )
    monkeypatch.setattr(
        checklist_pipeline, "UNMATCHED_PATH", tmp_path / "checklist_unmatched.csv"
    )
    return db_path, checklist_pipeline


def test_load_checklist_creates_species_table_with_expected_schema(checklist_db):
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        cols = [
            row[0]
            for row in con.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='checklist_data' AND table_name='species' "
                "ORDER BY ordinal_position"
            ).fetchall()
        ]
    finally:
        con.close()
    assert cols == [
        "scientificName",
        "family",
        "subfamily",
        "tribe",
        "genus",
        "subgenus",
        "specific_epithet",
        "status",
        "source_citation",
        "notes",
        "canonical_name",
    ]


def test_load_checklist_populates_species_rows(checklist_db):
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        n = con.execute("SELECT count(*) FROM checklist_data.species").fetchone()[0]
        n_null = con.execute(
            "SELECT count(*) FROM checklist_data.species WHERE canonical_name IS NULL"
        ).fetchone()[0]
        n_status = con.execute(
            "SELECT count(*) FROM checklist_data.species WHERE status <> 'verified'"
        ).fetchone()[0]
    finally:
        con.close()
    assert n > 100, f"expected >100 distinct species, got {n}"
    assert n_null == 0, "every row must have canonical_name populated (D-04)"
    assert n_status == 0, "every row must have status='verified' (D-02)"


def test_load_checklist_canonical_name_matches_canonicalize(checklist_db):
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        rows = con.execute(
            "SELECT scientificName, canonical_name FROM checklist_data.species LIMIT 50"
        ).fetchall()
    finally:
        con.close()
    assert rows, "species table must not be empty"
    for sci, canon in rows:
        assert canon == canonicalize(sci), f"{sci!r}: stored {canon!r} != canonicalize() {canonicalize(sci)!r}"


def test_load_checklist_genus_and_specific_epithet_split(checklist_db):
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        rows = con.execute(
            "SELECT scientificName, genus, specific_epithet FROM checklist_data.species LIMIT 50"
        ).fetchall()
    finally:
        con.close()
    for sci, genus, epithet in rows:
        parts = sci.split()
        assert genus == parts[0]
        if len(parts) >= 2:
            assert epithet == parts[1]


def test_load_checklist_creates_species_counties_table(checklist_db):
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        cols = [
            row[0]
            for row in con.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='checklist_data' AND table_name='species_counties' "
                "ORDER BY ordinal_position"
            ).fetchall()
        ]
        n = con.execute("SELECT count(*) FROM checklist_data.species_counties").fetchone()[0]
    finally:
        con.close()
    assert cols == ["scientificName", "county"]
    assert n > 100, f"expected >100 (species, county) rows, got {n}"


def test_load_checklist_source_citation_set(checklist_db):
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        distinct = con.execute(
            "SELECT DISTINCT source_citation FROM checklist_data.species"
        ).fetchall()
    finally:
        con.close()
    assert len(distinct) == 1
    assert distinct[0][0].startswith("Bartholomew et al. 2024, JHR 97")


def test_load_checklist_is_idempotent(checklist_db):
    """CREATE OR REPLACE — running twice must not raise and must yield same row counts."""
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        n1 = con.execute("SELECT count(*) FROM checklist_data.species").fetchone()[0]
        c1 = con.execute("SELECT count(*) FROM checklist_data.species_counties").fetchone()[0]
    finally:
        con.close()
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        n2 = con.execute("SELECT count(*) FROM checklist_data.species").fetchone()[0]
        c2 = con.execute("SELECT count(*) FROM checklist_data.species_counties").fetchone()[0]
    finally:
        con.close()
    assert n1 == n2
    assert c1 == c2


def test_load_checklist_unset_columns_are_null(checklist_db):
    """family/subfamily/tribe/subgenus/notes are NULL on every row in this plan."""
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        nf = con.execute(
            "SELECT count(*) FROM checklist_data.species "
            "WHERE family IS NOT NULL OR subfamily IS NOT NULL OR tribe IS NOT NULL "
            "OR subgenus IS NOT NULL OR notes IS NOT NULL"
        ).fetchone()[0]
    finally:
        con.close()
    assert nf == 0
