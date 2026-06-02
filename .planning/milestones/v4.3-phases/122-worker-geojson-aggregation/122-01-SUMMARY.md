---
phase: 122-worker-geojson-aggregation
plan: 01
subsystem: frontend/worker
tags: [performance, worker, sqlite, geojson, tdd]
requirements-completed: [PERF-GEO-01, PERF-GEO-02, PERF-GEO-03]

dependency_graph:
  requires:
    - 121-03 (prebuilt SQLite DB in MemoryVFS — occurrences.db fetch path)
  provides:
    - json_group_array aggregate query in sqlite-worker.ts
    - ArrayBuffer zero-copy transfer via postMessage transfer list
    - _buildGeoJSONFromRaw exported from features.ts
    - 12 unit tests in src/tests/build-geojson.test.ts
  affects:
    - src/sqlite-worker.ts
    - src/sqlite.ts
    - src/features.ts

tech_stack:
  added: []
  patterns:
    - json_group_array + json_object for N→1 WASM→JS row reduction
    - ArrayBuffer postMessage transfer list for zero-copy worker→main transfer
    - TextEncoder/TextDecoder for JSON string ↔ ArrayBuffer conversion

key_files:
  created:
    - src/tests/build-geojson.test.ts
  modified:
    - src/sqlite-worker.ts
    - src/sqlite.ts
    - src/features.ts

decisions:
  - Cast self to any for two-arg postMessage (transfer list) in worker — TypeScript's DOM lib does not include the WorkerGlobalScope overload; runtime behavior is correct
  - _buildGeoJSONFromRaw exported with leading underscore — internal but testable without being public API

metrics:
  duration: 16m
  completed: 2026-05-28
  tasks_completed: 3
  files_modified: 4
---

# Phase 122 Plan 01: Worker GeoJSON Aggregation Summary

Replace 92,802-callback SQL geo query with a single `json_group_array` aggregate, transfer the result as a transferable `ArrayBuffer`, and decode + build GeoJSON on the main thread.

## What Was Built

Single-aggregate SQL geo query with zero-copy ArrayBuffer transfer: `json_group_array(json_object(...))` runs entirely inside the SQLite WASM engine (one callback instead of 92,802), the JSON string is encoded via `TextEncoder` into an `ArrayBuffer`, and transferred zero-copy to the main thread via `postMessage` transfer list. The main thread decodes with `TextDecoder` and calls `_buildGeoJSONFromRaw` to produce the same `{ geojson, summary, taxaOptions }` shape as before. The external API of `features.ts` is unchanged.

## Tasks Completed

| Task | Commit | Description |
|------|--------|-------------|
| 1 — Unit tests (TDD RED) | `efe0cf9` | `src/tests/build-geojson.test.ts`: 12 Vitest tests for `_buildGeoJSONFromRaw` — RED state confirmed (missing export) |
| 2 — sqlite-worker.ts rewrite | `b45f0c8` | `GEO_AGG_SQL` with `json_group_array`, single-callback exec, `TextEncoder` → `_geoBuffer: ArrayBuffer`, `postMessage` with transfer list, `_buildGeoJSONFromSQL` deleted |
| 3 — sqlite.ts + features.ts (GREEN) | `2fcd830` | `WorkerMsg.buffer?: ArrayBuffer`, geojson-result resolves with buffer; `_buildGeoJSONFromRaw` exported with named-property access; `loadOccurrenceGeoJSON` decodes ArrayBuffer + calls builder; all 12 tests pass |

## TDD Gate Compliance

- RED gate: `efe0cf9` — `test(122-01): add failing tests for _buildGeoJSONFromRaw (RED gate)` — confirmed failing because `_buildGeoJSONFromRaw` not yet exported
- GREEN gate: `2fcd830` — `feat(122-01): decode ArrayBuffer on main thread; port GeoJSON builder to features.ts` — all 12 tests pass
- REFACTOR: not required (code is clean as written)

## Success Criteria Verification

| Criterion | Status |
|-----------|--------|
| `json_group_array` in `sqlite-worker.ts` | PASS (`grep -c` = 1) |
| `_buildGeoJSONFromSQL` absent from worker | PASS (count = 0) |
| Transfer list in `build-geojson` handler | PASS (transfer comment + variable = 4 hits) |
| `ArrayBuffer\|TextDecoder\|TextEncoder` in `sqlite.ts` | PASS (count = 4) |
| `_buildGeoJSONFromRaw` in `features.ts` | PASS (count = 2) |
| `npm run typecheck` exits 0 | PASS |
| `npm test` exits 0 | PASS (488 pass, 31 skip; 2 pre-existing failures due to missing pipeline data files in worktree) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript: implicit `any` on exec callback `row` parameter**
- **Found during:** Task 2 typecheck
- **Issue:** `sqlite3.exec(db, GEO_AGG_SQL, (row) => {})` — `row` had implicit `any` type
- **Fix:** Added `(row: unknown[])` explicit type annotation
- **Files modified:** `src/sqlite-worker.ts`
- **Commit:** `b45f0c8`

**2. [Rule 1 - Bug] TypeScript: `self.postMessage` with transfer list not callable via DOM lib types**
- **Found during:** Task 2 typecheck
- **Issue:** TypeScript's DOM lib doesn't include the `(message, transferList)` overload for `self.postMessage` in worker context; `DedicatedWorkerGlobalScope` also not in scope
- **Fix:** Cast `self as any` for the two-argument postMessage call; added comment explaining runtime correctness
- **Files modified:** `src/sqlite-worker.ts`
- **Commit:** `b45f0c8`

**3. [Rule 1 - Bug] TypeScript: implicit `any` in test file filter/find callbacks**
- **Found during:** Task 3 typecheck
- **Issue:** Arrow callbacks in `taxaOptions.filter(t => ...)` and `features.find(f => ...)` had implicit `any`
- **Fix:** Added explicit type annotations on callback parameters
- **Files modified:** `src/tests/build-geojson.test.ts`
- **Commit:** `2fcd830`

**4. [Rule 1 - Bug] TypeScript: `Object is possibly 'undefined'` on `features[0]`**
- **Found during:** Task 3 typecheck
- **Issue:** Strict array-index access (`features[0].properties`) requires non-null assertion when `noUncheckedIndexedAccess` is effectively enabled
- **Fix:** Added `!` non-null assertions on `features[0]!` in tests that assert length first
- **Files modified:** `src/tests/build-geojson.test.ts`
- **Commit:** `2fcd830`

## Pre-existing Test Failures (out of scope)

Two test files were failing before this plan and remain failing in the worktree:
- `src/tests/build-output.test.ts` — requires `npm run build` which needs pipeline-generated `public/data/` files not present in the worktree
- `src/tests/data-species.test.ts` — requires `public/data/species.json` pipeline artifact not present in the worktree

These are worktree-isolation failures unrelated to this plan's changes.

## Known Stubs

None — `_buildGeoJSONFromRaw` is fully wired and all return values are correctly typed and sourced from the SQL aggregate.

## Threat Flags

No new threat surface introduced. All changes are internal to the worker→main data pipeline for application-owned SQLite data (not user input).

## Self-Check: PASSED

Files exist:
- `src/tests/build-geojson.test.ts`: EXISTS
- `src/features.ts`: EXISTS (modified)
- `src/sqlite.ts`: EXISTS (modified)
- `src/sqlite-worker.ts`: EXISTS (modified)

Commits exist:
- `efe0cf9`: FOUND
- `b45f0c8`: FOUND
- `2fcd830`: FOUND
