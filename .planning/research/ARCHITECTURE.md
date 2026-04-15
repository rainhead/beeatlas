# Architecture: DEM Elevation Annotation (v2.5)

**Domain:** BeeAtlas — DEM elevation annotation for specimens and samples
**Researched:** 2026-04-15
**Confidence:** HIGH — code read directly; external research for DEM tooling

---

## Current System Context

```
nightly.sh (maderas cron)
  └── uv run python run.py
        ├── ecdysis_pipeline.py    → ecdysis_data.occurrences (DuckDB)
        ├── ecdysis-links          → ecdysis_data.occurrence_links
        ├── inaturalist_pipeline   → inaturalist_data.observations
        ├── waba_pipeline          → inaturalist_waba_data.observations
        ├── projects_pipeline      → ...
        ├── anti_entropy_pipeline  → ...
        ├── export.py              → ecdysis.parquet + samples.parquet
        └── feeds.py               → feeds/...

export.py reads beeatlas.duckdb → writes to $EXPORT_DIR (→ S3 /data/)
frontend DuckDB WASM loads parquet at runtime from CloudFront
```

The DEM file is raster data — it cannot be bundled with the frontend or
fetched by the browser. All elevation annotation must happen at pipeline time.

---

## Integration Points

### Where Elevation Sampling Fits: export.py

Elevation sampling belongs in `export.py`, not in a separate pipeline step,
for these reasons:

1. **No DuckDB persistence needed.** Elevation values are derived from lat/lon
   coordinates already in the DB. There is no new upstream API to poll or
   incremental state to track. The computation is deterministic: same lat/lon →
   same elevation. A separate pipeline step would add orchestration complexity
   with no benefit.

2. **Consistent pattern with spatial joins.** The county and ecoregion_l3
   columns follow the same pattern: they are computed during export from
   lat/lon coordinates, not stored in the pipeline DB. Elevation is identical
   in nature.

3. **DEM file is an export-time resource.** The DEM raster must be available
   on the machine running export. On maderas this is straightforward (cached
   on disk). In the nightly pipeline, `export.py` already has `$DB_PATH` and
   `$EXPORT_DIR` env vars; `$DEM_PATH` follows the same pattern.

4. **Schema gate runs after export.** `validate-schema.mjs` checks parquet
   output — keeping elevation computation in export keeps the gate effective.

### Modified Components

| Component | Change |
|-----------|--------|
| `data/export.py` | Add `sample_elevation()` helper; call it in `export_ecdysis_parquet` and `export_samples_parquet`; add `elevation_m INT16 NULLABLE` to both SELECT lists |
| `data/run.py` | No change to STEPS; elevation is inside export step |
| `data/nightly.sh` | Add DEM cache restore before `uv run python run.py`; add DEM cache upload after (S3 key: `cache/dem/wa_10m.tif`) |
| `data/pyproject.toml` | Add `rasterio` dependency |
| `scripts/validate-schema.mjs` | Add `elevation_m` to both EXPECTED column lists |
| `data/tests/test_export.py` | Add `elevation_m` to EXPECTED_ECDYSIS_COLS and EXPECTED_SAMPLES_COLS; add test for null handling |
| `frontend/src/filter.ts` | Add `elevationMin`/`elevationMax` to `FilterState`; add clauses to `buildFilterSQL`; add `elevation_m` to `SpecimenRow`, `SampleRow`, `SPECIMEN_COLUMNS`, `SAMPLE_COLUMNS` |
| `frontend/src/url-state.ts` | Add `elev0`/`elev1` params to `buildParams`/`parseParams` |
| `frontend/src/bee-filter-controls.ts` | Add elevation range inputs (min/max number inputs) |
| `frontend/src/bee-specimen-detail.ts` | Display `elevation_m` if non-null |
| `frontend/src/bee-sample-detail.ts` | Display `elevation_m` if non-null |

### New Components

| Component | Purpose |
|-----------|---------|
| `data/dem_pipeline.py` (or inline in export.py) | DEM download+cache function; `sample_elevation(lons, lats, dem_path) → list[int|None]` |

The question of a separate module vs. inline in export.py is a matter of
testability. A standalone `dem_pipeline.py` with a `ensure_dem(path)` function
and a pure `sample_elevation(lons, lats, path)` function is easier to unit-test
and mock. Recommend: separate module, imported by export.py.

---

## DEM File: Storage and Caching Strategy

### Recommended Approach: Single State-Wide COG, S3 Cached

**File:** USGS 3DEP 1/3 arc-second (~10m) for Washington state bounding box.
Format: Cloud-Optimized GeoTIFF (COG). Estimated compressed size: 400–700 MB
(WA bounding box ~45–49°N, 116–124°W; 10m resolution).

**Access:**

- **Download once:** `py3dep` can fetch the DEM as a GeoTIFF for a bounding
  box using `get_map()` or similar. Alternatively, direct USGS National Map
  downloader via `requests` for the 1/3 arc-second layer. Download on first
  run; cache thereafter.

- **S3 cache key:** `cache/dem/wa_10m.tif` in the existing site bucket.
  IAM role already has `s3:GetObject` / `s3:PutObject` on the bucket.
  Follow the existing DuckDB cache pattern in `nightly.sh`:
  - Restore: `aws s3 cp s3://$BUCKET/cache/dem/wa_10m.tif $DEM_PATH` (graceful miss)
  - Upload: `aws s3 cp $DEM_PATH s3://$BUCKET/cache/dem/wa_10m.tif` (after first download)

- **Local path:** `/tmp/wa_10m.tif` on maderas (matching nightly.sh's `/tmp/` convention).

**Why not tile-based:**
  The full WA state GeoTIFF is large but a one-time download. Tile-based
  approaches (fetching per-tile from USGS WMS/WCS) introduce per-run network
  requests, complexity, and API rate-limit risk (USGS EPQS point query API is
  single-point only; Bulk Point Query Service is lightly documented and
  reported as unstable). A local COG avoids all of that. COG format allows
  efficient windowed reads via rasterio so the full file need not be held in
  memory.

**Why not py3dep `elevation_bycoords` directly:**
  `py3dep` makes async HTTP requests to USGS web services. For 50,000+ points
  this is viable but has two risks: (1) USGS service reliability during nightly
  run, (2) per-run network dependency and latency. The DEM file approach
  eliminates both. Use `py3dep.get_map()` only for the one-time DEM download,
  then rasterio for all sampling.

**Why not bundle DEM in frontend:**
  Static hosting constraint. A 400–700 MB raster file cannot be bundled or
  usefully fetched at runtime. All elevation data must be in the parquet files.

---

## Elevation Sampling: Technical Approach

### Tool: rasterio

```python
import rasterio
from rasterio.sample import sample_gen

def sample_elevation(lons: list[float], lats: list[float], dem_path: str) -> list[int | None]:
    """Return INT16 elevations (meters) for each lon/lat pair. None where nodata."""
    coords = list(zip(lons, lats))  # rasterio expects (x, y) = (lon, lat)
    with rasterio.open(dem_path) as src:
        nodata = src.nodata
        values = [v[0] for v in src.sample(coords)]
    return [
        int(round(v)) if (nodata is None or v != nodata) and v == v else None
        for v in values
    ]
```

`rasterio.DatasetReader.sample()` accepts a list of `(x, y)` coordinate
tuples and streams windowed reads — it does not load the full raster into
memory. For 50,000 points over a COG this is efficient. No geopandas needed.

### CRS Alignment

USGS 3DEP 10m DEMs are distributed in EPSG:4269 (NAD83) or EPSG:4326
(WGS84). Both are functionally identical at ~10m scale — no reprojection
needed. Verify at download time and assert in `ensure_dem()`.

### DEM Download

Use `py3dep.get_map()` for downloading the bounding-box raster:

```python
import py3dep
WA_BBOX = (-124.9, 45.5, -116.9, 49.1)  # (west, south, east, north) WGS84

def ensure_dem(path: str) -> None:
    if Path(path).exists():
        return
    dem = py3dep.get_map("DEM", WA_BBOX, resolution=10, crs="EPSG:4326")
    dem.rio.to_raster(path)
```

Or use `requests` to pull directly from the USGS National Map WCS endpoint
(more explicit, no xarray/rioxarray dependencies). `py3dep` is the simpler path
as it handles the WCS protocol internally; add `py3dep` and `rioxarray` to
pyproject.toml alongside `rasterio`.

---

## Data Flow Changes

### Before (v2.3)

```
beeatlas.duckdb
  └── export.py
        ├── SELECT + ST_Within spatial join → county, ecoregion_l3
        └── COPY TO ecdysis.parquet (20 columns), samples.parquet (9 columns)
```

### After (v2.5)

```
beeatlas.duckdb  +  wa_10m.tif (local cache, S3-backed)
  └── export.py
        ├── SELECT + ST_Within spatial join → county, ecoregion_l3
        ├── sample_elevation(lons, lats, dem_path) → elevation_m list
        ├── UPDATE parquet in-memory or write via DuckDB VALUES join
        └── COPY TO ecdysis.parquet (21 columns), samples.parquet (10 columns)
```

### Parquet Schema Changes

**ecdysis.parquet** — add: `elevation_m INT16 NULLABLE`
**samples.parquet** — add: `elevation_m INT16 NULLABLE`

### Implementation Note: Export with Elevation

Since `export.py` uses `COPY (SELECT ...) TO file`, the cleanest approach is:

1. Run the existing SQL query without elevation_m.
2. In Python, fetch `(ecdysis_id, longitude, latitude)` rows.
3. Call `sample_elevation(lons, lats, dem_path)`.
4. Write a temp elevation table into DuckDB: `CREATE TEMP TABLE elev AS SELECT * FROM VALUES (...)`.
5. Re-run the COPY with `LEFT JOIN elev` to add `elevation_m`.

Alternatively: write parquet without elevation, then use DuckDB's `read_parquet` + `VALUES` join to produce final parquet. Either approach keeps the SQL-native COPY pattern intact.

---

## Frontend Changes

### Filter: Elevation Range

`FilterState` gains `elevationMin: number | null` and `elevationMax: number | null`.

`buildFilterSQL` adds:
```sql
-- ecdysis:
AND elevation_m >= {elevationMin}
AND elevation_m <= {elevationMax}
-- samples: same
```

Note: rows with `elevation_m IS NULL` must not be excluded when filter is
active. Use `(elevation_m IS NULL OR elevation_m >= ...)` or accept that
unsampled rows drop out of filtered results. Recommend: exclude nulls from
filtered results (nulls are a data quality issue, not a user concern) but
this is a product decision to make in the phase plan.

URL params: `elev0` (min) and `elev1` (max), integers only.

### Sidebar Display

In `bee-specimen-detail` and `bee-sample-detail`, display `elevation_m`
when non-null: e.g., "Elevation: 1,240 m". No new component needed — add
a conditional field row to the existing detail templates.

### isFilterActive

Must check `elevationMin !== null || elevationMax !== null`.

---

## Components: New vs Modified Summary

### New Files

| File | Purpose |
|------|---------|
| `data/dem_pipeline.py` | `ensure_dem(path)` download/cache logic; `sample_elevation(lons, lats, path)` pure sampling function |

### Modified Files

| File | What Changes |
|------|-------------|
| `data/export.py` | Import `dem_pipeline`; call `sample_elevation` for both parquet exports; join elevation into SQL via temp table or VALUES insert |
| `data/nightly.sh` | DEM S3 cache restore (before `uv run python run.py`) and cache upload (after, only if downloaded fresh) |
| `data/pyproject.toml` | Add `rasterio`, `py3dep`, `rioxarray` |
| `scripts/validate-schema.mjs` | Add `elevation_m` to both expected column lists |
| `data/tests/test_export.py` | Add `elevation_m` to expected columns; add test that null elevation rows pass assertion |
| `frontend/src/filter.ts` | `FilterState`, `buildFilterSQL`, `isFilterActive`, `SPECIMEN_COLUMNS`, `SAMPLE_COLUMNS`, `SpecimenRow`, `SampleRow` |
| `frontend/src/url-state.ts` | `buildParams`, `parseParams` for `elev0`/`elev1` |
| `frontend/src/bee-filter-controls.ts` | Elevation min/max number inputs |
| `frontend/src/bee-specimen-detail.ts` | Elevation display field |
| `frontend/src/bee-sample-detail.ts` | Elevation display field |
| `frontend/src/tests/` | New/updated tests for filter SQL, url-state round-trip, detail render |

---

## Suggested Build Order

The dependency chain drives the order: DEM tooling must exist before export
can produce elevation columns; parquet schema must be updated before frontend
can consume it; filter logic and display are independent of each other.

### Phase 1: DEM acquisition and sampling (pipeline)

Build `dem_pipeline.py` with `ensure_dem()` and `sample_elevation()`. Write
unit tests with a synthetic 2x2 GeoTIFF fixture (avoids downloading real DEM
in CI). Add `rasterio` + `py3dep` + `rioxarray` to `pyproject.toml`. Validate
the sampling logic produces correct INT16 values including nodata → None.

**Rationale:** Foundation. Nothing else can proceed without a working sampler.

### Phase 2: Export integration (pipeline → parquet schema)

Modify `export_ecdysis_parquet` and `export_samples_parquet` in `export.py`
to join elevation values and write `elevation_m` column. Update
`validate-schema.mjs` and `test_export.py`. Update `nightly.sh` for DEM cache.

**Rationale:** This is the critical path for the schema gate. Once parquet has
`elevation_m`, all downstream work (frontend) can proceed in parallel or
sequence.

### Phase 3: Sidebar display (frontend)

Add `elevation_m` to `SpecimenRow`/`SampleRow` types and `SPECIMEN_COLUMNS`/
`SAMPLE_COLUMNS` maps. Render elevation in `bee-specimen-detail` and
`bee-sample-detail` detail panels. No filter logic needed for this phase.

**Rationale:** Highest user-visible value with lowest complexity. Can ship
independently before filter is built.

### Phase 4: Elevation filter (frontend)

Add `elevationMin`/`elevationMax` to `FilterState`, `buildFilterSQL`,
`isFilterActive`. Add `elev0`/`elev1` to `url-state.ts`. Add elevation range
inputs to `bee-filter-controls`. Add tests for SQL generation, URL round-trips.

**Rationale:** More complex (touches filter engine, URL state, UI) — build
after display works to reduce debugging surface. Filter logic follows the
established pattern from year/month range filters.

---

## Pitfalls for Phase Plans to Address

- **DEM CRS mismatch:** USGS may deliver EPSG:4269 (NAD83) not EPSG:4326.
  Differences are sub-meter but rasterio will reject a `sample()` call if
  the input coords are in a different CRS than the raster. Assert CRS at
  download time; reproject if needed.

- **nodata sentinel:** USGS 3DEP uses -9999 or similar nodata value.
  Must check `src.nodata` and map to None; do not store -9999 in parquet.

- **Elevation for ocean/boundary coords:** Some specimens near Puget Sound
  or coastal areas may have coords that fall outside the DEM extent or on
  nodata pixels. Sample returns None — this is correct; INT16 NULLABLE handles
  it.

- **DEM download in CI:** The schema gate fetches from CloudFront when no
  local parquet exists. CI does not run the pipeline — no DEM download needed
  in CI. The gate only checks column presence, not values.

- **Export pattern change:** The current `COPY (SELECT ...) TO file` pattern
  returns no rows to Python. Elevation injection requires either: (a) a Python
  query step before/after COPY, or (b) a DuckDB temp table pattern. Option (b)
  is cleaner (stays SQL-native) but requires verifying that DuckDB temp tables
  work correctly across the read-only connection (export.py opens DuckDB
  `read_only=True` — temp tables require a writable connection or a separate
  in-memory DB for the join).

  **Resolution:** Open a second in-memory DuckDB connection for the elevation
  join, reading parquet output from the first step and writing final parquet.
  Or change export.py to use `read_only=False`. Current read_only was defensive
  — a single-writer nightly run can safely use read/write mode.

- **geopandas avoided:** `sample_elevation` uses rasterio directly with no
  geopandas. This is consistent with the v2.2 decision to eliminate geopandas
  from the pipeline after OOM issues.

- **Large DEM first download:** First nightly run after deployment will
  download 400–700 MB from USGS. This adds ~5 minutes to the first run. After
  that, S3 cache restore makes it instant. Log a clear message so the operator
  knows why the first run is slow.
