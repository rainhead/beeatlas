---
phase: 153-occurrences-near-me
plan: "01"
subsystem: bee-map
tags: [geolocation, pure-presenter, refactor, geolocate-control]
dependency_graph:
  requires: [152-geolocatecontrol-location-state]
  provides: [bee-map requestUserLocation() D-06 seam]
  affects: [src/bee-map.ts, src/tests/geolocation.test.ts]
tech_stack:
  patterns: [instance-field promotion, optional-guard delegation, source-analysis gate]
key_files:
  modified:
    - src/bee-map.ts
    - src/tests/geolocation.test.ts
decisions:
  - Promote Phase 152 local `const geolocate` to `private _geolocate` instance field; use if-guard (not ?.) in requestUserLocation() so grep pattern `_geolocate\.trigger` matches (plan key_links contract)
  - Keep `this._geolocate!.trigger()` (non-null assertion) in granted-auto path since control is already assigned at that callsite
metrics:
  duration: "~10 minutes"
  completed: "2026-06-21T18:26:27Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 153 Plan 01: GeolocateControl Instance Field + Public Trigger Seam Summary

Promote the Phase 152 `GeolocateControl` from a local `const` to `private _geolocate` instance field on `BeeMap`, and expose `public requestUserLocation()` as the D-06 seam so `<bee-atlas>` can trigger geolocation on demand without reaching into `<bee-map>` internals.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Promote GeolocateControl to instance field + add requestUserLocation() | 1969d5bd | src/bee-map.ts |
| 2 | Extend geolocation source-analysis gate for NEAR-01/D-06 | ccae5dc1 | src/tests/geolocation.test.ts |

## What Was Built

**`src/bee-map.ts`**
- Added `private _geolocate: mapboxgl.GeolocateControl | null = null` instance field alongside `_map`
- `firstUpdated()`: replaced `const geolocate = new mapboxgl.GeolocateControl(...)` with assignment to `this._geolocate`; updated all in-block references (`addControl`, both `.on()` relay handlers, granted-auto `.trigger()` call)
- Phase 152 behavior preserved byte-for-byte: control options, `'top-left'` placement, `user-location-changed` relay payloads, granted-only auto-trigger gate
- Added `public requestUserLocation()` with null guard (`if (this._geolocate) this._geolocate.trigger()`) and doc comment explaining it is the D-06 seam

**`src/tests/geolocation.test.ts`**
- Added `NEAR-01/D-06` describe block with 3 source-analysis assertions:
  - `public requestUserLocation()` method exists
  - `this._geolocate` instance field exists
  - `_userLocation @state` is absent (pure-presenter invariant re-asserted)
- All 8 tests pass (3 new + 5 existing LOC-02)

## Verification

- `npx tsc --noEmit` — clean
- `npx vitest run src/tests/geolocation.test.ts` — 8/8 pass
- `npm test` — 750/750 pass
- `npm run build` — green

## Deviations from Plan

**1. [Rule 1 - Clarification] Used if-guard instead of ?. in requestUserLocation()**
- **Found during:** Task 1 acceptance criteria check
- **Issue:** Plan's `key_links` pattern `_geolocate\.trigger` requires the literal string `_geolocate.trigger`; optional chaining `_geolocate?.trigger` does not match
- **Fix:** Used `if (this._geolocate) this._geolocate.trigger()` in `requestUserLocation()` (equivalent semantics, satisfies grep contract); used `this._geolocate!.trigger()` in granted-auto path (non-null assertion; control is assigned immediately above)
- **Files modified:** src/bee-map.ts

## Known Stubs

None.

## Threat Flags

None. The new public method only calls `this._geolocate.trigger()` — no new permission surface (the control already requested geolocation in Phase 152). `<bee-map>` still holds no reactive location state.

## Self-Check: PASSED

- [x] src/bee-map.ts exists and contains `requestUserLocation` and `_geolocate`
- [x] src/tests/geolocation.test.ts exists and contains NEAR-01/D-06 describe block
- [x] Commit 1969d5bd exists (Task 1)
- [x] Commit ccae5dc1 exists (Task 2)
