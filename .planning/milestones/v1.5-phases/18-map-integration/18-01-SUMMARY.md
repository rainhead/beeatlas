---
phase: 18-map-integration
plan: 01
subsystem: ui
tags: [openlayers, lit, typescript, url-params, region-filter, geojson]

# Dependency graph
requires:
  - phase: 17-frontend-data-layer
    provides: regionLayer, countySource, ecoregionSource, FilterState.selectedCounties/selectedEcoregions

provides:
  - boundaryMode @state() wired in BeeMap
  - regionLayer mounted in OL map layers array
  - bm=/counties=/ecor= URL encode/decode in buildSearchParams/parseUrlParams
  - _restoreFilterState restores region layer visibility and filter from URL
  - firstUpdated restores region state on initial page load
  - vite.config.ts geojson plugin for .geojson file imports

affects: [18-02, 18-03, 18-boundary-toggle]

# Tech tracking
tech-stack:
  added: [vite geojson plugin (custom, inline in vite.config.ts)]
  patterns: [URL round-trip pattern extended to region params; absence-of-param = default (off)]

key-files:
  created: []
  modified:
    - frontend/src/bee-map.ts
    - frontend/vite.config.ts

key-decisions:
  - "Deferred _setBoundaryMode method to the plan that adds boundary toggle UI — noUnusedLocals:true prevents adding unused private methods"
  - "vite.config.ts geojson plugin: readFileSync + export default for .geojson imports; { code, map: null } to suppress sourcemap warnings"
  - "bm= omitted when off (absence = off) — keeps clean URLs for users without region filter active"

patterns-established:
  - "URL param absence = off/default: bm= only written when boundaryMode !== 'off'"
  - "Region restore in _restoreFilterState: set filterState fields, set boundaryMode, configure regionLayer.setSource + setVisible, call sampleSource.changed()"

requirements-completed: [FILTER-05]

# Metrics
duration: 3min
completed: 2026-03-14
---

# Phase 18 Plan 01: Map Integration Summary

**boundaryMode @state() wired into bee-map.ts with full URL round-trip for bm=/counties=/ecor= params and regionLayer mounted in OL map layers array**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-14T21:35:22Z
- **Completed:** 2026-03-14T21:38:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- boundaryMode @state() ('off' | 'counties' | 'ecoregions') added to BeeMap class
- regionLayer imported from region-layer.ts and added to OL map layers array as the last layer (renders above data dots)
- ParsedParams extended with boundaryMode, selectedCounties, selectedEcoregions fields
- buildSearchParams extended with boundaryMode parameter; both call sites updated
- parseUrlParams decodes bm=/counties=/ecor= URL params with safe defaults
- _restoreFilterState restores region layer source/visibility and filter state from parsed params
- firstUpdated restores region state on initial URL parse (handles direct URL navigation)
- vite.config.ts geojson plugin added so .geojson imports work in Vite build

## Task Commits

Both tasks committed together (Task 1 alone fails noUnusedLocals since imports/state are only used in Task 2):

1. **Tasks 1+2: boundaryMode state + URL params + region restore** - `5372ea6` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `frontend/src/bee-map.ts` - boundaryMode @state(), regionLayer in layers array, ParsedParams extended, buildSearchParams extended, parseUrlParams extended, _restoreFilterState extended, firstUpdated extended
- `frontend/vite.config.ts` - geojson plugin added for .geojson file imports

## Decisions Made
- **Deferred _setBoundaryMode**: The plan specified adding `_setBoundaryMode` in Task 1, but `noUnusedLocals: true` in tsconfig.json causes a TypeScript error for any private class method not called from within the class. Since no call site exists in this plan, the method is deferred to the plan that adds the boundary toggle UI.
- **vite.config.ts geojson plugin**: region-layer.ts imports .geojson files as modules. Vite handles .json natively but not .geojson. Added a minimal inline transform plugin that reads the file via readFileSync and exports it as a JSON module with `{ code, map: null }` to avoid sourcemap warnings.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added vite.config.ts geojson plugin for .geojson file imports**
- **Found during:** Task 1 (build verification)
- **Issue:** TypeScript passed but Vite build failed: "Expected ';', '}' or <eof>" on wa_counties.geojson — Vite doesn't handle .geojson imports natively, only .json
- **Fix:** Added a custom Vite plugin in vite.config.ts that uses readFileSync to read .geojson files and exports them as JSON modules with null sourcemap
- **Files modified:** frontend/vite.config.ts
- **Verification:** Build passes with no errors or warnings
- **Committed in:** 5372ea6

**2. [Rule 3 - Blocking] Deferred _setBoundaryMode to avoid noUnusedLocals TS error**
- **Found during:** Task 1 (build verification)
- **Issue:** Adding `_setBoundaryMode` as a private method with no call site triggers TS6133 ("declared but its value is never read") under `noUnusedLocals: true`
- **Fix:** Omitted _setBoundaryMode from this plan; it will be added in the plan that wires the boundary toggle UI (the only consumer)
- **Files modified:** None (change was not applied)
- **Verification:** Build passes cleanly
- **Committed in:** N/A (not applied)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary for build to pass. No scope creep; _setBoundaryMode will be added in the next applicable plan.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- boundaryMode state and URL round-trip are ready for Phase 18 plans that add the boundary toggle UI and polygon click handler
- regionLayer is mounted and will become visible when boundaryMode is set to 'counties' or 'ecoregions'
- _restoreFilterState handles URL-based restore including popstate (back button)

---
*Phase: 18-map-integration*
*Completed: 2026-03-14*
