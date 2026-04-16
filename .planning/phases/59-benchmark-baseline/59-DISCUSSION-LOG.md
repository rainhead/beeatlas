# Phase 59: Benchmark Baseline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 59-benchmark-baseline
**Areas discussed:** What to measure, Memory measurement, Artifact format

---

## What to Measure

| Option | Description | Selected |
|--------|-------------|----------|
| Both (instantiate + tablesReady) | Time to db.instantiate() AND time to tablesReady — gives clearest split between WASM init vs network load | ✓ |
| tablesReady only | Single user-visible number; simpler but loses split | |
| Full breakdown | Each individual load step timed; most granular | |

**User's choice:** Both timing boundaries (instantiate complete + tablesReady resolve)
**Notes:** Captures where wa-sqlite wins — could be WASM startup, data load, or both.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed test query after tablesReady | SELECT COUNT(*) or similar immediately after tablesReady — repeatable | ✓ |
| First actual filter result | Time to first user-triggered filter query — more realistic, harder to instrument | |

**User's choice:** Fixed test query after tablesReady

---

## Memory Measurement

| Option | Description | Selected |
|--------|-------------|----------|
| Chrome-only, noted explicitly | performance.memory.usedJSHeapSize, noted as non-standard | ✓ |
| Skip memory | Timing only — memory is informational | |
| DevTools manual | No code; record from Chrome DevTools Memory tab | |

**User's choice:** Use performance.memory.usedJSHeapSize in Chrome, explicitly note it's Chrome-only in BENCHMARK.md

---

## Artifact Format

| Option | Description | Selected |
|--------|-------------|----------|
| BENCHMARK.md in repo root | Markdown, before/after columns, survives to Phase 61 | ✓ |
| frontend/src/benchmarks/ JSON | Structured JSON, more machine-readable | |
| STATE.md / commit message | Simple but lossy and hard to update in Phase 61 | |

**User's choice:** BENCHMARK.md at repo root with before/after column structure

---

| Option | Description | Selected |
|--------|-------------|----------|
| Inline in duckdb.ts production code | performance.now() in real app path; removed in Phase 61 | ✓ |
| Separate benchmark page | Standalone HTML, doesn't measure real app init path | |

**User's choice:** Inline in duckdb.ts

---

## Claude's Discretion

- Exact SQL for first-query latency test
- Whether to also console.log measurements
- Number of runs (single run acceptable)

## Deferred Ideas

None.
