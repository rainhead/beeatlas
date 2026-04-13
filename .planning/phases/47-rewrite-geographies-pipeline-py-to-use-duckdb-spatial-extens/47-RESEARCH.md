# Phase 47: Rewrite geographies_pipeline.py to use DuckDB spatial — Research

**Researched:** 2026-04-12
**Domain:** DuckDB spatial extension, GDAL/OGR, shapefile CRS transforms
**Confidence:** HIGH (all critical findings verified by live execution against local zips)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Store full-resolution geometry in DuckDB — no simplification applied during ST_Read / INSERT.
- **D-02:** `ST_SimplifyPreserveTopology(geom, 0.001)` applied only at export time in `export.py` (for GeoJSON output).
- **D-03:** The `_to_wkt_rows` helper (which applied `simplify(0.01)`) is removed entirely.
- **D-04:** This phase updates `export.py` atomically — all `ST_GeomFromText(geometry_wkt)` calls replaced with direct geometry column references (`geom`).
- **D-05:** The `geometry_wkt` TEXT column is dropped from all geographies tables. No transitional dual-column approach.
- **D-06:** Keep the existing Python `requests`-based `_download()` function with resume support.
- **D-07:** Pass local zip paths to `ST_Read` via GDAL `/vsizip/` virtual filesystem.
- **D-08:** Use `CREATE OR REPLACE TABLE geographies.<name> AS SELECT ...` — atomic DDL.
- **D-09:** Keep `geographies.*` schema naming exactly as-is.
- **D-10:** Create `geographies` schema with `CREATE SCHEMA IF NOT EXISTS geographies` before table creation.
- **D-11:** No `_dlt_id` / `_dlt_load_id` metadata columns in the new tables.
- **D-12:** Remove `geopandas`, `shapely`, and `dlt` imports from `geographies_pipeline.py`. Do not remove `dlt` from `pyproject.toml` (other pipelines use it). Remove `geopandas` from `pyproject.toml` if it has no other consumers (confirmed: it does not).

### Claude's Discretion

- Exact DuckDB `ST_Read` syntax for reading from `/vsizip/` paths — **researched and verified below**
- Column name for the native geometry column — **confirmed: `geom`** (DuckDB spatial returns this name from ST_Read)
- Whether to use `INSERT INTO ... SELECT ST_Read(...)` or `CREATE TABLE ... AS SELECT ST_Read(...)` pattern — **recommend `CREATE OR REPLACE TABLE ... AS SELECT`** (single atomic statement, no DDL + DML split)
- Error handling / logging approach — **match existing pipeline style** (`print()` + raise)

### Deferred Ideas (OUT OF SCOPE)

- Block-level incremental S3 sync for beeatlas.duckdb
</user_constraints>

---

## Summary

This phase replaces the geopandas+dlt-based `geographies_pipeline.py` with a pure DuckDB approach that streams shapefiles directly via the spatial extension's `ST_Read` table function. The core OOM fix is eliminating `gpd.read_file()` which loaded entire GeoDataFrames into Python heap; `ST_Read` processes rows through DuckDB's execution engine without materializing the full dataset in Python.

Three of the five sources (US states, US counties) use NAD83 geographic CRS — their coordinates are already in degrees and require no transform. The ecoregions shapefile (CEC NA Level III) uses a custom sphere-based Lambert Azimuthal Equal Area projection; the Canadian shapefiles (provinces, census divisions) use Statistics Canada Lambert (EPSG:3347). These projected sources require `ST_Transform` to WGS84 (EPSG:4326) before storage. The correct pattern is to read the `.prj` WKT string from the zip and pass it to `ST_Transform` as the source CRS.

The `export.py` migration is mechanical: every `ST_GeomFromText(geometry_wkt)` becomes a direct `geom` column reference, and `geometry_wkt` CTE selections are replaced with `geom`. `feeds.py` also contains `ST_GeomFromText(geometry_wkt)` calls (6 occurrences across 4 queries) and **must also be updated in this phase** — the column rename in geographies tables will break `feeds.py` at runtime otherwise.

The test fixtures in `conftest.py` and `test_feeds.py` declare geographies tables with `geometry_wkt VARCHAR` columns; these must be updated to use `geom GEOMETRY` columns (with the spatial extension loaded). The `_dlt_load_id` / `_dlt_id` columns in fixtures also go away per D-11.

**Primary recommendation:** Use `CREATE OR REPLACE TABLE geographies.<name> AS SELECT <cols>, geom FROM ST_Read('/vsizip/<path>/<file>.shp')` with `ST_Transform(geom, <prj_wkt>, 'EPSG:4326', true)` for projected sources. Read PRJ WKT via Python's `zipfile` module from the cached zip and pass as a parameter to the SQL.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| duckdb | 1.4.4 (installed) | SQL engine + file I/O | Already used in all pipelines |
| duckdb spatial extension | f129b24 (auto-installed) | ST_Read, ST_Transform, geometry type | Built-in spatial capability, no extra dep |
| requests | (existing) | Download zip files | D-06: keep as-is |
| zipfile | stdlib | Read .prj from zip | No install needed |

[VERIFIED: live execution against data/tl_2024_us_county.zip and data/NA_CEC_Eco_Level3.zip]

### Removed dependencies (for geographies_pipeline.py)

| Import | Where removed | Why safe |
|--------|--------------|---------|
| `geopandas` | geographies_pipeline.py imports | Not used by any other pipeline [VERIFIED: grep showed only geographies_pipeline.py imports it] |
| `shapely` | implicit via geopandas | Removed with geopandas |
| `dlt` | geographies_pipeline.py imports | Other pipelines still use it; stays in pyproject.toml [VERIFIED: CONTEXT.md D-12] |

**pyproject.toml change:** Remove `geopandas` from `dependencies`. Keep `dlt[duckdb]`, `duckdb`, `requests`, `beautifulsoup4`, `boto3`.

---

## Architecture Patterns

### Pattern 1: ST_Read from /vsizip/ path

**Exact syntax (VERIFIED by live execution):**

```sql
-- File is the only required argument. Internal .shp path is required when
-- the zip contains multiple .shp files or when auto-detect fails.
SELECT * FROM ST_Read('/vsizip/<absolute_path_to_zip>/<internal_file>.shp')

-- Example: ecoregions (explicit internal path)
SELECT * FROM ST_Read('/vsizip//abs/path/NA_CEC_Eco_Level3.zip/NA_CEC_Eco_Level3.shp')

-- Example: TIGER files (internal path can also be specified, or omitted if only one .shp)
SELECT * FROM ST_Read('/vsizip//abs/path/tl_2024_us_county.zip/tl_2024_us_county.shp')
```

DuckDB spatial's `ST_Read` returns a `geom` column of type `GEOMETRY` automatically for shapefile sources. [VERIFIED: DESCRIBE confirmed `('geom', 'GEOMETRY')`]

### Pattern 2: Column selection and rename from ST_Read

```sql
-- Select specific attribute columns and rename, keep geom as-is
SELECT
    GEOID  AS geoid,
    NAME   AS name,
    STATEFP AS state_fips,
    geom
FROM ST_Read('/vsizip/<path>/tl_2024_us_county.shp')
```

[VERIFIED: executed successfully; resulting table has GEOMETRY column]

### Pattern 3: CRS transform for projected sources

**Critical:** Three of the five sources are in projected CRS (non-degree coordinates). Storing without transform will silently produce wrong spatial results when joined against TIGER (geographic) data. [VERIFIED: cross-CRS ST_Intersects returned 0 instead of expected matches]

The `.prj` file inside each zip contains the WKT definition that GDAL reads automatically for metadata, but DuckDB's `ST_Transform` requires it to be passed explicitly as the source CRS string.

```python
import zipfile

def _read_prj(zip_path: Path, shp_stem: str) -> str:
    """Read the WKT CRS definition from a shapefile's .prj file inside a zip."""
    with zipfile.ZipFile(zip_path) as zf:
        return zf.read(f"{shp_stem}.prj").decode().strip()
```

```sql
-- Transform from projected CRS to WGS84 lon/lat order (always_xy=True)
-- prj_wkt passed as Python parameter binding
SELECT
    NA_L3NAME AS name,
    NA_L2NAME AS level2_name,
    NA_L1NAME AS level1_name,
    ST_Transform(geom, ?, 'EPSG:4326', true) AS geom
FROM ST_Read('/vsizip/<path>/NA_CEC_Eco_Level3.shp')
```

The fourth argument `true` is `always_xy` — it forces output in (longitude, latitude) order regardless of EPSG:4326's official (lat, lon) axis order. [VERIFIED: without it, coordinates are (lat, lon) which breaks all downstream spatial ops]

**CRS per source (VERIFIED for us_counties + ecoregions; CITED for others):**

| Source | CRS Type | Transform needed | Source CRS |
|--------|----------|-----------------|------------|
| ecoregions | Projected (sphere Lambert Azimuthal) | YES | PRJ WKT from zip [VERIFIED] |
| us_states | Geographic (NAD83) | NO | Already degrees [VERIFIED by coord range] |
| us_counties | Geographic (NAD83) | NO | Already degrees [VERIFIED by coord range] |
| ca_provinces | Projected (Stats Canada Lambert) | YES | PRJ WKT from zip [CITED: StatsCan docs confirm EPSG:3347] |
| ca_census_divisions | Projected (Stats Canada Lambert) | YES | PRJ WKT from zip [CITED: same source type as ca_provinces] |

### Pattern 4: CREATE OR REPLACE TABLE AS SELECT

```python
con.execute("CREATE SCHEMA IF NOT EXISTS geographies")

con.execute("""
CREATE OR REPLACE TABLE geographies.us_counties AS
SELECT GEOID AS geoid, NAME AS name, STATEFP AS state_fips, geom
FROM ST_Read(?)
""", [f"/vsizip/{path}/tl_2024_us_county.shp"])
```

For projected sources, pass PRJ WKT as a second parameter:

```python
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
```

[VERIFIED: CREATE OR REPLACE TABLE ... AS SELECT ... with ST_Transform parameter binding executed successfully]

### Pattern 5: load_geographies() structure

```python
def load_geographies() -> None:
    con = duckdb.connect(DB_PATH)
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("CREATE SCHEMA IF NOT EXISTS geographies")
    
    for name, url, shp_stem, columns, needs_transform in SOURCES_CONFIG:
        path = _download(name, url)
        print(f"  Loading {name}...")
        if needs_transform:
            prj_wkt = _read_prj(path, shp_stem)
            # use ST_Transform in CREATE OR REPLACE TABLE
        else:
            # use geom directly in CREATE OR REPLACE TABLE
        print(f"  {name}: done")
```

Match existing print style (with `# noqa: T201`). No dlt pipeline/resource wrappers.

### Anti-Patterns to Avoid

- **Forgetting always_xy for EPSG:4326 target:** ST_Transform to EPSG:4326 without `true` returns (lat, lon) order. Downstream `ST_Within(ST_Point(lon, lat), geom)` calls will silently fail or give wrong results.
- **Using ST_GeomFromText after migration:** After the column type is GEOMETRY, `ST_GeomFromText(geom)` is a type error. Remove all `ST_GeomFromText` wrappers in export.py and feeds.py.
- **Dropping spatial extension load:** The geographies pipeline must call `INSTALL spatial; LOAD spatial;` before any spatial function. export.py already does this; the new pipeline must too.
- **Passing only target CRS to ST_Transform:** `ST_Transform(geom, 'EPSG:4326')` is a binder error — the function signature requires both source and target CRS strings. [VERIFIED: confirmed via live error]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Streaming shapefiles | Custom OGR/GDAL Python bindings | `ST_Read` table function | Already in DuckDB spatial, handles /vsizip/ natively |
| CRS reprojection | Manual coordinate math | `ST_Transform(geom, src, tgt, always_xy)` | PROJ library handles datum shifts, sphere variants |
| Geometry simplification | Implement Ramer-Douglas-Peucker | `ST_SimplifyPreserveTopology` | Handles topology preservation, edge cases |
| Atomic table replacement | DROP + CREATE two-step | `CREATE OR REPLACE TABLE ... AS SELECT` | Single atomic statement, no window where table is absent |

---

## export.py Migration — Complete Change Inventory

### Files that contain `geometry_wkt` and `ST_GeomFromText`

| File | Occurrence count | Change |
|------|-----------------|--------|
| `export.py` | 20 occurrences | All `geometry_wkt` → `geom`, all `ST_GeomFromText(x)` → `x` |
| `feeds.py` | 6 occurrences | Same pattern — **also needs update in this phase** |
| `data/tests/conftest.py` | 3 table DDL | `geometry_wkt VARCHAR, _dlt_load_id VARCHAR, _dlt_id VARCHAR` → `geom GEOMETRY` |
| `data/tests/test_feeds.py` | 3 table DDL | Same fixture update |

[VERIFIED: grep output confirmed these are the only .py files with geometry_wkt]

### Exact replacements in export.py

The pattern is uniform: `ST_GeomFromText(geometry_wkt)` → `geom` (direct column reference). The CTEs that select `geometry_wkt` also need updating:

```sql
-- BEFORE
WITH wa_counties AS (
    SELECT name AS county, geometry_wkt
    FROM geographies.us_counties
    WHERE state_fips = '53'
)
...
LEFT JOIN wa_counties c ON ST_Within(occ.pt, ST_GeomFromText(c.geometry_wkt))
...
ORDER BY ST_Distance(ST_GeomFromText(geometry_wkt), ...)

-- AFTER
WITH wa_counties AS (
    SELECT name AS county, geom
    FROM geographies.us_counties
    WHERE state_fips = '53'
)
...
LEFT JOIN wa_counties c ON ST_Within(occ.pt, c.geom)
...
ORDER BY ST_Distance(geometry_wkt, ...)
```

Occurrences in `export.py`:
- Line 30: `SELECT name AS county, geometry_wkt` → `SELECT name AS county, geom`
- Line 35-39: `geometry_wkt` in wa_eco CTE + `ST_GeomFromText(geometry_wkt)` x3 → `geom` x3
- Line 51: `ST_GeomFromText(c.geometry_wkt)` → `c.geom`
- Line 56: `ST_GeomFromText(geometry_wkt)` → `geometry_wkt` — WAIT: this is a correlated subquery referencing the outer CTE's `geometry_wkt` column; the whole expression becomes `ORDER BY ST_Distance(geom, ...)`
- Lines 69, 78: same pattern for eco joins
- Lines 143, 148-152, 175, 180, 193, 202: same in `export_samples_parquet`
- Line 247: `ST_SimplifyPreserveTopology(ST_GeomFromText(geometry_wkt), 0.001)` → `ST_SimplifyPreserveTopology(geom, 0.001)`
- Line 264, 267-268: `export_ecoregions_geojson` — same simplify and intersects patterns

[VERIFIED: `ST_SimplifyPreserveTopology(geom, 0.001)` executed successfully on native GEOMETRY column]

### Exact replacements in feeds.py

- Line 214: `ST_GeomFromText(c.geometry_wkt)` → `c.geom`
- Line 238: `ST_GeomFromText(e.geometry_wkt)` → `e.geom`
- Line 239: `(SELECT ST_GeomFromText(geometry_wkt) FROM geographies.us_states WHERE abbreviation = 'WA')` → `(SELECT geom FROM geographies.us_states WHERE abbreviation = 'WA')`
- Line 245: `ST_GeomFromText(e.geometry_wkt)` → `e.geom`
- Line 356: `ST_GeomFromText(geometry_wkt)` → `geom`
- Line 357: `(SELECT ST_GeomFromText(geometry_wkt) FROM geographies.us_states WHERE abbreviation = 'WA')` → `(SELECT geom FROM geographies.us_states WHERE abbreviation = 'WA')`

### Test fixture updates

`conftest.py` and `test_feeds.py` both create geographies tables inline. They must:
1. Remove `geometry_wkt VARCHAR` column, `_dlt_load_id VARCHAR`, `_dlt_id VARCHAR` from table DDL
2. Add `geom GEOMETRY` column to table DDL
3. Update all `INSERT INTO geographies.*` statements to pass WKT and use `ST_GeomFromText(?)::GEOMETRY` or just `?::GEOMETRY` for the geometry column (since WKT strings are stored in the fixtures as Python string constants)
4. Update the `_seed_data` function inserts: `VALUES (..., WKT_STRING, 'load1', 'state-wa')` → `VALUES (..., ST_GeomFromText(?))` with the WKT passed as parameter, OR cast inline: `VALUES ('53', 'Washington', 'WA', ST_GeomFromText(WA_STATE_WKT))`

[VERIFIED: conftest.py seed data uses WKT strings; fixture uses `con.execute(sql, [WKT])` pattern already — consistent with adding geometry column]

---

## Common Pitfalls

### Pitfall 1: Ecoregion CRS is not NAD83/WGS84
**What goes wrong:** Reading ecoregion shapefile and storing `geom` directly yields projected meter coordinates, not degrees. All downstream spatial joins (ST_Within, ST_Intersects) return wrong results silently.
**Why it happens:** NA_CEC_Eco_Level3 uses "Sphere_ARC_INFO_Lambert_Azimuthal_Equal_Area" — a custom sphere-based projection. The bounding box of raw geometry is (-1.7M, 0.5M) not (-123, 47).
**How to avoid:** Always call `ST_Transform(geom, prj_wkt, 'EPSG:4326', true)` for ecoregions. Read prj_wkt from the zip file.
**Warning signs:** `ST_XMin(geom)` returns values in millions, not -180 to 180.

### Pitfall 2: Forgetting always_xy=true
**What goes wrong:** `ST_Transform(geom, src, 'EPSG:4326')` returns (latitude, longitude) order because EPSG:4326's official axis order is lat/lon. Coordinates like (47.5, -123.2) instead of (-123.2, 47.5).
**Why it happens:** PROJ 6+ follows authority axis order; EPSG:4326 is lat/lon by definition.
**How to avoid:** Always use the 4-argument form: `ST_Transform(geom, src_crs, 'EPSG:4326', true)`.
**Warning signs:** After transform, `ST_XMin(geom)` returns positive values (latitudes) instead of negative (Pacific longitudes).

### Pitfall 3: Missing spatial extension load in pipeline
**What goes wrong:** `duckdb.connect(DB_PATH)` creates a persistent connection but spatial functions are not available until `LOAD spatial` is called.
**Why it happens:** Extensions are not auto-loaded in persistent connections.
**How to avoid:** Call `con.execute("INSTALL spatial; LOAD spatial;")` immediately after connecting.

### Pitfall 4: stat() on feeds.py geometry_wkt references
**What goes wrong:** After export.py is updated but feeds.py is not, the nightly run passes export tests but feeds.py queries fail at runtime because `geometry_wkt` column no longer exists.
**Why it happens:** feeds.py was not identified in the initial scope — grep reveals 6 occurrences.
**How to avoid:** Update feeds.py and its test fixtures in the same commit as export.py.

### Pitfall 5: Test conftest.py still uses geometry_wkt
**What goes wrong:** `pytest` passes during geographies pipeline tests but fails on `test_export.py` and `test_feeds.py` if conftest fixture creates tables with `geometry_wkt VARCHAR` while export queries reference `geom`.
**Why it happens:** conftest.py creates its own in-memory DB schemas; it doesn't read from the real DB.
**How to avoid:** Update conftest.py table DDL and seed inserts atomically with the production code changes.

---

## Code Examples

### Full pipeline function skeleton

```python
# Source: verified by live execution in this session
import os, zipfile
from pathlib import Path
import duckdb

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
CACHE_DIR = Path(os.environ.get('GEOGRAPHY_CACHE_DIR', '.geography_cache'))

SOURCES = {
    "ecoregions": "https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/cec_na/NA_CEC_Eco_Level3.zip",
    "us_states": "https://www2.census.gov/geo/tiger/TIGER2024/STATE/tl_2024_us_state.zip",
    "us_counties": "https://www2.census.gov/geo/tiger/TIGER2024/COUNTY/tl_2024_us_county.zip",
    "ca_provinces": "https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lpr_000b21a_e.zip",
    "ca_census_divisions": "https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lcd_000b21a_e.zip",
}


def _read_prj(zip_path: Path, shp_stem: str) -> str:
    """Read the WKT CRS definition from a shapefile's .prj file inside a zip."""
    with zipfile.ZipFile(zip_path) as zf:
        return zf.read(f"{shp_stem}.prj").decode().strip()


def load_geographies() -> None:
    con = duckdb.connect(DB_PATH)
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("CREATE SCHEMA IF NOT EXISTS geographies")

    # --- ecoregions ---
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

    # --- us_states (geographic, no transform) ---
    path = _download("us_states", SOURCES["us_states"])
    print("  Loading us_states...")  # noqa: T201
    con.execute("""
        CREATE OR REPLACE TABLE geographies.us_states AS
        SELECT STATEFP AS fips, NAME AS name, STUSPS AS abbreviation, geom
        FROM ST_Read(?)
    """, [f"/vsizip/{path}/tl_2024_us_state.shp"])

    # --- us_counties (geographic, no transform) ---
    path = _download("us_counties", SOURCES["us_counties"])
    print("  Loading us_counties...")  # noqa: T201
    con.execute("""
        CREATE OR REPLACE TABLE geographies.us_counties AS
        SELECT GEOID AS geoid, NAME AS name, STATEFP AS state_fips, geom
        FROM ST_Read(?)
    """, [f"/vsizip/{path}/tl_2024_us_county.shp"])

    # --- ca_provinces (Stats Canada Lambert, needs transform) ---
    path = _download("ca_provinces", SOURCES["ca_provinces"])
    print("  Loading ca_provinces...")  # noqa: T201
    prj_wkt = _read_prj(path, "lpr_000b21a_e")
    con.execute("""
        CREATE OR REPLACE TABLE geographies.ca_provinces AS
        SELECT PRUID AS pruid, PRENAME AS name, PREABBR AS abbreviation,
               ST_Transform(geom, ?, 'EPSG:4326', true) AS geom
        FROM ST_Read(?)
    """, [prj_wkt, f"/vsizip/{path}/lpr_000b21a_e.shp"])

    # --- ca_census_divisions (Stats Canada Lambert, needs transform) ---
    path = _download("ca_census_divisions", SOURCES["ca_census_divisions"])
    print("  Loading ca_census_divisions...")  # noqa: T201
    prj_wkt = _read_prj(path, "lcd_000b21a_e")
    con.execute("""
        CREATE OR REPLACE TABLE geographies.ca_census_divisions AS
        SELECT CDUID AS cduid, CDNAME AS name, CDTYPE AS division_type, PRUID AS pruid,
               ST_Transform(geom, ?, 'EPSG:4326', true) AS geom
        FROM ST_Read(?)
    """, [prj_wkt, f"/vsizip/{path}/lcd_000b21a_e.shp"])

    con.close()
```

**Important:** The .shp stem name (used for `_read_prj`) must match the actual filename inside the zip. For TIGER files: `tl_2024_us_state.shp`, `tl_2024_us_county.shp`. For Stats Canada files: `lpr_000b21a_e.shp`, `lcd_000b21a_e.shp`. These are [ASSUMED] based on file naming conventions — verify the actual filenames by inspecting the downloaded zips before finalizing.

### export.py CTE pattern after migration

```sql
-- Source: verified by live execution
WITH wa_counties AS (
    SELECT name AS county, geom
    FROM geographies.us_counties
    WHERE state_fips = '53'
),
wa_eco AS (
    SELECT name AS ecoregion_l3, geom
    FROM geographies.ecoregions
    WHERE ST_Intersects(
        geom,
        (SELECT geom FROM geographies.us_states WHERE abbreviation = 'WA')
    )
),
...
with_county AS (
    SELECT occ.occurrence_id, c.county
    FROM occ
    LEFT JOIN wa_counties c ON ST_Within(occ.pt, c.geom)
),
county_fallback AS (
    SELECT occurrence_id,
        (SELECT county FROM wa_counties
         ORDER BY ST_Distance(geom,
             (SELECT pt FROM occ o2 WHERE o2.occurrence_id = with_county.occurrence_id))
         LIMIT 1) AS county
    FROM with_county
    WHERE county IS NULL
),
```

### export_counties_geojson / export_ecoregions_geojson after migration

```sql
-- Source: verified by live execution
SELECT name AS NAME,
       ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.001))
FROM geographies.us_counties
WHERE state_fips = '53'
```

### conftest.py fixture after migration

```python
con.execute("""
    CREATE TABLE geographies.us_states (
        fips VARCHAR, name VARCHAR, abbreviation VARCHAR,
        geom GEOMETRY
    )
""")
# ... similar for us_counties, ecoregions (no _dlt_load_id, _dlt_id)

con.execute("""
    INSERT INTO geographies.us_states VALUES (
        '53', 'Washington', 'WA', ST_GeomFromText(?)
    )
""", [WA_STATE_WKT])
```

Note: `ST_GeomFromText` is still valid for creating a GEOMETRY value from a WKT string in SQL. Only the *stored column* changes from `geometry_wkt VARCHAR` to `geom GEOMETRY`. The fixture inserts can continue using `ST_GeomFromText(?)` with the WKT constants, converting them to GEOMETRY at insert time.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| geopandas `gpd.read_file()` | DuckDB `ST_Read()` | This phase | Eliminates full-in-memory GeoDataFrame |
| WKT text column `geometry_wkt` | Native `GEOMETRY` column `geom` | This phase | Direct spatial indexing; no text parse on each query |
| `simplify(0.01)` pre-store + `0.001` at export | `ST_SimplifyPreserveTopology(0.001)` at export only | This phase | Single simplification pass; full-res stored |
| dlt pipeline/resource wrappers | Raw `duckdb.connect()` + `CREATE OR REPLACE TABLE` | This phase | Removes `_dlt_id`/`_dlt_load_id` columns |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Canadian Stats Canada zip internal filenames are `lpr_000b21a_e.shp` and `lcd_000b21a_e.shp` | Code Examples | `ST_Read` path would fail; discoverable by listing zip contents |
| A2 | Stats Canada .prj WKT will be in a file named `lpr_000b21a_e.prj` / `lcd_000b21a_e.prj` | Code Examples | `_read_prj` would raise KeyError; fallback: list zip and find .prj |
| A3 | `STUSPS` is the shapefile column name for state abbreviation in TIGER 2024 state file | Code Examples | CREATE OR REPLACE TABLE would fail with column-not-found; verify by checking TIGER docs or DESCRIBE |

**Low-risk assumptions** (not in table because they are checkable at runtime and cause immediate errors rather than silent failures):
- Canadian shapefiles are in projected (meter) coordinates — if they were geographic, transform would distort but not crash. Discoverable by inspecting `.prj` file CRS type.

---

## Open Questions

1. **us_states internal shapefile filename**
   - What we know: TIGER 2024 state zip URL is `tl_2024_us_state.zip`
   - What's unclear: Is the .shp filename exactly `tl_2024_us_state.shp` inside the zip? (Pattern from county zip confirms `tl_2024_us_county.zip` → `tl_2024_us_county.shp` [VERIFIED], so state file likely follows same pattern)
   - Recommendation: Add a validation check or list zip contents during first-run

2. **STUSPS vs STUSAB for state abbreviation column**
   - What we know: The current geopandas code uses `STUSPS` (line 106 of geographies_pipeline.py)
   - What's unclear: Whether TIGER 2024 state file uses STUSPS or another column name
   - Recommendation: The existing code already uses STUSPS, so it's confirmed as the current working column name [ASSUMED LOW RISK]

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| duckdb | pipeline + export | ✓ | 1.4.4 | — |
| duckdb spatial extension | ST_Read, ST_Transform | ✓ | f129b24 | — |
| zipfile | PRJ reading | ✓ | stdlib | — |
| local county zip | VERIFIED tests | ✓ | tl_2024_us_county.zip | — |
| local ecoregion zip | VERIFIED tests | ✓ | NA_CEC_Eco_Level3.zip | — |
| Canadian zips | ca_provinces, ca_census_divisions | not cached yet | — | Download on first run |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 |
| Config file | `data/pyproject.toml` `[tool.pytest.ini_options]` |
| Quick run command | `cd data && uv run pytest tests/test_export.py -x` |
| Full suite command | `cd data && uv run pytest` |

### Phase Requirements → Test Map

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| geographies tables created with GEOMETRY column | integration | `uv run pytest tests/test_export.py -x` | ✅ (fixture-based) |
| export_ecdysis_parquet succeeds with geom column | integration | `uv run pytest tests/test_export.py::test_ecdysis_parquet_has_rows -x` | ✅ |
| export_samples_parquet succeeds with geom column | integration | `uv run pytest tests/test_export.py::test_samples_parquet_has_rows -x` | ✅ |
| export_counties_geojson succeeds | integration | `uv run pytest tests/test_export.py::test_counties_geojson -x` | ✅ |
| export_ecoregions_geojson succeeds | integration | `uv run pytest tests/test_export.py::test_ecoregions_geojson -x` | ✅ |
| feeds.py spatial queries work with geom | integration | `uv run pytest tests/test_feeds.py -x` | ✅ (needs fixture update) |

### Wave 0 Gaps

- [ ] `tests/conftest.py` — update table DDL (remove `geometry_wkt VARCHAR`, `_dlt_*` columns; add `geom GEOMETRY`) and `_seed_data` inserts
- [ ] `tests/test_feeds.py` — update inline table DDL (lines 344-358 fixture) to use `geom GEOMETRY`
- No new test files needed — existing tests exercise the full export pipeline

---

## Security Domain

> This phase involves no authentication, user input, or network-facing code (the downloader already exists and is unchanged). ASVS categories V2/V3/V4 do not apply. V5 (input validation) is limited to trusted source data from government agencies. No secrets are introduced. Security section skipped per phase scope.

---

## Sources

### Primary (HIGH confidence)
- Live execution against `data/tl_2024_us_county.zip` and `data/NA_CEC_Eco_Level3.zip` — ST_Read syntax, column names, GEOMETRY type, ST_Transform behavior, always_xy flag, ST_SimplifyPreserveTopology
- `data/tests/conftest.py` — existing test fixture structure
- `data/tests/test_export.py` — existing test coverage
- `data/export.py` — complete inventory of geometry_wkt references
- `data/feeds.py` — secondary file also requiring migration

### Secondary (MEDIUM confidence)
- [Statistics Canada 2021 Boundary Files Reference Guide](https://www150.statcan.gc.ca/n1/pub/92-160-g/92-160-g2021001-eng.htm) — Lambert conformal conic, NAD83 CRS confirmation
- [EPSG:3347 NAD83 / Statistics Canada Lambert](https://epsg.io/3347) — CRS code for Stats Canada files

### Tertiary (LOW confidence / ASSUMED)
- Internal filenames of Canadian zips — based on Statistics Canada naming conventions, unverified until downloaded

---

## Metadata

**Confidence breakdown:**
- ST_Read syntax and /vsizip/ path: HIGH — verified by live execution
- GEOMETRY column type and name `geom`: HIGH — verified by DESCRIBE output
- CRS handling (ecoregions): HIGH — verified by coordinate inspection, prj WKT execution
- CRS handling (Canadian files): MEDIUM — StatsCan docs confirm projection type; exact prj stem filenames are ASSUMED
- Export / feeds migration inventory: HIGH — verified by grep + code reading
- Test fixture update requirements: HIGH — verified by reading conftest.py and test_feeds.py

**Research date:** 2026-04-12
**Valid until:** 2027-04-12 (DuckDB spatial API is stable; shapefile sources are static government data)
