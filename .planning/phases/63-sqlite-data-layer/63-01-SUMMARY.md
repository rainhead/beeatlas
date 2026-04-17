---
phase: 63-sqlite-data-layer
plan: 01
subsystem: database
tags: [sqlite, wa-sqlite, hyparquet, parquet, occurrences]

# Dependency graph
requires:
  - phase: 62-pipeline-join
    provides: occurrences.parquet from full outer join of ecdysis + samples
provides:
  - Single occurrences table in SQLite loaded from occurrences.parquet
  - loadOccurrencesTable export replacing loadAllTables
affects: [frontend query layer, filter.ts, features.ts, bee-atlas.ts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Single unified occurrences table with 25 nullable columns; specimen-side columns null for sample-only rows; sample-side null for specimen-only rows

key-files:
  created: []
  modified:
    - frontend/src/sqlite.ts
    - frontend/src/bee-atlas.ts
    - frontend/src/tests/filter.test.ts
    - frontend/src/tests/bee-atlas.test.ts
    - frontend/src/tests/bee-header.test.ts
    - frontend/src/tests/bee-filter-toolbar.test.ts
    - frontend/src/tests/bee-sidebar.test.ts
    - frontend/src/tests/bee-table.test.ts

key-decisions:
  - "loadOccurrencesTable replaces loadAllTables; single occurrences.parquet replaces ecdysis.parquet + samples.parquet in frontend"

patterns-established:
  - "Unified occurrences table: 25 columns matching validate-schema.mjs EXPECTED array order exactly"

requirements-completed: [OCC-05]

# Metrics
duration: 5min
completed: 2026-04-17
---

# Phase 63 Plan 01: SQLite Data Layer Summary

**Replaced dual ecdysis/samples SQLite tables with single 25-column occurrences table loaded from occurrences.parquet; renamed loadAllTables to loadOccurrencesTable across all call sites and mocks**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-17T16:49:00Z
- **Completed:** 2026-04-17T16:54:18Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- sqlite.ts now creates a single `occurrences` table with 25 columns matching validate-schema.mjs column order exactly
- Single `occurrences.parquet` fetch replaces two separate parquet file fetches
- `loadOccurrencesTable` exported; `loadAllTables` removed entirely
- All 165 frontend tests pass with updated mocks

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace dual tables with single occurrences table in sqlite.ts** - `fac38a4` (feat)
2. **Task 2: Rename loadAllTables to loadOccurrencesTable across all call sites and mocks** - `b9f4cea` (feat)

**Plan metadata:** (docs commit to follow)

## Files Created/Modified
- `frontend/src/sqlite.ts` - Replaced two CREATE TABLE statements + two parquet loads with single occurrences table and occurrences.parquet load; renamed exported function
- `frontend/src/bee-atlas.ts` - Updated import and call site from loadAllTables to loadOccurrencesTable
- `frontend/src/tests/filter.test.ts` - Updated vi.mock key
- `frontend/src/tests/bee-atlas.test.ts` - Updated vi.mock key
- `frontend/src/tests/bee-header.test.ts` - Updated vi.mock key
- `frontend/src/tests/bee-filter-toolbar.test.ts` - Updated vi.mock key
- `frontend/src/tests/bee-sidebar.test.ts` - Updated vi.mock key
- `frontend/src/tests/bee-table.test.ts` - Updated vi.mock key

## Decisions Made
None - followed plan as specified.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SQLite layer now loads from unified occurrences.parquet; ready for plan 02 which updates query layer (filter.ts, features.ts) to use the occurrences table instead of separate ecdysis/samples tables.

---
*Phase: 63-sqlite-data-layer*
*Completed: 2026-04-17*
