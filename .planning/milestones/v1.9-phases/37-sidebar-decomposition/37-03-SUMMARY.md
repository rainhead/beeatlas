---
phase: 37-sidebar-decomposition
plan: "03"
subsystem: frontend
tags: [lit, async, race-condition, filter, fix]

dependency_graph:
  requires:
    - "37-02: bee-sidebar thin layout shell, bee-atlas coordinator with single filterState binding"
  provides:
    - "bee-atlas._runFilterQuery: race-guarded with monotonic generation counter"
    - "fix: chip removal flicker eliminated — stale async DuckDB results discarded"
  affects:
    - "frontend/src/bee-atlas.ts"

tech-stack:
  added: []
  patterns:
    - "Monotonic generation counter pattern for async race condition prevention: increment counter before each async call, discard result if counter advanced by a newer call"

key-files:
  created: []
  modified:
    - frontend/src/bee-atlas.ts

key-decisions:
  - "Generation counter is a plain private field (not @state) — no Lit re-render needed, just a guard"
  - "Do NOT clear _visibleEcdysisIds synchronously on filter change — stale IDs from previous filter are a better visual state than null (which shows everything) while the new query is in flight"
  - "Root cause was async race (hypothesis 1), not double-fire of filter-changed (hypothesis 3) — confirmed by code review of bee-filter-controls._removeCounty/_removeEcoregion/_clearTaxon which each call _emit exactly once"
  - "Task 2 human-verify auto-approved (AUTO_CFG=true)"

requirements-completed: [DECOMP-01, DECOMP-04]

duration: ~5min
completed: "2026-04-04"
---

# Phase 37 Plan 03: Filter Chip Removal Flicker Fix Summary

**Monotonic generation counter added to `_runFilterQuery` in bee-atlas.ts, discarding stale DuckDB async results that caused a flash of unfiltered specimens when removing county/ecoregion/taxon filter chips.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-04T22:00:00Z
- **Completed:** 2026-04-04T22:05:00Z
- **Tasks:** 2 (1 auto + 1 checkpoint auto-approved)
- **Files modified:** 1

## Accomplishments

- Added `_filterQueryGeneration` counter to bee-atlas.ts (non-reactive private field)
- Updated `_runFilterQuery` to increment counter at call start and discard result if counter advanced
- Documented root cause inline: filterState update is synchronous (triggers OL canvas repaint via bee-map.updated()), while queryVisibleIds is async — without the guard, older queries completing after newer ones would overwrite visibleEcdysisIds with stale data
- All 26 existing structural/unit tests pass; TypeScript compiles clean

## Task Commits

1. **Task 1: Add generation guard to _runFilterQuery** - `56a6fd9` (fix)
2. **Task 2: Verify chip removal flicker is fixed** - auto-approved (AUTO_CFG=true)

## Files Created/Modified

- `frontend/src/bee-atlas.ts` - Added `_filterQueryGeneration` field and guard in `_runFilterQuery`

## Decisions Made

- Generation counter is a plain private field (not `@state`) — it's a coordination mechanism, not UI state; adding `@state` would cause unnecessary re-renders
- Chose not to clear `_visibleEcdysisIds` synchronously on filter change — keeping the previous filter's IDs visible during the async query avoids showing the "everything" (null) state as an intermediate, which is a worse visual than a brief moment of the old filter
- Root cause confirmed as hypothesis 1 (async race), not hypothesis 3 (double-fire) — `_removeCounty`, `_removeEcoregion`, and `_clearTaxon` in bee-filter-controls each call `_emit` exactly once

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The fix is purely a race-condition guard with no placeholder data.

## Threat Flags

None. No new trust boundaries, network endpoints, auth paths, or schema changes introduced. Threat T-37-03-01 (generation counter integer overflow) accepted per plan — astronomically unlikely in a UI context.

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| frontend/src/bee-atlas.ts exists | FOUND |
| commit 56a6fd9 (Task 1) exists | FOUND |
| grep -c "_filterQueryGeneration" bee-atlas.ts returns >= 3 | PASS (3) |
| guard line "if (generation !== this._filterQueryGeneration) return" present | PASS |
| npx tsc --noEmit exits 0 | PASS |
| npm test --run: 26/26 tests pass | PASS |

## Next Phase Readiness

- Phase 37 gap closure complete — flicker fix shipped
- Phase 37 all structural decomposition requirements (DECOMP-01 through DECOMP-04) satisfied
- Ready for Phase 38: Unit Tests

---
*Phase: 37-sidebar-decomposition*
*Completed: 2026-04-04*
