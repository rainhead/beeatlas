---
status: complete
phase: 260607-s5r
plan: "01"
subsystem: frontend
tags: [table, filter, occurrence-row, rank]
dependency_graph:
  requires: []
  provides: [table-rank-column]
  affects: [src/filter.ts, src/bee-table.ts]
tech_stack:
  added: []
  patterns: [valueFn title-case, JOIN-resolved display field]
key_files:
  created: []
  modified:
    - src/filter.ts
    - src/bee-table.ts
    - src/tests/bee-table.test.ts
    - src/tests/filter-join-execution.test.ts
    - src/tests/filter.test.ts
    - src/tests/occurrence.test.ts
decisions:
  - display_rank placed in OccurrenceRow as JOIN-resolved field (not a mart column), matching display_name pattern exactly
  - valueFn title-cases taxa.rank (lowercase 'species' -> displayed 'Species')
  - nullLabel 'No Determination' matches Species column for consistent null-determination UX
metrics:
  duration: ~8 minutes
  completed: 2026-06-07
  tasks_completed: 2
  files_modified: 6
---

# Phase 260607-s5r Plan 01: Add Rank Column to Occurrences Table Summary

Adds `display_rank` field (sourced from `taxa.rank` via existing LEFT JOIN) to all 5 OccurrenceRow-producing query functions in filter.ts, the OccurrenceRow interface, and a new Rank ColumnDef in bee-table.ts's OCCURRENCE_COLUMN_DEFS immediately after Species — closing the `table-rank-column` todo from the Phase 131 human-verify checkpoint.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Resolve display_rank in filter.ts and add OccurrenceRow field | 36eea3b | src/filter.ts, src/tests/occurrence.test.ts |
| 2 | Add Rank column def and update tests | a109970 | src/bee-table.ts, src/tests/bee-table.test.ts, src/tests/filter-join-execution.test.ts, src/tests/filter.test.ts |

## Decisions Made

1. **display_rank follows the display_name pattern exactly** — JOIN-resolved at SELECT time via `t.rank AS display_rank`, not a mart column. No new JOIN required (taxa is already joined for display_name).
2. **valueFn title-cases the rank** — `taxa.rank` stores lowercase strings (e.g. 'species', 'genus'). A simple `charAt(0).toUpperCase() + slice(1)` in valueFn makes the display consistent with other proper nouns in the table without modifying the DB schema.
3. **nullLabel 'No Determination'** — matches the Species column's null label for visual and semantic consistency when taxon_id IS NULL.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added display_rank to occurrence.test.ts BASE_ROW fixture**
- **Found during:** Task 1 (`npx tsc --noEmit`)
- **Issue:** `OccurrenceRow` gained a required `display_rank: string | null` field; the `BASE_ROW` literal in `occurrence.test.ts` did not include it, causing a TypeScript strict-null error (TS2741)
- **Fix:** Added `display_rank: null` to BASE_ROW in `src/tests/occurrence.test.ts`
- **Files modified:** src/tests/occurrence.test.ts
- **Commit:** 36eea3b

## Verification

- `npx tsc --noEmit`: PASSED
- `npx vitest run src/tests/bee-table.test.ts src/tests/filter-join-execution.test.ts src/tests/filter.test.ts`: PASSED (84 tests)
- `npx vitest run` (full suite): 539 passed, 30 skipped; 2 suites fail due to missing `public/data/species.json` (pipeline-generated data file absent from worktree — pre-existing environment limitation, not caused by these changes)

## Self-Check: PASSED

- src/filter.ts: `grep -c "t.rank AS display_rank"` = 5 (confirmed)
- src/filter.ts: `display_rank: string | null` present on OccurrenceRow (confirmed)
- src/bee-table.ts: `dataField: 'display_rank'` present in OCCURRENCE_COLUMN_DEFS (confirmed)
- Commits 36eea3b and a109970 present in git log (confirmed)
