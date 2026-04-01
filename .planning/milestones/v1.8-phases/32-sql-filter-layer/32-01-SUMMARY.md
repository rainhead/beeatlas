---
phase: 32-sql-filter-layer
plan: 01
subsystem: ui
tags: [duckdb, duckdb-wasm, sql, filter, typescript, openlayers]

# Dependency graph
requires:
  - phase: 31-feature-creation-from-duckdb
    provides: getDuckDB(), tablesReady promise, ecdysis and samples tables loaded in DuckDB WASM
provides:
  - SQL predicate builder (buildFilterSQL) for all 5 filter types
  - Async DuckDB query layer (queryVisibleIds) returning Set<featureId>
  - Mutable visibleEcdysisIds and visibleSampleIds module-level sets
  - Style callbacks using Set.has() visibility checks instead of per-feature JS predicates
affects: 32-02 bee-map-filter-wiring

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SQL WHERE clause builder: FilterState -> ecdysisWhere + samplesWhere strings"
    - "Exported let + setVisibleIds() pattern for module-level mutable sets consumed by style callbacks"
    - "null-set means no filter (show all); non-null Set means filter active (Set.has() gates visibility)"
    - "Local snapshot of exported let for TypeScript null narrowing in loop body"

key-files:
  created: []
  modified:
    - frontend/src/filter.ts
    - frontend/src/style.ts

key-decisions:
  - "Taxon filter ghosts all samples via 1=0 clause — samples table has no taxon columns (D-01 per context)"
  - "visibleEcdysisIds === null means no filter active (show all features); non-null Set means filter running"
  - "Local snapshot (activeEcdysisIds) used inside clusterStyle loop for TypeScript null narrowing"
  - "setVisibleIds() function provided because exported let bindings can only be mutated from declaring module"

patterns-established:
  - "SQL filter pattern: FilterState -> buildFilterSQL() -> queryVisibleIds() -> setVisibleIds() -> source.changed()"
  - "Style callback visibility: null set = show all; Set.has(featureId) = show if member"

requirements-completed: [FILT-01, FILT-02, FILT-03, FILT-04, FILT-05, FILT-06]

# Metrics
duration: 15min
completed: 2026-03-31
---

# Phase 32 Plan 01: SQL Filter Layer (Predicate Builder + Style Callbacks) Summary

**SQL-based filter architecture: buildFilterSQL() + queryVisibleIds() replace per-feature JS matchesFilter(); style callbacks switched to Set.has() visibility checks**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-31T20:44:49Z
- **Completed:** 2026-03-31T20:59:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Removed `matchesFilter()` from filter.ts; replaced with `buildFilterSQL()` producing SQL WHERE clauses for all 5 filter types (taxon, year, month, county, ecoregion)
- Added `queryVisibleIds()` which runs DuckDB queries against ecdysis and samples tables and returns `Set<string>` of visible feature IDs
- Added `visibleEcdysisIds`/`visibleSampleIds` module-level sets plus `setVisibleIds()` mutation function
- Updated `style.ts`: `clusterStyle` uses `activeEcdysisIds.has()`, `sampleDotStyle` uses `visibleSampleIds.has()`; all references to `matchesFilter` and `filterState` removed from style.ts

## Task Commits

1. **Task 1: Add SQL predicate builder and DuckDB query function to filter.ts** - `6acb847` (feat)
2. **Task 2: Update style.ts to use visibleIds.has() instead of matchesFilter()** - `a5009e5` (feat)

## Files Created/Modified

- `frontend/src/filter.ts` - Removed matchesFilter(); added buildFilterSQL(), queryVisibleIds(), visibleEcdysisIds, visibleSampleIds, setVisibleIds()
- `frontend/src/style.ts` - Replaced matchesFilter calls with Set.has() pattern; removed filterState/isFilterActive imports

## Decisions Made

- Used local snapshot `activeEcdysisIds = visibleEcdysisIds` inside `clusterStyle` for TypeScript null narrowing (exported `let` bindings cannot be narrowed directly in loop bodies)
- `setVisibleIds()` function required because TypeScript `let` exports can only be mutated from within the declaring module; external callers (bee-map.ts) must use this setter
- Taxon filter uses `1 = 0` for samples WHERE clause — samples have no taxonomic columns, so all samples are ghosted when taxon filter is active (per D-01 in context decisions)

## Deviations from Plan

None - plan executed exactly as written, with one minor fix for TypeScript null narrowing (Rule 1 - local snapshot pattern in clusterStyle loop).

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript null narrowing for visibleEcdysisIds in loop body**
- **Found during:** Task 2 (style.ts update)
- **Issue:** `visibleEcdysisIds` is `Set<string> | null` exported let; TypeScript reports TS18047 "possibly null" inside loop body even after `hasFilter` guard
- **Fix:** Added `const activeEcdysisIds = visibleEcdysisIds` snapshot at start of clusterStyle; `hasFilter = activeEcdysisIds !== null` narrows correctly for the loop
- **Files modified:** frontend/src/style.ts
- **Verification:** `npx tsc --noEmit` passes (only expected bee-map.ts error for Plan 02 scope)
- **Committed in:** a5009e5 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 TypeScript narrowing bug)
**Impact on plan:** Fix necessary for correct TypeScript compilation. No scope change.

## Issues Encountered

- Worktree was behind main (missing Phase 30/31 changes: duckdb.ts, features.ts). Fast-forward merge of main applied before task execution. No conflicts.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- filter.ts SQL layer complete: `buildFilterSQL`, `queryVisibleIds`, `visibleEcdysisIds`, `visibleSampleIds`, `setVisibleIds` all exported and ready
- style.ts uses Set.has() pattern — style callbacks will work correctly once bee-map.ts calls `queryVisibleIds` and `setVisibleIds`
- Plan 02 (bee-map.ts wiring) can proceed: wire `queryVisibleIds` call into filter change handler, replace `source.changed()` calls with async query → setVisibleIds → source.changed() sequence
- Note: bee-map.ts still has `matchesFilter` import (TS error) — Plan 02 removes this

## Self-Check: PASSED

- frontend/src/filter.ts: FOUND
- frontend/src/style.ts: FOUND
- .planning/phases/32-sql-filter-layer/32-01-SUMMARY.md: FOUND
- Commit 6acb847: FOUND
- Commit a5009e5: FOUND

---
*Phase: 32-sql-filter-layer*
*Completed: 2026-03-31*
