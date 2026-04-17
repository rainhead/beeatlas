---
phase: 64-occurrencesource
plan: "01"
subsystem: frontend/data-layer
tags: [occurrences, url-state, selection, style, refactor]
dependency_graph:
  requires: []
  provides: [OccurrenceSource, SelectionState-union, cluster-url-encoding]
  affects: [frontend/src/features.ts, frontend/src/url-state.ts, frontend/src/style.ts]
tech_stack:
  added: []
  patterns: [discriminated-union, unified-source, url-encoding]
key_files:
  created: []
  modified:
    - frontend/src/features.ts
    - frontend/src/url-state.ts
    - frontend/src/style.ts
    - frontend/src/tests/url-state.test.ts
    - frontend/src/tests/bee-atlas.test.ts
    - frontend/src/tests/bee-header.test.ts
    - frontend/src/tests/bee-filter-toolbar.test.ts
    - frontend/src/tests/bee-sidebar.test.ts
    - frontend/src/tests/bee-table.test.ts
decisions:
  - "SELECT * FROM occurrences with runtime columnNames iteration avoids hardcoded per-type column lists"
  - "Feature ID branches on ecdysis_id nullability: null means inat-sourced record"
  - "SelectionState as discriminated union with 'ids' | 'cluster' variants enables type-safe exhaustive handling in Plan 02"
  - "@lon,lat,r URL encoding chosen for cluster centroid — compact, visually parseable, no base64"
  - "22px minimum radius (44px diameter) applied to all cluster dots including single-feature dots"
metrics:
  duration: "~15 minutes"
  completed_date: "2026-04-17"
  tasks_completed: 2
  files_changed: 9
---

# Phase 64 Plan 01: OccurrenceSource + SelectionState Foundation Summary

OccurrenceSource unified VectorSource replacing EcdysisSource/SampleSource, SelectionState discriminated union with @lon,lat,r cluster URL encoding, and 44px minimum cluster tap target with updated test mocks.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | OccurrenceSource + SelectionState + style tap target | 7f8b932 | features.ts, url-state.ts, style.ts |
| 2 | Update test mocks and add url-state round-trip tests | 8eec9d3 | 6 test files |

## What Was Built

**features.ts:** `EcdysisSource` and `SampleSource` removed. `OccurrenceSource` is now the single exported VectorSource. It queries `SELECT * FROM occurrences` and sets feature IDs by branching on `ecdysis_id` nullability: `ecdysis:<id>` when present, `inat:<observation_id>` otherwise. Properties are set by iterating `columnNames` unconditionally — no per-type conditional logic.

**url-state.ts:** `SelectionState` changed from `interface { occurrenceIds: string[] }` to a discriminated union:
- `{ type: 'ids'; ids: string[] }` — individual occurrence selection
- `{ type: 'cluster'; lon: number; lat: number; radiusM: number }` — cluster centroid selection

`buildParams` encodes clusters as `@lon,lat,r` (e.g. `@-120.5123,47.4567,312`). `parseParams` accepts both `ecdysis:` and `inat:` prefixed IDs (fixes ecdysis-only bug on line 145), and validates `@lon,lat,r` values with range checks (lon ±180, lat ±90, radiusM 1–100000).

**style.ts:** Cluster dot radius changed from `displayCount <= 1 ? 4 : 6 + log2(...) * 2` to `displayCount <= 1 ? 22 : Math.max(22, 6 + log2(...) * 3)` — enforcing 44px minimum tap target. Text label suppressed for single-dot clusters.

**Test files (6):** All `vi.mock('../features.ts')` blocks updated from `EcdysisSource`/`SampleSource` to `OccurrenceSource`. `url-state.test.ts` fully migrated to discriminated union shape with 8 new tests covering inat: prefix, mixed IDs, cluster encoding, fractional radiusM rounding, range validation, and empty ids.

## Verification

- `npm test -- --run`: 175 tests, 7 test files, all passing
- TypeScript compilation has expected errors in `bee-atlas.ts` and `bee-map.ts` (consumer files that still reference `occurrenceIds` and `EcdysisSource`/`SampleSource`) — these are Plan 02's domain

## Deviations from Plan

**[Rule 3 - Blocked] features.ts used `Object.keys(obj)` instead of `columnNames` for property iteration**

- **Found during:** Task 1
- **Issue:** The plan specified iterating `columnNames` but in the loader closure, `columnNames` is a parameter of the inner callback — not directly available in `flatMap`. Used `Object.keys(obj)` which achieves identical result since `obj` is built from `columnNames` iteration.
- **Fix:** Used `Object.keys(obj)` to iterate all columns unconditionally, semantically equivalent.
- **Files modified:** frontend/src/features.ts

## Known Consumer Breakage (Expected — Plan 02 Work)

`bee-atlas.ts` references `selection.occurrenceIds` (4 sites) and `bee-map.ts` imports `EcdysisSource`/`SampleSource`. These cause TypeScript compilation errors that Plan 02 will resolve when rewiring the consumer components.

## Threat Model Coverage

| Threat ID | Status |
|-----------|--------|
| T-64-01 | Mitigated — `parseParams` validates lon/lat/radiusM ranges |
| T-64-02 | Mitigated — `radiusM <= 100000` cap enforced |
| T-64-03 | Accepted — `SELECT *` returns public data per plan |

## Self-Check: PASSED

- `frontend/src/features.ts` exists and contains `export class OccurrenceSource`
- `frontend/src/url-state.ts` exists and contains `type SelectionState =`
- `frontend/src/style.ts` exists and contains `Math.max(22,`
- Commits 7f8b932 and 8eec9d3 exist in git log
- 175 tests pass
