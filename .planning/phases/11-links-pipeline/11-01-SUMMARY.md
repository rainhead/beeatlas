---
phase: 11-links-pipeline
plan: "01"
subsystem: database
tags: [pandas, parquet, pytest, ecdysis, links]

# Dependency graph
requires:
  - phase: ecdysis-occurrences
    provides: ecdysis zip export with occurrenceID column in source CSV

provides:
  - occurrenceID column (pd.StringDtype) in ecdysis.parquet alongside ecdysis_id
  - data/links/ Python package with importable __init__.py
  - 9 failing test stubs in test_links_fetch.py covering all Wave 1 behaviors

affects:
  - 11-02 (links pipeline Wave 1 — needs occurrenceID in parquet and test stubs to implement against)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED stubs: all imports kept inside individual test methods so file collects before implementation exists"
    - "Lazy per-record parquet columns: add column to selection list without changing dtype dict (already declared)"

key-files:
  created:
    - data/links/__init__.py
    - data/tests/test_links_fetch.py
  modified:
    - data/ecdysis/occurrences.py

key-decisions:
  - "occurrenceID kept as-is (not renamed) in parquet to match iNaturalist join key semantics"
  - "Test stubs use pytest.fail() pattern (not ImportError) so failure message is clear"
  - "9 test stubs (not 8 as plan stated): plan listing had 9 methods across 6 classes"

patterns-established:
  - "Lazy imports in TDD stubs: `from links.fetch import X` inside each test method, not at module level"

requirements-completed: [LINK-01, LINK-02, LINK-03, LINK-04]

# Metrics
duration: 8min
completed: 2026-03-11
---

# Phase 11 Plan 01: Links Pipeline Foundation Summary

**occurrenceID added to ecdysis.parquet (StringDtype, 46090 rows) and 9 pytest stubs created for links.fetch covering fetch, rate-limit, extraction, skip, and output behaviors**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-11T06:59:30Z
- **Completed:** 2026-03-11T07:07:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- ecdysis.parquet now has occurrenceID column (pd.StringDtype) as second column after ecdysis_id, with row count unchanged at 46,090
- data/links/ package created and importable (python -m links.fetch will no longer fail on missing package)
- 9 failing TDD stubs cover all required test classes: TestFetchPage (2), TestRateLimit (1), TestExtractObservationId (2), TestFirstLevelSkip (1), TestSecondLevelSkip (1), TestOutput (2)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add occurrenceID to ecdysis/occurrences.py::to_parquet** - `b23ae6d` (feat)
2. **Task 2: Create data/links/ module and failing test stubs** - `0018e02` (test)

## Files Created/Modified
- `data/ecdysis/occurrences.py` - Added 'occurrenceID' to column selection list in to_parquet()
- `data/links/__init__.py` - Empty package init making data/links/ importable
- `data/tests/test_links_fetch.py` - 9 failing stubs across 6 test classes for Wave 1 TDD

## Decisions Made
- occurrenceID kept as-is (not renamed) — it is the join key to iNaturalist and must match the source name
- pytest.fail("not implemented") pattern chosen over bare ImportError stubs — gives clear failure message and allows future implementation to be verified test-by-test
- 9 stubs created (plan mentioned "8 failed" but the required class listing has 9 methods across 6 classes)

## Deviations from Plan

None - plan executed exactly as written. The "8 failed" mention in the done criteria was a count error in the plan; the required class listing has 9 test methods, all of which were created.

## Issues Encountered
- ecdysis.parquet is gitignored (expected for large binary), so only occurrences.py was committed; parquet was regenerated locally.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Wave 1 (11-02) can now read occurrenceID from ecdysis.parquet via `pd.read_parquet(..., columns=['ecdysis_id', 'occurrenceID'])`
- Test stubs provide clear RED targets for TDD GREEN phase
- data/links/__init__.py ensures `from links.fetch import ...` will work once fetch.py is created

---
*Phase: 11-links-pipeline*
*Completed: 2026-03-11*
