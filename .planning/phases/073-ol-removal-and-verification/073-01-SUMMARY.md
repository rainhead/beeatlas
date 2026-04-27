---
phase: 073-ol-removal-and-verification
plan: 01
subsystem: frontend
tags: [cleanup, dependencies, migration]
dependency_graph:
  requires: []
  provides: [clean-dependency-tree, ol-free-codebase]
  affects: [frontend/package.json, frontend/src/bee-atlas.ts]
tech_stack:
  removed: [ol, ol-mapbox-style, rbush, "@types/rbush"]
  patterns: [npm-workspace-lockfile]
key_files:
  deleted:
    - frontend/src/region-layer.ts
    - frontend/package-lock.json
  modified:
    - frontend/package.json
    - frontend/src/bee-atlas.ts
    - frontend/src/tests/bee-atlas.test.ts
    - frontend/src/tests/bee-header.test.ts
    - frontend/src/tests/bee-filter-toolbar.test.ts
    - frontend/src/tests/bee-sidebar.test.ts
    - frontend/src/tests/bee-table.test.ts
    - package-lock.json
decisions:
  - Removed stale frontend/package-lock.json since project uses npm workspaces with root-level lockfile
metrics:
  duration: 3m45s
  completed: 2026-04-27T02:48:38Z
  tasks: 2/2
  files_changed: 8
---

# Phase 073 Plan 01: OL Removal and Test Mock Cleanup Summary

Removed OpenLayers packages (ol, ol-mapbox-style) and all OL-era dead code from the frontend, including the region-layer.ts stub, its import in bee-atlas.ts, and stale test mocks referencing OL-era exports (OccurrenceSource, regionLayer, countySource, ecoregionSource, boundaryStyle, selectedBoundaryStyle).

## Task Results

### Task 1: Remove OL packages and delete region-layer.ts stub
**Commit:** d9ff562

- Uninstalled `ol` and `ol-mapbox-style` from frontend/package.json
- Deleted `frontend/src/region-layer.ts` (no-op stub from Phase 71)
- Removed `loadBoundaries` import and call from `bee-atlas.ts`
- Regenerated root `package-lock.json` without `rbush` and `@types/rbush`
- Removed stale `frontend/package-lock.json` (workspace uses root lockfile)
- Verified: no source file (excluding tests) imports from `ol`, `ol-mapbox-style`, or `region-layer`
- Verified: `rbush` is absent from lockfile; `quickselect` remains as a legitimate `mapbox-gl` transitive dependency

### Task 2: Clean up stale OL-era test mocks and verify all tests pass
**Commit:** 9736358

- Removed `vi.mock('../region-layer.ts', ...)` blocks from all 5 test files
- Replaced stale `OccurrenceSource` mock with `loadOccurrenceGeoJSON` mock (matching actual `features.ts` exports) in 4 test files (bee-header, bee-filter-toolbar, bee-sidebar, bee-table)
- All 172 tests pass (7 test files, 0 failures)
- TypeScript compiles cleanly (`tsc --noEmit` exits 0)

## Deviations from Plan

### Plan Inaccuracy

**1. quickselect remains in lockfile (expected by plan to be removed)**
- The plan stated rbush and quickselect should both be absent from the lockfile after OL removal
- quickselect is a transitive dependency of mapbox-gl (via its spatial indexing), not of OL
- rbush was correctly removed (was OL-specific via @types/rbush)
- quickselect remaining is correct behavior; the plan's expectation was inaccurate

**2. frontend/package-lock.json deletion (not in plan)**
- A stale `frontend/package-lock.json` (2,648 lines) existed alongside the root lockfile
- Since the project uses npm workspaces with a root-level lockfile, the frontend-level lockfile was redundant
- It was removed during the clean npm install; this deletion is intentional and correct

## Verification Results

| Check | Result |
|-------|--------|
| `ol` not in package.json | PASS |
| `ol-mapbox-style` not in package.json | PASS |
| `mapbox-gl`, `lit`, `wa-sqlite`, `hyparquet` still in package.json | PASS |
| `rbush` not in lockfile | PASS |
| `region-layer.ts` does not exist | PASS |
| No `region-layer` reference in bee-atlas.ts | PASS |
| No `loadBoundaries` reference in bee-atlas.ts | PASS |
| No OL imports in any source file | PASS |
| No stale OL-era mocks in test files | PASS |
| All 172 tests pass | PASS |
| TypeScript compiles cleanly | PASS |

## Self-Check: PASSED
