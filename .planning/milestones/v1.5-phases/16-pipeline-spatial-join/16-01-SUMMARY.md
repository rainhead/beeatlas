---
phase: 16-pipeline-spatial-join
plan: 01
subsystem: testing
tags: [geopandas, pytest, spatial-join, geojson, tdd]

# Dependency graph
requires: []
provides:
  - pytest test scaffold covering PIPE-05, PIPE-06, PIPE-07 unit tests
  - Four test classes: TestAddRegionColumns, TestNearestFallback, TestInatIntegration, TestGeoJSONGeneration
  - Defined contracts for spatial.add_region_columns() and scripts.build_geojson functions
affects:
  - 16-02 (spatial.py implementation must satisfy TestAddRegionColumns and TestNearestFallback)
  - 16-03 (scripts/build-geojson.py must satisfy TestGeoJSONGeneration)
  - 16-04 (inat/download.py integration must satisfy TestInatIntegration)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mock GeoDataFrame pattern: create shapely Polygon + gpd.GeoDataFrame(crs=EPSG:4326) for unit test isolation"
    - "TDD scaffold pattern: import from missing modules causes ModuleNotFoundError (counts as RED)"
    - "load_boundaries patch target: inat.download.load_boundaries for integration test boundary injection"

key-files:
  created:
    - data/tests/test_spatial.py
  modified: []

key-decisions:
  - "Test uses patch('inat.download.load_boundaries') — implies load_boundaries function must exist in inat/download.py at implementation time"
  - "build_ecoregion_geojson and build_county_geojson accept out_path parameter for testability with tmp_path"
  - "load_ecoregion_gdf and load_county_gdf are separate patchable loader functions in scripts/build_geojson.py"

patterns-established:
  - "Pattern 1: Mock boundary GDFs use shapely Polygon covering (0,0)-(1,1) range; outside points use (1.5,1.5)"
  - "Pattern 2: GeoJSON tests patch load_*_gdf functions rather than file I/O for isolation"

requirements-completed: [PIPE-05, PIPE-06, PIPE-07]

# Metrics
duration: 1min
completed: 2026-03-14
---

# Phase 16 Plan 01: Spatial Join Test Scaffold Summary

**pytest test scaffold with 9 failing tests defining contracts for geopandas spatial join (add_region_columns), nearest-polygon fallback, iNat pipeline integration, and GeoJSON generation (build_county_geojson, build_ecoregion_geojson)**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-14T17:55:12Z
- **Completed:** 2026-03-14T17:56:21Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Created `data/tests/test_spatial.py` with four test classes and 9 tests total
- All tests fail RED with `ModuleNotFoundError` (spatial, scripts.build_geojson not yet implemented)
- Tests define precise contracts: function signatures, column names, property names (NA_L3NAME, NAME), size limit (400KB)
- TestInatIntegration reveals `load_boundaries` function must be added to `inat/download.py`

## Task Commits

1. **Task 1: Write failing test scaffold** - `32ce040` (test)

**Plan metadata:** (to be added with final commit)

## Files Created/Modified
- `data/tests/test_spatial.py` - Four test classes covering PIPE-05, PIPE-06, PIPE-07; all 9 tests fail RED

## Decisions Made
- `build_county_geojson` and `build_ecoregion_geojson` accept `out_path` parameter so tests can use `tmp_path` fixture without patching global path constants
- Separate `load_ecoregion_gdf` and `load_county_gdf` loader functions in `scripts/build_geojson.py` are patchable for test isolation
- `inat.download.load_boundaries` is the patch target for integration test — implementation must expose this function

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Self-Check: PASSED
- data/tests/test_spatial.py: FOUND
- 16-01-SUMMARY.md: FOUND
- commit 32ce040: FOUND

## Next Phase Readiness
- Test scaffold ready; plan 16-02 can implement `data/spatial.py` to make TestAddRegionColumns and TestNearestFallback pass GREEN
- Plan 16-03 will implement `data/scripts/build-geojson.py` (TestGeoJSONGeneration)
- Plan 16-04 will integrate spatial join into iNat pipeline (TestInatIntegration)
- Note: `inat/download.py` needs `load_boundaries()` function added during plan 16-04

---
*Phase: 16-pipeline-spatial-join*
*Completed: 2026-03-14*
