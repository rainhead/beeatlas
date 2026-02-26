---
phase: 04-filtering
plan: 02
subsystem: ui
tags: [lit, typescript, filtering, openlayers, custom-events, datalist, web-components]

# Dependency graph
requires:
  - phase: 04-filtering/04-01
    provides: FilterState singleton, isFilterActive, matchesFilter predicates, clusterStyle ghosting
  - phase: 03-core-map
    provides: BeeSidebar, BeeMap, buildSamples, computeSummary, specimen clustering infrastructure
provides:
  - Filter controls UI in BeeSidebar (taxon datalist, year From/To inputs, 12 month checkboxes, clear button)
  - FilteredSummary display in sidebar stats ("X of Y" counts when filter active, plain totals otherwise)
  - TaxonOption, FilteredSummary, FilterChangedEvent exported interfaces
  - filter-changed CustomEvent dispatched from BeeSidebar on every filter state change
  - buildTaxaOptions() in BeeMap building sorted family/genus/species option list from loaded features
  - _applyFilter() in BeeMap mutating filterState singleton and repainting map via clusterSource.changed()
  - Singleclick handler filtered to matching specimens only; ghosted clusters produce no sidebar update
affects: [04-filtering plans 03+, future UI work, end-to-end filter flow verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CustomEvent<FilterChangedEvent>('filter-changed') dispatched from BeeSidebar, handled by @filter-changed listener in BeeMap render template"
    - "Datalist + text input for taxon autocomplete: user picks a label string, change handler resolves to TaxonOption.name + rank"
    - "year inputs use @change (not @input) to avoid mid-keystroke filtering"
    - "month checkboxes build a Set<number>; empty Set = no month filter"
    - "_applyFilter clears selectedSamples on filter change to dismiss any open cluster detail"

key-files:
  created: []
  modified:
    - frontend/src/bee-sidebar.ts
    - frontend/src/bee-map.ts

key-decisions:
  - "taxon datalist uses change event (not input) to resolve TaxonOption by label — prevents partial-match false positives mid-keystroke"
  - "year inputs use change event (not input) — avoids filtering mid-keystroke while user types a 4-digit year"
  - "_applyFilter always clears selectedSamples — applying any filter dismisses the open cluster detail panel"
  - "buildTaxaOptions sorts alphabetically within each rank group (families, then genera, then species) matching plan specification"
  - "filteredSummary is null when no filter is active — avoids allocating an object on every render"

patterns-established:
  - "BeeSidebar dispatches filter-changed bubbling+composed CustomEvent; BeeMap handles it with @filter-changed in Lit template"
  - "taxon disambiguation: datalist value = label string; change handler finds TaxonOption by label, extracts .name and .rank"

requirements-completed: [FILTER-01, FILTER-02]

# Metrics
duration: 2min
completed: 2026-02-22
---

# Phase 4 Plan 02: Filter Controls UI and Map Wiring Summary

**Taxon datalist autocomplete, year range inputs, and month checkboxes wired end-to-end: BeeSidebar dispatches filter-changed events, BeeMap mutates filterState singleton and repaints clusters, sidebar stats show "X of Y" filtered counts**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-02-22T17:20:19Z
- **Completed:** 2026-02-22T17:22:32Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Restructured `bee-sidebar.ts` to always render filter controls at top (taxon datalist, year From/To, 12 month checkboxes, clear button), followed by summary/detail content; exports TaxonOption, FilteredSummary, FilterChangedEvent interfaces
- Added `_dispatchFilterChanged()` and filter event handlers in BeeSidebar; every filter state change dispatches a bubbling+composed `filter-changed` CustomEvent with full FilterChangedEvent payload
- Updated `_renderSummary()` to show "X of Y" counts (Specimens, Species, Genera, Families) when filteredSummary.isActive, plain totals otherwise
- Updated `bee-map.ts` with `buildTaxaOptions()` (families/genera/species sorted alphabetically), `_applyFilter()` method that mutates filterState, triggers OL repaint, recomputes filteredSummary
- Updated singleclick handler to filter inner cluster features when filter is active; returns early if zero matching features (ghosted cluster click is a no-op)
- Verified TypeScript compilation and Vite production build both exit 0 with no errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Restructure bee-sidebar.ts — add filter controls and filtered summary** - `3c406af` (feat)
2. **Task 2: Update bee-map.ts — build taxaOptions, handle filter events, filter click results** - `ac86043` (feat)

**Plan metadata:** (docs commit — see final_commit below)

## Files Created/Modified

- `frontend/src/bee-sidebar.ts` - Added filter controls UI, new exported interfaces (TaxonOption, FilteredSummary, FilterChangedEvent), new @property bindings, internal @state for filter inputs, filter-changed CustomEvent dispatch, "X of Y" summary stats
- `frontend/src/bee-map.ts` - Added buildTaxaOptions(), _applyFilter(), filtered singleclick handler, new @state properties (taxaOptions, filteredSummary), updated render() template to bind new props and handle filter-changed event

## Decisions Made

- taxon datalist uses `change` event to resolve TaxonOption by label — prevents partial-match false positives mid-keystroke
- year inputs use `change` event (not `input`) — avoids filtering while the user types a 4-digit year
- `_applyFilter` always clears `selectedSamples` — applying any filter dismisses the open cluster detail panel
- `buildTaxaOptions` sorts alphabetically within each rank group (families, then genera, then species)
- `filteredSummary` is `null` when no filter is active — avoids allocating an object when unneeded

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Filter controls are fully wired end-to-end: UI → CustomEvent → filterState mutation → OL repaint → filtered sidebar stats
- Ghosted cluster click correctly produces no sidebar update
- Ready for end-to-end manual verification in the browser (Phase 4 plan 03 or final verification checkpoint)

## Self-Check: PASSED

- FOUND: `frontend/src/bee-sidebar.ts` (modified)
- FOUND: `frontend/src/bee-map.ts` (modified)
- FOUND: `.planning/phases/04-filtering/04-02-SUMMARY.md` (this file)
- FOUND commit `3c406af` (Task 1 — bee-sidebar.ts)
- FOUND commit `ac86043` (Task 2 — bee-map.ts)

---
*Phase: 04-filtering*
*Completed: 2026-02-22*
