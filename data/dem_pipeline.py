"""Download and cache USGS 3DEP 1/3 arc-second DEM for Washington state.

Sources:
- USGS 3DEP 10m DEM via seamless-3dep (hyriver): https://pypi.org/project/seamless-3dep/
"""

# Note: seamless_3dep.get_dem() uses `res=10` (integer, not "10m" string).
# API signature: get_dem(bbox, save_dir, res=10, pixel_max=8000000) -> list[Path]

import shutil
from pathlib import Path

import rasterio
import seamless_3dep as s3dep
from rasterio.merge import merge

WA_BBOX = (-124.85, 45.54, -116.92, 49.00)  # (west, south, east, north)
_DEM_FILENAME = "wa_3dep_10m.tif"


def ensure_dem(cache_dir: Path | str) -> Path:
    """Download and cache the WA 3DEP DEM. Returns path to merged GeoTIFF."""
    raise NotImplementedError


def sample_elevation(
    lons: list[float],
    lats: list[float],
    dem_path: Path | str,
) -> list[int | None]:
    """Sample elevation at each (lon, lat) coordinate from a GeoTIFF.

    Returns integer meters for in-bounds coordinates, None for out-of-bounds
    or nodata pixels. Nodata sentinel is read from dataset.nodata (not hardcoded).
    """
    raise NotImplementedError


if __name__ == "__main__":
    result = ensure_dem(Path("_dem_cache"))
    print(result)  # noqa: T201
