# Requirements: Washington Bee Atlas — v5.0 Offline Field Mode

**Defined:** 2026-06-10
**Core Value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants. v5.0 extends this into the field: a collector standing in a meadow with no signal can see what bees have been found right where they are.

**Milestone goal:** Make the map + table usable offline in the field as an installable PWA with a current-location indicator, dogfooded privately behind an unlisted route before anyone else is invited.

**Grounding:** Scope locked in discussion 2026-06-10; de-risked by `.planning/research/SUMMARY.md` (+ STACK/FEATURES/ARCHITECTURE/PITFALLS). Data is already fully client-side (wa-sqlite, ~23 MB `occurrences.db`), so offline filtering/table/selection come nearly free once the artifacts are cached — the work is the service worker, install surface, cache-health UX, and geolocation.

## v1 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase.

### Dogfood Route & Service-Worker Topology

- [x] **ROUTE-01**: An unlisted `/app/` route serves the offline-capable map+table; it is not linked from the main site, sitemap, or nav. The main `/` route is unchanged and has no service worker registered.
- [x] **ROUTE-02**: A service worker served at `/app/sw.js`, registered with `scope: '/app'`, controls the `/app` page and intercepts the same-origin `/data/*` fetches that page issues (no `Service-Worker-Allowed` header needed); DevTools confirms no SW is attached to `/`.
- [x] **ROUTE-03**: `/app/sw.js` and `/app/manifest.webmanifest` are served with `Cache-Control: no-cache` (CloudFront behavior) so SW/manifest updates are not delayed by the default long-TTL.

### Installable PWA

- [ ] **PWA-01**: `/app/manifest.webmanifest` declares `name`, `start_url: /app`, `display: standalone`, `background_color`/`theme_color`, and 192px/512px/maskable icons; the app is installable on Android/Chrome via a captured `beforeinstallprompt` (deferred, surfaced as an in-app "Install" affordance, not a blocking modal).
- [ ] **PWA-02**: On iOS Safari (no `beforeinstallprompt`), the `/app` page shows inline "Add to Home Screen" instructions, displayed only when not already running standalone.
- [ ] **PWA-03**: Launching the installed app offline (cold start) opens in standalone mode and renders the map+table from cache without a network connection.

### Offline Caching & Operation

- [x] **OFF-01**: The app shell (hashed JS/CSS for the `/app` entry) is precached via `vite-plugin-pwa` `injectManifest`, wired through `eleventy.config.js` `viteOptions.plugins`; the `/app` UI loads fully offline.
- [ ] **OFF-02**: `occurrences.db` (~23 MB) and all GeoJSON (`counties`/`ecoregions`/`places`) are runtime-cached (`CacheFirst`, `maximumFileSizeToCacheInBytes` raised); offline, occurrence dots and county/ecoregion overlays render and all filter/table/selection queries run against the cached DB.
- [ ] **OFF-03**: Cache invalidation is keyed to the existing content-hash `manifest.json`; the SW update lifecycle uses prompt-to-reload ("A data update is available — tap to reload"), never `skipWaiting`/`clientsClaim` auto-activation, to avoid app-code↔DB version skew.
- [ ] **OFF-04**: Uncached Mapbox basemap tiles render blank offline without crashing the map; an honest label explains the basemap is only cached for areas browsed while online.
- [ ] **OFF-05**: The app indicates online/offline state (`navigator.onLine` + `online`/`offline` events) with a non-blocking status indication; the map stays fully usable offline.

### Cache Health & Freshness

- [ ] **CACHE-01**: A "ready for offline" indicator reports ready only once all required assets (app shell + `occurrences.db` + GeoJSON) are cached; an incomplete prime shows a clear "finish setup on WiFi" state rather than a silently-degraded UI.
- [ ] **CACHE-02**: A determinate prime progress indicator (files or MB) is shown during the ~23 MB download (SW→page `postMessage`), not just an indeterminate spinner.
- [ ] **CACHE-03**: After priming, the device cache size ("X MB stored on this device") is shown via `navigator.storage.estimate()`.
- [ ] **CACHE-04**: A "Data as of `<date>`" label shows the pipeline **generation** date (from `manifest.json` `generated_at`), human-readable and always visible; it changes only when a newer DB is fetched, not on page refresh.
- [ ] **CACHE-05**: On reconnect, if `occurrences.db` is missing from cache (e.g. iOS Safari eviction), the app re-primes it; `navigator.storage.persist()` is requested at first launch and `QuotaExceededError` is handled with partial-write cleanup.

### Current Location

- [ ] **LOC-01**: A Mapbox `GeolocateControl` (`trackUserLocation`, `enableHighAccuracy`, `showAccuracyCircle`) shows a blue dot + accuracy ring with a recenter button; it works offline via GPS (no signal required).
- [ ] **LOC-02**: Location state is owned by `<bee-atlas>` (`@state _userLocation`); `<bee-map>` hosts the control and relays position upward via a `composed` CustomEvent, preserving the state-owner/pure-presenter invariant.
- [ ] **LOC-03**: Denied or unavailable location permission is handled gracefully — the control shows a disabled/error state and a brief explanation; the rest of the app is unaffected.

### Occurrences Near Me

- [ ] **NEAR-01**: A "Near me" chip filters to occurrences within a fixed 10 km radius of the user's position and AND-composes with the existing taxon/date/region/selection filters (and with the table/list view).
- [ ] **NEAR-02**: The proximity query uses a bounding-box SQL pre-filter plus a haversine distance check (in the worker), waits for a GPS fix before firing (barrier analogous to `taxaReady`/`_filterQueryGeneration`), and returns in under ~200 ms on the full occurrence set.
- [ ] **NEAR-03**: Near-me state round-trips in the URL as a boolean `?near=1` (coordinates are ephemeral); restoring re-activates geolocation and defers the query until a fix arrives; "Clear filters" clears the chip.

### Basemap Tile Caching (TOS-Gated)

- [ ] **TILE-01**: The SW can runtime-cache Mapbox basemap tiles behind a `beta_tile_cache` feature flag that defaults **off** in committed code; the cache handler strips `access_token` from the cache key, caches only status-200 responses, and bounds growth with `maxEntries` + a ≤12 h TTL.
- [ ] **TILE-02**: Tile caching is documented as **self-test only**, with a hard Mapbox-TOS-review gate that must pass before the flag is enabled in any non-self/public deployment.

## v2 / Future Requirements

Deferred to a later pass; tracked but not in this roadmap.

### Freshness & Updates

- **FUT-01**: Proactive "New data available (`<date>`) — tap to download" toast that re-primes a *present-but-stale* DB on reconnect. (Deferred per 2026-06-10 scope decision. **Known limitation while deferred:** on `/app`, a present-but-stale cached DB stays stale while online until evicted or manually re-primed; the "Data as of" label keeps this honest.)
- **FUT-02**: Distance column in the occurrence list/table, sortable by proximity to the user.

### Field Polish

- **FUT-03**: iOS `apple-touch-startup-image` splash screens (v1 accepts a brief white flash, mitigated by `background_color`).
- **FUT-04**: Adjustable "near me" radius (slider) — v1 hard-codes 10 km.

### Graduation

- **FUT-05**: Graduate `/app` to the root `/` (root-scoped SW, public install prompt) — gated on TOS review, ≥1 real field outing, and team sign-off.
- **FUT-06**: Bundled offline basemap (PMTiles/MBTiles) or explicit "save this area" tile pre-download — gated on Mapbox TOS review and significant added scope.

## Out of Scope

Explicitly excluded for v5.0. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Offline species/places/feeds pages | Eleventy-generated static pages not used in the field; caching them inflates cache size and SW complexity. SW scoped to `/app` + `/data` only. |
| Region-subset / "download this area" data caching | Whole-of-Washington chosen; the full DB is only ~23 MB, so spatial subsetting isn't worth the engineering. |
| Bundled offline basemap tile set | Mapbox TOS on redistributing tiles; a useful WA set is hundreds of MB; dots render over blank tiles regardless. (Tracked as FUT-06.) |
| Background / continuous location tracking when backgrounded | Extra permissions + battery drain; the use case is a glance at the map while collecting. `trackUserLocation` foreground-only. |
| Push notifications for new data | No push infra/backend; reconnect check (deferred even as a toast) is sufficient. |
| Silent auto-refresh of the 23 MB DB without consent | Hostile on a metered rural connection. Re-prime is missing-DB-only (CACHE-05); proactive update is opt-in and deferred (FUT-01). |
| Install promotion on the main `/` site | Main page stays untouched until v5.0 is dogfood-proven (graduation is FUT-05). |

## Traceability

Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ROUTE-01 | Phase 147 | Complete |
| ROUTE-02 | Phase 147 | Complete |
| ROUTE-03 | Phase 147 | Complete |
| PWA-01 | Phase 151 | Pending |
| PWA-02 | Phase 151 | Pending |
| PWA-03 | Phase 151 | Pending |
| OFF-01 | Phase 148 | Complete |
| OFF-02 | Phase 149 | Pending |
| OFF-03 | Phase 149 | Pending |
| OFF-04 | Phase 149 | Pending |
| OFF-05 | Phase 149 | Pending |
| CACHE-01 | Phase 150 | Pending |
| CACHE-02 | Phase 150 | Pending |
| CACHE-03 | Phase 150 | Pending |
| CACHE-04 | Phase 150 | Pending |
| CACHE-05 | Phase 149 | Pending |
| LOC-01 | Phase 152 | Pending |
| LOC-02 | Phase 152 | Pending |
| LOC-03 | Phase 152 | Pending |
| NEAR-01 | Phase 153 | Pending |
| NEAR-02 | Phase 153 | Pending |
| NEAR-03 | Phase 153 | Pending |
| TILE-01 | Phase 154 | Pending |
| TILE-02 | Phase 154 | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24 ✓
- Unmapped: 0

---
*Requirements defined: 2026-06-10*
*Last updated: 2026-06-10 after initial definition*
