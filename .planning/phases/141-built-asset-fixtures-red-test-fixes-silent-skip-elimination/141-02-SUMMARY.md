---
phase: 141-built-asset-fixtures-red-test-fixes-silent-skip-elimination
plan: 02
subsystem: testing
tags: [pytest, duckdb, fixtures, resolver_db]

# Dependency graph
requires: []
provides:
  - resolver_db fixture extended with dbt_sandbox.occurrence_synonyms and inaturalist_waba_data.observations stubs
  - All 19 fast-tier test_resolve_taxon_ids.py tests passing (was: CatalogException crash on every test)
affects:
  - 141-03
  - 141-04

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive fixture stub: empty in-memory DuckDB tables satisfy UNION arms that return 0 rows in unit-test isolation"

key-files:
  created: []
  modified:
    - data/tests/test_resolve_taxon_ids.py

key-decisions:
  - "D-06: resolver_db fixture extended with two missing UNION-arm stubs; empty tables are correct (contribute 0 rows to UNION, which is expected in isolated unit tests)"
  - "Fix is strictly additive — no production code and no test assertions changed"

patterns-established:
  - "D-06 pattern: when _names_to_resolve queries N tables, the resolver_db fixture must CREATE SCHEMA + CREATE TABLE for all N; empty stubs are valid for unit tests"

requirements-completed:
  - TFIX-01

# Metrics
duration: 5min
completed: 2026-06-06
---

# Phase 141 Plan 02: resolver_db fixture extended with dbt_sandbox + inaturalist_waba_data stubs

**Additive DDL stubs for two missing UNION-arm tables fix CatalogException crash on all 19 test_resolve_taxon_ids.py fast-tier tests**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-06T00:00:00Z
- **Completed:** 2026-06-06T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Extended `resolver_db` fixture with `dbt_sandbox.occurrence_synonyms (synonym TEXT, accepted_name TEXT, source TEXT)` and `inaturalist_waba_data.observations (taxon__name TEXT)` — the two UNION arms that `_names_to_resolve` queries but the fixture did not provide
- Eliminated `CatalogException: schema "dbt_sandbox" does not exist` crash on all 19 fast-tier tests
- 19 tests now pass asserting real resolution behavior (cold-start, pacing/retry, cache idempotency, CSV reasons, _pick_match, rank-ladder, bridge source)
- Production `resolve_taxon_ids.py` and all test assertions unchanged — purely additive fixture fix

## Task Commits

1. **Task 1: Extend resolver_db with the two missing UNION-arm tables** - `3b1dc9b` (fix)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `data/tests/test_resolve_taxon_ids.py` - Added CREATE SCHEMA dbt_sandbox + CREATE TABLE dbt_sandbox.occurrence_synonyms and CREATE SCHEMA inaturalist_waba_data + CREATE TABLE inaturalist_waba_data.observations inside resolver_db fixture (lines ~85-95)

## Decisions Made

Followed D-06 exactly: both tables left empty (correct — each UNION arm contributes 0 rows in isolation, which is the expected state for these unit tests). The real seed data (`agapostemon texanus` → `agapostemon subtilior`) is not needed for any fast-tier assertion.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The fix was 13 lines of additive DDL; grep checks and the fast-tier run confirmed correctness immediately.

## Known Stubs

None — both tables are intentionally empty; this is the correct state for isolated unit tests. The empty tables satisfy the SQL parser without contributing spurious rows to the UNION.

## Threat Flags

None — no new trust boundary introduced. Two empty in-memory DuckDB tables consumed only by unit tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- TFIX-01 complete: test_resolve_taxon_ids.py fast tier is fully green (19/19)
- Plan 03 (test_species_export / test_dbt_synonymy parquet fixtures) and Plan 04 (test_dbt_diff @integration tagging, conftest guard, WR-01/WR-02) are unblocked

## Self-Check: PASSED

- `data/tests/test_resolve_taxon_ids.py` modified: verified (contains CREATE SCHEMA dbt_sandbox)
- Commit `3b1dc9b` exists: verified (git log confirms)
- 19 fast-tier tests pass: verified (`uv run pytest tests/test_resolve_taxon_ids.py -m 'not integration' -q` → 19 passed)
- Production file unchanged: verified (`git diff --quiet resolve_taxon_ids.py` → clean)

---
*Phase: 141-built-asset-fixtures-red-test-fixes-silent-skip-elimination*
*Completed: 2026-06-06*
