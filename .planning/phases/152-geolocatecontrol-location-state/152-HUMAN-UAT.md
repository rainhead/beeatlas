---
phase: 152-geolocatecontrol-location-state
plan: 03
status: pending
gates: /gsd-verify-work
ui_hint: yes
auto_advance: false
created: 2026-06-20
---

# Phase 152 — Human UAT: GeolocateControl + Location State

**Status: PENDING** — Awaiting real-device + manual-browser verification.

**UI hint: yes** — This phase must NOT auto-advance past this UAT checkpoint.
The `auto_advance: false` constraint is in effect (per `feedback_uat_ui_phases`).

**Gates:** `/gsd-verify-work` for Phase 152 is blocked until all four scenarios below are
recorded as Pass (or intentionally deferred with rationale) and results are committed to this file.

Any Fail becomes gap-closure input for `/gsd-plan-phase 152 --gaps` — do NOT mark the phase
verified until all four scenarios show Pass.

Requirements verified: **LOC-01** (blue dot/recenter + offline GPS), **LOC-03** (denial banner, graceful degradation).

**LOC-02 automated proof:** The source-invariant tests for `<bee-atlas>._userLocation` state
ownership and the `user-location-changed` CustomEvent relay are covered by automated tests in
`src/tests/geolocation.test.ts` (Plans 01/02). This file covers only the four behaviors that
CANNOT be exercised headless.

---

## Prerequisites

Before running any scenario:

- [ ] Run the dev server or deploy a production build to serve the `/app` route:
  ```
  npm run dev   # local browser tests (Scenarios 1–3)
  ```
  For iOS real-device tests (Scenario 4), use the deployed `/app` URL
  (or `npm run build` + a local static server reachable from the device).
- [ ] Confirm the build passes: `npm test` must be green.
- [ ] For Scenario 4: confirm you have a physical iPhone or iPad on hand — Xcode Simulator
  cannot reproduce iOS standalone-mode geolocation behavior (see Scenario 4 notes).

---

## Scenario 1 — Blue Dot + Recenter (LOC-01)

**Requirement:** LOC-01 — GeolocateControl shows a blue dot + accuracy ring on location allow;
recenter button returns the viewport to the dot after panning.

**Why manual:** Requires real geolocation + visual map rendering; cannot be exercised headless.

**Device / environment:** Desktop or mobile browser (Chrome / Firefox / Safari)

**Steps:**

1. Open the `/app` route in a browser.
2. Locate the GeolocateControl button in the top-right corner of the map.
3. Tap / click the GeolocateControl button.
4. When the browser permission prompt appears, choose **Allow** (or "Allow once" / "Allow
   while using app" — any grant).
5. Confirm a **blue dot** appears on the map at your current location.
6. Confirm an **accuracy ring** (semi-transparent circle) surrounds the dot.
7. Pan the map away from the dot (drag or use keyboard) so the dot is no longer in view.
8. Click / tap the GeolocateControl button again (recenter).
9. Confirm the **viewport recenters** on the blue dot (the map animates back to your location).

**Expected result:** Blue dot + accuracy ring appear after granting permission; tapping the
control a second time while the dot is off-screen recenters the viewport on the dot.

**Result:**

- [ ] PASS
- [ ] FAIL

**Device / browser / OS version:**

**Notes:**

---

## Scenario 2 — Offline GPS (LOC-01)

**Requirement:** LOC-01 — GPS fix works with DevTools "offline" active; the dot renders without
network (GPS is independent of the basemap style and tile network).

**Why manual:** `navigator.geolocation` cannot be exercised headless; DevTools offline mode
cannot be simulated in CI.

**Device / environment:** Desktop Chrome or Edge (DevTools required)

**Steps:**

1. Open the `/app` route in Chrome (or Edge) — connected to the network.
2. Allow location if prompted (or ensure location was previously granted for this origin).
3. Open **DevTools** (F12 / Cmd+Option+I).
4. Go to **Network** tab → throttling dropdown → select **Offline**.
5. With the "Offline" throttle active, click the GeolocateControl button on the map.
6. Confirm a **GPS fix arrives** — the blue dot appears on the map.
7. Confirm the dot **renders without network** — no network error state blocks the dot from
   appearing (basemap tiles may be blank or cached; that is expected and not a failure here).
8. Re-enable network (Network tab → "No throttling") when done.

**Expected result:** A GPS fix arrives and the blue dot renders even with DevTools "Offline"
active. GPS is hardware/OS-driven and has no network dependency.

**Result:**

- [ ] PASS
- [ ] FAIL

**Device / browser / OS version:**

**Notes:**

---

## Scenario 3 — Denial Banner (LOC-03)

**Requirement:** LOC-03 — Denying (or revoking) location permission shows an app-level banner
with a brief explanation; the rest of the app (map, filter panel, table) remains fully
interactive and is unaffected by the denial.

**Why manual:** Requires a real permission-denied flow + visual confirmation that all other UI
surfaces remain functional; not reproducible headless.

**Device / environment:** Desktop or mobile browser (any)

**Steps:**

1. **Reset location permission** for the site so the prompt will re-appear:
   - Chrome: DevTools → Application → Storage → "Clear site data" (or address-bar lock icon →
     Site settings → Location → Reset).
   - Firefox: address-bar lock icon → Clear permissions.
   - Safari: Preferences → Websites → Location → remove the site.
2. Open (or reload) the `/app` route.
3. Click / tap the GeolocateControl button.
4. When the browser permission prompt appears, choose **Block** / **Deny**.
5. Confirm an **app-level banner** appears with a brief explanation (e.g.
   "Location access is blocked — enable in Settings → Safari → Location" or equivalent).
6. Confirm the banner has a **dismiss button** (✕ or similar).
7. Confirm the **map** is still visible and pannable.
8. Open the **filter panel** (if collapsed, expand it) — confirm filters are interactive.
9. Switch to the **table/list view** (if available) — confirm it renders.
10. Click / tap the banner's **dismiss button** (✕).
11. Confirm the **banner disappears** and the rest of the UI is unchanged.

**Expected result:** Denial surfaces an app-level banner with a brief explanation; tapping ✕
dismisses it; map, filter panel, and table remain fully interactive throughout.

**Result:**

- [ ] PASS
- [ ] FAIL

**Device / browser / OS version:**

**Notes:**

---

## Scenario 4 — iOS Standalone Permission (LOC-01 / LOC-03 — REAL DEVICE ONLY)

**Requirement:** LOC-01 / LOC-03 — On a physical iOS device launched from the home screen
(standalone mode), the geolocation permission dialog fires correctly; granting it shows the
blue dot; a subsequent relaunch auto-activates GPS with no second prompt (D-03 path).

**Why manual:** iOS isolates standalone-PWA permissions from Safari tab permissions — this
behavior is **NOT reproducible in the Xcode Simulator** (see Research Pitfall 3). A physical
iPhone or iPad is required.

**IMPORTANT: Do NOT use the Xcode Simulator for this scenario. Simulator results are invalid.**

**Device:** Physical iPhone or iPad running iOS 16+ with Safari

**Steps — Install the app:**

1. Open the deployed `/app` URL in **Safari** on the iOS device (connected to the network).
2. Install the app to the home screen via **Share icon → Add to Home Screen**, following the
   in-app install popover instructions.
3. Confirm the BeeAtlas icon appears on the iOS home screen.

**Steps — Clear location permission:**

4. Open **Settings → Safari → Location** on the device.
5. Find the BeeAtlas site (or `beeatlas.com` / your local host) and **remove / set to "Ask"**
   so the permission will be re-prompted.
   - Alternatively: Settings → Privacy & Security → Location Services → Safari → set to "Ask".

**Steps — Test permission dialog in standalone mode:**

6. Launch the app by tapping the **home-screen icon** (not by opening Safari — the app must
   run in standalone mode, i.e., full-screen without a Safari address bar).
7. Confirm the app opens in **standalone mode** (no Safari chrome visible).
8. Tap the **GeolocateControl button** (top-right of the map).
9. Confirm the **iOS permission dialog** appears ("Allow [app] to use your location?").
10. Tap **Allow While Using App** (or "Allow Once").
11. Confirm the **blue dot appears** on the map at your current location.
12. Note the result for sub-step (d) — permission dialog fired correctly in standalone mode.

**Steps — Verify auto-activate on relaunch (D-03 path):**

13. Press the **Home button** to background the app, then swipe up to close it (or force-quit).
14. Tap the home-screen icon to **relaunch** the app.
15. Confirm **GPS auto-activates with NO permission prompt** — the blue dot should appear
    automatically, because permission is already granted (D-03 already-granted path).

**Expected result:**
- (a) The iOS permission dialog appears on first tap in standalone mode.
- (b) Granting permission shows the blue dot.
- (c) Relaunching the app (permission already granted) auto-activates GPS with no prompt.

**Result:**

- [ ] PASS
- [ ] FAIL

**Device / iOS version / Safari version:**

**Notes:**

---

## Verdict

**PASS** requires all four scenarios to record PASS (or a justified DEFERRED for hardware
unavailability that does not block the phase goal).

**Verdict:** [ ] PASS  [ ] FAIL

**If FAIL:** Record which scenario failed and route to `/gsd-plan-phase 152 --gaps` for gap
closure before advancing the phase.

**Signed off by:**

**Date:**
