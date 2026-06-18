---
phase: 149-data-runtime-caching-offline-cold-start
plan: 01
subsystem: pwa
tags: [pwa, service-worker, workbox, runtime-cache, offline, cache-first]

requires:
  - phase: 148-app-shell-precache-vite-plugin-pwa-wiring
    provides: vite-plugin-pwa injectManifest wired; src/sw.ts baseline with precacheAndRoute + NavigationRoute; no skipWaiting invariant

provides:
  - CacheFirst runtime routes for /data/*.db and /data/*.geojson in src/sw.ts
  - data-artifacts named cache shared by both routes
  - ExpirationPlugin({maxEntries:1, purgeOnQuotaError:true}) on DB route (quota hygiene)
  - CacheableResponsePlugin({statuses:[200]}) on both routes (no non-200 cache poisoning)
  - workbox-strategies@^7.4.1, workbox-expiration@^7.4.1, workbox-cacheable-response@^7.4.1 in devDependencies
  - build-output.test.ts CI gates for runtime routes and no-skipWaiting invariant

affects:
  - 149-02 (cold-start probe can now reference data-artifacts cache name)
  - 149-03 (online/offline UI can check data-artifacts for cache status)
  - 150-offline-ux (manifest.json NetworkFirst route will not conflict — extension-specific predicates)

tech-stack:
  added:
    - workbox-strategies@^7.4.1 (CacheFirst strategy)
    - workbox-expiration@^7.4.1 (ExpirationPlugin for entry cap + quota cleanup)
    - workbox-cacheable-response@^7.4.1 (CacheableResponsePlugin for status filter)
  patterns:
    - Two separate registerRoute calls (one per extension) so ExpirationPlugin maxEntries:1 applies only to .db, not .geojson
    - Both routes share the data-artifacts cache name; ExpirationPlugin eviction scopes to its own route, not the whole cache

key-files:
  created: []
  modified:
    - src/sw.ts
    - package.json
    - package-lock.json
    - src/tests/build-output.test.ts

key-decisions:
  - "GeoJSON uses runtime CacheFirst (D-02 default kept) — no precache flip; runtime is cleaner and avoids tying SW update cycle to GeoJSON-only changes"
  - "Two separate routes instead of one /data/* route — ExpirationPlugin maxEntries:1 must scope to DB only (RESEARCH Pitfall 1)"
  - "ExpirationPlugin registered BEFORE CacheableResponsePlugin in plugin list (Workbox hook order)"
  - "data-artifacts is the cache name (D-01); both routes share it; ExpirationPlugin manages its own route's entries independently"

requirements: [OFF-02, OFF-03]

metrics:
  duration: ~7 minutes
  tasks_completed: 3
  files_modified: 4
  completed: "2026-06-18"
---

# Phase 149 Plan 01: Data Runtime Cache Routes Summary

**Workbox CacheFirst routes for `/data/*.db` and `/data/*.geojson` added to `src/sw.ts` under the `data-artifacts` named cache, with ExpirationPlugin({maxEntries:1, purgeOnQuotaError:true}) on the DB route to collapse hash-churn accumulation and handle quota failures.**

## Performance

- **Tasks:** 3 / 3
- **Files modified:** 4 (package.json, package-lock.json, src/sw.ts, src/tests/build-output.test.ts)
- **Lines added to src/sw.ts:** 40 (3 imports + 37 route + comment lines; 37 baseline → 77 total)
- **New build-output tests:** 3 (all pass against freshly built `_site/app/sw.js`)

## What Was Built

### Task 1: Three new devDependencies installed

```
workbox-strategies@^7.4.1   (CacheFirst strategy class)
workbox-expiration@^7.4.1   (ExpirationPlugin — entry cap + quota cleanup)
workbox-cacheable-response@^7.4.1  (CacheableResponsePlugin — block non-200 caching)
```

All three at `^7.4.1`, matching the existing `workbox-precaching`/`workbox-routing`/`workbox-build`/`workbox-window` range. Added to `devDependencies` (not `dependencies`) — bundled by vite-plugin-pwa's SW build pass, not the main page bundle. `npm ci` confirmed clean on the lockfile.

### Task 2: src/sw.ts runtime routes (diff summary)

**New imports** (3 lines after existing workbox-routing import):
```typescript
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
```

**New DB route** (after `registerRoute(navigationRoute)`):
```typescript
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
```

**New GeoJSON route** (after DB route):
```typescript
registerRoute(
  ({ url }) => url.pathname.startsWith('/data/') && url.pathname.endsWith('.geojson'),
  new CacheFirst({
    cacheName: 'data-artifacts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
    ],
  })
);
```

Route order: `precacheAndRoute` → `NavigationRoute` → DB runtime route → GeoJSON runtime route. The navigation route still wins for all `/app/` HTML navigations.

**GeoJSON placement decision (D-02):** Kept as runtime CacheFirst (default). No flip to precache. Reason: runtime CacheFirst is cleaner — precaching GeoJSON would tie the SW update cycle to GeoJSON-only pipeline changes even when the DB was unchanged.

### Task 3: Three new build-output assertions

All three reside inside the existing `describe.skipIf(SKIP_BUILD)` block in `src/tests/build-output.test.ts`:

1. `'_site/app/sw.js registers a runtime CacheFirst route for /data/ (OFF-02)'` — asserts `sw.toContain('data-artifacts')`, `sw.toMatch(/\.db/)`, `sw.toMatch(/\.geojson/)`
2. `'_site/app/sw.js does not contain skipWaiting or clients.claim (OFF-03 carry-forward)'` — first built-output gate for the no-skipWaiting invariant (Phase 147/148 enforced it only at source level)
3. `'workbox-strategies, workbox-expiration, workbox-cacheable-response in package.json (OFF-02)'` — asserts all three are in `{ ...dependencies, ...devDependencies }`

**grep proof:** `grep -c 'data-artifacts' _site/app/sw.js` → 1 (string survives Rollup minification)

**Full suite result:** 39 tests in build-output.test.ts, 630 total — all green.

## Deviations from Plan

**1. [Rule 3 - Blocking] Worktree missing generated data files for build**
- **Found during:** Task 3 verification (`npm run build`)
- **Issue:** The worktree at `.claude/worktrees/agent-ac43dbacba2daef4d/` had only `places.geojson` and `places.json` in `public/data/`; the build's Eleventy data cascade reads `public/data/species.json`, `higher_taxa.json`, `seasonality.json`, `manifest.json`, `counties.geojson`, `ecoregions.geojson`, and `photos.json` at build time. These are pipeline-generated and gitignored.
- **Fix:** Copied the 7 missing files from the main repo's `public/data/` to the worktree's `public/data/`. These files are not committed (they're gitignored).
- **Impact:** Build succeeded; all tests pass. No code changes required.

None beyond the data-file worktree bootstrap. Plan executed exactly as written for all three tasks.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The two `registerRoute` additions are in the service worker context and bounded by the existing `/app/` scope. The `CacheableResponsePlugin({ statuses: [200] })` on both routes prevents non-200 response caching (T-149-01 mitigation, per plan threat model). No new threat surface beyond what the plan's threat model covers.

## Known Stubs

None. All routes are fully wired. The `data-artifacts` cache name is a live string in the built SW, not a placeholder. Plan 02 can reference it immediately.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| `src/sw.ts` exists | FOUND |
| `package.json` exists | FOUND |
| `src/tests/build-output.test.ts` exists | FOUND |
| `149-01-SUMMARY.md` exists | FOUND |
| `_site/app/sw.js` exists (built output) | FOUND |
| Commit b6b5fae6 (Task 1 — devDependencies) | FOUND |
| Commit b16e230d (Task 2 — sw.ts routes) | FOUND |
| Commit 374c3199 (Task 3 — build-output tests) | FOUND |
