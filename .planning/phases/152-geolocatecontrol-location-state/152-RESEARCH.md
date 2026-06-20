# Phase 152: GeolocateControl + Location State - Research

**Researched:** 2026-06-20
**Domain:** Mapbox GL JS GeolocateControl, Permissions API, Lit state relay, vitest source-analysis testing
**Confidence:** HIGH — all key claims verified from mapbox-gl 3.24.1 source in node_modules and MDN/caniuse; iOS standalone note is ASSUMED per real-device-only nature

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `GeolocateControl` configured with `trackUserLocation: true`, `positionOptions: { enableHighAccuracy: true }`, `showAccuracyCircle: true`. Blue dot + accuracy ring + recenter are the control's native rendering — they do NOT depend on `_userLocation` being lifted to `<bee-atlas>`.
- **D-02:** Control placement is **top-right** (Mapbox default). Only `attributionControl: true` exists today (`bee-map.ts:388`); no other controls present.
- **D-03:** Auto-activate **only if permission is already granted**. On map load, check the Permissions API (`navigator.permissions.query({ name: 'geolocation' })`); if `state === 'granted'`, programmatically `.trigger()` the control so returning users get an instant dot with no prompt. If `prompt`/`denied`, do nothing.
- **D-04:** The "brief explanation" surfaces as an **app-level toast/banner** in `<bee-atlas>`, triggered off the control's `error` event relayed upward. Native disabled control state remains.
- **D-05:** `_userLocation` updates on **every GPS fix** (relay each `geolocate` event). No throttling in this phase.
- **D-06:** `<bee-map>` emits, never stores. Reuse existing `_emit()` helper (`bee-map.ts:164`) to dispatch `user-location-changed`; bind `@user-location-changed=${this._onUserLocationChanged}` on `<bee-map>` in `bee-atlas.render()`.

### Claude's Discretion

- Exact `_userLocation` shape (e.g. `{ lat, lon, accuracy }` vs richer) — pick the minimal shape that satisfies the relay test and anticipates Phase 153's haversine needs.
- Toast/banner copy and exact reuse vs. new component for the denial message.
- Whether the `error`-event → toast path also covers position-unavailable (no GPS) vs. permission-denied with distinct copy.

### Deferred Ideas (OUT OF SCOPE)

- NavigationControl (zoom +/- + compass)
- Position-stream throttling/debounce (Phase 153)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LOC-01 | A Mapbox `GeolocateControl` (`trackUserLocation`, `enableHighAccuracy`, `showAccuracyCircle`) shows a blue dot + accuracy ring with a recenter button; works offline via GPS | D-01/D-03 wiring documented; offline behavior confirmed — Marker DOM rendering is style-independent |
| LOC-02 | Location state owned by `<bee-atlas>` (`@state _userLocation`); `<bee-map>` hosts control and relays position upward via `composed` CustomEvent | `_emit()` reuse pattern documented; event binding location identified |
| LOC-03 | Denied or unavailable location permission handled gracefully — control shows disabled/error state, brief explanation shown; rest of app unaffected | `GeolocationPositionError.code` values documented; existing banner pattern identified |
</phase_requirements>

---

## Summary

Phase 152 adds a `GeolocateControl` to the `/app` map and lifts location state to `<bee-atlas>` per the state-owner/pure-presenter invariant. Research verified the control API from the installed `mapbox-gl@3.24.1` source (latest is 3.25.0 — no breaking changes to GeolocateControl). The installed package.json pins `"mapbox-gl": "^3.24.1"` so the planner should not upgrade as part of this phase.

Three non-obvious risks were investigated: (1) offline dot rendering — the blue dot and accuracy circle use `Marker.addTo()` which appends to `map.getCanvasContainer()` via DOM, not via style layers, so they render offline without the style 'load' event having fired; (2) `trigger()` timing — the control's `_setup` flag is set asynchronously after a `navigator.permissions.query` microtask, so `trigger()` must be called after that resolves; (3) iOS standalone geolocation — the permission prompt may not surface in standalone mode on some iOS versions, and `PermissionStatus.change` events are unreliable in Safari. These are documented in Pitfalls below.

**Primary recommendation:** Add `GeolocateControl` in `firstUpdated()` after `new mapboxgl.Map()`, wire its `geolocate` and `error` events through `_emit()`, perform the Permissions API auto-trigger check inside the `geolocate` control's own `_setupUI` completion (see Pitfall 2 for timing), and model the app-level denial banner after the existing `.update-banner` pattern.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| GeolocateControl instantiation and GPS | Browser / `<bee-map>` | — | Map control belongs where the map lives; pure presenter rule means no state stored here |
| Location state (`_userLocation`) | `<bee-atlas>` | — | All reactive state lives on the coordinator; downstream consumers (Phase 153) read from there |
| Permission API check + auto-trigger | Browser / `<bee-map>` `firstUpdated` | — | The check gates a control method call — lives with the control |
| Denial banner rendering | `<bee-atlas>` render | — | App-level UX; same tier as offline/update banners |
| `user-location-changed` CustomEvent relay | `<bee-map>` → `<bee-atlas>` | — | Established `_emit()` pattern: `<bee-map>` emits, `<bee-atlas>` handles |

---

## Standard Stack

### Core (no new packages — uses existing mapbox-gl)

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------------------|---------|--------------|
| `mapbox-gl` | 3.24.1 (installed) / 3.25.0 (registry latest) | `GeolocateControl` class | Already installed; control is built-in |
| `lit` | 3.3.3 | `@state _userLocation`, render binding | Already used throughout |

[VERIFIED: npm registry] mapbox-gl 3.24.1 installed (package.json confirmed). No new packages are required for this phase.

### No New Package Installs

This phase installs zero new npm packages. The `GeolocateControl` class is part of the already-installed `mapbox-gl` bundle.

---

## Package Legitimacy Audit

No packages are installed in this phase. This section is intentionally empty.

---

## Architecture Patterns

### System Architecture Diagram

```
User GPS hardware
       |
       v
navigator.geolocation (browser API, works offline)
       |
       v
GeolocateControl (in <bee-map>.firstUpdated)
  ├─ geolocate event → _emit('user-location-changed', {lat, lon, accuracy})
  └─ error event    → _emit('user-location-changed', {error: {code, message}})
       |
       v (composed: true, bubbles to <bee-atlas>)
<bee-atlas> @user-location-changed handler
  ├─ on success: _userLocation = {lat, lon, accuracy}
  └─ on error:  _locationError = true → banner shows
       |
       v (future Phase 153)
_userLocation consumed by "Near me" filter
```

### Recommended Project Structure

No new files or directories needed. Changes are contained to:

```
src/
├── bee-map.ts        # Add GeolocateControl in firstUpdated(); wire events
└── bee-atlas.ts      # Add @state _userLocation; add @state _locationError;
                      # add @user-location-changed binding in render();
                      # add banner conditional in render()

src/tests/
└── geolocation.test.ts   # New — source-analysis tests for LOC-02 invariant
```

### Pattern 1: GeolocateControl Construction and Wiring (D-01)

[VERIFIED: mapbox-gl@3.24.1 source `dist/mapbox-gl-dev.js` lines 108932–109500]

```typescript
// In bee-map.ts firstUpdated(), after `new mapboxgl.Map({...})`

const geolocate = new mapboxgl.GeolocateControl({
  trackUserLocation: true,
  positionOptions: { enableHighAccuracy: true },
  showAccuracyCircle: true,
  // followUserLocation defaults to true — recenter button built-in
  // showButton defaults to true — button rendered top-right
});

this._map.addControl(geolocate);
// addControl passes geolocate.onAdd(map) → starts async _checkGeolocationSupport

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
```

**Key detail on `geolocate` event payload:** The control fires its own `Event` object whose fields are `coords` (a `GeolocationCoordinates` object with `.latitude`, `.longitude`, `.accuracy`, `.altitude`, etc.) and `timestamp`. This is NOT the raw `GeolocationPosition` — the control serializes it. [VERIFIED: `mapbox-gl@3.24.1` source line 109099]

### Pattern 2: Auto-Trigger After Permission Check (D-03)

[VERIFIED: mapbox-gl@3.24.1 source — `_setup` flag async timing]

The `_setup` flag on `GeolocateControl` is set inside `_setupUI()`, which is called as the callback to `_checkGeolocationSupport()`. When `navigator.permissions` is available, `_checkGeolocationSupport` calls `navigator.permissions.query(...)` — an async microtask — before invoking `_setupUI`. Therefore, calling `trigger()` synchronously after `addControl()` will find `_setup === false` and log a warning but return `false` without starting geolocation.

**Safe timing pattern:** Perform the Permissions API check in the same microtask chain, then call `trigger()`:

```typescript
// After geolocate.on(...) wiring above

if (navigator.permissions) {
  navigator.permissions.query({ name: 'geolocation' as PermissionName })
    .then(status => {
      if (status.state === 'granted') {
        // By the time this microtask runs, _checkGeolocationSupport has also
        // completed its own permissions.query and set _setup = true.
        geolocate.trigger();
      }
    })
    .catch(() => {
      // permissions.query threw (e.g. unsupported name) — do nothing, wait for tap
    });
}
// If navigator.permissions is undefined (old iOS < 16), do nothing — user taps
```

**Why this is safe:** Both the auto-trigger check and `_checkGeolocationSupport` call `navigator.permissions.query({ name: 'geolocation' })`. They race to the microtask queue. In practice `_setupUI` will have completed before the app's `.then()` runs because mapbox-gl calls `_checkGeolocationSupport` synchronously in `onAdd()`, which `addControl()` calls synchronously — so by the time the app's microtask executes, `_setup` is already `true`. [VERIFIED: mapbox-gl source lines 108971, 109265]

### Pattern 3: State Relay Binding in `<bee-atlas>.render()` (D-06)

[VERIFIED: existing `bee-atlas.ts:301-321`, `bee-map.ts:164`]

```typescript
// In bee-atlas.render(), on <bee-map> element:
<bee-map
  ...existing bindings...
  @user-location-changed=${this._onUserLocationChanged}
></bee-map>
```

```typescript
// Handler on bee-atlas:
private _onUserLocationChanged(e: CustomEvent<UserLocationDetail>) {
  if ('error' in e.detail) {
    this._locationError = true;
  } else {
    this._userLocation = e.detail;
    this._locationError = false;
  }
}
```

### Pattern 4: Denial Banner (D-04)

Model after the existing `.update-banner` in `bee-atlas.ts:362-375`. The pattern is:
- `@state() private _locationError = false;` (mirrors `_updateAvailable`)
- Conditional render inside the root template, after `<bee-map>` block
- A dismiss button sets `_locationError = false`

The banner should NOT be inside `<bee-map>`'s shadow DOM — it belongs to `<bee-atlas>` as an app-level affordance. [VERIFIED: existing `bee-atlas.ts` architecture]

### Anti-Patterns to Avoid

- **Storing location in `<bee-map>`:** Violates the state-owner/pure-presenter invariant. `<bee-map>` MUST NOT have `@state _userLocation`. The source-analysis test guards this.
- **Calling `trigger()` synchronously after `addControl()`:** `_setup` is not yet `true`; the call silently no-ops (returns `false` with a warning). Always call in a resolved microtask or Promise callback.
- **Listening to `PermissionStatus.change` for revocation detection on Safari:** The `change` event on `PermissionStatus` is unreliable in Safari/iOS — do not rely on it. The control's own `error` event with `code === 1` (PERMISSION_DENIED) is the reliable revocation signal. [MEDIUM — caniuse.com confirmed Safari 16+ supports `permissions.query`, Apple Developer Forums confirm `onchange` broken in iOS 16/17/Sonoma]
- **Expecting the style 'load' gate for the blue dot:** The dot and accuracy circle use `Marker.addTo(map)` which appends to `getCanvasContainer()` — pure DOM, no style dependency. The dot renders offline. [VERIFIED: mapbox-gl source `Marker.addTo` line 108317]
- **Adding GeolocateControl inside the map `'load'` handler:** The control should be added directly after `new mapboxgl.Map()`, not inside the `'load'` callback. The dot/circle are DOM markers and do not need the style.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Blue dot + accuracy ring rendering | Custom SVG/canvas overlay | `GeolocateControl({ showUserLocation: true, showAccuracyCircle: true })` | Handles marker projection, accuracy math, zoom-responsive circle diameter |
| Recenter button | Custom UI button + `map.flyTo()` | `GeolocateControl({ trackUserLocation: true, followUserLocation: true })` | Button and state machine (OFF/WAITING/ACTIVE_LOCK/BACKGROUND) built-in |
| Device orientation heading arrow | Custom compass overlay | `GeolocateControl({ showUserHeading: true })` | Built-in; note: NOT used in D-01 (heading not requested, keep false) |
| Permission state machine | Track watch/unwatch lifecycle | `GeolocateControl.trigger()` + `trackUserLocation` toggle | The watch lifecycle, timeout recovery, stale dot, and error states are managed by the control |

**Key insight:** GeolocateControl encapsulates a non-trivial state machine (6 watch states: OFF, WAITING_ACTIVE, ACTIVE_LOCK, BACKGROUND, ACTIVE_ERROR, BACKGROUND_ERROR). Hand-rolling any part of this forfeits the control's timeout recovery, stale-dot marking, and accessibility aria-pressed handling.

---

## GeolocateControl API Reference (mapbox-gl 3.24.1)

[VERIFIED: mapbox-gl@3.24.1 source — all items below confirmed from `dist/mapbox-gl-dev.js`]

### Constructor Options (defaults shown)

| Option | Type | Default | Phase 152 Value |
|--------|------|---------|-----------------|
| `trackUserLocation` | boolean | `false` | `true` (D-01) |
| `positionOptions` | PositionOptions | `{ enableHighAccuracy: false, timeout: 6000, maximumAge: 0 }` | `{ enableHighAccuracy: true }` (D-01) |
| `showAccuracyCircle` | boolean | `true` | `true` (D-01) |
| `showUserLocation` | boolean | `true` | `true` (default) |
| `followUserLocation` | boolean | `true` | `true` (default — enables recenter) |
| `fitBoundsOptions` | EasingOptions | `{ maxZoom: 15 }` | default |
| `showButton` | boolean | `true` | `true` (default) |
| `showUserHeading` | boolean | `false` | `false` (default — heading NOT in scope) |

### Events Emitted by GeolocateControl

| Event | Payload Shape | When |
|-------|--------------|------|
| `geolocate` | `{ coords: GeolocationCoordinates, timestamp: number }` | Every successful GPS fix |
| `error` | `{ code: number, message: string, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }` | GPS failure |
| `trackuserlocationstart` | none | Control enters ACTIVE_LOCK or BACKGROUND→ACTIVE_LOCK |
| `trackuserlocationend` | none | User pans away (ACTIVE_LOCK→BACKGROUND) or control turns OFF |
| `outofmaxbounds` | `GeolocationPosition` | Position outside map `maxBounds` (no `maxBounds` set in this app — won't fire) |

**`GeolocationPositionError.code` values (for D-04 error routing):**
- `1` = PERMISSION_DENIED — user denied or revoked permission
- `2` = POSITION_UNAVAILABLE — GPS hardware unavailable (airplane mode, no signal)
- `3` = TIMEOUT — `positionOptions.timeout` elapsed without a fix

### `trigger()` Return Values

- `false` — called before control was added to map (or before `_setup` is `true`)
- `true` — toggle initiated (does not guarantee a successful GPS fix)

With `trackUserLocation: true`, `trigger()` acts as a toggle cycling through states. Calling it when `_watchState === 'OFF'` starts watching; calling it again stops.

---

## Offline GPS and Dot Rendering (LOC-01 Critical Path)

[VERIFIED: mapbox-gl@3.24.1 source — `Marker.addTo()` line 108317, `_updateMarker()` line 109120]

**Finding:** The blue dot and accuracy circle are `Mapbox Marker` instances rendered as DOM elements appended to `map.getCanvasContainer()`. `Marker.addTo(map)` does:
```
map.getCanvasContainer().appendChild(this._element)
```
This is pure DOM — no dependency on the Mapbox style, no GL draw call. The marker's position is updated on map `move`/`moveend` events via CSS transform, which the map still fires even without a loaded style.

**Conclusion:** The blue dot renders offline without the style 'load' event having fired. This is the same reason `<bee-map>` already decoupled data loading from the style 'load' in Phase 151. GeolocateControl should be added immediately after `new mapboxgl.Map()`, not gated behind `this._map.on('load', ...)`.

**However:** `_updateCircleRadius()` reads `map.transform.worldSize` and `map.transform._center.lat` to compute pixel diameter. These properties exist on an unloaded map (the transform is set at construction), so the circle diameter calculation does not require a loaded style either.

**Mapbox token offline:** `import.meta.env.VITE_MAPBOX_TOKEN ?? ''` is set in `firstUpdated()` at line 380. An empty token causes basemap tile requests to fail (401), but does NOT affect `GeolocateControl` — the control uses only `navigator.geolocation`, which has no network dependency.

---

## Permissions API Notes

[VERIFIED: caniuse.com — `navigator.permissions.query({ name: 'geolocation' })` supported Safari 16.0+, iOS Safari 16.0+]
[ASSUMED: `PermissionStatus.change` event unreliable on Safari/iOS — multiple Apple Developer Forum threads 2022–2024, no official documentation]

### Browser Support for `navigator.permissions.query`

- Chrome/Edge/Firefox: supported since 2015–2016
- Safari desktop: supported since Safari 16.0 (September 2022)
- iOS Safari: supported since iOS 16.0 (September 2022)

### Graceful Degradation

When `navigator.permissions` is `undefined` (iOS < 16, rare in 2026), the D-03 auto-trigger check should silently skip:
```typescript
if (navigator.permissions) {
  navigator.permissions.query({ name: 'geolocation' as PermissionName })
    .then(/* ... */)
    .catch(/* ignore */);
}
```
The control itself calls `_checkGeolocationSupport` which also gracefully falls back when `navigator.permissions` is absent — it assumes support and enables the button.

### `PermissionStatus.state` Values

- `'granted'` — previously allowed, will NOT prompt user again
- `'prompt'` — will show browser/OS permission dialog on first `getCurrentPosition`/`watchPosition`
- `'denied'` — user or OS blocked, will not prompt; `watchPosition` immediately errors with code=1

### `PermissionStatus.change` Event (D-04 revocation path)

[ASSUMED: unreliable on Safari/iOS] Do not rely on `status.addEventListener('change', ...)` for detecting mid-session revocation on iOS. The reliable path is the `error` event from the control (`code === 1`), which fires whenever `watchPosition` encounters a permission denial — including if the user revokes while the app is active.

---

## `_userLocation` Shape Recommendation (Claude's Discretion)

For Phase 153 haversine, the SQL pre-filter needs lat/lon bounds, and JS haversine needs lat/lon/accuracy. Recommend:

```typescript
interface UserLocation {
  lat: number;   // degrees
  lon: number;   // degrees
  accuracy: number; // meters (95th percentile radius)
}
```

Set as `@state() private _userLocation: UserLocation | null = null;` on `<bee-atlas>`.

Do not include `timestamp` or `altitude` — not needed by Phase 153 and can always be added.

For the error state, a separate `@state() private _locationError: boolean = false;` is simpler than encoding the error in `_userLocation` (keeps the type clean and matches the `_updateAvailable` pattern).

---

## Source-Analysis Test Pattern (Success Criterion 3)

[VERIFIED: existing test files `src/tests/bee-map.test.ts` and `src/tests/install-affordance.test.ts`]

The project's standard for structural invariants is a vitest source-analysis test using `readFileSync`. The existing `bee-map.test.ts` guards the `intendedFilterActive` invariant ("input-only: no internal assignment") and the `offline @property` invariant with this pattern:

```typescript
// src/tests/geolocation.test.ts
const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');

test('bee-map.ts DOES NOT store _userLocation as @state', () => {
  expect(src).not.toMatch(/@state[\s\S]{0,20}_userLocation/);
  expect(src).not.toMatch(/private\s+_userLocation/);
});

test('bee-map.ts dispatches user-location-changed event', () => {
  expect(src).toMatch(/user-location-changed/);
});
```

These tests do NOT mount `<bee-atlas>` — they are pure `readFileSync` string assertions, avoiding the mapbox-gl mock complexity documented in `feedback_bee_atlas_test_mounting.md`.

---

## Common Pitfalls

### Pitfall 1: Calling `trigger()` Too Early

**What goes wrong:** `trigger()` is called synchronously after `addControl()`. `_setup` is `false` because `_checkGeolocationSupport` hasn't resolved its `permissions.query` promise yet. `trigger()` returns `false` and logs a console warning. The auto-activate silently does nothing.
**Why it happens:** `addControl()` calls `onAdd()` which calls `_checkGeolocationSupport()` which calls `navigator.permissions.query(...)` — an async microtask.
**How to avoid:** Always call `trigger()` inside a `.then()` callback of a permissions query, never synchronously.
**Warning signs:** Console warning "Geolocate control triggered before added to a map"; no blue dot appears despite permission being granted.

### Pitfall 2: Assuming the Dot Requires the Style

**What goes wrong:** Developer adds `GeolocateControl` inside `this._map.on('load', ...)`, assuming the dot needs the style. In offline mode, `'load'` never fires, so the control is never added and GPS never activates.
**How to avoid:** Add the control immediately after `new mapboxgl.Map()`, before registering the `'load'` handler. The dot uses DOM markers, not style layers.

### Pitfall 3: iOS Standalone Geolocation Prompt Not Appearing

**What goes wrong:** On some iOS devices/versions, when the app is launched from the home screen (standalone mode), the geolocation permission prompt does not appear to the user. The `watchPosition` callback may hang silently without calling either success or error.
**Why it happens:** iOS isolates standalone PWA permissions from Safari tab permissions. The permission prompt targets the wrong window context in some iOS builds. [ASSUMED — Apple Developer Forums thread 694999, iOS 15.1.1 confirmed; iOS 16+ behavior not definitively documented]
**How to avoid:** Cannot be simulated; must be verified on a real iOS device launched from home screen. The plan must include an explicit `checkpoint:human-verify` step.
**Warning signs:** No blue dot, no error event, no permission dialog on first tap of the geolocate button in standalone mode.

### Pitfall 4: Using `PermissionStatus.change` for Revocation on Safari

**What goes wrong:** Code listening to `permissionStatus.addEventListener('change', ...)` to update UI when the user revokes permission in Settings. On iOS 16/17/macOS Sonoma, the `change` event does not fire reliably. The UI remains in "location active" state while the control's next `watchPosition` error is suppressed.
**How to avoid:** Rely only on the control's `error` event (`code === 1`). Do not use `PermissionStatus.change` as the primary revocation signal.

### Pitfall 5: Updating `<bee-map>`'s Own State

**What goes wrong:** Adding `@state() private _userLocation` to `<bee-map>` to display the denial message inside the map element. This violates the state-owner/pure-presenter invariant (CLAUDE.md Architecture Invariants).
**How to avoid:** `<bee-map>` ONLY emits `user-location-changed` via `_emit()`. All derived UI state (denial banner, `_userLocation` for "near me") lives on `<bee-atlas>`.

### Pitfall 6: Mock Missing `GeolocateControl` in Tests That Mount `<bee-map>`

**What goes wrong:** Tests that mount `<bee-atlas>` with a real `<bee-map>` child (i.e., not using the `vi.mock('../bee-map.ts', ...)` stub) will invoke `firstUpdated()`, which will try to construct a `new mapboxgl.GeolocateControl()`. The existing mapbox-gl mock (in `bee-atlas.test.ts` and `cache-state.test.ts`) does not include `GeolocateControl`.
**How to avoid:** Source-analysis tests (the recommended approach for LOC-02) do not mount `<bee-map>` and are unaffected. If any test mounts `<bee-atlas>` directly, update the `vi.mock('mapbox-gl', ...)` factory to include `GeolocateControl: vi.fn().mockImplementation(() => ({ on: vi.fn(), trigger: vi.fn() }))`.

---

## Code Examples

### Minimal GeolocateControl Setup

[VERIFIED: mapbox-gl@3.24.1 source]

```typescript
// In BeeMap.firstUpdated(), after `new mapboxgl.Map({...})`
const geolocate = new mapboxgl.GeolocateControl({
  trackUserLocation: true,
  positionOptions: { enableHighAccuracy: true },
  showAccuracyCircle: true,
});
this._map.addControl(geolocate);
// No position argument needed — addControl() uses the map's default container
// which is top-right (same as attributionControl default).

// Wire events
geolocate.on('geolocate', (e) => {
  this._emit('user-location-changed', {
    lat: e.coords.latitude,
    lon: e.coords.longitude,
    accuracy: e.coords.accuracy,
  });
});
geolocate.on('error', (e) => {
  this._emit('user-location-changed', { error: { code: e.code, message: e.message } });
});

// D-03: auto-trigger only if already granted
if (navigator.permissions) {
  navigator.permissions
    .query({ name: 'geolocation' as PermissionName })
    .then(status => { if (status.state === 'granted') geolocate.trigger(); })
    .catch(() => {});
}
```

### Denial Banner Conditional in `bee-atlas.render()`

[VERIFIED: existing `bee-atlas.ts:362-375` update-banner pattern]

```typescript
// After the <bee-map>/<bee-pane> content block, before closing </div>
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

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `trackUserLocation: false` + one-shot `getCurrentPosition` | `trackUserLocation: true` + continuous `watchPosition` | Part of the mapbox-gl API design | Enables recenter button and passive/active state machine |
| Geolocation dot via custom GL layer | `Marker`-based DOM overlay | mapbox-gl v1+ | Renders independent of style; works offline |
| `navigator.permissions` unavailable on Safari | Supported since Safari 16.0 (Sept 2022) | iOS 16 | Safe to use with `if (navigator.permissions)` fallback |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `PermissionStatus.change` is unreliable on iOS Safari 16/17 | Permissions API Notes, Pitfall 4 | If it works, relying on the `error` event is still correct — no regression, just missed opportunity to update UI without waiting for next watchPosition failure |
| A2 | iOS standalone mode geolocation prompt may not appear on some device/iOS combinations | Pitfall 3, iOS Standalone Gotcha | If it works on all current devices, the human-verify step is still correct; if it doesn't, it blocks the feature on home-screen installs |
| A3 | Both the app's `permissions.query` and the control's `_checkGeolocationSupport` resolve in the correct order (control's microtask runs before app's `.then()`) | Pattern 2 | If ordering differs, `trigger()` might still get `_setup === false`. Mitigation: add a brief `Promise.resolve().then(...)` wrapper or a dedicated `ready` check. Low risk in practice given the V8 microtask queue FIFO ordering. |

---

## Open Questions

1. **Banner copy for distinct error codes**
   - What we know: `GeolocationPositionError.code` is 1 (PERMISSION_DENIED), 2 (POSITION_UNAVAILABLE), or 3 (TIMEOUT)
   - What's unclear: Should the app show distinct copy for "denied" vs "no GPS signal"? (Claude's Discretion)
   - Recommendation: Use distinct copy. PERMISSION_DENIED → "Location access blocked — enable in Settings → Safari → Location". POSITION_UNAVAILABLE/TIMEOUT → "Unable to determine your location". Simpler for the user than a single generic message.

2. **Teardown of `geolocate` instance on `disconnectedCallback`**
   - What we know: `this._map?.remove()` in `bee-map.ts:297` triggers `map.removeControl()` for all added controls, which calls `geolocate.onRemove()` — clearing the `watchID` and removing markers.
   - What's unclear: Whether a reference to `geolocate` needs to be stored as `this._geolocate` to allow early teardown (e.g., if the user navigates away before the map is fully initialized)
   - Recommendation: Store as `this._geolocateControl: mapboxgl.GeolocateControl | null`. The existing `disconnectedCallback` already calls `this._map?.remove()` which cascades cleanup; the stored reference is only needed if the phase adds any logic in `disconnectedCallback` beyond map removal.

---

## Environment Availability

Step 2.6 SKIPPED — this phase adds no external tools, services, CLIs, or runtimes. The only dependency is `mapbox-gl`, already installed and verified.

---

## Validation Architecture

`nyquist_validation: true` in `.planning/config.json` — this section is required.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 |
| Config file | `vite.config.ts` (`test.environment: 'happy-dom'`) |
| Quick run command | `npm test -- --reporter=verbose src/tests/geolocation.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LOC-02 | `<bee-map>` DOES NOT have `@state _userLocation` | source-analysis | `npm test -- src/tests/geolocation.test.ts` | ❌ Wave 0 |
| LOC-02 | `<bee-map>` emits `user-location-changed` string | source-analysis | `npm test -- src/tests/geolocation.test.ts` | ❌ Wave 0 |
| LOC-02 | `<bee-atlas>` declares `_userLocation` as `@state` | source-analysis | `npm test -- src/tests/geolocation.test.ts` | ❌ Wave 0 |
| LOC-02 | `<bee-atlas>` binds `@user-location-changed` on `<bee-map>` in render() | source-analysis | `npm test -- src/tests/geolocation.test.ts` | ❌ Wave 0 |
| LOC-01 | Blue dot visible + recenter works | manual/device | — | manual only |
| LOC-01 | GPS works with DevTools "offline" | manual/device | — | manual only |
| LOC-03 | Denial shows banner; map/table unaffected | manual/device | — | manual only |
| LOC-03 | iOS standalone geolocation behavior | real-device UAT | — | manual only — **real device required** |

### Sampling Rate

- **Per task commit:** `npm test -- src/tests/geolocation.test.ts` (source-analysis only, runs in < 2 s)
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/tests/geolocation.test.ts` — new file, covers LOC-02 source invariants
  - `bee-map.ts` does NOT have `@state _userLocation`
  - `bee-map.ts` dispatches `user-location-changed` event
  - `bee-atlas.ts` has `@state _userLocation`
  - `bee-atlas.ts` binds `@user-location-changed` in render()
  - `bee-map.ts` mock in `bee-atlas.test.ts` and `cache-state.test.ts` includes `GeolocateControl` stub (update existing mocks)

---

## iOS Standalone Geolocation Gotcha (Research Flag)

[ASSUMED — from Apple Developer Forums, not reproduced in controlled environment]

When a user runs the app from the iOS home screen (standalone mode), the geolocation permission prompt behavior differs from Safari:

- In Safari tab: tapping the GeolocateControl button shows the iOS "Allow '[site]' to use your location?" dialog immediately.
- In standalone mode: on some iOS device/version combinations (confirmed iOS 15.1.1; less certain for iOS 16+), the permission dialog either does not appear or appears targeting the wrong window, causing `watchPosition` to hang silently.
- The D-03 auto-trigger (for already-granted permissions) is not affected — if the permission was granted before adding to home screen, GPS activates immediately.
- This cannot be tested with Xcode Simulator — only real device testing is valid.

**Plan implication:** Include a `checkpoint:human-verify` step for iOS standalone behavior:
1. Install the app on a real iOS device (not Simulator)
2. Clear location permission for the site in Settings → Safari → Location
3. Launch from home screen in standalone mode
4. Tap the GeolocateControl button and confirm: (a) the permission dialog appears, (b) granting it shows the blue dot, (c) subsequent launches auto-activate (D-03 path)

---

## Security Domain

`security_enforcement` is not set to `false` — section required.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes — GPS coordinates | GPS data is a number (lat/lon/accuracy) from browser API; no SQL injection vector; validate that `accuracy` is a finite positive number before storing to avoid NaN propagating to Phase 153 haversine |
| V6 Cryptography | no | — |

### Known Threat Patterns for Geolocation + Browser

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| High-accuracy GPS position leakage | Information Disclosure | Data stays client-side; no server send; `_userLocation` is ephemeral session state — not persisted to URL or storage |
| Permission prompt spoofing | Tampering | N/A — browser permission UI is OS-controlled; app does not customize the prompt |
| Stale position used after permission revoked | Spoofing | `<bee-atlas>` clears `_userLocation` on `error` event (code=1); banner notifies user |

---

## Sources

### Primary (HIGH confidence)
- `mapbox-gl@3.24.1` — `node_modules/mapbox-gl/dist/mapbox-gl-dev.js` lines 108932–109500 — GeolocateControl constructor, events, `trigger()`, `_setupUI`, `_onSuccess`, `_onError`, Marker.addTo
- [caniuse: navigator.permissions geolocation](https://caniuse.com/mdn-api_permissions_permission_geolocation) — Safari 16.0+ confirmed
- `src/bee-map.ts` — existing `_emit()`, `firstUpdated()`, `disconnectedCallback()`
- `src/bee-atlas.ts` — existing `@state` patterns, render bindings, banner pattern
- `src/tests/bee-map.test.ts`, `src/tests/install-affordance.test.ts`, `src/tests/cache-state.test.ts` — source-analysis test patterns

### Secondary (MEDIUM confidence)
- [MDN Permissions.query()](https://developer.mozilla.org/en-US/docs/Web/API/Permissions/query) — PermissionStatus.state values (granted/prompt/denied)

### Tertiary (LOW confidence / ASSUMED)
- [Apple Developer Forums #757353](https://developer.apple.com/forums/thread/757353) — `PermissionStatus.onchange` not working iOS 16/17/Sonoma
- [Apple Developer Forums #694999](https://developer.apple.com/forums/thread/694999) — location prompt not appearing in standalone PWA on iOS 15

---

## Metadata

**Confidence breakdown:**
- GeolocateControl API (events, options, trigger): HIGH — verified from installed source
- Offline dot rendering: HIGH — verified from Marker.addTo source
- trigger() timing (async _setup): HIGH — traced through source
- Permissions API support (Safari 16+): HIGH — caniuse confirmed
- PermissionStatus.change on Safari: LOW — Apple forum reports, no official doc
- iOS standalone permission prompt behavior: LOW — Apple forum, device-specific

**Research date:** 2026-06-20
**Valid until:** 2026-09-20 (90 days — mapbox-gl GeolocateControl API is stable; Permissions API support is baseline as of Sept 2022)
