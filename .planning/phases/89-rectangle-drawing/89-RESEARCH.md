# Phase 89: Rectangle Drawing - Research

**Researched:** 2026-05-14
**Domain:** Mapbox GL JS gesture interception, HTML overlay drawing, LitElement custom events
**Confidence:** HIGH

## Summary

Phase 89 adds shift-drag rectangle drawing to the Mapbox map. The user holds shift and drags; a visible rectangle outline tracks the cursor in real time; releasing the drag emits a `selection-drawn` custom event with the bounding box (west, south, east, north) and removes the rectangle. Plain drag (without shift) continues to pan normally.

The implementation is entirely within `bee-map.ts`. The approach is the officially documented Mapbox GL JS pattern: disable `BoxZoomHandler` after map init, attach a `mousedown` listener to the canvas container (capture phase), and use `document`-level `mousemove`/`mouseup` listeners during the gesture. The visual rectangle is an absolutely-positioned `<div>` appended to `map.getCanvasContainer()` and removed on `mouseup`. Coordinate conversion uses `map.unproject()` to convert pixel offsets to `LngLat`, then the emitted event carries `{ west, south, east, north }` in geographic coordinates.

The `selection-drawn` custom event propagates to `bee-atlas`, which will own `_selectionBounds` state (Phase 90 adds the SQLite query; Phase 89 only draws and emits).

**Primary recommendation:** Use the officially documented Mapbox bounding-box pattern (`getCanvasContainer()` overlay div + canvas `mousedown` capture listener + `dragPan.disable()/enable()`) without any third-party library.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Gesture detection (shift+drag) | bee-map (Frontend) | — | bee-map owns all map interaction; it is the pure presenter for map gestures |
| Rectangle visual overlay | bee-map (Frontend) | — | Overlay div lives in the map container which bee-map controls |
| Geographic bounds computation | bee-map (Frontend) | — | Requires `map.unproject()` — only bee-map has access to the Mapbox map instance |
| Selection state ownership | bee-atlas (Frontend Coordinator) | — | CLAUDE.md invariant: bee-atlas owns all reactive state; bee-map emits events |
| Occurrence query on drag release | bee-atlas → SQLite | — | Phase 90 concern; Phase 89 only emits the event with bounds |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mapbox-gl | 3.23.1 (installed: ^3.22.0) | Map instance, gesture handlers, coordinate projection | Already in use across all map interaction |
| lit | ^3.2.1 | LitElement web component, custom events | Project standard for all components |

No new dependencies are needed for this phase. [VERIFIED: package.json]

**Version verification:** `npm view mapbox-gl version` returned `3.23.1`. Installed is `^3.22.0`. [VERIFIED: npm registry]

## Architecture Patterns

### System Architecture Diagram

```
User: shift+mousedown on canvas
         |
         v
canvas.addEventListener('mousedown', handler, true)  [capture phase]
         |
    e.shiftKey && e.button === 0 ?
         |-- NO: return (let dragPan handle it normally)
         |-- YES:
              map.dragPan.disable()
              start = pixel coordinates
              document.addEventListener('mousemove', onMouseMove)
              document.addEventListener('mouseup', onMouseUp)
              |
              v
    User drags cursor (mousemove events on document)
              |
              v
    Create/update <div class="selection-box"> in getCanvasContainer()
    CSS: position:absolute, top:0, left:0, transform:translate(minX,minY)
         width: maxX-minX, height: maxY-minY
    (live rectangle visible)
              |
              v
    User releases mouse (mouseup on document)
              |
              v
    finish():
      - Remove document listeners
      - Remove <div> from DOM
      - map.dragPan.enable()
      - If drag was non-trivial (> ~5px):
          map.unproject([minX, maxY]) -> SW LngLat
          map.unproject([maxX, minY]) -> NE LngLat
          this._emit('selection-drawn', { west, south, east, north })
      - Else: no-op (tiny accidental drag)

bee-atlas receives 'selection-drawn' (Phase 90 wires the SQLite query)
```

### Recommended Project Structure

No new files. All changes are within `src/bee-map.ts`. The rectangle overlay `<div>` is created dynamically and removed on completion — no persistent element.

### Pattern 1: Mapbox Official Bounding-Box Gesture

**What:** Attach mousedown to the canvas container in capture phase. On shift+left-click, disable dragPan and track pixels with document-level listeners. Draw an overlay div. On mouseup, convert pixel bbox to geographic bounds, emit event, clean up.

**When to use:** Any time you need to intercept shift-drag before Mapbox's BoxZoomHandler claims it.

**Example:**
```typescript
// Source: https://docs.mapbox.com/mapbox-gl-js/example/using-box-queryrenderedfeatures/
// Adapted for TypeScript + LitElement context

// --- In firstUpdated(), after this._map is created ---

// 1. Disable the default shift-drag box zoom so our handler gets the gesture
this._map.boxZoom.disable();

// 2. Attach mousedown in capture phase to intercept before other handlers
const canvas = this._map.getCanvasContainer();
canvas.addEventListener('mousedown', this._onRectMouseDown, true);

// --- Handlers ---

private _rectStart: mapboxgl.Point | null = null;
private _rectBox: HTMLDivElement | null = null;

private _onRectMouseDown = (e: MouseEvent) => {
  if (!(e.shiftKey && e.button === 0)) return;
  this._map!.dragPan.disable();
  document.addEventListener('mousemove', this._onRectMouseMove);
  document.addEventListener('mouseup', this._onRectMouseUp);
  this._rectStart = this._mousePos(e);
};

private _onRectMouseMove = (e: MouseEvent) => {
  const current = this._mousePos(e);
  if (!this._rectBox) {
    this._rectBox = document.createElement('div');
    this._rectBox.className = 'selection-box';
    this._map!.getCanvasContainer().appendChild(this._rectBox);
  }
  const minX = Math.min(this._rectStart!.x, current.x);
  const maxX = Math.max(this._rectStart!.x, current.x);
  const minY = Math.min(this._rectStart!.y, current.y);
  const maxY = Math.max(this._rectStart!.y, current.y);
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

  if (!this._rectStart) return;
  const end = this._mousePos(e);
  const dx = Math.abs(end.x - this._rectStart.x);
  const dy = Math.abs(end.y - this._rectStart.y);
  if (dx < 5 && dy < 5) { this._rectStart = null; return; } // accidental click

  const minX = Math.min(this._rectStart.x, end.x);
  const maxX = Math.max(this._rectStart.x, end.x);
  const minY = Math.min(this._rectStart.y, end.y);
  const maxY = Math.max(this._rectStart.y, end.y);

  // SW corner is (minX, maxY), NE corner is (maxX, minY) — Y axis is inverted
  const sw = this._map!.unproject([minX, maxY]);
  const ne = this._map!.unproject([maxX, minY]);
  this._emit('selection-drawn', {
    west: sw.lng, south: sw.lat, east: ne.lng, north: ne.lat,
  });
  this._rectStart = null;
};

private _mousePos(e: MouseEvent): mapboxgl.Point {
  const canvas = this._map!.getCanvasContainer();
  const rect = canvas.getBoundingClientRect();
  return new mapboxgl.Point(
    e.clientX - rect.left - canvas.clientLeft,
    e.clientY - rect.top - canvas.clientTop,
  );
}
```

**CSS (in BeeMap static styles):**
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

### Pattern 2: Coordinate Conversion — Y-Axis Inversion

**What:** In screen coordinates, Y increases downward. In geographic coordinates, latitude increases northward. This means:
- SW corner = `map.unproject([minX, maxY])` — leftmost, bottommost in screen = westernmost, southernmost geographic
- NE corner = `map.unproject([maxX, minY])` — rightmost, topmost in screen = easternmost, northernmost geographic

**When to use:** Any time converting a screen pixel bounding box to geographic bounding box. [VERIFIED: mapboxgl.Map.prototype.unproject signature in mapbox-gl.d.ts]

### Pattern 3: Cleanup in disconnectedCallback

The canvas `mousedown` listener must be removed in `disconnectedCallback()` to prevent leaks:
```typescript
disconnectedCallback() {
  const canvas = this._map?.getCanvasContainer();
  canvas?.removeEventListener('mousedown', this._onRectMouseDown, true);
  document.removeEventListener('mousemove', this._onRectMouseMove);
  document.removeEventListener('mouseup', this._onRectMouseUp);
  // ... existing cleanup
}
```

### Pattern 4: Shadow DOM — getCanvasContainer() Is Inside Shadow Root

`bee-map` is a LitElement with shadow DOM. The Mapbox map is initialized in `this.mapElement` (the `#map` div inside the shadow root). `map.getCanvasContainer()` returns the `mapboxgl-canvas-container` element that Mapbox creates inside `this.mapElement` — this is within the shadow root. Appending the overlay `<div>` to it is safe: the element lives in the same shadow tree as the map, so LitElement's shadow CSS will apply (add `.selection-box` to `static styles`). [VERIFIED: mapbox-gl.d.ts getCanvasContainer() docs + bee-map.ts firstUpdated() uses this.mapElement as container]

### Anti-Patterns to Avoid

- **Attaching mousemove/mouseup to the canvas only:** The mouse can leave the canvas during a fast drag. Use `document` for move/up listeners — same as the official example.
- **Attaching mousedown without capture=true:** Without the third argument `true`, Mapbox's built-in handlers may process the event first. Use capture phase to intercept first.
- **Forgetting to call `map.dragPan.enable()` in cleanup:** If the user opens another window or focus is lost mid-drag, `mouseup` may never fire on `document`. Consider also handling `blur` or `visibilitychange` to call `_rectFinish()` defensively.
- **Not calling `map.boxZoom.disable()` before setting up the listener:** Without this, Mapbox will handle the shift+drag gesture independently and may fight the custom handler.
- **Removing `box-zoom` in Map constructor options as a permanent alternative:** The approach of setting `boxZoom: false` in `new mapboxgl.Map({...})` also works and avoids ever needing `map.boxZoom.disable()`. Either approach is valid; `disable()` after construction is more explicit and reversible.
- **Dispatching `selection-drawn` for tiny accidental drags:** A threshold of ~5px prevents single shift-clicks from emitting phantom selections.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Converting pixel→geographic bbox | Custom trig/projection | `map.unproject([x, y])` | Mapbox handles all projections, zoom levels, tilts correctly |
| Rectangle visual rendering | SVG/canvas drawing | Absolutely-positioned `<div>` | The official Mapbox pattern — simpler, no compositing issues |
| Gesture theft from Mapbox internals | Monkey-patching handlers | `boxZoom.disable()` + canvas capture listener | Supported public API; monkey-patching breaks on Mapbox upgrades |

**Key insight:** The Mapbox documentation provides an exact worked example for this use case (`using-box-queryrenderedfeatures`). There is no need to invent a different approach.

## Common Pitfalls

### Pitfall 1: dragPan Not Re-Enabled After Abort
**What goes wrong:** If the user alt-tabs or the page loses focus mid-drag, `mouseup` on `document` never fires, leaving `dragPan` disabled. The map becomes un-pannable.
**Why it happens:** `document.addEventListener('mouseup')` requires the mouse button to be released while the document has focus.
**How to avoid:** Add a `mouseup` listener to `window` (fires even on some focus-loss scenarios) or listen to `window.addEventListener('blur', this._rectFinish)`.
**Warning signs:** Map stops panning after an interrupted shift-drag.

### Pitfall 2: Shift-Click on a Cluster/Point Triggers Both Rectangle and Click Handler
**What goes wrong:** A shift+click (no drag) could trigger both `_onRectMouseDown` and the existing `addInteraction` click handlers.
**Why it happens:** Mousedown fires before click. The capture-phase mousedown starts the rectangle gesture; if the user releases immediately without dragging, no `selection-drawn` is emitted (5px threshold handles this), but the map's click chain may still see the shift modifier.
**How to avoid:** The existing `_handleRegionClick` already reads `shiftKey` from the event for multi-select. The threshold guard in `_rectFinish` ensures no `selection-drawn` is emitted for a tap. The existing click path is unaffected because rectangle gesture only emits `selection-drawn` when drag distance exceeds threshold.
**Warning signs:** Shift-clicking a county with boundaries visible simultaneously opens a selection sidebar — inspect event propagation.

### Pitfall 3: CSS for `.selection-box` Not Visible Inside Shadow DOM
**What goes wrong:** The overlay div is created dynamically and appended to `getCanvasContainer()` (inside shadow root). If `.selection-box` styles are not in `BeeMap.static styles`, the div will be invisible.
**Why it happens:** Shadow DOM CSS encapsulation — styles from the outer document don't pierce in.
**How to avoid:** Add `.selection-box` CSS to `BeeMap.static styles` (the `css\`` tagged template). Do NOT add the styles inline via `style` attribute — keep styles declarative.
**Warning signs:** Rectangle div is in the DOM (inspectable via dev tools) but invisible.

### Pitfall 4: `mousePos()` Coordinates Wrong When Map Is Inside Nested Container
**What goes wrong:** `e.clientX - rect.left` is wrong if there are nested scrolling containers between the viewport and the canvas.
**Why it happens:** `getBoundingClientRect()` returns coordinates relative to the viewport, so this should be correct. But if `canvas.clientLeft` is nonzero (border), it must be subtracted.
**How to avoid:** Use the exact formula from the official example: `e.clientX - rect.left - canvas.clientLeft`. Already included in the pattern above.
**Warning signs:** Rectangle appears offset from where the user is dragging.

### Pitfall 5: `_clickConsumed` Flag Interaction
**What goes wrong:** The existing `_clickConsumed` flag guards the `map-click-empty` fallback. A shift-drag that doesn't produce a selection (below threshold) followed by mouseup might leave `_clickConsumed = false`, causing `map-click-empty` to fire and clearing the selection.
**Why it happens:** After a sub-threshold shift-drag, `mouseup` fires and then Mapbox may fire a `click` event. Since `_clickConsumed = false`, `map-click-empty` fires.
**How to avoid:** Set `_clickConsumed = true` in `_onRectMouseDown` when shift is held, and only clear it at the next `mousedown` (already done by the existing `this._map.on('mousedown', () => { this._clickConsumed = false; })`). Alternatively, accept that shift-click-without-drag clears selection (it is a reasonable UX behavior — the user shift-clicked empty space).
**Warning signs:** Shift-dragging a sub-5px gesture then seeing the sidebar close unexpectedly.

## Code Examples

### Verified: boxZoom and dragPan API
```typescript
// Source: mapbox-gl/dist/mapbox-gl.d.ts line 19213
boxZoom: BoxZoomHandler;  // BoxZoomHandler.disable() / .enable()
dragPan: DragPanHandler;  // DragPanHandler.disable() / .enable()
```

### Verified: unproject API
```typescript
// Source: mapbox-gl/dist/mapbox-gl.d.ts
// Converts pixel coordinates to LngLat
map.unproject([x, y]): mapboxgl.LngLat
// Returns { lng: number, lat: number }
```

### Verified: getCanvasContainer API
```typescript
// Source: mapbox-gl/dist/mapbox-gl.d.ts line 19317
getCanvasContainer(): HTMLElement;
// Returns the container of the map's <canvas>.
// Linked example: "Highlight features within a bounding box"
```

### Verified: mapboxgl.Point constructor
```typescript
// Source: mapbox-gl exports — used in official example for mousePos()
new mapboxgl.Point(x: number, y: number)
```

### Verified: Selection-Drawn Event Convention
The `selection-drawn` event should follow the existing `_emit()` helper pattern in bee-map.ts:
```typescript
this._emit('selection-drawn', {
  west: sw.lng, south: sw.lat, east: ne.lng, north: ne.lat,
});
```
`bee-atlas.ts` will listen via `@selection-drawn=${this._onSelectionDrawn}` in its template.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OpenLayers map (Phase 70 and prior) | Mapbox GL JS (Phase 71+) | v3.0 (2026-04-27) | Different event API; OL vector layers gone; Mapbox sources/layers |
| mapbox-gl-draw for selection | Vanilla Mapbox events | This phase | No additional library needed — official pattern is sufficient |

**No deprecated patterns relevant to this phase.**

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Setting `_clickConsumed = true` in `_onRectMouseDown` prevents `map-click-empty` from firing after a sub-threshold shift-drag | Common Pitfalls 5 | Sub-threshold shift-drags unexpectedly clear sidebar; easy to fix in execution |
| A2 | `getCanvasContainer()` returns an element inside the shadow root (child of `this.mapElement`) so the overlay div is within the same shadow tree | Architecture Patterns 4 | If wrong, CSS from `static styles` won't reach the div and rectangle will be invisible |

## Open Questions (RESOLVED)

1. **Should shift-drag be blocked when a cluster or point is under the cursor?**
   - What we know: The capture-phase `mousedown` fires before `addInteraction` click handlers. If a user shift-clicks a cluster, both the rectangle gesture (starts, threshold guard fires, no emit) and the cluster click handler may fire.
   - What's unclear: Whether the cluster click fires when `shiftKey` is held — `addInteraction` handlers receive the full event including `shiftKey`. Currently `_handleClusterClick` doesn't check `shiftKey`.
   - RESOLVED: Accept that shift-clicking a cluster starts a rectangle attempt (sub-threshold) and also triggers the cluster click. This is unlikely to be disruptive. If it is, add `if (e.shiftKey) return;` at the top of cluster/point interaction handlers.

## Environment Availability

Step 2.6: SKIPPED — no external dependencies beyond the already-installed `mapbox-gl` package.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.2 |
| Config file | vitest.config.ts (inferred from passing test run) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEL-01 | `bee-map.ts` disables BoxZoomHandler, attaches canvas mousedown listener, emits `selection-drawn` | unit (static grep) | `npm test` | ❌ Wave 0 |
| SEL-01 | Plain drag (no shift) does not trigger rectangle gesture | unit (static grep) | `npm test` | ❌ Wave 0 |
| SEL-02 | Rectangle div appended to canvasContainer during mousemove, removed on mouseup | unit (static grep) | `npm test` | ❌ Wave 0 |

All three tests follow the project's established static-grep pattern (read source, assert regex matches). No DOM simulation is needed or appropriate for this pattern.

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Add `SEL-01` and `SEL-02` test describe block in `src/tests/bee-atlas.test.ts` (or a new `bee-map.test.ts`)
- [ ] Tests assert: `bee-map.ts` contains `boxZoom.disable()`, canvas mousedown listener with capture=true, `selection-drawn` event emission, `dragPan.disable()`, `dragPan.enable()`
- [ ] Tests assert: `bee-map.ts` contains `.selection-box` CSS class, removes the overlay div in mouseup handler

## Security Domain

This phase introduces no new authentication, session management, access control, cryptography, or external data ingestion. No ASVS categories apply. Security enforcement is not relevant to this UI-only gesture feature.

## Sources

### Primary (HIGH confidence)
- [mapbox-gl/dist/mapbox-gl.d.ts] — TypeScript declarations for `BoxZoomHandler`, `DragPanHandler`, `getCanvasContainer()`, `unproject()`, `boxZoom`, `dragPan` properties on Map [VERIFIED: local file]
- [docs.mapbox.com/mapbox-gl-js/example/using-box-queryrenderedfeatures/] — Official Mapbox example implementing shift-drag rectangle selection with canvas capture listener, overlay div, dragPan disable/enable pattern [CITED: docs.mapbox.com]
- [docs.mapbox.com/mapbox-gl-js/api/map/#map#boxzoom] — `map.boxZoom` property, `BoxZoomHandler.disable()` API [CITED: docs.mapbox.com]
- [bee-map.ts] — Current implementation: existing mousedown/click interaction chain, `_clickConsumed` flag, shadow DOM structure, `_emit()` helper [VERIFIED: local file]
- [bee-atlas.ts] — State ownership patterns, `selection-drawn` will be wired to `_onSelectionDrawn` [VERIFIED: local file]

### Secondary (MEDIUM confidence)
- [docs.mapbox.com/mapbox-gl-js/example/drag-a-point/] — Confirms `map.on('mousedown')` + `e.preventDefault()` pattern for overriding default drag behavior [CITED: docs.mapbox.com]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — mapbox-gl already installed, TypeScript declarations verified locally
- Architecture (overlay div pattern): HIGH — matches official Mapbox example exactly
- Shadow DOM overlay behavior: MEDIUM — assumed getCanvasContainer() is inside shadow root based on how bee-map.ts initializes the map inside this.mapElement
- Pitfalls: HIGH — dragPan re-enable and CSS scoping are well-known patterns; click-consumed interaction is ASSUMED

**Research date:** 2026-05-14
**Valid until:** 2026-06-14 (Mapbox API is stable; 30-day window appropriate)
