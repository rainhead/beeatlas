# Phase 48: Column Rename - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 48-column-rename
**Areas discussed:** DuckDB migration, Deployment sequencing

---

## DuckDB Migration

| Option | Description | Selected |
|--------|-------------|----------|
| ALTER TABLE | Run ALTER TABLE ... RENAME COLUMN once against local DuckDB. Fast, in-place, no re-scraping. | ✓ |
| Full reload | Pass --full-refresh to dlt, drops and rebuilds from cached HTML. Safe but slow. | |
| Claude's discretion | Leave it to the planner. | |

**User's choice:** ALTER TABLE
**Notes:** Fast, in-place approach; planner should include this as an explicit migration step.

---

## Deployment Sequencing

| Option | Description | Selected |
|--------|-------------|----------|
| Run pipeline locally first | Run data/run.py with renamed code, regenerate parquet, upload to S3, then push code. No CI break window. | ✓ |
| Accept a CI break window | Push code rename, accept CI failure until next nightly run regenerates S3 parquet. | |
| Use SELECT alias temporarily | Emit host_observation_id as alias of old column in export.py, push code, ALTER TABLE separately. | |

**User's choice:** Run pipeline locally first
**Notes:** Ensures validate-schema.mjs sees host_observation_id in both code and S3 parquet at the same time.

---

## Claude's Discretion

- Commit granularity (single atomic vs per-layer) — left to planner

## Deferred Ideas

None
