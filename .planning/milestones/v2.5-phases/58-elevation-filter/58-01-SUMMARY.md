---
phase: 58-elevation-filter
plan: "01"
subsystem: frontend-data
tags: [filter, elevation, url-state, typescript, tests]
dependency_graph:
  requires: []
  provides: [FilterState.elevMin, FilterState.elevMax, buildFilterSQL-elevation, elev_min-url-param, elev_max-url-param]
  affects: [frontend/src/filter.ts, frontend/src/url-state.ts, frontend/src/bee-atlas.ts, frontend/src/bee-filter-controls.ts, frontend/src/bee-map.ts]
tech_stack:
  added: []
  patterns: [D-06-conditional-null-elevation-semantics, parseInt-null-fallback]
key_files:
  created: []
  modified:
    - frontend/src/filter.ts
    - frontend/src/url-state.ts
    - frontend/src/bee-atlas.ts
    - frontend/src/bee-filter-controls.ts
    - frontend/src/bee-map.ts
    - frontend/src/tests/filter.test.ts
    - frontend/src/tests/url-state.test.ts
decisions:
  - "elevMin/elevMax defaults added to all existing FilterState literals rather than making the interface Partial — keeps type safety strict"
  - "_onFilterChanged in bee-atlas.ts uses (detail as any).elevMin ?? null until Plan 02 extends FilterChangedEvent"
metrics:
  duration_minutes: 25
  completed_date: "2026-04-16T14:35:58Z"
  tasks_completed: 3
  files_modified: 7
---

# Phase 58 Plan 01: Elevation Filter Data Layer Summary

**One-liner:** FilterState extended with elevMin/elevMax fields, D-06 conditional null SQL clauses in buildFilterSQL, and elev_min/elev_max URL param round-trip with parseInt || null security mitigation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend FilterState, buildFilterSQL, isFilterActive | dbd7993 | filter.ts, bee-atlas.ts, bee-filter-controls.ts, bee-map.ts |
| 2 | Extend url-state.ts with elev_min/elev_max | 2d29628 | url-state.ts |
| 3 | Add elevation tests | 6520f83 | filter.test.ts, url-state.test.ts |

## What Was Built

Extended the frontend data layer with full elevation filter support:

1. **FilterState interface** (`filter.ts`) — two new fields `elevMin: number | null` and `elevMax: number | null` appended after `selectedCollectors`.

2. **buildFilterSQL** (`filter.ts`) — elevation block after collector block with D-06 conditional null semantics:
   - Both set → `elevation_m IS NOT NULL AND elevation_m BETWEEN min AND max` (nulls excluded)
   - Min only → `(elevation_m IS NULL OR elevation_m >= min)` (nulls pass through)
   - Max only → `(elevation_m IS NULL OR elevation_m <= max)` (nulls pass through)
   - Neither → no clause added

3. **isFilterActive** (`filter.ts`) — two new conditions `|| f.elevMin !== null || f.elevMax !== null`.

4. **URL state** (`url-state.ts`) — `elev_min`/`elev_max` params encoded when non-null, decoded via `parseInt(...) || null` (NaN/empty → null, no injection surface).

5. **Companion fixes** (bee-atlas.ts, bee-filter-controls.ts, bee-map.ts) — added `elevMin: null, elevMax: null` to all existing FilterState object literals to satisfy TypeScript's strict interface check.

6. **Tests** — 13 new tests: 4 SQL clause cases, 3 isFilterActive cases, 6 URL round-trip cases.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] FilterState interface change required updates to 3 companion files**
- **Found during:** Task 1 verification (tsc --noEmit)
- **Issue:** Adding required fields to FilterState broke compilation in bee-atlas.ts (3 literals), bee-filter-controls.ts (1 literal), bee-map.ts (1 literal)
- **Fix:** Added `elevMin: null, elevMax: null` to all 5 affected FilterState object literals. For `_onFilterChanged` in bee-atlas.ts where `FilterChangedEvent` doesn't yet carry elevation fields (Plan 02 scope), used `(detail as any).elevMin ?? null` to avoid breaking the event contract prematurely.
- **Files modified:** frontend/src/bee-atlas.ts, frontend/src/bee-filter-controls.ts, frontend/src/bee-map.ts
- **Committed with:** Task 1 commit (dbd7993)

## Known Stubs

None. All elevation fields are wired through the data layer. The UI inputs (Plan 02) will populate these fields; until then they default to null (filter inactive).

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond those documented in the plan's threat model (T-58-01, T-58-02).

## Test Results

- filter.test.ts: all tests pass (including 7 new elevation tests)
- url-state.test.ts: all tests pass (including 6 new elevation URL round-trip tests)
- bee-table.test.ts: 3 pre-existing failures unrelated to this plan (TABLE-01, TABLE-08 sort indicator tests) — out of scope, logged to deferred items

## Self-Check: PASSED

Files exist:
- frontend/src/filter.ts — FOUND (elevMin field, BETWEEN clause, IS NULL OR >= clause)
- frontend/src/url-state.ts — FOUND (elev_min param, elevMin in result.filter)
- frontend/src/tests/filter.test.ts — FOUND (elevation filter describe block)
- frontend/src/tests/url-state.test.ts — FOUND (elevation param round-trip describe block)

Commits exist:
- dbd7993 — FOUND
- 2d29628 — FOUND
- 6520f83 — FOUND
