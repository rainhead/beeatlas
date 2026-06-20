# Phase 152: GeolocateControl + Location State - Pattern Map

**Mapped:** 2026-06-20
**Files analyzed:** 4 (2 modified, 1 created, 1 test-mock update)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/bee-map.ts` | component / map controller | event-driven (emit upward) | self — existing `_emit()` call sites (lines 267, 310, 524, 593, 810, 830, 842, 857) | exact |
| `src/bee-atlas.ts` | coordinator / state owner | event-driven (receive + render state) | self — existing `_updateAvailable` banner (lines 110-117, 361-374) and `<bee-map>` binding block (lines 301-321) | exact |
| `src/tests/geolocation.test.ts` | test — source-analysis | read-only file assertion | `src/tests/bee-map.test.ts` — existing source-analysis tests for structural invariants | exact |
| `src/tests/bee-atlas.test.ts` + `src/tests/cache-state.test.ts` | test — mock update | vi.mock factory extension | self — existing `vi.mock('mapbox-gl', ...)` block (lines 30-62 in both files) | exact |

---

## Pattern Assignments

### `src/bee-map.ts` — add GeolocateControl + wire events

**Analog:** self (`src/bee-map.ts` existing patterns)

**Insertion point** (`firstUpdated`, after `new mapboxgl.Map({...})`):

`src/bee-map.ts` lines 382-389 show the map construction block where the new control is added:
```typescript
// lines 382-389 (existing — new control goes immediately after this block)
this._map = new mapboxgl.Map({
  container: this.mapElement,
  style: 'mapbox://styles/mapbox/outdoors-v12',
  center: [this.viewState?.lon ?? DEFAULT_LON, this.viewState?.lat ?? DEFAULT_LAT],
  zoom: this.viewState?.zoom ?? DEFAULT_ZOOM,
  attributionControl: true,
});

// NEW: GeolocateControl goes here, before this._map.boxZoom.disable()
```

**`_emit()` helper pattern** (`src/bee-map.ts` lines 164-168 — the exact function to reuse):
```typescript
private _emit<T>(name: string, detail?: T) {
  this.dispatchEvent(new CustomEvent(name, {
    bubbles: true, composed: true, detail,
  }));
}
```

**Existing `_emit()` call pattern** (lines 524-525 — model for `user-location-changed`):
```typescript
// view-moved call site — same shape to follow:
this._emit('view-moved', { lon: center.lng, lat: center.lat, zoom });
// boundary-mode-changed call site (line 310) — typed generic:
this._emit<'off' | 'counties' | 'ecoregions' | 'places'>('boundary-mode-changed', mode);
```

**New code to add** (copy `_emit` call shape exactly):
```typescript
const geolocate = new mapboxgl.GeolocateControl({
  trackUserLocation: true,
  positionOptions: { enableHighAccuracy: true },
  showAccuracyCircle: true,
});
this._map.addControl(geolocate);

geolocate.on('geolocate', (e: { coords: GeolocationCoordinates; timestamp: number }) => {
  this._emit('user-location-changed', {
    lat: e.coords.latitude,
    lon: e.coords.longitude,
    accuracy: e.coords.accuracy,
  });
});
geolocate.on('error', (e: { code: number; message: string }) => {
  this._emit('user-location-changed', { error: { code: e.code, message: e.message } });
});

// D-03: auto-trigger only if permission already granted
if (navigator.permissions) {
  navigator.permissions
    .query({ name: 'geolocation' as PermissionName })
    .then(status => { if (status.state === 'granted') geolocate.trigger(); })
    .catch(() => {});
}
```

**Pure-presenter constraint (source-analysis test will guard this):** `<bee-map>` MUST NOT have `@state _userLocation`. No `@state` declarations for location data. `geolocate` may be stored as `this._geolocateControl` (instance field, not `@state`) for potential teardown use.

---

### `src/bee-atlas.ts` — add `@state _userLocation`, `@state _locationError`, handler, binding, banner

**Analog:** self (`src/bee-atlas.ts` existing patterns)

**`@state` declaration pattern** (`src/bee-atlas.ts` lines 110-117 — copy this shape):
```typescript
// Existing banner/offline state declarations — new fields follow the same pattern:
@state() private _offline: boolean = !navigator.onLine;
@state() private _cacheState: { ... } | null = null;
@state() private _updateAvailable: boolean = false;

// NEW (same pattern):
@state() private _userLocation: { lat: number; lon: number; accuracy: number } | null = null;
@state() private _locationError: boolean = false;
```

**`<bee-map>` binding block** (`src/bee-atlas.ts` lines 301-322 — add `@user-location-changed` alongside existing event bindings):
```typescript
// Existing bindings (lines 313-321) — new binding inserts after @selection-drawn:
@view-moved=${this._onViewMoved}
@map-click-occurrence=${this._onOccurrenceClick}
@map-click-region=${this._onRegionClick}
@map-click-empty=${this._onMapClickEmpty}
@data-loaded=${this._onDataLoaded}
@data-error=${this._onDataError}
@boundary-mode-changed=${this._onBoundaryModeChanged}
@place-selected=${this._onPlaceSelected}
@selection-drawn=${this._onSelectionDrawn}
// NEW:
@user-location-changed=${this._onUserLocationChanged}
```

**Banner pattern** (`src/bee-atlas.ts` lines 361-374 — `_updateAvailable` banner is the exact template to copy):
```typescript
// Existing update-banner (lines 361-374):
${this._updateAvailable ? html`
  <div class="update-banner" role="status" aria-live="polite">
    <button
      class="update-banner__body"
      @click=${this._onBannerTap}
      aria-label="A data update is available, tap to reload"
    >A data update is available — tap to reload</button>
    <button
      class="update-banner__dismiss"
      @click=${this._onBannerDismiss}
      aria-label="Dismiss update for this session"
    >✕</button>
  </div>
` : ''}

// NEW location-error-banner — copy structure, swap role="alert" for role="status":
${this._locationError ? html`
  <div class="location-error-banner" role="alert" aria-live="polite">
    <span class="location-error-banner__body">
      Location access is blocked. To enable, go to Settings → Safari → Location.
    </span>
    <button
      class="location-error-banner__dismiss"
      @click=${() => { this._locationError = false; }}
      aria-label="Dismiss location error"
    >✕</button>
  </div>
` : ''}
```

**Handler shape** (model on `_onBannerDismiss` / any existing handler that sets a single `@state` boolean):
```typescript
private _onUserLocationChanged(e: CustomEvent<{ lat: number; lon: number; accuracy: number } | { error: { code: number; message: string } }>) {
  if ('error' in e.detail) {
    this._locationError = true;
    this._userLocation = null;  // clear stale position on revocation
  } else {
    this._userLocation = e.detail;
    this._locationError = false;
  }
}
```

---

### `src/tests/geolocation.test.ts` (CREATE)

**Analog:** `src/tests/bee-map.test.ts` — entire file is the template

**File header pattern** (`bee-map.test.ts` lines 1-7 — copy verbatim, change filename):
```typescript
import { test, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
```

**Source-analysis test idiom** (`bee-map.test.ts` lines 9-26, 103-137 — these are the exact structural guards to replicate):
```typescript
// Positive assertion (thing IS present):
test('bee-map.ts declares hiddenSources @property (checklist standard path)', () => {
  expect(src).toMatch(/@property[\s\S]{0,50}hiddenSources/);
});

// Negative assertion (thing is NOT present — critical for pure-presenter invariant):
test('bee-map.ts DOES NOT declare _offline @state (state owned by bee-atlas, OFF-04)', () => {
  expect(src).not.toMatch(/@state[\s\S]{0,20}_offline/);
  expect(src).not.toMatch(/private\s+_offline/);
});
```

**Tests to write** (four source-analysis assertions, no DOM mount):

Load two source strings — `bee-map.ts` and `bee-atlas.ts`:
```typescript
const beeMapSrc = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
const beeAtlasSrc = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
```

Then four tests (copy guard shape from `bee-map.test.ts` lines 133-136 for the negative, lines 23-25 for the positive):
1. `beeMapSrc` does NOT match `/@state[\s\S]{0,20}_userLocation/` (guards pure-presenter invariant)
2. `beeMapSrc` does NOT match `/private\s+_userLocation/`
3. `beeMapSrc` matches `/user-location-changed/` (control emits the event)
4. `beeAtlasSrc` matches `/@state[\s\S]{0,20}_userLocation/` (state lives on coordinator)
5. `beeAtlasSrc` matches `/@user-location-changed/` (binding in render())

---

### `src/tests/bee-atlas.test.ts` + `src/tests/cache-state.test.ts` — extend `vi.mock('mapbox-gl', ...)`

**Analog:** self — both files have identical `vi.mock('mapbox-gl', ...)` blocks

**Existing mock** (`bee-atlas.test.ts` lines 30-62, identical in `cache-state.test.ts` lines 25-56):
```typescript
vi.mock('mapbox-gl', () => {
  const MapMock = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    remove: vi.fn(),
    getCenter: vi.fn(() => ({ lng: -120.5, lat: 47.5 })),
    getZoom: vi.fn(() => 7),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getSource: vi.fn(() => ({
      setData: vi.fn(),
      getClusterLeaves: vi.fn((_clusterId: number, _limit: number, _offset: number, cb: Function) => {
        cb(null, []);
      }),
    })),
    setFilter: vi.fn(),
    isStyleLoaded: vi.fn(() => true),
    jumpTo: vi.fn(),
    flyTo: vi.fn(),
    resize: vi.fn(),
    addInteraction: vi.fn(),
    setLayoutProperty: vi.fn(),
    setFeatureState: vi.fn(),
    removeFeatureState: vi.fn(),
    querySourceFeatures: vi.fn(() => []),
  }));
  return {
    default: {
      accessToken: '',
      Map: MapMock,
      // ADD HERE:
    },
  };
});
```

**What to add** — `GeolocateControl` stub inside the `default: { ... }` return object, alongside `Map`:
```typescript
GeolocateControl: vi.fn().mockImplementation(() => ({
  on: vi.fn(),
  trigger: vi.fn(() => true),
})),
```

The `MapMock` instance also needs `addControl: vi.fn()` added to its implementation object (currently absent — `bee-map.ts:firstUpdated` calls `this._map.addControl(geolocate)`).

---

## Shared Patterns

### Composed CustomEvent relay (`_emit`)
**Source:** `src/bee-map.ts` lines 164-168
**Apply to:** new `user-location-changed` emission in `bee-map.ts`
```typescript
private _emit<T>(name: string, detail?: T) {
  this.dispatchEvent(new CustomEvent(name, {
    bubbles: true, composed: true, detail,
  }));
}
```

### App-level conditional banner
**Source:** `src/bee-atlas.ts` lines 361-374 (`_updateAvailable` banner)
**Apply to:** new `_locationError` banner in `bee-atlas.ts` render()

The pattern: `${this._booleanState ? html\`<div ...>...</div>\` : ''}` placed after the main content block, before the closing `</div>` or template end.

### Source-analysis test structure
**Source:** `src/tests/bee-map.test.ts` lines 1-7 (header), 133-136 (negative `@state` guard), 23-25 (positive `@property` guard)
**Apply to:** `src/tests/geolocation.test.ts` (new file)

Key pattern: load source with `readFileSync` at module scope; write `expect(src).not.toMatch(regex)` for invariants that must NOT exist; `expect(src).toMatch(regex)` for things that MUST exist. No DOM, no imports of the component under test.

---

## No Analog Found

None — all four files have exact or near-exact analogs in the codebase.

---

## Metadata

**Analog search scope:** `src/bee-map.ts`, `src/bee-atlas.ts`, `src/tests/bee-map.test.ts`, `src/tests/bee-atlas.test.ts`, `src/tests/cache-state.test.ts`
**Files scanned:** 5
**Pattern extraction date:** 2026-06-20
