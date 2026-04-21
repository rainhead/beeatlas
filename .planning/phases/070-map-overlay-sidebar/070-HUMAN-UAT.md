---
status: partial
phase: 070-map-overlay-sidebar
source: [070-VERIFICATION.md]
started: 2026-04-21T18:20:00Z
updated: 2026-04-21T18:20:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Map stays full-width when sidebar opens
expected: In npm run dev, click any map point in landscape viewport — sidebar appears as a right-edge overlay; the map does not narrow, shift, or reflow horizontally
result: [pending]

### 2. Sidebar header layout — "Selected specimens" left, close button right
expected: With sidebar open, header shows "Selected specimens" label on the left and × close button on the right, both vertically centered
result: [pending]

### 3. Portrait orientation reverts to below-map flex layout
expected: Resize window to portrait aspect ratio (height > width) — sidebar moves below the map, occupies full width with a top border, is no longer an overlay; map is not obscured
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
