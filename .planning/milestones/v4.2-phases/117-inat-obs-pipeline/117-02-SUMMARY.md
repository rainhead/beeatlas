---
phase: 117-inat-obs-pipeline
plan: "02"
subsystem: pipeline
tags: [pipeline, duckdb, parquet, canonicalization, inat, dedup, wave-1]

# Dependency graph
requires:
  - phase: 117-01
    provides: "data/raw/inat_expert_obs.csv (45,354 rows), data/tests/test_inat_obs_pipeline.py (4 RED stubs)"
provides:
  - "data/inat_obs_pipeline.py: load_inat_obs() + _load_excluded_ids() — reads CSV, canonicalizes, deduplicates, writes inat_obs.parquet"
  - "data/run.py: inat-obs step registered between places-load and dbt-build"
  - "public/data/inat_obs.parquet: 44,534-row 12-column parquet (1.9MB), all 4 PIPE tests GREEN"
affects:
  - 117-03 (nightly.sh upload + manifest.json integration)
  - 118 (dbt models that may read inat_obs_data schema)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "inat_obs_pipeline.py follows checklist_pipeline.py pattern: csv.DictReader -> Python list of tuples -> DuckDB executemany -> COPY TO PARQUET"
    - "_load_excluded_ids: try dbt_sandbox.int_waba_link / except CatalogException fallback to raw observations__ofvs"
    - "Fallback dedup via SELECT CAST(ofv.value AS BIGINT) FROM observations__ofvs WHERE field_id=18116 (not a join — value column holds the obs ID)"

key-files:
  created:
    - data/inat_obs_pipeline.py
  modified:
    - data/run.py
    - data/tests/test_inat_obs_pipeline.py

key-decisions:
  - "Fallback dedup queries observations__ofvs.value directly (no join to observations): the specimen obs ID IS the OFV value for field_id=18116"
  - "Used parquet_schema(...) with 'name' column and duckdb_schema filter in test fix (DuckDB 1.5.2 uses 'name' not 'column_name')"

patterns-established:
  - "inat_obs_data schema: CREATE SCHEMA IF NOT EXISTS before CREATE OR REPLACE TABLE (Pitfall 1 avoidance)"
  - "_load_excluded_ids(): CatalogException try/except for first-run safety (dbt_sandbox absent)"

requirements-completed:
  - PIPE-01
  - PIPE-02
  - PIPE-03
  - PIPE-04

# Metrics
duration: 14min
completed: 2026-05-26
---

# Phase 117 Plan 02: iNat Obs Pipeline Implementation Summary

**44,534-row inat_obs.parquet (1.9MB, 12 columns) produced by new inat_obs_pipeline.py via csv.DictReader + canonicalize() + dbt_sandbox dedup, wired into run.py between places-load and dbt-build**

## Performance

- **Duration:** 14 min
- **Started:** 2026-05-26T00:52:22Z
- **Completed:** 2026-05-26T01:07:07Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Implemented `data/inat_obs_pipeline.py` with `load_inat_obs()` and `_load_excluded_ids()` following the checklist_pipeline.py analog
- All 4 Plan 01 RED tests turned GREEN (PIPE-01..04: schema, canonical_name, dedup, floral_host)
- Registered `("inat-obs", load_inat_obs)` in `run.py` STEPS between `places-load` and `dbt-build`
- Full data suite: 125 passed, 29 skipped

## Smoke-run Metrics

| Metric | Value |
|--------|-------|
| Total CSV rows | 45,354 |
| Dedup IDs loaded from DB | 1,407 (via primary `dbt_sandbox.int_waba_link` path) |
| CSV rows excluded (overlap) | 820 |
| Final parquet rows | 44,534 |
| Parquet file size | 1,924,980 bytes (~1.9MB) |
| Null canonical_name rows | 0 (PIPE-02 satisfied) |
| Dedup path taken | Primary: `dbt_sandbox.int_waba_link` |

## Task Commits

1. **Task 1: Implement data/inat_obs_pipeline.py** - `cc9082e` (feat)
2. **Task 2: Register the inat-obs step in run.py** - `c8dd389` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `data/inat_obs_pipeline.py` — new pipeline module: load_inat_obs() + _load_excluded_ids(); 12-column inat_obs.parquet output; 120 lines
- `data/run.py` — added `from inat_obs_pipeline import load_inat_obs`; inserted `("inat-obs", load_inat_obs)` step; updated module docstring
- `data/tests/test_inat_obs_pipeline.py` — fixed parquet_schema column name bug (Rule 1 auto-fix)

## Decisions Made

- **Fallback dedup uses `ofv.value` directly:** The specimen observation ID is stored as the value in `observations__ofvs` for `field_id=18116`, not through a join on `_dlt_id`. The research doc Pattern 2 showed a join on `waba._dlt_id`, but the test fixture and actual table schema (observations only has `id`, not `_dlt_id`) revealed the simpler direct query: `SELECT DISTINCT CAST(ofv.value AS BIGINT) FROM observations__ofvs WHERE field_id=18116`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed fallback dedup query: removed erroneous _dlt_id join**
- **Found during:** Task 1 (first test run)
- **Issue:** Research doc Pattern 2 fallback query joined `observations__ofvs` to `observations` via `waba._dlt_id`, but the `observations` table only has `id` (no `_dlt_id`). The test fixture confirmed: the specimen obs ID is stored as `ofv.value` for field_id=18116, not through a join.
- **Fix:** Replaced the join query with `SELECT DISTINCT CAST(ofv.value AS BIGINT) FROM inaturalist_waba_data.observations__ofvs WHERE field_id = 18116 AND value != '' AND value IS NOT NULL`
- **Files modified:** `data/inat_obs_pipeline.py`
- **Verification:** `test_dedup_excludes_specimen_obs` passes (obs_id 999000001 excluded, 999000002 kept)
- **Committed in:** cc9082e (Task 1 commit)

**2. [Rule 1 - Bug] Fixed parquet_schema column name in test: `column_name` → `name`**
- **Found during:** Task 1 (test_schema_has_12_columns failure)
- **Issue:** The Plan 01 stub used `SELECT column_name FROM parquet_schema(...)` but DuckDB 1.5.2's `parquet_schema()` function uses `name` (not `column_name`). Also needed to filter out the `duckdb_schema` metadata row.
- **Fix:** Changed to `SELECT name FROM parquet_schema('{parquet_path}') WHERE name != 'duckdb_schema'`
- **Files modified:** `data/tests/test_inat_obs_pipeline.py`
- **Verification:** `test_schema_has_12_columns` passes; 12 columns reported correctly
- **Committed in:** cc9082e (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 bugs — incorrect SQL in research doc pattern and wrong DuckDB function column name in test stub)
**Impact on plan:** Both fixes required for correctness. No scope change. Pipeline and tests function as intended.

## Issues Encountered

- Worktree branch was behind `main` by the Plan 01 commits (CSV, test stubs, state updates). Resolved by `git rebase main` before running tests — the worktree now tracks all Phase 117 work.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond those in the plan's threat model.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Wave 1 complete: `inat_obs_pipeline.py` implemented, 4 PIPE tests GREEN, inat-obs step in run.py
- Ready for Plan 03: nightly.sh upload block + manifest.json addition for `inat_obs.parquet`
- The dedup path in production takes the `dbt_sandbox.int_waba_link` primary route (schema always present after first successful run per nightly.sh S3 pull)
- Parquet is ~1.9MB — well within the hashed-upload capacity of nightly.sh

---
*Phase: 117-inat-obs-pipeline*
*Completed: 2026-05-26*
