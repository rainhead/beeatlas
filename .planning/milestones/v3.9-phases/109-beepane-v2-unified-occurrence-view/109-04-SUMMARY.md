---
phase: 109-beepane-v2-unified-occurrence-view
plan: "04"
subsystem: testing
tags: [vitest, typescript, source-scan, cleanup]

# Dependency graph
requires:
  - phase: 109-03
    provides: bee-pane v2 with filter-btn collapsed state, selection banner, queryListPage in filter.ts
provides:
  - "bee-filter-panel.ts, bee-sidebar.ts, bee-filter-toolbar.ts deleted"
  - "bee-sidebar.test.ts, bee-filter-toolbar.test.ts deleted"
  - "PANE-V2-01..05 describe blocks all passing in bee-atlas.test.ts"
  - "PANE-01 updated to check filter-btn; PANE-V2 block added to bee-pane.test.ts"
  - "FilteredSummary moved from bee-sidebar.ts to filter.ts"
  - "Phase 109 complete — all npm test and tsc --noEmit clean"
affects: [main-branch, future-phases-touching-bee-pane]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Delete-then-test pattern: remove ARCH-03 test that reads deleted file before deleting the file"
    - "Regex precision: @property test uses \\s+ boundary to avoid matching comment text"

key-files:
  created: []
  modified:
    - src/filter.ts
    - src/bee-map.ts
    - src/tests/bee-atlas.test.ts
    - src/tests/bee-pane.test.ts
  deleted:
    - src/bee-filter-panel.ts
    - src/bee-sidebar.ts
    - src/bee-filter-toolbar.ts
    - src/tests/bee-sidebar.test.ts
    - src/tests/bee-filter-toolbar.test.ts

key-decisions:
  - "FilteredSummary added to filter.ts (only remaining exported type from bee-sidebar.ts not already there)"
  - "PANE-V2 occurrences regex fixed to use whitespace boundary — original regex matched comment text"

patterns-established:
  - "When deleting a source file, update tests that read the file in the SAME commit or beforehand"

requirements-completed: [TABLE-02]

# Metrics
duration: 12min
completed: 2026-05-20
---

# Phase 109 Plan 04: Cleanup and PANE-V2 Test Finalization Summary

**Deleted 5 superseded source/test files; added PANE-V2-01..05 and PANE-V2 describe blocks; phase 109 tests all green with tsc clean**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-20T10:52:00Z
- **Completed:** 2026-05-20T11:05:00Z
- **Tasks:** 3
- **Files modified:** 4 (+ 5 deleted)

## Accomplishments
- Deleted `bee-filter-panel.ts`, `bee-sidebar.ts`, `bee-filter-toolbar.ts`, `bee-sidebar.test.ts`, `bee-filter-toolbar.test.ts`
- Moved `FilteredSummary` to `filter.ts` and updated `bee-map.ts` import before deletion to prevent TypeScript errors
- Added PANE-V2-01 (collapsed filter-btn), PANE-V2-02 (selection banner/X close), PANE-V2-03 (split-screen table), PANE-V2-04 (header icon removal) describe blocks to `bee-atlas.test.ts`
- Updated PANE-01 in `bee-pane.test.ts` to check `.filter-btn` (not `.toggle-btn`); added PANE-V2 block
- All `src/tests/` pass; `tsc --noEmit` exits 0

## Task Commits

1. **Task 1: Delete old source and test files** - `86d3181` (feat)
2. **Task 2: Update bee-atlas.test.ts** - `584fe56` (feat)
3. **Task 3: Update bee-pane.test.ts** - `e2baffc` (feat)

## Files Created/Modified
- `src/filter.ts` — Added `FilteredSummary` interface (moved from deleted bee-sidebar.ts)
- `src/bee-map.ts` — Updated import from `bee-sidebar.ts` to `filter.ts` for `FilteredSummary`
- `src/tests/bee-atlas.test.ts` — Removed ARCH-03 stale test; added VIEW-02 viewMode test; added PANE-V2-01..04 describe blocks
- `src/tests/bee-pane.test.ts` — Replaced PANE-01 toggle-btn tests with filter-btn tests; added PANE-V2 describe block

## Decisions Made
- `FilteredSummary` was the only type in `bee-sidebar.ts` not yet moved to `filter.ts` — added it there rather than inlining it in `bee-map.ts`, keeping types co-located with the query logic.
- Fixed the `@property[^)]*\)[^)]*occurrences` regex to `@property[^)]*\)\s+occurrences\b` — the original crossed newlines and matched a comment, causing a false test failure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Moved FilteredSummary to filter.ts before deleting bee-sidebar.ts**
- **Found during:** Task 1 (Delete old source and test files)
- **Issue:** `bee-map.ts` imported `FilteredSummary` from `bee-sidebar.ts`. Deleting bee-sidebar.ts without updating the import would break TypeScript compilation.
- **Fix:** Added `FilteredSummary` interface to `filter.ts`; updated `bee-map.ts` import to `filter.ts`; included in same Task 1 commit.
- **Files modified:** `src/filter.ts`, `src/bee-map.ts`
- **Verification:** `tsc --noEmit` exits 0 after deletion
- **Committed in:** `86d3181` (Task 1 commit)

**2. [Rule 1 - Bug] Fixed overly broad occurrences regex in PANE-V2 test**
- **Found during:** Task 3 (Update bee-pane.test.ts)
- **Issue:** The plan-specified regex `/@property[^)]*\)[^)]*occurrences/` matched across newlines, hitting a code comment (`// List-state pagination props (replace .occurrences)`) after an unrelated `@property(...)` declaration. Test failed with a false positive.
- **Fix:** Changed to `/@property[^)]*\)\s+occurrences\b/` which only matches whitespace (not newlines) between the closing `)` and the property name.
- **Files modified:** `src/tests/bee-pane.test.ts`
- **Verification:** Test passes; `tsc --noEmit` clean
- **Committed in:** `e2baffc` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking import migration, 1 regex bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
- Other worktrees (agent-a72373c1fe909ddc4, agent-ab1c1c19248cd1dbc) still have the deleted files and show PANE-V2-05 failures — these are pre-existing state in those other worktrees, not caused by this plan's changes. The main-branch `src/tests/` suite is clean.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 109 is complete (all 4 plans executed). The BeePane v2 unified occurrence view is fully implemented, tested, and dead code removed.
- Main branch is ready for Phase 109 merge and next milestone tagging.

---
*Phase: 109-beepane-v2-unified-occurrence-view*
*Completed: 2026-05-20*
