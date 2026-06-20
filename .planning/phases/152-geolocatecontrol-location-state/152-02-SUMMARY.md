---
phase: 152-geolocatecontrol-location-state
plan: 02
subsystem: ui
tags: [mapbox-gl, GeolocateControl, geolocation, lit, web-components, pwa, permissions-api]

# Dependency graph
requires:
  - phase: 152-geolocatecontrol-location-state/01
    provides: geolocation.test.ts with 5 RED source-analysis assertions for LOC-02 invariant

provides:
  - GeolocateControl (trackUserLocation + enableHighAccuracy + showAccuracyCircle) in bee-map.ts firstUpdated(), offline-safe
  - user-location-changed CustomEvent emitted via _emit() from bee-map.ts on geolocate/error events
  - D-03 granted-only auto-trigger inside navigator.permissions.query().then()
  - _userLocation (@state, {lat,lon,accuracy}|null) and _locationError (@state bool) on bee-atlas.ts
  - _onUserLocationChanged handler routing success/error with stale-position clear on revocation
  - App-level location-error-banner with role="alert", distinct copy (denied vs unavailable), dismiss
  - userLocation public getter on BeeAtlas for Phase 153 "Near me" consumption
  - All 5 geolocation.test.ts LOC-02 source invariants GREEN

affects: [153-near-me-filter, bee-map, bee-atlas, geolocation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GeolocateControl added immediately after new mapboxgl.Map() (not in 'load') for offline GPS (DOM Marker, no style dependency)"
    - "D-03 auto-trigger: navigator.permissions.query().then() — never synchronously after addControl() (_setup flag async)"
    - "State-owner/pure-presenter: bee-map emits via _emit(), bee-atlas owns @state and binds @event-name="
    - "Distinct error copy via _locationErrorKind: 'denied' (code 1) vs 'unavailable' (code 2/3)"
    - "noUnusedLocals compliance: expose _userLocation via public getter for Phase 153 consumption"

key-files:
  created: []
  modified:
    - src/bee-map.ts
    - src/bee-atlas.ts

key-decisions:
  - "GeolocateControl added outside 'load' handler so offline GPS works (blue dot uses DOM Markers, not style layers)"
  - "D-03 trigger() deferred to permissions.query().then() to avoid silent no-op when _setup is still false"
  - "_userLocation shape: {lat, lon, accuracy} minimal, anticipates Phase 153 haversine"
  - "Separate _locationErrorKind state for distinct denied vs unavailable banner copy"
  - "userLocation public getter exposes _userLocation for Phase 153 without premature wiring"
  - "accuracy finite-check guard in handler (RESEARCH V5: avoid NaN into Phase 153 haversine)"

patterns-established:
  - "GPS control placement: after new mapboxgl.Map(), before any 'load' handler registration"
  - "Permission-gated auto-trigger via permissions.query().then(), guarded by if (navigator.permissions)"

requirements-completed: [LOC-01, LOC-02, LOC-03]

# Metrics
duration: 25min
completed: 2026-06-20
---

# Phase 152 Plan 02: GeolocateControl + Location State Summary

**GeolocateControl wired to bee-map.ts (offline-safe, granted-only auto-trigger) with user-location-changed relay; bee-atlas.ts owns _userLocation/@state and app-level denial banner — all 5 LOC-02 source invariants GREEN**

## Performance

- **Duration:** 25 min
- **Started:** 2026-06-20T16:31:00Z
- **Completed:** 2026-06-20T16:56:28Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Constructed `GeolocateControl` with `trackUserLocation: true`, `enableHighAccuracy: true`, `showAccuracyCircle: true` in `bee-map.ts firstUpdated()` — placed immediately after `new mapboxgl.Map()`, NOT inside `'load'` handler, so offline GPS works (blue dot uses DOM Markers, not style layers)
- Wired `geolocate` event (`e.coords.latitude/longitude/accuracy`) and `error` event (`{code, message}`) through existing `_emit()` helper as `user-location-changed` CustomEvent
- D-03 auto-trigger inside `navigator.permissions.query().then()` — deferred to avoid silent no-op from `_setup === false` on synchronous call after `addControl()`
- Added `@state _userLocation` and `@state _locationError`/`_locationErrorKind` to `bee-atlas.ts`; `_onUserLocationChanged` routes success→`_userLocation` and error→banner, clearing stale position on revocation (T-152-04)
- App-level location-error-banner with `role="alert"`, distinct copy for denied (code 1) vs unavailable (code 2/3), and dismiss button
- All 5 source-analysis assertions in `geolocation.test.ts` GREEN; full 747-test suite passes; `tsc --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Add GeolocateControl to bee-map.ts** - `4b56cc78` (feat)
2. **Task 2: Lift location state to bee-atlas.ts** - `22f544e4` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `src/bee-map.ts` — GeolocateControl construction + geolocate/error wiring + D-03 granted-only auto-trigger; emits user-location-changed via _emit()
- `src/bee-atlas.ts` — @state _userLocation/{lat,lon,accuracy}|null, @state _locationError bool, @state _locationErrorKind 'denied'|'unavailable'|null, _onUserLocationChanged handler, @user-location-changed binding on bee-map, location-error-banner with role="alert", CSS for .location-error-banner, userLocation public getter

## Decisions Made

- **GeolocateControl placement outside 'load':** Blue dot and accuracy circle are Mapbox DOM Markers (`getCanvasContainer().appendChild`) — no style dependency. Placing control in `'load'` handler would break offline GPS since the basemap style never loads offline (Phase 151 finding). Control added directly after `new mapboxgl.Map()`.
- **D-03 auto-trigger timing:** `trigger()` called inside `navigator.permissions.query().then()` — the control's `_setup` flag is set async (after its own `_checkGeolocationSupport` `permissions.query` microtask resolves in `onAdd`). Synchronous call after `addControl()` silently returns `false`.
- **`userLocation` public getter:** `noUnusedLocals: true` in tsconfig would flag `_userLocation` as declared but never read (Phase 153 is the first consumer). Added `get userLocation()` as the Phase 153 access point — semantically correct and satisfies TypeScript.
- **accuracy finite-check:** RESEARCH V5 recommends validating `accuracy` before storing. Added `!isFinite(accuracy) || accuracy < 0` guard to avoid NaN propagating to Phase 153 haversine.

## Deviations from Plan

None — plan executed exactly as written. The `userLocation` public getter and accuracy finite-check are both explicitly recommended in the plan (RESEARCH V5, "Phase 153 access point" note).

One minor adaptation: the plan suggested storing `this._geolocateControl` as a class field for potential teardown. Since `disconnectedCallback` already cascades cleanup via `this._map.remove()` (which calls `geolocate.onRemove()`), and `noUnusedLocals: true` would flag an unread field, the local `geolocate` variable in `firstUpdated()` is sufficient. The plan's open question noted this was optional.

## Issues Encountered

**`noUnusedLocals: true` with `@state _userLocation`:** TypeScript flagged `_userLocation` as "declared but its value is never read" because Phase 153 is the first consumer and no render expression reads the field in Phase 152. Resolved by adding `get userLocation()` which reads `_userLocation` and provides the canonical Phase 153 access path. This is semantically correct, not a workaround.

## Threat Surface Scan

No new network endpoints, auth paths, file access, or schema changes introduced. `_userLocation` is in-memory `@state` only — not persisted to URL, localStorage, or network (T-152-02). No `console.log` of coords in either modified file (T-152-03). Stale position cleared on error code 1 (T-152-04). Zero package installs (T-152-SC).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `_userLocation: { lat, lon, accuracy } | null` on `<bee-atlas>` is ready for Phase 153 "Near me" filter to consume via the `userLocation` getter or direct `@state` binding
- Phase 153 will need to wire `_onUserLocationChanged` or a new handler to `_runFilterQuery()` on position change (D-05 deferred throttle/debounce decision)
- Manual/device UAT (blue dot, recenter, offline GPS, denial banner, iOS standalone) is covered by Plan 03 (`autonomous: false`)

## Self-Check

- [x] `src/bee-map.ts` exists and contains GeolocateControl
- [x] `src/bee-atlas.ts` exists and contains `_userLocation`, `_locationError`, location-error-banner
- [x] Task 1 commit `4b56cc78` present in git log
- [x] Task 2 commit `22f544e4` present in git log
- [x] `npm test` 747/747 passed
- [x] `npx tsc --noEmit` exits 0

---
*Phase: 152-geolocatecontrol-location-state*
*Completed: 2026-06-20*
