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
