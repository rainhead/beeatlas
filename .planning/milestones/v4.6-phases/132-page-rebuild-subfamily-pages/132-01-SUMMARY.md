---
phase: 132-page-rebuild-subfamily-pages
plan: "01"
subsystem: data-pipeline
tags: [dbt, rollup, higher-taxa, taxonomy, PAGE-01, PAGE-04, D-08, D-10]
dependency_graph:
  requires:
    - data/dbt/models/marts/species.sql (species mart — rollup source)
    - data/dbt/models/staging/stg_inat__genus_taxon_ids.sql (genus taxon_id join)
    - data/raw/taxa.csv.gz (ancestry lookup)
  provides:
    - data/dbt/models/staging/stg_inat__higher_rank_taxon_ids.sql (subfamily/tribe/subgenus name→taxon_id)
    - data/dbt/models/marts/higher_taxa.sql (rollup parquet: counts + member_taxon_ids)
    - data/dbt/target/sandbox/higher_taxa.parquet (materialized artifact)
  affects:
    - plans 132-02..04 (all downstream plans read higher_taxa.parquet)
tech_stack:
  added: []
  patterns:
    - dbt external parquet materialization (SNAPPY, matching species.sql pattern)
    - read_csv('../raw/taxa.csv.gz') in dbt staging (extending stg_inat__genus_taxon_ids pattern)
    - 4-rank UNION ALL rollup from ref('species') grouped by ancestor taxon_id
    - to_json(list(DISTINCT ...))::VARCHAR for member_taxon_ids JSON array
    - DuckDB singular test for (name, rank) uniqueness within Anthophila
key_files:
  created:
    - data/dbt/models/staging/stg_inat__higher_rank_taxon_ids.sql
    - data/dbt/models/marts/higher_taxa.sql
    - data/dbt/tests/test_higher_rank_taxon_ids_name_rank_unique.sql
    - data/tests/test_higher_taxa.py
  modified:
    - data/dbt/models/staging/schema.yml (not_null tests for higher_rank_taxon_ids columns)
    - data/dbt/models/marts/schema.yml (enforced contract for higher_taxa — 13 columns)
decisions:
  - "D-10 resolved: single combined higher_taxa model carrying member_taxon_ids JSON-array VARCHAR; no separate edges model"
  - "to_json()::VARCHAR cast required — DuckDB to_json() returns JSON type, not VARCHAR; contract declares varchar"
metrics:
  duration: ~45 minutes
  completed: 2026-06-03
  tasks_completed: 2
  files_created: 4
  files_modified: 2
---

# Phase 132 Plan 01: dbt higher_taxa Rollup — Summary

Single combined `higher_taxa` dbt mart producing taxon_id-keyed rollup for all four higher ranks
(genus/subgenus/tribe/subfamily) with counts, lineage context columns, and JSON member_taxon_ids.

## What Was Built

### Task 1: Failing test suite + staging view (RED)

`stg_inat__higher_rank_taxon_ids` extends the proven `stg_inat__genus_taxon_ids.sql` read_csv
pattern to `rank IN ('subfamily', 'tribe', 'subgenus')` filtered to Anthophila (ancestry contains
'630955'). Output columns: `name` (capitalized), `rank`, `taxon_id::INTEGER`.

Schema.yml gains `not_null` tests on all three columns. A singular dbt test
(`test_higher_rank_taxon_ids_name_rank_unique.sql`) asserts `(name, rank)` is unique within
Anthophila — the A1 safety net for the name-match join in the mart.

`data/tests/test_higher_taxa.py` (16 tests, all sandbox-gated) covers:
- Genus/tribe/subgenus baseline assertions from RESEARCH.md
- Exactly 12 subfamilies, no Eumeninae (D-08/HIER-05)
- Rollup == per-species sum (fan-out Pitfall 1 guard)
- Checklist-only species in member_taxon_ids (PAGE-04)
- taxon_id unique + not_null; member_taxon_ids column present

### Task 2: higher_taxa mart — tests GREEN

`higher_taxa.sql` materializes `target/sandbox/higher_taxa.parquet` via a 4-rank UNION ALL:

| Rank | Ancestor join | member_taxon_ids children |
|------|---------------|---------------------------|
| genus | stg_inat__genus_taxon_ids on lower(sp.genus)=genus_name | species.taxon_id (per-species) |
| subgenus | stg_inat__higher_rank_taxon_ids rank='subgenus' on sp.subgenus=name | species.taxon_id |
| tribe | stg_inat__higher_rank_taxon_ids rank='tribe' on sp.tribe=name | genus taxon_id via genus join |
| subfamily | stg_inat__higher_rank_taxon_ids rank='subfamily' on sp.subfamily=name | genus taxon_id via genus join |

Each rank is a separate `GROUP BY ancestor_taxon_id` — no fan-out join (Pitfall 1 avoided).

The enforced contract in `marts/schema.yml` declares all 13 emitted columns including
`member_taxon_ids` (varchar) as the 13th. Missing this column causes `dbt build` to hard-fail.

## Verified Baselines (all 16 pytest assertions GREEN)

| Taxon | Rank | specimen_count | inat_obs_count |
|-------|------|----------------|----------------|
| Andrena | genus | 3,589 | 2,735 |
| Bombus | genus | 1,768 | 7,763 |
| Megachile | genus | 1,186 | 480 |
| Lasioglossum | genus | 1,718 | 115 |
| Osmia | genus | 1,110 | 450 |
| Nomada | genus | 565 | 616 |
| Bombini | tribe | 1,768 | 7,763 |
| Andrenini | tribe | 3,589 | 2,735 |
| Osmiini | tribe | 1,696 | 483 |
| Pyrobombus | subgenus | 1,465 | — |

Exactly 12 subfamily rows; Eumeninae absent; rollup matches per-species sums; checklist-only
species present in at least one genus's member_taxon_ids.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `to_json()::VARCHAR` cast required by enforced contract**
- **Found during:** Task 2 first build attempt
- **Issue:** DuckDB `to_json()` returns type `JSON`, not `VARCHAR`. The enforced contract declared
  `member_taxon_ids` as `varchar`. Build hard-failed with `data type mismatch: JSON vs VARCHAR`.
- **Fix:** Added `::VARCHAR` cast on all four `to_json(list(DISTINCT ...))` expressions in the UNION ALL
- **Files modified:** data/dbt/models/marts/higher_taxa.sql
- **Commit:** fe7471a (same task commit)

**2. [Rule 3 - Blocking] Stale species.parquet caused baseline mismatches**
- **Found during:** Task 2 pytest run
- **Issue:** The sandbox `species.parquet` was stale (built before Phase 131 column drops);
  Andrena showed 2,445 specimens instead of 3,589. The live `species.json` had the correct
  numbers, confirming the mart parquet was out of date.
- **Fix:** Ran `bash data/dbt/run.sh build --select species` to refresh the species parquet
  before rebuilding higher_taxa
- **Files modified:** None (data pipeline rebuild, no code change)
- **Commit:** n/a (no code change needed)

**3. [Rule 3 - Blocking] dbt_utils unavailable — replaced with singular SQL test**
- **Found during:** Task 1 schema.yml authoring
- **Issue:** No `packages.yml` in the project; `dbt_utils.unique_combination_of_columns` would
  fail at parse time.
- **Fix:** Used a singular SQL test (`test_higher_rank_taxon_ids_name_rank_unique.sql`) that
  returns rows when `GROUP BY name, rank HAVING COUNT(*) > 1` — equivalent assertion, no macro dependency
- **Files modified:** data/dbt/tests/test_higher_rank_taxon_ids_name_rank_unique.sql (created)
- **Commit:** f885d0f

## Contract Confirmation

`higher_taxa` enforced contract declares all 13 columns:
1. taxon_id (integer, not_null + unique)
2. rank (varchar, not_null)
3. name (varchar, not_null)
4. family (varchar)
5. subfamily (varchar)
6. tribe (varchar)
7. genus (varchar)
8. specimen_count (bigint)
9. inat_obs_count (bigint)
10. occurrence_count (bigint)
11. species_count (bigint)
12. member_taxon_ids (varchar) — JSON array of direct child taxon_ids (D-10); 13th column

`grep -c member_taxon_ids higher_taxa.sql` = 12 (8 occurrences in SQL body + comments)
`grep -c member_taxon_ids schema.yml` = 1 (contract declaration)

## Known Stubs

None. The rollup produces real data from the live species mart.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries
beyond what the plan's threat model covers. T-132-01 through T-132-04 are all mitigated:
- T-132-01: fan-out guard verified by `test_genus_rollup_equals_species_sum`
- T-132-02: Eumeninae absent verified by `test_eumeninae_absent` + `test_exactly_12_subfamilies`
- T-132-03: (name, rank) unique singular dbt test passes
- T-132-04: `assert len(higher_taxa_rows) > 0` in test suite; contract enforced

## Self-Check: PASSED

Files exist:
- [FOUND] data/dbt/models/staging/stg_inat__higher_rank_taxon_ids.sql
- [FOUND] data/dbt/models/marts/higher_taxa.sql
- [FOUND] data/dbt/tests/test_higher_rank_taxon_ids_name_rank_unique.sql
- [FOUND] data/tests/test_higher_taxa.py
- [FOUND] data/dbt/target/sandbox/higher_taxa.parquet

Commits:
- [FOUND] f885d0f — test(132-01): add failing rollup tests + staging view for higher-rank taxon_ids
- [FOUND] fe7471a — feat(132-01): higher_taxa mart + enforced contract — all rollup tests GREEN
