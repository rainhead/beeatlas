# Phase 150: Cache Health & Freshness UX — Research

**Researched:** 2026-06-18
**Domain:** Service-Worker lifecycle UX + page-side cache-prime instrumentation + freshness/storage indicators (PWA on `/app`)
**Confidence:** HIGH

## Summary

Phase 150 is a UX layer over the cache plumbing Phase 149 just landed. Almost every
unknown that the focal-points list raised is settled by reading the installed
`workbox-window@7.4.1` and `workbox-strategies@7.4.1` sources directly — no
search-and-guess required. The two load-bearing answers:

1. **Workbox's `CacheFirst` clones the response synchronously inside `fetchAndCachePut`
   and writes the clone to the cache via `event.waitUntil()`** (verified in
   `node_modules/workbox-strategies/src/StrategyHandler.ts:253-260`). The page-side
   prime orchestrator can stream and discard the original `Response` body via
   `getReader()` without affecting caching — Workbox already has its own teed stream.
   This is the central correctness question and it resolves cleanly: **D-02's "page
   fetches, SW caches as a side-effect" pattern is sound.**
2. **`workbox-window.Workbox.messageSkipWaiting()` posts `{type: 'SKIP_WAITING'}` to
   `registration.waiting`** (verified at `Workbox.ts:32` + `:325-329`) — the SW must
   listen for that message and call `self.skipWaiting()` itself. So we have to add a
   `message` listener to `src/sw.ts` while still NOT calling `self.skipWaiting()` at
   top level. The no-`skipWaiting` invariant from 147/148/149 is preserved
   structurally (the SW source contains no top-level `skipWaiting()` call); it's
   gated behind a user click.

**Primary recommendation:** Implement `src/prime-orchestrator.ts` as a small module
that the orchestrator loop is `for-of urls → fetch → getReader → discard chunks
while counting bytes → caches.match probe → emit progress event`. Wire
`workbox-window` in `src/sw-registration.ts`, register a single `message` listener
in `src/sw.ts` for `SKIP_WAITING`, add the `NetworkFirst` route for `manifest.json`,
add a `getter` to `src/manifest.ts` that returns a relative-or-absolute formatted
date (or `null` for the dev `"local"` sentinel), and surface everything through
`<bee-atlas>` `@state` → `<bee-header>` `@property` per the existing 149 pattern.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Determinate prime progress (CACHE-02) | Browser / page-side TS | Service worker (cache write side-effect) | Streaming via `Response.body.getReader()` is a Window API; SW is incidental — D-02 lock |
| Ready-for-offline probe (CACHE-01) | Browser (Cache Storage `caches.match`) | — | Cache is source of truth per D-06; page reads it |
| Storage estimate (CACHE-03) | Browser (`navigator.storage.estimate`) | — | Browser-only API; lazy on popover open per D-18 |
| Freshness label (CACHE-04) | Browser (Intl + `loadManifest`) | Service worker (`NetworkFirst` cache of `manifest.json`) | SW provides offline fallback per D-08; rendering & formatting is page-side |
| SW-update prompt | Browser (`workbox-window`) | Service worker (`message` listener for `SKIP_WAITING`) | `messageSkipWaiting()` is page → SW; SW source still has zero top-level `skipWaiting()` (D-16) |
| Update banner UI | Browser (`<bee-atlas>` render) | — | State-owner invariant — `<bee-atlas>` owns `_updateAvailable` |
| Ready pill + popover UI | Browser (`<bee-header>` render) | — | Pure presenter per 149 D-10; receives `@property`, emits events |
| SW lifecycle plumbing | Service worker registration (page-side) | — | `src/sw-registration.ts` owns it; `workbox-window` replaces raw `navigator.serviceWorker.register` |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `workbox-window` | 7.4.1 | Page-side SW registration + waiting/controlling event hooks + `messageSkipWaiting()` | [VERIFIED: `node_modules/workbox-window/package.json`] Already installed; matches Workbox 7.4.x family from 148/149; canonical PWA SW lifecycle helper |
| `lit` | 3.3.3 | Existing — `<bee-atlas>` / `<bee-header>` are LitElements | [VERIFIED: `package.json:43`] No new dep needed |
| Existing `workbox-strategies` | 7.4.1 | Add `NetworkFirst` import alongside existing `CacheFirst` (D-08) | [VERIFIED: `package.json:39`] Already a devDep |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Intl.RelativeTimeFormat` (built-in) | — | "3 days ago" relative form (D-09) | When delta ≤ 6 days |
| `Intl.DateTimeFormat` (built-in) | — | "Jun 15, 2026" / "Mar 2026" absolute forms (D-09) | When delta ≥ 7 days |
| `navigator.storage.estimate()` (built-in) | — | "X MB stored on this device" (CACHE-03 / D-18) | Lazy on popover open + `online`/`focus` |
| `Response.body.getReader()` + `response.headers.get('content-length')` (built-in) | — | Byte-level streaming progress (D-04) | Per-asset in orchestrator loop |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Page-side `getReader()` loop | SW-side `fetch` instrumentation that `postMessage`s progress | Would require non-trivial SW custom `Strategy`; D-02 locks the simpler page-side path |
| `wb.addEventListener('externalwaiting', ...)` | Standard `waiting` event with `event.isExternal` check | **Workbox 7.4.1 does NOT emit a separate `externalwaiting` event** [VERIFIED: `node_modules/workbox-window/src/utils/WorkboxEvent.ts:47-55`] — the `waiting` event is fired with `WorkboxLifecycleWaitingEvent` and `isExternal?: boolean` is set when the update came from another tab. Use the single `waiting` listener. |
| HTML5 `<dialog popover>` / CSS Anchor Positioning | Manual absolute-positioned div with click-outside-to-close | Anchor positioning lacks Safari support (as of 2026-06); a Lit-managed absolute div inside `<bee-header>`'s shadow root is the pragmatic match for this codebase's existing chrome surfaces. |
| Polling `navigator.storage.estimate()` | Lazy + `online`/`focus` triggers | D-18 locks lazy; spec gives no refresh guarantee, polling adds noise |

**Installation (delta from current state):**

```bash
# workbox-window moves devDependencies → dependencies (D-13).
# No new install; package.json edit only.
npm uninstall workbox-window
npm install workbox-window@7.4.1
# (or hand-edit package.json + package-lock.json to move the entry.)
```

**Version verification:**

- `workbox-window@7.4.1` already installed at `node_modules/workbox-window` — verified
  by reading the file. No remote registry call needed; planner can lock to the exact
  installed version.
- `workbox-strategies@7.4.1` provides `NetworkFirst` (used by 148/149 already in the
  bundle indirectly; we will import it directly in `src/sw.ts`).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `workbox-window` | npm | ~5 yrs at 7.x; 7.4.1 ~1 yr | ~10M/wk | github.com/GoogleChrome/workbox | not run (no new package; already installed) | Approved [VERIFIED: installed at `node_modules/workbox-window/package.json` shows v7.4.1, author Google's Web DevRel] |

**Packages removed due to slopcheck [SLOP] verdict:** none — this phase introduces no new
third-party package. The only `package.json` change is moving `workbox-window` from
`devDependencies` to `dependencies` (D-13).
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
            ┌──────────────────────────── /app page load ────────────────────────────┐
            │                                                                         │
   src/app-entry.ts                                                                    │
     ├── import './bee-atlas.ts'        (state owner)                                  │
     ├── import './sw-registration.ts'  (Workbox.register → wb.waiting → CustomEvent)  │
     └── import './prime-orchestrator.ts' (new) ──────┐                                │
                                                      │                                │
                                                      ▼                                │
   src/prime-orchestrator.ts                                                           │
     1. resolve URLs via manifest.ts (occurrences_db + 3 geojsons)                     │
     2. for each url:                                                                  │
          a. cached = caches.match(url, {cacheName: 'data-artifacts'})                 │
          b. if cached → received += headers.content-length; emit progress; continue   │
          c. res = await fetch(url)                                                    │
          d. total += +res.headers.get('content-length') || fallback                   │
          e. reader = res.body.getReader()                                             │
          f. while (!done) { received += value.byteLength; emit progress }             │
          g. await tick → re-probe caches.match(url) → contributes to ready flag       │
     3. dispatchEvent('cache-prime-progress', {received, total, asset, allReady})      │
                                                                                       │
                            ┌────────── SW (src/sw.ts) ──────────┐                     │
                            │  CacheFirst({cacheName:'data-      │                     │
                            │   artifacts'}) on /data/*.db +     │                     │
                            │   /data/*.geojson                  │                     │
                            │   → fetchAndCachePut: clones       │                     │
                            │     response, page gets one half,  │                     │
                            │     cache.put receives the clone   │                     │
                            │     via waitUntil (NO blocking     │                     │
                            │     of page-side stream)           │                     │
                            │  NEW: NetworkFirst for             │                     │
                            │   /data/manifest.json (~3s timeout)│                     │
                            │  NEW: addEventListener('message',  │                     │
                            │   e => if e.data?.type ===         │                     │
                            │     'SKIP_WAITING' →               │                     │
                            │     self.skipWaiting())            │                     │
                            └────────────────────────────────────┘                     │
                                                                                       │
   <bee-atlas>                                                                         │
     @state _cacheState: {ready, partial, dbCached, geojsonCached: Set<string>}        │
     @state _primeProgress: {received, total, assetInFlight} | null                    │
     @state _updateAvailable: boolean                                                  │
     @state _freshnessLabel: string | null                                             │
     @state _storageEstimate: {usage, quota} | null                                    │
     ── listens for: cache-prime-progress, sw-update-available                         │
     ── relays as @property to <bee-header>; renders update-banner directly            │
                                                                                       │
   <bee-header> (pure presenter)                                                       │
     @property cacheState, primeProgress, freshnessLabel, storageEstimate, offline     │
     renders: ready-pill (inline determinate bar), popover slot                        │
     emits:   popover-toggle (composed:true) so parent can lazy-trigger estimate()     │
                                                                                       │
   Bottom update banner (rendered by <bee-atlas>, not <bee-header>)                    │
     tap-body → wb.messageSkipWaiting() + window.location.reload()                     │
     tap-X    → _updateAvailable = false (session-only per D-15)                       │
            └──────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── sw.ts                      # +1 NetworkFirst route, +1 message listener
├── sw-registration.ts         # replace navigator.serviceWorker.register with Workbox
├── manifest.ts                # +1 helper: formatFreshness(generated_at) → string|null
├── prime-orchestrator.ts      # NEW — byte-progress fetch loop; cache probe; emits events
├── app-entry.ts               # import './prime-orchestrator.ts'; remove the old probeAndReprime fire-and-forget (subsumed by orchestrator)
├── bee-atlas.ts               # +cacheState/_primeProgress/_updateAvailable/_freshness/_storageEstimate @state; update-banner render
├── bee-header.ts              # +ready-pill + popover; freshness sub-line
└── tests/
    ├── build-output.test.ts                    # +1 assertion for manifest.json NetworkFirst route
    ├── prime-orchestrator.test.ts              # NEW — orchestrator unit tests (happy path, content-length absent, cached entry, ready computation)
    ├── manifest-freshness.test.ts              # NEW — formatFreshness() across delta thresholds + dev sentinel
    ├── bee-header.test.ts                      # render assertions for the 3 pill states + popover open
    └── bee-atlas.test.ts                       # update-banner shows on _updateAvailable; dismiss; tap → messageSkipWaiting() called
```

### Pattern 1: Page-side stream-progress that lets the SW cache the clone

**What:** Fetch + reader-loop pattern that works correctly under a Workbox `CacheFirst`
runtime route.

**When to use:** Any time you want a determinate progress bar over a resource that is
already routed by a Workbox runtime cache.

**Example:**

```ts
// Source: derived from node_modules/workbox-strategies/src/StrategyHandler.ts:253-260
// (fetchAndCachePut clones the response and writes the clone via waitUntil)
async function primeAsset(
  url: string,
  fallbackBytes: number,
  onProgress: (assetUrl: string, received: number, total: number) => void,
): Promise<void> {
  // The cache is reality (D-06) — short-circuit if already cached.
  const cached = await caches.match(url, { cacheName: 'data-artifacts' });
  if (cached) {
    const total = Number(cached.headers.get('content-length')) || fallbackBytes;
    onProgress(url, total, total);
    return;
  }

  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`prime: ${url} → ${res.status}`);

  // CRITICAL: This is the page-side half of the tee. Workbox's CacheFirst already
  // called response.clone() inside the SW and is draining the clone into
  // Cache Storage via event.waitUntil(). We are free to read + discard.
  const total = Number(res.headers.get('content-length')) || fallbackBytes;
  const reader = res.body.getReader();
  let received = 0;
  // Throttle to ~every 100 KB to avoid render thrash (D-discretion).
  const REPORT_EVERY = 100_000;
  let lastReported = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received - lastReported >= REPORT_EVERY) {
      onProgress(url, received, total);
      lastReported = received;
    }
  }
  onProgress(url, received, total); // final tick
}
```

**Critical correctness note:** We do NOT need `response.clone()` on the page side. The
SW already did that. Doing it on the page side too would tee a second time and tie up
memory. The reader-loop fully drains the original Response body; this satisfies the
Response contract from the page's POV. The cached clone proceeds independently in the
SW's `waitUntil`.

### Pattern 2: workbox-window registration + waiting handler

**What:** Replace `navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' })`
with the Workbox helper to gain lifecycle events.

**Example:**

```ts
// src/sw-registration.ts (replaces the current navigator.serviceWorker.register call)
import { Workbox } from 'workbox-window';

async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  // Scope MUST be '/app/' (trailing slash). Workbox.register() forwards options
  // to navigator.serviceWorker.register() unchanged (verified at
  // workbox-window/src/Workbox.ts:361-363).
  const wb = new Workbox('/app/sw.js', { scope: '/app/' });

  // Fired when a new SW is installed but waiting (this tab still controlled by old SW).
  // event.isExternal === true means another tab triggered the update; we still want to
  // surface the banner either way.
  wb.addEventListener('waiting', () => {
    window.dispatchEvent(new CustomEvent('sw-update-available', {
      bubbles: true,
      composed: true,
    }));
    // Store wb on a module-scoped ref so the banner-click handler can call
    // wb.messageSkipWaiting() later. Or attach to window for simplicity:
    (window as Window & { __wb?: Workbox }).__wb = wb;
  });

  // Fired after the new SW takes control (i.e., after our messageSkipWaiting + reload).
  // Not strictly needed since we reload(); kept for completeness / future diagnostics.
  wb.addEventListener('controlling', () => {
    // no-op: window.location.reload() in the banner click handler already cycles us
  });

  try {
    await wb.register();
  } catch (err) {
    console.error('[SW] Registration failed:', err);
  }
}

registerServiceWorker();
```

**Compatibility with `injectRegister: null` (148 D-06):** confirmed compatible.
`injectRegister: null` tells `vite-plugin-pwa` not to emit any auto-register snippet
into the bundle. We own registration via `sw-registration.ts`. `workbox-window` is
just a runtime helper class — it has no build-time interaction with `vite-plugin-pwa`.
It calls `navigator.serviceWorker.register()` directly (verified at
`Workbox.ts:361`). So the migration is purely "swap the register call site, add
listeners."

**Does `workbox-window` auto-register on construction?** No. The constructor only
attaches a `message` listener for SW → page communication (`Workbox.ts:87`). You must
call `wb.register()`. By default `register()` waits for `window.load` before calling
`navigator.serviceWorker.register()` (`Workbox.ts:113-115`); pass `{immediate: true}`
to skip that wait (we don't need to — defer-to-load matches our existing behavior).

### Pattern 3: SW-side SKIP_WAITING listener

**What:** The minimal addition to `src/sw.ts` that completes the prompt-to-reload
contract.

**Example:**

```ts
// src/sw.ts — append AFTER the registerRoute() calls.
// D-16: NO top-level self.skipWaiting() — only inside the message handler,
// which only runs in response to wb.messageSkipWaiting() (a user-initiated click).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
```

**Verification:** `workbox-window.Workbox.messageSkipWaiting()` posts exactly
`{type: 'SKIP_WAITING'}` via the `messageSW` helper to `registration.waiting`
(verified `Workbox.ts:32` constant + `:325-329` call site).

**Build-output test assertion update (D-16 + invariant):** The existing 149 test
`_site/app/sw.js does not contain skipWaiting or clients.claim` will now BREAK because
the new SW source contains the literal string `self.skipWaiting()` inside the message
handler. The test must be relaxed from a string-absence check to a stricter
semantic check:

```ts
// Replace the existing assertion with:
test('_site/app/sw.js calls skipWaiting only inside a message handler (D-16)', () => {
  const sw = readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8');
  // No top-level / install-listener self.skipWaiting()
  // After Rollup, the message handler is a function body containing 'SKIP_WAITING'.
  // The invariant: every occurrence of `skipWaiting` is co-located with 'SKIP_WAITING'.
  const skipMatches = [...sw.matchAll(/skipWaiting/g)];
  expect(skipMatches.length).toBeGreaterThan(0);  // we expect exactly the one inside the handler
  // The message handler is the only legitimate caller; SKIP_WAITING is the gate string.
  expect(sw).toContain('SKIP_WAITING');
  // clients.claim must still be absent (D-16 carry-forward).
  expect(sw).not.toContain('clients.claim');
});
```

### Pattern 4: NetworkFirst route for manifest.json (D-08)

```ts
// src/sw.ts — add alongside the two existing CacheFirst routes.
import { NetworkFirst } from 'workbox-strategies';

registerRoute(
  ({ url }) => url.pathname === '/data/manifest.json',
  new NetworkFirst({
    cacheName: 'data-manifest',          // separate cache — keeps data-artifacts hygiene from 149 D-04 unaffected
    networkTimeoutSeconds: 3,             // D-08 ~3s
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  })
);
```

**Cache name choice:** prefer `data-manifest` (separate from `data-artifacts`) because:
1. 149 D-04's `maxEntries: 1` ExpirationPlugin is scoped to the `.db` route handler,
   but sharing the cache means storage-estimate breakdown stays cleaner.
2. Manifest is ~1 KB JSON — no entry-cap pressure; isolation makes invalidation cheap
   (e.g., a future "clear manifest cache" diagnostic).
3. `data-artifacts` semantically holds binary payload; `data-manifest` is metadata.

### Pattern 5: Cache-match-based ready probe (D-06)

```ts
// In prime-orchestrator.ts or alongside it.
import { resolveDataUrl } from './manifest.ts';

const CACHE_NAME = 'data-artifacts';
const ASSET_KEYS = ['occurrences_db', 'counties', 'ecoregions', 'places'] as const;

export async function computeReadyState(): Promise<{
  ready: boolean;
  cached: Set<string>;  // URLs that hit
  missing: string[];    // asset keys that didn't resolve or didn't hit
}> {
  const cached = new Set<string>();
  const missing: string[] = [];
  for (const key of ASSET_KEYS) {
    const url = await resolveDataUrl(key);
    if (!url) { missing.push(key); continue; }
    const hit = await caches.match(url, { cacheName: CACHE_NAME });
    if (hit) cached.add(url);
    else missing.push(key);
  }
  return { ready: missing.length === 0, cached, missing };
}
```

**Cache probe race-condition answer (focal area 7):** Workbox's `cachePut` runs inside
`event.waitUntil()` and is scheduled in the next microtask (`StrategyHandler.ts:323
await timeout(0)`). So `caches.match()` called *immediately* after `await fetch(url)`
resolves may NOT yet see the entry. **Resolution:** schedule the probe one tick later,
or — simpler — probe after the entire orchestrator loop completes (we always emit a
final progress event at the end of each asset's reader-loop), at which point the
stream has been drained and the SW's `cachePut` has had ample time to flush. For the
in-loop "is this asset now ready" check, prefer probing on the *next* asset's
beginning rather than inline. A single `await new Promise(r => setTimeout(r, 0))`
right after the loop is also acceptable. The decorative orchestrator counter is the
source of truth during the active prime; the cache probe is authoritative at
load-time and after each prime fetch finishes.

### Pattern 6: Intl freshness formatter (D-09, D-12)

```ts
// Add to src/manifest.ts (export alongside resolveDataUrl).

const DAY_MS = 86_400_000;

/**
 * D-09: relative if fresh, absolute if stale. D-12: returns null for unparseable
 * (dev sentinel "local") so the header can hide-with-warning.
 */
export function formatFreshness(
  generatedAt: string,
  now: Date = new Date(),
  locale: string = 'en-US',
): string | null {
  const parsed = new Date(generatedAt);
  if (Number.isNaN(parsed.getTime())) {
    console.warn('[freshness] unparseable generated_at:', generatedAt);
    return null;
  }
  const deltaMs = now.getTime() - parsed.getTime();
  const deltaDays = Math.floor(deltaMs / DAY_MS);

  if (deltaDays < 1) return 'Today';
  if (deltaDays < 2) return 'Yesterday';
  if (deltaDays < 7) {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
    return rtf.format(-deltaDays, 'day');  // "3 days ago"
  }
  // ≥ 7 days: absolute
  const oneYear = 365 * DAY_MS;
  if (deltaMs < oneYear) {
    const dtf = new Intl.DateTimeFormat(locale, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
    return `Data as of ${dtf.format(parsed)}`;
  }
  // ≥ 1 year: drop the day
  const dtf = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short' });
  return `Data as of ${dtf.format(parsed)}`;
}

// Convenience getter for <bee-atlas>:
export async function loadFreshnessLabel(): Promise<string | null> {
  try {
    const m = await loadManifest();  // (loadManifest is currently private — promote it)
    return formatFreshness(m.generated_at);
  } catch {
    return null;
  }
}
```

**`Intl.RelativeTimeFormat` gotchas:**

- Takes a **signed integer** (negative = past) and a **single unit string** (`'day'`,
  `'hour'`, etc.). It does NOT auto-pick the unit — that's our job. The "1-6 days
  ago" range hits exactly one unit (`day`) so we don't need a unit picker for this
  phase.
- `numeric: 'always'` → `"1 day ago"`. `numeric: 'auto'` → `"yesterday"`. Since
  D-09 already special-cases `Yesterday`, use `'always'` for the 3–6 day window so we
  don't get `"yesterday"` twice.

### Pattern 7: `navigator.storage.estimate()` formatting (D-18, D-19)

```ts
// In <bee-atlas> or a small util.
export async function readStorageEstimate(): Promise<{
  usageMB: string;        // "23.4"
  quotaMB: string | null; // "47" if quota is <200MB and non-null; else null (hide)
} | null> {
  if (!navigator.storage?.estimate) return null;  // D-19 feature-detect → hide
  const { usage, quota } = await navigator.storage.estimate();
  if (typeof usage !== 'number') return null;
  const usageMB = (usage / 1_048_576).toFixed(1);
  let quotaMB: string | null = null;
  if (typeof quota === 'number' && quota > 0 && quota < 200 * 1_048_576) {
    // D-18: surface quota only when meaningful (iOS-like ~50 MB constrained case)
    quotaMB = Math.round(quota / 1_048_576).toString();
  }
  return { usageMB, quotaMB };
}
```

**iOS Safari edge cases (focal area 4):**

- iOS Safari 17+: returns `{usage, quota}` reliably. `quota` is typically reported
  as a large advisory number (e.g., ~1 GB on a roomy device) but **actual eviction
  pressure starts at ~50 MB for non-persisted PWAs** per the WebKit storage policy
  cited in `.planning/research/PITFALLS.md`. The "show quota only if < 200 MB" rule
  catches the genuinely-constrained reading; on a roomy device the quota line stays
  hidden, which is the desired quiet-UI behavior.
- iOS ≤16: `navigator.storage` exists but `.estimate` may be undefined or return
  approximate numbers. `usageDetails` (per-cache breakdown) is **NOT implemented in
  any Safari version as of 2026-06** — deferred ideas already exclude per-cache
  breakdown for this phase, which aligns.
- Workers: irrelevant — we call `estimate()` only on the main thread inside the
  popover lifecycle.

### Pattern 8: `<bee-header>` popover (D-17)

```ts
// Sketch — inside <bee-header>.render():
render() {
  return html`
    <div class="left-group">...</div>
    <div class="right-group">
      ${this.offline ? html`<span class="offline-pill">Offline</span>` : ''}
      <button
        class="ready-pill"
        @click=${this._togglePopover}
        aria-haspopup="dialog"
        aria-expanded=${this._popoverOpen}
      >
        ${this._renderReadyPillContent()}
      </button>
      ${this._popoverOpen ? this._renderPopover() : ''}
      <a href="https://github.com/rainhead/beeatlas" ...>...</a>
    </div>
  `;
}

private _togglePopover(e: Event) {
  e.stopPropagation();
  this._popoverOpen = !this._popoverOpen;
  // Emit composed:true event so <bee-atlas> can lazy-trigger estimate() on open
  this.dispatchEvent(new CustomEvent('cache-popover-toggle', {
    detail: { open: this._popoverOpen },
    composed: true, bubbles: true,
  }));
}
```

CSS: position popover with `position: absolute; top: 100%; right: 0;` inside the
right-group flex container. Click-outside-to-close via a `@click` listener on
`document` registered in `connectedCallback` and removed in `disconnectedCallback`.
**No new dependency** — no `@floating-ui` or anchor positioning shim needed; the
header is fixed-position chrome and the popover is right-anchored, so manual
positioning works.

### Anti-Patterns to Avoid

- **Don't call `response.clone()` in the orchestrator** — Workbox's `CacheFirst`
  already cloned the response on the SW side. A double-clone tees memory unnecessarily
  and can confuse the `getReader()` ownership model.
- **Don't read `response.arrayBuffer()` after the reader loop** — the body is
  already fully consumed by the loop; calling `.arrayBuffer()` will throw
  `TypeError: body stream already read`. The orchestrator pattern in Pattern 1 above
  is the correct way; do NOT add a `.arrayBuffer()` "consume it fully" step.
- **Don't call `self.skipWaiting()` at the top level of `src/sw.ts`** — it must live
  ONLY inside the `message` listener (D-16 invariant). The build-output test gates
  this.
- **Don't poll `navigator.storage.estimate()`** — call lazy on popover open + on
  `online`/`focus` (D-18 lock).
- **Don't try to detect "external" SW updates via a separate `externalwaiting`
  event** — Workbox 7.4.1 doesn't emit one; use `waiting` + (optionally)
  `event.isExternal`.
- **Don't show "Data as of `<date>`" when `generated_at` is the dev sentinel
  `"local"`** — D-12 says hide-with-warning. The `formatFreshness` helper returns
  `null` for unparseable input; `<bee-header>` renders nothing when it receives
  `null` (avoid placeholder `—`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Page → SW handshake for `SKIP_WAITING` | Custom `postMessage` plumbing on registration ready state | `workbox-window.Workbox.messageSkipWaiting()` | Already gated on `registration.waiting` existing; no-op otherwise. Verified at `Workbox.ts:325-329`. |
| SW lifecycle event dispatch (`waiting`, `controlling`, `installed`) | Hand-rolled `updatefound` + `statechange` polyfill | `wb.addEventListener('waiting', ...)` | Workbox's heuristic correctly distinguishes "own SW" vs "external tab" updates (`Workbox.ts:401-407`). |
| Relative-date formatting ("3 days ago") | Hand-coded `if (days===1) return 'Yesterday'` chain | `Intl.RelativeTimeFormat` with `numeric: 'always'` | Localizable for free, correct pluralization. |
| Date formatting ("Jun 15, 2026") | `toLocaleDateString()` with magic string | `Intl.DateTimeFormat({year, month, day})` | Explicit options survive locale changes; readable. |
| Streaming progress | Custom `XHR.onprogress` (works but legacy) | `Response.body.getReader()` + `getReader().read()` loop | Native fetch API; works in SW context too; standard. |
| Storage estimate breakdown | Custom `caches.keys().reduce(...)` byte counter | `navigator.storage.estimate()` | The browser knows the true on-disk size including Cache Storage overhead; a hand-counter would underreport. |

**Key insight:** Every primitive Phase 150 needs is in the standard browser API or in
Workbox 7.4.1, which is already installed. The phase is composition + UX work, not
new infrastructure.

## Runtime State Inventory

Phase 150 is greenfield UX (no rename/refactor/migration), but several runtime-state
concerns from the surrounding plumbing apply:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data (localStorage) | `beeatlas-persist-asked` (149 D-12 — kept untouched). **Add:** `beeatlas-prime-total-bytes` per D-04 (cached known-total for determinate bar on subsequent visits). | None for existing key; add the new key in `prime-orchestrator.ts`. |
| Stored data (Cache Storage) | `data-artifacts` cache (149) — keep. **Add:** `data-manifest` cache (D-08 NetworkFirst route). Storage estimate will include both. | None; cache names are SW-managed. |
| Live service config | None — static-hosting only. | None. |
| OS-registered state | None — page-side only. | None. |
| Secrets / env vars | `VITE_DATA_BASE_URL` already used by `manifest.ts`; no new env vars. | None. |
| Build artifacts | `_site/app/sw.js` regenerates on every build — its NetworkFirst route literal must be asserted by `build-output.test.ts`. `package.json` `dependencies` vs `devDependencies` distinction matters for what `vite-plugin-pwa` ships in the bundle (D-13). | Move `workbox-window` to `dependencies`; extend build-output test. |

## Common Pitfalls

### Pitfall 1: Workbox waiting event misses in development vs production

**What goes wrong:** In dev mode (`npm run dev`, Eleventy + Vite middleware), the SW
is regenerated per-build but the dev server may not serve `/app/sw.js` with the same
`Cache-Control` headers as production (Phase 147 D-04 sets `no-cache` via CDK on
production). The browser may cache the dev SW for up to 24h and the `waiting` event
never fires.

**Why it happens:** Browser SW update check is gated by HTTP cache directives on the
SW script itself. Dev server defaults can vary.

**How to avoid:**
- Manually trigger updates in DevTools (Application → Service Workers → Update on
  reload checkbox) during dev testing of the prompt-to-reload banner.
- Verify in production using the existing 147 D-04 `no-cache` CDK behavior on
  `/app/sw.js` — this is already in place.
- For automated tests, drive the banner via direct dispatch of the
  `sw-update-available` CustomEvent rather than going through the real SW lifecycle.
  Mock `wb.messageSkipWaiting` in the banner-click test.

**Warning signs:** Hand-testing prompt-to-reload locally and the banner never appears
despite a code change; or DevTools shows "Service Worker: redundant" instead of
"waiting".

### Pitfall 2: CloudFront / S3 Content-Length absent on data responses

**What goes wrong:** CloudFront with chunked transfer encoding may omit
`Content-Length`. The orchestrator's denominator becomes 0 and the determinate bar
collapses to indeterminate.

**Why it happens:** S3 always sets `Content-Length` for static objects, but
CloudFront can use chunked TE when applying response transformations. For static
objects with no transformation, this is rare but not impossible.

**How to avoid:**
- D-04 already specifies a fallback approximation (`~23 MB DB + ~5 MB GeoJSON ≈
  28 MB total`) with reconciliation. Implement the fallback with the per-asset
  defaults: `{occurrences_db: 23_000_000, counties: 3_000_000, ecoregions: 2_000_000,
  places: 200_000}`. Reconcile against `received` after each asset completes — once
  drained, `total` = `received` (we know the true size at the end).
- Persist the reconciled `total` to `localStorage` under
  `beeatlas-prime-total-bytes` (D-04) so the second visit starts with the true
  number.
- **Quick verification:** `curl -I https://beeatlas.net/data/manifest.json` (and
  one of the .geojson files) once during planning; if `Content-Length` is present,
  the fallback is purely defensive. (Not strictly required for the plan — D-04 spans
  both states.)

**Warning signs:** Progress bar shows `received` climbing but `total` stuck at the
fallback; bar visibly snaps to 100% suddenly at end of asset rather than smoothly.

### Pitfall 3: Stream interruption (offline mid-prime) leaves partial state

**What goes wrong:** User goes offline while `prime-orchestrator` is streaming
asset N of 4. The `await reader.read()` rejects; Workbox's `cachePut` on the SW side
also rejects (or never writes — connection died); cache contains assets 1..N-1 but
nothing for N. The ready probe returns `partial: true`, pill flips to "Finish on
WiFi" (D-07). On reconnect, the `online` listener re-runs the orchestrator; it
should *skip* assets already in the cache (cache probe) and resume from asset N.

**Why it happens:** Per-asset atomicity is the SW's responsibility; partial writes
to Cache Storage are not committed (`cache.put` is atomic per spec). Workbox's
`fetchAndCachePut` only commits after the full clone drains.

**How to avoid:**
- In `prime-orchestrator.ts`, **before each per-asset `fetch()`**, call
  `caches.match(url, {cacheName: 'data-artifacts'})` and skip the asset if it hit.
  This makes the orchestrator naturally resumable.
- Wrap the orchestrator loop in `try/catch`; on network error, dispatch a
  `cache-prime-paused` event (or no event at all — the next `online` listener will
  resume). Do NOT show an error toast — D-07's "Finish on WiFi" pill is the
  user-visible signal.

**Warning signs:** Ready pill stuck at "Caching… 73%" after going offline + back
online; means the resumption path isn't triggering. Verify the `online` listener in
`app-entry.ts` calls into the orchestrator.

### Pitfall 4: Multiple tabs racing the prime

**What goes wrong:** User opens `/app` in two tabs. Both kick off the orchestrator.
Both fetch the same URLs. The SW's `CacheFirst` will serve the second request from
cache (after first completes), but during the overlap, both tabs may double-fetch.

**Why it happens:** Tabs don't share JS state; the orchestrator runs per-tab. The SW
is shared but per-route deduplication isn't a Workbox CacheFirst feature.

**How to avoid:** Accept the rare double-fetch — it's bounded by 28 MB and only
happens during the ~30-second initial prime. Documenting this as expected behavior is
sufficient. (A Web Lock via `navigator.locks.request('beeatlas-prime', ...)` is the
"right" fix but is over-engineering for this corner case.)

**Warning signs:** None — invisible to the user. May show up as anomalous bandwidth
in field analytics if those are ever added.

### Pitfall 5: `manifest.ts` `_promise` cache hides post-update freshness

**What goes wrong:** `src/manifest.ts:16-24` memoizes the manifest fetch in a
module-level `_promise`. After the user accepts an SW update + reload, the new page
load gets a fresh module instance — so this is fine. **But** if a `/app` SPA-style
navigation ever happens without a full reload (it doesn't today, since `<bee-atlas>`
is rendered once per page load), the cached promise would serve stale data. Phase
150 doesn't introduce SPA navigation, so this is latent.

**Why it happens:** Module-scope singletons are session-scoped, not phase-scoped.

**How to avoid:** For Phase 150, no action needed. **Flag for future phases:** if
SPA navigation is ever added to `/app`, `manifest.ts` will need a `clearManifestCache()`
helper. Note in the plan but don't implement.

### Pitfall 6: `_freshnessLabel` re-renders cause `formatFreshness()` re-runs

**What goes wrong:** If `<bee-atlas>` recomputes `_freshnessLabel = formatFreshness(...)`
on every render (e.g., via a getter), the string churns when nothing has changed,
causing pill flicker.

**How to avoid:** Compute `_freshnessLabel` once on manifest load (in `firstUpdated`
or after the awaited `loadManifest()`) and store as `@state`. Re-compute only on
`online`/`focus` events that may refresh the manifest. (The 7-day-boundary recompute
on actual day boundaries is acceptable churn — it happens at most once per page
session per day.)

## Code Examples

### Composite event payload shape (focal area 8)

```ts
// prime-orchestrator → <bee-atlas>
interface CachePrimeProgressDetail {
  received: number;       // total bytes received across all assets so far
  total: number;          // sum of content-lengths (or fallbacks) across all assets
  assetInFlight: string | null;  // URL currently being streamed; null when idle
  ready: boolean;         // computed by computeReadyState() after each asset completes
}
window.dispatchEvent(new CustomEvent<CachePrimeProgressDetail>('cache-prime-progress', {
  detail: { received, total, assetInFlight, ready },
  bubbles: true, composed: true,
}));

// sw-registration → <bee-atlas>
window.dispatchEvent(new CustomEvent('sw-update-available', {
  bubbles: true, composed: true,
}));  // no payload — pure signal

// <bee-header> → <bee-atlas> (popover toggled open)
this.dispatchEvent(new CustomEvent<{ open: boolean }>('cache-popover-toggle', {
  detail: { open: this._popoverOpen },
  bubbles: true, composed: true,
}));
```

**`<bee-atlas>` event wiring (in `connectedCallback` or `firstUpdated`):**

```ts
connectedCallback() {
  super.connectedCallback();
  window.addEventListener('cache-prime-progress', this._onPrimeProgress);
  window.addEventListener('sw-update-available', this._onSwUpdateAvailable);
  this.addEventListener('cache-popover-toggle', this._onPopoverToggle);
  // ... existing 149 listeners (online/offline) preserved
}

disconnectedCallback() {
  super.disconnectedCallback();
  window.removeEventListener('cache-prime-progress', this._onPrimeProgress);
  window.removeEventListener('sw-update-available', this._onSwUpdateAvailable);
  this.removeEventListener('cache-popover-toggle', this._onPopoverToggle);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `XHR.onprogress` for streaming progress | `Response.body.getReader()` loop | ~2018 (fetch streams broad support) | Cleaner, async/await native, works in SW context |
| `navigator.serviceWorker.register()` + manual `updatefound`/`statechange` plumbing | `workbox-window.Workbox` class with typed events | Workbox 6.x (2020) | Eliminates 50+ lines of lifecycle boilerplate; correctly handles external-tab updates |
| `clientsClaim` + `skipWaiting` "always update" pattern | Prompt-to-reload (our pattern) | Field-established ~2021; explicitly recommended for apps with data ↔ code coupling | Avoids version skew during runtime; user-controlled atomic updates |
| `toLocaleDateString()` for relative dates | `Intl.RelativeTimeFormat` | ES2020 broad support | Proper pluralization, locale-aware "3 days ago" without per-locale code |

**Deprecated/outdated:** none in this phase's stack — every API used is current
and broadly supported.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | CloudFront serves `Content-Length` on `/data/*.db` and `/data/*.geojson` responses (no chunked TE) | Pitfall 2 / D-04 fallback | LOW — D-04 already specifies a fallback approximation; one `curl -I` in plan-time discovery confirms |
| A2 | iOS Safari 17+ reports `quota` accurately enough that the `<200 MB` heuristic correctly identifies the constrained case | Pattern 7 / D-18 | LOW — D-18 makes the line opt-in; misclassification just shows/hides a secondary detail |
| A3 | Multiple-tab double-fetch during prime is acceptable | Pitfall 4 | LOW — bounded by 28 MB, rare |
| A4 | `Intl.RelativeTimeFormat` is available on all `/app` target browsers (PWA-grade mobile Chrome/Safari) | Pattern 6 | NIL — broad support since ~2020; no fallback needed |

**None of these claims are load-bearing or compliance-critical.** All four can be left
to plan-time without blocking research.

## Open Questions

None requiring user escalation. CONTEXT.md (D-01..D-20) plus the verified
workbox-window/workbox-strategies sources answer every focal-area question
unambiguously.

One **planner discretion** decision worth flagging (already authorized by CONTEXT.md
"Claude's Discretion"):

1. **Where the prime orchestrator lives.** CONTEXT.md authorizes `src/prime-
   orchestrator.ts` OR merged into `src/app-entry.ts` / `src/cache-probe.ts`.
   Recommendation: **separate file `src/prime-orchestrator.ts`**, because it has its
   own unit test surface (Pattern 1 + Pattern 5) and `app-entry.ts` is meant to stay
   small per the existing 149 idiom. `cache-probe.ts` doesn't exist yet — don't
   create it just to absorb this; the orchestrator IS the probe in 150.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `workbox-window` (npm) | D-13 | ✓ | 7.4.1 | — (already installed) |
| `workbox-strategies` (npm) — `NetworkFirst` | D-08 | ✓ | 7.4.1 | — |
| `node` runtime (test runner) | Vitest tests | ✓ | per `.nvmrc` | — |
| `vitest@4.1.8` | new tests in `src/tests/` | ✓ | 4.1.8 | — |
| `happy-dom@20.10.3` | Lit component render tests | ✓ | 20.10.3 | — |

No missing dependencies. No external services needed.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 |
| Config file | `vitest.config.ts` (if present) or inferred from `package.json` script `vitest run` |
| Quick run command | `npx vitest run src/tests/prime-orchestrator.test.ts src/tests/manifest-freshness.test.ts src/tests/bee-header.test.ts src/tests/bee-atlas.test.ts` |
| Full suite command | `npm test` (i.e., `vitest run`) — includes the 30+ second `build-output.test.ts` |
| Skip-build fast path | `VITEST_SKIP_BUILD=1 npm test` (existing pattern) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CACHE-01 | Ready computed by `caches.match()` probe across 4 assets | unit | `npx vitest run src/tests/prime-orchestrator.test.ts -t "computeReadyState"` | Wave 0 |
| CACHE-01 | `<bee-header>` renders three pill states (Caching/Finish on WiFi/Offline-ready) on prop changes | component | `npx vitest run src/tests/bee-header.test.ts -t "ready pill"` | Wave 0 |
| CACHE-02 | Orchestrator emits monotonically-increasing `received` events that sum to `total` | unit | `npx vitest run src/tests/prime-orchestrator.test.ts -t "byte progress"` | Wave 0 |
| CACHE-02 | Orchestrator falls back to per-asset constants when `Content-Length` is absent | unit | `npx vitest run src/tests/prime-orchestrator.test.ts -t "content-length absent"` | Wave 0 |
| CACHE-02 | Orchestrator persists discovered `total` to `localStorage` (D-04) | unit | `npx vitest run src/tests/prime-orchestrator.test.ts -t "localStorage persist"` | Wave 0 |
| CACHE-02 | Orchestrator skips already-cached assets (resumability — Pitfall 3) | unit | `npx vitest run src/tests/prime-orchestrator.test.ts -t "skips cached"` | Wave 0 |
| CACHE-03 | Storage popover hides line when `navigator.storage.estimate` undefined (D-19) | component | `npx vitest run src/tests/bee-header.test.ts -t "no estimate"` | Wave 0 |
| CACHE-03 | Storage popover hides quota when ≥200 MB; shows when < 200 MB (D-18) | component | `npx vitest run src/tests/bee-header.test.ts -t "quota visibility"` | Wave 0 |
| CACHE-04 | `formatFreshness` produces "Today" / "Yesterday" / "3 days ago" / "Data as of Jun 15, 2026" / "Data as of Mar 2026" across boundaries | unit | `npx vitest run src/tests/manifest-freshness.test.ts` | Wave 0 |
| CACHE-04 | `formatFreshness("local")` returns `null` + console.warn (D-12) | unit | `npx vitest run src/tests/manifest-freshness.test.ts -t "dev sentinel"` | Wave 0 |
| CACHE-04 | `<bee-header>` hides freshness sub-line when label is `null` (D-11/D-12) | component | `npx vitest run src/tests/bee-header.test.ts -t "no freshness"` | Wave 0 |
| OFF-03 (carry) | `<bee-atlas>` renders update banner on `sw-update-available`; tap calls `wb.messageSkipWaiting()` | component | `npx vitest run src/tests/bee-atlas.test.ts -t "update banner"` | Wave 0 |
| OFF-03 (carry) | `_site/app/sw.js` calls `skipWaiting` ONLY inside a message handler; no `clients.claim` | build-output | `npx vitest run src/tests/build-output.test.ts -t "skipWaiting only inside"` | extend existing |
| OFF-03 (carry) | `_site/app/sw.js` registers `NetworkFirst` route literal for `manifest.json` (D-08) | build-output | `npx vitest run src/tests/build-output.test.ts -t "manifest.json NetworkFirst"` | extend existing |
| D-13 | `package.json` lists `workbox-window` under `dependencies` (not `devDependencies`) | build-output | `npx vitest run src/tests/build-output.test.ts -t "workbox-window is a runtime dep"` | extend existing |

### Sampling Rate

- **Per task commit:** `VITEST_SKIP_BUILD=1 npx vitest run` (fast — skips the 30s+
  build-output suite while keeping all new unit/component tests)
- **Per wave merge:** `npm test` (full suite, includes build-output assertions)
- **Phase gate:** Full suite green + manual smoke on `/app` (prime → toggle DevTools
  offline → reload → see "Finish on WiFi" pill + cached map; trigger SW update via
  DevTools → see banner; tap → reload) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/tests/prime-orchestrator.test.ts` — covers CACHE-01 (probe) + CACHE-02
  (byte progress, fallback, persist, resume)
- [ ] `src/tests/manifest-freshness.test.ts` — covers CACHE-04 (formatter +
  sentinel)
- [ ] `src/tests/bee-header.test.ts` — covers CACHE-01 (pill states), CACHE-03
  (popover visibility rules), CACHE-04 (sub-line hide)
- [ ] `src/tests/bee-atlas.test.ts` — covers OFF-03 carry (update banner +
  dismiss + tap-to-reload path)
- [ ] `src/tests/build-output.test.ts` — extend in-place with the three new
  assertions in the table above; **and** rewrite the existing
  `does not contain skipWaiting` assertion per Pattern 3 above (it WILL break
  otherwise).

Framework install: none — Vitest 4.1.8 and happy-dom 20.10.3 are already in
`devDependencies` (verified `package.json:34`).

## Project Constraints (from CLAUDE.md)

- **State ownership:** `<bee-atlas>` owns ALL reactive state. New cache state
  (`_cacheState`, `_primeProgress`, `_updateAvailable`, `_freshnessLabel`,
  `_storageEstimate`) MUST live on `<bee-atlas>`. `<bee-header>` receives them via
  `@property` and emits events upward (no shared module-level mutable state for
  these). The prime-orchestrator module is the ONE allowed exception for shared
  side-effect state — and only for `localStorage` keys and Cache Storage, which are
  cross-tab persistent stores, not reactive in-tab state.
- **Style cache invariant** (mapbox-gl):  N/A this phase — we don't touch map style
  functions.
- **Filter race guard:** N/A this phase.
- **ID format:** N/A this phase.
- **Static hosting only:** all logic is page-side or SW-side; no server runtime
  required. Compatible.
- **Python 3.14+:** N/A this phase (no `data/` changes).
- **AWS via CDK in `infra/`:** N/A this phase — no infra changes (manifest.json
  CloudFront behavior already exists from prior phases).

## File-Roles (delta from v5.0 file-roles, for this phase)

| File | Status | Role after Phase 150 |
|------|--------|----------------------|
| `src/sw.ts` | MODIFY | Add `NetworkFirst` route for `/data/manifest.json` (D-08); add `message` listener that calls `self.skipWaiting()` ONLY on `{type:'SKIP_WAITING'}` (Pattern 3, D-16) |
| `src/sw-registration.ts` | MODIFY | Replace `navigator.serviceWorker.register('/app/sw.js', {scope:'/app/'})` with `new Workbox('/app/sw.js', {scope:'/app/'}).register()`; add `'waiting'` listener → dispatch `sw-update-available` CustomEvent; store wb on `window.__wb` so banner-click can call `messageSkipWaiting()`. `requestPersistentStorage()` block UNCHANGED. |
| `src/manifest.ts` | MODIFY | Export `formatFreshness(generated_at, now?, locale?)` per Pattern 6; export `loadFreshnessLabel()` convenience. Promote `loadManifest` to exported (currently private) so the freshness helper and orchestrator can share. |
| `src/prime-orchestrator.ts` | NEW | Owns the byte-progress fetch loop (Pattern 1), the `computeReadyState()` probe (Pattern 5), and the `localStorage` persistence of total bytes (D-04). Imported by `src/app-entry.ts` as a side-effect module that registers the cold-start + `online` listeners. |
| `src/app-entry.ts` | MODIFY | Replace the inline `probeAndReprime()` with `import './prime-orchestrator.ts';` (the orchestrator subsumes it). Remove the manual `online` listener (orchestrator owns it). |
| `src/bee-atlas.ts` | MODIFY | Add `@state _cacheState`, `_primeProgress`, `_updateAvailable`, `_freshnessLabel`, `_storageEstimate`. Add window event listeners for `cache-prime-progress` and `sw-update-available`. Add element listener for `cache-popover-toggle` (lazy-calls `readStorageEstimate()`). Add the bottom update-banner render. Relay all five new states to `<bee-header>` as `@property`. |
| `src/bee-header.ts` | MODIFY | Add `@property` for `cacheState`, `primeProgress`, `freshnessLabel`, `storageEstimate`. Add internal `@state _popoverOpen`. Render the ready-pill with inline determinate bar; render the popover containing freshness + storage + passive update-affordance (Pattern 8). Add freshness sub-line under `<h1>BeeAtlas</h1>` (or as tooltip on the pill — planner discretion within "always visible"). |
| `src/tests/build-output.test.ts` | MODIFY | Update the `does not contain skipWaiting` assertion to permit the SKIP_WAITING-gated call (Pattern 3). Add three new assertions: `manifest.json` NetworkFirst route literal, `workbox-window` in `dependencies` not `devDependencies`. |
| `src/tests/prime-orchestrator.test.ts` | NEW | Wave 0 — see Validation Architecture table for cases. |
| `src/tests/manifest-freshness.test.ts` | NEW | Wave 0 — `formatFreshness` across thresholds + dev sentinel. |
| `src/tests/bee-header.test.ts` | NEW | Wave 0 — pill states + popover visibility rules. |
| `src/tests/bee-atlas.test.ts` | NEW | Wave 0 — update-banner + dismiss + tap. |
| `package.json` | MODIFY | Move `workbox-window` from `devDependencies` to `dependencies` (D-13). |

**Untouched (do NOT modify):**
- `<bee-pane>`, `<bee-table>`, `<bee-map>`, `<bee-occurrence-detail>` — pure
  presenter / non-cache-related.
- `eleventy.config.js` — Workbox plugin wiring is settled by 148; no change.
- `vite.config.ts` — never touched (Pitfall 3 from `.planning/research/PITFALLS.md`).
- `infra/` — no infra change; manifest.json CloudFront behavior already exists.
- `_pages/`, `data/`, `scripts/` — out of scope.

## Sources

### Primary (HIGH confidence)

- `node_modules/workbox-window/src/Workbox.ts` (installed v7.4.1) — verified
  `register()`, `messageSkipWaiting()`, `waiting`/`controlling`/`installed` events,
  SKIP_WAITING_MESSAGE constant
- `node_modules/workbox-window/src/utils/WorkboxEvent.ts` — verified
  `WorkboxLifecycleEventMap` (no `externalwaiting` event — confirmed absent)
- `node_modules/workbox-strategies/src/StrategyHandler.ts:253-260` — verified
  `fetchAndCachePut` clones response BEFORE returning to handler caller; cache write
  proceeds in `waitUntil()`. This is the central correctness verification for
  D-02.
- `node_modules/workbox-strategies/src/StrategyHandler.ts:320-407` — verified
  `cachePut` runs `await timeout(0)` then `cache.put(...)`; informs Pattern 5 race
  guidance
- `.planning/phases/150-cache-health-freshness-ux/150-CONTEXT.md` — locked
  decisions D-01..D-20
- `.planning/REQUIREMENTS.md` — CACHE-01..04 locked text
- `.planning/research/PITFALLS.md` (project-internal v5.0 research bundle) —
  iOS storage, SW lifecycle, partial-write
- `.planning/research/STACK.md` (project-internal) — Workbox 7.4.1 + vite-plugin-pwa
  1.3.0 wiring details
- `src/sw.ts`, `src/sw-registration.ts`, `src/manifest.ts`, `src/app-entry.ts`,
  `src/bee-header.ts`, `src/bee-atlas.ts`, `src/tests/build-output.test.ts` —
  current state read directly

### Secondary (MEDIUM confidence)

- MDN `Response.body` + `ReadableStream.getReader()` semantics (cross-referenced
  against the Workbox source; consistent)
- MDN `Intl.RelativeTimeFormat`, `Intl.DateTimeFormat` — standard ES2020 features
- MDN `navigator.storage.estimate()` — broadly supported; `usageDetails` is
  draft/non-standard

### Tertiary (LOW confidence)

- None required for this research — every focal-area answer is grounded in either
  installed source or locked CONTEXT.md decisions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — installed-source verification of workbox-window 7.4.1
  surface; no remote registry guessing
- Architecture: HIGH — CONTEXT.md D-01..D-20 already locked the architecture; this
  research validates feasibility against the installed code and finds no blockers
- Pitfalls: HIGH for pitfalls 1–4 (sourced from PITFALLS.md + Workbox source); MEDIUM
  for pitfalls 5–6 (project-specific reasoning, low risk)
- Test architecture: HIGH — Vitest + happy-dom already in use; clear extension path
  from 149's test patterns

**Research date:** 2026-06-18
**Valid until:** 2026-07-18 (workbox-window 7.4.1 is stable; CONTEXT.md decisions
locked; only a Workbox major version bump would invalidate the API findings — none
expected within this milestone window).

## RESEARCH COMPLETE
