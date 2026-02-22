---
phase: 05-fix-month-offset
plan: 01
subsystem: ui
tags: [parquet, filtering, month, darwincore, openlayers]

# Dependency graph
requires:
  - phase: 04-filtering
    provides: Month filter checkboxes and sidebar date display (filter.ts, bee-sidebar.ts)
  - phase: 01-pipeline
    provides: ecdysis.parquet with DarwinCore 1-indexed months (1=January, 12=December)
provides:
  - Correct 1-indexed feature months in all loaded specimen features
  - January and December specimens reachable via their respective filter checkboxes
  - Sidebar date display shows correct month names for all specimens
affects:
  - filter.ts (month predicate now matches correctly for all 12 months)
  - bee-sidebar.ts (formatMonth/getMonthName receive correct 1-12 values)
  - style.ts (recencyTier Temporal.PlainDate receives correct months)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DarwinCore months are 1-indexed (1=January, 12=December) — do not apply any offset when loading from parquet"

key-files:
  created: []
  modified:
    - frontend/src/parquet.ts

key-decisions:
  - "Remove +1 offset from parquet.ts — the pipeline already emits 1-indexed DarwinCore months; downstream consumers (filter.ts, bee-sidebar.ts, style.ts) already expect 1-12"

patterns-established:
  - "Parquet month passthrough: month: Number(obj.month) with no offset — canonical DarwinCore convention"

requirements-completed: [FILTER-02]

# Metrics
duration: ~5min
completed: 2026-02-22
---

# Phase 5 Plan 01: Fix Month Offset Summary

**Removed spurious +1 month offset from parquet.ts so all 12 DarwinCore months (1=January, 12=December) are correctly passed through to filter, sidebar, and recency tier subsystems**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-22T21:30:00Z
- **Completed:** 2026-02-22T21:45:29Z
- **Tasks:** 2 (1 auto + 1 human-verify)
- **Files modified:** 1

## Accomplishments
- Single-line fix in `frontend/src/parquet.ts`: changed `month: Number(obj.month) + 1` to `month: Number(obj.month),` with explanatory comment
- January specimens now reachable via the "Jan" checkbox (previously matched February data)
- December specimens now reachable via the "Dec" checkbox (previously feature month=13, matched no checkbox)
- Sidebar date display now shows correct month names for January and December specimens
- Human verifier confirmed all 6 browser checks passed with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove +1 month offset from parquet.ts** - `750fc36` (fix)
2. **Task 2: Human verify month filter and sidebar date correctness** - human-verify approved, no code commit

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `frontend/src/parquet.ts` - Removed `+ 1` offset; month now `Number(obj.month)` matching DarwinCore 1-12 convention

## Decisions Made
- Remove only the `+ 1` in parquet.ts — no changes to filter.ts, bee-sidebar.ts, style.ts, or bee-map.ts. All downstream consumers were already written for 1-indexed months; the offset was the sole source of the bug.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Specimen Reference (for human verifier)

During Task 1, a Python snippet confirmed January and December specimens exist in the Parquet:
- January specimens: checked with `df[df['month'] == 1]` — present in dataset
- December specimens: checked with `df[df['month'] == 12]` — present in dataset

Human verifier confirmed all 6 browser checks:
1. Jan checkbox shows January data (not February)
2. Dec checkbox shows December data (previously unreachable at month=13)
3. Sidebar shows "January" for January specimens (not "February")
4. Sidebar shows "December" for December specimens (not "January of next year")
5. April regression check passed
6. Combined taxon+month filter works correctly

## Next Phase Readiness
- FILTER-02 satisfied: all 12 month checkboxes match correct specimens
- January and December specimens fully reachable
- Ready to continue gap closure phases (phase 06 if present)

---
*Phase: 05-fix-month-offset*
*Completed: 2026-02-22*
