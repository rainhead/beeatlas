---
phase: 151-pwa-manifest-installability
plan: 04
status: approved
gates: /gsd-verify-work
ui_hint: yes
auto_advance: false
created: 2026-06-19
verified: 2026-06-20
---

# Phase 151 — Human UAT: PWA Offline Cold-Start & Installability

**Status: APPROVED** — Verified on real devices 2026-06-20. PWA-01/02/03 met (data + table
render offline; basemap-offline is a documented Phase 154 dependency). See "UAT Findings &
Fixes" below for the five offline-caching defects this UAT surfaced and resolved.

**UI hint: yes** — This phase must NOT auto-advance past this UAT checkpoint.
The `auto_advance: false` constraint is in effect (per `feedback_uat_ui_phases`).

**Gates:** `/gsd-verify-work` for Phase 151 is blocked until all three scenarios below are
recorded as Pass and results are committed to this file.

Any Fail becomes gap-closure input for `/gsd-plan-phase --gaps` — do NOT mark the phase
verified until all three scenarios show Pass.

Requirements verified: **PWA-01** (manifest validity), **PWA-02** (iOS status-bar), **PWA-03** (offline cold-start in standalone).

---

## Prerequisites

Before running any scenario:

- [ ] Deploy the current build to production OR run a production-build preview locally:
  ```
  npm run build
  npx serve _site   # or equivalent local static server
  ```
- [ ] Ensure the device under test has a network connection initially (needed for install).
- [ ] For Android and iOS scenarios: confirm the Install button appears in the app header (it
      should appear only when the PWA is installable and not yet installed).

---

## Scenario 1 — Chrome DevTools Manifest Validity (PWA-01)

**Requirement:** PWA-01 — Manifest declares all required fields; no Chrome validation errors.

**Why manual:** Chrome DevTools Application → Manifest is a manual inspection surface and
cannot be simulated in CI (D-13).

**Device / environment:** Desktop Chrome (any OS)

**Steps:**

1. Open a production-build preview on localhost (see Prerequisites).
2. Navigate to `/app/index.html` in Chrome.
3. Open DevTools (F12 / Cmd+Option+I) → **Application** tab → **Manifest** section.
4. Confirm the Manifest panel shows:
   - `name: Washington Bee Atlas`
   - `short_name: BeeAtlas`
   - `start_url: /app/index.html`
   - `display: standalone`
   - `theme_color: #080d26` (navy)
   - `background_color: #080d26` (navy)
   - At least one icon listed (192 × 192 and 512 × 512 expected)
5. Confirm the **"Errors and warnings"** section shows **zero validation errors**.
6. Confirm Chrome offers an install affordance (the browser's own "Install" button appears in
   the omnibar or via the DevTools panel — indicating the PWA passes installability criteria).

**Expected result:** Zero manifest validation errors; install affordance offered.

**Result:**

- [x] PASS
- [ ] FAIL

**Device / Chrome version:** Desktop Chrome

**Notes:** Manifest valid (no errors). DevTools reported "Banner not shown:
beforeinstallprompt.preventDefault() called" — this is the *expected* behavior of the in-app
Install affordance (D-09 suppresses Chrome's default banner). The header Install button appeared
and opened Chrome's native install dialog. PWA-01 confirmed.

---

## Scenario 2 — Android Offline Cold-Start in Standalone (PWA-03)

**Requirement:** PWA-03 — Offline cold-start in standalone renders map + table from cache.

**Why manual:** Standalone display-mode + true offline launch cannot be simulated in jsdom or
CI; depends on real OS installation + cache behavior (D-14).

**Device:** Real Android device with Chrome

**Steps:**

1. Open the app in Chrome on the Android device (connected to network).
2. Tap the **"Install"** button in the app header (the in-app install affordance).
3. Follow the Chrome install prompt to add the app to the home screen.
4. Confirm the app icon appears on the Android home screen.
5. Enable **airplane mode** (fully disable all network: WiFi + mobile data).
6. Launch the app by tapping the home-screen icon.
7. Confirm the app opens in **standalone mode** — no browser chrome (no address bar, no
   browser toolbar). It should look like a native app.
8. Confirm the **map renders** from cache (tiles from Mapbox may be absent but the base map
   layer should show; the occurrence data layer should render).
9. Confirm the **occurrence table** (sidebar / data pane) renders from cache.
10. Confirm no "offline" error state is shown that blocks content display — the offline pill
    may appear (expected), but the main data should be visible.

**Expected result:** Standalone launch (no browser chrome); map and occurrence table render
from cache with no network.

**Result:**

- [ ] PASS
- [ ] FAIL
- [x] DEFERRED — no Android device available at verification time.

**Device / Android version / Chrome version:** n/a

**Notes:** Not tested — no Android hardware on hand. ROADMAP criterion 4 requires offline
cold-start "confirmed on a real device" (singular); Scenario 3 (iOS) satisfies that. The
in-app Install button + `beforeinstallprompt` path was confirmed working on desktop Chrome
(same code path as Android). Android real-device offline cold-start carried to the v-next
deferred list for opportunistic confirmation.

---

## Scenario 3 — iOS A2HS + Offline Cold-Start + Status-Bar Legibility (PWA-02 / PWA-03)

**Requirement:** PWA-03 — Offline cold-start in standalone; PWA-02 — iOS status-bar style.

**Why manual:** iOS Safari does not support `beforeinstallprompt`; standalone launch and
status-bar appearance can only be verified on real hardware (D-14, D-12).

**Device:** Real iPhone or iPad with Safari

**Steps — Install:**

1. Open the app in **Safari** on the iOS device (connected to network).
2. Tap the **"Install"** button in the app header.
3. Confirm the in-app popover appears with Share-icon illustration and "Add to Home Screen"
   instructions.
4. Follow the popover steps: tap the **Share icon** (box with arrow) at the bottom of Safari.
5. In the Share sheet, tap **"Add to Home Screen"**.
6. Confirm the app name pre-fills as "BeeAtlas" (or "Washington Bee Atlas").
7. Tap **Add**.
8. Confirm the app icon appears on the iOS home screen.

**Steps — Offline cold-start:**

9. Enable **airplane mode** (fully disable all network: WiFi + cellular).
10. Launch the app by tapping the home-screen icon.
11. Confirm the app opens in **standalone mode** — full screen, no Safari browser chrome (no
    address bar, no Safari toolbar).
12. Confirm the **map renders** from cache.
13. Confirm the **occurrence table** renders from cache.
14. Confirm no blocking error state — offline pill may appear (expected), data should be visible.

**Steps — Status-bar legibility (PWA-02):**

15. While running in standalone mode, observe the **iOS status bar** (time, battery, signal
    indicators at the top of the screen).
16. Confirm the status bar content is **legible** against the navy header background (`#080d26`).
17. Record whether the current setting (`apple-mobile-web-app-status-bar-style: black-translucent`)
    is adequate, or whether it should be changed to `black`.

**Expected result:** Standalone launch (no Safari chrome); map and table render from cache;
status bar is legible against the navy theme.

**Result:**

- [x] PASS
- [ ] FAIL

**Device / iOS version / Safari version:** Real iPhone, Safari

**Status-bar decision (black-translucent vs black):** `black-translucent` kept — legible against
navy, no change requested.

**Notes:** Install popover (Share → Add to Home Screen) worked; standalone launch confirmed
(no Safari chrome). Offline cold-start now loads and renders the cached occurrence **data +
table** (was hanging on "Loading…" before the fixes below). The **basemap renders blank
offline** — Mapbox style + tiles are online-only (TOS-gated, deferred to Phase 154); this is the
documented expected offline state, not a defect. The build-id line in the cache popover
(`Build <sha>`) was essential for confirming each fix actually reached the installed PWA (iOS
retains the old SW/caches across icon delete+reinstall — a full **Settings → Safari → Website
Data** clear is required). PWA-02 + PWA-03 (data/table) confirmed.

---

## UAT Findings & Fixes

Real-device UAT surfaced that offline cold-start had **never actually worked** — Phases 147–149
were validated in DevTools, which masks several real-device behaviors. Five defects were found
and fixed (all on `main`, deployed):

1. **wasm not precached** (`fix(151)` 69097427) — the injectManifest glob was `{js,css}`, excluding
   `wa-sqlite-*.wasm`. Added `wasm` to the glob + a `build-output.test.ts` regression guard.
2. **Data caches never populated** (`fix(151)` f81a4ed6) — the prime relied on the SW passively
   caching its fetches, but a freshly-installed PWA's first load is uncontrolled (no clientsClaim),
   so nothing was cached. Now the prime + `loadManifest` write to Cache Storage directly; the worker
   reads the DB from cache.
3. **Worker script wouldn't load offline on iOS** (`fix(151)` e77232a4) — iOS Safari doesn't serve a
   dedicated/module worker's script through the SW offline. Inlined the worker (`?worker&inline`);
   resolve the wasm URL on the main thread and load it from cache via `locateFile`/`instantiateWasm`.
4. **Data load coupled to the basemap** (`fix(151)` c980281c) — `loadOccurrenceGeoJSON()` + the
   curtain-clearing `data-loaded` event lived inside `map.on('load')`, which never fires offline
   (Mapbox style is online-only). Decoupled into `_loadOccurrenceData()` so cached data + table
   render even when the basemap can't.
5. **Build-id surfaced** (`feat(151)` build-number) — added a `Build <sha>` line to the cache
   popover so a stale installed PWA is diagnosable (this was load-bearing for the UAT itself).

**Carried forward (deferred, not blocking):**
- Offline **basemap** (tiles + style) — online-only; TOS-gated; **Phase 154**.
- Optional: occurrence **dots on a blank-gray map** offline via a local fallback style — nice-to-have,
  separable.
- **Android** real-device offline cold-start — no device at verification; opportunistic later.
- Broader concern: the no-`skipWaiting`/`clientsClaim` update model makes installed PWAs (esp. iOS)
  sticky on old code — worth revisiting as its own item.

---

## Sign-Off

**Overall result:** PASS — PWA-01, PWA-02, PWA-03 verified on real devices (iOS); Android deferred
(no hardware). Offline cold-start renders cached data + table; basemap-offline is a Phase 154
dependency.

**Signed off by:** Peter Abrahamsen (real-device UAT) + Claude (fixes + local verification)

**Date:** 2026-06-20
