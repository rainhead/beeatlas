// Phase 147 stub — pass-through only, no caching.
// D-06: No lifecycle-skip calls or immediate client takeover (preserves the
// prompt-to-reload invariant). Both are excluded — this is non-negotiable.

self.addEventListener('install', (event) => {
  // New SW waits until old tabs close before taking control (D-06).
  event.waitUntil(Promise.resolve());
});

self.addEventListener('activate', (event) => {
  // Bare activate listener per D-06: no immediate takeover of already-open
  // /app tabs. Controlled after the next reload. Logging here is fine.
});

self.addEventListener('fetch', (event) => {
  // Pass-through: intercepts /data/* fetches from the /app page (SW scope
  // controls pages, not paths — see ARCHITECTURE.md §1).
  // DevTools Network shows "(ServiceWorker)" as initiator for /data/* fetches,
  // satisfying ROUTE-02 criterion 4 without caching anything.
  event.respondWith(fetch(event.request));
});
