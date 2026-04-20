---
phase: 066-provisional-rows-in-pipeline
plan: "02"
subsystem: data-pipeline-tests
tags: [tdd, fixtures, test-scaffolding, provisional-rows]
dependency_graph:
  requires: []
  provides:
    - "conftest.py fixture with observations__taxon__ancestors table"
    - "conftest.py fixture with second unmatched WABA observation (id=888888)"
    - "conftest.py fixture with OFV 1718 on waba-obs-2"
    - "test_export.py updated EXPECTED_OCCURRENCES_COLS (host_inat_login + 5 new columns)"
    - "test_export.py test_provisional_rows_appear stub (RED)"
    - "test_export.py test_matched_waba_not_provisional stub (RED)"
  affects:
    - data/tests/conftest.py
    - data/tests/test_export.py
tech_stack:
  added: []
  patterns:
    - "Session-scoped DuckDB fixture extension (new table + seed rows)"
    - "TDD RED stubs: test functions that assert against columns not yet in export.py"
key_files:
  created: []
  modified:
    - data/tests/conftest.py
    - data/tests/test_export.py
decisions:
  - "New test stubs are intentionally RED — export.py restructure in Plan 03 turns them GREEN"
  - "waba-obs-2 fixture uses lon=-120.8, lat=47.5 (inside CHELAN_WKT and NORTH_CASCADES_WKT) so it passes spatial assertions when Plan 03 runs"
  - "OFV 1718 on waba-obs-2 points to inaturalist_data.observations id=999999 (existing fixture row) to exercise the host sample join"
metrics:
  duration: "3 minutes"
  completed: "2026-04-20"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 066 Plan 02: Test Fixture Scaffolding for Provisional Rows Summary

**One-liner:** Extended conftest.py fixture DB with ancestors table and second unmatched WABA observation; updated test_export.py with renamed `host_inat_login` column and two RED integration test stubs.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend conftest.py with ancestors table and new fixture rows | 0c6d186 | data/tests/conftest.py |
| 2 | Update EXPECTED_OCCURRENCES_COLS and add test stubs | 537de7f | data/tests/test_export.py |

## What Was Built

### Task 1: conftest.py fixture extensions

- Added `taxon__name VARCHAR, taxon__rank VARCHAR` columns to `inaturalist_waba_data.observations` CREATE TABLE
- Created new `inaturalist_waba_data.observations__taxon__ancestors` table with `_dlt_root_id`, `rank`, `name`, `_dlt_list_idx`, `_dlt_id`, `_dlt_parent_id`, `_dlt_load_id` columns (follows existing dlt child table pattern)
- Updated waba-obs-1 INSERT to include `taxon__name='Eucera acerba'`, `taxon__rank='species'`
- Added second WABA observation (waba-obs-2): `id=888888`, `user__login='provisionaluser'`, `taxon__name='Osmia'`, `taxon__rank='genus'`, no OFV 18116 (unmatched — will become provisional row)
- Added OFV 1718 on waba-obs-2: `value='https://www.inaturalist.org/observations/999999'` (links to existing iNat host sample)
- Added 4 ancestor rows: genus+family for each WABA observation

**Fixture consistency verified:**
- WABA obs count: 2
- Ancestors count: 4
- OFV 1718 count: 1

### Task 2: test_export.py updates

- Updated `EXPECTED_OCCURRENCES_COLS`: replaced `'observer'` with `'host_inat_login'`; added `'specimen_inat_login'`, `'specimen_inat_taxon_name'`, `'specimen_inat_genus'`, `'specimen_inat_family'`, `'is_provisional'`
- Updated `test_occurrences_specimen_only_nulls`: `observer` → `host_inat_login` in SELECT and assertion
- Added `test_provisional_rows_appear`: asserts provisional row has `ecdysis_id=NULL`, `specimen_observation_id=888888`, `specimen_inat_login='provisionaluser'`, `host_observation_id=999999`, `specimen_count=3`
- Added `test_matched_waba_not_provisional`: asserts row with `specimen_observation_id=777777` has `is_provisional=False`

## Test State After This Plan

```
PASSED  test_occurrences_parquet_has_rows
PASSED  test_occurrences_coalesce_coords
PASSED  test_occurrences_date_format
PASSED  test_occurrences_sample_only_nulls
PASSED  test_counties_geojson
PASSED  test_ecoregions_geojson
FAILED  test_occurrences_parquet_schema       (host_inat_login not yet in export)
FAILED  test_occurrences_specimen_only_nulls  (host_inat_login column missing)
FAILED  test_provisional_rows_appear          (is_provisional column missing)
FAILED  test_matched_waba_not_provisional     (is_provisional column missing)
```

4 RED tests is the correct state — Plan 03 (export restructure) will turn all 4 GREEN.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

The two new test functions (`test_provisional_rows_appear`, `test_matched_waba_not_provisional`) are intentional RED stubs. They are not data stubs (no placeholder text, no hardcoded empty values). They assert against specific fixture data and will fail until Plan 03 implements the export SQL. This is the Nyquist rule compliance pattern for wave-based execution.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| data/tests/conftest.py | FOUND |
| data/tests/test_export.py | FOUND |
| 066-02-SUMMARY.md | FOUND |
| commit 0c6d186 (Task 1) | FOUND |
| commit 537de7f (Task 2) | FOUND |
