---
phase: 104-semantic-reconciliation
plan: 01
subsystem: testing
tags: [pytest, pyarrow, dbt, duckdb, typescript, jsdoc]

# Dependency graph
requires:
  - phase: 103-dbt-inat-field-id-constants-plantae-macro
    provides: stable dbt model base that this phase annotates
provides:
  - canonical "confirmed specimen" predicate documented across all three stack layers
  - places_export.py specimen count now excludes sample-only iNat rows
  - pytest fixture explicitly covers Ecdysis-backed vs sample-only vs provisional row types
affects: [places-export, specimen-counts, occurrence-predicates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Canonical predicate pattern: ecdysis_id IS NOT NULL is the single cross-layer definition for confirmed specimen"
    - "TDD RED/GREEN: write failing test asserting corrected semantics before fixing the production predicate"

key-files:
  created: []
  modified:
    - data/tests/test_places_export.py
    - data/places_export.py
    - src/occurrence.ts
    - data/dbt/models/intermediate/int_species_occurrences_agg.sql

key-decisions:
  - "ecdysis_id IS NOT NULL is canonical; isSpecimenBacked() in src/occurrence.ts is the authoritative layer"
  - "places_export.py aligned to canonical predicate; TypeScript and dbt were already correct"
  - "is_provisional = false is NOT a synonym for confirmed specimen — it includes sample-only iNat rows"

patterns-established:
  - "Cross-layer canonical comment: authoritative definition lives in src/occurrence.ts JSDoc; other layers reference it"

requirements-completed: [SEM-01]

# Metrics
duration: 3min
completed: 2026-05-19
---

# Phase 104 Plan 01: Semantic Reconciliation Summary

**Aligned specimen_count across three stack layers by fixing places_export.py to use ecdysis_id IS NOT NULL, matching the canonical isSpecimenBacked() predicate — sample-only iNat rows no longer counted as specimens in places.json**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-19T03:24:59Z
- **Completed:** 2026-05-19T03:27:45Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Extended the pytest fixture with an explicit ecdysis_id column and four row types (Ecdysis-backed, sample-only, provisional WABA, outside-any-place), exposing the overcounting bug in RED state
- Fixed `_query_counts` in places_export.py to use `COUNT(CASE WHEN ecdysis_id IS NOT NULL THEN 1 END)` with SQL comments citing the canonical authority
- Extended the JSDoc on `isSpecimenBacked()` in src/occurrence.ts with the cross-layer canonical definition, explicitly warning against `!is_provisional` as a synonym
- Added a cross-reference comment block to int_species_occurrences_agg.sql documenting why it is structurally correct and linking to the SEM-01 fix

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend places fixture with ecdysis_id — RED** - `b88e958` (test)
2. **Task 2: Fix places_export predicate + document canonical layer** - `3b589d9` (fix)
3. **Task 3: Cross-reference isSpecimenBacked in dbt model** - `63509e3` (docs)

## Files Created/Modified
- `data/tests/test_places_export.py` - Updated fixture with ecdysis_id column; new four-row layout; updated count assertion (specimen_count == 1)
- `data/places_export.py` - Replaced is_provisional predicate with ecdysis_id IS NOT NULL; added SQL comment block
- `src/occurrence.ts` - Extended isSpecimenBacked JSDoc with cross-layer canonical definition and anti-pattern warning
- `data/dbt/models/intermediate/int_species_occurrences_agg.sql` - Added cross-reference comment block (SEM-01)

## Decisions Made
- Canonical predicate is `ecdysis_id IS NOT NULL` (matches `isSpecimenBacked`). The TypeScript and dbt layers were already correct; only `places_export.py` needed fixing.
- Authoritative documentation lives in `src/occurrence.ts` (JSDoc), cross-referenced from the Python SQL string and the dbt model.
- `is_provisional = false` explicitly documented as NOT a synonym: it returns true for both Ecdysis-backed rows and sample-only iNat rows.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npm test` reports 2 failing test files from a stale worktree (`agent-a7d16196a3d73eeb0`) missing `public/data/species.json`. These are pre-existing failures not caused by this plan's changes — 833 tests pass. Out of scope per deviation scope boundary rule.

## Verification

- `cd data && uv run pytest tests/test_places_export.py -x` — 3 passed
- `grep -q "ecdysis_id IS NOT NULL" data/places_export.py` — PASS
- `! grep -q "is_provisional = false OR is_provisional IS NULL" data/places_export.py` — PASS
- `grep -q "Authoritative layer: this function" src/occurrence.ts` — PASS
- `grep -q "isSpecimenBacked" data/dbt/models/intermediate/int_species_occurrences_agg.sql` — PASS
- `bash data/dbt/run.sh build` — PASS=44 WARN=0 ERROR=0

## Next Phase Readiness
- SEM-01 complete: specimen predicate is reconciled and documented across all three layers
- places.json specimen counts are now semantically correct
- Phase 104 is the only plan in the phase; milestone v3.8 Conceptual Tidying is complete

---
*Phase: 104-semantic-reconciliation*
*Completed: 2026-05-19*
