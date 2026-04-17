# BeeAtlas Performance Benchmark

Measures the DuckDB WASM initialization and query path.
Recorded manually from Chrome DevTools console after running `npm run dev`.
All timings: wall-clock milliseconds via `performance.now()`.
Memory: Chrome-only `performance.memory.usedJSHeapSize`, reported in MB.
A fresh connection is opened for the first-query latency measurement.

## Results

| Metric | DuckDB WASM (Phase 59 baseline) | wa-sqlite (Phase 60) |
|--------|---------------------------------|----------------------|
| WASM instantiate time (ms) | 539 | 69 |
| tablesReady total time (ms) | 1941 | 1087 |
| First-query latency (ms) | 613 | 1 |
| Heap before init (MB) | 6.6 | 108.4 |
| Heap after instantiate (MB) | 16.7 | 13.2 |
| Heap after tablesReady (MB) | 18.7 | 76.6 |

| Bundle size, gzip (KB) | 453 | 453 |
| Bundle size, uncompressed (KB) | 3,993 | 3,993 |

## Notes

- Measured on: MacBook Air 10,1 (Apple M1, 8 cores, 16 GB RAM) / Chrome 146.0.7680.178 (arm64) / 2026-04-16
- Network: [local dev server -- no real network latency]
- Data files: ecdysis.parquet, samples.parquet, counties.geojson, ecoregions.geojson
- Bundle size measured via `npm run build` (Vite output) after Phase 61 cleanup. duckdb.ts was already
  orphaned (not imported) before removal, so the Vite bundle never included DuckDB WASM files.
  Bundle size unchanged. The 34 MB reduction is in installed package size (node_modules), not bundle output.
