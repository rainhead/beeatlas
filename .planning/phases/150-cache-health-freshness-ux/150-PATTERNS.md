# Phase 150: Cache Health & Freshness UX — Pattern Map

**Mapped:** 2026-06-18
**Files analyzed:** 13 (8 modified + 5 new)
**Analogs found:** 13/13

All targets have strong analogs already shipping (Phases 147–149 left a near-symmetric prior). PATTERNS.md is heavy on file:line references because Phase 150 is a composition phase — the executor should literally copy the offline-pill / cache-probe / CacheFirst-registration shapes and rename.

## File Classification

| File | Status | Role | Data Flow | Closest Analog | Match |
|------|--------|------|-----------|----------------|-------|
| `src/sw.ts` | MODIFY | SW source | route registration + message listener | `src/sw.ts:51-77` (existing CacheFirst routes) | exact |
| `src/sw-registration.ts` | MODIFY | page-side module (side-effect) | one-shot async + bubbled CustomEvent | `src/sw-registration.ts:9-22` (existing register()) + `:37-49` (requestPersistentStorage) | exact |
| `src/manifest.ts` | MODIFY | utility / data | pure helper + module-level promise cache | `src/manifest.ts:16-32` (loadManifest + resolveDataUrl) | exact |
| `src/app-entry.ts` | MODIFY | entry side-effect module | cold-start probe + online listener | `src/app-entry.ts:22-42` (probeAndReprime) | exact (subsumes) |
| `src/bee-atlas.ts` | MODIFY | state owner (LitElement) | @state + window event listeners + property relay | `src/bee-atlas.ts:71` `_offline` + `:172` `<bee-header .offline=>` + `:350-358` listener wiring + `:691-692` handlers | exact |
| `src/bee-header.ts` | MODIFY | pure presenter (LitElement) | @property in, CustomEvent out | `src/bee-header.ts:76-83` `.offline-pill` styles + `:113` conditional render | exact |
| `src/tests/build-output.test.ts` | MODIFY | post-build gate | file-read + string assertions | `src/tests/build-output.test.ts:356-380` (Phase 149 runtime-cache assertions) | exact |
| `package.json` | MODIFY | config | dep classification | existing `workbox-strategies` etc. (dependencies) | exact |
| `src/prime-orchestrator.ts` | NEW | page-side module | streaming fetch loop + cache probe + event emitter | `src/app-entry.ts:22-42` (probeAndReprime shape) + `src/manifest.ts:16-24` (module-level promise cache) | role-match |
| `src/tests/prime-orchestrator.test.ts` | NEW | unit test | mocked globals (fetch/caches) + dynamic import | `src/tests/cache-probe.test.ts` (entire file) | exact |
| `src/tests/manifest-freshness.test.ts` | NEW | unit test | pure-function tests with mocked `Date.now()` | `src/tests/cache-probe.test.ts` (vitest harness; pure logic) | role-match |
| `src/tests/bee-header.test.ts` | EXTEND | component test | LitElement render + @property | `src/tests/bee-header.test.ts:83-114` (OFF-05 offline-pill block) | exact |
| `src/tests/bee-atlas.test.ts` | EXTEND | component test | LitElement + window event dispatch | existing `bee-atlas.test.ts` + `cache-probe.test.ts` for `window.dispatchEvent` shape | role-match |

(Per RESEARCH §file-roles, the planner-recommended naming is `bee-header.test.ts` / `bee-atlas.test.ts` extensions rather than new `cache-state.test.ts` / `sw-update.test.ts` files. Both already exist.)

---

## Pattern Assignments

### `src/sw.ts` (SW source — add NetworkFirst route + SKIP_WAITING listener)

**Analog:** `src/sw.ts` self (existing CacheFirst route block).

**Imports pattern to extend** (`src/sw.ts:22-26`):
```ts
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';  // ADD: , NetworkFirst
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
```
Add `NetworkFirst` to the `workbox-strategies` import.

**Route registration pattern to copy** (`src/sw.ts:69-77` — the .geojson CacheFirst, structurally identical to the new NetworkFirst):
```ts
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
**New route to write** (append after the two existing `registerRoute` blocks):
```ts
registerRoute(
  ({ url }) => url.pathname === '/data/manifest.json',
  new NetworkFirst({
    cacheName: 'data-manifest',           // separate from data-artifacts per D-08 cache-isolation
    networkTimeoutSeconds: 3,
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  })
);
```

**SKIP_WAITING listener to append** (no analog; per RESEARCH Pattern 3 — D-16 invariant means the literal `self.skipWaiting()` lives ONLY here):
```ts
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
```

---

### `src/sw-registration.ts` (page-side SW lifecycle — workbox-window migration)

**Analog:** `src/sw-registration.ts:9-22` (existing manual register).

**Current shape to replace** (`src/sw-registration.ts:9-22`):
```ts
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

**Migration target** (per RESEARCH Pattern 2):
```ts
import { Workbox } from 'workbox-window';

async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const wb = new Workbox('/app/sw.js', { scope: '/app/' });
  wb.addEventListener('waiting', () => {
    window.dispatchEvent(new CustomEvent('sw-update-available', {
      bubbles: true, composed: true,
    }));
  });
  (window as Window & { __wb?: Workbox }).__wb = wb;  // banner click → wb.messageSkipWaiting()
  try { await wb.register(); }
  catch (err) { console.error('[SW] Registration failed:', err); }
}

registerServiceWorker();
```

**Preserve verbatim:** the existing `requestPersistentStorage()` block at `:37-49` and the closing `void requestPersistentStorage();` — that side-effect lives on this module per Phase 149 D-12 and is OUT OF SCOPE for 150.

**Convention notes (load-bearing):**
- Module is private (not exported). Registration fires as module side-effect via the trailing call. Phase 150 keeps this shape — the `wb` is exposed via `window.__wb`, NOT a named export, so the no-SW-on-`/` structural guarantee (147) is preserved.
- CustomEvent uses `composed: true, bubbles: true` so it crosses the LitElement shadow boundary into `<bee-atlas>`. This matches the existing Phase 149 / 152 convention noted in CONTEXT.

---

### `src/manifest.ts` (utility — add freshness helper)

**Analog:** `src/manifest.ts` self.

**Module-level promise cache pattern to preserve** (`src/manifest.ts:16-24`):
```ts
let _promise: Promise<Manifest> | null = null;

function loadManifest(): Promise<Manifest> {
  if (!_promise) {
    _promise = fetch(`${_BASE}/manifest.json`)
      .then(r => { if (!r.ok) throw new Error(`manifest.json: ${r.status}`); return r.json() as Promise<Manifest>; });
  }
  return _promise;
}
```

**Changes (per RESEARCH Pattern 6):**
1. Promote `loadManifest` from private to `export` (the orchestrator and the freshness helper both need it).
2. Add `formatFreshness(generatedAt, now?, locale?)` (pure helper) — returns `string | null`; returns `null` and `console.warn`s for unparseable input (D-12 dev `"local"` sentinel).
3. Add `loadFreshnessLabel()` convenience — awaits `loadManifest()` and pipes `generated_at` through `formatFreshness`.

**Pitfall to flag in plan** (RESEARCH Pitfall 5): the module-level `_promise` is session-scoped. Phase 150 is fine; flag for future SPA-nav phases that `clearManifestCache()` would be needed.

---

### `src/app-entry.ts` (entry — replace probeAndReprime with orchestrator import)

**Analog:** `src/app-entry.ts:22-42` (existing probeAndReprime + online listener — both subsumed by orchestrator).

**Current shape to replace** (`src/app-entry.ts:1-7`):
```ts
import './bee-atlas.ts';
import './sw-registration.ts';
import { resolveDataUrl } from './manifest.ts';
// ... probeAndReprime function definition ...
void probeAndReprime();
window.addEventListener('online', () => void probeAndReprime());
```

**Target shape:**
```ts
import './bee-atlas.ts';
import './sw-registration.ts';
import './prime-orchestrator.ts';  // side-effect import; owns cold-start probe + online listener
```

The orchestrator (new file below) takes over both call sites. `resolveDataUrl` no longer imported here.

---

### `src/prime-orchestrator.ts` (NEW — byte-progress fetch loop + cache probe + events)

**Analog:** combination of `src/app-entry.ts:22-42` (the probeAndReprime fire-and-forget shape + online-listener registration) and `src/manifest.ts:16-24` (module-level singleton state for one-shot async work).

**Probe pattern to extend** (`src/app-entry.ts:22-36`):
```ts
async function probeAndReprime(): Promise<void> {
  if (!('caches' in window)) return;
  if (!navigator.onLine) return;
  const dbUrl = await resolveDataUrl('occurrences_db');
  if (!dbUrl) return;
  const cached = await caches.match(dbUrl, { cacheName: 'data-artifacts' });
  if (!cached) {
    fetch(dbUrl).catch(/* swallow */);
  }
}
```

**New responsibilities** (per RESEARCH Patterns 1 + 5; CONTEXT D-02..D-04, D-06):
1. Loop over 4 asset keys: `occurrences_db`, `counties`, `ecoregions`, `places`.
2. For each, skip if `caches.match(url, {cacheName: 'data-artifacts'})` hits (resumability — RESEARCH Pitfall 3).
3. For misses, `fetch(url)`, consume via `response.body.getReader()`, count bytes; emit `cache-prime-progress` CustomEvent (composed/bubbles, detail `{received, total, assetInFlight, ready}`) every ~100 KB (throttle per CONTEXT discretion).
4. Total discovered from `response.headers.get('content-length')` with per-asset fallback constants (RESEARCH Pitfall 2). Persist reconciled total to `localStorage['beeatlas-prime-total-bytes']` (D-04).
5. After each asset finishes, recompute `ready` via `computeReadyState()` (RESEARCH Pattern 5).
6. Register `window.addEventListener('online', ...)` for re-run on reconnect (same shape as `app-entry.ts:42`).
7. Run cold-start via `void primeAll();` at module bottom (same shape as `app-entry.ts:36` and `manifest.ts:16` `_promise` singleton — re-entrancy guard).

**Event payload contract** (RESEARCH §Composite event payload shape):
```ts
interface CachePrimeProgressDetail {
  received: number;
  total: number;
  assetInFlight: string | null;
  ready: boolean;
}
window.dispatchEvent(new CustomEvent<CachePrimeProgressDetail>('cache-prime-progress', {
  detail: { received, total, assetInFlight, ready },
  bubbles: true, composed: true,
}));
```

**Critical do-NOT** (RESEARCH Anti-Patterns): do not `response.clone()` (Workbox already cloned on the SW side); do not call `.arrayBuffer()` after the reader loop (body already drained).

---

### `src/bee-atlas.ts` (state owner — add cache state + relay to header + update banner)

**Analog:** `src/bee-atlas.ts:71` (`_offline` declaration), `:172` (`<bee-header .offline=>` relay), `:350-358` (listener wiring), `:691-692` (handlers).

**`@state` declaration pattern to copy** (`src/bee-atlas.ts:71`):
```ts
@state() private _offline: boolean = !navigator.onLine;
```
**New state to add** (5 fields — names exactly per RESEARCH §file-roles):
```ts
@state() private _cacheState: { ready: boolean; cached: Set<string>; missing: string[] } | null = null;
@state() private _primeProgress: { received: number; total: number; assetInFlight: string | null } | null = null;
@state() private _updateAvailable = false;
@state() private _freshnessLabel: string | null = null;
@state() private _storageEstimate: { usageMB: string; quotaMB: string | null } | null = null;
```

**Listener wiring pattern to copy** (`src/bee-atlas.ts:350-358`):
```ts
connectedCallback() {
  super.connectedCallback();
  // ...
  window.addEventListener('online', this._onOnline);
  window.addEventListener('offline', this._onOffline);
}
disconnectedCallback() {
  super.disconnectedCallback();
  // ...
  window.removeEventListener('online', this._onOnline);
  window.removeEventListener('offline', this._onOffline);
}
```
**New listeners** (mirror exactly — window for `cache-prime-progress` + `sw-update-available`; element-level for `cache-popover-toggle`):
```ts
window.addEventListener('cache-prime-progress', this._onPrimeProgress);
window.addEventListener('sw-update-available', this._onSwUpdateAvailable);
this.addEventListener('cache-popover-toggle', this._onPopoverToggle);
```

**Handler pattern to copy** (`src/bee-atlas.ts:691-692`):
```ts
private _onOnline = () => { this._offline = false; };
private _onOffline = () => { this._offline = true; };
```
New handlers follow the same arrow-property shape so `this` binding is automatic.

**Header relay pattern to copy** (`src/bee-atlas.ts:172`):
```ts
<bee-header .offline=${this._offline}></bee-header>
```
**Extend to:**
```ts
<bee-header
  .offline=${this._offline}
  .cacheState=${this._cacheState}
  .primeProgress=${this._primeProgress}
  .freshnessLabel=${this._freshnessLabel}
  .storageEstimate=${this._storageEstimate}
  .updateAvailable=${this._updateAvailable}
></bee-header>
```

**New: update banner render** — append inside `<bee-atlas>`'s template (NOT inside `<bee-header>`, per D-14 + UI-SPEC). See UI-SPEC §"`.update-banner` positioning" for the exact CSS block. Tap-body handler:
```ts
private _onBannerTap = () => {
  const wb = (window as Window & { __wb?: { messageSkipWaiting(): void } }).__wb;
  wb?.messageSkipWaiting();
  window.location.reload();
};
private _onBannerDismiss = () => { this._updateAvailable = false; };  // D-15 session-only
```

---

### `src/bee-header.ts` (pure presenter — add ready-pill, popover, freshness caption)

**Analog:** `src/bee-header.ts:76-83` (`.offline-pill` style block) + `:113` (conditional render).

**`.offline-pill` base style to reuse as `.ready-pill` base** (`src/bee-header.ts:76-83`):
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
The new `.ready-pill` selector shares this declaration — write as `.offline-pill, .ready-pill { … }` then add `.ready-pill`-specific overrides (44px min-height tap-target, `min-width` reserved for "Caching… 99%" to avoid jiggle, the inline progress-bar pseudo or child div). See UI-SPEC §Color derived tokens.

**Conditional render pattern to extend** (`src/bee-header.ts:112-119`):
```ts
<div class="right-group">
  ${this.offline ? html`<span class="offline-pill">Offline</span>` : ''}
  <a href="https://github.com/rainhead/beeatlas" ...>...</a>
</div>
```
**Extend to** (`<bee-header>` template right-group):
```ts
<div class="right-group">
  ${this.offline ? html`<span class="offline-pill">Offline</span>` : ''}
  ${this.cacheState ? html`<button class="ready-pill" @click=${this._togglePopover}
        aria-haspopup="dialog" aria-expanded=${this._popoverOpen}>
    ${this._renderReadyPillContent()}
  </button>` : ''}
  ${this._popoverOpen ? this._renderPopover() : ''}
  <a href="https://github.com/rainhead/beeatlas" ...>...</a>
</div>
```

**Property declaration pattern to copy** (`src/bee-header.ts:6`):
```ts
@property({ attribute: false }) offline = false;
```
New properties (all `attribute: false` — they carry complex types from `<bee-atlas>`):
```ts
@property({ attribute: false }) cacheState: CacheState | null = null;
@property({ attribute: false }) primeProgress: PrimeProgress | null = null;
@property({ attribute: false }) freshnessLabel: string | null = null;
@property({ attribute: false }) storageEstimate: StorageEstimate | null = null;
@property({ attribute: false }) updateAvailable = false;
@state() private _popoverOpen = false;
```

**Freshness caption insertion** — modify `<h1>BeeAtlas</h1>` block at `src/bee-header.ts:88-89` per UI-SPEC §Layout (wrap in `.title-group` flex column, append `.freshness-caption` span).

**CustomEvent emission** (composed/bubbles — same shape as RESEARCH Pattern 8):
```ts
private _togglePopover(e: Event) {
  e.stopPropagation();
  this._popoverOpen = !this._popoverOpen;
  this.dispatchEvent(new CustomEvent('cache-popover-toggle', {
    detail: { open: this._popoverOpen },
    composed: true, bubbles: true,
  }));
}
```

---

### `src/tests/build-output.test.ts` (extend — replace skipWaiting absence + add 3 new)

**Analog:** `src/tests/build-output.test.ts:356-380` (Phase 149 runtime-cache assertions — same idiom).

**Current shape to REPLACE** (`src/tests/build-output.test.ts:366-372`):
```ts
test('_site/app/sw.js does not contain skipWaiting or clients.claim (OFF-03 carry-forward)', () => {
  const sw = readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8');
  expect(sw).not.toContain('skipWaiting');
  expect(sw).not.toContain('clients.claim');
});
```
**Replace with** (per RESEARCH Pattern 3 verbatim — gated form is the new invariant):
```ts
test('_site/app/sw.js calls skipWaiting only inside a message handler (D-16)', () => {
  const sw = readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8');
  const skipMatches = [...sw.matchAll(/skipWaiting/g)];
  expect(skipMatches.length).toBeGreaterThan(0);
  expect(sw).toContain('SKIP_WAITING');
  expect(sw).not.toContain('clients.claim');
});
```

**Add new assertion — NetworkFirst route for manifest.json** (extends the existing OFF-02 CacheFirst-route shape at `:356-364`):
```ts
test('_site/app/sw.js registers NetworkFirst route for /data/manifest.json (D-08)', () => {
  const sw = readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8');
  expect(sw).toContain('data-manifest');
  expect(sw).toMatch(/manifest\.json/);
  expect(sw).toMatch(/NetworkFirst|networkTimeout/);  // strategy class name or its option survives minification
});
```

**Add new assertion — workbox-window in runtime dependencies** (extends `:374-380`):
```ts
test('workbox-window is a runtime dependency (D-13)', () => {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
  expect(pkg.dependencies['workbox-window']).toBeDefined();
  expect(pkg.devDependencies?.['workbox-window']).toBeUndefined();
});
```

---

### `package.json`

Move `workbox-window` from `devDependencies` to `dependencies`. No other change (workbox-strategies/expiration/cacheable-response stay where Phase 149 put them).

---

### `src/tests/prime-orchestrator.test.ts` (NEW)

**Analog:** `src/tests/cache-probe.test.ts` (entire file — already mocks fetch, caches, resolveDataUrl, and runs side-effect modules via dynamic import).

**Harness pattern to copy** (`src/tests/cache-probe.test.ts:10-45`):
```ts
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../bee-atlas.ts', () => ({}));
vi.mock('../sw-registration.ts', () => ({}));
vi.mock('../manifest.ts', () => ({ resolveDataUrl: vi.fn() }));
import { resolveDataUrl } from '../manifest.ts';

describe('prime-orchestrator', () => {
  const flushMicrotasks = () => new Promise<void>(r => setTimeout(r, 0));

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  // ...
});
```

**Stub-fetch-with-streaming pattern (new — no existing exact analog; combines Pattern 1 from RESEARCH with the existing `vi.stubGlobal('fetch', ...)` shape):**
```ts
function makeStreamingResponse(chunks: Uint8Array[], contentLength?: number): Response {
  const stream = new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(c);
      controller.close();
    }
  });
  const headers = new Headers();
  if (contentLength != null) headers.set('content-length', String(contentLength));
  return new Response(stream, { status: 200, headers });
}
```

**Test cases** (per RESEARCH Validation Architecture):
- `computeReadyState`: 4-asset cache probe; missing returns `ready: false` with `missing` populated.
- `byte progress`: monotone non-decreasing `received` values; final equals `total`.
- `content-length absent`: orchestrator falls back to per-asset constants.
- `localStorage persist`: total written to `beeatlas-prime-total-bytes`.
- `skips cached`: pre-populated cache → fetch not called for that URL.

---

### `src/tests/manifest-freshness.test.ts` (NEW)

**Analog:** `src/tests/cache-probe.test.ts` for the vitest harness; the test bodies are pure-function with no globals besides `Date`.

**Mock-`Date.now()` pattern** (standard vitest):
```ts
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-06-18T12:00:00Z')); });
afterEach(() => { vi.useRealTimers(); });
```

**Test cases** (per RESEARCH Validation Architecture):
- `< 1 day` → `"Today"`
- `1 day` → `"Yesterday"`
- `3 days` → `"3 days ago"` (uses `Intl.RelativeTimeFormat`, `numeric: 'always'`)
- `≥ 7 days, < 1 year` → `"Data as of Jun 11, 2026"` (or similar — assert prefix + format shape)
- `≥ 1 year` → `"Data as of Mar 2025"` (month + year only)
- `"local"` sentinel → `null` + `console.warn` called

---

### `src/tests/bee-header.test.ts` (EXTEND existing file)

**Analog:** `src/tests/bee-header.test.ts:83-114` (Phase 149 OFF-05 `.offline-pill` block — identical shape to repeat for `.ready-pill`).

**Pattern to copy** (`src/tests/bee-header.test.ts:92-102`):
```ts
test('renders an Offline pill when offline=true (OFF-05)', async () => {
  await import('../bee-header.ts');
  el = document.createElement('bee-header') as any;
  (el as any).offline = true;
  document.body.appendChild(el);
  await (el as any).updateComplete;

  const pill = el.shadowRoot!.querySelector('.offline-pill');
  expect(pill).not.toBeNull();
  expect(pill!.textContent).toBe('Offline');
});
```

**Append new `describe` blocks** for:
- `ready-pill` three states (priming / finish-on-wifi / ready) — vary `cacheState` and `primeProgress` properties, assert pill text matches UI-SPEC §Copywriting locked strings.
- `popover` visibility — click `.ready-pill`, assert `.cache-popover` mounts; check row visibility rules (no estimate → row hidden; quota < 200 MB → sub-line shown; quota ≥ 200 MB → sub-line hidden).
- `freshness-caption` — `null` → not rendered; non-null → text matches.

---

### `src/tests/bee-atlas.test.ts` (EXTEND existing file)

**Analog:** existing `src/tests/bee-atlas.test.ts` for the LitElement harness; `src/tests/cache-probe.test.ts:178` for the `window.dispatchEvent(new Event('online'))` shape (reuse for `sw-update-available`).

**Test cases** (per RESEARCH Validation Architecture, OFF-03 carry):
- Update banner shows when `_updateAvailable === true`; mock-dispatch `sw-update-available` CustomEvent on `window`, await `updateComplete`, assert `.update-banner` in shadow root.
- Tap banner body calls `window.__wb.messageSkipWaiting()` (mock `__wb`).
- Tap dismiss `✕` clears `_updateAvailable` and unmounts banner.

---

## Shared Patterns (cross-cutting)

### Pattern S1: State-owner / pure-presenter (D-20)

**Source:** `src/bee-atlas.ts:71` (`_offline` declaration), `:172` (header relay), `src/bee-header.ts:6` (`@property` receive).

**Apply to:** every new piece of cache state. NO new `@state` lives on `<bee-header>` except internal UI flags (`_popoverOpen`). All reactive cache data flows: orchestrator → window CustomEvent → `<bee-atlas>` `@state` → `<bee-header>` `@property`.

**Exception (the only one):** `src/prime-orchestrator.ts` MAY hold module-level state for `localStorage` keys + `beeatlas-prime-total-bytes` persistence (cross-tab persistent stores, not reactive). Per RESEARCH §"Project Constraints."

### Pattern S2: `composed: true, bubbles: true` CustomEvents

**Source:** `src/bee-header.ts` (already emits this shape from Phase 149); RESEARCH Pattern 8.

**Apply to:** every new event (`sw-update-available`, `cache-prime-progress`, `cache-state-changed`, `cache-popover-toggle`). Required for crossing the Lit shadow boundary.

### Pattern S3: Side-effect module trailing call

**Source:** `src/app-entry.ts:36` (`void probeAndReprime();`), `src/sw-registration.ts:22` (`registerServiceWorker();`), `:49` (`void requestPersistentStorage();`).

**Apply to:** `src/prime-orchestrator.ts` — append `void primeAll();` at module bottom; register `window.addEventListener('online', ...)` immediately after. This is the established "module owns its own lifecycle" pattern.

### Pattern S4: Module-level promise singleton

**Source:** `src/manifest.ts:16-24`.

**Apply to:** `src/prime-orchestrator.ts` for the in-flight prime promise — guards against concurrent re-entry (cold-start + `online` event firing in quick succession). Pattern: `let _primePromise: Promise<void> | null = null; function primeAll() { if (!_primePromise) _primePromise = ... .finally(() => _primePromise = null); return _primePromise; }`.

### Pattern S5: Mocked-globals dynamic-import vitest harness

**Source:** `src/tests/cache-probe.test.ts:10-45`.

**Apply to:** every new test that exercises a side-effect module (`prime-orchestrator.test.ts`, `sw-update`-style tests in `bee-atlas.test.ts`). Use `vi.resetModules()` + `vi.stubGlobal('fetch', ...)` / `vi.stubGlobal('caches', ...)` BEFORE `await import('../prime-orchestrator.ts')`.

### Pattern S6: Post-build assertion (file-read + string match)

**Source:** `src/tests/build-output.test.ts:356-380`.

**Apply to:** every new SW-source / package.json assertion in 150. Read `_site/app/sw.js` once per test; use `.toContain` for cache-name literals, `.toMatch(/regex/)` for class names (NetworkFirst minifies but `'data-manifest'` survives as string literal).

---

## No Analog Found

None. Every new file has at least a role-match analog from Phases 147–149. The closest-to-greenfield is the `Response.body.getReader()` streaming loop in `prime-orchestrator.ts`, but RESEARCH Pattern 1 provides the verbatim code to copy and the analog harness (`probeAndReprime` in `app-entry.ts:22-42`) covers the surrounding boilerplate (online listener, offline guard, swallow-rejection).

---

## Metadata

**Analog search scope:** `src/`, `src/tests/` (existing PWA + Lit + Workbox surfaces from Phases 147–149).
**Files read:** `src/sw.ts`, `src/sw-registration.ts`, `src/manifest.ts`, `src/app-entry.ts`, `src/bee-header.ts`, `src/bee-atlas.ts` (targeted ranges), `src/tests/cache-probe.test.ts`, `src/tests/bee-header.test.ts`, `src/tests/build-output.test.ts` (targeted range), plus the three upstream context files.
**Pattern extraction date:** 2026-06-18
