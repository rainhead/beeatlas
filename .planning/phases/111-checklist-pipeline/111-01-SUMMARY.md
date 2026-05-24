---
phase: 111-checklist-pipeline
plan: "01"
subsystem: database
tags: [dbt, duckdb, parquet, spatial, pytest, checklist]

# Dependency graph
requires:
  - phase: 110-offline-taxonomy-cutover
    provides: stg_inat__taxon_lineage_extended and stg_inat__canonical_to_taxon_id (family enrichment join)
  - phase: 111-checklist-pipeline
    provides: checklist_data.species_counties source table (2,861 rows from checklist_pipeline.py)
provides:
  - "data/dbt/models/marts/checklist.sql: external-materialized parquet mart, 2,861 rows, 12 columns"
  - "data/dbt/models/marts/schema.yml: checklist contract with enforced column types and not_null tests"
  - "data/tests/test_dbt_scaffold.py: 6 checklist content tests + 1 occurrences isolation test"
  - "data/run.py: checklist.parquet copied to EXPORT_DIR by _run_dbt_build"
affects: [112-checklist-map-layer, 113-species-pages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Separate mart pattern for non-point occurrence data (county-range assertions)"
    - "eco_fallback CTE with ST_Distance for island-centroid counties"
    - "_CHECKLIST_GUARD module-level skipif for sandbox-guarded pytest blocks"

key-files:
  created:
    - data/dbt/models/marts/checklist.sql
    - .planning/phases/111-checklist-pipeline/111-01-SUMMARY.md
  modified:
    - data/dbt/models/marts/schema.yml
    - data/tests/test_dbt_scaffold.py
    - data/run.py

key-decisions:
  - "checklist.parquet is a separate mart from occurrences.parquet — county-range assertions must not enter int_combined"
  - "eco_fallback CTE required for Island County and Kitsap County (centroids fall in Puget Sound)"
  - "lat/lon/year/month are NULL::DOUBLE/BIGINT throughout — county-range assertions carry no coordinates or dates"
  - "source='checklist' literal in every row — load-bearing for Phase 112 layer separation"

patterns-established:
  - "Pattern: external-materialized dbt mart with eco_fallback for island counties"
  - "Pattern: _CHECKLIST_GUARD module-level skipif for pre-build sandbox guards"
  - "Pattern: 12-column checklist schema as extensible multi-source occurrence format"

requirements-completed: [CHECK-01, CHECK-02, CHECK-04, EXT-01]

# Metrics
duration: 5min
completed: "2026-05-24"
---

# Phase 111 Plan 01: Checklist Pipeline Summary

**External dbt mart `checklist.parquet` with 2,861 species-county rows, county-centroid ecoregion spatial join, iNat family enrichment, and pytest isolation guard preventing checklist rows from entering occurrences.parquet**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-24T01:42:30Z
- **Completed:** 2026-05-24T01:47:32Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Created `checklist.sql` mart: external parquet materialization with county-centroid spatial join, iNat lineage enrichment for family, eco_fallback CTE for island counties, TRIM() on all varchar fields, source='checklist' literal
- Extended `schema.yml` with enforced checklist contract (12 typed columns, not_null on canonical_name and specific_epithet)
- Added 7 pytest assertions (6 checklist content tests + 1 occurrences isolation test) in TDD RED/GREEN cycle
- Wired checklist.parquet into `run.py` `_run_dbt_build` copy loop for EXPORT_DIR delivery

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 RED — checklist pytest assertions** - `b061e73` (test)
2. **Task 2: checklist.sql mart + schema.yml contract** - `8595097` (feat)
3. **Task 3: wire checklist.parquet into run.py** - `94cda04` (feat)

_TDD tasks: test (RED) then feat (GREEN) commits._

## Files Created/Modified

- `data/dbt/models/marts/checklist.sql` - External parquet mart, 2,861 rows, 12-column output with county-centroid ecoregion join
- `data/dbt/models/marts/schema.yml` - Added checklist model contract with enforced types and not_null tests
- `data/tests/test_dbt_scaffold.py` - Added _CHECKLIST_GUARD + 6 checklist tests + 1 isolation test (94 lines appended)
- `data/run.py` - Added "checklist.parquet" to _run_dbt_build artifact copy tuple

## Output Metrics (required by plan)

- **Actual row count:** 2,861 (spec: >= 2000)
- **Ecoregion fallback counties:** Island, Kitsap (centroids fall in Puget Sound; resolved via ST_Distance nearest neighbor)
  - Island County -> "Strait of Georgia/Puget Lowland"
  - Kitsap County -> "Strait of Georgia/Puget Lowland"
- **Species with null family:** 0 (all 527 checklist species resolve via stg_inat__taxon_lineage_extended)
- **Occurrences isolation:** 47,953 rows post-build (baseline ~47,876, well within <= 50,000 threshold)

## Decisions Made

- Used `DB_PATH` env var pointing to main repo's `beeatlas.duckdb` to run dbt build from the worktree (worktree has an empty placeholder database)
- eco_fallback CTE pattern is mandatory (Island County and Kitsap County centroids miss ST_Within)
- TRIM() applied to all varchar fields in the mart SELECT (canonical_name comes from stg_checklist__species which already has clean data; family from taxon_lineage_extended)

## Deviations from Plan

### Minor Discrepancy in Acceptance Criterion

**Plan acceptance criterion (Task 2):** `grep -A 1 "- name: canonical_name" schema.yml | grep -c "not_null"` should return >= 2 (described as "occurrences entry + new checklist entry both declare not_null on canonical_name").

**Actual state:** The `occurrences` model in schema.yml does NOT have not_null on canonical_name (it wasn't there before this phase and adding it to a pre-existing contract is out of scope). The checklist entry has not_null on canonical_name. The grep returns 1, not 2.

**Impact:** None — the dbt build passes, both not_null_checklist_canonical_name and not_null_checklist_specific_epithet dbt tests PASS. The checklist contract is fully enforced. The occurrences model's canonical_name not having not_null is a pre-existing condition.

---

**Total deviations:** 1 minor plan wording discrepancy (no code change needed)
**Impact on plan:** No functional impact. All must_haves verified. checklist.parquet produced with correct schema, row count, and isolation.

## Issues Encountered

**Worktree empty database:** The worktree's `data/beeatlas.duckdb` is a 274 KB placeholder (vs 1.2 GB main repo database). dbt build requires the full database. Resolved by using `DB_PATH=/Users/rainhead/dev/beeatlas/data/beeatlas.duckdb` env var when running dbt and pytest.

**Pre-existing test failures (out of scope):** `tests/test_dbt_diff.py` has 3 failures in the worktree environment due to missing `species.parquet` in `public/data/` (generated by `species_export.py`, not by `_run_dbt_build`). These exist before this plan's changes and are unrelated to the checklist work. All `test_dbt_scaffold.py` and `test_checklist_pipeline.py` tests pass (27/27).

## Known Stubs

None. All data is wired from real sources. checklist.parquet is populated from `checklist_data.species_counties` (2,861 actual rows from the committed WA checklist TSV), not placeholder data.

## Threat Flags

No new security-relevant surface introduced. checklist.parquet is a local-filesystem artifact derived from a committed static file, produced by dbt and copied by run.py. No new network endpoints, auth paths, or external service integrations.

## Next Phase Readiness

- `checklist.parquet` is ready for Phase 112 (checklist map layer): county-fill layer can join against the county GeoJSON using the `county` column
- `source='checklist'` column is load-bearing for Phase 112 layer separation
- `ecoregion_l3` column available for Phase 112 ecoregion-level filtering
- CHECK-03 (nightly.sh S3 upload wiring) is NOT covered in this plan — the plan scope was CHECK-01, CHECK-02, CHECK-04, EXT-01 only. Phase 111 may have a separate plan or nightly.sh changes for CHECK-03.

---
*Phase: 111-checklist-pipeline*
*Completed: 2026-05-24*

## Self-Check

### Files exist:
- `data/dbt/models/marts/checklist.sql`: FOUND
- `data/dbt/models/marts/schema.yml` (contains checklist entry): FOUND
- `data/tests/test_dbt_scaffold.py` (contains _CHECKLIST_GUARD): FOUND
- `data/run.py` (contains checklist.parquet): FOUND
- `data/dbt/target/sandbox/checklist.parquet`: FOUND
- `public/data/checklist.parquet`: FOUND

### Commits exist:
- b061e73 (Task 1 RED): FOUND
- 8595097 (Task 2 GREEN): FOUND
- 94cda04 (Task 3 run.py): FOUND

## Self-Check: PASSED
