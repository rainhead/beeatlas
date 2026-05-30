---
phase: 124-pre-work-contract-cleanup
plan: 01
subsystem: pipeline
tags: [python, duckdb, pytest, tdd, resolve-taxon-ids, inat-obs]

# Dependency graph
requires:
  - phase: 123-agapostemon-synonymy
    provides: inat_obs_data.observations populated by inat_obs_pipeline
provides:
  - _names_to_resolve() queries three sources: checklist + ecdysis + inat_obs
  - inat-obs step precedes resolve-taxon-ids in STEPS (correctness invariant)
  - inactive taxon enumeration printed during resolve-taxon-ids step
  - resolver_db fixture covers all three occurrence sources
  - docstring in test_dbt_diff.py reflects 36-column occurrences contract
affects:
  - 126-taxon-id-completeness
  - 127-inactive-taxon-remapping

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Enumerate inactive taxa via LEFT JOIN bridge to taxa.csv.gz with active = false (BOOLEAN)"
    - "UNION (not UNION ALL) for deduplication across three source tables"

key-files:
  created: []
  modified:
    - data/resolve_taxon_ids.py
    - data/run.py
    - data/tests/test_resolve_taxon_ids.py
    - data/tests/test_dbt_diff.py

key-decisions:
  - "UNION (not UNION ALL) used for inat_obs branch to match existing deduplication semantics"
  - "inactive = false BOOLEAN comparison (not string) because read_csv auto-infers taxa.csv.gz active column as BOOLEAN"
  - "inat-obs moved immediately before resolve-taxon-ids in STEPS so inat_obs_data.observations is populated on every full-pipeline run"
  - "Path concatenation written as 'raw/taxa.csv.gz' single segment string for grep-verifiability"

patterns-established:
  - "Inactive taxon scoping: query bridge LEFT JOIN taxa.csv.gz WHERE active = false after resolution summary"

requirements-completed: [PWK-01, PWK-02, PWK-03]

# Metrics
duration: 7min
completed: 2026-05-30
---

# Phase 124 Plan 01: Pre-work Contract Cleanup Summary

**Extended _names_to_resolve to three sources (checklist + ecdysis + inat_obs), reordered STEPS so inat-obs precedes resolve-taxon-ids, added inactive taxon enumeration, and fixed stale docstrings**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-30T00:29:51Z
- **Completed:** 2026-05-30T00:37:06Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `_names_to_resolve()` SQL CTE now has three UNION branches: checklist_data.species, ecdysis_data.occurrences, inat_obs_data.observations — Phase 126 taxon_id completeness will cover all occurrence sources
- `run.py` STEPS list: inat-obs (populates inat_obs_data.observations) now runs immediately before resolve-taxon-ids, fixing the correctness bug where the new UNION branch would query an empty table on a full pipeline run
- `resolve_taxon_ids()` prints "resolve-taxon-ids: inactive taxon IDs in bridge: N" after each run (0 as of 2026-05-28 taxa.csv.gz), enumerating each inactive row for Phase 127 scoping
- `test_dbt_diff.py` docstring updated from "30 cols" to "36 cols" reflecting the v4.2 occurrences contract expansion

## Task Commits

TDD cycle for Task 1:

1. **RED - test_names_to_resolve_includes_inat_obs_source** - `79db02d` (test)
2. **GREEN - resolver to inat_obs + reorder STEPS + fix docstrings** - `a79c80f` (feat)
3. **Task 2: inactive taxon enumeration** - `ec72f9a` (feat)

## Files Created/Modified

- `/Users/rainhead/dev/beeatlas/data/resolve_taxon_ids.py` - Added third UNION branch (inat_obs_data.observations), updated module and function docstrings, added inactive taxon enumeration block after summary print
- `/Users/rainhead/dev/beeatlas/data/run.py` - Moved inat-obs step from after places-load to immediately before resolve-taxon-ids; updated module docstring step order prose
- `/Users/rainhead/dev/beeatlas/data/tests/test_resolve_taxon_ids.py` - Added inat_obs_data schema+table to resolver_db fixture; added test_names_to_resolve_includes_inat_obs_source
- `/Users/rainhead/dev/beeatlas/data/tests/test_dbt_diff.py` - Updated test_occurrences_schema_matches docstring: "30 cols" -> "36 cols", "30 columns" -> "36 columns"

## Decisions Made

- UNION (not UNION ALL) for the inat_obs branch — preserves the existing deduplication semantics across all three sources
- `active = false` as BOOLEAN comparison (not `'false'` string) because DuckDB auto-infers the `active` column as BOOLEAN from taxa.csv.gz without a `column_types` override
- Used `"raw/taxa.csv.gz"` as a single Path segment string (not `"raw" / "taxa.csv.gz"`) to satisfy the `grep -c "raw/taxa.csv.gz"` acceptance criterion
- No second `duckdb.connect()` call in the enumeration block — reuses the existing `con` that is still open at that point in `resolve_taxon_ids()`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all acceptance criteria met on first implementation pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 126 (taxon_id completeness): `_names_to_resolve()` now covers all three occurrence arms; inat-obs step precedes resolve-taxon-ids in STEPS — the correctness prerequisite is satisfied
- Phase 127 (inactive taxon remapping): inactive taxon enumeration is in place; count is 0 as of current taxa.csv.gz but the mechanism will surface any inactive IDs as they arise

---
*Phase: 124-pre-work-contract-cleanup*
*Completed: 2026-05-30*
