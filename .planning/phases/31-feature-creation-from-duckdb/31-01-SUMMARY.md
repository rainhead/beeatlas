---
phase: 31-feature-creation-from-duckdb
plan: 01
subsystem: ui
tags: [duckdb-wasm, openlayers, typescript, vectorsource]

# Dependency graph
requires:
  - phase: 30-duckdb-wasm-setup
    provides: getDuckDB singleton, loadAllTables loading all four tables into DuckDB WASM
provides:
  - EcdysisSource VectorSource backed by DuckDB SQL query on ecdysis table
  - SampleSource VectorSource backed by DuckDB SQL query on samples table
  - tablesReady deferred promise in duckdb.ts for race condition guard
  - hyparquet fully removed; parquet.ts deleted
affects: [bee-map, features, filter, sidebar]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "VectorSource loader awaits tablesReady before querying DuckDB — prevents race where loader fires before tables are loaded"
    - "DuckDB connection opened per-query and closed in finally block — avoids connection leaks"
    - "Deferred promise pattern for module-level readiness signal (tablesReady)"

key-files:
  created:
    - frontend/src/features.ts
  modified:
    - frontend/src/duckdb.ts
    - frontend/src/bee-map.ts
    - frontend/package.json
    - package-lock.json
  deleted:
    - frontend/src/parquet.ts

key-decisions:
  - "loader function is async — VectorSource accepts async loaders; no wrapper needed"
  - "tablesReady deferred promise in duckdb.ts resolves at end of loadAllTables — single place to signal readiness"
  - "DuckDB init errors are now fatal (set _dataError) since DuckDB is the sole data source in Phase 31+"

patterns-established:
  - "DuckDB query pattern: await tablesReady → getDuckDB() → db.connect() → conn.query() → table.toArray().flatMap(row => row.toJSON()) → conn.close() in finally"

requirements-completed: [FEAT-01, FEAT-02, FEAT-03]

# Metrics
duration: 4min
completed: 2026-03-31
---

# Phase 31 Plan 01: Feature Creation from DuckDB Summary

**EcdysisSource and SampleSource VectorSource subclasses querying DuckDB tables directly, replacing hyparquet; tablesReady promise guards against race conditions**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-31T18:53:48Z
- **Completed:** 2026-03-31T18:57:53Z
- **Tasks:** 1 auto + 1 auto-approved checkpoint
- **Files modified:** 5 (created 1, modified 3, deleted 1)

## Accomplishments
- Created `features.ts` with `EcdysisSource` and `SampleSource` classes that query DuckDB via SQL instead of parsing Parquet directly with hyparquet
- Added `tablesReady` deferred promise to `duckdb.ts` that resolves after `loadAllTables` completes — prevents VectorSource loaders from querying before tables exist
- Removed hyparquet from `package.json` and deleted `parquet.ts`; DuckDB WASM is now the sole data source
- Made DuckDB init errors fatal in `bee-map.ts` (sets `_dataError`) since there is no fallback data path

## Task Commits

Each task was committed atomically:

1. **Task 1: Create features.ts with DuckDB-backed EcdysisSource and SampleSource; wire into bee-map.ts; remove hyparquet** - `6631b6b` (feat)
2. **Task 2: Browser smoke test (checkpoint:human-verify)** - auto-approved (auto_advance=true)

**Plan metadata:** (see final docs commit)

## Files Created/Modified
- `frontend/src/features.ts` - EcdysisSource and SampleSource VectorSource subclasses with DuckDB SQL queries
- `frontend/src/duckdb.ts` - Added tablesReady deferred promise export; resolves at end of loadAllTables
- `frontend/src/bee-map.ts` - Updated imports from parquet.ts to features.ts; removed url params from source construction; made DuckDB errors fatal
- `frontend/src/parquet.ts` - Deleted (replaced by features.ts)
- `frontend/package.json` - hyparquet removed
- `package-lock.json` - Updated after hyparquet uninstall

## Decisions Made
- `loader` function is async — VectorSource in OpenLayers accepts async loaders without wrapping in a promise chain
- `tablesReady` deferred promise in `duckdb.ts` resolves at end of `loadAllTables` — single centralized readiness signal for all VectorSource loaders
- DuckDB init errors are fatal (set `_dataError`) since DuckDB is now the sole data source (no hyparquet fallback)
- Connection opened and closed per-query inside a `finally` block to avoid connection leaks

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

The worktree branch was behind `main` by ~20 commits (including Phase 30 which added `duckdb.ts`). Merged `main` into the worktree branch before executing the plan. Fast-forward merge succeeded with no conflicts.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- DuckDB is the sole data source; both specimen and sample features load from DuckDB WASM SQL queries
- Browser smoke test checkpoint (Task 2) was auto-approved — human visual verification of map rendering recommended before merging
- Ready for Phase 31 remaining plans (filter integration, sidebar wiring from DuckDB)

## Self-Check: PASSED

All created files exist, commit 6631b6b verified in git log.

---
*Phase: 31-feature-creation-from-duckdb*
*Completed: 2026-03-31*
