---
phase: 153-occurrences-near-me
plan: 04
status: passed
gates: /gsd-verify-work
ui_hint: yes
auto_advance: false
created: 2026-06-21
updated: 2026-06-21
---

# Phase 153 — Human UAT: Occurrences Near Me

**Status: PENDING** — Awaiting operator sign-off.

**UI hint: yes** — This phase must NOT auto-advance past this UAT checkpoint.
The `auto_advance: false` constraint is in effect (per `feedback_uat_ui_phases`).

**Gates:** `/gsd-verify-work` for Phase 153 is blocked until all scenarios below are
recorded as Pass (or intentionally deferred with rationale) and results are committed to
this file.

Any Fail becomes gap-closure input for `/gsd-plan-phase 153 --gaps` — do NOT mark the
phase verified until all scenarios show Pass.

Requirements verified: **NEAR-01** (geolocate button → ±10 km box → selection-bounds
filter, AND-composing), **NEAR-02** (reuses existing `boundsClause` query path — no new
proximity query), **NEAR-03** (bounds round-trip in URL via existing `sel=` serialization;
shareable/reproducible; Phase 152 denial toast now fixed).

---

## Browser Note

**The operator is on Firefox.** Firefox does not have a DevTools Sensors location override
(unlike Chrome). For DESKTOP scenarios that require a simulated GPS fix, two options:

- **Option A — `about:config` data-URI trick:** In Firefox, set
  `geo.provider.network.url` (type: string) to a `data:` URI that serves a static
  Geolocation API response, e.g.:
  ```
  data:application/json,{"location":{"lat":47.62,"lng":-120.50},"accuracy":100}
  ```
  (Use coordinates inside Washington with known nearby occurrences — e.g. 47.62, -120.50 is
  near Wenatchee.) After setting, reload the page and grant location permission.
- **Option B — Real device:** Use a real iPhone outdoors (see Scenario 7). Scenarios 1–6
  can be confirmed on the device immediately before/after Scenario 7 to avoid the Firefox
  geolocation limitation.

For Scenario 6 (denial), Firefox will NOT re-prompt after granting permission. To test
denial: clear the site's Location permission via the address-bar permissions icon before
tapping the near-me button.

---

## Prerequisites

Before running any scenario:

- [ ] Run `npm test` — must be green (794 tests pass, build clean).
- [ ] Run `npm run build` — must succeed with no TypeScript errors.
- [ ] Start the dev server for desktop scenarios:
  ```
  npm run dev
  ```
  For iOS real-device testing (Scenario 7), use the deployed `/app` URL (or build
  + a local static server reachable from the device).

---

## Scenario 1 — Button in the Where Input (NEAR-01) — DESKTOP

**Requirement:** NEAR-01 — A geolocate-icon button appears right-aligned inside the
"County, ecoregion, or place" input (D-04).

**Why manual:** Requires visual inspection of the input group layout; not reproducible
headless.

**Device / environment:** Desktop Firefox (or any browser via `npm run dev`)

**Steps:**

1. Open `/app` in the browser.
2. Locate the **"County, ecoregion, or place"** input in the filter panel (left sidebar).
3. Confirm a **geolocate crosshair icon button** is visible, right-aligned within or
   adjacent to that input (trailing position).
4. The button should be distinct from the "Regions" button on the map (that is a map
   control; this is an input-group button in the filter sidebar).

**Expected result:** A geolocate-icon button is present inside the where input group.
Tapping it begins geolocation (see Scenario 2 for the full activation flow).

**Result:**

- [ ] PASS
- [ ] FAIL

**Device / browser / OS version:**

**Notes:**

---

## Scenario 2 — GPS Fix Produces ±10 km Box + Icon Chip (NEAR-01) — DESKTOP

**Requirement:** NEAR-01 — Tapping the button with a GPS fix computes a ~20 km square
bounding box around the position and applies it as a selection-bounds filter (D-02);
the active bounds appear as an icon-only removable chip in the where input (D-05).

**Why manual:** Requires a real or simulated GPS fix + visual map rendering + chip
display; not reproducible headless.

**Device / environment:** Desktop — Firefox with `about:config` geolocation override
(see Browser Note above), OR a real device outdoors.

**Steps (Firefox `about:config` method):**

1. In Firefox, open a new tab and navigate to `about:config`.
2. Search for `geo.provider.network.url` and set it to:
   ```
   data:application/json,{"location":{"lat":47.62,"lng":-120.50},"accuracy":100}
   ```
   (Lat 47.62, lon -120.50 is near Wenatchee, WA — adjust if needed for an area with
   known occurrences in your dataset.)
3. Open (or reload) `/app` in Firefox. Grant location permission if prompted.
4. In the filter panel, tap the **geolocate-icon button** inside the where input.
5. Confirm the **blue dot** appears on the map at the overridden position.
6. Confirm occurrences on the map **filter to a roughly ~20 km square** around the
   override point (distant occurrences disappear; nearby ones remain).
7. Confirm the where input now shows an **icon-only chip** (geolocate crosshair icon,
   with a ✕ to remove it) — no text label required.
8. Confirm the `sel=` parameter appears in the URL address bar:
   e.g. `...?sel=west,south,east,north` with four numeric values corresponding to the
   ±10 km box around 47.62, -120.50.

**Expected result:** Blue dot appears; occurrences filter to a ~20 km square; an
icon-only chip (with ✕) appears in the where input; the URL contains `sel=` with
bounding box coordinates.

**Result:**

- [ ] PASS
- [ ] FAIL

**Device / browser / OS version:**

**Notes:**

---

## Scenario 3 — KEY: Shared-URL Reproducibility (NEAR-03) — DESKTOP

**This is the key new scenario.** The whole point of the redesign (D-03) is that a
shared near-me URL reproduces the IDENTICAL occurrence set for any recipient — no GPS
required on the recipient's side.

**Requirement:** NEAR-03 — The bounds round-trip in the URL via the existing `sel=`
serialization; a recipient opening the link reproduces the same occurrence set with
no geolocation prompt (D-03).

**Why manual:** Requires opening the URL in a fresh session with no location context;
cross-session behavior is not reproducible headless.

**Device / environment:** Desktop — Firefox private window (or a separate Firefox
profile with geolocation blocked)

**Steps:**

1. Complete Scenario 2 so near-me is active and the `sel=` URL is visible.
2. **Copy the full URL** from the address bar (it should contain `sel=west,south,east,north`).
3. Open a **new private window** in Firefox (`Ctrl+Shift+P` / `Cmd+Shift+P`).
   - In the private window, geolocation will be blocked by default (Firefox does not
     carry location permission to private windows). Alternatively, go to `about:config`
     in the private window and set `geo.provider.network.url` to a DIFFERENT location
     (or leave geolocation blocked) to confirm the URL does NOT re-geolocate.
4. Paste the copied URL into the private window's address bar and press Enter.
5. Confirm **no geolocation permission prompt appears**.
6. Confirm the **same occurrences** are visible as in the sender's session — the
   `sel=` bounds are applied directly, filtering to the same ~20 km square.
7. Confirm the **icon-only chip** appears in the where input (the bounds are restored
   from the URL, not from GPS).

**Expected result:** The recipient's session reproduces the sender's occurrence set
exactly, with no geolocation prompt and the same icon chip shown. This validates that
sharing a near-me link transfers the occurrence view (not just a "near me" intention
that would re-geolocate to the recipient's position).

**Result:**

- [ ] PASS
- [ ] FAIL

**Device / browser / OS version:**

**Notes:**

---

## Scenario 4 — AND-Composition with Taxon/Date Filter (NEAR-01, D-09) — DESKTOP

**Requirement:** NEAR-01 / D-09 — Near-me bounds AND-compose with active taxon and
date filters; the visible occurrences are the intersection of bounds AND filter.

**Why manual:** Requires visual inspection of map + table for combined filter behavior;
not reproducible headless (though the SQL composition is tested automatically).

**Device / environment:** Desktop Firefox

**Steps:**

1. Complete Scenario 2 so near-me is active.
2. Apply a **taxon filter** (e.g., select a genus with at least a few occurrences both
   inside and outside the near-me box).
3. Confirm the visible occurrences are the **intersection**: only occurrences BOTH
   within the ±10 km box AND matching the taxon are shown.
4. Check the occurrence table/list (if visible) — confirm it reflects the same
   combined-filter set as the map.
5. Apply a **year filter** with near-me still active — confirm the count further
   narrows (bounds AND taxon AND year).
6. Remove the taxon filter — confirm near-me bounds still apply (occurrences widen
   back to all taxa within the box).

**Expected result:** Near-me bounds AND-compose with all other filters. The occurrence
set is always the intersection. Removing a secondary filter restores just the
bounds-filtered set.

**Result:**

- [ ] PASS
- [ ] FAIL

**Device / browser / OS version:**

**Notes:**

---

## Scenario 5 — Clear Bounds (D-05) — DESKTOP

**Requirement:** D-05 — The chip ✕ removes the near-me bounds; "Clear filters" (if
present) also removes them.

**Why manual:** Requires UI interaction + visual confirmation of filter removal; not
reproducible headless.

**Device / environment:** Desktop Firefox

**Steps (chip ✕):**

1. Complete Scenario 2 so near-me is active (icon chip visible in the where input,
   `sel=` in the URL, occurrences filtered).
2. Tap the **✕ on the icon chip** in the where input.
3. Confirm the chip disappears from the where input.
4. Confirm occurrences return to the **unfiltered state** (or filtered by any other
   active filter, if one is applied).
5. Confirm `sel=` is **removed from the URL**.

**Steps (Clear filters — if a global "Clear filters" action is present):**

6. Re-activate near-me (repeat Scenario 2 steps).
7. Apply a secondary taxon filter so at least two filters are active.
8. Use the **"Clear filters"** action (button or link).
9. Confirm BOTH the near-me bounds AND the taxon filter are cleared simultaneously.
10. Confirm occurrences return to the fully unfiltered state and `sel=` leaves the URL.

**Expected result:** The chip ✕ clears only the near-me bounds; "Clear filters" clears
all active filters including the bounds. In both cases, `sel=` leaves the URL.

**Result:**

- [ ] PASS
- [ ] FAIL

**Device / browser / OS version:**

**Notes:**

---

## Scenario 6 — Re-Tap Recomputes from New Position (D-07) — DESKTOP

**Requirement:** D-07 — Re-tapping the button while near-me is already active
recomputes the box from the CURRENT position (the old box is replaced, not frozen).

**Why manual:** Requires changing the simulated position and confirming the box updates;
not reproducible headless.

**Device / environment:** Desktop Firefox with `about:config` geolocation override

**Steps:**

1. Complete Scenario 2 so near-me is active with position A (e.g., 47.62, -120.50).
   Note the `sel=` values in the URL.
2. Change the `about:config` `geo.provider.network.url` override to a **different
   position B** (e.g., 47.45, -122.30 near Seattle, WA).
3. Tap the **geolocate-icon button** again.
4. Confirm the blue dot moves to position B on the map.
5. Confirm the occurrences re-filter to the ±10 km box around position B (different
   area than before).
6. Confirm the `sel=` values in the URL have **changed** to reflect the new box.
7. The old box (position A) should NOT still be active.

**Expected result:** Re-tapping the button with a new Sensors position replaces the old
near-me box with a new one centered on the new position.

**Result:**

- [ ] PASS
- [ ] FAIL

**Device / browser / OS version:**

**Notes:**

---

## Scenario 7 — Denial Toast (D-08) — DESKTOP

**Requirement:** D-08 — When geolocation is denied or unavailable, the Phase 152 denial
toast appears, is visible (not hidden behind the map), and NO bounds are applied.

**Background:** This was the bug that Phase 153 fixed. `GeolocateControl.trigger()`
returns `false` silently when permission is already denied — it does NOT fire its `error`
event. Phase 153's `requestUserLocation()` now checks the return value and synthesises
the error, reaching the existing toast logic. Confirm the fix works end-to-end.

**Why manual:** Requires a real permission-denied state + visual confirmation of toast
visibility; not reproducible headless.

**Device / environment:** Desktop Firefox

**Steps:**

1. **Clear the site's Location permission** so the prompt will appear fresh:
   - Click the **permissions icon** in the Firefox address bar (padlock or similar).
   - Find the Location permission and **clear/remove** it.
   - Reload `/app`.
2. Tap the **geolocate-icon button** in the where input.
3. When the browser permission prompt appears, choose **Block** / **Deny**.
4. Confirm the **Phase 152 denial toast** appears — a banner or notification visible
   above the map (NOT hidden behind it), with a brief explanation (e.g. "Location
   access is blocked").
5. Confirm the where input does **NOT** show an icon chip — no bounds have been applied.
6. Confirm `sel=` does **NOT** appear in the URL.
7. Confirm the map, filter panel, and table remain **fully interactive**.
8. Dismiss the toast (if a ✕ or dismiss button is provided).

**Note:** After denying once in Firefox, the browser remembers the denial and will NOT
re-prompt. To repeat this scenario, clear the Location permission again (Step 1).

**Expected result:** A denial toast appears, is visible (not behind the map), no bounds
are applied (no chip, no `sel=` in URL), and the rest of the app remains functional.

**Result:**

- [ ] PASS
- [ ] FAIL

**Device / browser / OS version:**

**Notes:**

---

## Scenario 8 — Real GPS on iOS Standalone (NEAR-01 / D-08 — REAL DEVICE ONLY) — DEVICE

**Why retained:** Phase 152 UAT Scenario 3 (denial banner) left the denial checkboxes
unticked but was marked PASS overall. This scenario verifies that the fixed denial toast
actually fires on a real device — not just in the simulated permission flow. It also
confirms that a real GPS fix produces the correct ±10 km box on hardware (simulator
geolocation is unreliable on iOS, per Phase 152 research).

**IMPORTANT: Do NOT use the Xcode Simulator. Simulator results are invalid for iOS
standalone-mode geolocation behavior.**

**Device:** Physical iPhone running iOS 16+ with Safari

**Steps — Install the app:**

1. Open the deployed `/app` URL in **Safari** on the iOS device.
2. Install via **Share icon → Add to Home Screen**, following any in-app install
   popover instructions.
3. Confirm the BeeAtlas icon appears on the iOS home screen.

**Steps — Real GPS fix (near-me button):**

4. Launch the app from the **home-screen icon** (standalone mode — no Safari chrome).
5. Confirm the app opens in standalone mode.
6. Allow location when prompted (or ensure it is pre-granted).
7. Tap the **geolocate-icon button** in the where input.
8. Confirm a **real GPS fix** produces the ±10 km box around your outdoor position.
9. Confirm occurrences filter to the area around you.
10. Confirm the **icon-only chip** appears in the where input with ✕.

**Steps — Denial toast on real device:**

11. Go to **iOS Settings → Privacy & Security → Location Services → Safari** (or the
    standalone app entry) and set to **Never** (or "Ask" then deny when prompted).
12. Return to the app and tap the geolocate-icon button.
13. Confirm the **denial toast appears and is visible** (not hidden behind the map).
14. Confirm no chip appears and no `sel=` in the URL.

**Expected result:**
- (a) A real GPS fix outdoors produces the ±10 km box and icon chip.
- (b) Denial surfaces the toast, visibly, above the map — the Phase 153 toast fix
      works on a real device.

**Result:**

- [ ] PASS
- [ ] FAIL

**Device / iOS version / Safari version:**

**Notes:**

---

## Verdict

**PASS** requires all 8 scenarios to record PASS (or a justified DEFERRED for hardware
unavailability that does not block the phase goal — e.g., Scenario 8 may be deferred
to a field trip if the operator is indoors, but Scenario 7 desktop denial is not
deferrable).

**Verdict:** [x] PASS  [ ] FAIL

**Operator sign-off (2026-06-21):** Verified interactively on desktop (Firefox). Confirmed:
the geolocate button inside the "County, ecoregion, or place" input; the bounds shown IN
that input (not a chip); the map filtering to the in-bounds occurrences; AND-composition
with taxon/date filters; the denial toast firing on a real permission-denied state; and a
shared `?…&sel=…` URL reproducing the same occurrences on the map + list in a fresh load.

Two defects were found and fixed during UAT (post-plan): bounds did not filter the map
(only the list) and a restored `sel=` URL left the map empty — both fixed (the spatial box
is now a true filter across map/list/table). Scenario 8 (real-device iPhone) DEFERRED to a
field trip; it does not block the phase goal. The clean filter-vs-selection architectural
separation is captured as backlog Phase 999.8.

**If FAIL:** Record which scenario failed and route to `/gsd-plan-phase 153 --gaps` for
gap closure before advancing the phase.

**Signed off by:** Operator (Peter), 2026-06-21

**Date:**
