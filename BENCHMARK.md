# BeeAtlas Performance Benchmark

Measures the DuckDB WASM initialization and query path.
Recorded manually from Chrome DevTools console after running `npm run dev`.
All timings: wall-clock milliseconds via `performance.now()`.
Memory: Chrome-only `performance.memory.usedJSHeapSize`, reported in MB.
A fresh connection is opened for the first-query latency measurement.

## Results

| Metric | DuckDB WASM (Phase 59 baseline) | wa-sqlite (Phase 61 after migration) |
|--------|---------------------------------|---------------------------------------|
| WASM instantiate time (ms) | ___ | ___ |
| tablesReady total time (ms) | ___ | ___ |
| First-query latency (ms) | ___ | ___ |
| Heap before init (MB) | ___ | ___ |
| Heap after instantiate (MB) | ___ | ___ |
| Heap after tablesReady (MB) | ___ | ___ |

## Notes

- Measured on: [machine / Chrome version / date]
- Network: [local dev server -- no real network latency]
- Data files: ecdysis.parquet, samples.parquet, counties.geojson, ecoregions.geojson
