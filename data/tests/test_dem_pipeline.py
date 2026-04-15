"""Unit tests for dem_pipeline functions.

Tests ensure_dem (cache hit path only) and sample_elevation using a synthetic
2x2 GeoTIFF fixture. No network requests are made.
"""

from dem_pipeline import ensure_dem, sample_elevation


# ---------------------------------------------------------------------------
# ensure_dem tests
# ---------------------------------------------------------------------------

def test_ensure_dem_caches(tmp_path):
    """ensure_dem returns existing file without re-downloading."""
    cache_dir = tmp_path / "dem_cache"
    cache_dir.mkdir()
    fake_tif = cache_dir / "wa_3dep_10m.tif"
    fake_tif.write_bytes(b"fake")
    result = ensure_dem(cache_dir)
    assert result == fake_tif


# ---------------------------------------------------------------------------
# sample_elevation tests
# ---------------------------------------------------------------------------

def test_sample_elevation_inbounds(dem_fixture):
    """In-bounds coordinate returns an integer elevation."""
    # Center of top-left pixel (500m): lon ~ -120.75, lat ~ 47.75
    result = sample_elevation([-120.75], [47.75], dem_fixture)
    assert len(result) == 1
    assert isinstance(result[0], int)
    assert result[0] == 500


def test_sample_elevation_nodata(dem_fixture):
    """Coordinate hitting nodata pixel returns None."""
    # Center of bottom-right pixel (nodata): lon ~ -120.25, lat ~ 47.25
    result = sample_elevation([-120.25], [47.25], dem_fixture)
    assert result == [None]


def test_sample_elevation_oob(dem_fixture):
    """Coordinate outside DEM bounds returns None."""
    result = sample_elevation([-130.0], [50.0], dem_fixture)
    assert result == [None]


def test_nodata_from_file(tmp_path):
    """Nodata sentinel is read from file metadata, not hardcoded."""
    import numpy as np
    import rasterio
    from rasterio.transform import from_bounds
    path = tmp_path / "alt_nodata.tif"
    nodata_val = -32768.0
    transform = from_bounds(-121.0, 47.0, -120.0, 48.0, width=2, height=2)
    data = np.array([[100.0, nodata_val], [200.0, 300.0]], dtype=np.float32)
    with rasterio.open(path, "w", driver="GTiff", height=2, width=2, count=1,
                       dtype=np.float32, crs="EPSG:4326", transform=transform,
                       nodata=nodata_val) as dst:
        dst.write(data, 1)
    # The pixel at (-120.75, 47.75) should be nodata (-32768) → None
    result = sample_elevation([-120.75], [47.75], path)
    assert result == [None]
