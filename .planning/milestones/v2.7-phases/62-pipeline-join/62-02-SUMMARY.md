---
phase: 62-pipeline-join
plan: "02"
subsystem: data-pipeline
tags: [export, occurrences, full-outer-join, spatial, parquet]
dependency_graph:
  requires: [62-01]
  provides: [export_occurrences_parquet, occurrences.parquet]
  affects: [frontend/public/data/occurrences.parquet, data/nightly.sh (implicitly via export.py main)]
tech_stack:
  added: []
  patterns: [FULL OUTER JOIN with ROW_NUMBER row key, COALESCE for nullable columns, CTE chain for spatial joins]
key_files:
  created: []
  modified:
    - data/export.py
decisions:
  - ROW_NUMBER() OVER () used as synthetic row key for spatial CTEs since full outer join has no natural single-column key
  - ecdysis event_date (VARCHAR) and CAST(observed_on AS VARCHAR) both produce VARCHAR, making COALESCE date result VARCHAR without casting
  - Old export_ecdysis_parquet and export_samples_parquet deleted entirely; no backward compatibility shim needed
metrics:
  duration: "~5 minutes"
  completed: "2026-04-17T16:26:27Z"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
---

# Phase 62 Plan 02: Implement export_occurrences_parquet Summary

Replaced `export_ecdysis_parquet` and `export_samples_parquet` in `data/export.py` with a single `export_occurrences_parquet` that performs a full outer join of ecdysis specimens and iNat samples, COALESCEs coordinates and dates, and runs spatial joins once over the unified point set to produce `occurrences.parquet`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement export_occurrences_parquet and update main() | 6ba1266 | data/export.py |

## What Was Built

**data/export.py:** Replaced two separate export functions (165 lines) with `export_occurrences_parquet` (90 net insertions). The new function:

- Uses a 14-CTE SQL chain inside a single `COPY (...) TO '{out}' (FORMAT PARQUET)` call
- `ecdysis_base` CTE: pulls all specimens with `ecdysis_lon`/`ecdysis_lat` aliases to avoid column ambiguity in the join
- `samples_base` CTE: pulls iNat observations with specimen count OFV join, `sample_lon`/`sample_lat`/`sample_date`/`sample_date_raw` aliases
- `joined` CTE: FULL OUTER JOIN on `host_observation_id = observation_id`; COALESCE for `lon`, `lat`, `date`, `year`, `month`; ROW_NUMBER for spatial key
- `occ_pt` CTE: ST_Point geometry for spatial joins
- County and ecoregion CTEs (with_county, county_fallback, final_county, with_eco, eco_dedup, eco_fallback, final_eco): keyed on `_row_id` from ROW_NUMBER
- Final SELECT: joins `joined` back to spatial results, outputs all 25 columns in EXPECTED_OCCURRENCES_COLS order
- Post-export verification: reads back the parquet, asserts null_county == 0 and null_eco == 0

Updated `main()`: calls `export_occurrences_parquet(con)` instead of two old calls. Updated module docstring: "four files" -> "three files", `ecdysis.parquet` + `samples.parquet` -> `occurrences.parquet`.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundaries introduced. The `out` path in the SQL f-string is derived from trusted `ASSETS_DIR` constant, matching T-62-03 accepted disposition.

## Self-Check: PASSED

- data/export.py: FOUND
  - Contains `def export_occurrences_parquet(con: duckdb.DuckDBPyConnection) -> None:`
  - Contains `FULL OUTER JOIN samples_base s ON e.host_observation_id = s.observation_id`
  - Contains `COALESCE(e.ecdysis_lon, s.sample_lon) AS lon`
  - Contains `COALESCE(e.ecdysis_lat, s.sample_lat) AS lat`
  - Contains `COALESCE(e.ecdysis_date, s.sample_date) AS date`
  - Contains `ROW_NUMBER() OVER () AS _row_id`
  - Contains `occurrences.parquet`
  - Does NOT contain `def export_ecdysis_parquet(`
  - Does NOT contain `def export_samples_parquet(`
  - Contains `export_occurrences_parquet(con)` in main()
  - Does NOT contain `export_ecdysis_parquet(con)` in main()
  - Does NOT contain `export_samples_parquet(con)` in main()
- Commit 6ba1266: FOUND
- All 8 pytest tests: PASSED
