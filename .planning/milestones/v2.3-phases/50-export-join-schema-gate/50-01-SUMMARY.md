---
phase: 50
plan: 1
title: "Export Join & Schema Gate"
subsystem: data-pipeline
tags: [export, waba, parquet, schema-gate, join]
dependency_graph:
  requires:
    - inaturalist_waba_data.observations (from phase 49)
    - inaturalist_waba_data.observations__ofvs (field_id=18116)
    - ecdysis_data.occurrences.catalog_number
  provides:
    - specimen_observation_id column in ecdysis.parquet
  affects:
    - data/export.py (waba_link CTE added)
    - data/tests/conftest.py (inaturalist_waba_data schema/tables/seed)
    - data/tests/test_export.py (new column + test)
    - scripts/validate-schema.mjs (schema gate updated)
tech_stack:
  added: []
  patterns:
    - waba_link CTE with GROUP BY + MIN for deduplication
    - regexp_extract(catalog_number, '[0-9]+$') numeric suffix join key
key_files:
  created: []
  modified:
    - data/export.py
    - data/tests/conftest.py
    - data/tests/test_export.py
    - scripts/validate-schema.mjs
decisions:
  - "Join key is numeric suffix of catalog_number (e.g. WSDA_5594569 → 5594569) matching WABA OFV field_id=18116 value"
  - "Deduplication via MIN(waba.id) per catalog suffix — picks lowest iNat obs ID when multiple WABA observers photograph same specimen"
  - "specimen_observation_id is nullable BIGINT — NULL for specimens with no WABA observation"
  - "No assert on non-null count in export.py — WABA pipeline may not be run in dev; column presence is sufficient"
metrics:
  duration_minutes: 25
  completed_date: "2026-04-13"
  tasks_completed: 4
  files_changed: 4
  waba_matches_in_production: 1347
---

# Phase 50 Plan 1: Export Join & Schema Gate Summary

## One-liner

Added `specimen_observation_id` (nullable BIGINT) to `ecdysis.parquet` via `waba_link` CTE joining WABA OFV catalog numbers to ecdysis `catalog_number` numeric suffixes; 1,347 specimens link in production data.

## What Was Built

Added a `waba_link` CTE to `export_ecdysis_parquet()` in `data/export.py`:

```sql
waba_link AS (
    SELECT
        CAST(ofv.value AS BIGINT) AS catalog_suffix,
        MIN(waba.id) AS specimen_observation_id
    FROM inaturalist_waba_data.observations waba
    JOIN inaturalist_waba_data.observations__ofvs ofv
        ON ofv._dlt_root_id = waba._dlt_id
        AND ofv.field_id = 18116
        AND ofv.value != ''
    GROUP BY catalog_suffix
)
```

Joined to ecdysis occurrences via:
```sql
LEFT JOIN waba_link wl ON wl.catalog_suffix = CAST(regexp_extract(o.catalog_number, '[0-9]+$', 0) AS BIGINT)
```

**Key discovery**: WABA OFV field_id=18116 stores the numeric portion of the Ecdysis catalog number (e.g., `5594569` for `WSDA_5594569`). Direct joins on `ecdysis.id` or `field_number` don't work.

Updated test infrastructure:
- `conftest.py`: added `inaturalist_waba_data` schema, `observations` + `observations__ofvs` tables, seed data with OFV value '5594569' matching fixture specimen's `catalog_number='WSDA_5594569'`; added `catalog_number` column to fixture `ecdysis_data.occurrences` table
- `test_export.py`: `specimen_observation_id` in `EXPECTED_ECDYSIS_COLS`; new `test_ecdysis_parquet_has_specimen_observation_id` asserting at least 1 non-null row
- `validate-schema.mjs`: `specimen_observation_id` added to expected ecdysis.parquet columns

## Test Results

```
28 passed in 0.57s
```

All 28 tests pass including `test_ecdysis_parquet_has_specimen_observation_id`.

## Self-Check: PASSED

- [x] `specimen_observation_id` column present in ecdysis.parquet
- [x] WABA join produces non-null values in test fixture
- [x] Deduplication via GROUP BY + MIN prevents row duplication
- [x] validate-schema.mjs updated — would fail if column absent
- [x] 28 pytest tests pass
