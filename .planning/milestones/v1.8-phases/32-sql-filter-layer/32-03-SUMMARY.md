---
phase: 32-sql-filter-layer
plan: 03
subsystem: ui
tags: [openlayers, typescript, filter, vectorsource, region-layer]

# Dependency graph
requires:
  - phase: 32-sql-filter-layer
    provides: SQL filter layer, county/ecoregion sources, bee-map _applyFilter/_setBoundaryMode
provides:
  - Eager GeoJSON loading for county and ecoregion sources on page init
  - Fixed _setBoundaryMode that preserves filter selections when called from _applyFilter
affects: [filter, region-layer, bee-map]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "skipFilterReset parameter pattern for shared methods called from multiple contexts"
    - "Module-scope loadFeatures() to force eager fetch of invisible OL VectorSources"

key-files:
  created: []
  modified:
    - frontend/src/region-layer.ts
    - frontend/src/bee-map.ts

key-decisions:
  - "loadFeatures() with world extent triggers OL VectorSource fetch regardless of layer visibility — needed because regionLayer starts invisible"
  - "skipFilterReset=true passed from _applyFilter to _setBoundaryMode so filterState.selectedCounties/selectedEcoregions survive the boundary mode change"

patterns-established:
  - "When a shared method both clears state and triggers side effects, add a skipReset param (default false) so callers managing their own state can opt out"

requirements-completed: [FILT-04, FILT-05, FILT-06]

# Metrics
duration: 10min
completed: 2026-03-31
---

# Phase 32 Plan 03: Gap Closure — Eager Source Loading + Filter Preservation Summary

**Fixed two UAT-failing gaps: county/ecoregion dropdowns now populate on page load, and sidebar counts correctly update when region filters are applied**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-31T23:35:00Z
- **Completed:** 2026-03-31T23:44:56Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- County and ecoregion filter dropdowns populate immediately on page load without requiring the user to visit the Counties/Ecoregions tab
- Sidebar summary counts update correctly when county or ecoregion filters are applied via the filter panel
- All existing call sites of `_setBoundaryMode` (polygon click, boundary tab switching) continue to clear filterState as before — no regressions

## Task Commits

1. **Task 1: Eagerly load county and ecoregion sources on init** - `b19f464` (feat)
2. **Task 2: Fix _applyFilter to preserve county/ecoregion selections through _setBoundaryMode** - `fcdb4f3` (fix)

## Files Created/Modified

- `frontend/src/region-layer.ts` - Import `get as getProjection` from ol/proj; call `loadFeatures()` at module scope on both sources with world extent to force eager fetch
- `frontend/src/bee-map.ts` - Add `skipFilterReset = false` param to `_setBoundaryMode`; wrap selectedCounties/selectedEcoregions clear and internal `_runFilterQuery()` in `if (!skipFilterReset)`; pass `true` from `_applyFilter`

## Decisions Made

- Used `loadFeatures(worldExtent, 1, proj)` rather than touching OL internals — this is the public API for forcing a source to load regardless of render state
- `skipFilterReset` defaults to `false` so all existing call sites are unaffected; only the `_applyFilter` call site opts out

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 9 UAT tests should now pass (previously tests 4 and 9 were failing)
- County/ecoregion dropdowns populated on page load
- Sidebar counts update correctly when any filter combination is applied
- Phase 32 SQL filter layer feature is complete

---
*Phase: 32-sql-filter-layer*
*Completed: 2026-03-31*
