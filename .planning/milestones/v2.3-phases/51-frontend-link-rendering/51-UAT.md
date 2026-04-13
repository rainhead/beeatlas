---
status: complete
phase: 51-frontend-link-rendering
source: [51-01-SUMMARY.md]
started: 2026-04-13T17:30:00Z
updated: 2026-04-13T17:50:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Specimen with WABA observation shows camera emoji link
expected: Click a specimen cluster that has a specimen_observation_id in the data. The detail sidebar shows a 📷 link after the host plant link (separated by ·). Clicking the 📷 link opens https://www.inaturalist.org/observations/{id} in a new tab.
result: pass

### 2. Specimen without WABA observation shows no camera link
expected: Click a specimen cluster that does NOT have a specimen_observation_id. The detail sidebar shows no 📷 link and no placeholder text (no "WABA: —" or similar). The host plant link row is unchanged.
result: pass

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
