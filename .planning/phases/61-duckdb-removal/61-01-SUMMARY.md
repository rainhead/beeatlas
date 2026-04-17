---
phase: 61-duckdb-removal
plan: "01"
subsystem: frontend
tags: [cleanup, dependencies, duckdb, wa-sqlite]
dependency_graph:
  requires: []
  provides: [clean-package-json, no-duckdb-module]
  affects: [frontend/package.json, frontend/tsconfig.json, BENCHMARK.md, .planning/PROJECT.md]
tech_stack:
  removed: ["@duckdb/duckdb-wasm", "apache-arrow"]
  patterns: []
key_files:
  deleted:
    - frontend/src/duckdb.ts
  modified:
    - frontend/package.json
    - frontend/tsconfig.json
    - frontend/src/bee-atlas.ts
    - package-lock.json
    - BENCHMARK.md
    - .planning/PROJECT.md
decisions:
  - "Added 'node' to tsconfig types array to replace the implicit @types/node resolution that apache-arrow (duckdb transitive dep) previously provided via /// <reference types='node' /> in its .d.ts files"
  - "Bundle sizes identical before/after because duckdb.ts was already orphaned (not imported) — the 34 MB reduction is in node_modules install size, not Vite bundle output"
metrics:
  duration_minutes: 10
  tasks_completed: 2
  files_modified: 6
  files_deleted: 1
  completed_date: "2026-04-16"
---

# Phase 61 Plan 01: DuckDB Removal Summary

Remove @duckdb/duckdb-wasm and orphaned duckdb.ts module, fix implicit @types/node dependency, update docs.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Remove DuckDB dependency and module | 11ab33e | frontend/src/duckdb.ts (deleted), frontend/package.json, frontend/tsconfig.json, frontend/src/bee-atlas.ts, package-lock.json |
| 2 | Update BENCHMARK.md and PROJECT.md | 979a717 | BENCHMARK.md, .planning/PROJECT.md |

## Verification Results

1. `frontend/src/duckdb.ts` does not exist — PASS
2. `grep -ri duckdb frontend/src/` returns zero results — PASS
3. `grep duckdb frontend/package.json` returns zero results — PASS
4. `npx tsc --noEmit` exits 0 — PASS
5. `npm test` passes 165 tests — PASS
6. `npm run build` succeeds — PASS
7. BENCHMARK.md contains "Bundle size" row with both columns — PASS
8. PROJECT.md mentions "wa-sqlite + hyparquet" in tech stack — PASS

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Implicit @types/node dependency broken by duckdb removal**
- **Found during:** Task 1 verification
- **Issue:** `npm run build` failed after removing @duckdb/duckdb-wasm because duckdb transitively brought in `apache-arrow`, whose `.d.ts` files contain `/// <reference types="node" />`. This implicitly made node types available in the TypeScript compilation, allowing test files to import `node:fs`, `node:path`, etc. Without duckdb installed, this implicit reference was gone and tsc failed on those imports.
- **Fix:** Added `"node"` to the `types` array in `frontend/tsconfig.json` — making the dependency explicit rather than relying on transitive resolution.
- **Files modified:** `frontend/tsconfig.json`
- **Commit:** 11ab33e

**2. [Rule 1 - Bug] Bundle sizes identical (duckdb.ts was already orphaned)**
- **Found during:** Task 1 baseline capture
- **Issue:** The plan expected measurable bundle size reduction. However, `duckdb.ts` was already not imported anywhere in the codebase — the Vite bundle never included DuckDB WASM files. The dist/ output only contains `wa-sqlite.wasm` and the main JS bundle.
- **Fix:** Documented the actual situation accurately in BENCHMARK.md with a note explaining the 34 MB reduction is in installed package size (node_modules), not Vite bundle output.
- **Files modified:** `BENCHMARK.md`
- **Commit:** 979a717

## Bundle Size Data

| Metric | Before (with @duckdb installed) | After (removed) |
|--------|---------------------------------|-----------------|
| Bundle size, gzip (KB) | 453 | 453 |
| Bundle size, uncompressed (KB) | 3,993 | 3,993 |

Note: duckdb.ts was already orphaned (not imported), so DuckDB WASM files were never included in the Vite bundle. The package size reduction (~34 MB of @duckdb/duckdb-wasm + apache-arrow in node_modules) is real but not reflected in bundle output.

## Known Stubs

None.

## Threat Flags

None — this plan only removes code and updates documentation.

## Self-Check: PASSED

- `frontend/src/duckdb.ts` — confirmed deleted
- `frontend/package.json` — no @duckdb/duckdb-wasm entry
- `BENCHMARK.md` — contains "Bundle size" rows
- `.planning/PROJECT.md` — contains "wa-sqlite + hyparquet"
- Commits 11ab33e and 979a717 — both present in git log
