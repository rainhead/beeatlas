"""Scaffold assertions for the dbt-duckdb spike (Phase 83).

These tests run against the real data/beeatlas.duckdb and the post-build
data/dbt/target/sandbox/ artifacts produced by `bash data/dbt/run.sh build`.

Workflow:
  1. Run: bash data/dbt/run.sh build
  2. Run: uv run --project data pytest data/tests/test_dbt_scaffold.py -x

Tests guarded by @pytest.mark.skipif are skipped until `dbt build` has produced
the sandbox outputs. test_profiles_yml_declares_spatial and
test_no_production_dbt_references run always (no build required).
"""

import json
import subprocess
from pathlib import Path

import duckdb
import pytest
import yaml


SANDBOX = Path(__file__).resolve().parent.parent / "dbt" / "target" / "sandbox"


# ---------------------------------------------------------------------------
# Post-build parquet assertions (skipif guard: requires dbt build)
# ---------------------------------------------------------------------------

@pytest.mark.skipif(
    not (SANDBOX / "occurrences.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)
def test_occurrences_parquet_exists():
    """sandbox/occurrences.parquet exists after dbt build."""
    assert (SANDBOX / "occurrences.parquet").exists()


@pytest.mark.skipif(
    not (SANDBOX / "occurrences.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)
def test_occurrences_has_rows_and_zero_null_county_or_eco():
    """occurrences.parquet has rows; county and ecoregion_l3 are fully populated.

    Mirrors export.py:266-277 invariants (PORT-02 smoke).
    """
    parquet_path = str(SANDBOX / "occurrences.parquet")
    row = duckdb.execute(f"""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN county IS NULL THEN 1 ELSE 0 END) AS null_county,
            SUM(CASE WHEN ecoregion_l3 IS NULL THEN 1 ELSE 0 END) AS null_eco
        FROM read_parquet('{parquet_path}')
    """).fetchone()
    total, null_county, null_eco = row
    assert total >= 2, f"occurrences.parquet should have at least 2 rows, got {total}"
    assert null_county == 0, f"occurrences.parquet has {null_county} rows with null county"
    assert null_eco == 0, f"occurrences.parquet has {null_eco} rows with null ecoregion_l3"


# ---------------------------------------------------------------------------
# Post-build GeoJSON assertions (skipif guard: requires dbt build)
# ---------------------------------------------------------------------------

@pytest.mark.skipif(
    not (SANDBOX / "counties.geojson").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)
def test_counties_geojson_structural():
    """sandbox/counties.geojson is a valid FeatureCollection with NAME properties.

    WA has 39 counties; asserts >= 30 features.
    """
    geojson = json.loads((SANDBOX / "counties.geojson").read_text())
    assert geojson["type"] == "FeatureCollection"
    features = geojson["features"]
    assert len(features) >= 30, f"Expected >= 30 WA counties, got {len(features)}"
    for feature in features:
        assert "geometry" in feature, "Feature missing geometry"
        assert "NAME" in feature["properties"], "Feature missing NAME property"


@pytest.mark.skipif(
    not (SANDBOX / "ecoregions.geojson").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)
def test_ecoregions_geojson_structural():
    """sandbox/ecoregions.geojson is a valid FeatureCollection with NA_L3NAME properties."""
    geojson = json.loads((SANDBOX / "ecoregions.geojson").read_text())
    assert geojson["type"] == "FeatureCollection"
    features = geojson["features"]
    assert len(features) >= 1, "Expected at least 1 ecoregion feature"
    for feature in features:
        assert "geometry" in feature, "Feature missing geometry"
        assert "NA_L3NAME" in feature["properties"], "Feature missing NA_L3NAME property"


# ---------------------------------------------------------------------------
# Always-run assertions (no dbt build required)
# ---------------------------------------------------------------------------

def test_profiles_yml_declares_spatial():
    """profiles.yml declares spatial in the extensions list (V-SCAFFOLD-02)."""
    profiles_path = Path(__file__).resolve().parent.parent / "dbt" / "profiles.yml"
    profiles = yaml.safe_load(profiles_path.read_text())
    extensions = profiles["beeatlas"]["outputs"]["sandbox"]["extensions"]
    assert "spatial" in extensions, (
        f"profiles.yml must declare spatial extension; got: {extensions}"
    )


def test_no_production_dbt_references():
    """data/run.py, data/nightly.sh, and .github/workflows/ do not reference data/dbt (V-SCAFFOLD-03a).

    These paths are the production surface that must remain untouched by the spike.
    """
    result = subprocess.run(
        ["git", "grep", "-l", "data/dbt", "data/run.py", "data/nightly.sh", ".github/workflows/"],
        capture_output=True,
        text=True,
    )
    # git grep returns exit code 1 when no matches found (that is the success case here)
    assert result.returncode != 0, (
        f"Found data/dbt references in production files: {result.stdout.strip()}"
    )
    assert result.stdout == "", (
        f"Unexpected output from git grep: {result.stdout.strip()}"
    )
