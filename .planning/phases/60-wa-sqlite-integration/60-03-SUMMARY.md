---
plan: 60-03
phase: 60-wa-sqlite-integration
status: complete
started: 2026-04-16
completed: 2026-04-16
key-files:
  created:
    - BENCHMARK.md
---

## What Was Built

Browser E2E verification of the wa-sqlite migration and benchmark recording.

## Self-Check: PASSED

All must-haves verified:
- App loads and renders map with specimen/sample dots ✓
- All filters work (taxon, year, county, ecoregion, collector) ✓
- Table view shows rows, sorts, paginates ✓
- BENCHMARK.md filled with measured wa-sqlite numbers ✓

Two bugs found and fixed during verification:
1. Vite pre-bundled wa-sqlite, breaking WASM URL resolution — fixed via `optimizeDeps.exclude`
2. Concurrent `sqlite3.exec` calls caused Asyncify reentrance corruption (step returned SQLITE_OK=0) — fixed by serializing all exec calls through a microtask queue in `_init()`
3. hyparquet Date objects bound as null — fixed by converting to ISO date strings

## Benchmark Results

| Metric | DuckDB (baseline) | wa-sqlite |
|--------|-------------------|-----------|
| WASM instantiate | 539 ms | 69 ms |
| tablesReady total | 1941 ms | 1087 ms |
| First-query latency | 613 ms | 1 ms |
| Heap before init | 6.6 MB | 108.4 MB |
| Heap after instantiate | 16.7 MB | 13.2 MB |
| Heap after tablesReady | 18.7 MB | 76.6 MB |

wa-sqlite is 8× faster to instantiate, 1.8× faster to reach tablesReady, and 613× faster for first-query. Heap after tablesReady is 4× higher (76 vs 19 MB) due to hyparquet loading full parquet into JS memory before inserting.
