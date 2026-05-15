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
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 89: Code Review Report

**Reviewed:** 2026-05-14
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Phase 89 adds a shift-drag rectangle gesture to the Mapbox map. A capture-phase `mousedown` listener on the canvas container detects shift+left-button, disables `dragPan`, and registers `document`-level `mousemove`/`mouseup` handlers. An overlay `<div class="selection-box">` is drawn as the user drags, then removed on `mouseup`. If the drag exceeds a 5 px threshold, a `selection-drawn` CustomEvent is emitted with geographic bounds (west/south/east/north). `bee-atlas` receives the event and stores bounds in a `_selectionBounds` stub field; the SQLite bounds query is deferred to Phase 90.

The implementation is structurally correct and follows the architecture invariants. Two warnings surfaced: a deviation from the Mapbox reference `mousePos` implementation that will produce wrong coordinates under CSS scaling, and missing mid-drag cleanup in `disconnectedCallback`. Three info items cover a wasteful `@state()` on an unread field, missing behavioral test coverage, and a pre-existing unnecessary `as any` cast.

No critical (blocker) issues were found.

---

## Warnings

### WR-01: `_mousePos` deviates from Mapbox reference — wrong coordinates under CSS scaling

**File:** `src/bee-map.ts:260-266`

The implementation is:

```typescript
return new mapboxgl.Point(
  e.clientX - rect.left - canvas.clientLeft,
  e.clientY - rect.top - canvas.clientTop,
);
```

Mapbox GL JS's internal `getScaledPoint` (the authoritative reference used by every other handler in the library) is:

```typescript
const scaling = el.offsetWidth === rect.width ? 1 : el.offsetWidth / rect.width;
return new Point(
  (e.clientX - rect.left) * scaling,
  (e.clientY - rect.top) * scaling,
);
```

Two concrete deviations:

1. **Spurious `clientLeft`/`clientTop` subtraction.** `getBoundingClientRect().left` already gives the viewport-relative left edge of the border box. `clientLeft` is the left CSS border width. Subtracting it shifts every coordinate inward by the border thickness. Mapbox's own `getCanvasContainer()` has no border today, so `clientLeft === 0` and the bug is latent — but any future CSS border on the map div will silently corrupt all rectangle coordinates.

2. **Missing CSS-scaling correction.** When the canvas container's CSS layout width differs from its `offsetWidth` (e.g., a parent uses `transform: scale(…)` or `zoom`), `getBoundingClientRect().width` diverges from `offsetWidth` and the `scaling` factor becomes non-1. Without this correction, every drawn rectangle is offset by the scale factor, so `sw`/`ne` bounds fed to `unproject` are computed from wrong pixel positions.

**Fix:** Replace `_mousePos` with the Mapbox reference pattern:

```typescript
private _mousePos(e: MouseEvent): mapboxgl.Point {
  const canvas = this._map!.getCanvasContainer();
  const rect = canvas.getBoundingClientRect();
  const scaling = canvas.offsetWidth === rect.width ? 1 : canvas.offsetWidth / rect.width;
  return new mapboxgl.Point(
    (e.clientX - rect.left) * scaling,
    (e.clientY - rect.top) * scaling,
  );
}
```

---

### WR-02: `disconnectedCallback` does not restore `dragPan` or remove `_rectBox` for mid-drag disconnect

**File:** `src/bee-map.ts:269-282`

`disconnectedCallback` removes the `document` `mousemove`/`mouseup` listeners correctly, but does not handle a mid-drag disconnect:

- `_rectBox` — if a drag is in progress when the component is removed from the DOM, the overlay `<div>` has already been appended to the canvas container and is never cleaned up. The Mapbox `_map?.remove()` call on line 278 destroys the container and takes the div with it, so in the destruction path this is benign. If the element is reconnected (`connectedCallback` is not overridden and not shown to re-initialize), the orphaned state could interfere.
- `dragPan` — `dragPan.disable()` was called on `mousedown` but `dragPan.enable()` is only called in `_rectFinish`. If the component is disconnected before `mouseup` fires, `dragPan` is left disabled. Again, `_map?.remove()` destroys the map so it is harmless in the full teardown path.

**Fix:** Add mid-gesture cleanup before `_map?.remove()`:

```typescript
disconnectedCallback() {
  if (this._haloRafToken !== null) {
    cancelAnimationFrame(this._haloRafToken);
    this._haloRafToken = null;
  }
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
  document.removeEventListener('mousemove', this._onRectMouseMove);
  document.removeEventListener('mouseup', this._onRectMouseUp);
  this._map?.remove();
  this._resizeObserver?.disconnect();
  document.removeEventListener('click', this._onDocumentClick);
  super.disconnectedCallback();
}
```

---

## Info

### IN-01: `_selectionBounds` is `@state()` but never read in `render()` — triggers wasteful re-renders

**File:** `src/bee-atlas.ts:55-56`

```typescript
// @ts-ignore -- intentionally unused until Phase 90 wires the SQLite bounds query
@state() private _selectionBounds: { west: number; south: number; east: number; north: number } | null = null;
```

Every time `_onSelectionDrawn` runs, assigning `this._selectionBounds = e.detail` schedules a Lit re-render. Since `_selectionBounds` is not read in `render()`, the re-render does nothing and is wasted. If Phase 90 will wire this field into the template, `@state()` is correct at that point. For the stub, a plain private field would avoid the spurious re-render. Low-priority since one extra re-render per gesture completion is negligible.

**Fix (optional until Phase 90):** Remove `@state()` from the field declaration and drop the `@ts-ignore`:

```typescript
private _selectionBounds: { west: number; south: number; east: number; north: number } | null = null;
```

Restore `@state()` when Phase 90 adds template bindings that read the field.

---

### IN-02: Tests cover gesture setup by static grep only — no behavioral event-sequence coverage

**File:** `src/tests/bee-atlas.test.ts:305-352`

`SEL-01` and `SEL-02` verify gesture tokens are present in source (e.g., `boxZoom.disable()`, `dragPan.disable()`, `selection-drawn`). This is useful as a specification guard but does not verify:

- A synthetic mousedown+mousemove+mouseup sequence produces a `selection-drawn` event with correct bounds.
- The accidental-click suppression (`dx < 5 && dy < 5`) actually prevents event emission.
- The coordinate values passed to `unproject` and then to `_emit` are correct.
- `bee-atlas` binds and handles `selection-drawn` (no test checks this from the `bee-atlas` side).

The Mapbox mock (lines 31-63) is also missing stubs for `boxZoom.disable()`, `dragPan.disable()/enable()`, `getCanvasContainer()`, and `unproject()`. If any future test tries to instantiate `BeeMap` and trigger `firstUpdated`, those calls will throw. Suggest extending the mock when adding behavioral tests in Phase 90.

---

### IN-03: Unnecessary `as any` casts for `elevMin`/`elevMax` in `_onFilterChanged` (pre-existing)

**File:** `src/bee-atlas.ts:699-700`

```typescript
elevMin: (detail as any).elevMin ?? null,
elevMax: (detail as any).elevMax ?? null,
```

`detail` is typed `FilterChangedEvent`, which is imported from `bee-sidebar.ts` and already declares `elevMin: number | null` and `elevMax: number | null` (lines 40-41 of `bee-sidebar.ts`). The `as any` cast is unnecessary and defeats type-checking for these fields. This predates phase 89 but is in scope since the file is under review.

**Fix:**

```typescript
elevMin: detail.elevMin,
elevMax: detail.elevMax,
```

---

_Reviewed: 2026-05-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
