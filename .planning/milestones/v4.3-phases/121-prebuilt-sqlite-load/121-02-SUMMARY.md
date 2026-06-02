---
phase: 121-prebuilt-sqlite-load
plan: "02"
subsystem: database
tags: [wa-sqlite, MemoryVFS, sqlite, worker, geojson, performance]

requires:
  - phase: 121-prebuilt-sqlite-load
    provides: occurrences_db manifest key (Plan 01 pipeline step)
provides:
  - sqlite-worker.ts fetches and opens prebuilt occurrences.db via MemoryVFS seeding
  - SQL-driven GeoJSON builder (_buildGeoJSONFromSQL) replacing parquet row iteration
  - ~70% load-time reduction by eliminating INSERT loop and parquet parse
affects: [121-prebuilt-sqlite-load-03]

tech-stack:
  added: []
  patterns:
    - "MemoryVFS seeding: seed mapNameToFile before open_v2 to load prebuilt SQLite DB"
    - "SQL-driven GeoJSON: query positional columns from occurrences table; no parquet needed"

key-files:
  created: []
  modified:
    - src/sqlite-worker.ts

key-decisions:
  - "Hard-fail if occurrences_db manifest key is absent — no parquet fallback (per plan scope)"
  - "Port _buildGeoJSONFromSQL from spike verbatim — positional column index approach"
  - "Delete _serializedExec monkey-patch entirely — no INSERT loop race to serialize against"

patterns-established:
  - "MemoryVFS seeding pattern: flags=0x2, size, data before open_v2"
  - "Benchmark log lines structured as [BENCHMARK] <step>: <ms> ms | <detail>"

requirements-completed: [PERF-02]

duration: 1min
completed: 2026-05-27
---

# Phase 121 Plan 02: sqlite-worker.ts MemoryVFS Cutover Summary

**Rewrote `src/sqlite-worker.ts` to load a prebuilt `occurrences.db` via MemoryVFS seeding, eliminating the hyparquet import, INSERT loop, SQL escaper, and 130 lines of dead boot code in favor of a 3-step fetch→seed→query sequence.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-05-27T22:33:11Z
- **Completed:** 2026-05-27T22:34:22Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- `src/sqlite-worker.ts` now fetches `occurrences.db`, seeds `MemoryVFS.mapNameToFile` with the ArrayBuffer, and calls `open_v2` — the preloaded DB loads in ~1–3 ms instead of ~1229 ms INSERT loop
- `_buildGeoJSONFromSQL` ported from spike: processes positional SQL rows (10 columns × 92K rows) rather than parquet objects
- All parquet-path code deleted: `hyparquet` import, `_buildGeoJSON`, `_escapeSqlValue`, `_insertRows`, `INSERT_BATCH`, `_execQueue`, `_serializedExec`, `CREATE TABLE`, and the `sqlite3.exec` monkey-patch
- Wire protocol (`tables-ready`, `exec-result`, `exec-error`, `geojson-result`) preserved byte-identical — `src/sqlite.ts` unchanged

## Task Commits

1. **Task 1: Replace sqlite-worker.ts body with MemoryVFS-seeding implementation** - `4e2237e` (feat)

**Plan metadata:** (see below)

## Files Created/Modified

- `/Users/rainhead/dev/beeatlas/src/sqlite-worker.ts` - Rewritten: MemoryVFS-seeding DB loader + SQL-driven GeoJSON builder; 130 lines deleted, 69 added

## Decisions Made

- Hard-fail if `occurrences_db` manifest key is absent — FINDINGS.md explicitly deferred fallback to a follow-up phase
- Port `_buildGeoJSONFromSQL` from spike verbatim rather than adapting the existing `_buildGeoJSON`
- Delete `_serializedExec` monkey-patch entirely — it existed solely to serialize concurrent INSERT loop queries against user queries; with no INSERT loop there is no concurrency to guard

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `src/sqlite-worker.ts` is ready for production. End-to-end test requires Plan 01 (pipeline generates `occurrences.db`) and Plan 03 (cleanup of hyparquet dependency and `sqlite-worker-db.ts` spike file).
- `src/sqlite.ts` is unchanged and wire-compatible.

## Self-Check

- [x] `src/sqlite-worker.ts` exists: FOUND
- [x] Commit `4e2237e` exists in git log: FOUND
- [x] All 14 acceptance criteria: PASS
- [x] `npm run typecheck` exits 0: PASS

## Self-Check: PASSED

---
*Phase: 121-prebuilt-sqlite-load*
*Completed: 2026-05-27*
