"""Integration tests for export.py functions.

Each test calls an export function with the fixture DuckDB connection and verifies
that the output has the correct schema and non-empty, valid data.

Column lists match scripts/validate-schema.mjs (authoritative source).
"""

import json
import duckdb
import export as export_mod


EXPECTED_ECDYSIS_COLS = [
    'ecdysis_id', 'longitude', 'latitude',
    'date', 'year', 'month', 'scientificName', 'recordedBy', 'fieldNumber',
    'genus', 'family', 'floralHost',
    'county', 'ecoregion_l3',
    'host_observation_id', 'inat_host', 'inat_quality_grade',
    'modified',
    'specimen_observation_id',
    'elevation_m',
]

EXPECTED_SAMPLES_COLS = [
    'observation_id', 'observer', 'date', 'lat', 'lon',
    'specimen_count', 'sample_id',
    'county', 'ecoregion_l3',
    'elevation_m',
]


# ---------------------------------------------------------------------------
# ecdysis.parquet tests
# ---------------------------------------------------------------------------

def test_ecdysis_parquet_schema(fixture_con, export_dir, monkeypatch):
    """export_ecdysis_parquet writes file with all 15 expected columns."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_ecdysis_parquet(fixture_con)

    parquet_path = str(export_dir / 'ecdysis.parquet')
    schema = duckdb.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
    ).fetchall()
    actual_cols = [row[0] for row in schema]

    for col in EXPECTED_ECDYSIS_COLS:
        assert col in actual_cols, f"Missing column in ecdysis.parquet: {col}"


def test_ecdysis_parquet_has_specimen_observation_id(fixture_con, export_dir, monkeypatch):
    """export_ecdysis_parquet populates specimen_observation_id for WABA-linked specimens."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_ecdysis_parquet(fixture_con)

    parquet_path = str(export_dir / 'ecdysis.parquet')
    row = duckdb.execute(f"""
        SELECT COUNT(*) FROM read_parquet('{parquet_path}')
        WHERE specimen_observation_id IS NOT NULL
    """).fetchone()
    assert row[0] >= 1, "No rows have specimen_observation_id set — WABA join may be broken"


def test_ecdysis_parquet_has_rows(fixture_con, export_dir, monkeypatch):
    """export_ecdysis_parquet writes at least 1 row with non-null county and ecoregion_l3."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_ecdysis_parquet(fixture_con)

    parquet_path = str(export_dir / 'ecdysis.parquet')
    row = duckdb.execute(f"""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN county IS NULL THEN 1 ELSE 0 END) AS null_county,
            SUM(CASE WHEN ecoregion_l3 IS NULL THEN 1 ELSE 0 END) AS null_eco
        FROM read_parquet('{parquet_path}')
    """).fetchone()
    total, null_county, null_eco = row
    assert total >= 1, "ecdysis.parquet has no rows"
    assert null_county == 0, f"ecdysis.parquet has {null_county} rows with null county"
    assert null_eco == 0, f"ecdysis.parquet has {null_eco} rows with null ecoregion_l3"


def test_ecdysis_parquet_elevation_col(fixture_con, export_dir, monkeypatch):
    """export_ecdysis_parquet adds elevation_m as INT16 (SMALLINT) column."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_ecdysis_parquet(fixture_con)

    parquet_path = str(export_dir / 'ecdysis.parquet')
    schema = duckdb.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
    ).fetchall()
    actual_cols = [row[0] for row in schema]
    assert 'elevation_m' in actual_cols, "Missing elevation_m column in ecdysis.parquet"
    type_map = {row[0]: row[1] for row in schema}
    assert 'INT' in type_map['elevation_m'], (
        f"elevation_m should be INTEGER, got {type_map['elevation_m']}"
    )


def test_ecdysis_elevation_has_values(fixture_con, export_dir, monkeypatch):
    """Seed specimen has minimum_elevation_in_meters='1219' -- elevation_m should be non-null."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_ecdysis_parquet(fixture_con)

    parquet_path = str(export_dir / 'ecdysis.parquet')
    row = duckdb.execute(f"""
        SELECT COUNT(*) FROM read_parquet('{parquet_path}')
        WHERE elevation_m IS NOT NULL
    """).fetchone()
    assert row[0] >= 1, "No rows have non-null elevation_m -- seed specimen should have a value"


# ---------------------------------------------------------------------------
# samples.parquet tests
# ---------------------------------------------------------------------------

def test_samples_parquet_schema(fixture_con, export_dir, monkeypatch):
    """export_samples_parquet writes file with all 9 expected columns."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_samples_parquet(fixture_con)

    parquet_path = str(export_dir / 'samples.parquet')
    schema = duckdb.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
    ).fetchall()
    actual_cols = [row[0] for row in schema]

    for col in EXPECTED_SAMPLES_COLS:
        assert col in actual_cols, f"Missing column in samples.parquet: {col}"


def test_samples_parquet_has_rows(fixture_con, export_dir, monkeypatch):
    """export_samples_parquet writes at least 1 row with non-null county and ecoregion_l3."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_samples_parquet(fixture_con)

    parquet_path = str(export_dir / 'samples.parquet')
    row = duckdb.execute(f"""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN county IS NULL THEN 1 ELSE 0 END) AS null_county,
            SUM(CASE WHEN ecoregion_l3 IS NULL THEN 1 ELSE 0 END) AS null_eco
        FROM read_parquet('{parquet_path}')
    """).fetchone()
    total, null_county, null_eco = row
    assert total >= 1, "samples.parquet has no rows"
    assert null_county == 0, f"samples.parquet has {null_county} rows with null county"
    assert null_eco == 0, f"samples.parquet has {null_eco} rows with null ecoregion_l3"


def test_samples_parquet_elevation_col(fixture_con, export_dir, monkeypatch):
    """export_samples_parquet adds elevation_m as INT16 (SMALLINT) column."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_samples_parquet(fixture_con)

    parquet_path = str(export_dir / 'samples.parquet')
    schema = duckdb.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
    ).fetchall()
    actual_cols = [row[0] for row in schema]
    assert 'elevation_m' in actual_cols, "Missing elevation_m column in samples.parquet"
    type_map = {row[0]: row[1] for row in schema}
    assert 'INT' in type_map['elevation_m'], (
        f"elevation_m should be INTEGER, got {type_map['elevation_m']}"
    )


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
