---
phase: 152
slug: geolocatecontrol-location-state
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-20
---

# Phase 152 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (`test.environment: 'happy-dom'`) |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `npm test -- src/tests/geolocation.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~2 s (geolocation source-analysis), full suite under existing budget |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- src/tests/geolocation.test.ts` (source-analysis, < 2 s)
- **After every plan wave:** Run `npm test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~2 s (per-task), full suite per wave

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 0 | LOC-02 | — | N/A | source-analysis | `npm test -- src/tests/geolocation.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | LOC-02 | — | `<bee-map>` does NOT declare `@state _userLocation` (emits, not stores) | source-analysis | `npm test -- src/tests/geolocation.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | LOC-02 | — | `<bee-map>` dispatches `user-location-changed` (composed) | source-analysis | `npm test -- src/tests/geolocation.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | LOC-02 | — | `<bee-atlas>` declares `_userLocation` as `@state` | source-analysis | `npm test -- src/tests/geolocation.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | LOC-02 | — | `<bee-atlas>` binds `@user-location-changed` on `<bee-map>` in `render()` | source-analysis | `npm test -- src/tests/geolocation.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | LOC-03 | — | denial sets app-level banner state on `<bee-atlas>`; map/filters/table state untouched | source-analysis / unit | `npm test -- src/tests/geolocation.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs are filled in by the planner; the requirement→behavior rows above are the binding contract regardless of final task numbering.*

---

## Wave 0 Requirements

- [ ] `src/tests/geolocation.test.ts` — new file; source-analysis stubs for LOC-02 invariants:
  - `bee-map.ts` does NOT have `@state _userLocation` (pure presenter — emits, not stores)
  - `bee-map.ts` dispatches `user-location-changed`
  - `bee-atlas.ts` has `@state _userLocation`
  - `bee-atlas.ts` binds `@user-location-changed` in `render()`
- [ ] Update existing `mapbox-gl` `vi.mock()` in `src/tests/bee-atlas.test.ts` and `src/tests/cache-state.test.ts` to include a `GeolocateControl` stub — the new `firstUpdated()` `addControl(new GeolocateControl(...))` will throw against the current incomplete mock if any test mounts a real `<bee-map>`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Blue dot + accuracy ring appear on allow; recenter returns viewport | LOC-01 | Requires real geolocation + visual map rendering | Allow location in browser; confirm blue dot + ring; pan away, tap recenter, confirm viewport returns |
| GPS fix works with DevTools "offline" active | LOC-01 | `navigator.geolocation` cannot be exercised headless | Enable DevTools "offline"; tap control; confirm a fix arrives and dot renders without network |
| Denial shows app-level banner; map/filters/table unaffected | LOC-03 | Requires real permission-denied flow + visual check | Deny location; confirm banner with brief explanation; confirm map/filters/table still interactive |
| **iOS standalone permission prompt fires correctly** | LOC-01/LOC-03 | **Real device only** — not reproducible in Xcode Simulator; standalone-vs-tab behavior differs | Install on real iOS device; clear site location permission; launch from home screen (standalone); tap control; confirm (a) permission dialog appears, (b) granting shows blue dot, (c) relaunch auto-activates (D-03 path) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`geolocation.test.ts` + mock updates)
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
