---
phase: "086"
plan: "04"
subsystem: data-pipeline
tags: [dbt, duckdb, species-mart, PORT-01, intermediate-models, parquet]

dependency_graph:
  requires:
    - phase: "086-01"
      provides: species-diff-harness
    - phase: "086-02"
      provides: staging-views-for-species-dag
  provides:
    - int_species_occurrences_agg (temporal aggregates view)
    - int_species_geo_agg (geographic aggregates view)
    - int_species_universe (FULL OUTER JOIN + lineage backfill, materialized as table)
    - marts/species (18-column external parquet mart)
    - 18-column enforced contract in marts/schema.yml
  affects: ["086-05"]

tech_stack:
  added: []
  patterns:
    - dbt-external-mart-with-enforced-contract (species follows occurrences pattern)
    - case-based-array-null-backfill (CASE vs COALESCE for INTEGER[12] per Pitfall 2)
    - source-over-staging-for-temporal-counts (bypass spatial filter on ecdysis source)
    - ref-over-hardcoded-path-for-external-mart (int_species_geo_agg uses ref('occurrences'))

key_files:
  created:
    - data/dbt/models/intermediate/int_species_occurrences_agg.sql
    - data/dbt/models/intermediate/int_species_geo_agg.sql
    - data/dbt/models/intermediate/int_species_universe.sql
    - data/dbt/models/marts/species.sql
  modified:
    - data/dbt/models/marts/schema.yml

decisions:
  - "specimen_count cast to BIGINT in int_species_occurrences_agg — DuckDB SUM(CASE WHEN ...) produces HUGEINT; production schema and dbt contract require BIGINT"
  - "month_histogram contract type is integer[12] (not integer[]) — matches DuckDB emitted type from list_value()::INTEGER[12]; plain integer[] causes contract mismatch"
  - "int_species_occurrences_agg reads source('ecdysis_data', 'occurrences') not ref('stg_ecdysis__occurrences') — staging view applies spatial lat filter that would incorrectly exclude temporally valid records with null coordinates"
  - "provisional_agg inlined in int_species_universe as CTE (not separate intermediate model) — reads ref('occurrences') parallel to geo_agg, consistent with plan design"
  - "slug NOT emitted from any SQL model — unicodedata.normalize('NFKD') has no DuckDB equivalent; deferred to Plan 086-05 Python post-step"

metrics:
  duration: "~15min"
  completed: "2026-05-14"
  tasks_completed: 3
  files_changed: 5
---

# Phase 086 Plan 04: PORT-01 Species Parquet Mart Summary

PORT-01 (parquet half): 3 intermediate models + 1 mart model replace the SQL transforms in `species_export.py`, producing `target/sandbox/species.parquet` with 18 columns, 629 rows, matching `public/data/species.parquet` in row count and canonical_name set.

## Model Row Counts

| Model | Type | Rows |
|-------|------|------|
| int_species_occurrences_agg | view | 556 |
| int_species_geo_agg | view | 556 |
| int_species_universe | table | 629 |
| marts/species (species.parquet) | external parquet | 629 |

## Diff Harness State After This Plan

| Test | Status | Notes |
|------|--------|-------|
| test_species_parquet_row_count_matches | PASS | 629 == 629 |
| test_species_canonical_name_key_set_matches | PASS | 0 rows in both EXCEPT directions |
| test_species_parquet_schema_matches | FAIL (expected) | Public only: `('slug', 'VARCHAR')` — closed in Plan 086-05 |
| test_species_json_matches | SKIP | sandbox/species.json not yet produced — Plan 086-05 |
| test_seasonality_json_matches | SKIP | sandbox/seasonality.json not yet produced — Plan 086-05 |
| test_occurrences_schema_matches | FAIL (pre-existing) | 3-column deferred cleanup from Phase 085, worktree-local condition |
| All other existing diff tests | PASS | No regressions |

## dbt Build Summary

- **Before this plan:** PASS=42 (Plan 086-02 baseline)
- **After this plan:** PASS=46 WARN=0 ERROR=0

## Task Commits

1. **Task 1: int_species_occurrences_agg + int_species_geo_agg** — `8921d54`
2. **Task 2: int_species_universe** — `e866c47`
3. **Task 3: marts/species.sql + schema.yml contract** — `4e40da5` (includes specimen_count BIGINT fix)

## Hand-off Contract for Plan 086-05

`data/dbt/target/sandbox/species.parquet` exists at 18 columns:
- `scientificName`, `canonical_name`, `family`, `subfamily`, `tribe`, `genus`, `subgenus`, `specific_epithet`, `on_checklist`, `status`, `occurrence_count`, `specimen_count`, `provisional_count`, `first_occurrence_date`, `last_occurrence_date`, `month_histogram`, `county_count`, `ecoregion_count`

Plan 086-05 must:
1. Read this 18-column parquet
2. Add `slug` column via `feeds._slugify(scientificName)` using Python `unicodedata.normalize`
3. Overwrite the parquet with 19 columns using pyarrow (same SNAPPY codec as species_export.py lines 232-256)
4. Emit `species.json` and `seasonality.json` to sandbox using the existing Python serialization forms
5. Turn `test_species_parquet_schema_matches`, `test_species_json_matches`, `test_seasonality_json_matches` green

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] specimen_count HUGEINT vs BIGINT contract mismatch**
- **Found during:** Task 3 (first dbt build with enforced contract)
- **Issue:** DuckDB `SUM(CASE WHEN id IS NOT NULL THEN 1 ELSE 0 END)` produces HUGEINT, but the production species.parquet schema uses BIGINT and the dbt contract specified BIGINT
- **Fix:** Added `CAST(...AS BIGINT)` to the specimen_count expression in int_species_occurrences_agg.sql
- **Files modified:** data/dbt/models/intermediate/int_species_occurrences_agg.sql
- **Commit:** 4e40da5

**2. [Rule 1 - Bug] month_histogram contract type integer[] vs INTEGER[12] mismatch**
- **Found during:** Task 3 (first dbt build with enforced contract)
- **Issue:** DuckDB emits `INTEGER[12]` for `list_value(...)::INTEGER[12]`; contract declared `integer[]` which caused a type mismatch
- **Fix:** Updated contract data_type to `integer[12]` in marts/schema.yml
- **Files modified:** data/dbt/models/marts/schema.yml
- **Commit:** 4e40da5

Both fixes were applied in the Task 3 commit — the bugs were discovered on the first full dbt build and resolved before the task commit.

## Known Stubs

None — the 18-column parquet is fully wired. The only deliberately omitted column is `slug`, which is NOT a stub but an explicitly planned gap closed by Plan 086-05.

## Threat Flags

None — this plan creates local file artifacts (parquet) with no network surface, no auth paths, and no schema changes at trust boundaries.

## Self-Check: PASSED

- [x] `data/dbt/models/intermediate/int_species_occurrences_agg.sql` exists
- [x] `data/dbt/models/intermediate/int_species_geo_agg.sql` exists
- [x] `data/dbt/models/intermediate/int_species_universe.sql` exists
- [x] `data/dbt/models/marts/species.sql` exists
- [x] `data/dbt/target/sandbox/species.parquet` exists (18 columns, 629 rows)
- [x] Commits `8921d54`, `e866c47`, `4e40da5` exist
- [x] `dbt build` PASS=46 WARN=0 ERROR=0
- [x] test_species_parquet_row_count_matches: PASS
- [x] test_species_canonical_name_key_set_matches: PASS
- [x] test_species_parquet_schema_matches: FAIL by exactly ('slug', 'VARCHAR') — expected
