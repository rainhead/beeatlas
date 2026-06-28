---
phase: 172-accomplishment-view
plan: "02"
subsystem: data-export
tags: [accomplishments, collectors, pipeline, tdd, green-phase]
dependency_graph:
  requires: [172-01-test-scaffold]
  provides: [172-02-collectors-export-extended]
  affects: [data/collectors_export.py]
tech_stack:
  added: []
  patterns: [duckdb-filter-aggregate, defaultdict-grouping, tdd-green]
key_files:
  created: []
  modified:
    - data/collectors_export.py
decisions:
  - "MIN(o.year) directly for active_since — NULL-year rows correctly ignored by MIN aggregate; no COALESCE wrapper per feedback_min_coalesce_aggregation"
  - "_SPECIES_QUERY uses LEFT JOIN but filters sp.specific_epithet IS NOT NULL — effectively an inner join on species-rank rows; only WABA-contribution rows via D-01 predicate"
  - "defaultdict(lambda: defaultdict(list)) used for two-level grouping; SQL ORDER BY guarantees correct insertion order for species within genus; sorted() for genus alphabetical order"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-28"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 1
---

# Phase 172 Plan 02: Extend collectors_export.py with Accomplishment Aggregates Summary

Extended `data/collectors_export.py` with four pre-aggregated accomplishment payloads (active_since, seasons_count, county_count, ecoregion_count, species_by_genus) — turning the RED Plan 01 tests GREEN with zero new dbt contract changes.

## What Was Built

**Task 1: Add badge + caption-count aggregates to _QUERY (GREEN)**

Added four aggregate SELECT columns to the existing `_QUERY`, all scoped to the same D-01 WABA-contribution WHERE predicate (verbatim, unchanged):
- `MIN(o.year) AS active_since` — earliest contributing year (D-05)
- `COUNT(DISTINCT o.year) AS seasons_count` — distinct active years, not a max-min+1 span (D-05)
- `COUNT(DISTINCT o.county) FILTER (WHERE o.county IS NOT NULL) AS county_count` (ACCOM-01)
- `COUNT(DISTINCT o.ecoregion_l3) FILTER (WHERE o.ecoregion_l3 IS NOT NULL) AS ecoregion_count` (ACCOM-03)

Extended the 10-field tuple unpacking to 14 fields and added the four new fields to the per-record dict, with `int(active_since) if active_since is not None else None` defensive guard for production data.

Tests turned GREEN: `test_badge_fields_present_and_typed`, `test_seasons_count_is_distinct_years`, `test_active_since_is_min_year`, `test_county_and_ecoregion_counts`.

**Task 2: Add _SPECIES_QUERY + species_by_genus grouping (GREEN)**

Added `_SPECIES_QUERY` module-level constant that joins occurrences to species.parquet on taxon_id, filters to D-01 WABA predicate plus `sp.specific_epithet IS NOT NULL` (D-04 species-rank gate), and orders by login/genus/canonical_name.

After processing main `_QUERY` rows, `export_collectors` runs `_SPECIES_QUERY` with the same `[str(occ_parquet), str(species_parquet)]` parameters and groups results using a two-level defaultdict (login → genus → species list). Each record receives `species_by_genus` as a list of `{genus, species:[{canonical_name, slug, count}]}`, with genera sorted alphabetically via `sorted(genus_dict.items())`. Collectors with no species-rank determinations get `[]`.

Added `from collections import defaultdict` at module level.

Test turned GREEN: `test_species_by_genus_structure`.

## Verification

- `cd data && uv run pytest tests/test_collectors_export.py`: 11/11 passed (all 5 new ACCOM tests GREEN; all 6 pre-existing tests remain GREEN)
- `npm test`: 896/896 passed (33 test files)
- `cd data && uv run pytest -m "not integration" --ignore=tests/test_collector_maps.py`: 265 passed, 9 skipped (test_collector_maps.py excluded — its ModuleNotFoundError is the designed RED signal from Plan 01 Task 3, resolved by Plan 03)
- D-01 predicate appears exactly once in collectors_export.py (grep confirmed)
- No `MIN(COALESCE` pattern anywhere in collectors_export.py (grep confirmed)

## Deviations from Plan

None — plan executed exactly as written. The `from collections import defaultdict` import was placed at module level (conventional) rather than inside the function body (as PATTERNS.md showed inline), which is cleaner and equivalent.

## Known Stubs

None. All five fields are wired end-to-end from the DuckDB aggregation to the JSON output. collectors.json will carry correct values on the next pipeline run.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes. `_SPECIES_QUERY` paths are bound parameters (`?`) from ASSETS_DIR, not string-interpolated — T-172-SQL accept disposition confirmed. T-172-SCOPE mitigated: both new queries reuse the D-01 predicate verbatim.

## Self-Check: PASSED

- `data/collectors_export.py` modified — `_SPECIES_QUERY` constant present (line 84), four new `_QUERY` columns (lines 68-74), extended unpacking (line 149), new dict fields (lines 169-174), species grouping logic (lines 177-200)
- Commits: 6e81ed34 (Task 1), 744abaa3 (Task 2) — verified in git log
