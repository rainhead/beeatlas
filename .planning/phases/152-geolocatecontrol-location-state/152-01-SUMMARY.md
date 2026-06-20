---
phase: 152-geolocatecontrol-location-state
plan: "01"
subsystem: tests
tags: [tdd, source-analysis, geolocation, mock-repair]
dependency_graph:
  requires: []
  provides: [LOC-02 test gate, mapbox-gl mock with addControl+GeolocateControl]
  affects: [src/tests/geolocation.test.ts, src/tests/bee-atlas.test.ts, src/tests/cache-state.test.ts]
tech_stack:
  added: []
  patterns: [source-analysis test (readFileSync, no DOM mount), vi.mock factory extension]
key_files:
  created:
    - src/tests/geolocation.test.ts
  modified:
    - src/tests/bee-atlas.test.ts
    - src/tests/cache-state.test.ts
decisions:
  - "Wave 0 gate: five assertions RED until Plan 02 ships implementation — intentional by design"
  - "Mock extension is additive: only addControl + GeolocateControl added; all 155 prior tests remain GREEN"
metrics:
  duration: "6 minutes"
  completed: "2026-06-20"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 3
---

# Phase 152 Plan 01: Wave 0 test scaffold and mock repair Summary

Five-assertion source-analysis gate encoding LOC-02 pure-presenter invariant (bee-map emits, bee-atlas stores user-location), plus addControl + GeolocateControl stub added to mapbox-gl mocks so mounted bee-map does not throw when Plan 02 adds the control.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create src/tests/geolocation.test.ts source-analysis suite | ce0bfa5c | src/tests/geolocation.test.ts |
| 2 | Extend mapbox-gl vi.mock in bee-atlas.test.ts and cache-state.test.ts | d4d41839 | src/tests/bee-atlas.test.ts, src/tests/cache-state.test.ts |

## Verification Results

- `npx tsc --noEmit` exits 0 — geolocation.test.ts type-checks cleanly
- `npm test -- src/tests/geolocation.test.ts` → 5 tests, 3 failing (RED, as intended — the gate is live)
  - PASS: `bee-map.ts does NOT declare _userLocation as @state` (negative guard)
  - PASS: `bee-map.ts does NOT declare private _userLocation field` (negative guard)
  - FAIL: `bee-map.ts emits user-location-changed event` (RED until Plan 02)
  - FAIL: `bee-atlas.ts declares _userLocation as @state` (RED until Plan 02)
  - FAIL: `bee-atlas.ts binds @user-location-changed on <bee-map> in render()` (RED until Plan 02)
- `npm test -- src/tests/bee-atlas.test.ts src/tests/cache-state.test.ts` → 155 tests, all passing (GREEN)
- Full `npm test` → 1 file failing (geolocation.test.ts, expected), 31 files passing

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this is a test-only plan with no production stubs.

## Threat Flags

None — test-only changes; no new runtime trust boundaries.

## Self-Check: PASSED

- `src/tests/geolocation.test.ts` exists: FOUND
- `grep -c "readFileSync" src/tests/geolocation.test.ts` returns 2: FOUND (beeMapSrc and beeAtlasSrc)
- `grep -q "user-location-changed" src/tests/geolocation.test.ts`: FOUND
- `grep -q "not.toMatch" src/tests/geolocation.test.ts` (>= 2): FOUND (2 negative guards)
- `grep -q "addControl: vi.fn()" src/tests/bee-atlas.test.ts`: FOUND
- `grep -q "GeolocateControl: vi.fn" src/tests/bee-atlas.test.ts`: FOUND
- `grep -q "addControl: vi.fn()" src/tests/cache-state.test.ts`: FOUND
- `grep -q "GeolocateControl: vi.fn" src/tests/cache-state.test.ts`: FOUND
- Commits ce0bfa5c and d4d41839 both exist in git log: FOUND
