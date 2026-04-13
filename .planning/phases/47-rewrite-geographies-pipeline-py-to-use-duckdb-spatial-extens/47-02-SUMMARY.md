---
plan: 47-02
phase: 47
status: complete
completed_at: 2026-04-12
---

## Summary

Consumer-side geometry column migration — all `geometry_wkt` → `geom` references updated in export.py, feeds.py, conftest.py, and test_feeds.py.

**Note:** These changes were applied atomically in plan 47-01 execution to maintain consistency — without them, the pipeline rewrite would cause immediate runtime failures since the `geometry_wkt` column no longer exists.

## What Was Built

All downstream consumers of the geographies schema now reference the native GEOMETRY column `geom` directly:
- **export.py**: All SQL queries use `geom` directly (no `ST_GeomFromText()` wrappers)
- **feeds.py**: All SQL queries use `c.geom` / `e.geom` directly  
- **tests/conftest.py**: Geographies table DDL uses `geom GEOMETRY`, removed `_dlt_load_id`/`_dlt_id` columns, inserts use `ST_GeomFromText(?)`
- **tests/test_feeds.py**: Inline DDL updated with same pattern

## Verification

- `grep -c "geometry_wkt" data/export.py data/feeds.py data/tests/conftest.py data/tests/test_feeds.py` → all 0
- `grep -c "ST_GeomFromText" data/export.py data/feeds.py` → all 0
- `cd data && uv run pytest` → 27 passed in 0.72s

## Self-Check: PASSED

All acceptance criteria met. Full test suite passes.

## Key Files

### Modified
- `data/export.py` — 20 occurrences of geometry_wkt/ST_GeomFromText replaced
- `data/feeds.py` — 6 occurrences replaced
- `data/tests/conftest.py` — geographies DDL updated, dlt metadata columns removed
- `data/tests/test_feeds.py` — inline DDL updated
