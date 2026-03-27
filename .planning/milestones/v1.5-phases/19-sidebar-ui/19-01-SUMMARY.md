---
phase: 19-sidebar-ui
plan: "01"
subsystem: frontend/sidebar-ui
tags: [lit, web-components, region-filter, ui]
dependency_graph:
  requires: []
  provides: [FILTER-03, FILTER-04, FILTER-06]
  affects: [frontend/src/bee-sidebar.ts, frontend/src/bee-map.ts]
tech_stack:
  added: []
  patterns: [datalist-autocomplete, chip-ui, lit-property-binding]
key_files:
  created: []
  modified:
    - frontend/src/bee-sidebar.ts
    - frontend/src/bee-map.ts
decisions:
  - "Boundary toggle reuses .layer-toggle/.toggle-btn/.toggle-btn.active CSS — no new CSS classes needed"
  - "Clear filters button moved from _renderFilterControls() to _renderRegionControls() so it is always visible (covers both filter blocks)"
  - "countyOptions and ecoregionOptions derived as module-level constants from GeoJSON sources at load time — avoids repeated computation"
metrics:
  duration: "5min"
  completed: "2026-03-18"
  tasks_completed: 2
  files_modified: 2
---

# Phase 19 Plan 01: Sidebar Region UI Summary

**One-liner:** Boundary toggle (Off/Counties/Ecoregions), county/ecoregion datalist autocomplete with removable chips, and extended FilterChangedEvent wired between bee-sidebar and bee-map; floating boundary toggle removed from map.

## What Was Built

### Task 1: bee-sidebar.ts — Region UI controls

Extended `FilterChangedEvent` interface with three new fields: `selectedCounties: Set<string>`, `selectedEcoregions: Set<string>`, `boundaryMode: 'off' | 'counties' | 'ecoregions'`.

Added `@property` declarations for parent-driven region state: `boundaryMode`, `countyOptions`, `ecoregionOptions`, `restoredCounties`, `restoredEcoregions`.

Added `@state` fields: `_selectedCounties`, `_selectedEcoregions`, `_countyInput`, `_ecoregionInput`.

New render methods:
- `_renderBoundaryToggle()` — three-button toggle reusing existing `.layer-toggle`/`.toggle-btn` CSS exactly
- `_renderRegionControls()` — county and ecoregion datalist inputs plus chip list plus Clear filters button (always visible in both layer modes)
- `_renderRegionChips()` — renders chips for selected counties/ecoregions; shows type badge (`[county]`/`[ecoregion]`) when both types have selections

Extended `_clearFilters()` to reset region state, clear input fields, and set `boundaryMode = 'off'` before dispatching.

Moved Clear filters button from `_renderFilterControls()` to `_renderRegionControls()`.

Removed `regionFilterText` `@property` and `.region-filter-text` CSS rule (Phase 18 stub replaced by chip UI).

Updated `render()` order: boundary toggle, layer toggle, filter controls (specimens only), region controls (always), detail panel.

### Task 2: bee-map.ts — Wiring and cleanup

Added module-level constants: `countyOptions` and `ecoregionOptions` derived from `countySource`/`ecoregionSource` with `new Set()` deduplication (ecoregions: 80 features → 11 unique names).

Removed floating boundary toggle `<div class="boundary-toggle">` from `render()` template.

Removed `.boundary-toggle`, `.boundary-toggle .btn`, `.boundary-toggle .btn.active`, `.boundary-toggle .btn:hover:not(.active)` CSS from static styles.

Added `@state _restoredCounties` and `@state _restoredEcoregions`.

Updated `_applyFilter()` to handle `detail.selectedCounties`, `detail.selectedEcoregions`, and `detail.boundaryMode` (calls `_setBoundaryMode()` when mode changes, triggers `sampleSource.changed()` and `regionLayer.changed()`). Mirrors region state to sidebar restore props.

Updated `_onPolygonClick()` to set `_restoredCounties`/`_restoredEcoregions` so sidebar chips reflect polygon clicks. Removed `_regionFilterText` assignment.

Updated `_clearRegionFilter()` to set `_restoredCounties = new Set()` / `_restoredEcoregions = new Set()`. Removed `_regionFilterText` assignment.

Updated `_restoreFilterState()` to mirror parsed region state to `_restoredCounties`/`_restoredEcoregions`.

Updated `firstUpdated()` to set `_restoredCounties`/`_restoredEcoregions` from URL params.

Added `.boundaryMode`, `.countyOptions`, `.ecoregionOptions`, `.restoredCounties`, `.restoredEcoregions` bindings to `<bee-sidebar>` template.

Removed `.regionFilterText` binding, `_regionFilterText` `@state`, and `_buildRegionFilterText()` method entirely.

## Decisions Made

1. **Boundary toggle reuses existing CSS** — `.layer-toggle`/`.toggle-btn`/`.toggle-btn.active` already match the design spec for the boundary toggle; no new CSS classes introduced.
2. **Clear filters moved to region controls** — since region controls are always visible (both layer modes), placing the single Clear filters button there makes it cover all filter blocks (taxon + date + region) without duplication.
3. **Option lists as module-level constants** — derived once at module load from GeoJSON sources; avoids recomputing on every render and ensures the ecoregion `new Set()` deduplication runs exactly once.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npm run build` exits 0 (TypeScript type-check + Vite bundle)
- No references to `_regionFilterText`, `_buildRegionFilterText`, or `.region-filter-text` remain in any source file
- No `.boundary-toggle` CSS or template remains in bee-map.ts
- `FilterChangedEvent` interface has `selectedCounties`, `selectedEcoregions`, `boundaryMode` fields
- `bee-sidebar.ts` contains all acceptance criteria elements

## Self-Check: PASSED

Files verified:
- `/Users/rainhead/dev/beeatlas/frontend/src/bee-sidebar.ts` — FOUND
- `/Users/rainhead/dev/beeatlas/frontend/src/bee-map.ts` — FOUND

Commits verified:
- `a9a33c7` — Task 1 (bee-sidebar.ts)
- `615fc8a` — Task 2 (bee-map.ts)
