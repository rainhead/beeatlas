# Stack Research

**Domain:** Offline-capable installable PWA additions to existing Eleventy+Vite+Lit+Mapbox static map site
**Researched:** 2026-06-10
**Confidence:** HIGH (core stack); MEDIUM (Mapbox tile caching mechanism); HIGH (location features)

---

## 1. PWA Installability (Manifest + Icons)

### What is already built-in — no new dependency

The Web App Manifest (`manifest.webmanifest`) and `<link rel="manifest">` injection are handled by **vite-plugin-pwa** (see §3 below). The browser Geolocation API and `GeolocateControl` (§5) are already in `mapbox-gl` 3.x.

iOS Safari requires an `<link rel="apple-touch-icon">` in `<head>` in addition to the manifest; it does NOT reliably use manifest `icons` on its own. This tag must be added manually to `_pages/index.html` (or the `/app/` entry point if isolated there).

### Icon generation

| Tool | Version | Purpose | Why |
|------|---------|---------|-----|
| `@vite-pwa/assets-generator` | 1.0.2 | CLI: one SVG → all required PNG sizes (192, 512, apple-touch, maskable) | Official vite-plugin-pwa companion; one command produces every icon variant from a single source SVG; avoids maintaining many PNGs by hand |

Run once at design time, commit the outputs to `public/`:

```bash
npx @vite-pwa/assets-generator --preset minimal-2023 icons/bee.svg
```

This is a **dev-time tool only**, not a build dependency; add to `devDependencies` or run ad hoc.

**Maskable icon note:** maskable icons need safe-zone padding (inner 80% of image). The `minimal-2023` preset produces a `maskable-icon-512x512.png` automatically if the source SVG has sufficient padding.

---

## 2. Service Worker — Core Approach

### Recommended: vite-plugin-pwa 1.3.0 with `injectManifest` strategy

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `vite-plugin-pwa` | 1.3.0 | SW generation + manifest injection + Workbox precache manifest injection | Current release; peer-dep confirms Vite 8 support as of v1.3.0 (`"vite": "^3.1.0 || ... || ^8.0.0"`); active maintenance (May 2026 release) |
| `workbox-build` | 7.4.1 | Workbox build-time library (peer-dep of vite-plugin-pwa) | Required peer dep; do not install separately unless using bare Workbox CLI |
| `workbox-window` | 7.4.1 | In-browser SW registration helper (peer-dep of vite-plugin-pwa) | Required peer dep |
| `workbox-precaching` | 7.4.1 | SW: precache + route built assets | Part of the Workbox 7.x family; same version |
| `workbox-routing` | 7.4.1 | SW: `registerRoute` for runtime cache rules | Same version as above |
| `workbox-strategies` | 7.4.1 | SW: `CacheFirst`, `NetworkFirst`, `StaleWhileRevalidate` | Same version |
| `workbox-expiration` | 7.4.1 | SW: per-cache TTL and max-entries eviction | Same version |
| `workbox-cacheable-response` | 7.4.1 | SW: allow caching opaque responses (needed for tile caching) | Same version |

**Why `injectManifest` over `generateSW`:**

`generateSW` auto-generates the entire SW and injects precache entries — but gives no control over the caching strategy for the `occurrences.db` fetch or the Mapbox tile runtime cache. `injectManifest` compiles a hand-written `src/sw.ts` with full Workbox API access, then injects `self.__WB_MANIFEST` (the Vite-hashed precache list) into it at build time. This is the right choice when you need custom runtime-cache rules alongside automated precaching.

### Integration with `@11ty/eleventy-plugin-vite`

`vite-plugin-pwa` is a standard Vite plugin and integrates via `viteOptions.plugins` in `eleventy.config.js`. The plugin's `EleventyVite.runBuild` does a `DeepCopy({}, this.options.viteOptions)` then calls Vite's `build()` — any plugins in `viteOptions.plugins` are passed through cleanly. (Confirmed by reading `node_modules/@11ty/eleventy-plugin-vite/EleventyVite.js` line 61 and the `runBuild` method.)

**Key configuration wrinkle — root and outDir:** When `eleventy-plugin-vite` runs the Vite build, it sets `root` to `.11ty-vite/` (the renamed temp folder) and `outDir` to `_site/`. vite-plugin-pwa uses these to determine `globDirectory` for the Workbox precache manifest scan. Since `occurrences.db` and the GeoJSONs live under `public/data/` and are copied into `_site/` via Vite's `publicDir` handling, they will be present in `globDirectory` at build time — **but only if you explicitly add their glob pattern** to `injectManifest.globPatterns` and raise `maximumFileSizeToCacheInBytes` above the default 2 MB.

The `occurrences.db` (~23 MB SQLite) should **not** be in the Workbox precache manifest. Precaching downloads everything on SW install, synchronously, as a unit — a 23 MB DB will make install take ages on mobile and risks triggering iOS's 50 MB cache quota. Instead, cache it as a **named runtime cache entry** in `sw.ts`. See §3 below.

### Service worker scope and the `/app` dogfood route

A SW at `/sw.js` (served from root) has scope `/` by default and intercepts every same-origin request including `/data/`. A SW at `/app/sw.js` has scope `/app/` only.

**The cross-scope problem:** to intercept `/data/occurrences.db` fetches from a page at `/app/`, the SW script file must be at the root OR the CloudFront distribution must serve `Service-Worker-Allowed: /` on the `/app/sw.js` response. CloudFront's `ResponseHeadersPolicy` (already used in the CDK stack for CORS headers on `/data/*`) can add a custom `Service-Worker-Allowed: /` header on the behavior that serves `/app/sw.js`. This is the recommended approach for the unlisted-route dogfood setup.

**Alternative (simpler for dogfood):** place `sw.js` at the root (`/sw.js`) and register it with scope `/app/` via `navigator.serviceWorker.register('/sw.js', { scope: '/app/' })`. The SW's `NavigationRoute` uses an allowlist to serve the app shell only for `/app` and `/app/*`. Other pages fall through to the network. This requires no CloudFront CDK changes. The main site (`/`, species pages) is also under SW control for fetch routing, but navigation routes are allowlist-scoped to `/app/`.

For the initial dogfood phase, **root-hosted SW + allowlist NavigationRoute** is simpler. Switch to `/app/sw.js` + `Service-Worker-Allowed` header only if the main site SW control becomes a problem.

---

## 3. Caching Strategy Design

### App shell (HTML + JS + CSS + WASM)

**Precache via `self.__WB_MANIFEST`** — Vite content-hashes all assets; `injectManifest` injects the manifest list; Workbox's `precacheAndRoute` handles cache-first serving and revision-based cache busting automatically. WASM files (`.wasm`) must be included in `globPatterns`.

Exclude the large data artifacts from `globPatterns`:
```typescript
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',
  injectManifest: {
    globPatterns: ['**/*.{js,css,html,wasm}'],
    globIgnores: ['**/occurrences.db', '**/occurrences.parquet', '**/checklist.parquet'],
  },
  manifest: { /* ... */ },
})
```

### `occurrences.db` (~23 MB SQLite) and GeoJSONs

**Runtime cache, `CacheFirst` strategy, named cache `data-artifacts`** in `sw.ts`:

```typescript
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

registerRoute(
  ({ url }) => url.pathname.includes('/data/') && (
    url.pathname.endsWith('.db') ||
    url.pathname.endsWith('.geojson')
  ),
  new CacheFirst({
    cacheName: 'data-artifacts',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 20,        // GeoJSONs + db
        maxAgeSeconds: 60 * 60 * 24 * 30,  // 30 days
        purgeOnQuotaError: true,
      }),
    ],
  })
);
```

**Cache versioning tied to the content-hash manifest:** The files served under `/data/` are already content-addressed (manifest.json maps logical keys → hashed filenames like `occurrences-abc123.db`). When the pipeline runs and produces a new hash, the old cached DB URL becomes stale naturally — the new URL is a cache miss and re-fetched. No manual cache version management needed; the existing `manifest.json` mechanism handles this.

**manifest.json freshness indicator:** `manifest.json` carries `generated_at`. Cache it with `StaleWhileRevalidate` so the current timestamp is always shown and the background update primes the next cold start. On next app open, the cached manifest is served immediately while the network version updates silently.

### iOS storage caveat

iOS Safari imposes approximately 50 MB aggregate Cache API quota per origin. The 23 MB DB plus app shell (~several MB) consumes most of this. The 7-day eviction policy means a user who hasn't opened the app in a week will hit a cache miss on the DB. **Design requirement:** show the "data as of" indicator prominently and handle a DB cache miss gracefully (offer a "reload + re-cache" prompt). Do not assume the cache is populated on every cold start.

---

## 4. Mapbox Basemap Tile Caching

**No new library needed.** Use Workbox's `CacheFirst` + `CacheableResponsePlugin` in `sw.ts`.

### Mechanism

Mapbox vector tiles served from `api.mapbox.com` include `Cache-Control: max-age=43200` (12 hours) on tile responses. Whether they are served with `Access-Control-Allow-Origin: *` (making them non-opaque when fetched with CORS mode) needs empirical verification: if mapbox-gl v3 fetches tiles as `mode: 'cors'`, responses are cacheable with status 200. If tiles are fetched `no-cors`, they arrive as opaque responses (status 0).

**Opaque response storage penalty:** Each cached opaque response occupies a minimum of ~7 MB in the Storage Quota accounting (Chrome confirmed, Workbox issue #2226). This makes large-scale tile caching impractical with opaque responses. Verify by inspecting tile request headers in DevTools Network panel — look for `Access-Control-Allow-Origin` on the responses.

**If CORS responses (status 200):**
```typescript
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

registerRoute(
  ({ url }) =>
    url.hostname.endsWith('.mapbox.com'),
  new CacheFirst({
    cacheName: 'mapbox-tiles',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 500,   // tune to expected field area
        maxAgeSeconds: 60 * 60 * 12,  // 12 hours, matching Mapbox tile TTL
        purgeOnQuotaError: true,
      }),
    ],
  })
);
```

**If opaque only:** use `maxEntries: 50` and accept limited coverage, or investigate `map-gl-offline` (npm `map-gl-offline`, v0.5+) which caches via IndexedDB with explicit tile download. IndexedDB on iOS can hold up to ~500 MB vs the ~50 MB Cache API limit.

**Known 403 issue:** Mapbox GL JS has a history of returning 403 from ServiceWorker on revisit (GitHub issue #8859). Root cause is the access token embedded in tile URLs expiring while a cached response is served. Mitigate by setting `maxAgeSeconds` to 12 hours or less (Mapbox's documented device cache TTL), ensuring tokens never go stale in the cache.

---

## 5. Current-Location Indicator

### GeolocateControl — built-in, no new dependency

`mapboxgl.GeolocateControl` ships with `mapbox-gl` 3.x. No new package:

```typescript
map.addControl(
  new mapboxgl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserLocation: true,
    showUserHeading: true,
  }),
  'top-right'
);
```

This provides the blue dot, accuracy ring, heading indicator, and recenter button. GPS works offline (browser Geolocation API does not require network). The `geolocate` event fires with a `GeolocationPosition` that can be used to drive the "occurrences near me" query.

### "Occurrences near me" proximity query

**Recommendation: pure SQL haversine in wa-sqlite — no new library.**

SQLite supports `sin()`, `cos()`, `asin()`, `sqrt()`, and standard math functions. The haversine formula is expressible as a SQL query, keeping all computation in the existing worker thread:

```sql
SELECT *,
  (2 * 6371 * asin(sqrt(
    sin(radians((lat - :lat) / 2)) * sin(radians((lat - :lat) / 2)) +
    cos(radians(:lat)) * cos(radians(lat)) *
    sin(radians((lon - :lon) / 2)) * sin(radians((lon - :lon) / 2))
  ))) AS distance_km
FROM occurrences
WHERE lat BETWEEN :lat - (:radius_km / 111.045)
  AND :lat + (:radius_km / 111.045)
  AND lon BETWEEN :lon - (:radius_km / (111.045 * cos(radians(:lat))))
  AND :lon + (:radius_km / (111.045 * cos(radians(:lat))))
HAVING distance_km <= :radius_km
ORDER BY distance_km
```

The `WHERE` bounding box pre-filters on `lat`/`lon` columns before the expensive haversine computation. wa-sqlite's MemoryVFS sync build includes standard SQLite math functions; no extension loading or UDFs needed.

**Alternative: `@turf/distance`** (7.3.5, 14 KB unpacked). Use in JavaScript if the SQL approach proves awkward to integrate with the existing query architecture. Acceptable bundle size. But the SQL approach keeps the query entirely in the worker thread (no main-thread geometry math) and is the natural fit for the existing filter SQL pattern.

---

## Installation

```bash
# Core new dependencies (all devDependencies — Workbox sub-packages
# imported in sw.ts are bundled by vite-plugin-pwa's separate SW build pass)
npm install -D vite-plugin-pwa workbox-build workbox-window \
               workbox-precaching workbox-routing workbox-strategies \
               workbox-expiration workbox-cacheable-response

# Icon generator — run once at design time, commit outputs; then can remove
npm install -D @vite-pwa/assets-generator
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| vite-plugin-pwa (injectManifest) | Hand-rolled bare service worker | Bare SW requires manual precache manifest construction (re-implementing content-hash tracking); no Workbox retry/expiration logic; much more code for equivalent reliability |
| vite-plugin-pwa (injectManifest) | vite-plugin-pwa (generateSW) | generateSW gives no custom runtime cache control; cannot special-case the 23 MB DB fetch or Mapbox tile caching |
| vite-plugin-pwa (injectManifest) | Workbox CLI (workbox-cli) directly | Requires a separate build step outside Vite; vite-plugin-pwa integrates into the existing Vite build pass as a plugin |
| SQL haversine in wa-sqlite | @turf/distance | Both work; SQL approach keeps all computation in the worker, requires no new dependency, fits the existing filter SQL architecture |
| SQL haversine in wa-sqlite | Spatial SQLite extension (SpatiaLite) | SpatiaLite is a native C extension; not loadable in wa-sqlite WASM without a custom WASM build; overkill for a single distance function |
| GeolocateControl (mapbox-gl built-in) | Custom blue-dot overlay | GeolocateControl already handles permission prompting, accuracy ring, tracking mode, heading |
| Root-hosted SW + allowlist NavigationRoute | /app/sw.js + Service-Worker-Allowed header | Service-Worker-Allowed requires a CDK change and CloudFront ResponseHeadersPolicy addition; root-hosted SW is simpler for the dogfood phase |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `workbox-webpack-plugin` | Webpack plugin; irrelevant to Vite | `workbox-build` (peer dep of vite-plugin-pwa) |
| Workbox CDN import in sw.ts (`importScripts`) | vite-plugin-pwa's SW build pass bundles Workbox modules via Rollup/Rolldown; CDN imports break the bundle and make offline caching of the SW itself impossible | ESM imports in sw.ts |
| `@mapbox/mapbox-gl-geocoder` | Geocoding requires network; adds substantial weight; not needed for location feature | GeolocateControl built-in |
| `map-gl-offline` | Third-party lib wrapping tile caching in IndexedDB; useful for large pre-downloaded areas; overkill for "panned-while-online areas survive offline" use case | Workbox CacheFirst for tiles |
| `idb` or `idb-keyval` | wa-sqlite already uses MemoryVFS (in-memory from ArrayBuffer fetch); the fetch response is what needs caching, and the Cache API is the right tool; IndexedDB path would require significant wa-sqlite VFS rework | Cache API via Workbox |
| Putting `occurrences.db` in the precache manifest | 23 MB install payload blocks SW activation; risks iOS 50 MB quota; vite-plugin-pwa's default `maximumFileSizeToCacheInBytes` (2 MB) would reject it anyway | Runtime CacheFirst in sw.ts |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `vite-plugin-pwa@1.3.0` | `vite@^8.0.0` | Confirmed in peer dep range; v1.3.0 added Vite 8 support explicitly (GitHub releases, May 2026) |
| `workbox-*@7.4.1` | `vite-plugin-pwa@1.3.0` | Required peer dep; use same `^7.x` for all Workbox sub-packages |
| `@11ty/eleventy-plugin-vite@8.0.0` | `vite@^8.x` | VitePWA goes in `viteOptions.plugins`; plugin passes through cleanly via `Merge + build(viteOptions)` |
| vite-plugin-pwa injectManifest | Eleventy rename-and-build mechanism | `root` is set to `.11ty-vite/` at build time; `globDirectory` for precache scan resolves from that root; public assets in `_site/` at time of Workbox scan are correct |

---

## Sources

- Context7 `/vite-pwa/vite-plugin-pwa` — injectManifest strategy, globPatterns, maximumFileSizeToCacheInBytes, MPA routing (HIGH confidence)
- Context7 `/googlechrome/workbox` — runtime caching, CacheableResponsePlugin, opaque responses, ExpirationPlugin (HIGH confidence)
- Context7 `/mapbox/mapbox-gl-js` — GeolocateControl API (HIGH confidence)
- `npm info vite-plugin-pwa` — confirmed version 1.3.0, peer deps including `vite@^8.0.0`, published 2026-05-05 (HIGH confidence)
- `npm info workbox-build` — confirmed version 7.4.1, published 2026-05-04 (HIGH confidence)
- `npm info @vite-pwa/assets-generator` — confirmed version 1.0.2, published 2025-10-14 (HIGH confidence)
- `npm info @turf/distance` — confirmed version 7.3.5, 14 KB unpacked (HIGH confidence)
- [vite-plugin-pwa releases](https://github.com/vite-pwa/vite-plugin-pwa/releases) — v1.3.0 added Vite 8 peerDep (HIGH confidence, official source)
- [Mapbox issue #8859](https://github.com/mapbox/mapbox-gl-js/issues/8859) — 403-from-SW tile issue on revisit; token expiry root cause (MEDIUM confidence — older issue)
- [PWA iOS limitations](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) — 50 MB cache quota, 7-day eviction (MEDIUM confidence — third-party article, consistent with MDN)
- [Workbox opaque response quota issue #2226](https://github.com/GoogleChrome/workbox/issues/2226) — 7 MB per opaque entry (HIGH confidence, Chrome team confirmed)
- [Mapbox API caching docs](https://docs.mapbox.com/help/troubleshooting/api-caching/) — `max-age=43200` (12h) on tile responses (MEDIUM confidence — page confirmed TTL values but not CORS header presence)
- `/home/peter/dev/beeatlas/node_modules/@11ty/eleventy-plugin-vite/EleventyVite.js` — confirmed `Merge + build(viteOptions)` flow; plugins pass through (HIGH confidence, source code read directly)
- `/home/peter/dev/beeatlas/infra/lib/beeatlas-stack.ts` — CDK `ResponseHeadersPolicy` already in use on `/data/*`; extending for `Service-Worker-Allowed` is a small CDK addition (HIGH confidence, source code read directly)

---

*Stack research for: v5.0 Offline Field Mode additions to beeatlas.net*
*Researched: 2026-06-10*
