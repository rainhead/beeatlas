---
phase: quick
plan: 260411-pru
subsystem: frontend/rendering
tags: [display, specimen, ecdysis, bug-fix]
dependency_graph:
  requires: []
  provides: [no-determination-display]
  affects: [bee-specimen-detail, bee-map, bee-atlas]
tech_stack:
  added: []
  patterns: [conditional-lit-template, null-normalization]
key_files:
  created: []
  modified:
    - frontend/src/bee-specimen-detail.ts
    - frontend/src/bee-map.ts
    - frontend/src/bee-atlas.ts
    - frontend/src/tests/bee-sidebar.test.ts
decisions:
  - Render "No determination" as a styled span inside the ecdysis anchor rather than replacing the anchor itself, preserving clickable link behavior for unidentified specimens
metrics:
  duration: ~8 minutes
  completed: 2026-04-11
  tasks_completed: 1
  files_modified: 4
---

# Quick Task 260411-pru: Unidentified Specimens Display "No determination"

**One-liner:** Null/empty `scientificName` now renders "No determination" (non-italic, hint color) in the specimen detail sidebar instead of a blank link.

## What Was Done

Unidentified specimens (e.g. ecdysis ID 5611752) had null or empty `scientificName` values that flowed through to the sidebar as blank text, producing confusing output like " · Erigeron linearis RG". Three changes fix this end-to-end:

1. **`bee-specimen-detail.ts` (render template, line 114):** Changed `${s.name}` to a conditional — truthy name renders as before; falsy name renders `<span class="no-determination">No determination</span>`.

2. **`bee-specimen-detail.ts` (CSS):** Added `.no-determination { font-style: normal; color: var(--text-hint); }` to remove inherited italic from `.species-list` and dim the placeholder text.

3. **`bee-map.ts` (line 47):** Changed `f.get('scientificName') as string` to `(f.get('scientificName') as string) || ''` so null/undefined from OL features normalizes to empty string, triggering the display fallback consistently.

4. **`bee-atlas.ts` (line 775):** Changed `String(obj.scientificName)` to `obj.scientificName ? String(obj.scientificName) : ''` to prevent `String(null)` producing the literal string `"null"` in DuckDB-restored selections.

## TDD Cycle

- **RED commit:** `fb1fdc2` — Added failing test asserting "No determination" renders for a specimen with `name: ''`
- **GREEN commit:** `01928e3` — Implemented all four changes; test passes

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — display-only change, no new security surface.

## Self-Check

- [x] `frontend/src/bee-specimen-detail.ts` modified (conditional render + CSS)
- [x] `frontend/src/bee-map.ts` modified (name normalization)
- [x] `frontend/src/bee-atlas.ts` modified (null guard)
- [x] `frontend/src/tests/bee-sidebar.test.ts` modified (new test)
- [x] RED commit fb1fdc2 exists
- [x] GREEN commit 01928e3 exists
- [x] TypeScript check passes (no errors)
- [x] 124/125 tests pass (pre-existing BeeFilterControls failure unrelated to this task)

## Self-Check: PASSED
