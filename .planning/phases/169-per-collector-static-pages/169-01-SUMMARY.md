---
phase: 169-per-collector-static-pages
plan: 01
subsystem: data-pipeline
tags: [collectors, export, duckdb, parquet, json, pipeline]
dependency_graph:
  requires:
    - data/dbt/target/sandbox/occurrences.parquet (Phase 167: collector_inat_login column)
    - public/data/species.parquet (species-export step)
  provides:
    - data/collectors_export.py (export step)
    - public/data/collectors.json (committed artifact, 124 collectors)
  affects:
    - data/run.py (STEPS registration)
    - .gitignore (negation rule for collectors.json)
tech_stack:
  added: []
  patterns:
    - DuckDB parquet aggregation (places_export.py clone)
    - pytest golden-fixture with pyarrow in-memory parquet
    - gitignore negation rule for committed build artifact
key_files:
  created:
    - data/collectors_export.py
    - data/tests/test_collectors_export.py
    - public/data/collectors.json
  modified:
    - data/run.py
    - .gitignore
decisions:
  - "Used MIN(COALESCE(recordedBy, '@'||collector_inat_login)) for display_name (D-04 resolution)"
  - "Sample count formula: COUNT(DISTINCT sample_id) + COUNT(DISTINCT CASE WHEN source='waba_sample' THEN observation_id END) (Research #3)"
  - "Status split keyed on specific_epithet IS NOT NULL in species.parquet, NOT id_date (D-07)"
  - "Copied sandbox occurrences.parquet to EXPORT_DIR before running export (stale public/data parquet lacked collector_inat_login)"
metrics:
  duration_seconds: 210
  completed_date: "2026-06-25"
  tasks_completed: 3
  files_changed: 5
---

# Phase 169 Plan 01: Collectors Export Data Foundation Summary

**One-liner:** DuckDB aggregation export producing `collectors.json` — 124 gated WABA collectors with specimen/sample/species counts and identified/awaiting status split via `specific_epithet IS NOT NULL` in `species.parquet`.

## What Was Built

A `collectors_export.py` pipeline step that reads `occurrences.parquet` and `species.parquet` from `EXPORT_DIR`, runs a single DuckDB aggregation query (D-01 gate + D-03 counts + D-04 display name + D-05/D-06/D-07 status split), and writes `public/data/collectors.json`. The step is registered in `data/run.py` STEPS after `places-export`.

`public/data/collectors.json` is committed as a build artifact (like `places.json`) via a `.gitignore` negation rule, so `npm test` and `npm run build` pass on a clean checkout without running the full data pipeline.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Golden-fixture pytest (RED) | 0305346e | data/tests/test_collectors_export.py |
| 2 | collectors_export.py + run.py registration (GREEN) | ff005e46 | data/collectors_export.py, data/run.py |
| 3 | Run export, commit collectors.json + gitignore | 5fb7352c | public/data/collectors.json, .gitignore |

## Verification Results

- `cd data && uv run pytest tests/test_collectors_export.py`: 5/5 PASSED
- `collectors.json` is a JSON array of 124 records (>= 100 floor)
- All records satisfy `status_identified + status_awaiting == status_denominator`
- `git check-ignore public/data/collectors.json` exits non-zero (file is tracked)
- `data/run.py` STEPS lists `collectors-export` after `places-export`
- No `git add -f` used (negation rule handles tracking cleanly)

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Notable Implementation Decisions

1. **Stale occurrences.parquet handling**: The committed `public/data/occurrences.parquet` was stale (36 cols, no `collector_inat_login`). Per Task 3 plan action, copied `data/dbt/target/sandbox/occurrences.parquet` (38 cols, Phase 167+168 mart) into `public/data/` before running the export. The copied parquet was NOT committed (stays gitignored per plan instruction).

2. **waba_specimen in D-01 gate**: Added `waba_specimen` to the `source IN (...)` arm of the WHERE clause (as specified in the plan's action), even though `waba_specimen` adds 0 new collectors today (all 33 `waba_specimen` rows belong to `mylodon` who is also ecdysis-backed). This future-proofs the gate.

## Known Stubs

None. `collectors.json` is fully wired to real dbt mart data. The 124 collector records carry live specimen/sample/species counts and correct status splits.

## Threat Flags

No new security-relevant surface beyond the plan's threat model. `collectors.json` exposes only already-public iNat login handles, display names (from Ecdysis `recordedBy`), and aggregate occurrence counts. No PII beyond what is already public.

## Self-Check

PASSED

- `data/collectors_export.py` exists: YES (created, committed ff005e46)
- `data/tests/test_collectors_export.py` exists: YES (created, committed 0305346e)
- `public/data/collectors.json` exists: YES (committed 5fb7352c)
- `data/run.py` contains `export_collectors_step`: YES
- `.gitignore` contains `!/public/data/collectors.json`: YES
- Pytest 5/5 GREEN: CONFIRMED
- collectors.json length >= 100 (124): CONFIRMED
- Split invariant satisfied for all 124 records: CONFIRMED
