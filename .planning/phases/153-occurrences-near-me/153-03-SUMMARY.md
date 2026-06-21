---
phase: 153-occurrences-near-me
plan: "03"
subsystem: ui
tags: [near-me, geolocation, bounds-selection, lit, bee-atlas, state-ownership]
dependency_graph:
  requires:
    - phase: 153-01
      provides: "bee-map.requestUserLocation() D-06 seam"
    - phase: 153-02
      provides: "near-me-requested / near-me-cleared events + selectionBoundsActive prop on bee-pane"
    - phase: 152-geolocatecontrol-location-state
      provides: "_userLocation relay + _locationError/Kind denial toast + GeolocateControl"
  provides:
    - "boundsFromLocation() exported helper — ±10 km box from GPS fix (D-02)"
    - "_applyBoundsSelection() shared state transition — guarantees near-me ≡ shift-drag (D-01)"
    - "_onNearMeRequested/_onNearMeCleared handlers wired to bee-pane events (D-04/D-05)"
    - "_nearMePending flag gates box-compute on the right fix (D-07)"
    - ".selectionBoundsActive binding on bee-pane (D-05)"
    - "Toast fix: trigger()===false path now emits user-location-changed error (D-08)"
    - "W1/W2/W3 plan-checker fixes with tests"
  affects:
    - "src/bee-atlas.ts"
    - "src/bee-map.ts"
    - "src/tests/bee-atlas.test.ts"
tech-stack:
  added: ["@query decorator from lit/decorators.js"]
  patterns:
    - "Shared bounds-selection helper (_applyBoundsSelection) ensures near-me and shift-drag are identical state"
    - "Non-reactive _nearMePending flag gates async fix consumption without triggering extra re-renders"
    - "Module-level exported pure function (boundsFromLocation) testable without component instantiation"
    - "GeolocateControl.trigger() return-value check to synthesise error when permission already denied"

key-files:
  created: []
  modified:
    - src/bee-atlas.ts
    - src/bee-map.ts
    - src/tests/bee-atlas.test.ts

key-decisions:
  - "boundsFromLocation guards dLon>180 (not just isFinite) to reject near-polar inputs where cos→near-0 produces a finite but astronomically large longitude span"
  - "Toast root cause: GeolocateControl.trigger() returns false on already-denied permission WITHOUT emitting an error event — fixed by checking return value in requestUserLocation() and synthesising the error emit"
  - "_applyBoundsSelection extracted from _onSelectionDrawn so both paths share one state transition — no separate near-me query path (D-01)"
  - "_nearMePending cleared BEFORE the bad-accuracy early-return to prevent the W2 stranded-pending bug"
  - "_onNearMeRequested uses @query('bee-map') accessor (W1) for imperative ref — null-safe via ?. to avoid silent no-op crash"

patterns-established:
  - "Shared bounds-selection method: any producer of a bbox (near-me, shift-drag, future polygon import) should call _applyBoundsSelection()"
  - "GeolocateControl.trigger() returns false on denied permission — must check and synthesise error event"

requirements-completed: [NEAR-01, NEAR-02, NEAR-03]

duration: "~35 minutes"
completed: "2026-06-21"
---

# Phase 153 Plan 03: bee-atlas near-me integration Summary

**Near-me end-to-end: GPS fix → ±10 km bounding box → identical `_selectionBounds` state and `sel=` URL as shift-drag, with denial toast fix for the trigger()-returns-false gap**

## Performance

- **Duration:** ~35 minutes
- **Completed:** 2026-06-21
- **Tasks:** 3 (TDD: RED → GREEN, 2 implementation tasks + 1 test task)
- **Files modified:** 3

## Accomplishments

- `boundsFromLocation()` exported pure helper computes ±10 km box with polar guard (`dLon > 180`)
- `_applyBoundsSelection()` shared state transition makes near-me and shift-drag produce byte-identical `_selectionBounds` + `sel=` URL (D-01, D-03)
- Near-me event loop wired: `near-me-requested` → `requestUserLocation()` → `user-location-changed` success → `_applyBoundsSelection(box)` → existing query + URL path (D-02, D-06, D-09)
- Three plan-checker fixes addressed: W1 (`@query` ref), W2 (stranded-pending on bad accuracy), W3 (Clear-filters covers near-me bounds)
- **Toast fix (D-08):** `requestUserLocation()` in `bee-map.ts` now checks `trigger()` return value; when `false` (permission already denied, no error event from control), it synthesises a `user-location-changed` error emit

## Task Commits

| # | Task | Commit | Type |
|---|------|--------|------|
| RED | NEAR failing tests — box compute, URL equivalence, denial, clear, W1/W2/W3 | c1703647 | test |
| GREEN | bee-atlas.ts + bee-map.ts implementation + test fixes | f1c2bdf6 | feat |

## Files Created/Modified

- `src/bee-atlas.ts` — `boundsFromLocation()` export, `@query` accessor, `_nearMePending` flag, `_applyBoundsSelection()`, `_onNearMeRequested`/`_onNearMeCleared` handlers, `_onUserLocationChanged` updated, `<bee-pane>` template bindings
- `src/bee-map.ts` — `requestUserLocation()` checks `trigger()` return value and emits error when false
- `src/tests/bee-atlas.test.ts` — NEAR describe block (box math, URL equivalence, denial, success, clear, W1/W2/W3 assertions); updated SEL-07 test to reflect `_applyBoundsSelection` refactor

## Decisions Made

- **boundsFromLocation polar guard** — `isFinite(dLon)` alone is insufficient: at lat=90, `cos(π/2) ≈ 6.12e-17` (floating-point non-zero), yielding a finite but ~1.46e15 degree dLon. Added `dLon > 180` guard (box spanning >360° longitude is meaningless for any real location)
- **Toast root cause** — Phase 152 UAT Scenario 3 (denial banner) had checkboxes unticked but marked PASS overall. The banner code was always correct; the gap was that `GeolocateControl.trigger()` returns `false` silently when permission is already denied — it does NOT fire the control's `error` event. Phase 153's near-me button is the first programmatic caller of `trigger()`, making this gap real. Fix: check return value in `requestUserLocation()`, synthesise error emit on `false`
- **`_applyBoundsSelection` refactor** — converted `_onSelectionDrawn` from `async` (it never awaited) to a synchronous delegate, extracting the state transition to the shared method. The only downstream consequence: the existing SEL-07 test that checked for `this._selectionBounds = e.detail` was updated to check the new structure (Rule 1 auto-fix)
- **W2 fix placement** — `_nearMePending = false` placed BEFORE the bad-accuracy `return` in `_onUserLocationChanged`, not after, so a malformed fix (NaN or negative accuracy) clears the flag rather than leaving it stranded

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SEL-07 test broke due to _onSelectionDrawn refactor**
- **Found during:** GREEN phase (after extracting `_applyBoundsSelection`)
- **Issue:** Existing SEL-07 test checked for `this._selectionBounds = e.detail` directly in `_onSelectionDrawn` body. The refactor moved that assignment to `_applyBoundsSelection`.
- **Fix:** Updated SEL-07 test to verify `_onSelectionDrawn` calls `_applyBoundsSelection`, and that `_applyBoundsSelection` sets `_selectionBounds = bounds` and calls `_runListQuery` — same behavioral guarantee, updated to match refactored structure.
- **Files modified:** src/tests/bee-atlas.test.ts
- **Committed in:** f1c2bdf6

**2. [Rule 1 - Bug] boundsFromLocation polar guard: isFinite alone insufficient for lat=90**
- **Found during:** GREEN phase (test `returns null for lat=90` failed)
- **Issue:** `cos(90 * π/180) ≈ 6.12e-17` in floating point (not exactly 0), giving `dLon ≈ 1.46e15` which is `isFinite()` true. The test correctly expected `null`.
- **Fix:** Added `dLon > 180` as secondary guard — a box spanning more than 360° longitude is meaningless in any real geography.
- **Files modified:** src/bee-atlas.ts
- **Committed in:** f1c2bdf6

---

**Total deviations:** 2 auto-fixed (both Rule 1)
**Impact on plan:** Both fixes were necessary for correctness. No scope creep.

## Toast Fix Root Cause (D-08)

The Phase 152 UAT marked PASS without testing Scenario 3 (denial banner) — the checkboxes were left unticked. The banner code in `_onUserLocationChanged` was always correct for the event-driven path.

**Root cause:** `GeolocateControl.trigger()` returns `false` when the browser has already denied geolocation permission. In this case the control does NOT fire its `error` event — it silently returns false. So the `_onUserLocationChanged` error branch was never called when the user had previously denied and then tapped the near-me button.

**Fix:** `requestUserLocation()` in `bee-map.ts` now stores the return value of `trigger()` and, when `false`, synthesises a `user-location-changed` error event with `{ error: { code: 1, message: 'Permission denied' } }`. This reaches `_onUserLocationChanged`'s existing error branch, setting `_locationError = true` and `_locationErrorKind = 'denied'`.

## Known Stubs

None — near-me is fully wired end-to-end. `_beeMap?.requestUserLocation()` uses optional chaining as a null-safety guard (not a stub); a live DOM would have the element present.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes. The near-me box flows through the existing `_selectionBounds` → `boundsClause` → SQL path (T-153-05 mitigated by `isFinite` + `dLon > 180` guards). The privacy posture (coarse ±10 km box in shareable URL) is intentional per T-153-PRIV / D-03.

## Self-Check: PASSED

- [x] src/bee-atlas.ts contains `export function boundsFromLocation`, `_applyBoundsSelection`, `_nearMePending`, `_onNearMeRequested`, `_onNearMeCleared`, `@query('bee-map')`, `near-me-requested`, `selectionBoundsActive`
- [x] src/bee-map.ts contains `started === false` and `_emit('user-location-changed'` in `requestUserLocation()`
- [x] src/tests/bee-atlas.test.ts contains `NEAR: near-me bounds reuse` describe block
- [x] Commit c1703647 exists (RED)
- [x] Commit f1c2bdf6 exists (GREEN)
- [x] `npm test` — 787/787 pass
- [x] `npm run build` — green
- [x] `npx tsc --noEmit` — clean
- [x] grep gate: 0 matches for haversine / ?near=1 / nearMeCenter in non-comment lines
