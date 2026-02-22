---
phase: 07-url-sharing
plan: 01
subsystem: ui
tags: [lit, openlayers, url-sync, history-api, query-string]

# Dependency graph
requires:
  - phase: 04-filtering
    provides: filterState singleton, matchesFilter, isFilterActive — URL sync encodes/decodes these
  - phase: 03-core-map
    provides: BeeMap component, specimenSource, clusterSource — URL sync hooks into moveend and singleclick
provides:
  - URL state synchronization — map view and filters encoded as query string params on every interaction
  - Shareable URLs — opening a URL with x/y/z/taxon/yr0/yr1/months/o params restores exact view and filter state
  - Browser history navigation — back/forward buttons navigate between settled map states
  - Occurrence deep-link — o=ecdysis:{id} param opens specimen detail panel after data loads
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "replaceState immediately + debounced pushState (500ms) on moveend — prevents back-button spam during pan"
    - "_isRestoringFromHistory flag gates moveend listener — prevents history push during popstate restore"
    - "@property on BeeSidebar + updated() lifecycle — parent-driven restore without breaking user-interaction state"

key-files:
  created: []
  modified:
    - frontend/src/bee-map.ts
    - frontend/src/bee-sidebar.ts

key-decisions:
  - "Query string (not hash) for URL params — x/y/z/taxon/taxonRank/yr0/yr1/months/o param names as specified"
  - "replaceState immediately + 500ms debounced pushState on moveend — prevents history pollution during continuous pan"
  - "_isRestoringFromHistory boolean flag prevents reentrant history push during popstate handler"
  - "updated() pattern in BeeSidebar for URL restore — parent pushes @property values, child mirrors to @state in updated()"
  - "Default Washington State view: lon=-120.5, lat=47.5, zoom=7 (replaces old hardcoded -120.32/47.47/8)"
  - "Non-null assertions (!) for center[0] and toShow[0] — TypeScript strict mode, values guaranteed by surrounding logic"

patterns-established:
  - "URL sync pattern: encode via buildSearchParams, decode via parseUrlParams, push via _pushUrlState with debounce"
  - "popstate restoration pattern: parse URL, set view, restore filter singleton, mirror to sidebar @property fields"

requirements-completed: [NAV-01]

# Metrics
duration: 10min
completed: 2026-02-22
---

# Phase 7 Plan 01: URL State Synchronization Summary

**URL query string sync for map view and filters via replaceState+debounced pushState, with popstate restore and BeeSidebar property-driven UI update**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-02-22T23:31:16Z
- **Completed:** 2026-02-22T23:41:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `buildSearchParams` and `parseUrlParams` module-level helpers in bee-map.ts encoding x/y/z/taxon/taxonRank/yr0/yr1/months/o params
- Implemented full URL sync cycle: initial load from params, moveend listener with replaceState+debounced pushState, popstate handler for back/forward, filter change sync
- Added `disconnectedCallback` to clean up popstate listener and debounce timer
- Promoted six filter state fields to `@property` on BeeSidebar with `updated()` lifecycle to mirror restore values to internal `@state` controls

## Task Commits

Each task was committed atomically:

1. **Task 1: Add URL sync infrastructure to bee-map.ts** - `43966b1` (feat)
2. **Task 2: Promote BeeSidebar filter fields to @property for URL restore** - `e5f0505` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `frontend/src/bee-map.ts` - Full URL sync: buildSearchParams, parseUrlParams, ParsedParams interface, _isRestoringFromHistory flag, _onPopState handler, _restoreFilterState, _restoreSelectedOccurrence, _pushUrlState, updated firstUpdated, disconnectedCallback, updated _applyFilter and render
- `frontend/src/bee-sidebar.ts` - Six new @property fields for URL restore, updated() lifecycle method, PropertyValues import added

## Decisions Made

- Default Washington State view changed from hardcoded -120.32/47.47/zoom=8 to DEFAULT_LON=-120.5/DEFAULT_LAT=47.5/DEFAULT_ZOOM=7 (matches plan spec)
- Used non-null assertions (`!`) on `center[0]`, `center[1]`, and `toShow[0]` to satisfy TypeScript strict mode — values are guaranteed by surrounding logic
- Both taxon name and taxonRank must be present and valid in URL params; if either is missing, both are treated as absent (prevents half-state restoration)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict mode errors on array access**
- **Found during:** Task 1 (TypeScript compile check)
- **Issue:** `center[0]`, `center[1]` in `buildSearchParams` and `toShow[0]` in the singleclick handler typed as possibly `undefined` under strict mode
- **Fix:** Added non-null assertions (`!`) — values are guaranteed by the surrounding logic (toLonLat always returns 2-element array; toShow.length > 0 guard precedes access)
- **Files modified:** `frontend/src/bee-map.ts`
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** `43966b1` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - TypeScript strict mode)
**Impact on plan:** Minor — non-null assertions are the correct fix given the guaranteed runtime invariants. No scope creep.

## Issues Encountered

None — plan executed with only the TypeScript strict mode fix above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- NAV-01 satisfied — URL sharing is live
- v1.0 milestone requirements all satisfied (all 11 requirements complete)
- No blockers

---
*Phase: 07-url-sharing*
*Completed: 2026-02-22*
