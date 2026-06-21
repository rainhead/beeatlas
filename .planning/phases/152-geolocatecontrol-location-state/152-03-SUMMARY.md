---
phase: 152-geolocatecontrol-location-state
plan: 03
status: complete
completed: 2026-06-20
requirements-completed: [LOC-01, LOC-03]
---

# Plan 152-03 Summary — Human UAT

## What this plan delivered

Real-device + manual-browser verification of the behaviors that cannot be exercised
headless: blue dot/recenter, offline GPS, denial banner, and iOS standalone permission.
Produced `152-HUMAN-UAT.md` (the verification checklist) and a blocking human-verify
checkpoint that was **operator-approved on 2026-06-20** (desktop + mobile).

## Verdict: PASS

All scenarios approved by the operator. The automatable LOC-02 state-owner/pure-presenter
invariants were already proven by `src/tests/geolocation.test.ts` (Plans 01/02).

## UAT finding (fixed during verification)

The `GeolocateControl` initially rendered **hidden behind the custom `.region-control`
("Regions") button** — both defaulted to the top-right corner of the map. Fixed by
relocating the control to **top-left** (`this._map.addControl(geolocate, 'top-left')` in
`src/bee-map.ts`). Operator confirmed the button is now visible and usable on desktop and
mobile.

**Deviation logged:** This departs from CONTEXT.md **D-02** ("top-right — Mapbox default"),
which did not account for the existing custom Regions control occupying that corner.
Top-left was empty; the blue dot / accuracy ring / recenter behavior is unaffected by the
corner change.

## Key files

- `.planning/phases/152-geolocatecontrol-location-state/152-HUMAN-UAT.md` (created — verification checklist + signed verdict)
- `src/bee-map.ts` (UAT fix — GeolocateControl relocated to `'top-left'`)
- `eleventy.config.js` (dev-server `allowedHosts` += Tailscale MagicDNS host, to serve the dev server over HTTPS for on-device iOS testing)

## Self-Check: PASSED

- `npx tsc --noEmit` clean
- `npm test` green (full suite)
- Operator UAT verdict: PASS (signed 2026-06-20)
