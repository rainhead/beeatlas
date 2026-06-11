# Pitfalls Research

**Domain:** Offline/PWA + geolocation — adding to an existing Eleventy+Vite+Lit+Mapbox GL JS v3+wa-sqlite static site (v5.0 Offline Field Mode)
**Researched:** 2026-06-10
**Confidence:** HIGH for service worker lifecycle, iOS storage, and Mapbox TOS risk (multiple corroborating sources); MEDIUM for Mapbox tile auth cache-key specifics (confirmed via issue tracker, not official docs)

---

## Critical Pitfalls

### Pitfall 1: SW Scope Bleeds onto the Main Route (`/`) — The Dogfood Experiment Contaminates Production

**What goes wrong:**
The plan is to dogfood offline behind `/app` (an unlisted route) while leaving the main map at `/` untouched. If the service worker file is placed at `/sw.js` and registered without an explicit `scope` option, or placed at the site root, its default scope is `/` — which covers every route including the main map. The SW then intercepts all fetches on `/`, adding caching, potentially serving stale responses, and breaking the assumption that `/` is a clean, server-first experience. When the experiment is later abandoned and the SW is removed from the build, any user whose browser has the old SW installed will continue being served cached responses until the SW TTL expires (up to 24 hours for the SW script itself).

**Why it happens:**
SW scope defaults to the directory the SW script is served from. A root-served `/sw.js` has global scope. Developers often place the SW at root because it is the simplest path and because Workbox/vite-plugin-pwa default to that location.

**How to avoid:**
- Serve the service worker file from `/app/sw.js`, not `/sw.js`. Its default scope becomes `/app/`, covering only the dogfood route and `/data/` fetches via the `Service-Worker-Allowed` response header trick (see below).
- Register with an explicit scope: `navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' })`.
- The SW needs to cache `/data/occurrences.db` (served from `/data/`, outside `/app/`). A SW at `/app/sw.js` cannot control fetches to `/data/` by default. Use the `Service-Worker-Allowed: /` HTTP response header on `/app/sw.js` itself (set at the CloudFront/S3 level or via a meta response header rule) to grant broader scope while still only registering it on `/app/`. This is the correct mechanism — do NOT move the SW file to root to work around this.
- On SW removal: include an explicit unregister step (a tiny `unregister.js` script that calls `navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()))`) at `/app/` if the experiment is retired. Without this, cached SWs outlive the deployment.

**Warning signs:**
- `/_site/_pages/index.html` starts being intercepted by the DevTools service worker panel after adding the SW.
- Network requests from `/` show "(ServiceWorker)" origin in DevTools.
- The main map 404s on data after a build that changes hashed asset filenames.

**Phase to address:**
SW scaffolding phase (first phase that introduces the service worker registration). Scope decision must be made and verified before any caching logic is added.

---

### Pitfall 2: The Eleventy+Vite Build Produces a New Hashed Asset Manifest Every Build — The SW Precache Manifest Must Reflect It Exactly

**What goes wrong:**
Vite hashes every JS/CSS bundle: `index-a3f2b1c.js`, `sqlite-worker-d8e9f0a.js`, etc. The service worker's precache manifest must list the exact current hashes. If the SW precache manifest is built from the Eleventy output in a prior step and the Vite build runs afterward (the normal Eleventy+Vite plugin pipeline), the manifest baked into `sw.js` will be stale — it references last build's hashes. The SW installs, precaches non-existent URLs, and the install event fails silently or partially.

**Why it happens:**
The `@11ty/eleventy-plugin-vite` rename-and-build mechanism runs Eleventy first (populating `.11ty-vite/`), then runs Vite against that temp directory. A precache manifest injection step that runs before Vite finishes will capture zero or stale hashes. The `vite-plugin-pwa` plugin solves this by running as a Vite plugin (after Vite knows the final hashes), but only if it is correctly wired into `vite.config.ts` — which in this project is NOT the config Eleventy's plugin-vite uses for the dev server (see the extensive comments in `eleventy.config.js`).

**How to avoid:**
- Use `vite-plugin-pwa` (or `workbox-build`'s `injectManifest` mode) wired as a Vite plugin in `eleventy.config.js` under `viteOptions.plugins`, not in `vite.config.ts`, so it runs in the Eleventy-driven Vite invocation where it can see the final hashed outputs.
- Verify the precache manifest in the built `_site/app/sw.js` (after production build) references actual filenames present in `_site/assets/`. Add this as a build gate: `grep -o 'assets/[a-z-]*-[a-f0-9]*\.[a-z]*' _site/app/sw.js | while read f; do test -f "_site/$f" || echo "MISSING: $f"; done`.
- Set `maximumFileSizeToCacheInBytes` to at least `30_000_000` (30 MB) in Workbox config — the default is 2 MB, and `occurrences.db` at ~23 MB will be silently excluded from the precache manifest, breaking offline with no build-time error in older Workbox versions (newer versions throw, but only if you notice).

**Warning signs:**
- `_site/app/sw.js` contains `revision: null` for all entries (means no hash was injected — Vite hashes were not available).
- DevTools Application → Cache Storage shows 404s during SW install.
- SW install event fails; DevTools shows `FetchEvent#respondWith` errors.

**Phase to address:**
SW scaffolding phase — the manifest injection pipeline must be verified with a production build before any offline testing begins.

---

### Pitfall 3: First Visit Does Not Get SW Benefits — Offline Does Not Work After One Visit

**What goes wrong:**
On first page load, the SW registration starts but the SW is not yet controlling the page — it is in the "installing" state. The SQLite DB fetch, GeoJSON fetches, and all asset fetches happen outside SW control. If the user immediately goes offline after the first visit without waiting for the SW to fully activate and cache, nothing is available offline. This is especially confusing because DevTools shows "Service Worker: Activated" but the cache may not yet contain `occurrences.db` (a ~23 MB fetch).

**Why it happens:**
SW lifecycle: `register → install (precache) → waiting → activate → claim`. Even with `skipWaiting` + `clientsClaim`, the install phase must complete before the SW controls the current page's fetches. The install phase is blocked by precaching all listed assets including the 23 MB DB. On slow connections this can take tens of seconds. If the browser is closed mid-install, the SW is left in a broken partial state.

**How to avoid:**
- Show an explicit "Caching for offline use..." progress indicator during the SW install phase, driven by the SW's install event messaging back to the page via `postMessage`. Do not tell users the app is ready offline until `navigator.serviceWorker.controller` is non-null AND the install phase has completed.
- Consider NOT including `occurrences.db` in the precache manifest (which runs at install time). Instead use a lazy "background sync" strategy: after activation, trigger a runtime cache priming fetch from the SW's `activate` event. This decouples "app can render" from "DB is cached offline" — but the user still needs explicit feedback.
- Gate the "Available offline" badge on a positive cache check: `caches.match('/data/occurrences.db')` resolved to a non-null response.

**Warning signs:**
- Users report "it says offline capable but it didn't work the first time I tried."
- The SW install event takes >30 seconds on a mobile connection.
- `navigator.serviceWorker.controller` is null after the first page load completes.

**Phase to address:**
SW caching phase (when `occurrences.db` is added to the cache strategy). The UX feedback must ship in the same phase.

---

### Pitfall 4: iOS Safari Evicts the 23 MB Cached DB Under Storage Pressure or After Inactivity

**What goes wrong:**
Safari/WebKit evicts origin data as a whole unit ("origin eviction") under two conditions: (1) disk storage pressure, and (2) site inactivity — the site is not visited for a period calibrated to available disk space (the old "7 days" rule from ITP; the exact threshold is not published and is hardware-dependent). When eviction happens, the entire Cache Storage for the origin is deleted, including `occurrences.db`. The next offline cold start returns the app shell from cache but then fails to load the DB — the user sees the map render with no occurrence data and no explanation.

Key facts from WebKit's official storage policy post (Safari 17.0+):
- Standalone home screen apps share the same quota as Safari browser (no bonus quota for installed PWAs, contrary to older expectations).
- `navigator.storage.persist()` is supported since Safari 17 but returns `true` only if the site has been added to the home screen and notification permission has been granted — a high bar. For non-notification PWAs it almost certainly returns `false`.
- iOS 16 and below: `navigator.storage.persist()` returns `false` always. No persistent storage API available.
- Clearing Safari browsing history deletes PWA storage on iOS (all versions).

**Why it happens:**
Field collectors may go weeks between expeditions. A volunteer who used the app in May, then returns in July, will have lost the cache. Worse, if they are already in the field when they discover this, there is no recovery path (no wifi to re-prime).

**How to avoid:**
- Call `navigator.storage.persist()` at first launch after install; log but do not rely on its result on iOS.
- Display the cache freshness date prominently ("occurrences cached as of May 3"). This sets expectations.
- Implement a "re-prime" prompt: if the app detects it has an active network connection on load, silently re-check whether `occurrences.db` is in cache and re-fetch if missing or stale. Do not wait for the user to notice the absence.
- Document in the dogfood guide that collectors must open the app at least once in the days before a field trip to validate the cache.
- Consider a lightweight "db heartbeat" entry in a separate small cache (e.g., a 1-byte sentinel file written when the DB was last confirmed present) with a different eviction behavior — this allows detecting eviction early.

**Warning signs:**
- `caches.match(occurrencesDbUrl)` returns `undefined` in the SW despite prior successful prime.
- The map renders its basemap (Mapbox GL) but shows zero occurrence dots after a long gap.
- `navigator.storage.estimate()` shows `usage < 1MB` for the origin when it should be ~30 MB.

**Phase to address:**
Large binary caching phase. The re-prime-on-reconnect logic and the staleness/cache-missing UX must ship together.

---

### Pitfall 5: Mapbox Tile Runtime-Caching is TOS-Sensitive and Has Active Technical Gotchas

**What goes wrong — TOS risk:**
Mapbox's Terms of Service and Product Terms (April 2025 version) do not document offline tile caching for web apps using GL JS — the documented offline feature is SDK-only (iOS/Android). The GL JS library itself has an internal tile cache (bounded, in-memory), but there is no official "cache tiles to Cache Storage via SW" feature for GL JS. Runtime-caching Mapbox tiles via a service worker is at best an undocumented gray area, at worst a TOS violation depending on how "store" and "redistribute" are interpreted.

The team has accepted this risk for self-test use under the explicit note: "TOS-sensitive, self-test only; revisit terms before public rollout." Before any public flip of the dogfood route to general users, the following must be verified:
1. Does the Mapbox subscription plan allow offline use? (Web GL JS plans are MAU-based; offline tile packs are a separate Android/iOS feature.)
2. Does the active token have restrictions that would cause cached tile responses to return 403 on replay?
3. Has Mapbox support confirmed the use case in writing?

**What goes wrong — technical:**
Mapbox tile URLs include the access token as a query parameter (`?access_token=pk.eyJ1...`). Service worker cache keys are URL strings by default, including query params. This causes two problems:
1. Cache keys include the token — a token rotation (even a minor credential refresh) invalidates the entire tile cache. All cached tiles return misses, the user is offline, and they get a blank map.
2. Mapbox's own internal tile request cache strips the token for lookup (confirmed in issue #8859 discussion and the GL JS source), but a Workbox `registerRoute` for `api.mapbox.com` will use the full URL including token as the cache key. A stale 403 response (from a prior token expiry) can itself be cached and served offline, producing a permanent blank map.

**How to avoid:**
- In the Workbox route handler for Mapbox tiles, use a custom cache key function that strips `access_token` from the URL before lookup and storage: `new URL(request.url); url.searchParams.delete('access_token'); return url.toString()`.
- Set a TTL on the tile runtime cache (e.g., `maxAgeSeconds: 60 * 60 * 24 * 7` — 7 days) and a max entry count (e.g., `maxEntries: 500`) to prevent unbounded growth and stale 403s.
- Never cache non-2xx tile responses. Use Workbox's `cacheableResponse` plugin with `{ statuses: [200] }` on the tile route.
- For the dogfood phase: scope tile caching behind a feature flag (`localStorage.getItem('beta_tile_cache') === '1'`) so it can be toggled without a deployment.
- Add a comment in the SW source that flags this as "self-test only — see PROJECT.md v5.0 TOS note" to prevent the flag from being quietly enabled in a future PR without the TOS review.

**Warning signs:**
- Mapbox tiles in DevTools show `(from ServiceWorker)` after going offline — this is expected/intended, but verify it only happens on the `/app` route.
- Any tile returns a cached 403 — this means a failed response was stored. Clear the tile cache immediately.
- `caches.open('mapbox-tiles')` size exceeds 200 MB — unbounded growth; the eviction limit was not set.

**Phase to address:**
Tile caching phase. TOS review must be a hard gate before any public-facing deployment of tile caching.

---

### Pitfall 6: Large Binary Caching Fails Silently Mid-Download — Partial `occurrences.db` in Cache

**What goes wrong:**
`cache.put(request, response)` for a 23 MB response can fail mid-stream if the device runs low on storage during the write. The Cache Storage API throws `QuotaExceededError` at the point of the `put()` call. If the error is not caught, the SW install event rejects and the SW enters a broken state. Worse, if the error IS caught but the partial response was already partially written, the cache entry may exist but be corrupt — `caches.match()` returns a response but `response.arrayBuffer()` fails or returns truncated data.

**Why it happens:**
iOS Safari quota for non-persistent origins is allocated on demand. On a device near capacity, a 23 MB single-origin write may be partially allowed before quota is exceeded. The Cache Storage spec does not guarantee atomicity for `put()` on large responses.

**How to avoid:**
- Wrap the `occurrences.db` cache write in a try/catch that, on QuotaExceededError, (a) deletes any partial entry via `cache.delete(url)`, (b) posts a message to the client indicating "insufficient storage — cannot cache offline."
- After a successful `put()`, verify integrity by fetching back the cached entry and checking `response.headers.get('content-length')` against the expected size. If the project embeds a SHA-256 of the DB in `manifest.json`, verify it.
- Use a two-key approach: write a small sentinel (`occurrences.db.cached`) only after the main file is verified. Check for the sentinel, not the file, to determine cache readiness. This makes partial-write detection explicit.
- Add `Content-Length` to the CloudFront response for `occurrences.db` so SW can validate size.

**Warning signs:**
- Cache Storage shows `occurrences.db` present but the map shows no occurrences.
- The SW install event takes its expected time but tablesReady never fires.
- `navigator.storage.estimate()` shows `quota` very close to `usage` on the device.

**Phase to address:**
Large binary caching phase, same phase as Pitfall 4.

---

### Pitfall 7: skipWaiting + clientsClaim Causes Version Skew Between App Code and `occurrences.db`

**What goes wrong:**
`skipWaiting()` + `clients.claim()` is the standard "auto-update" pattern: the new SW activates immediately without waiting for all tabs to close. With a complex app that has lazy-loaded modules, the new SW may serve new hashed JS chunks that the old page shell cannot parse, causing runtime errors. Specifically in this stack: the `sqlite-worker.ts` is a separate Workbox entry with its own hash. If the SW updates and serves a new `sqlite-worker-NEWHASH.js` but the in-memory page still holds a reference to the old `sqlite-worker.ts` URL (in `new Worker(new URL('./sqlite-worker.ts', import.meta.url))`), the Worker creation will fail with a 404 or serve a cached old version of the worker against a new DB schema.

Additionally: the nightly pipeline produces a new `occurrences.db` every night with a new hash (manifested in `manifest.json`). The SW app-shell cache and the data cache can diverge: the SW may serve an old `index-OLDHASH.js` that expects 33 columns from the DB, against a newly-fetched `occurrences.db` that has 37 columns (or vice versa). This "code-data version skew" is a latent risk even without `skipWaiting`.

**How to avoid:**
- Do NOT use `skipWaiting()` + `clients.claim()` for the SQLite app. Instead, use the "prompt to reload" update pattern: when a new SW is waiting, show a banner: "A data update is available — tap to reload." This ensures the old page and old DB schema are always retired atomically.
- Alternatively (and simpler for a self-test dogfood): use `skipWaiting()` but set the SW to do a full cache wipe on activate, not incremental cache update. This forces a hard reload of all assets on any update.
- Store a `data_version` key in the SW precache manifest (derived from `manifest.json`'s `generated_at`). On SW activate, compare old and new `data_version`. If they differ, delete the `occurrences.db` cache entry — this forces a fresh DB fetch after app update.
- For the dogfood phase, an explicit "force update" button in the app that calls `caches.delete()` + `registration.update()` + `location.reload()` is a reliable escape hatch.

**Warning signs:**
- Console shows `TypeError: Failed to fetch` on `sqlite-worker-OLDHASH.js` after a deployment.
- `tablesReady` never resolves after app update.
- The occurrence count shown in the UI does not match the pipeline generation date visible in the freshness indicator.

**Phase to address:**
SW update lifecycle phase — must be decided before app cache + data cache strategies are finalized.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Register SW at `/` (global scope) | Simpler path, no SW-Allowed header needed | Contaminates main map route; hard to remove cleanly | Never — always scope to `/app/` |
| `skipWaiting` + `clientsClaim` | App updates silently | Code-data version skew; broken Worker URLs mid-session | Only if all assets + data are version-locked atomically |
| Cache ALL tiles (no TTL, no entry limit) | More tiles available offline | Unbounded disk growth; stale 403s; TOS exposure | Never — always set TTL + maxEntries |
| Ship tile caching without feature flag | One less code path | Cannot disable without a deployment if TOS issues arise | Never during dogfood |
| Skip `navigator.storage.persist()` call | Less code | No chance of preventing iOS eviction | Never — call it, even if result is usually false on iOS |
| Put `occurrences.db` in precache manifest | Simpler SW code | Blocks SW install for 30+ seconds; install fails on quota exceeded | Only if precache error handling + progress UI are present |
| Naive degree arithmetic for "near me" | Fast to implement | Up to 30% distance error at WA latitude (47°N) — see Pitfall 11 | Only for a coarse pre-filter, never as the display value |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Eleventy+Vite plugin | Running SW manifest injection in `vite.config.ts` instead of under `viteOptions.plugins` in `eleventy.config.js` | Wire `vite-plugin-pwa` into `eleventyConfig.addPlugin(EleventyVitePlugin, { viteOptions: { plugins: [...] } })` |
| wa-sqlite + SW | Trying to use OPFS (Origin Private File System) VFS — requires `SharedArrayBuffer` + COOP/COEP headers | Stay with `MemoryVFS` (current approach) fed by a `cache.match()` response; OPFS is out of scope for static-only hosting |
| Mapbox GeolocateControl | Forgetting that the control fires `geolocate` events even when trackUserLocation is false; binding the proximity query to every geolocate event causes redundant DB scans | Debounce the "occurrences near me" query; run it only on explicit user tap, not on every GPS update |
| CloudFront + SW | CloudFront serves `sw.js` with a long `Cache-Control: max-age` (matching other static assets) | SW script itself must be served with `Cache-Control: no-store` or `max-age=0`. The browser enforces a max 24h check interval for SW scripts, but serving it with a long max-age can delay updates. Set a separate CloudFront behavior for `*/sw.js` with `Cache-Control: no-cache, no-store`. |
| Manifest + SW version | `manifest.json` (data version) is fetched at runtime by the page but the SW may serve a stale cached `manifest.json` from the app-shell cache | Cache `manifest.json` with a `network-first` strategy, not `cache-first`. Data freshness depends on always getting the latest manifest. |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full-table haversine on every "near me" query | `tablesReady` already fired but UI freezes for 2-3 seconds when "near me" is toggled | Add a bounding-box pre-filter: `lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?` (±0.5°) before the haversine, exploiting SQLite's row scan with a cheap compare before the trig | At any table size; wa-sqlite WASM has higher per-row overhead than native SQLite |
| Tile cache growth without limits | Cache Storage grows to 500 MB+; iOS evicts the entire origin (including `occurrences.db`) | Set Workbox `maxEntries: 300, maxAgeSeconds: 86400 * 7` on the tile route | After ~200 map tiles are cached (can happen in one session of panning) |
| `watchPosition` left active when app is backgrounded | Battery drain on iOS; GPS continues running; users complain of heat / battery death | Use `clearWatch()` on page `visibilitychange` → hidden; restore on visible | Always — iOS does not throttle `watchPosition` in standalone mode |
| Re-fetching `occurrences.db` every SW activation | 23 MB network hit on every app update, even minor code changes | Only re-fetch DB if `manifest.json`'s `generated_at` is newer than the cached DB's stored timestamp | Every deployment if the re-fetch is unconditional |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Caching authenticated API responses in tile route | A cached 403 or expired token response served to next user session causes permanent blank map; SW-cached credentials could leak between sessions if origin is shared | Use `{ statuses: [200] }` cacheableResponse plugin; never cache non-2xx responses; strip `access_token` from cache key |
| Serving `sw.js` with long CloudFront TTL | SW update is delayed up to 24h (browser max) or longer (CloudFront CDN TTL) if `Cache-Control: max-age=31536000` is inherited from the wildcard S3 policy | Add a dedicated CloudFront cache behavior: `Path: */sw.js`, `Cache-Control: no-cache, no-store` |
| `Service-Worker-Allowed: /` header on all responses | Overly broad; any SW placed anywhere could claim root scope | Set `Service-Worker-Allowed: /` only on the `/app/sw.js` response, not as a global header |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visible "offline ready" status | User drives to field, opens app, gets spinner + no data — no way to know it was never cached | Show a persistent "Last cached: [date]" badge in the app header; show "Not cached — open on wifi to prime" if DB is absent |
| Geolocation permission dialog fires before user understands why | User dismisses it; permission is permanently denied on iOS (must go to Settings to re-enable) | Show an explanation modal first: "BeeAtlas wants to show your location to help find nearby occurrences. Tap Allow when prompted." |
| iOS geolocation alert targets the Safari app, not the standalone PWA | The permission dialog appears to do nothing in standalone mode on some iOS versions | Test specifically in standalone mode; if the alert fails, fall back to `display: browser` or show a manual "open in Safari to grant location" message |
| Blank tile areas when offline (for tiles not yet cached) | User pans to an area never visited online; tiles are blank; no explanation | Add an overlay: "Map tiles for this area weren't cached. Navigate back to a previously visited area." Use a `fetchfailed` SW event or the GL JS `data` event with `source.type === 'tile'` to detect blank-tile conditions |
| "Occurrences near me" returns 0 results with no explanation | User is in WA but gets 0 results; the distance threshold is too small or the permission was denied | Show the distance radius on the map as a circle; show why 0 results (permission denied vs. nothing within radius vs. filter active) |

---

## "Looks Done But Isn't" Checklist

- [ ] **Offline DB caching:** SW installs and caches `occurrences.db` — verify the cache entry exists AND has the correct byte size after a production build + cold prime (not just in dev mode).
- [ ] **SW scope isolation:** Main route (`/`) is NOT controlled by any SW — verify via DevTools Application → Service Workers with the main route URL loaded.
- [ ] **iOS standalone test:** Geolocation permission prompt fires correctly when app is opened from home screen icon (not Safari tab) on a real iOS device.
- [ ] **Tile cache TOS flag:** The `beta_tile_cache` feature flag exists and defaults to `false`; it is not set to `true` in any committed code path reachable from the public route.
- [ ] **Version skew gate:** After a nightly pipeline run that changes `manifest.json`, the app shell serves the new `occurrences.db`, not the old one — verify by checking `generated_at` in the freshness indicator against the pipeline's actual run time.
- [ ] **SW unregister path:** A documented procedure (or automated script) exists to unregister the SW and clear caches at `/app/` — needed if the experiment is retired.
- [ ] **`occurrences.db` cache integrity:** After prime on a throttled (3G) connection, verify the cached DB returns the correct row count (e.g., `SELECT COUNT(*) FROM occurrences` in the sw-worker).
- [ ] **CloudFront `sw.js` no-cache behavior:** Verify `curl -I https://beeatlas.net/app/sw.js` returns `Cache-Control: no-cache` (not `max-age=31536000`).

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| SW scope bleed onto main `/` | MEDIUM | Deploy a new SW at `/app/sw.js` scope that unregisters any root-scoped SW via `self.registration.unregister()` in its activate event; then remove old root SW from build |
| Partial/corrupt `occurrences.db` in cache | LOW | Force SW update cycle: bump SW version string, activate clears cache, re-prime on next load |
| Stale cached 403 Mapbox tile | LOW | Clear tile cache: `caches.delete('mapbox-tiles')` from the app + SW update |
| iOS evicted `occurrences.db` | LOW (for individual user) | Reconnect to wifi and open app — re-prime is automatic if re-prime-on-reconnect is implemented |
| Code-data version skew (app sees wrong column schema) | MEDIUM | "Force update" button triggers `caches.clear()` + `location.reload()` — user must be on wifi |
| Mapbox TOS enforcement action | HIGH | Remove tile caching feature flag entirely; deploy without `beta_tile_cache`; audit what was cached and for how many users |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| SW scope bleeds onto `/` (Pitfall 1) | SW scaffolding — scope decision | DevTools confirms no SW on `/`; `Service-Worker-Allowed` header confirmed on `/app/sw.js` |
| Hashed asset precache manifest stale (Pitfall 2) | SW scaffolding — build pipeline integration | Post-build script checks every precache URL exists in `_site/` |
| First visit offline cold-start (Pitfall 3) | SW caching + UX — progress indicator | Manual test: prime on wifi, kill wifi, force-reload; verify DB loads |
| iOS eviction of `occurrences.db` (Pitfall 4) | Large binary caching + re-prime on reconnect | `navigator.storage.persist()` call present; re-prime logic present; UX shows cache date |
| Mapbox tile caching TOS + token 403 (Pitfall 5) | Tile caching phase — behind feature flag | TOS review is explicit phase gate; feature flag defaults to false; token-strip cache key in SW |
| Partial DB write / QuotaExceededError (Pitfall 6) | Large binary caching | Error handling test: simulate quota exceeded; verify sentinel key absent; UI shows error |
| skipWaiting version skew (Pitfall 7) | SW update lifecycle decision — prompt-to-reload | Test: deploy new build while `/app` is open; verify old session does not break |
| Unbounded tile cache growth (Performance Traps) | Tile caching phase | `navigator.storage.estimate()` checked in integration test |
| Geolocation permission on iOS standalone (UX Pitfalls) | Geolocation + GeolocateControl phase | Manual test on real iOS device in home screen standalone mode |
| Proximity query performance (Performance Traps) | "Occurrences near me" phase | Benchmark: `near me` query must return in <200ms on full ~92k occurrence table |

---

## Sources

- WebKit official storage policy: https://webkit.org/blog/14403/updates-to-storage-policy/
- Mapbox GL JS issue #8859 (SW + 403 tile caching): https://github.com/mapbox/mapbox-gl-js/issues/8859
- Mapbox GL JS issue #12965 (cache keys too large): https://github.com/mapbox/mapbox-gl-js/issues/12965
- Mapbox API caching docs: https://docs.mapbox.com/help/troubleshooting/api-caching/
- Mapbox offline maps (mobile only): https://docs.mapbox.com/help/dive-deeper/mobile-offline/
- Mapbox Product Terms (April 2025): https://cdn.prod.website-files.com/609ed46055e27a02ffc0749b/67fd8d3325f4dfaf2f5145ef_Mapbox%20Product%20Terms%20(2025-04-14).pdf
- Vite PWA plugin FAQ: https://vite-pwa-org.netlify.app/guide/faq
- Vite PWA precache guide: https://vite-pwa-org.netlify.app/guide/service-worker-precache
- web.dev SW lifecycle: https://web.dev/articles/service-worker-lifecycle
- Chrome for Developers — Handling SW updates with Workbox: https://developer.chrome.com/docs/workbox/handling-service-worker-updates
- iOS Safari storage limitations guide: https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide
- iOS geolocation in standalone mode: https://blog.poespas.me/posts/2025/03/01/handling-geolocation-for-pwa-safari-challenges/
- Apple Developer Forums — location alert in standalone PWA: https://developer.apple.com/forums/thread/694999
- MDN ServiceWorkerContainer.register() — scope: https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register
- `navigator.storage.persist()` on iOS: https://medium.com/@firt/there-is-no-persistent-storage-api-on-ios-and-you-dont-have-control-of-that-unfortunately-because-361adb5e9dc0
- Haversine SQL — bounding box optimization: https://www.plumislandmedia.net/mysql/haversine-mysql-nearest-loc/
- wa-sqlite discussion — OPFS/MemoryVFS: https://github.com/rhashimoto/wa-sqlite/discussions/221

---
*Pitfalls research for: v5.0 Offline Field Mode (Eleventy+Vite+Lit+Mapbox GL JS v3+wa-sqlite static PWA)*
*Researched: 2026-06-10*
