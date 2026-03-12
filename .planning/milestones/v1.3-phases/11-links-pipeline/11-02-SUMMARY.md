---
phase: 11-links-pipeline
plan: "02"
subsystem: database
tags: [pandas, parquet, beautifulsoup4, requests, pytest, ecdysis, links, scraping]

# Dependency graph
requires:
  - phase: 11-01
    provides: occurrenceID in ecdysis.parquet, data/links/__init__.py, 9 failing TDD stubs

provides:
  - data/links/fetch.py: full links pipeline (fetch_page, extract_observation_id, run_pipeline, constants)
  - links.parquet schema: occurrenceID (StringDtype) + inat_observation_id (Int64, nullable)
  - Two-level skip logic verified by unit tests
  - npm run fetch-links script

affects:
  - Any downstream phase reading links.parquet for iNat linkage
  - v1.4 frontend display of specimen-observation links

# Tech tracking
tech-stack:
  added: []  # beautifulsoup4 and requests were already in pyproject.toml
  patterns:
    - "Two-level skip: links.parquet presence (Level 1), disk HTML cache (Level 2), HTTP only otherwise"
    - "Accumulate-then-write: collect all results in memory list, write parquet once at end to avoid partial writes on error"
    - "Rate limit initialized to time.monotonic() so first HTTP request also respects the rate limit"
    - "Integer ecdysis_id as URL param (occid=integer), not UUID occurrenceID"

key-files:
  created:
    - data/links/fetch.py
  modified:
    - data/tests/test_links_fetch.py
    - package.json

key-decisions:
  - "Initialize last_fetch_time = time.monotonic() (not 0.0) so first HTTP request also sleeps to respect rate limit"
  - "Integer ecdysis_id as HTML cache filename key (e.g. 5594056.html), not UUID occurrenceID"
  - "Write output parquet once at end after full loop — never mid-run — to prevent partial data loss on error"

patterns-established:
  - "TDD implementation: all test classes + run_pipeline implemented in same commit since they were fully interleaved"

requirements-completed: [LINK-01, LINK-02, LINK-03, LINK-04]

# Metrics
duration: 3min
completed: 2026-03-12
---

# Phase 11 Plan 02: Links Pipeline Implementation Summary

**HTML scraper pipeline with two-level skip (parquet + disk cache), 20 req/sec rate limit, BeautifulSoup extraction, and atomic parquet write — 11 tests all green**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-12T02:42:55Z
- **Completed:** 2026-03-12T02:45:35Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- data/links/fetch.py created with all 6 public exports (ECDYSIS_BASE, HEADERS, RATE_LIMIT_SECONDS, HTML_CACHE_DIR, OUTPUT_PARQUET, ECDYSIS_PARQUET, get_cache_path, fetch_page, extract_observation_id, run_pipeline)
- 11 tests passing: TestFetchPage (3), TestExtractObservationId (3), TestRateLimit (1), TestFirstLevelSkip (1), TestSecondLevelSkip (1), TestOutput (2)
- npm run fetch-links script added to package.json following fetch-inat pattern

## Task Commits

Each task was committed atomically:

1. **Tasks 1+2: Implement fetch.py and all tests** - `7dea7b8` (feat)
2. **Task 3: Wire npm script** - `6f72570` (chore)

## Files Created/Modified
- `data/links/fetch.py` - Full pipeline: constants, get_cache_path, fetch_page, extract_observation_id, run_pipeline
- `data/tests/test_links_fetch.py` - 11 real tests replacing pytest.fail() stubs
- `package.json` - Added fetch-links script

## Decisions Made
- `last_fetch_time` initialized to `time.monotonic()` rather than `0.0`: ensures the first HTTP request also sleeps to respect the 20 req/sec rate limit. This is safer and matches what the TestRateLimit test expects.
- Tasks 1 and 2 were committed together since the run_pipeline implementation and its tests were developed concurrently (full TDD cycle interleaved).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Rate limit initialization: last_fetch_time = time.monotonic() not 0.0**
- **Found during:** Task 2 (TestRateLimit test failure)
- **Issue:** Initializing `last_fetch_time = 0.0` meant the first HTTP request always had elapsed > RATE_LIMIT_SECONDS (since time.monotonic() >> 0.05), so sleep was never called for the first request. TestRateLimit expected sleep to fire exactly once for the one uncached record.
- **Fix:** Changed initialization to `last_fetch_time = time.monotonic()` so the elapsed time is always < RATE_LIMIT_SECONDS for the first request, triggering the sleep.
- **Files modified:** data/links/fetch.py
- **Verification:** TestRateLimit::test_no_sleep_for_cached_records passes; all 11 tests green
- **Committed in:** 7dea7b8 (Tasks 1+2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Auto-fix essential for correct rate-limiting behavior. No scope creep.

## Issues Encountered
None — aside from the rate-limit initialization bug caught by the test, all implementation proceeded as planned.

## User Setup Required
None — no external service configuration required. The pipeline runs via `npm run fetch-links` but users must have data/ecdysis.parquet present (produced by the ecdysis data pipeline).

## Next Phase Readiness
- links.parquet will be produced by running `npm run fetch-links` against production ecdysis.parquet
- Output schema is typed (occurrenceID: StringDtype, inat_observation_id: Int64Dtype) and ready for frontend or join queries
- v1.3 core deliverable complete; v1.4 frontend display can join on occurrenceID

---
*Phase: 11-links-pipeline*
*Completed: 2026-03-12*

## Self-Check: PASSED

All created files exist. All commits verified in git history.
