# Phase 149: `/data/` Runtime Caching + Offline Cold-Start - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Add Workbox runtime caching in `src/sw.ts` (the `injectManifest` SW from Phase 148) for `/data/*`
— the content-hashed `occurrences.db` (~23 MB) and the three GeoJSON files
(`counties`/`ecoregions`/`places`) — so `/app` cold-starts **fully offline** after one online
prime: map renders, occurrence dots draw, county/ecoregion overlays render, and all
filter/table/selection queries run against the cached DB with zero network requests.
Plus: iOS-eviction mitigation (re-prime on reconnect when the DB is missing, `navigator.storage.persist()`
at first launch), `QuotaExceededError` partial-write cleanup, an honest non-blocking online/offline
indicator, and an honest blank-basemap label when offline.

Requirements **OFF-02, OFF-03, OFF-04, OFF-05, CACHE-05** (see REQUIREMENTS.md). This discussion
captures HOW to implement them.

**Out of scope (Phase 150 owns):** the "ready for offline" indicator (CACHE-01), the prime-progress
indicator and SW→page `postMessage` of per-file progress (CACHE-02), the
`navigator.storage.estimate()` storage-size display (CACHE-03), the "Data as of `<date>`" freshness
label (CACHE-04), and the workbox-window prompt-to-reload update banner (Phase 150's slice of
OFF-03's user-facing UI). 149 emits/wires what 150 will surface; 149 does not render those surfaces
itself.

**Out of scope (other phases):** Mapbox tile runtime caching (TOS-gated, behind a `beta_tile_cache`
flag, later); real `manifest.webmanifest` content + icons + installability (Phase 151);
geolocation (Phase 152+).

OFF-03 success criterion 7 ("no `skipWaiting`/`clientsClaim`") is satisfied **structurally** by
Phases 147 D-06 and 148 D-04 — 149 simply must not regress this. Cache invalidation keyed to the
content-hashed `manifest.json` is achieved naturally because every nightly DB ships under a new
hashed URL (a new cache key); paired with the entry-cap decision below, stale entries don't
accumulate.

</domain>

<decisions>
## Implementation Decisions

### Runtime cache shape
- **D-01:** Register a Workbox `CacheFirst` route in `src/sw.ts` for `/data/*` (or, more precisely,
  two routes — see D-02), named cache `data-artifacts`. Confirmed by research
  (`.planning/research/STACK.md` §3, `SUMMARY.md` lines 12 / 43 / 133–136); the DB is NOT in the
  precache manifest (PITFALLS Pitfall 2). The 30 MB `maximumFileSizeToCacheInBytes` already set in
  148 D-03 covers the DB.
- **D-02:** GeoJSON cache strategy is **Claude's discretion to the researcher**: default to runtime
  `CacheFirst` alongside the DB (uniform `/data/*` rule, no SW install-time payload) but the
  researcher may flip the small GeoJSONs (`counties.geojson`, `ecoregions.geojson`,
  `places.geojson` — each under ~1 MB, stable URLs that overwrite in place) into the precache
  manifest if there is a concrete reason. Note: 148 D-02 currently excludes `data/**` and
  `*.geojson` from precache via `globIgnores`; flipping requires editing that list.
- **D-03:** Confirmed: 148's `globIgnores` of `data/**`, `*.db`, `*.geojson`, `*.parquet`,
  `*.png` stays in place for the DB (and by default for GeoJSON). Runtime cache here does not
  fight precache.

### Entry cap & cache hygiene (the real growth control)
- **D-04:** Attach `ExpirationPlugin({ maxEntries: 1, purgeOnQuotaError: true })` from
  `workbox-expiration` to the DB route. The DB URL is content-hashed (`occurrences_<hash>.db`),
  so every nightly pipeline produces a *new cache key*; without an entry cap, old entries
  accumulate and the cache drifts toward the iOS ~50 MB quota even on a perfectly healthy device.
  With `maxEntries: 1`, Workbox evicts the previous DB whenever a new one is cached — steady-state
  usage is ~23 MB, well under the iOS quota. `purgeOnQuotaError: true` is the backstop for the
  genuinely-full-disk case. Rationale captured in discussion: the user correctly observed that the
  app payload is bounded; the only real growth vector is hash churn from nightly pipeline runs,
  and `maxEntries: 1` collapses that vector.
- **D-05:** No sentinel-key partial-write detection (PITFALLS Pitfall 6 pattern is *not* adopted).
  Cache API `put()` is atomic — a failed write does not leave a half-written entry visible to
  `caches.match()` — and `purgeOnQuotaError: true` is the cleanup path if a write rejects.
  Downstream agents may re-raise this if research surfaces a real corruption mode in the target
  browsers.
- **D-06:** GeoJSON routes (if D-02 stays runtime): no `maxEntries` cap needed — stable URLs
  overwrite in place; the three files together are <~5 MB.

### CACHE-05 re-prime trigger & UX
- **D-07:** Re-prime trigger = **cold-start probe + `online` event listener** (in the page, not the
  SW). On every `/app` load, probe whether the current `manifest.json`'s DB URL is in the runtime
  cache (`caches.match(url, { cacheName: 'data-artifacts' })`). If absent and `navigator.onLine`,
  kick a background `fetch()` of the DB URL — Workbox's `CacheFirst` handler will populate the
  runtime cache as a side effect. Also register an `online` event listener that re-runs the same
  probe, so the "user opens app offline, regains wifi later" field flow recovers without a manual
  reload. `visibilitychange` is **not** added in 149 (excess probes for marginal coverage; can be
  added later if field testing shows gaps).
- **D-08:** Re-prime UX in 149 = **silent background fetch**. No new transient UI in this phase.
  Phase 150's "ready for offline" indicator and per-file progress UI naturally surface what's
  happening (they read the same cache-state). 149 just wires the trigger and the fetch.

### Quota / "device truly full" UX
- **D-09:** Console warn only in 149; no new UI surface. With D-04 in place, `QuotaExceededError`
  is essentially restricted to the "device is genuinely full" case. Workbox cleans up the partial
  entry via `purgeOnQuotaError`. Phase 150's "ready for offline" indicator will naturally read
  "not ready" because the cache probe will fail. No banner, no toast, no `postMessage` plumbing in
  this phase. (If 150 design later wants a richer "storage full" surface, the SW can add a
  `postMessage` then — additive, not part of 149.)

### Online/offline indicator (OFF-05)
- **D-10:** Small "Offline" pill rendered in `<bee-header>` only when `navigator.onLine === false`,
  with `online`/`offline` event listeners updating the state. Quiet design: nothing rendered when
  online (no editorializing on the normal case). Map stays fully usable in either state — the
  pill is purely informational. Reuses the existing `<bee-header>` chrome surface, no new
  component.

### Blank-basemap label (OFF-04)
- **D-11:** Conditional bottom-left text overlay on the map, rendered **only when offline**,
  reading roughly: "Basemap tiles unavailable offline. Pan here while online to cache them."
  (Wording TBD by implementer; the planner should pick exact copy.) Disappears when online.
  Map-anchored so the user sees the explanation in the spot they're looking. No "are tiles cached
  for this viewport?" sophistication in 149 — a simple offline-gated overlay is honest enough
  for the dogfood phase; tile-cache-aware behavior is deferred until Mapbox tile caching itself
  lands behind `beta_tile_cache`.

### `navigator.storage.persist()`
- **D-12:** Called once at first `/app` page launch (track via `localStorage.setItem('persist-asked', '1')`
  or equivalent so we don't spam the call on every visit). Result is logged but **not relied on**
  — iOS returns `false` almost always (PITFALLS Pitfall 4 + research note SUMMARY.md line 201).
  No UI is gated on the result.

### Claude's Discretion
- GeoJSON placement (runtime alongside DB vs precache) — see D-02.
- Exact pill / label copy text and visual styling.
- Cache name string (`data-artifacts` per research is the suggestion; renaming is fine).
- Whether the page-side cold-start probe lives in `app-entry.ts`, `bee-atlas.ts`, or a new
  small `src/cache-probe.ts` module — implementation choice for the planner.
- `CacheableResponsePlugin({ statuses: [200] })` on the DB route (defensible default; research
  uses it for Mapbox tiles but doesn't mandate it for `/data/*`).
- Exact `online`/`offline` event wiring (one shared listener vs per-component).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked requirements & phase scope
- `.planning/REQUIREMENTS.md` — OFF-02, OFF-03, OFF-04, OFF-05, CACHE-05 locked requirement text.
- `.planning/ROADMAP.md` (Phase 149 entry, ~lines 1169–1183) — goal + 7 success criteria.

### Runtime caching strategy (authoritative)
- `.planning/research/STACK.md` §3 (`occurrences.db` + GeoJSON runtime cache rules,
  `CacheFirst` example, `data-artifacts` cache name, iOS 50 MB quota / 7-day eviction).
- `.planning/research/SUMMARY.md` lines 12, 43–44, 99–107, 133–136, 201 (overall approach;
  SW scope vs `/data/` intercept resolution; `navigator.storage.persist()` iOS behavior).
- `.planning/research/ARCHITECTURE.md` §2a "App Shell Precache", §3 (manifest-keyed cache
  invalidation), §4 (file-roles table at ~lines 256–259 for `src/sw.ts`, `src/sw-registration.ts`,
  `public/app/sw.js`), Phase C ~line 351 ("runtime caching + offline cold-start" deliverable).

### Pitfalls this phase must avoid
- `.planning/research/PITFALLS.md` — Pitfall 2 (`maximumFileSizeToCacheInBytes` already handled
  by 148, do not regress), Pitfall 4 (iOS eviction → `navigator.storage.persist()` + re-prime),
  Pitfall 6 (large-binary partial-write — see D-05 for why we're not adopting the sentinel
  pattern), Pitfall 7 (no `skipWaiting`/`clientsClaim` — carried forward from 147/148).

### Phase 147 / 148 foundation this builds on
- `.planning/phases/147-app-route-sw-topology/147-CONTEXT.md` — SW topology, scope, registration
  module, no-SW-on-`/` guarantee, no `skipWaiting`/`clientsClaim` invariant.
- `.planning/phases/148-app-shell-precache-vite-plugin-pwa-wiring/148-CONTEXT.md` — D-02
  `globIgnores` excluding `data/**`/`*.db`/`*.geojson` from precache, D-03 30 MB
  `maximumFileSizeToCacheInBytes` cap, D-04 `src/sw.ts` precache-only baseline (this phase
  extends that file with the runtime routes), D-08 `build-output.test.ts` extension pattern.

### Code touch points
- `src/sw.ts` — add runtime route registrations (`CacheFirst` + `ExpirationPlugin`) for `/data/*`;
  preserve the precacheAndRoute / NavigationRoute setup from 148.
- `src/app-entry.ts` (or new `src/cache-probe.ts`) — cold-start probe + `online` event listener
  for CACHE-05 re-prime.
- `src/sw-registration.ts` — possibly add `navigator.storage.persist()` call (or wire it elsewhere
  in the entry path); track first-launch via `localStorage`.
- `<bee-header>` — add offline pill.
- `<bee-map>` (or wherever the map container lives) — add the offline-only blank-basemap overlay
  label.
- `src/tests/build-output.test.ts` — extend with assertions that `_site/app/sw.js` registers a
  runtime route for `/data/` and references `data-artifacts` cache name (mirrors 148 D-08 gate).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/sw.ts` (created in 148) — the existing `injectManifest` SW source; this phase appends
  runtime route registrations to it.
- `src/sw-registration.ts` — manual registration, already scoped to `/app/`; this phase may
  collocate the `navigator.storage.persist()` call here.
- `<bee-header>` — existing chrome surface; reuse for the offline pill (no new component needed).
- `manifest.json` already carries the content-hashed DB URL via the existing
  `resolveDataUrl('occurrences_db')` plumbing (`ARCHITECTURE.md` line 113) — the cold-start probe
  reads the same URL the app already fetches.
- `src/tests/build-output.test.ts` — the established post-build assertion gate; extend it.

### Established Patterns
- Workbox 7.4.1 + `vite-plugin-pwa` 1.3.0 `injectManifest` is the wiring (locked in 148);
  `globIgnores` already prevents the DB/GeoJSON from being precached.
- No `skipWaiting` / `clientsClaim` — this is a load-bearing invariant from 147 D-06 / 148 D-04;
  preserves the prompt-to-reload lifecycle that Phase 150 will surface.
- Eleventy + `eleventy-plugin-vite` two-step build rooted at `.11ty-vite/`; do not touch
  `vite.config.ts` (PITFALLS Pitfall 3).
- `navigator.onLine` + `online`/`offline` events for connection state (browser standard, no
  library).

### Integration Points
- **Modified:** `src/sw.ts` (runtime routes), `<bee-header>` (offline pill), `<bee-map>` (or its
  container — blank-basemap overlay), `src/tests/build-output.test.ts` (runtime-route assertions),
  possibly `src/app-entry.ts` and `src/sw-registration.ts`.
- **New (possibly):** `src/cache-probe.ts` if the planner extracts the cold-start probe into
  its own module.
- **Untouched:** `eleventy.config.js`, `public/app/` (still empty except as Vite passthrough
  destination), `_pages/index.html` (no-SW-on-`/` guarantee), `infra/lib/beeatlas-stack.ts`
  (no infra change in this phase).

</code_context>

<specifics>
## Specific Ideas

- The user sharpened the quota analysis: the app payload is bounded (~23 MB DB + small shell +
  small GeoJSON), so "quota handling" is not really about app growth — it's about content-hash
  churn from nightly pipeline runs piling up old DB entries. `maxEntries: 1` collapses that vector
  and reduces `QuotaExceededError` to the genuine "device is full" case, which warrants no UI
  in this phase.
- The user prefers quiet UI: offline pill only when offline, blank-basemap overlay only when
  offline. No editorializing on the normal-case ("Online" green dot rejected).
- Re-prime UX is intentionally minimal in 149 because Phase 150 carries the rich
  ready-for-offline / prime-progress surface; 149 just wires the trigger so 150 has something
  observable to render.

</specifics>

<deferred>
## Deferred Ideas

- `visibilitychange` re-prime probe — not added in 149; revisit if field testing shows
  background-tab + iOS eviction combine in ways the `online` event misses.
- Tile-cache-aware blank-basemap behavior (only show the overlay when the visible viewport has
  no cached tiles) — deferred until Mapbox tile caching itself ships behind `beta_tile_cache`.
- "Always-on" Online/Offline pill in `<bee-header>` (rejected in favor of offline-only pill).
- SW→page `postMessage({type: 'cache-quota-exceeded'})` plumbing for a richer
  storage-full surface — additive later if Phase 150 design wants it.
- Mapbox tile runtime caching — TOS-gated, behind `beta_tile_cache` flag, later milestone.
- `manifest.json` `NetworkFirst` caching → **Phase 150** (CACHE-04 / freshness UX bundle).
- Prompt-to-reload banner (workbox-window `onNeedRefresh`) → **Phase 150**.
- Real `manifest.webmanifest` + icons + installability → **Phase 151**.

</deferred>

---

*Phase: 149-data-runtime-caching-offline-cold-start*
*Context gathered: 2026-06-18*
