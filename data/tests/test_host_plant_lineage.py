"""Tests for host_plant_lineage.load_host_plant_lineage.

Covers:
  - test_lineage_schema: table has exactly 3 columns in order (taxon_id, family, genus)
  - test_species_resolves_to_family_genus: Solidago canadensis species → Asteraceae / Solidago
  - test_genus_resolves_via_self_rows: Solidago genus → Asteraceae / Solidago via self_rows arm
  - test_non_seed_absent: non-seed taxon is excluded from the result
  - test_integration_real_db_family_coverage: [integration] family coverage >= 90% over seed set

Fast tier (no -m integration) skips the last test because taxa.csv.gz is absent in local dev.
"""

import gzip
import importlib

import duckdb
import pytest

# ---------------------------------------------------------------------------
# Mini plant TSV fixture — 4 rows
#   10  Asteraceae (family)
#   20  Solidago (genus, ancestry contains Asteraceae, IN seed)
#   30  Solidago canadensis (species, ancestry contains Asteraceae+Solidago, IN seed)
#   40  Cirsium (genus, NOT in seed)
# ---------------------------------------------------------------------------

MINI_PLANT_TSV = (
    "taxon_id\tancestry\trank_level\trank\tname\tactive\n"
    # Asteraceae family — a higher-level ancestor for both Solidago and Cirsium
    "10\t1000\t30\tfamily\tAsteraceae\ttrue\n"
    # Solidago genus — descendant of Asteraceae (ancestry includes family id 10)
    "20\t1000/10\t20\tgenus\tSolidago\ttrue\n"
    # Solidago canadensis species — descendant of Asteraceae and Solidago
    "30\t1000/10/20\t10\tspecies\tSolidago canadensis\ttrue\n"
    # Cirsium genus — same parent family, but NOT a seed taxon
    "40\t1000/10\t20\tgenus\tCirsium\ttrue\n"
)


@pytest.fixture
def plant_taxa_gz(tmp_path):
    """Write MINI_PLANT_TSV as a gzipped file in tmp_path; return the Path."""
    path = tmp_path / "taxa.csv.gz"
    with gzip.open(path, "wb") as f:
        f.write(MINI_PLANT_TSV.encode())
    return path


@pytest.fixture
def lineage_db(tmp_path, monkeypatch, plant_taxa_gz):
    """Isolated DuckDB with host_plant_lineage module reloaded against tmp paths.

    Pre-creates inaturalist_data.observations and ecdysis_data.occurrence_links
    with seed rows (taxon_ids 20=Solidago genus and 30=Solidago canadensis are
    seeds; taxon_id 40=Cirsium is not linked and must be absent).
    Returns (db_path_str, module).
    """
    db_path = str(tmp_path / "host.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)

    import host_plant_lineage as hpl  # noqa: PLC0415
    importlib.reload(hpl)
    monkeypatch.setattr(hpl, "TAXA_PATH", plant_taxa_gz)

    # Pre-create source tables that host_plant_lineage queries for the seed set.
    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA IF NOT EXISTS inaturalist_data")
    con.execute("CREATE SCHEMA IF NOT EXISTS ecdysis_data")
    # Minimal observations schema: id + taxon__id (double underscore per dbt naming convention)
    con.execute(
        "CREATE TABLE inaturalist_data.observations "
        "(id BIGINT, taxon__id BIGINT)"
    )
    # Two seed observations: Solidago genus (20) and Solidago canadensis species (30)
    con.execute(
        "INSERT INTO inaturalist_data.observations VALUES (1, 20), (2, 30)"
    )
    # Minimal occurrence_links schema: occurrence_id + host_observation_id
    con.execute(
        "CREATE TABLE ecdysis_data.occurrence_links "
        "(occurrence_id BIGINT, host_observation_id BIGINT)"
    )
    # Both observations are linked as host observations → they become seeds
    con.execute(
        "INSERT INTO ecdysis_data.occurrence_links VALUES (101, 1), (102, 2)"
    )
    con.close()

    return db_path, hpl


# ---------------------------------------------------------------------------
# Unit tests (fast tier, no taxa.csv.gz required)
# ---------------------------------------------------------------------------


def test_lineage_schema(lineage_db):
    """Table has exactly 3 columns in order: taxon_id, family, genus."""
    db_path, hpl = lineage_db
    hpl.load_host_plant_lineage(db_path)
    con = duckdb.connect(db_path, read_only=True)
    try:
        cols = [
            row[0]
            for row in con.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema = 'inaturalist_data' "
                "  AND table_name = 'host_plant_lineage' "
                "ORDER BY ordinal_position"
            ).fetchall()
        ]
    finally:
        con.close()
    assert cols == ["taxon_id", "family", "genus"]


def test_species_resolves_to_family_genus(lineage_db):
    """Solidago canadensis (species, taxon_id=30) → family Asteraceae, genus Solidago."""
    db_path, hpl = lineage_db
    hpl.load_host_plant_lineage(db_path)
    con = duckdb.connect(db_path, read_only=True)
    try:
        row = con.execute(
            "SELECT taxon_id, family, genus "
            "FROM inaturalist_data.host_plant_lineage "
            "WHERE taxon_id = 30"
        ).fetchone()
    finally:
        con.close()
    assert row is not None, "Solidago canadensis (30) must appear in host_plant_lineage"
    taxon_id, family, genus = row
    assert taxon_id == 30
    assert family == "Asteraceae"
    assert genus == "Solidago"


def test_genus_resolves_via_self_rows(lineage_db):
    """Solidago genus (taxon_id=20) → Asteraceae / Solidago via self_rows arm.

    Genus taxa are NOT in their own ancestry column, so the UNION ALL self_rows
    arm is required to capture the genus itself. Without it, Solidago (20) would
    have its family column populated but genus=NULL.
    """
    db_path, hpl = lineage_db
    hpl.load_host_plant_lineage(db_path)
    con = duckdb.connect(db_path, read_only=True)
    try:
        row = con.execute(
            "SELECT taxon_id, family, genus "
            "FROM inaturalist_data.host_plant_lineage "
            "WHERE taxon_id = 20"
        ).fetchone()
    finally:
        con.close()
    assert row is not None, (
        "Solidago genus (20) must appear in host_plant_lineage — "
        "requires UNION ALL self_rows arm since ancestry column omits self"
    )
    taxon_id, family, genus = row
    assert taxon_id == 20
    assert family == "Asteraceae"
    assert genus == "Solidago"


def test_non_seed_absent(lineage_db):
    """Cirsium (taxon_id=40) is not a seed so must be absent from host_plant_lineage."""
    db_path, hpl = lineage_db
    hpl.load_host_plant_lineage(db_path)
    con = duckdb.connect(db_path, read_only=True)
    try:
        row = con.execute(
            "SELECT taxon_id FROM inaturalist_data.host_plant_lineage "
            "WHERE taxon_id = 40"
        ).fetchone()
    finally:
        con.close()
    assert row is None, "Non-seed Cirsium (40) must be absent — seed-set restriction failed"


# ---------------------------------------------------------------------------
# Integration tier (requires taxa.csv.gz; skipped in fast tier)
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_integration_real_db_family_coverage():
    """[integration] Real beeatlas.duckdb: family coverage >= 90% over the seed set.

    Skipped when taxa.csv.gz is absent (not downloaded in local dev; deferred to
    the nightly run.sh build per project_local_dbt_build_not_runnable).
    """
    from pathlib import Path  # noqa: PLC0415

    import host_plant_lineage as hpl  # noqa: PLC0415

    taxa_path = Path(hpl.RAW_DIR) / "taxa.csv.gz"
    if not taxa_path.exists():
        pytest.skip("taxa.csv.gz not present — deferred to nightly run.sh build")

    hpl.load_host_plant_lineage()

    con = duckdb.connect(hpl.DB_PATH, read_only=True)
    try:
        total_seeds = con.execute("""
            SELECT COUNT(DISTINCT o.taxon__id)
            FROM inaturalist_data.observations o
            JOIN ecdysis_data.occurrence_links l ON l.host_observation_id = o.id
            WHERE o.taxon__id IS NOT NULL
        """).fetchone()[0]
        lineage_count = con.execute(
            "SELECT COUNT(*) FROM inaturalist_data.host_plant_lineage WHERE family IS NOT NULL"
        ).fetchone()[0]
    finally:
        con.close()

    coverage = lineage_count / total_seeds if total_seeds > 0 else 0.0
    assert coverage >= 0.9, (
        f"Family coverage {coverage:.1%} < 90% "
        f"({lineage_count} / {total_seeds} seed taxa resolve to a family)"
    )
