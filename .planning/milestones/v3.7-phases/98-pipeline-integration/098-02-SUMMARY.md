---
phase: 98-pipeline-integration
plan: "02"
subsystem: data-pipeline
tags: [places, geojson, export, ppipe, occurrences, mapbox]

requires:
  - phase: 98-01
    provides: "geographies.places DuckDB table + place_slug in occurrences.parquet"
provides:
  - "public/data/places.geojson — compact GeoJSON FeatureCollection (slug + geometry) for Mapbox"
  - "public/data/places.json — rich JSON array (slug, name, land_owner, counts) for Eleventy"
  - "data/places_export.py — export step producing both artifacts"
  - "pytest coverage for geojson structure and count math"
affects: [99-place-pages, 100-mapbox-places-layer]

tech-stack:
  added: []
  patterns: [TOML→JSON export, per-slug parquet aggregation, .gitignore negation for committed artifacts]

key-files:
  created:
    - data/places_export.py
    - data/tests/test_places_export.py
    - public/data/places.geojson
    - public/data/places.json
  modified:
    - data/run.py
    - .gitignore

key-decisions:
  - "Permits omitted from places.json — permits govern access to multiple places, not a per-place property; deferred to a future milestone"
  - "places.json counts derived from ASSETS_DIR/occurrences.parquet (post-dbt copy), not DBT_SANDBOX_DIR (Pitfall 5 avoidance)"
  - "places.geojson uses compact separators=(',',':') to match counties.geojson/ecoregions.geojson Mapbox pattern"
  - ".gitignore: changed /public/data/ directory ignore to /public/data/* glob so negation rules take effect (Pitfall 4)"

patterns-established:
  - "places_export follows species_export env-var module-level constants (DB_PATH, ASSETS_DIR)"
  - "_PLACES_TOML_PATH exposed as module-level constant so tests can monkeypatch it"

requirements-completed:
  - PPIPE-04
  - PPIPE-05

duration: 18min
completed: 2026-05-17
---

# Phase 98-02: Place Data Artifact Export Summary

**Compact places.geojson (Mapbox source) and rich places.json (Eleventy data) exported from geographies.places + occurrences.parquet and committed to git so CI builds without running the pipeline**

## Performance

- **Duration:** ~18 min
- **Completed:** 2026-05-17
- **Tasks:** 3 (including human checkpoint)
- **Files modified:** 6

## Accomplishments
- `data/places_export.py` reads `geographies.places` geometry via DuckDB + `content/places.toml` metadata + `occurrences.parquet` for per-place counts; produces both artifacts in one call
- `public/data/places.geojson` and `public/data/places.json` committed to git via `.gitignore` negation rules (PPIPE-05)
- 3 pytest tests cover GeoJSON structure, record shape, and count math
- `places-export` step wired into `run.py` STEPS after `species-maps` and before `feeds`

## Task Commits

1. **Task 1: Failing pytest stubs** - `fcd5e52` (test)
2. **Task 2: places_export.py + run.py + .gitignore** - `c7779c3` (feat)
3. **Task 3 (checkpoint): commit artifacts + permits fix** - `b334d50` (feat)

## Files Created/Modified
- `data/places_export.py` — export step; reads DB geometry, parquet counts, TOML metadata
- `data/tests/test_places_export.py` — 3 pytest tests (geojson structure, json shape, count math)
- `data/run.py` — `places-export` step added after `species-maps`
- `.gitignore` — `/public/data/` → `/public/data/*` + negation rules for places.geojson/places.json
- `public/data/places.geojson` — 2 features (rattlesnake-ledge, tiger-mountain), compact GeoJSON
- `public/data/places.json` — 2 records, specimen_count/sample_count both 0 (no occurrences inside polygons yet)

## Decisions Made
- **Permits removed:** User clarified permits govern access to multiple places, not a per-place property. Dropped from places.json output and test assertions. Deferred to a future milestone.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Correctness] .gitignore glob fix for negation compatibility**
- **Found during:** Task 2
- **Issue:** Original plan specified appending negations after `/public/data/` (directory ignore), but git negation rules are inert when the parent is blocked by a directory pattern
- **Fix:** Changed `/public/data/` to `/public/data/*` (glob ignore) so negation rules for places.geojson and places.json take effect
- **Verification:** `git check-ignore public/data/places.geojson` returns nothing (not ignored)
- **Committed in:** c7779c3

**2. [Human checkpoint] Permits scope change**
- **Found during:** Task 3 checkpoint review
- **Issue:** User determined permits are not per-place properties; should be omitted from places.json
- **Fix:** Removed `permits` field from `_write_places_json` output; updated test to assert `permits` absent
- **Committed in:** b334d50

---

**Total deviations:** 2 (1 auto-fix for .gitignore, 1 human-directed scope change)
**Impact on plan:** Both correct and intentional. No scope creep.

## Issues Encountered
None beyond the deviations above.

## Next Phase Readiness
- `public/data/places.geojson` ready for Mapbox places boundary layer (Phase 100)
- `public/data/places.json` ready for Eleventy place pages (Phase 99)
- specimen_count/sample_count will populate once real occurrence data falls within the seeded polygons
