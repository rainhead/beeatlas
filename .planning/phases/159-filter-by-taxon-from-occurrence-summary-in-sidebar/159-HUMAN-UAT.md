---
status: partial
phase: 159-filter-by-taxon-from-occurrence-summary-in-sidebar
source: [159-VERIFICATION.md]
started: 2026-06-22T23:55:00Z
updated: 2026-06-22T23:55:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Click a taxon name in the sidebar occurrence list
expected: Map filters to that taxon; an active filter chip for that taxon appears; other active filter dimensions (year, county, collector, etc.) remain unchanged.
result: [pending]

### 2. Click the demoted Ecdysis icon link (🔗) next to a taxon in a specimen (collector-group) row
expected: Opens the correct Ecdysis record page in a new tab; does NOT apply a taxon filter.
result: [pending]

### 3. Null-taxon rows show no clickable affordance
expected: "No determination" / "identification pending" / verbatim-only rows render as plain text — no pointer cursor, no role=button, clicking does nothing filter-related.
result: [pending]

### 4. Keyboard accessibility of the taxon-filter trigger (added in 6c8ffa15)
expected: Tab to a taxon name → a visible focus ring appears; pressing Enter or Space applies the taxon filter (same as a click).
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
