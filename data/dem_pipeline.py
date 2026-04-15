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
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    dem_path = cache_dir / _DEM_FILENAME

    if dem_path.exists():
        print(f"  Using cached {dem_path}")  # noqa: T201
        return dem_path

    tile_dir = cache_dir / "_tiles"
    tile_dir.mkdir(exist_ok=True)

    print(f"  Downloading WA 3DEP tiles to {tile_dir} ...")  # noqa: T201
    tile_paths = s3dep.get_dem(WA_BBOX, tile_dir, res=10)

    if len(tile_paths) == 1:
        shutil.copy(tile_paths[0], dem_path)
    else:
        print(f"  Merging {len(tile_paths)} tile(s) into {dem_path} ...")  # noqa: T201
        datasets = [rasterio.open(p) for p in tile_paths]
        mosaic, transform = merge(datasets)
        meta = datasets[0].meta.copy()
        meta.update({
            "driver": "GTiff",
            "height": mosaic.shape[1],
            "width": mosaic.shape[2],
            "transform": transform,
        })
        for ds in datasets:
            ds.close()
        with rasterio.open(dem_path, "w", **meta) as dest:
            dest.write(mosaic)

    return dem_path


def sample_elevation(
    lons: list[float],
    lats: list[float],
    dem_path: Path | str,
) -> list[int | None]:
    """Sample elevation at each (lon, lat) coordinate from a GeoTIFF.

    Returns integer meters for in-bounds coordinates, None for out-of-bounds
    or nodata pixels. Nodata sentinel is read from dataset.nodata (not hardcoded).
    """
    with rasterio.open(dem_path) as dataset:
        nodata = dataset.nodata
        results: list[int | None] = []
        for pixel in dataset.sample(zip(lons, lats)):
            value = pixel[0]
            if nodata is not None and value == nodata:
                results.append(None)
            else:
                results.append(int(round(float(value))))
    return results


if __name__ == "__main__":
    result = ensure_dem(Path("_dem_cache"))
    print(result)  # noqa: T201
