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
"""

import duckdb
import pytest

from canonical_name import normalize_scientific_name


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


def test_load_checklist_canonical_name_matches_normalize_scientific_name(checklist_db):
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
        assert canon == normalize_scientific_name(sci), f"{sci!r}: stored {canon!r} != normalize_scientific_name() {normalize_scientific_name(sci)!r}"


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


def test_reconcile_synonym_override_updates_checklist(fixture_con, tmp_path, monkeypatch):
    """CHECK-05 + D-05 (open-question-3 resolution): a synonyms.csv entry whose
    canonical_name DOES match an occurrence MUST UPDATE
    checklist_data.species.canonical_name to the override value, and the row
    MUST NOT be written to unmatched.csv."""
    # Seed: a checklist row whose initial canonical_name does NOT match any
    # occurrence (its canonical_name is intentionally bogus).
    fixture_con.execute("""
        INSERT INTO checklist_data.species (
            scientificName, family, subfamily, tribe, genus, subgenus,
            specific_epithet, status, source_citation, notes, canonical_name
        ) VALUES (
            'Foo barius', NULL, NULL, NULL, 'Foo', NULL, 'barius',
            'verified', 'test fixture', NULL, 'foo barius_will_not_join'
        )
    """)
    # And an occurrence with a different canonical_name that the synonym
    # will redirect to.
    fixture_con.execute("""
        INSERT INTO ecdysis_data.occurrences (
            id, occurrence_id, scientific_name, _dlt_load_id, _dlt_id,
            canonical_name
        ) VALUES (
            '7600901', 'p76-syn-uuid-1', 'Foo bara', 'load-syn', 'dlt-syn-1',
            'foo bara'
        )
    """)

    synonyms_csv = tmp_path / "checklist_synonyms.csv"
    synonyms_csv.write_text(
        "checklist_name,canonical_name,source\n"
        "Foo barius,foo bara,test fixture\n"
    )
    unmatched_csv = tmp_path / "checklist_unmatched.csv"
    monkeypatch.setattr(checklist_mod, "SYNONYMS_PATH", synonyms_csv)
    monkeypatch.setattr(checklist_mod, "UNMATCHED_PATH", unmatched_csv)

    try:
        checklist_mod.reconcile(fixture_con)

        # checklist canonical_name was UPDATEd to the override.
        new_canon = fixture_con.execute(
            "SELECT canonical_name FROM checklist_data.species "
            "WHERE scientificName = 'Foo barius'"
        ).fetchone()[0]
        assert new_canon == "foo bara", f"override not applied: {new_canon!r}"

        # And the row is NOT in unmatched.csv.
        assert unmatched_csv.exists()
        with unmatched_csv.open() as f:
            rows = list(csv.DictReader(f))
        assert all(r["checklist_name"] != "Foo barius" for r in rows), \
            "Foo barius should not be in unmatched after override hit"
    finally:
        # Tear down so other tests sharing fixture_con see clean state.
        fixture_con.execute(
            "DELETE FROM checklist_data.species WHERE scientificName = 'Foo barius'"
        )
        fixture_con.execute(
            "DELETE FROM ecdysis_data.occurrences WHERE id = '7600901'"
        )


def test_reconcile_unmatched_warn_only(fixture_con, tmp_path, monkeypatch):
    """CHECK-05 + D-05: a checklist row with no synonyms entry that doesn't
    join any occurrence MUST land in unmatched.csv WITHOUT raising."""
    fixture_con.execute("""
        INSERT INTO checklist_data.species (
            scientificName, family, subfamily, tribe, genus, subgenus,
            specific_epithet, status, source_citation, notes, canonical_name
        ) VALUES (
            'Phantom species', NULL, NULL, NULL, 'Phantom', NULL, 'species',
            'verified', 'test fixture', NULL, 'phantom species'
        )
    """)

    synonyms_csv = tmp_path / "checklist_synonyms.csv"
    synonyms_csv.write_text("checklist_name,canonical_name,source\n")
    unmatched_csv = tmp_path / "checklist_unmatched.csv"
    monkeypatch.setattr(checklist_mod, "SYNONYMS_PATH", synonyms_csv)
    monkeypatch.setattr(checklist_mod, "UNMATCHED_PATH", unmatched_csv)

    try:
        # Must not raise.
        checklist_mod.reconcile(fixture_con)

        assert unmatched_csv.exists()
        with unmatched_csv.open() as f:
            rows = list(csv.DictReader(f))
        matching = [r for r in rows if r["checklist_name"] == "Phantom species"]
        assert len(matching) == 1, f"Phantom species should appear in unmatched: {rows}"
        assert "no occurrence" in matching[0]["reason"].lower()
    finally:
        fixture_con.execute(
            "DELETE FROM checklist_data.species WHERE scientificName = 'Phantom species'"
        )


def test_reconcile_unmatched_csv_header(fixture_con, tmp_path, monkeypatch):
    """D-05: unmatched.csv MUST have header `checklist_name,canonical_name,reason`."""
    synonyms_csv = tmp_path / "checklist_synonyms.csv"
    synonyms_csv.write_text("checklist_name,canonical_name,source\n")
    unmatched_csv = tmp_path / "checklist_unmatched.csv"
    monkeypatch.setattr(checklist_mod, "SYNONYMS_PATH", synonyms_csv)
    monkeypatch.setattr(checklist_mod, "UNMATCHED_PATH", unmatched_csv)

    checklist_mod.reconcile(fixture_con)

    assert unmatched_csv.exists()
    first_line = unmatched_csv.read_text().splitlines()[0]
    assert first_line == "checklist_name,canonical_name,reason"


# ---------------------------------------------------------------------------
# Phase 134 Plan 02: Integration tests for checklist_data.checklist_records_full
# (ING-01, ING-02, ING-03). Uses checklist_db fixture + real committed CSV.
# Written RED first, then GREEN.
# ---------------------------------------------------------------------------


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


def test_checklist_records_full_schema(checklist_db):
    """SC#1: checklist_records_full must have the full 13-column schema (D-12)."""
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
        "ObjectID", "family", "genus", "verbatim_name", "locality",
        "latitude", "longitude", "recordedBy",
        "year", "month", "day", "date_quality", "coord_flag",
    }
    assert required <= cols, f"missing columns: {required - cols}"


def test_checklist_records_full_coord_flag_no_zero_valid(checklist_db):
    """SC#2: no row with coord_flag='valid' should have latitude=0 or longitude=0."""
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        n = con.execute("""
            SELECT count(*) FROM checklist_data.checklist_records_full
            WHERE coord_flag = 'valid' AND (latitude = 0 OR longitude = 0)
        """).fetchone()[0]
    finally:
        con.close()
    assert n == 0, f"found {n} rows with coord_flag='valid' and zero lat or lon"


def test_checklist_records_full_coord_flag_valid_in_bbox(checklist_db):
    """SC#2: no 'valid' row should have lat/lon outside the tight WA bbox."""
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        n = con.execute("""
            SELECT count(*) FROM checklist_data.checklist_records_full
            WHERE coord_flag = 'valid'
              AND NOT (
                latitude BETWEEN 45.5 AND 49.0
                AND longitude BETWEEN -124.85 AND -116.9
              )
        """).fetchone()[0]
    finally:
        con.close()
    assert n == 0, f"found {n} 'valid' rows outside the WA bbox"


def test_checklist_records_full_coord_flag_coverage(checklist_db):
    """SC#2: every coord_flag is in the valid enum; null_coord count > 1000."""
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        bad = con.execute("""
            SELECT count(*) FROM checklist_data.checklist_records_full
            WHERE coord_flag NOT IN ('valid', 'null_coord', 'zero_coord', 'out_of_bbox')
        """).fetchone()[0]
        null_coord_count = con.execute("""
            SELECT count(*) FROM checklist_data.checklist_records_full
            WHERE coord_flag = 'null_coord'
        """).fetchone()[0]
    finally:
        con.close()
    assert bad == 0, f"found {bad} rows with invalid coord_flag"
    assert null_coord_count > 1000, f"expected >1000 null_coord rows, got {null_coord_count}"


def test_checklist_records_full_date_parsing_pre1900(checklist_db):
    """SC#3: the 1812-06-18 source row parses to year=1812, month=6, day=18, date_quality='full'."""
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        # The 1812-06-18 row is ObjectID 31311 per CSV
        row = con.execute("""
            SELECT year, month, day, date_quality FROM checklist_data.checklist_records_full
            WHERE year = 1812 AND month = 6 AND day = 18
        """).fetchone()
    finally:
        con.close()
    assert row is not None, "no row with year=1812, month=6, day=18 found"
    year, month, day, dq = row
    assert year == 1812
    assert month == 6
    assert day == 18
    assert dq == "full"


def test_checklist_records_full_date_parsing_mdy(checklist_db):
    """SC#3: at least one M/D/YYYY-sourced row must parse to date_quality='full'."""
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        # 6/14/1905 is in the CSV (ObjectID 1668); assert year=1905, month=6, day=14
        n = con.execute("""
            SELECT count(*) FROM checklist_data.checklist_records_full
            WHERE year = 1905 AND month = 6 AND day = 14 AND date_quality = 'full'
        """).fetchone()[0]
    finally:
        con.close()
    assert n >= 1, "expected at least one M/D/YYYY row parsed to year=1905, month=6, day=14"


def test_checklist_records_full_null_date_tagged_none(checklist_db):
    """SC#3: every empty/NULL-source-date row must have date_quality='none' and year IS NULL."""
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        # Rows with date_quality='none' should all have NULL year
        n_bad = con.execute("""
            SELECT count(*) FROM checklist_data.checklist_records_full
            WHERE date_quality = 'none' AND year IS NOT NULL
        """).fetchone()[0]
        # There should be some 'none' rows (empirically ~6,689)
        n_none = con.execute("""
            SELECT count(*) FROM checklist_data.checklist_records_full
            WHERE date_quality = 'none'
        """).fetchone()[0]
    finally:
        con.close()
    assert n_bad == 0, f"found {n_bad} rows with date_quality='none' but year IS NOT NULL"
    assert n_none > 1000, f"expected >1000 'none' date rows, got {n_none}"


def test_checklist_records_full_date_quality_domain(checklist_db):
    """Every date_quality value must be in ('full', 'year_only', 'none')."""
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        bad = con.execute("""
            SELECT count(*) FROM checklist_data.checklist_records_full
            WHERE date_quality NOT IN ('full', 'year_only', 'none')
        """).fetchone()[0]
    finally:
        con.close()
    assert bad == 0, f"found {bad} rows with invalid date_quality"


def test_checklist_records_full_is_idempotent(checklist_db):
    """Running load_checklist() twice must yield the same checklist_records_full row count."""
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        n1 = con.execute(
            "SELECT count(*) FROM checklist_data.checklist_records_full"
        ).fetchone()[0]
    finally:
        con.close()
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        n2 = con.execute(
            "SELECT count(*) FROM checklist_data.checklist_records_full"
        ).fetchone()[0]
    finally:
        con.close()
    assert n1 == n2, f"not idempotent: first run {n1} rows, second run {n2} rows"


def test_checklist_records_old_table_still_exists(checklist_db):
    """D-10: checklist_data.checklist_records (4-column OLD table) must still exist."""
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        cols = [
            row[0]
            for row in con.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='checklist_data' AND table_name='checklist_records' "
                "ORDER BY ordinal_position"
            ).fetchall()
        ]
    finally:
        con.close()
    assert cols == ["scientificName", "county", "year", "month"], (
        f"old checklist_records table missing or schema changed: {cols}"
    )
