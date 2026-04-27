---
phase: 071-base-map-and-occurrence-layer
plan: 03
subsystem: ui
tags: [mapbox-gl, sqlite, vitest, typescript, lit]

# Dependency graph
requires:
  - phase: 071-base-map-and-occurrence-layer
    plan: 02
    provides: bee-map.ts rewritten to Mapbox GL JS v3, all events preserved
provides:
  - bee-atlas.ts wired to Mapbox-based bee-map (county/ecoregion options from SQLite)
  - Test mocks updated for loadOccurrenceGeoJSON, loadBoundaries, mapbox-gl
  - Full build pipeline passing (162 tests, tsc clean, vite build)
affects: [072]

# Tech tracking
tech-stack:
  added: []
  patterns: [SQLite-based filter option loading in coordinator, mapbox-gl test mocking with vi.mock]

key-files:
  created: []
  modified: [frontend/src/bee-atlas.ts, frontend/src/tests/bee-atlas.test.ts]

key-decisions:
  - "County/ecoregion options loaded from SQLite via DISTINCT queries in bee-atlas._loadCountyEcoregionOptions instead of region GeoJSON events from bee-map"
  - "Removed dead handler methods (_onCountyOptionsLoaded, _onEcoregionOptionsLoaded) to pass tsc --noEmit since their event parameter types referenced removed OL types"

patterns-established:
  - "Filter option loading decoupled from map source events -- coordinator queries SQLite directly"

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-04-27
---

# Phase 71 Plan 03: bee-atlas.ts Wiring Summary

**bee-atlas.ts wired to Mapbox-based modules with SQLite county/ecoregion option loading, updated test mocks, and full build verification (162 tests, tsc clean, vite build)**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-27T00:18:00Z
- **Completed:** 2026-04-27T00:22:00Z
- **Tasks:** 3 (2 auto + 1 checkpoint approved)
- **Files modified:** 2

## Accomplishments
- Added `_loadCountyEcoregionOptions()` method to bee-atlas.ts that queries SQLite for DISTINCT county and ecoregion values, replacing the now-removed region GeoJSON event-based loading
- Updated all test mocks in bee-atlas.test.ts for new module exports: `loadOccurrenceGeoJSON` (features.ts), `loadBoundaries` (region-layer.ts), and mapbox-gl
- Full build pipeline verified: 162 Vitest tests pass, tsc --noEmit clean, vite build succeeds
- Visual verification approved: basemap renders, clusters display with recency colors, URL state works, filter ghost dots work

## Task Commits

Each task was committed atomically:

1. **Task 1: Update bee-atlas.ts -- load county/ecoregion options from SQLite, remove dead imports** - `adb506a` (feat)
2. **Task 2: Update test mocks and verify full build** - `358a9a2` (feat)
3. **Task 3: Visual verification** - checkpoint approved (no commit)

## Files Created/Modified
- `frontend/src/bee-atlas.ts` - Added `_loadCountyEcoregionOptions()` method with SQLite DISTINCT queries for county and ecoregion options; removed dead event handler registrations and methods
- `frontend/src/tests/bee-atlas.test.ts` - Replaced OccurrenceSource mock with loadOccurrenceGeoJSON; replaced regionLayer/countySource/ecoregionSource mocks with loadBoundaries; added mapbox-gl and mapbox-gl CSS mocks

## Decisions Made
- County/ecoregion filter options now loaded directly from SQLite by the coordinator (bee-atlas) rather than arriving as events from bee-map -- decouples filter option availability from map rendering
- Removed dead handler methods `_onCountyOptionsLoaded` and `_onEcoregionOptionsLoaded` (not just the template bindings) because their parameter types referenced OL types that no longer exist, causing tsc failures

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed dead handler methods to fix TypeScript compilation**
- **Found during:** Task 2 (build verification)
- **Issue:** Plan said to remove event bindings from the template but leave handler methods in place as "harmless dead code." However, `_onCountyOptionsLoaded` and `_onEcoregionOptionsLoaded` referenced OL event parameter types from the removed OpenLayers API, causing tsc --noEmit to fail
- **Fix:** Removed the handler method bodies entirely (they cannot be revived without OL types, and Phase 72 will use a different approach anyway)
- **Files modified:** frontend/src/bee-atlas.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** `358a9a2`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minimal -- the handlers were dead code that could not compile. Phase 72 will implement boundary option loading through a different mechanism.

## Issues Encountered
None beyond the dead handler method removal documented above.

## Next Phase Readiness
- Phase 71 is complete: Mapbox GL JS basemap, clustered occurrence layer, URL state sync, and filter/selection highlighting are all working
- Phase 72 can add county/ecoregion boundary GeoJSON layers, region-layer.ts real implementation, and occurrence/region/cluster click handling
- Phase 73 can remove all OpenLayers dependencies (ol, ol-mapbox-style) from package.json

## Self-Check: PASSED

- FOUND: frontend/src/bee-atlas.ts
- FOUND: frontend/src/tests/bee-atlas.test.ts
- FOUND: 071-03-SUMMARY.md
- FOUND: commit adb506a
- FOUND: commit 358a9a2

---
*Phase: 071-base-map-and-occurrence-layer*
*Completed: 2026-04-27*
