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
// D-04: NO top-level skipWaiting, NO claiming of clients. The no-skipWaiting invariant
// is now satisfied STRUCTURALLY via the SKIP_WAITING gate (D-16): skipWaiting()
// fires ONLY in response to wb.messageSkipWaiting() from the user-clicked update banner.
// The new SW waits until all app tabs are closed before activating.
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
// The `activate` listener is typed with a plain Event under this project's libs
// (the only ambient service-worker type here is the `self` declaration at the
// top), so name the one member used rather than pulling in the WebWorker lib for
// a three-line handler.
type ExtendableLike = Event & { waitUntil(promise: Promise<unknown>): void };

self.addEventListener('activate', (event) => {
  (event as ExtendableLike).waitUntil(caches.delete('mapbox-basemap'));
});

// D-16: skipWaiting fires ONLY in response to wb.messageSkipWaiting() from the user-clicked update banner.
// No top-level skipWaiting call — the no-skipWaiting invariant from 147/148/149 is satisfied
// structurally: this handler is the only path, and it requires an explicit SKIP_WAITING message.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
