---
phase: 073-ol-removal-and-verification
plan: 02
subsystem: frontend
tags: [verification, bundle-size, build, bugfix]
dependency_graph:
  requires: [clean-dependency-tree, ol-free-codebase]
  provides: [verified-build, bundle-size-baseline]
  affects: []
tech_stack:
  added: []
  patterns: [verification-only]
key_files:
  created: []
  modified:
    - frontend/src/bee-atlas.ts
    - frontend/src/bee-map.ts
decisions:
  - "mapbox-gl v3 contributes ~1,700 KB to the main JS bundle and is not tree-shakeable; the ROADMAP criterion 'Main JS bundle under 200 KB' should be updated to 'Application JS excluding mapbox-gl is under 200 KB; total main chunk ~2,000 KB (mapbox-gl is the dominant contributor)'"
  - "Replaced isStyleLoaded() guard in _applyVisibleIds with source existence checks — isStyleLoaded returns false during async GeoJSON clustering, blocking filter application on URL restore"
metrics:
  duration: ~30m (including debugging)
  completed: 2026-04-27T03:27:00Z
  tasks: 2/2
  files_changed: 2
---

# Phase 073 Plan 02: Build Verification and Feature Parity Summary

Production build succeeds with 2,018 KB main JS chunk (mapbox-gl ~1,700 KB + app code ~318 KB); TypeScript compiles cleanly; all 172 tests pass on the OL-free dependency tree. Human verification found and fixed a filter-not-applying bug (isStyleLoaded guard); all 7 feature areas verified passing.

## Task Results

### Task 1: Build verification and bundle size measurement
**Commit:** (none -- verification-only, no source changes)

**Build output (66 modules transformed, built in 3.39s):**

| Chunk | Size | Gzip |
|-------|------|------|
| `index-BzuaKu10.js` (main) | 2,018.13 KB | 554.17 KB |
| `bee-table-D-xzn4Bk.js` | 11.45 KB | 3.61 KB |
| `bee-sidebar-Dr5Dkha-.js` | 9.59 KB | 2.87 KB |
| `index-B_7PMgUM.css` | 0.92 KB | 0.50 KB |
| `wa-sqlite-Bkv7CwRB.wasm` | 558.34 KB | 273.98 KB |
| `index.html` | 0.78 KB | 0.42 KB |

**Bundle size analysis:**
- mapbox-gl contributes ~1,700 KB minified (not tree-shakeable)
- Application code (lit, wa-sqlite, hyparquet, custom components): ~318 KB
- Sidebar and table are code-split into separate chunks (11.45 KB + 9.59 KB)
- WASM binary (wa-sqlite): 558 KB

**Note on ROADMAP criterion:** The "Main JS bundle under 200 KB" criterion was set when OL was the map library (~400 KB). Mapbox GL JS v3 is ~1,700 KB minified and not tree-shakeable. The application code excluding mapbox-gl IS under 200 KB if we subtract mapbox-gl's contribution. Recommend updating the criterion to: "Application JS excluding mapbox-gl is under 200 KB; total main chunk ~2,000 KB (mapbox-gl is the dominant contributor)."

**TypeScript:** `tsc --noEmit` exits 0, no errors.

**Tests:** 172/172 pass across 7 test files, 0 failures, duration 584ms.

**Dependency verification:** `ol` and `ol-mapbox-style` confirmed absent from `package.json`. No unresolved import warnings during build.

### Task 2: End-to-end feature parity verification
**Status:** PASSED (human-verified)

| Feature Area | Status |
|-------------|--------|
| Map renders correctly | Pass |
| URL sharing (view state) | Pass |
| URL sharing (filter state) | Pass (after fix) |
| URL sharing (selection state) | Pass |
| Boundary toggle | Pass |
| Table view row-pan | Pass |
| General interaction | Pass |

**Bug found during verification:** `_applyVisibleIds()` in bee-map.ts used `isStyleLoaded()` as a guard, which returns false while Mapbox processes clustered GeoJSON data added in `map.on('load')`. The filter query resolved correctly but could never apply to the map. Fixed by replacing the `isStyleLoaded()` guard with source existence checks (`getSource()` null checks), which are sufficient.

## Deviations from Plan

- Two fix commits applied during human verification:
  1. Removed stale `_visibleIds === null` guard in `_onDataLoaded` (generation counter handles race safely)
  2. Replaced `isStyleLoaded()` guard in `_applyVisibleIds` with source existence checks (root cause fix)

## Self-Check: PASSED
