# Phase 91: URL State - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-15
**Phase:** 91-url-state
**Areas discussed:** sel= + o= coexistence

---

## sel= + o= coexistence

| Option | Description | Selected |
|--------|-------------|----------|
| `sel=` bounds only | URL contains only sel=west,south,east,north. Re-run bounds query on restore. Matches success criterion and cluster restore pattern. | ✓ |
| `sel=` + `o=` both | URL contains both bounds and explicit occurrence IDs. Exact IDs survive data updates; sidebar renders without a query. Semantic conflict with existing `o=` (point/cluster). URL grows with dense selections. | |

**User's choice:** `sel=` bounds only
**Notes:** Fast pick, no follow-up needed. Consistent with existing `_restoreClusterSelection` precedent and explicit success criterion wording.

---

## Claude's Discretion

- `sel=` URL model: Add `bounds` variant to `SelectionState` union in `url-state.ts` (not discussed — user deferred)
- `_restoreBoundsSelection` implementation mirrors `_restoreClusterSelection`
- `parseParams` bounds validation ranges
- Generation guard on restore path

## Deferred Ideas

- Cluster selection visual feedback (SEL-F02) — not raised in discussion, matched todo
