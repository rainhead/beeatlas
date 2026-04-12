---
phase: quick-260412-due
plan: 01
subsystem: frontend/table
tags: [sort, specimen-table, filter, ux]
dependency_graph:
  requires: []
  provides: [specimen-table-sort-controls]
  affects: [frontend/src/filter.ts, frontend/src/bee-table.ts, frontend/src/bee-atlas.ts]
tech_stack:
  added: []
  patterns: [TDD red-green, custom-event-bubbling, Lit property binding]
key_files:
  created: []
  modified:
    - frontend/src/filter.ts
    - frontend/src/bee-table.ts
    - frontend/src/bee-atlas.ts
    - frontend/src/tests/filter.test.ts
    - frontend/src/tests/bee-table.test.ts
decisions:
  - "Sort is DESC-only (no ascending toggle) — simplifies UI, matches use case of 'newest first'"
  - "sortBy resets to 'date' when switching to samples layer — samples have no sort controls"
  - "queryAllFiltered also accepts sortBy so CSV download respects active sort order"
metrics:
  duration: ~10 minutes
  completed: 2026-04-12T17:04:14Z
  tasks_completed: 2
  files_modified: 5
---

# Phase quick-260412-due Plan 01: Re-add Sort Controls to Specimen Tab Summary

**One-liner:** Clickable sort headers on Date and Modified specimen columns with DESC-only sort, state owned by bee-atlas, wired to queryTablePage via sortBy parameter.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add sortBy parameter to queryTablePage and sort type | 310551a | filter.ts, filter.test.ts |
| 2 | Add sort controls to bee-table and wire through bee-atlas | b454713 | bee-table.ts, bee-atlas.ts, bee-table.test.ts |

## What Was Built

- `SpecimenSortBy` type exported from `filter.ts` (`'date' | 'modified'`)
- `SPECIMEN_ORDER_MODIFIED` constant: `modified DESC, recordedBy ASC, fieldNumber ASC`
- `queryTablePage` and `queryAllFiltered` accept optional `sortBy` param (default `'date'`)
- `bee-table` renders clickable `Date` and `Modified` headers in specimen mode with a `▼` indicator on the active column
- `bee-table` dispatches `sort-changed` custom event with `{ sortBy }` on header click
- `bee-atlas` owns `_tableSortBy` state, passes to `bee-table`, handles `sort-changed`, resets page to 1 on sort change
- Sort resets to `'date'` when switching to samples layer

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TABLE-01 test broke after sort indicator added to header text**
- **Found during:** Task 2 GREEN phase
- **Issue:** Existing TABLE-01 test used `toContain('Date')` on exact `textContent?.trim()` values; after adding `▼` indicator span, the Date header text became `"Date▼"` causing the match to fail
- **Fix:** Updated TABLE-01 assertions to use `labels.some(l => l.includes('Label'))` pattern, which tolerates additional characters in header text
- **Files modified:** `frontend/src/tests/bee-table.test.ts`
- **Commit:** b454713

## Known Stubs

None.

## Threat Flags

None. Sort values are constrained to TypeScript union type `'date' | 'modified'` mapped to hardcoded ORDER BY strings — no user input reaches SQL.

## Self-Check: PASSED

- `frontend/src/filter.ts` — modified, exists
- `frontend/src/bee-table.ts` — modified, exists
- `frontend/src/bee-atlas.ts` — modified, exists
- Commit `310551a` — exists
- Commit `b454713` — exists
- 131/132 tests pass (1 pre-existing bee-sidebar failure unrelated to this plan)
