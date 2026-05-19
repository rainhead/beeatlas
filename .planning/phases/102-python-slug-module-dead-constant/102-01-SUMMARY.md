---
phase: 102-python-slug-module-dead-constant
plan: "01"
subsystem: python-data-pipeline
tags: [python, refactor, slug, domain, dbt-comment, tdd]
requirements: [PY-01, PY-02]

dependency_graph:
  requires: []
  provides:
    - data/domain.py (canonical slugify function)
    - data/tests/test_domain.py (Phase 78 D-01 byte-equivalence proof)
  affects:
    - data/feeds.py (imports slugify from domain)
    - data/species_export.py (imports slugify from domain; BEE_FAMILIES removed)
    - data/dbt/models/intermediate/int_species_universe.sql (updated comment)

tech_stack:
  added: []
  patterns:
    - Domain module pattern: shared pipeline utilities extracted to data/domain.py

key_files:
  created:
    - data/domain.py
    - data/tests/test_domain.py
  modified:
    - data/feeds.py
    - data/species_export.py
    - data/dbt/models/intermediate/int_species_universe.sql
    - data/tests/test_feeds.py

decisions:
  - Kept the Phase 78 D-01 note on species_export.py import line but rephrased to avoid referencing _slugify by name (to keep grep -cE '\b_slugify\b' count at 0)
  - Removed re and unicodedata imports from feeds.py since they were only used by the removed _slugify function
  - test_slugify_byte_equivalence reproduces prior _slugify body verbatim inline (self-contained — does not import from feeds.py)
  - Pre-existing test_run_py_integration failure logged to deferred items (step renamed from 'export' to 'species-export' in a prior phase)

metrics:
  duration: "4 minutes"
  completed_date: "2026-05-19"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 4
---

# Phase 102 Plan 01: Python Slug Module & Dead Constant Removal Summary

**One-liner:** Extracted `_slugify` into `data/domain.py` as public `slugify`, removed dead `BEE_FAMILIES` constant from `species_export.py`, updated `int_species_universe.sql` comment to own the sole-gate responsibility, and added 6-test byte-equivalence suite proving Phase 78 D-01 invariant.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create data/domain.py with slugify; migrate imports | 95090fd | data/domain.py (created), data/feeds.py, data/species_export.py |
| 2 | Remove BEE_FAMILIES; update int_species_universe.sql comment | e10abe3 | data/species_export.py, data/dbt/models/intermediate/int_species_universe.sql |
| 3 | Add test_domain.py byte-equivalence tests; update test_feeds.py | 091e4a7 | data/tests/test_domain.py (created), data/tests/test_feeds.py |

## Verification Results

All PY-01 and PY-02 static grep gates passed:
- `grep -c 'def _slugify' data/feeds.py` = 0
- `grep -c 'from domain import slugify' data/feeds.py` = 1
- `grep -c 'from domain import slugify' data/species_export.py` = 1
- `grep -cE '\b_slugify\b' data/species_export.py` = 0
- `grep -c 'BEE_FAMILIES' data/species_export.py` = 0
- `grep -qiE '(sole gate|only filter|sole filter)' int_species_universe.sql` ✓
- `grep -q 'PY-02\|Phase 102' int_species_universe.sql` ✓

Test results: `uv run pytest tests/test_domain.py` — 6 passed. `uv run pytest tests/test_feeds.py::test_slugify` — 1 passed. Full suite: 128 passed, 22 skipped, 1 pre-existing failure (out of scope).

## Deviations from Plan

### Pre-existing Issues (Out of Scope)

**1. [Pre-existing] test_run_py_integration failure in test_feeds.py**
- **Found during:** Task 3 full-suite run
- **Issue:** `test_run_py_integration` asserts `run.STEPS` contains a step named `'export'`, but the step was renamed to `'species-export'` in a prior phase. The test crashes with `ValueError: list.index(x): x not in list`.
- **Action:** None — pre-existing failure predating Phase 102. Scope boundary applies (not caused by current task's changes).
- **Status:** Logged here; deferred to a future quick-task or phase.

### Auto-fixes Applied

**1. [Rule 1 - Bug] Comment in import line contained word-boundary `_slugify`**
- **Found during:** Task 1 acceptance criteria check
- **Issue:** Initial draft of import comment `# Phase 102 PY-01: extracted from feeds._slugify` caused `grep -cE '\b_slugify\b'` to return 1 instead of 0.
- **Fix:** Rephrased comment to `# Phase 102 PY-01: promoted from private feeds helper`.
- **Files modified:** data/species_export.py

**2. [Rule 1 - Cleanup] Removed unused re and unicodedata imports from feeds.py**
- **Found during:** Task 1 — after deleting `_slugify`, both `re` and `unicodedata` had no other uses in feeds.py.
- **Fix:** Removed both import lines.
- **Files modified:** data/feeds.py

## Threat Flags

No new security-relevant surface introduced. The refactor is a pure extraction: `slugify` is byte-for-byte identical to prior `_slugify`, and the threat mitigations documented in T-102-01 (path-traversal-safe output) are verified by `test_slugify_path_traversal_safe`.

## Self-Check: PASSED

Files exist:
- data/domain.py ✓
- data/tests/test_domain.py ✓

Commits exist:
- 95090fd ✓
- e10abe3 ✓
- 091e4a7 ✓
