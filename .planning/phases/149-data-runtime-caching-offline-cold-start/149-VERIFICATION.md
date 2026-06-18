---
phase: 149-data-runtime-caching-offline-cold-start
verified: 2026-06-18T11:10:00Z
status: passed
human_uat_approved_at: 2026-06-18
human_uat_approved_by: operator
score: 7/7 must-haves verified (automated checks)
re_verification: false
human_verification:
  - test: "Cold-start offline after one online prime"
    expected: "Visit /app online, wait for SW activation, enable DevTools Network Offline, reload /app — map renders with occurrence dots, county/ecoregion overlays visible, no network requests fired in DevTools."
    why_human: "Requires a real browser SW lifecycle + Cache Storage state; cannot be reproduced in happy-dom or via static file checks."
  - test: "Basemap renders blank with honest label offline"
    expected: "Offline reload of /app shows the Mapbox map container without crash; bottom-left overlay reads 'Basemap tiles unavailable offline. Pan here while online to cache tiles for an area.'"
    why_human: "Visual rendering + Mapbox GL lifecycle; not testable in happy-dom."
  - test: "Online/offline pill flips on connectivity change"
    expected: "DevTools Network Offline → 'Offline' pill appears in bee-header. DevTools Network Online → pill disappears. Map remains usable in both states."
    why_human: "Requires real navigator.onLine events in a browser context; happy-dom stubs are used only in unit tests."
  - test: "Re-prime fires when DB is evicted then device reconnects"
    expected: "Delete occurrences_*.db entry in DevTools Application > Cache Storage > data-artifacts; reload offline (map shows no dots); toggle Network Online; confirm a background fetch re-populates data-artifacts with the DB."
    why_human: "Requires Cache Storage manipulation in DevTools; not automatable in unit tests."
  - test: "navigator.storage.persist() called once at first launch"
    expected: "Clear site data; visit /app; DevTools console shows '[storage] navigator.storage.persist() => false/true'; localStorage key 'beeatlas-persist-asked' is set. Second visit shows no persist() log."
    why_human: "Requires fresh-profile DevTools observation; localStorage gate is unit-tested but the actual browser API behavior needs confirmation."
  - test: "Prompt-to-reload lifecycle preserved (no skipWaiting/clientsClaim in runtime behavior)"
    expected: "After deploying a new build with /app open in a tab, DevTools Application > Service Workers shows a new SW entering 'waiting' state (not auto-activating). The update prompt itself ships in Phase 150."
    why_human: "Requires a real deploy + two-tab SW lifecycle observation; source and build-output gates are automated but the browser behavior needs confirmation."
---

# Phase 149: `/data/` Runtime Caching + Offline Cold-Start — Verification Report

**Phase Goal:** `occurrences.db` (~23 MB) and all GeoJSON files (`counties`, `ecoregions`, `places`) are runtime-cached via Workbox `CacheFirst` strategy in the SW; the app completes a full offline cold-start (map renders, filters run, table populates) with no network connection; iOS eviction is mitigated by re-priming the DB if it is absent on reconnect; `QuotaExceededError` is handled with partial-write cleanup; and the app shows honest UI for the offline state and the blank basemap.

**Verified:** 2026-06-18T11:10:00Z
**Status:** human_needed — all 7 automated must-haves VERIFIED; 6 manual UAT items remain
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | After one online prime, /app cold-starts fully offline with occurrence dots + overlays and no network requests | HUMAN-UAT | SW runtime routes exist and are tested at built-output level; actual cache population + offline render needs browser verification |
| 2 | County/ecoregion overlays render offline (GeoJSON served from SW cache) | HUMAN-UAT | `.geojson` route registered in `src/sw.ts` line 70 with `CacheFirst`; confirmed in build-output test `OFF-02`; actual render needs browser verification |
| 3 | Basemap renders blank with honest label when offline | HUMAN-UAT | `<bee-map>` renders `<div class="offline-basemap-label">` conditionally on `this.offline` (line 194); CSS and template verified by source-assertion tests; visual outcome needs browser confirmation |
| 4 | Non-blocking online/offline indicator present; map fully usable in either state | HUMAN-UAT | `bee-header` renders `.offline-pill` conditionally on `this.offline` (line 113); DOM tests confirm pill appears/disappears; real browser event flip needs confirmation |
| 5 | Re-prime on reconnect + navigator.storage.persist() at first launch | HUMAN-UAT | `probeAndReprime()` + `online` listener in `app-entry.ts`; `requestPersistentStorage()` with localStorage gate in `sw-registration.ts`; 6 unit tests cover all branches; actual browser behavior needs observation |
| 6 | QuotaExceededError triggers partial-write cleanup | VERIFIED | `ExpirationPlugin({ maxEntries: 1, purgeOnQuotaError: true })` on DB route in `src/sw.ts` line 56; this is the Workbox-native cleanup path (D-05: no sentinel pattern) |
| 7 | SW update lifecycle uses prompt-to-reload, never skipWaiting/clientsClaim | VERIFIED | `src/sw.ts` contains zero occurrences of `skipWaiting` or `clientsClaim` (only comment at line 4); build-output test `OFF-03 carry-forward` asserts this on the compiled `_site/app/sw.js` |

**Score (automated):** 7/7 truths implemented in code. Truths 1–5 require browser-level UAT to confirm end-to-end behavior.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/sw.ts` | CacheFirst routes for `.db` and `.geojson` + `data-artifacts` cache name; `ExpirationPlugin` on DB route only | VERIFIED | Lines 51–77: two `registerRoute` calls with correct predicates, plugins, and cache name. No `skipWaiting`/`clientsClaim`. |
| `src/app-entry.ts` | `probeAndReprime()` + cold-start invocation + `online` event listener | VERIFIED | Lines 22–42: full implementation with all five guard paths; `void probeAndReprime()` at line 36; `window.addEventListener('online', ...)` at line 42 |
| `src/sw-registration.ts` | `navigator.storage.persist()` once per profile via localStorage gate | VERIFIED | Lines 35–49: `PERSIST_ASKED_KEY`, feature guard, localStorage-before-await one-shot semantics |
| `src/bee-atlas.ts` | `_offline @state` + `_onOnline`/`_onOffline` handlers + property passdown to `bee-header` and `bee-map` | VERIFIED | Line 71: `@state() private _offline: boolean = !navigator.onLine`; lines 350–351: listener registration in `firstUpdated`; lines 357–359: cleanup in `disconnectedCallback`; lines 172, 192: `.offline=${this._offline}` on both children |
| `src/bee-header.ts` | `@property offline` + conditional `.offline-pill` span; NO event listeners | VERIFIED | Line 6: `@property({ attribute: false }) offline = false`; lines 76–83: CSS; line 113: conditional template. Zero `addEventListener` calls for online/offline. |
| `src/bee-map.ts` | `@property offline` + conditional `.offline-basemap-label` div; NO event listeners; NO `@state _offline` | VERIFIED | Line 60: `@property({ attribute: false }) offline = false`; lines 146–158: CSS; line 194: conditional template. Zero `addEventListener('online'|'offline')` calls. Zero `@state _offline`. |
| `src/tests/build-output.test.ts` | 3 new Phase 149 assertions: runtime route, no-skipWaiting carry-forward, devDeps | VERIFIED | Lines 354–381: three test cases; all pass in full build run |
| `src/tests/cache-probe.test.ts` | 6 unit tests covering all `probeAndReprime` branches | VERIFIED | 218-line file; 6 tests; all pass (confirmed by `npm test` run) |
| `src/tests/bee-header.test.ts` | 2 DOM tests for offline pill | VERIFIED | Lines 83–115: two tests in `OFF-05` describe block; confirmed passing |
| `src/tests/bee-map.test.ts` | 7 source-assertion tests for offline overlay | VERIFIED | Lines 103–135: 7 tests in `OFF-04` describe block; confirmed passing |
| `src/tests/bee-atlas.test.ts` | 2 behavioral tests for _offline state propagation | VERIFIED | Lines 1012–1078: 2 tests for `_onOnline`/`_onOffline` handlers and `disconnectedCallback` cleanup |
| `package.json` | `workbox-strategies`, `workbox-expiration`, `workbox-cacheable-response` @ `^7.4.1` in devDependencies | VERIFIED | Lines 43–45: all three packages present at `^7.4.1` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/app-entry.ts` | `data-artifacts` cache | `caches.match(dbUrl, { cacheName: 'data-artifacts' })` | VERIFIED | Line 28: correct cacheName used in probe |
| `src/app-entry.ts` | DB URL | `resolveDataUrl('occurrences_db')` | VERIFIED | Line 25: same import as `bee-map.ts`; manifest key is `occurrences_db` |
| `src/app-entry.ts` | `window.online` event | `window.addEventListener('online', () => void probeAndReprime())` | VERIFIED | Line 42: listener registered at module scope for page lifetime |
| `src/sw.ts` | `/data/*.db` requests | `CacheFirst` + `ExpirationPlugin({ maxEntries:1, purgeOnQuotaError:true })` | VERIFIED | Lines 51–60: predicate `pathname.endsWith('.db')` + `ExpirationPlugin` |
| `src/sw.ts` | `/data/*.geojson` requests | `CacheFirst` + `CacheableResponsePlugin({ statuses:[200] })` | VERIFIED | Lines 69–77: predicate `pathname.endsWith('.geojson')` + no ExpirationPlugin (D-06 correct) |
| `src/sw-registration.ts` | `navigator.storage.persist()` | localStorage gate (`beeatlas-persist-asked`) | VERIFIED | Lines 35–49: one-shot semantics with flag set before await |
| `bee-atlas._offline` | `bee-header.offline` | `.offline=${this._offline}` in render template | VERIFIED | Line 172: property binding in `<bee-header>` |
| `bee-atlas._offline` | `bee-map.offline` | `.offline=${this._offline}` in render template | VERIFIED | Line 192: property binding in `<bee-map>` |
| `bee-atlas.firstUpdated` | `window.online`/`offline` | `window.addEventListener('online', this._onOnline)` etc. | VERIFIED | Lines 350–351: both listeners registered in `firstUpdated`; lines 357–359: removed in `disconnectedCallback` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `bee-header` `.offline-pill` | `this.offline` (input property) | `bee-atlas._offline` state, initialized from `!navigator.onLine`, updated by real browser events | Yes — driven by live browser API | FLOWING |
| `bee-map` `.offline-basemap-label` | `this.offline` (input property) | Same as above | Yes | FLOWING |
| `probeAndReprime` fetch | `dbUrl` from `resolveDataUrl('occurrences_db')` | `manifest.json` on the network (content-hashed URL) | Yes — real network fetch intercepted by SW | FLOWING |
| `requestPersistentStorage` | `navigator.storage.persist()` result | Browser API; localStorage gate prevents re-call | Yes — real browser API; result logged only (D-12) | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: Skipped for SW-dependent behaviors (require a running browser with active SW). Covered by Manual UAT items.

The following non-SW behaviors are checkable and were verified by `npm test`:

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 6 cache-probe branches | `npm test -- src/tests/cache-probe.test.ts` | 6 passed | PASS |
| bee-header offline pill DOM tests | `npm test -- src/tests/bee-header.test.ts` | 2 tests in OFF-05 block pass | PASS |
| bee-map offline overlay source assertions | `npm test -- src/tests/bee-map.test.ts` | 7 tests in OFF-04 block pass | PASS |
| bee-atlas _offline state propagation | `npm test -- src/tests/bee-atlas.test.ts` | 2 tests in OFF-04/OFF-05 block pass | PASS |
| Full test suite (no build) | `VITEST_SKIP_BUILD=1 npm test` | 647 passed, 39 skipped (build-output) | PASS |

---

### Probe Execution

Step 7c: No conventional `scripts/*/tests/probe-*.sh` probes exist. The PLAN/SUMMARY files declare no probe-based verification. Build-output assertions serve the equivalent role and are covered in the spot-checks above.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| OFF-02 | 149-01 | `occurrences.db` and GeoJSON runtime-cached via `CacheFirst` | VERIFIED (automated) + HUMAN-UAT | SW routes in `src/sw.ts`; build-output test asserts `data-artifacts`, `.db`, `.geojson` survive Rollup |
| OFF-03 | 149-01 | SW update lifecycle never uses `skipWaiting`/`clientsClaim` | VERIFIED | Source: zero occurrences; build-output test: `_site/app/sw.js` asserted clean |
| OFF-04 | 149-03 | Blank basemap + honest label offline | VERIFIED (automated) + HUMAN-UAT | `bee-map.ts` conditional overlay; source-assertion tests confirm copy, CSS, pure-presenter invariant |
| OFF-05 | 149-03 | Non-blocking online/offline indicator | VERIFIED (automated) + HUMAN-UAT | `bee-atlas._offline @state`; `bee-header.offline-pill`; DOM tests; state-ownership invariant confirmed |
| CACHE-05 | 149-02 | Re-prime on reconnect; `navigator.storage.persist()` at first launch; `QuotaExceededError` cleanup | VERIFIED (automated) + HUMAN-UAT | `probeAndReprime` in `app-entry.ts`; `requestPersistentStorage` in `sw-registration.ts`; `purgeOnQuotaError:true` in SW; 6 unit tests |

---

### CLAUDE.md Invariant Checks

| Invariant | Check | Result |
|-----------|-------|--------|
| `<bee-atlas>` owns all reactive state | `_offline @state` lives only in `bee-atlas.ts`; `bee-header` and `bee-map` use `@property` | PASS |
| `<bee-header>` and `<bee-map>` are pure presenters | Neither file contains `addEventListener('online'|'offline')`, `connectedCallback`/`disconnectedCallback` for network state, or `@state` for offline | PASS |
| No `skipWaiting` / `clientsClaim` in `src/sw.ts` | Only comment at line 4; zero functional calls | PASS |
| Static hosting only | No server runtime added; no CDK/infra changes in this phase | PASS |
| D-04: ExpirationPlugin on DB route ONLY | GeoJSON route (lines 69–77) has no `ExpirationPlugin`; source comment at lines 65–67 explains why | PASS |
| D-05: No sentinel-key partial-write pattern | Not present; `purgeOnQuotaError:true` is the cleanup mechanism | PASS |
| D-07: Cold-start probe + `online` event ONLY (no `visibilitychange`) | `grep visibilitychange` returns zero matches in `app-entry.ts`, `sw-registration.ts`, `bee-atlas.ts` | PASS |
| D-08: Silent background fetch (no new UX for re-prime in 149) | No new toast/banner/postMessage for re-prime; Phase 150 owns that surface | PASS |
| D-10/D-11: Pill/overlay only when offline | Both templates gated on `this.offline ? html\`...\` : ''` | PASS |
| D-12: `persist()` once per profile (localStorage gate) | `PERSIST_ASKED_KEY` set before `await`; `getItem` check at function entry | PASS |

---

### Anti-Patterns Found

No blockers. Scanned all 6 modified/created source files. No `TBD`, `FIXME`, `XXX` debt markers. No `return null` / `return []` stubs in data paths. No hardcoded empty values flowing to rendered output.

Notable (informational only):

- `src/sw.ts` comment at line 49: "Note: does NOT intercept manifest.json (.json extension, not .db); Phase 150 will add a separate NetworkFirst route for manifest.json." — This is intentional deferred scope, documented in CONTEXT.md `<deferred>`. Not a debt marker.
- `src/app-entry.ts` comment at lines 19–21: explains that on first visit the SW is not yet activated and the re-prime fetch goes to the network uncached. Correct per D-07 analysis; not a stub.

---

### Human Verification Required

Six items require browser-level testing. These match the VALIDATION.md manual-only verification table exactly (no new items added by this analysis).

#### 1. Cold-Start Fully Offline

**Test:** `npm run build && npm run preview` → visit `/app/index.html` online → confirm DevTools Application > Service Workers shows SW activated → close DevTools Network > check Offline → reload `/app/index.html`
**Expected:** Map renders with occurrence dots; county/ecoregion overlays render; DevTools Network tab shows all resources served from `(ServiceWorker)` with zero actual network requests
**Why human:** Real browser SW lifecycle + Cache Storage population required

#### 2. Basemap Blank with Honest Label

**Test:** While offline (from item 1 above), observe the map area
**Expected:** Mapbox map container loads without JavaScript errors; a small label at bottom-left reads "Basemap tiles unavailable offline. Pan here while online to cache tiles for an area."
**Why human:** Visual rendering and Mapbox GL JS lifecycle in real browser

#### 3. Online/Offline Pill Flips

**Test:** With `/app` open, toggle DevTools Network between Online and Offline multiple times
**Expected:** "Offline" pill appears in the `<bee-header>` right group when offline; disappears when online; map remains interactive throughout
**Why human:** Real `navigator.onLine` browser events; happy-dom unit tests stub this

#### 4. Re-Prime on Reconnect After Eviction

**Test:** Open DevTools Application > Cache Storage > `data-artifacts`; delete the `occurrences_*.db` entry; reload `/app` while offline (map may show no dots); toggle Network Online
**Expected:** A background fetch fires for the DB URL; `data-artifacts` cache repopulates within a few seconds; DevTools Network shows the fetch completing
**Why human:** Requires Cache Storage manipulation; not automatable

#### 5. navigator.storage.persist() First Launch

**Test:** Clear site data for the origin; open `/app`; check DevTools Console
**Expected:** Console shows `[storage] navigator.storage.persist() => false` (or `true` on Chrome); `localStorage['beeatlas-persist-asked']` is `'1'`. Reload and confirm no second persist() log appears.
**Why human:** Fresh-profile behavior; localStorage gate is unit-tested but browser API call needs observation

#### 6. Prompt-to-Reload Lifecycle Preserved

**Test:** Deploy a new build with a tab open to `/app`; open DevTools Application > Service Workers
**Expected:** New SW enters `waiting` state and does NOT auto-activate; no `skipWaiting` fires automatically. (The user-visible update prompt ships in Phase 150 — this check only confirms the lifecycle is preserved.)
**Why human:** Requires a real deploy + two-tab DevTools observation

---

### Gaps Summary

No automated gaps found. All 7 success criteria have concrete implementation evidence in the codebase. The 6 human verification items are follow-on browser testing for behaviors that automated checks confirm at the code level but cannot exercise end-to-end.

---

_Verified: 2026-06-18T11:10:00Z_
_Verifier: Claude (gsd-verifier)_
