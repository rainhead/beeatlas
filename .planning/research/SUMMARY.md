# Project Research Summary

**Project:** Washington Bee Atlas — v5.0 Offline Field Mode
**Domain:** PWA offline + geolocation additions to an existing Eleventy+Vite+Lit+Mapbox+wa-sqlite static map app
**Researched:** 2026-06-10
**Confidence:** HIGH

## Executive Summary

BeeAtlas v5.0 adds an installable PWA with offline map+data capability and a current-location filter to an already-working client-side SQLite map app. Because the data layer is already fully client-side (wa-sqlite, ~23 MB occurrences.db fetched at runtime), the offline story is essentially: cache what the app already fetches, then surface that cache state to the user. The main technical challenge is not architecture-in-the-large but a cluster of concrete, well-documented wrinkles: wiring vite-plugin-pwa into `eleventy.config.js` rather than `vite.config.ts`, keeping the service worker out of the main `/` route, handling iOS Safari's aggressive ~50 MB cache quota and 7-day eviction, and choosing prompt-to-reload over skipWaiting to prevent app-code/DB version skew.

The recommended approach is `vite-plugin-pwa@1.3.0` with `injectManifest` strategy, a SW served at `/app/sw.js` scoped to `/app`, Workbox runtime `CacheFirst` for the 23 MB DB (not precache), and `StaleWhileRevalidate` for `manifest.json`. The SW scope decision is clean: scope controls which *pages* the SW governs, not which URLs it can cache. A SW at `/app/sw.js` with `scope: /app` fully intercepts all `/data/` fetches issued by the `/app` page — no `Service-Worker-Allowed` header, no CDK change. The `occurrences.db` cache miss after iOS eviction is a real field risk; "last cached" UI and re-prime-on-reconnect are must-haves, not polish. Mapbox tile caching is in scope but TOS-gated: it must default OFF in committed code and go behind a feature flag that requires an explicit TOS review before any public use.

The geolocation and "near me" features are low complexity. `GeolocateControl` is already in mapbox-gl 3.x — no new dependency. The `nearMe` proximity query extends the existing `FilterState`/`buildFilterSQL` pattern: a bounding-box SQL pre-filter followed by a haversine post-filter in the worker in JavaScript (wa-sqlite MemoryVFS lacks `sin`/`cos`, so the full haversine cannot run in SQL — verify empirically before finalizing). Both tracks — offline caching and geolocation — are independent after the `/app` route exists, enabling parallel development.

---

## Key Findings

### Recommended Stack

No new runtime dependencies are needed for geolocation or SQL queries. The only new dependency is `vite-plugin-pwa@1.3.0` plus five Workbox 7.x peer packages (`workbox-precaching`, `workbox-routing`, `workbox-strategies`, `workbox-expiration`, `workbox-cacheable-response`) — all devDependencies since the Workbox modules imported in `sw.ts` are bundled by vite-plugin-pwa's separate SW build pass. Icon generation uses `@vite-pwa/assets-generator@1.0.2` as a run-once dev-time tool.

**Core new technologies:**
- `vite-plugin-pwa@1.3.0` — SW generation + manifest injection + Workbox precache manifest; confirmed Vite 8 peer dep support; MUST be wired via `viteOptions.plugins` in `eleventy.config.js`, NOT `vite.config.ts`
- `workbox-*@7.4.1` (5 sub-packages) — runtime caching strategies; same-version family required
- `injectManifest` strategy over `generateSW` — custom runtime-cache rules for the 23 MB DB and tile caching cannot be expressed in `generateSW`
- `mapboxgl.GeolocateControl` — already in mapbox-gl 3.x; zero new dependencies for blue dot, accuracy ring, recenter, GPS offline
- SQL bounding-box + JS haversine in sqlite-worker.ts — no new dependency; keeps computation in the worker thread

**Critical configuration requirements:**
- `maximumFileSizeToCacheInBytes` must be raised to at least `30_000_000` (default 2 MB silently excludes the 23 MB DB)
- `sw.js` must be placed in `public/app/` (Vite passthrough, not asset-pipeline-processed) to avoid content-hashing that breaks SW update detection
- `/app/sw.js` and `/app/manifest.webmanifest` must be served with `Cache-Control: no-cache, no-store` (small CDK addition — new CloudFront behavior)
- Register with `navigator.serviceWorker.register('/app/sw.js', { scope: '/app' })` — explicit scope; no `Service-Worker-Allowed` header needed

### Expected Features

All seven features locked in PROJECT.md v5.0 are confirmed feasible with the recommended stack.

**Must have (all v5.0):**
- Installable PWA: `manifest.webmanifest` + icons (192px, 512px, maskable) + `display: standalone` + `start_url: /app`
- Offline cold-start: SW precaches app shell; runtime-caches occurrences.db + all GeoJSON; existing sqlite.ts/stale-guard.ts work unchanged against cached responses
- "Ready for offline" indicator + "data as of `<date>`" freshness label — iOS eviction makes both mandatory, not optional polish; `generated_at` already in `manifest.json` (no pipeline change needed)
- Unlisted `/app/` route — no link from main site; SW scoped to `/app`; main `/` completely unaffected
- `GeolocateControl` — blue dot + accuracy ring + recenter; GPS works offline; no new dependency
- "Occurrences near me" — fixed 10 km radius chip, AND-composes with existing filters, URL state as `?near=1` boolean only (coordinates ephemeral)
- Cached Mapbox basemap tiles — TOS-gated, self-test only, feature-flag defaulting OFF in committed code

**Should have (P2, after initial dogfood):**
- Determinate cache-priming progress bar (SW→page postMessage; indeterminate spinner acceptable for v1)
- Cache size display via `navigator.storage.estimate()`
- "New data available" toast + user-initiated re-prime on reconnect

**Deliberate anti-features:**
- No silent auto-refresh of the DB on reconnect (23 MB on metered rural connection without user consent is hostile)
- No `skipWaiting` + `clientsClaim` (causes code/DB version skew with nightly content-hash churn)
- No bundled offline tile set (Mapbox TOS; hundreds of MB; occurrence dots render over blank tiles anyway)
- No adjustable near-me radius in v1 (hard-code 10 km; iNaturalist precedent for fixed default)

### Architecture Approach

The existing `<bee-atlas>` state-owner / `<bee-map>` pure-presenter / `<bee-pane>` pure-presenter invariant is preserved without compromise. `GeolocateControl` lives in `<bee-map>._initMap()` (requires a Map instance), fires `user-location-changed` CustomEvents (with `composed: true` to cross shadow DOM) up to `<bee-atlas>`, which owns `@state _userLocation`. The proximity filter extends `FilterState` with `nearMe: { lat, lon, radiusKm } | null` that feeds `buildFilterSQL`'s bounding-box clause and a haversine post-filter inside sqlite-worker.ts. The existing `_filterQueryGeneration` race guard covers location-driven query generation automatically.

The SW is architecturally isolated: `public/app/sw.js` (Vite passthrough, not hashed), scoped to `/app`, no effect on any other route. Cache invalidation is keyed to content-hash filenames via `manifest.json` (NetworkFirst strategy); no manual version management required.

**Major new/modified components:**
1. `_pages/app/index.html` + `src/app-entry.ts` — new `/app` route and Vite entry point
2. `public/app/sw.js` (source: `src/sw.ts`) — Workbox injectManifest target; app shell precache + `/data/` runtime cache + manifest invalidation
3. `src/sw-registration.ts` — SW registration + workbox-window update lifecycle + prompt-to-reload
4. `src/filter.ts` — `FilterState.nearMe` field + bbox SQL clause in `buildFilterSQL`
5. `src/sqlite-worker.ts` — haversine post-filter in JavaScript when `nearMe` is set
6. `src/bee-atlas.ts` — `_userLocation`, `_generatedAt` state; handles `user-location-changed`
7. `src/bee-map.ts` — adds `GeolocateControl`, relays location events upward via CustomEvent
8. `src/bee-pane.ts` — freshness footer + "Near me" chip UI
9. `src/manifest.ts` — add `loadGeneratedAt(): Promise<string | null>` export
10. `infra/lib/beeatlas-stack.ts` — `Cache-Control: no-cache` behavior for `/app/sw.js` and `/app/manifest.webmanifest`

### Critical Pitfalls

1. **SW scope bleeds onto `/`** — Placing `sw.js` at root or failing to scope to `/app` contaminates the public-facing site and is hard to undo for users with cached SWs. Serve from `public/app/sw.js`, register with `{ scope: '/app' }`. Verify in DevTools after scaffolding that no SW is attached to `/`.

2. **occurrences.db silently excluded from Workbox cache** — Default `maximumFileSizeToCacheInBytes` is 2 MB; the 23 MB DB is silently excluded. Set to `30_000_000`. Also: do NOT put the DB in the precache manifest (blocks SW install for 30+ seconds on mobile and risks quota); use runtime `CacheFirst` in `sw.ts`.

3. **vite-plugin-pwa wired in wrong config** — If wired via `vite.config.ts` instead of under `viteOptions.plugins` in `eleventy.config.js`, the precache manifest is injected into the wrong Vite invocation and will contain stale/zero hashes. Always wire under `eleventy.config.js`.

4. **iOS Safari evicts the 23 MB DB** — Storage pressure or 7+ days of inactivity can trigger whole-origin eviction. `navigator.storage.persist()` returns `false` on iOS without notification permission. Mitigation: show "last cached" date prominently; re-prime automatically on reconnect if DB is missing; document that collectors must open the app before heading out.

5. **skipWaiting + clientsClaim causes code/DB version skew** — The nightly pipeline changes `occurrences.db` hash nightly. A new SW auto-activating mid-session can serve a new DB against old app code (different column count). Use prompt-to-reload pattern instead: display "A data update is available — tap to reload" and let the user control when the old session is retired.

6. **Mapbox tile cache key includes access token** — Token rotation invalidates the entire tile cache; a stale 403 can itself be cached and served offline, producing a permanent blank map. Strip `access_token` from cache key in the Workbox route handler; set TTL ≤ 12 hours; only cache status-200 responses; keep behind `beta_tile_cache` feature flag defaulting `false`.

7. **wa-sqlite MemoryVFS lacks trig functions** — The full SQL haversine (`sin`/`cos`/`asin`) cannot run in wa-sqlite MemoryVFS without loading a math extension. Haversine must run in JavaScript in the worker, after a bounding-box SQL pre-filter. Verify empirically at implementation time with `SELECT sin(1.0)` before finalizing the approach.

---

## Conflict Resolutions

### SW Scope and `/data/` Intercept (RESOLVED — ARCHITECTURE doc is correct)

The PITFALLS and FEATURES docs incorrectly stated that a `Service-Worker-Allowed: /` header is required for a `/app`-scoped SW to intercept `/data/` fetches. **This is wrong.**

**The correct rule:** SW scope controls which *pages/documents* the SW governs — not which URLs the SW's fetch handler can intercept. Once the `/app` page is controlled by the SW (because it is within `scope: /app`), the SW's `fetch` handler fires for every network request that page issues — including cross-path same-origin requests to `/data/occurrences.db`, `/data/manifest.json`, and `/data/*.geojson` — regardless of those paths being outside `/app`.

`Service-Worker-Allowed` is only required when the SW *script file's path* is shallower than the desired registration scope (e.g., you want `scope: /` but `sw.js` lives at `/app/sw.js`). That case does not apply here.

**The header that IS required:** `/app/sw.js` and `/app/manifest.webmanifest` must be served with `Cache-Control: no-cache, no-store` so CloudFront's default long-TTL behavior does not delay SW updates. Small CDK addition.

### Mapbox Tile Caching (LOCKED DECISION — honor it)

The decision is locked: tile caching is **in scope for self-test only, behind a `beta_tile_cache` feature flag defaulting `false` in committed code, with a hard TOS-review gate before any public/non-self use.** The FEATURES doc's drift toward "do not cache tiles" is not the recommendation. Technical cautions that remain valid regardless of the TOS decision: strip `access_token` from cache key, opaque responses inflate Storage Quota (~7 MB per entry), restrict `cacheableResponse` to status 200 only, set `maxEntries` and TTL to prevent unbounded growth that could trigger iOS origin eviction.

---

## Implications for Roadmap

### Suggested Phase Structure

The key dependency: SW scope topology must be correct before any caching logic is added. A scope mistake made in Phase 1 corrupts everything downstream. After that, app-shell offline and `/data/` runtime caching can be validated independently of geolocation, enabling parallel work.

**Phase 1: `/app` Route + SW Topology**
- Rationale: All phases depend on the SW scope being correct. Verify first with nothing cached.
- Delivers: `/app/index.html` Eleventy page; `sw.js` registers with `scope: /app`; no SW on `/`; CloudFront `no-cache` behavior on `sw.js` + `manifest.webmanifest` confirmed via `curl -I`
- Avoids: Pitfall 1 (scope bleed); SW hashing pitfall (`public/app/sw.js`, not Vite-processed)
- Research flag: Standard patterns; no research phase needed

**Phase 2: App Shell Precache + vite-plugin-pwa Wiring**
- Rationale: Validate the Eleventy+Vite plugin integration before attempting to cache anything large; a stale precache manifest is a confusing silent failure.
- Delivers: Vite-hashed JS/CSS for `/app` entry served from SW cache offline; `injectManifest` producing correct hash list in `_site/app/sw.js`; `maximumFileSizeToCacheInBytes` raised to 30 MB; post-build verification script confirming every precache URL exists in `_site/`
- Avoids: Pitfall 2 (stale precache manifest); Pitfall 3 (plugin wired in wrong config)
- Research flag: Standard patterns; no research phase needed

**Phase 3: `/data/` Runtime Caching + Offline Cold-Start**
- Rationale: Core value proposition; requires Phase 2 (SW active and correct). Ships re-prime-on-reconnect logic alongside caching — the iOS eviction problem demands both in the same phase.
- Delivers: `occurrences.db` + all GeoJSON served from Cache Storage offline; fully offline cold-start; "Offline — cached data" banner; graceful basemap-degradation label; re-prime if DB absent on reconnect; QuotaExceededError handling with partial-write cleanup
- Key: `CacheFirst` runtime strategy, NOT precache; `purgeOnQuotaError: true`; `navigator.storage.persist()` called at first launch
- Avoids: Pitfall 4 (iOS eviction); Pitfall 6 (partial DB write)
- Research flag: Standard patterns; verify `sqlite-worker.ts` fetch path produces a non-range request (confirmed in ARCHITECTURE doc)

**Phase 4: manifest.json Freshness Signal + SW Update Lifecycle**
- Rationale: `generated_at` is already in `manifest.json` — low-effort, high-value. SW update lifecycle (prompt-to-reload) must be decided before any real tester installs the app.
- Delivers: "Data as of [date]" in `<bee-pane>`; `loadGeneratedAt()` in `manifest.ts`; prompt-to-reload banner (not skipWaiting); `manifest.json` cached with `NetworkFirst`; cache invalidation keyed to content-hash manifest
- Avoids: Pitfall 7 (skipWaiting version skew)
- Research flag: Standard patterns

**Phase 5: PWA Manifest + Installability**
- Rationale: Depends on Phase 2 (SW working) and Phase 4 (freshness label for ready badge). Unlocks real-device testing.
- Delivers: `public/app/manifest.webmanifest`; icons via `@vite-pwa/assets-generator`; iOS `<link rel="apple-touch-icon">` in `/app/index.html`; "ready for offline" badge; Android `beforeinstallprompt` capture; iOS "Add to Home Screen" static instructions text
- Research flag: Standard patterns; iOS standalone mode geolocation permission requires real-device test (see Phase 6)

**Phase 6: GeolocateControl + Location State Ownership**
- Rationale: Independent of Phases 2–5 after Phase 1. Can be developed in parallel with Phases 2–5.
- Delivers: `GeolocateControl` in `<bee-map>._initMap()`; `user-location-changed` CustomEvent with `composed: true`; `@state _userLocation` in `<bee-atlas>`; blue dot + accuracy ring + recenter
- Avoids: location state stored in `<bee-map>` (violates presenter invariant); `watchPosition` left active when backgrounded (use `visibilitychange` to pause/resume)
- Research flag: Verify geolocation permission prompt fires correctly in iOS standalone mode on a real device — not verifiable in simulators

**Phase 7: "Occurrences Near Me"**
- Rationale: Requires Phase 6 (`_userLocation` state exists). Extends the existing filter pipeline cleanly.
- Delivers: `FilterState.nearMe` field; bounding-box `WHERE` clause in `buildFilterSQL`; haversine post-filter in `sqlite-worker.ts` (JavaScript, not SQL); "Near me" chip in `<bee-pane>`; `?near=1` URL state; AND-composition with existing filters
- Key constraint: haversine runs in JS in the worker (bbox SQL pre-filter first); benchmark must return < 200 ms on full ~92k-row table
- Avoids: full-table haversine (bbox pre-filter is mandatory); main-thread distance computation
- Research flag: Verify wa-sqlite MemoryVFS math function availability with `SELECT sin(1.0)` before finalizing; if trig is available, pure SQL is cleaner

**Phase 8: Mapbox Tile Caching (TOS-Gated, Independent Track)**
- Rationale: Entirely independent; unblock only after TOS review is complete.
- Delivers: `CacheFirst` or `StaleWhileRevalidate` for `api.mapbox.com`; `access_token` stripped from cache key; `maxEntries: 500`, `maxAgeSeconds: 43200`; `beta_tile_cache` feature flag defaulting `false`; comment in SW source flagging self-test-only status
- Hard gate: explicit TOS review before flag is enabled in any non-self deployment
- Research flag: Verify whether Mapbox GL JS v3 fetches tiles as `mode: 'cors'` (non-opaque, status 200) or `no-cors` (opaque, status 0) — determines per-entry storage cost and practical `maxEntries` limit

### Research Flags

**Phases needing implementation-time verification:**
- **Phase 7 (near me):** Empirically verify wa-sqlite MemoryVFS math function availability with `SELECT sin(1.0)` in the worker. STACK and ARCHITECTURE docs conflict; the ARCHITECTURE doc (which read the wa-sqlite source) says MemoryVFS lacks math extensions. Verify before coding.
- **Phase 8 (tile caching):** Inspect Mapbox tile responses in DevTools Network panel for `Access-Control-Allow-Origin`. Opaque responses carry ~7 MB Storage Quota penalty per entry in Chrome's accounting.
- **Phase 6 (geolocation):** iOS standalone mode geolocation permission — requires real-device test. Permission prompt behavior differs between Safari tab and home-screen standalone launch.

**Phases with well-documented standard patterns (skip research phase):**
- Phase 1: SW scope rules from MDN; `EleventyVite.js` source read directly confirms plugin pass-through
- Phase 2: `vite-plugin-pwa` integration verified against actual source; maximumFileSizeToCacheInBytes is documented behavior
- Phase 3: Workbox CacheFirst for large Response objects is standard; Cache Storage vs IndexedDB choice is benchmarked
- Phase 4: manifest.json NetworkFirst + prompt-to-reload is standard Workbox Window pattern
- Phase 5: PWA manifest requirements fully documented; iOS limitations well-catalogued

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | vite-plugin-pwa 1.3.0 + Vite 8 peer dep confirmed via `npm info`; plugin integration verified by reading `EleventyVite.js` source; GeolocateControl from official Mapbox docs |
| Features | HIGH | All 7 locked features confirmed feasible; iOS limitations from WebKit official storage policy; Mapbox TOS from official terms page |
| Architecture | HIGH | SW scope rules from MDN; component boundaries read from existing source files; `manifest.ts` `generated_at` field confirmed in source |
| Pitfalls | HIGH (critical pitfalls); MEDIUM (Mapbox tile auth) | iOS eviction and version skew well-documented; tile 403 behavior from GitHub issue #8859 (older issue; mechanism plausible) |

**Overall confidence:** HIGH

### Gaps to Address at Implementation Time

- **wa-sqlite MemoryVFS trig functions:** Run `SELECT sin(1.0)` in the worker at start of Phase 7 before finalizing the haversine strategy. If trig is available, pure SQL haversine is cleaner. If not (more likely per ARCHITECTURE doc), use bbox SQL + JS haversine.
- **Mapbox tile CORS mode:** Inspect tile responses in DevTools. If tiles are `Access-Control-Allow-Origin: *` (non-opaque), tile caching is practical. If opaque, `maxEntries` must be very conservative (opaque entries cost ~7 MB each in Storage Quota).
- **iOS persist() behavior:** Call `navigator.storage.persist()` at first launch and log the result; design freshness UX to work without persistent storage (it almost certainly returns `false`).
- **`/app` Eleventy page placement:** Confirm `_pages/app/index.html` is the correct location for the project's `_pages/` convention before scaffolding Phase 1.
- **Multi-entry Vite build:** Confirm `rollupOptions.input` multi-entry configuration works cleanly with `eleventy-plugin-vite`'s rename-and-build mechanism for a separate `app-entry.ts`. Most likely integration wrinkle.

---

## Sources

### Primary (HIGH confidence)
- `node_modules/@11ty/eleventy-plugin-vite/EleventyVite.js` — confirmed `viteOptions.plugins` pass-through; `Merge + build(viteOptions)` flow
- `src/manifest.ts`, `src/sqlite-worker.ts`, `src/bee-atlas.ts`, `src/filter.ts` — direct source read for integration points
- `infra/lib/beeatlas-stack.ts` — CDK ResponseHeadersPolicy already in use on `/data/*`; extension is small
- MDN `ServiceWorkerContainer.register()` + `Service-Worker-Allowed` header spec — SW scope rules
- `npm info vite-plugin-pwa` — version 1.3.0, Vite 8 peer dep, published 2026-05-05
- `npm info workbox-build` — version 7.4.1, published 2026-05-04
- Mapbox GL JS GeolocateControl API docs — trackUserLocation, showAccuracyCircle, fitBoundsOptions
- WebKit official storage policy (Safari 17.0+) — quota, eviction, persist() behavior
- Mapbox Product Terms (April 2025) — offline tile caching TOS constraint

### Secondary (MEDIUM confidence)
- Mapbox GL JS issue #8859 — SW + 403 tile caching; token expiry root cause (older issue; mechanism plausible)
- Mapbox API caching docs — `max-age=43200` (12h) on tile responses (TTL confirmed; CORS header presence not confirmed)
- Workbox opaque response quota issue #2226 — ~7 MB per opaque entry (Chrome team confirmed)
- OPFS vs IndexedDB binary performance benchmark (RxDB) — Cache Storage preferred for large Response objects (~850 ms IndexedDB vs ~90 ms Cache Storage for 23 MB write)
- PWA iOS limitations guide (magicbell.com) — 50 MB cache quota, 7-day eviction (consistent with WebKit post)

### Tertiary (needs implementation-time verification)
- wa-sqlite MemoryVFS math function availability — conflicting claims in research; requires `SELECT sin(1.0)` test
- Mapbox GL JS v3 tile fetch CORS mode — not confirmed from official docs; requires DevTools Network inspection

---
*Research completed: 2026-06-10*
*Ready for roadmap: yes*
