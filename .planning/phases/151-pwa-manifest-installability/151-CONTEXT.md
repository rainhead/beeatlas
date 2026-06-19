# Phase 151: PWA Manifest & Installability - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the `/app` route a *real* installable PWA. Ship a `manifest.webmanifest` (name,
start_url, display, colors, icons), a from-scratch app icon set (192/512/maskable),
an Android in-app "Install" affordance driven by a captured `beforeinstallprompt`
(non-blocking), iOS Safari "Add to Home Screen" instructions (hidden when already
standalone), and confirm offline cold-start in standalone mode on real devices.

Requirements **PWA-01, PWA-02, PWA-03 are locked** (see REQUIREMENTS.md). This
discussion clarifies HOW to implement them.

**Out of scope (other phases / already shipped):**
- The `/app` route, SW topology, and the manifest's `no-cache` CloudFront behavior →
  shipped in Phase 147 (D-08 added the `/app/manifest.webmanifest` behavior already;
  **no infra change in this phase**).
- App-shell precache + `vite-plugin-pwa injectManifest` wiring → Phase 148.
- `/data/*` runtime caching + offline cold-start machinery + offline pill →
  Phase 149 (installability merely *exercises* this; the caching is done).
- "Ready for offline" / freshness / cache-popover UX → Phase 150 (the header
  cache icon + popover that the install affordance sits beside).
- Mapbox tile caching (TOS-gated), geolocation → Phases 152/154.

</domain>

<decisions>
## Implementation Decisions

### Manifest fields (PWA-01)
- **D-01:** `start_url: /app/index.html` — **NOT** `/app` or `/app/`. The ROADMAP
  (Phase 151 criterion 1) overrides ARCHITECTURE §1c and REQUIREMENTS PWA-01 (both of
  which say `/app`): S3+CloudFront OAC returns **403 for trailing-slash / directory
  paths**, so the installed PWA must launch the explicit `index.html` key. See memory
  `cloudfront-subdir-403-no-index-rewrite` and Phase 147. **Downstream agents: do not
  "correct" this back to `/app` — it is deliberate.** Chrome's installability check
  (start_url within scope) is still satisfied: `/app/index.html` is within scope `/app/`.
- **D-02:** `scope: /app/`, `display: standalone` (locked). `name: "Washington Bee
  Atlas"`, `short_name: "BeeAtlas"` (home-screen label).
- **D-03:** `theme_color` = `--header-bg` navy `rgb(8,13,38)` (`#080d26`) — tints the
  Android standalone status/toolbar to match the app header. `background_color` = the
  **same navy** — the cold-start splash is a dark navy field with the icon centered;
  most cohesive with the installed chrome. (Hex form for the manifest; confirm exact
  `#080d26` ↔ `rgb(8,13,38)` conversion at implementation.)
- **D-04:** Manifest is **linked only from `/app/index.html`**, never from `/index.html`
  (the no-SW / no-PWA-on-`/` guarantee from Phase 147 extends to the manifest link).

### App icons (no existing asset — built from scratch)
- **D-05:** **No logo/favicon/icon exists anywhere in the repo today** (confirmed by
  scout). We **generate a simple mark in-repo**: a clean, stylized **bee glyph on the
  `--accent` green field (`#2c7a2c`)** — ties the icon to the map's checklist-point
  green and reads brighter on a home screen than navy would.
- **D-06:** **Single safe-zone design serves both `any` and `maskable` purposes.** The
  bee sits within the maskable safe zone (centered ~80%, OS may crop to circle/squircle)
  on a full-bleed green field; the same PNGs are declared with `purpose: "any maskable"`
  (or duplicate entries). Accepts the bee rendering slightly smaller in non-maskable
  contexts in exchange for one design instead of two.
- **D-07:** **Assets are committed static files**, not build-time generated. Check an
  **SVG master + exported PNGs (192, 512, and a maskable 512)** into `public/app/icons/`
  — these ride the existing `public/` → Vite-`publicDir` passthrough exactly like
  `public/app/sw.js` does, landing at `/app/icons/...` at runtime. A small reproducible
  generation script (SVG → PNG) lives in the repo but is **NOT wired into the
  Eleventy/Vite build** — avoids adding an image-processing dependency to the bespoke
  `.11ty-vite` pipeline (build-wiring pitfall, see PITFALLS Pitfall 3). Rejected
  `@vite-pwa/assets-generator`/`sharp`-at-build for that fragility reason.
- **D-08:** A `/app` favicon may be derived from the same master (Claude's discretion;
  not required by the criteria, but cheap once the master exists).

### Android Install affordance (PWA-01)
- **D-09:** Capture `beforeinstallprompt` (`preventDefault()` + stash the event), and
  surface a small **"Install" button in `<bee-header>`, beside the existing cache icon +
  offline pill**. Consistent with the quiet, header-hosted chrome; **not** a blocking
  modal and **not** a transient banner (which would compete with the Phase 150 update
  banner). Clicking calls `prompt()` on the stashed event.
- **D-10:** **Lifecycle: show-while-installable, no manual dismiss.** The button appears
  only after `beforeinstallprompt` fires and disappears on `appinstalled` or when running
  standalone. No dismiss "x", no `localStorage` persistence — it's small and self-clears,
  so no persisted dismissal state is needed.

### iOS Add-to-Home-Screen (PWA-02)
- **D-11:** iOS Safari fires no `beforeinstallprompt`. **Mirror Android UX:** the same
  header slot shows an **"Install" button** (same label as Android, for cross-platform
  parity) that opens a **popover** (reusing the cache-icon popover pattern from Phase
  150) containing the **Share-icon illustration + "Add to Home Screen" steps**.
- **D-12:** The iOS button is shown **only when iOS + Safari + not standalone**
  (UA detection + `navigator.standalone === false`). Hidden in iOS Chrome/Firefox where
  the Share→A2HS flow differs from the instructions shown. Mirrors D-10's lifecycle:
  no manual dismiss; the popover is opened on demand and the button self-clears once
  `navigator.standalone === true`.

### Verification (PWA-03 + criteria)
- **D-13:** **Manifest validity** (criterion 1) verified locally via Chrome DevTools →
  Application → Manifest (no validation errors) against a production-build preview, plus
  a `build-output.test.ts`-style assertion that `_site/app/manifest.webmanifest` exists,
  is linked from `_site/app/index.html`, and declares the required keys + icon files
  (mirrors the established 148/149 post-build assertion gate).
- **D-14:** **Offline cold-start in standalone (criterion 4 / PWA-03) is an inherently
  human, real-device UAT** — it cannot be simulated. Must be confirmed on a **real
  Android device (Chrome install → airplane mode → launch → map+table render from
  cache)** and a **real iOS device (Share → Add to Home Screen → airplane mode →
  launch)**. Capture in `151-HUMAN-UAT.md`. The phase has `UI hint: yes` and must not
  auto-advance past this UAT (memory `feedback_uat_ui_phases`).

### Claude's Discretion
- Exact bee glyph artwork, stroke weights, and the SVG→PNG generation script/tooling.
- Precise popover copy + Share-icon SVG for the iOS instructions.
- Whether install/iOS logic is a new small component (e.g. `<bee-install>`) or folded
  into `<bee-header>`; exact event wiring for `beforeinstallprompt`/`appinstalled`.
- iOS-Safari detection implementation (UA sniff + `navigator.standalone`).
- The `/app` favicon (D-08) and exact `#080d26` color-format details.
- Test file placement/naming for the manifest assertion.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked requirements & phase scope
- `.planning/REQUIREMENTS.md` — PWA-01, PWA-02, PWA-03 locked requirement text (note the
  `start_url` value here is overridden by the ROADMAP per D-01).
- `.planning/ROADMAP.md` (Phase 151 entry, ~lines 1230–1245) — goal + 4 success criteria;
  **authoritative on `start_url: /app/index.html`** and the iOS-standalone phase note.

### Manifest / installability (authoritative + the override)
- `.planning/research/ARCHITECTURE.md` §1c "PWA Web App Manifest" (~lines 33–40) — manifest
  shape and Chrome installability (start_url/scope alignment). **Caveat:** its
  `start_url: /app` is superseded by ROADMAP D-01.
- Memory `cloudfront-subdir-403-no-index-rewrite` (+ Phase 147) — the 403-on-trailing-slash
  fact that forces `start_url: /app/index.html`.

### Phase 147–150 foundation this builds on
- `.planning/phases/147-app-route-sw-topology/147-CONTEXT.md` — D-08/D-09 already added the
  `/app/manifest.webmanifest` `no-cache` CloudFront behavior (**no infra work here**);
  no-SW-on-`/` guarantee; no `skipWaiting`/`clientsClaim` invariant.
- `.planning/phases/148-app-shell-precache-vite-plugin-pwa-wiring/148-CONTEXT.md` — the
  `vite-plugin-pwa injectManifest` wiring lives in `eleventy.config.js`; `manifest: false`
  there is the line this phase flips/adds the real manifest around. `globIgnores` already
  excludes `*.png` from precache — confirm icon PNGs reaching the home screen do not need
  precaching (they're fetched at install/manifest-read time, not app-shell assets).
- `.planning/phases/149-data-runtime-caching-offline-cold-start/149-CONTEXT.md` — the
  offline cold-start machinery installability *exercises*; the offline pill + `<bee-header>`
  surface the install button sits beside.
- `.planning/phases/150-cache-health-freshness-ux/150-CONTEXT.md` + commit `e8738fb1` — the
  header cache **icon-button + popover** pattern to reuse for the iOS A2HS popover and to
  place the Install button next to.

### Pitfalls
- `.planning/research/PITFALLS.md` — Pitfall 3 (`vite-plugin-pwa` wired in
  `eleventy.config.js`, never `vite.config.ts`; do not add image-gen deps that destabilize
  the `.11ty-vite` build — informs D-07's commit-static-assets choice).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `<bee-header>` (`src/bee-header.ts`) — already hosts the offline pill, the cache
  **icon-button** (`.cache-icon-btn`), and a **popover** (`.cache-popover`, opened via a
  `cache-popover-toggle` CustomEvent). Reuse this surface: Install button beside the cache
  icon (D-09); the same popover pattern for the iOS A2HS steps (D-11).
- `public/app/sw.js` passthrough (Phase 147 D-04) — proves the `public/app/` → runtime
  `/app/...` static-asset path that the icon PNGs (D-07) will ride.
- `eleventy.config.js` `VitePWA({ ..., manifest: false })` block (~lines 96–119) — the
  exact spot the real manifest is introduced. Note `injectRegister: null` and the
  no-`skipWaiting`/`clientsClaim` invariant must be preserved.
- `src/index.css` brand tokens: `--header-bg: rgb(8,13,38)`, `--accent: #2c7a2c` —
  source the manifest colors (D-03) and the icon field (D-05) from these, don't hardcode.
- `src/tests/build-output.test.ts` — the established post-build assertion gate; extend it
  for D-13 (manifest exists, linked, declares keys + icons).

### Established Patterns
- Static hosting only — manifest + icons are committed/static; no runtime generation
  (CLAUDE.md constraint; D-07).
- `<bee-atlas>` owns reactive state; `<bee-header>` is a presenter emitting CustomEvents
  upward (Architecture Invariant) — install state (`installable`, `iosInstructable`)
  should follow this ownership if it touches `<bee-atlas>`.
- Header chrome is **quiet**: surfaces appear only when actionable (offline pill only
  offline; install button only when installable) — D-10/D-12 mirror this.

### Integration Points
- **New:** `public/app/icons/` (SVG master + PNGs), `/app/manifest.webmanifest`, an SVG→PNG
  repro script (not build-wired), possibly a `<bee-install>` component.
- **Modified:** `eleventy.config.js` (real manifest), `_pages/app/index.html` (link
  manifest + apple-touch-icon meta), `<bee-header>` (Install button + iOS popover),
  `src/tests/build-output.test.ts` (manifest assertion).
- **Untouched:** `infra/lib/beeatlas-stack.ts` (no-cache behavior already shipped in 147),
  `_pages/index.html` (no manifest on `/`).

</code_context>

<specifics>
## Specific Ideas

- Cross-platform parity is intentional: Android and iOS share the same header "Install"
  button slot and (for iOS) the same popover pattern as the cache icon — one mental model.
- The icon is deliberately **green** (data/checklist green), not the navy header color,
  so it pops on a home screen; the **splash** is navy to match the installed chrome — the
  contrast between icon and splash is intended, not an oversight.
- "Quiet chrome" continues from Phase 149/150: nothing is shown unless it's actionable.

</specifics>

<deferred>
## Deferred Ideas

- Install-conversion analytics / tracking `beforeinstallprompt` outcome — out of scope;
  static site, no analytics layer.
- Dismissible-with-persistence install prompt (rejected in favor of show-while-installable,
  D-10) — could revisit if dogfood feedback says the button is nagging.
- Richer per-platform iOS instructions (iOS Chrome/Firefox variants) — D-12 scopes to
  Safari-only; revisit only if non-Safari iOS installs become a real need.
- Separate `any` vs `maskable` icon designs (rejected in favor of single safe-zone design,
  D-06) — upgrade later if the small-bee compromise looks weak on Android.
- `noindex`/robots hardening of `/app` (carried from Phase 147 deferred) — still not needed.

### Reviewed Todos (not folded)
None — no pending todos matched this phase's scope.

</deferred>

---

*Phase: 151-pwa-manifest-installability*
*Context gathered: 2026-06-19*
