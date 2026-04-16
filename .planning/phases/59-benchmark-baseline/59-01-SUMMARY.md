---
phase: 59-benchmark-baseline
plan: "01"
subsystem: frontend
tags: [benchmark, duckdb, performance, instrumentation]
dependency_graph:
  requires: []
  provides: [benchmark-instrumentation, benchmark-artifact]
  affects: [frontend/src/duckdb.ts]
tech_stack:
  added: []
  patterns: [performance.now-timing, performance.memory-heap-snapshot, console.log-benchmark-prefix]
key_files:
  created:
    - BENCHMARK.md
  modified:
    - frontend/src/duckdb.ts
decisions:
  - "Use inline cast `(performance as unknown as { memory?: { usedJSHeapSize: number } })` to avoid creating a temporary .d.ts file for the Chrome-only API (instrumentation removed in Phase 61)"
  - "Place first-query benchmark after _tablesReadyResolve() call so tablesReady promise resolves before the additional query runs"
  - "Use console.log (not console.debug) for [BENCHMARK] lines so output is visible at default DevTools verbosity"
metrics:
  duration_minutes: 5
  completed_date: "2026-04-16"
  tasks_completed: 1
  tasks_total: 2
  files_changed: 2
---

# Phase 59 Plan 01: Benchmark Baseline Instrumentation Summary

One-liner: Inline `performance.now()` and `performance.memory` instrumentation in duckdb.ts emitting two `[BENCHMARK]` console lines covering WASM instantiate time, tablesReady total time, first-query latency, and heap at three points.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add benchmark instrumentation to duckdb.ts and create BENCHMARK.md | 2aa8dbc | frontend/src/duckdb.ts, BENCHMARK.md |

## Pending Tasks (checkpoint)

| Task | Name | Type | Status |
|------|------|------|--------|
| 2 | Run instrumented app in Chrome and fill in BENCHMARK.md | checkpoint:human-verify | awaiting user |

## What Was Built

**frontend/src/duckdb.ts** received three additions:

1. Module-level `let _benchmarkT0 = 0` — carries the init-start timestamp from `_init()` into `loadAllTables()` across the async boundary.

2. `_heapMB()` helper — casts `performance as unknown as { memory? }` (Chrome-only, no .d.ts file needed) and returns `usedJSHeapSize / 1_048_576`. Returns 0 on non-Chrome browsers.

3. `_init()` instrumentation — captures `t0` and `mem0` before the WASM import, then captures `t1` and `mem1` after `db.instantiate()`. Emits:
   ```
   [BENCHMARK] WASM instantiate: NNN ms | heap: X.X -> Y.Y MB
   ```

4. `loadAllTables()` instrumentation — placed after `_tablesReadyResolve()`, captures `tReady` and `mem2`, runs a fresh connection `SELECT COUNT(*) FROM ecdysis`, emits:
   ```
   [BENCHMARK] tablesReady: NNN ms total from init start | heap after tables: Z.Z MB | first-query latency: N ms
   ```

**BENCHMARK.md** created at repo root with a two-column comparison table (DuckDB WASM Phase 59 baseline | wa-sqlite Phase 61 after migration) and six metric rows. Phase 59 column has `___` placeholders for user to fill after running in Chrome.

## Verification

- `npx tsc --noEmit`: exit 0 (no TypeScript errors; `noUnusedLocals: true` satisfied)
- `npm test`: 165/165 tests pass
- `grep -c '[BENCHMARK]' frontend/src/duckdb.ts`: 2

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- `BENCHMARK.md` DuckDB WASM column contains `___` placeholders — intentional, to be filled by user at Task 2 (checkpoint:human-verify).

## Threat Flags

None. All changes are developer-facing instrumentation with no trust boundary crossings (per plan threat model T-59-01: accepted, no PII).

## Self-Check

- [x] `frontend/src/duckdb.ts` modified and committed: 2aa8dbc
- [x] `BENCHMARK.md` created and committed: 2aa8dbc
- [x] TypeScript compiles cleanly
- [x] All 165 tests pass
- [x] Two `[BENCHMARK]` console.log calls in duckdb.ts

## Self-Check: PASSED
