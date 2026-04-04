---
phase: 34-global-state-elimination
plan: 02
subsystem: ui
tags: [typescript, openLayers, lit, refactor]

# Dependency graph
requires:
  - phase: 34-01
    provides: filter.ts pure module, style.ts factory functions, BeeMap owns filterState/visibleIds
provides:
  - region-layer.ts as style-constants-only module (no sources, layers, or eager loading)
  - BeeMap as sole owner of all OL data sources and layers (specimenSource, clusterSource, specimenLayer, sampleSource, sampleLayer, countySource, ecoregionSource, regionLayer)
  - Zero module-level side effects on import for both bee-map.ts and region-layer.ts
affects: [future tests that import bee-map.ts or region-layer.ts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Class property OL objects: all sources and layers are private BeeMap instance properties"
    - "dataErrorHandler indirection eliminated: onError arrow functions capture this directly"
    - "Eager loadFeatures() moved from module scope to firstUpdated"

key-files:
  created: []
  modified:
    - frontend/src/region-layer.ts
    - frontend/src/bee-map.ts

key-decisions:
  - "dataErrorHandler indirection removed — arrow function onError callbacks in class property initializers capture this, making the null-guarded handler pattern unnecessary"
  - "Eager loadFeatures() calls moved to firstUpdated (not constructor) — map needs to exist first for proj3857 resolution, but more importantly this keeps construction side-effect-free"

patterns-established:
  - "All OL construction in class body — import of bee-map.ts triggers zero OL instantiation"
  - "All OL construction in class body — import of region-layer.ts triggers zero instantiation"

requirements-completed: [STATE-02, STATE-03]

# Metrics
duration: ~4min
completed: 2026-04-04
---

# Phase 34 Plan 02: Global State Elimination — OL Object Encapsulation Summary

**All OL data sources and layers moved from module scope into BeeMap class properties; region-layer.ts reduced to immutable style constants and factory only**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-04T15:31:01Z
- **Completed:** 2026-04-04T15:35:17Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Stripped `region-layer.ts` to only `boundaryStyle`, `selectedBoundaryStyle`, and `makeRegionStyleFn` — removed `countySource`, `ecoregionSource`, `regionLayer` exports, eager `loadFeatures()` calls, `DATA_BASE_URL`, and all VectorSource/VectorLayer/GeoJSONFormat imports
- Moved `specimenSource`, `clusterSource`, `specimenLayer`, `sampleSource`, `sampleLayer` from module scope into BeeMap private class properties
- Added `countySource`, `ecoregionSource`, `regionLayer` as BeeMap private class properties (moved from region-layer.ts)
- Eliminated `dataErrorHandler` indirection — `onError` arrow functions directly set `this._dataError`
- Moved eager `loadFeatures()` calls to `firstUpdated` (using `getProjection` imported from `ol/proj.js`)
- Updated all 30+ bare references throughout BeeMap to use `this.X`
- TypeScript compiles clean, Vite production build succeeds, tests pass

## Task Commits

1. **Task 1: Strip region-layer.ts to style constants and factory only** - `73d550d` (refactor)
2. **Task 2: Move all module-level OL objects into BeeMap class properties** - `dab3842` (refactor)

## Files Created/Modified

- `frontend/src/region-layer.ts` — Removed countySource/ecoregionSource/regionLayer exports, eager loadFeatures(), DATA_BASE_URL, and unused OL imports; now exports only boundaryStyle, selectedBoundaryStyle, makeRegionStyleFn
- `frontend/src/bee-map.ts` — Updated imports (added VectorSource, GeoJSONFormat, getProjection; removed regionLayer/countySource/ecoregionSource from region-layer import); deleted module-level OL declarations; added 8 private class properties; moved eager loading to firstUpdated; updated all bare references to this.X

## Decisions Made

- `dataErrorHandler` indirection removed — arrow function `onError` callbacks in class property initializers capture `this` correctly, making the null-guarded handler pattern unnecessary. Simpler and more direct.
- Eager `loadFeatures()` calls placed in `firstUpdated` (not class field initializers) — `getProjection('EPSG:3857')` would work at class init time, but `firstUpdated` is the established location for side-effectful initialization and keeps the class body declarative.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None — all existing functionality preserved; refactor only.

## Next Phase Readiness

- bee-map.ts and region-layer.ts now have zero module-level side effects on import
- All OL objects are BeeMap instance properties — the component can be instantiated multiple times without shared state
- STATE-02 and STATE-03 requirements complete
- Phase 34 complete — all global state eliminated

## Self-Check: PASSED

- SUMMARY.md: FOUND
- Commit 73d550d (Task 1): FOUND
- Commit dab3842 (Task 2): FOUND

---
*Phase: 34-global-state-elimination*
*Completed: 2026-04-04*
