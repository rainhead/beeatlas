---
phase: 125-species-visibility
plan: 01
subsystem: database
tags: [dbt, duckdb, pytest, species, coalesce, sql]

# Dependency graph
requires:
  - phase: 124-pre-work-contract-cleanup
    provides: clean occurrence data contract and resolve_taxon_ids coverage
provides:
  - COALESCE derivation of specific_epithet from canonical_name token 2 in int_species_universe.sql
  - capitalized scientificName fallback for off-checklist species
  - two pytest regression guards for SPV-01 (off-checklist epithet + capitalization)
  - 65 previously-invisible species now appear in species pages, SVGs, and species tree
affects: [species-export, species-maps, _data/species.js, species-detail pages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "NULLIF(split_part(COALESCE(...), ' ', 2), '') — derives specific_epithet from two-token canonical_name, collapses genus-only to NULL"
    - "upper(left(..., 1)) || substring(..., 2) — DuckDB expression for capitalizing first character"
    - "_SPECIES_GUARD skipif pattern — mirrors _CHECKLIST_GUARD for species.parquet-dependent tests"

key-files:
  created:
    - data/tests/test_dbt_scaffold.py (two new test functions appended)
  modified:
    - data/dbt/models/intermediate/int_species_universe.sql

key-decisions:
  - "NULLIF(split_part(COALESCE(c.canonical_name, oa.canonical_name), ' ', 2), '') chosen — collapses single-token genus names to NULL; reuses existing canonical_name argument order for consistency across all four COALESCE projections in species_universe CTE"
  - "Plan referenced data/dbt/target/sandbox/species-maps/ as SVG output dir; actual output is public/data/species-maps/ — not a bug, just a plan inaccuracy; all 758 SVGs confirmed at the correct path"

patterns-established:
  - "Guard pattern for parquet-dependent tests: _SPECIES_GUARD = pytest.mark.skipif(not (SANDBOX / 'species.parquet').exists(), ...)"

requirements-completed: [SPV-01, SPV-02, SPV-03]

# Metrics
duration: ~15min
completed: 2026-05-30
---

# Phase 125 Plan 01: Species Visibility Summary

**COALESCE derivation in int_species_universe.sql unlocks 65 off-checklist species — specific_epithet goes from 527 to 592 non-null, generating 231 additional SVGs and full static species pages**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-30T16:00:00Z
- **Completed:** 2026-05-30T16:15:00Z
- **Tasks:** 3 (2 auto + 1 human checkpoint)
- **Files modified:** 2

## Accomplishments

- Added two pytest TDD RED gates for SPV-01 in test_dbt_scaffold.py (test_off_checklist_species_with_occurrences_have_specific_epithet, test_off_checklist_species_scientificname_capitalized)
- Fixed int_species_universe.sql: specific_epithet now derived via NULLIF(split_part(COALESCE(c.canonical_name, oa.canonical_name), ' ', 2), '') when c.specific_epithet is NULL; scientificName capitalized via upper(left(...)) || substring(...)
- All 32 species tests pass (test_species_export.py, test_species_maps.py, test_dbt_scaffold.py); total species.parquet row count remains 629; off-checklist two-token species with null specific_epithet drops from 65 to 0

## Task Commits

1. **Task 1: RED — add pytest gates for SPV-01** - `04e355f` (test)
2. **Task 2: GREEN — COALESCE derivation in int_species_universe.sql** - `eefe2aa` (feat)
3. **Task 3: Human verification — SPV-02 static page + SPV-03 SVG generation** - (human approved)

## Measured Before/After Counts

| Metric | Before | After |
|--------|--------|-------|
| species.parquet total rows | 629 | 629 (unchanged) |
| specific_epithet IS NOT NULL | 527 | 592 |
| Off-checklist two-token with null specific_epithet | 65 | 0 |
| SVGs in public/data/species-maps/ | 527 | 758 |
| _site/species/ species-level pages | ~527 | 724 |

## Files Created/Modified

- `data/dbt/models/intermediate/int_species_universe.sql` — two COALESCE fixes: specific_epithet derivation + scientificName capitalization
- `data/tests/test_dbt_scaffold.py` — _SPECIES_GUARD + two new test functions (appended after existing _CHECKLIST_GUARD block)

## Decisions Made

- NULLIF(split_part(...), '') is the correct form — collapses single-token genus-only canonical names to NULL rather than empty string, matching existing genus derivation argument order
- Plan acceptance criteria referenced `data/dbt/target/sandbox/species-maps/` as the SVG output path, but species_maps.py writes to `public/data/species-maps/` (ASSETS_DIR default). No code change needed — documented as plan inaccuracy, not a deviation requiring a fix.

## Deviations from Plan

None — plan executed exactly as written. The SVG path discrepancy in the plan's acceptance criteria was documentation-only and did not affect execution.

## Issues Encountered

None. The dbt build ran cleanly (52 PASS, 1 WARN pre-existing, 0 ERROR). All 32 tests green on first full suite run.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- 65 previously-invisible species now appear in the static site species tree, SVG occurrence maps, and species-detail pages
- The off-checklist epithet derivation pattern is now guarded by two pytest regressions; any future int_species_universe.sql changes that break this will fail CI
- Phase 126+ can build on the expanded species universe without additional scaffold work

---
*Phase: 125-species-visibility*
*Completed: 2026-05-30*
