---
phase: 34-global-state-elimination
plan: 01
subsystem: ui
tags: [typescript, openLayers, lit, duckdb, refactor]

# Dependency graph
requires:
  - phase: 32-sql-filter-layer
    provides: filter.ts mutable singletons (filterState, visibleEcdysisIds, setVisibleIds), style.ts direct filter imports
provides:
  - filter.ts as pure module (interface + pure functions only, no mutable exports)
  - style.ts as stateless factories (makeClusterStyleFn, makeSampleDotStyleFn)
  - region-layer.ts makeRegionStyleFn accepting getFilterState getter
  - BeeMap as sole owner of filterState, visibleEcdysisIds, visibleSampleIds
affects: [34-02-PLAN.md, future filter tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Factory closures for OL style functions: makeXStyleFn(() => this.state) instead of reading module globals"
    - "Class ownership of mutable state: BeeMap owns filterState and visibleIds as private properties"

key-files:
  created: []
  modified:
    - frontend/src/filter.ts
    - frontend/src/style.ts
    - frontend/src/region-layer.ts
    - frontend/src/bee-map.ts

key-decisions:
  - "Style functions set in firstUpdated via factory closures — specimenLayer/sampleLayer styles applied dynamically rather than at module initialization (plan 02 will move layers into class)"
  - "BeeMap._runFilterQuery assigns this.visibleEcdysisIds/this.visibleSampleIds directly instead of calling setVisibleIds()"

patterns-established:
  - "Factory closure pattern: makeXStyleFn(getter) returns OL style callback that reads state via getter on every call"
  - "No mutable module-level exports: all mutable state owned by the component instance"

requirements-completed: [STATE-01]

# Metrics
duration: 5min
completed: 2026-04-04
---

# Phase 34 Plan 01: Global State Elimination — Filter/Style Decoupling Summary

**filter.ts now exports only pure types and functions; style.ts exports factory functions accepting getter callbacks; BeeMap owns all mutable filter state as class properties**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-04T15:22:30Z
- **Completed:** 2026-04-04T15:26:51Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Removed `filterState`, `visibleEcdysisIds`, `visibleSampleIds`, and `setVisibleIds` from `filter.ts` — module now exports zero mutable variables
- Converted `clusterStyle` and `sampleDotStyle` in `style.ts` to factory functions (`makeClusterStyleFn`, `makeSampleDotStyleFn`) that accept getter callbacks; no imports from `filter.ts`
- Updated `makeRegionStyleFn` in `region-layer.ts` to accept `getFilterState` getter parameter; removed `filterState` import
- BeeMap now owns `filterState`, `visibleEcdysisIds`, `visibleSampleIds` as private class properties; all references updated to `this.X` throughout; style factories wired via closures in `firstUpdated`
- TypeScript compiles clean, Vite production build succeeds, smoke test passes

## Task Commits

1. **Task 1: Remove mutable singletons from filter.ts and convert style.ts to factory pattern** - `ee75d29` (refactor)
2. **Task 2: Wire BeeMap to own filterState and visibleIds, use new factory style functions** - `957ecd6` (refactor)

## Files Created/Modified

- `frontend/src/filter.ts` — Removed filterState const, visibleEcdysisIds/visibleSampleIds lets, and setVisibleIds function; kept FilterState interface and all pure functions
- `frontend/src/style.ts` — Removed filter.ts import; converted clusterStyle→makeClusterStyleFn and sampleDotStyle→makeSampleDotStyleFn as factories
- `frontend/src/region-layer.ts` — Removed filterState import; updated makeRegionStyleFn signature to accept getFilterState getter
- `frontend/src/bee-map.ts` — Updated imports; added private filterState/visibleEcdysisIds/visibleSampleIds properties; wired style factories in firstUpdated; replaced all bare filterState/visibleEcdysisIds references with this.X

## Decisions Made

- Style functions set via `specimenLayer.setStyle(makeClusterStyleFn(...))` and `sampleLayer.setStyle(makeSampleDotStyleFn(...))` in `firstUpdated` rather than at module initialization, because the BeeMap instance (`this`) doesn't exist at module scope. Plan 02 will move these layers into the class entirely.
- `this.visibleEcdysisIds = ecdysis` / `this.visibleSampleIds = samples` pattern replaces `setVisibleIds()` call — direct assignment is simpler now that the state is owned by the class.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None — all existing functionality preserved; refactor only.

## Next Phase Readiness

- filter.ts and style.ts are now stateless and testable in isolation
- Plan 02 can move module-level OL objects (specimenLayer, sampleLayer, clusterSource, specimenSource, sampleSource, regionLayer) into BeeMap class properties
- No blockers

## Self-Check: PASSED

- SUMMARY.md: FOUND
- Commit ee75d29 (Task 1): FOUND
- Commit 957ecd6 (Task 2): FOUND

---
*Phase: 34-global-state-elimination*
*Completed: 2026-04-04*
