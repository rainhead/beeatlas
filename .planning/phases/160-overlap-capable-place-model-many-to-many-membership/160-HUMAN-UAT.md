---
status: partial
phase: 160-overlap-capable-place-model-many-to-many-membership
source: [160-VERIFICATION.md]
started: 2026-06-23
updated: 2026-06-23
---

## Current Test

[awaiting human testing]

## Tests

### 1. D-04 — sidebar lists all member place names for a multi-place occurrence
expected: When an occurrence falls inside more than one place (e.g. a point in the
overlap of two place polygons), the sidebar occurrence detail renders ALL of its
member place names (`.member-place` chips), legibly styled and correctly placed —
not just one, and not raw slugs. An occurrence in a single place shows that one
place; an occurrence in no place shows none. Component tests assert the names
render; this item confirms the live visual styling/placement only.
result: [pending]

how to test: load the app, select/open an occurrence known to sit in overlapping
places. (Real example surfaced during verification: occurrence `inat_obs:320276469`
resolves to 2 places.) Note: WDFW areas (Phase 161) will create many more overlaps;
today's overlaps come from any pre-existing place geometry that overlaps another.

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
