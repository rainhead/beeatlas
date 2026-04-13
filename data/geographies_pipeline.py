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
from pathlib import Path
from typing import Iterator

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))

import dlt
import geopandas as gpd
import requests

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


def _to_wkt_rows(gdf: gpd.GeoDataFrame, columns: dict[str, str], simplify_tolerance: float = 0.01) -> Iterator[dict]:
    """Yield dicts with renamed columns plus a WKT geometry field.

    simplify_tolerance: degrees (default 0.01 ≈ 1 km). Dramatically reduces WKT
    size for high-resolution source data (e.g. Stats Canada full-detail coastlines)
    with no visible difference at regional map zoom levels.
    """
    gdf = gdf[list(columns.keys()) + ["geometry"]].copy()
    gdf = gdf.to_crs("EPSG:4326")
    gdf["geometry"] = gdf["geometry"].simplify(simplify_tolerance, preserve_topology=True)
    for _, row in gdf.iterrows():
        record = {new: row[old] for old, new in columns.items()}
        record["geometry_wkt"] = row["geometry"].wkt if row["geometry"] else None
        yield record


@dlt.source(name="geographies")
def geographies_source() -> Iterator:
    @dlt.resource(name="ecoregions", primary_key="name", write_disposition="replace")
    def ecoregions() -> Iterator:
        path = _download("ecoregions", SOURCES["ecoregions"])
        print("  Reading ecoregions shapefile...")  # noqa: T201
        gdf = gpd.read_file(f"zip://{path}!NA_CEC_Eco_Level3.shp")
        print(f"  Loaded {len(gdf)} ecoregion polygons")  # noqa: T201
        yield from _to_wkt_rows(gdf, {"NA_L3NAME": "name", "NA_L2NAME": "level2_name", "NA_L1NAME": "level1_name"})

    @dlt.resource(name="us_states", primary_key="fips", write_disposition="replace")
    def us_states() -> Iterator:
        path = _download("us_states", SOURCES["us_states"])
        print("  Reading US states shapefile...")  # noqa: T201
        gdf = gpd.read_file(f"zip://{path}")
        print(f"  Loaded {len(gdf)} states")  # noqa: T201
        yield from _to_wkt_rows(gdf, {"STATEFP": "fips", "NAME": "name", "STUSPS": "abbreviation"})

    @dlt.resource(name="us_counties", primary_key="geoid", write_disposition="replace")
    def us_counties() -> Iterator:
        path = _download("us_counties", SOURCES["us_counties"])
        print("  Reading US counties shapefile...")  # noqa: T201
        gdf = gpd.read_file(f"zip://{path}")
        print(f"  Loaded {len(gdf)} counties")  # noqa: T201
        yield from _to_wkt_rows(gdf, {"GEOID": "geoid", "NAME": "name", "STATEFP": "state_fips"})

    @dlt.resource(name="ca_provinces", primary_key="pruid", write_disposition="replace")
    def ca_provinces() -> Iterator:
        path = _download("ca_provinces", SOURCES["ca_provinces"])
        print("  Reading Canadian provinces shapefile...")  # noqa: T201
        gdf = gpd.read_file(f"zip://{path}")
        print(f"  Loaded {len(gdf)} provinces/territories")  # noqa: T201
        yield from _to_wkt_rows(gdf, {"PRUID": "pruid", "PRENAME": "name", "PREABBR": "abbreviation"})

    @dlt.resource(name="ca_census_divisions", primary_key="cduid", write_disposition="replace")
    def ca_census_divisions() -> Iterator:
        path = _download("ca_census_divisions", SOURCES["ca_census_divisions"])
        print("  Reading Canadian census divisions shapefile...")  # noqa: T201
        gdf = gpd.read_file(f"zip://{path}")
        print(f"  Loaded {len(gdf)} census divisions")  # noqa: T201
        yield from _to_wkt_rows(gdf, {"CDUID": "cduid", "CDNAME": "name", "CDTYPE": "division_type", "PRUID": "pruid"})

    yield ecoregions()
    yield us_states()
    yield us_counties()
    yield ca_provinces()
    yield ca_census_divisions()


def load_geographies() -> None:
    pipeline = dlt.pipeline(
        pipeline_name="geographies",
        destination=dlt.destinations.duckdb(
            DB_PATH,
            create_indexes=False,
        ),
        dataset_name="geographies",
    )
    # Run each resource separately to avoid buffering all datasets in memory at once.
    for resource in geographies_source().resources.values():
        load_info = pipeline.run(resource)
        print(load_info)  # noqa: T201
        load_info.raise_on_failed_jobs()


if __name__ == "__main__":
    load_geographies()
