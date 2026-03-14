"""Generate simplified WA county and EPA Level III ecoregion GeoJSON files.

Outputs are written to frontend/src/assets/ for bundling with the frontend build.
Downloads source files only if not already present.

Usage:
    cd data/
    uv run python scripts/build_geojson.py
"""
import urllib.request
from pathlib import Path

import geopandas as gpd

DATA_DIR = Path(__file__).parent.parent  # data/
ASSETS_DIR = DATA_DIR.parent / 'frontend' / 'src' / 'assets'

WA_BBOX = (-125.0, 45.5, -116.9, 49.1)  # minx, miny, maxx, maxy
ECO_ZIP = DATA_DIR / 'NA_CEC_Eco_Level3.zip'
TIGER_ZIP = DATA_DIR / 'tl_2024_us_county.zip'

TIGER_URL = 'https://www2.census.gov/geo/tiger/TIGER2024/COUNTY/tl_2024_us_county.zip'
ECO_URL = 'https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/cec_na/NA_CEC_Eco_Level3.zip'

SIMPLIFY_TOLERANCE = 0.006  # degrees; 0.005 produces 404 KB (over limit); 0.006 produces ~357 KB


def load_ecoregion_gdf() -> gpd.GeoDataFrame:
    """Download (if needed) and return WA-filtered ecoregion GeoDataFrame in EPSG:4326."""
    if not ECO_ZIP.exists():
        print(f'  Downloading ecoregion boundaries from {ECO_URL} ...')
        urllib.request.urlretrieve(ECO_URL, ECO_ZIP)
        print(f'  Downloaded to {ECO_ZIP}')
    else:
        print(f'  Using existing {ECO_ZIP}')

    gdf = gpd.read_file(f'zip://{ECO_ZIP}!NA_CEC_Eco_Level3.shp')
    # Source CRS is non-EPSG spherical Lambert AEA — must convert before any spatial work
    gdf = gdf.to_crs('EPSG:4326')
    # Filter to WA bounding box
    gdf_wa = gdf.cx[WA_BBOX[0]:WA_BBOX[2], WA_BBOX[1]:WA_BBOX[3]]
    return gdf_wa[['NA_L3NAME', 'geometry']].copy()


def load_county_gdf() -> gpd.GeoDataFrame:
    """Download (if needed) and return WA county GeoDataFrame in EPSG:4326."""
    if not TIGER_ZIP.exists():
        print(f'  Downloading TIGER county boundaries from {TIGER_URL} ...')
        urllib.request.urlretrieve(TIGER_URL, TIGER_ZIP)
        print(f'  Downloaded to {TIGER_ZIP}')
    else:
        print(f'  Using existing {TIGER_ZIP}')

    gdf = gpd.read_file(f'zip://{TIGER_ZIP}')
    wa = gdf[gdf['STATEFP'] == '53'].copy()
    wa = wa.to_crs('EPSG:4326')
    return wa[['NAME', 'geometry']].copy()


def build_ecoregion_geojson(out_path: Path | None = None) -> Path:
    """Generate simplified ecoregion GeoJSON for WA.

    Args:
        out_path: Output file path. Defaults to ASSETS_DIR/epa_l3_ecoregions_wa.geojson.

    Returns:
        Path to the written GeoJSON file.
    """
    if out_path is None:
        ASSETS_DIR.mkdir(parents=True, exist_ok=True)
        out_path = ASSETS_DIR / 'epa_l3_ecoregions_wa.geojson'
    else:
        out_path.parent.mkdir(parents=True, exist_ok=True)

    gdf_wa = load_ecoregion_gdf()
    gdf_wa = gdf_wa.copy()
    gdf_wa['geometry'] = gdf_wa['geometry'].simplify(SIMPLIFY_TOLERANCE)
    gdf_wa.to_file(out_path, driver='GeoJSON')
    return out_path


def build_county_geojson(out_path: Path | None = None) -> Path:
    """Generate simplified WA county GeoJSON.

    Args:
        out_path: Output file path. Defaults to ASSETS_DIR/wa_counties.geojson.

    Returns:
        Path to the written GeoJSON file.
    """
    if out_path is None:
        ASSETS_DIR.mkdir(parents=True, exist_ok=True)
        out_path = ASSETS_DIR / 'wa_counties.geojson'
    else:
        out_path.parent.mkdir(parents=True, exist_ok=True)

    wa = load_county_gdf()
    wa = wa.copy()
    wa['geometry'] = wa['geometry'].simplify(SIMPLIFY_TOLERANCE)
    wa.to_file(out_path, driver='GeoJSON')
    return out_path


if __name__ == '__main__':
    print('--- Generating WA county GeoJSON ---')
    county_path = build_county_geojson()
    county_size = county_path.stat().st_size
    print(f'  Written: {county_path} ({county_size / 1024:.1f} KB)')

    print('--- Generating EPA L3 ecoregion GeoJSON ---')
    eco_path = build_ecoregion_geojson()
    eco_size = eco_path.stat().st_size
    print(f'  Written: {eco_path} ({eco_size / 1024:.1f} KB)')
