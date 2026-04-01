---
phase: 30-duckdb-wasm-setup
plan: 01
subsystem: ui
tags: [duckdb, duckdb-wasm, parquet, geojson, vite, typescript]

# Dependency graph
requires:
  - phase: 28-frontend-runtime-fetch
    provides: CloudFront CORS /data/* behavior; DATA_BASE_URL constant; runtime parquet fetching
  - phase: 29-ci-simplification
    provides: frontend-only CI; no bundled data files
provides:
  - DuckDB WASM singleton module (frontend/src/duckdb.ts) with getDuckDB() and loadAllTables()
  - "@duckdb/duckdb-wasm installed as frontend dependency"
  - Four in-memory DuckDB tables (ecdysis, samples, counties, ecoregions) loaded at page startup
  - DuckDB init wired into bee-map.ts alongside existing hyparquet loading
affects: [31-feature-creation-from-duckdb, 32-sql-filter-layer]

# Tech tracking
tech-stack:
  added: ["@duckdb/duckdb-wasm"]
  patterns:
    - "MANUAL_BUNDLES with Vite ?url imports for EH bundle (no COOP/COEP required)"
    - "getDuckDB() singleton: module-level _dbPromise cached on first call"
    - "registerFileURL + DuckDBDataProtocol.HTTP for parquet loading"
    - "GeoJSON loading via browser fetch() + registerFileBuffer + read_json (no spatial extension)"

key-files:
  created:
    - frontend/src/duckdb.ts
  modified:
    - frontend/package.json
    - frontend/src/bee-map.ts

key-decisions:
  - "EH bundle (not threads) avoids SharedArrayBuffer/COOP-COEP requirement — no CloudFront header changes needed"
  - "DuckDB init fires in parallel with existing hyparquet loading — non-fatal in Phase 30, becomes primary in Phase 31"
  - "GeoJSON loaded via browser fetch() + registerFileBuffer + read_json; spatial extension approach abandoned (DuckDB WASM spatial cannot read registered URL files)"
  - "counties and ecoregions load as 1-row FeatureCollection tables — expected shape for Phase 30; geometry unnesting deferred to Phase 31/32"

patterns-established:
  - "Pattern 1: getDuckDB() singleton returns the same Promise<AsyncDuckDB> across all callers"
  - "Pattern 2: loadAllTables(db, baseUrl) is the single entry point for all data loading"
  - "Pattern 3: getDuckDB().then(db => loadAllTables(db, baseUrl)).catch() — non-fatal parallel initialization"
  - "Pattern 4: GeoJSON loading — fetch() → Uint8Array → registerFileBuffer('name.geojson') → read_json('name.geojson')"

requirements-completed: [DUCK-01, DUCK-02, DUCK-03, DUCK-04]

# Metrics
duration: 90min
completed: 2026-03-31
---

# Phase 30 Plan 01: DuckDB WASM Setup Summary

**@duckdb/duckdb-wasm EH-bundle singleton loads ecdysis/samples via HTTP parquet scan and counties/ecoregions via fetch+buffer+read_json into four queryable in-browser DuckDB tables, verified with all row counts correct and no COOP/COEP errors**

## Performance

- **Duration:** ~90 min (including checkpoint pause for browser smoke test)
- **Started:** 2026-03-31T17:09:11Z
- **Completed:** 2026-03-31
- **Tasks:** 3/3 complete
- **Files modified:** 3

## Accomplishments

- DuckDB WASM EH bundle initializes in browser with no COOP/COEP or SharedArrayBuffer errors (DUCK-04)
- ecdysis (46132 rows) and samples (>9000 rows) parquet tables loaded in-browser via HTTP URL registration and DuckDB PARQUET scan (DUCK-01)
- counties and ecoregions GeoJSON loaded as DuckDB tables via browser fetch + registerFileBuffer + read_json; each loads as 1-row FeatureCollection — expected for Phase 30 (DUCK-02)
- Existing hyparquet loading lifecycle (ParquetSource, SampleParquetSource, specimenSource.once('change')) preserved unchanged; DuckDB init is non-fatal parallel path (DUCK-03)
- Browser smoke test confirmed: map renders correctly, loading overlay lifecycle unchanged, no console errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Install @duckdb/duckdb-wasm and create singleton module** - `6f23991` (feat)
2. **Task 2: Wire DuckDB init into bee-map.ts loading lifecycle** - `ba6b5da` (feat)
3. **Task 3: Browser smoke test — DuckDB tables queryable** - Human-verified; approved. GeoJSON implementation adjusted post-Task-1 (spatial extension replaced with fetch+buffer+read_json).

**Plan metadata:** `2d05ba3` (docs: complete plan — paused at checkpoint)

## Files Created/Modified

- `frontend/src/duckdb.ts` - DuckDB WASM singleton: getDuckDB(), loadAllTables(), MANUAL_BUNDLES (EH bundle), parquet via registerFileURL+HTTP, GeoJSON via fetch+registerFileBuffer+read_json
- `frontend/package.json` - Added @duckdb/duckdb-wasm dependency
- `frontend/src/bee-map.ts` - Import getDuckDB/loadAllTables; fire init in parallel with hyparquet loading (non-fatal catch)

## Decisions Made

- **EH bundle over threads bundle:** Avoids SharedArrayBuffer/COOP-COEP requirement entirely. No CloudFront header changes needed (DUCK-04).
- **GeoJSON via fetch+buffer, not spatial extension:** DuckDB WASM spatial extension cannot load GeoJSON from registered URL files. Actual approach: fetch() → ArrayBuffer → Uint8Array → registerFileBuffer('name.geojson') → read_json('name.geojson'). The .geojson extension in the registered filename is required for format inference.
- **No spatial extension in Phase 30:** Geometry queries not required until Phase 31/32. Dropping INSTALL/LOAD spatial simplifies Phase 30 and avoids a known failure path.
- **DuckDB errors non-fatal in Phase 30:** _dataError/_dataLoading lifecycle still driven by specimenSource.once('change') until Phase 31 replaces hyparquet as primary data source.
- **counties/ecoregions as FeatureCollection rows:** Each GeoJSON file loads as 1 row (the root FeatureCollection object). This is expected and acceptable for Phase 30; Phase 31/32 will unnest features array if per-feature SQL is needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced spatial extension + read_json_auto with fetch+registerFileBuffer+read_json for GeoJSON**
- **Found during:** Task 1 / browser smoke test (Task 3)
- **Issue:** Plan specified INSTALL spatial + LOAD spatial + CREATE TABLE FROM URL for GeoJSON, with read_json_auto as fallback. DuckDB WASM spatial extension cannot read files registered via registerFileURL — URL-based spatial loading fails. read_json_auto also fails because DuckDB WASM does not reliably infer .geojson format from extension when accessing registered buffers without the LOAD json extension.
- **Fix:** Fetch GeoJSON via browser fetch(), convert to Uint8Array, register via db.registerFileBuffer('counties.geojson', bytes), load JSON extension explicitly, then CREATE TABLE via read_json('counties.geojson').
- **Files modified:** frontend/src/duckdb.ts
- **Verification:** Browser smoke test confirmed counties = 1 row, ecoregions = 1 row; no errors in DevTools console.
- **Committed in:** 6f23991 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — spatial extension approach replaced with working fetch+buffer approach)
**Impact on plan:** Same outcome achieved (GeoJSON tables queryable in DuckDB). Spatial geometry column absent but not needed until Phase 32. No scope creep.

## Issues Encountered

- **Spatial extension incompatibility with registered URL files:** DuckDB WASM spatial cannot read GeoJSON from files registered via registerFileURL. Resolved by switching to fetch+registerFileBuffer.
- **read_json_auto extension inference:** Does not reliably infer GeoJSON format in WASM context. Resolved by using explicit read_json with the registered filename (which carries .geojson extension) plus LOAD json.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- getDuckDB() is the entry point — Phase 31 calls it to obtain the already-initialized db instance
- All four tables (ecdysis, samples, counties, ecoregions) ready for DuckDB queries
- Phase 31 will replace ParquetSource/SampleParquetSource (hyparquet) with DuckDB SELECT → OL Feature creation
- Phase 31 should remove hyparquet dependency from package.json
- Known shape of counties/ecoregions: single-row FeatureCollection JSON object; Phase 31/32 will need to unnest features array for per-feature queries

## Known Stubs

None — all four tables load real production data from CloudFront (ecdysis.parquet, samples.parquet, counties.geojson, ecoregions.geojson). No placeholder or mock data.

## Self-Check: PASSED

- frontend/src/duckdb.ts: FOUND (read at session start)
- frontend/src/bee-map.ts: contains getDuckDB import (verified in prior checkpoint)
- frontend/package.json: contains @duckdb/duckdb-wasm (verified in prior checkpoint build)
- Commit 6f23991: FOUND (git log shows feat(30-01): install @duckdb/duckdb-wasm)
- Commit ba6b5da: FOUND (git log shows feat(30-01): wire DuckDB init into bee-map.ts)
- Browser smoke test: APPROVED by user — all four tables verified, no COOP/COEP errors

---
*Phase: 30-duckdb-wasm-setup*
*Completed: 2026-03-31*
