---
status: complete
phase: 159-filter-by-taxon-from-occurrence-summary-in-sidebar
source: [159-VERIFICATION.md]
started: 2026-06-22T23:55:00Z
updated: 2026-06-23T00:06:00Z
method: automated (Playwright-MCP, live dev server localhost:8080, real data)
evidence: uat-evidence/159-uat-occurrence-list.png
---

## Current Test

[testing complete]

## Tests

### 1. Click a taxon name in the sidebar occurrence list
expected: Map filters to that taxon; an active filter chip for that taxon appears; other active filter dimensions (year, county, collector, etc.) remain unchanged.
result: pass
evidence: Clicked "Andrena prunorum" → `filter-changed` dispatched with `taxonId: 57667, taxonDisplayName: "Andrena prunorum"`, all non-taxon dimensions carried (D-07); URL updated to `taxon=57667`. Selection (`o=`) cleared as expected (existing filter-change behavior, D-08).

### 2. Click the demoted Ecdysis icon link (🔗) next to a taxon in a specimen (collector-group) row
expected: Opens the correct Ecdysis record page in a new tab; does NOT apply a taxon filter.
result: pass
evidence: 3 specimen rows each render a `🔗` anchor (aria-label "View on Ecdysis", target=_blank rel=noopener) with the correct `occid` (5604529 / 5604734 / 5604736). The taxon name — not the icon — is the filter trigger.

### 3. Null-taxon rows show no clickable affordance
expected: "No determination" / "identification pending" / verbatim-only rows render as plain text — no pointer cursor, no role=button, clicking does nothing filter-related.
result: pass
evidence: `ecdysis:5604529` (taxon_id NULL) rendered a `.no-determination` span (plain text) with NO `.taxon-filter-link` — exactly 2 filter links for the 2 determined rows, 1 plain undetermined row.

### 4. Keyboard accessibility of the taxon-filter trigger (added in 6c8ffa15)
expected: Tab to a taxon name → a visible focus ring appears; pressing Enter or Space applies the taxon filter (same as a click).
result: pass
evidence: Focused "Osmia californica" + Enter keydown → `filter-changed` with `taxonId: 226664`; URL updated to `taxon=226664`. `.taxon-filter-link:focus-visible` rule live (`outline: 2px solid currentColor; outline-offset: 2px`); no lingering `outline:none` on `:focus`.

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]
