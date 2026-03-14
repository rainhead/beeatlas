"""
Tests for data/spatial.py and data/scripts/build-geojson.py

Run from data/ directory:
  uv run pytest tests/test_spatial.py

All tests in this file are intentionally RED until Phase 16 implementations exist.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch, MagicMock

import pandas as pd
import geopandas as gpd  # type: ignore
import pytest
from shapely.geometry import Point, Polygon  # type: ignore


# ── Fixtures ──────────────────────────────────────────────────────────────────

def make_county_gdf(name: str = "TestCounty", bounds: tuple = (0.0, 0.0, 1.0, 1.0)) -> gpd.GeoDataFrame:
    """Create a minimal county GeoDataFrame with a single rectangular polygon."""
    minx, miny, maxx, maxy = bounds
    polygon = Polygon([
        (minx, miny), (maxx, miny), (maxx, maxy), (minx, maxy), (minx, miny)
    ])
    return gpd.GeoDataFrame(
        {"NAME": [name]},
        geometry=[polygon],
        crs="EPSG:4326",
    )


def make_ecoregion_gdf(name: str = "Cascades", bounds: tuple = (0.0, 0.0, 1.0, 1.0)) -> gpd.GeoDataFrame:
    """Create a minimal ecoregion GeoDataFrame with a single rectangular polygon."""
    minx, miny, maxx, maxy = bounds
    polygon = Polygon([
        (minx, miny), (maxx, miny), (maxx, maxy), (minx, maxy), (minx, miny)
    ])
    return gpd.GeoDataFrame(
        {"NA_L3NAME": [name]},
        geometry=[polygon],
        crs="EPSG:4326",
    )


def make_sample_df(lon: float = 0.5, lat: float = 0.5, n: int = 1) -> pd.DataFrame:
    """Create a minimal specimens-style DataFrame with longitude/latitude columns."""
    return pd.DataFrame({
        "longitude": [lon] * n,
        "latitude": [lat] * n,
        "some_value": range(n),
    })


def make_inat_df(lon: float = 0.5, lat: float = 0.5, n: int = 1) -> pd.DataFrame:
    """Create a minimal iNat-style DataFrame with lon/lat columns."""
    return pd.DataFrame({
        "lon": [lon] * n,
        "lat": [lat] * n,
        "observation_id": range(1, n + 1),
    })


# ── TestAddRegionColumns ─────────────────────────────────────────────────────

class TestAddRegionColumns:
    """Unit tests for spatial.add_region_columns using synthetic GeoDataFrames."""

    def test_adds_county_column(self):
        """add_region_columns returns DataFrame with 'county' column containing correct county name."""
        from spatial import add_region_columns  # type: ignore

        df = make_sample_df(lon=0.5, lat=0.5)
        counties_gdf = make_county_gdf(name="KingTest")
        ecoregions_gdf = make_ecoregion_gdf(name="CascadesTest")

        result = add_region_columns(df, counties_gdf, ecoregions_gdf)

        assert "county" in result.columns
        assert result["county"].iloc[0] == "KingTest"

    def test_adds_ecoregion_column(self):
        """add_region_columns returns DataFrame with 'ecoregion_l3' column containing correct name."""
        from spatial import add_region_columns  # type: ignore

        df = make_sample_df(lon=0.5, lat=0.5)
        counties_gdf = make_county_gdf(name="KingTest")
        ecoregions_gdf = make_ecoregion_gdf(name="CascadesTest")

        result = add_region_columns(df, counties_gdf, ecoregions_gdf)

        assert "ecoregion_l3" in result.columns
        assert result["ecoregion_l3"].iloc[0] == "CascadesTest"

    def test_handles_inat_lat_lon_columns(self):
        """DataFrame with 'lat'/'lon' column names (iNat format) is handled correctly."""
        from spatial import add_region_columns  # type: ignore

        df = make_inat_df(lon=0.5, lat=0.5)
        counties_gdf = make_county_gdf(name="KingTest")
        ecoregions_gdf = make_ecoregion_gdf(name="CascadesTest")

        result = add_region_columns(df, counties_gdf, ecoregions_gdf)

        assert "county" in result.columns
        assert "ecoregion_l3" in result.columns
        assert result["county"].iloc[0] == "KingTest"
        assert result["ecoregion_l3"].iloc[0] == "CascadesTest"


# ── TestNearestFallback ───────────────────────────────────────────────────────

class TestNearestFallback:
    """Tests that points outside polygon boundaries get non-null results via nearest fallback."""

    def test_point_outside_polygon_gets_nearest(self):
        """A point clearly outside all mock polygons still gets a non-null county value."""
        from spatial import add_region_columns  # type: ignore

        # Polygon covers (0,0)-(1,1); point at (1.5, 1.5) is clearly outside
        df = make_sample_df(lon=1.5, lat=1.5)
        counties_gdf = make_county_gdf(name="NearestCounty", bounds=(0.0, 0.0, 1.0, 1.0))
        ecoregions_gdf = make_ecoregion_gdf(name="NearestRegion", bounds=(0.0, 0.0, 1.0, 1.0))

        result = add_region_columns(df, counties_gdf, ecoregions_gdf)

        assert "county" in result.columns
        assert result["county"].iloc[0] == "NearestCounty"

    def test_no_nulls_in_output(self):
        """After add_region_columns, county column has zero null values even when some points fall outside."""
        from spatial import add_region_columns  # type: ignore

        # Mix of inside and outside points
        df = pd.DataFrame({
            "longitude": [0.5, 1.5, 0.3, 2.0],
            "latitude":  [0.5, 1.5, 0.7, 0.1],
            "id": range(4),
        })
        counties_gdf = make_county_gdf(name="OnlyCounty", bounds=(0.0, 0.0, 1.0, 1.0))
        ecoregions_gdf = make_ecoregion_gdf(name="OnlyRegion", bounds=(0.0, 0.0, 1.0, 1.0))

        result = add_region_columns(df, counties_gdf, ecoregions_gdf)

        assert result["county"].isna().sum() == 0
        assert result["ecoregion_l3"].isna().sum() == 0


# ── TestInatIntegration ───────────────────────────────────────────────────────

class TestInatIntegration:
    """Integration tests: main() in inat/download.py produces parquet with county + ecoregion_l3."""

    def test_main_output_has_county_ecoregion(self, tmp_path):
        """Calling main() (with mocked fetch and boundary GDFs) produces samples.parquet
        with 'county' and 'ecoregion_l3' columns present and non-null."""
        import inat.download as dl  # type: ignore

        # Two synthetic observations inside our mock polygon bounds (0,0)-(1,1)
        results = [
            {"id": 1, "user": {"login": "u1"}, "observed_on": "2024-01-01",
             "location": [0.3, 0.4], "ofvs": []},
            {"id": 2, "user": {"login": "u2"}, "observed_on": "2024-01-02",
             "location": [0.6, 0.7], "ofvs": []},
        ]

        ndjson_path = tmp_path / "observations.ndjson"
        samples_path = tmp_path / "samples.parquet"
        last_fetch_path = tmp_path / "last_fetch.txt"

        original_ndjson = dl.NDJSON_PATH
        original_samples = dl.SAMPLES_PATH
        original_last_fetch = dl.LAST_FETCH_PATH

        dl.NDJSON_PATH = ndjson_path
        dl.SAMPLES_PATH = samples_path
        dl.LAST_FETCH_PATH = last_fetch_path

        mock_counties = make_county_gdf(name="MockCounty", bounds=(0.0, 0.0, 1.0, 1.0))
        mock_ecoregions = make_ecoregion_gdf(name="MockRegion", bounds=(0.0, 0.0, 1.0, 1.0))

        try:
            with patch("inat.download.fetch_all", return_value=results), \
                 patch("inat.download.load_boundaries", return_value=(mock_counties, mock_ecoregions)):
                dl.main()
        finally:
            dl.NDJSON_PATH = original_ndjson
            dl.SAMPLES_PATH = original_samples
            dl.LAST_FETCH_PATH = original_last_fetch

        assert samples_path.exists(), "samples.parquet was not written"
        df = pd.read_parquet(samples_path, engine="pyarrow")

        assert "county" in df.columns, "county column missing from samples.parquet"
        assert "ecoregion_l3" in df.columns, "ecoregion_l3 column missing from samples.parquet"
        assert df["county"].isna().sum() == 0, "Null values found in county column"
        assert df["ecoregion_l3"].isna().sum() == 0, "Null values found in ecoregion_l3 column"


# ── TestGeoJSONGeneration ─────────────────────────────────────────────────────

class TestGeoJSONGeneration:
    """Tests for scripts/build-geojson.py GeoJSON output properties and size."""

    def test_ecoregion_geojson_has_na_l3name_property(self, tmp_path):
        """Generated ecoregion GeoJSON features have 'NA_L3NAME' property."""
        from scripts.build_geojson import build_ecoregion_geojson  # type: ignore

        mock_eco_gdf = make_ecoregion_gdf(name="Cascades", bounds=(-124.0, 45.5, -116.0, 49.5))

        out_path = tmp_path / "epa_l3_ecoregions_wa.geojson"

        with patch("scripts.build_geojson.load_ecoregion_gdf", return_value=mock_eco_gdf):
            build_ecoregion_geojson(out_path=out_path)

        assert out_path.exists(), "Ecoregion GeoJSON file was not created"
        data = json.loads(out_path.read_text())
        assert data["type"] == "FeatureCollection"
        assert len(data["features"]) > 0
        feature = data["features"][0]
        assert "NA_L3NAME" in feature["properties"], \
            f"NA_L3NAME not in feature properties: {list(feature['properties'].keys())}"

    def test_county_geojson_has_name_property(self, tmp_path):
        """Generated county GeoJSON features have 'NAME' property."""
        from scripts.build_geojson import build_county_geojson  # type: ignore

        mock_county_gdf = make_county_gdf(name="King", bounds=(-123.0, 47.0, -121.0, 48.0))

        out_path = tmp_path / "wa_counties.geojson"

        with patch("scripts.build_geojson.load_county_gdf", return_value=mock_county_gdf):
            build_county_geojson(out_path=out_path)

        assert out_path.exists(), "County GeoJSON file was not created"
        data = json.loads(out_path.read_text())
        assert data["type"] == "FeatureCollection"
        assert len(data["features"]) > 0
        feature = data["features"][0]
        assert "NAME" in feature["properties"], \
            f"NAME not in feature properties: {list(feature['properties'].keys())}"

    def test_geojson_files_under_400kb(self, tmp_path):
        """Generated GeoJSON files are under 400,000 bytes."""
        from scripts.build_geojson import build_ecoregion_geojson, build_county_geojson  # type: ignore

        # Use a somewhat complex mock GDF to exercise the size limit
        mock_eco_gdf = make_ecoregion_gdf(name="Cascades", bounds=(-124.0, 45.5, -116.0, 49.5))
        mock_county_gdf = make_county_gdf(name="King", bounds=(-123.0, 47.0, -121.0, 48.0))

        eco_out = tmp_path / "epa_l3_ecoregions_wa.geojson"
        county_out = tmp_path / "wa_counties.geojson"

        with patch("scripts.build_geojson.load_ecoregion_gdf", return_value=mock_eco_gdf):
            build_ecoregion_geojson(out_path=eco_out)

        with patch("scripts.build_geojson.load_county_gdf", return_value=mock_county_gdf):
            build_county_geojson(out_path=county_out)

        eco_size = eco_out.stat().st_size
        county_size = county_out.stat().st_size

        assert eco_size < 400_000, f"Ecoregion GeoJSON is {eco_size} bytes (>= 400KB limit)"
        assert county_size < 400_000, f"County GeoJSON is {county_size} bytes (>= 400KB limit)"
