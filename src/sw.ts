// Service worker source for the /app shell — compiled to _site/app/sw.js by
// vite-plugin-pwa (injectManifest strategy, wired in eleventy.config.js).
//
// D-04: NO top-level skipWaiting, NO claiming of clients. The no-skipWaiting invariant
// is now satisfied STRUCTURALLY via the SKIP_WAITING gate (D-16): skipWaiting()
// fires ONLY in response to wb.messageSkipWaiting() from the user-clicked update banner.
// The new SW waits until all /app tabs are closed before activating.
// This preserves the prompt-to-reload lifecycle (OFF-03) and prevents
// app-code ↔ DB version skew (Phase 149+).
//
// Imported ONLY via the vite-plugin-pwa plugin build step;
// never imported by app-entry.ts directly.

/// <reference types="vite-plugin-pwa/client" />

// Explicit ambient type for the ServiceWorkerGlobalScope with the Workbox
// manifest injection point. The triple-slash reference above provides the
// vite-plugin-pwa virtual module types; this declaration ensures tsc
// recognises self.__WB_MANIFEST in the SW global scope (RESEARCH Pitfall 4).
declare const self: ServiceWorkerGlobalScope & typeof globalThis & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
  skipWaiting(): Promise<void>;
};

import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// Precache the /app shell (hashed JS/CSS + /app/index.html).
// self.__WB_MANIFEST is replaced at build time by vite-plugin-pwa's
// workbox-build injectManifest step.
precacheAndRoute(self.__WB_MANIFEST);

// Offline navigation: any /app/ navigation returns the cached app shell.
// The allowlist prevents this from intercepting navigations to / or other routes (D-05).
// Canonical URL is /app/index.html — CloudFront OAC 403s the trailing-slash /app/.
const handler = createHandlerBoundToURL('/app/index.html');
const navigationRoute = new NavigationRoute(handler, {
  allowlist: [/^\/app\//],
});
registerRoute(navigationRoute);

// D-01/D-04: DB runtime cache — CacheFirst with 1-entry cap.
// maxEntries: 1 collapses hash-churn: each nightly pipeline produces a new
// occurrences_<hash>.db URL; without a cap, old hashes accumulate toward
// the iOS ~50 MB quota. With maxEntries: 1, Workbox evicts the previous DB
// entry whenever a new one is cached — steady-state usage stays ~23 MB.
// purgeOnQuotaError: true cleans up the entire data-artifacts cache on
// genuine-full-disk quota failures (D-04 backstop).
// Note: does NOT intercept manifest.json (.json extension, not .db);
// Phase 150 will add a separate NetworkFirst route for manifest.json.
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

// D-02/D-06: GeoJSON runtime cache — CacheFirst, no entry cap.
// counties/ecoregions/places GeoJSON use stable URLs that overwrite in place
// each nightly pipeline run; three files total, <5 MB combined.
// No ExpirationPlugin — sharing maxEntries: 1 with the DB route would cause
// GeoJSON entries to be evicted when the DB is cached (RESEARCH Pitfall 1).
// Both routes share the data-artifacts cache name; ExpirationPlugin scopes
// its eviction to the route it is registered on, not the cache as a whole.
registerRoute(
  ({ url }) => url.pathname.startsWith('/data/') && url.pathname.endsWith('.geojson'),
  new CacheFirst({
    cacheName: 'data-artifacts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  })
);

// D-08: manifest.json NetworkFirst route — separate from data-artifacts per cache-isolation rationale.
// networkTimeoutSeconds: 3 falls back to cache on slow/offline; CacheableResponsePlugin restricts
// caching to status 200 so error responses are not poisoned into the cache.
// Cache name 'data-manifest' is intentionally separate from 'data-artifacts' to keep storage-estimate
// breakdown clean and to allow cheap future invalidation of manifest without touching the DB/GeoJSON cache.
registerRoute(
  ({ url }) => url.pathname === '/data/manifest.json',
  new NetworkFirst({
    cacheName: 'data-manifest',
    networkTimeoutSeconds: 3,
    plugins: [new CacheableResponsePlugin({ statuses: [200] })],
  })
);

// D-03/D-04/D-05/D-06/D-07: Mapbox basemap performance cache — §2.8.1 compliant.
// StaleWhileRevalidate: serves cached asset instantly, revalidates from network in background.
// This is the actual perf win over the browser's own HTTP cache (D-03).
//
// matchCallback: strict hostname check so events.mapbox.com (telemetry) is NEVER matched
// (different hostname). The /map-sessions/ billing path is explicitly excluded (D-07; RESEARCH Open Q2).
//
// access_token is RETAINED in the cache key — no cache-key-rewriting plugin (D-04: §1.1 / §2.9.4).
// Token is static per deployment, so cache URLs are naturally stable.
//
// 200-only (D-05): CacheableResponsePlugin implements cacheWillUpdate, which suppresses
// SWR's default cacheOkAndOpaquePlugin (status 0 / opaque allowance) — see RESEARCH Pitfall 2.
//
// TTL: 604800s = 7 days — well within the 2,592,000s (30-day) §2.8.1 ceiling (D-05).
// maxEntries: 150 is safe given Mapbox CORS (non-opaque) responses (D-05; RESEARCH CORS vs Opaque).
// Dedicated cacheName 'mapbox-basemap' keeps storage-estimate breakdown clean (D-06).
// Registered unconditionally — no feature flag (D-07).
registerRoute(
  ({ url }) =>
    url.hostname === 'api.mapbox.com' && !url.pathname.startsWith('/map-sessions/'),
  new StaleWhileRevalidate({
    cacheName: 'mapbox-basemap',
    plugins: [
      // 200-only: excludes opaque (status 0) responses; see RESEARCH Pitfall 2.
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: 150,
        maxAgeSeconds: 604800, // 7 days (§2.8.1 ceiling is 30 days = 2,592,000s)
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// D-16: skipWaiting fires ONLY in response to wb.messageSkipWaiting() from the user-clicked update banner.
// No top-level skipWaiting call — the no-skipWaiting invariant from 147/148/149 is satisfied
// structurally: this handler is the only path, and it requires an explicit SKIP_WAITING message.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
