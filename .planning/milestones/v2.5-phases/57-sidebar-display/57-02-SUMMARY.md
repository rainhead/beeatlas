---
phase: 57-sidebar-display
plan: "02"
subsystem: frontend-components
tags: [elevation, lit, typescript, vitest, sidebar]
dependency_graph:
  requires: [elevation_m on Sample and SampleEvent interfaces (57-01)]
  provides: [conditional elevation rows in bee-specimen-detail and bee-sample-detail]
  affects: [frontend/src/bee-specimen-detail.ts, frontend/src/bee-sample-detail.ts, frontend/src/tests/bee-sidebar.test.ts]
tech_stack:
  added: []
  patterns: [strict !== null guard for conditional Lit template rendering, Math.round() for integer elevation display]
key_files:
  created: []
  modified:
    - frontend/src/bee-specimen-detail.ts
    - frontend/src/bee-sample-detail.ts
    - frontend/src/tests/bee-sidebar.test.ts
decisions:
  - "Used existing .host-label CSS class for elevation label in bee-specimen-detail — no new CSS rule needed"
  - "Added .event-elevation CSS rule in bee-sample-detail matching .event-count/.event-observer pattern (flat value-only div)"
  - "Strict !== null check per UI-SPEC to prevent rendering when elevation_m is undefined"
metrics:
  duration: "5 minutes"
  completed: "2026-04-16"
  tasks_completed: 2
  files_modified: 3
---

# Phase 57 Plan 02: Elevation Display in Sidebar Detail Components Summary

Conditional elevation rows rendered in bee-specimen-detail (ELEV-05) and bee-sample-detail (ELEV-06) with Math.round integer formatting and strict null-omission, covered by 4 new Vitest tests.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add conditional elevation rows to both detail components | aa4c427 | bee-specimen-detail.ts, bee-sample-detail.ts |
| 2 | Add ELEV-05 and ELEV-06 Vitest describes | 9433207 | bee-sidebar.test.ts |

## What Was Built

- `bee-specimen-detail.ts`: added elevation row after `.sample-meta` (collector/fieldNumber), uses `<span class="host-label">Elevation</span>` label and `Math.round(sample.elevation_m) m` value; only rendered when `sample.elevation_m !== null`
- `bee-sample-detail.ts`: added `.event-elevation` CSS rule (`font-size: 0.8rem; color: var(--text-muted)`); added `<div class="event-elevation">${Math.round(event.elevation_m)} m</div>` after `.event-count`, only when `event.elevation_m !== null`
- `bee-sidebar.test.ts`: 4 new tests in 2 describe blocks — ELEV-05 (specimen: shows "1219 m"/"Elevation" when non-null, omits "Elevation" when null) and ELEV-06 (sample: shows "1219 m" when non-null, omits " m" when null)

## Verification

- `npx tsc --noEmit`: zero errors
- `npm test -- --run`: 149 tests pass, 3 pre-existing TABLE failures unchanged
- ELEV-05 positive test: passes — shadow DOM contains "1219 m" and "Elevation"
- ELEV-06 positive test: passes — shadow DOM contains "1219 m"

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. Elevation data flows from parquet through interfaces (Plan 01) and is now rendered in the UI.

## Threat Flags

None. No new trust boundaries, network endpoints, or user-input processing introduced.

## Pre-existing Test Failures (out of scope)

Three tests in `bee-table.test.ts` were failing before this plan and remain failing (same as Plan 01):
- `TABLE-01: renders 7 specimen column headers when layerMode is specimens`
- `TABLE-08: specimen mode with sortBy=date shows sort indicator (▼) on Date header`
- `TABLE-08: specimen mode with sortBy=modified shows sort indicator (▼) on Modified header`

## Self-Check: PASSED

- frontend/src/bee-specimen-detail.ts: FOUND (contains `sample.elevation_m !== null`, `Math.round(sample.elevation_m)`, `host-label">Elevation`)
- frontend/src/bee-sample-detail.ts: FOUND (contains `event.elevation_m !== null`, `Math.round(event.elevation_m)`, `.event-elevation`)
- frontend/src/tests/bee-sidebar.test.ts: FOUND (contains `ELEV-05`, `ELEV-06`, `elevation_m: 1219`, `elevation_m: null`)
- Commit aa4c427: FOUND
- Commit 9433207: FOUND
