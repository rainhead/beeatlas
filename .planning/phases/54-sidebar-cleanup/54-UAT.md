---
status: diagnosed
phase: 54-sidebar-cleanup
source: [54-01-SUMMARY.md]
started: 2026-04-13T00:00:00Z
updated: 2026-04-13T01:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Sidebar opens on specimen click
expected: Click any specimen point on the map. The sidebar panel should appear showing specimen detail. Before clicking, no sidebar is visible.
result: pass

### 2. Sidebar opens on sample click
expected: Switch to sample layer, click any sample point. The sidebar appears showing sample detail.
result: pass

### 3. Close button dismisses sidebar
expected: With the sidebar open, click the × button in the sidebar header. The sidebar closes and disappears.
result: pass

### 4. Layer change closes sidebar
expected: Open the sidebar by clicking a point. Then switch layers (e.g., specimens → samples). The sidebar collapses/closes automatically.
result: pass

### 5. Empty map click closes sidebar
expected: With sidebar open and boundary mode off, click an empty area of the map (no point). The sidebar closes.
result: issue
reported: "stayed open, with no records shown"
severity: major

### 6. URL state restores sidebar
expected: Click a point to open the sidebar (URL updates with occIds). Copy the URL, open it in a new tab or reload. The sidebar opens automatically showing the same detail.
result: pass

### 7. Removed sections absent
expected: With the sidebar open, confirm there is no layer toggle, no view toggle, no summary stats panel, no recent collections list, and no feeds/activity section — just the detail content for the clicked point.
result: issue
reported: "yes, except there is an unnecessary Back button in addition to the close button"
severity: minor

## Summary

total: 7
passed: 5
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Clicking empty map space (boundary mode off) closes the sidebar"
  status: failed
  reason: "User reported: stayed open, with no records shown"
  severity: major
  test: 5
  root_cause: "_onMapClickEmpty else-branch (bee-atlas.ts:578-584) clears selection state but never sets _sidebarOpen = false"
  artifacts:
    - path: "frontend/src/bee-atlas.ts"
      issue: "_onMapClickEmpty does not set this._sidebarOpen = false in the else branch"
  missing:
    - "Add this._sidebarOpen = false in _onMapClickEmpty else branch before _pushUrlState()"

- truth: "Sidebar shows only the × close button in the header — no other navigation buttons"
  status: failed
  reason: "User reported: yes, except there is an unnecessary Back button in addition to the close button"
  severity: minor
  test: 7
  root_cause: "bee-specimen-detail.ts and bee-sample-detail.ts have pre-existing .back-btn elements that pre-date the sidebar cleanup; now redundant alongside the sidebar's own × close button"
  artifacts:
    - path: "frontend/src/bee-specimen-detail.ts"
      issue: ".back-btn button at line 110 is now redundant"
    - path: "frontend/src/bee-sample-detail.ts"
      issue: ".back-btn button at line 86 is now redundant"
  missing:
    - "Remove .back-btn button and styles from bee-specimen-detail.ts"
    - "Remove .back-btn button and styles from bee-sample-detail.ts"
