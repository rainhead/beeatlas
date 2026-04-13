---
status: partial
phase: 52-header-component
source: [52-VERIFICATION.md]
started: 2026-04-13T13:20:00Z
updated: 2026-04-13T13:20:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Desktop header rendering
expected: Header bar visible at top of page; active tab (Specimens) visually distinct from inactive (Samples); Species and Plants greyed out; Map/Table icons on right side
result: [pending]

### 2. Layer switching with URL update
expected: Click Samples tab → map switches to samples layer; `lm=samples` appears in URL; browser back-button restores `lm=specimens` with correct active state
result: [pending]

### 3. View switching with URL update
expected: Click Table icon → `view=table` appears in URL; layout switches to table view; browser back-button restores map view
result: [pending]

### 4. URL round-trip on load
expected: Navigate to `/?lm=samples&view=table` → header shows Samples as active tab, Table icon as active; layer and view match URL params
result: [pending]

### 5. Responsive hamburger
expected: At ≤640px viewport, inline tabs hidden; hamburger icon visible; clicking hamburger opens dropdown with all 4 tabs (Specimens, Samples, Species disabled, Plants disabled); clicking Samples in hamburger switches layer and closes dropdown
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
