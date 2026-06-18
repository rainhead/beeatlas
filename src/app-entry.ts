// Vite entry for the /app route.
// Imports <bee-atlas> (same component as /) plus SW registration.
// _pages/index.html references src/bee-atlas.ts directly and MUST NOT
// import this file — that structural separation is the no-SW-on-/ guarantee.
import './bee-atlas.ts';
import './sw-registration.ts';
import { resolveDataUrl } from './manifest.ts';

// probeAndReprime — page-side CACHE-05 trigger.
//
// D-07: Cold-start probe + 'online' event listener for re-prime trigger.
// D-08: Silent background fetch; no new UX in Phase 149.
// D-05: No sentinel-key cleanup — purgeOnQuotaError (Plan 01) handles the
//       QuotaExceededError case; Cache API put() is atomic (no partial entries).
//
// On a true first visit the SW has not yet activated, so this fetch goes
// directly to the network and is NOT intercepted by the SW — the response is
// not cached. That is expected and not a bug: the DB loads normally from
// CloudFront on first visit and on the next visit the SW's CacheFirst handler
// will cache it. The cold-start probe is primarily for the re-prime-on-reconnect
// case (iOS eviction), per RESEARCH Pitfall 3.
async function probeAndReprime(): Promise<void> {
  if (!('caches' in window)) return;  // defensive: all SW-capable browsers have caches
  if (!navigator.onLine) return;      // offline: bail early; 'online' event re-runs
  const dbUrl = await resolveDataUrl('occurrences_db');
  if (!dbUrl) return;  // manifest may omit occurrences_db (RESEARCH Open Q2)
  // caches.match() returns undefined on miss (not null) — guard with !cached (RESEARCH Pitfall 5)
  const cached = await caches.match(dbUrl, { cacheName: 'data-artifacts' });
  if (!cached) {
    // Fire-and-forget: SW intercepts and caches. Page doesn't need the response body.
    fetch(dbUrl).catch((err: unknown) => console.warn('[cache-probe] re-prime fetch failed:', err));
  }
}

// Run on cold start (bails early if offline)
void probeAndReprime();

// Re-run when connectivity returns — handles the field flow:
// user opens app while offline, later connects to WiFi, app re-primes without reload.
// The listener lives for the lifetime of the page (this is a side-effect module with
// no disconnectedCallback, per RESEARCH §"Pattern 2").
window.addEventListener('online', () => void probeAndReprime());
