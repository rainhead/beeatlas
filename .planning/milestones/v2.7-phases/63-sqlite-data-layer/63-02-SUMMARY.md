---
phase: 63-sqlite-data-layer
plan: 02
subsystem: query-layer
tags: [sqlite, filter, sql, occurrences, unified-schema]

# Dependency graph
requires:
  - phase: 63-01
    provides: Single occurrences table with 25 columns replacing dual ecdysis/samples tables
provides:
  - buildFilterSQL returns { occurrenceWhere } unified clause for occurrences table
  - All query functions (queryAllFiltered, queryTablePage, queryFilteredCounts, queryVisibleIds) use FROM occurrences
  - filter.test.ts updated with occurrenceWhere assertions; all 167 tests pass
affects: [frontend/src/filter.ts, frontend/src/tests/filter.test.ts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Unified occurrenceWhere clause replaces dual ecdysisWhere/samplesWhere; layerMode discriminator (ecdysis_id IS NOT NULL / observation_id IS NOT NULL) applied at query call sites
    - Taxon filter uses SQL null semantics to exclude sample-only rows (no ghost 1=0 clause needed)
    - Year/month filters use direct column comparisons on pre-computed year/month columns (no strftime)
    - Collector filter uses single OR clause combining recordedBy and observer

key-files:
  created: []
  modified:
    - frontend/src/filter.ts
    - frontend/src/tests/filter.test.ts

key-decisions:
  - "buildFilterSQL returns single { occurrenceWhere } unified clause; layerMode discriminator applied at each query call site"
  - "Taxon null semantics: SQL NULL comparison naturally excludes sample-only rows; ghost 1=0 clause removed"
  - "Collector OR pattern: recordedBy IN (...) OR observer IN (...) as single unified clause"

patterns-established:
  - "layerMode discriminator: ecdysis_id IS NOT NULL for specimens, observation_id IS NOT NULL for samples"
  - "occurrenceWhere appended after discriminator: WHERE <discriminator> AND <occurrenceWhere>"

requirements-completed: [OCC-06]

# Metrics
duration: 10min
completed: 2026-04-17
---

# Phase 63 Plan 02: Filter SQL Unified Schema Summary

**Rewrote `buildFilterSQL` to return a single `{ occurrenceWhere }` clause and updated all query functions to query the unified `occurrences` table with `layerMode` discriminator clauses; all 167 tests pass**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-04-17
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `buildFilterSQL` returns `{ occurrenceWhere: string }` replacing `{ ecdysisWhere, samplesWhere }`
- Single `occurrenceClauses[]` array replaces dual `ecdysisClauses`/`samplesClauses` arrays
- Taxon filter uses SQL null semantics (no ghost `1 = 0` clause) — sample-only rows excluded naturally
- Year/month filters use direct `year`/`month` column comparisons (no `strftime`)
- Collector filter uses single `(recordedBy IN (...) OR observer IN (...))` clause
- `queryAllFiltered`, `queryTablePage`, `queryFilteredCounts`, `queryVisibleIds` all query `FROM occurrences` with layerMode discriminators
- `queryAllFiltered` specimens `selectCols` updated to use `lat, lon` (not `longitude, latitude`)
- All filter tests updated for `{ occurrenceWhere }` return shape; ghost and strftime assertions removed
- 167 tests pass (up from 165 in plan 01 due to 2 new queryTablePage discriminator assertions)

## Task Commits

1. **Task 1: Rewrite buildFilterSQL and all query functions** - `2ea9560` (feat)
2. **Task 2: Update filter.test.ts assertions** - `1d1860e` (feat)

## Files Created/Modified

- `frontend/src/filter.ts` - buildFilterSQL unified; all query functions use FROM occurrences
- `frontend/src/tests/filter.test.ts` - All assertions updated for { occurrenceWhere }; discriminator assertions added for queryTablePage

## Decisions Made

- layerMode discriminator applied at each query call site (not inside buildFilterSQL) — keeps buildFilterSQL pure and testable
- Taxon null semantics chosen over ghost clause — simpler and correct per D-04

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

No new security surface introduced. String escaping via `value.replace(/'/g, "''")` preserved for all user-provided string values (taxon, county, ecoregion, collector). Numeric values typed as `number` in FilterState, interpolated directly.

## Self-Check: PASSED

- `frontend/src/filter.ts` exists with `occurrenceWhere` (13 occurrences), no `ecdysisWhere`/`samplesWhere`, 6x `FROM occurrences`
- `frontend/src/tests/filter.test.ts` exists with `occurrenceWhere`, no `ecdysisWhere`/`samplesWhere`, no `1 = 0`, no strftime in buildFilterSQL tests
- Commits `2ea9560` and `1d1860e` exist
- All 167 tests pass; TypeScript compiles cleanly

---
*Phase: 63-sqlite-data-layer*
*Completed: 2026-04-17*
