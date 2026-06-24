---
status: passed
phase: 165-duplicate-occurrence-rows-shared-occ-id
source: [165-VERIFICATION.md]
started: 2026-06-24
updated: 2026-06-24
method: headless Playwright-MCP against local /app (occurrences.db regenerated via sqlite_export.py); map source feature counts read from the live mapbox GeoJSON source
---

## Current Test

[complete — all items passed via headless UAT]

## Tests

### 1. waba_specimen toggle shows/hides the ~33 specimen points on the map
expected: A new "WABA specimens" source toggle appears in the sidebar source filter (5th entry). Toggling it off hides ~33 points; toggling on shows them. (`src=` URL param accepts `waba_specimen`.)
result: PASS — 5th toggle "WABA specimens" present; toggling off dropped the occurrences source from 97674→97641 features (exactly −33, `waba_specimen` removed), all other sources unchanged. `src=` round-trips the value.

### 2. waba_sample toggle now controls the ~28 provisional plant/sample records
expected: The existing toggle (relabelled "Provisional samples") shows/hides ~28 plant-obs points — NOT the old bee-specimen set.
result: PASS — toggle relabelled "Provisional samples"; toggling off dropped 97641→97613 features (exactly −28, `waba_sample` removed).

### 3. waba_specimen detail card renders correctly
expected: Open `o=inat_obs:<id>&pane=list` for one of the 33 specimens — card shows taxon name, quality badge, observer, a working iNat `obs_url` link, and the "Awaiting Ecdysis catalogue entry" hint.
result: PASS — `o=inat_obs:243686416`: card shows "Agapostemon femoratus", date, "View on iNaturalist" → https://www.inaturalist.org/observations/243686416, and "Awaiting Ecdysis catalogue entry" hint.

### 4. WR-01 live link check — provisional card iNat link is not /observations/null
expected: Open a `waba_sample` (provisional) detail card; the iNat observation link resolves to a real plant-obs URL (built from `observation_id`), not `.../observations/null`.
result: PASS — `o=inat:208960044`: link "View WABA observation" → https://www.inaturalist.org/observations/208960044 (no null link present).

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None — all items passed.
