# ADR 0004: Prebuilt SQLite Artifact + `geo_blob` Pre-serialization

**Status:** Accepted (retro-recorded from v4.3; migrated from `.planning/RETROSPECTIVE.md`)

---

## Context

Client-side query latency was dominated not by SQL but by the **WASM→JS callback cliff**: marshalling rows across the WASM boundary costs ~6.4µs × 92K rows regardless of the query. Optimizing SQL could not move a cost that lives at the boundary.

## Decision

Ship a **prebuilt `occurrences.db` (SQLite)** as a published artifact, with geometry **pre-serialized into a `geo_blob`** column so the client reads rows with minimal per-row marshalling and no client-side geo assembly.

A durable corollary: **target the slower browser** in any performance criterion — Firefox's WASM JIT is ~2× slower than V8, so "fast enough in Chrome" is not the bar.

## Rejected

- `json_group_array` server-side aggregation — built and covered by 12 tests, then rejected: measured ~2× worse than the `geo_blob` approach.

## Consequences

- Query-path cost is bounded by row count crossing the boundary, which the prebuilt DB + blob minimize.
- The DB is an artifact in the publish contract (see [ADR 0002](0002-derived-vs-authoritative-artifacts.md)); it is `derived` (rebuildable from upstream).

---

*Source: `.planning/RETROSPECTIVE.md` §v4.3 (preserved at `docs/history/RETROSPECTIVE.md`).*
