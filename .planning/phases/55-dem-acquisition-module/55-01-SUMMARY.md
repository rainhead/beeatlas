---
phase: 55-dem-acquisition-module
plan: "01"
subsystem: data-pipeline
tags: [dem, elevation, rasterio, seamless-3dep, tdd]
dependency_graph:
  requires: []
  provides: [dem_pipeline.ensure_dem, dem_pipeline.sample_elevation, dem_pipeline.WA_BBOX]
  affects: [data/export.py (Phase 56)]
tech_stack:
  added: [seamless-3dep==0.4.1, rasterio==1.5.0, numpy (transitive)]
  patterns: [cache-check-then-download, rasterio.dataset.sample, rasterio.merge]
key_files:
  created:
    - data/dem_pipeline.py
    - data/tests/test_dem_pipeline.py
  modified:
    - data/pyproject.toml
    - data/uv.lock
    - data/tests/conftest.py
decisions:
  - "seamless_3dep.get_dem() API uses res=10 (integer), not resolution='10m' string — adjusted implementation accordingly"
  - "test_nodata_from_file coordinate corrected from (-120.75,47.75) to (-120.25,47.75) — data[0,1] is the top-right pixel"
metrics:
  duration_seconds: 267
  completed_date: "2026-04-15T20:31:04Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 3
---

# Phase 55 Plan 01: DEM Acquisition Module Summary

**One-liner:** USGS 3DEP DEM download and elevation sampling module using seamless-3dep and rasterio with synthetic 2x2 GeoTIFF fixture tests

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Add dependencies, test fixture, and failing tests (RED) | 94099b4 | data/pyproject.toml, data/uv.lock, data/dem_pipeline.py, data/tests/conftest.py, data/tests/test_dem_pipeline.py |
| 2 | Implement ensure_dem and sample_elevation (GREEN) | 5860d46 | data/dem_pipeline.py, data/tests/test_dem_pipeline.py |

## What Was Built

`data/dem_pipeline.py` — standalone module with two public functions:

- `ensure_dem(cache_dir)` — checks for cached `wa_3dep_10m.tif`, downloads via `seamless_3dep.get_dem(WA_BBOX, tile_dir, res=10)` on cache miss, merges tiles with `rasterio.merge`, returns `Path` to merged GeoTIFF
- `sample_elevation(lons, lats, dem_path)` — opens GeoTIFF, reads nodata sentinel from `dataset.nodata`, samples coordinates via `dataset.sample(zip(lons, lats))`, returns `list[int | None]`
- `WA_BBOX = (-124.85, 45.54, -116.92, 49.00)` module-level constant

`data/tests/test_dem_pipeline.py` — 5 unit tests using synthetic 2x2 GeoTIFF fixture, no network access:
- `test_ensure_dem_caches` — cache-hit path returns existing path without downloading
- `test_sample_elevation_inbounds` — in-bounds coordinate returns integer 500
- `test_sample_elevation_nodata` — nodata pixel returns None
- `test_sample_elevation_oob` — out-of-bounds coordinate returns None
- `test_nodata_from_file` — nodata sentinel read from `dataset.nodata`, not hardcoded

`data/tests/conftest.py` — added `dem_fixture` function-scoped fixture creating a 2x2 GeoTIFF with known values (500, 1000, 750, nodata=-9999) spanning west=-121, east=-120, south=47, north=48.

## Verification Results

```
5 passed in 0.25s  (tests/test_dem_pipeline.py)
7 pre-existing failures in test_export.py (BinderException — unrelated to this plan)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected coordinate in test_nodata_from_file**
- **Found during:** Task 2 (GREEN phase — test failed)
- **Issue:** Plan specified sampling at (-120.75, 47.75) which maps to `data[0,0]` = 100.0 (not nodata). The nodata pixel `data[0,1]` = -32768.0 is at top-right, whose center is (-120.25, 47.75).
- **Fix:** Changed test sampling coordinate from (-120.75, 47.75) to (-120.25, 47.75) and updated the comment
- **Files modified:** data/tests/test_dem_pipeline.py
- **Commit:** 5860d46

**2. [Rule 1 - Bug] seamless_3dep API parameter correction**
- **Found during:** Task 1 (pre-emptive verification before writing implementation)
- **Issue:** Plan specified `resolution="10m"` as string, but actual API uses `res=10` (integer). Confirmed via `help(seamless_3dep.get_dem)`.
- **Fix:** Used `res=10` in `ensure_dem` implementation; documented in module comment
- **Files modified:** data/dem_pipeline.py
- **Commit:** 5860d46

## TDD Gate Compliance

- RED gate: `test(55-01)` commit 94099b4 — 5 tests collected, all fail with NotImplementedError
- GREEN gate: `feat(55-01)` commit 5860d46 — 5 tests pass
- REFACTOR gate: not needed (code was clean on first pass)

## Known Stubs

None — both functions are fully implemented.

## Threat Flags

No new security surface beyond what was analyzed in the plan threat model. `ensure_dem` downloads from USGS HTTPS (accepted per T-55-01). `sample_elevation` operates on local files with trusted pipeline inputs (accepted per T-55-04).

## Self-Check: PASSED

All created files confirmed present. Both task commits (94099b4, 5860d46) confirmed in git log.
