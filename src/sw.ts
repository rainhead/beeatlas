// Service worker source for the /app shell — compiled to _site/app/sw.js by
// vite-plugin-pwa (injectManifest strategy, wired in eleventy.config.js).
//
// D-04: NO skipWaiting, NO clients.claim.
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
};

import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
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
