# Phase 149: `/data/` Runtime Caching + Offline Cold-Start - Pattern Map

**Mapped:** 2026-06-18
**Files analyzed:** 7 new/modified files
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/sw.ts` | SW handler | request-response (Workbox route intercept) | `src/sw.ts` (Phase 148 baseline — same file, additive) | exact |
| `src/sw-registration.ts` | utility / side-effect module | request-response (navigator API) | `src/sw-registration.ts` (same file, additive) | exact |
| `src/app-entry.ts` | Vite entry | event-driven (cold-start probe + `online` listener) | `src/app-entry.ts` (same file) + `src/bee-atlas.ts` `connectedCallback` for the event-listener pattern | exact |
| `src/bee-atlas.ts` | Lit component (state owner) | event-driven (`online`/`offline` window events → `@state`) | `src/bee-atlas.ts` lines 346-353 (`popstate` wiring in `connectedCallback`/`disconnectedCallback`) | exact |
| `src/bee-header.ts` | Lit component (pure renderer / chrome) | request-response (receives `@property`, renders pill) | `src/bee-map.ts` lines 36-60 (`@property({ attribute: false })` block) | exact |
| `src/bee-map.ts` | Lit component (pure presenter) | request-response (receives `@property offline`, renders overlay) | `src/bee-map.ts` lines 92-97 (existing `.region-control` absolute overlay pattern) | exact |
| `src/tests/build-output.test.ts` | test | batch (post-build file assertions) | `src/tests/build-output.test.ts` lines 326-352 (Phase 148 precache assertions) | exact |

---

## Pattern Assignments

### `src/sw.ts` (SW handler, request-response)

**Analog:** `src/sw.ts` — Phase 148 baseline (same file; Phase 149 appends runtime routes after the existing `registerRoute(navigationRoute)` call)

**Existing structure to preserve** (`/Users/rainhead/dev/beeatlas/src/sw.ts` lines 1-37):
```typescript
/// <reference types="vite-plugin-pwa/client" />

declare const self: ServiceWorkerGlobalScope & typeof globalThis & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

precacheAndRoute(self.__WB_MANIFEST);

const handler = createHandlerBoundToURL('/app/index.html');
const navigationRoute = new NavigationRoute(handler, {
  allowlist: [/^\/app\//],
});
registerRoute(navigationRoute);
```

**New imports to add** (after existing imports, lines 22-23):
```typescript
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
```

**New runtime routes to append** (after `registerRoute(navigationRoute)`):
```typescript
// D-01/D-04: DB route — maxEntries:1 collapses hash-churn accumulation (~23 MB per entry).
// purgeOnQuotaError:true cleans up on genuine-full-disk quota failures.
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

// D-02/D-06: GeoJSON runtime cache — no entry cap; stable URLs overwrite in place;
// three files total, <5 MB combined.
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

**Invariant:** Do NOT add `skipWaiting` or `clients.claim` anywhere in this file (D-04/D-06 from Phase 147/148).

---

### `src/sw-registration.ts` (utility, side-effect module)

**Analog:** `src/sw-registration.ts` — same file, additive. Current pattern (`/Users/rainhead/dev/beeatlas/src/sw-registration.ts` lines 1-22) shows:

```typescript
async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' });
  } catch (err) {
    console.error('[SW] Registration failed:', err);
  }
}

registerServiceWorker();
```

**New pattern to append** (after `registerServiceWorker()` call):
```typescript
const PERSIST_ASKED_KEY = 'beeatlas-persist-asked';

async function requestPersistentStorage(): Promise<void> {
  if (!navigator.storage?.persist) return;
  if (localStorage.getItem(PERSIST_ASKED_KEY)) return;
  localStorage.setItem(PERSIST_ASKED_KEY, '1');
  const granted = await navigator.storage.persist();
  // D-12: log result only — iOS returns false almost always.
  console.log('[storage] navigator.storage.persist() =>', granted);
}

void requestPersistentStorage();
```

**Copy guard pattern from lines 10-11:** `if (!('serviceWorker' in navigator)) return;` — use `if (!navigator.storage?.persist) return;` as the equivalent feature guard.

---

### `src/app-entry.ts` (Vite entry, event-driven)

**Analog:** `src/app-entry.ts` — same file (currently 6 lines). Current content:
```typescript
import './bee-atlas.ts';
import './sw-registration.ts';
```

**New code to add** — the cold-start probe is appended as module side-effect code (or extracted to `src/cache-probe.ts` and imported here):

```typescript
import { resolveDataUrl } from './manifest.ts';

async function probeAndReprime(): Promise<void> {
  if (!('caches' in window)) return;
  if (!navigator.onLine) return;  // offline: bail early; 'online' event re-runs
  const dbUrl = await resolveDataUrl('occurrences_db');
  if (!dbUrl) return;  // manifest may omit occurrences_db (see RESEARCH Open Q2)
  const cached = await caches.match(dbUrl, { cacheName: 'data-artifacts' });
  if (!cached) {
    // Fire-and-forget: SW intercepts and caches. D-08: silent, no UX in Phase 149.
    fetch(dbUrl).catch(err => console.warn('[cache-probe] re-prime fetch failed:', err));
  }
}

void probeAndReprime();
window.addEventListener('online', () => void probeAndReprime());
```

**Key conventions to copy:**
- `resolveDataUrl` is already imported by `bee-map.ts` (line 22) — same import path `'./manifest.ts'`
- `!cached` guard (not `=== null`) — `caches.match()` returns `undefined` on miss (RESEARCH Pitfall 5)

---

### `src/bee-atlas.ts` (Lit component / state owner, event-driven)

**Analog:** `src/bee-atlas.ts` — same file. The `popstate` event wiring pattern (lines 346-353) is the exact template for `online`/`offline` wiring:

**Existing pattern to copy** (lines 346-353):
```typescript
// Register popstate handler for browser back/forward navigation
window.addEventListener('popstate', this._onPopState);
```
and (lines 350-353):
```typescript
disconnectedCallback() {
  super.disconnectedCallback();
  window.removeEventListener('popstate', this._onPopState);
}
```

**New `@state` field to add** (alongside existing `@state` fields at lines 23-70):
```typescript
@state() private _offline: boolean = !navigator.onLine;
```

**New arrow-function handlers to add** (non-reactive private fields section, lines 74-92):
```typescript
private _onOnline = () => { this._offline = false; };
private _onOffline = () => { this._offline = true; };
```

**`connectedCallback` additions** (after `window.addEventListener('popstate', this._onPopState)` at line 347):
```typescript
window.addEventListener('online', this._onOnline);
window.addEventListener('offline', this._onOffline);
```

**`disconnectedCallback` additions** (after `window.removeEventListener('popstate', ...)` at line 352):
```typescript
window.removeEventListener('online', this._onOnline);
window.removeEventListener('offline', this._onOffline);
```

**`render()` change** — `<bee-header></bee-header>` at line 171 becomes:
```typescript
<bee-header .offline=${this._offline}></bee-header>
```
And the `<bee-map ...>` element receives one additional property:
```typescript
.offline=${this._offline}
```

**Decorator import:** `state` is already imported from `lit/decorators.js` (line 2). No new import needed.

---

### `src/bee-header.ts` (Lit component / chrome renderer)

**Analog:** `src/bee-map.ts` lines 36-60 — the `@property({ attribute: false })` declaration block is the pattern for adding a new property.

**Existing `bee-map.ts` property pattern** (lines 36-59):
```typescript
@property({ attribute: false }) boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places' = 'off';
@property({ attribute: false }) visibleIds: Set<string> | null = null;
// ... (all properties use attribute: false because they carry non-serializable values)
```

**Current `bee-header.ts` import** (line 2 — only `customElement` is imported):
```typescript
import { customElement } from 'lit/decorators.js';
```
Must become:
```typescript
import { customElement, property } from 'lit/decorators.js';
```

**New `@property` to add** (after the `@customElement` decorator, before `static styles`):
```typescript
@property({ attribute: false }) offline = false;
```

**`render()` change** — add pill to the `.right-group` div (line 101), before the GitHub link:
```typescript
${this.offline ? html`<span class="offline-pill">Offline</span>` : ''}
```

**New CSS** to add to `static styles` (after `.github-link:hover` block at line 72):
```css
.offline-pill {
  font-size: 0.75rem;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  color: white;
}
```

---

### `src/bee-map.ts` (Lit component / pure presenter)

**Analog:** `src/bee-map.ts` — same file. The existing `.region-control` overlay pattern (lines 92-97) is the template for the blank-basemap overlay:

**Existing absolute-overlay CSS pattern** (lines 92-97):
```css
.region-control {
  position: absolute;
  top: 0.5em;
  right: 0.5em;
  z-index: 2;
}
```

**New `@property` to add** (alongside existing `@property` block at lines 36-59):
```typescript
@property({ attribute: false }) offline = false;
```

**New CSS** to add to `static styles` (after `.region-menu button` block):
```css
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

**`render()` change** — add conditional overlay in the shadow template (after the `.region-control` div):
```typescript
${this.offline ? html`
  <div class="offline-basemap-label">
    Basemap tiles unavailable offline.
    Pan here while online to cache tiles for an area.
  </div>
` : ''}
```

**Pure-presenter invariant (CLAUDE.md):** `bee-map` MUST NOT own `@state _offline`. It receives `offline` as a `@property` from `<bee-atlas>`. No `window.addEventListener` in this component.

---

### `src/tests/build-output.test.ts` (test, batch post-build assertions)

**Analog:** same file, lines 324-352 (Phase 148 precache assertions). Pattern to mirror:

**Existing Phase 148 pattern** (lines 326-352):
```typescript
test('_site/app/sw.js contains an injected precache manifest (OFF-01, criterion 1)', () => {
  const sw = readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8');
  expect(sw).not.toContain('self.__WB_MANIFEST');
  expect(sw).toMatch(/"url":"[^"]+"/);
});

test('eleventy.config.js sets maximumFileSizeToCacheInBytes >= 30000000 (OFF-01, criterion 3)', () => {
  const config = readFileSync(resolve(ROOT, 'eleventy.config.js'), 'utf-8');
  const match = config.match(/maximumFileSizeToCacheInBytes\s*:\s*([\d_]+)/);
  expect(match, 'maximumFileSizeToCacheInBytes not found in eleventy.config.js').toBeTruthy();
  const value = parseInt(match![1]!.replace(/_/g, ''), 10);
  expect(value).toBeGreaterThanOrEqual(30_000_000);
});
```

**New tests to add** (inside the existing `describe.skipIf(SKIP_BUILD)` block, after the Phase 148 tests):
```typescript
// Phase 149 — runtime cache assertions (OFF-02, CACHE-05)

test('_site/app/sw.js registers a runtime CacheFirst route for /data/ (OFF-02)', () => {
  const sw = readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8');
  expect(sw).toContain('data-artifacts');
  expect(sw).toMatch(/\.db/);
  expect(sw).toMatch(/\.geojson/);
});

test('_site/app/sw.js does not contain skipWaiting or clients.claim (OFF-03 carry-forward)', () => {
  const sw = readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8');
  expect(sw).not.toContain('skipWaiting');
  expect(sw).not.toContain('clients.claim');
});

test('workbox-strategies, workbox-expiration, workbox-cacheable-response in package.json (OFF-02)', () => {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  expect(allDeps['workbox-strategies']).toBeDefined();
  expect(allDeps['workbox-expiration']).toBeDefined();
  expect(allDeps['workbox-cacheable-response']).toBeDefined();
});
```

**`readFileSync` import** is already present (line 9). No new imports needed.

---

## Shared Patterns

### `@property({ attribute: false })` on Lit presenters
**Source:** `src/bee-map.ts` lines 36-59
**Apply to:** `bee-header.ts` (new `offline` property), `bee-map.ts` (new `offline` property)

All non-serializable properties in presenters use `{ attribute: false }`. Boolean `offline` qualifies.

### Window event listener wiring (add/remove in connected/disconnectedCallback)
**Source:** `src/bee-atlas.ts` lines 346-353
**Apply to:** `src/bee-atlas.ts` (new `online`/`offline` handlers)

Pattern: store handler as arrow-function class field (preserves `this`), register in `connectedCallback`, remove in `disconnectedCallback`. The `popstate` handler uses the identical shape.

### Module-side-effect pattern for initialization code
**Source:** `src/sw-registration.ts` lines 9-22 (`registerServiceWorker()` called as a side effect, not exported)
**Apply to:** `src/app-entry.ts` cold-start probe, `src/sw-registration.ts` `requestPersistentStorage()` addition

Pattern: define async function, call it with `void fn()` immediately at module scope.

### Post-build string assertions in `build-output.test.ts`
**Source:** `src/tests/build-output.test.ts` lines 326-352
**Apply to:** new Phase 149 runtime-route assertions

Pattern: `readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8')` + `expect(sw).toContain(...)` / `expect(sw).toMatch(...)`. All tests live inside the existing `describe.skipIf(SKIP_BUILD)` block; no new `describe` wrapper needed.

---

## No Analog Found

None. All 7 files have exact analogs in the codebase (most are the same file being extended).

---

## Project-Specific Constraints (carry into all plans)

1. **State ownership invariant (CLAUDE.md):** `<bee-atlas>` owns all reactive state. `<bee-map>` and `<bee-header>` are pure presenters — they receive state as `@property` and emit events upward. `_offline` belongs in `bee-atlas`, not in `bee-header` or `bee-map`.
2. **No `skipWaiting`/`clientsClaim` (147 D-06 / 148 D-04):** Structurally absent from `src/sw.ts`. Phase 149 must not add them.
3. **No-SW-on-`/` guarantee:** `src/sw-registration.ts` is imported ONLY by `src/app-entry.ts`. `_pages/index.html` loads `src/bee-atlas.ts` directly. The cold-start probe must live in `src/app-entry.ts` (or a module imported by it), never in `src/bee-atlas.ts` or a shared module.
4. **Do not touch `vite.config.ts`** (PITFALLS Pitfall 3): all Vite plugin config lives in `eleventy.config.js` `viteOptions`.
5. **`caches.match()` returns `undefined` on miss** (not `null`): guard with `if (!cached)`.
6. **`workbox-strategies`, `workbox-expiration`, `workbox-cacheable-response` must be in `package.json` `devDependencies`** before the first SW build attempt — otherwise CI fails with module-not-found at SW compile time.

## Metadata

**Analog search scope:** `src/`, `src/tests/`
**Files read:** `src/sw.ts`, `src/sw-registration.ts`, `src/app-entry.ts`, `src/bee-atlas.ts` (lines 1-180, 280-353), `src/bee-header.ts`, `src/bee-map.ts` (lines 1-130), `src/tests/build-output.test.ts`
**Pattern extraction date:** 2026-06-18
