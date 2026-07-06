"""Load geographic boundary data into DuckDB for spatial annotation.

Sources:
- EPA Level III Ecoregions (North America): CEC / EPA
  https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/cec_na/NA_CEC_Eco_Level3.zip
- US States: US Census Bureau TIGER 2024
  https://www2.census.gov/geo/tiger/TIGER2024/STATE/tl_2024_us_state.zip
- US Counties: US Census Bureau Cartographic Boundary 2024 (1:500k)
  https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_county_500k.zip
  (Cartographic Boundary — topology-clean, unlike the tl_ TIGER file which has
  ~190 km² of inter-county overlaps in WA. Started on 1:5M (cb_5m) but it
  generalized small islands so aggressively that Vashon lost ~25% of its area;
  bumped to 1:500k. See quick task 260514-fp3 / issue #14.)
- Canadian Provinces/Territories: Statistics Canada 2021 Census
  https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lpr_000b21a_e.zip
- Canadian Census Divisions (county equivalent): Statistics Canada 2021 Census
  https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lcd_000b21a_e.zip
"""

import os
import sys
import zipfile
from pathlib import Path

import duckdb
import requests

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))

CACHE_DIR = Path(os.environ.get('GEOGRAPHY_CACHE_DIR', '.geography_cache'))

# --- PAD-US (Protected Areas Database of the US) 4.1 ---------------------------
# Source for the wilderness no-collect overlay (beeatlas-2vj). The National
# Wilderness Preservation System polygons live in PAD-US's *Designation* feature
# class (Des_Tp = 'WA' = "Wilderness Area"). PAD-US is distributed as per-state
# File Geodatabase downloads from ScienceBase; unlike the Census/EPA sources
# below it is addressed by item-id + filename, so the URL is built from a state
# code. Add codes here as BeeAtlas expands beyond WA (project_multi_state_expansion).
#
# Loaded on demand — this is a ~260 MB/state download and wilderness boundaries
# change rarely, so it is NOT part of the default `load_geographies()` run.
# Refresh with: uv run python geographies_pipeline.py wilderness
PADUS_ITEM = "6759abcfd34edfeb8710a004"  # ScienceBase "PAD-US 4.1 State Downloads"
PADUS_STATES = ("WA",)
# Feature-class layer inside each state GDB that carries congressional
# designations (Wilderness Areas, National Monuments, …). PAD-US 4.1 names it
# `PADUS4_1Designation`. If a future PAD-US release renames it, the ST_Read call
# below fails loudly — run `ogrinfo <gdb>` to find the new layer name.
PADUS_DESIGNATION_LAYER = "PADUS4_1Designation"

SOURCES = {
    "ecoregions": "https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/cec_na/NA_CEC_Eco_Level3.zip",
    "us_states": "https://www2.census.gov/geo/tiger/TIGER2024/STATE/tl_2024_us_state.zip",
    "us_counties": "https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_county_500k.zip",
    "ca_provinces": "https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lpr_000b21a_e.zip",
    "ca_census_divisions": "https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lcd_000b21a_e.zip",
}


def _download(name: str, url: str) -> Path:
    """Download a zip to cache, resuming a partial download if present.

    Cache invalidates when the source URL changes. A sidecar `.url` file
    records the URL that produced the cached zip; if it doesn't match the
    current SOURCES entry, the cache is discarded and re-downloaded. This
    prevents stale caches from masking source swaps (#14 fp3 — switching
    counties from cb_5m to cb_500k didn't invalidate the cached zip).
    """
    CACHE_DIR.mkdir(exist_ok=True)
    dest = CACHE_DIR / f"{name}.zip"
    url_marker = dest.with_suffix(".zip.url")
    if dest.exists():
        cached_url = url_marker.read_text().strip() if url_marker.exists() else None
        if cached_url == url:
            print(f"  Using cached {dest}")  # noqa: T201
            return dest
        was = cached_url or "(no .url sidecar — pre-#14-fp3 cache)"
        print(f"  Source URL changed for {name}; was {was}, now {url}. Re-downloading.")  # noqa: T201
        dest.unlink()

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
    url_marker.write_text(url)
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
    """, [f"/vsizip/{path}/cb_2024_us_county_500k.shp"])
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


def _padus_url(state: str) -> str:
    """ScienceBase name-addressable download URL for a state's PAD-US 4.1 GDB."""
    return (
        "https://www.sciencebase.gov/catalog/file/get/"
        f"{PADUS_ITEM}?name=PADUS4_1_State_{state}_GDB_KMZ.zip"
    )


def _gdb_dir_in_zip(zip_path: Path) -> str:
    """Return the `.gdb` directory name inside a PAD-US state zip.

    The archive bundles a File Geodatabase directory plus a KMZ; the GDB name is
    not fixed across releases, so discover it from the zip's entries rather than
    hard-coding it.
    """
    with zipfile.ZipFile(zip_path) as zf:
        for entry in zf.namelist():
            if ".gdb/" in entry:
                return entry[: entry.index(".gdb/") + len(".gdb")]
    raise FileNotFoundError(f"no .gdb directory found inside {zip_path}")


def load_padus_designations() -> None:
    """Load the PAD-US Designation feature class for each PADUS_STATES entry.

    Populates `geographies.padus_designations` (native PAD-US schema: Unit_Nm,
    Des_Tp, State_Nm, geom in WGS84). This is a faithful mirror of the source —
    the WA/Wilderness/Olympic filtering lives downstream in stg_geo__wilderness so
    the DAG edge is visible and the carve-out is contract-reviewable.

    PAD-US ships in USGS Albers; the source CRS WKT is read from the GDB via
    ST_Read_Meta and ST_Transform reprojects to EPSG:4326 (same pattern as the
    projected ecoregions/Statistics-Canada sources above).
    """
    con = duckdb.connect(DB_PATH)
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("CREATE SCHEMA IF NOT EXISTS geographies")
    con.execute("""
        CREATE OR REPLACE TABLE geographies.padus_designations (
            unit_name VARCHAR, des_tp VARCHAR, state_nm VARCHAR, geom GEOMETRY
        )
    """)

    for state in PADUS_STATES:
        path = _download(f"padus_{state}", _padus_url(state))
        gdb = _gdb_dir_in_zip(path)
        vsi = f"/vsizip/{path}/{gdb}"
        print(f"  Loading PAD-US designations for {state} from {gdb}...")  # noqa: T201
        # PAD-US ships in USGS Albers; read the source CRS from the GDB and
        # reproject to WGS84 (same pattern as ecoregions above). ST_Read_Meta
        # returns the CRS as a struct — prefer the full WKT, fall back to the
        # authority code (auth_name:auth_code) if a build leaves WKT empty.
        crs = con.execute(
            "SELECT layers[1].geometry_fields[1].crs FROM ST_Read_Meta(?)",
            [vsi],
        ).fetchone()[0]
        src_crs = crs.get("wkt") or f"{crs.get('auth_name')}:{crs.get('auth_code')}"
        con.execute(
            """
            INSERT INTO geographies.padus_designations
            SELECT Unit_Nm AS unit_name, Des_Tp AS des_tp, State_Nm AS state_nm,
                   ST_Transform(geom, ?, 'EPSG:4326', true) AS geom
            FROM ST_Read(?, layer=?)
            """,
            [src_crs, vsi, PADUS_DESIGNATION_LAYER],
        )
        print(f"  PAD-US {state}: done")  # noqa: T201

    con.close()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "wilderness":
        load_padus_designations()
    else:
        load_geographies()
