# Phase 59: Benchmark Baseline - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Instrument the existing DuckDB WASM init path to capture timing and memory numbers, then record them in a BENCHMARK.md artifact. No user-visible changes. These numbers serve as the comparison baseline for Phase 61 (DuckDB Removal).

</domain>

<decisions>
## Implementation Decisions

### What to Measure
- **D-01:** Capture two timing boundaries: (1) time from `_init()` start to `db.instantiate()` complete (WASM worker startup only), and (2) time from start to `tablesReady` resolve (full data load: both parquets + GeoJSON + 4 tables created). Both are needed to isolate WASM init cost from network/load cost.
- **D-02:** First-query latency = time to execute a fixed SQL query (e.g. `SELECT COUNT(*) FROM ecdysis`) immediately after `tablesReady` resolves. Repeatable and independent of user interaction.

### Memory Measurement
- **D-03:** Use `performance.memory.usedJSHeapSize` (Chrome-only, non-standard). Record at: before init, after `db.instantiate()`, after `tablesReady`. Note explicitly in BENCHMARK.md that this is Chrome-only — not a production metric, just a one-time development measurement.

### Instrumentation Location
- **D-04:** Add `performance.now()` timestamps inline in the production `duckdb.ts` `_init()` and `loadAllTables()` functions. Measures the real app init path (including Vite, worker wiring, etc.). This instrumentation code will be removed in Phase 61 when DuckDB is dropped.

### Artifact
- **D-05:** Record numbers in `BENCHMARK.md` at the repo root. Structured for before/after comparison: Phase 59 fills in the DuckDB baseline column; Phase 61 fills in the wa-sqlite column after migration. The file persists in git between phases.

### Claude's Discretion
- Exact SQL query for first-query latency test (SELECT COUNT(*) or a simple filter — whichever is most representative)
- Whether to `console.log` the measurements as well as recording them manually to BENCHMARK.md
- Number of measurement runs to take (single run is fine for this — not trying to establish statistical confidence)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above.

### Key files
- `frontend/src/duckdb.ts` — the file to instrument; contains `_init()`, `getDuckDB()`, `loadAllTables()`, and the `tablesReady` promise

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tablesReady: Promise<void>` in `duckdb.ts` — the natural completion boundary for full data load; already exported

### Established Patterns
- `performance.now()` for timing is consistent with browser-standard measurement
- All DuckDB init is in `frontend/src/duckdb.ts`; no other files need instrumentation

### Integration Points
- Timing code goes inside `_init()` (around `db.instantiate()`) and `loadAllTables()` (after last table created / before `_tablesReadyResolve()`)
- `BENCHMARK.md` at repo root — new file, filled in manually after running the instrumented app in Chrome

</code_context>

<specifics>
## Specific Ideas

- BENCHMARK.md should have a clear two-column structure: DuckDB WASM (baseline) | wa-sqlite (after migration), with rows for each metric: WASM instantiate time, tablesReady time, first-query latency, heap before init, heap after instantiate, heap after tables ready.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 59-benchmark-baseline*
*Context gathered: 2026-04-16*
