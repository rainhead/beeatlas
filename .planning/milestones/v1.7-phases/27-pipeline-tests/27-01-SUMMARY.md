---
phase: 27-pipeline-tests
plan: 01
subsystem: testing
tags: [pytest, duckdb, duckdb-spatial, beautifulsoup4, python, parquet, geojson]

# Dependency graph
requires:
  - phase: 21-parquet-and-geojson-export
    provides: export.py with four export functions (ecdysis/samples parquet, counties/ecoregions geojson)
  - phase: 20-pipeline-migration
    provides: ecdysis_pipeline.py and inaturalist_pipeline.py with _transform() and occurrence_links()

provides:
  - pytest test suite for data/ package (13 tests, all passing)
  - _extract_inat_id() pure function extracted from occurrence_links() generator
  - conftest.py with session-scoped fixture DuckDB (all schemas + seed rows)
  - test_transforms.py: unit tests for _transform() and _extract_inat_id()
  - test_export.py: integration tests for all four export functions

affects:
  - phase: 28-pipeline-hardening (any future hardening phases can extend this test suite)
  - export.py (column contract now tested; changes to column list will fail tests)
  - ecdysis_pipeline.py (HTML parsing logic now testable as a pure function)

# Tech tracking
tech-stack:
  added:
    - pytest 9.0.2 (already added during research phase, now configured and used)
    - duckdb spatial extension (INSTALL/LOAD spatial in fixture setup)
  patterns:
    - monkeypatch.setattr(export_mod, 'ASSETS_DIR', tmp_path) for module-level global override
    - session-scoped fixture DuckDB with embedded production WKT polygons (no binary in git)
    - pure function extraction for testability (HTML parsing → _extract_inat_id)

key-files:
  created:
    - data/tests/__init__.py
    - data/tests/conftest.py
    - data/tests/test_transforms.py
    - data/tests/test_export.py
  modified:
    - data/ecdysis_pipeline.py (extracted _extract_inat_id from occurrence_links)
    - data/pyproject.toml (added [tool.pytest.ini_options])

key-decisions:
  - "Fixture DuckDB uses embedded WKT constants (not committed binary) per D-01 — fetched from production DB, embedded as string literals in conftest.py"
  - "monkeypatch.setattr over env var for ASSETS_DIR — module-level global set at import time, env var override is unreliable"
  - "fixture_con uses read_only=False to allow export COPY ... TO ... queries on same connection"
  - "North Cascades polygon: 3 polygons exist with that name; 7941-char polygon contains test coordinates"

patterns-established:
  - "Session-scoped fixture DB: create once, reuse across all tests in session for performance"
  - "ASSETS_DIR override: always monkeypatch.setattr(export_mod, 'ASSETS_DIR', tmp_path) per test"
  - "Column assertions: duckdb DESCRIBE on output parquet, check each expected column in actual_cols"
  - "GeoJSON assertions: check type==FeatureCollection, len>=1, geometry key, property key"

requirements-completed: [TEST-01, TEST-02, TEST-03]

# Metrics
duration: 25min
completed: 2026-03-29
---

# Phase 27 Plan 01: Pipeline Tests Summary

**pytest suite for data/ with 13 passing tests: _extract_inat_id() pure function extracted from ecdysis_pipeline, session-scoped fixture DuckDB with embedded WA/Chelan/North Cascades WKT, export integration tests asserting correct Parquet schema and valid GeoJSON**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-29T03:20:48Z
- **Completed:** 2026-03-29T03:45:00Z
- **Tasks:** 3
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- Extracted `_extract_inat_id(html: str | None) -> int | None` as standalone pure function from `occurrence_links()` generator in `ecdysis_pipeline.py` — enabling direct unit testing without dlt machinery
- Created `data/tests/conftest.py` with session-scoped fixture DuckDB containing all required schemas (geographies, ecdysis_data, inaturalist_data) and seed rows with embedded real production WKT polygons
- 13 tests pass: 7 unit tests (_transform + _extract_inat_id) + 6 integration tests (all four export functions checking Parquet schema, row counts, null column assertions, GeoJSON structure)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract _extract_inat_id, create conftest.py, configure pytest** - `918359e` (feat)
2. **Task 2: Write transform unit tests** - `507cf3d` (test)
3. **Task 3: Write export integration tests** - `1750a90` (test)

## Files Created/Modified

- `data/tests/__init__.py` - Empty package marker
- `data/tests/conftest.py` - Session-scoped fixture DuckDB with all schemas and production WKT seed data; fixture_db, fixture_con, export_dir fixtures
- `data/tests/test_transforms.py` - 7 unit tests for _transform() (3 cases) and _extract_inat_id() (4 cases)
- `data/tests/test_export.py` - 6 integration tests for export_ecdysis_parquet, export_samples_parquet, export_counties_geojson, export_ecoregions_geojson
- `data/ecdysis_pipeline.py` - Extracted _extract_inat_id() before ecdysis_links_source(); occurrence_links() calls it instead of inline BeautifulSoup block
- `data/pyproject.toml` - Added [tool.pytest.ini_options] testpaths=["tests"]

## Decisions Made

- **fixture_con read_only=False**: The export functions use `COPY ... TO` which writes to disk (not to DuckDB), but DuckDB still requires a writable connection when the same connection is used across spatial queries. Opened as read_only=False to avoid connection mode conflicts.
- **North Cascades WKT polygon selection**: Three rows with name='North Cascades' exist in production. Only the 7941-char polygon (`length(geometry_wkt) = 7941`) contains both test coordinates. The research notes pointed to `length > 1000 LIMIT 1` which would have gotten the 3599-char polygon (which does NOT contain the test points). Corrected to use the 7941-char polygon.
- **Embedded WKT constants**: Real production polygons (WA state 2696 chars, Chelan 2153 chars, North Cascades 7941 chars) embedded as string literals — no network access needed, no binary in git.

## Deviations from Plan

None - plan executed exactly as written. The North Cascades WKT selection required careful cross-checking against the research notes (which contained an incorrect LIMIT 1 query that would have returned the wrong polygon), but this was a research note issue, not an execution deviation.

## Issues Encountered

- **Research note pitfall**: The research RESEARCH.md said to query North Cascades with `length(geometry_wkt) > 1000 LIMIT 1` which would return the 3599-char polygon. Production verification showed the 3599-char polygon does NOT contain either test coordinate; the 7941-char polygon does. Fixed by querying explicitly for `length(geometry_wkt) = 7941` and verifying with ST_Within before embedding.

## User Setup Required

None - no external service configuration required. Tests run fully offline: `cd data && uv run pytest`

## Next Phase Readiness

- `uv run pytest` from `data/` runs all 13 tests and exits 0
- Test suite covers all four export functions and both pipeline transform functions
- `_extract_inat_id` is now a testable pure function
- Column contract for ecdysis.parquet (15 cols) and samples.parquet (9 cols) is now enforced by tests
- Future phases can extend the test suite by adding test files to `data/tests/`

---
*Phase: 27-pipeline-tests*
*Completed: 2026-03-29*
