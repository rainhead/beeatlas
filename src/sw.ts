// Service worker source for the app shell — compiled to _site/sw.js by
// vite-plugin-pwa (injectManifest strategy, wired in vite.sw.config.ts).
//
// SCOPE IS THE ORIGIN as of ADR 0029, because the app is at `/`. That is wider than
// the routing below, deliberately: with no matching route Workbox hands a request to
// the network, so a controlled client's later navigation to /species/… behaves
// exactly as it did when this worker could not see it. The residual cost the ADR
// names is that a BROKEN worker now takes the whole site down for that user rather
// than only /app/ — smaller than caching the read path would have been, but not zero.
//
// NO top-level skipWaiting, NO claiming of clients. The no-skipWaiting invariant
// is now satisfied STRUCTURALLY via the SKIP_WAITING gate: skipWaiting()
// fires ONLY in response to wb.messageSkipWaiting() from the user-clicked update banner.
// The new SW waits until all app tabs are closed before activating.
// This preserves the prompt-to-reload lifecycle and prevents
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
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// Precache the app shell (hashed JS/CSS + /index.html).
// self.__WB_MANIFEST is replaced at build time by vite-plugin-pwa's
// workbox-build injectManifest step.
precacheAndRoute(self.__WB_MANIFEST);

// Offline navigation: the app shell answers `/` AND NOTHING ELSE (ADR 0029).
//
// The allowlist is the boundary between the two surfaces, and at origin scope it had
// to be re-drawn rather than deleted. A navigation to /species/Bombus/mixtus/ must
// reach the network — an allowlist that let this route match would replace the page a
// reader asked for with an application they did not open, and offline it would do so
// silently.
//
// Workbox tests the allowlist against `pathname + search`, so the alternation must
// admit a query string: the app's whole state travels in one (`?o=`, `?bbox=`,
// `?pane=`), and a bare `/^\/$/` would drop every restored view back to the network.
// The precache route ahead of this one already answers a query-less `/` by way of
// workbox's `directoryIndex`; this is what catches the rest.
const handler = createHandlerBoundToURL('/index.html');
const navigationRoute = new NavigationRoute(handler, {
  allowlist: [/^\/(index\.html)?(\?|$)/],
});
registerRoute(navigationRoute);

// DB runtime cache — CacheFirst with 1-entry cap.
// maxEntries: 1 collapses hash-churn: each nightly pipeline produces a new
// occurrences_<hash>.db URL; without a cap, old hashes accumulate toward
// the iOS ~50 MB quota. With maxEntries: 1, Workbox evicts the previous DB
// entry whenever a new one is cached — steady-state usage stays ~23 MB.
// purgeOnQuotaError: true cleans up the entire data-artifacts cache on
// genuine-full-disk quota failures (D-04 backstop).
// Note: does NOT intercept manifest.json (.json extension, not .db) — that has
// its own NetworkFirst route below.
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

// GeoJSON runtime cache — CacheFirst, no entry cap.
// counties/ecoregions/ecoregions_l4/places GeoJSON use stable URLs that overwrite
// in place each nightly pipeline run; a handful of files, <5 MB combined.
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

// manifest.json NetworkFirst route — separate from data-artifacts per cache-isolation rationale.
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

// The api.mapbox.com StaleWhileRevalidate route lived here until beeatlas-mas.
// Nothing requests that host any more — the basemap is self-hosted PMTiles read
// through a MapLibre protocol (ADR 0026) — so the route matched nothing, and the
// §2.8.1 licensing analysis it carried governs nothing we serve. See
// docs/adr/0001-mapbox-basemap-cache.md, now superseded.
//
// The CACHE it filled can still be on a device that used the app before
// 2026-08-01, holding up to 150 tile responses of storage the user cannot see or
// reclaim. Delete it on activate: no route will ever read it again, and an
// installed PWA competing for an iOS storage bucket with a 285 MB basemap
// download (ADR 0025) should not be carrying a dead one.
//
// Unconditional and idempotent — caches.delete resolves false when it is already
// gone, which is the steady state for every install after this ships. Kept out of
// the fetch path deliberately; this is the one lifecycle event that runs once per
// worker version.
//
// NOT inside waitUntil, and that is the whole point of this line existing in this
// shape. Activation is a gate: while a client's active worker is `activating`, the
// spec HOLDS every fetch event it dispatches — so anything that can hang in an
// activate handler's waitUntil can wedge the entire app for that user. Cache
// Storage on an origin holding a 285 MB basemap is not somewhere to take that bet
// for a housekeeping delete of a cache no route will ever read.
//
// The cost of dropping the waitUntil is that the worker may be terminated before
// the delete lands, in which case it simply runs again at the next activation.
// That is the correct trade for cleanup: worst case it happens later, rather than
// worst case the app never starts.
self.addEventListener('activate', () => {
  void caches.delete('mapbox-basemap');
});

// skipWaiting fires ONLY in response to wb.messageSkipWaiting() from the user-clicked update banner.
// No top-level skipWaiting call — the no-skipWaiting invariant from 147/148/149 is satisfied
// structurally: this handler is the only path, and it requires an explicit SKIP_WAITING message.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
