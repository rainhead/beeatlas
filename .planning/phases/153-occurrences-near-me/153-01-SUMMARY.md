---
phase: 153-occurrences-near-me
plan: "01"
subsystem: filter-model
tags: [proximity, geolocation, sql, url-state, tdd]
dependency_graph:
  requires: []
  provides:
    - FilterState.nearMe
    - buildFilterSQL(f, nearMeCenter?)
    - queryVisibleGeoJSON(f, nearMeCenter?)
    - queryListPage(f, ..., nearMeCenter?)
    - queryTablePage(f, ..., nearMeCenter?)
    - queryAllFiltered(f, sortBy, nearMeCenter?)
    - queryOccurrencesByBounds(f, bounds, nearMeCenter?)
    - buildParams(near=1)
    - parseParams(near=1 -> nearMe: true)
  affects:
    - src/filter.ts
    - src/url-state.ts
    - src/tests/filter.test.ts
    - src/tests/url-state.test.ts
    - src/tests/filter-join-execution.test.ts
tech_stack:
  added: []
  patterns:
    - pure-SQL haversine with bbox pre-filter in buildFilterSQL
    - ephemeral center threaded as separate arg (never on FilterState)
    - isFinite guard before numeric SQL interpolation
key_files:
  created: []
  modified:
    - src/filter.ts
    - src/url-state.ts
    - src/tests/filter.test.ts
    - src/tests/url-state.test.ts
    - src/tests/filter-join-execution.test.ts
decisions:
  - "Pure-SQL haversine (not JS post-filter): math extension confirmed in wa-sqlite 3.44.0; 12.7 ms on 97,648 rows"
  - "Center threaded as nearMeCenter arg, never on FilterState (D-07 privacy constraint)"
  - "nearMeCenter is last parameter in all 5 query functions, defaults null, so existing call sites require no changes"
  - "isFinite guard applied before interpolation (T-153-02/V5: rejects NaN/Infinity from GPS API)"
metrics:
  duration: "5m 12s"
  completed: "2026-06-21"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 5
---

# Phase 153 Plan 01: nearMe Model + URL Foundation Summary

Pure-SQL bbox+haversine proximity filter on `FilterState.nearMe: boolean` with `?near=1` URL round-trip; center threaded as ephemeral arg separate from FilterState.

## What Was Built

### Filter model (`src/filter.ts`)

- `FilterState.nearMe: boolean` — new field (not nullable, default conceptually `false`). Coordinates are structurally excluded from `FilterState` (D-07).
- `isFilterActive` — `|| f.nearMe` added; `nearMe` now participates in both the mapbox-gl style-cache bypass and `queryVisibleGeoJSON`'s non-null path automatically (CLAUDE.md Architecture Invariant).
- `buildFilterSQL(f, nearMeCenter? = null)` — new optional second parameter. When `f.nearMe && nearMeCenter !== null && isFinite(lat) && isFinite(lon)`:
  - **Bbox pre-filter clause**: `lat BETWEEN (lat-dLat) AND (lat+dLat) AND lon BETWEEN (lon-dLon) AND (lon+dLon)`
    - `dLat = 10 / 111.32 ≈ 0.0898°` (constant)
    - `dLon = 10 / (111.32 * cos(lat * π / 180))` ≈ 0.133° at lat 47.6
  - **Exact haversine clause**: `6371.0 * 2 * asin(sqrt(power(sin(radians(lat - ${lat}) / 2), 2) + cos(radians(${lat})) * cos(radians(lat)) * power(sin(radians(lon - (${lon})) / 2), 2))) <= 10.0`
  - Both use bare `lat`/`lon` (no `o.` prefix) — matching existing bounds clauses; unambiguous because only `occurrences` has these columns.
  - Both clauses AND-joined with all existing clauses via the existing `occurrenceClauses.join(' AND ')`.
- Five query functions gain optional `nearMeCenter` as last parameter (defaults `null`), each forwarding it to `buildFilterSQL`:
  - `queryVisibleGeoJSON(f, nearMeCenter?)`
  - `queryListPage(f, page, sortBy, ..., selectionBounds, nearMeCenter?)`
  - `queryTablePage(f, page, sortBy, ..., selectedInatObsIds, nearMeCenter?)`
  - `queryAllFiltered(f, sortBy, nearMeCenter?)`
  - `queryOccurrencesByBounds(f, bounds, nearMeCenter?)`

### URL serialization (`src/url-state.ts`)

- `buildParams`: `if (filter.nearMe) params.set('near', '1')` — only the boolean, no coordinates (D-07).
- `parseParams`: `const nearMe = p.get('near') === '1'`
- `hasFilter` OR-chain: `|| nearMe` added (parallel copy of `isFilterActive` — RESEARCH Pitfall 1).
- `result.filter` literal: `nearMe` included.

### Tests

- `src/tests/filter.test.ts` (+11 tests): `emptyFilter()` updated with `nearMe: false`; nearMe describe covers `isFilterActive`, bbox+haversine clause shape, null-center omission, `nearMe:false` omission, NaN/Infinity isFinite guard, AND-composition with `yearFrom`.
- `src/tests/url-state.test.ts` (+9 tests): `emptyFilter()` updated; nearMe describe covers `near=1` serialize, no-coordinate assertion, absent when false, `parseParams` recovery, `hasFilter` gate, full round-trip.
- `src/tests/filter-join-execution.test.ts` (+10 tests / 2 rows added): `emptyFilter()` updated; 2 new rows seeded for proximity fixture (C: lat=47.645/lon=-122.3, inside; D: lat=48.0/lon=-122.3, outside); real-engine `queryListPage` and `queryOccurrencesByBounds` haversine correctness tests.

## Proximity Fixture (for verifier / 153-02 reference)

| Row | ecdysis_id | lat    | lon    | Distance from center | In 10km? |
|-----|------------|--------|--------|----------------------|----------|
| A   | 5001       | 47.6   | -122.3 | 0 km (at center)     | YES      |
| B   | inat:9001  | 47.7   | -122.4 | ~13.4 km             | NO       |
| C   | 5002       | 47.645 | -122.3 | ~4.95 km             | YES      |
| D   | inat:9002  | 48.0   | -122.3 | ~44.4 km             | NO       |

**Center**: lat=47.6, lon=-122.3. **Expected in-radius count**: 2 (rows A and C).

## Deviations from Plan

None — plan executed exactly as written.

The plan note correctly predicted that the full `npm run build` (tsc) would fail until Plan 153-02 backfills `nearMe: false` into component-side FilterState literals. This plan's gate (`npm test -- filter url-state`) is green; the build gate belongs to 153-02.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. The two mitigations from the plan's threat register were implemented:

- **T-153-01** (Information Disclosure): `nearMe` is a bare boolean on `FilterState`; `buildParams` only emits `near=1`; no coordinate serialization structurally possible. Wave-0 test `url-state.test.ts` asserts no `lat=`/`lon=` in serialized params.
- **T-153-02** (Tampering): `isFinite(lat) && isFinite(lon)` guard in `buildFilterSQL` before haversine SQL interpolation; test covers NaN lat and Infinity lon cases.

## Self-Check

### Files exist:
- [x] src/filter.ts (modified)
- [x] src/url-state.ts (modified)
- [x] src/tests/filter.test.ts (modified)
- [x] src/tests/url-state.test.ts (modified)
- [x] src/tests/filter-join-execution.test.ts (modified)

### Commits:
- e0cf9a55: test(153-01): add failing Wave-0 tests for nearMe model + URL round-trip
- a0bcca0e: feat(153-01): add nearMe to FilterState, isFilterActive, and buildFilterSQL
- 300d1ad7: feat(153-01): add ?near=1 URL round-trip to buildParams + parseParams

## Self-Check: PASSED
