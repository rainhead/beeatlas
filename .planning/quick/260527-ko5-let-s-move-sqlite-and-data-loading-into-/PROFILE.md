# SQLite Worker Migration — Profiling Results

## Environment

- **Browser:** Headless Chromium (Chrome 136), captured via Chrome DevTools Protocol
- **Machine:** Apple Silicon (arm64, macOS 25.4.0)
- **Occurrences dataset:** 77,544 rows
- **Note:** WebGL not available in headless Chrome, so Mapbox GL fails to init and
  `data-loaded fired` + `long-task` metrics could not be captured in this environment.
  The `tablesReady` timing is the most meaningful proxy for boot-to-data-ready.
- **Note:** `performance.memory` is Chromium-only and is available in headless mode.
  Heap values reflect main-thread heap before/after WASM instantiation. The large heap
  after `tablesReady` (~100 MB) comes from wa-sqlite's in-memory table holding 77 K rows.

## Before (main-thread)

SQLite WASM factory, MemoryVFS, parquet parse, and all INSERTs execute on the **main thread**.

### Run 1

```
[BENCHMARK] WASM instantiate: 53 ms | heap: 11.3 -> 12.1 MB
[BENCHMARK] parquet parse: 263 ms | rows: 77544
[BENCHMARK] INSERT loop: 780 ms | batches: 156
[BENCHMARK] tablesReady: 1951 ms total from init start | heap after tables: 104.1 MB | first-query latency: 1 ms
```

### Run 2

```
[BENCHMARK] WASM instantiate: 47 ms | heap: 15.4 -> 15.4 MB
[BENCHMARK] parquet parse: 257 ms | rows: 77544
[BENCHMARK] INSERT loop: 753 ms | batches: 156
[BENCHMARK] tablesReady: 1486 ms total from init start | heap after tables: 103.3 MB | first-query latency: 1 ms
```

### Run 3

```
[BENCHMARK] WASM instantiate: 51 ms | heap: 15.4 -> 15.3 MB
[BENCHMARK] parquet parse: 248 ms | rows: 77544
[BENCHMARK] INSERT loop: 829 ms | batches: 156
[BENCHMARK] tablesReady: 1195 ms total from init start | heap after tables: 98.7 MB | first-query latency: 1 ms
```

### BEFORE Summary

| Metric | Run 1 | Run 2 | Run 3 | Median |
|--------|-------|-------|-------|--------|
| WASM instantiate (ms) | 53 | 47 | 51 | 51 |
| parquet parse (ms) | 263 | 257 | 248 | 257 |
| INSERT loop (ms) | 780 | 753 | 829 | 780 |
| tablesReady total (ms) | 1951 | 1486 | 1195 | 1486 |
| heap after tables (MB) | 104.1 | 103.3 | 98.7 | 103.3 |
| first-query latency (ms) | 1 | 1 | 1 | 1 |
| data-loaded (ms) | N/A¹ | N/A¹ | N/A¹ | — |
| long-tasks | N/A¹ | N/A¹ | N/A¹ | — |

¹ Requires working WebGL (map render) — not available in headless Chrome.

---

## After (worker)

*To be filled in by the human during Task 3 checkpoint verification.*

---

## Verdict

*To be filled in after AFTER measurements are captured.*
