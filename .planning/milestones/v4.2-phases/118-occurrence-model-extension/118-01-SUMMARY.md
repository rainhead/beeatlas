---
phase: 118-occurrence-model-extension
plan: "01"
subsystem: data-pipeline
tags: [dbt, pytest, tdd, red-gate, sources]
dependency_graph:
  requires: []
  provides:
    - data/dbt/models/sources.yml#inat_obs_data
    - data/tests/test_dbt_scaffold.py#_OCCURRENCES_GUARD
    - data/tests/test_dbt_scaffold.py#test_occurrences_source_column
    - data/tests/test_dbt_scaffold.py#test_inat_obs_rows_in_occurrences
    - data/tests/test_dbt_scaffold.py#test_source_no_nulls
    - data/tests/test_species_export.py#test_inat_obs_count_in_species
  affects:
    - data/dbt/models/intermediate/int_combined.sql (Plan 02)
    - data/dbt/models/intermediate/int_species_universe.sql (Plan 03)
tech_stack:
  added: []
  patterns:
    - pytest.mark.skipif guard bound to Path.exists() for RED gate tests
    - dbt source declaration (name + schema + tables)
key_files:
  created: []
  modified:
    - data/dbt/models/sources.yml
    - data/tests/test_dbt_scaffold.py
    - data/tests/test_species_export.py
decisions:
  - inat_obs_data source schema name matches DuckDB schema (inat_obs_data) created by inat_obs_pipeline.py
  - _OCCURRENCES_GUARD reuses same skipif condition as existing inline guards (occurrences.parquet existence)
  - Four new tests fail RED: three BinderException (source column not found), one BinderException (inat_obs_count not found)
metrics:
  duration_minutes: 2
  completed_date: "2026-05-26"
  tasks_completed: 3
  files_modified: 3
requirements_completed: [OCC-01, OCC-02, OCC-03]
---

# Phase 118 Plan 01: RED Gate — inat_obs_data Source Declaration and Test Scaffolding

**One-liner:** dbt `inat_obs_data` source declared and four pytest RED-gate assertions added for source column and inat_obs_count in occurrences/species parquets.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Declare inat_obs_data dbt source | 739557b | data/dbt/models/sources.yml |
| 2 | Add three RED tests for OCC-01 in test_dbt_scaffold.py | 11f7e0a | data/tests/test_dbt_scaffold.py |
| 3 | Add RED test for OCC-02/OCC-03 in test_species_export.py | 651029f | data/tests/test_species_export.py |

## What Was Built

**sources.yml:** Added `inat_obs_data` as the sixth dbt source block (schema: `inat_obs_data`, table: `observations`). This enables `{{ source('inat_obs_data', 'observations') }}` references in Plan 02's `int_combined` ARM 3 and Plan 03's `inat_obs_count_agg` CTE without requiring re-edits to sources.yml later.

**test_dbt_scaffold.py:** Added `_OCCURRENCES_GUARD` (module-level `pytest.mark.skipif` bound to `occurrences.parquet` existence) and three test functions:
- `test_occurrences_source_column` — zero NULL source values in occurrences.parquet (OCC-01)
- `test_inat_obs_rows_in_occurrences` — at least one row with `source = 'inat_obs'` (OCC-01)
- `test_source_no_nulls` — all source values in `('ecdysis', 'waba_sample', 'inat_obs')` (OCC-01)

**test_species_export.py:** Added `test_inat_obs_count_in_species` with `@_SANDBOX_GUARD` — asserts zero NULL `inat_obs_count` rows in species.parquet and `'inat_obs_count' in SPECIES_COLUMNS` (OCC-02/03).

## RED Gate State

All four new tests fail RED as required:
- Three tests in test_dbt_scaffold.py: `BinderException: Referenced column "source" not found` (occurrences.parquet exists but lacks source column)
- One test in test_species_export.py: `BinderException: inat_obs_count column not found` (species.parquet exists but lacks inat_obs_count column)

Tests will transition to GREEN when Plan 02 (int_combined ARM 3 + occurrences.sql) and Plan 03 (int_species_universe + species_export.py) build and run `bash data/dbt/run.sh build`.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes at trust boundaries.

## Self-Check: PASSED

- [x] data/dbt/models/sources.yml modified (739557b)
- [x] data/tests/test_dbt_scaffold.py modified (11f7e0a)
- [x] data/tests/test_species_export.py modified (651029f)
- [x] All four new test names collected by pytest (18 tests total)
- [x] `inat_obs_data` present in sources YAML (`True`)
- [x] Three new tests in test_dbt_scaffold.py fail RED (source column not found)
- [x] One new test in test_species_export.py fails RED (inat_obs_count not found)
