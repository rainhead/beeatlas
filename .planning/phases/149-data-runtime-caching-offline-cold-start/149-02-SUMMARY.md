---
phase: 149-data-runtime-caching-offline-cold-start
plan: 02
subsystem: pwa
tags: [pwa, service-worker, cache-probe, offline, reprime, persist]

requires:
  - phase: 149-01
    provides: data-artifacts CacheFirst runtime route in SW; ExpirationPlugin({maxEntries:1, purgeOnQuotaError:true}) on DB route

provides:
  - probeAndReprime() function in src/app-entry.ts (cold-start probe + silent re-prime fetch)
  - window 'online' listener in src/app-entry.ts (re-runs probe on reconnect)
  - requestPersistentStorage() in src/sw-registration.ts (navigator.storage.persist() once per profile)
  - PERSIST_ASKED_KEY localStorage gate in src/sw-registration.ts
  - src/tests/cache-probe.test.ts with 6 passing unit tests

affects:
  - 149-03 (Plan 03 adds its own online/offline listeners inside bee-atlas for UI state; independent of this plan's listeners)
  - 150-offline-ux (Phase 150 ready-for-offline indicator reads the same data-artifacts cache state that this probe manages)

tech-stack:
  added: []
  patterns:
    - Module side-effect pattern for initialization: void fn() at module scope, matching sw-registration.ts registerServiceWorker() convention
    - Optional-chaining feature guard: navigator.storage?.persist (mirrors navigator.serviceWorker check)
    - localStorage-before-await one-shot semantics: setItem before persist() await prevents retry on rejection

key-files:
  created:
    - src/tests/cache-probe.test.ts (218 lines — 6 Vitest unit tests)
  modified:
    - src/app-entry.ts (+36 lines — resolveDataUrl import + probeAndReprime + online listener)
    - src/sw-registration.ts (+27 lines — PERSIST_ASKED_KEY + requestPersistentStorage)

decisions:
  - Probe code inlined in src/app-entry.ts (not extracted to src/cache-probe.ts) — fewer files for downstream readers; Plan 03 has no dependency on this symbol
  - 'online' listener registered at module scope (no disconnectedCallback) — app-entry.ts is a side-effect module with page lifetime; this matches RESEARCH Pattern 2
  - localStorage flag set BEFORE the navigator.storage.persist() await — ensures one-shot semantics even if the promise rejects (D-12)
  - Test 5 uses "callsAfterColdStart < calls after online event" assertion rather than exact count — handles happy-dom not removing event listeners across vi.resetModules() (happy-dom quirk documented in test comments)

metrics:
  duration: ~25 minutes
  completed: 2026-06-18
  tasks_completed: 3
  files_modified: 3
---

# Phase 149 Plan 02: Cold-Start Probe + Persistent Storage — Summary

**One-liner:** CACHE-05 page-side wiring: silent cold-start DB cache probe + 'online' reconnect re-prime trigger in app-entry.ts; navigator.storage.persist() once-per-profile in sw-registration.ts.

## What Was Built

### Task 1 — probeAndReprime + 'online' listener in src/app-entry.ts (commit ff435347)

Added 36 lines to `src/app-entry.ts`:

- `import { resolveDataUrl } from './manifest.ts'` — same import path used by `src/bee-map.ts`
- `async function probeAndReprime(): Promise<void>` with five guard paths (in order):
  1. `if (!('caches' in window)) return` — Cache API feature guard
  2. `if (!navigator.onLine) return` — offline early bail
  3. `const dbUrl = await resolveDataUrl('occurrences_db'); if (!dbUrl) return` — null manifest key guard
  4. `caches.match(dbUrl, { cacheName: 'data-artifacts' })` — probe the runtime cache
  5. On miss (`!cached`): `fetch(dbUrl).catch((err) => console.warn(...))` — fire-and-forget re-prime
- `void probeAndReprime()` — cold-start invocation
- `window.addEventListener('online', () => void probeAndReprime())` — reconnect listener

The `!cached` guard (not `=== null`) is required because `caches.match()` returns `undefined` on miss, per RESEARCH Pitfall 5.

On a true first visit, the SW is not yet activated and the fetch goes directly to the network without being cached. This is expected — the probe is primarily for the iOS-eviction re-prime case (RESEARCH Pitfall 3).

**No-SW-on-/ guarantee preserved:** `grep -r 'probeAndReprime' src/bee-atlas.ts` returns no matches. Probe code is reachable only from `src/app-entry.ts`.

### Task 2 — requestPersistentStorage in src/sw-registration.ts (commit dcd2bc9f)

Added 27 lines to `src/sw-registration.ts` after the existing `registerServiceWorker()` call:

- `const PERSIST_ASKED_KEY = 'beeatlas-persist-asked'` — single source of truth for the localStorage key
- `async function requestPersistentStorage(): Promise<void>` with:
  - `if (!navigator.storage?.persist) return` — feature guard (optional chaining)
  - `if (localStorage.getItem(PERSIST_ASKED_KEY)) return` — first-launch gate
  - `localStorage.setItem(PERSIST_ASKED_KEY, '1')` — set BEFORE the await (one-shot semantics)
  - `await navigator.storage.persist()` — the actual call
  - `console.log('[storage] navigator.storage.persist() =>', granted)` — diagnostic log only
- `void requestPersistentStorage()` — side-effect call alongside `registerServiceWorker()`

`requestPersistentStorage` is NOT exported — matches the private `registerServiceWorker` pattern.

**Isolation verified:** `grep -rl 'requestPersistentStorage' src/` and `grep -rl 'beeatlas-persist-asked' src/` both return only `src/sw-registration.ts`.

### Task 3 — src/tests/cache-probe.test.ts (commit a1f54f5d)

Created 218-line Vitest spec with 6 tests — all passing:

| Test | Probe Branch | Key Assertion |
|------|-------------|---------------|
| 1 — online + cache miss | Path C | `fetch` called once with resolved DB URL |
| 2 — online + cache hit | Path B | `fetch` not called |
| 3 — offline | Path A | neither `fetch` nor `caches.match` called (offline guard short-circuits before caches lookup) |
| 4 — manifest missing occurrences_db | Path D | `fetch` not called (null URL guard) |
| 5 — 'online' event re-runs probe | Reconnect path | calls after 'online' event > calls after cold-start |
| 6 — fetch rejection swallowed | Error path | `console.warn` called; no unhandled rejection |

**Happy-dom quirk documented:** `vi.resetModules()` resets the module registry but does NOT remove event listeners already registered on `window` by prior test imports. Test 5 accounts for this by asserting that the call count grows after the 'online' event rather than asserting an exact count of 1.

**Mock strategy:**
- `vi.mock('../bee-atlas.ts')` and `vi.mock('../sw-registration.ts')` — suppress heavy side effects
- `vi.mock('../manifest.ts')` at file top + `vi.mocked(resolveDataUrl).mockResolvedValue(...)` per test
- `vi.stubGlobal('caches', ...)` — happy-dom does not provide Cache API
- `vi.stubGlobal('fetch', ...)` — controls fetch behavior per test
- `Object.defineProperty(navigator, 'onLine', ...)` — happy-dom getter requires defineProperty

## Verification

- `npx tsc --noEmit` exits 0 (TypeScript clean)
- `npm test -- src/tests/cache-probe.test.ts`: all 6 tests pass
- `VITEST_SKIP_BUILD=1 npm test`: 585 tests pass, 1 pre-existing failure (`data-species.test.ts` requires pipeline-generated `public/data/species.json` — unrelated)
- `grep -r 'probeAndReprime' src/bee-atlas.ts`: no matches (no-SW-on-/ preserved)
- `grep -rl 'requestPersistentStorage' src/`: only `src/sw-registration.ts`
- `grep -rl 'beeatlas-persist-asked' src/`: only `src/sw-registration.ts`

## Deviations from Plan

None — plan executed exactly as written. The happy-dom event-listener persistence quirk was anticipated in the plan's action description ("If the test framework can't stub `navigator.onLine` cleanly in happy-dom, document the workaround in a code comment") and handled without deviation from the plan's required behavior coverage.

## Known Stubs

None — all implemented behavior is wired to real browser APIs. Phase 150 will surface the cache state via the ready-for-offline indicator; this plan wires the background mechanism only (D-08).

## Threat Flags

No new threat surface beyond what the plan's threat model covers:
- T-149-07: probe fetches same-origin content-hashed URL from resolveDataUrl — unchanged
- T-149-08: PERSIST_ASKED_KEY localStorage flag has no user data — unchanged
- T-149-09: online/offline flapping handled by cache-hit bail in probe — unchanged
- T-149-10: one-shot persist() via localStorage-before-await — implemented as specified
- T-149-11: probe code in app-entry.ts only (verified: bee-atlas.ts unmodified) — preserved
- T-149-12: spoofed 'online' event is low-risk same-origin — accepted as specified

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/app-entry.ts exists | FOUND |
| src/sw-registration.ts exists | FOUND |
| src/tests/cache-probe.test.ts exists | FOUND |
| 149-02-SUMMARY.md exists | FOUND |
| Commit ff435347 (Task 1) | FOUND |
| Commit dcd2bc9f (Task 2) | FOUND |
| Commit a1f54f5d (Task 3) | FOUND |
