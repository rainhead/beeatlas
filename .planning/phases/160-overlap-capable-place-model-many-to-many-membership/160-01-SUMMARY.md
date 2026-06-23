---
phase: 160-overlap-capable-place-model-many-to-many-membership
plan: 01
subsystem: data-pipeline-tests + frontend-tests
tags: [tdd, nyquist, wave-0, places, bridge, test-fixtures]
requires:
  - "src/occurrence.ts occIdFromRow priority (identity vocabulary)"
  - "data/places_export.py _query_counts (to be rewritten in 160-03)"
  - "data/places_validation.py ST_Overlaps guard (to be removed in 160-02)"
  - "src/filter.ts place clause + OCCURRENCE_COLUMNS (to be rewritten in 160-04)"
provides:
  - "data/tests/test_occurrence_places.py — executable bridge-membership recipe spec (GREEN)"
  - "inverted test_overlapping_polygons — overlaps LOAD (RED pending 160-02)"
  - "bridge double-count export fixtures + expectations (RED pending 160-03)"
  - "EXISTS-membership place-clause + place_slug-column assertions (RED pending 160-04)"
affects: [160-02, 160-03, 160-04]
tech-stack:
  added: []
  patterns:
    - "DuckDB inline ST_Within bridge SQL run against seeded tables (self-contained recipe test, no dbt mart dependency)"
    - "Option-B synthetic occ_id CASE mirroring src/occurrence.ts occIdFromRow"
    - "occurrence_places.parquet (occ_id, place_slug) bridge fixture for double-count tests"
key-files:
  created:
    - data/tests/test_occurrence_places.py
  modified:
    - data/tests/test_places_validation.py
    - data/tests/test_places_export.py
    - src/tests/filter.test.ts
decisions:
  - "Bridge keyed on synthetic occ_id (Option B) per RESEARCH lean — 2-col relation, mirrors occIdFromRow"
  - "RED-by-design tests committed per the Nyquist contract; each maps 1:1 to its producing plan"
metrics:
  duration: ~10m
  completed: 2026-06-23
---

# Phase 160 Plan 01: Wave 0 RED-tests — overlap-capable place model verification surface Summary

Authored the failing tests and fixtures that pin every observable behavior of the many-to-many place model BEFORE any production change: a self-contained DuckDB bridge-membership recipe test (GREEN), an inverted overlap-acceptance test, double-counting export fixtures, and frontend EXISTS-clause + dropped-column assertions. Most assertions are RED-by-design and turn GREEN exactly when their producing plan (160-02/03/04) lands.

## What Was Built

**Task 1 — `data/tests/test_occurrence_places.py` (new) + inverted overlap test:**
- New test seeds an in-memory DuckDB (LOAD spatial) with an occurrences-shaped input carrying the four identity columns + lon/lat for three points (A-only, B-only, A∩B overlap) and two partially-overlapping WKT places. Runs the bridge SQL body **inline** — the `ST_Within` JOIN with NO `DISTINCT ON`, projecting the Option-B `occ_id` CASE (mirroring `src/occurrence.ts:23-30` priority: ecdysis → inat → inat_obs → checklist) and `place_slug`, `ORDER BY occ_id, place_slug`.
- Six assertions: overlap point yields exactly two sorted rows (`(occ_id,'place-a')`, `(occ_id,'place-b')`); A-only → one row; B-only → one row; total = 4 rows (no dedup); byte-stable across two runs (determinism); `occ_id` CASE priority matches `occIdFromRow` exactly.
- Inverted `test_overlapping_polygons` in `test_places_validation.py`: now asserts `validate_places(...)` returns `None` (overlaps LOAD). Slug/WKT/WGS84/duplicate/permit tests untouched. Module docstring updated.

**Task 2 — export double-count fixtures + frontend EXISTS-clause test:**
- `test_places_export.py`: dropped `place_slug` from `_write_test_occurrences_parquet`, added the four identity columns + `is_provisional/sample_id/lon/lat`. Added `_write_test_bridge_parquet` emitting `occurrence_places.parquet` `(occ_id, place_slug)` with `ecdysis:42` a member of BOTH `place-a` and `place-b`. Two-place toml + two-place `_seed_places_db`. Rewrote `test_places_json_counts` to assert double-counting: `place-b` specimen_count = 2 (shared `ecdysis:42` + `ecdysis:7`).
- `filter.test.ts`: inverted `OCCURRENCE_COLUMNS` test to assert it does NOT contain `place_slug`; rewrote the three `selectedPlace` tests so the active case asserts `EXISTS` + `occurrence_places` + `op.place_slug = '…'` (not a bare scalar equality), the null case asserts no membership clause, and the quote-escape case keeps `''` doubling with the `op.` prefix.

## RED-pending Map (the Nyquist contract)

| Assertion | File | State now | Turns GREEN in |
|-----------|------|-----------|----------------|
| Bridge overlap → 2 sorted rows; occ_id priority; determinism | test_occurrence_places.py | **GREEN** (self-contained inline recipe) | n/a — it tests the recipe 160-02 must reproduce |
| Overlapping polygons LOAD (no raise) | test_places_validation.py::test_overlapping_polygons | **RED** | 160-02 (remove ST_Overlaps guard) |
| Per-place counts double-count shared occurrence | test_places_export.py::test_places_json_counts | **RED** | 160-03 (rewrite `_query_counts` to JOIN bridge) |
| test_places_geojson/json_structure (2 places) | test_places_export.py | **RED** (export_places_step calls _query_counts) | 160-03 |
| OCCURRENCE_COLUMNS excludes place_slug | filter.test.ts | **RED** | 160-04 |
| Place clause is EXISTS membership + escaping | filter.test.ts | **RED** | 160-04 |

Note for 160-03 executor: the two structure tests in `test_places_export.py` (`test_places_geojson_structure`, `test_places_json_structure`) currently fail alongside `test_places_json_counts` because `export_places_step` calls `_query_counts`, which still references the dropped `place_slug` column. All three go GREEN together when `_query_counts` is rewritten to JOIN `occurrence_places`. `export_places`/`_query_counts` must take the bridge parquet path as a new argument (see RESEARCH "Code Examples → _query_counts rewrite").

## Deviations from Plan

**1. [Rule 1 - Bug] `executemany` incompatible with `ST_GeomFromText` parameter binding**
- **Found during:** Task 1 verification
- **Issue:** `con.executemany("INSERT ... ST_GeomFromText(?)", [...])` raised `InvalidInputException: ST_GeomFromText requires a string argument` — DuckDB's executemany binds the parameter through the geometry function differently than a single execute.
- **Fix:** Replaced the `executemany` place insert with a per-row `for` loop of `con.execute(...)`, matching the established pattern in `test_places_export.py::_seed_places_db`.
- **Files modified:** data/tests/test_occurrence_places.py
- **Commit:** 1782f73c

**2. [Rule 2 - Missing test coverage] Two-place structure-test updates**
- **Found during:** Task 2
- **Issue:** Plan focused on `test_places_json_counts`, but switching the fixtures to two overlapping places changes the expected feature/record counts in `test_places_geojson_structure` and `test_places_json_structure` (1 → 2). Leaving them at `== 1` would assert the wrong thing.
- **Fix:** Updated both structure tests to expect 2 places and tolerate either slug. They are RED now (shared `_query_counts` dependency) and go GREEN with 160-03 — documented above.
- **Files modified:** data/tests/test_places_export.py
- **Commit:** 5e48228e

## Verification Results

- `cd data && uv run pytest tests/test_occurrence_places.py -x` → 6 passed (GREEN, self-contained recipe)
- `cd data && uv run pytest tests/test_places_validation.py` → 9 passed, 1 failed (`test_overlapping_polygons` RED-by-design — live ST_Overlaps guard still raises)
- `cd data && uv run pytest tests/test_places_export.py` → 3 failed (all RED-by-design: `_query_counts` references dropped `place_slug`)
- `npm test -- filter` → 69 passed, 3 failed (the three RED-by-design place-clause/column assertions; no regressions)

## Threat Flags

None. T-160-01 (SQLi via place slug) is asserted-mitigated by the filter.test.ts escaping assertion (`op.place_slug = 'o''brien-ranch'`). No new security surface introduced — this plan adds only tests and fixtures.

## Self-Check: PASSED

- FOUND: data/tests/test_occurrence_places.py
- FOUND: data/tests/test_places_validation.py (modified)
- FOUND: data/tests/test_places_export.py (modified)
- FOUND: src/tests/filter.test.ts (modified)
- FOUND commit: 1782f73c (Task 1)
- FOUND commit: 5e48228e (Task 2)
