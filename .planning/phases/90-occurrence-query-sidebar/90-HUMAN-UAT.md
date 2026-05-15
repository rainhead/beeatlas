---
status: partial
phase: 90-occurrence-query-sidebar
source: [90-VERIFICATION.md]
started: 2026-05-15T16:11:00Z
updated: 2026-05-15T16:11:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Rectangle over populated area
expected: Sidebar opens showing matched occurrences in date-descending order via bee-occurrence-detail
result: [pending]

### 2. Filter + rectangle
expected: Sidebar shows only filter-passing occurrences (subset of unfiltered result)
result: [pending]

### 3. Rectangle over empty area (Pacific Ocean)
expected: Sidebar does not open; no console errors
result: [pending]

### 4. New rectangle while sidebar open
expected: Sidebar closes immediately (synchronous clear fires before async query), does not reopen for empty result
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
