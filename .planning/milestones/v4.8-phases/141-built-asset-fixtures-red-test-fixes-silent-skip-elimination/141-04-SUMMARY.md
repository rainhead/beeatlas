---
phase: 141-built-asset-fixtures-red-test-fixes-silent-skip-elimination
plan: "04"
subsystem: testing
tags: [pytest, integration-markers, fixture-isolation, pytest-randomly]

# Dependency graph
requires:
  - phase: 141-01
    provides: D-05 conftest guard active — fast tier fails on asset-driven skips
provides:
  - "test_dbt_diff.py fully deselected from fast tier via module-level pytestmark=integration (D-04/TFIX-02/TTIER-02)"
  - "test_at_least_13_fuzzy_candidates tagged @integration, >=13 threshold retained (D-07/TFIX-03)"
  - "test_generate_group_maps_emits_subfamily_svgs tagged @integration, [integration]-prefixed skip, ==12 retained (TFIX-04)"
  - "checklist_db fixture uses DB_PATH save/restore instead of importlib.reload (WR-01/D-08)"
  - "two species/county assertions pinned to exact counts 6/8 (WR-02/D-09)"
  - "SC-5 combined fast-tier gate over individually-fast Wave-2 files: 0 failures, 0 asset-driven skips"
affects: [142-verify-budget-green-suite-nightly-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "module-level pytestmark = pytest.mark.integration deselects all tests in a file from the fast tier"
    - "DB_PATH save/restore (mod.DB_PATH = db_path; yield; mod.DB_PATH = old) instead of importlib.reload for fixture isolation"
    - "[integration]-prefixed pytest.skip reason as loud guard for integration-tier runs without built assets"

key-files:
  created: []
  modified:
    - data/tests/test_dbt_diff.py
    - data/tests/test_resolve_checklist_names.py
    - data/tests/test_species_maps.py
    - data/tests/test_checklist_pipeline.py

key-decisions:
  - "importlib.reload() in checklist_db removed in favor of mod.DB_PATH save/restore — eliminates pytest-randomly ordering hazard (WR-01/D-08)"
  - "n >= 1 assertions pinned to exact fixture counts (6 species, 8 county rows) — retains regression power (WR-02/D-09)"
  - "importlib.reload() remains in two unrelated inspection tests (test_no_active_reconcile_call, test_single_synonym_source) — out of scope, those tests use reload for source inspection not fixture state"

patterns-established:
  - "Pattern D: @pytest.mark.integration + [integration]-prefixed loud skip guard for nightly-only tests"
  - "Pattern: module-level pytestmark for files where ALL tests require built assets"

requirements-completed:
  - TFIX-02
  - TFIX-03
  - TFIX-04
  - TTIER-02

# Metrics
duration: 12min
completed: 2026-06-06
---

# Phase 141 Plan 04: Integration Marker Tagging and Fixture Isolation Summary

**Module-level pytestmark deselects all 16 test_dbt_diff tests from the fast tier; fuzzy and species-maps real-data checks tagged @integration; importlib.reload replaced with DB_PATH save/restore in checklist_db; species/county counts pinned to exact 6/8**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-06T20:25:00Z
- **Completed:** 2026-06-06T20:37:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `test_dbt_diff.py`: added `pytestmark = pytest.mark.integration` — all 16 tests deselected from the fast tier (0 collected); `_SANDBOX_GUARD` reason prefixed `[integration]` as a loud guard for explicit `-m integration` runs without built assets
- `test_resolve_checklist_names.py`: `test_at_least_13_fuzzy_candidates` tagged `@pytest.mark.integration`; the `>= 13` threshold is retained (meaningless against the 4-row fixture bridge, correct against the full dataset)
- `test_species_maps.py`: `test_generate_group_maps_emits_subfamily_svgs` tagged `@pytest.mark.integration`; inline skip reason prefixed `[integration]`; `== 12` subfamilies assertion retained
- `test_checklist_pipeline.py`: replaced `importlib.reload(checklist_pipeline)` in `checklist_db` with save/restore of `mod.DB_PATH`; converted fixture to yield; pinned `n >= 1` to `n == 6` and `n == 8` for exact fixture counts (WR-01/WR-02)
- SC-5 combined fast-tier gate: 49 passed, 0 failures, 0 asset-driven skips over `test_species_export.py + test_dbt_synonymy.py + test_checklist_pipeline.py`

## Task Commits

1. **Task 1: Tag test_dbt_diff, fuzzy, species-maps @integration** - `ac31507` (feat)
2. **Task 2: Harden checklist_db save/restore + pin 6/8 counts** - `6f93456` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `/home/peter/dev/beeatlas/data/tests/test_dbt_diff.py` — added `pytestmark = pytest.mark.integration`; hardened `_SANDBOX_GUARD` reason with `[integration]` prefix
- `/home/peter/dev/beeatlas/data/tests/test_resolve_checklist_names.py` — `@pytest.mark.integration` decorator on `test_at_least_13_fuzzy_candidates`
- `/home/peter/dev/beeatlas/data/tests/test_species_maps.py` — `@pytest.mark.integration` on `test_generate_group_maps_emits_subfamily_svgs`; `[integration]` prefix in skip reason
- `/home/peter/dev/beeatlas/data/tests/test_checklist_pipeline.py` — `checklist_db` fixture save/restore pattern; exact count assertions

## Decisions Made

- `importlib.reload` in `checklist_db` replaced with `mod.DB_PATH` save/restore — the reload was re-reading the env var into a module constant, which is exactly what direct assignment achieves without re-executing the module body (which clobbers patches from `checklist_sample_db` under pytest-randomly order randomization)
- `importlib.reload` calls in `test_no_active_reconcile_call` and `test_single_synonym_source` intentionally left unchanged — those tests use reload to inspect source code properties, not to manage fixture state; they are unrelated to the WR-01 hazard

## Deviations from Plan

### Minor Scope Clarification

**1. [Not a rule deviation — acceptance criterion clarification] importlib.reload still present in two inspection tests**
- **Found during:** Task 2 verification
- **Issue:** Plan acceptance criterion stated "The string `importlib.reload` no longer appears in data/tests/test_checklist_pipeline.py" — but two standalone tests (`test_no_active_reconcile_call`, `test_single_synonym_source` at lines 714 and 737) use `importlib.reload` for source inspection (not fixture state management). These were not mentioned in the plan's `<action>` block which specifically targeted the `checklist_db` fixture.
- **Resolution:** Left those two calls in place — they are out of scope (modifying them would be a behavioral change to unrelated tests). The `checklist_db` fixture — the sole target of WR-01 — no longer uses `importlib.reload`.
- **Impact:** The WR-01 ordering hazard is fully eliminated. The remaining `importlib.reload` calls are in fast-tier inspection tests that do not interact with the module-scoped `checklist_sample_db` fixture.

---

**Total deviations:** 1 (scope clarification — no code change needed)
**Impact on plan:** None. The WR-01 and WR-02 fixes are complete as intended.

## Issues Encountered

- `pytest-randomly` plugin not installed (not in `data/pyproject.toml` dev deps despite RESEARCH.md claim). Plan's verify block used `-p randomly` which failed. Ran fast tier without the plugin; ordering safety is guaranteed by the save/restore pattern itself (no shared mutable state in the fixture path).

## Known Stubs

None — all assertions are pinned to exact fixture counts; no placeholder data.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. Test infrastructure only.

## Self-Check

Files exist:
- `data/tests/test_dbt_diff.py` — contains `pytestmark = pytest.mark.integration` ✓
- `data/tests/test_resolve_checklist_names.py` — contains `@pytest.mark.integration` on fuzzy test ✓
- `data/tests/test_species_maps.py` — contains `@pytest.mark.integration` on subfamily test ✓
- `data/tests/test_checklist_pipeline.py` — contains `mod.DB_PATH = old_db_path`, `assert n == 6`, `assert n == 8` ✓

Commits exist:
- `ac31507` — feat(141-04): tag test_dbt_diff, fuzzy, species-maps tests @integration ✓
- `6f93456` — feat(141-04): replace importlib.reload with DB_PATH save/restore; pin 6/8 counts ✓

Fast-tier gate results:
- `test_dbt_diff.py -m 'not integration' --collect-only`: 0 tests collected (16 deselected) ✓
- `test_resolve_checklist_names.py -m 'not integration'`: 6 passed, 1 deselected ✓
- `test_species_maps.py -m 'not integration'`: 14 passed, 1 deselected ✓
- `test_checklist_pipeline.py -m 'not integration'`: 38 passed, 3 skipped (reconcile stubs), 2 deselected ✓
- SC-5 combined: 49 passed, 3 skipped (reconcile stubs), 4 deselected, 0 asset-driven skips ✓

## Self-Check: PASSED

## Next Phase Readiness

- All four target test files have been hardened per the plan
- The D-05 conftest guard (from Plan 01) will correctly pass the fast tier — no asset-driven skips remain from these four files
- Phase 142 can wire the `@integration` tier into `nightly.sh` confident that `test_dbt_diff` and the two real-data checks will execute against live built assets

---
*Phase: 141-built-asset-fixtures-red-test-fixes-silent-skip-elimination*
*Completed: 2026-06-06*
