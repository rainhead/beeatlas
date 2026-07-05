# ADR 0003: Client Query Engine — wa-sqlite + hyparquet (DuckDB-WASM rejected)

**Status:** Accepted (retro-recorded from v1.8 / v2.6; migrated from `.planning/RETROSPECTIVE.md`)

---

## Context

The atlas queries occurrence data entirely client-side (no query server). The engine was initially DuckDB-WASM. DuckDB-WASM's EH bundle was itself chosen to avoid the CloudFront COOP/COEP headers + `SharedArrayBuffer` that its MVP/threaded bundle requires — but it remained heavy for page weight, and a benchmark in v2.6 showed no query advantage over a lighter stack for our workload.

## Decision

The client query engine is **wa-sqlite (in-memory VFS) + hyparquet** (Parquet reader). **DuckDB-WASM is removed and rejected project-wide — do not re-propose it.** (Also recorded in the `project_duckdb_wasm_direction` memory.)

## Consequences

- Smaller page weight; no COOP/COEP header requirement on CloudFront.
- Data is delivered as Parquet + a prebuilt SQLite artifact (see [ADR 0004](0004-prebuilt-sqlite-artifact.md)) and read in-browser.
- Anyone tempted to reach for DuckDB-WASM for a richer SQL surface should treat that as already-decided-against; re-open only with a benchmark that overturns the page-weight verdict.

---

*Source: `.planning/RETROSPECTIVE.md` §v2.6, §v1.8 (preserved at `docs/history/RETROSPECTIVE.md`).*
