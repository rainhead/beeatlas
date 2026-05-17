---
phase: 89-rectangle-drawing
fixed_at: 2026-05-14T21:44:00Z
review_path: .planning/phases/89-rectangle-drawing/89-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 89: Code Review Fix Report

**Fixed at:** 2026-05-14T21:44:00Z
**Source review:** .planning/phases/89-rectangle-drawing/89-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (WR-01, WR-02 — Critical + Warning scope)
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: `_mousePos` deviates from Mapbox reference — wrong coordinates under CSS scaling

**Files modified:** `src/bee-map.ts`
**Commit:** ffc6a29
**Applied fix:** Replaced the body of `_mousePos` with the Mapbox `getScaledPoint` reference pattern. Removed the spurious `canvas.clientLeft`/`canvas.clientTop` subtractions (which were double-counting the border inset already included in `getBoundingClientRect().left`/`.top`). Added the `offsetWidth / rect.width` CSS-scaling correction factor so coordinates remain accurate when the canvas container's layout size differs from its `offsetWidth` (e.g., under `transform: scale(…)` or CSS `zoom`).

### WR-02: `disconnectedCallback` does not restore `dragPan` or remove `_rectBox` for mid-drag disconnect

**Files modified:** `src/bee-map.ts`
**Commit:** c49c562
**Applied fix:** Added mid-gesture cleanup block at the start of `disconnectedCallback`, before `_map?.remove()`. If `_rectBox` is non-null (overlay div is in the DOM), it is removed and nulled. If `_rectStart` is non-null (a drag gesture was in progress), `dragPan.enable()` is called to restore the interaction handler and `_rectStart` is nulled. This prevents orphaned DOM state and a stuck-disabled `dragPan` if the component is removed while the user is actively dragging.

---

_Fixed: 2026-05-14T21:44:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
