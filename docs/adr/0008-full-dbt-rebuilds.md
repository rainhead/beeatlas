# ADR 0008: Full dbt Rebuilds (Incremental Materialization Rejected)

**Status:** Accepted (v3.4 / Phase 87; migrated from `.planning/RETROSPECTIVE.md`)

---

## Context

Nightly runtime could in principle be reduced with dbt incremental materializations. Two findings closed the question.

## Decision

The pipeline does **full rebuilds**; incremental materialization is **rejected**.

## Rationale / Rejected

- Measured gains from incremental were **below the 30% threshold** set for taking on the added complexity.
- dbt-duckdb 1.10.1 **cannot combine `incremental` with `external` materializations** (upstream issue #74) — and the marts (the largest, slowest items) are external, so they cannot benefit anyway.

## Consequences

- This will tempt anyone optimizing nightly runtime; the answer is "measured, rejected" until the upstream constraint changes and the gain clears the threshold.
- Keeps the transform graph simple: every build is reproducible from source with no incremental-state edge cases.

---

*Source: `.planning/RETROSPECTIVE.md` §v3.4 (preserved at `docs/history/RETROSPECTIVE.md`).*
