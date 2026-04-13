---
phase: 53-filter-toolbar
plan: "01"
subsystem: frontend
tags: [filter, toolbar, lit, component, ui]
dependency_graph:
  requires: [52-header-component]
  provides: [bee-filter-toolbar component, filter controls in persistent toolbar]
  affects: [bee-atlas.ts, bee-sidebar.ts]
tech_stack:
  added: []
  patterns: [Lit custom element, presenter pattern, event bubbling]
key_files:
  created:
    - frontend/src/bee-filter-toolbar.ts
    - frontend/src/tests/bee-filter-toolbar.test.ts
  modified:
    - frontend/src/bee-atlas.ts
    - frontend/src/bee-sidebar.ts
    - frontend/src/tests/bee-sidebar.test.ts
decisions:
  - bee-filter-toolbar wraps bee-filter-controls rather than duplicating filter logic
  - csv-download event dispatched from toolbar and wired to existing _onDownloadCsv in bee-atlas
  - bee-sidebar retains CollectorEntry type import for FilterChangedEvent interface (still exported from there)
metrics:
  duration_seconds: 173
  completed_date: "2026-04-13"
  tasks_completed: 3
  files_changed: 5
requirements_satisfied: [FILT-08, FILT-09]
---

# Phase 53 Plan 01: Filter Toolbar Component Summary

**One-liner:** New `bee-filter-toolbar` Lit component wraps `bee-filter-controls` with a CSV download button and is wired into `bee-atlas` between the header and map content, with filter controls removed from the sidebar.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Create bee-filter-toolbar component and tests | e494fb2 | frontend/src/bee-filter-toolbar.ts, frontend/src/tests/bee-filter-toolbar.test.ts |
| 2 | Wire toolbar into bee-atlas, remove filter controls from sidebar | 1e408e0 | frontend/src/bee-atlas.ts, frontend/src/bee-sidebar.ts, frontend/src/tests/bee-sidebar.test.ts |
| 3 | Visual and functional verification (checkpoint) | — | Auto-approved (auto_advance=true) |

## What Was Built

- `bee-filter-toolbar.ts`: New Lit component with 7 `@property` declarations (filterState, taxaOptions, countyOptions, ecoregionOptions, collectorOptions, summary, layerMode). Wraps `<bee-filter-controls>` with flex layout, adds CSV download button dispatching `csv-download` CustomEvent. Has `role="toolbar"` for accessibility. Styled with CSS custom properties for theme integration.

- `bee-atlas.ts`: Added `import './bee-filter-toolbar.ts'` and inserted `<bee-filter-toolbar>` element between `<bee-header>` and the content area. Wires `@filter-changed` and `@csv-download` to existing handlers. Removed filterState, countyOptions, ecoregionOptions, collectorOptions, taxaOptions, @filter-changed, @layer-changed, @view-changed bindings from `<bee-sidebar>`.

- `bee-sidebar.ts`: Removed `import './bee-filter-controls.ts'`, removed `filterState`, `countyOptions`, `ecoregionOptions`, `collectorOptions`, `taxaOptions` `@property` declarations, removed `<bee-filter-controls>` element from render. Kept `CollectorEntry` type import (needed for `FilterChangedEvent` interface still exported from this file).

- `bee-sidebar.test.ts`: Removed pre-existing false `boundaryMode` check from DECOMP-01; inverted DECOMP-04 `bee-filter-controls` test to assert sidebar does NOT contain it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing CollectorEntry import after removing filter.ts import**
- **Found during:** Task 2 TypeScript check
- **Issue:** Removing `import type { FilterState, CollectorEntry } from './filter.ts'` broke `FilterChangedEvent` interface which still references `CollectorEntry`
- **Fix:** Added `import type { CollectorEntry } from './filter.ts'` back (type-only import, no side effects)
- **Files modified:** frontend/src/bee-sidebar.ts
- **Commit:** 1e408e0

## Known Stubs

None — all filter dimensions wired through to bee-filter-controls via bee-filter-toolbar.

## Pre-existing Failures (Out of Scope)

3 tests in `bee-table.test.ts` fail before and after these changes (column header count and sort indicator tests). Logged to deferred items — not caused by this plan.

## Threat Flags

None — pure DOM restructuring, no new data flows or trust boundaries.

## Self-Check: PASSED

- [x] frontend/src/bee-filter-toolbar.ts exists
- [x] frontend/src/tests/bee-filter-toolbar.test.ts exists
- [x] Commit e494fb2 exists (Task 1)
- [x] Commit 1e408e0 exists (Task 2)
- [x] bee-filter-toolbar contains @customElement('bee-filter-toolbar')
- [x] bee-filter-toolbar contains filterState, taxaOptions, countyOptions, ecoregionOptions, collectorOptions, summary, layerMode properties
- [x] bee-filter-toolbar contains csv-download, role="toolbar", bee-filter-controls, csv-btn
- [x] bee-atlas.ts contains import './bee-filter-toolbar.ts' and <bee-filter-toolbar element
- [x] bee-sidebar.ts does NOT contain bee-filter-controls
- [x] bee-sidebar.ts does NOT contain filterState as @property
- [x] 42 tests passing in bee-sidebar.test.ts + bee-filter-toolbar.test.ts
