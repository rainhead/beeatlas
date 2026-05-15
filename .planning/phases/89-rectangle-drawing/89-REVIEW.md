---
phase: 89-rectangle-drawing
reviewed: 2026-05-14T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - src/bee-map.ts
  - src/bee-atlas.ts
  - src/tests/bee-atlas.test.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 89: Code Review Report

**Reviewed:** 2026-05-14
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Phase 89 adds a shift-drag rectangle gesture to the Mapbox map: a capture-phase `mousedown` listener on the canvas container starts drawing an overlay `<div>`, document-level `mousemove`/`mouseup` listeners track drag progress, and `mouseup` fires a `selection-drawn` CustomEvent with geographic bounds. `bee-atlas` receives the event and stores bounds in `_selectionBounds` (to be queried in Phase 90).

The implementation is structurally sound and matches the architecture invariants. However, there is one correctness bug in `_mousePos` that produces wrong coordinates in scrolled or CSS-scaled viewports, one interaction-ordering bug where a completed rectangle still fires `map-click-empty`, and two missing-cleanup/leak risks.

---

## Critical Issues

### CR-01: `_mousePos` double-subtracts border width from `getBoundingClientRect`

**File:** `src/bee-map.ts:260-266`

`getBoundingClientRect()` already returns coordinates relative to the viewport that account for CSS borders — `rect.left` and `rect.top` include the element's border. Subtracting `canvas.clientLeft` and `canvas.clientTop` (which are the element's left/top border widths) again produces pixel offsets that are shifted inward by the border thickness for every mouse event. When the canvas container has no border the error is zero, but if Mapbox or any applied CSS ever adds even a 1 px border the rectangle start/end points will be offset from where the user actually clicked.

The canonical Mapbox GL JS implementation of this helper (used internally in `BoxZoomHandler`) uses only `rect.left`/`rect.top`:

```typescript
private _mousePos(e: MouseEvent): mapboxgl.Point {
  const canvas = this._map!.getCanvasContainer();
  const rect = canvas.getBoundingClientRect();
  return new mapboxgl.Point(
    e.clientX - rect.left,
    e.clientY - rect.top,
  );
}
```

---

## Warnings

### WR-01: Completed rectangle still fires `map-click-empty`

**File:** `src/bee-map.ts:196-205` and `657`

`_onRectMouseDown` sets `this._clickConsumed = true` on line 198 to suppress the click fallback. However, `this._map.on('mousedown', ...)` on line 657 resets `_clickConsumed = false` on every `mousedown` — and the Mapbox `mousedown` event fires for the same native event as the capture-phase listener. Whether the Mapbox internal `mousedown` fires before or after the capture listener is not guaranteed across Mapbox GL JS versions, but in practice the Mapbox listener fires after (it is a bubbling-phase handler registered on the canvas container). This means:

1. Native `mousedown` fires.
2. Capture listener (`_onRectMouseDown`) sets `_clickConsumed = true`.
3. Mapbox bubbling `mousedown` listener sets `_clickConsumed = false` — overwriting step 2.

After the user releases with a large enough drag, `_rectFinish` emits `selection-drawn` but the subsequent Mapbox `click` event (which fires at the `mouseup` location) will see `_clickConsumed === false` and also emit `map-click-empty`, which in `bee-atlas._onMapClickEmpty` clears region filters and selection state. The race may be masked today because Mapbox `click` only fires when there is no significant mouse movement between `mousedown` and `mouseup`, but the handler ordering itself is fragile.

**Fix:** In `_onRectMouseDown`, call `e.stopPropagation()` (in addition to the existing guard) so the native event does not reach the Mapbox canvas listener at all. Alternatively, restore `_clickConsumed = true` at the end of `_rectFinish` before returning, so the flag stays set through the subsequent click event loop.

```typescript
private _onRectMouseDown = (e: MouseEvent) => {
  if (!(e.shiftKey && e.button === 0)) return;
  e.stopPropagation(); // prevent Mapbox's own mousedown handler from resetting _clickConsumed
  this._clickConsumed = true;
  // ... rest unchanged
};
```

### WR-02: Document-level listeners leak when `_map` is null at disconnect time

**File:** `src/bee-map.ts:269-282`

`disconnectedCallback` only removes the canvas `mousedown` listener when `this._map` is non-null (the optional chain on line 274-275 silently skips removal if `_map` is null). The `document` listeners for `mousemove` and `mouseup` are removed unconditionally on lines 276-277, which is correct. However, if `disconnectedCallback` fires while a drag is in progress (component removed from DOM mid-gesture), `_rectStart` is non-null and `_rectBox` has been appended to the canvas container. The box is not removed in `disconnectedCallback` — it orphans in the DOM of the (now-detached) canvas container. The `dragPan` is also left disabled.

**Fix:** Add cleanup for in-progress gesture state to `disconnectedCallback`:

```typescript
disconnectedCallback() {
  // ... existing haloRafToken cancel ...
  // Clean up any in-progress rectangle gesture
  if (this._rectBox) {
    this._rectBox.remove();
    this._rectBox = null;
  }
  if (this._rectStart) {
    this._map?.dragPan.enable();
    this._rectStart = null;
  }
  const canvas = this._map?.getCanvasContainer();
  canvas?.removeEventListener('mousedown', this._onRectMouseDown, true);
  // ... rest unchanged
}
```

### WR-03: `selection-box` CSS is in Shadow DOM but `_rectBox` is appended outside it

**File:** `src/bee-map.ts:142-151`, `209-212`

The `.selection-box` CSS rule is defined in `BeeMap.styles` (line 90), which scopes into the Shadow DOM. The `_rectBox` `<div>` is created as a plain `document.createElement('div')` and appended to `this._map!.getCanvasContainer()` (line 212). Mapbox's canvas container is a child of `this.mapElement` (`#map`), which lives inside the Shadow DOM — so the element is technically within the shadow tree and the shadow-scoped style should apply in most browsers. However, if Mapbox ever moves the canvas container outside the shadow host (e.g., via a Mapbox API call or future Mapbox version change) the style would silently stop applying and the overlay would be invisible. The current code also relies on the implicit fact that `getCanvasContainer()` returns a descendant of the shadow root, which is not documented as a Mapbox guarantee.

**Fix:** Apply inline styles as a fallback alongside the class:

```typescript
this._rectBox = document.createElement('div');
this._rectBox.className = 'selection-box';
// Fallback inline style ensures visibility even if shadow CSS doesn't reach this node:
Object.assign(this._rectBox.style, {
  background: 'rgba(56,135,190,0.1)',
  border: '2px solid #3887be',
  position: 'absolute',
  top: '0', left: '0',
  pointerEvents: 'none',
});
```

---

## Info

### IN-01: `_onSelectionDrawn` stub comment is inaccurate about where the work happens

**File:** `src/bee-atlas.ts:655-658`

The stub comment says "Phase 90: dispatch SQLite bounds query and open sidebar with matched occurrences." The `@ts-ignore` on `_selectionBounds` says it is intentionally unused until Phase 90. This is intentional scaffolding, but the `@state()` decorator on `_selectionBounds` (line 56) will cause a Lit re-render on every completed rectangle gesture even though the value is never consumed by `render()`. This wastes a render cycle per gesture. Since Phase 90 will wire this field into the template, this is low-priority — but note the unnecessary re-render is present.

### IN-02: Tests are static-grep only — no behavioral coverage of the gesture

**File:** `src/tests/bee-atlas.test.ts:305-352`

`SEL-01` and `SEL-02` grep the source text for token presence (`boxZoom.disable()`, `dragPan.disable()`, etc.). This is useful for catching regressions in the setup code, but no test fires a synthetic `mousedown`/`mousemove`/`mouseup` event sequence and verifies that `selection-drawn` is emitted with correct bounds, or that accidental-click suppression (dx/dy < 5) prevents emission. The mock for `mapboxgl.Map` already provides stubs for `boxZoom` and `dragPan` (missing — see below), so a behavioral test would require extending the mock. The existing approach is acceptable for a phase stub, but behavioral coverage should be added before Phase 90 ships the query.

Note: the mapbox-gl mock (lines 31-63) does not stub `boxZoom.disable()`, `dragPan.disable()`, `dragPan.enable()`, or `getCanvasContainer()`. If a test ever tries to instantiate `BeeMap` and call `firstUpdated`, it will throw. This is a latent gap in the mock, not a test regression today since no test does so.

---

_Reviewed: 2026-05-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
