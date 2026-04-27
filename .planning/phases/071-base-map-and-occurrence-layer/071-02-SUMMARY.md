---
phase: 071-base-map-and-occurrence-layer
plan: 02
subsystem: ui
tags: [mapbox-gl, geojson, clustering, lit, webgl]

# Dependency graph
requires:
  - phase: 071-base-map-and-occurrence-layer
    plan: 01
    provides: mapbox-gl installed, loadOccurrenceGeoJSON, RECENCY_COLORS, region-layer stubs
provides:
  - bee-map.ts fully rewritten to Mapbox GL JS v3 (zero OL imports)
  - Clustered GeoJSON source with recency-tier clusterProperties
  - Ghost source for filtered-out features
  - Selection ring layer with filter-based highlighting
  - setData-based visibleIds filtering
  - All events preserved (data-loaded, view-moved, filtered-summary-computed, map-click-empty)
affects: [071-03, 072]

# Tech tracking
tech-stack:
  added: []
  patterns: [Mapbox GL JS clustered source with clusterProperties, setData-based filtering with ghost source, filter-based selection highlighting, ResizeObserver for container resize]

key-files:
  created: []
  modified: [frontend/src/bee-map.ts]

key-decisions:
  - "Used cast for mapboxgl.accessToken assignment -- TypeScript module namespace type does not expose the default export's accessToken property under verbatimModuleSyntax + nodenext"
  - "Filter-based selection highlighting (setFilter on selected-ring layer) rather than feature-state -- avoids promoteId conflicts with cluster IDs per research recommendation"
  - "All map clicks emit map-click-empty in Phase 71 -- occurrence and region click handling deferred to Phase 72"

patterns-established:
  - "Mapbox source/layer setup inside map.on('load') callback -- prevents style-not-loaded errors"
  - "Two-source filtering: occurrences (clustered, filtered data via setData) + occurrences-ghost (unclustered, excluded data)"
  - "isStyleLoaded() guard in _applyVisibleIds and _applySelection -- prevents errors when called before style load"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-04-27
---

# Phase 71 Plan 02: bee-map.ts Rewrite Summary

**Complete bee-map.ts rewrite from OpenLayers to Mapbox GL JS v3 with clustered occurrence source, setData filtering, ghost dots, and filter-based selection ring**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-27T00:14:04Z
- **Completed:** 2026-04-27T00:17:48Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Rewrote bee-map.ts from OpenLayers to Mapbox GL JS v3 -- zero OL imports remain
- Clustered GeoJSON source with clusterProperties aggregating freshCount/thisYearCount/olderCount for recency-based cluster coloring
- Ghost source (occurrences-ghost) renders filtered-out features as low-opacity gray dots
- Selection ring layer (selected-ring) highlights selected features with yellow stroke via setFilter
- ResizeObserver handles container dimension changes (table-mode toggle)
- All external event contracts preserved: data-loaded, view-moved, filtered-summary-computed, map-click-empty, boundary-mode-changed, data-error
- TypeScript clean (zero errors), 162 Vitest tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite bee-map.ts -- Mapbox GL JS map with clustered occurrence source** - `0b77111` (feat)

## Files Created/Modified
- `frontend/src/bee-map.ts` - Complete rewrite: Mapbox GL JS v3 map component replacing OpenLayers

## Decisions Made
- Used `(mapboxgl as unknown as { accessToken: string }).accessToken` cast because TypeScript's `verbatimModuleSyntax` + `module: "nodenext"` resolves `import mapboxgl from 'mapbox-gl'` to the module namespace type which does not expose `accessToken` directly, even though it exists on the default export object at runtime
- Chose filter-based selection highlighting (Approach A from research) over feature-state (Approach B) -- avoids `promoteId` conflicts with auto-generated cluster IDs
- All map clicks emit `map-click-empty` -- occurrence and region click handling deferred to Phase 72 per plan

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript accessToken property resolution**
- **Found during:** Task 1
- **Issue:** `mapboxgl.accessToken` produced TS2339 error -- `verbatimModuleSyntax` + `module: "nodenext"` resolves the default import to the module namespace type, which does not expose the `accessToken` property despite it existing on the runtime default export
- **Fix:** Used cast `(mapboxgl as unknown as { accessToken: string }).accessToken`
- **Files modified:** frontend/src/bee-map.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minimal -- type cast is a cosmetic workaround for a TypeScript module resolution edge case. Runtime behavior is identical.

## Issues Encountered
None beyond the TypeScript accessToken resolution documented above.

## Next Phase Readiness
- bee-map.ts is a complete Mapbox GL JS implementation ready for visual verification
- Phase 72 can add occurrence click handling, region boundary layers, and cluster expansion
- Plan 03 (OL removal) can safely remove `ol` and `ol-mapbox-style` from package.json
- Mapbox access token must be configured (local .env and GitHub secret) before visual testing

---
*Phase: 071-base-map-and-occurrence-layer*
*Completed: 2026-04-27*
