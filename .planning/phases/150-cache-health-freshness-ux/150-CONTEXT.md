# Phase 150: Cache Health & Freshness UX - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Surface the cache machinery that Phase 149 wired up — readiness ("ready for offline"),
determinate prime progress, on-device storage size, and "Data as of `<date>`" freshness —
and add the workbox-window prompt-to-reload affordance for SW updates. All UI lives in
the `/app` route only (consistent with 147–149); `/` is untouched by the
no-SW-on-`/` structural guarantee from 147.

Requirements **CACHE-01, CACHE-02, CACHE-03, CACHE-04** (see REQUIREMENTS.md), plus the
workbox-window prompt-to-reload slice of OFF-03's user-facing UI that 148/149 deferred
to this phase. This discussion captures HOW to implement them.

**Out of scope (other phases):**
- Real `manifest.webmanifest` + icons + installability → Phase 151.
- Geolocation (`GeolocateControl`, `_userLocation`) → Phase 152.
- "Near me" filter → Phase 153.
- Mapbox tile runtime caching → Phase 154 (TOS-gated).
- Expanding the runtime-cache asset set beyond DB + the 3 GeoJSONs (e.g., adding
  `checklist.parquet`, `photos.json`, `species.json` to the prime denominator) — a
  scope decision for v5.x, not 150. Today the prime UI honestly reflects what 149
  caches: `occurrences.db` + `counties.geojson` + `ecoregions.geojson` + `places.geojson`.

**Carries forward (load-bearing):**
- **No `skipWaiting`, no `clientsClaim`** — preserved from 147 D-06 / 148 D-04 / 149.
  The SW-update prompt is the user-visible side of this invariant; the user opting in
  is the only path to activation. The workbox-window `messageSkipWaiting()` call (or
  equivalent `postMessage({type:'SKIP_WAITING'})`) only fires on user click.
- **`<bee-atlas>` owns all reactive state** — cache state (ready, prime progress,
  storage estimate, update-available, manifest.generated_at) lives on `<bee-atlas>`
  as `@state`. `<bee-header>` is a pure presenter receiving these as `@property`s and
  emitting events upward (reuses the offline-pill / `composed:true` pattern from 149).
- **Quiet UI** — surfaces only when they have something honest to say; no
  editorializing on the normal case.

</domain>

<decisions>
## Implementation Decisions

### Prime-progress mechanism (CACHE-02)
- **D-01:** Progress unit is **bytes** ("12 / 23 MB cached"), single determinate bar.
  Files-count is misleading because the DB is ~99% of the bytes and would count as
  1-of-N. Bytes give honest determinate progress.
- **D-02:** **Page-side prime orchestrator**, not SW-side instrumentation. On `/app`
  cold start (after `probeAndReprime` confirms a missing asset, or unconditionally
  if any expected asset is uncached), the page iterates the known asset URLs,
  `fetch()`es each, and consumes `response.body.getReader()` while emitting byte
  progress to `<bee-atlas>`. The SW's `CacheFirst` handler still intercepts and caches
  as a side effect — zero new SW instrumentation, `src/sw.ts` stays the boring
  precache + 2 runtime-route file 149 left. Aligns with 149's "silent background
  fetch" philosophy and keeps the source of truth (the cache itself) in one place.
- **D-03:** Prime denominator = **`occurrences.db` + `counties.geojson` +
  `ecoregions.geojson` + `places.geojson`** only. App shell is precached by Workbox
  during SW install and is reported as ready when the SW activates (not via the prime
  bar). The denominator matches ROADMAP criterion 1's "app shell + occurrences.db +
  all GeoJSON" naturally because the SW-precache side is binary (installed or not).
- **D-04:** Total byte size discovered at first-fetch: orchestrator reads
  `response.headers.get('content-length')` (set by CloudFront/S3 for these
  responses). Persist the discovered total in `localStorage` so subsequent visits
  can render a determinate bar from byte 0 without a second HEAD. If
  `content-length` is absent for some response, fall back to a known approximate
  (current pipeline output: ~23 MB DB + ~5 MB GeoJSON ≈ 28 MB total) and reconcile
  the actual value once the response completes — researcher/planner picks the exact
  copy-of-pessimism here.

### Ready-for-offline indicator (CACHE-01)
- **D-05:** Lives as a **small pill in `<bee-header>`**, adjacent to the existing
  "Offline" pill from 149. Pill states (single component, text varies):
  - Priming online → `"Caching… 47%"` with a thin inline determinate bar inside the pill.
  - Priming, then offline mid-prime → `"Finish on WiFi"` (incomplete + offline).
  - All assets cached → quiet `"✓ Offline-ready"` (or just a check + tooltip; planner
    decides exact visual treatment within the quiet-UI constraint).
  Reuses the existing chrome surface from 149's offline pill (no new top-level
  component).
- **D-06:** **Ready is computed by probing the cache**, not by tracking the
  orchestrator counter. On page load and after each prime-fetch completes,
  `<bee-atlas>` calls `caches.match(url, { cacheName: 'data-artifacts' })` for the 4
  known URLs (resolved via `src/manifest.ts`). Ready = all 4 hit. Single source of
  truth — the cache is reality; the counter is a decorative wrapper for the bar UI
  during an active session.
- **D-07:** **Incomplete-prime + offline UX:** The header pill flips to "Finish on
  WiFi" — no new modal, no blocking alert. Whatever partial data was cached remains
  usable (occurrence dots / overlays may render partially); 149's blank-basemap
  overlay already explains the offline state on the map surface itself. Rejected:
  blocking the table/queries until prime completes (overly paternalistic and
  misaligns with "partial cache is still useful").

### Freshness label (CACHE-04) + manifest.json caching
- **D-08:** Add a **`NetworkFirst` runtime route in `src/sw.ts` for
  `/data/manifest.json`** with a short timeout (~3 s) and cache fallback. Cache name
  is up to the planner (suggest a separate `data-manifest` cache or reuse
  `data-artifacts` — the route doesn't need entry-cap because the URL is stable and
  overwrites in place; 149 D-06 already established that pattern for GeoJSON).
  Closes 149's deferred item: "`manifest.json` `NetworkFirst` caching → Phase 150".
- **D-09:** **"Data as of `<date>`" label always visible** (per success criterion 4).
  Format: **relative if fresh, absolute if stale**, with a ~7-day boundary:
  - `< 1 day` → `"Today"`
  - `1–6 days` → `"Yesterday"` / `"3 days ago"`
  - `≥ 7 days` → `"Data as of Jun 15, 2026"`
  - `≥ 1 year` → `"Data as of Mar 2026"`
  Renders as a small sub-line under the header title (or as a tooltip on the
  ready-pill — planner picks within "always visible"). Locale via
  `Intl.RelativeTimeFormat` + `Intl.DateTimeFormat`, default `en-US`.
- **D-10:** **Update gating:** Label tracks `manifest.generated_at` directly. The
  success-criterion clause "updates only when a newer DB is fetched, not on page
  refresh" is satisfied for free because the DB URL is content-hashed, so a new
  `generated_at` only ships when a new DB ships. Page refresh hits NetworkFirst →
  serves the same manifest → renders the same date. **No localStorage hold or
  derived-state gating.** If the planner finds a transient case (e.g., NetworkFirst
  delivers a newer manifest before the new DB is fully cached), the resolution is
  "let it flicker once" — the next prime fetch resolves it; not worth the state
  machine.
- **D-11:** First-cold-visit (no cached manifest exists yet, online): label shows
  `"…"` or is hidden until the first manifest fetch resolves; no separate "loading"
  spinner. Offline with no cached manifest = pathological state covered by the
  blank-basemap overlay; label hides itself rather than show a misleading date.
- **D-12:** Dev manifest currently has `"generated_at": "local"` (string literal).
  Treat unparseable `generated_at` as "show no date, log a warning" — guards
  dev/preview environments without leaking dev-state into prod UI.

### SW update prompt (success criterion 5)
- **D-13:** Wire **workbox-window in `src/sw-registration.ts`** (alongside the
  existing manual `navigator.serviceWorker.register()` and `persist()` calls — it
  already owns SW lifecycle). The current `register()` call should migrate to
  `new Workbox('/app/sw.js', { scope: '/app/' }).register()` to gain the
  `waiting`/`controlling` lifecycle events. `workbox-window` is already installed
  (currently as `devDependency` — move to `dependencies` since it ships at runtime).
- **D-14:** **Non-modal banner anchored to the bottom of `<bee-atlas>`** when an
  update is waiting. Banner text approximately: `"A data update is available — tap
  to reload"` (exact copy is planner discretion within the quiet-UI constraint).
  Dismiss = close-X on the banner; tap-body = trigger `wb.messageSkipWaiting()` +
  `window.location.reload()`. Banner is a presenter rendered by `<bee-atlas>`
  reading an `_updateAvailable` `@state`; `<bee-header>` is not involved.
- **D-15:** **Dismiss persistence: per-session** (in-memory state only). The
  banner re-appears on the next page load while the SW is still in the waiting
  state. Rejected: persistent dismiss via `localStorage` (would silently bury
  updates from collectors who pinned a stale tab); rejected: re-show on every focus
  (annoying).
- **D-16:** Preserves no-`skipWaiting` invariant structurally — the SW source still
  does NOT call `self.skipWaiting()`; only `messageSkipWaiting()` invoked from the
  user-clicked banner triggers activation. 149's contract is intact.

### Storage estimate (CACHE-03)
- **D-17:** **"X MB stored on this device"** appears in a **detail surface reached
  by clicking the ready pill** in `<bee-header>` — a small popover/dropdown
  collocating the ready-state, freshness date (also shown there for tap-discovery),
  storage estimate, and the SW-update affordance when one is waiting (the bottom
  banner remains the primary actionable surface for updates; the popover entry is a
  passive duplicate so a user who dismissed the banner still sees the affordance).
  Keeps the header chrome lean while making the detail-rich surface one tap away.
- **D-18:** `navigator.storage.estimate()` is called **lazily when the popover
  opens** + **on `online`/`focus` events** while the popover is mounted. Not
  polled. Display: `"X MB stored on this device"` formatted to 1 decimal at MB; show
  quota as a secondary detail (`"of Y MB available"`) only when quota is non-null
  and < 200 MB (i.e., the iOS-like constrained case where it's meaningful).
- **D-19:** Feature-detect `navigator.storage?.estimate` — older Safari lacks it.
  Hide the line entirely if undefined; do not show a `"—"` placeholder.

### Wiring summary
- **D-20:** **No new top-level custom element** in this phase. `<bee-header>` gains
  a ready-pill + popover responsibility; `<bee-atlas>` gains `_cacheState` /
  `_primeProgress` / `_updateAvailable` `@state` + the update-banner render.
  `src/sw.ts` gains one runtime route (manifest.json NetworkFirst). `src/sw-
  registration.ts` migrates to `workbox-window` and emits an `update-available`
  CustomEvent (composed: true) that `<bee-atlas>` listens for. A new small module
  `src/prime-orchestrator.ts` (planner discretion: could collocate with `src/app-
  entry.ts` or `src/cache-probe.ts`) owns the byte-progress fetch loop and emits
  progress events.

### Claude's Discretion
- Exact pill / banner / sub-line copy and visual styling (within the quiet-UI
  constraint).
- Exact popover layout (vs dropdown menu vs expanded inline area in header).
- Cache name for `manifest.json` runtime route (`data-manifest` vs reusing
  `data-artifacts`).
- Module placement of the prime orchestrator (own file vs in `app-entry.ts` vs
  in `cache-probe.ts`).
- Throttling cadence for progress postMessages from the orchestrator (every chunk
  vs every N% vs every 100 KB) — pick what produces smooth UI without excessive
  re-renders.
- Whether `<bee-header>` exposes a public `cacheState` property or listens for an
  event from `<bee-atlas>` — both fit the state-owner invariant; pick whichever is
  cleaner.
- Exact `Intl` locale handling and the relative/absolute threshold (default 7 days
  is a suggestion).

### Folded Todos
None — no pending todos matched Phase 150 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked requirements & phase scope
- `.planning/REQUIREMENTS.md` — CACHE-01, CACHE-02, CACHE-03, CACHE-04 locked
  requirement text (lines 36–39).
- `.planning/ROADMAP.md` Phase 150 entry (lines 1200–1214) — goal + 5 success
  criteria.

### Phase 149 foundation (the plumbing this surfaces)
- `.planning/phases/149-data-runtime-caching-offline-cold-start/149-CONTEXT.md` —
  D-04 (`maxEntries: 1` cache hygiene), D-07/D-08 (silent re-prime trigger that
  the prime orchestrator now visualises), D-10 (`<bee-header>` offline-pill pattern
  to reuse), deferred-ideas note for `manifest.json NetworkFirst` and prompt-to-
  reload landing in this phase.
- `.planning/phases/148-app-shell-precache-vite-plugin-pwa-wiring/148-CONTEXT.md` —
  D-04 (no `skipWaiting` / `clientsClaim` invariant — preserved), D-06
  (`injectRegister: null`; we own page-side registration), D-07 (no
  webmanifest yet — Phase 151).
- `.planning/phases/147-app-route-sw-topology/147-CONTEXT.md` — scope `/app/`,
  no-SW-on-`/` import-topology guarantee, stable `/app/sw.js` URL with CDK
  `no-cache` behavior.

### Workbox / vite-plugin-pwa stack
- `.planning/research/STACK.md` §3 — Workbox 7.4.1 + vite-plugin-pwa 1.3.0 wiring;
  cache-strategy patterns; `data-artifacts` cache name.
- `.planning/research/SUMMARY.md` — overall PWA approach; iOS quota behavior.
- `.planning/research/PITFALLS.md` — Pitfall 2 (`maximumFileSizeToCacheInBytes`),
  Pitfall 4 (iOS eviction / `persist()`), Pitfall 5/7 (no `skipWaiting` →
  prompt-to-reload).
- workbox-window docs (Workbox 7.x): `Workbox.register()`,
  `addEventListener('waiting', …)`, `messageSkipWaiting()`. Researcher should
  validate against the Workbox 7.4 API specifically.

### Code touch points (this phase will modify)
- `src/sw.ts` — add `NetworkFirst` runtime route for `/data/manifest.json`.
- `src/sw-registration.ts` — migrate `register()` to workbox-window `Workbox`
  object; wire `waiting` event → CustomEvent (composed: true) for `<bee-atlas>`.
  `persist()` call stays.
- `src/manifest.ts` — already exposes `loadManifest()` + `generated_at` for the
  freshness label; may need a small helper to expose the parsed Date or a
  freshness-relative string for the header.
- `src/bee-atlas.ts` — add `_cacheState` / `_primeProgress` / `_updateAvailable`
  `@state`; render the update banner; listen for SW + orchestrator events; relay
  `<bee-header>` properties.
- `src/bee-header.ts` — add `cacheState` / `primeProgress` / `freshness`
  `@property`s; render ready-pill (with inline determinate bar) + freshness
  sub-line; render popover/detail surface with storage-estimate + freshness +
  passive update-affordance.
- New `src/prime-orchestrator.ts` (placement is planner discretion) — the byte-
  progress fetch loop; calls `caches.match()` to compute ready-state; emits events.
- `src/tests/build-output.test.ts` — extend with assertion that `_site/app/sw.js`
  registers the `manifest.json` NetworkFirst route (mirrors 148 D-08 / 149's
  extension pattern). Add unit tests for the prime orchestrator (Vitest).

### Code reference points (DO NOT modify in this phase)
- `<bee-pane>`, `<bee-table>`, `<bee-map>` — untouched; this phase does not change
  map / table / pane behavior.
- `eleventy.config.js` viteOptions — Workbox plugin already wired by 148; no
  change.
- `vite.config.ts` — never touched (PITFALLS Pitfall 3).
- `infra/` — no infra change in this phase; `/data/manifest.json` already has
  CDK behavior from prior phases (CDN cache TTL governs network-side freshness
  before the SW route).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/sw-registration.ts` already owns SW lifecycle (registration + `persist()`);
  adding workbox-window here keeps lifecycle plumbing in one file.
- `src/bee-header.ts` already renders an `offline` pill — proven pattern for cache-
  state pills. The header's `.offline-pill` CSS rule can be the base style for the
  new ready-pill.
- `src/manifest.ts` already fetches `/data/manifest.json` and exposes
  `generated_at` (string). For the relative-date label, expose a helper that
  parses + formats it (or returns null on the dev `"local"` sentinel).
- `src/app-entry.ts` already has `probeAndReprime()` + `online`-event wiring.
  The prime orchestrator can hook the same `online` listener (or replace
  `probeAndReprime`'s fire-and-forget fetch with the byte-tracking version).
- `src/tests/build-output.test.ts` is the established post-build gate; extend it
  for the new runtime route assertion.

### Established Patterns
- **State-owner / pure-presenter:** `<bee-atlas>` holds reactive state;
  `<bee-header>` / `<bee-map>` render. New cache state follows this verbatim.
- **`composed: true` CustomEvents** for child→parent state propagation (149 D-10,
  Phase 152 will use the same shape for `user-location-changed`). The SW-update
  signal from `sw-registration.ts` → `<bee-atlas>` uses this pattern.
- **No `skipWaiting` / `clientsClaim`** is an invariant, not a default — Phase 150
  introduces the user-visible side (the banner) that closes the lifecycle loop.
- **Single-file runtime-route extension** of `src/sw.ts` mirrors 149's approach;
  manifest.json route is added the same way.
- **Quiet UI** — pills and overlays appear only when they have something honest to
  say; no green "Online ✓" dot, no "Cache healthy" boast.

### Integration Points
- **Modified:** `src/sw.ts`, `src/sw-registration.ts`, `src/manifest.ts`,
  `src/bee-atlas.ts`, `src/bee-header.ts`, `src/tests/build-output.test.ts`.
- **New (one file):** `src/prime-orchestrator.ts` (or merged into `app-entry.ts`
  / `cache-probe.ts` — planner's call).
- **Dependency change:** `workbox-window` moves from `devDependencies` to
  `dependencies` in `package.json` (it ships in the runtime bundle).
- **Untouched:** `<bee-pane>`, `<bee-table>`, `<bee-map>`, `<bee-occurrence-detail>`,
  `eleventy.config.js`, `vite.config.ts`, `infra/`, `_pages/`.

</code_context>

<specifics>
## Specific Ideas

- The user prefers a **single cluster surface** for cache health: the popover off
  the ready-pill colocates ready-state + freshness + storage estimate + a passive
  update affordance. Avoids spraying four indicators across `<bee-header>`.
- The **update banner is the discoverable, actionable affordance** for SW updates;
  the popover entry is a passive duplicate so a dismiss-during-driving doesn't
  bury the update forever.
- **Bytes over files** for the prime progress: the DB dominates wall-clock and
  the user wants the bar to reflect that honestly.
- **Cache is the source of truth** for ready-state. The orchestrator counter is
  decorative; on session resume mid-prime the cache probe is the only honest
  read.
- **`maxEntries: 1` from 149 D-04** means hash churn doesn't accumulate, so
  storage estimate will trend flat across nightly pipeline runs — the user can
  read the number once and trust it for weeks.

</specifics>

<deferred>
## Deferred Ideas

- **Expanding the runtime-cache asset set** beyond DB + 3 GeoJSONs (e.g., adding
  `checklist.parquet`, `photos.json`, `species.json`, `species-maps/*`) — scope
  decision for a future v5.x phase. Today the prime UI honestly reflects what 149
  caches; broader offline-fidelity is a separate scope conversation.
- **Per-cache breakdown** in the storage popover (`X MB shell + Y MB data`) —
  nice-to-have for diagnostics; not in success criterion 3 and not the user's
  primary question (which is "is my phone full?").
- **`visibilitychange` re-probe** — punted by 149 D-07; same here. Revisit if
  field testing surfaces gaps the `online` listener misses.
- **"Telemetry / diagnostics" panel** — surface failed prime attempts, last
  successful prime time, etc. Useful for debugging in the field but no UAT
  requirement; later phase if needed.
- **Localizing the freshness string** beyond `en-US` — `Intl.RelativeTimeFormat`
  makes this nearly free, but exposing a locale picker is out of scope.
- **First-run experience / onboarding overlay** — could explain "this app caches
  data so you can use it offline; please stay on WiFi for ~30 s". The chosen
  ready-pill + prime bar is honest without an overlay; revisit if dogfooding
  shows confusion.
- **Always-visible "Online ✓" affordance** — rejected here (matches 149's
  rejection of the always-on Offline/Online pill).
- **Tile-cache-aware storage estimate** ("Y MB of map tiles cached") — depends on
  Phase 154 (tile runtime caching). Storage estimate will just include them in
  the total once 154 ships.

</deferred>

---

*Phase: 150-cache-health-freshness-ux*
*Context gathered: 2026-06-18*
