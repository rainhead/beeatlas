"""Tests for checklist_pipeline.load_checklist (Phase 76 / Plan 03).

Loads the WA bee checklist TSV against an isolated DuckDB and asserts:
  - checklist_data.species has the locked 11-column schema (CHECK-03 / D-04)
  - checklist_data.species_counties preserves per-(species, county) rows (D-01)
  - status='verified' on every row (D-02)
  - canonical_name = normalize_scientific_name(scientificName) on every row, IS NOT NULL
  - CREATE OR REPLACE semantics — re-running is idempotent (CHECK-02)

Phase 134 Plan 02 adds:
  - Unit tests for _parse_checklist_date() and _coord_flag() helpers (ING-02, ING-03)
  - Integration tests for checklist_data.checklist_records_full table (ING-01)

Phase 140 Plan 02 (TFIXTURE-01):
  - Fast-tier tests migrated to module-scoped shared in-memory connection (D-03/D-04)
  - checklist_sample_db fixture reads the 8-row committed sample via the real
    load_checklist(con=con) path instead of the 50,646-row full CSV
  - The two @pytest.mark.integration tests keep the original checklist_db fixture
"""

from pathlib import Path

import duckdb
import pytest

from canonical_name import normalize_scientific_name

# Directory containing committed fixture files (added Phase 140 Plan 02 / TFIXTURE-04)
FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def checklist_db(tmp_path, monkeypatch):
    """Isolated DuckDB. load_checklist() reads DB_PATH env at call time.

    Bootstraps a minimal ecdysis_data.occurrences table because Plan 05's
    extension to load_checklist() materializes canonical_name on it; in
    production run.py STEPS guarantees ecdysis runs before checklist (T-76-04).

    Phase 135 Plan 03: SYNONYMS_PATH / UNMATCHED_PATH patches removed —
    reconcile() was retired per D-07 (RCN-06); those constants no longer exist.

    Phase 141 Plan 04 (WR-01 / D-08): replaced importlib.reload() with save/restore of
    mod.DB_PATH, matching the discipline used by checklist_sample_db. importlib.reload()
    re-executes the module body and clobbers any patches set by checklist_sample_db when
    tests run in random order (pytest-randomly). Save/restore is safe because the two
    @integration tests that use checklist_db call mod.load_checklist() with no args and
    rely solely on mod.DB_PATH to connect to the database.

    Kept for the two @pytest.mark.integration tests only (test_checklist_records_full_row_count,
    test_checklist_records_full_schema). All other fast-tier tests use checklist_sample_db.
    """
    db_path = str(tmp_path / "checklist.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)

    import checklist_pipeline as mod

    # Save the module-level DB_PATH constant (importlib.reload used to reset it via env-var
    # re-read; save/restore achieves the same without re-executing the module body).
    old_db_path = mod.DB_PATH
    mod.DB_PATH = db_path

    # Pre-create ecdysis_data.occurrences (mirrors prod ordering invariant).
    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute("CREATE TABLE ecdysis_data.occurrences (scientific_name VARCHAR)")
    con.close()

    yield db_path, mod

    # Restore module-level constant so subsequent tests are unaffected.
    mod.DB_PATH = old_db_path


@pytest.fixture(scope="module")
def checklist_sample_db(request):
    """Module-scoped in-memory DuckDB loaded from the committed 8-row checklist sample.

    Distilled from checklist_records_full.csv (2026-06-06). Covers all coord_flag
    (valid, null_coord, zero_coord, out_of_bbox) and date_quality (full, none, year_only)
    branches. Built ONCE per test file; all non-integration tests share one connection.

    Does NOT replace checklist_db — the two @pytest.mark.integration tests
    (test_checklist_records_full_row_count, test_checklist_records_full_schema)
    continue to use checklist_db unmodified and read the real checklist_records_full.csv.

    taxa_subset.csv.gz provenance: 2 rows covering the angelicus/texanus LCA test:
      Agapostemon angelicus (taxon_id=270393, ancestry: .../50086/606634)
      Agapostemon texanus   (taxon_id=1581468, ancestry: .../50086/606634/1581466)
    LCA = 606634 (subgenus Agapostemon). Verified from live taxa.csv.gz 2026-06-06.

    Uses request.addfinalizer + direct setattr because monkeypatch is function-scoped
    and cannot be used in a module-scoped fixture (RESEARCH Pitfall 1 — ScopeMismatch).
    """
    import checklist_pipeline as mod

    # Save originals for teardown (restored in addfinalizer).
    old_crfp = mod.CHECKLIST_RECORDS_FULL_PATH
    old_crp = mod.CHECKLIST_RECORDS_PATH
    old_cp = mod.CHECKLIST_PATH
    old_taxa = mod.TAXA_PATH
    old_cache = mod._TAXA_ANCESTRY

    # Override module-level constants to point at committed fixtures.
    # CHECKLIST_RECORDS_PATH (wa_bee_checklist_records.tsv) has ~50k rows and is
    # slow despite being small in KB — DuckDB executemany is the bottleneck.
    # CHECKLIST_PATH (wa_bee_checklist.tsv) has 527 species × executemany rows —
    # also slow. Override all three path inputs to achieve sub-second execution.
    # (Deviation from plan note: plan assumed wa_bee_checklist.tsv was fast; it is
    # not due to DuckDB executemany overhead at ~3s for 527 rows. Both TSV paths
    # are overridden here with 6-8 row fixtures. See SUMMARY.md deviation notes.)
    mod.CHECKLIST_RECORDS_FULL_PATH = FIXTURES_DIR / "checklist_sample.csv"
    mod.CHECKLIST_RECORDS_PATH = FIXTURES_DIR / "checklist_records_sample.tsv"
    mod.CHECKLIST_PATH = FIXTURES_DIR / "wa_bee_checklist_sample.tsv"
    mod.TAXA_PATH = FIXTURES_DIR / "taxa_subset.csv.gz"
    # Reset taxa cache — forces re-read from fixture gz, not the real taxa.csv.gz
    # (RESEARCH Pitfall 2: _TAXA_ANCESTRY is a module-level cache that persists
    # across test runs if not explicitly cleared before each fixture setup).
    mod._TAXA_ANCESTRY = None

    con = duckdb.connect(":memory:")
    # Bootstrap ecdysis_data.occurrences BEFORE calling load_checklist()
    # (T-76-04 prod ordering invariant: run.py STEPS guarantees ecdysis runs before checklist;
    # _update_occurrences_canonical_name() called at end of load_checklist requires
    # the table to exist — RESEARCH §3 / Pattern D).
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute("CREATE TABLE ecdysis_data.occurrences (scientific_name VARCHAR)")

    # Load the 8-row sample through the real CSV→DuckDB path (D-01).
    mod.load_checklist(con=con)

    def teardown():
        mod.CHECKLIST_RECORDS_FULL_PATH = old_crfp
        mod.CHECKLIST_RECORDS_PATH = old_crp
        mod.CHECKLIST_PATH = old_cp
        mod.TAXA_PATH = old_taxa
        mod._TAXA_ANCESTRY = old_cache
        con.close()

    request.addfinalizer(teardown)
    return con


def test_load_checklist_creates_species_table_with_expected_schema(checklist_sample_db):
    con = checklist_sample_db
    cols = [
        row[0]
        for row in con.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema='checklist_data' AND table_name='species' "
            "ORDER BY ordinal_position"
        ).fetchall()
    ]
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


def test_load_checklist_populates_species_rows(checklist_sample_db):
    con = checklist_sample_db
    n = con.execute("SELECT count(*) FROM checklist_data.species").fetchone()[0]
    n_null = con.execute(
        "SELECT count(*) FROM checklist_data.species WHERE canonical_name IS NULL"
    ).fetchone()[0]
    n_status = con.execute(
        "SELECT count(*) FROM checklist_data.species WHERE status <> 'verified'"
    ).fetchone()[0]
    # species table comes from wa_bee_checklist_sample.tsv (6 species in fast-tier
    # fixture). Pinned to exact count (WR-02 / D-09): 6 distinct species in sample.
    # The structural/quality invariants (n_null == 0, n_status == 0) are preserved.
    assert n == 6, f"expected exactly 6 distinct species in sample fixture, got {n}"
    assert n_null == 0, "every row must have canonical_name populated (D-04)"
    assert n_status == 0, "every row must have status='verified' (D-02)"


def test_load_checklist_canonical_name_matches_normalize_scientific_name(checklist_sample_db):
    con = checklist_sample_db
    rows = con.execute(
        "SELECT scientificName, canonical_name FROM checklist_data.species LIMIT 50"
    ).fetchall()
    assert rows, "species table must not be empty"
    for sci, canon in rows:
        assert canon == normalize_scientific_name(sci), f"{sci!r}: stored {canon!r} != normalize_scientific_name() {normalize_scientific_name(sci)!r}"


def test_load_checklist_genus_and_specific_epithet_split(checklist_sample_db):
    con = checklist_sample_db
    rows = con.execute(
        "SELECT scientificName, genus, specific_epithet FROM checklist_data.species LIMIT 50"
    ).fetchall()
    for sci, genus, epithet in rows:
        parts = sci.split()
        assert genus == parts[0]
        if len(parts) >= 2:
            assert epithet == parts[1]


def test_load_checklist_creates_species_counties_table(checklist_sample_db):
    con = checklist_sample_db
    cols = [
        row[0]
        for row in con.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema='checklist_data' AND table_name='species_counties' "
            "ORDER BY ordinal_position"
        ).fetchall()
    ]
    # species_counties comes from wa_bee_checklist_sample.tsv (8 rows in fast-tier
    # fixture). Pinned to exact count (WR-02 / D-09): 8 (species, county) rows in sample.
    n = con.execute("SELECT count(*) FROM checklist_data.species_counties").fetchone()[0]
    assert cols == ["scientificName", "county"]
    assert n == 8, f"expected exactly 8 (species, county) rows in sample fixture, got {n}"


def test_load_checklist_source_citation_set(checklist_sample_db):
    con = checklist_sample_db
    distinct = con.execute(
        "SELECT DISTINCT source_citation FROM checklist_data.species"
    ).fetchall()
    assert len(distinct) == 1
    assert distinct[0][0].startswith("Bartholomew et al. 2024, JHR 97")


def test_load_checklist_is_idempotent(checklist_sample_db):
    """CREATE OR REPLACE — running twice must not raise and must yield same row counts.

    Calls load_checklist(con=con) a second time on the shared connection.
    Safe under CREATE OR REPLACE semantics (RESEARCH §7 / Pattern E idempotency).
    """
    import checklist_pipeline as mod
    con = checklist_sample_db
    n1 = con.execute("SELECT count(*) FROM checklist_data.species").fetchone()[0]
    c1 = con.execute("SELECT count(*) FROM checklist_data.species_counties").fetchone()[0]
    mod.load_checklist(con=con)   # second call — CREATE OR REPLACE is idempotent
    n2 = con.execute("SELECT count(*) FROM checklist_data.species").fetchone()[0]
    c2 = con.execute("SELECT count(*) FROM checklist_data.species_counties").fetchone()[0]
    assert n1 == n2
    assert c1 == c2


def test_load_checklist_unset_columns_are_null(checklist_sample_db):
    """family/subfamily/tribe/subgenus/notes are NULL on every row in this plan."""
    con = checklist_sample_db
    nf = con.execute(
        "SELECT count(*) FROM checklist_data.species "
        "WHERE family IS NOT NULL OR subfamily IS NOT NULL OR tribe IS NOT NULL "
        "OR subgenus IS NOT NULL OR notes IS NOT NULL"
    ).fetchone()[0]
    assert nf == 0


# ---------------------------------------------------------------------------
# Phase 134 Plan 02: Unit tests for date-parsing and coord-flag helpers (ING-02/ING-03).
# These tests call the helpers directly (no DuckDB needed). Written RED first.
# ---------------------------------------------------------------------------

import checklist_pipeline as _cp134


class TestParseChecklistDate:
    """Tests for _parse_checklist_date(raw) -> (year, month, day, date_quality)."""

    def test_iso_date_pre1900(self):
        """1812-06-18 (ISO date) must parse to (1812, 6, 18, 'full') — no 1900 floor."""
        assert _cp134._parse_checklist_date("1812-06-18") == (1812, 6, 18, "full")

    def test_iso_datetime_drops_time(self):
        """ISO datetime 1991-07-12T00:00:00 must parse to (1991, 7, 12, 'full')."""
        assert _cp134._parse_checklist_date("1991-07-12T00:00:00") == (1991, 7, 12, "full")

    def test_us_month_first_mdy(self):
        """M/D/YYYY (US month-first) '6/14/1905' must parse to (1905, 6, 14, 'full')."""
        assert _cp134._parse_checklist_date("6/14/1905") == (1905, 6, 14, "full")

    def test_empty_string_returns_none(self):
        """Empty string must return (None, None, None, 'none')."""
        assert _cp134._parse_checklist_date("") == (None, None, None, "none")

    def test_whitespace_only_returns_none(self):
        """Whitespace-only string must return (None, None, None, 'none')."""
        assert _cp134._parse_checklist_date("   ") == (None, None, None, "none")

    def test_year_only_returns_year_only(self):
        """Year-only string '1995' must return (1995, None, None, 'year_only')."""
        assert _cp134._parse_checklist_date("1995") == (1995, None, None, "year_only")


class TestCoordFlag:
    """Tests for _coord_flag(lat, lon) -> str."""

    def test_none_coords_return_null_coord(self):
        """None lat/lon must return 'null_coord'."""
        assert _cp134._coord_flag(None, None) == "null_coord"

    def test_null_lat_only_returns_null_coord(self):
        """None lat with valid lon must return 'null_coord'."""
        assert _cp134._coord_flag(None, -122.2272) == "null_coord"

    def test_null_lon_only_returns_null_coord(self):
        """None lon with valid lat must return 'null_coord'."""
        assert _cp134._coord_flag(47.3075, None) == "null_coord"

    def test_zero_zero_returns_zero_coord(self):
        """(0, 0) Gulf-of-Guinea guard must return 'zero_coord' before bbox test."""
        assert _cp134._coord_flag(0, 0) == "zero_coord"

    def test_in_state_returns_valid(self):
        """(47.3075, -122.2272) Auburn WA must return 'valid'."""
        assert _cp134._coord_flag(47.3075, -122.2272) == "valid"

    def test_south_of_wa_returns_out_of_bbox(self):
        """(40.0, -122.0) is south of WA — must return 'out_of_bbox'."""
        assert _cp134._coord_flag(40.0, -122.0) == "out_of_bbox"

    def test_boundary_point_is_valid(self):
        """(45.5, -124.85) exact bbox boundary must return 'valid' (inclusive bounds)."""
        assert _cp134._coord_flag(45.5, -124.85) == "valid"


# ---------------------------------------------------------------------------
# Phase 76 Plan 06 integration tests against the shared `fixture_con` fixture.
# Cover TAX-04 (disagreement fixture), CHECK-05 (synonyms.csv override +
# unmatched.csv writeback), CHECK-06 (canonical_name JOIN key), and the
# PITFALLS.md #1 (authority strings) and #2 (trinomial fold) regression
# guards.
# ---------------------------------------------------------------------------

import csv

import checklist_pipeline as checklist_mod


def test_disagreement_fixture_canonical_join(fixture_con):
    """TAX-04: Lasioglossum (Dialictus) zonulum (occurrence) and
    Lasioglossum zonulum (checklist) MUST JOIN via canonical_name."""
    rows = fixture_con.execute("""
        SELECT cl.scientificName, occ.scientific_name
        FROM checklist_data.species cl
        JOIN ecdysis_data.occurrences occ
            ON cl.canonical_name = occ.canonical_name
        WHERE cl.canonical_name = 'lasioglossum zonulum'
    """).fetchall()
    assert len(rows) >= 1, "checklist↔occurrence JOIN failed for zonulum disagreement"
    checklist_names = {r[0] for r in rows}
    occurrence_names = {r[1] for r in rows}
    assert "Lasioglossum zonulum" in checklist_names
    assert "Lasioglossum (Dialictus) zonulum" in occurrence_names


def test_authority_bearing_canonicalizes_to_binomial(fixture_con):
    """PITFALLS.md #1: authority strings must be stripped from canonical_name."""
    canon = fixture_con.execute("""
        SELECT canonical_name FROM checklist_data.species
        WHERE scientificName = 'Andrena fulva (Müller, 1766)'
    """).fetchone()
    assert canon is not None, "fixture missing authority-bearing seed row"
    assert canon[0] == "andrena fulva"
    # Confirm the algorithm (not the fixture) is the source of truth.
    assert normalize_scientific_name("Andrena fulva (Müller, 1766)") == "andrena fulva"


def test_trinomial_subspecies_folds_to_binomial(fixture_con):
    """PITFALLS.md #2: trinomial scientific_name folds to binomial canonical_name."""
    canon = fixture_con.execute("""
        SELECT canonical_name FROM ecdysis_data.occurrences
        WHERE scientific_name = 'Bombus melanopygus mixtus'
    """).fetchone()
    assert canon is not None, "fixture missing trinomial occurrence seed row"
    assert canon[0] == "bombus melanopygus"
    # Confirm via the normalize_scientific_name() helper too.
    assert normalize_scientific_name("Bombus melanopygus mixtus") == "bombus melanopygus"


@pytest.mark.skip(
    reason=(
        "reconcile() retired per D-07 / RCN-06 (Phase 135 Plan 03). "
        "Checklist synonym resolution now flows through occurrence_synonyms / "
        "int_synonyms. SYNONYMS_PATH and UNMATCHED_PATH no longer exist in the module."
    )
)
def test_reconcile_synonym_override_updates_checklist(fixture_con, tmp_path, monkeypatch):
    """CHECK-05 + D-05: RETIRED — reconcile() removed per D-07 (RCN-06)."""
    pass  # Dead code path; kept as documentation only.


@pytest.mark.skip(
    reason=(
        "reconcile() retired per D-07 / RCN-06 (Phase 135 Plan 03). "
        "Checklist synonym resolution now flows through occurrence_synonyms / int_synonyms."
    )
)
def test_reconcile_unmatched_warn_only(fixture_con, tmp_path, monkeypatch):
    """CHECK-05 + D-05: RETIRED — reconcile() removed per D-07 (RCN-06)."""
    pass  # Dead code path; kept as documentation only.


@pytest.mark.skip(
    reason=(
        "reconcile() retired per D-07 / RCN-06 (Phase 135 Plan 03). "
        "SYNONYMS_PATH and UNMATCHED_PATH no longer exist in the module."
    )
)
def test_reconcile_unmatched_csv_header(fixture_con, tmp_path, monkeypatch):
    """D-05: RETIRED — reconcile() removed per D-07 (RCN-06)."""
    pass  # Dead code path; kept as documentation only.


# ---------------------------------------------------------------------------
# Phase 134 Plan 02: Integration tests for checklist_data.checklist_records_full
# (ING-01, ING-02, ING-03). Uses checklist_db fixture + real committed CSV.
# Written RED first, then GREEN.
# UNCHANGED — these two tests must continue to read the real checklist_records_full.csv.
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_checklist_records_full_row_count(checklist_db):
    """SC#1: checklist_records_full must have ~50,646 rows (BETWEEN 50000 AND 51000)."""
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        n = con.execute(
            "SELECT count(*) FROM checklist_data.checklist_records_full"
        ).fetchone()[0]
    finally:
        con.close()
    assert 50000 <= n <= 51000, f"expected ~50,646 rows, got {n}"


@pytest.mark.integration
def test_checklist_records_full_schema(checklist_db):
    """SC#1: checklist_records_full must have the full 14-column schema (D-12 + RCN-01).

    Phase 140 Plan 02: added canonical_name to required set (Open Question #2 —
    canonical_name was added in Phase 135 Plan 03 but missing from this assertion).
    """
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        cols = {
            row[0]
            for row in con.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='checklist_data' AND table_name='checklist_records_full'"
            ).fetchall()
        }
    finally:
        con.close()
    required = {
        "ObjectID", "family", "genus", "verbatim_name", "canonical_name", "locality",
        "latitude", "longitude", "recordedBy",
        "year", "month", "day", "date_quality", "coord_flag",
    }
    assert required <= cols, f"missing columns: {required - cols}"


def test_checklist_records_full_coord_flag_no_zero_valid(checklist_sample_db):
    """SC#2: no row with coord_flag='valid' should have latitude=0 or longitude=0."""
    con = checklist_sample_db
    n = con.execute("""
        SELECT count(*) FROM checklist_data.checklist_records_full
        WHERE coord_flag = 'valid' AND (latitude = 0 OR longitude = 0)
    """).fetchone()[0]
    assert n == 0, f"found {n} rows with coord_flag='valid' and zero lat or lon"


def test_checklist_records_full_coord_flag_valid_in_bbox(checklist_sample_db):
    """SC#2: no 'valid' row should have lat/lon outside the tight WA bbox."""
    con = checklist_sample_db
    n = con.execute("""
        SELECT count(*) FROM checklist_data.checklist_records_full
        WHERE coord_flag = 'valid'
          AND NOT (
            latitude BETWEEN 45.5 AND 49.0
            AND longitude BETWEEN -124.85 AND -116.9
          )
    """).fetchone()[0]
    assert n == 0, f"found {n} 'valid' rows outside the WA bbox"


def test_checklist_records_full_coord_flag_coverage(checklist_sample_db):
    """SC#2: every coord_flag is in the valid enum; null_coord count == 1 in sample.

    Phase 140 Plan 02 (D-09): assertion tightened to exact sample count —
    `null_coord_count == 1` — the 8-row checklist_sample.csv has exactly 1 null_coord
    row (ObjectID 3). Coverage is preserved: all 4 coord_flag branches are present.
    """
    con = checklist_sample_db
    bad = con.execute("""
        SELECT count(*) FROM checklist_data.checklist_records_full
        WHERE coord_flag NOT IN ('valid', 'null_coord', 'zero_coord', 'out_of_bbox')
    """).fetchone()[0]
    null_coord_count = con.execute("""
        SELECT count(*) FROM checklist_data.checklist_records_full
        WHERE coord_flag = 'null_coord'
    """).fetchone()[0]
    assert bad == 0, f"found {bad} rows with invalid coord_flag"
    assert null_coord_count == 1, f"expected 1 null_coord row in sample, got {null_coord_count}"


def test_checklist_records_full_date_parsing_pre1900(checklist_sample_db):
    """SC#3: the 1812-06-18 source row parses to year=1812, month=6, day=18, date_quality='full'."""
    con = checklist_sample_db
    # The 1812-06-18 row is ObjectID 31311 per CSV
    row = con.execute("""
        SELECT year, month, day, date_quality FROM checklist_data.checklist_records_full
        WHERE year = 1812 AND month = 6 AND day = 18
    """).fetchone()
    assert row is not None, "no row with year=1812, month=6, day=18 found"
    year, month, day, dq = row
    assert year == 1812
    assert month == 6
    assert day == 18
    assert dq == "full"


def test_checklist_records_full_date_parsing_mdy(checklist_sample_db):
    """SC#3: at least one M/D/YYYY-sourced row must parse to date_quality='full'."""
    con = checklist_sample_db
    # 6/14/1905 is in the CSV (ObjectID 1668); assert year=1905, month=6, day=14
    n = con.execute("""
        SELECT count(*) FROM checklist_data.checklist_records_full
        WHERE year = 1905 AND month = 6 AND day = 14 AND date_quality = 'full'
    """).fetchone()[0]
    assert n >= 1, "expected at least one M/D/YYYY row parsed to year=1905, month=6, day=14"


def test_checklist_records_full_null_date_tagged_none(checklist_sample_db):
    """SC#3: every empty/NULL-source-date row must have date_quality='none' and year IS NULL.

    Phase 140 Plan 02 (D-09): assertion tightened to exact sample count — `n_none == 3` —
    the 8-row checklist_sample.csv has exactly 3 none-date rows:
      ObjectID 17423 (zero_coord), ObjectID 8702 (out_of_bbox), ObjectID 1386 (slash, valid).
    Coverage is preserved: the none branch is tested and n_bad == 0 invariant holds.
    """
    con = checklist_sample_db
    # Rows with date_quality='none' should all have NULL year
    n_bad = con.execute("""
        SELECT count(*) FROM checklist_data.checklist_records_full
        WHERE date_quality = 'none' AND year IS NOT NULL
    """).fetchone()[0]
    n_none = con.execute("""
        SELECT count(*) FROM checklist_data.checklist_records_full
        WHERE date_quality = 'none'
    """).fetchone()[0]
    assert n_bad == 0, f"found {n_bad} rows with date_quality='none' but year IS NOT NULL"
    assert n_none == 3, f"expected 3 'none' date rows in sample, got {n_none}"


def test_checklist_records_full_date_quality_domain(checklist_sample_db):
    """Every date_quality value must be in ('full', 'year_only', 'none')."""
    con = checklist_sample_db
    bad = con.execute("""
        SELECT count(*) FROM checklist_data.checklist_records_full
        WHERE date_quality NOT IN ('full', 'year_only', 'none')
    """).fetchone()[0]
    assert bad == 0, f"found {bad} rows with invalid date_quality"


def test_checklist_records_full_is_idempotent(checklist_sample_db):
    """Running load_checklist() twice must yield the same checklist_records_full row count.

    Calls load_checklist(con=con) a second time on the shared connection.
    Safe under CREATE OR REPLACE semantics (RESEARCH §7 / Pattern E idempotency).
    """
    import checklist_pipeline as mod
    con = checklist_sample_db
    n1 = con.execute(
        "SELECT count(*) FROM checklist_data.checklist_records_full"
    ).fetchone()[0]
    mod.load_checklist(con=con)   # second call — CREATE OR REPLACE is idempotent
    n2 = con.execute(
        "SELECT count(*) FROM checklist_data.checklist_records_full"
    ).fetchone()[0]
    assert n1 == n2, f"not idempotent: first run {n1} rows, second run {n2} rows"


def test_checklist_records_old_table_still_exists(checklist_sample_db):
    """D-10: checklist_data.checklist_records (4-column OLD table) must still exist."""
    con = checklist_sample_db
    cols = [
        row[0]
        for row in con.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema='checklist_data' AND table_name='checklist_records' "
            "ORDER BY ordinal_position"
        ).fetchall()
    ]
    assert cols == ["scientificName", "county", "year", "month"], (
        f"old checklist_records table missing or schema changed: {cols}"
    )


# ---------------------------------------------------------------------------
# Phase 135 Plan 03 — RED stubs for RCN-01 (canonical_name column on
# checklist_records_full).
#
# These tests are intentionally RED now because checklist_records_full
# does not yet have a canonical_name column. They turn GREEN when
# Plan 135-03 adds canonical_name to _load_checklist_records_full().
# ---------------------------------------------------------------------------


def test_checklist_records_full_canonical_name_column_exists(checklist_sample_db):
    """RCN-01: checklist_records_full must have a canonical_name column.

    Currently FAILS because _load_checklist_records_full() does not yet
    store a canonical_name column. Goes GREEN in Plan 135-03.
    """
    con = checklist_sample_db
    cols = {
        row[0]
        for row in con.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema='checklist_data' AND table_name='checklist_records_full'"
        ).fetchall()
    }
    assert "canonical_name" in cols, (
        "checklist_records_full must have a canonical_name column (RCN-01). "
        "Add canonical_name VARCHAR to the CREATE OR REPLACE TABLE schema."
    )


def test_checklist_records_full_canonical_name_non_slash_rows(checklist_sample_db):
    """RCN-01: non-slash rows must have canonical_name = normalize_scientific_name(verbatim_name).

    Currently FAILS. Goes GREEN in Plan 135-03.
    """
    con = checklist_sample_db
    # Check that non-slash rows with non-null verbatim_name have non-null canonical_name.
    n_null = con.execute("""
        SELECT count(*) FROM checklist_data.checklist_records_full
        WHERE verbatim_name IS NOT NULL
          AND verbatim_name NOT LIKE '%/%'
          AND canonical_name IS NULL
    """).fetchone()[0]
    total_non_slash = con.execute("""
        SELECT count(*) FROM checklist_data.checklist_records_full
        WHERE verbatim_name IS NOT NULL
          AND verbatim_name NOT LIKE '%/%'
    """).fetchone()[0]
    assert n_null == 0, (
        f"Found {n_null} non-slash rows with verbatim_name but NULL canonical_name "
        f"(out of {total_non_slash} total non-slash rows). "
        "canonical_name must be populated for all resolvable verbatim_names (RCN-01)."
    )


def test_checklist_records_full_slash_rows_get_lca_canonical_name(checklist_sample_db):
    """RCN-01 / D-05: slash-compound rows must have a non-null canonical_name (LCA name).

    Verbatim slash string must be preserved in verbatim_name; canonical_name
    must be the LCA's accepted name (computed from taxa_subset.csv.gz fixture).

    Phase 140 Plan 02: the checklist_sample_db fixture points TAXA_PATH at
    data/tests/fixtures/taxa_subset.csv.gz (2-row fixture covering angelicus/texanus).
    With the fixture present, _slash_canonical_name() resolves the LCA and
    canonical_name must be non-null for the slash row (ObjectID 1386).

    Currently FAILS because canonical_name column does not exist. Goes GREEN in Plan 135-03.
    """
    con = checklist_sample_db
    slash_rows = con.execute("""
        SELECT verbatim_name, canonical_name FROM checklist_data.checklist_records_full
        WHERE verbatim_name LIKE '%/%'
        LIMIT 5
    """).fetchall()
    assert slash_rows, "expected at least one slash-compound row in checklist_records_full"

    # With the taxa_subset.csv.gz fixture present (always present in fast tier —
    # the module-scoped fixture unconditionally points TAXA_PATH at the committed gz),
    # LCA resolution must succeed and canonical_name must be non-null.
    for verbatim, canon in slash_rows:
        # The verbatim slash string must still be in verbatim_name (D-05 verbatim retention)
        assert "/" in verbatim, (
            f"Expected '/' in verbatim_name after slash-compound loading, got: {verbatim!r}"
        )
        assert canon is not None, (
            f"Slash-compound row verbatim_name={verbatim!r} has NULL canonical_name. "
            "Slash rows must resolve to the LCA canonical name per D-05 (RCN-01). "
            "taxa_subset.csv.gz fixture is present — LCA lookup should succeed."
        )


# ---------------------------------------------------------------------------
# Phase 135 Plan 01 — RED stubs for RCN-06 (D-07: retire reconcile() path).
#
# Both tests are intentionally RED now (reconcile() still exists in
# load_checklist() and SYNONYMS_PATH is still a module-level constant).
# They turn GREEN when Plan 135-03 removes reconcile() from checklist_pipeline.
# ---------------------------------------------------------------------------


def test_no_active_reconcile_call():
    """RCN-06 / D-07: reconcile() must be removed from load_checklist().

    Asserts that inspect.getsource(checklist_pipeline.load_checklist) does NOT
    contain the literal string 'reconcile'. Currently FAILS because reconcile()
    is still called at line 439. Goes GREEN in Plan 135-03.

    Phase 142 Rule 1 fix: importlib.reload() removed — it was causing
    order-dependence under pytest-randomly by resetting CHECKLIST_RECORDS_FULL_PATH
    to the real filesystem path mid-run, clobbering checklist_sample_db's fixture
    patch. inspect.getsource() reads from the source file, not module memory,
    so the reload was unnecessary.
    """
    import inspect  # noqa: PLC0415
    import checklist_pipeline  # noqa: PLC0415
    src = inspect.getsource(checklist_pipeline.load_checklist)
    assert "reconcile" not in src, (
        "reconcile() must be removed from load_checklist() per D-07 (RCN-06). "
        "All checklist synonym resolution must flow through occurrence_synonyms / "
        "int_synonyms (the single dbt synonym subsystem)."
    )


def test_single_synonym_source():
    """RCN-06 / D-07: checklist_synonyms.csv must have zero data rows AND
    SYNONYMS_PATH must no longer be referenced in checklist_pipeline source.

    Asserts:
      1. checklist_synonyms.csv has no data rows (header-only or absent)
      2. 'SYNONYMS_PATH' is not in inspect.getsource(checklist_pipeline)

    Currently FAILS because SYNONYMS_PATH is still a module-level constant
    in checklist_pipeline.py. Goes GREEN in Plan 135-03.

    Phase 142 Rule 1 fix: importlib.reload() removed — it was causing
    order-dependence under pytest-randomly by resetting CHECKLIST_RECORDS_FULL_PATH
    to the real filesystem path mid-run, clobbering checklist_sample_db's fixture
    patch. inspect.getsource() reads from the source file, not module memory,
    so the reload was unnecessary.
    """
    import inspect  # noqa: PLC0415
    import checklist_pipeline  # noqa: PLC0415

    # 1. Inspect source for SYNONYMS_PATH reference.
    full_src = inspect.getsource(checklist_pipeline)
    assert "SYNONYMS_PATH" not in full_src, (
        "SYNONYMS_PATH must be removed from checklist_pipeline.py per D-07 (RCN-06). "
        "The disjoint Python synonym path is retired; synonym resolution flows "
        "through occurrence_synonyms / int_synonyms."
    )

    # 2. checklist_synonyms.csv must have no data rows.
    synonyms_path = Path(__file__).parent.parent / "checklist_synonyms.csv"
    if synonyms_path.exists():
        rows = list(csv.DictReader(synonyms_path.open(newline="")))
        assert len(rows) == 0, (
            f"checklist_synonyms.csv must have no active synonym mappings per D-07 "
            f"(RCN-06). Found {len(rows)} data rows: {rows[:3]}"
        )


# ---------------------------------------------------------------------------
# quick-260702-lvc: New fast-tier test for the set-based UPDATE conversion.
# ---------------------------------------------------------------------------


def test_update_occurrences_canonical_name_maps_distinct_names():
    """Set-based UPDATE maps distinct scientific_names to canonical form.

    Guards _update_occurrences_canonical_name() using a fresh in-memory
    connection with real rows (not the zero-row occurrence table in
    checklist_sample_db). Verifies:
    - Two rows sharing a trinomial scientific_name both receive the binomial
      canonical_name (duplicate rows handled by the JOIN, not per-row loop)
    - An authority-bearing name has its authority stripped
    - A row with NULL scientific_name keeps canonical_name NULL (no join match)
    """
    import duckdb as _duckdb
    import checklist_pipeline as _mod

    con = _duckdb.connect(":memory:")
    try:
        con.execute("CREATE SCHEMA ecdysis_data")
        con.execute(
            "CREATE TABLE ecdysis_data.occurrences "
            "(scientific_name VARCHAR, canonical_name VARCHAR)"
        )
        con.execute("""
            INSERT INTO ecdysis_data.occurrences VALUES
            ('Bombus melanopygus mixtus', NULL),
            ('Bombus melanopygus mixtus', NULL),
            ('Andrena fulva (Müller, 1766)', NULL),
            (NULL, NULL)
        """)

        _mod._update_occurrences_canonical_name(con)

        rows = con.execute(
            "SELECT scientific_name, canonical_name "
            "FROM ecdysis_data.occurrences "
            "ORDER BY scientific_name NULLS LAST"
        ).fetchall()

        # Both Bombus trinomial rows -> 'bombus melanopygus'
        bombus = [r for r in rows if r[0] == "Bombus melanopygus mixtus"]
        assert len(bombus) == 2, f"expected 2 Bombus rows, got {len(bombus)}"
        for sci, canon in bombus:
            expected = normalize_scientific_name(sci)
            assert canon == expected, f"{sci!r}: got {canon!r}, expected {expected!r}"

        # Authority-bearing Andrena -> 'andrena fulva'
        andrena = [r for r in rows if r[0] == "Andrena fulva (Müller, 1766)"]
        assert len(andrena) == 1
        assert andrena[0][1] == "andrena fulva", (
            f"authority not stripped: {andrena[0][1]!r}"
        )

        # NULL scientific_name -> canonical_name stays NULL
        null_rows = [r for r in rows if r[0] is None]
        assert len(null_rows) == 1
        assert null_rows[0][1] is None, (
            f"NULL scientific_name row got canonical_name={null_rows[0][1]!r}, expected NULL"
        )
    finally:
        con.close()
