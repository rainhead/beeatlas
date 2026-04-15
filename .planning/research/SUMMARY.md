# Research Summary: BeeAtlas v2.5 — DEM Elevation Annotation

**Project:** BeeAtlas v2.5
**Domain:** USGS 3DEP DEM sampling + parquet schema extension + frontend filter/display
**Researched:** 2026-04-15
**Confidence:** HIGH (pipeline integration); MEDIUM (seamless-3dep library maturity)

---

## Milestone Summary

v2.5 adds an `elevation_m` (INT16, nullable) column to both `ecdysis.parquet` and `samples.parquet` by sampling the USGS 3DEP 10m seamless DEM at each specimen and sample coordinate during the nightly export step. No new pipeline stages, no dlt resources, no AWS infrastructure changes. The work slots entirely into `export.py` (consistent with how county and ecoregion are already computed at export time) plus a new `dem_pipeline.py` helper module and straightforward frontend additions: sidebar display and an elevation range filter using two number inputs. The milestone is tractable because all required tooling (`rasterio`, `seamless-3dep`) is mature, the data model change is additive (nullable column), and every integration point follows an already-established pattern in this codebase.

---

## Stack Additions

Two new pip dependencies; no frontend library changes, no new AWS services.

| Package | Version | Purpose |
|---------|---------|---------|
| `seamless-3dep` | `>=0.4.1` | Downloads USGS 3DEP 10m GeoTIFF tiles for a bounding box via the USGS National Map service. `get_dem(bbox, data_dir)` returns a list of local file paths and skips download if files already exist. Successor to py3dep (recommended explicitly in py3dep v0.19.0 changelog). Requires only `requests` + `rasterio`; no xarray or shapely needed for the download path. |
| `rasterio` | `>=1.4.4` | Samples elevation values at (lon, lat) coordinates from GeoTIFF. `src.sample(list_of_xy_tuples)` feeds all points to the underlying GDAL C layer in one call — fast enough for 55k points. Bundles GDAL internally (no system libgdal-dev needed). Python 3.14 support confirmed in 1.4.4. |

No `geopandas`, no `xarray`, no `pyproj` — consistent with v2.2 decision to drop geopandas after OOM issues.

---

## Feature Table Stakes

Everything in the must-ship list is either a display change or a filter extension; all follow established patterns.

**Must ship (v2.5):**
- `elevation_m` in both parquet files — INT16 nullable; INT16 is large enough for WA (max 4,392 m) and small enough to stay compact
- Schema gate updated (`validate-schema.mjs`) — enforces column presence before CI build proceeds
- Sidebar display in `bee-specimen-detail` and `bee-sample-detail` — show elevation when non-null; omit row when null (do not show "0 m" as a null sentinel; 0 is a valid sea-level elevation)
- Elevation range filter — two `<input type="number">` fields (min/max), not a slider; WA spans 0–4,392 m and a slider cannot achieve useful precision at that scale; follows the same year/month input pattern already in the codebase
- URL state — `elev0`/`elev1` params via existing `buildParams`/`parseParams` pattern
- Clear-filters resets elevation range — same as all other filter state

**Add after v2.5 validation:**
- Table view elevation column — trivially low effort once the column exists in parquet
- CSV export — already picks up new columns automatically via DuckDB `SELECT *`

**Out of scope:**
- Feet/meters toggle (scientific audience; Darwin Core and GBIF both use meters)
- Elevation as a map visual encoding (conflicts with recency-based cluster coloring)
- Range slider (anti-pattern for wide numeric ranges per NN/G and Apache Superset issue #15605)
- Rounding to nearest 10 m for display (raw integer is acceptable; may add as polish)

---

## Architecture

**Elevation sampling belongs in `export.py`, not a new pipeline step.** Elevation is a deterministic function of lat/lon; there is no incremental state to track and no upstream API to poll. This exactly matches how `county` and `ecoregion_l3` are already computed at export time — spatial attributes derived from coordinates, not fetched from an external system. `run.py` STEPS list does not change.

The new code is a standalone `data/dem_pipeline.py` module with two pure functions — `ensure_dem(path)` and `sample_elevation(lons, lats, dem_path) -> list[int | None]` — imported by `export.py`. Separating the module makes it unit-testable with a synthetic 2x2 GeoTIFF fixture without downloading real DEM data in CI.

**DEM storage — note the researcher disagreement:**

ARCHITECTURE.md recommends backing the DEM in S3 (`cache/dem/wa_10m.tif`) using the same `aws s3 cp` restore/upload pattern that `nightly.sh` already uses for `beeatlas.duckdb`. STACK.md takes the position that S3 caching is out of scope for v2.5 because maderas cron is the execution path and the file persists between runs on disk.

**Recommendation: implement S3 caching.** The S3 pattern is already in `nightly.sh`, costs nothing to add (S3 PUT/GET on a single 500 MB file), and protects against the maderas disk being wiped or the pipeline moving to Lambda later. Local-only cache is fine for development but the nightly run should be robust. The implementation cost is two lines in `nightly.sh`.

The implementation note about `export.py`'s `read_only=True` DuckDB connection is real: temp table injection for the elevation join requires a writable connection. The cleanest resolution is to use a second in-memory DuckDB connection for the elevation join, or to simply drop `read_only=True` (it was defensive, not structural — the nightly run is single-writer).

---

## Build Order

Dependencies drive the order. The DEM sampler must exist before export can produce the column; the schema gate must not be updated ahead of the pipeline change.

**Phase 1 — DEM acquisition and sampling (`dem_pipeline.py`)**
Build `ensure_dem()` and `sample_elevation()` with unit tests using a synthetic 2x2 GeoTIFF fixture. Add `seamless-3dep` and `rasterio` to `pyproject.toml`. Validate nodata to None handling and out-of-bounds to None handling. Nothing else can proceed without a working sampler.

**Phase 2 — Export integration (parquet schema + schema gate)**
Modify `export_ecdysis_parquet` and `export_samples_parquet` in `export.py` to call `sample_elevation` and join the result into the COPY output. Update `validate-schema.mjs` and `test_export.py` in the same commit/PR as the export change. Update `nightly.sh` for DEM S3 cache restore/upload. Critical path: once parquet has `elevation_m`, all frontend work can proceed.

**Phase 3 — Sidebar display (frontend)**
Add `elevation_m` to `SpecimenRow`/`SampleRow` types and `SPECIMEN_COLUMNS`/`SAMPLE_COLUMNS`. Render elevation in `bee-specimen-detail` and `bee-sample-detail` with null-omit fallback. Highest user-visible value at lowest complexity; can be reviewed independently.

**Phase 4 — Elevation filter (frontend)**
Add `elevationMin`/`elevationMax` to `FilterState`, `buildFilterSQL`, and `isFilterActive`. Add `elev0`/`elev1` to `url-state.ts`. Add min/max number inputs to `bee-filter-controls`. Add filter SQL tests and URL round-trip tests. Build last to reduce debugging surface — filter touches more files than display.

---

## Watch Out For

**1. Nodata sentinel stored as real elevation (CRITICAL)**
USGS 3DEP GeoTIFF nodata is commonly -9999 for integer DEMs. Rasterio's `.sample()` returns the raw sentinel without masking. A naive `int(v)` cast stores -9999 in parquet as a valid elevation — it fits in INT16 with no overflow exception raised. Prevention: read `dataset.nodata`, compare before converting, assign Python `None` for sentinel values. Post-export assertion: `SELECT COUNT(*) FROM read_parquet(...) WHERE elevation_m < -500` must return 0.

**2. Schema gate shipped ahead of pipeline change (HIGH)**
If `validate-schema.mjs` is updated to require `elevation_m` before the pipeline change lands, CI will fail for all PRs until the first post-merge nightly run (production CloudFront parquets won't have the column yet). Prevention: ship the schema gate update in the same commit/PR as the `export.py` change. Established pattern from prior phases: never update EXPECTED columns ahead of the pipeline that produces them.

**3. Out-of-bounds sampling for coastal specimens (HIGH)**
Specimens collected near Puget Sound, San Juan Islands, or the Oregon/Idaho border may fall outside the DEM tile extent. Rasterio behavior on out-of-bounds coordinates is inconsistent across versions (may return nodata or raise `WindowError`). Prevention: bounds-check all coordinates against `dataset.bounds` before sampling; assign NULL for out-of-bounds points. A small non-zero null count is expected and correct.

**4. DEM re-downloaded every nightly run (HIGH)**
Without caching, the 400-700 MB WA DEM downloads from USGS on every nightly run, adding 2-5 minutes and creating fragility against USGS TNM server availability. Prevention: cache in S3 under `dem/wa_10m.tif`; restore to `/tmp/wa_10m.tif` at nightly.sh start using the existing DuckDB `aws s3 cp` pattern. The DEM is stable (USGS updates quarterly at most) — no incremental logic needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH (rasterio) / MEDIUM (seamless-3dep) | rasterio API and Python 3.14 support verified from maintainer release notes. seamless-3dep confirmed on PyPI with recent 0.4.1 release; limited secondary documentation depth. |
| Features | MEDIUM-HIGH | UX guidance from NN/G and GBIF authoritative; BeeAtlas-specific UI decisions (omit null row vs. show dash) are product calls documented as such. |
| Architecture | HIGH | Based on direct code read of export.py, nightly.sh, and validate-schema.mjs. Integration pattern matches existing county/ecoregion precedent exactly. |
| Pitfalls | HIGH (technical) / MEDIUM (CI specifics) | Nodata, CRS, and bounds pitfalls well-documented in rasterio issues and USGS docs. Schema gate sequencing pitfall is BeeAtlas-specific and observed from prior phase patterns. |

**Overall confidence: HIGH** — narrow, well-scoped pipeline addition with clear precedents in the existing codebase.

### Gaps to Address

- **Exact nodata sentinel value:** Documented as -9999 but must be verified at download time with `gdalinfo`. Sampling code must read `dataset.nodata` dynamically, not hardcode -9999.
- **Ocean/water body fill value:** Some 3DEP products fill water bodies with 0 rather than nodata. Inspect the downloaded file at pipeline development time; document the handling decision in a code comment.
- **DEM CRS:** Tiles are documented as EPSG:4269 (NAD83) or EPSG:4326 (WGS84) depending on product variant. The horizontal offset is sub-pixel at 10m resolution and can be accepted as a known limitation. Assert CRS in `ensure_dem()` and log a warning if it is not 4326; do not attempt datum transformation.
- **export.py read_only connection:** The `read_only=True` flag on the DuckDB connection blocks temp table injection for the elevation join. Decide during Phase 2: drop `read_only=True` (safe for single-writer nightly run) or use a second in-memory DuckDB connection for the join.

---

## Sources

### Primary (HIGH confidence)
- rasterio 1.4.4 release notes — Python 3.14 support, sample_gen API
- rasterio PyPI / official docs — sample() vectorized call pattern
- seamless-3dep PyPI page — version 0.4.1, 2026-03-13
- py3dep v0.19.0 changelog — explicit seamless-3dep recommendation
- USGS 3DEP dataset catalog — 1/3 arc-second product, EPSG coverage
- DuckDB spatial extension docs — confirmed no raster sampling primitives
- NN/G slider design guidance — numeric inputs preferred for wide-range filters
- Darwin Core / GBIF elevation field standards — meters, nullable

### Secondary (MEDIUM confidence)
- seamless-3dep GitHub — get_dem() API (limited documentation depth)
- iNaturalist community forum — GPS altitude accuracy, user expectations
- Baymard slider UX research — numeric input preference for precise values
- USGS 3DEP Google Earth Engine dataset page — dtype, CRS, nodata documentation

---

*Research completed: 2026-04-15*
*Ready for roadmap: yes*
