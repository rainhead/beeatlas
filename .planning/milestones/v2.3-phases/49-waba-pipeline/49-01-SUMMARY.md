---
phase: 49
plan: 1
title: "WABA dlt Pipeline"
subsystem: data-pipeline
tags: [dlt, inaturalist, waba, pipeline, incremental]
dependency_graph:
  requires:
    - inaturalist_pipeline.py (pattern reference)
    - data/.dlt/config.toml (config registration)
    - data/run.py (orchestration)
  provides:
    - data/waba_pipeline.py
    - inaturalist_waba_data DuckDB schema (observations, observations__ofvs, observations__observation_projects)
  affects:
    - data/run.py (sequence updated)
    - data/.dlt/config.toml (new source section)
tech_stack:
  added: []
  patterns:
    - dlt RESTAPIConfig with incremental cursor on updated_at
    - field:WABA= iNat v2 API filter (field_id=18116)
    - Aliased imports to avoid load_observations name collision in run.py
key_files:
  created:
    - data/waba_pipeline.py
  modified:
    - data/.dlt/config.toml
    - data/run.py
decisions:
  - "pipeline_name=waba and dataset_name=inaturalist_waba_data kept strictly separate from inaturalist pipeline to prevent cursor collision in _dlt_pipeline_state"
  - "field:WABA= filter hardcoded in waba_pipeline.py (not config-driven); field_id=18116 documented in config.toml comment"
  - "Aliased imports (load_inaturalist_observations / load_waba_observations) in run.py to avoid name collision"
metrics:
  duration_minutes: 5
  completed_date: "2026-04-13"
  tasks_completed: 4
  files_changed: 3
---

# Phase 49 Plan 1: WABA dlt Pipeline Summary

## One-liner

WABA dlt pipeline fetching 1374 iNat observations via `field:WABA=` filter into isolated `inaturalist_waba_data` schema with incremental `updated_at` cursor.

## What Was Built

Created `data/waba_pipeline.py` modeled exactly on `inaturalist_pipeline.py`, using the `field:WABA=` iNaturalist v2 API filter (observation field_id=18116) instead of `project_id`. The pipeline:

- Uses `pipeline_name="waba"` and `dataset_name="inaturalist_waba_data"` — fully isolated from the existing `inaturalist` pipeline
- Applies identical `_transform` (geojson coordinate extraction, observation_projects join rows)
- Uses the same `DEFAULT_FIELDS` including `ofvs` so `observations__ofvs` is populated
- Incremental cursor on `updated_at` starting from `2000-01-01T00:00:00+00:00`
- Registered in `data/.dlt/config.toml` under `[sources.waba]`
- Wired into `data/run.py` STEPS list after `inaturalist`, using aliased imports to avoid name collision

## Smoke Test Results

Pipeline fetched live data successfully:

- `inaturalist_waba_data.observations`: **1374 rows** (matches expected count)
- `inaturalist_waba_data.observations__ofvs`: **1553 rows**
- Pipeline state `waba` row confirmed in `_dlt_pipeline_state`
- All 27 existing pytest tests pass — no regressions

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes at trust boundaries. The new pipeline makes outbound HTTP requests to the existing iNat API endpoint already used by `inaturalist_pipeline.py`.

## Self-Check: PASSED

- [x] `data/waba_pipeline.py` exists
- [x] `data/.dlt/config.toml` has `[sources.waba]` section
- [x] `data/run.py` imports and calls `load_waba_observations`
- [x] `pipeline_name="waba"` in `inaturalist_waba_data._dlt_pipeline_state` after first run
- [x] `SELECT COUNT(*) FROM inaturalist_waba_data.observations__ofvs` returns 1553 (> 0)
- [x] Commits: 0026d89, 9f97962, 863c736
