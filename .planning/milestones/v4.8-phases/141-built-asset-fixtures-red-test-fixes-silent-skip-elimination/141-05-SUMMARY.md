---
phase: 141
plan: "05"
subsystem: data/tests
tags: [gap-closure, integration-markers, silent-skip-elimination, d05-guard]
dependency_graph:
  requires: [141-01, 141-02, 141-03, 141-04]
  provides: [TFIXTURE-03, TFIX-04, TTIER-02]
  affects: [data/tests/test_dbt_scaffold.py, data/tests/test_higher_taxa.py, data/tests/conftest.py]
tech_stack:
  added: []
  patterns: [pytest.mark.integration, pytestmark module marker, D-05 guard signature stem]
key_files:
  created: []
  modified:
    - data/tests/test_dbt_scaffold.py
    - data/tests/test_higher_taxa.py
    - data/tests/conftest.py
decisions:
  - "Per-test @pytest.mark.integration decorators used in test_dbt_scaffold.py (Option a) rather than composing onto guards, to keep test_profiles_yml_declares_spatial cleanly untagged without special-casing logic"
  - "Module-level pytestmark used in test_higher_taxa.py (all tests sandbox-gated, no fast-tier exception needed)"
  - "D-05 signature[0] changed to stem 'data/dbt/run.sh build' — broadening after tagging ensures zero false-positives in the fast tier"
metrics:
  duration_minutes: 2
  completed_date: "2026-06-06"
  tasks_completed: 2
  files_modified: 3
---

# Phase 141 Plan 05: Gap-Closure — @integration Tagging and D-05 Signature Stem Summary

**One-liner:** Tagged all 19 sandbox-gated tests in test_dbt_scaffold.py and all 16 in test_higher_taxa.py @pytest.mark.integration; tightened the D-05 guard signature to the stem "data/dbt/run.sh build" to catch --select variants — closing the SC-1 and SC-5 gaps left by Plans 01-04.

## Objective

Close the SC-1 / SC-5 / TFIX-04 gap identified in 141-VERIFICATION.md: `test_dbt_scaffold.py` and `test_higher_taxa.py` were never migrated, producing 1 passed / 16 skipped / 19 errors on a clean checkout (sandbox hidden). Target: 1 passed / 35 deselected / 0 errors / 0 skips.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Tag sandbox-gated tests @integration | 8471e83 | data/tests/test_dbt_scaffold.py, data/tests/test_higher_taxa.py |
| 2 | Tighten D-05 signature stem | 7841fcc | data/tests/conftest.py |

## Verification Results

**Clean-checkout simulation (sandbox hidden, then restored):**
- Before this plan: `1 passed, 16 skipped, 19 errors in 1.88s`
- After this plan: `1 passed, 35 deselected in 1.10s`
- Sandbox restored: confirmed

**Acceptance criteria met:**
- test_dbt_scaffold.py fast-tier collection: exactly 1 test (`test_profiles_yml_declares_spatial`)
- test_higher_taxa.py fast-tier collection: 0 tests (16 deselected)
- `== 12` assertion intact in test_exactly_12_subfamilies (verified by grep)
- `_ASSET_SKIP_SIGNATURES[0]` is now `"data/dbt/run.sh build"` (old back-ticked phrase gone)
- Hookwrapper body (`outcome = yield`, iter_markers exemption) unchanged
- No production code, dbt model, run.py, or nightly.sh modified

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

**Clarification:** The plan's acceptance criteria refers to "16 sandbox-gated tests" in test_dbt_scaffold.py but the actual count is 19 (consistent with the "19 D-05 ERRORs" in the verification report). The plan's interface section lists all 19 correctly; the "16" in the acceptance criteria text appears to be a minor count error in the plan document. All 19 sandbox-gated tests were tagged @integration; the acceptance bar (0 errors, 0 skips) is fully met.

## Decisions Made

1. **Per-test decorators in test_dbt_scaffold.py**: Used Option (a) — explicit `@pytest.mark.integration` on each sandbox-gated test — rather than composing onto the shared guard variables. This keeps `test_profiles_yml_declares_spatial` cleanly untagged without any conditional logic.

2. **Module pytestmark in test_higher_taxa.py**: All 16 tests are sandbox-gated with no fast-tier exception, so a single module-level `pytestmark = pytest.mark.integration` is correct and complete.

3. **Stem change ordering**: Tagged tests @integration (Task 1) before broadening the signature stem (Task 2). This order is mandatory — reversing it would convert the 16 silent skips to D-05 errors before deselection was in place.

## Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| TFIXTURE-03 | SATISFIED | test_dbt_scaffold.py and test_higher_taxa.py now deselected from fast tier; sandbox-free test passes on clean checkout |
| TFIX-04 | SATISFIED | 0 silent asset-driven skips in fast-tier clean-checkout run (down from 16); D-05 guard false-negative closed |
| TTIER-02 | SATISFIED | Full-data checks (==12 subfamilies, >=2000 checklist rows, schema assertions) retained intact in @integration tier |

## Known Stubs

None — no placeholder values or incomplete wiring introduced.

## Threat Flags

None — test-only changes; no new trust boundaries, network endpoints, auth paths, or schema changes.

## Self-Check: PASSED

- [x] data/tests/test_dbt_scaffold.py modified: confirmed (19 @integration decorators added, test_profiles_yml_declares_spatial untagged)
- [x] data/tests/test_higher_taxa.py modified: confirmed (module pytestmark added, ==12 intact)
- [x] data/tests/conftest.py modified: confirmed ("data/dbt/run.sh build" stem present, old phrase gone)
- [x] Commit 8471e83 exists: `git log --oneline | grep 8471e83` → confirmed
- [x] Commit 7841fcc exists: `git log --oneline | grep 7841fcc` → confirmed
- [x] Clean-checkout result: 1 passed, 35 deselected, 0 errors, 0 skips → PASS
- [x] Sandbox restored after test run → confirmed
