# Phase 60: wa-sqlite Integration - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace `duckdb.ts` with a new `sqlite.ts` module: read `ecdysis.parquet` and `samples.parquet` via hyparquet, insert rows into an in-memory wa-sqlite database with batched transactions, and verify all SQL filter/query paths work correctly against the new backend. Fill in the wa-sqlite column in `BENCHMARK.md`. No user-visible changes.

Phase 61 (DuckDB Removal) will remove `@duckdb/duckdb-wasm` from package.json — that is out of scope here.

</domain>

<decisions>
## Implementation Decisions

### SQL Dialect — filter.ts and bee-atlas.ts
- **D-01:** Rewrite DuckDB-specific SQL expressions to SQLite-compatible equivalents in both `filter.ts` and `bee-atlas.ts`. "Without changes" in the roadmap means behavioral correctness, not literal no-edits. The ~4 expression rewrites (year(), month(), strftime() arg order) are in scope.
  - `year(date::TIMESTAMP)` → `CAST(strftime('%Y', date) AS INTEGER)`
  - `month(date::TIMESTAMP)` → `CAST(strftime('%m', date) AS INTEGER)`
  - `strftime(date, '%Y-%m-%d')` → `strftime('%Y-%m-%d', date)` (argument order reversed)
- **D-02:** Rewrite SQL in both files in the same phase — not just filter.ts. bee-atlas.ts has the same DuckDB patterns in `_loadSummaryFromDuckDB` and `_loadCollectorOptions`.
- **D-03:** User wants to review the plan before execution. Planner must produce a plan for user sign-off before executor runs.

### GeoJSON Tables
- **D-04:** Do NOT load counties or ecoregions into SQLite. They are loaded into DuckDB in `loadAllTables()` but nothing in the codebase queries them via SQL — OpenLayers reads GeoJSON directly. Dropping them from the new init path reduces init work.

### Parquet Loading
- **D-05:** Add `hyparquet` back as a dependency. Use it to read parquet files as JS row arrays, then INSERT into wa-sqlite via batched transactions. This is the canonical v2.6 migration path.
- **D-06:** Batch size and transaction strategy are Claude's discretion — optimize for init latency.

### Claude's Discretion
- New module name and file (`sqlite.ts` replacing `duckdb.ts`, or a different name)
- Export surface of the new module (whether to preserve getDuckDB/tablesReady names or introduce a cleaner API)
- Result object format (wa-sqlite returns plain JS, not Apache Arrow — callers need updating)
- wa-sqlite package variant (which build/VFS to use for in-memory operation)
- Batch insert size

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Files being replaced/modified
- `frontend/src/duckdb.ts` — current implementation to replace; study exports (getDuckDB, tablesReady, loadAllTables) and how callers use them
- `frontend/src/filter.ts` — SQL consumer; all DuckDB-specific expressions must be rewritten for SQLite dialect
- `frontend/src/bee-atlas.ts` — SQL consumer; _loadSummaryFromDuckDB and _loadCollectorOptions use DuckDB SQL

### Files being affected (callers)
- `frontend/src/features.ts` — imports getDuckDB, tablesReady; uses conn.query() + Arrow result API
- `frontend/src/bee-atlas.ts` — imports getDuckDB, loadAllTables, tablesReady; heavy Arrow result API usage

### Benchmark artifact
- `BENCHMARK.md` — wa-sqlite column must be filled at end of phase; DuckDB baseline already recorded

### Prior context
- `.planning/phases/59-benchmark-baseline/59-CONTEXT.md` — benchmark structure and measurement methodology

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tablesReady: Promise<void>` pattern — should be preserved in new module (used as a startup gate across filter.ts, features.ts, bee-atlas.ts)
- Test mocks in `frontend/src/tests/` already mock `duckdb.ts` by module path — if the new module has the same path/name these mocks may need updating; if renamed they definitely do

### Established Patterns
- All callers follow: `await tablesReady` → `const db = await getDuckDB()` → `const conn = await db.connect()` → `conn.query(sql)` → `.toArray().map(r => r.toJSON())`
- wa-sqlite does not use the connection/query/Arrow chain — caller code in features.ts, filter.ts, bee-atlas.ts will need updating alongside the new module
- Tests mock `duckdb.ts` at the module level; they don't exercise SQL execution paths, so the SQL rewrites won't be tested by existing tests

### Integration Points
- `bee-atlas.ts:267` — init entry point: `getDuckDB().then(db => loadAllTables(db, DATA_BASE_URL))`
- `bee-atlas.ts` also calls `getDuckDB()` directly in _loadSummaryFromDuckDB (line 308), _loadCollectorOptions (line 371), and a collector JOIN query (line 743)

</code_context>

<specifics>
## Specific Ideas

- User wants to review the plan before execution runs (D-03). The planning step should surface the full SQL rewrite diff for sign-off.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 60-wa-sqlite-integration*
*Context gathered: 2026-04-16*
