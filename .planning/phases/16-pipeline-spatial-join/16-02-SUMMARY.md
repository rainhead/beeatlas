---
phase: 16-pipeline-spatial-join
plan: 02
subsystem: data
tags: [geopandas, spatial-join, sjoin, sjoin_nearest, epsg4326, epsg32610, parquet]

# Dependency graph
requires:
  - phase: 16-pipeline-spatial-join
    provides: "test scaffold (TestAddRegionColumns, TestNearestFallback) from plan 01"
provides:
  - "data/spatial.py with add_region_columns(df, counties_gdf, ecoregions_gdf)"
  - "Two-step spatial join pattern (within + sjoin_nearest fallback)"
  - "Coordinate column auto-detection (longitude/latitude, lon/lat, decimalLongitude/decimalLatitude)"
affects:
  - 16-05 (ecdysis pipeline integration imports from spatial.py)
  - 16-05 (iNat pipeline integration imports from spatial.py)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-step spatial join: gpd.sjoin(predicate='within') first, then gpd.sjoin_nearest on null rows in EPSG:32610"
    - "Post-sjoin deduplication: joined[~joined.index.duplicated(keep='first')] after every sjoin call"
    - "Caller loads boundary GDFs, passes as arguments — no file I/O inside add_region_columns"

key-files:
  created:
    - data/spatial.py
  modified: []

key-decisions:
  - "Three coordinate conventions handled: longitude/latitude (ecdysis), lon/lat (iNat), decimalLongitude/decimalLatitude (ecdysis pre-rename)"
  - "Nearest fallback uses EPSG:32610 (UTM zone 10N) to avoid geographic CRS warning from sjoin_nearest"
  - "Deduplication applied after both within join and sjoin_nearest calls"
  - "Callers responsible for loading pre-reprojected GDFs (EPSG:4326) before passing to add_region_columns"

patterns-established:
  - "Pattern: Two-step sjoin with nearest fallback — within join (EPSG:4326) then sjoin_nearest (EPSG:32610) for null rows"
  - "Pattern: Coordinate column detection order — longitude > lon > decimalLongitude"

requirements-completed: [PIPE-05]

# Metrics
duration: 2min
completed: 2026-03-14
---

# Phase 16 Plan 02: Spatial Join Utility Summary

**`data/spatial.py` with `add_region_columns()` — two-step geopandas sjoin (within + sjoin_nearest fallback) adding county and ecoregion_l3 columns to any coordinate DataFrame**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-14T17:55:23Z
- **Completed:** 2026-03-14T17:57:18Z
- **Tasks:** 1 (TDD: RED confirmed, GREEN implemented)
- **Files modified:** 1

## Accomplishments
- Implemented `add_region_columns(df, counties_gdf, ecoregions_gdf)` in `data/spatial.py`
- Two-step join pattern: `predicate='within'` first (accurate for EPSG:4326), then `sjoin_nearest` in EPSG:32610 for null rows (eliminates coastal edge cases)
- Auto-detects coordinate columns (longitude/latitude, lon/lat, decimalLongitude/decimalLatitude)
- All 5 target tests pass GREEN: TestAddRegionColumns (3 tests) and TestNearestFallback (2 tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement add_region_columns in data/spatial.py** - `d934b49` (feat)

_Note: TDD — RED was confirmed (ModuleNotFoundError on `from spatial import add_region_columns`), then GREEN implemented._

## Files Created/Modified
- `data/spatial.py` - Shared spatial join utility; exports `add_region_columns`

## Decisions Made
- Three coordinate column conventions handled in detection order: `longitude` > `lon` > `decimalLongitude` (matches PLAN.md spec)
- EPSG:32610 used for sjoin_nearest fallback (UTM zone 10N, appropriate for WA) — eliminates geographic CRS warning
- Deduplication after every sjoin call: `joined[~joined.index.duplicated(keep='first')]`
- Callers pass pre-loaded EPSG:4326 GDFs — no boundary file I/O inside the function

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `data/spatial.py` ready for integration into ecdysis pipeline (Plan 05) and iNat pipeline (Plan 05)
- Both callers need to: (1) load boundary GDFs, (2) reproject to EPSG:4326, (3) call `add_region_columns`
- TestInatIntegration and TestGeoJSONGeneration remain RED (for Plans 05 and 03 respectively)

---
*Phase: 16-pipeline-spatial-join*
*Completed: 2026-03-14*
