---
phase: 30-duckdb-wasm-setup
plan: 01
subsystem: ui
tags: [duckdb, wasm, parquet, geojson, vite, typescript]

# Dependency graph
requires:
  - phase: 28-frontend-runtime-fetch
    provides: CloudFront CORS /data/* behavior; DATA_BASE_URL constant; runtime parquet fetching
  - phase: 29-ci-simplification
    provides: frontend-only CI; no bundled data files
provides:
  - DuckDB WASM singleton module (frontend/src/duckdb.ts) with getDuckDB() and loadAllTables()
  - @duckdb/duckdb-wasm 1.33.1-dev20.0 installed as frontend dependency
  - Four in-memory DuckDB tables (ecdysis, samples, counties, ecoregions) loaded at page startup
  - DuckDB init wired into bee-map.ts alongside existing hyparquet loading
affects: [31-feature-creation-from-duckdb, 32-sql-filter-layer]

# Tech tracking
tech-stack:
  added: ["@duckdb/duckdb-wasm 1.33.1-dev20.0"]
  patterns:
    - "MANUAL_BUNDLES with Vite ?url imports for EH bundle (no COOP/COEP required)"
    - "getDuckDB() singleton: module-level _dbPromise cached on first call"
    - "registerFileURL + DuckDBDataProtocol.HTTP for parquet loading"
    - "INSTALL spatial / LOAD spatial with read_json_auto fallback for GeoJSON"

key-files:
  created:
    - frontend/src/duckdb.ts
  modified:
    - frontend/package.json
    - package-lock.json
    - frontend/src/bee-map.ts

key-decisions:
  - "EH bundle (not threads) avoids SharedArrayBuffer/COOP-COEP requirement — no CloudFront header changes needed"
  - "DuckDB init fires in parallel with existing hyparquet loading — non-fatal in Phase 30, becomes primary in Phase 31"
  - "INSTALL spatial + LOAD spatial as separate conn.query() calls per Pitfall 5 (multi-statement strings unreliable)"
  - "Spatial extension failure caught with try/catch fallback to read_json_auto (GeoJSON properties preserved, geometry lost)"

patterns-established:
  - "Pattern 1: getDuckDB() singleton returns the same Promise<AsyncDuckDB> across all callers"
  - "Pattern 2: loadAllTables(db, baseUrl) is the single entry point for all data loading"
  - "Pattern 3: getDuckDB().then(loadAllTables).catch() — non-fatal parallel initialization"

requirements-completed: [DUCK-01, DUCK-02, DUCK-03, DUCK-04]

# Metrics
duration: 2min
completed: 2026-03-31
---

# Phase 30 Plan 01: DuckDB WASM Setup Summary

**DuckDB WASM EH-bundle singleton loads four data tables (ecdysis, samples, counties, ecoregions) from CloudFront at page startup via registerFileURL and spatial extension**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-31T17:09:11Z
- **Completed:** 2026-03-31T17:11:03Z
- **Tasks:** 2 complete (Task 3 = checkpoint:human-verify, pending user smoke test)
- **Files modified:** 4

## Accomplishments

- Installed `@duckdb/duckdb-wasm 1.33.1-dev20.0` and created `frontend/src/duckdb.ts` singleton
- Implemented `getDuckDB()` + `loadAllTables()` with MANUAL_BUNDLES Vite pattern, EH bundle, spatial extension with fallback
- Wired DuckDB init into `bee-map.ts` in parallel with existing hyparquet loading (non-fatal in Phase 30)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install @duckdb/duckdb-wasm and create singleton module** - `6f23991` (feat)
2. **Task 2: Wire DuckDB init into bee-map.ts loading lifecycle** - `ba6b5da` (feat)
3. **Task 3: Browser smoke test** - Pending (checkpoint:human-verify)

## Files Created/Modified

- `frontend/src/duckdb.ts` - DuckDB WASM singleton: getDuckDB(), loadAllTables(), MANUAL_BUNDLES, spatial extension with fallback
- `frontend/package.json` - Added @duckdb/duckdb-wasm dependency
- `package-lock.json` - Updated lock file
- `frontend/src/bee-map.ts` - Import getDuckDB/loadAllTables; fire init in parallel with hyparquet loading

## Decisions Made

- EH bundle avoids SharedArrayBuffer/COOP-COEP requirement — no CloudFront header changes needed (DUCK-04)
- DuckDB errors are non-fatal in Phase 30; `_dataError` / `_dataLoading` lifecycle still driven by `specimenSource.once('change')` until Phase 31
- INSTALL spatial and LOAD spatial called as separate `conn.query()` invocations (Pitfall 5 — multi-statement unreliable)
- Spatial extension failure caught with try/catch; fallback to `read_json_auto` preserves GeoJSON properties (loses geometry column)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- DuckDB singleton is ready; all four tables loadable from CloudFront URLs
- Task 3 (browser smoke test) requires human verification: open http://localhost:5173, check DevTools Console for "DuckDB tables ready" and row counts
- After Task 3 verified, Phase 31 can replace ParquetSource/SampleParquetSource with DuckDB queries

---
*Phase: 30-duckdb-wasm-setup*
*Completed: 2026-03-31*
