---
phase: 123-dbt-layer-occurrence-synonymy
plan: "01"
subsystem: database
tags: [dbt, duckdb, python, data-pipeline, synonymy, seeds]

requires:
  - phase: quick-260528-syn
    provides: "occurrence_synonyms.csv with agapostemon texanus → subtilior mapping; apply_synonym() Python utility"

provides:
  - "dbt seed for occurrence_synonyms at data/dbt/seeds/occurrence_synonyms.csv (single source of truth)"
  - "dbt_project.yml seeds: section with +column_types for occurrence_synonyms"
  - "data/dbt/seeds/schema.yml with not_null + unique dbt tests on synonym column"
  - "inat_obs_pipeline.load_inat_obs writes normalize_scientific_name() only (no apply_synonym wrapper)"
  - "checklist_pipeline._update_occurrences_canonical_name writes normalize_scientific_name() only (no apply_synonym wrapper)"

affects:
  - 123-02-PLAN
  - int_combined.sql (Plan 02 will add LEFT JOIN on occurrence_synonyms seed)
  - int_species_universe.sql (Plan 02 will fix inat_obs_count_agg)

tech-stack:
  added: []
  patterns:
    - "dbt seed for small reference CSVs (occurrence synonymy table lives in data/dbt/seeds/)"
    - "Ingest writes raw normalize_scientific_name() output; synonym application delegated to dbt layer"

key-files:
  created:
    - data/dbt/seeds/occurrence_synonyms.csv
    - data/dbt/seeds/schema.yml
  modified:
    - data/dbt/dbt_project.yml
    - data/canonical_name.py
    - data/inat_obs_pipeline.py
    - data/checklist_pipeline.py

key-decisions:
  - "Moved occurrence_synonyms.csv to data/dbt/seeds/ (deleted data/occurrence_synonyms.csv); updated OCCURRENCE_SYNONYMS_PATH in canonical_name.py to point at new location — one canonical file, no duplication"
  - "apply_synonym() function kept in canonical_name.py (used by unit tests and available as utility); only ingest-time callsites in checklist_pipeline and inat_obs_pipeline removed"
  - "Unstaged canonicalize → normalize_scientific_name rename included in commits as context made clear this was the intended rename"

requirements-completed:
  - SYN-01

duration: 11min
completed: 2026-05-29
---

# Phase 123 Plan 01: dbt-Layer Occurrence Synonymy (Python/Seed Setup) Summary

**Moved occurrence_synonyms.csv to dbt seeds tree and stripped apply_synonym() from both ingest pipelines so raw canonical_name values flow to dbt; synonym application now delegated to Plan 02's int_combined LEFT JOIN**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-29T17:20:21Z
- **Completed:** 2026-05-29T17:32:09Z
- **Tasks:** 3
- **Files modified:** 6 (4 modified, 2 created, 1 deleted)

## Accomplishments

- Created `data/dbt/seeds/` directory with `occurrence_synonyms.csv` (exact copy of former `data/occurrence_synonyms.csv`) and `schema.yml` with not_null + unique dbt tests
- Added `seeds:` section to `dbt_project.yml` with explicit `+column_types` for all three columns (guards against dbt-duckdb type inference quirks)
- Updated `OCCURRENCE_SYNONYMS_PATH` in `canonical_name.py` to `data/dbt/seeds/occurrence_synonyms.csv`; all `apply_synonym()` disk-read tests continue to pass
- Removed `apply_synonym()` wrapper and import from `inat_obs_pipeline.py` — `load_inat_obs()` now stores `normalize_scientific_name()` output only
- Removed `apply_synonym()` wrapper and import from `checklist_pipeline.py` — `_update_occurrences_canonical_name()` now stores `normalize_scientific_name()` output only
- All 25 Python tests (21 canonical_name + 4 inat_obs_pipeline) pass; all 22 checklist tests pass

## Task Commits

1. **Task 1: Create dbt seed; update OCCURRENCE_SYNONYMS_PATH** - `a4dd41a` (feat)
2. **Task 2: Remove apply_synonym from inat_obs_pipeline** - `7314c03` (feat)
3. **Task 3: Remove apply_synonym from checklist_pipeline** - `24b33a5` (feat)

## Files Created/Modified

- `data/dbt/seeds/occurrence_synonyms.csv` — new dbt seed; synonym → accepted_name mapping (single source of truth)
- `data/dbt/seeds/schema.yml` — dbt schema tests: not_null + unique on synonym, not_null on accepted_name
- `data/dbt/dbt_project.yml` — added seeds: section with +column_types for occurrence_synonyms
- `data/canonical_name.py` — updated OCCURRENCE_SYNONYMS_PATH constant to new seed location
- `data/inat_obs_pipeline.py` — removed apply_synonym wrapper and import; also applied pending canonicalize → normalize_scientific_name rename
- `data/checklist_pipeline.py` — removed apply_synonym wrapper and import; also applied pending canonicalize → normalize_scientific_name rename
- `data/occurrence_synonyms.csv` — deleted (git rm); replaced by seed

## Decisions Made

- **Single source of truth via move**: Moved the CSV to `data/dbt/seeds/` and updated `OCCURRENCE_SYNONYMS_PATH`. No duplication. The Python `apply_synonym()` utility continues to work because it reads from the same file via the updated path constant.
- **Preserve `apply_synonym()` function**: Per research Pitfall 3, the function remains in `canonical_name.py` — its unit tests remain green and it is available as a standalone utility. Only the ingest callsites were removed.
- **Included pending canonicalize rename**: The unstaged changes in the repo renamed `canonicalize` to `normalize_scientific_name` across the pipeline files. These were included in the commits as they were part of the intended pre-phase cleanup context.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The checklist tests took ~4 minutes to run (they load the full WA bee checklist TSV into DuckDB), which is expected.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 02 (`123-02-PLAN.md`) can now proceed. The dbt seed at `data/dbt/seeds/occurrence_synonyms.csv` is in place and accessible via `{{ ref('occurrence_synonyms') }}`. Both pipeline staging tables will now contain raw `normalize_scientific_name()` output for `canonical_name`, ready for the LEFT JOIN synonym application in `int_combined.sql`.

The `test_apply_synonym_loads_agapostemon_from_csv` integration test confirmed that the file at the new path contains the texanus → subtilior row.

---
*Phase: 123-dbt-layer-occurrence-synonymy*
*Completed: 2026-05-29*
