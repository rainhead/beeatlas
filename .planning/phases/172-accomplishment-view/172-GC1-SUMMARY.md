---
phase: "172"
plan: "GC1"
subsystem: data-export
tags: [gap-closure, data-correctness, collectors-export]
key-files:
  modified:
    - data/collectors_export.py
    - data/tests/test_collectors_export.py
    - src/tests/fixtures/collectors.fixture.json
    - src/tests/data-collectors.test.ts
decisions:
  - "Split _QUERY from _ACCOM_QUERY: existing D-01 gate metrics unchanged; accomplishment aggregations use tier='atlas' predicate."
  - "Emit county_names + ecoregion_names sorted arrays alongside counts."
  - "Species output key: 'name' (from scientificName); no 'count'."
metrics:
  duration: "~15 minutes"
  completed: "2026-06-28T17:58:31Z"
  commits: 2
---

# Phase 172 Gap-Closure 1 Summary

Gap-closure pass 1 of the Phase 172 operator UAT (2026-06-28). Fixes three data-correctness bugs in `data/collectors_export.py`, updates all test fixtures to match the new output shape.

## One-liner

Accomplishment aggregations migrated to `tier='atlas'` predicate (includes uncatalogued specimens), species names switched to cased `scientificName`, per-species count dropped.

## Fixes Applied

### FIX A — Seasons/county/ecoregion predicate: tier='atlas'

**Root cause:** `active_since`, `seasons_count`, `county_count`, `ecoregion_count` were computed inside `_QUERY` using the old D-01 gate (`ecdysis_id IS NOT NULL OR record_type IN ('waba_specimen', 'provisional_sample')`). This drops `record_type='specimen'`, `tier='atlas'`, `ecdysis_id IS NULL` rows — atlas specimens collected but not yet catalogued. The operator had 24 such rows in 2026 and 7 in 2024, causing the badge to undercount seasons.

**Fix:** Removed the four columns from `_QUERY` (pre-172 metrics untouched). Added `_ACCOM_QUERY` with `WHERE tier='atlas'` — the correct Phase 170 facet for WABA atlas collecting. Results merged into records by login. Also emits `county_names` + `ecoregion_names` as sorted JSON arrays of distinct non-null values (`list_sort(array_agg(DISTINCT ...) FILTER (WHERE ... IS NOT NULL))`).

### FIX B — Species names: cased `scientificName` not lowercase `canonical_name`

**Root cause:** `_SPECIES_QUERY` used `sp.canonical_name` which is stored lowercase in species.parquet ("agapostemon femoratus"). `sp.scientificName` is properly cased ("Agapostemon femoratus") and is the correct display field.

**Fix:** `_SPECIES_QUERY` now selects `sp.scientificName`. Output key changed from `canonical_name` to `name`. Query predicate also changed to `tier='atlas'` for consistency with FIX A.

### FIX C — Remove per-species occurrence count

**Root cause:** The `species_by_genus` output included `"count": N` per species. Operator UAT: unexplained and confusing.

**Fix:** Removed `COUNT(*) AS occ_count` from `_SPECIES_QUERY`. Output dict no longer emits `count`. Final shape: `{"name": "<cased scientificName>", "slug": "<Genus/epithet>"}`.

## Deviations from Plan

None — this is a gap-closure pass, not a plan with deviations.

## Test Results

- `cd data && uv run pytest tests/test_collectors_export.py -x`: **12/12 passed**
- `npm test` (from repo root): **897/897 passed**

Key new/updated tests:
- `test_uncatalogued_atlas_specimen_counted_in_seasons` — regression for FIX A
- `test_seasons_count_is_distinct_years` — updated to assert 3 (not 2) seasons for alice
- `test_county_and_ecoregion_counts` — added county_names/ecoregion_names sorted-array assertions
- `test_species_by_genus_structure` — checks `name` (cased), absence of `count` and `canonical_name`
- Phase 172 describe block in data-collectors.test.ts — updated for all three fixes

## Out of Scope (pass 2)

Map rendering redesign (issues 4 and 5 from UAT): ecoregion SVG simplification and per-collector map delivery reuse. This pass is data/export layer only.

## Self-Check

- [x] `data/collectors_export.py` exists and is modified
- [x] `data/tests/test_collectors_export.py` exists and is modified
- [x] `src/tests/fixtures/collectors.fixture.json` exists and is modified
- [x] `src/tests/data-collectors.test.ts` exists and is modified
- [x] commit 3dc4c7c1 exists (fix: export)
- [x] commit c8aec55a exists (test: fixtures)

## Self-Check: PASSED
