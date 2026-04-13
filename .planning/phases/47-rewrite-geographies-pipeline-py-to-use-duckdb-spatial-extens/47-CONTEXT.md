# Phase 47: Rewrite geographies_pipeline.py — Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Rewrite `data/geographies_pipeline.py` to use DuckDB spatial extension directly: stream shapefiles with `ST_Read`, simplify with `ST_SimplifyPreserveTopology`, store as native `GEOMETRY` type. Eliminate geopandas, shapely, and dlt dependencies and the in-memory GeoDataFrame buffering that caused OOM. Also update `data/export.py` to use native geometry columns (dropping `ST_GeomFromText` wrappers). Download infrastructure and pipeline orchestration are unchanged.

</domain>

<decisions>
## Implementation Decisions

### Simplification strategy
- **D-01:** Store full-resolution geometry in DuckDB — no simplification applied during `ST_Read` / `INSERT`.
- **D-02:** `ST_SimplifyPreserveTopology(geom, 0.001)` applied only at export time in `export.py` (for GeoJSON output). This is already the export tolerance; storing full-res just removes the redundant pre-store pass at 0.01°.
- **D-03:** The `_to_wkt_rows` helper in the old pipeline (which applied `simplify(0.01)`) is removed entirely.

### export.py migration
- **D-04:** This phase updates `export.py` atomically — all `ST_GeomFromText(geometry_wkt)` calls replaced with direct geometry column references (`geom`).
- **D-05:** The `geometry_wkt` TEXT column is dropped from all geographies tables. No transitional dual-column approach.

### Download approach
- **D-06:** Keep the existing Python `requests`-based `_download()` function with resume support. Large files (ecoregions ~150MB zipped) need resume on network hiccup.
- **D-07:** Pass local zip paths to `ST_Read` via GDAL `/vsizip/` virtual filesystem: `ST_Read('zip://' || path || '!filename.shp')` or equivalent DuckDB syntax. No extraction step.

### Table management (without dlt)
- **D-08:** Use `CREATE OR REPLACE TABLE geographies.<name> AS SELECT ...` — atomic DDL, matches dlt's `write_disposition=replace` semantics.
- **D-09:** Keep `geographies.*` schema naming exactly as-is. `export.py` queries `geographies.us_counties`, `geographies.ecoregions`, `geographies.us_states` — these must remain unchanged.
- **D-10:** The `geographies` schema must be created with `CREATE SCHEMA IF NOT EXISTS geographies` before any table creation.
- **D-11:** dlt adds `_dlt_id`, `_dlt_load_id` metadata columns. These are NOT present in geographies tables (they were only in dlt-managed tables). The new pipeline doesn't need to replicate them.

### Dependency removal
- **D-12:** Remove `geopandas`, `shapely`, and `dlt` from geographies_pipeline.py imports. Whether to remove them from `pyproject.toml` entirely depends on whether other pipelines still use dlt — they do (ecdysis, inat, projects pipelines). So only geographies_pipeline.py drops these imports; pyproject.toml changes are limited to removing any geographies-only deps if any exist.

### Claude's Discretion
- Exact DuckDB `ST_Read` syntax for reading from `/vsizip/` paths (researcher should verify current DuckDB spatial docs)
- Column name for the native geometry column — `geom` is conventional but researcher should check DuckDB spatial naming conventions
- Whether to use `INSERT INTO ... SELECT ST_Read(...)` or `CREATE TABLE ... AS SELECT ST_Read(...)` pattern
- Error handling / logging approach (match existing pipeline style)

</decisions>

<specifics>
## Specific Ideas

- The OOM root cause was `gpd.read_file()` loading the entire shapefile as a GeoDataFrame into Python memory. The fix is replacing that with `ST_Read` in a DuckDB SQL query, which streams rows through DuckDB's execution engine.
- User noted that storing full-res geometry will grow `beeatlas.duckdb` significantly. This is accepted for now; block-level incremental S3 sync (rsync-style delta sync of DuckDB file blocks) is a deferred idea worth a future phase.
- `export.py` currently double-simplifies: 0.01° in geopandas on store, then 0.001° in export. The new approach consolidates to a single 0.001° simplification at export time only.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source files to rewrite
- `data/geographies_pipeline.py` — Current implementation (dlt + geopandas). The full rewrite target.
- `data/export.py` — Uses `geometry_wkt` TEXT column in 8+ places across `export_ecdysis_parquet`, `export_samples_parquet`, `export_counties_geojson`, `export_ecoregions_geojson`. All `ST_GeomFromText(geometry_wkt)` calls must be replaced with direct geometry column references.
- `data/run.py` — Pipeline orchestrator. Imports `load_geographies` from geographies_pipeline. Interface must remain stable.

### Pipeline context
- `data/pyproject.toml` — Python dependencies. geopandas/shapely may be removable from geographies scope; dlt must stay for other pipelines.

No external specs or ADRs — requirements are fully captured in decisions above and ROADMAP.md phase 47 description.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_download(name, url)` in geographies_pipeline.py — Keep as-is. Handles resume, caching to `GEOGRAPHY_CACHE_DIR`. Returns `Path` to local zip.
- `SOURCES` dict and `CACHE_DIR` / `DB_PATH` env vars — Keep structure, just remove geopandas/dlt-dependent code.

### Established Patterns
- Other pipelines use `duckdb.connect(DB_PATH)` directly for DuckDB operations. The new geographies pipeline should follow this pattern rather than dlt.
- `export.py` already uses `INSTALL spatial; LOAD spatial;` before spatial queries — the new pipeline must also load the spatial extension.

### Integration Points
- `run.py` calls `load_geographies()` — this function signature must remain: `def load_geographies() -> None`.
- `export.py` assumes `geographies.us_counties`, `geographies.ecoregions`, `geographies.us_states` tables exist in the shared `beeatlas.duckdb` with columns: `name`, `state_fips` (counties), `abbreviation` (states), `geometry_wkt` → will become `geom` after migration.

</code_context>

<deferred>
## Deferred Ideas

- **Block-level incremental S3 sync for beeatlas.duckdb** — User raised concern about DuckDB file size growth from full-res geometry storage. Idea: rsync-style block-level delta sync (like bittorrent piece verification) to avoid uploading the full file each nightly run. Worth a future phase once we see actual size impact.

</deferred>

---

*Phase: 47-rewrite-geographies-pipeline-py-to-use-duckdb-spatial-extens*
*Context gathered: 2026-04-12*
