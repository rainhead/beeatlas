---
phase: 57-sidebar-display
plan: "01"
subsystem: frontend-data-pipeline
tags: [elevation, duckdb, typescript, interfaces]
dependency_graph:
  requires: []
  provides: [elevation_m on Sample and SampleEvent interfaces]
  affects: [bee-sidebar.ts, features.ts, bee-map.ts, bee-atlas.ts]
tech_stack:
  added: []
  patterns: [BigInt coercion via Number(), loose != null guard for DuckDB nulls]
key_files:
  created: []
  modified:
    - frontend/src/bee-sidebar.ts
    - frontend/src/features.ts
    - frontend/src/bee-map.ts
    - frontend/src/bee-atlas.ts
    - frontend/src/tests/bee-sidebar.test.ts
decisions:
  - "elevation_m belongs on Sample (not Specimen) — all specimens in one sample share the same coordinates and elevation"
  - "Loose != null guard used for DuckDB null coercion, consistent with host_observation_id and specimen_observation_id patterns"
metrics:
  duration: "8 minutes"
  completed: "2026-04-15"
  tasks_completed: 2
  files_modified: 5
---

# Phase 57 Plan 01: Elevation Data Pipeline Threading Summary

elevation_m threaded from DuckDB parquet queries through OL feature properties to Sample and SampleEvent TypeScript interfaces, ready for Plan 02 rendering.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend interfaces and thread elevation_m through data layer | 443bb59 | bee-sidebar.ts, features.ts, bee-map.ts, bee-atlas.ts |
| 2 | Update existing test fixtures with elevation_m field | 11913f9 | bee-sidebar.test.ts |

## What Was Built

- `Sample` interface extended with `elevation_m: number | null` in `bee-sidebar.ts`
- `SampleEvent` interface extended with `elevation_m: number | null` in `bee-sidebar.ts`
- `EcdysisSource` DuckDB SELECT now includes `elevation_m`; `setProperties` coerces via `Number()` with `!= null` guard
- `SampleSource` DuckDB SELECT now includes `elevation_m`; `setProperties` coerces identically
- `buildSamples()` in `bee-map.ts` reads `elevation_m` from OL feature properties into the Sample map literal
- `_buildRecentSampleEvents()` in `bee-map.ts` includes `elevation_m` in the returned SampleEvent literal
- `map-click-sample` emit in `bee-map.ts` includes `elevation_m` in the event detail
- `_restoreSelectionSamples()` in `bee-atlas.ts` SELECTs `elevation_m` and includes it in the Sample map literal (prevents disappearing elevation on browser back/forward navigation)
- All 5 existing Sample fixtures in `bee-sidebar.test.ts` updated with `elevation_m: null`

## Verification

- `npx tsc --noEmit`: zero errors
- `npm test -- --run`: 145 tests pass; 3 pre-existing failures in `bee-table.test.ts` (TABLE-01, TABLE-08) are unrelated to this plan and present at the base commit

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. elevation_m flows through the pipeline to Sample and SampleEvent objects. Rendering is deferred to Plan 02 by design.

## Threat Flags

None. No new trust boundaries or network endpoints introduced.

## Pre-existing Test Failures (out of scope)

Three tests in `bee-table.test.ts` were failing before this plan and remain failing:
- `TABLE-01: renders 7 specimen column headers when layerMode is specimens`
- `TABLE-08: specimen mode with sortBy=date shows sort indicator (▼) on Date header`
- `TABLE-08: specimen mode with sortBy=modified shows sort indicator (▼) on Modified header`

These are logged to deferred-items but not fixed — out of scope for this plan.

## Self-Check: PASSED

- frontend/src/bee-sidebar.ts: FOUND (contains `elevation_m: number | null` in both interfaces)
- frontend/src/features.ts: FOUND (contains `elevation_m` in both sources)
- frontend/src/bee-map.ts: FOUND (contains `elevation_m` in buildSamples, _buildRecentSampleEvents, map-click-sample)
- frontend/src/bee-atlas.ts: FOUND (contains `elevation_m` in _restoreSelectionSamples)
- frontend/src/tests/bee-sidebar.test.ts: FOUND (5 occurrences of `elevation_m: null`)
- Commit 443bb59: FOUND
- Commit 11913f9: FOUND
