---
phase: 47-rewrite-geographies-pipeline-py-to-use-duckdb-spatial-extens
plan: "01"
subsystem: data-pipeline
tags: [duckdb, spatial, geographies, geopandas-removal, refactor]
dependency_graph:
  requires: []
  provides: [geographies-pipeline-duckdb, export-geom-columns, feeds-geom-columns]
  affects: [data/geographies_pipeline.py, data/export.py, data/feeds.py, data/tests/conftest.py, data/tests/test_feeds.py, data/pyproject.toml]
tech_stack:
  added: []
  patterns: [ST_Read-vsizip, ST_Transform-4arg-always_xy, CREATE-OR-REPLACE-TABLE-AS-SELECT, _read_prj-zipfile]
key_files:
  created: []
  modified:
    - data/geographies_pipeline.py
    - data/export.py
    - data/feeds.py
    - data/tests/conftest.py
    - data/tests/test_feeds.py
    - data/pyproject.toml
    - data/uv.lock
decisions:
  - "Use ST_Read('/vsizip/<path>/<stem>.shp') to stream shapefiles without loading into Python heap"
  - "Use 4-arg ST_Transform(geom, prj_wkt, 'EPSG:4326', true) for projected CRS sources (ecoregions, ca_provinces, ca_census_divisions)"
  - "Read PRJ WKT via Python zipfile stdlib — no extra dep needed"
  - "geometry_wkt VARCHAR column replaced by geom GEOMETRY column in all geographies tables — fixtures updated atomically"
metrics:
  duration_minutes: 4
  completed_date: "2026-04-12"
  tasks_completed: 2
  files_modified: 7
---

# Phase 47 Plan 01: Rewrite geographies_pipeline with DuckDB ST_Read Summary

**One-liner:** Replaced geopandas+dlt geographies pipeline with DuckDB ST_Read/ST_Transform streaming; migrated export.py, feeds.py, and test fixtures from `geometry_wkt VARCHAR` to native `geom GEOMETRY` columns.

## What Was Built

Rewrote `data/geographies_pipeline.py` completely, eliminating `gpd.read_file()` (the OOM source) in favor of DuckDB's `ST_Read` table function which streams shapefile rows through the SQL engine. The new pipeline:

1. Connects to DuckDB directly (`duckdb.connect(DB_PATH)`)
2. Loads the spatial extension (`INSTALL spatial; LOAD spatial;`)
3. Creates the `geographies` schema if absent
4. For each of 5 sources: downloads zip (unchanged `_download()` function), then runs `CREATE OR REPLACE TABLE geographies.<name> AS SELECT ... FROM ST_Read('/vsizip/<path>/<stem>.shp')`
5. For projected CRS sources (ecoregions, ca_provinces, ca_census_divisions): reads PRJ WKT from zip via new `_read_prj()` helper and applies `ST_Transform(geom, prj_wkt, 'EPSG:4326', true)`

Atomically migrated `export.py` (20 occurrences), `feeds.py` (6 occurrences), `tests/conftest.py` (3 table DDL + 3 INSERT), and `tests/test_feeds.py` (3 table DDL + 3 INSERT) from `geometry_wkt VARCHAR` + `ST_GeomFromText()` wrappers to direct `geom GEOMETRY` column references.

Removed `geopandas` from `data/pyproject.toml`; `uv sync` also removed transitive deps numpy, pandas, pyogrio, pyproj, shapely (6 packages total, 159 lines from uv.lock).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rewrite geographies_pipeline.py with DuckDB spatial ST_Read | 88f00b2 | geographies_pipeline.py, export.py, feeds.py, tests/conftest.py, tests/test_feeds.py |
| 2 | Remove geopandas from pyproject.toml | 93a8a52 | pyproject.toml, uv.lock |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Updated export.py, feeds.py, and test fixtures atomically with pipeline rewrite**

- **Found during:** Task 1
- **Issue:** The plan's Task 1 specified rewriting only `geographies_pipeline.py`, but the research (RESEARCH.md D-04, Pitfall 4, Pitfall 5) documented that `export.py`, `feeds.py`, `tests/conftest.py`, and `tests/test_feeds.py` all reference the `geometry_wkt` column that no longer exists after the schema change. Leaving these unchanged would cause runtime failures in export and feeds, and pytest failures in the test suite.
- **Fix:** Updated all 4 dependent files in the same commit as the pipeline rewrite, replacing all `geometry_wkt` / `ST_GeomFromText()` patterns with direct `geom` column references. Test fixtures updated to use `geom GEOMETRY` column DDL with `ST_GeomFromText(?)` in INSERT statements.
- **Files modified:** data/export.py, data/feeds.py, data/tests/conftest.py, data/tests/test_feeds.py
- **Commit:** 88f00b2

## Verification

- `uv run python -c "from geographies_pipeline import load_geographies"` — PASS
- `grep -c "geopandas" data/pyproject.toml` returns 0 — PASS
- `grep -c "import dlt" data/geographies_pipeline.py` returns 0 — PASS
- `grep "ST_Read" data/geographies_pipeline.py` returns matches — PASS
- `uv run pytest` — 27 passed (after geopandas removed)

## Known Stubs

None. The pipeline rewrite is complete. No hardcoded empty values or placeholder data.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. The downloader (`_download()`) is unchanged.

## Self-Check: PASSED

- `data/geographies_pipeline.py` — confirmed written with correct content
- `data/export.py` — confirmed no `geometry_wkt` or `ST_GeomFromText` remaining
- `data/feeds.py` — confirmed no `geometry_wkt` or `ST_GeomFromText` remaining
- `data/tests/conftest.py` — confirmed `geom GEOMETRY` DDL, `ST_GeomFromText(?)` inserts
- `data/tests/test_feeds.py` — confirmed same fixture updates
- Commits 88f00b2 and 93a8a52 confirmed in `git log`
- 27 pytest tests pass
