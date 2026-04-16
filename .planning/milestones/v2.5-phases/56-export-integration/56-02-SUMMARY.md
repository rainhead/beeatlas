---
phase: 56-export-integration
plan: "02"
subsystem: data-pipeline
tags: [testing, elevation, parquet, export]
dependency_graph:
  requires: [56-01]
  provides: [elevation-test-coverage]
  affects: [data/tests/test_export.py, data/tests/conftest.py, data/tests/test_feeds.py, data/feeds.py]
tech_stack:
  added: []
  patterns: [pytest-fixture-dem, parquet-schema-assertion]
key_files:
  created: []
  modified:
    - data/tests/test_export.py
    - data/tests/conftest.py
    - data/tests/test_feeds.py
    - data/feeds.py
decisions:
  - dem_fixture is function-scoped (not session-scoped) to guarantee isolation between elevation tests writing to same export_dir
  - geometry_wkt VARCHAR is the canonical column name in both real DB and fixtures; geom GEOMETRY was a phase-47 artifact that was only partially reverted
metrics:
  duration_minutes: 18
  completed_date: "2026-04-15"
  tasks_completed: 2
  files_modified: 4
---

# Phase 56 Plan 02: Export Integration Tests Summary

**One-liner:** Elevation column tests for both parquet outputs using synthetic DEM fixture, plus geometry_wkt schema mismatch fixes that unblocked the entire test suite.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update existing tests for new function signatures and elevation_m columns | 55c4125 | data/tests/test_export.py, data/tests/conftest.py |
| 2 | Add elevation-specific integration tests | 1dfaab9 | data/tests/test_export.py, data/tests/test_feeds.py, data/feeds.py |

## What Was Built

- Added `elevation_m` to `EXPECTED_ECDYSIS_COLS` and `EXPECTED_SAMPLES_COLS` in `test_export.py`
- Added `dem_fixture` parameter to all 5 existing export test functions and updated call sites
- Added 5 new elevation integration tests:
  - `test_ecdysis_parquet_elevation_col` — verifies INT16/SMALLINT type in ecdysis.parquet
  - `test_ecdysis_elevation_no_sentinel_leak` — verifies no rows have elevation_m < -500
  - `test_ecdysis_elevation_has_values` — verifies seed specimen at (-120.912, 47.608) gets non-null elevation
  - `test_samples_parquet_elevation_col` — verifies INT16/SMALLINT type in samples.parquet
  - `test_samples_elevation_no_sentinel_leak` — verifies no sentinel leak in samples.parquet
- Full test suite: 38 tests pass

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] conftest.py geographies DDL used `geom GEOMETRY` instead of `geometry_wkt VARCHAR`**
- **Found during:** Task 1 verification (first pytest run)
- **Issue:** `conftest.py` created geographies tables with `geom GEOMETRY` column and `ST_GeomFromText(?)` inserts, but `export.py` queries reference `geometry_wkt` VARCHAR column via `ST_GeomFromText(geometry_wkt)`. This mismatch caused all export tests to fail with `BinderException: Referenced column "geometry_wkt" not found`.
- **Root cause:** Phase 47 updated conftest to `geom GEOMETRY` but commit `91ab2e6` reverted `export.py` back to `geometry_wkt VARCHAR` without updating conftest.
- **Fix:** Changed all three geographies table DDLs in `conftest.py` to `geometry_wkt VARCHAR` and updated INSERT statements to bind plain WKT strings (no `ST_GeomFromText` wrapper).
- **Files modified:** `data/tests/conftest.py`
- **Commit:** 55c4125

**2. [Rule 1 - Bug] test_feeds.py geographies DDL had same `geom GEOMETRY` mismatch**
- **Found during:** Task 2 full-suite run
- **Issue:** `test_feeds.py` had same schema mismatch as conftest — used `geom GEOMETRY` DDL while `feeds.py` queries reference `geometry_wkt`.
- **Fix:** Updated three table DDLs in `test_feeds.py` to `geometry_wkt VARCHAR` and bind plain WKT strings.
- **Files modified:** `data/tests/test_feeds.py`
- **Commit:** 1dfaab9

**3. [Rule 1 - Bug] feeds.py SQL queries referenced bare `geom` column (not wrapped in ST_GeomFromText)**
- **Found during:** Task 2 full-suite run (same failure as above)
- **Issue:** `feeds.py` `_COUNTY_QUERY`, `_ECOREGION_QUERY`, and the ecoregion enum query used `e.geom` / `c.geom` directly — left over from phase 47 when the column was `GEOMETRY` type. After the real DB reverted to `geometry_wkt VARCHAR`, these queries were broken.
- **Fix:** Wrapped all `geom` column references with `ST_GeomFromText(geometry_wkt)` in three query strings.
- **Files modified:** `data/feeds.py`
- **Commit:** 1dfaab9

## Known Stubs

None.

## Threat Flags

None. Test code only; not deployed.

## Self-Check: PASSED

- `data/tests/test_export.py` contains `def test_ecdysis_parquet_elevation_col(` — FOUND
- `data/tests/test_export.py` contains `def test_ecdysis_elevation_no_sentinel_leak(` — FOUND
- `data/tests/test_export.py` contains `def test_ecdysis_elevation_has_values(` — FOUND
- `data/tests/test_export.py` contains `def test_samples_parquet_elevation_col(` — FOUND
- `data/tests/test_export.py` contains `def test_samples_elevation_no_sentinel_leak(` — FOUND
- Commit 55c4125 — FOUND
- Commit 1dfaab9 — FOUND
- `uv run pytest -x` — 38 passed
