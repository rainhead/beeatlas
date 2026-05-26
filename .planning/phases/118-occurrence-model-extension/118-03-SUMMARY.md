---
phase: 118-occurrence-model-extension
plan: "03"
subsystem: data-pipeline
tags: [dbt, duckdb, species, inat_obs_count, parquet, json, bugfix]
dependency_graph:
  requires:
    - phase: 118-01
      provides: data/dbt/models/sources.yml#inat_obs_data
    - phase: 118-02
      provides: data/dbt/models/intermediate/int_combined.sql (ARM 3 iNat obs)
  provides:
    - data/dbt/models/intermediate/int_species_universe.sql (inat_obs_count_agg CTE + INTEGER[12] bug fix)
    - data/dbt/models/marts/species.sql (20-column SELECT with inat_obs_count)
    - data/dbt/models/marts/schema.yml (20-column species contract)
    - data/species_export.py (SPECIES_COLUMNS 21 entries, PyArrow schema updated)
    - public/data/species.parquet (21 cols incl. slug)
    - public/data/species.json (inat_obs_count key for every species)
  affects:
    - Phase 120 (display "N specimens · N community observations" on species pages)
tech_stack:
  added: []
  patterns:
    - "INTEGER[] workaround for DuckDB 1.5.3 CASE-expression type-inference bug with INTEGER[12] and stg_inat joins + ORDER BY"
    - "inat_obs_count_agg CTE pattern: SELECT source directly to avoid circular DAG (same as checklist_count_agg)"
    - "SPECIES_COLUMNS position invariant: slug stays last; mart_cols = SPECIES_COLUMNS[:-1] excludes slug only"
key_files:
  created: []
  modified:
    - data/dbt/models/intermediate/int_species_universe.sql
    - data/dbt/models/marts/species.sql
    - data/dbt/models/marts/schema.yml
    - data/species_export.py
decisions:
  - "DuckDB 1.5.3 bug: CASE expression with INTEGER[12] branches fails with 'Unimplemented type for case expression: INTEGER[12]' when stg_inat taxon-lineage joins are present + ORDER BY. Fix: cast occ_agg.month_histogram to INTEGER[] in CTE; remove ::INTEGER[12] from checklist_month_agg and CASE branches; cast final CASE result to ::INTEGER[12]. Preserves schema contract type."
  - "inat_obs_count inserted at SPECIES_COLUMNS position -2 (before slug) so mart_cols = SPECIES_COLUMNS[:-1] includes it when reading the dbt mart"
metrics:
  duration_minutes: 24
  completed_date: "2026-05-26"
  tasks_completed: 3
  files_modified: 4
requirements_completed: [OCC-02, OCC-03]
---

# Phase 118 Plan 03: inat_obs_count Column in Species Universe, Mart, and Export

**One-liner:** inat_obs_count_agg CTE added to int_species_universe reading iNat source directly; species.parquet grows to 21 cols; 301 of 630 species have iNat observations (max 3,628); Plan-01 RED test turns GREEN; pre-existing DuckDB 1.5.3 INTEGER[12] CASE bug fixed.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add inat_obs_count_agg CTE to int_species_universe.sql | 4639936 | data/dbt/models/intermediate/int_species_universe.sql |
| 2 | Add inat_obs_count to species.sql and schema.yml + fix INTEGER[12] bug | 8fdbe35 | data/dbt/models/intermediate/int_species_universe.sql, data/dbt/models/marts/species.sql, data/dbt/models/marts/schema.yml |
| 3 | Extend species_export.py SPECIES_COLUMNS and PyArrow schema | 4df536c | data/species_export.py |

## What Was Built

**int_species_universe.sql:** Added `inat_obs_count_agg` CTE that counts `inat_obs_data.observations` per `canonical_name`, reading the dbt source directly (not `ref('occurrences')`) to avoid a circular DAG. Added `COALESCE(ioa.inat_obs_count, 0)::BIGINT AS inat_obs_count` to the `species_universe` SELECT and a corresponding `LEFT JOIN inat_obs_count_agg ioa` in the FROM clause.

**species.sql:** Added `inat_obs_count` to the 20-column SELECT list; updated file header from "19 SQL columns" to "20 SQL columns + 1 Python-added slug = 21 final columns".

**schema.yml:** `species` model contract grows from 19 to 20 columns: `- name: inat_obs_count` / `data_type: bigint` appended after `checklist_count`.

**species_export.py:** `SPECIES_COLUMNS` grows from 20 to 21 entries (`'inat_obs_count'` inserted at position -2, before `'slug'`); PyArrow schema gains `('inat_obs_count', pa.int64())` before `('slug', pa.string())`; docstrings updated (19→20 cols, 20→21 cols).

## Verification Results

- `bash data/dbt/run.sh build`: PASS=48, WARN=1 (pre-existing test_lin05_lineage_coverage), ERROR=0
- `uv run python species_export.py`: 630 rows, exits 0
- `uv run pytest tests/test_dbt_scaffold.py tests/test_species_export.py`: 18/18 PASSED
  - `test_inat_obs_count_in_species` is now GREEN (was RED in Plan 01)
  - Three OCC-01 tests (test_occurrences_source_column, test_inat_obs_rows_in_occurrences, test_source_no_nulls) remain GREEN
- species.parquet sandbox: 20 columns, min=0, max=3628, nulls=0
- species.json: 630 species, 301 with `inat_obs_count > 0`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing DuckDB 1.5.3 INTEGER[12] CASE expression bug**
- **Found during:** Task 2 (dbt build verification)
- **Issue:** `int_species_universe` failed with "Not implemented Error: Unimplemented type for case expression: INTEGER[12]". This is the pre-existing error mentioned in Plan 02's summary ("Plan 03 will address this as part of the species extension"). The bug occurs when CASE branches mix INTEGER[12] types from views that go through stg_inat taxon-lineage joins combined with ORDER BY. DuckDB 1.5.3's query planner cannot unify the types in this specific join+sort context.
- **Root cause:** The `occ_agg` CTE `SELECT * FROM int_species_occurrences_agg` exposes `month_histogram` as `INTEGER[12]`. When `stg_inat__taxon_lineage_extended` is joined (which is a VIEW over `inaturalist_data.taxon_lineage_extended`) and an ORDER BY is present, DuckDB 1.5.3 fails to type-check the CASE expression that mixes this `INTEGER[12]` with the `INTEGER[12]` from `checklist_month_agg`.
- **Fix:** (1) Cast `occ_agg.month_histogram::INTEGER[]` (variable-length list) in the occ_agg CTE; (2) Remove `::INTEGER[12]` cast from `checklist_month_agg` list_value output; (3) Remove `::INTEGER[12]` casts from CASE branches; (4) Cast the entire CASE expression result `(CASE ... END)::INTEGER[12]` at the species_universe SELECT level. This ensures the CASE operates on uniform `INTEGER[]` types internally, then casts to the required `INTEGER[12]` type at the end.
- **Also fixed:** Changed `[0,0,0,0,0,0,0,0,0,0,0,0]::INTEGER[]` (from a prior fix attempt) to `[0,0,0,0,0,0,0,0,0,0,0,0]` (no explicit cast, resolves to INTEGER[] in the CASE context).
- **Impact:** None on outputs — `integer[12]` type is preserved in the species mart and parquet. The dbt `species` contract (`month_histogram: integer[12]`) is satisfied.
- **Files modified:** data/dbt/models/intermediate/int_species_universe.sql
- **Committed in:** 8fdbe35 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — pre-existing DuckDB 1.5.3 bug that Plan 03 was designated to resolve)

## Known Stubs

None — `inat_obs_count` is fully wired from source data through dbt to species.json.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes at trust boundaries. The new `inat_obs_count` column is additive read-only aggregate data from the existing `inat_obs_data.observations` source.

## Self-Check: PASSED

- [x] data/dbt/models/intermediate/int_species_universe.sql modified (4639936, 8fdbe35) — inat_obs_count_agg CTE, INTEGER[12] fix
- [x] data/dbt/models/marts/species.sql modified (8fdbe35) — inat_obs_count in SELECT, updated header
- [x] data/dbt/models/marts/schema.yml modified (8fdbe35) — 20-column species contract
- [x] data/species_export.py modified (4df536c) — SPECIES_COLUMNS 21 entries, PyArrow schema updated
- [x] dbt build: PASS=48 WARN=1 ERROR=0 (all 49 models/tests accounted for)
- [x] species.parquet sandbox: 20 columns, inat_obs_count present, 0 nulls, 301 positive rows
- [x] species.json: 630 species, 301 with inat_obs_count > 0, max=3628
- [x] test_inat_obs_count_in_species: PASSED (was RED in Plan 01, now GREEN)
- [x] All 18 tests in test_dbt_scaffold.py + test_species_export.py pass
