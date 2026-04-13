---
phase: 51-frontend-link-rendering
plan: "01"
subsystem: frontend
tags: [lit, duckdb-wasm, openLayers, specimen-links, inat]
dependency_graph:
  requires: []
  provides: [specimenObservationId-in-Specimen-interface, camera-emoji-link-in-sidebar]
  affects: [frontend/src/bee-sidebar.ts, frontend/src/bee-map.ts, frontend/src/bee-atlas.ts, frontend/src/bee-specimen-detail.ts]
tech_stack:
  added: []
  patterns: [conditional-Lit-template-rendering, DuckDB-SELECT-column-extension]
key_files:
  created: []
  modified:
    - frontend/src/bee-sidebar.ts
    - frontend/src/bee-map.ts
    - frontend/src/bee-atlas.ts
    - frontend/src/bee-specimen-detail.ts
    - frontend/src/tests/bee-sidebar.test.ts
decisions:
  - Camera emoji link rendered after the hostObservationId conditional block; both are independent — a specimen may have either, both, or neither
  - specimenObservationId optional field (?) on Specimen interface mirrors hostObservationId pattern; undefined renders as no link
metrics:
  duration_minutes: 7
  completed_date: "2026-04-13"
  tasks_completed: 2
  files_modified: 5
---

# Phase 51 Plan 01: Frontend Specimen Observation Link Rendering Summary

One-liner: Added `specimenObservationId` through the full frontend data flow (OL feature props, DuckDB SELECT, Specimen interface) and rendered it as a conditional camera emoji link in the specimen detail sidebar.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add specimenObservationId to data flow and render | fee317c | bee-sidebar.ts, bee-map.ts, bee-atlas.ts, bee-specimen-detail.ts |
| 2 | Add Vitest coverage for specimen photo link rendering | b8370af | frontend/src/tests/bee-sidebar.test.ts |

## What Was Built

Four touch-points updated following the existing `hostObservationId` pattern:

1. **bee-sidebar.ts** — `Specimen` interface gains `specimenObservationId?: number | null`
2. **bee-map.ts** — `buildSamples()` extracts `f.get('specimen_observation_id')` and maps it to `specimenObservationId` in the species push
3. **bee-atlas.ts** — DuckDB URL-restore query SELECT list extended with `specimen_observation_id`; Specimen construction maps it to `specimenObservationId`
4. **bee-specimen-detail.ts** — After the `hostObservationId` ternary, a second conditional renders `· 📷` as an `<a>` to `inaturalist.org/observations/${s.specimenObservationId}` only when non-null

Three new Vitest tests in `FRONT-01: specimen photo link rendering` describe block verify:
- Camera link present with correct href and emoji when `specimenObservationId` is set
- No camera link when `specimenObservationId` is null (host observation link still present)
- Camera link independent of `hostObservationId` (renders even when host obs is null; iNat: — placeholder still shows)

## Verification

- `npx tsc --noEmit` — exits 0, no TypeScript errors
- `npm test` — 134 of 135 tests pass (3 new FRONT-01 tests all green)
- Pre-existing failure: `DECOMP-01 BeeFilterControls has @property declarations for required inputs` — `boundaryMode` property missing; confirmed pre-existing before this plan's changes, out of scope

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. `specimenObservationId` flows from ecdysis.parquet (via `specimen_observation_id` column added in Phase 50) through DuckDB and OL features to the render template. No hardcoded values or placeholders.

## Threat Flags

No new threat surface introduced beyond what is documented in the plan's threat model (T-51-01, T-51-02 both accepted).

## Self-Check: PASSED

- `frontend/src/bee-sidebar.ts` — contains `specimenObservationId?: number | null` ✓
- `frontend/src/bee-map.ts` — contains `specimen_observation_id` and `specimenObservationId: specObsId` ✓
- `frontend/src/bee-atlas.ts` — contains `specimen_observation_id` in SELECT and `specimenObservationId: obj.specimen_observation_id` ✓
- `frontend/src/bee-specimen-detail.ts` — contains `s.specimenObservationId != null` and camera emoji link ✓
- `frontend/src/tests/bee-sidebar.test.ts` — contains FRONT-01 describe block with 3 tests ✓
- Commits fee317c and b8370af exist ✓
