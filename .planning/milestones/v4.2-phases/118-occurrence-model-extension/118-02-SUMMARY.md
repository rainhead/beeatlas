---
phase: 118-occurrence-model-extension
plan: "02"
subsystem: data-pipeline
tags: [dbt, duckdb, inat, occurrences, union-all, contract]
dependency_graph:
  requires:
    - phase: 118-01
      provides: data/dbt/models/sources.yml#inat_obs_data (inat_obs_data source declaration enabling ARM 3)
  provides:
    - data/dbt/models/intermediate/int_combined.sql (three-arm UNION ALL with source discriminator)
    - data/dbt/models/marts/occurrences.sql (mart SELECT with 5 new iNat columns)
    - data/dbt/models/marts/schema.yml (36-column enforced contract)
    - data/dbt/target/sandbox/occurrences.parquet (92,802 rows; 44,534 tagged source='inat_obs')
  affects:
    - data/dbt/models/intermediate/int_species_universe.sql (Plan 03)
    - data/species_export.py (Plan 03)
tech_stack:
  added: []
  patterns:
    - "Three-arm UNION ALL with NULL-filled extension columns for backward compatibility"
    - "dbt enforced contract: schema.yml and SQL SELECT updated atomically in one commit"
    - "DB_PATH env var to run dbt build against full production database from worktree"
key_files:
  created: []
  modified:
    - data/dbt/models/intermediate/int_combined.sql
    - data/dbt/models/marts/occurrences.sql
    - data/dbt/models/marts/schema.yml
    - data/tests/test_dbt_scaffold.py
key_decisions:
  - "Row count ceiling in test_occurrences_row_count_not_inflated_by_checklist updated from 50k to 100k — Phase 118 adds ~44,534 inat_obs rows making the old threshold incorrect; 100k still catches checklist-row leakage"
  - "ARM 3 uses io.obs_id directly as specimen_observation_id (BIGINT, no cast required)"
  - "NULL-filled image_url/obs_url/user_login/license on ARMs 1 and 2 maintain UNION ALL column-shape alignment"
patterns_established:
  - "Extension NULLs: add new iNat-specific columns to ALL UNION ALL arms as explicit NULL AS column_name to keep schema uniform"
  - "Atomic contract commit: schema.yml + SQL SELECT must be in same commit when dbt contract enforced: true"
requirements_completed: [OCC-01]
duration: 3min
completed: "2026-05-26"
---

# Phase 118 Plan 02: Occurrence Model Extension — int_combined ARM 3 + Mart Contract

**Three-arm UNION ALL in int_combined.sql pulls 44,534 iNat expert observations into occurrences.parquet with source='inat_obs' discriminator and four iNat-specific nullable columns; dbt 36-column enforced contract updated atomically.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-26T03:01:03Z
- **Completed:** 2026-05-26T03:04:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Extended `int_combined.sql` from a 2-arm to a 3-arm UNION ALL: ARM 1 (ecdysis) and ARM 2 (waba_sample) gained NULL-filled `image_url`, `obs_url`, `user_login`, `license` and a `source` literal; ARM 3 added pulling from `{{ source('inat_obs_data', 'observations') }}` with all 36 columns populated
- Extended `occurrences.sql` mart SELECT to surface `j.source, j.image_url, j.obs_url, j.user_login, j.license` (5 new columns inserted after `j.canonical_name`)
- Grew `schema.yml` enforced contract from 31 to 36 columns — both occurrences.sql and schema.yml updated in same atomic commit so dbt never sees a diverged state
- Updated row-count test ceiling from 50k to 100k to accommodate the ~44,534 new inat_obs rows while preserving the checklist-leakage guard

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend int_combined.sql with ARM 3 plus source literal and iNat-extension NULLs** - `20ba9c4` (feat)
2. **Task 2: Extend occurrences.sql mart SELECT and schema.yml contract atomically** - `cb81bb0` (feat)

## Files Created/Modified

- `data/dbt/models/intermediate/int_combined.sql` — ARM 1 gains 5 columns (NULLs + 'ecdysis' source), ARM 2 gains 5 columns (NULLs + 'waba_sample' source), ARM 3 appended with 36-column SELECT from inat_obs_data.observations
- `data/dbt/models/marts/occurrences.sql` — Final SELECT grows from 31 to 36 columns: `j.source, j.image_url, j.obs_url, j.user_login, j.license` inserted after `j.canonical_name`
- `data/dbt/models/marts/schema.yml` — `occurrences` model contract grows from 31 to 36 columns: source, image_url, obs_url, user_login, license appended after place_slug
- `data/tests/test_dbt_scaffold.py` — Row count ceiling updated from 50k to 100k with updated docstring explaining Phase 118 row counts

## Decisions Made

- Row count test ceiling updated from 50,000 to 100,000 — the old bound was set for ecdysis+waba only (~47,876 rows). Phase 118 adds ~44,534 inat_obs rows (total 92,802), which exceeds 50k. 100k ceiling still catches checklist-row leakage (checklist has ~10k rows; any leak would push total well above 100k).
- ARM 3 uses `io.obs_id` directly as `specimen_observation_id` — obs_id is declared `BIGINT` in inat_obs_pipeline.py CREATE TABLE, matching the existing `bigint` schema.yml type for that column.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated test row-count ceiling to match Phase 118's actual row expansion**
- **Found during:** Task 2 (occurrences.sql + schema.yml, post-dbt build)
- **Issue:** `test_occurrences_row_count_not_inflated_by_checklist` asserted `<= 50,000` rows, but Phase 118 adds ~44,534 inat_obs rows making the total ~92,802. The test failed with "92802 rows — unexpectedly large". This is expected behavior, not a bug.
- **Fix:** Updated the threshold to `<= 100,000` and rewrote the docstring to document the Phase 118 baseline. 100k still guards against checklist rows leaking into occurrences (checklist has ~10k rows).
- **Files modified:** data/tests/test_dbt_scaffold.py
- **Verification:** All 15 test_dbt_scaffold.py tests pass after the update
- **Committed in:** cb81bb0 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — test threshold miscalibrated for expanded dataset)
**Impact on plan:** The threshold update is necessary for correctness — without it the test would permanently fail after Phase 118. The fix preserves the test's actual protection (checklist-row leakage), just recalibrated for the new baseline.

## Issues Encountered

- The worktree's `data/beeatlas.duckdb` is a stub (274 KB vs 1.2 GB in main repo). The dbt build requires pointing at the full database via `DB_PATH=/path/to/beeatlas.duckdb bash data/dbt/run.sh build`. The plan did not mention this requirement, but the build succeeded once DB_PATH was set.
- The plan's inline Python verification script (`split('UNION ALL')`) incorrectly counted 5 parts instead of 3 because the file header comment contains "UNION ALL" twice. The actual file structure is correct (2 `^UNION ALL$` lines separating 3 SELECT blocks). Manual grep verification confirmed the structure.

## Next Phase Readiness

- `occurrences.parquet` now contains three source values: ecdysis, waba_sample, inat_obs — ready for Plan 03 (int_species_universe + inat_obs_count)
- Three OCC-01 RED tests (test_occurrences_source_column, test_inat_obs_rows_in_occurrences, test_source_no_nulls) are now GREEN
- The `int_species_universe` model still has a pre-existing `INTEGER[12]` COALESCE bug that causes `dbt build` to error on that model — Plan 03 will address this as part of the species extension

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes at trust boundaries. The new `source` column and iNat-specific columns are purely additive to the data pipeline.

## Self-Check: PASSED

- [x] data/dbt/models/intermediate/int_combined.sql modified (20ba9c4) — 3 arms, 36 columns each
- [x] data/dbt/models/marts/occurrences.sql modified (cb81bb0) — 36 columns in mart SELECT
- [x] data/dbt/models/marts/schema.yml modified (cb81bb0) — 36 columns in enforced contract
- [x] data/tests/test_dbt_scaffold.py modified (cb81bb0) — threshold updated to 100k
- [x] dbt build exits with occurrences model OK (46/49 pass; int_species_universe error is pre-existing Plan 03 work)
- [x] All 15 test_dbt_scaffold.py tests pass
- [x] occurrences.parquet: 92,802 rows total; source distribution: ecdysis=48,239, inat_obs=44,534, waba_sample=29
- [x] Zero inat_obs rows with null lat/lon/canonical_name
- [x] Three OCC-01 RED tests from Plan 01 are now GREEN
