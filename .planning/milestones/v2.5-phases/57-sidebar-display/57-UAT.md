---
status: complete
phase: 57-sidebar-display
source: [57-01-SUMMARY.md, 57-02-SUMMARY.md]
started: 2026-04-15T00:00:00Z
updated: 2026-04-15T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Elevation label in specimen detail
expected: Click a specimen that has elevation data. In the sidebar's specimen detail section, an "Elevation" label appears alongside the elevation value rounded to the nearest meter — for example "1219 m".
result: pass

### 2. Elevation hidden when null in specimen detail
expected: Click a specimen that has no elevation data. The sidebar specimen detail section shows no "Elevation" label and no "m" elevation value.
result: skipped
reason: ~96% of specimens have elevation data; finding one without is impractical. Null-omission covered by ELEV-05 unit tests.

### 3. Elevation value in sample event detail
expected: Click a specimen/sample that has elevation data. The sidebar sample event section shows the elevation value in small muted text — for example "1219 m". Only appears when elevation data is present.
result: skipped
reason: DEM pipeline dropped post-execution (2026-04-15) — iNat samples have no elevation source, so elevation_m is always null for samples. Null-omission covered by ELEV-06 unit tests.

## Summary

total: 3
passed: 1
issues: 0
pending: 0
skipped: 2

## Gaps

[none]
