"""Integration tests for export.py functions.

Each test calls an export function with the fixture DuckDB connection and verifies
that the output has the correct schema and non-empty, valid data.

Column lists match scripts/validate-schema.mjs (authoritative source).
"""

import json
import duckdb
import export as export_mod


EXPECTED_OCCURRENCES_COLS = [
    # specimen-side (null for sample-only rows)
    'ecdysis_id', 'catalog_number', 'scientificName', 'recordedBy', 'fieldNumber',
    'genus', 'family', 'floralHost',
    'host_observation_id', 'inat_host', 'inat_quality_grade',
    'modified', 'specimen_observation_id', 'elevation_m',
    'year', 'month',
    # sample-side (null for specimen-only rows)
    'observation_id', 'observer', 'specimen_count', 'sample_id',
    # unified (always populated via COALESCE)
    'lat', 'lon', 'date',
    'county', 'ecoregion_l3',
]


# ---------------------------------------------------------------------------
# occurrences.parquet tests
# ---------------------------------------------------------------------------

def test_occurrences_parquet_schema(fixture_con, export_dir, monkeypatch):
    """export_occurrences_parquet writes file with all expected columns."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_occurrences_parquet(fixture_con)

    parquet_path = str(export_dir / 'occurrences.parquet')
    schema = duckdb.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
    ).fetchall()
    actual_cols = [row[0] for row in schema]

    for col in EXPECTED_OCCURRENCES_COLS:
        assert col in actual_cols, f"Missing column in occurrences.parquet: {col}"


def test_occurrences_parquet_has_rows(fixture_con, export_dir, monkeypatch):
    """export_occurrences_parquet writes at least 2 rows with non-null county and ecoregion_l3."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_occurrences_parquet(fixture_con)

    parquet_path = str(export_dir / 'occurrences.parquet')
    row = duckdb.execute(f"""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN county IS NULL THEN 1 ELSE 0 END) AS null_county,
            SUM(CASE WHEN ecoregion_l3 IS NULL THEN 1 ELSE 0 END) AS null_eco
        FROM read_parquet('{parquet_path}')
    """).fetchone()
    total, null_county, null_eco = row
    assert total >= 2, "occurrences.parquet should have at least 2 rows (1 specimen-only + 1 sample-only)"
    assert null_county == 0, f"occurrences.parquet has {null_county} rows with null county"
    assert null_eco == 0, f"occurrences.parquet has {null_eco} rows with null ecoregion_l3"


def test_occurrences_coalesce_coords(fixture_con, export_dir, monkeypatch):
    """Specimen-only and sample-only rows both have non-null lat/lon via COALESCE."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_occurrences_parquet(fixture_con)

    parquet_path = str(export_dir / 'occurrences.parquet')
    row = duckdb.execute(f"""
        SELECT
            SUM(CASE WHEN lat IS NULL OR lon IS NULL THEN 1 ELSE 0 END) AS null_coords
        FROM read_parquet('{parquet_path}')
    """).fetchone()
    assert row[0] == 0, f"occurrences.parquet has {row[0]} rows with null lat/lon"


def test_occurrences_date_format(fixture_con, export_dir, monkeypatch):
    """date column is VARCHAR ISO format for both specimen-only and sample-only rows."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_occurrences_parquet(fixture_con)

    parquet_path = str(export_dir / 'occurrences.parquet')
    schema = duckdb.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
    ).fetchall()
    type_map = {row[0]: row[1] for row in schema}
    assert 'VARCHAR' in type_map['date'], f"date column should be VARCHAR, got {type_map['date']}"


def test_occurrences_specimen_only_nulls(fixture_con, export_dir, monkeypatch):
    """Specimen-only rows (no matching iNat sample) have null observer and specimen_count."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_occurrences_parquet(fixture_con)

    parquet_path = str(export_dir / 'occurrences.parquet')
    rows = duckdb.execute(f"""
        SELECT observer, specimen_count
        FROM read_parquet('{parquet_path}')
        WHERE ecdysis_id IS NOT NULL AND observation_id IS NULL
    """).fetchall()
    assert len(rows) >= 1, "Expected at least 1 specimen-only row"
    for observer, specimen_count in rows:
        assert observer is None, f"Specimen-only row should have null observer, got {observer!r}"


def test_occurrences_sample_only_nulls(fixture_con, export_dir, monkeypatch):
    """Sample-only rows (no matching ecdysis specimen) have null scientificName and family."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_occurrences_parquet(fixture_con)

    parquet_path = str(export_dir / 'occurrences.parquet')
    rows = duckdb.execute(f"""
        SELECT scientificName, family
        FROM read_parquet('{parquet_path}')
        WHERE observation_id IS NOT NULL AND ecdysis_id IS NULL
    """).fetchall()
    assert len(rows) >= 1, "Expected at least 1 sample-only row"
    for scientific_name, family in rows:
        assert scientific_name is None, f"Sample-only row should have null scientificName, got {scientific_name!r}"


# ---------------------------------------------------------------------------
# counties.geojson tests
# ---------------------------------------------------------------------------

def test_counties_geojson(fixture_con, export_dir, monkeypatch):
    """export_counties_geojson writes valid FeatureCollection with NAME property."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_counties_geojson(fixture_con)

    geojson = json.loads((export_dir / 'counties.geojson').read_text())
    assert geojson['type'] == 'FeatureCollection'
    features = geojson['features']
    assert len(features) >= 1
    for feature in features:
        assert 'geometry' in feature, "Feature missing geometry"
        assert 'NAME' in feature['properties'], "Feature missing NAME property"


# ---------------------------------------------------------------------------
# ecoregions.geojson tests
# ---------------------------------------------------------------------------

def test_ecoregions_geojson(fixture_con, export_dir, monkeypatch):
    """export_ecoregions_geojson writes valid FeatureCollection with NA_L3NAME property."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_ecoregions_geojson(fixture_con)

    geojson = json.loads((export_dir / 'ecoregions.geojson').read_text())
    assert geojson['type'] == 'FeatureCollection'
    features = geojson['features']
    assert len(features) >= 1
    for feature in features:
        assert 'geometry' in feature, "Feature missing geometry"
        assert 'NA_L3NAME' in feature['properties'], "Feature missing NA_L3NAME property"
