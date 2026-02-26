---
phase: 04-filtering
plan: 03
subsystem: ui
tags: [filtering, verification, ux]

# Dependency graph
requires:
  - phase: 04-02
    provides: Filter controls UI and BeeMap filter wiring
provides:
  - Human verification of Phase 4 filtering behaviors (INCOMPLETE — 4 issues found)
affects:
  - 04-filtering (gap-closure plans needed)

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified: []

key-decisions:
  - "Verification NOT approved — 4 UX/bug issues found requiring gap-closure plans before Phase 4 can be marked complete"

patterns-established: []

requirements-completed: []  # FILTER-01, FILTER-02 not fulfilled — verification failed

# Metrics
duration: 5min
completed: 2026-02-22
---

# Phase 4 Plan 03: Filtering Verification Summary

**Human verification revealed 4 issues (UX gaps and one bug) — Phase 4 filtering is not yet approved.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-22
- **Completed:** 2026-02-22
- **Tasks:** 1 of 2 (Task 2 was a human-verify checkpoint; verification NOT approved)
- **Files modified:** 0

## Accomplishments

- Dev server started successfully at http://localhost:5173
- User tested all filtering behaviors in browser
- 4 specific issues identified and documented for gap-closure

## Task Commits

1. **Task 1: Start dev server for verification** — no commit (server startup, no code changes)
2. **Task 2: Human verify** — CHECKPOINT: verification not approved

**Plan metadata:** committed with this summary

## Files Created/Modified

None — this was a verification-only plan.

## Decisions Made

Verification NOT approved. 4 issues must be resolved in gap-closure plans before FILTER-01 and FILTER-02 requirements can be marked complete.

## Deviations from Plan

None — plan executed as written. The human-verify checkpoint returned a "not approved" outcome, which is the defined failure path.

## Issues Encountered (Verification Failures)

The user tested the app at http://localhost:5173 and found the following issues:

### Issue 1: Year filter placeholders are not clear

- **Component:** Year range inputs in filter controls sidebar
- **Problem:** "From" and "To" placeholders do not indicate the user should enter years. The inputs are ambiguous.
- **Expected:** Placeholders should read "From year" and "To year" (or equivalent) to make the expected input format obvious.

### Issue 2: Taxon filter — dropdown selection does not apply filter

- **Component:** Taxon autocomplete input in filter controls sidebar
- **Problem:** Typing in the taxon input and manually completing a term works. However, selecting an item from the datalist dropdown does NOT trigger the filter. This is a bug — the `change` event handler does not fire (or does not correctly resolve the taxon) when using the native datalist dropdown picker.
- **Expected:** Selecting any item from the datalist dropdown should apply the taxon filter identically to manual entry.

### Issue 3: Taxon filter has no dedicated clear button

- **Component:** Taxon autocomplete input
- **Problem:** There is no inline clear button on the taxon input field. The user must use the global "Clear filters" button to reset the taxon, which is unnecessarily disruptive when the user only wants to change the taxon.
- **Expected:** An X/clear button should appear inside or adjacent to the taxon input (like a search box), allowing the taxon filter to be cleared independently.

### Issue 4: Cluster selection uses wrong UI paradigm

- **Component:** Cluster click → sidebar specimen listing
- **Problem:** Clicking a cluster currently opens a separate detail view with a back button (navigation paradigm). The user wants a different interaction model: the specimen listing should stay in the sidebar, but cluster selection should be represented by a "Clear selection" control appearing near the filter controls (just before the "Clear filters" button). The back-button navigational pattern is not wanted.
- **Expected:** No back button. Instead, a "Clear selection" button appears alongside filter controls when a cluster is selected. The specimen listing remains visible in the sidebar but is not a separate navigational "view".

## Self-Check: FAILED

Verification was intentionally not approved. The 4 issues above must be addressed in gap-closure plans. No code was created or modified in this plan, so there are no files or commits to verify beyond this SUMMARY.

## Next Phase Readiness

Phase 4 is NOT complete. Gap-closure plans are needed for:

1. Year input placeholder text (minor, CSS/HTML)
2. Taxon datalist dropdown selection bug (behavioral bug, `change` event or value resolution)
3. Taxon input clear button (UX addition)
4. Cluster selection UI paradigm — replace back-button navigation with "Clear selection" control near filters

Phase 5 should not begin until these 4 issues are resolved and re-verification passes.

---
*Phase: 04-filtering*
*Completed: 2026-02-22*
