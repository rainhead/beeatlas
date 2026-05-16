---
phase: 96-index-page-replacement
plan: "01"
subsystem: testing
tags: [vitest, eleventy, nunjucks, tdd]

requires:
  - phase: 95-subgenus-tribe-pages
    provides: build-output.test.ts with PAGE-07/PAGE-09 patterns this plan surgically updates

provides:
  - "src/tests/build-output.test.ts: IDX-01..04 + URL-05 build-output assertions replacing stale PAGE-01/PAGE-07 species-card checks"
  - "src/tests/page-scaffold.test.ts: entry-path assertion flipped to species-index.ts"
  - "src/tests/species-index.test.ts: new unit contract for template structure and JS wiring (IDX-01..04, URL-05)"

affects:
  - 96-02-PLAN (turns these RED tests GREEN by rewriting template + creating entry)

tech-stack:
  added: []
  patterns:
    - "readFileSync source-analysis pattern from page-scaffold.test.ts extended to species-index.test.ts"
    - "Two describe-block structure: template assertions + entry wiring assertions"

key-files:
  created:
    - src/tests/species-index.test.ts
  modified:
    - src/tests/build-output.test.ts
    - src/tests/page-scaffold.test.ts

key-decisions:
  - "IDX-01 and URL-05 piggyback into single test (family-section presence + bee-species-page absence)"
  - "PAGE-07 carry-forward on species detail pages preserved; only index-page lazy-load test removed"
  - "findSpeciesChunk() regex /^species-.*\\.js$/ left unchanged — already matches species-index-<hash>.js"

patterns-established:
  - "Pattern: two-describe test file structure (template source assertions + entry source assertions) for Eleventy+Vite MPA pages"

requirements-completed:
  - URL-05
  - IDX-01
  - IDX-02
  - IDX-03
  - IDX-04

duration: 8min
completed: 2026-05-16
---

# Phase 96 Plan 01: Index Page Test Contract (Wave 0 RED) Summary

**Vitest RED contract for IDX-01..04 + URL-05 index page assertions: three test files updated/created with 8 failing tests and 2 passing tests, locking the family-section grouping, species-filter input, genus/species link, and bee-species-page-absence requirements before implementation**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-16T15:17:00Z
- **Completed:** 2026-05-16T15:25:00Z
- **Tasks:** 3
- **Files modified:** 3 (2 modified, 1 created)

## Accomplishments

- Replaced stale `<bee-species-card>` PAGE-01 and lazy-loading PAGE-07 assertions in `build-output.test.ts` with 4 new IDX-01..04 + URL-05 tests
- Flipped `page-scaffold.test.ts` entry-path assertion from `species.ts` to `species-index.ts` (now RED until Plan 02)
- Created `src/tests/species-index.test.ts` with two describe blocks (5 template tests + 3 entry wiring tests), all RED in the expected state

## Task Commits

1. **Task 1: Replace stale index-page tests in build-output.test.ts** - `2273a37` (test)
2. **Task 2: Flip page-scaffold.test.ts entry-path assertion** - `f4df80f` (test)
3. **Task 3: Create species-index.test.ts unit contract** - `c6ab0a7` (test)

## Files Created/Modified

- `src/tests/build-output.test.ts` - Replaced PAGE-01/PAGE-07 with IDX-01..04 + URL-05 assertions; renamed PAGE-09 labels to Phase 96
- `src/tests/page-scaffold.test.ts` - Updated describe label and flipped entry-path assertion to species-index.ts
- `src/tests/species-index.test.ts` - New: two describe blocks asserting template structure and entry wiring contract

## RED/GREEN State at Plan End

| Test | File | State |
|------|------|-------|
| permalink + layout | page-scaffold.test.ts | GREEN (existing species.njk has correct frontmatter) |
| entry-path to species-index.ts | page-scaffold.test.ts | RED (template still references species.ts) |
| permalink + layout | species-index.test.ts | GREEN (same check) |
| species-index script tag | species-index.test.ts | RED (template not yet rewritten) |
| groupby("family") + groupby("genus") | species-index.test.ts | RED (template not yet rewritten) |
| id="species-filter" + type="search" | species-index.test.ts | RED (template not yet rewritten) |
| no bee-species-page or bee-species-card | species-index.test.ts | RED (template has old content) |
| imports index.css + taxon-pages.css | species-index.test.ts | RED (entry file ENOENT) |
| getElementById + addEventListener | species-index.test.ts | RED (entry file ENOENT) |
| .family-section + .genus-row + hidden | species-index.test.ts | RED (entry file ENOENT) |

Build-output assertions (IDX-01..04 + URL-05) are inside `describe.skipIf(SKIP_BUILD)` so they do not fail under `VITEST_SKIP_BUILD=1`.

## Decisions Made

- Kept `findSpeciesChunk()` regex `/^species-.*\.js$/` unchanged — it already matches `species-index-<hash>.js` (confirmed in research)
- Piggy-backed URL-05 (`<bee-species-page>` absence) into the IDX-01 family-section test to keep test count minimal

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 can proceed immediately: rewrite `_pages/species.njk`, create `src/entries/species-index.ts`, add CSS rules to `src/styles/taxon-pages.css`
- All 10 RED tests will become GREEN after Plan 02
- Build-output assertions (IDX-01..04 + URL-05) will pass after Plan 02's full build

## Self-Check

- [x] `src/tests/species-index.test.ts` exists
- [x] `src/tests/build-output.test.ts` modified (bee-species-card count: 0)
- [x] `src/tests/page-scaffold.test.ts` modified
- [x] Task 1 commit `2273a37` exists
- [x] Task 2 commit `f4df80f` exists
- [x] Task 3 commit `c6ab0a7` exists

---
*Phase: 96-index-page-replacement*
*Completed: 2026-05-16*
