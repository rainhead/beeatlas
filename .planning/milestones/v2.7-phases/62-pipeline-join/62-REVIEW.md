---
phase: 62-pipeline-join
reviewed: 2026-04-17T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - data/export.py
  - data/tests/test_export.py
  - scripts/validate-schema.mjs
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: issues_found
---

# Phase 62: Code Review Report

**Reviewed:** 2026-04-17
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Reviewed the three files implementing the pipeline join phase: `data/export.py` (new `export_occurrences_parquet` function replacing two prior export functions), `data/tests/test_export.py` (integration tests for the new function), and `scripts/validate-schema.mjs` (CI schema gate updated for the merged parquet schema).

The core logic is sound. The FULL OUTER JOIN design, ROW_NUMBER() surrogate key, spatial fallback CTEs, and post-export assertions are all correctly implemented and consistent with the established patterns. The test suite covers the critical correctness properties (schema, null coords, null spatial columns, date type, and per-side null fields).

Two warnings and one info item were found.

---

## Warnings

### WR-01: `CAST` on WABA OFV value will throw on dirty data

**File:** `data/export.py:48`

**Issue:** The `waba_link` CTE casts `ofv.value` to BIGINT unconditionally:
```sql
CAST(ofv.value AS BIGINT) AS catalog_suffix
```
The guard `ofv.value != ''` excludes empty strings but does not exclude other non-numeric values. WABA observation field values are user-entered text; a typo like `"5594569a"` would cause a runtime cast failure and abort the entire export. The analogous `sample_id` cast on line 94 already uses `TRY_CAST`, and `specimen_count` guard is consistent — only this cast is unprotected.

**Fix:**
```sql
TRY_CAST(ofv.value AS BIGINT) AS catalog_suffix
```
Then update the WHERE/GROUP BY to filter nulls:
```sql
WHERE ofv.field_id = 18116
  AND ofv.value != ''
  AND TRY_CAST(ofv.value AS BIGINT) IS NOT NULL
```
Or more concisely, keep the `TRY_CAST` result in a subquery and filter after. At minimum, replacing `CAST` with `TRY_CAST` prevents the crash; the non-matchable row simply drops out of `waba_link` and the ecdysis record gets a null `specimen_observation_id`, which is the correct degraded behavior.

---

### WR-02: `ecdysis_base` WHERE clause does not guard `decimal_longitude`

**File:** `data/export.py:83`

**Issue:** The filter is:
```sql
WHERE o.decimal_latitude IS NOT NULL AND o.decimal_latitude != ''
```
There is no corresponding check for `decimal_longitude`. A specimen row with a valid latitude but a null or empty longitude passes the filter, producing `NULL` from `CAST(o.decimal_longitude AS DOUBLE)`. For a specimen-only row (no sample match), `COALESCE(e.ecdysis_lon, s.sample_lon)` collapses to `COALESCE(NULL, NULL) = NULL`. The subsequent `ST_Point(NULL, lat)` returns NULL, which causes the spatial joins to miss a county and ecoregion. The fallback CTEs (`county_fallback`, `eco_fallback`) also fail silently because `ST_Distance(geom, NULL)` returns NULL — the ORDER BY produces an indeterminate result and DuckDB may return a row or NULL. Even if a fallback row is returned, the assertion at line 187 catches null counties only after the file is written, aborting the export with a partial/corrupt file already on disk.

**Fix:**
```sql
WHERE o.decimal_latitude IS NOT NULL AND o.decimal_latitude != ''
  AND o.decimal_longitude IS NOT NULL AND o.decimal_longitude != ''
```

---

## Info

### IN-01: `specimen_count` uses `CAST` while `sample_id` uses `TRY_CAST`

**File:** `data/export.py:94`

**Issue:** In `samples_base`, the two adjacent OFV casts are inconsistent:
```sql
CAST(sc.value AS INTEGER) AS specimen_count,   -- line 94: throws on bad data
TRY_CAST(sid.value AS INTEGER) AS sample_id    -- line 95: returns null on bad data
```
The `sc.value != ''` filter on line 97 reduces the risk, but non-numeric values (e.g., `"3 bees"`) still reach the `CAST`. The inconsistency is also a readability signal — a reviewer might assume the difference is intentional when it is not. `specimen_count` is user-entered data on iNaturalist and has the same exposure as `sample_id`.

**Fix:**
```python
TRY_CAST(sc.value AS INTEGER) AS specimen_count,
```

---

_Reviewed: 2026-04-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
