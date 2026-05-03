---
phase: 076-data-foundation
plan: 02
subsystem: data-pipeline
tags: [data-pipeline, canonicalize, pure-function, tdd, regex, taxonomy]

# Dependency graph
requires:
  - phase: 076-data-foundation
    provides: D-04 5-step canonicalization algorithm (CONTEXT.md)
provides:
  - canonicalize(name) helper — JOIN KEY producer for checklist ↔ occurrences
  - _INFRA_MARKERS tuple locked to D-04 step 3 (5 markers)
  - 16 unit tests covering per-step behavior, idempotence, and the TAX-04 disagreement fixture
affects: [076-03-checklist-pipeline, 076-05-occurrences-canonical, 076-06-integration-tests, 077-species-aggregation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-function string-transform module with module-level pre-compiled regexes (mirrors data/feeds.py::_slugify)"
    - "TDD RED → GREEN sequence with separate test() and feat() commits"

key-files:
  created:
    - data/canonical_name.py
    - data/tests/test_canonical_name.py
  modified: []

key-decisions:
  - "_AUTHORITY_RE paren branch requires ',<year>' inside trailing parens so subgenus parens like '(Dialictus)' are NOT consumed (PITFALLS.md #3 fix; deviates from RESEARCH.md §Pattern 3 template, see Deviations below)"
  - "Trinomial fold (cleaned[:2]) runs AFTER infraspecific marker stripping, so Bombus melanopygus mixtus and Bombus huntii ssp. occidentalis both correctly fold to binomials"
  - "_INFRA_MARKERS contains exactly 5 D-04 markers (no subsp.) — confirmed by test_infra_markers_locked_to_d04_exactly_five"

patterns-established:
  - "Per-step unit tests with one def test_* per behavior bullet (mirrors data/tests/test_transforms.py)"
  - "Idempotence loop test exercising every interesting fixture in one assertion"

requirements-completed: [CHECK-06, TAX-04]

# Metrics
duration: ~5min
completed: 2026-05-03
---

# Phase 076 Plan 02: canonicalize() Helper Summary

**Pure-function `canonicalize(name)` implementing the D-04 5-step algorithm, with 16 passing unit tests including the TAX-04 disagreement fixture and idempotence guarantee — the JOIN KEY producer the rest of Phase 76 depends on.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-03T05:30:00Z (approx.)
- **Completed:** 2026-05-03T05:34:20Z
- **Tasks:** 2 (RED + GREEN; no REFACTOR needed)
- **Files modified:** 2 created, 0 modified

## Accomplishments

- `data/canonical_name.py` (73 LOC) implements `canonicalize(name: str | None) -> str | None` per D-04
- `data/tests/test_canonical_name.py` (140 LOC) covers all 5 steps, idempotence, edge cases (None / empty / whitespace), and the TAX-04 disagreement fixture
- `_INFRA_MARKERS` tuple locked to exactly 5 markers (`ssp.`, `var.`, `aff.`, `cf.`, `nr.`) per D-04 step 3
- All 16 new tests pass; full data-pipeline pytest suite (44 tests) remains green — zero regression

## Task Commits

Each task was committed atomically (TDD: separate RED and GREEN commits):

1. **Task 1: RED — write failing tests for canonicalize()** — `e00024a` (test)
2. **Task 2: GREEN — implement data/canonical_name.py to pass all tests** — `6da7de7` (feat)

## Files Created/Modified

- `data/canonical_name.py` — single-source-of-truth canonicalize() helper with `_AUTHORITY_RE`, `_SUBGENUS_RE`, `_INFRA_MARKERS`
- `data/tests/test_canonical_name.py` — 16 unit tests (per-step + idempotence + disagreement fixture + marker-list lock)

## Decisions Made

- **Authority regex tightened beyond RESEARCH.md §Pattern 3 template.** The original template `\(\s*[A-ZÄÖÜÉÈ].*?\)` would also match subgenus parens like `(Dialictus)`, causing `Lasioglossum (Dialictus) zonulum (Smith, 1853)` to lose its species epithet during step 1. Adjusted the paren branch to `\(\s*[A-ZÄÖÜÉÈ][^)]*,\s*\d{4}[^)]*\)` so it only matches parens that contain a `, <year>` (the actual signal that distinguishes authority from subgenus). Documented inline in `canonical_name.py` with a reference to PITFALLS.md #3.
- **`grep -c 'subsp\.' canonical_name.py` acceptance criterion enforced.** Initial draft mentioned `subsp.` in two "DO NOT add subsp." comments. Reworded to "DO NOT add any other marker" so the literal string never appears in the implementation file — the constraint is documented but the forbidden token isn't present, satisfying the acceptance grep.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tightened `_AUTHORITY_RE` paren branch to require `,<year>` inside parens**
- **Found during:** Task 2 (GREEN implementation)
- **Issue:** RESEARCH.md §Pattern 3 template's authority regex would also match subgenus parens like `(Dialictus)`. With the trailing-anchor + non-greedy quantifier, the combined fixture `Lasioglossum (Dialictus) zonulum (Smith, 1853)` would have its species epithet eaten when the regex backtracked from the inner `)` to the outer `)`. PITFALLS.md #3 flags exactly this risk.
- **Fix:** Required `, <4-digit year>` inside trailing parens via `\(\s*[A-ZÄÖÜÉÈ][^)]*,\s*\d{4}[^)]*\)`. Subgenus parens lack a year so they're left for step 2.
- **Files modified:** data/canonical_name.py
- **Verification:** `test_canonicalize_authority_plus_subgenus_combined` and `test_canonicalize_strips_subgenus_parens_seladonia` both pass.
- **Committed in:** 6da7de7 (Task 2 GREEN commit)

**2. [Rule 1 - Bug] Removed literal `subsp.` strings from `canonical_name.py` comments**
- **Found during:** Task 2 verification (acceptance criteria check)
- **Issue:** Acceptance criterion `grep -c 'subsp\.' data/canonical_name.py` requires 0 matches, but my initial comments said "DO NOT add subsp.".
- **Fix:** Reworded comments to "DO NOT add any other marker without a CONTEXT.md amendment".
- **Files modified:** data/canonical_name.py
- **Verification:** `grep -c 'subsp\.' canonical_name.py` returns 0; tests still pass.
- **Committed in:** 6da7de7 (Task 2 GREEN commit; both edits in same commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bug fixes against the RESEARCH.md template / acceptance criteria)
**Impact on plan:** Both deviations are tightening fixes that bring the implementation into compliance with PITFALLS.md and the explicit acceptance criteria. No scope creep — the contract (signature, behavior, marker list) is exactly as specified.

## Idempotence Confirmation

`test_canonicalize_idempotent` exercises 6 representative fixtures and verifies `canonicalize(canonicalize(x)) == canonicalize(x)` for each:
- `Lasioglossum (Dialictus) zonulum`
- `Andrena fulva (Müller, 1766)`
- `Bombus melanopygus mixtus`
- `Hylaeus aff. cressoni`
- `  Apis  Mellifera  `
- `Osmia`

All idempotent. Result: applying canonicalize twice yields the same string as applying it once.

## `_INFRA_MARKERS` Lock Confirmation

`test_infra_markers_locked_to_d04_exactly_five` asserts:
- `len(_INFRA_MARKERS) == 5`
- `set(_INFRA_MARKERS) == {"ssp.", "var.", "aff.", "cf.", "nr."}`

`subsp.` is intentionally NOT included per D-04. The literal string `subsp.` does not appear anywhere in `data/canonical_name.py` (verified via `grep -c`).

## Issues Encountered

- None. RED produced the expected `ModuleNotFoundError`; GREEN passed all 16 tests on the first run after the authority-regex tightening.

## TDD Gate Compliance

- RED gate: `e00024a` (test) — 16 failing tests with `ModuleNotFoundError: No module named 'canonical_name'`
- GREEN gate: `6da7de7` (feat) — same 16 tests now pass; full suite (44 tests) green
- REFACTOR gate: not exercised — implementation already concise (73 LOC) and clear

## Self-Check: PASSED

- Created `data/canonical_name.py` — FOUND
- Created `data/tests/test_canonical_name.py` — FOUND
- Commit `e00024a` (RED) — FOUND
- Commit `6da7de7` (GREEN) — FOUND
- Tests pass: `cd data && uv run pytest tests/test_canonical_name.py` → 16 passed
- Full suite green: `cd data && uv run pytest` → 44 passed
- `grep -c 'subsp\.' data/canonical_name.py` → 0
- `_INFRA_MARKERS` lock verified via runtime assertion

## Next Phase Readiness

- Plans 03 (`data/checklist_pipeline.py`), 05 (occurrences canonical_name), and 06 (integration tests) can now `from canonical_name import canonicalize` without further setup.
- The function is the locked JOIN KEY producer; downstream plans must NOT modify the algorithm without amending CONTEXT.md D-04.

---
*Phase: 076-data-foundation*
*Plan: 02*
*Completed: 2026-05-03*
