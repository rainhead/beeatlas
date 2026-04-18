---
phase: 62-pipeline-join
plan: "01"
subsystem: data-pipeline
tags: [tdd, test, schema-gate, occurrences]
dependency_graph:
  requires: []
  provides: [test_export.py occurrences tests, validate-schema.mjs occurrences gate]
  affects: [data/export.py (Plan 02 must implement export_occurrences_parquet)]
tech_stack:
  added: []
  patterns: [DESCRIBE-based schema assertion, monkeypatch ASSETS_DIR, COUNT/SUM null assertion]
key_files:
  created: []
  modified:
    - data/tests/test_export.py
    - scripts/validate-schema.mjs
decisions:
  - Column list in test file and schema gate are identical (25 columns) — single source of truth enforced by acceptance criteria
  - date column asserted as VARCHAR (not DATE) — matches COALESCE of ecdysis event_date string and iNat observed_on cast
metrics:
  duration: "~10 minutes"
  completed: "2026-04-17T16:22:37Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 62 Plan 01: Failing Tests and Schema Gate for occurrences.parquet Summary

Wrote 6 failing RED tests for `export_occurrences_parquet` and updated `validate-schema.mjs` to gate on `occurrences.parquet` with 25 unified columns replacing the two separate ecdysis/samples entries.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace ecdysis/samples tests with occurrences tests | a6ccc94 | data/tests/test_export.py |
| 2 | Update validate-schema.mjs for occurrences.parquet | efbefdf | scripts/validate-schema.mjs |

## What Was Built

**data/tests/test_export.py:** Replaced 8 old test functions (`test_ecdysis_parquet_schema`, `test_ecdysis_parquet_has_specimen_observation_id`, `test_ecdysis_parquet_has_rows`, `test_ecdysis_parquet_elevation_col`, `test_ecdysis_elevation_has_values`, `test_samples_parquet_schema`, `test_samples_parquet_has_rows`, `test_samples_parquet_elevation_col`) and 2 old column constants with 6 new occurrences test functions and `EXPECTED_OCCURRENCES_COLS` (25 columns). The 2 geojson tests are preserved unchanged.

New tests: `test_occurrences_parquet_schema`, `test_occurrences_parquet_has_rows`, `test_occurrences_coalesce_coords`, `test_occurrences_date_format`, `test_occurrences_specimen_only_nulls`, `test_occurrences_sample_only_nulls`.

**scripts/validate-schema.mjs:** Replaced `ecdysis.parquet` + `samples.parquet` EXPECTED dict entries with single `occurrences.parquet` entry carrying all 25 columns. Updated local file detection from `ecdysis.parquet` to `occurrences.parquet`. Updated module docstring. Loop and error handling logic unchanged.

## RED State Confirmed

These 6 tests will fail until Plan 02 implements `export_occurrences_parquet` in `data/export.py`. This is the intended RED state for TDD wave 0.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — test file makes no assumptions about implementation internals; all assertions are against parquet output schema and row contents.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. CI schema gate operates on trusted local checkout.

## Self-Check: PASSED

- data/tests/test_export.py: FOUND (contains `test_occurrences_parquet_schema`, `EXPECTED_OCCURRENCES_COLS`, `test_counties_geojson`, `test_ecoregions_geojson`; does NOT contain `test_ecdysis_parquet_schema` or `EXPECTED_ECDYSIS_COLS`)
- scripts/validate-schema.mjs: FOUND (contains `occurrences.parquet` x3; does NOT contain `ecdysis.parquet` or `samples.parquet`)
- Commit a6ccc94: FOUND
- Commit efbefdf: FOUND
