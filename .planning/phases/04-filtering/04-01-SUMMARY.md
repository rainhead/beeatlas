---
phase: 04-filtering
plan: 01
subsystem: ui
tags: [openlayers, typescript, filtering, clustering, style]

# Dependency graph
requires:
  - phase: 03-core-map
    provides: clusterStyle, styleCache, RECENCY_COLORS, recencyTier — extended by this plan
provides:
  - FilterState interface and filterState singleton for OL style/geometry function closure
  - isFilterActive predicate
  - matchesFilter predicate (AND logic: taxon, year range, month)
  - clusterStyle with per-cluster opacity ghosting when filter is active
affects: [04-filtering plans 02+, bee-map.ts filter wiring, bee-sidebar.ts filter UI]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared mutable FilterState singleton closed over by OL style callbacks (cannot receive state as parameters due to fixed OL signatures)"
    - "Cache bypass pattern: skip styleCache when filter active — same count:tier pair can have different match counts"
    - "Per-cluster opacity ghosting via hexWithOpacity helper and rgba() in Style fill/stroke colors"

key-files:
  created:
    - frontend/src/filter.ts
  modified:
    - frontend/src/style.ts

key-decisions:
  - "filterState is a shared mutable singleton (not a Lit reactive property) — OL style callbacks have fixed signatures and cannot receive state as parameters"
  - "styleCache is bypassed entirely when any filter is active — same count:tier pair can yield different match counts when filter is applied"
  - "Ghosted clusters use 0.2 opacity grey fill with no count label; matching clusters use full-opacity recency color with match count (not total cluster size)"
  - "Unused opacity variable removed from clusterStyle — opacity already encoded directly in hexWithOpacity calls"

patterns-established:
  - "hexWithOpacity(hex, opacity): converts 6-char hex + float to rgba() string for per-style alpha control"
  - "isGhosted = active && matchCount === 0 — drives all ghosting decisions in one boolean"

requirements-completed: [FILTER-01, FILTER-02]

# Metrics
duration: 1min
completed: 2026-02-22
---

# Phase 4 Plan 01: FilterState Foundation and clusterStyle Ghosting Summary

**FilterState singleton module + clusterStyle ghosting: non-matching clusters render at 0.2 opacity grey with no count label; matching clusters render full-opacity recency-colored with match count**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-22T17:15:23Z
- **Completed:** 2026-02-22T17:16:46Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `filter.ts` with FilterState interface, mutable singleton, isFilterActive predicate, and matchesFilter AND-logic predicate covering taxon (family/genus/species), year range, and month
- Extended `clusterStyle` to iterate innerFeatures counting matches, skip the styleCache when filter is active, and render ghosted (0.2 opacity grey, no label) vs. matching (full opacity recency color, match count) styles
- Verified TypeScript compiles cleanly and Vite production build succeeds with no errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create filter.ts — FilterState module with singleton and predicate** - `476e16a` (feat)
2. **Task 2: Update style.ts — ghost non-matching clusters via per-style opacity** - `f7ec271` (feat)

**Plan metadata:** (docs commit — see final_commit below)

## Files Created/Modified

- `frontend/src/filter.ts` - FilterState interface, filterState singleton, isFilterActive, matchesFilter
- `frontend/src/style.ts` - Added hexWithOpacity helper, filter-aware clusterStyle with isGhosted logic and cache bypass

## Decisions Made

- filterState is a shared mutable singleton — OL style callbacks have fixed signatures and cannot receive extra parameters
- styleCache is bypassed entirely when any filter is active — same count:tier pair can yield different match counts when filter applies
- Ghosted clusters: 0.2 opacity grey fill, no count text label
- Match count (not total cluster size) is shown as the label when filter is active

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused `opacity` variable from clusterStyle**
- **Found during:** Task 2 (Update style.ts)
- **Issue:** Plan included `const opacity = isGhosted ? 0.2 : 1.0;` but this variable was never read — fill and stroke colors already encoded opacity directly via `hexWithOpacity()` calls. TypeScript strict mode flagged it as TS6133.
- **Fix:** Removed the unused `opacity` variable declaration; the opacity values are already encoded in the `hexWithOpacity('#aaaaaa', 0.2)` and `hexWithOpacity(RECENCY_COLORS[bestTier], 1.0)` calls directly.
- **Files modified:** `frontend/src/style.ts`
- **Verification:** `npx tsc --noEmit` exits 0 with no errors
- **Committed in:** `f7ec271` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Necessary for clean TypeScript compilation. The opacity values are preserved in the rgba() strings — no behavior change.

## Issues Encountered

None — beyond the unused variable caught by the TypeScript compiler.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `filter.ts` provides the complete FilterState foundation ready for `bee-map.ts` to import and mutate
- `clusterStyle` ghosting is complete — will activate automatically once `filterState` fields are set and `clusterSource.changed()` is called
- Next plans in Phase 4: wire filter UI in `bee-sidebar.ts`, wire filter state mutations in `bee-map.ts`, compute filtered summary stats

## Self-Check: PASSED

- FOUND: `frontend/src/filter.ts`
- FOUND: `frontend/src/style.ts`
- FOUND: `.planning/phases/04-filtering/04-01-SUMMARY.md`
- FOUND: commit `476e16a` (Task 1 — filter.ts)
- FOUND: commit `f7ec271` (Task 2 — style.ts ghosting)
- FOUND: commit `e436175` (docs — plan metadata)

---
*Phase: 04-filtering*
*Completed: 2026-02-22*
