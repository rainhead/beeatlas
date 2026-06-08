---
phase: 136-deduplication
plan: "03"
subsystem: data-pipeline
status: complete
completed_date: "2026-06-08"
duration_minutes: 8
tags: [tdd, green, dedup, dbt, sql, python, spatial]
requirements_completed: [DUP-02]

dependency_graph:
  requires:
    - 136-02 (DUP-01 collapse + collector normalization)
  provides:
    - int_dedup_candidates.sql: DUP-02 spatial+date+name join (collapsed × Ecdysis, lat-first ST_Distance_Sphere)
    - checklist_dedup.write_dedup_candidates: collector-filtered CSV writer with _csv_safe guard
  affects:
    - data/dbt/models/intermediate/int_dedup_candidates.sql (placeholder replaced with real join)
    - data/checklist_dedup.py (write_dedup_candidates stub replaced with implementation)
    - data/tests/test_checklist_dedup.py (Rule 1 fix: ecdysis_date column name in fixture)

tech_stack:
  added: []
  patterns:
    - ecdysis_dated CTE: TRY_CAST(EXTRACT('day' FROM TRY_CAST(ecdysis_date AS DATE)) AS INTEGER)
    - Bounding-box prefilter (±0.012 lat / ±0.016 lon) before expensive haversine
    - ST_Distance_Sphere(ST_Point(lat, lon), ...) — lat-first axis order (opposite of ST_Within convention)
    - D-05 collector filter in Python after SQL join, not in SQL

key_files:
  created: []
  modified:
    - data/dbt/models/intermediate/int_dedup_candidates.sql
    - data/checklist_dedup.py
    - data/tests/test_checklist_dedup.py

key_decisions:
  - "ecdysis_dated CTE uses ecdysis_date (not event_date) — int_ecdysis_base aliases o.event_date AS ecdysis_date; SQL and fixture aligned to actual model output"
  - "Collector filter (D-05) applied in Python write_dedup_candidates(), not SQL — cleaner token-set + initials logic, carries raw strings in the table for Python to filter"
  - "Bounding-box prefilter (0.012/0.016 deg) guards the expensive haversine call — advisory performance optimization, does not change correctness"

metrics:
  tasks_completed: 2
  tasks_total: 2
  files_created: 0
  files_modified: 3
---

# Phase 136 Plan 03: GREEN — DUP-02 Cross-Source Candidate Generation Summary

Wave 3 of Phase 136 deduplication: implement `int_dedup_candidates` dbt model (DUP-02 cross-source join of post-collapse checklist × Ecdysis on accepted-name + coarser-shared-precision date + 1.0 km proximity) and `write_dedup_candidates()` Python CSV writer (D-05 collector filter + `_csv_safe` formula-injection guard). Turns all four DUP-02 tests GREEN.

## What Was Built

### Task 1: int_dedup_candidates.sql — DUP-02 spatial join (commit fd9b26e)

`data/dbt/models/intermediate/int_dedup_candidates.sql` — replaces the `WHERE false` placeholder with a full spatial+date+name join:

- **`ecdysis_dated` CTE**: selects from `{{ ref('int_ecdysis_base') }}`, derives `day` via `TRY_CAST(EXTRACT('day' FROM TRY_CAST(ecdysis_date AS DATE)) AS INTEGER)`, filters to rows where `ecdysis_lat IS NOT NULL AND ecdysis_lon IS NOT NULL AND year IS NOT NULL AND month IS NOT NULL AND ecdysis_date IS NOT NULL` (D-06: exclude year-only/NULL Ecdysis dates).
- **JOIN predicates**: exact `canonical_name` match; `date_quality = 'full'` (Anti-Pattern 4 guard — not bare `year IS NOT NULL`); year+month match; `cl.day IS NULL OR ec.day IS NULL OR cl.day = ec.day` (coarser shared precision, D-06); `cl.lat IS NOT NULL AND cl.lon IS NOT NULL`; bounding-box prefilter (`ABS(lat diff) <= 0.012, ABS(lon diff) <= 0.016`); precise `ST_Distance_Sphere(...) <= 1000.0`.
- **CRITICAL axis-order comment**: header documents that `ST_Distance_Sphere` uses `ST_Point(lat, lon)` — latitude FIRST — the opposite of `ST_Point(lon, lat)` used everywhere else for `ST_Within`. Verified: wrong order silently produces ~59 km per degree instead of ~111 km.
- **pair_key**: `CAST(cl.ObjectID AS VARCHAR) || '|' || CAST(ec.ecdysis_id AS VARCHAR)` — post-collapse survivor ObjectID (D-02/T-136-06).
- **Raw collector strings** carried (`checklist_collector`, `ecdysis_collector`) for Python `_collectors_match` filter (D-05) applied downstream.
- **`materialized='table'`** — expensive spatial join, materialize once.

### Task 2: write_dedup_candidates() — collector filter + CSV writer (commit 19dff51)

`data/checklist_dedup.py` — `NotImplementedError` stub replaced with implementation:

- Connects to `DB_PATH`, executes `INSTALL spatial; LOAD spatial`.
- SELECTs all 19 interface columns from `dbt_sandbox.int_dedup_candidates ORDER BY canonical_name, checklist_ObjectID, ecdysis_id`.
- **D-05**: filters rows in Python using `_collectors_match(checklist_collector, ecdysis_collector)` — token-set + initials rule, no SQL.
- **WR-03/T-136-01**: `_csv_safe()` applied to every string cell (formula-injection guard).
- `csv.DictWriter` with documented 19-column `_FIELDNAMES` header; writes `DEDUP_CANDIDATE_CSV`.
- Returns pair count; prints `dedup-candidates: wrote N pairs`.
- No required positional args — `run.py` STEP-compatible.

## Test Results

| Test | Status | Notes |
|------|--------|-------|
| test_null_date_excluded_from_candidates | GREEN | date_quality='year-only' row absent; full-date row present |
| test_null_coord_excluded_from_candidates | GREEN | NULL-coord row absent; valid-coord row present |
| test_distance_1km_window | GREEN | inside (47.008, ~890 m) present; outside (47.011, ~1.22 km) absent; lat-first axis order confirmed |
| test_candidate_csv_written | GREEN | CSV created; all 19 documented columns present |
| test_no_exact_duplicates_after_collapse | GREEN | DUP-01 unchanged |
| test_collapsed_count_correct | GREEN | DUP-01 unchanged |
| test_lowest_objectid_survives | GREEN | DUP-01 unchanged |
| test_collector_normalization | GREEN | collector helpers unchanged |
| test_unreviewed_pair_not_suppressed | RED (expected) | DUP-03 stub — wave 4 scope |
| test_confirmed_pair_suppressed | RED (expected) | DUP-03 stub — wave 4 scope |
| test_dedup_gate | RED (expected) | DUP-03 stub — wave 4 scope |

Fast-tier non-dedup tests: 203 passed / 9 skipped / 1 pre-existing failure (test_resolve_offline_fallbacks.py — stale-DB artifact, pre-existing, unchanged).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test fixture used wrong Ecdysis date column name**
- **Found during:** Task 2 (dbt build failure)
- **Issue:** `_create_ecdysis_table()` in the test created a table with `event_date` column, but `int_ecdysis_base.sql` aliases `o.event_date AS ecdysis_date`. The SQL model queries `ecdysis_date`; the fixture table had `event_date` → column mismatch.
- **Fix:** Updated `_create_ecdysis_table()` fixture to use `ecdysis_date` column name (matching actual model output). Updated SQL `ecdysis_dated` CTE and main SELECT to use `ecdysis_date` consistently.
- **Files modified:** `data/tests/test_checklist_dedup.py`, `data/dbt/models/intermediate/int_dedup_candidates.sql`
- **Commit:** 19dff51

## Known Stubs

Remaining from 136-01 (not this plan's scope):

| Stub | File | Wave |
|------|------|------|
| `check_dedup_gate()` — raises NotImplementedError | data/checklist_dedup.py | 136-04 |
| `int_checklist_dedup_status.sql` — NULL dedup_status | data/dbt/models/intermediate/ | 136-04 |

## Threat Flags

None. T-136-01 (formula injection) mitigated by `_csv_safe()` in `write_dedup_candidates`. T-136-05 (wrong-axis ST_Distance_Sphere) mitigated by lat-first `ST_Point(lat, lon)` with mandatory axis-order comment; `test_distance_1km_window` guards the 1 km window. T-136-06 (stale pre-collapse pair_keys) mitigated by referencing `int_checklist_collapsed` (post-collapse survivor). No new network endpoints, auth paths, or schema trust boundaries introduced.

## Self-Check: PASSED
