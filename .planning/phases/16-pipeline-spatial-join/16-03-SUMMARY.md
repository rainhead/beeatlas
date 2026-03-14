---
phase: 16-pipeline-spatial-join
plan: "03"
subsystem: data-pipeline
tags:
  - geojson
  - geopandas
  - boundary-generation
  - build-pipeline
dependency_graph:
  requires:
    - 16-01  # test scaffold (TestGeoJSONGeneration tests)
  provides:
    - data/scripts/build_geojson.py
    - scripts/build-data.sh (updated)
  affects:
    - frontend/src/assets/wa_counties.geojson
    - frontend/src/assets/epa_l3_ecoregions_wa.geojson
tech_stack:
  added: []
  patterns:
    - download-if-missing (urllib.request.urlretrieve)
    - patchable loader functions (load_ecoregion_gdf, load_county_gdf) for testability
    - geopandas simplify + to_file for GeoJSON generation
key_files:
  created:
    - data/scripts/__init__.py
    - data/scripts/build_geojson.py
  modified:
    - scripts/build-data.sh
decisions:
  - "Used build_geojson.py (underscore) not build-geojson.py (dash) to match the test scaffold's import path from 16-01"
  - "Separated load_ecoregion_gdf and load_county_gdf as patchable functions per test scaffold interface"
  - "build_ecoregion_geojson and build_county_geojson accept optional out_path for testability"
  - "SIMPLIFY_TOLERANCE = 0.006 degrees (0.005 produces 404 KB, over the 400 KB limit)"
metrics:
  duration: "~2.5 minutes"
  completed_date: "2026-03-14"
  tasks_completed: 2
  files_changed: 3
---

# Phase 16 Plan 03: Boundary GeoJSON Generation Script Summary

**One-liner:** GeoJSON boundary script with download-if-missing, WA filter, 0.006-degree simplification, and patchable loader functions.

## What Was Built

`data/scripts/build_geojson.py` generates simplified WA county and EPA Level III ecoregion GeoJSON files for frontend bundling. The script downloads source files (TIGER/Line counties, EPA L3 ecoregions) only if not already present, converts the ecoregion CRS from non-EPSG Lambert AEA to EPSG:4326, filters to Washington state, simplifies at 0.006 degree tolerance, and writes outputs to `frontend/src/assets/`.

`scripts/build-data.sh` now runs the GeoJSON generation step before the Ecdysis and iNat pipeline steps.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create data/scripts/build_geojson.py (TDD) | df0ff11 | data/scripts/__init__.py, data/scripts/build_geojson.py |
| 2 | Add GeoJSON generation step to build-data.sh | b81b0e8 | scripts/build-data.sh |

## Verification Results

- `TestGeoJSONGeneration`: 3/3 passed
- `bash -n scripts/build-data.sh`: syntax OK
- GeoJSON step appears at line 7-9, before Ecdysis download at line 11

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used build_geojson.py (underscore) instead of build-geojson.py (dash)**
- **Found during:** Task 1
- **Issue:** Plan specified `build-geojson.py` (dash) but 16-01 test scaffold imports `from scripts.build_geojson import ...` (underscore). Python module names cannot contain dashes; the dash filename would cause `ModuleNotFoundError`.
- **Fix:** Named the implementation file `build_geojson.py` (underscore) to match the test import path. Updated build-data.sh to call `uv run python scripts/build_geojson.py`.
- **Files modified:** data/scripts/build_geojson.py, scripts/build-data.sh
- **Commits:** df0ff11, b81b0e8

**2. [Rule 2 - Interface] Added patchable loader functions per test scaffold**
- **Found during:** Task 1 (examining existing test_spatial.py)
- **Issue:** Plan did not specify `load_ecoregion_gdf` and `load_county_gdf` as separate functions, but the tests from 16-01 patch these specifically (`patch("scripts.build_geojson.load_ecoregion_gdf", ...)`).
- **Fix:** Implemented the loader functions as patchable module-level functions that handle download-if-missing and CRS conversion.
- **Files modified:** data/scripts/build_geojson.py
- **Commit:** df0ff11

## Self-Check: PASSED

All files confirmed present:
- data/scripts/build_geojson.py — FOUND
- data/scripts/__init__.py — FOUND
- scripts/build-data.sh — FOUND

All commits confirmed:
- df0ff11 (build_geojson.py implementation) — FOUND
- b81b0e8 (build-data.sh update) — FOUND
