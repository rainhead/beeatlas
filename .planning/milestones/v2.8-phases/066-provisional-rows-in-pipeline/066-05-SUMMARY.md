---
phase: 066-provisional-rows-in-pipeline
plan: "05"
subsystem: database
tags: [duckdb, export, taxon_lineage, pytest, parquet]

# Dependency graph
requires:
  - phase: 066-provisional-rows-in-pipeline
    plan: "04"
    provides: "is_provisional column, validate-schema.mjs updated, 31-test suite green against fixture"
provides:
  - "export.py specimen_obs_base CTE JOINs taxon_lineage (not observations__taxon__ancestors)"
  - "conftest.py fixture matches production DB schema (taxon_lineage only)"
  - "Production export confirmed working end-to-end; schema gate passes"
affects:
  - "future export.py changes that touch specimen_obs_base CTE"
  - "future waba_pipeline.py changes to enrich_taxon_lineage schema"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "JOIN taxon_lineage on taxon_id for genus/family lookup (replaces dlt child table pattern)"

key-files:
  created: []
  modified:
    - data/export.py
    - data/tests/conftest.py

key-decisions:
  - "Use LEFT JOIN taxon_lineage ON tl.taxon_id = waba.taxon__id rather than recreating observations__taxon__ancestors in waba_pipeline.py — taxon_lineage is the authoritative table created by enrich_taxon_lineage()"
  - "Remove observations__taxon__ancestors from conftest.py entirely once export.py no longer references it — fixture should reflect production schema, not mask mismatches"

patterns-established:
  - "Fixture schema must track production schema: when waba_pipeline.py changes its output tables, conftest.py must be updated simultaneously so tests catch regressions rather than hiding them"

requirements-completed: [PROV-02, PROV-03, PROV-05]

# Metrics
duration: ~20min (plus human-verify checkpoint)
completed: 2026-04-20
---

# Phase 066 Plan 05: Gap Closure — taxon_lineage table mismatch Summary

**Fixed production export by replacing `observations__taxon__ancestors` JOINs in `specimen_obs_base` CTE with a single `LEFT JOIN taxon_lineage`, and removed the orphaned fixture table that was masking the mismatch**

## Performance

- **Duration:** ~20 min (plus human-verify checkpoint for production confirmation)
- **Started:** 2026-04-20T12:05:35Z
- **Completed:** 2026-04-20 (human verification approved same day)
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 2

## Accomplishments
- export.py `specimen_obs_base` CTE now JOINs `inaturalist_waba_data.taxon_lineage tl ON tl.taxon_id = waba.taxon__id` — one clean JOIN replacing two LEFT JOINs filtered by rank
- conftest.py no longer creates or seeds `observations__taxon__ancestors`; fixture now matches production schema, so test failures would surface real production breakage
- Human confirmed production export completes without CatalogException and `node scripts/validate-schema.mjs` passes against the locally written occurrences.parquet

## Task Commits

Each task was committed atomically:

1. **Task 1: Update export.py specimen_obs_base CTE to join taxon_lineage** — `351c877` (fix)
2. **Task 2: Remove orphaned observations__taxon__ancestors from conftest.py** — `0d49270` (fix)
3. **Task 3: Run export against production DB and verify schema gate** — human verified, no code commit

## Files Created/Modified
- `data/export.py` — `specimen_obs_base` CTE now uses `LEFT JOIN inaturalist_waba_data.taxon_lineage tl ON tl.taxon_id = waba.taxon__id`; old `anc_genus`/`anc_family` aliases and `observations__taxon__ancestors` references removed
- `data/tests/conftest.py` — Removed CREATE TABLE `observations__taxon__ancestors` block and its corresponding INSERT seed data block; `taxon_lineage` blocks remain intact

## Decisions Made
- Chose to update export.py to use `taxon_lineage` (rather than restoring `observations__taxon__ancestors` creation in waba_pipeline.py) — `taxon_lineage` is the correct authoritative table; the old approach relied on dlt field normalization of `taxon.ancestors` which the iNat v2 API no longer returns
- Removed the orphaned fixture table rather than leaving it in place; a fixture that creates extra tables not in production masks real schema mismatches

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. The root cause (commit `bde85fe` changed waba_pipeline.py to use `enrich_taxon_lineage()` but export.py was not updated) was cleanly diagnosed in the verification report. The fix matched the plan specification exactly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 6 phase 066 observable truths are now satisfied: production export succeeds, schema gate passes, all 31 pytest tests pass
- Requirements PROV-02, PROV-03, PROV-05 are now fully verified (previously PARTIAL due to production export failure)
- Phase 066 is complete

---

## Self-Check: PASSED

- `data/export.py` exists and contains `LEFT JOIN inaturalist_waba_data.taxon_lineage tl` — FOUND
- `data/tests/conftest.py` exists and contains no reference to `observations__taxon__ancestors` — CONFIRMED (grep returned exit 1)
- Commit `351c877` exists — FOUND
- Commit `0d49270` exists — FOUND
- 31 pytest tests pass — CONFIRMED

---
*Phase: 066-provisional-rows-in-pipeline*
*Completed: 2026-04-20*
