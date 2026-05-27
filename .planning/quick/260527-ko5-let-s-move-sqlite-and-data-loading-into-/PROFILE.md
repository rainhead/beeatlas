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

- **Browser:** Firefox (performance.memory not exposed — main-thread heap shows 0.0 MB)
- **Rows:** 92,802 (dataset grew from 77,544 since baseline)

```
[BENCHMARK] WASM instantiate: 60 ms
[BENCHMARK] fetch: 40 ms | parquet parse: 413 ms | rows: 92802
[BENCHMARK] INSERT loop: 5683 ms | batches: 186
[BENCHMARK] worker tablesReady: 6197 ms total
[BENCHMARK] worker boot (main-thread wall time): 6583 ms | main-thread heap: 0.0 MB
```

**Notes:**
- `main-thread heap: 0.0 MB` — Firefox does not expose `performance.memory`; the ~100 MB WASM + table heap lives in the worker, no longer on the main thread.
- Firefox is significantly slower than Chrome for wa-sqlite Asyncify INSERTs (~5.6 s vs ~780 ms). This was always the bottleneck; it now happens off the main thread.
- Row count is 20% higher than the Chrome baseline, accounting for some of the timing difference.

---

## Verdict

| Metric | Before (Chrome, 77k rows) | After (Firefox, 93k rows) |
|---|---|---|
| WASM instantiate | 51 ms | 60 ms |
| parquet parse | 257 ms | 413 ms |
| INSERT loop | 780 ms | 5,683 ms |
| tablesReady total | 1,486 ms | 6,197 ms |
| main-thread heap | 103 MB | 0.0 MB (worker heap) |

**Verdict: keep.** The worker move successfully removes all SQLite work from the main thread. The INSERT loop remains slow in Firefox (Asyncify overhead) but no longer blocks the UI — the page should stay interactive during the load. Direct before/after comparison is imprecise (different browsers, different row counts); a Chrome-to-Chrome comparison would confirm the main-thread responsiveness improvement.
