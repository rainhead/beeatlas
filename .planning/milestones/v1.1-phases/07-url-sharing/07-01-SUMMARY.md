---
phase: 07-url-sharing
plan: "01"
subsystem: frontend
tags: [url-sync, history-api, lit, openlayers]
dependency_graph:
  requires: []
  provides: [url-state-sync, shareable-urls, history-navigation]
  affects: [bee-map.ts, bee-sidebar.ts]
tech_stack:
  added: []
  patterns: [URLSearchParams, history.replaceState, history.pushState, popstate, Lit @property restore pattern]
key_files:
  created: []
  modified:
    - frontend/src/bee-map.ts
    - frontend/src/bee-sidebar.ts
decisions:
  - "Query string params (not hash) for URL encoding: x/y/z for view, taxon/taxonRank/yr0/yr1/months/o for filters"
  - "replaceState on every moveend + 500ms debounced pushState for browser history (avoids history explosion)"
  - "_isRestoringFromHistory flag prevents feedback loops between popstate and moveend handlers"
  - "Lit updated() pattern in BeeSidebar to apply parent-pushed restore properties to internal @state fields"
  - "DEFAULT_LON=-120.5, DEFAULT_LAT=47.5, DEFAULT_ZOOM=7 for Washington State default view"
metrics:
  duration: "~3 minutes"
  completed: "2026-03-09"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 07 Plan 01: URL State Synchronization Summary

URL state synchronization for the Washington Bee Atlas map, encoding map view and filter state into shareable query string URLs. Implements NAV-01.

## What Was Implemented

### bee-map.ts

- `buildSearchParams(center, zoom, filterState, selectedOccId)` — encodes map center (x/y), zoom (z), taxon, year range (yr0/yr1), months, and selected occurrence (o) into URLSearchParams
- `parseUrlParams(search)` — decodes query string back to typed ParsedParams with validation and fallback to Washington State defaults
- `_isRestoringFromHistory` flag — prevents moveend handler from overwriting history during popstate restore
- `_mapMoveDebounce` — 500ms debounce timer for pushState to avoid flooding history
- `_selectedOccId` — tracks currently-selected occurrence for URL encoding
- `_onPopState` arrow property — restores full app state (view + filters + selection) on browser back/forward
- `_restoreFilterState(parsed)` — applies parsed filter state to filterState singleton, recomputes filteredSummary, mirrors to sidebar display fields
- `_restoreSelectedOccurrence(occId)` — looks up feature by ID and restores selectedSamples
- `_pushUrlState()` — calls replaceState immediately plus debounced pushState
- Updated `firstUpdated` — parses URL on page load, uses parsed coords for initial View, wires moveend and popstate listeners, restores filter+occurrence after data loads
- `disconnectedCallback` — removes popstate listener and clears debounce timer
- Updated `_applyFilter` — syncs URL state after filter changes, clears selectedOccId
- Updated `render()` — passes all six restore properties down to bee-sidebar

### bee-sidebar.ts

- Six new `@property({ attribute: false })` fields: `restoredTaxonInput`, `restoredTaxonRank`, `restoredTaxonName`, `restoredYearFrom`, `restoredYearTo`, `restoredMonths`
- `updated(changedProperties: PropertyValues)` lifecycle method — detects when any restore property changes and mirrors all six to the internal `@state` fields that drive filter UI

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict mode: array element access possibly undefined**
- **Found during:** Task 1 compile check
- **Issue:** `center[0]` and `center[1]` in `buildSearchParams`, and `toShow[0]` in singleclick handler reported as possibly undefined under `noUncheckedIndexedAccess`
- **Fix:** Added non-null assertion `!` on array accesses (`center[0]!`, `center[1]!`, `toShow[0]!`)
- **Files modified:** frontend/src/bee-map.ts
- **Commit:** ec5bf99 (included in Task 1 commit)

## TypeScript Compile Status

Both tasks compile cleanly: `npx tsc --noEmit` exits 0 with no errors. Vite production build succeeds.

## Self-Check: PASSED

- frontend/src/bee-map.ts: FOUND
- frontend/src/bee-sidebar.ts: FOUND
- Commit ec5bf99 (Task 1): FOUND
- Commit a6f6c26 (Task 2): FOUND
- Key symbols in bee-map.ts: _isRestoringFromHistory, buildSearchParams, parseUrlParams, _pushUrlState, _onPopState, disconnectedCallback — all present
- All six restore properties in bee-sidebar.ts: restoredTaxonInput, restoredTaxonRank, restoredTaxonName, restoredYearFrom, restoredYearTo, restoredMonths — all present
