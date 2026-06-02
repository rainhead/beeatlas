---
phase: 109-beepane-v2-unified-occurrence-view
plan: "01"
subsystem: filter/types
tags: [types, query, filter, import-migration]
dependency_graph:
  requires: []
  provides:
    - filter.ts exports DataSummary, TaxonOption, FilterChangedEvent
    - filter.ts exports queryListPage
    - Wave 0 RED tests for UNIFY-01 and PANE-V2-05
  affects:
    - src/bee-pane.ts
    - src/bee-filter-controls.ts
    - src/bee-filter-toolbar.ts
    - src/bee-map.ts
    - src/bee-atlas.ts
tech_stack:
  added: []
  patterns:
    - WHERE intersection (not priority sort) for selection + filter in queryListPage
key_files:
  created: []
  modified:
    - src/filter.ts
    - src/bee-pane.ts
    - src/bee-filter-controls.ts
    - src/bee-filter-toolbar.ts
    - src/bee-map.ts
    - src/bee-atlas.ts
    - src/tests/bee-atlas.test.ts
decisions:
  - FilteredSummary stays in bee-sidebar.ts for now (not migrated in plan 01); bee-map.ts keeps a split import
metrics:
  duration: "3 minutes"
  completed_date: "2026-05-20"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 7
---

# Phase 109 Plan 01: Migrate Shared Types to filter.ts; Add queryListPage Summary

Migrated DataSummary/TaxonOption/FilterChangedEvent from bee-sidebar.ts to filter.ts, added queryListPage with WHERE intersection semantics, updated five import sites, and wrote Wave 0 RED tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write Wave 0 source-scan RED tests | f200ff1 | src/tests/bee-atlas.test.ts |
| 2 | Add types + queryListPage to filter.ts | ec0bccc | src/filter.ts |
| 3 | Update five import sites from bee-sidebar.ts to filter.ts | 488913a | src/bee-pane.ts, src/bee-filter-controls.ts, src/bee-filter-toolbar.ts, src/bee-map.ts, src/bee-atlas.ts |

## What Was Built

### filter.ts additions

Three interface exports moved verbatim from bee-sidebar.ts:
- `DataSummary` — totalSpecimens, speciesCount, genusCount, familyCount, earliestYear, latestYear
- `TaxonOption` — label, name, rank
- `FilterChangedEvent` — complete filter state including elevMin/elevMax/selectedPlace

New query function `queryListPage(f, page, sortBy, selectedEcdysisIds, selectedInatIds, selectionBounds)`:
- Builds WHERE intersection: `(filterWhere) AND (selectionIds)` where selection is AND not priority sort
- Accepts optional selectionBounds for rectangle-draw selections
- Returns `{ rows, total }` paged with PAGE_SIZE=100

### Test changes

Added to bee-atlas.test.ts:
- `UNIFY-01` describe block (4 tests): checks filter.ts source for queryListPage, DataSummary, TaxonOption, FilterChangedEvent exports — all GREEN after Task 2
- `PANE-V2-05` describe block (3 tests): checks bee-filter-panel.ts and bee-sidebar.ts don't exist, no dynamic bee-sidebar imports in bee-atlas.ts — intentionally RED (Wave 0, files deleted in Wave 4)

## Deviations from Plan

### Note: FilteredSummary split import in bee-map.ts

The plan stated `import type { DataSummary } from './filter.ts';` and implied dropping FilteredSummary entirely from bee-map.ts. However, bee-map.ts uses `FilteredSummary` at runtime (in `_emitFilteredSummary()`). `FilteredSummary` is defined in bee-sidebar.ts and not being migrated in this plan.

Resolution (auto-fix Rule 3): Split bee-map.ts import into two lines:
- `import type { DataSummary } from './filter.ts';`
- `import type { FilteredSummary } from './bee-sidebar.ts';`

This is the correct Wave 1 state; FilteredSummary will be migrated or removed when bee-sidebar.ts is deleted in Wave 4.

## Verification Results

- `tsc --noEmit`: 0 errors
- `npm test`: 3 failed (PANE-V2-05 RED as expected), 945 passed, 29 skipped
- UNIFY-01: 4/4 GREEN
- PANE-V2-05: 3/3 RED (correct - these test Wave 4 file deletions)
- grep for `from './bee-sidebar.ts'` in 5 target files: only `FilteredSummary` in bee-map.ts (intentional)

## Known Stubs

None. This plan is type/query infrastructure only; no UI rendering.

## Threat Flags

None. queryListPage uses pre-validated integer arrays (number[]) for IDs, consistent with the T-109-01 mitigation in the threat register.

## Self-Check: PASSED

- src/filter.ts: exists and exports queryListPage, DataSummary, TaxonOption, FilterChangedEvent
- src/tests/bee-atlas.test.ts: contains UNIFY-01 and PANE-V2-05 describe blocks
- Commits f200ff1, ec0bccc, 488913a: all present in git log
