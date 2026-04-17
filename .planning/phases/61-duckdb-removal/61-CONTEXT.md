# Phase 61: DuckDB Removal - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove `@duckdb/duckdb-wasm` from package.json and delete `frontend/src/duckdb.ts`. All callers were migrated to `sqlite.ts` in Phase 60; `duckdb.ts` is now fully orphaned with no imports anywhere in `frontend/src`. Verify tests, TypeScript, and build pass cleanly. Update PROJECT.md tech stack description and record bundle size reduction in BENCHMARK.md.

No user-visible changes.

</domain>

<decisions>
## Implementation Decisions

### PROJECT.md Tech Stack
- **D-01:** Update the tech stack description in PROJECT.md to replace "DuckDB WASM" with "wa-sqlite + hyparquet" — accurately reflects the new data layer.

### Bundle Size Verification
- **D-02:** Run `npm run build` before and after the removal. Add a "Bundle size (gzip)" row to BENCHMARK.md alongside the existing runtime perf data (WASM instantiate, tablesReady, first-query latency). Both the DuckDB baseline and wa-sqlite values should appear in that row.

### Claude's Discretion
- Exact wording of the PROJECT.md tech stack sentence (preserve meaning: static frontend, wa-sqlite + hyparquet replaces DuckDB WASM)
- How to measure gzip bundle size (Vite build output, `du`, or similar)
- Whether to also note total uncompressed build size

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Files to delete
- `frontend/src/duckdb.ts` — the module being removed; confirm no imports remain before deleting

### Files to update
- `frontend/package.json` — remove `@duckdb/duckdb-wasm` from dependencies
- `BENCHMARK.md` — add bundle size row (gzip before/after)
- `.planning/PROJECT.md` — update tech stack description

### Verification baseline
- `.planning/phases/60-wa-sqlite-integration/60-03-SUMMARY.md` — confirms 165 tests passing and all browser paths verified; regression target

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — this is a deletion phase

### Established Patterns
- `frontend/src/duckdb.ts` is already orphaned: no imports from `features.ts`, `filter.ts`, `bee-atlas.ts`, or any test file (all removed in Phase 60)
- No Vite config entries reference DuckDB; `optimizeDeps.exclude` only contains `wa-sqlite`
- `package-lock.json` will need regeneration after `@duckdb/duckdb-wasm` is removed from `package.json`

### Integration Points
- `npm test` — regression gate: 165 tests must continue passing
- `npx tsc --noEmit` — TypeScript clean compile gate
- `npm run build` — bundle output needed for BENCHMARK.md size row

</code_context>

<specifics>
## Specific Ideas

- No specific references — straightforward deletion and verification task.

</specifics>

<deferred>
## Deferred Ideas

- BENCHMARK.md title/intro currently says "Measures the DuckDB WASM initialization and query path" — could be updated to "DuckDB WASM vs wa-sqlite comparison" but not required for this phase.

</deferred>

---

*Phase: 61-duckdb-removal*
*Context gathered: 2026-04-17*
