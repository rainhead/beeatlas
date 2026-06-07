---
phase: 142-verify-budget-green-suite-nightly-wiring
plan: 01
subsystem: testing
tags: [pytest, pytest-randomly, duckdb, fixtures, bash, git-worktree]

# Dependency graph
requires:
  - phase: 141-built-asset-fixtures-red-test-fixes-silent-skip-elimination
    provides: green fast suite (pre-randomization), @integration tagging, D-05 conftest guard
  - phase: 140-checklist-taxonomy-fixture-distillation
    provides: module-scoped fixture pattern, distilled sample fixtures
requires:
  - phase: 139-baseline-two-tier-scaffold
    provides: two-tier marker scaffold (addopts deselect), BASELINE.md living doc
provides:
  - pytest-randomly installed and fast suite proven green under randomized order (TFIX-05)
  - Fast suite measured at < 5 min (TPERF-02): 18.8s on maderas
  - BASELINE.md updated with measured after-numbers
  - test_at_least_13_fuzzy_candidates fixed with self-contained fixture (unblocks Plan 02)
  - verify-clean-checkout.sh committed for TPERF-03 (reusable by Phase 143 CI)
  - Three order-dependence bugs fixed under pytest-randomly randomization
affects: [142-02-nightly-wiring, 143-ci-gate]

# Tech tracking
tech-stack:
  added:
    - pytest-randomly>=4.1.0 (randomized test ordering to detect order-dependence)
  patterns:
    - "Save/restore module-level path constants around importlib.reload() in fixtures"
    - "git worktree add --detach for clean-checkout simulation (no clone needed)"
    - "Inlined fixture data avoids reliance on gitignored pipeline-output files"

key-files:
  created:
    - data/scripts/verify-clean-checkout.sh
  modified:
    - data/pyproject.toml
    - data/uv.lock
    - data/tests/BASELINE.md
    - data/tests/test_resolve_checklist_names.py
    - data/tests/test_checklist_reconcile.py
    - data/tests/test_checklist_pipeline.py

key-decisions:
  - "Do not pin --randomly-seed in addopts — one default randomized run is sufficient proof (D-04)"
  - "Inline 20 verbatim names in fixture rather than reading checklist_unmatched.csv (gitignored file)"
  - "Remove importlib.reload() from source-inspection tests — getsource() reads .py file, not module memory"
  - "Save/restore module constants in reload_pipeline fixture to prevent cross-module path contamination"

patterns-established:
  - "Pattern: Never use importlib.reload() in a test without save/restore of module-level constants"
  - "Pattern: Source-inspection tests (inspect.getsource) do not need importlib.reload"
  - "Pattern: verify-clean-checkout.sh git worktree approach for CI clean-checkout gate"

requirements-completed: [TFIX-05, TPERF-02, TPERF-03]

# Metrics
duration: 90min
completed: 2026-06-07
---

# Phase 142 Plan 01: Verify Budget, Green Suite & Nightly Wiring Summary

**pytest-randomly added and fast suite proven green (197 passed/9 skipped/18.8s) under randomized order; three order-dependence bugs found and fixed; test_at_least_13_fuzzy_candidates made self-contained with 20-entry bridge fixture; verify-clean-checkout.sh created and passing**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-06-07T00:00:00Z
- **Completed:** 2026-06-07T01:30:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Fast suite is green (0 failures, 0 errors) under pytest-randomly randomized ordering (TFIX-05)
- Fast suite measured at 18.8s on maderas — well under the 5-min target (TPERF-02)
- BASELINE.md updated with measured after-numbers (before: "~30-40 min estimate"; after: 18.8s measured)
- `test_at_least_13_fuzzy_candidates` passes with original `>= 13` threshold from a self-contained fixture
- `verify-clean-checkout.sh` exits 0 on a stripped git worktree: no beeatlas.duckdb, no taxa.csv.gz, no dbt/target, no public/data
- Three order-dependence bugs discovered and auto-fixed under pytest-randomly randomization (all Rule 1)

## Task Commits

Each task was committed atomically, with additional Rule 1 fix commits:

1. **Task 1: Add pytest-randomly + prove fast suite green** - `7225781` (feat)
   - Includes Rule 1 fix: `test_checklist_reconcile.py` `reload_pipeline` save/restore
2. **Task 2: Fix test_at_least_13_fuzzy_candidates fixture** - `b66b418` (feat)
   - Additional Rule 1 fix: `ba62906` — inline verbatim names (gitignored CSV)
3. **Task 3: Create verify-clean-checkout.sh** - `ec936b9` (feat)
   - Additional Rule 1 fix: `baa6d5e` — remove importlib.reload() from source-inspection tests

## Files Created/Modified

- `/home/peter/dev/beeatlas/data/pyproject.toml` — added `pytest-randomly>=4.1.0` to dev deps
- `/home/peter/dev/beeatlas/data/uv.lock` — updated with pytest-randomly 4.1.0
- `/home/peter/dev/beeatlas/data/tests/BASELINE.md` — replaced estimates with measured after-numbers
- `/home/peter/dev/beeatlas/data/tests/test_resolve_checklist_names.py` — expanded checklist_resolver_db fixture with inaturalist_data.canonical_to_taxon_id and 20 verbatim names
- `/home/peter/dev/beeatlas/data/tests/test_checklist_reconcile.py` — reload_pipeline fixture now saves/restores module-level constants around importlib.reload()
- `/home/peter/dev/beeatlas/data/tests/test_checklist_pipeline.py` — removed importlib.reload() from source-inspection tests (test_no_active_reconcile_call, test_single_synonym_source)
- `/home/peter/dev/beeatlas/data/scripts/verify-clean-checkout.sh` — new TPERF-03 proof script

## Decisions Made

- Did NOT pin `--randomly-seed` in addopts — pinning masks order-dependence (D-04)
- Inlined 20 verbatim names in fixture rather than reading `checklist_unmatched.csv` because that file is gitignored and absent in a clean checkout
- Chose to use exactly 20 bridge entries (1-char variations of unmatched canonicals) empirically verified to score >= 85 with WRatio — gives 20 fuzzy rows, well above the 13-row threshold

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] test_checklist_reconcile.py: reload_pipeline fixture caused cross-module path contamination**
- **Found during:** Task 1 (proving fast suite green under randomized order)
- **Issue:** `reload_pipeline` fixture used `importlib.reload(checklist_pipeline)` without saving/restoring module-level path constants. When pytest-randomly interleaved `test_checklist_reconcile.py` tests with `test_checklist_pipeline.py`, the reload reset `CHECKLIST_RECORDS_FULL_PATH` to the real 50k-row CSV, causing `test_checklist_records_full_is_idempotent` to load 50646 rows instead of 8.
- **Fix:** Added save/restore of all module-level path constants (`CHECKLIST_RECORDS_FULL_PATH`, `CHECKLIST_RECORDS_PATH`, `CHECKLIST_PATH`, `TAXA_PATH`, `_TAXA_ANCESTRY`, `DB_PATH`) around `importlib.reload()` in `reload_pipeline` fixture; used `request.addfinalizer()` for cleanup.
- **Files modified:** `data/tests/test_checklist_reconcile.py`
- **Verification:** Seed=2895190196 (previously problematic) passes; both reconcile tests pass.
- **Committed in:** `7225781` (Task 1 commit)

**2. [Rule 1 - Bug] test_resolve_checklist_names.py fixture referenced gitignored checklist_unmatched.csv**
- **Found during:** Task 3 (running verify-clean-checkout.sh)
- **Issue:** The fixture used `read_csv('{path_to_checklist_unmatched.csv}', ...)` to load verbatim names. `checklist_unmatched.csv` is in `.gitignore` (it's a pipeline output, not a committed fixture) and does not exist in a git worktree or clean checkout. The verify script failed with `No files found that match the pattern`.
- **Fix:** Inlined the 20 verbatim names corresponding to the 20 bridge entries directly in the fixture SQL `VALUES` clause. Self-contained, no filesystem reads.
- **Files modified:** `data/tests/test_resolve_checklist_names.py`
- **Verification:** `cd data && uv run pytest tests/test_resolve_checklist_names.py -m integration -q` exits 0.
- **Committed in:** `ba62906`

**3. [Rule 1 - Bug] test_checklist_pipeline.py: source-inspection tests used importlib.reload() unnecessarily**
- **Found during:** Task 3 (verify-clean-checkout.sh continued to fail after fix #1 and #2)
- **Issue:** `test_no_active_reconcile_call` and `test_single_synonym_source` both called `importlib.reload(checklist_pipeline)` before using `inspect.getsource()`. Since `inspect.getsource()` reads from the `.py` source file (not module memory), the reload was unnecessary. It was causing order-dependence by resetting `CHECKLIST_RECORDS_FULL_PATH` mid-run, clobbering `checklist_sample_db`'s fixture patch.
- **Fix:** Removed `importlib.reload(checklist_pipeline)` and `import importlib` from both tests. The tests still correctly check source code content.
- **Files modified:** `data/tests/test_checklist_pipeline.py`
- **Verification:** Seed=100 (previously failing in 255s with the idempotency error) now passes in 17.8s. `bash data/scripts/verify-clean-checkout.sh` exits 0.
- **Committed in:** `baa6d5e`

---

**Total deviations:** 3 auto-fixed (all Rule 1 — order-dependence bugs exposed by pytest-randomly)
**Impact on plan:** All three fixes necessary for the fast suite to pass under randomized test ordering. pytest-randomly correctly surfaced pre-existing ordering hazards that were latent in the codebase. No scope creep.

## Issues Encountered

- The `verify-clean-checkout.sh` script required two additional bug-fix iterations (fixes #2 and #3) before it passed. Root causes were a gitignored CSV dependency and unnecessary reload() calls that pre-dated pytest-randomly.
- Running the full fast suite with `timeout 60` sometimes appeared to timeout, but this was a Bash execution limit issue; the tests themselves complete in 16-20s. Using `timeout 300` reliably shows completion.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- TFIX-05, TPERF-02, TPERF-03 all satisfied and verified
- `test_at_least_13_fuzzy_candidates` passes with >= 13 threshold — Plan 02's hard gate is honest
- `data/scripts/verify-clean-checkout.sh` is reusable by Phase 143 CI gate (TCI-01/02)
- The three order-dependence bugs fixed here improve test suite robustness for all future phases

---
*Phase: 142-verify-budget-green-suite-nightly-wiring*
*Completed: 2026-06-07*
