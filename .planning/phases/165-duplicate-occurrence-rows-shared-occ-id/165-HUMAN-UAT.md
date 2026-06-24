---
status: partial
phase: 165-duplicate-occurrence-rows-shared-occ-id
source: [165-VERIFICATION.md]
started: 2026-06-24
updated: 2026-06-24
---

## Current Test

[awaiting human testing]

## Tests

### 1. waba_specimen toggle shows/hides the ~33 specimen points on the map
expected: A new "WABA specimens" source toggle appears in the sidebar source filter (5th entry). Toggling it off hides ~33 points; toggling on shows them. (`src=` URL param accepts `waba_specimen`.)
result: [pending]

### 2. waba_sample toggle now controls the ~28 provisional plant/sample records
expected: The existing toggle (relabelled "Provisional samples") shows/hides ~28 plant-obs points — NOT the old bee-specimen set.
result: [pending]

### 3. waba_specimen detail card renders correctly
expected: Open `o=inat_obs:<id>&pane=list` for one of the 33 specimens — card shows taxon name, quality badge, observer, a working iNat `obs_url` link, and the "Awaiting Ecdysis catalogue entry" hint.
result: [pending]

### 4. WR-01 live link check — provisional card iNat link is not /observations/null
expected: Open a `waba_sample` (provisional) detail card; the iNat observation link resolves to a real plant-obs URL (built from `observation_id`), not `.../observations/null`.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
