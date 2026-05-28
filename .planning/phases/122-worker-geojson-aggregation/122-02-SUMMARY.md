---
phase: 122-worker-geojson-aggregation
plan: "02"
status: complete
tags: [wa-sqlite, performance, benchmark, browser-verification]

key-decisions:
  - "json_group_array rejected: SQLite WASM JSON serialization = 1286 ms (2× worse than baseline); WASM→JS callback overhead (~6.4 μs × 92K = ~600 ms) is the fundamental bottleneck, not table scan"
  - "Pre-serialized geo_blob table: sqlite_export.py uses Python json.dumps to pre-build the JSON blob at export time; worker fetches 1 row, 1 callback"
  - "Covering index (idx_occ_geo) tried and abandoned: index-only scan still ~597 ms because callbacks dominate, not scan"

key-files:
  created: []
  modified:
    - src/sqlite-worker.ts
    - src/features.ts
    - src/tests/build-geojson.test.ts
    - data/sqlite_export.py

requirements-completed: [PERF-GEO-01, PERF-GEO-02, PERF-GEO-03]

duration: checkpoint-gated
completed: 2026-05-28
---

# Phase 122 Plan 02: Browser Benchmark Summary

**SQL geo step reduced 86% (570 ms → 80 ms); tablesReady reduced 73% (930 ms → 250 ms); loading screen 40% faster (1460 ms → 875 ms)**

## Benchmark Results (Firefox, warm WASM cache)

| Step | Phase 121 | Phase 122 | Target | Met? |
|------|-----------|-----------|--------|------|
| WASM instantiate | — | 75 ms | — | — |
| fetch occurrences.db | ~85 ms | 66 ms | — | — |
| open_v2 | ~3 ms | 0 ms | — | — |
| SQL geo agg query | ~570 ms | **80 ms** | < 150 ms | ✅ |
| TextEncoder.encode | ~10 ms | 6 ms | — | — |
| worker tablesReady | ~930 ms | **250 ms** | — | 73% ↓ |
| worker boot (main-thread wall) | ~1460 ms | 575 ms | — | 61% ↓ |
| loadOccurrenceGeoJSON transfer | ~100 ms | **2 ms** | < 10 ms | ✅ |
| decode+build GeoJSON | 35 ms | 91 ms | appears + count | ✅ |
| data-loaded (loading screen) | ~1460 ms | **875 ms** | — | 40% ↓ |

Feature count: 92,802 (matches occurrence count).

## What Was Built / Fixed

Phase 122 Plan 01 originally implemented `json_group_array(json_object(...))` in wa-sqlite to aggregate all rows in one WASM→JS callback. This produced **1286 ms** (2× worse than baseline) because SQLite's WASM JSON serialization is expensive for large result sets.

**Root cause of 560 ms baseline**: WASM→JS callback overhead, not SQL table scan. At ~6.4 μs/callback × 92,802 rows = ~594 ms. This is constant regardless of SQL complexity or indexes. A covering partial index was added and tested; the result was still 597 ms.

**Fix**: Pre-serialize the geo rows at build time in `sqlite_export.py` using Python's native `json.dumps` (fast, not WASM). Stored as a single TEXT row in a new `geo_blob` table. Worker queries `SELECT data FROM geo_blob` → 1 callback → done.

The `features.ts` / `_buildGeoJSONFromRaw` was updated to accept the positional array format `[[lat, lon, ...], ...]` produced by Python's tuple serialization. Tests updated accordingly.

## Functional Verification

- Occurrence dots render on map ✅
- Click interaction → sidebar opens with specimen details ✅
- ArrayBuffer zero-copy transfer confirmed (2 ms for 8.6 MB) ✅

## Tasks Completed

| Task | Description |
|------|-------------|
| Task 1 (auto) | Manifest regenerated; occurrences.db 32.6 MB (includes geo_blob); 542 tests pass |
| Task 2 (human-verify) | Firefox benchmark approved; all targets met |

## Files Modified

- `src/sqlite-worker.ts` — `GEO_BLOB_SQL` replaces `GEO_AGG_SQL`/`GEO_SQL`; 1 callback reads pre-serialized blob
- `src/features.ts` — `_buildGeoJSONFromRaw` accepts `unknown[][]` (positional); `RawOccRow` removed
- `src/tests/build-geojson.test.ts` — test helpers produce positional arrays via `toRow()`
- `data/sqlite_export.py` — creates `geo_blob` table with `json.dumps` at export time

---
*Phase: 122-worker-geojson-aggregation*
*Completed: 2026-05-28*
