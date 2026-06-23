---
status: partial
phase: 161-add-wdfw-wildlife-areas-as-places
source: [161-VERIFICATION.md]
started: 2026-06-23T22:00:00Z
updated: 2026-06-23T22:00:00Z
---

# Phase 161: Add WDFW Wildlife Areas as Places — Human UAT

## Current Test

[awaiting human testing]

## Tests

### 1. WDFW areas selectable in Regions/place-filter UI and boundaries render
expected: Load `/app`, open the Regions panel — all 33 WDFW wildlife areas appear
as selectable place filters with correct names. Clicking one filters occurrences
to that area and draws its MultiPolygon boundary on the map.
why_human: Frontend auto-exposes new `places.toml` entries; visual and interactive
confirmation is the only way to verify the full UI rendering pipeline.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
