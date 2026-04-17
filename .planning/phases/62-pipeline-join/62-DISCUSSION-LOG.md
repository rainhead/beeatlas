# Phase 62: Pipeline Join - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 62-pipeline-join
**Areas discussed:** Old file handling, Spatial join refactor

---

## Old File Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Stop producing them | Remove both old export functions in this phase; frontend breaks until Phase 63 | ✓ |
| Keep producing them temporarily | Both old files continue alongside occurrences.parquet until Phase 63/64/65 cut over | |

**User's choice:** Stop producing them immediately

---

| Option | Description | Selected |
|--------|-------------|----------|
| Update validate-schema.mjs in Phase 62 | Same commit as pipeline change; CI gate stays in sync | ✓ |
| Defer to Phase 63 | Leave schema gate alone until frontend is updated | |

**User's choice:** Update in Phase 62

---

## Spatial Join Refactor

| Option | Description | Selected |
|--------|-------------|----------|
| One big SQL query | Single COPY...TO with full outer join and spatial joins inline; CTEs run once | ✓ |
| Shared Python helper | Extract SQL fragment builder as Python function | |
| Claude's discretion | Leave structure to implementer | |

**User's choice:** One big SQL query

---

| Option | Description | Selected |
|--------|-------------|----------|
| ecdysis.host_observation_id = samples.observation_id | Correct join key | ✓ |
| Different | Some other join key | |

**User's choice:** Confirmed — ecdysis.host_observation_id = samples.observation_id

---

| Option | Description | Selected |
|--------|-------------|----------|
| Ecdysis coordinates preferred | COALESCE(ecdysis.longitude, samples.lon) | ✓ |
| iNat coordinates preferred | COALESCE(samples.lat, ecdysis.latitude) | |
| Claude's discretion | Either | |

**User's choice:** Ecdysis coordinates (more authoritative/precise)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Zero null county/ecoregion | Same assertions as existing exports | ✓ |
| Also assert row counts | Assert total ≥ sum of source tables | |
| Claude's discretion | Implementer decides | |

**User's choice:** Zero null county/ecoregion (same as existing pattern)

---

## Claude's Discretion

- Complete column list for occurrences.parquet
- Whether to compute year/month for sample rows from date
- SQL CTE structure within the single-query constraint

## Deferred Ideas

None.
