# Architecture Research: v5.0 Offline Field Mode

**Domain:** PWA offline + geolocation integration for an existing Eleventy+Vite+Lit static map SPA
**Researched:** 2026-06-10
**Confidence:** HIGH (SW scope rules from MDN; Cache API behavior from web.dev; existing code read directly)

---

## 1. SW Scope vs. `/data/` Intercept: The Decisive Fact

**The tension is real but resolvable without any CDK/CloudFront header changes.**

The scope of a service worker controls which **pages/documents** it governs, not which **fetches** it can intercept. MDN is explicit: once a page at `/app` is controlled by a SW, that SW's `fetch` handler fires for every network request that page issues — including same-origin requests to `/data/occurrences_hash.db`, `/data/counties_hash.geojson`, and all other content-hashed `/data/` artifacts — regardless of those paths being outside the SW's scope.

Consequence: registering the SW with `scope: '/app'` and serving `sw.js` from `/app/sw.js` gives full intercept power over all `/data/` fetches made by the `/app` page. The `/` (index) page has no SW and is unaffected.

### 1a. SW File Location and Scope Declaration

| Option | File served at | Registration scope | `Service-Worker-Allowed` needed? |
|--------|---------------|-------------------|----------------------------------|
| A (recommended) | `/app/sw.js` | `/app` (default) | No |
| B | `/sw.js` (root) | `/` | No (default = script dir) |
| C | `/app/sw.js` | `/` | YES — CloudFront must add `Service-Worker-Allowed: /` on that path |

**Use Option A.** The SW file lives in `public/app/sw.js` (Vite copies `public/` verbatim, no hashing). Registration inside the `/app` page HTML: `navigator.serviceWorker.register('/app/sw.js', { scope: '/app' })`. Scope defaults to `/app/` because the script is at `/app/sw.js`. No header changes needed anywhere.

The only case requiring `Service-Worker-Allowed` is if `sw.js` were served from a Vite-hashed path (e.g. `/assets/sw-abc123.js`) with `scope: '/'`. Avoid hashing `sw.js` — service workers must be at a stable URL for the browser's update detection to work correctly. Placing it in `public/app/` keeps it stable.

### 1b. Why `/` Stays Clean

Pages at `/`, `/species/...`, `/places/...` are not within the SW's scope (`/app`). They load with no service worker attached. The SW has zero effect on them. There is no contamination and no change needed to the existing pages.

### 1c. PWA Web App Manifest

`manifest.webmanifest` must declare:
```json
{ "start_url": "/app", "scope": "/app" }
```

Linked only from `/app/index.html`, not from `/index.html`. Chrome's installability check requires `start_url` within `scope` and within the registered SW's scope — all three align at `/app`.

---

## 2. Caching Strategy

### 2a. App Shell Precache

The app shell — `/app/index.html` plus the Vite-hashed JS and CSS bundles for the `/app` entry — is precached at SW install time. Because Vite emits content-hashed filenames (`/assets/bee-atlas-abc123.js`), the precache manifest is a static list. The SW stores these in Cache Storage under a `shell-v1` cache.

Use Workbox `injectManifest` mode (not `generateSW`) because the existing build pipeline is already bespoke and the SW needs custom logic: manifest.json-keyed invalidation and proximity caching. Workbox reads the Vite build manifest at build time and injects the precache list into the hand-written SW source.

### 2b. Runtime Cache for `/data/` Artifacts

`occurrences_<hash>.db`, `counties_<hash>.geojson`, `ecoregions_<hash>.geojson`, `places_<hash>.geojson`, and `checklist_<hash>.geojson` are all content-hashed. They live outside the SW scope path but are fetched by the controlled `/app` page, so the SW's `fetch` handler intercepts them.

**Strategy: Cache-First for all `/data/` content-hashed files** (they are immutable — the hash changes when content changes). Use a dedicated `data-v1` cache. Intercept all same-origin `/data/` fetches from the `/app` page.

**Large binary (`occurrences.db`, ~23 MB):** Cache Storage is the correct storage layer, not IndexedDB. Reasons:
- Cache Storage holds `Response` objects keyed by `Request` — the natural fit for HTTP-fetched files.
- The existing `sqlite-worker.ts` does `fetch(occurrencesDbUrl)` then `resp.arrayBuffer()`. The SW intercepts this fetch and responds from cache with a cached `Response`. The worker sees no difference.
- IndexedDB can hold binary blobs but adds ~850 ms overhead for large ArrayBuffer writes vs ~90 ms for Cache Storage (benchmark data from OPFS/IndexedDB comparison studies).
- OPFS (Origin Private File System) would be faster than IndexedDB for binary, but it requires changing the worker's VFS (MemoryVFS → OPFSCoopSyncVFS) — a larger change that breaks the existing initialization path. Defer OPFS migration to a future milestone if startup latency is a problem. Stay with MemoryVFS + Cache Storage for v5.0.

**Range requests:** CloudFront can serve `206 Partial Content` responses to range requests. The Cache API cannot cache `206` responses via `cache.put`. The existing `sqlite-worker.ts` issues a single full non-range `fetch` — no range header — so this is not currently a problem. Note this as a constraint: if the fetch is ever refactored to use range requests (e.g., for progressive loading), the caching strategy must change.

### 2c. Cache Invalidation Keyed to `manifest.json`

The nightly pipeline produces content-hashed filenames. `manifest.json` maps logical keys to hashed filenames, e.g. `{ "occurrences_db": "occurrences_abc123.db", ... }`. When a new snapshot ships, only the hash changes; the logical key stays the same.

**Invalidation mechanism:**

1. SW runtime-caches `manifest.json` with a `NetworkFirst` strategy (fall back to cache if offline). `manifest.json` is NOT content-hashed — it lives at a stable URL `/data/manifest.json`.
2. On SW activation (triggered when a new SW version installs, detected by change in `sw.js` content), the SW fetches the latest `manifest.json` from the network, compares each hashed filename to what is in `data-v1`, deletes entries whose hash has changed, and queues a background fetch of the new artifacts.
3. Old content-hashed files no longer referenced by the new manifest are deleted from `data-v1` at activation time.

This ensures the cache is always internally consistent with the manifest version the SW saw on its last activation. The freshness indicator (Section 3) comes directly from `manifest.generated_at`.

### 2d. Mapbox Tile Caching

Mapbox GL JS fetches tiles from Mapbox CDN (cross-origin, `https://api.mapbox.com/`). The SW's `fetch` handler does fire for these requests (cross-origin fetches from a controlled page still trigger the SW), but caching opaque (no-CORS) responses in Cache Storage carries known risks: browsers may store opaque responses with a padded size estimate of ~7 MB regardless of actual size, and `cache.put` on an opaque response succeeds but the stored response has status 0 (not 200), which causes Workbox's default `cacheableResponse` plugin to reject it.

For v5.0 dogfood (self-test only), an opaque response strategy is acceptable with Workbox's `CacheableResponsePlugin({ statuses: [0, 200] })` opt-in. This is TOS-sensitive — noted in project requirements. Use Workbox's `StaleWhileRevalidate` strategy with explicit opaque-response support for `https://api.mapbox.com/` and `https://events.mapbox.com/`. Accept graceful degradation (blank tiles for uncached areas). **Review TOS before any public rollout.**

---

## 3. Generation Timestamp and Freshness Signal

`manifest.json` already has `generated_at: string` (confirmed in `src/manifest.ts` line 13). No pipeline changes needed.

**How it flows:**

Online path (current):
```
manifest.ts: loadManifest() → fetch /data/manifest.json → Manifest object
                                                        → manifest.generated_at string
```

Offline path (new, via SW cache):
```
SW intercepts fetch /data/manifest.json → returns cached manifest.json Response
manifest.ts: loadManifest() → Manifest object with cached generated_at
```

The `manifest.ts` module currently exposes `resolveDataUrl(key: DataKey)` where `DataKey = keyof Omit<Manifest, 'generated_at'>` — `generated_at` is explicitly excluded. Add one export:

```typescript
export async function loadGeneratedAt(): Promise<string | null> {
  const m = await loadManifest();
  return m.generated_at ?? null;
}
```

`<bee-atlas>` calls `loadGeneratedAt()` after `tablesReady` resolves (the manifest is already fetched by then via `resolveDataUrl('occurrences_db')`), stores it as `@state _generatedAt: string | null`, and passes it down to `<bee-pane>` as a `@property generatedAt`. `<bee-pane>` renders "Data as of [date]" in a footer or the pane header — exact placement is a UX decision for the implementation phase.

Optional enhancement: the SW injects a custom `X-From-Cache: 1` response header when serving from the `data-v1` cache. `<bee-atlas>` can inspect this on the manifest response to surface a "cached data" indicator distinct from "live data". Not required for v5.0 but a clean hook.

---

## 4. Geolocation State Ownership and "Occurrences Near Me"

### 4a. The Invariant Preserved

`<bee-atlas>` owns all reactive state. `<bee-map>` is a pure presenter. This maps cleanly to geolocation:

- `GeolocateControl` lives inside `<bee-map>` (it requires a `mapboxgl.Map` instance to call `map.addControl()`).
- `GeolocateControl` fires a `geolocate` event on each position update.
- `<bee-map>` listens to this event and re-emits it upward as a `CustomEvent('user-location-changed', { detail: { lat, lon, accuracy } | null })`.
- `<bee-atlas>` handles the event and stores `@state _userLocation: { lat: number; lon: number; accuracy: number } | null`.
- `<bee-atlas>` passes `userLocation` down to `<bee-map>` as a `@property` (for any future custom proximity radius layer beyond GeolocateControl's built-in blue dot) and to `<bee-pane>` as a `@property` (for the "near me" filter trigger UI).

No shared module-level state. No circular reference. `<bee-map>` holds no location state; it only relays the raw event upward.

### 4b. GeolocateControl in `<bee-map>`

In `<bee-map>._initMap()` after `map.on('load', ...)`:

```typescript
const geolocate = new mapboxgl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
  showUserHeading: true,
});
map.addControl(geolocate, 'top-right');
geolocate.on('geolocate', (e: GeolocationPosition) => {
  this.dispatchEvent(new CustomEvent('user-location-changed', {
    bubbles: true,
    composed: true,  // required to cross shadow DOM boundary
    detail: { lat: e.coords.latitude, lon: e.coords.longitude, accuracy: e.coords.accuracy },
  }));
});
geolocate.on('error', () => {
  this.dispatchEvent(new CustomEvent('user-location-changed', {
    bubbles: true, composed: true, detail: null,
  }));
});
```

`GeolocateControl` renders its own blue dot and accuracy circle — no additional Mapbox source/layer is needed for v5.0. The control also handles GPS offline (browser Geolocation API works without network).

`trackUserLocation: true` means the control tracks position continuously while active. `<bee-atlas>` must handle `detail: null` (emitted on error or user deactivation) by clearing `_userLocation`.

### 4c. "Occurrences Near Me" Query

**Where it belongs: the sqlite worker.**

The proximity filter is an SQL query against the `occurrences` table. It belongs in the same place all other filter queries live — `sqlite-worker.ts` / `filter.ts`. Main-thread proximity computation would require a round-trip message to retrieve raw rows from the worker, then computation on the main thread, which is the wrong direction.

**The SQLite math constraint:** wa-sqlite with MemoryVFS does not have `sin`/`cos`/`asin` functions loaded. The full Haversine formula cannot be expressed in SQL without loading an extension (e.g. `sqlean`, which adds WASM complexity). Workaround: bounding-box pre-filter in SQL, then exact Haversine in JavaScript on the returned (small) subset.

Bounding box at ~47°N latitude (WA):
- 1° latitude ≈ 111 km
- 1° longitude ≈ 111 × cos(47°) ≈ 76 km

For radius R km: `delta_lat = R/111`, `delta_lon = R/76`.

Post-filter haversine in the worker (TypeScript):
```typescript
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

The bounding-box keeps the JavaScript-side haversine set small. At WA field-collection densities, a 5 km bounding box returns at most a few hundred rows.

**`FilterState` extension:** Add `nearMe: { lat: number; lon: number; radiusKm: number } | null` to `FilterState`. When set, `filter.ts`'s `buildFilterSQL` adds the bounding-box `WHERE` clause. The haversine post-filter runs inside the worker on the SQL result rows before the `exec-result` message is sent back.

**New worker message type:** `kind: 'query-near'` is not strictly needed — the `nearMe` field in `FilterState` feeds the existing `kind: 'exec'` path via `buildFilterSQL`. The haversine post-filter is added as an in-worker step when `filterState.nearMe` is non-null. No new message type required; the existing filter pipeline extends naturally.

**`_filterQueryGeneration` race guard applies here.** Geolocation events can fire faster than queries complete. The existing `makeStaleGuard` instances in `<bee-atlas>` cover this automatically — a location update that triggers a filter re-run is guarded by the same generation counter as any other filter change.

---

## 5. System Overview

```
Browser (/app route, online first-load)
  │
  ├── /app/index.html  ← new Eleventy template page
  │     ├── links /app/manifest.webmanifest
  │     ├── registers /app/sw.js (scope: /app)
  │     └── <script type="module" src="./src/app-entry.ts">
  │
  ├── src/app-entry.ts  ← new Vite entry
  │     imports <bee-atlas> + sw-registration.ts
  │
  ├── <bee-atlas>  (state owner — MODIFIED)
  │     ├── @state _userLocation: {lat, lon, accuracy} | null
  │     ├── @state _nearMeRadiusKm: number | null
  │     ├── @state _generatedAt: string | null
  │     ├── @state _filterState  (+ nearMe field — MODIFIED)
  │     │
  │     ├── <bee-map>  (pure presenter — MODIFIED)
  │     │     ├── GeolocateControl (Mapbox built-in, added in _initMap)
  │     │     │     ├── geolocate event → CustomEvent('user-location-changed')
  │     │     │     └── error event → CustomEvent('user-location-changed', null)
  │     │     └── @property userLocation (pass-through for future proximity viz)
  │     │
  │     └── <bee-pane>  (pure presenter — MODIFIED)
  │           ├── @property generatedAt  → "Data as of [date]" footer
  │           ├── @property userLocation → "Near me" mode trigger
  │           └── @property nearMeRadiusKm → radius UI control
  │
  ├── sqlite.ts + sqlite-worker.ts  (MODIFIED)
  │     ├── filter.ts buildFilterSQL: bbox WHERE when nearMe set
  │     └── haversine post-filter in worker when nearMe set
  │
  └── manifest.ts  (MODIFIED — add loadGeneratedAt())

/app/sw.js  (scope: /app)  ← new, at public/app/sw.js (Vite passthrough, not hashed)
  ├── precache: app shell (index.html + hashed JS/CSS for /app entry)
  ├── NetworkFirst: /data/manifest.json  → manifest-v1 cache
  ├── Cache-First: /data/*_<hash>.db     → data-v1 cache
  ├── Cache-First: /data/*_<hash>.geojson → data-v1 cache
  └── fetch handler intercepts /data/ fetches from /app page (KEY FACT: scope controls
      pages, not fetches; /data/ is fully interceptable from /app-scoped page)

CloudFront (existing, minimal changes):
  /data/* behavior: unchanged (content-hashed, Cache-Control: max-age=31536000)
  /app/sw.js:        Cache-Control: no-cache, no-store (ensures SW update detection)
  /app/manifest.webmanifest: Cache-Control: no-cache
  (no Service-Worker-Allowed header needed — sw.js served from /app/)
```

---

## 6. New vs. Modified Files

### New Files

| File | Purpose |
|------|---------|
| `_pages/app/index.html` | `/app` route — Eleventy template; links webmanifest; registers SW |
| `src/app-entry.ts` | Vite entry for `/app`; imports `<bee-atlas>` + `sw-registration.ts` |
| `src/sw-registration.ts` | `navigator.serviceWorker.register('/app/sw.js', { scope: '/app' })`; Workbox Window update lifecycle |
| `public/app/sw.js` | Service worker source (Workbox `injectManifest` target); app shell precache + `/data/` runtime cache + manifest invalidation logic |
| `public/app/manifest.webmanifest` | PWA manifest: `name`, `start_url: /app`, `scope: /app`, icons, `display: standalone` |
| `public/app/icons/` | App icons (192×192 and 512×512 PNG minimum for installability) |

### Modified Files

| File | Change |
|------|--------|
| `src/manifest.ts` | Add `loadGeneratedAt(): Promise<string \| null>` export |
| `src/filter.ts` | `FilterState` + `nearMe` field; `buildFilterSQL` bounding-box clause when `nearMe` set |
| `src/sqlite-worker.ts` | Haversine post-filter when `filterState.nearMe` is non-null in exec handler |
| `src/bee-atlas.ts` | `@state _userLocation`, `@state _generatedAt`, `@state _nearMeRadiusKm`; handle `user-location-changed` CustomEvent; call `loadGeneratedAt()` after `tablesReady`; pass new `@property` values to `<bee-map>` and `<bee-pane>` |
| `src/bee-map.ts` | Add `GeolocateControl` in `_initMap`; listen to `geolocate` + `error` events; dispatch `user-location-changed` upward; accept `@property userLocation` (no state stored here) |
| `src/bee-pane.ts` | Accept `@property generatedAt`, `@property userLocation`, `@property nearMeRadiusKm`; render freshness footer; render "Near me" radius control |
| `src/url-state.ts` | Optionally persist `nearMe` state to URL (deferred; not required for dogfood) |
| `eleventy.config.js` | If `/app` needs a distinct Vite entry, configure multi-entry in `viteOptions.build.rollupOptions.input` |
| `vite.config.ts` | Exclude `sw.js` from asset hashing (or rely on `public/` passthrough) |
| `infra/lib/beeatlas-stack.ts` | Add `/app/sw.js` and `/app/manifest.webmanifest` cache behaviors: `Cache-Control: no-cache, no-store` via a new `ResponseHeadersPolicy` on an `/app/*` behavior or a path-pattern override |

---

## 7. Data Flow Changes

### 7a. SW Registration (new, one-time per device)

```
/app page loads
  → src/app-entry.ts imports sw-registration.ts
  → navigator.serviceWorker.register('/app/sw.js', { scope: '/app' })
  → SW installs → precaches app shell from Workbox-injected manifest list
  → SW activates → fetches /data/manifest.json → caches /data/ artifacts in data-v1
```

### 7b. Offline Cold Start (after one prior online visit)

```
User opens /app with no network
  → /app/index.html served from SW precache (shell-v1)
  → src/app-entry.ts loads
  → sqlite-worker.ts: fetch(occurrencesDbUrl)
       → SW intercepts → returns from data-v1 cache
       → worker seeds MemoryVFS → DB ready
  → manifest.ts: loadManifest() fetch
       → SW intercepts → returns from manifest-v1 cache
       → loadGeneratedAt() → _generatedAt set → freshness shown in <bee-pane>
  → GeolocateControl works (browser Geolocation API, GPS, no network needed)
  → All filter/table/selection queries run locally in worker → fully offline UX
```

### 7c. "Near Me" Filter Flow (new)

```
User taps GeolocateControl button in <bee-map>
  → GeolocateControl.geolocate event fires
  → <bee-map> dispatches CustomEvent('user-location-changed', { lat, lon, accuracy })
  → <bee-atlas>._userLocation = { lat, lon, accuracy }
  → User enables "Near me" mode in <bee-pane> (new toggle) or <bee-atlas> auto-enables it
  → <bee-atlas>._filterState.nearMe = { lat, lon, radiusKm: _nearMeRadiusKm }
  → _filterQueryGeneration incremented (existing race guard covers this)
  → existing filter pipeline: buildFilterSQL adds bbox WHERE clause
  → sqlite-worker.ts executes SQL → haversine post-filter → returns rows within radius
  → <bee-atlas>._filteredGeoJSON updated → <bee-map> re-renders filtered points
```

### 7d. Nightly Cache Invalidation Flow

```
New nightly run → new content-hashed occurrences.db → manifest.json updated
  → CloudFront invalidation for /data/manifest.json (existing nightly.sh behavior)
Next time /app is opened (online):
  → SW update check: new sw.js content detected → new SW installs
  → New SW activates → fetches manifest.json (network) → new hash detected
  → Deletes old occurrences_oldhash.db from data-v1
  → Background-fetches occurrences_newhash.db into data-v1
  → <bee-atlas>: loadGeneratedAt() returns updated generated_at → freshness indicator updated
```

---

## 8. Suggested Build Order

```
Phase A: /app route + SW topology
  Deliverable: /app route exists; sw.js registers with scope /app;
               no SW on /; CloudFront no-cache on sw.js verified
  Blocks: all other phases (scope topology must be correct before any caching)

Phase B: App shell precache + offline cold-start
  Requires: Phase A (SW scope confirmed)
  Deliverable: /app page loads offline after one prior online visit;
               Vite-hashed JS/CSS served from SW cache

Phase C: /data/ runtime caching + occurrences.db cached
  Requires: Phase B (SW active and precaching)
  Deliverable: occurrences.db + all GeoJSON served from Cache Storage offline;
               cold-start completes fully offline

Phase D: manifest.json freshness signal
  Requires: Phase C (manifest.json cached via NetworkFirst)
  Deliverable: "Data as of [date]" visible in <bee-pane>;
               loadGeneratedAt() wired through <bee-atlas> → <bee-pane>

Phase E: GeolocateControl + location state ownership
  Independent of Phases B-D; can start after Phase A (needs /app route)
  Deliverable: blue dot + accuracy ring on map; _userLocation in <bee-atlas>;
               user-location-changed CustomEvent flowing correctly

Phase F: "Occurrences near me" query
  Requires: Phase E (_userLocation state exists)
  Deliverable: FilterState.nearMe; bbox SQL + haversine in worker;
               <bee-pane> "Near me" radius UI; filtered points within radius

Phase G: PWA manifest + installability
  Requires: Phases A+B (SW working); Phase D (freshness indicator, not blocking but good)
  Deliverable: "Add to Home Screen" prompt; icons; standalone display mode

Phase H: Mapbox tile caching (TOS-gated, defer)
  Independent; unblock only after TOS review
  Deliverable: cached basemap tiles survive offline for panned areas
```

---

## 9. Anti-Patterns to Avoid

### SW at `/sw.js` with Root Scope (contaminating `/`)

Registering a root-scoped SW from the main index page would place every page on the site — species pages, place pages, feed pages — under the SW's control. Any caching bugs would affect the public-facing site, not just the `/app` dogfood route. The unlisted `/app` route with `scope: /app` is the correct isolation boundary.

### Caching `occurrences.db` in IndexedDB

Fetching a 23 MB `ArrayBuffer`, writing it to IndexedDB, and reading it back on every cold start adds ~1.7 s of overhead (IndexedDB large blob write: ~850 ms per published benchmark). Cache Storage returns the original `Response` object directly to the `fetch()` interceptor with near-zero overhead. The existing `sqlite-worker.ts` does not need to change its fetch call at all when the SW intercepts it.

### Storing `_userLocation` in `<bee-map>`

`<bee-map>` is a pure presenter. If location state lived there, `<bee-atlas>` would need to reach into `<bee-map>` to retrieve coordinates for proximity queries, violating the coordinator invariant. The pattern is: `<bee-map>` relays the raw event upward via `CustomEvent`, `<bee-atlas>` owns the state.

### Running Haversine in the Main Thread

The existing architecture keeps all SQL and data-processing in `sqlite-worker.ts`. Running proximity distance calculations on the main thread would require retrieving raw rows from the worker via an extra `postMessage` round-trip, then blocking the main thread with the computation. Keep proximity queries in the worker, consistent with the existing filter pipeline.

### Hashing `sw.js` via Vite

Vite content-hashes all files processed through its pipeline. If `sw.js` gets a hashed filename (e.g. `/assets/sw-abc123.js`), each build produces a new registration URL, and the browser treats it as a brand-new SW rather than an update to the existing one. This breaks SW update detection and can leave users with stale workers. Place `sw.js` in `public/app/` — Vite copies `public/` verbatim with no hashing.

---

## 10. Integration Points

### External Services

| Service | Integration | Notes |
|---------|-------------|-------|
| CloudFront `/data/*` | SW fetch handler intercepts same-origin `/data/` fetches from `/app` page | No CDK header change needed; scope controls pages, not which fetches are intercepted |
| Mapbox CDN tiles | Opaque runtime cache (`StaleWhileRevalidate` + `CacheableResponsePlugin({statuses:[0,200]})`) | TOS-gated; self-test only for v5.0 |
| Browser Geolocation API | `GeolocateControl` in `<bee-map>`; GPS works offline, no network needed | `enableHighAccuracy: true` for field use |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `<bee-map>` → `<bee-atlas>` (location) | `CustomEvent('user-location-changed', { detail: {lat,lon,accuracy} \| null })` | `composed: true` required to cross shadow DOM boundary |
| `<bee-atlas>` → `<bee-map>` (location) | `@property userLocation` | Only needed if custom proximity radius visualization is added |
| `<bee-atlas>` → `<bee-pane>` (freshness) | `@property generatedAt: string \| null` | "Data as of …" display |
| `<bee-atlas>` → `<bee-pane>` (near me UI) | `@property userLocation`, `@property nearMeRadiusKm` | Near-me toggle + radius slider |
| `filter.ts` → `sqlite-worker.ts` (proximity) | `FilterState.nearMe` field → bbox SQL clause + haversine post-filter | Consistent with existing `buildFilterSQL` pattern |
| `manifest.ts` → `<bee-atlas>` | New `loadGeneratedAt()` export | Reads `manifest.generated_at`; reuses the same singleton `loadManifest()` promise |
| SW → page (cache provenance) | Optional `X-From-Cache: 1` header on SW-served responses | Enables online/offline indicator; not required for v5.0 |

---

## Sources

- [Service-Worker-Allowed header — MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Service-Worker-Allowed)
- [ServiceWorkerContainer.register() — MDN](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register)
- [Service Worker API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) — scope controls pages, not fetches
- [Service workers and the Cache Storage API — web.dev](https://web.dev/articles/service-workers-cache-storage)
- [workbox-precaching — Chrome Developers](https://developer.chrome.com/docs/workbox/modules/workbox-precaching)
- [Caching resources during runtime (Workbox) — Chrome Developers](https://developer.chrome.com/docs/workbox/caching-resources-during-runtime)
- [OPFS vs IndexedDB binary performance — RxDB](https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html)
- [wa-sqlite OPFS discussion — GitHub rhashimoto/wa-sqlite#63](https://github.com/rhashimoto/wa-sqlite/discussions/63)
- [Add/remove HTTP headers in CloudFront — AWS Docs](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/modifying-response-headers.html)
- Codebase: `src/manifest.ts`, `src/sqlite-worker.ts`, `src/bee-atlas.ts`, `src/bee-map.ts`, `src/filter.ts`, `src/features.ts`, `eleventy.config.js`, `infra/lib/beeatlas-stack.ts`, `_pages/index.html`

---
*Architecture research for: v5.0 Offline Field Mode — PWA + geolocation integration*
*Researched: 2026-06-10*
