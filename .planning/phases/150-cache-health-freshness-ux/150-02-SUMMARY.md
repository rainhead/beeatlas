---
phase: 150-cache-health-freshness-ux
plan: "02"
subsystem: service-worker-lifecycle
tags:
  - service-worker
  - workbox-window
  - sw-lifecycle
  - tdd
  - phase-150
dependency_graph:
  requires:
    - 150-01   # SKIP_WAITING message handler in sw.ts
  provides:
    - window event 'sw-update-available' (composed, bubbles)
    - window.__wb (Workbox instance for Plan 04 banner tap-handler)
    - Wave 0 unit tests for workbox-window registration contract
  affects:
    - Plan 04 (bee-atlas update banner — reads window.__wb, listens for sw-update-available)
tech_stack:
  added:
    - workbox-window (runtime import in sw-registration.ts — already in dependencies)
  patterns:
    - Pattern S5 (mocked-globals dynamic-import vitest harness)
    - vi.hoisted() for shared mock state accessible in vi.mock() factories
key_files:
  created:
    - src/tests/sw-update.test.ts
  modified:
    - src/sw-registration.ts
decisions:
  - "window.__wb assignment is placed before wb.register() so the banner tap-handler
     can reference it immediately without waiting for the register() promise"
  - "waiting listener is attached before wb.register() to avoid missing a fast
     install→waiting transition (SW already installing when page loads)"
  - "Test 6 uses vi.stubGlobal('navigator', ...) to fully remove serviceWorker from
     the navigator object, since Object.defineProperty value:undefined still passes
     the 'serviceWorker' in navigator check"
  - "workbox-window is already in dependencies (not devDependencies) — Plan 01 moved
     it; the D-13 requirement is already satisfied"
metrics:
  duration: "~7 minutes"
  completed: 2026-06-19
  tasks_completed: 3
  files_changed: 2
---

# Phase 150 Plan 02: Workbox-Window SW Registration Migration Summary

**One-liner:** Migrated `sw-registration.ts` from raw `navigator.serviceWorker.register()` to `workbox-window.Workbox` with a `waiting` → `sw-update-available` CustomEvent pipeline, exposing `window.__wb` for the Plan 04 banner tap-handler.

## What Was Built

### src/sw-registration.ts (modified)

The `registerServiceWorker` function body was replaced with a `workbox-window.Workbox`-based implementation per D-13:

1. `import { Workbox } from 'workbox-window'` added at top
2. `const wb = new Workbox('/app/sw.js', { scope: '/app/' })` — same URL + scope as the old call
3. `wb.addEventListener('waiting', ...)` attached BEFORE `wb.register()` — dispatches `new CustomEvent('sw-update-available', { bubbles: true, composed: true })` on `window`
4. `(window as Window & { __wb?: Workbox }).__wb = wb` — cross-module handoff to Plan 04 banner
5. `await wb.register()` wrapped in existing try/catch with `console.error('[SW] Registration failed:', err)`

**requestPersistentStorage() block: byte-identical** — lines 46–71 are unchanged from the 149 D-12 implementation. The `PERSIST_ASKED_KEY` constant, write-before-await ordering, feature guard, console.log result, and `void requestPersistentStorage();` trailing call are all preserved verbatim.

**Module remains private (no exports)** — the no-SW-on-`/` structural guarantee from Phase 147 is preserved. `window.__wb` is the cross-module handoff mechanism, not a named export.

### src/tests/sw-update.test.ts (new)

Six tests covering the Wave 0 registration contract:

1. `imports Workbox and instantiates it with /app/sw.js + scope /app/` — constructor call args
2. `calls register() on the Workbox instance` — register() called once
3. `dispatches sw-update-available CustomEvent on window when 'waiting' fires` — composed + bubbles, no payload
4. `stores the Workbox instance on window.__wb` — confirms __wb assignment
5. `preserves requestPersistentStorage() side-effect (149 D-12)` — persist called once, key written
6. `skips registration when 'serviceWorker' not in navigator` — feature guard works

## New CustomEvent Contract

**Type:** `'sw-update-available'`
**Target:** `window`
**bubbles:** `true`
**composed:** `true`
**detail:** none (pure signal — no payload per RESEARCH §Composite event payload shape)

## window.__wb Cross-Module Handoff

`(window as Window & { __wb?: Workbox }).__wb` is set to the `Workbox` instance after construction and before `wb.register()`. Plan 04's `<bee-atlas>` update banner tap-handler will call `(window as Window & { __wb?: { messageSkipWaiting(): void } }).__wb?.messageSkipWaiting()` to post `{type:'SKIP_WAITING'}` to the waiting SW (Plan 01's handler). This completes the prompt-to-reload contract loop.

## Commits

| Hash | Message |
|------|---------|
| `7820f498` | `test(150-02): pin workbox-window registration contract (RED)` |
| `0fae680b` | `feat(150-02): migrate sw-registration.ts to workbox-window Workbox` |

## Verification Results

- `npm test -- --run src/tests/sw-update.test.ts`: 6/6 tests pass ✓
- `npm test -- --run src/tests/cache-probe.test.ts`: 6/6 tests pass (149 contract intact) ✓
- `npm test -- --run src/tests/build-output.test.ts`: 39/39 tests pass (Plan 01 assertions green) ✓
- `npm test -- --run`: 692/692 tests pass (zero regressions in functional suite) ✓
- `npm run typecheck`: exits 0 ✓
- `npm run build`: exits 0; compiled `_site/app/sw.js` unchanged by this plan ✓

## Deviations from Plan

### Pre-existing Worktree Limitation (informational, not a deviation)

`public/data/species.json`, `seasonality.json`, and other pipeline-generated data files are absent in the git worktree (they are not tracked in git — generated by the nightly pipeline). The `data-species.test.ts` test suite fails in the worktree environment for this pre-existing reason. The test is unrelated to Plan 02 changes. Data files were copied from the main repo checkout to enable `npm run build` verification.

### Test Mock Architecture (Rule 3 auto-fix)

**Found during Task 1:** The initial `vi.fn(() => workboxInstance)` mock factory approach produced a `TypeError: () => workboxInstance is not a constructor` when the SUT called `new Workbox(...)`. `vi.fn()` factories are not valid constructors.

**Fix:** Replaced with a `vi.hoisted()` block holding the shared `workboxInstance` object + a `vi.mock('workbox-window', ...)` factory that uses a real ES class `class Workbox { constructor(...) { ... } }` that delegates method calls to the hoisted `mocks.instance`. Constructor calls are tracked in a `mocks.constructorCalls` array.

**Also found:** `Object.defineProperty(navigator, 'serviceWorker', { value: undefined })` makes the property undefined but keeps it "in" the navigator object, so `'serviceWorker' in navigator` still returns `true`. Fixed by using `vi.stubGlobal('navigator', ...)` with a copy of navigator's own properties excluding `serviceWorker`.

## Threat Surface Scan

No new threat surface beyond what the plan's `<threat_model>` documented:
- `window.__wb` global (T-150-02 — accepted; same-origin only; low severity)
- `'sw-update-available'` CustomEvent (T-150-01 carry — mitigated; forged event can show banner but messageSkipWaiting is a no-op when no SW is waiting)

## Known Stubs

None — `sw-registration.ts` emits the real `sw-update-available` event and sets `window.__wb`. The banner listener is Plan 04's responsibility.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `src/tests/sw-update.test.ts` exists | FOUND |
| `src/sw-registration.ts` modified | FOUND |
| `150-02-SUMMARY.md` created | FOUND |
| Commit `7820f498` (Task 1 RED) | FOUND |
| Commit `0fae680b` (Task 2 GREEN) | FOUND |
