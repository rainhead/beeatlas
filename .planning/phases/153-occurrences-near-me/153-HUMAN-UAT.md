---
phase: 153-occurrences-near-me
plan: "03"
status: pending
gates: /gsd-verify-work
ui_hint: yes
auto_advance: false
created: 2026-06-20
---

# Phase 153 — Human UAT: Occurrences Near Me

**Status: PENDING** — Awaiting operator sign-off.

**UI hint: yes** — This phase must NOT auto-advance past this UAT checkpoint.
The `auto_advance: false` constraint is in effect (per `feedback_uat_ui_phases`).

**Gates:** `/gsd-verify-work` for Phase 153 is blocked until all six scenarios below are
recorded as Pass (or intentionally Deferred with rationale) and results are committed to this file.

Any Fail becomes gap-closure input for `/gsd-plan-phase 153 --gaps` — do NOT mark the phase
verified until all six scenarios show Pass (or Deferred).

**Automated invariants covered elsewhere:** The proximity SQL (bbox pre-filter + haversine distance
check), AND-composition logic, `?near=1` URL round-trip (parse/serialize), location-privacy
invariant (coordinates never in FilterState or URL), and frozen-position one-shot activation
flag are all unit-tested in Vitest (plans 01/02 — see `153-VALIDATION.md`). This file covers
ONLY the six behaviors that cannot run headless: the live OS geolocation prompt, a real GPS fix
narrowing to 10 km, frozen-set-on-walk + re-tap re-capture, the in-browser `[near-me]` console
timing measurement, the permission-denied path, and visual URL address-bar verification.

Requirements verified: **NEAR-01** (10 km chip, AND-composition, denial path),
**NEAR-02** (frozen set on walk, <200 ms timing log), **NEAR-03** (`?near=1` round-trip, clear).

---

## Prerequisites

Before running any scenario:

- [ ] Run the dev server for desktop/console scenarios:
  ```
  npm run dev
  ```
- [ ] For real-GPS scenarios (Scenarios 1, 3, 4, 5 on-device), serve the app over LAN or use
  the deployed `/app` URL on a physical phone with location services enabled.
- [ ] Confirm the build is green: `npm test && npm run build` must pass.
- [ ] For Scenario 1 and 3 (real GPS fix): have a physical device with GPS/Location Services on.
  iOS Simulator cannot reliably reproduce real geolocation in standalone mode — use a real device.

---

## Scenario 1 — Near-me filters to 10 km on a real GPS fix (NEAR-01, D-01/D-03)

**Requirement:** NEAR-01 — Tapping "Near me" activates the chip and, on a real GPS fix, filters
map and list/table occurrences to within 10 km of the user's actual position.

**Why manual:** Requires a real device GPS fix and the OS permission flow — not simulable in
jsdom/Vitest. The haversine correctness is unit-tested; this scenario confirms the end-to-end
chip→GeolocateControl→query→render pipeline on a live device.

**Device / environment:** Real phone (iOS or Android) at a known location, or desktop with
browser geolocation at a known location.

**Steps:**

1. Open the `/app` route (deployed or LAN-reachable).
2. Confirm the "Near me" button is visible in the filter panel (its own standalone row, not
   nested under Where/region chips).
3. Tap / click "Near me".
4. When the browser or OS permission prompt appears, choose **Allow** (or "Allow while using app").
5. Confirm the **chip immediately shows as active** ("Near me · 10 km") — the chip appears on
   tap before the GPS fix arrives (D-01 pending behavior).
6. Confirm the **GeolocateControl blue dot** appears on the map once the GPS fix lands (D-03
   coupling — "Near me" triggers the control).
7. Confirm the **map occurrence markers narrow** to those within roughly 10 km of your position.
8. Confirm the **list/table view** (switch to it if needed) also shows only nearby occurrences.
9. Confirm the **occurrence count** in the filter summary reflects only the nearby set.

**Expected result:** The chip activates immediately on tap; the GeolocateControl shows the blue
dot; once the GPS fix lands, the map and list/table narrow to occurrences within 10 km. The chip
reads "Near me · 10 km".

**Result:**

- [ ] PASS
- [ ] FAIL
- [ ] DEFERRED

**Device / browser / OS version:**

**Notes:**

---

## Scenario 2 — AND-composition with taxon and date filters (NEAR-01, SC-2)

**Requirement:** NEAR-01 — "Near me" AND-composes with all existing filters. Applying a taxon
(and/or date) filter with "Near me" active narrows both simultaneously; clearing the taxon keeps
"Near me" applied.

**Why manual:** AND-composition SQL logic is unit-tested, but the UI chip-state + live query
re-run sequence needs end-to-end visual confirmation.

**Device / environment:** Desktop browser or real device (GPS fix already obtained from
Scenario 1 is sufficient; re-tap if needed).

**Steps:**

1. With "Near me" active and the map/list showing nearby occurrences (from Scenario 1 or a
   fresh activation), open the filter panel.
2. Apply a **taxon filter** (e.g., select a genus or family) — confirm the occurrence set narrows
   further (only nearby occurrences of that taxon).
3. If available, also apply a **date/year filter** — confirm both filters remain applied
   simultaneously and the result is the intersection.
4. Clear the taxon filter (tap the taxon chip's ✕).
5. Confirm "Near me" is **still active** (chip remains, showing "Near me · 10 km") and the
   occurrence set returns to all nearby occurrences (only the taxon constraint was removed).
6. Clear "Near me" (tap the chip's ✕).
7. Confirm the chip disappears and the occurrence set returns to the full unfiltered set (or
   whatever other filters remain).

**Expected result:** Both filters apply simultaneously; removing the taxon chip leaves "Near me"
active; removing "Near me" leaves the taxon filter active (if still set). The two chips are
independently removable.

**Result:**

- [ ] PASS
- [ ] FAIL
- [ ] DEFERRED

**Device / browser / OS version:**

**Notes:**

---

## Scenario 3 — Frozen set on a ~100 m walk; re-tap re-captures (NEAR-02, D-04/D-05)

**Requirement:** NEAR-02 — The filtered occurrence set is frozen at the position captured when
the chip was activated. As the user moves (blue dot drifts), the set does NOT shift. Re-tapping
the chip (off then on) re-captures the new position and re-filters.

**Why manual:** Requires physical movement with live GPS — not reproducible headless. The
one-shot pending flag (`_nearMePending`) is source-tested, but the freeze behavior itself
requires real GPS drift.

**Device / environment:** Real phone with GPS. Walk at least ~100 m from your starting position.

**Steps:**

1. Activate "Near me" from a known starting position (Position A). Confirm the nearby set
   appears (same as Scenario 1).
2. Walk approximately 100+ m away from your starting position (Position B).
3. While walking, observe the **blue dot moves** on the map (GeolocateControl keeps tracking).
4. Confirm the **filtered occurrence set does NOT change** as you walk — the same set remains
   visible (the set is frozen at Position A, not following the blue dot).
5. Tap the "Near me" chip ✕ to **deactivate** (chip disappears, full occurrence set returns).
6. Tap "Near me" again to **reactivate** from your new position (Position B).
7. Confirm the **chip re-activates**, the GPS fix resolves, and the new nearby set is centered
   on Position B — a different (possibly overlapping) set than at Position A.

**Expected result:** The filtered set freezes at activation position and does not drift as the
blue dot moves. Re-tapping re-captures the current GPS position.

**Result:**

- [ ] PASS
- [ ] FAIL
- [ ] DEFERRED

**Device / browser / OS version:**

**Notes:**

---

## Scenario 4 — Console timing log reads under 200 ms (NEAR-02, SC-3)

**Requirement:** NEAR-02 — The proximity query completes in under 200 ms on the full occurrence
set (~97,648 rows). The in-app timing log (`[near-me] proximity query <ms> ms`) is the
measurement surface (validates Assumption A1: worker-RPC serialization overhead is within budget).

**Why manual:** Performance against the live worker + full DB cannot be asserted in the unit
test runner (mock DB); the Node probe in RESEARCH (12.7 ms) excluded worker-RPC overhead (A1).
This scenario confirms the real on-device number.

**Device / environment:** Desktop browser with DevTools open (Console tab). The full occurrence
DB must be loaded (not the dev-server empty state — use `npm run dev` against real data, or the
deployed `/app`).

**Steps:**

1. Open the `/app` route with DevTools open, Console tab visible.
2. Clear the console log (click the clear icon or Ctrl+L) so it is easy to spot the near-me
   timing line.
3. Tap / click "Near me", grant location if prompted.
4. Once the GPS fix arrives and the filter runs, look in the console for a line matching:
   `[near-me] proximity query <ms> ms, <rowCount> rows`
5. Note the reported elapsed time (e.g., `[near-me] proximity query 45.2 ms, 312 rows`).
6. Confirm the elapsed time is **under 200 ms**.
7. Confirm the line appears **only once** per activation (not on every subsequent filter change
   that does not involve near-me).

**Expected result:** A single `[near-me] proximity query ... ms` console.info line appears on
near-me activation; the elapsed time is under 200 ms; no such line appears on non-near-me
filter queries.

**Result:**

- [ ] PASS
- [ ] FAIL
- [ ] DEFERRED

**Measured elapsed time:**

**Row count reported:**

**Device / browser / OS version:**

**Notes:**

---

## Scenario 5 — Denial path surfaces the Phase 152 toast and leaves the chip inactive (NEAR-01, D-02)

**Requirement:** NEAR-01 — When location permission is denied or unavailable, the Phase 152
toast/banner appears and the "Near me" chip does NOT remain active or in a permanently-pending
state. The map, filter panel, and table are unaffected.

**Why manual:** Requires a real permission-denied OS state. The denial deactivation logic is
source-tested; end-to-end visual confirmation of the toast and chip state is needed.

**Device / environment:** Desktop or mobile browser. Reset location permission so the prompt
will reappear.

**Steps:**

1. **Reset location permission** for the site so the deny prompt will appear:
   - Chrome: DevTools → Application → Storage → "Clear site data", or address-bar lock icon →
     Site settings → Location → Reset to "Ask".
   - Firefox: address-bar lock → Clear permissions.
   - Safari: Preferences → Websites → Location → remove the site.
2. Open (or reload) the `/app` route.
3. Tap / click "Near me".
4. When the browser permission prompt appears, choose **Block** / **Deny**.
5. Confirm the **Phase 152 toast/banner** appears (the existing location-denial error banner —
   a brief message such as "Location access is blocked…").
6. Confirm the **"Near me" chip is NOT active** — it should have returned to the inactive
   button state ("Near me" button), not show "Near me · 10 km".
7. Confirm the **map**, **filter panel**, and **table/list** are still fully interactive and
   unaffected by the denial.
8. Dismiss the banner (✕ if present) and confirm the UI returns to normal state.

**Expected result:** Denial shows the Phase 152 toast and the chip reverts to inactive. The rest
of the app is unaffected. No stranded pending state.

**Result:**

- [ ] PASS
- [ ] FAIL
- [ ] DEFERRED

**Device / browser / OS version:**

**Notes:**

---

## Scenario 6 — URL round-trip: `?near=1`, no coordinates, deferred restore, and chip-remove clears (NEAR-03, D-07)

**Requirement:** NEAR-03 — "Near me" serializes as `?near=1` in the address bar. Coordinates
are NEVER in the URL. Reloading a `?near=1` URL re-activates geolocation and defers the query
until a fix arrives. Removing the chip drops `?near=1` from the URL.

**Why manual:** The coords-never-serialized regression is unit-tested, but the live address-bar
visual cross-check (T-153-01 privacy threat mitigation) and the deferred-restore flow on reload
require a real browser. Visual confirmation of the address bar is the human layer over the
automated test.

**Device / environment:** Desktop browser with the address bar visible.

**Steps:**

1. Open the `/app` route (no `?near=1` initially).
2. Tap "Near me" and grant location.
3. Observe the **address bar** — confirm it shows `?near=1` (or `…?near=1`) and **NO
   latitude/longitude or coordinate fragment** anywhere in the URL.
4. Copy the URL (with `?near=1`).
5. **Remove the chip** (tap ✕ on "Near me · 10 km").
6. Confirm `?near=1` **drops from the address bar** and the filter clears (full occurrence set
   returns).
7. **Paste and navigate to the copied `?near=1` URL** (or reload after re-adding `?near=1` to
   the address bar manually).
8. Confirm that on load with `?near=1`:
   - The chip re-activates (shows "Near me · 10 km" or its pending state).
   - Geolocation re-triggers (you may see the permission prompt if cleared, or the blue dot
     if already granted).
   - The filtered query **defers until the GPS fix arrives** (if a fix takes a moment, the
     chip shows active but the map holds until the fix lands — same deferred flow as a
     fresh tap, per D-01/D-07).
9. Confirm that at NO point does the address bar show coordinates (lat/lon, decimal degrees, or
   any position data).

**Expected result:** `?near=1` appears immediately on activation and disappears on chip-remove.
No coordinates appear in the URL at any time. The `?near=1` URL restores the deferred
geolocation flow on reload. The chip-remove both clears the chip and drops `?near=1`.

**Result:**

- [ ] PASS
- [ ] FAIL
- [ ] DEFERRED

**Device / browser / OS version:**

**Notes:**

---

## Verdict

**PASS** requires all six scenarios to record PASS (or a justified DEFERRED for circumstances
that do not block the phase goal — e.g., Scenario 3 DEFERRED if no walk is possible but the
freeze invariant is confirmed via source-analysis tests).

Requirements verified: **NEAR-01** (Scenarios 1, 2, 5), **NEAR-02** (Scenarios 3, 4),
**NEAR-03** (Scenario 6).

**Verdict:** [ ] PASS  [ ] FAIL

**If FAIL:** Record which scenario(s) failed and route to `/gsd-plan-phase 153 --gaps` for gap
closure before advancing the phase.

**Signed off by:**

**Date:**
