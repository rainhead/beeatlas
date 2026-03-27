---
phase: 18-map-integration
plan: 02
subsystem: ui
tags: [openlayers, lit, typescript, filter, region, map]

# Dependency graph
requires:
  - phase: 18-map-integration plan 01
    provides: boundaryMode state, regionLayer, countySource, ecoregionSource, FilterState with selectedCounties/selectedEcoregions
  - phase: 17-frontend-data-layer
    provides: filter.ts (filterState, isFilterActive, matchesFilter), region-layer.ts VectorLayer infrastructure

provides:
  - Floating Off/Counties/Ecoregions toggle UI in top-right corner of map (MAP-09)
  - Polygon singleclick handler — click adds to filter, second click removes, open-area click clears (MAP-10)
  - Sample dot ghosting when region filter is active (style.ts)
  - Subtle grey boundary stroke rgba(80,80,80,0.55) replacing bright blue
  - "Filter: [names]" text line in sidebar when region filter active
  - _regionFilterText restored on URL load and popstate navigation

affects: [19-region-chips, future filter phases]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ghost check bypasses style cache: filter-dependent styles skip sampleStyleCache to avoid stale ghost state"
    - "Singleclick priority ordering: specimen/sample hits checked first, polygon fallback after miss, open-area miss clears filter"
    - "Floating absolute-positioned OL overlay: .map-container position:relative wraps #map + .boundary-toggle"

key-files:
  created: []
  modified:
    - frontend/src/bee-map.ts
    - frontend/src/bee-sidebar.ts
    - frontend/src/region-layer.ts
    - frontend/src/style.ts

key-decisions:
  - "Singleclick priority: specimen/sample hits resolved first; polygon fallback only fires on miss — prevents boundary eating dot clicks"
  - "Ghost check in sampleDotStyle bypasses sampleStyleCache — ghost state changes with filterState, not recency tier"
  - "map-container flex wrapper with position:relative: enables absolute-positioned toggle without breaking existing flex layout"
  - "_regionFilterText updated in _restoreFilterState and firstUpdated to correctly display on URL paste/back navigation"

patterns-established:
  - "Style ghost bypass pattern: isFilterActive check before cache lookup, returning shared GHOSTED_SAMPLE_STYLE constant"

requirements-completed: [MAP-09, MAP-10]

# Metrics
duration: 8min
completed: 2026-03-14
---

# Phase 18 Plan 02: Map Integration — Boundary Toggle and Polygon Click Filter Summary

**Floating Off/Counties/Ecoregions toggle, polygon click region filter with sample dot ghosting, and sidebar filter text wired into bee-map.ts/bee-sidebar.ts**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-14T21:40:28Z
- **Completed:** 2026-03-14T21:48:00Z
- **Tasks:** 1 (+ 1 auto-approved checkpoint)
- **Files modified:** 4

## Accomplishments

- Floating boundary toggle UI added to top-right corner of map with Off/Counties/Ecoregions buttons and active state highlighting
- Polygon singleclick handler with correct priority: specimen/sample dots checked first, polygon fallback after miss, open-area click clears all region selections
- Sample dots outside active region filter now render as translucent grey (GHOSTED_SAMPLE_STYLE, bypassing tier cache)
- Sidebar shows "Filter: [names]" in blue when region filter is active; clears when filter empties
- Region filter text correctly restored on URL paste and back/forward navigation

## Task Commits

1. **Task 1: Polygon singleclick handler, floating toggle UI, sidebar region text, and sample ghosting** - `9311697` (feat)
2. **Task 2: Browser smoke test** - auto-approved (checkpoint:human-verify, AUTO_CFG=true)

## Files Created/Modified

- `frontend/src/bee-map.ts` - Added _setBoundaryMode, _onPolygonClick, _clearRegionFilter, _buildRegionFilterText methods; updated singleclick handler with polygon fallback; added map-container CSS and floating toggle HTML; added _regionFilterText @state
- `frontend/src/bee-sidebar.ts` - Added regionFilterText @property; added region-filter-text CSS class; render displays filter text line
- `frontend/src/region-layer.ts` - Updated boundaryStyle stroke from #3388ff to rgba(80,80,80,0.55)
- `frontend/src/style.ts` - Added GHOSTED_SAMPLE_STYLE constant; added ghost check in sampleDotStyle before cache lookup

## Decisions Made

- Ghost check placed before cache lookup in sampleDotStyle: ghost state is filterState-dependent, not recency-dependent, so it cannot be cached by tier
- The singleclick handler now returns early after a specimen/sample hit so the polygon fallback never fires on dot clicks
- `_regionFilterText` is updated in all four places it can change: _onPolygonClick, _clearRegionFilter, _setBoundaryMode (off), _restoreFilterState (URL restore/popstate), and firstUpdated (initial URL load)

## Deviations from Plan

None — plan executed exactly as written, with one addition: `_regionFilterText` update added to `_restoreFilterState` and `firstUpdated` to ensure sidebar text is correct after URL paste or back navigation. This was an obvious correctness requirement not explicitly listed but implied by "URL round-trip" smoke test item 8.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 18 interaction layer complete: boundary toggle (MAP-09) and polygon click filter (MAP-10) are both done
- Phase 19 can replace the minimal "Filter: [names]" sidebar text with proper chip UI (the regionFilterText property interface is already in place)
- No blockers

---
*Phase: 18-map-integration*
*Completed: 2026-03-14*
