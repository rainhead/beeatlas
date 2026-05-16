---
status: partial
phase: 94-species-genus-pages
source: [94-VERIFICATION.md]
started: 2026-05-16T02:30:00Z
updated: 2026-05-16T02:30:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. CSS photo hero bug (CR-01) — fix before verifying visual layout
expected: Photo `<img>` on species pages has 4:3 aspect-ratio and object-fit: cover applied. Fix: apply class `photo-hero` to `<img>` in `_pages/species-detail.njk`, OR change selector in `taxon-pages.css` to `.taxon-page .media-grid img:first-child`.
result: [pending]

### 2. Seasonality chart renders in browser
expected: Open any species page (e.g. /species/Agapostemon/femoratus/) in a live browser; `<seasonality-viz>` renders 12 monthly bars with correct histogram data
result: [pending]

### 3. Color swatch ↔ SVG dot cross-check (D-02)
expected: On /species/Agapostemon/, the swatch color for Agapostemon angelicus (#d92626) matches dot colors in the genus SVG map
result: [pending]

### 4. Mobile responsive collapse
expected: Resize browser to <768px on either page type; single-column layout renders correctly (no overflow, no broken grid)
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
