---
phase: 161-add-wdfw-wildlife-areas-as-places
plan: "01"
subsystem: data/curation
tags: [places, wdfw, duckdb-spatial, curation-script]
requirements-completed: [WLA-ACQUIRE, WLA-DISSOLVE, WLA-WGS84]
dependency-graph:
  requires: []
  provides:
    - data/add_wdfw_wildlife_areas.py
    - data/tests/test_add_wdfw_wildlife_areas.py
  affects:
    - content/places.toml (appended in Plan 02)
tech-stack:
  added: []
  patterns:
    - DuckDB ST_GeomFromGeoJSON + ST_Union_Agg + ST_Multi + ST_SimplifyPreserveTopology dissolve
    - ArcGIS REST GeoJSON fetch with server-side outSR=4326 reproject
key-files:
  created:
    - data/add_wdfw_wildlife_areas.py
    - data/tests/test_add_wdfw_wildlife_areas.py
  modified: []
decisions:
  - "Excluded Jackman Creek via EXCLUDE frozenset (D-01 — in GIS layer, absent from public list)"
  - "No overlap handling — Phase 160 removed ST_Overlaps guard; many-to-many model loads cleanly"
  - "TOL = 0.0002 degrees (~22 m) per D-05 weight budget"
  - "slug_for appends -wildlife-area suffix; slugs are IMMUTABLE after first publish"
metrics:
  duration: "~4 minutes"
  completed: "2026-06-23T21:03:36Z"
  tasks-completed: 2
  files-changed: 2
---

# Phase 161 Plan 01: WDFW Wildlife Areas Curation Script Summary

One-liner: DuckDB-spatial curation script dissolves 220 WDFW unit features into 33 MultiPolygon entries (Jackman Creek excluded) with golden-fixture test asserting the dissolve+slug conventions.

## What Was Built

**`data/add_wdfw_wildlife_areas.py`** (204 lines) — one-time committed curation script:
- `WDFW_URL` — the authoritative ArcGIS REST WildlifeAreas layer endpoint
- `TOML_PATH` — `content/places.toml` (derived from `__file__`)
- `TOL = 0.0002` — `ST_SimplifyPreserveTopology` tolerance in degrees (~22 m)
- `LAND_OWNER = "Washington Department of Fish & Wildlife"` — D-02 exact string
- `EXCLUDE = frozenset({"Jackman Creek"})` — D-01: in GIS layer, absent from public list
- `fetch_wdfw_features()` — single GET, `outSR=4326`, 220 features, no pagination
- `dissolve_to_wkt(features, tol)` — DuckDB `:memory:`, `ST_GeomFromGeoJSON`, `ST_Union_Agg`, `ST_MakeValid`, `ST_SimplifyPreserveTopology`, `ST_Multi`, `ST_AsText`; skips EXCLUDE before insertion; asserts every result is `MULTIPOLYGON`
- `slug_for(name)` — lowercase → kebab → strip → append `-wildlife-area`; IMMUTABLE after first publish
- `toml_block(...)` — reused verbatim from `add_new_places.py:78-97`
- `main()` — fetch → dissolve → duplicate-skip guard → collect blocks → append to `TOML_PATH`

**`data/tests/test_add_wdfw_wildlife_areas.py`** (166 lines) — 9 passing tests:
- 5 dissolve tests: Jackman Creek excluded, exactly 2 areas, all `MULTIPOLYGON`, single-unit area also `MULTIPOLYGON`, all DuckDB-loadable
- 4 slug tests: `oak-creek-wildlife-area`, `l-t-murray-wildlife-area` format, `sunnyside-snake-river-wildlife-area`, 8-name regex sweep
- No network calls (`fetch_wdfw_features` is not invoked)

## Slug Convention (IMMUTABLE after first publish)

`slug_for(name)`:
1. Lowercase the `WLA_Name`
2. Replace any run of non-`[a-z0-9]` characters with a single `-`
3. Strip leading/trailing `-`
4. Append `-wildlife-area` if the result does not already end with it

Examples: `"Oak Creek"` → `"oak-creek-wildlife-area"`, `"L.T. Murray"` → `"l-t-murray-wildlife-area"`, `"Sunnyside-Snake River"` → `"sunnyside-snake-river-wildlife-area"`. The 33 realized slugs are recorded when the script runs in Plan 02.

## Overlap Handling: None (correct)

The script contains NO `check_overlaps()`, no `ST_Overlaps` query, no `SystemExit`, no clip/skip/triage. Phase 160 (D-03) made place membership many-to-many via the `occurrence_places` bridge and removed the `ST_Overlaps` rejection from `places_validation.py`. The 16 known WDFW↔existing-place overlaps load cleanly as multi-place membership — no blocking triage step is needed.

## Verification Results

- Static check (`ast.parse` + grep assertions): OK
- `cd data && uv run pytest tests/test_add_wdfw_wildlife_areas.py -x -q`: 9 passed in 0.85s
- Regression tests (`test_places_validation.py`, `test_places_load.py`, `test_places_export.py`): 17 passed in 1.75s
- `ST_Overlaps` absent from script: confirmed (grep count = 0)
- `SystemExit` absent from script: confirmed (grep count = 0)
- `shapely` absent from script: confirmed

## Deviations from Plan

None — plan executed exactly as written.

The PATTERNS.md contained a stale `check_overlaps()` / `SystemExit(1)` excerpt from the pre-Phase-160 design, which the plan explicitly directed to ignore. The script was written following the plan's `<action>` block, not the stale PATTERNS.md pattern.

## Known Stubs

None. The script is a one-time curation tool; it does not render UI or wire data to any frontend. Plan 02 runs the script and appends the realized TOML blocks.

## Self-Check: PASSED

- FOUND: `data/add_wdfw_wildlife_areas.py`
- FOUND: `data/tests/test_add_wdfw_wildlife_areas.py`
- FOUND: commit `928e337d` (feat — curation script)
- FOUND: commit `29c70765` (test — golden-fixture test)
