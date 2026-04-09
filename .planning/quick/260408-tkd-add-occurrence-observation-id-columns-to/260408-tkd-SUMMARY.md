---
phase: quick
plan: 260408-tkd
subsystem: frontend/table
tags: [table, links, ecdysis, inat, filter]
dependency_graph:
  requires: []
  provides: [source-links-in-table]
  affects: [frontend/src/filter.ts, frontend/src/bee-table.ts]
tech_stack:
  added: []
  patterns: [linkFn column definition pattern]
key_files:
  created: []
  modified:
    - frontend/src/filter.ts
    - frontend/src/bee-table.ts
    - frontend/src/tests/bee-table.test.ts
decisions:
  - Used linkFn callback on ColumnDef rather than special-casing by column key — keeps rendering logic generic and extensible
metrics:
  duration: ~5 minutes
  completed: 2026-04-09
  tasks_completed: 2
  files_changed: 3
---

# Quick Task 260408-tkd: Add Occurrence/Observation ID Columns to Tables Summary

**One-liner:** Added clickable "Source" link column to specimen and sample tables using a `linkFn` ColumnDef pattern, linking to ecdysis occurrence and iNaturalist observation pages.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add ID fields to row types and queryTablePage SQL | 15079bf | frontend/src/filter.ts |
| 2 | Add link column rendering to bee-table | 003284c | frontend/src/bee-table.ts, frontend/src/tests/bee-table.test.ts |

## What Was Built

- `SpecimenRow` now includes `ecdysis_id: number` and `SampleRow` includes `observation_id: number`
- `SPECIMEN_COLUMNS` and `SAMPLE_COLUMNS` maps include `ecdysisId`/`observationId` so `queryTablePage` SELECTs these columns
- `ColumnDef` interface extended with optional `linkFn?: (row: any) => string | null`
- "Source" column added as the first column in both `SPECIMEN_COLUMN_DEFS` and `SAMPLE_COLUMN_DEFS`
- Cell renderer checks `linkFn` and renders `<a href=... target="_blank" rel="noopener noreferrer">View</a>` when a URL is returned
- Link CSS added to component styles (`--link` CSS variable with `#1a73e8` fallback; hover underline)
- Column widths adjusted: Species reduced from 28% to 22%, Ecoregion (samples) reduced from 30% to 24% to fit new 6% Source column
- Bee-table tests updated to expect 7 columns and include 'Source' in header assertions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated bee-table tests to match new column count**
- **Found during:** Task 2 verification
- **Issue:** `bee-table.test.ts` hardcoded `expect(headers.length).toBe(6)` — now 7 with Source column added
- **Fix:** Updated both specimen and sample column count assertions to 7; added 'Source' to header label assertions
- **Files modified:** `frontend/src/tests/bee-table.test.ts`
- **Commit:** 003284c

## Known Pre-existing Failures

- `bee-sidebar.test.ts` > `BeeFilterControls has @property declarations for required inputs` — fails on `boundaryMode` property check; pre-dates this task and is out of scope

## Self-Check: PASSED

- `frontend/src/filter.ts` — modified, exists
- `frontend/src/bee-table.ts` — modified, exists
- `frontend/src/tests/bee-table.test.ts` — modified, exists
- Commit `15079bf` — exists
- Commit `003284c` — exists
- TypeScript: no errors
- Tests: 111 passed, 1 pre-existing failure (bee-sidebar/boundaryMode)
