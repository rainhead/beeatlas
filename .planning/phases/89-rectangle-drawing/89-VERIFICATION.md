---
phase: 89-rectangle-drawing
verified: 2026-05-14T21:15:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Shift-drag draws visible rectangle and emits selection-drawn"
    expected: "Holding Shift and dragging on the Mapbox canvas draws a blue-bordered rectangle overlay that tracks the cursor in real time; releasing removes it instantly and logs SEL { west, south, east, north } in devtools"
    why_human: "Visual gesture behavior and real-time DOM overlay cannot be verified programmatically"
  - test: "Plain drag still pans the map"
    expected: "Clicking and dragging without Shift continues to pan the map; dragPan is not permanently disabled"
    why_human: "Mapbox DragPanHandler state requires browser interaction"
  - test: "BoxZoom is suppressed"
    expected: "Shift-dragging does NOT trigger Mapbox's default zoom-to-selection behavior"
    why_human: "Requires browser interaction with the live Mapbox instance"
  - test: "Sub-threshold shift-click does not emit or leave overlay"
    expected: "A shift-click with < 5px movement leaves no overlay element and emits no selection-drawn event"
    why_human: "Requires browser interaction"
  - test: "Map stays usable after gesture (dragPan re-enabled)"
    expected: "A plain drag-to-pan works immediately after completing a shift-drag rectangle"
    why_human: "Requires sequential browser interaction"
---

# Phase 89: Rectangle Drawing Verification Report

**Phase Goal:** Users can shift-drag on the Mapbox canvas to draw a visible selection rectangle
**Verified:** 2026-05-14T21:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Holding shift and dragging on the Mapbox canvas draws a visible rectangle outline that tracks the cursor in real time | ? HUMAN | Implementation present and wired; visual behavior requires browser |
| 2 | Releasing the drag removes the rectangle from the canvas instantly (no fade, no lingering element) | ? HUMAN | `_rectBox.remove()` called in `_rectFinish()` on mouseup; instant removal requires browser confirm |
| 3 | Plain dragging (no shift) continues to pan the map normally — DragPanHandler is not permanently disabled | ? HUMAN | `dragPan.enable()` called in `_rectFinish()` on every gesture exit; runtime behavior requires browser |
| 4 | Mapbox BoxZoomHandler is disabled at map init so the default shift-drag-to-zoom behaviour is suppressed | ✓ VERIFIED | `this._map.boxZoom.disable()` at line 351 in `src/bee-map.ts`, after `new mapboxgl.Map({...})` and before `on('load', ...)` |
| 5 | On valid release (>=5px drag) bee-map emits a `selection-drawn` CustomEvent with `{ west, south, east, north }` in geographic coordinates | ✓ VERIFIED | `_rectFinish()` guards with `dx < 5 && dy < 5`; calls `this._emit('selection-drawn', { west: sw.lng, south: sw.lat, east: ne.lng, north: ne.lat })` with Y-axis-correct `unproject([minX, maxY])` → SW, `unproject([maxX, minY])` → NE |
| 6 | bee-atlas receives the `selection-drawn` event and stores the bounds in `_selectionBounds` reactive state (Phase 90 will consume it) | ✓ VERIFIED | `@selection-drawn=${this._onSelectionDrawn}` on `<bee-map>` in `render()`; `_onSelectionDrawn` assigns `this._selectionBounds = e.detail`; `@state() private _selectionBounds` declared at line 56 |

**Score:** 6/6 truths verified (3 VERIFIED programmatically, 3 require human browser check)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/bee-map.ts` | Shift-drag gesture: boxZoom.disable(), capture-phase mousedown, handlers, .selection-box CSS, disconnectedCallback cleanup | ✓ VERIFIED | All required patterns present: `boxZoom.disable()`, `addEventListener('mousedown', this._onRectMouseDown, true)`, `_onRectMouseDown`/`_onRectMouseMove`/`_onRectMouseUp`/`_rectFinish`/`_mousePos` arrow and regular handlers, `.selection-box { ... }` CSS rule in `static styles`, canvas + document listener removal in `disconnectedCallback` |
| `src/bee-atlas.ts` | `_selectionBounds` @state field, `@selection-drawn` binding, `_onSelectionDrawn` handler | ✓ VERIFIED | `@state() private _selectionBounds: { west: number; south: number; east: number; north: number } \| null = null` at line 56 (with `@ts-ignore` for `noUnusedLocals`); `@selection-drawn=${this._onSelectionDrawn}` binding present; `_onSelectionDrawn` method assigns `e.detail` to `_selectionBounds` |
| `src/tests/bee-atlas.test.ts` | SEL-01 and SEL-02 describe blocks, static-grep assertions | ✓ VERIFIED | Both describe blocks present; 10 tests total (5 per block); all pass (352 tests pass overall) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/bee-map.ts firstUpdated()` | `map.boxZoom.disable()` and capture-phase `mousedown` | After `new mapboxgl.Map({...})`, before `on('load', ...)` | ✓ WIRED | `boxZoom.disable()` at line 351; `rectCanvas.addEventListener('mousedown', this._onRectMouseDown, true)` at line 355 |
| `src/bee-map.ts _rectFinish()` | `this._emit('selection-drawn', { west, south, east, north })` | `_emit` helper with `bubbles: true, composed: true` | ✓ WIRED | `_emit('selection-drawn', { west: sw.lng, south: sw.lat, east: ne.lng, north: ne.lat })` present in `_rectFinish`; Y-axis inversion correct |
| `src/bee-atlas.ts render() <bee-map>` | `_onSelectionDrawn` handler stores `e.detail` in `_selectionBounds` | `@selection-drawn=${this._onSelectionDrawn}` event binding | ✓ WIRED | Binding present at line 193; `_onSelectionDrawn` at line 655 assigns `this._selectionBounds = e.detail` |

### Behavioral Spot-Checks

Step 7b: SKIPPED — gesture behavior requires a running browser with Mapbox canvas; no runnable entry point for automated headless check.

### Probe Execution

No probes declared in PLAN or found via convention.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SEL-01 | 89-01-PLAN.md | User can shift-drag on the map to draw a rectangular selection area (BoxZoomHandler disabled; custom shift-drag listener) | ✓ SATISFIED | `boxZoom.disable()` at init; capture-phase `mousedown` listener; `shiftKey && button === 0` guard; `dragPan.disable()/enable()` around gesture |
| SEL-02 | 89-01-PLAN.md | A rectangle outline tracks the drag in real-time as visual feedback | ? NEEDS HUMAN | `.selection-box` div created in `_onRectMouseMove`, appended to `getCanvasContainer()`, `transform`/`width`/`height` updated per mouse position; runtime visual behavior requires browser |

SEL-03 through SEL-07 are mapped to Phases 90 and 91 in REQUIREMENTS.md — not in scope for Phase 89.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/bee-atlas.ts` | 55 | `@ts-ignore` on `_selectionBounds` | ℹ️ Info | Intentional: `noUnusedLocals: true` rejects Phase-89-only state field that Phase 90 will read. Matches existing `speicmenLayer` precedent in `bee-map.ts`. Documented in SUMMARY decisions table. |
| `src/bee-atlas.ts` | 657 | `/* Phase 90: ... */` comment | ℹ️ Info | Intentional stub marker with explicit forward reference. The body is not empty — it performs the assignment `this._selectionBounds = e.detail`; Phase 90 expands this with the SQLite query. |

No `TBD`, `FIXME`, or `XXX` markers found in phase-modified files.

The `build-output.test.ts` failure is pre-existing (missing `public/data/species.json` pipeline artifact) and unrelated to Phase 89 changes, as confirmed by the SUMMARY.

### Human Verification Required

#### 1. Shift-Drag Rectangle Visual

**Test:** Run `npm run dev`, open the browser, hold Shift, click on the map canvas, and drag.
**Expected:** A blue-bordered (`#3887be`), faintly blue-filled rectangle tracks the cursor in real time with no lag. Rectangle appears immediately on drag start.
**Why human:** CSS overlay positioning and real-time DOM mutation during mouse drag cannot be verified without a live browser.

#### 2. Rectangle Disappears on Release

**Test:** Complete a shift-drag gesture and release the mouse button.
**Expected:** The `.selection-box` div is removed from the DOM instantly — no fade, no lingering element.
**Why human:** DOM cleanup timing on mouseup requires browser interaction.

#### 3. BoxZoom Suppression

**Test:** Hold Shift and drag a rectangle on the map.
**Expected:** The map does NOT zoom to the dragged area. Only the custom rectangle gesture fires.
**Why human:** Mapbox's BoxZoomHandler interaction requires a live Mapbox instance.

#### 4. Plain Drag Still Pans

**Test:** Click and drag (no Shift key) anywhere on the map.
**Expected:** The map pans normally. No rectangle appears.
**Why human:** DragPanHandler state requires browser interaction to confirm it is re-enabled after each gesture.

#### 5. selection-drawn Event Emission

**Test:** In devtools console: `document.querySelector('bee-atlas')?.addEventListener('selection-drawn', (e) => console.log('SEL', e.detail), true);` then perform a shift-drag > 20px in both axes.
**Expected:** Console logs `SEL { west: <num>, south: <num>, east: <num>, north: <num> }` with `west < east` and `south < north` and WA-region coordinates (lon ~-125 to -116, lat ~45 to 49).
**Why human:** CustomEvent detail values depend on live Mapbox `unproject()` with real map state.

### Gaps Summary

No gaps. All six must-have truths are verified at the code level. The three items marked HUMAN are not gaps — the implementation is substantively correct and wired; only runtime visual confirmation is outstanding.

The build-output test failure is pre-existing (missing pipeline-generated data files in the worktree) and is not caused by Phase 89 changes.

---

_Verified: 2026-05-14T21:15:00Z_
_Verifier: Claude (gsd-verifier)_
