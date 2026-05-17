# Phase 89: Rectangle Drawing - Pattern Map

**Mapped:** 2026-05-14
**Files analyzed:** 2 (src/bee-map.ts modified, src/bee-atlas.ts modified)
**Analogs found:** 2 / 2 — both files are themselves the analogs (modifications to existing files)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/bee-map.ts` | component / gesture handler | event-driven | `src/bee-map.ts` itself (self-referential) | exact — add new handlers alongside existing `addInteraction` chain |
| `src/bee-atlas.ts` | coordinator / state owner | event-driven | `src/bee-atlas.ts` itself (self-referential) | exact — add `_selectionBounds` state and listener alongside existing event handlers |
| `src/tests/bee-atlas.test.ts` | test | static-grep | `src/tests/bee-atlas.test.ts` itself (self-referential) | exact — add `describe` block alongside existing HALO-01, CLICK-01 blocks |

---

## Pattern Assignments

### `src/bee-map.ts` — add shift-drag rectangle handler

**Analog:** `src/bee-map.ts` existing `_clickConsumed` / `addInteraction` / `_emit` patterns

#### Existing private field declaration pattern (lines 60–82)

Copy this style for the two new private fields (`_rectStart`, `_rectBox`):

```typescript
// Existing pattern for private gesture state fields:
private _clickConsumed = false;

// HALO-01: race guard + rAF coalescing.
private _haloGeneration = 0;
private _haloRafToken: number | null = null;
```

New fields to add directly below the existing block:

```typescript
// SEL-01: shift-drag rectangle selection state
private _rectStart: mapboxgl.Point | null = null;
private _rectBox: HTMLDivElement | null = null;
```

#### Existing CSS static styles block (lines 86–138)

The `.selection-box` rule goes inside the existing `static styles = css\`` block, after `.region-menu button.active`:

```css
.selection-box {
  background: rgba(56, 135, 190, 0.1);
  border: 2px solid #3887be;
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}
```

#### Existing `_emit` helper (lines 140–144)

All custom event dispatches use this helper — `selection-drawn` follows the same pattern:

```typescript
private _emit<T>(name: string, detail?: T) {
  this.dispatchEvent(new CustomEvent(name, {
    bubbles: true, composed: true, detail,
  }));
}
```

Usage for `selection-drawn`:
```typescript
this._emit('selection-drawn', {
  west: sw.lng, south: sw.lat, east: ne.lng, north: ne.lat,
});
```

#### Existing `firstUpdated` pattern — where to add setup (lines 244–615)

After `this._map = new mapboxgl.Map({...})` and before `this._map.on('load', ...)`, add:

```typescript
// SEL-01: disable Mapbox's default shift-drag box-zoom so our handler owns the gesture
this._map.boxZoom.disable();
const canvas = this._map.getCanvasContainer();
canvas.addEventListener('mousedown', this._onRectMouseDown, true); // capture phase
```

#### Existing `this._map.on('mousedown', ...)` pattern (line 557)

The new `_onRectMouseDown` must set `_clickConsumed = true` when shift is held, to prevent `map-click-empty` from firing after a sub-threshold shift-drag. Existing reset pattern:

```typescript
// Existing reset — the new handler fires in the same gesture context:
this._map.on('mousedown', () => { this._clickConsumed = false; });
```

In `_onRectMouseDown`:
```typescript
private _onRectMouseDown = (e: MouseEvent) => {
  if (!(e.shiftKey && e.button === 0)) return;
  this._clickConsumed = true;  // prevent map-click-empty on sub-threshold release
  this._map!.dragPan.disable();
  document.addEventListener('mousemove', this._onRectMouseMove);
  document.addEventListener('mouseup', this._onRectMouseUp);
  this._rectStart = this._mousePos(e);
};
```

#### Existing `disconnectedCallback` cleanup pattern (lines 180–189)

Copy the style for removing the new canvas listener:

```typescript
disconnectedCallback() {
  if (this._haloRafToken !== null) {
    cancelAnimationFrame(this._haloRafToken);
    this._haloRafToken = null;
  }
  this._map?.remove();
  this._resizeObserver?.disconnect();
  document.removeEventListener('click', this._onDocumentClick);
  super.disconnectedCallback();
}
```

Additions to `disconnectedCallback` (before `super.disconnectedCallback()`):
```typescript
const canvas = this._map?.getCanvasContainer();
canvas?.removeEventListener('mousedown', this._onRectMouseDown, true);
document.removeEventListener('mousemove', this._onRectMouseMove);
document.removeEventListener('mouseup', this._onRectMouseUp);
```

#### Full new handler block to add as private methods (after `_handleRegionClick`):

```typescript
// SEL-01 / SEL-02: shift-drag rectangle selection handlers
private _onRectMouseDown = (e: MouseEvent) => {
  if (!(e.shiftKey && e.button === 0)) return;
  this._clickConsumed = true;
  this._map!.dragPan.disable();
  this._map!.getCanvasContainer().style.cursor = 'crosshair';
  document.addEventListener('mousemove', this._onRectMouseMove);
  document.addEventListener('mouseup', this._onRectMouseUp);
  this._rectStart = this._mousePos(e);
};

private _onRectMouseMove = (e: MouseEvent) => {
  if (!this._rectStart) return;
  const current = this._mousePos(e);
  if (!this._rectBox) {
    this._rectBox = document.createElement('div');
    this._rectBox.className = 'selection-box';
    this._map!.getCanvasContainer().appendChild(this._rectBox);
  }
  const minX = Math.min(this._rectStart.x, current.x);
  const maxX = Math.max(this._rectStart.x, current.x);
  const minY = Math.min(this._rectStart.y, current.y);
  const maxY = Math.max(this._rectStart.y, current.y);
  this._rectBox.style.transform = `translate(${minX}px, ${minY}px)`;
  this._rectBox.style.width = `${maxX - minX}px`;
  this._rectBox.style.height = `${maxY - minY}px`;
};

private _onRectMouseUp = (e: MouseEvent) => {
  this._rectFinish(e);
};

private _rectFinish(e: MouseEvent) {
  document.removeEventListener('mousemove', this._onRectMouseMove);
  document.removeEventListener('mouseup', this._onRectMouseUp);
  if (this._rectBox) {
    this._rectBox.remove();
    this._rectBox = null;
  }
  this._map!.dragPan.enable();
  this._map!.getCanvasContainer().style.cursor = '';

  if (!this._rectStart) return;
  const end = this._mousePos(e);
  const dx = Math.abs(end.x - this._rectStart.x);
  const dy = Math.abs(end.y - this._rectStart.y);
  if (dx < 5 && dy < 5) { this._rectStart = null; return; }

  const minX = Math.min(this._rectStart.x, end.x);
  const maxX = Math.max(this._rectStart.x, end.x);
  const minY = Math.min(this._rectStart.y, end.y);
  const maxY = Math.max(this._rectStart.y, end.y);

  // SW = (minX, maxY), NE = (maxX, minY) — screen Y is inverted vs latitude
  const sw = this._map!.unproject([minX, maxY]);
  const ne = this._map!.unproject([maxX, minY]);
  this._emit('selection-drawn', {
    west: sw.lng, south: sw.lat, east: ne.lng, north: ne.lat,
  });
  this._rectStart = null;
}

private _mousePos(e: MouseEvent): mapboxgl.Point {
  const canvas = this._map!.getCanvasContainer();
  const rect = canvas.getBoundingClientRect();
  return new mapboxgl.Point(
    e.clientX - rect.left - canvas.clientLeft,
    e.clientY - rect.top - canvas.clientTop,
  );
}
```

---

### `src/bee-atlas.ts` — add `_selectionBounds` state and `@selection-drawn` listener

**Analog:** `src/bee-atlas.ts` existing `@state()` field declarations and event handler wiring

#### Existing `@state()` field block (lines 19–53)

Add the new field immediately after `_error` or at the end of the state block:

```typescript
// Existing pattern for reactive state fields:
@state() private _sidebarOpen = false;
@state() private _tableFilterOpen = false;

// New field for Phase 89:
@state() private _selectionBounds: { west: number; south: number; east: number; north: number } | null = null;
```

#### Existing event binding in `render()` template on `<bee-map>` (lines 183–190)

Wire the new event alongside the existing listeners:

```typescript
// Existing event bindings:
@view-moved=${this._onViewMoved}
@map-click-occurrence=${this._onOccurrenceClick}
@map-click-region=${this._onRegionClick}
@map-click-empty=${this._onMapClickEmpty}
@data-loaded=${this._onDataLoaded}
@data-error=${this._onDataError}
@boundary-mode-changed=${this._onBoundaryModeChanged}

// Add:
@selection-drawn=${this._onSelectionDrawn}
```

#### Existing event handler pattern (e.g., `_onMapClickEmpty`, lines 651–676)

Phase 89 handler stores the bounds and logs for now; Phase 90 adds the SQLite query. Match the method style:

```typescript
private _onSelectionDrawn(e: CustomEvent<{ west: number; south: number; east: number; north: number }>) {
  this._selectionBounds = e.detail;
  // Phase 90 will wire the SQLite query here.
}
```

---

### `src/tests/bee-atlas.test.ts` — add SEL-01 and SEL-02 static-grep tests

**Analog:** `src/tests/bee-atlas.test.ts` existing `describe` blocks using `readFileSync` + regex assertions

#### Existing static-grep test pattern (lines 183–303)

Tests read source as a string and assert regex presence/absence. The new block goes at the end of the file:

```typescript
describe('SEL-01: bee-map shift-drag rectangle gesture setup', () => {
  const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');

  test('bee-map.ts disables BoxZoomHandler after map creation', () => {
    expect(src).toMatch(/boxZoom\.disable\(\)/);
  });

  test('bee-map.ts attaches canvas mousedown listener with capture=true', () => {
    expect(src).toMatch(/addEventListener\s*\(\s*['"]mousedown['"],\s*this\._onRectMouseDown,\s*true\s*\)/);
  });

  test('bee-map.ts emits selection-drawn with geographic bounds', () => {
    expect(src).toMatch(/selection-drawn/);
    expect(src).toMatch(/west.*south.*east.*north|west:.*south:.*east:.*north:/);
  });

  test('bee-map.ts calls dragPan.disable() on shift+mousedown', () => {
    expect(src).toMatch(/dragPan\.disable\(\)/);
  });

  test('bee-map.ts calls dragPan.enable() in _rectFinish cleanup', () => {
    expect(src).toMatch(/dragPan\.enable\(\)/);
  });

  test('plain drag (no shift) does not trigger rectangle gesture', () => {
    // Guard: handler checks e.shiftKey && e.button === 0
    expect(src).toMatch(/e\.shiftKey\s*&&\s*e\.button\s*===\s*0/);
  });
});

describe('SEL-02: bee-map rectangle overlay DOM lifecycle', () => {
  const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');

  test('bee-map.ts creates div with class selection-box in mousemove handler', () => {
    expect(src).toMatch(/className\s*=\s*['"]selection-box['"]/);
  });

  test('bee-map.ts appends selection-box div to getCanvasContainer()', () => {
    expect(src).toMatch(/getCanvasContainer\(\)\.appendChild/);
  });

  test('bee-map.ts removes the overlay div in _rectFinish', () => {
    expect(src).toMatch(/_rectBox\.remove\(\)/);
  });

  test('bee-map.ts defines .selection-box CSS in static styles', () => {
    expect(src).toMatch(/\.selection-box\s*\{/);
  });

  test('bee-map.ts applies 5px threshold guard before emitting', () => {
    expect(src).toMatch(/dx\s*<\s*5\s*&&\s*dy\s*<\s*5/);
  });
});
```

---

## Shared Patterns

### Custom event emission
**Source:** `src/bee-map.ts` lines 140–144 (`_emit` helper)
**Apply to:** The `selection-drawn` dispatch in `_rectFinish`

```typescript
private _emit<T>(name: string, detail?: T) {
  this.dispatchEvent(new CustomEvent(name, {
    bubbles: true, composed: true, detail,
  }));
}
```

### Document-level listener cleanup in `disconnectedCallback`
**Source:** `src/bee-map.ts` lines 180–189
**Apply to:** Removing `_onRectMouseDown` (canvas, capture), `_onRectMouseMove` (document), `_onRectMouseUp` (document)

The pattern is `document.removeEventListener(name, boundHandler)` — already used for `_onDocumentClick`. The new canvas listener also needs the third argument `true` to match the `addEventListener(..., true)` registration.

### Arrow-function private handler for stable `this` binding
**Source:** `src/bee-map.ts` lines 174 (`_onDocumentClick`), 557 (inline arrow)
**Apply to:** `_onRectMouseDown`, `_onRectMouseMove`, `_onRectMouseUp` — all must be arrow functions so they can be passed to `addEventListener`/`removeEventListener` as stable references:

```typescript
// Pattern: arrow function assigned to class field
private _onDocumentClick = (e: MouseEvent) => { ... };

// New handlers follow the same pattern:
private _onRectMouseDown = (e: MouseEvent) => { ... };
private _onRectMouseMove = (e: MouseEvent) => { ... };
private _onRectMouseUp = (e: MouseEvent) => { ... };
```

### `@state()` field for coordinator-owned reactive state
**Source:** `src/bee-atlas.ts` lines 19–53
**Apply to:** `_selectionBounds` in `bee-atlas.ts` — follows the same `@state() private _fieldName: Type | null = null` pattern.

---

## No Analog Found

None. Both files being modified are already fully present in the codebase and serve as their own analogs.

---

## Metadata

**Analog search scope:** `src/bee-map.ts`, `src/bee-atlas.ts`, `src/tests/bee-atlas.test.ts`
**Files scanned:** 3 (complete reads; all under 2,000 lines except bee-map.ts at ~967 lines)
**Pattern extraction date:** 2026-05-14
