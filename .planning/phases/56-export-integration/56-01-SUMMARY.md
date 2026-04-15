---
phase: 56-export-integration
plan: "01"
subsystem: data-pipeline
tags: [elevation, parquet, export, schema-gate]
dependency_graph:
  requires: [dem_pipeline.py (phase 55)]
  provides: [ecdysis.parquet with elevation_m, samples.parquet with elevation_m]
  affects: [scripts/validate-schema.mjs, data/export.py]
tech_stack:
  added: [pyarrow>=12]
  patterns: [pyarrow read/append/write parquet, dem_pipeline integration]
key_files:
  created: []
  modified:
    - data/export.py
    - data/pyproject.toml
    - scripts/validate-schema.mjs
    - .gitignore
    - data/uv.lock
decisions:
  - "Drop read_only=True from duckdb.connect in main() -- safe because nightly pipeline is sole writer"
  - "Use pyarrow post-processing (read-append-rewrite) rather than DuckDB COPY to add INT16 elevation column"
  - "DEM_CACHE_DIR follows same env-var + Path(__file__).parent default pattern as DB_PATH and ASSETS_DIR"
metrics:
  duration: "1m"
  completed: "2026-04-15"
  tasks_completed: 2
  files_modified: 5
---

# Phase 56 Plan 01: Export Integration Summary

**One-liner:** Wire dem_pipeline.py into export.py so both parquet outputs gain a nullable elevation_m INT16 column via pyarrow post-processing, with schema gate enforcement.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add pyarrow dependency and gitignore entry | b956149 | data/pyproject.toml, .gitignore, data/uv.lock |
| 2 | Wire elevation sampling into export.py and update schema gate | 0f28413 | data/export.py, scripts/validate-schema.mjs |

## What Was Built

- `data/export.py`: Added `_add_elevation(out_path, dem_path, lon_col, lat_col)` helper that reads a written parquet file, samples elevation for each coordinate via `dem_pipeline.sample_elevation`, appends an INT16 `elevation_m` column using pyarrow, and rewrites the file in-place. Both `export_ecdysis_parquet` and `export_samples_parquet` now accept a `dem_path: Path` parameter and call `_add_elevation` with the correct column names (`longitude`/`latitude` for ecdysis, `lon`/`lat` for samples). `main()` drops `read_only=True`, calls `ensure_dem(DEM_CACHE_DIR)` once, and passes the result to both export functions.

- `scripts/validate-schema.mjs`: Added `'elevation_m'` to the end of both EXPECTED arrays so the schema gate enforces the new column in CI.

- `data/pyproject.toml`: Added `"pyarrow>=12"` dependency (pyarrow 23.0.1 installed).

- `.gitignore`: Added `data/_dem_cache/` to prevent the ~200-500 MB WA DEM file from being committed.

## Decisions Made

- **Drop read_only=True**: DuckDB COPY requires write access; the nightly pipeline is the sole writer, so this is safe.
- **pyarrow post-processing pattern**: After DuckDB writes the parquet file via COPY, pyarrow reads it back, appends the INT16 elevation column, and rewrites. This avoids any DuckDB-rasterio integration complexity.
- **DEM_CACHE_DIR constant**: Follows the existing env-var-with-pathlib-default pattern (`DB_PATH`, `ASSETS_DIR`) for consistency and testability.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - no stub patterns found. The elevation column will be null for out-of-bounds or nodata pixels (expected behavior documented in `_add_elevation` docstring re: water bodies).

## Threat Flags

None - no new security-relevant surface introduced beyond what was in the plan's threat model.

## Self-Check: PASSED

- data/export.py: verified importable (`from export import _add_elevation, DEM_CACHE_DIR` exits 0)
- scripts/validate-schema.mjs: `grep -c 'elevation_m'` returns 2
- data/pyproject.toml: contains `"pyarrow>=12"`
- .gitignore: contains `data/_dem_cache/`
- Commits b956149 and 0f28413 confirmed in git log
