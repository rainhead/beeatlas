---
status: resolved
phase: 37-sidebar-decomposition
source: [37-VERIFICATION.md]
started: 2026-04-04T00:00:00Z
updated: 2026-04-04T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Browser End-to-End Sidebar Verification
expected: All filter interactions (taxon, year, month, county, ecoregion), boundary toggle, chip removal, specimen detail + Back button, sample detail + Back button, URL filter restore, and browser back/forward all work identically to before the decomposition
result: failed

**Issue:** Removing a taxon filter chip causes a brief flicker — all specimens appear momentarily (unfiltered), then the filtered view snaps back. Toggling another filter resolves the state. Suspected double-render race between chip removal triggering an internal update and the `filter-changed` event arriving at bee-atlas.

## Summary

total: 1
passed: 0
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- status: failed
  description: Taxon chip removal causes brief unfiltered flicker before correct filtered state restores. Toggling another filter fixes it. Likely a double-update between chip removal and filter-changed event propagation through shadow DOM.
  debug_session: ~
