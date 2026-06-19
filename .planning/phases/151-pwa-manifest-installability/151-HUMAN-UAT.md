---
phase: 151-pwa-manifest-installability
plan: 04
status: pending
gates: /gsd-verify-work
ui_hint: yes
auto_advance: false
created: 2026-06-19
---

# Phase 151 — Human UAT: PWA Offline Cold-Start & Installability

**Status: PENDING** — This checklist must be completed on real devices before
`/gsd-verify-work` is run for Phase 151.

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

- [ ] PASS
- [ ] FAIL

**Device / Chrome version:** _____________________________________

**Notes:** ___________________________________________________

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

**Device / Android version / Chrome version:** ___________________

**Notes:** ___________________________________________________

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

- [ ] PASS
- [ ] FAIL

**Device / iOS version / Safari version:** _______________________

**Status-bar decision (black-translucent vs black):** _____________

**Notes:** ___________________________________________________

---

## Sign-Off

Once all three scenarios are recorded:

1. Update each scenario's result checkbox above (PASS or FAIL).
2. Fill in device/version fields and any notes.
3. Update the frontmatter `status:` field:
   - All PASS → change to `status: approved`
   - Any FAIL → change to `status: failed` and run `/gsd-plan-phase --gaps`
4. Commit this file with the recorded results.
5. Send the resume signal: type `"approved"` to continue the phase, or describe failures.

**Overall result:** _____________________________________________

**Signed off by:** _____________________________________________

**Date:** ______________________________________________________
