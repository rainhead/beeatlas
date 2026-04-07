---
phase: 37-sidebar-decomposition
plan: "02"
subsystem: frontend
tags: [lit, components, decomposition, refactor, coordinator-pattern]
dependency_graph:
  requires:
    - "37-01: bee-filter-controls, bee-specimen-detail, bee-sample-detail sub-components"
  provides:
    - "bee-sidebar: thin layout shell composing three sub-components"
    - "bee-atlas: simplified coordinator with single .filterState binding"
  affects:
    - "frontend/src/bee-sidebar.ts (reduced from 909 lines to 341 lines)"
    - "frontend/src/bee-atlas.ts (removed _getRestoredTaxonInput and 8 restored* bindings)"
tech_stack:
  added: []
  patterns:
    - "Coordinator passes single filterState object instead of 8+ individual restored* properties"
    - "Thin layout shell pattern: bee-sidebar contains only layout/toggle/summary logic; all filter and detail logic delegated to sub-components"
    - "Event bubbling through shadow DOM: filter-changed, close events bubble composed:true through sub-components to bee-atlas"
key_files:
  created: []
  modified:
    - frontend/src/bee-sidebar.ts
    - frontend/src/bee-atlas.ts
decisions:
  - "bee-sidebar keeps _renderSummary, _renderRecentSampleEvents, _renderToggle — these are layout-level concerns that don't belong in a sub-component"
  - "bee-sidebar render() omits _renderBoundaryToggle — boundary toggle was already duplicated in bee-filter-controls which renders it inline; old bee-sidebar called _renderBoundaryToggle separately before the layer toggle"
  - "Auto-approved checkpoint:human-verify (AUTO_CFG=true)"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-04T21:28:49Z"
  tasks_completed: 1
  files_created: 0
  files_modified: 2
---

# Phase 37 Plan 02: Bee-Sidebar Refactor to Thin Layout Shell Summary

bee-sidebar.ts refactored from 909-line monolith with embedded filter/detail logic into a 341-line thin layout shell that composes three sub-components from Plan 01. bee-atlas.ts simplified from 8+ `restored*` property bindings to a single `.filterState` binding.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Refactor bee-sidebar to thin layout shell, update bee-atlas bindings | 5bcd348 |
| 2 | Visual verification (auto-approved, AUTO_CFG=true) | — |

## What Was Built

### bee-sidebar.ts (341 lines, down from 909)

Thin layout shell that:
- Imports and composes `bee-filter-controls`, `bee-specimen-detail`, `bee-sample-detail`
- Keeps `@property filterState: FilterState` (single source of truth from coordinator)
- Retains `boundaryMode`, `countyOptions`, `ecoregionOptions` as pass-through props for `bee-filter-controls`
- Keeps `_renderToggle`, `_onToggleLayer`, `_renderRecentSampleEvents`, `_renderSummary` — layout-level concerns
- Removed all `restored*` @property declarations (8 properties deleted)
- Removed all filter `@state` fields (10 fields deleted)
- Removed `updated()` restore logic — `bee-filter-controls` handles URL/popstate restore internally
- Removed all filter handler methods (~15 methods deleted)
- Removed `_renderFilterControls`, `_renderDetail`, `_renderSampleDotDetail`, `_renderBoundaryToggle`, `_renderRegionChips`, `_renderRegionControls`

### bee-atlas.ts

- Deleted `_getRestoredTaxonInput()` method
- Replaced 8 `restored*` property bindings + `_getRestoredTaxonInput()` call with single `.filterState=${this._filterState}` binding
- Total bee-sidebar binding reduced from 18 lines to 14 lines

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All rendered data flows from typed Lit properties. No hardcoded placeholder data.

## Threat Flags

None. Pure structural refactor — no new trust boundaries, network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| frontend/src/bee-sidebar.ts exists | FOUND |
| frontend/src/bee-atlas.ts exists | FOUND |
| commit 5bcd348 (Task 1) exists | FOUND |
| bee-sidebar.ts does not contain restored* properties | PASS (grep count: 0) |
| bee-sidebar.ts does not contain filter handler methods | PASS (grep count: 0) |
| bee-sidebar.ts contains bee-filter-controls | PASS |
| bee-sidebar.ts contains bee-specimen-detail | PASS |
| bee-sidebar.ts contains bee-sample-detail | PASS |
| bee-sidebar.ts contains @property filterState | PASS |
| bee-atlas.ts does not contain _getRestoredTaxonInput | PASS (grep count: 0) |
| bee-atlas.ts contains .filterState=${this._filterState} | PASS |
| npx tsc --noEmit exits 0 | PASS |
| npm test --run: 26/26 tests pass | PASS |
