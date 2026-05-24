---
phase: 111-checklist-pipeline
reviewed: 2026-05-23T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - data/dbt/models/marts/checklist.sql
  - data/dbt/models/marts/schema.yml
  - data/nightly.sh
  - data/run.py
  - data/tests/test_dbt_scaffold.py
findings:
  critical: 1
  warning: 2
  info: 1
  total: 4
status: issues_found
---

# Phase 111: Code Review Report

**Reviewed:** 2026-05-23T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 111 adds the `checklist` dbt mart (county-range assertions from the Bartholomew et al. 2024 WA checklist) as a separate parquet artifact, wires it through `run.py` and `nightly.sh`, and adds scaffold tests. The overall architecture is sound and the isolation contract (checklist rows must not enter `int_combined`/`occurrences.parquet`) is correctly enforced.

One critical defect exists: an INNER JOIN in `checklist.sql` silently drops every checklist row whose county name does not match a county in `stg_geo__us_counties`. This can produce a falsely small (or empty) parquet without any error. Two warnings cover a stale always-failing test and a missing null-guard for the `family` column. One informational note covers a magic-number threshold in the test.

---

## Critical Issues

### CR-01: INNER JOIN to `final_eco` silently drops checklist rows with unrecognized counties

**File:** `data/dbt/models/marts/checklist.sql:78`

**Issue:** The final SELECT uses `JOIN final_eco fe ON fe.county = wl.county` — an INNER JOIN. `final_eco` is built from `stg_geo__us_counties`, which contains only counties present in the geographic source data. If a county name in `checklist_data.species_counties` (loaded from the TSV by `checklist_pipeline.py`) does not exactly match a county name in the geography table (whitespace, casing, abbreviation, or missing entry), the corresponding checklist row is silently dropped from the output parquet. No error is raised; the row count merely shrinks.

The `eco_fallback` CTE already handles the case where `ST_Within` returns no match (county centroid lies outside all ecoregion polygons) — but it cannot help when the county name itself is absent from `final_eco`. Because `checklist_pipeline.py` loads county names verbatim from a TSV with no normalization against the geography table, the join key mismatch risk is real.

The threshold test `test_checklist_row_count` (>= 2000 rows) would catch a catastrophic drop but not a partial one affecting a handful of counties.

**Fix:** Change to a `LEFT JOIN` and expose the gap rather than hiding it:

```sql
-- checklist.sql line 78 — use LEFT JOIN so no row is dropped
LEFT JOIN final_eco fe ON fe.county = wl.county
```

Then add a dbt test or an assertion in `test_dbt_scaffold.py` that counts rows where `ecoregion_l3 IS NULL` and alerts if the fraction exceeds an acceptable threshold (e.g., 0 is ideal; warn on > 5%). This preserves all checklist rows and makes geography-join failures visible.

---

## Warnings

### WR-01: `test_no_production_dbt_references` will always fail with the current `run.py`

**File:** `data/tests/test_dbt_scaffold.py:114-130`

**Issue:** The test asserts that `data/run.py` and `data/nightly.sh` contain no references to `"data/dbt"`. The test was written during the spike phase (Phase 83) to ensure the production surface was not polluted. However, `run.py` has since been updated in Phase 88 to call `bash data/dbt/run.sh build` via `_run_dbt_build()`, and its docstring at lines 57 and 64 contains the literal string `data/dbt`. `git grep` finds these matches and the test asserts `result.returncode != 0` (i.e., no matches), so this test always fails.

Because the test is in the shared `pytest` suite run by `uv run pytest`, it will block CI and local `uv run pytest` from passing.

**Fix:** Either delete this test (it served its spike-isolation purpose and is now stale) or rewrite it to express the current invariant that actually matters — for example, that checklist rows do not appear in `occurrences.parquet`. The `test_occurrences_row_count_not_inflated_by_checklist` test already covers that invariant, so deletion is the cleaner option:

```python
# Delete test_no_production_dbt_references — the spike isolation
# contract it enforced was superseded when Phase 88 integrated dbt
# into run.py as the sole transform producer.
```

### WR-02: `family` can be NULL in `checklist.parquet` with no test coverage

**File:** `data/dbt/models/marts/checklist.sql:30-35` and `data/dbt/models/marts/schema.yml:122`

**Issue:** `family` is populated via two LEFT JOINs: `stg_inat__canonical_to_taxon_id` and `stg_inat__taxon_lineage_extended`. If a checklist species has no iNat taxon ID mapping (common for species recently added to the checklist, or for names that do not yet have a resolved `canonical_name`), `family` will be NULL. The schema contract in `schema.yml` does not declare `family` as `not_null` for the `checklist` model (line 122 lists the column without a test). The existing scaffold tests check `canonical_name` and `specific_epithet` for nulls but skip `family`.

A NULL `family` is not a data-loss blocker on its own, but the sidebar and species filtering on the frontend group by family. Checklist rows with a null family are invisible to those filters, silently reducing the effective utility of the checklist. The absence of a test means this degrades undetected over time as new species are added.

**Fix:** Add a `data_tests: not_null` entry for `family` in `schema.yml` (or use a warn-severity test if some nulls are acceptable), and add a corresponding assertion in `test_dbt_scaffold.py`:

```yaml
# schema.yml — add under checklist.family
- name: family
  data_type: varchar
  data_tests:
    - not_null
```

---

## Info

### IN-01: `test_checklist_row_count` magic-number threshold of 2000 is undocumented

**File:** `data/tests/test_dbt_scaffold.py:156`

**Issue:** The assertion `row[0] >= 2000` has no comment explaining where 2000 comes from. The WA checklist (Bartholomew et al. 2024) lists approximately 600 species across 39 counties, giving a theoretical maximum of ~23,400 (species × county) rows. The 2000 floor is low enough that a significant data-loss regression (e.g., 90% of counties dropping due to a TSV format change) would still pass the test. Compare the analogous occurrences test, which documents its baseline (`# Baseline pre-Phase-111: 47,876 rows`).

**Fix:** Add an inline comment with the expected order of magnitude and tighten the threshold:

```python
# WA checklist: ~600 species × ~39 counties = up to ~23k rows.
# Baseline post-Phase-111: confirm actual count and set floor to ~80% of it.
assert row[0] >= 10_000, f"expected >= 10_000 rows, got {row[0]}"
```

---

_Reviewed: 2026-05-23T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
