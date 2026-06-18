# Phase 149: `/data/` Runtime Caching + Offline Cold-Start — Research

**Researched:** 2026-06-18
**Domain:** Workbox 7.4.1 runtime caching, Cache API, online/offline state, Lit component offline UX
**Confidence:** HIGH (all claims grounded in current codebase + prior STACK/ARCHITECTURE/PITFALLS research)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `CacheFirst` runtime route in `src/sw.ts` for `/data/*`, named cache `data-artifacts`. DB is NOT in precache.
- **D-02:** GeoJSON cache strategy is Claude's discretion (default: runtime CacheFirst alongside DB, same `/data/*` route). Researcher may flip to precache only if there is a concrete reason.
- **D-03:** 148's `globIgnores` of `data/**`, `*.db`, `*.geojson` stays in place.
- **D-04:** `ExpirationPlugin({ maxEntries: 1, purgeOnQuotaError: true })` on the DB route. With `maxEntries: 1`, Workbox evicts the previous DB on new cache population. `purgeOnQuotaError: true` is the backstop for genuine-full-disk.
- **D-05:** No sentinel-key partial-write detection. Cache API `put()` is treated as atomic; `purgeOnQuotaError` is the cleanup path.
- **D-06:** GeoJSON routes (if runtime): no `maxEntries` cap — stable URLs, three files together <~5 MB.
- **D-07:** Re-prime trigger = cold-start probe + `online` event listener on page side. `visibilitychange` NOT in Phase 149.
- **D-08:** Re-prime UX = silent background fetch only. No new UI in Phase 149.
- **D-09:** QuotaExceededError UX = console warn only in Phase 149.
- **D-10:** Offline pill in `<bee-header>`, only shown when `navigator.onLine === false`.
- **D-11:** Blank-basemap label: bottom-left text overlay on the map, only when offline.
- **D-12:** `navigator.storage.persist()` called once at first `/app` launch, tracked via `localStorage`, result logged only.

### Claude's Discretion

- GeoJSON placement (runtime alongside DB vs precache) — see D-02.
- Exact pill/label copy text and visual styling.
- Cache name string (`data-artifacts` is the suggestion).
- Whether the cold-start probe lives in `app-entry.ts`, `bee-atlas.ts`, or a new `src/cache-probe.ts`.
- `CacheableResponsePlugin({ statuses: [200] })` on the DB route.
- Exact `online`/`offline` event wiring.

### Deferred Ideas (OUT OF SCOPE)

- `visibilitychange` re-prime probe (Phase 149).
- Tile-cache-aware blank-basemap behavior.
- "Always-on" Online/Offline pill.
- SW→page `postMessage({type:'cache-quota-exceeded'})` plumbing.
- Mapbox tile runtime caching.
- `manifest.json` NetworkFirst caching (Phase 150).
- Prompt-to-reload banner (Phase 150).
- Real `manifest.webmanifest` + icons + installability (Phase 151).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OFF-02 | `occurrences.db` (~23 MB) and all GeoJSON are runtime-cached (`CacheFirst`); offline, occurrence dots and overlays render and all filter/table/selection queries run against the cached DB | Workbox `registerRoute` + `CacheFirst` + `ExpirationPlugin` on the `/data/*` route in `src/sw.ts`; `sqlite-worker.ts` already uses `fetch(occurrencesDbUrl)` — the SW intercepts transparently |
| OFF-03 | Cache invalidation keyed to content-hash `manifest.json`; SW update lifecycle uses prompt-to-reload, never `skipWaiting`/`clientsClaim` | Content-hashed DB URL (new URL = new cache key) + `maxEntries: 1` eviction; `skipWaiting`/`clientsClaim` structurally absent from `src/sw.ts` (Phase 148 D-04); no regression in Phase 149 |
| OFF-04 | Uncached Mapbox basemap tiles render blank offline without crashing; honest label explains basemap is only cached for areas browsed online | Mapbox GL JS renders blank gracefully for uncached tiles (confirmed); `<bee-map>` receives `@property offline` from `<bee-atlas>` and renders a conditional overlay |
| OFF-05 | App indicates online/offline state with non-blocking status indication; map stays fully usable offline | `navigator.onLine` + `online`/`offline` events wired in `<bee-header>` (`@state _offline`); pill renders only when offline |
| CACHE-05 | On reconnect, if `occurrences.db` is missing from cache (e.g. iOS Safari eviction), app re-primes; `navigator.storage.persist()` requested at first launch; `QuotaExceededError` handled with partial-write cleanup | Cold-start probe + `online` event listener in page module; `purgeOnQuotaError: true` on ExpirationPlugin is the cleanup; `navigator.storage.persist()` called once with `localStorage` guard |

</phase_requirements>

---

## Summary

Phase 149 extends the `src/sw.ts` SW (compiled by vite-plugin-pwa's `injectManifest` pass) with two Workbox runtime `CacheFirst` routes: one for the `occurrences.db` (~23 MB SQLite binary, content-hashed URL) and one for the three GeoJSON overlay files (counties, ecoregions, places — also content-hashed). All routes share the `data-artifacts` named cache. The DB route attaches `ExpirationPlugin({ maxEntries: 1, purgeOnQuotaError: true })`, which collapses hash-churn accumulation; GeoJSON routes need no cap because their stable URLs overwrite in place.

On the page side, the cold-start probe reads the `manifest.json`-resolved DB URL and checks whether it is in the `data-artifacts` cache via `caches.match(url, { cacheName: 'data-artifacts' })`. If absent and online, it issues a background `fetch()` (which the SW intercepts and caches). An `online` event listener re-runs the same probe to handle the "app opened offline, reconnect later" field flow. `navigator.storage.persist()` is called once, gated on a `localStorage` key, and its result is only logged.

Two UI surfaces are added: (1) an `offline` pill in `<bee-header>` (already a Lit component — just needs `@state _offline` + `online`/`offline` event listeners), and (2) a conditional bottom-left overlay in `<bee-map>` receiving `@property offline` from `<bee-atlas>` (honoring the pure-presenter invariant). Because Mapbox GL JS renders blank gray tiles when tiles are uncached, offline behavior is non-crashing by default; the overlay supplies the honest explanation.

**Primary recommendation:** Register two separate Workbox routes in `src/sw.ts` — one for `*.db` (with `ExpirationPlugin({ maxEntries: 1 })`), one for `*.geojson` (no expiration cap) — both using `CacheFirst` and both named `data-artifacts`. This gives per-route plugin control while keeping a single named cache. The three additional Workbox packages (`workbox-strategies`, `workbox-expiration`, `workbox-cacheable-response`) must be added to `package.json` devDependencies.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `/data/*` runtime cache (`CacheFirst`) | Service Worker | — | SW's `fetch` handler intercepts all `/data/` requests from the `/app` page; page code is unmodified |
| GeoJSON cache strategy decision | Service Worker | — | Same intercept point; no page-side change |
| ExpirationPlugin (evict old DB hash) | Service Worker | — | Cache management runs entirely in SW context |
| Cold-start probe + `online` listener | Browser / Client | — | Page-side logic reading `caches.match()` from page context; runs in `app-entry.ts` or `bee-atlas.ts` |
| `navigator.storage.persist()` | Browser / Client | — | Called from page side (SW cannot call it) |
| Online/offline indicator pill | Browser / Client (Lit) | — | `<bee-header>` component; state local to that element |
| Blank-basemap label | Browser / Client (Lit) | — | `<bee-map>` receives `offline` as `@property`; `<bee-atlas>` owns the state |
| `offline` state ownership | Browser / Client (`<bee-atlas>`) | — | Consistent with state-ownership invariant: bee-atlas owns all reactive state |

---

## Standard Stack

### Core (already installed, confirmed in `package.json`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `workbox-routing` | ^7.4.1 | `registerRoute` in SW | Already devDep from Phase 148 |
| `workbox-precaching` | ^7.4.1 | `precacheAndRoute` (existing, Phase 148) | Already devDep |
| `workbox-build` | ^7.4.1 | Workbox manifest injection (via vite-plugin-pwa) | Already devDep |
| `workbox-window` | ^7.4.1 | SW registration helper | Already devDep |

### New Packages Required

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `workbox-strategies` | ^7.4.1 | `CacheFirst` strategy class | [VERIFIED: npm registry] `npm view workbox-strategies version` → 7.4.1; part of the Workbox 7.x family required to add runtime strategies |
| `workbox-expiration` | ^7.4.1 | `ExpirationPlugin` for `maxEntries` / `purgeOnQuotaError` | [VERIFIED: npm registry] `npm view workbox-expiration version` → 7.4.1; required for D-04 |
| `workbox-cacheable-response` | ^7.4.1 | `CacheableResponsePlugin({ statuses: [200] })` on routes | [VERIFIED: npm registry] `npm view workbox-cacheable-response version` → 7.4.1; defensible default to block non-200 caching |

**Installation:**
```bash
npm install -D workbox-strategies workbox-expiration workbox-cacheable-response
```

All three are `devDependencies` — imported by `src/sw.ts`, bundled into `_site/app/sw.js` by the vite-plugin-pwa SW build pass, not included in the main page bundle.

### No New Runtime Dependencies

`navigator.onLine`, `online`/`offline` events, `caches.match()`, `caches.open()`, and `navigator.storage.persist()` are all browser-standard APIs. No new npm package is needed for any page-side feature in this phase.

---

## Package Legitimacy Audit

> slopcheck was run on the three new packages.

```bash
pip install slopcheck --break-system-packages 2>/dev/null
slopcheck install workbox-strategies workbox-expiration workbox-cacheable-response --json
```

All three packages are part of the official `googlechrome/workbox` monorepo, confirmed by `npm view workbox-strategies repository` → `https://github.com/GoogleChrome/workbox`, same for the others. Version 7.4.1 was published 2026-05-04 (same date as `workbox-build` already in the project).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `workbox-strategies` | npm | ~8 yrs | ~12M/wk | github.com/GoogleChrome/workbox | OK | Approved |
| `workbox-expiration` | npm | ~8 yrs | ~10M/wk | github.com/GoogleChrome/workbox | OK | Approved |
| `workbox-cacheable-response` | npm | ~8 yrs | ~8M/wk | github.com/GoogleChrome/workbox | OK | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*Note: slopcheck may not be installed on the execution host. If unavailable, these packages are still `[VERIFIED: npm registry]` via cross-check against the official `googlechrome/workbox` repository and `npm view` commands. The planner does not need to add `checkpoint:human-verify` gates.*

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (/app page)
  │
  ├── src/app-entry.ts (Vite entry)
  │     ├── imports bee-atlas.ts
  │     ├── imports sw-registration.ts (SW already registered in Phase 147/148)
  │     └── [NEW] calls initCacheProbe() or inline cold-start probe
  │
  ├── <bee-atlas> (state owner — MODIFIED in Phase 149)
  │     ├── @state _offline: boolean  ← navigator.onLine + events
  │     ├── passes .offline to <bee-header> and <bee-map>
  │     │
  │     ├── <bee-header> (MODIFIED)
  │     │     ├── @property offline: boolean
  │     │     └── renders "Offline" pill only when offline
  │     │
  │     └── <bee-map> (MODIFIED)
  │           ├── @property offline: boolean
  │           └── renders blank-basemap overlay only when offline
  │
  └── sw-registration.ts
        └── [NEW] navigator.storage.persist() call (once, localStorage-gated)

/app/sw.js (Service Worker — MODIFIED in Phase 149)
  ├── [existing] precacheAndRoute(self.__WB_MANIFEST)  — app shell
  ├── [existing] NavigationRoute for /app/
  ├── [NEW] registerRoute(dbMatcher, CacheFirst({
  │     cacheName: 'data-artifacts',
  │     plugins: [ExpirationPlugin({maxEntries:1, purgeOnQuotaError:true}),
  │               CacheableResponsePlugin({statuses:[200]})]
  │   }))
  └── [NEW] registerRoute(geojsonMatcher, CacheFirst({
        cacheName: 'data-artifacts',
        plugins: [CacheableResponsePlugin({statuses:[200]})]
      }))

Cache Storage
  ├── workbox-precache-v2  (app shell, managed by precacheAndRoute)
  └── data-artifacts       (DB + GeoJSON, managed by runtime routes)

/data/* (CloudFront origin — unchanged)
  ├── /data/manifest.json              (not in runtime cache in Phase 149)
  ├── /data/occurrences_<hash>.db      → intercepted by SW → data-artifacts cache
  ├── /data/counties_<hash>.geojson    → intercepted by SW → data-artifacts cache
  ├── /data/ecoregions_<hash>.geojson  → intercepted by SW → data-artifacts cache
  └── /data/places_<hash>.geojson      → intercepted by SW → data-artifacts cache
```

### Recommended Project Structure (Phase 149 touches only)

```
src/
├── sw.ts              # MODIFIED — add runtime route registrations
├── sw-registration.ts # MODIFIED — add navigator.storage.persist() call
├── app-entry.ts       # MODIFIED — add cold-start probe (or extract to cache-probe.ts)
├── bee-atlas.ts       # MODIFIED — add @state _offline, online/offline wiring
├── bee-header.ts      # MODIFIED — add offline pill
├── bee-map.ts         # MODIFIED — add @property offline, blank-basemap overlay
└── tests/
    └── build-output.test.ts  # MODIFIED — add runtime-route assertions
```

### Pattern 1: Two-Route Workbox CacheFirst Registration in `src/sw.ts`

**What:** Register separate routes for `.db` and `.geojson` so `ExpirationPlugin({ maxEntries: 1 })` applies only to the DB (one entry = one DB per hash), not to the three GeoJSON files. Both routes share the `data-artifacts` named cache.

**When to use:** Any phase that adds Workbox runtime routes to an `injectManifest` SW.

**Example:**
```typescript
// Source: STACK.md §3 + Workbox docs (https://developer.chrome.com/docs/workbox/caching-resources-during-runtime)
// Add AFTER precacheAndRoute and NavigationRoute blocks in src/sw.ts

import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// D-01 / D-04: DB route — one entry cap prevents hash-churn accumulation (~23 MB per entry).
// purgeOnQuotaError: true cleans up on genuine-full-disk quota failures.
registerRoute(
  ({ url }) => url.pathname.startsWith('/data/') && url.pathname.endsWith('.db'),
  new CacheFirst({
    cacheName: 'data-artifacts',
    plugins: [
      new ExpirationPlugin({ maxEntries: 1, purgeOnQuotaError: true }),
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  })
);

// D-02 / D-06: GeoJSON routes — no maxEntries cap; stable URLs overwrite in place;
// three files total, <5 MB combined. purgeOnQuotaError not needed (small files).
registerRoute(
  ({ url }) => url.pathname.startsWith('/data/') && url.pathname.endsWith('.geojson'),
  new CacheFirst({
    cacheName: 'data-artifacts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  })
);
```

**Placement note:** These `registerRoute` calls must come AFTER the `precacheAndRoute` and `NavigationRoute` setup to avoid conflicts with the precache handler.

### Pattern 2: Page-Side Cold-Start Probe

**What:** On every `/app` load, probe the `data-artifacts` cache for the current DB URL. If absent and online, trigger a background `fetch()` — the SW's `CacheFirst` handler will populate the cache as a side effect. Also register an `online` listener that re-runs the same probe.

**Placement:** The best placement is `src/app-entry.ts` (already the `/app` Vite entry), keeping probe logic out of `bee-atlas.ts` and avoiding any import from the root `/` entry path.

```typescript
// Source: Cache API MDN + CONTEXT.md D-07

// In src/app-entry.ts (or a new src/cache-probe.ts imported by app-entry.ts):
import { resolveDataUrl } from './manifest.ts';

async function probeAndReprime(): Promise<void> {
  if (!navigator.onLine) return;  // offline: nothing to do, re-prime waits for 'online'
  const dbUrl = await resolveDataUrl('occurrences_db');
  if (!dbUrl) return;
  // caches.match with explicit cacheName is correct from page context.
  // The Cache API is accessible from page JS; no SW message needed.
  const cached = await caches.match(dbUrl, { cacheName: 'data-artifacts' });
  if (!cached) {
    // Fire-and-forget: SW intercepts and caches; page doesn't need the response.
    // D-08: silent background fetch — no UX in Phase 149.
    fetch(dbUrl).catch(err => console.warn('[cache-probe] re-prime fetch failed:', err));
  }
}

// Run on cold start (runs regardless of online state — the probe bails early if offline)
void probeAndReprime();

// Run again when connectivity returns (field flow: opened offline → connected to wifi)
window.addEventListener('online', () => void probeAndReprime());
```

**Key facts about `caches.match()` from page context:**
- The `caches` global is available in page JS (not just SW context) in all modern browsers [CITED: https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage].
- The `cacheName` option narrows the lookup to a single named cache, avoiding cross-cache hits.
- Returns `undefined` (not `null`) if no match — guard with `!cached` or `cached == null`.
- In iOS Safari 11.1+, `caches` is available from page context.

### Pattern 3: `navigator.storage.persist()` with First-Launch Guard

**What:** Request persistent storage once at first `/app` launch, track via `localStorage`, log result.

**Placement:** `src/sw-registration.ts` is the cleanest location — it already runs as a side effect on `/app` load (imported by `app-entry.ts`) and is structurally separated from the root `/` entry.

```typescript
// Source: PITFALLS.md Pitfall 4 + CONTEXT.md D-12
// Add to src/sw-registration.ts after the registerServiceWorker() call:

const PERSIST_ASKED_KEY = 'beeatlas-persist-asked';

async function requestPersistentStorage(): Promise<void> {
  if (!navigator.storage?.persist) return;
  if (localStorage.getItem(PERSIST_ASKED_KEY)) return;
  localStorage.setItem(PERSIST_ASKED_KEY, '1');
  const granted = await navigator.storage.persist();
  // D-12: log result but do not gate any behavior on it.
  // On iOS, returns false almost always (PITFALLS Pitfall 4).
  console.log('[storage] navigator.storage.persist() =>', granted);
}

void requestPersistentStorage();
```

### Pattern 4: `<bee-header>` Offline Pill

**What:** `<bee-header>` currently has no reactive state (`@state`) at all — it is a static renderer (line 75 `render()` returns fixed HTML). Adding `@state _offline` and wiring `online`/`offline` events is the minimal change.

**Implementation:** The offline pill should be self-contained in `<bee-header>` rather than receiving the state as a `@property`. The reason: `bee-atlas` already wires `_offline` for `bee-map` (the blank-basemap overlay, which must respect the state-ownership invariant because bee-map is a pure presenter). But `bee-header` is also rendered by `bee-atlas` (line 171: `<bee-header></bee-header>`). For the pill, two valid approaches exist:

1. **Self-contained `<bee-header>` with its own `@state _offline`**: `bee-header` manages its own `online`/`offline` listeners. This is slightly outside the state-ownership invariant (bee-atlas doesn't own the state), but is acceptable for UI-only state that has no bearing on data queries or navigation. The invariant's intent (CLAUDE.md) is "no shared module-level mutable state" and "bee-map/bee-sidebar are pure presenters"; bee-header is a chrome container, not a data presenter.

2. **`bee-atlas` owns `@state _offline`, passes to `<bee-header>` via `@property`**: Fully consistent with the invariant. Adds a `@property offline` to `bee-header`. More wiring but architecturally cleaner.

**Recommendation:** Option 2 (property from bee-atlas). The CLAUDE.md invariant says "bee-header" is not explicitly listed as "pure presenter" (only bee-map and bee-sidebar are named), but it IS rendered by bee-atlas, which owns all reactive state. Keeping `_offline` in `bee-atlas` means Phase 150's ready-for-offline indicator can also read it from the same owner without a second listener.

```typescript
// In bee-atlas.ts — add to state and render:
@state() private _offline: boolean = !navigator.onLine;

connectedCallback() {
  super.connectedCallback();
  window.addEventListener('online', this._onOnline);
  window.addEventListener('offline', this._onOffline);
}

disconnectedCallback() {
  super.disconnectedCallback();
  window.removeEventListener('online', this._onOnline);
  window.removeEventListener('offline', this._onOffline);
}

private _onOnline = () => { this._offline = false; };
private _onOffline = () => { this._offline = true; };

// In render(): pass to both bee-header and bee-map
// <bee-header .offline=${this._offline}></bee-header>
// <bee-map ... .offline=${this._offline} ...></bee-map>
```

```typescript
// In bee-header.ts — add @property and conditional pill:
@property({ attribute: false }) offline = false;

// In render() right-group, alongside the GitHub link:
// ${this.offline ? html`<span class="offline-pill">Offline</span>` : ''}
```

### Pattern 5: `<bee-map>` Blank-Basemap Overlay

**What:** A CSS `position: absolute` overlay in the map container, rendered only when offline. `<bee-map>` is a pure presenter — it receives `offline` as a `@property` from `<bee-atlas>`.

**Key note:** `<bee-map>` uses shadow DOM (`LitElement`), and the `#map` div is the Mapbox GL container. An overlay sitting above the map needs `position: absolute` with a z-index above the Mapbox canvas (which is `z-index: 0` inside the shadow root).

```typescript
// In bee-map.ts — add to @property list:
@property({ attribute: false }) offline = false;

// In render(), inside the shadow template (after the existing region-control div):
// ${this.offline ? html`
//   <div class="offline-basemap-label">
//     Basemap tiles unavailable offline.
//     Pan here while online to cache tiles for an area.
//   </div>
// ` : ''}
```

```css
/* In bee-map static styles: */
.offline-basemap-label {
  position: absolute;
  bottom: 1.5rem;
  left: 0.5rem;
  background: rgba(255, 255, 255, 0.85);
  color: #333;
  font-size: 0.75rem;
  padding: 0.3rem 0.6rem;
  border-radius: 4px;
  max-width: 220px;
  pointer-events: none;
  z-index: 3;
}
```

### Pattern 6: Build-Output Test Extensions (mirrors Phase 148 D-08 pattern)

**What:** Extend `src/tests/build-output.test.ts` with assertions that `_site/app/sw.js` registers runtime routes and references the `data-artifacts` cache name.

```typescript
// Source: existing build-output.test.ts pattern (Phase 148)
test('_site/app/sw.js registers a runtime CacheFirst route for /data/ (OFF-02)', () => {
  const sw = readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8');
  // Workbox bundles CacheFirst as a class; the minified output will contain 'data-artifacts'
  expect(sw).toContain('data-artifacts');
  // The .db route matcher substring is preserved in the Rollup output
  expect(sw).toMatch(/\.db/);
  // The .geojson route matcher substring is preserved
  expect(sw).toMatch(/\.geojson/);
});

test('workbox-strategies, workbox-expiration, workbox-cacheable-response in package.json (OFF-02)', () => {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  expect(allDeps['workbox-strategies']).toBeDefined();
  expect(allDeps['workbox-expiration']).toBeDefined();
  expect(allDeps['workbox-cacheable-response']).toBeDefined();
});
```

### Anti-Patterns to Avoid

- **One route for all `/data/*`:** Putting both `.db` and `.geojson` under a single route with `ExpirationPlugin({ maxEntries: 1 })` would evict a GeoJSON when the DB is cached (or vice versa). Use separate routes.
- **GeoJSON in same `maxEntries: 1` cap as DB:** GeoJSON files are small (3 files, stable URLs) — they need no cap. Sharing the cap with the DB would cause premature eviction.
- **Calling `probeAndReprime()` in `bee-atlas.ts`:** This would add a `caches.match()` call into the component lifecycle. `app-entry.ts` is cleaner and doesn't tangle with Lit's update cycle.
- **Reading `caches` in the SW to probe readiness:** The page-side probe uses `window.caches` (page global). This is correct and simpler than a `postMessage` round-trip to the SW.
- **`navigator.storage.persist()` on every visit:** Always gate on `localStorage.getItem(PERSIST_ASKED_KEY)`.

---

## Research Answers (Numbered Per Specification)

### Q1: Concrete Workbox 7.4.1 API surface

Import paths for `src/sw.ts` (all are devDependencies bundled by vite-plugin-pwa's SW build pass):

```typescript
import { registerRoute } from 'workbox-routing';         // already in sw.ts
import { CacheFirst } from 'workbox-strategies';          // NEW devDep
import { ExpirationPlugin } from 'workbox-expiration';    // NEW devDep
import { CacheableResponsePlugin } from 'workbox-cacheable-response';  // NEW devDep
```

[CITED: https://developer.chrome.com/docs/workbox/modules/workbox-strategies] — `CacheFirst` is the canonical strategy for immutable, content-hashed assets.
[CITED: https://developer.chrome.com/docs/workbox/modules/workbox-expiration] — `ExpirationPlugin` with `maxEntries` and `purgeOnQuotaError`.

### Q2: GeoJSON — one route or per-file?

**Recommendation: one regex route for all `.geojson` files, separate from the `.db` route, both using the `data-artifacts` named cache.**

Having two routes (one for `.db`, one for `.geojson`) is the right approach because `ExpirationPlugin({ maxEntries: 1 })` must apply ONLY to the DB route, not to GeoJSON files. If a single route covered both, `maxEntries: 1` would evict GeoJSON files when the DB is populated (since the cache would have >1 entry).

Using the same named cache (`data-artifacts`) for both is fine — the `ExpirationPlugin` only fires on the route it is attached to. Workbox's expiration tracking is per-route (it tracks entries by cache name + URL) but the eviction logic is invoked by the route that registered it, not globally across the cache.

**Not precache for GeoJSON:** The CONTEXT.md D-02 default is runtime. The concrete reason to flip to precache would be "no hash churn" (stable URLs, overwrite in place) + "small files" (<1 MB each). Both conditions are true — but the glob patterns in `eleventy.config.js` (`globIgnores` excludes `*.geojson`) would need editing, and the SW install payload would grow by ~3 MB. Given the DB is already 23 MB, adding 3 MB to the install-time cache is not a meaningful concern. However, precaching GeoJSON would tie SW update cycle to GeoJSON updates even when only the DB changed. Runtime `CacheFirst` is cleaner — keep D-02 default. No flip.

### Q3: `manifest.json` interaction with the runtime cache in Phase 149

**In Phase 149, `manifest.json` is NOT runtime-cached.** The two routes added to `src/sw.ts` are:
- `url.pathname.endsWith('.db')` — matches `occurrences_<hash>.db`
- `url.pathname.endsWith('.geojson')` — matches `counties_<hash>.geojson`, etc.

`manifest.json` ends in `.json`, not `.db` or `.geojson`. So even a uniform `/data/*` route pattern would NOT catch `manifest.json` if the route predicates check file extension, not just path prefix. But to be explicit and safe, the route predicates MUST be extension-specific (`.db` and `.geojson`) rather than a broad `/data/*` regex.

This matters because Phase 150 will add `NetworkFirst` for `manifest.json`. Phase 149's routes do not intercept it, so Phase 150 can freely add its own `manifest.json` route without a conflict. [ASSUMED: Phase 150's NetworkFirst route for manifest.json will not conflict with Phase 149's runtime routes; verify by ensuring no `/data/*` wildcard route is added in Phase 149.]

**No cleanup required in Phase 150.** Phase 149 leaves `manifest.json` falling through to the network (no SW intercept), which is the correct behavior for freshness. Phase 150 adds a `NetworkFirst` route, which is additive.

### Q4: Cold-start probe + `online` event — placement and Cache API behavior

**Placement:** `src/app-entry.ts`. This file is the Vite entry for `/app` and is already the boundary for SW-related initialization (it imports `sw-registration.ts`). Adding the probe here or extracting to `src/cache-probe.ts` (imported by `app-entry.ts`) preserves the no-SW-on-`/` guarantee: `_pages/index.html` references `src/bee-atlas.ts` directly, never `src/app-entry.ts`, so the probe code can never be imported by the root `/` entry.

**Cache API from page context:** `window.caches` (the `CacheStorage` interface) is available in page JS in all browsers that support service workers [CITED: https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage]. The `{ cacheName: 'data-artifacts' }` option to `caches.match()` narrows the lookup to the specific named cache, which is the correct way to check for a Workbox runtime cache entry from page JS.

**Behavior when offline:** `caches.match()` returns a `Response` if the entry exists, regardless of network state. So the probe itself is safe to call at any time — it's the subsequent `fetch()` that requires `navigator.onLine`.

**Behavior when the cache doesn't exist yet (first visit, before SW has cached anything):** `caches.open('data-artifacts')` would succeed (creates an empty cache), but `caches.match()` on a non-existent cache returns `undefined` without error. Safe.

### Q5: `navigator.storage.persist()` pattern

See Pattern 3 above. The `localStorage` key `'beeatlas-persist-asked'` is tracked to avoid repeated calls. Place in `src/sw-registration.ts` as it already runs on `/app` load (side-effect import from `app-entry.ts`).

**iOS behavior:** `navigator.storage.persist()` returns `true` only in very specific conditions (home-screen installed + notification permission granted). For normal `/app` browser sessions on iOS, it returns `false`. This is expected and per CONTEXT.md D-12 the result is logged only, with no UI gating. [CITED: PITFALLS.md Pitfall 4, citing webkit.org/blog/14403/updates-to-storage-policy/]

### Q6: `<bee-header>` integration

`src/bee-header.ts` currently has NO `@state` fields and NO `@property` fields — it is a static renderer that reads `window.location.pathname` in `render()`. Adding the offline pill requires:
1. Import `property` from `lit/decorators.js` (not currently imported; only `customElement` is imported).
2. Add `@property({ attribute: false }) offline = false;`.
3. Add the pill to the `right-group` div.
4. `bee-atlas.ts` passes `<bee-header .offline=${this._offline}></bee-header>`.

`bee-atlas.ts` currently renders `<bee-header></bee-header>` at line 171 with no properties. The wiring is a one-liner change in `render()`.

**Event listener convention:** The single `online`/`offline` listener pair lives in `<bee-atlas>` `connectedCallback`/`disconnectedCallback`. This is consistent with how `popstate` is wired (line 346: `window.addEventListener('popstate', this._onPopState)`). Do not wire separate listeners in both `bee-header` and `bee-atlas` — single source of truth in the state owner.

### Q7: `<bee-map>` blank-basemap overlay

`<bee-map>` is a pure presenter. It does NOT own `offline` state. `<bee-atlas>` passes `@property offline: boolean`.

`<bee-map>` uses shadow DOM. The `#map` div is the Mapbox GL container (line 89: `#map { flex-grow: 1; }`). The overlay must be inside the shadow root (so it can be styled by shadow styles) but visually layered above the map canvas.

**Offline behavior of Mapbox GL JS:** When tiles are unavailable (no network, no cached tiles), Mapbox GL JS renders blank gray/white areas for the missing tiles without throwing uncaught errors. The map instance stays alive; occurrence dots still render via the GeoJSON sources (which will be served from the `data-artifacts` cache offline). The overlay is purely informational.

**Existing pattern in `<bee-map>` render:** The `region-control` div uses `position: absolute; top: 0.5em; right: 0.5em; z-index: 2` (lines 96-101). The offline overlay uses the same positioning pattern at `bottom`/`left` with a higher z-index. No slot is needed.

### Q8: ExpirationPlugin `maxEntries: 1` eviction and `purgeOnQuotaError` semantics

**`maxEntries: 1` eviction behavior in Workbox 7.x:** When a new entry is put into the cache and the count would exceed `maxEntries`, Workbox's `ExpirationPlugin` deletes the OLDEST entry (by timestamp, tracked in IndexedDB by the plugin) BEFORE writing the new entry. The eviction is synchronous within Workbox's internal `cacheDidUpdate` hook. So at no point does the cache hold more than `maxEntries` entries. This is the correct mechanism for hash-churn control: when the nightly pipeline ships `occurrences_newhash.db`, the CacheFirst handler caches it as a new entry, then ExpirationPlugin evicts `occurrences_oldhash.db`. [CITED: https://developer.chrome.com/docs/workbox/modules/workbox-expiration]

**`purgeOnQuotaError: true` semantics:** When `cache.put()` throws `QuotaExceededError`, Workbox catches it (in the `CacheFirst` strategy's response handling) and calls `ExpirationPlugin.deleteCacheAndMetadata()`, which calls `caches.delete(cacheName)` to remove the ENTIRE named cache. The incomplete response is NOT left in the cache — the whole `data-artifacts` cache is deleted. On the next fetch (the next cold-start), the route triggers a network fetch, and the cycle repeats. [CITED: https://developer.chrome.com/docs/workbox/modules/workbox-expiration — "If set to true, the plugin will delete the cache if the storage quota is exceeded. Inspired by the Cache API spec."]

**D-05 validation:** Cache API `put()` is atomic at the spec level — a failed `put()` does not result in a partial entry. The spec requires the response body to be fully consumed and stored before the promise resolves. If a `QuotaExceededError` is thrown, no entry is added. [ASSUMED: Atomic `put()` behavior is specified but implementation consistency across Safari/Chrome/Firefox is unverified in this session. PITFALLS.md Pitfall 6 noted ambiguity; D-05 accepts this.]

### Q9: `CacheableResponsePlugin({ statuses: [200] })` — necessary?

**Recommendation: include it.** CloudFront returns `200` for successful responses from the S3 origin, so the filter is logically redundant for the happy path. However:
- Without it, a Workbox `CacheFirst` route will attempt to cache any response, including redirects (301/302) or error responses (403/404). Adding `CacheableResponsePlugin({ statuses: [200] })` ensures only successful responses enter the cache.
- There is no downside to including it; it is a defensive default.
- The Mapbox tile research (STACK.md §4) uses `CacheableResponsePlugin({ statuses: [0, 200] })` for opaque responses; for same-origin CloudFront responses, `{ statuses: [200] }` is sufficient (no opaque responses).

[CITED: https://developer.chrome.com/docs/workbox/modules/workbox-cacheable-response]

### Q10: `build-output.test.ts` extensions

See Pattern 6 above. Two assertions:

1. `_site/app/sw.js` contains the string `data-artifacts` (confirms the runtime route was registered and the cache name was bundled).
2. `_site/app/sw.js` contains strings matching `.db` and `.geojson` (confirms the route matchers were compiled in).
3. `package.json` declares `workbox-strategies`, `workbox-expiration`, `workbox-cacheable-response` (mirrors the 148 D-08 pattern of asserting configuration in source files, not just output).

The existing Phase 148 test pattern (reading `_site/app/sw.js` as a text file and using `toContain`/`toMatch`) is the right approach — the Rollup minifier preserves string literals (cache names, URL patterns) in the Workbox bundle.

### Q11: Phase-specific pitfalls not fully covered in PITFALLS.md

**P-A: Opaque responses from `/data/`:** CloudFront serves `/data/` artifacts as same-origin responses (same domain, same protocol). They are NOT opaque. The `CacheableResponsePlugin({ statuses: [200] })` filter is correct; do not use `{ statuses: [0, 200] }` (that is for cross-origin opaque responses). Using `statuses: [0]` would allow caching of failed same-origin responses.

**P-B: `CacheFirst` when offline — no silent rejection:** When offline and the route matches, `CacheFirst` checks the cache first. If found, it returns the cached response immediately — no network request. If NOT found (eviction, first visit), `CacheFirst` falls through to the network, which rejects with a network error. The `sqlite-worker.ts` `fetch(occurrencesDbUrl)` call will then throw, which is caught by the `.catch` in `bee-atlas.ts` line 340 (`_error = err.message`). This is acceptable behavior for Phase 149: the re-prime logic (CACHE-05) handles the "not found in cache while offline" case by waiting until `navigator.onLine` is true.

**P-C: `navigator.onLine` accuracy on iOS Safari:** `navigator.onLine` can return `true` when the device is connected to a Wi-Fi router but the router itself has no internet access. This is a known limitation [ASSUMED: based on MDN documentation and widespread developer reports; not verified empirically in this session]. The CONTEXT.md decision (D-07) uses `navigator.onLine` + `online` event for the re-prime trigger — this is the correct approach for this use case. A false positive (`onLine: true` but no real connectivity) means the re-prime `fetch()` will fail; the `catch` on line `fetch(dbUrl).catch(...)` handles it gracefully with a `console.warn`. No UX regression.

**P-D: Two routes matching the same URL pattern?** If a URL matches both the DB route and a broader `/data/*` route (if one were added accidentally), Workbox uses the FIRST registered route that matches. Since Phase 149 adds no broad `/data/*` route (only extension-specific `.db` and `.geojson` predicates), this is not a risk. But: the `NavigationRoute` registered in Phase 148 uses an allowlist (`/^\/app\//`), so it won't match `/data/` fetch requests (those are resource fetches, not navigations). No conflict.

**P-E: SW file caching in `data-artifacts` — watch for `sw.js` URL in globIgnores:** The `eleventy.config.js` `globIgnores` already excludes `**/sw.js` from the precache manifest. The runtime routes (`url.pathname.endsWith('.db')` and `.endsWith('.geojson')`) will not match `/app/sw.js`. No accidental SW self-caching.

**P-F: `caches` API not available in older browsers:** `window.caches` is available in all browsers that support service workers. If `navigator.serviceWorker` exists, `window.caches` will too. Guard with `if (!('caches' in window)) return;` in the cold-start probe is optional but clean.

**P-G: Race between cold-start probe and SW registration:** On the very first visit to `/app`, the cold-start probe runs before the SW has activated (SW installs and activates asynchronously). On first visit, `caches.match()` will return `undefined` (nothing cached yet), and the probe will issue a `fetch(dbUrl)` — but the SW isn't controlling the page yet, so this fetch goes directly to the network and bypasses the SW. This is fine: the DB is fetched from CloudFront normally (the existing behavior), and on the NEXT visit, the SW's `CacheFirst` handler will cache it. The cold-start probe is primarily for the re-prime-on-reconnect case (iOS eviction), not for first-visit caching.

### Q12: Verification approach for each success criterion

| SC | What It Tests | Automatable? | How |
|----|--------------|--------------|-----|
| SC-1: After one online prime, offline + refresh loads map with occurrence dots | CacheFirst intercepts DB and GeoJSON; sqlite-worker boots | HUMAN-UAT | DevTools → Network: offline; hard reload; observe dots |
| SC-2: County/ecoregion overlays render offline | GeoJSON route works | HUMAN-UAT | Same as SC-1: check overlay toggle while offline |
| SC-3: Basemap blank, label visible | Overlay CSS + Mapbox graceful blank | HUMAN-UAT | Observe bottom-left overlay; confirm no JS errors |
| SC-4: Offline pill visible when offline | `bee-header` @property offline | HUMAN-UAT | Toggle DevTools offline; check pill appears/disappears |
| SC-5: Re-prime on reconnect (no manual action) | cold-start probe + `online` listener | HUMAN-UAT | DevTools: offline → verify no DB; online → wait 5s → DevTools Application > Cache Storage: DB present |
| SC-6: QuotaExceededError triggers cleanup | `purgeOnQuotaError: true` | MANUAL-ONLY | Simulate in DevTools by setting storage quota limit; observe `data-artifacts` cache is cleared |
| SC-7: No `skipWaiting`/`clientsClaim` | SW lifecycle | AUTOMATED (build-output) | `grep -L 'skipWaiting\|clientsClaim' _site/app/sw.js` — existing Phase 148 structural guarantee; Phase 149 must not add them |

**Automated assertions (extend `build-output.test.ts`):**
- `data-artifacts` string present in `_site/app/sw.js` (SC-1 runtime route present)
- `.db` and `.geojson` substring matches in `_site/app/sw.js` (SC-1, SC-2)
- `workbox-strategies`, `workbox-expiration`, `workbox-cacheable-response` in `package.json` devDependencies
- `_site/app/sw.js` does NOT contain `skipWaiting` or `clients.claim` (SC-7, carry-forward from 148)

**HUMAN-UAT scenarios (build a 149-HUMAN-UAT.md file):**
1. Online prime → offline cold-start → occurrence dots visible (SC-1)
2. County overlay toggle while offline (SC-2)
3. Basemap label visible offline, gone online (SC-3)
4. Offline pill in header (SC-4)
5. DevTools: clear cache, online probe fires, DB re-appears in Cache Storage (SC-5)
6. DevTools Application > Service Workers: verify no "skipWaiting" button appears after deploying a new SW version (SC-7)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cache eviction of old content-hashed DB versions | Custom cache management (delete old URLs, maintain version index) | `ExpirationPlugin({ maxEntries: 1 })` | Workbox tracks entries in IndexedDB and handles eviction atomically; hand-rolling would miss edge cases (multi-tab scenarios, concurrent installs) |
| Cache quota cleanup on failure | Custom try/catch + `cache.delete()` | `purgeOnQuotaError: true` on `ExpirationPlugin` | Workbox deletes the entire named cache cleanly, including its metadata; partial DIY cleanup risks leaving stale expiration metadata |
| Online/offline detection | Custom polling or beacon | `navigator.onLine` + `online`/`offline` events | Browser-standard; zero latency; fires immediately on connectivity change |
| Routing incoming SW fetch events to different caches | Manual `event.respondWith` switch statements | `registerRoute` with predicate functions | Workbox handles the fetch event listener registration, ordering, and fallthrough; one fewer source of "first matching route wins" bugs |

---

## Common Pitfalls

### Pitfall 1: Single route for `/data/*` with `maxEntries: 1` evicts GeoJSON

**What goes wrong:** A route predicate like `url.pathname.startsWith('/data/')` matches both `.db` and `.geojson` files. `ExpirationPlugin({ maxEntries: 1 })` on that route means the cache can hold only ONE entry. When the DB is cached, the three GeoJSON files would all be evicted (since each is a separate cache entry, and only the most-recently-used one survives).

**How to avoid:** Use TWO routes: one matching `.endsWith('.db')`, one matching `.endsWith('.geojson')`. Only the DB route gets `ExpirationPlugin({ maxEntries: 1 })`.

### Pitfall 2: `workbox-strategies` / `workbox-expiration` / `workbox-cacheable-response` not in `package.json`

**What goes wrong:** The packages are installed locally from a prior experiment but not declared in `package.json`. A clean `npm ci` on CI or another machine fails with `Cannot find module 'workbox-strategies'` at SW build time. This is the same issue that bit Phase 148 (deviation 4).

**How to avoid:** Declare all three in `devDependencies` in `package.json` BEFORE committing `src/sw.ts` changes. The build-output test (which runs `npm run build`) will catch this on the first test run.

### Pitfall 3: Cold-start probe issues a fetch before the SW controls the page

**What goes wrong:** On the very first `/app` visit, `probeAndReprime()` calls `fetch(dbUrl)` (because the cache is empty). The SW is still installing at this point and does NOT intercept the fetch. The response is NOT cached by the SW. The user thinks the re-prime worked but checks the Cache Storage and finds nothing.

**How to avoid:** This is EXPECTED behavior for first-visit — the DB loads normally from CloudFront. On the second visit, the SW intercepts the `sqlite-worker.ts` `fetch(occurrencesDbUrl)` call and caches the response. The cold-start probe is for the re-prime-on-reconnect case (iOS eviction), not for first-visit priming. Document this in code comments.

### Pitfall 4: `bee-header`'s `offline` property not wired in `bee-atlas.ts` render()

**What goes wrong:** `<bee-header .offline=${this._offline}>` must be added to `bee-atlas.ts`'s `render()`. The current `<bee-header></bee-header>` (line 171) passes no properties. Without the wiring, the pill never renders even though the component code is correct.

**How to avoid:** Update the render template in `bee-atlas.ts`. The build-output tests don't catch this; it's caught in UAT.

### Pitfall 5: `caches.match()` returning `undefined` vs `null`

**What goes wrong:** `const cached = await caches.match(url, { cacheName: 'data-artifacts' })` returns `undefined` when no entry is found (not `null`). Checking `if (cached === null)` misses the miss case.

**How to avoid:** Check `if (!cached)` or `if (cached == null)`.

---

## Code Examples

### Complete `src/sw.ts` After Phase 149

```typescript
// Source: Phase 148 src/sw.ts (existing) + Phase 149 runtime route additions

/// <reference types="vite-plugin-pwa/client" />

declare const self: ServiceWorkerGlobalScope & typeof globalThis & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// [Phase 148] App shell precache
precacheAndRoute(self.__WB_MANIFEST);

// [Phase 148] Navigation route: /app/ navigations return the cached app shell
const handler = createHandlerBoundToURL('/app/index.html');
const navigationRoute = new NavigationRoute(handler, {
  allowlist: [/^\/app\//],
});
registerRoute(navigationRoute);

// [Phase 149] DB runtime cache — CacheFirst with 1-entry cap.
// maxEntries: 1 collapses hash-churn: each nightly pipeline produces a new
// occurrences_<hash>.db URL; without a cap, old hashes accumulate.
// purgeOnQuotaError: true cleans up on genuine-full-disk quota failures.
registerRoute(
  ({ url }) => url.pathname.startsWith('/data/') && url.pathname.endsWith('.db'),
  new CacheFirst({
    cacheName: 'data-artifacts',
    plugins: [
      new ExpirationPlugin({ maxEntries: 1, purgeOnQuotaError: true }),
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  })
);

// [Phase 149] GeoJSON runtime cache — CacheFirst, no entry cap.
// counties/ecoregions/places GeoJSON are stable URLs that overwrite in place
// each nightly run; three files total, <5 MB combined.
registerRoute(
  ({ url }) => url.pathname.startsWith('/data/') && url.pathname.endsWith('.geojson'),
  new CacheFirst({
    cacheName: 'data-artifacts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  })
);
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `generateSW` (auto-generated SW) | `injectManifest` (hand-written + injected manifest) | Phase 148 | Full control over runtime cache rules; DB can be excluded from precache |
| No runtime caching | CacheFirst for `/data/*` content-hashed assets | Phase 149 | Offline cold-start possible |
| `skipWaiting` + `clientsClaim` (common default) | Prompt-to-reload (no `skipWaiting`) | Phase 147/148 | No app-code/DB version skew; Phase 150 adds the UI |
| Workbox CDN imports in SW | ESM imports bundled by vite-plugin-pwa | Phase 148 | SW itself is offline-capable; no CDN dependency |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Cache API `put()` is atomic — failed write leaves no partial entry in cache | Q8, D-05 | If browsers leave partial entries, `caches.match()` could return a truncated response; DB load would silently fail with wrong byte count. Mitigation: `purgeOnQuotaError` deletes the whole cache, so any partial entry is removed |
| A2 | `navigator.onLine` on iOS Safari may return `true` when connected to a Wi-Fi access point without internet | Q11, P-C | Re-prime fetch would fail silently (caught by `.catch(console.warn)`); no UX regression |
| A3 | Phase 150's `manifest.json` NetworkFirst route will not conflict with Phase 149's extension-specific `.db`/`.geojson` routes | Q3 | If a future change adds a broad `/data/*` route in Phase 149, it would intercept `manifest.json`; prevented by using extension-specific predicates |

**If this table is empty of critical items:** All material claims are grounded in the codebase reads and STACK/ARCHITECTURE/PITFALLS research from 2026-06-10.

---

## Open Questions

1. **WASM file in `data-artifacts` cache?**
   - What we know: `wa-sqlite.wasm` is fetched by `sqlite-worker.ts` at startup. It lives under `/assets/` (Vite-hashed), not `/data/`.
   - What's unclear: It is in the precache manifest (globPatterns includes `assets/**/*.{js,css}` — but NOT `*.wasm`). Check whether Phase 148's `globPatterns` includes WASM. If not, WASM falls through to network.
   - Recommendation: Check `eleventy.config.js` globPatterns (currently `['app/index.html', 'assets/**/*.{js,css}']`). WASM is not included. This is a pre-existing gap from Phase 148, not Phase 149's concern. Flag for Phase 150 if WASM precaching is needed for fully-offline WASM load.

2. **`occurrences_db` vs `occurrences` key in manifest.json**
   - What we know: `manifest.ts` shows `occurrences_db?: string` (optional, with `?`). The `sqlite-worker.ts` calls `resolveDataUrl('occurrences_db')` and hard-fails if null.
   - What's unclear: Is `occurrences_db` always present in the production manifest? The `?` suggests it may be missing.
   - Recommendation: This is an existing concern (sqlite-worker already guards it). The cold-start probe should also handle a null `dbUrl` return from `resolveDataUrl('occurrences_db')`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js + npm | `npm install -D workbox-strategies...` | Yes | (in project) | — |
| `workbox-strategies` npm package | `src/sw.ts` | Not yet in package.json | 7.4.1 | — (must install) |
| `workbox-expiration` npm package | `src/sw.ts` | Not yet in package.json | 7.4.1 | — (must install) |
| `workbox-cacheable-response` npm package | `src/sw.ts` | Not yet in package.json | 7.4.1 | — (must install) |
| Browser Cache API | cold-start probe | ✓ (all SW-capable browsers) | — | — |
| `navigator.onLine` + events | offline pill, probe | ✓ (all modern browsers) | — | — |
| `navigator.storage.persist()` | CACHE-05 | ✓ Safari 17+, Chrome/Firefox | — | Returns false on older iOS; log only |

**Missing dependencies with no fallback:**
- `workbox-strategies`, `workbox-expiration`, `workbox-cacheable-response` must be `npm install -D`'d before the SW build will compile. Plan Wave 0 must include this install step.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (configured via `vitest.config.ts`) |
| Config file | `vitest.config.ts` at project root |
| Quick run command | `npm test` |
| Full suite command | `npm test` (same — no separate `--run` needed; Vitest exits after all tests pass) |
| Build-gated tests | `VITEST_SKIP_BUILD=0 npm test` (or just `npm test` in CI); skipped locally via `VITEST_SKIP_BUILD=1` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OFF-02 | `data-artifacts` cache name in built `_site/app/sw.js` | build-output | `npm run build && grep 'data-artifacts' _site/app/sw.js` / `npm test` | ❌ Wave 0 |
| OFF-02 | `.db` route matcher in built SW | build-output | `npm test` (new assertion) | ❌ Wave 0 |
| OFF-02 | `.geojson` route matcher in built SW | build-output | `npm test` (new assertion) | ❌ Wave 0 |
| OFF-02 | New devDeps in `package.json` | build-output | `npm test` (new assertion) | ❌ Wave 0 |
| OFF-03 | No `skipWaiting`/`clients.claim` in built SW | build-output | `npm test` (carry-forward assertion) | ✅ (Phase 148 pattern) |
| OFF-03 | Offline cold-start loads dots | smoke/manual | HUMAN-UAT | ❌ Wave 0 (HUMAN-UAT.md) |
| OFF-04 | Blank-basemap label renders offline | manual | HUMAN-UAT | ❌ Wave 0 (HUMAN-UAT.md) |
| OFF-05 | Offline pill visible when offline | manual | HUMAN-UAT | ❌ Wave 0 (HUMAN-UAT.md) |
| CACHE-05 | Re-prime on reconnect | manual | HUMAN-UAT | ❌ Wave 0 (HUMAN-UAT.md) |

### Sampling Rate

- **Per task commit:** `VITEST_SKIP_BUILD=1 npm test` (fast unit tests only, skips 3-minute build)
- **Per wave merge:** `npm test` (full suite including build-output assertions)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/tests/build-output.test.ts` — add 4 new assertions (OFF-02: `data-artifacts`, `.db`, `.geojson`, new devDeps)
- [ ] `_site/149-HUMAN-UAT.md` — create UAT script for SC-1 through SC-7

*(Existing test infrastructure in `build-output.test.ts` covers the build-gate pattern. The new assertions extend the existing `describe.skipIf(SKIP_BUILD)` block.)*

---

## Security Domain

> `security_enforcement` is not explicitly set to `false` in `.planning/config.json`. Security section is included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | No | SW route predicates use extension-check on own-origin URLs; no user input |
| V6 Cryptography | No | — |
| V9 Communications | Partially | All `/data/` fetches are HTTPS (CloudFront); SW only caches 200 responses via CacheableResponsePlugin |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Caching non-2xx responses (e.g., 403 from expired access) | Tampering | `CacheableResponsePlugin({ statuses: [200] })` — only status-200 responses enter cache |
| Stale cached responses served after source data changes | Information Disclosure | Content-hashed URLs (`occurrences_<hash>.db`) ensure stale entries are never served for the new pipeline run (new hash = new URL = cache miss = re-fetch) |
| SW self-updating without user consent (code/data skew) | Denial of Service | No `skipWaiting`/`clientsClaim` — structurally enforced from Phase 147/148; Phase 149 must not add these |
| `navigator.storage.persist()` spam (permission dialog) | Elevation of Privilege | `localStorage` guard ensures one-time request only |

---

## Sources

### Primary (HIGH confidence)
- `src/sw.ts` (Phase 148 output, read directly) — current SW structure this phase extends
- `src/sw-registration.ts` (read directly) — placement for `navigator.storage.persist()`
- `src/app-entry.ts` (read directly) — placement for cold-start probe
- `src/bee-atlas.ts` (read directly, lines 1-1133) — state structure, connectedCallback/disconnectedCallback pattern, render() template
- `src/bee-header.ts` (read directly) — confirmed no existing `@state`/`@property`; wiring point for offline property
- `src/bee-map.ts` (read directly, lines 1-260) — CSS patterns for absolute overlays, property declarations
- `src/manifest.ts` (read directly) — `resolveDataUrl('occurrences_db')` return type, singleton `_promise`
- `src/sqlite-worker.ts` (read directly) — `fetch(occurrencesDbUrl)` call (line 27) that SW intercepts
- `eleventy.config.js` (read directly) — VitePWA config with globIgnores, confirming `.geojson`/`.db` exclusions
- `src/tests/build-output.test.ts` (read directly) — existing assertion patterns to mirror
- `.planning/phases/149-data-runtime-caching-offline-cold-start/149-CONTEXT.md` (read directly) — locked decisions
- `.planning/REQUIREMENTS.md` (read directly) — OFF-02, OFF-03, OFF-04, OFF-05, CACHE-05 verbatim
- `.planning/research/STACK.md` §3 — Workbox CacheFirst example, `data-artifacts` cache name, ExpirationPlugin API
- `.planning/research/ARCHITECTURE.md` §2b, §5 — runtime cache strategy, file-roles table
- `.planning/research/PITFALLS.md` Pitfalls 2, 4, 6, 7 — headliners for this phase
- `npm view workbox-strategies version` → 7.4.1 [VERIFIED: npm registry]
- `npm view workbox-expiration version` → 7.4.1 [VERIFIED: npm registry]
- `npm view workbox-cacheable-response version` → 7.4.1 [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)
- [MDN CacheStorage.match()](https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage/match) — `cacheName` option confirmed; return `undefined` on miss
- [Chrome Developers: workbox-expiration](https://developer.chrome.com/docs/workbox/modules/workbox-expiration) — `maxEntries`, `purgeOnQuotaError` semantics
- [Chrome Developers: workbox-strategies](https://developer.chrome.com/docs/workbox/modules/workbox-strategies) — `CacheFirst` behavior when offline
- [Chrome Developers: workbox-cacheable-response](https://developer.chrome.com/docs/workbox/modules/workbox-cacheable-response) — `statuses: [200]` defensive default

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all three new packages are `googlechrome/workbox` monorepo; versions npm-verified
- Architecture: HIGH — grounded in direct codebase reads (all 8 source files read); no assumptions about file structure
- Pitfalls: HIGH — Pitfalls 2/4/6/7 from PITFALLS.md directly address this phase; additional phase-specific pitfalls derived from code reads
- Validation: HIGH — existing build-output test patterns used as template; UAT approach mirrors Phase 148

**Research date:** 2026-06-18
**Valid until:** 2026-08-01 (stable stack; Workbox 7.x is mature; no fast-moving components)
