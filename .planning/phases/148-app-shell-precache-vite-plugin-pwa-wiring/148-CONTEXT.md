# Phase 148: App Shell Precache + vite-plugin-pwa Wiring - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire `vite-plugin-pwa` (1.3.0, `injectManifest` strategy) into the build via
`eleventy.config.js` `viteOptions.plugins` so the **`/app` app shell** — `/app/index.html`
plus the hashed JS/CSS the `/app` Vite entry loads — is **precached** and `/app` loads
**fully offline after one online visit**. Raise `maximumFileSizeToCacheInBytes` to ≥ 30 MB.
This replaces Phase 147's hand-written stub `public/app/sw.js` with the Workbox-built SW
(source `src/sw.ts`), keeping the SW served at the stable, unhashed URL `/app/sw.js`.

Requirement **OFF-01**. Success criteria are in ROADMAP.md Phase 148 (injected precache
manifest with hashed URLs; offline JS/CSS from ServiceWorker; ≥30 MB cap; post-build URL-exists check).

**Out of scope (later phases):** `/data/*` runtime caching — `occurrences.db`, GeoJSON
(Phase 149); Mapbox tile caching (TOS-sensitive, later, behind a flag); cache-priming
progress indicator (149/150); the prompt-to-reload update UI (OFF-03 phase); the real
`manifest.webmanifest` + icons + installability (Phase 151).

This discussion was delegated ("no preference") — the decisions below are research-grounded
defaults; review and override before planning if any are wrong.

</domain>

<decisions>
## Implementation Decisions

### Plugin wiring & SW build
- **D-01:** Wire `vite-plugin-pwa` 1.3.0 with `strategies: 'injectManifest'` under
  `eleventy.config.js` `viteOptions.plugins` — **NOT** `vite.config.ts` (PITFALLS Pitfall 3:
  the dev server / build run Vite rooted at `.11ty-vite/` and never load `vite.config.ts`, so
  the plugin must live in `viteOptions`). SW source is a hand-written `src/sw.ts`; the compiled
  SW is served at the stable, **unhashed** URL `/app/sw.js`, `scope: '/app/'`. **Remove** the
  Phase 147 hand-written passthrough stub `public/app/sw.js` — the plugin now generates the SW;
  a leftover passthrough would collide.
- **D-02:** Precache scope via `injectManifest.globPatterns: ['app/index.html', 'assets/**/*.{js,css}']`.
  Accept minor over-precache of non-`/app` JS chunks (all bundles are <100 KB; the `/app` shell
  shares `bee-atlas`/`bee-header`/`sqlite-worker` with `/`). Explicitly **exclude**
  `data/**`, `feeds/**`, `*.db`, `*.geojson`, `*.parquet`, `*.png` via `globIgnores` — those are
  Phase 149's runtime cache and would blow the precache size.
- **D-03:** `injectManifest.maximumFileSizeToCacheInBytes: 30_000_000` (≥ 30 MB — success
  criterion 3). Set now even though the 148 precache is only small JS/CSS, so it is ready for
  Phase 149's `occurrences.db` (~23 MB) runtime cache (PITFALLS Pitfall 2: default 2 MB silently
  drops the DB).

### SW source behavior (`src/sw.ts`)
- **D-04:** `src/sw.ts` does `precacheAndRoute(self.__WB_MANIFEST)` for the app shell **only**.
  NO `/data` runtime caching, NO Mapbox tile caching (149+). Carry the Phase 147 lifecycle
  invariant: **NO `skipWaiting`, NO `clientsClaim`** (preserves prompt-to-reload, no app-code↔DB
  version skew).
- **D-05:** Offline navigation — precache `/app/index.html` **and** register a Workbox
  `NavigationRoute(createHandlerBoundToURL('/app/index.html'))` **allowlisted to `/app/` URLs only**
  (e.g. match `/^\/app\//`), so navigations to `/app/`, `/app/index.html`, and `/app/?x=…` all
  resolve to the cached shell offline. **Canonical URL is `/app/index.html`** (S3+CloudFront OAC
  returns 403 for the trailing-slash `/app/` online — see Phase 147 + memory
  `cloudfront-subdir-403-no-index-rewrite`; offline the SW serves the cached shell regardless).
  Do **not** add a navigation fallback for non-`/app` paths — that would shadow the main `/` site.

### Registration & manifest
- **D-06:** Keep Phase 147's manual `src/sw-registration.ts`
  (`navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' })`, imported ONLY by
  `src/app-entry.ts`). Set `vite-plugin-pwa` `injectRegister: null` so the plugin injects **no**
  competing registration. The structural no-SW-on-`/` guarantee is preserved. The workbox-window
  update-lifecycle / prompt-to-reload upgrade is deferred to the OFF-03 phase.
- **D-07:** `manifest: false` (emit no webmanifest and no `<link rel="manifest">`) — the real
  `manifest.webmanifest` + icons + installability are Phase 151. (The Phase 147 CDK `no-cache`
  behavior for `/app/manifest.webmanifest` already exists and is harmless until the file lands.)

### Verification
- **D-08:** Extend the existing `src/tests/build-output.test.ts` (the build-output gate that runs
  in the CI deploy gate — Phase 147 pattern; do NOT add a standalone post-build script) with
  assertions covering success criteria 1, 3, 4: (a) `_site/app/sw.js` contains an **injected**
  precache manifest (the literal `self.__WB_MANIFEST` placeholder is replaced with a real precache
  entry list), (b) **every** precached URL in that manifest exists as a file under `_site/`,
  (c) `eleventy.config.js` sets `maximumFileSizeToCacheInBytes` ≥ `30000000`.
- **D-09:** Offline-load proof (criterion 2 — DevTools → Network offline shows JS/CSS served from
  `(ServiceWorker)`) is inherently manual; record it as a HUMAN-UAT item verified against a local
  production-build preview on `http://localhost` (mirrors Phase 147 D-11). **Test the canonical URL
  `http://localhost:<port>/app/index.html`**, not `/app/`.

### Claude's Discretion
- Exact `vite-plugin-pwa` option names/values to land the SW at output path `/app/sw.js`
  (`srcDir`, `filename`, `outDir`, `scope`, `base`) given the eleventy-vite `.11ty-vite/` build
  rooting — researcher must validate the injectManifest **output path** and that `self.__WB_MANIFEST`
  injects the correct hashed URLs through the two-step eleventy→vite build (this is the main
  integration risk; see PITFALLS Pitfall 3 and STACK §3).
- Workbox import style in `src/sw.ts` (`workbox-precaching` / `workbox-routing` direct imports vs
  plugin bundling); precache cache name (`shell-v1` per research) and stale-precache cleanup.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked requirement & phase scope
- `.planning/REQUIREMENTS.md` — OFF-01 locked requirement text.
- `.planning/ROADMAP.md` (Phase 148 entry, goal + 4 success criteria).

### PWA stack & app-shell precache (authoritative)
- `.planning/research/STACK.md` §3 — `vite-plugin-pwa` 1.3.0 + `injectManifest` rationale; the
  `viteOptions.plugins` passthrough is confirmed against `@11ty/eleventy-plugin-vite` `runBuild`
  (line ~56). Workbox 7.4.1 peer-dep family.
- `.planning/research/ARCHITECTURE.md` §2a "App Shell Precache" (~lines 46–50); file-roles table
  (~lines 258–259: `src/sw-registration.ts`, `public/app/sw.js`); boot/offline flow (~lines 288–296).
- `.planning/research/PITFALLS.md` — Pitfall 2 (`maximumFileSizeToCacheInBytes` default 2 MB
  silently excludes large files), Pitfall 3 (wire `vite-plugin-pwa` in `eleventy.config.js`, not
  `vite.config.ts`), Pitfall 5 (no `skipWaiting`/`clientsClaim` → prompt-to-reload).

### Phase 147 foundation (the topology this hooks into)
- `.planning/phases/147-app-route-sw-topology/147-CONTEXT.md` — D-01..D-12 (entry/SW topology;
  the SW URL/scope, the stub being replaced, the no-SW-on-`/` import-topology guarantee).
- `.planning/phases/147-app-route-sw-topology/147-01-SUMMARY.md` — what Phase 147 built.

### Code touch points
- `eleventy.config.js` (`viteOptions` block — add `plugins`).
- `src/sw-registration.ts`, `src/app-entry.ts` (registration kept; entry unchanged).
- `public/app/sw.js` (Phase 147 stub — to be removed/replaced).
- `src/tests/build-output.test.ts` (extend with the precache verification gate).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/sw-registration.ts` — manual registration with the corrected `scope: '/app/'`; kept as-is
  (D-06), only `injectRegister: null` keeps the plugin from competing.
- `src/tests/build-output.test.ts` — the established post-build assertion gate (runs in CI deploy);
  extend it for precache verification (D-08) rather than adding a new script.
- `eleventy.config.js` `viteOptions` — the single wiring point for the plugin (D-01).

### Established Patterns
- Eleventy + `@11ty/eleventy-plugin-vite` runs Vite rooted at `.11ty-vite/` (never `vite.config.ts`);
  `public/` is copied via the Eleventy-passthrough → Vite-`publicDir` mechanism. The plugin
  DeepCopies `viteOptions` and calls Vite `build()`, so `viteOptions.plugins` pass through (STACK §3).
- Phase 147: SW at stable unhashed `/app/sw.js` with a CDK `no-cache` CloudFront behavior; the
  no-SW-on-`/` guarantee is structural (only `app-entry.ts` imports the registration module).
- Project convention: link to explicit `/…/index.html` (OAC origin 403s trailing-slash dirs) — so
  the precache/navigation and the offline UAT use `/app/index.html`.

### Integration Points
- **Modified:** `eleventy.config.js` (add `vite-plugin-pwa` to `viteOptions.plugins`),
  `src/tests/build-output.test.ts` (precache gate). **New:** `src/sw.ts` (injectManifest source).
  **Removed:** `public/app/sw.js` (147 stub). **Untouched:** `src/sw-registration.ts` behavior,
  `src/app-entry.ts`, `_pages/index.html`, `src/bee-atlas.ts`.

</code_context>

<specifics>
## Specific Ideas

- The eleventy-vite two-step build + `injectManifest` is the one real integration risk — the
  researcher should empirically confirm the generated `/app/sw.js` contains real hashed precache
  URLs (not the literal `self.__WB_MANIFEST`) and lands at the right output path before the planner
  commits to a layout.
- Verification mirrors Phase 147: an automated `build-output.test.ts` gate (CI-enforced) plus one
  manual DevTools offline check recorded in HUMAN-UAT.

</specifics>

<deferred>
## Deferred Ideas

- `/data/*` runtime caching — `occurrences.db` (~23 MB, `CacheFirst`), county/ecoregion GeoJSON;
  uses the ≥30 MB cap set here → **Phase 149**.
- Mapbox tile runtime caching (opaque responses, `CacheableResponsePlugin({statuses:[0,200]})`,
  TTL, behind a `beta_tile_cache` flag) — TOS-sensitive, **later**.
- Cache-priming progress indicator (SW `postMessage` per-file counts; Workbox has no native
  per-file progress) → **Phase 149/150**.
- Prompt-to-reload update UI (workbox-window `onNeedRefresh` → "A data update is available")
  → **OFF-03 phase**.
- Real `manifest.webmanifest` + icons + installability → **Phase 151**.

### Reviewed Todos (not folded)
- `144-code-review-deferred.md` — "Phase 144 code-review deferred items (WR-04 CSV-export headers
  + 3 info)" (match score 0.6). **Not folded:** keyword false-positive on "phase"; CSV-export work
  is unrelated to app-shell precaching.

</deferred>

---

*Phase: 148-app-shell-precache-vite-plugin-pwa-wiring*
*Context gathered: 2026-06-11*
