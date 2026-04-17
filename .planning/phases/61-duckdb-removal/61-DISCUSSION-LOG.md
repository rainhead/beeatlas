# Phase 61: DuckDB Removal - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 61-duckdb-removal
**Areas discussed:** PROJECT.md tech stack, Bundle size verification

---

## PROJECT.md Tech Stack

| Option | Description | Selected |
|--------|-------------|----------|
| wa-sqlite + hyparquet | Replace 'DuckDB WASM' with 'wa-sqlite + hyparquet' — accurately reflects the new stack | ✓ |
| Just remove DuckDB WASM | Drop 'DuckDB WASM' from the sentence without naming the replacement explicitly | |
| Claude's discretion | You decide the exact wording | |

**User's choice:** wa-sqlite + hyparquet
**Notes:** Accurate reflection of the new data layer.

---

## Bundle Size Verification

| Option | Description | Selected |
|--------|-------------|----------|
| Add row to BENCHMARK.md | Run npm run build before and after, add a 'Bundle size (gzip)' row to BENCHMARK.md | ✓ |
| Commit message only | Note the before/after sizes in the commit message, no artifact update needed | |
| Claude's discretion | You decide what's sufficient | |

**User's choice:** Add row to BENCHMARK.md
**Notes:** Complement the existing runtime perf comparison with a size comparison in the same artifact.

---

## Claude's Discretion

- Exact wording of the PROJECT.md tech stack sentence
- How to measure gzip bundle size
- Whether to note uncompressed size in addition to gzip

## Deferred Ideas

- BENCHMARK.md intro text update (not required for this phase)
