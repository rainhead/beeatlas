---
phase: 153-occurrences-near-me
plan: "02"
subsystem: bee-pane
tags: [near-me, ui, pure-presenter, lit, custom-events]
dependency_graph:
  requires: []
  provides:
    - "near-me-requested CustomEvent (bee-pane button click)"
    - "near-me-cleared CustomEvent (bounds chip ✕ click)"
    - "selectionBoundsActive @property on BeePane"
  affects:
    - "src/bee-pane.ts (rendering)"
    - "src/tests/bee-pane.test.ts (render tests)"
tech_stack:
  added: []
  patterns:
    - "Inline SVG getter shared between two UI elements (button + chip)"
    - "CustomEvent upward event emission from pure presenter"
    - "Existing .chip / .chip-remove CSS reused verbatim"
key_files:
  created: []
  modified:
    - src/bee-pane.ts
    - src/tests/bee-pane.test.ts
decisions:
  - "Crosshair SVG defined as a private getter (_crosshairSvg) shared between the near-me button and the active-bounds chip so both elements are visually consistent"
  - "hasChips condition extended to include selectionBoundsActive so the .chips row renders when only the bounds filter is active (no county/ecoregion/place chip needed)"
  - "Input class always includes has-near-me to reserve trailing padding for the near-me button (avoids text/button overlap)"
  - "Tests updated from literal <svg proximity check to _crosshairSvg getter reference check, matching the shared-getter design"
metrics:
  duration: "~2 minutes 22 seconds"
  completed: "2026-06-21"
  tasks_completed: 2
  files_modified: 2
---

# Phase 153 Plan 02: bee-pane near-me affordance Summary

**One-liner:** Icon-only geolocate button in the where input emitting `near-me-requested`, plus a removable crosshair chip in the `.chips` row emitting `near-me-cleared`, both folded into the existing where input-group.

## What Was Built

Two near-me affordances added to `<bee-pane>._renderWhere()`, both folded into the existing "County, ecoregion, or place" input-group (D-04):

1. **Geolocate button** (`.near-me-btn`) — absolutely positioned right-aligned inside `.input-wrap`, mirroring the `.input-clear` pattern. Contains the crosshair SVG. On click dispatches `near-me-requested` (bubbles, composed) upward to `<bee-atlas>`.

2. **Active-bounds chip** — appears in the `.chips` row when `selectionBoundsActive` is `true`. Contains the crosshair SVG (NOT text — D-05, user-confirmed). Its ✕ (`.chip-remove`) dispatches `near-me-cleared` (bubbles, composed). Does NOT call `_emitFilter()` — the bounds live in `<bee-atlas>`, not `FilterState`.

3. **`selectionBoundsActive` property** — `@property({ attribute: false }) selectionBoundsActive: boolean = false` declared on `BeePane`. Fed by `<bee-atlas>` (`_selectionBounds !== null`) in plan 153-03.

**Pure-presenter invariant preserved:** `bee-pane.ts` contains no `_selectionBounds`, `nearMeCenter`, haversine, or `?near=1` code.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| RED | Failing tests for near-me affordance | 2a95fef8 | src/tests/bee-pane.test.ts |
| GREEN | selectionBoundsActive + button + chip | 16f0f3d1 | src/bee-pane.ts, src/tests/bee-pane.test.ts |

## Deviations from Plan

**1. [Rule 1 - Bug] Test adjusted: SVG proximity check replaced with getter reference check**
- **Found during:** GREEN phase
- **Issue:** Test `bounds chip contains an svg` used regex `/near-me-cleared[\s\S]{0,600}<svg/` expecting literal `<svg` within 600 chars of `near-me-cleared`. But the chip renders via `this._crosshairSvg` (a getter), so no literal `<svg` appears near the event string in source.
- **Fix:** Updated test to verify `_crosshairSvg` is referenced near `near-me-cleared`, and that the getter itself defines a `<svg` element. The behavior being tested (chip shows an SVG, not text) is equally well covered.
- **Files modified:** src/tests/bee-pane.test.ts
- **Commit:** 16f0f3d1

**2. [Rule 2 - Enhancement] CSS always includes `has-near-me` on the where input**
- **Found during:** GREEN phase
- **Decision:** Rather than conditionally toggling the class (adding padding only when the button is shown), the `has-near-me` class is always applied since the button is always rendered in the input-wrap. This keeps the template simpler.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The new CustomEvents carry empty `detail` (T-153-04 — accepted, event can at worst trigger a geolocation prompt that requires browser permission). The bounds chip carries no coordinates (T-153-03 — accepted, pure intent event).

## TDD Gate Compliance

- RED commit: 2a95fef8 (`test(153-02): add failing tests...`) — 10 failing tests confirmed
- GREEN commit: 16f0f3d1 (`feat(153-02): add selectionBoundsActive...`) — 63 tests passing
- REFACTOR: none required

## Self-Check: PASSED

- src/bee-pane.ts: FOUND
- src/tests/bee-pane.test.ts: FOUND
- 153-02-SUMMARY.md: FOUND
- Commit 2a95fef8 (RED): FOUND
- Commit 16f0f3d1 (GREEN): FOUND
