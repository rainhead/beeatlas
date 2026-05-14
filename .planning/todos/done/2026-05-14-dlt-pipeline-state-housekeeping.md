---
created: 2026-05-14
priority: low
context: surfaced during Phase 88 cutover review; not a regression, just unmanaged growth in `data/beeatlas.duckdb`
---

# `_dlt_pipeline_state` table growth and housekeeping

## Problem

dlt writes operational metadata into per-pipeline tables in `data/beeatlas.duckdb`:

- `_dlt_pipeline_state` — one row per pipeline load attempt (rolling state)
- `_dlt_loads` — one row per load
- `_dlt_version` — schema-version tracking

dbt never reads these tables, but they accumulate with every nightly run and they're inside the same DuckDB file the dbt source declarations point at. Currently the only housekeeping is in `data/inaturalist_pipeline.py:173` and `data/waba_pipeline.py:179`, which `DELETE FROM _dlt_pipeline_state WHERE pipeline_name = '...'` on a fresh-bootstrap path (not every run).

This is fine for now — the file is ~117 MB and the dlt tables are a small fraction. But it's worth a once-over to confirm:

1. Growth rate is bounded (does the state table accumulate one row per pipeline per run forever, or does dlt rotate it?)
2. The DELETE-on-fresh-bootstrap pattern in `inaturalist_pipeline.py` / `waba_pipeline.py` is the right pattern (vs. e.g. dlt has a native truncation knob we should use instead)
3. The OTHER three dlt pipelines (`ecdysis_pipeline.py`, `projects_pipeline.py`, `anti_entropy_pipeline.py`) don't need similar housekeeping — or do, and it's silently growing

## Goal

Either confirm "this is fine, no action" (with the audit recorded so the next person doesn't re-investigate), or apply a minimal cleanup pattern uniformly across all five dlt pipelines.

## Scope

- Read dlt's docs on `_dlt_*` table lifecycle: is there an official prune/rotate mechanism?
- Inspect `data/beeatlas.duckdb`: row counts in `_dlt_pipeline_state`, `_dlt_loads`, `_dlt_version` per pipeline; growth trend if any history is recoverable
- Decide on uniform housekeeping pattern (or document that none is needed)
- If action: apply the same DELETE/truncate pattern to all five pipelines, or extract to a shared helper in `data/config.py`

## Risk

Low. Deleting `_dlt_loads` rows from past runs cannot affect future loads (dlt re-reads the destination schema on each invocation). Deleting `_dlt_pipeline_state` for a non-cursor pipeline is also safe (the existing inaturalist/waba paths already do it on bootstrap).

## Out of scope

Migrating the pipelines away from dlt — there's no candidate (API fetching, pagination, retry are all dlt's job).

## Estimated size

Quick task — ~30 minutes investigation + ~30 minutes implementation if any action is taken.

## Status

Pending — deferred from Phase 88. Not blocking anything.
