"""Session-scoped fixture DuckDB with all required schemas and seed data for tests."""

import datetime

import pytest
import duckdb

from .fixtures import WA_STATE_WKT, CHELAN_WKT, NORTH_CASCADES_WKT  # noqa: F401


def _create_schemas(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("CREATE SCHEMA geographies")
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute("CREATE SCHEMA inaturalist_data")
    con.execute("CREATE SCHEMA inaturalist_waba_data")
    con.execute("CREATE SCHEMA checklist_data")


def _create_tables(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("""
        CREATE TABLE geographies.us_states (
            fips VARCHAR, name VARCHAR, abbreviation VARCHAR,
            geometry_wkt VARCHAR
        )
    """)
    con.execute("""
        CREATE TABLE geographies.us_counties (
            geoid VARCHAR, name VARCHAR, state_fips VARCHAR,
            geometry_wkt VARCHAR
        )
    """)
    con.execute("""
        CREATE TABLE geographies.ecoregions (
            name VARCHAR, level2_name VARCHAR, level1_name VARCHAR,
            geometry_wkt VARCHAR
        )
    """)
    con.execute("""
        CREATE TABLE ecdysis_data.occurrences (
            id VARCHAR, occurrence_id VARCHAR,
            decimal_latitude VARCHAR, decimal_longitude VARCHAR,
            year VARCHAR, month VARCHAR, scientific_name VARCHAR,
            recorded_by VARCHAR, field_number VARCHAR,
            genus VARCHAR, family VARCHAR, associated_taxa VARCHAR,
            event_date VARCHAR,
            modified TIMESTAMPTZ,
            catalog_number VARCHAR,
            _dlt_load_id VARCHAR, _dlt_id VARCHAR,
            minimum_elevation_in_meters VARCHAR,
            canonical_name VARCHAR
        )
    """)
    con.execute("""
        CREATE TABLE ecdysis_data.identifications (
            coreid VARCHAR,
            scientific_name VARCHAR,
            identified_by VARCHAR,
            modified TIMESTAMPTZ,
            record_id VARCHAR,
            identification_is_current VARCHAR,
            date_identified VARCHAR,
            _dlt_load_id VARCHAR,
            _dlt_id VARCHAR
        )
    """)
    con.execute("""
        CREATE TABLE ecdysis_data.occurrence_links (
            occurrence_id VARCHAR, host_observation_id BIGINT,
            _dlt_load_id VARCHAR, _dlt_id VARCHAR
        )
    """)
    con.execute("""
        CREATE TABLE inaturalist_data.observations (
            _dlt_id VARCHAR, id BIGINT, uuid VARCHAR,
            user__login VARCHAR, observed_on DATE,
            longitude DOUBLE, latitude DOUBLE,
            taxon__iconic_taxon_name VARCHAR, taxon__name VARCHAR,
            quality_grade VARCHAR,
            _dlt_load_id VARCHAR,
            taxon__id BIGINT
        )
    """)
    con.execute("""
        CREATE TABLE inaturalist_data.observations__ofvs (
            _dlt_root_id VARCHAR, field_id BIGINT, name VARCHAR,
            value VARCHAR, datatype VARCHAR,
            _dlt_load_id VARCHAR, _dlt_id VARCHAR,
            _dlt_parent_id VARCHAR, _dlt_list_idx BIGINT
        )
    """)
    con.execute("""
        CREATE TABLE inaturalist_waba_data.observations (
            _dlt_id VARCHAR, id BIGINT, uuid VARCHAR,
            user__login VARCHAR, observed_on DATE,
            longitude DOUBLE, latitude DOUBLE,
            quality_grade VARCHAR,
            _dlt_load_id VARCHAR,
            taxon__name VARCHAR, taxon__rank VARCHAR,
            taxon__id BIGINT
        )
    """)
    con.execute("""
        CREATE TABLE inaturalist_waba_data.observations__ofvs (
            _dlt_root_id VARCHAR, field_id BIGINT, name VARCHAR,
            value VARCHAR, datatype VARCHAR,
            _dlt_load_id VARCHAR, _dlt_id VARCHAR,
            _dlt_parent_id VARCHAR, _dlt_list_idx BIGINT
        )
    """)
    con.execute("""
        CREATE TABLE inaturalist_waba_data.taxon_lineage (
            taxon_id BIGINT, genus VARCHAR, family VARCHAR
        )
    """)
    con.execute("""
        CREATE TABLE checklist_data.species (
            scientificName VARCHAR PRIMARY KEY,
            family VARCHAR,
            subfamily VARCHAR,
            tribe VARCHAR,
            genus VARCHAR,
            subgenus VARCHAR,
            specific_epithet VARCHAR,
            status VARCHAR,
            source_citation VARCHAR,
            notes VARCHAR,
            canonical_name VARCHAR
        )
    """)
    con.execute("""
        CREATE TABLE checklist_data.species_counties (
            scientificName VARCHAR,
            county VARCHAR
        )
    """)
    con.execute("""
        CREATE TABLE inaturalist_data.taxon_lineage_extended (
            taxon_id BIGINT,
            family VARCHAR,
            subfamily VARCHAR,
            tribe VARCHAR,
            genus VARCHAR,
            subgenus VARCHAR
        )
    """)


def _seed_data(con: duckdb.DuckDBPyConnection) -> None:
    # WA state boundary (required by export queries that filter ecoregions via ST_Intersects)
    con.execute("""
        INSERT INTO geographies.us_states VALUES (
            '53', 'Washington', 'WA', ?
        )
    """, [WA_STATE_WKT])

    # Chelan county (state_fips='53', contains both test specimen and iNat observation)
    con.execute("""
        INSERT INTO geographies.us_counties VALUES (
            '53007', 'Chelan', '53', ?
        )
    """, [CHELAN_WKT])

    # North Cascades ecoregion (contains both test points)
    con.execute("""
        INSERT INTO geographies.ecoregions VALUES (
            'North Cascades', 'Western Cordillera', 'North American Cordillera',
            ?
        )
    """, [NORTH_CASCADES_WKT])

    # Ecdysis specimen (lat=47.608, lon=-120.912, inside Chelan county and North Cascades)
    # catalog_number='WSDA_5594569' so WABA OFV value '5594569' joins via numeric suffix
    con.execute("""
        INSERT INTO ecdysis_data.occurrences (
            id, occurrence_id, decimal_latitude, decimal_longitude,
            year, month, scientific_name, recorded_by, field_number,
            genus, family, associated_taxa, event_date,
            modified, catalog_number, _dlt_load_id, _dlt_id,
            minimum_elevation_in_meters
        ) VALUES (
            '5594569', '69c258f0-7c62-4da3-b991-130ec3dde645',
            '47.608', '-120.912',
            '2024', '6', 'Eucera acerba',
            'Test Collector', 'TC-001',
            'Eucera', 'Apidae',
            'host:"Balsamorhiza sagittata"',
            '2024-06-15',
            '2024-05-01T00:00:00+00:00'::TIMESTAMPTZ,
            'WSDA_5594569',
            'load1', 'occ-1',
            '1219'
        )
    """)

    # Link from ecdysis occurrence to iNat observation
    con.execute("""
        INSERT INTO ecdysis_data.occurrence_links VALUES (
            '69c258f0-7c62-4da3-b991-130ec3dde645', 163069968, 'load1', 'link-1'
        )
    """)

    # iNat observation (lon=-120.8, lat=47.5, inside Chelan county and North Cascades)
    con.execute("""
        INSERT INTO inaturalist_data.observations (
            _dlt_id, id, uuid, user__login, observed_on,
            longitude, latitude,
            taxon__iconic_taxon_name, taxon__name,
            quality_grade, _dlt_load_id
        ) VALUES (
            'test-obs-1', 999999, 'test-uuid-1',
            'testuser', '2024-06-15'::DATE,
            -120.8, 47.5,
            'Insecta', 'Eucera acerba',
            'research',
            'load1'
        )
    """)

    # iNat observation field value: specimen count (field_id=8338)
    con.execute("""
        INSERT INTO inaturalist_data.observations__ofvs VALUES (
            'test-obs-1', 8338, 'Specimen Count', '3', 'numeric',
            'load1', 'ofv-1', 'test-obs-1', 0
        )
    """)

    # WABA observation linking to the test specimen via catalog number suffix
    # The test specimen has catalog_number='WSDA_5594569', suffix='5594569'
    # The WABA OFV value '5594569' joins via regexp_extract(catalog_number, '[0-9]+$')
    con.execute("""
        INSERT INTO inaturalist_waba_data.observations VALUES (
            'waba-obs-1', 777777, 'waba-uuid-1',
            'wabauser', '2024-06-15'::DATE,
            -120.8, 47.5,
            'research',
            'waba-load1',
            'Eucera acerba', 'species', 100001
        )
    """)
    con.execute("""
        INSERT INTO inaturalist_waba_data.observations__ofvs VALUES (
            'waba-obs-1', 18116, 'WABA', '5594569', 'text',
            'waba-load1', 'waba-ofv-1', 'waba-obs-1', 0
        )
    """)

    # Second WABA observation: unmatched (no OFV 18116) — will become a provisional row
    con.execute("""
        INSERT INTO inaturalist_waba_data.observations VALUES (
            'waba-obs-2', 888888, 'waba-uuid-2',
            'provisionaluser', '2024-07-01'::DATE,
            -120.8, 47.5,
            'research',
            'waba-load2',
            'Osmia', 'genus', 100002
        )
    """)
    # OFV 1718 on provisional obs points to the known iNat host sample (id=999999)
    con.execute("""
        INSERT INTO inaturalist_waba_data.observations__ofvs VALUES (
            'waba-obs-2', 1718, 'Associated observation',
            'https://www.inaturalist.org/observations/999999', 'text',
            'waba-load2', 'waba-ofv-2', 'waba-obs-2', 0
        )
    """)

    # Taxon lineage rows (genus + family keyed by taxon_id, mirrors enrich_taxon_lineage output)
    con.execute("""
        INSERT INTO inaturalist_waba_data.taxon_lineage VALUES
            (100001, 'Eucera', 'Apidae'),
            (100002, 'Osmia', 'Megachilidae')
    """)


    # Identifications seed rows for feeds tests:
    # a. Recent valid: should appear in feed (within 90-day window, non-blank fields)
    con.execute("""
        INSERT INTO ecdysis_data.identifications VALUES (
            '5594569', 'Eucera acerba', 'Test Determiner',
            ?, 'det-uuid-1', '1', '2026-01-15', 'load1', 'det-1'
        )
    """, [datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=10)])

    # b. Recent blank: should be excluded by blank-field filter
    con.execute("""
        INSERT INTO ecdysis_data.identifications VALUES (
            '5594569', '', '',
            ?, 'det-uuid-2', '1', '2026-01-15', 'load1', 'det-2'
        )
    """, [datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=5)])

    # c. Old valid: should be excluded by 90-day window
    con.execute("""
        INSERT INTO ecdysis_data.identifications VALUES (
            '5594569', 'Andrena lupinorum', 'Old Determiner',
            ?, 'det-uuid-3', '1', '2024-01-15', 'load1', 'det-3'
        )
    """, [datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=100)])

    # Phase 76 disagreement fixtures (TAX-04 + PITFALLS.md #1, #2).
    # `p76-*` ID prefix avoids collisions with existing test_export PK rows.
    SOURCE_CITATION_FIXTURE = "Bartholomew et al. 2024, JHR 97 (DOI: 10.3897/jhr.97.129013)"

    # Checklist row uses the neuter epithet form (no parens, no authority).
    con.execute("""
        INSERT INTO checklist_data.species (
            scientificName, family, subfamily, tribe, genus, subgenus,
            specific_epithet, status, source_citation, notes, canonical_name
        ) VALUES
            ('Lasioglossum zonulum', NULL, NULL, NULL, 'Lasioglossum', NULL, 'zonulum',
             'verified', ?, NULL, 'lasioglossum zonulum'),
            ('Andrena fulva (Müller, 1766)', NULL, NULL, NULL, 'Andrena', NULL, 'fulva',
             'verified', ?, NULL, 'andrena fulva'),
            ('Bombus melanopygus', NULL, NULL, NULL, 'Bombus', NULL, 'melanopygus',
             'verified', ?, NULL, 'bombus melanopygus')
    """, [SOURCE_CITATION_FIXTURE, SOURCE_CITATION_FIXTURE, SOURCE_CITATION_FIXTURE])

    con.execute("""
        INSERT INTO checklist_data.species_counties VALUES
            ('Lasioglossum zonulum', 'King'),
            ('Andrena fulva (Müller, 1766)', 'Pierce'),
            ('Bombus melanopygus', 'Chelan')
    """)

    # Ecdysis occurrence rows that exercise the canonicalize collapses.
    # Use explicit column list to be robust against future column additions.
    con.execute("""
        INSERT INTO ecdysis_data.occurrences (
            id, occurrence_id, decimal_latitude, decimal_longitude,
            year, month, scientific_name, recorded_by, field_number,
            genus, family, associated_taxa, event_date,
            modified, catalog_number, _dlt_load_id, _dlt_id,
            minimum_elevation_in_meters, canonical_name
        ) VALUES
            ('7600001', 'p76-uuid-001', '47.5', '-122.3', '2023', '6',
             'Lasioglossum (Dialictus) zonulum', 'Test', 'TEST-1',
             'Lasioglossum', 'Halictidae', NULL, '2023-06-15',
             NULL, 'CAT-p76-1', 'load-p76', 'dlt-p76-1', '50', 'lasioglossum zonulum'),
            ('7600002', 'p76-uuid-002', '47.5', '-121.0', '2023', '7',
             'Bombus melanopygus mixtus', 'Test', 'TEST-2',
             'Bombus', 'Apidae', NULL, '2023-07-15',
             NULL, 'CAT-p76-2', 'load-p76', 'dlt-p76-2', '500', 'bombus melanopygus')
    """)

    # Extended-lineage seeds: one fully-populated row, one with NULL subgenus.
    con.execute("""
        INSERT INTO inaturalist_data.taxon_lineage_extended VALUES
            (100001, 'Apidae', 'Apinae', 'Eucerini', 'Eucera', NULL),
            (100002, 'Halictidae', 'Halictinae', 'Halictini', 'Lasioglossum', 'Dialictus')
    """)


@pytest.fixture(scope="session")
def fixture_db(tmp_path_factory):
    """Create a test DuckDB with all schemas and seed data. Returns path to DB file."""
    db_path = str(tmp_path_factory.mktemp("db") / "test.duckdb")
    con = duckdb.connect(db_path)
    con.execute("INSTALL spatial; LOAD spatial;")
    _create_schemas(con)
    _create_tables(con)
    _seed_data(con)
    con.close()
    return db_path


@pytest.fixture(scope="session")
def fixture_con(fixture_db):
    """Return a connection to the fixture DB with spatial loaded."""
    con = duckdb.connect(fixture_db, read_only=False)
    con.execute("LOAD spatial;")
    yield con
    con.close()


@pytest.fixture(autouse=True)
def _zero_inat_pacing(monkeypatch):
    """Zero iNat retry/pacing constants so tests don't real-time-sleep."""
    try:
        import inaturalist_pipeline
    except ImportError:
        return
    monkeypatch.setattr(inaturalist_pipeline, "_INAT_PACE_SECONDS", 0.0, raising=False)
    monkeypatch.setattr(
        inaturalist_pipeline, "_INAT_BACKOFF_BASE_SECONDS", 0.0, raising=False
    )


@pytest.fixture
def export_dir(tmp_path):
    """Temporary directory for export output files."""
    return tmp_path


