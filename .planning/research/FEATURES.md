# Feature Research: v5.0 Offline Field Mode

**Domain:** Offline-capable installable PWA map — field use by volunteer bee collectors
**Researched:** 2026-06-10
**Confidence:** HIGH (PWA/SW mechanics — official MDN + web.dev docs; Mapbox GeolocateControl API
confirmed from official docs; "near me" UX derived from iNat/AllTrails reference apps + spatial-filter
pattern literature; Mapbox TOS constraint confirmed from official terms page)

---

## Scope Boundary

This research covers only the NEW features in v5.0. Existing features (Mapbox map, occurrence
filters, table, taxon/date/region/selection-rectangle filter system, SQLite WASM data layer,
`_filterQueryGeneration` race guard, `bee-pane` unified pane, `stale-guard.ts`) are pre-built
and treated as givens. The question is: what does each new feature look like to users, and what
does the system need to do?

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any "offline field app" must have. Missing any of these = app feels broken or
untrustworthy to dogfood testers.

| Feature | Why Expected | Complexity | Dependencies on Existing Features |
|---------|--------------|------------|-----------------------------------|
| **PWA install prompt + icon** | Any app claiming to be installable must actually appear on the home screen with a recognizable icon | LOW | None — requires `manifest.webmanifest` + 192 px and 512 px icons only |
| **Offline cold-start** | A "field app" that errors on first offline launch is useless; this is the entire value proposition | MEDIUM | SW must precache: app shell JS/CSS, `occurrences.db` (~23 MB), all GeoJSON overlays. Existing data-load path (`sqlite.ts`, `stale-guard.ts`) must succeed from cache. |
| **"Ready for offline" indicator** | Users prime the app at home; they must know before leaving whether the app is actually cached and safe to take offline | MEDIUM | Requires SW lifecycle events (installing → waiting → activated); connects to `navigator.storage.estimate()` for size feedback |
| **Online/offline status indication** | Users need to know their current connectivity state so they understand why tiles may be gray | LOW | `navigator.onLine` + `online`/`offline` events; independent of SW |
| **"Data as of \<date\>" freshness label** | Volunteers need to know how stale the occurrence data is before heading into the field | LOW | Pipeline already writes a generation date to the DB; front-end needs to read and surface it |
| **Graceful basemap degradation** | When uncached Mapbox tiles are requested offline, the map must not crash — gray tile areas with dots still visible is acceptable | MEDIUM | Mapbox GL JS already renders blank tiles for cache misses; SW must not intercept Mapbox tile requests in a way that errors the map |
| **Blue dot + accuracy ring (GeolocateControl)** | Any map used for "am I near occurrences" must show where the user is; GPS works offline with no signal | LOW | Mapbox `GeolocateControl`; HTTPS is already required for CloudFront — prerequisite met |
| **Recenter button** | Standard map control: after panning away, one tap returns to user position | LOW | Built into `GeolocateControl` — same button re-centers when tapped in passive state; no extra code |
| **"Occurrences near me" filter** | The core field use case: what bees have been collected within ~10 km of where I am standing? | MEDIUM | Requires user position (GeolocateControl) + Haversine distance filter on existing SQLite query layer; composes with existing filters |
| **Unlisted `/app/` route** | Private dogfood without changing the main map; team needs a URL to test | MEDIUM | SW scope isolation: SW at `/app/sw.js` with scope `/app/`; main `index.html` at `/` is untouched |
| **Data refresh prompt when back online** | A prompt to pull the latest DB when connectivity returns and a newer snapshot exists | MEDIUM | Requires generation-date comparison between cached DB and CDN; user-initiated re-prime of the large SQLite file |

### Differentiators (Worth Having for v1 Dogfood)

Features that make this genuinely useful beyond baseline offline, without adding significant scope.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Cache priming progress indicator** | 23 MB is a noticeable download; a visible indicator prevents users abandoning the prime thinking it has stalled | MEDIUM | SW `install` fires per-URL; can send progress counts via `postMessage` to the page. Workbox precache does not expose per-file progress natively — requires a custom SW or explicit fetch-and-cache loop with progress messaging. An indeterminate spinner is acceptable for v1 if determinate progress is too complex. |
| **Cache size display** | "8.4 MB cached" tells the user the priming is real and builds confidence before heading to the field | LOW | `navigator.storage.estimate()` returns `{usage, quota}`; display in the offline-ready status area |
| **Basemap limitation label** | Gray tile areas are confusing if unlabeled; a brief explanation ("basemap tiles only cached for areas you've browsed online") prevents bug reports | LOW | Static text in the offline status indicator; no detection logic needed |
| **Persistent location tracking while using filters** | User's dot stays on map while changing taxon/date/region filters | LOW | `GeolocateControl` state is independent of filter state; no extra work if `trackUserLocation: true` |

### Anti-Features (Things to Deliberately NOT Build in v1)

| Anti-Feature | Why It Seems Appealing | Why Avoid for v1 | What to Do Instead |
|--------------|----------------------|------------------|--------------------|
| **Bundled offline tile set (MBTiles/PMTiles for WA basemap)** | "Full offline" sounds better | Mapbox TOS explicitly prohibits redistributing cached tiles; a useful WA tile set would be hundreds of MB; occurrence dots render over blank tiles anyway — functionality is unimpaired | Accept gray tiles for uncached areas; label this behavior honestly in the status indicator |
| **Adjustable "near me" radius (slider)** | More control seems better | Adds UI complexity, another filter control, URL state encoding complexity, and the "what is the right range?" debate — none of which helps dogfood testers; iNaturalist uses a fixed default with success | Hard-code 10 km in v1 (appropriate for sparse rural WA); make it configurable only if collectors ask |
| **Background location updates when app is backgrounded** | Feels more native | Background geolocation requires additional permissions, battery drain, and platform differences; not needed for the use case (glance at map while collecting) | Use `trackUserLocation: true` (foreground only); control reactivates on next foreground open |
| **Push notifications for new data** | Useful for freshness awareness | Requires push subscription infrastructure, backend message queue, notification permissions — none of which exists; adds scope far beyond offline/location goals | Poll on reconnect (or manual tap) is sufficient for nightly data updates |
| **Offline species/places/feeds pages** | "Full offline app" | These are Eleventy-generated static HTML; caching them adds significant cache size and SW complexity for pages collectors do not use in the field | Scope SW to `/app/` route + `/data/` assets only |
| **Install promotion on the main `/` page** | More installs | The main map page must stay untouched until v5.0 is dogfood-proven; adding install prompts before validation violates the unlisted-route plan | Install prompt lives only within the `/app/` route |
| **Offline "save area" flow (explicit tile pre-download)** | Mapbox mobile SDKs have this | Mapbox GL JS has no official offline region web API; implementing it requires intercepting tile requests, storing in Cache API, and navigating TOS risk | Document as a post-dogfood decision item, contingent on terms review |
| **Silent auto-refresh of the DB on reconnect** | Seamless freshness | A 23 MB download on a metered mobile connection without user consent is hostile; the user may be on a limited data plan in a rural area | Always prompt: "New data available — tap to download" |

---

## Detailed Behavior Specifications

### 1. PWA Install Flow and Offline Cold-Start UX

**Install prompt on Android/Chrome (automatic prompt support):**
1. Browser fires `beforeinstallprompt` when: valid `manifest.webmanifest` is linked, SW is registered,
   site is HTTPS, user has engaged with the `/app/` page for ~30 seconds.
2. App captures and defers the event (`e.preventDefault()`). A subtle "Install app" button or banner
   appears within the `/app/` UI — not a blocking modal, not on first page load before any engagement.
3. On tap, `deferredPrompt.prompt()` shows the native browser install sheet with app name and icon.
4. On accept, the app icon appears on the home screen. Subsequent launches open in `standalone` display
   mode (no browser address bar or navigation chrome).

**iOS/Safari (manual only):**
- `beforeinstallprompt` does NOT fire on iOS Safari. Chrome/Edge on iOS also cannot install PWAs.
- Instead: display static instructional text "Open in Safari, then tap Share > Add to Home Screen" with
  a visible Safari share icon symbol. Show this only when `window.matchMedia('(display-mode: browser)').matches`
  is true (i.e., not yet running as an installed app).
- This instruction should be inline in the `/app/` page UI, not a modal or overlay.

**Splash screen:**
- Android: auto-generated from `manifest.webmanifest` `name`, `background_color`, `theme_color`, and
  the 512 px icon. No extra work needed.
- iOS: requires `<link rel="apple-touch-startup-image">` tags for each device size, or the app opens to
  a white screen. A white flash is acceptable for v1 dogfood. Proper splash images are a polish item.
- A branded background color in the manifest (`background_color`) reduces the perceived white-flash gap
  even without explicit splash images.

**First offline cold-start:**
- SW must have successfully precached all required assets during the prior online prime. Required:
  all app shell JS/CSS entry points, `occurrences.db` (~23 MB), `counties.geojson`,
  `ecoregions.geojson`, all static assets referenced by the app-shell HTML.
- On cold start with no network: SW intercepts all same-origin fetches and serves from Cache API.
  The existing SQLite data-load path reads `occurrences.db` from cache. Map renders occurrence dots
  and GeoJSON overlays. Uncached Mapbox tiles show as gray/blank squares — expected behavior.
- If the prime was incomplete (user went offline mid-download): app shows a clear error state rather
  than a partially-working UI. Error text: "Offline data is not fully downloaded — connect to WiFi
  and open this page to finish setup." This prevents a confusing experience where some features work
  and others do not.

### 2. Offline-Readiness UX (Priming Flow)

**Prime trigger:** First visit to `/app/` while online (or any visit after a data update).

**Progress states visible to the user:**

| State | What the user sees | When |
|-------|-------------------|------|
| Priming | "Setting up for offline use… downloading N MB" — progress indicator (determinate if file count is known, indeterminate spinner if not) | SW install event, precache in progress |
| Ready | Green/checkmark badge: "Ready to use offline. Data as of \<date\>. Basemap tiles cached for visited areas only." | SW activated, all files cached |
| Size confirmation | "X MB stored on this device" (below ready state) | Shown once after priming completes, from `navigator.storage.estimate()` |
| Offline | Persistent banner: "Offline — map and occurrence data available from cache" | `navigator.onLine === false` |
| Update available | Toast: "New data available (\<new date\>) — tap to download" | Online, newer generation date detected on CDN |

**Progress bar implementation note:** Workbox precaching does not expose per-file progress natively
(confirmed: GitHub Issue #2498 for workbox). Custom approach: SW sends `postMessage({type: 'CACHE_PROGRESS', done: N, total: M})` during its install event as each file is fetched; the page listens and renders N/M. File count is known ahead of time from the precache manifest. An indeterminate spinner is an acceptable v1 fallback if custom SW messaging adds too much scope.

### 3. Online/Offline State Indication and Basemap Degradation

**Connectivity banner:**
- `navigator.onLine` polled on load; `online` and `offline` window events listened continuously.
- Online: no banner (or a subtle "Online" state in the status area, not intrusive).
- Offline: a persistent, low-prominence banner or status chip: "Offline — cached data". Not a blocking
  overlay; the map should still be fully usable.

**Basemap tile degradation:**
- What the user sees: gray squares in areas not previously browsed while online. Occurrence dots (Mapbox
  source/layer features, not raster tiles) render correctly over gray tiles. County and ecoregion GeoJSON
  overlays render correctly (precached by SW).
- Net result: functionally complete for the use case (finding occurrence locations), but visually
  degraded in unpanned areas.
- The app should label this behavior: "Basemap tiles are only cached for areas you've browsed while
  online" — displayed in the offline status area, not per-tile.

**Tile caching policy (passive, not SW-intercepted):**
- Mapbox GL JS tiles are served from Mapbox CDN. The browser's own HTTP disk cache (12-hour TTL per
  CDN headers) passively caches tiles viewed while online. This is not under SW control.
- The SW must NOT intercept Mapbox tile requests. Reasons: (1) Mapbox TOS prohibits redistributing
  cached tiles; (2) the browser disk cache already handles this naturally.
- SW fetch handler should only match same-origin requests: `/app/`, `/data/`, and static assets.
  All `api.mapbox.com` and `events.mapbox.com` requests pass through to the network (or browser cache).

### 4. Data Freshness Indicator

**"Data as of \<date\>" semantics:**
- The generation date is the pipeline run date — the date the nightly pipeline produced the current
  `occurrences.db`. This is not the user's load time, not the CDN cache time.
- Display format: "Data as of June 9, 2026" (human-readable date, not ISO, not relative). Always
  visible in the status area, not buried in a settings panel.
- The date does not change just because the user refreshes the page. It changes only when a newer DB
  is fetched.

**Reconnect and refresh flow:**
1. On `online` event: fetch a lightweight version/manifest JSON from CDN (e.g., `/data/manifest.json`
   or an ETag comparison on `occurrences.db`). This is a fast network-first check.
2. Compare `generation_date` in the fetched manifest to the cached manifest value.
3. If newer: show a non-blocking toast: "New data available (June 10, 2026) — tap to download".
4. User taps: SW initiates a re-prime of `occurrences.db` in the background. Progress indication while
   downloading. On completion: "Data updated — reload to apply changes."
5. If same generation date: suppress further checks for the current session.
6. **No auto-refresh without user consent.** A 23 MB download on a metered rural connection is
   hostile. The user must explicitly tap.

### 5. Current Location: GeolocateControl Behaviors

**Recommended configuration:**
```javascript
new mapboxgl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },   // GPS over cell/wifi triangulation
  trackUserLocation: true,                          // toggle mode with active/passive/recenter
  showAccuracyCircle: true,                         // 95% confidence halo (default)
  fitBoundsOptions: { maxZoom: 15 }                // don't over-zoom on high-accuracy fix
})
```

**Three tracking states (user-driven, not programmable):**

| State | What user sees | How entered |
|-------|---------------|-------------|
| Active | Blue dot at center; map camera follows the user's position | Button tapped; initial state on activation |
| Passive | Blue dot updates position; map camera stays put | User pans or zooms the map while active |
| Recenter | — (transition) | Tapping the button while passive → returns to Active |

**Offline behavior:** GPS (`enableHighAccuracy: true`) uses satellite signals — no network required.
The `GeolocateControl` button functions normally offline. Cell/WiFi-based positioning (low accuracy)
requires a network signal, but GPS does not. For field use in rural WA, GPS is the expected modality.

**Permission prompt:** The browser shows the native location permission dialog on the first tap of the
GeolocateControl button. The app cannot customize this dialog. If permission is denied:
- The button should show a disabled/error visual state (Mapbox handles this automatically).
- Show a brief tooltip or status line: "Location access denied — enable in browser settings to use
  this feature."
- The "Near me" chip should also disable and show the same explanation.

**What does NOT work offline:** Reverse geocoding (coordinate → place name). Not needed here — the
app displays a blue dot and occurrence proximity, not "You are near Wenas Creek."

### 6. "Occurrences Near Me" Interaction

**Interaction model:**

1. A chip or button in the filter area: "Near me" (similar to existing taxon/date/region chips).
2. On first tap:
   - If GeolocateControl not active: activate it (request permission, await position fix).
   - Show "Waiting for location…" state on the chip.
3. On position fix received:
   - Map pans/zooms to user's position (GeolocateControl default behavior).
   - Apply spatial distance filter: show only occurrences within 10 km of user position.
   - Filter is computed client-side via Haversine formula against `lat`/`lon` columns in the SQLite DB.
   - The chip label becomes "Within 10 km" (or "Near me ✓").
4. Distance filter AND-combines with existing taxon/date/region filters using the same query generation
   that already exists in `filter.ts`. The SQLite `WHERE` clause gains an additional distance predicate.
5. The existing `_filterQueryGeneration` race guard handles the async dependency: the near-me filter
   must not fire a query until a position is available, analogous to the `taxaReady` barrier in
   `_resolveLegacyTaxon`.

**Fixed radius for v1: 10 km.** Appropriate for sparse rural WA collecting sites. No slider, no
user-configurable range in v1.

**URL state encoding:** Encode as `?near=1` (boolean flag only). The actual coordinates are ephemeral
(they change with the user's position) and meaningless when a URL is shared. On restoring a URL with
`?near=1`: show the chip in a "needs location" state and activate GeolocateControl; do not execute
the distance query until a position is received.

**Composability:**
- AND semantics with all existing filters: "pollinators, June, King County, within 10 km of me."
- "Clear filters" clears the near-me chip along with all other filters.
- If location permission is denied: chip shows disabled. Existing filters still work normally.
- If user leaves the page and returns: near-me is cleared (ephemeral position); re-tap to re-activate.

**List/table integration:** The occurrence list and table (bee-pane) shows only within-radius
occurrences. Optionally, a distance column ("0.3 km") in the table view is a differentiator — defer
to post-dogfood (not table stakes for v1 since the map view communicates proximity visually).

### 7. Unlisted Route Dogfood Pattern

**What "unlisted" means:**
- `/app/` is a real, deployed, publicly-accessible URL.
- "Unlisted" = no link from the main site (`/`), no `sitemap.xml` entry, no nav item.
- Not password-protected (static hosting has no auth layer). Security by obscurity, which is
  explicitly acceptable for a private team dogfood before public rollout.

**Service worker scope isolation:**
- SW file served at `/app/sw.js`. Registration: `navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' })`.
- A SW at scope `/app/` controls all URL paths starting with `/app/`. It does NOT control `index.html` at `/`.
- `manifest.webmanifest` served at `/app/manifest.webmanifest` with `start_url: '/app/'`.
- The main `index.html` at `/` has no `<link rel="manifest">` pointing to the app manifest and no SW
  registration — guaranteed isolation.

**Cross-scope fetch for `/data/` assets:**
- `occurrences.db`, `counties.geojson`, and `ecoregions.geojson` are served from `/data/` — outside
  the `/app/` scope path but same origin.
- A SW scoped to `/app/` can still intercept fetches it initiates for `/data/` resources, but only
  if the SW is the controller of the page making the fetch (i.e., the `/app/` page). This works.
- However, storing `/data/occurrences.db` in the cache from a `/app/`-scoped SW is valid — SW scope
  restricts what pages the SW controls, not what URLs it can cache.
- **Planning concern flagged:** Verify that precaching `/data/occurrences.db` from a `/app/`-scoped
  SW does not require a `Service-Worker-Allowed` header override. Best practice: set
  `Service-Worker-Allowed: /` on the SW response to allow caching of paths outside the scope.

**Graduation to default (post-dogfood):**
- When dogfood is validated: update `index.html` at `/` to link the manifest and register the SW
  at root scope (`scope: '/'`). Move the `/app/` shell logic to `index.html` (or redirect `/app/`
  to `/`).
- Do not graduate until: Mapbox tile-caching TOS implications reviewed, offline experience validated
  with at least one field outing, team sign-off.

---

## Feature Dependencies

```
[PWA Manifest + Icons]
    └──required by──> [Install Prompt]
    └──required by──> [Splash Screen on launch]
    └──required by──> [Standalone Launch Mode (no browser chrome)]

[Service Worker at /app/sw.js]
    └──required by──> [Offline Cold-Start]
    └──required by──> [Cache Priming + Progress]
    └──required by──> [Offline-Ready Badge]
    └──required by──> [Data Refresh on Reconnect]

[Offline Cold-Start]
    └──requires──> [Precached app shell JS/CSS]
    └──requires──> [Precached occurrences.db (~23 MB)]
    └──requires──> [Precached county + ecoregion GeoJSON]
    └──requires existing──> [sqlite.ts / SQLite WASM data layer]
    └──requires existing──> [stale-guard.ts (data load gating)]
    └──requires existing──> [GeoJSON overlay layers in bee-map.ts]

[GeolocateControl (blue dot + recenter)]
    └──required by──> [Occurrences Near Me]
    └──note──> [recenter is the same button in passive→active state; no additional code]

[Occurrences Near Me]
    └──requires──> [GeolocateControl (position fix)]
    └──requires existing──> [filter.ts SQLite query layer]
    └──requires existing──> [_filterQueryGeneration race guard in bee-atlas.ts]
    └──requires existing──> [bee-pane list/table display]
    └──enhances──> [existing taxon/date/region filters] (AND semantics)

[Online/Offline Status Indicator]
    └──enhances──> [Offline-Ready Badge] (shows "offline" state)
    └──enhances──> [Data Freshness Label] (shows reconnect state)

[Data Freshness Label]
    └──enhances──> [Data Refresh on Reconnect] (label updates after re-prime)

[Unlisted /app/ Route + SW Scope Isolation]
    └──contains all of the above features
    └──requires──> [SW scope isolation from main /]
    └──requires planning care──> [cross-scope caching of /data/ assets]
```

### Dependency Notes

- **Offline cold-start requires an atomic prime**: partial cache = broken cold-start. The ready
  indicator must only show "ready" once ALL required assets are cached, not after the first few.
- **Near Me + race guard**: `_filterQueryGeneration` already handles concurrent async filter changes;
  Near Me introduces an additional async dependency (GPS fix before query can fire). This must be
  modeled analogously to `taxaReady` — do not fire the distance query until position is confirmed.
- **SW scope vs `/data/` path**: the SW must be able to fetch and cache `/data/occurrences.db`
  despite being scoped to `/app/`. This requires verifying the `Service-Worker-Allowed` header
  situation. Flag for the architecture/implementation phase.
- **Mapbox tile requests must bypass SW**: any fetch handler that accidentally intercepts
  `api.mapbox.com` or `events.mapbox.com` requests risks violating TOS and breaking the map entirely
  offline (returning a stale cached 401 or style JSON). The SW fetch handler must explicitly allow
  these to fall through.

---

## MVP Definition (Private Dogfood v1)

### Must Have for Self-Test

- [ ] `manifest.webmanifest` at `/app/manifest.webmanifest` with `name`, `start_url: '/app/'`,
      `display: 'standalone'`, `background_color`, `theme_color`, 192 px and 512 px icons
- [ ] Service worker at `/app/sw.js` precaching app shell + `occurrences.db` + all GeoJSON
- [ ] Offline cold-start: occurrence dots and GeoJSON overlays render without any network
- [ ] "Ready for offline" indicator (text or badge; progress bar is a differentiator)
- [ ] "Data as of \<date\>" label — pipeline generation date displayed in status area
- [ ] Online/offline status banner (`navigator.onLine` + events)
- [ ] Install prompt (Android/Chrome) + iOS Safari "Add to Home Screen" instructions text
- [ ] `GeolocateControl` with `trackUserLocation: true`, `showAccuracyCircle: true`
- [ ] "Near me" chip: fixed 10 km radius, composes with existing filters via AND
- [ ] Unlisted `/app/` route: no link from main site; SW scoped to `/app/`; main `/` untouched
- [ ] Graceful basemap degradation with explanatory label

### Add After Initial Dogfood (P2)

- [ ] Determinate cache priming progress bar (N of M files)
- [ ] Cache size display via `navigator.storage.estimate()`
- [ ] "New data available" toast + user-initiated re-prime on reconnect
- [ ] iOS splash screen images (currently: white flash acceptable)
- [ ] Distance column in occurrence list sorted by proximity to user

### Defer to Post-Dogfood (P3 / v5.1+)

- [ ] Graduate `/app/` to root `/` (requires TOS review + field validation + team sign-off)
- [ ] Adjustable near-me radius
- [ ] Public install prompt on main site
- [ ] Offline tile pre-download for specific areas (requires TOS review + significant scope)

---

## Feature Prioritization Matrix

| Feature | Field User Value | Implementation Cost | v1 Priority |
|---------|-----------------|---------------------|-------------|
| Offline cold-start (SW + precache) | HIGH | MEDIUM | P1 |
| PWA install + manifest + icons | HIGH | LOW | P1 |
| "Ready for offline" indicator | HIGH | MEDIUM | P1 |
| "Data as of \<date\>" label | HIGH | LOW | P1 |
| Blue dot + recenter (GeolocateControl) | HIGH | LOW | P1 |
| "Near me" chip (10 km fixed radius) | HIGH | MEDIUM | P1 |
| Unlisted `/app/` route + SW scope isolation | HIGH (enables dogfood) | MEDIUM | P1 |
| Online/offline status banner | MEDIUM | LOW | P1 |
| Graceful basemap degradation + label | MEDIUM | LOW | P1 |
| iOS "Add to Home Screen" instructions | MEDIUM | LOW | P1 |
| Determinate cache priming progress bar | MEDIUM | MEDIUM | P2 |
| Cache size display | LOW | LOW | P2 |
| "New data available" toast + refresh | MEDIUM | MEDIUM | P2 |
| iOS splash screen images | LOW | LOW | P2 |
| Distance column in occurrence list | LOW | LOW | P3 |
| Adjustable near-me radius | LOW | MEDIUM | P3 |

---

## Reference Apps Analyzed

- **iNaturalist mobile app**: Nearby observations uses a fixed ~1 km default radius chip that
  composes with taxon/location filters. Fixed radius preferred for v1.
- **AllTrails**: "Distance Away" uses an explicit slider (more complex; not appropriate for v1
  field dogfood). Good reference for v5.1+ if collectors request adjustable radius.
- **Mapbox GL JS "Locate User" example**: Standard `GeolocateControl` integration reference.

---

## Sources

- [Installation prompt — web.dev](https://web.dev/learn/pwa/installation-prompt) — beforeinstallprompt flow, iOS limitations, defer pattern
- [Making PWAs installable — MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) — manifest requirements, browser support matrix
- [Offline and background operation — MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation) — SW caching strategies
- [Caching — MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching) — stale-while-revalidate, cache-first
- [GeolocateControl — Mapbox GL JS Docs](https://docs.mapbox.com/mapbox-gl-js/api/markers/#geolocatecontrol) — trackUserLocation, showAccuracyCircle, three tracking states, fitBoundsOptions
- [Maps APIs Caching — Mapbox Help](https://docs.mapbox.com/help/dive-deeper/api-caching/) — 12-hour tile TTL, passive browser cache behavior
- [Mapbox Terms of Service](https://www.mapbox.com/legal/tos) — explicit prohibition on redistributing cached tiles (HIGH confidence; load-bearing constraint)
- [StorageManager estimate() — MDN](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate) — navigator.storage.estimate() for cache size display
- [workbox-window — Chrome for Developers](https://developer.chrome.com/docs/workbox/modules/workbox-window) — SW lifecycle events for offline-ready detection
- [workbox precache progress — GitHub Issue #2498](https://github.com/GoogleChrome/workbox/issues/2498) — confirms Workbox does not expose per-file progress natively
- [iNaturalist Nearby filter — iNaturalist Help](https://help.inaturalist.org/en/support/solutions/articles/151000198035) — fixed-radius "near me" UX reference
- [AllTrails Distance Away filter](https://support.alltrails.com/hc/en-us/articles/37227796303124) — slider-based alternative (deferred for v1)
- [Spatial filter pattern — Map UI Patterns](https://mapuipatterns.com/spatial-filter/) — filter-by-geography design pattern
- [PWA update notifications — Progressier](https://progressier.com/handling-service-worker-updates) — skipWaiting + toast notification pattern
- [Service Worker scope — web.dev](https://web.dev/learn/pwa/service-workers) — scope isolation mechanics, Service-Worker-Allowed header

---

*Feature research for: v5.0 Offline Field Mode (Washington Bee Atlas)*
*Researched: 2026-06-10*
