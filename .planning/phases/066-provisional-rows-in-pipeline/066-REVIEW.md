---
phase: 066-provisional-rows-in-pipeline
reviewed: 2026-04-20T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - data/export.py
  - data/tests/conftest.py
  - scripts/validate-schema.mjs
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 066: Code Review Report

**Reviewed:** 2026-04-20
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Review covers the provisional-row feature: ARM 2 of the `combined` CTE in `export.py`, the updated `conftest.py` fixture scaffolding, and the `validate-schema.mjs` schema gate. The core SQL logic for identifying unmatched WABA observations and emitting `is_provisional=TRUE` rows is structurally sound. Two warnings and two info items follow.

## Warnings

### WR-01: `taxon_lineage` table seeded in conftest but never read by export query

**File:** `data/tests/conftest.py:108-111` and `data/tests/conftest.py:231-234`

**Issue:** `conftest.py` creates and populates `inaturalist_waba_data.taxon_lineage` with genus/family rows keyed on `taxon_id`. `export.py` derives genus and family for WABA observations exclusively from `observations__taxon__ancestors` (lines 115-118), not from `taxon_lineage`. As a result, the seeded `taxon_lineage` rows are silently ignored by every export test. If the intent is that `export.py` should eventually consume `taxon_lineage` (it is built by `enrich_taxon_lineage` in `waba_pipeline.py`), there is a contract gap. If `taxon_lineage` is only for other consumers, the fixture data is misleading dead weight that will cause confusion when the query is extended.

**Fix:** Either (a) update the export query's `specimen_obs_base` CTE to join `taxon_lineage` instead of (or in addition to) `observations__taxon__ancestors`, and remove the `observations__taxon__ancestors` table/seed rows from conftest once migration is complete; or (b) add a comment in conftest explicitly noting that `taxon_lineage` is seeded for pipeline tests, not export tests, and is intentionally unused in the export path.

---

### WR-02: Partial assertion in `test_occurrences_sample_only_nulls`

**File:** `data/tests/test_export.py:128`

**Issue:** The test name promises it checks that sample-only rows have null `scientificName` **and** `family`, and the SELECT retrieves both columns, but the loop body only asserts `scientific_name is None`. The `family` column is fetched but never checked. A provisional row carries `specimen_inat_family` into the `family` position via ARM 2, so if a sample-only row ever gets a non-null `family` the test will not catch it.

**Fix:**
```python
for scientific_name, family in rows:
    assert scientific_name is None, (
        f"Sample-only row should have null scientificName, got {scientific_name!r}"
    )
    assert family is None, (
        f"Sample-only row should have null family, got {family!r}"
    )
```

## Info

### IN-01: CloudFront 403/404 detection in validate-schema.mjs relies on message-string regex

**File:** `scripts/validate-schema.mjs:62`

**Issue:** `!useLocal && /403|404/.test(e.message)` skips validation when the error message string contains `"403"` or `"404"`. HTTP status codes embedded in error messages are an implementation detail of `hyparquet` / the underlying fetch layer and can change. A message like `"Request timed out after 404ms"` would also match. This is a soft skip (prints a warning, not a hard failure), so the blast radius is low, but it could suppress real errors in future `hyparquet` versions.

**Fix:** Check for a more specific property if `hyparquet` exposes one (e.g., `e.status`), or tighten the regex to word-boundary match: `/\b(403|404)\b/`.

---

### IN-02: `NOT IN (subquery)` safe here but fragile pattern for future maintenance

**File:** `data/export.py:133`

**Issue:** `waba.id NOT IN (SELECT waba_obs_id FROM matched_waba_ids)` is safe because `waba_obs_id` is derived from `MIN(waba.id)` — a non-nullable BIGINT — so the subquery never contains NULLs. However, this is a subtle invariant that is not documented in the query comment. If `matched_waba_ids` is ever refactored to include nullable expressions, `NOT IN` with NULLs silently returns zero rows, which would drop all provisional observations from the output without any error.

**Fix:** Add a brief inline comment asserting the invariant, or rewrite as `NOT EXISTS` which is NULL-safe by construction:
```sql
provisional_waba_ids AS (
    SELECT waba.id AS waba_obs_id
    FROM inaturalist_waba_data.observations waba
    WHERE NOT EXISTS (
        SELECT 1 FROM matched_waba_ids m WHERE m.waba_obs_id = waba.id
    )
),
```

---

_Reviewed: 2026-04-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
