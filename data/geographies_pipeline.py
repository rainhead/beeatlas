"""Load geographic boundary data into DuckDB for spatial annotation.

Sources:
- EPA Level III Ecoregions (North America): CEC / EPA
  https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/cec_na/NA_CEC_Eco_Level3.zip
- US States: US Census Bureau TIGER 2024
  https://www2.census.gov/geo/tiger/TIGER2024/STATE/tl_2024_us_state.zip
- US Counties: US Census Bureau TIGER 2024
  https://www2.census.gov/geo/tiger/TIGER2024/COUNTY/tl_2024_us_county.zip
- Canadian Provinces/Territories: Statistics Canada 2021 Census
  https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lpr_000b21a_e.zip
- Canadian Census Divisions (county equivalent): Statistics Canada 2021 Census
  https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lcd_000b21a_e.zip
"""

import os
import zipfile
from pathlib import Path

import duckdb
import requests

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))

CACHE_DIR = Path(os.environ.get('GEOGRAPHY_CACHE_DIR', '.geography_cache'))

SOURCES = {
    "ecoregions": "https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/cec_na/NA_CEC_Eco_Level3.zip",
    "us_states": "https://www2.census.gov/geo/tiger/TIGER2024/STATE/tl_2024_us_state.zip",
    "us_counties": "https://www2.census.gov/geo/tiger/TIGER2024/COUNTY/tl_2024_us_county.zip",
    "ca_provinces": "https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lpr_000b21a_e.zip",
    "ca_census_divisions": "https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lcd_000b21a_e.zip",
}


def _download(name: str, url: str) -> Path:
    """Download a zip to cache, resuming a partial download if present."""
    CACHE_DIR.mkdir(exist_ok=True)
    dest = CACHE_DIR / f"{name}.zip"
    if dest.exists():
        print(f"  Using cached {dest}")  # noqa: T201
        return dest

    tmp = dest.with_suffix(".tmp")
    existing_size = tmp.stat().st_size if tmp.exists() else 0

    headers = {"Range": f"bytes={existing_size}-"} if existing_size else {}
    resp = requests.get(url, headers=headers, stream=True, timeout=30)

    if resp.status_code == 206:
        mode, start = "ab", existing_size
        print(f"  Resuming {name} from {existing_size / 1024**2:.1f} MB...")  # noqa: T201
    elif resp.status_code == 200:
        mode, start = "wb", 0
        print(f"  Downloading {name} from {url} ...")  # noqa: T201
    else:
        resp.raise_for_status()

    total = start + int(resp.headers.get("Content-Length", 0))
    downloaded = start
    with open(tmp, mode) as f:
        for chunk in resp.iter_content(chunk_size=1024 * 1024):
            f.write(chunk)
            downloaded += len(chunk)
            if total:
                print(f"\r  {name}: {downloaded / 1024**2:.0f} / {total / 1024**2:.0f} MB", end="", flush=True)  # noqa: T201
    print()  # noqa: T201

    tmp.rename(dest)
    return dest


def _read_prj(zip_path: Path, shp_stem: str) -> str:
    """Read the WKT CRS definition from a shapefile's .prj file inside a zip."""
    with zipfile.ZipFile(zip_path) as zf:
        return zf.read(f"{shp_stem}.prj").decode().strip()


def load_geographies() -> None:
    con = duckdb.connect(DB_PATH)
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("CREATE SCHEMA IF NOT EXISTS geographies")

    # --- ecoregions (projected CRS, needs ST_Transform to WGS84) ---
    path = _download("ecoregions", SOURCES["ecoregions"])
    print("  Loading ecoregions...")  # noqa: T201
    prj_wkt = _read_prj(path, "NA_CEC_Eco_Level3")
    con.execute("""
        CREATE OR REPLACE TABLE geographies.ecoregions AS
        SELECT
            NA_L3NAME AS name,
            NA_L2NAME AS level2_name,
            NA_L1NAME AS level1_name,
            ST_Transform(geom, ?, 'EPSG:4326', true) AS geom
        FROM ST_Read(?)
    """, [prj_wkt, f"/vsizip/{path}/NA_CEC_Eco_Level3.shp"])
    print("  ecoregions: done")  # noqa: T201

    # --- us_states (geographic NAD83, no transform needed) ---
    path = _download("us_states", SOURCES["us_states"])
    print("  Loading us_states...")  # noqa: T201
    con.execute("""
        CREATE OR REPLACE TABLE geographies.us_states AS
        SELECT STATEFP AS fips, NAME AS name, STUSPS AS abbreviation, geom
        FROM ST_Read(?)
    """, [f"/vsizip/{path}/tl_2024_us_state.shp"])
    print("  us_states: done")  # noqa: T201

    # --- us_counties (geographic NAD83, no transform needed) ---
    path = _download("us_counties", SOURCES["us_counties"])
    print("  Loading us_counties...")  # noqa: T201
    con.execute("""
        CREATE OR REPLACE TABLE geographies.us_counties AS
        SELECT GEOID AS geoid, NAME AS name, STATEFP AS state_fips, geom
        FROM ST_Read(?)
    """, [f"/vsizip/{path}/tl_2024_us_county.shp"])
    print("  us_counties: done")  # noqa: T201

    # --- ca_provinces (Stats Canada Lambert, needs ST_Transform to WGS84) ---
    path = _download("ca_provinces", SOURCES["ca_provinces"])
    print("  Loading ca_provinces...")  # noqa: T201
    prj_wkt = _read_prj(path, "lpr_000b21a_e")
    con.execute("""
        CREATE OR REPLACE TABLE geographies.ca_provinces AS
        SELECT PRUID AS pruid, PRENAME AS name, PREABBR AS abbreviation,
               ST_Transform(geom, ?, 'EPSG:4326', true) AS geom
        FROM ST_Read(?)
    """, [prj_wkt, f"/vsizip/{path}/lpr_000b21a_e.shp"])
    print("  ca_provinces: done")  # noqa: T201

    # --- ca_census_divisions (Stats Canada Lambert, needs ST_Transform to WGS84) ---
    path = _download("ca_census_divisions", SOURCES["ca_census_divisions"])
    print("  Loading ca_census_divisions...")  # noqa: T201
    prj_wkt = _read_prj(path, "lcd_000b21a_e")
    con.execute("""
        CREATE OR REPLACE TABLE geographies.ca_census_divisions AS
        SELECT CDUID AS cduid, CDNAME AS name, CDTYPE AS division_type, PRUID AS pruid,
               ST_Transform(geom, ?, 'EPSG:4326', true) AS geom
        FROM ST_Read(?)
    """, [prj_wkt, f"/vsizip/{path}/lcd_000b21a_e.shp"])
    print("  ca_census_divisions: done")  # noqa: T201

    con.close()


if __name__ == "__main__":
    load_geographies()
