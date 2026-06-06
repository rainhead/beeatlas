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
    con.execute("""
        CREATE TABLE inaturalist_data.canonical_to_taxon_id (
            canonical_name TEXT PRIMARY KEY,
            taxon_id INTEGER,
            resolved_at TIMESTAMP,
            source TEXT
        )
    """)
    con.execute("""
        CREATE TABLE geographies.places (
            slug VARCHAR, name VARCHAR, land_owner VARCHAR, geom GEOMETRY
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

    # Taxon lineage rows (genus + family keyed by taxon_id, for test fixture)
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

    # ------------------------------------------------------------------
    # LIN-05 ≥95% coverage fixture (Phase 77 plan 01).
    #
    # Goal: 20 distinct canonical_names in
    #   (checklist_data.species ∪ ecdysis_data.occurrences),
    # with exactly 19 of them resolvable via the bridge to a
    # taxon_lineage_extended row with non-NULL family. Coverage =
    # 19/20 = 0.95 — the LIN-05 threshold.
    #
    # Existing seed already contributes 3 distinct canonical_names:
    #   - 'lasioglossum zonulum' (checklist + occurrences)
    #   - 'andrena fulva'        (checklist only)
    #   - 'bombus melanopygus'   (checklist + occurrences)
    # We add 14 new checklist names + 3 net-new occurrence names
    # (= 17 new distinct), giving 20 total. The 'lasioglossum zonulum'
    # row from plan 01 step 2a is omitted because checklist_data.species
    # has scientificName as PRIMARY KEY and that scientificName already
    # exists; canonical_name is unconstrained and is what the resolver
    # keys on, so the existing row covers that name.
    #
    # `xylocopa virginica` and `'zzzzz nonexistensia'` are the two
    # unresolved-by-checklist names sourced only from occurrences;
    # `xylocopa virginica` IS bridged (taxon_id 200019) so it has a
    # family, while `zzzzz nonexistensia` is the 1/20 unresolvable
    # case mirroring iNat 404.
    # ------------------------------------------------------------------

    # 2a — checklist seed: 14 new species with unique scientificName values.
    # Column order matches checklist_data.species CREATE TABLE:
    #   (scientificName, family, subfamily, tribe, genus, subgenus,
    #    specific_epithet, status, source_citation, notes, canonical_name)
    con.execute("""
        INSERT INTO checklist_data.species (
            scientificName, family, subfamily, tribe, genus, subgenus,
            specific_epithet, status, source_citation, notes, canonical_name
        ) VALUES
            ('Andrena nigrocaerulea',  NULL, NULL, NULL, 'Andrena',      NULL, 'nigrocaerulea', NULL, NULL, NULL, 'andrena nigrocaerulea'),
            ('Andrena prunorum',       NULL, NULL, NULL, 'Andrena',      NULL, 'prunorum',      NULL, NULL, NULL, 'andrena prunorum'),
            ('Bombus impatiens',       NULL, NULL, NULL, 'Bombus',       NULL, 'impatiens',     NULL, NULL, NULL, 'bombus impatiens'),
            ('Bombus vosnesenskii',    NULL, NULL, NULL, 'Bombus',       NULL, 'vosnesenskii',  NULL, NULL, NULL, 'bombus vosnesenskii'),
            ('Halictus ligatus',       NULL, NULL, NULL, 'Halictus',     NULL, 'ligatus',       NULL, NULL, NULL, 'halictus ligatus'),
            ('Halictus tripartitus',   NULL, NULL, NULL, 'Halictus',     NULL, 'tripartitus',   NULL, NULL, NULL, 'halictus tripartitus'),
            ('Hylaeus mesillae',       NULL, NULL, NULL, 'Hylaeus',      NULL, 'mesillae',      NULL, NULL, NULL, 'hylaeus mesillae'),
            ('Megachile rotundata',    NULL, NULL, NULL, 'Megachile',    NULL, 'rotundata',     NULL, NULL, NULL, 'megachile rotundata'),
            ('Osmia lignaria',         NULL, NULL, NULL, 'Osmia',        NULL, 'lignaria',      NULL, NULL, NULL, 'osmia lignaria'),
            ('Agapostemon virescens',  NULL, NULL, NULL, 'Agapostemon',  NULL, 'virescens',     NULL, NULL, NULL, 'agapostemon virescens'),
            ('Anthidium manicatum',    NULL, NULL, NULL, 'Anthidium',    NULL, 'manicatum',     NULL, NULL, NULL, 'anthidium manicatum'),
            ('Ceratina nanula',        NULL, NULL, NULL, 'Ceratina',     NULL, 'nanula',        NULL, NULL, NULL, 'ceratina nanula'),
            ('Eucera frater',          NULL, NULL, NULL, 'Eucera',       NULL, 'frater',        NULL, NULL, NULL, 'eucera frater'),
            ('Nomada vegana',          NULL, NULL, NULL, 'Nomada',       NULL, 'vegana',        NULL, NULL, NULL, 'nomada vegana')
    """)

    # 2b — occurrences seed: rows backing the 5 names that appear in BOTH
    # checklist and occurrences (the planner's "shared" set), plus 3
    # net-new occurrence-only names. Existing seed already has rows for
    # 'lasioglossum zonulum' and 'bombus melanopygus', so we add:
    #   shared (5):       bombus impatiens, osmia lignaria, lasioglossum zonulum,
    #                     megachile rotundata, halictus ligatus
    #   net-new (3):      osmia californica, xylocopa virginica, zzzzz nonexistensia
    # `'zzzzz nonexistensia'` is the LIN-05 1-of-20 unresolvable case.
    #
    # Use distinct id values (LIN05-01..LIN05-08) to avoid collisions
    # with existing rows. All ecdysis_data.occurrences columns default
    # to NULL where unspecified.
    con.execute("""
        INSERT INTO ecdysis_data.occurrences (
            id, scientific_name, canonical_name, _dlt_load_id, _dlt_id
        ) VALUES
            ('LIN05-01', 'Bombus impatiens',     'bombus impatiens',     'load-lin05', 'lin05-1'),
            ('LIN05-02', 'Osmia lignaria',       'osmia lignaria',       'load-lin05', 'lin05-2'),
            ('LIN05-03', 'Lasioglossum zonulum', 'lasioglossum zonulum', 'load-lin05', 'lin05-3'),
            ('LIN05-04', 'Megachile rotundata',  'megachile rotundata',  'load-lin05', 'lin05-4'),
            ('LIN05-05', 'Halictus ligatus',     'halictus ligatus',     'load-lin05', 'lin05-5'),
            ('LIN05-06', 'Osmia californica',    'osmia californica',    'load-lin05', 'lin05-6'),
            ('LIN05-07', 'Xylocopa virginica',   'xylocopa virginica',   'load-lin05', 'lin05-7'),
            ('LIN05-08', 'Zzzzz nonexistensia',  'zzzzz nonexistensia',  'load-lin05', 'lin05-8')
    """)

    # 2c — bridge seed: 19 of the 20 union canonical_names mapped to
    # fictional taxon_ids (200001..200019). 'zzzzz nonexistensia' is
    # intentionally absent → LEFT JOIN yields NULL family → the 1/20
    # unresolved case (coverage = 19/20 = 0.95).
    con.execute("""
        INSERT INTO inaturalist_data.canonical_to_taxon_id
            (canonical_name, taxon_id, resolved_at, source) VALUES
            ('lasioglossum zonulum',  200001, current_timestamp, 'inat_species'),
            ('andrena fulva',         200002, current_timestamp, 'inat_species'),
            ('bombus melanopygus',    200003, current_timestamp, 'inat_species'),
            ('andrena nigrocaerulea', 200004, current_timestamp, 'inat_species'),
            ('andrena prunorum',      200005, current_timestamp, 'inat_species'),
            ('bombus impatiens',      200006, current_timestamp, 'inat_species'),
            ('bombus vosnesenskii',   200007, current_timestamp, 'inat_species'),
            ('halictus ligatus',      200008, current_timestamp, 'inat_species'),
            ('halictus tripartitus',  200009, current_timestamp, 'inat_species'),
            ('hylaeus mesillae',      200010, current_timestamp, 'inat_species'),
            ('megachile rotundata',   200011, current_timestamp, 'inat_species'),
            ('osmia lignaria',        200012, current_timestamp, 'inat_species'),
            ('agapostemon virescens', 200013, current_timestamp, 'inat_species'),
            ('anthidium manicatum',   200014, current_timestamp, 'inat_species'),
            ('ceratina nanula',       200015, current_timestamp, 'inat_species'),
            ('eucera frater',         200016, current_timestamp, 'inat_species'),
            ('nomada vegana',         200017, current_timestamp, 'inat_species'),
            ('osmia californica',     200018, current_timestamp, 'inat_species'),
            ('xylocopa virginica',    200019, current_timestamp, 'inat_species')
    """)

    # 2d — taxon_lineage_extended rows for the 19 bridged taxon_ids.
    # All have non-NULL family so coverage SQL returns exactly 0.95.
    con.execute("""
        INSERT INTO inaturalist_data.taxon_lineage_extended VALUES
            (200001, 'Halictidae',   'Halictinae',  'Halictini',   'Lasioglossum', 'Dialictus'),
            (200002, 'Andrenidae',   'Andreninae',  NULL,          'Andrena',      NULL),
            (200003, 'Apidae',       'Apinae',      'Bombini',     'Bombus',       NULL),
            (200004, 'Andrenidae',   'Andreninae',  NULL,          'Andrena',      NULL),
            (200005, 'Andrenidae',   'Andreninae',  NULL,          'Andrena',      NULL),
            (200006, 'Apidae',       'Apinae',      'Bombini',     'Bombus',       NULL),
            (200007, 'Apidae',       'Apinae',      'Bombini',     'Bombus',       NULL),
            (200008, 'Halictidae',   'Halictinae',  'Halictini',   'Halictus',     NULL),
            (200009, 'Halictidae',   'Halictinae',  'Halictini',   'Halictus',     NULL),
            (200010, 'Colletidae',   'Hylaeinae',   NULL,          'Hylaeus',      NULL),
            (200011, 'Megachilidae', 'Megachilinae','Megachilini', 'Megachile',    NULL),
            (200012, 'Megachilidae', 'Megachilinae','Osmiini',     'Osmia',        NULL),
            (200013, 'Halictidae',   'Halictinae',  'Halictini',   'Agapostemon',  NULL),
            (200014, 'Megachilidae', 'Megachilinae','Anthidiini',  'Anthidium',    NULL),
            (200015, 'Apidae',       'Xylocopinae', 'Ceratinini',  'Ceratina',     NULL),
            (200016, 'Apidae',       'Apinae',      'Eucerini',    'Eucera',       NULL),
            (200017, 'Apidae',       'Nomadinae',   'Nomadini',    'Nomada',       NULL),
            (200018, 'Megachilidae', 'Megachilinae','Osmiini',     'Osmia',        NULL),
            (200019, 'Apidae',       'Xylocopinae', 'Xylocopini',  'Xylocopa',     NULL)
    """)

    # Phase 78 OFFBBOX bridge + lineage: keeps LIN-05 coverage ≥0.95 after the
    # OFFBBOX row below adds a 21st canonical_name to the union. With this
    # bridged, coverage = 20/21 = 0.952 (was 19/20 = 0.950).
    con.execute("""
        INSERT INTO inaturalist_data.canonical_to_taxon_id
            (canonical_name, taxon_id, resolved_at, source) VALUES
            ('andrena anograe', 200020, current_timestamp, 'inat_species')
    """)
    con.execute("""
        INSERT INTO inaturalist_data.taxon_lineage_extended VALUES
            (200020, 'Andrenidae', 'Andreninae', NULL, 'Andrena', NULL)
    """)

    # Test place covering BOTH canonical test occurrence coordinates:
    # Ecdysis specimen (-120.912, 47.608) and iNat observation (-120.8, 47.5)
    # Bounding box: lon -121.1..-120.7, lat 47.4..47.8
    con.execute("""
        INSERT INTO geographies.places VALUES (
            'test-place', 'Test Place', 'DNR',
            ST_GeomFromText('POLYGON((-121.1 47.4, -120.7 47.4, -120.7 47.8, -121.1 47.8, -121.1 47.4))')
        )
    """)

    # Phase 78 MAP-04: one occurrence point outside the WA bbox so the
    # species-maps clipping test (test_off_bbox_clipping) can assert the
    # silent-clip + log behavior. Eastern Oregon coordinates (lon=-117.5,
    # lat=44.8) are intentionally inside continental US but outside WA's
    # bbox (-124.85, 45.54, -116.92, 49.00).
    #
    # `andrena anograe` is occurrence-only (no checklist row) so it also
    # contributes to the third FULL OUTER arm (occurrence-only species).
    #
    # `id` must be a numeric string — export.py does `CAST(o.id AS INTEGER)`.
    # Tag the id with `78` prefix to keep the marker readable while still
    # parseable as an int. The OFFBBOX-01 marker lives in `occurrence_id`.
    con.execute("""
        INSERT INTO ecdysis_data.occurrences (
            id, occurrence_id, decimal_latitude, decimal_longitude,
            year, month, scientific_name, canonical_name,
            event_date, _dlt_load_id, _dlt_id
        ) VALUES (
            '7800001', 'OFFBBOX-01',
            '44.8', '-117.5',
            '2024', '5', 'Andrena anograe', 'andrena anograe',
            '2024-05-10', 'load-offbbox', 'off-1'
        )
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
    # `from inaturalist_pipeline import _INAT_PACE_SECONDS` snapshots the
    # value at import time (Pitfall #4 / RESEARCH A4) — patching the
    # source module is insufficient. Also patch the local binding in
    # resolve_taxon_ids when that module exists (added in plan 02).
    try:
        import resolve_taxon_ids
        monkeypatch.setattr(
            resolve_taxon_ids, "_INAT_PACE_SECONDS", 0.0, raising=False
        )
    except ImportError:
        pass


@pytest.fixture
def export_dir(tmp_path):
    """Temporary directory for export output files."""
    return tmp_path


# ---------------------------------------------------------------------------
# D-05: Silent-skip guard (TFIX-04)
# ---------------------------------------------------------------------------
# Known skip-reason substrings that identify asset-driven skips (built outputs
# absent, not platform limits). Non-@integration tests that skip for these
# reasons are a defect — the fix is either a committed fixture (D-01) or
# tagging the test @pytest.mark.integration so it is deselected, not skipped.
_ASSET_SKIP_SIGNATURES = (
    "data/dbt/run.sh build",  # stem matches plain and --select higher_taxa / --select species variants
    "run species-export first",
    "run `uv run python data/species_export.py`",
)


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """D-05: Fail the fast tier if a non-@integration test skips due to a missing built asset.

    A skip in the fast-tier summary is a defect, not an acceptable degraded pass.
    Pitfall 5: must be a generator (hookwrapper=True + outcome = yield) — a plain
    function is silently ignored by pytest's hook machinery.
    Does not fire on:
      - non-skipped outcomes
      - xfail outcomes (wasxfail attribute present)
      - tests marked @pytest.mark.integration (deselected from fast tier; may skip
        loudly when assets are absent in the integration tier)
    """
    outcome = yield
    report = outcome.get_result()

    if not report.skipped:
        return
    if hasattr(report, "wasxfail"):
        return  # expected xfail — not an asset-driven skip
    if any(marker.name == "integration" for marker in item.iter_markers()):
        return  # @integration tests are allowed to skip when assets are absent

    reason = str(getattr(report, "longrepr", ""))
    if any(sig in reason for sig in _ASSET_SKIP_SIGNATURES):
        report.outcome = "failed"
        report.longrepr = (
            "[D-05 GUARD] Asset-driven skip in fast tier (non-@integration test). "
            "Fix: add a committed fixture (D-01) or tag @pytest.mark.integration.\n"
            f"Original skip reason: {reason}"
        )

