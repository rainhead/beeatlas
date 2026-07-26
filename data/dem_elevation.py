"""DEM elevation backfill — a derived elevation for every non-checklist coordinate.

`elevation_m` on the occurrences mart is RECORDED elevation, and it comes from
exactly one arm: Ecdysis's `minimum_elevation_in_meters`. The other four arms of
int_combined hardcode NULL, so the column is populated on ~45% of occurrences and
the gap is an entire-arm gap, not a random one. Every occurrence has coordinates,
so elevation can be derived from a digital elevation model instead.

This step maintains `dem_data.elevations`, a coordinate -> elevation lookup keyed
by (lat, lon) rounded to COORD_PRECISION. It is a CACHE: each run samples only the
coordinates it has never seen, so the first build pays for ~34k points (~30 s) and
a nightly pays for the handful of new observations. Rows are never re-sampled, so
a USGS outage degrades to "today's new coordinates have no DEM elevation yet",
never to "the whole lookup is gone".

TWO CONSTRAINTS, both load-bearing (beeatlas-sn8):

1. CHECKLIST COORDINATES ARE NOT SAMPLED. 31% of checklist rows (6,090 of 19,929)
   sit on 45 shared placeholder points — 683 King County rows are parked on a
   single coordinate in downtown Seattle. A DEM lookup there returns the elevation
   of that placeholder, not of anywhere a bee was found. It would be fabricated
   data wearing the same column name as measured data. `checklist_data` is
   therefore absent from _SEED_SOURCES, and marts/occurrences.sql refuses the join
   for record_type='checklist' as a second, independent guard.

2. DERIVED ELEVATION STAYS DISTINGUISHABLE FROM RECORDED ELEVATION. This lookup
   feeds `elevation_dem_m`, a column of its own — never a silent COALESCE into
   `elevation_m`. A DEM sample at a coordinate whose positional accuracy is up to
   100 m is uncertain in steep terrain in a way a collector's recorded elevation is
   not, and the consumer deserves to see which one it is holding.

SOURCE: USGS 3DEP 1 arc-second (~30 m) seamless DEM, public domain (USGS products
are not subject to copyright; 3DEP carries no redistribution restriction), served
as Cloud Optimized GeoTIFFs from the public `prd-tnm` bucket. Tiles are read
through GDAL's /vsicurl driver, which range-requests only the 512x512 blocks the
points actually fall in — so nothing downloads a 57 MB tile to read one pixel, and
no multi-GB raster ever enters the content-addressed graph.

WHY 1 ARC-SECOND AND NOT 1/3. Validated against the 6,094 distinct coordinates
that carry a recorded Ecdysis elevation: median |difference| 3 m, 88% within 10 m,
99.8% within 30 m, zero nodata. The residual is dominated by the recorded values'
own rounding, not by the DEM. 1/3 arc-second would triple the blocks fetched to
chase noise below that floor.
"""

import os
from pathlib import Path

import duckdb
import requests

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))

# 3DEP 1 arc-second COG tiles, one per 1x1 degree cell, named for their NW corner.
TILE_URL = (
    "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1/TIFF/current"
    "/{tile}/USGS_1_{tile}.tif"
)
DEM_SOURCE = "usgs_3dep_1as"

# Coordinate key precision. 1e-6 deg is ~0.1 m — far finer than the ~30 m DEM
# cell, so the key never aliases two genuinely different points together; it only
# stops float repr churn from minting new keys for an unchanged coordinate.
COORD_PRECISION = 6

# 3DEP's nodata is -999999.0; anything below this floor is not a real elevation.
_NODATA_FLOOR = -1000.0

# Per-coordinate outcomes. Recorded so a coordinate outside 3DEP coverage (an
# occurrence in British Columbia, a point offshore) is asked once and then left
# alone, rather than re-requested on every nightly forever.
STATUS_OK = "ok"
STATUS_NODATA = "nodata"  # tile exists, but the cell is void
STATUS_NO_TILE = "no_tile"  # no 3DEP tile covers this degree cell

# The seed relations: every SOURCE table that feeds a non-checklist arm of
# int_combined. Deliberately NOT dbt marts — marts/occurrences.sql consumes this
# lookup, so seeding from a mart would be a cycle. checklist_data is deliberately
# absent (constraint 1 above).
# Each entry is (schema, table, lat_column, lon_column). Traced from int_combined's
# arms back to the relation the coordinate is actually READ from, which is not
# always the obvious one:
_SEED_SOURCES = (
    # ARM 1 (specimen) — e.ecdysis_lat via int_ecdysis_base
    ("ecdysis_data", "occurrences", "decimal_latitude", "decimal_longitude"),
    # ARM 1's COALESCE fallback (s.sample_lat, when the Ecdysis coordinate is
    # NULL) AND all of ARM 2 (provisional_sample) — both reach
    # inaturalist_data.observations through stg_inat__observations, NOT through
    # the WABA schema below.
    ("inaturalist_data", "observations", "latitude", "longitude"),
    # ARM 3 (waba_specimen) — sob.latitude via int_specimen_obs_base
    ("inaturalist_waba_data", "observations", "latitude", "longitude"),
    # ARM 4 (inat_expert)
    ("inat_obs_data", "observations", "lat", "lon"),
    # ARM 5 (checklist) is deliberately absent — constraint 1 in the module docstring.
)


def tile_name(lat: float, lon: float) -> str:
    """Return the 3DEP tile name whose 1x1 degree cell contains (lat, lon).

    Tiles are named for their NORTHWEST corner, so the tile covering 47.5N is
    n48, and the tile covering 121.5W is w122. Only the northern/western
    hemisphere naming is implemented — 3DEP covers the United States.
    """
    import math

    return "n%02dw%03d" % (math.floor(lat) + 1, abs(math.floor(lon)))


def _relation_exists(con: duckdb.DuckDBPyConnection, schema: str, table: str) -> bool:
    return (
        con.execute(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema = ? AND table_name = ?",
            [schema, table],
        ).fetchone()[0]
        > 0
    )


def seed_coordinates(con: duckdb.DuckDBPyConnection) -> list[tuple[float, float]]:
    """Every distinct non-checklist coordinate in the loaded source relations.

    Returns coordinates rounded to COORD_PRECISION and sorted, so the seed set is
    a deterministic function of the sources. Sources absent from the database (a
    partial local build) are skipped rather than raising: a missing loader should
    narrow the backfill, not fail it.

    Ecdysis coordinates are included even though ~89% of them already carry a
    recorded elevation. Sampling them costs ~20% more points and buys a permanent
    cross-check of derived against recorded elevation on the same coordinate —
    which is how the 1-arc-second resolution choice was validated in the first
    place.
    """
    arms = []
    for schema, table, lat_col, lon_col in _SEED_SOURCES:
        if not _relation_exists(con, schema, table):
            continue
        arms.append(
            f"""
            SELECT DISTINCT
                ROUND(TRY_CAST({lat_col} AS DOUBLE), {COORD_PRECISION}) AS lat,
                ROUND(TRY_CAST({lon_col} AS DOUBLE), {COORD_PRECISION}) AS lon
            FROM {schema}.{table}
            WHERE TRY_CAST({lat_col} AS DOUBLE) BETWEEN -90 AND 90
              AND TRY_CAST({lon_col} AS DOUBLE) BETWEEN -180 AND 180
            """
        )
    if not arms:
        return []
    sql = " UNION ".join(arms) + " ORDER BY lat, lon"
    return [(row[0], row[1]) for row in con.execute(sql).fetchall()]


def _ensure_table(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("CREATE SCHEMA IF NOT EXISTS dem_data")
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS dem_data.elevations (
            lat              DOUBLE  NOT NULL,
            lon              DOUBLE  NOT NULL,
            elevation_dem_m  INTEGER,
            status           VARCHAR NOT NULL,
            dem_source       VARCHAR NOT NULL
        )
        """
    )


def _tile_exists(tile: str) -> bool:
    """True if 3DEP publishes this degree cell.

    A HEAD probe rather than an inference from rasterio's error text: a 404 is a
    permanent "no coverage here" that we record and stop asking about, while a
    timeout or a 5xx is transient and must NOT be recorded — the coordinates stay
    unsampled so the next run retries them.
    """
    resp = requests.head(TILE_URL.format(tile=tile), timeout=60)
    if resp.status_code == 404:
        return False
    resp.raise_for_status()
    return True


def _sample_tile(tile: str, points: list[tuple[float, float]]) -> list[tuple]:
    """Sample one 3DEP tile at *points*, returning lookup rows.

    Points are sorted north-to-south then west-to-east so the reads walk the
    raster in block order and GDAL's block cache actually hits.
    """
    import rasterio

    ordered = sorted(points, key=lambda p: (-p[0], p[1]))
    url = "/vsicurl/" + TILE_URL.format(tile=tile)
    rows = []
    with rasterio.open(url) as ds:
        # rasterio.sample takes (x, y) = (lon, lat).
        samples = ds.sample([(lon, lat) for lat, lon in ordered])
        for (lat, lon), value in zip(ordered, samples):
            elev = float(value[0])
            if elev < _NODATA_FLOOR:
                rows.append((lat, lon, None, STATUS_NODATA, DEM_SOURCE))
            else:
                rows.append((lat, lon, round(elev), STATUS_OK, DEM_SOURCE))
    return rows


def load_dem_elevations(db_path: str | None = None) -> None:
    """Extend dem_data.elevations to cover every non-checklist source coordinate.

    Incremental by construction: coordinates already in the table — whatever their
    status — are not re-sampled. Transient tile failures record nothing, so they
    are retried on the next run.
    """
    if db_path is None:
        db_path = DB_PATH

    con = duckdb.connect(db_path)
    try:
        _ensure_table(con)

        seeds = seed_coordinates(con)
        known = {
            (row[0], row[1])
            for row in con.execute("SELECT lat, lon FROM dem_data.elevations").fetchall()
        }
        missing = [c for c in seeds if c not in known]
        print(
            f"dem-elevation: {len(seeds)} source coordinates, "
            f"{len(known)} already sampled, {len(missing)} to sample"
        )
        if not missing:
            return

        by_tile: dict[str, list[tuple[float, float]]] = {}
        for lat, lon in missing:
            by_tile.setdefault(tile_name(lat, lon), []).append((lat, lon))

        rows: list[tuple] = []
        failed_tiles = 0
        for tile in sorted(by_tile):
            points = by_tile[tile]
            try:
                if not _tile_exists(tile):
                    print(f"dem-elevation:   {tile}: no 3DEP coverage ({len(points)} pts)")
                    rows.extend(
                        (lat, lon, None, STATUS_NO_TILE, DEM_SOURCE) for lat, lon in points
                    )
                    continue
                rows.extend(_sample_tile(tile, points))
                print(f"dem-elevation:   {tile}: {len(points)} pts sampled")
            except Exception as exc:  # transient: record nothing, retry next run
                failed_tiles += 1
                print(
                    f"dem-elevation:   {tile}: FAILED ({type(exc).__name__}: {exc}) — "
                    f"{len(points)} pts left unsampled for the next run"
                )

        if rows:
            # Sorted insert so the relation's content order is a function of the
            # data, not of dict iteration — Stelis content-addresses this table.
            rows.sort(key=lambda r: (r[0], r[1]))
            con.executemany(
                "INSERT INTO dem_data.elevations "
                "(lat, lon, elevation_dem_m, status, dem_source) VALUES (?, ?, ?, ?, ?)",
                rows,
            )
        ok = sum(1 for r in rows if r[3] == STATUS_OK)
        print(
            f"dem-elevation: inserted {len(rows)} rows ({ok} with an elevation); "
            f"{failed_tiles} tile(s) deferred"
        )
    finally:
        con.close()


if __name__ == "__main__":
    load_dem_elevations()
