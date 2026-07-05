# ADR 0005: dbt-duckdb Is the Sole Transform Producer (Contracts as Gates)

**Status:** Accepted (v3.3 GO-WITH-CONDITIONS; migrated from `.planning/v3.3-MILESTONE-AUDIT.md`)

---

## Context

The pipeline previously validated the ingestion→transform boundary at runtime via `_apply_migrations()` + `validate-schema.mjs`. dbt-duckdb offers **source contracts** that fail with a compile-time Binder Error *before any data is written* — strictly stronger than a runtime check.

## Decision

**dbt-duckdb is the sole producer of transformed data**, and the ingestion-vs-transform boundary is a **contract**. The dbt contract on `marts/occurrences` (36 columns as of Phase 160) is enforced at every `bash data/dbt/run.sh build`; there is no separate JS schema validator. The runtime `_apply_migrations()` / `validate-schema.mjs` machinery is retired.

The full decision, with its five prerequisites, is the **GO-WITH-CONDITIONS verdict** in [docs/history/v3.3-MILESTONE-AUDIT.md](../history/v3.3-MILESTONE-AUDIT.md).

## Consequences

- A contract violation is a Binder Error at build time, not a bad artifact discovered downstream.
- Ingestion (landing external data) and transformation (dbt models) are separated by a typed contract; changing a mart's shape means changing the contract deliberately.
- Column-set changes are coordinated through the contract (e.g. Phase 131 dropped denormalized rank-string columns; Phase 160 dropped scalar `place_slug` for the many-to-many bridge — see [ADR 0006](0006-many-to-many-place-model.md)).

---

*Source: [docs/history/v3.3-MILESTONE-AUDIT.md](../history/v3.3-MILESTONE-AUDIT.md); [docs/history/RETROSPECTIVE.md](../history/RETROSPECTIVE.md) §v3.4.*
