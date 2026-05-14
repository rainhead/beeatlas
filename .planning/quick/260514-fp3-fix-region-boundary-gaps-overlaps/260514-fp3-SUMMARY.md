---
id: 260514-fp3
title: Fix region boundary gaps and overlaps (#14)
status: complete
date: 2026-05-14
issue: https://github.com/rainhead/beeatlas/issues/14
---

# Summary: Fix region boundary gaps and overlaps

## What changed

Both upstream geography sources had real geometric overlaps that surfaced as
visible artifacts at zoom 8+. Fixed by changing the county source and adding a
topology-aware post-process for ecoregions.

### Code
- `data/geographies_pipeline.py` — switched `SOURCES["us_counties"]` from
  TIGER `tl_2024_us_county.zip` (192 km² of overlap polygons across 71 WA
  county pairs) to Census Cartographic Boundary `cb_2024_us_county_5m.zip`
  (0 km² overlap, topology-clean from the source).
- `data/dbt/models/marts/ecoregions_geo.sql` — clip ecoregion polygons to WA
  via `ST_Intersection`. The EPA L3 source extends to BC/OR; the unclipped
  GeoJSON is 6 MB.
- `data/dbt/macros/emit_feature_collection.sql` — drop
  `ST_SimplifyPreserveTopology(geom, 0.001)`. mapshaper now owns simplification.
- `data/topology_postprocess.py` (new) — invokes
  `npx mapshaper -clean gap-fill-area=0.01km2 -simplify percentage=N% planar
  keep-shapes` on each region GeoJSON in `public/data/`. Counties at 10%,
  ecoregions at 3% (per-layer tuning, comment in source explains).
- `data/run.py` — new STEPS entry `("topology-postprocess", ...)` after dbt-build.
- `data/tests/test_dbt_diff.py` — update `test_occurrences_county_spatial_diff`
  baseline from 84 (TIGER boundary-nondeterminism rows) to 0 (CB 5m clean).
  Header comment updated.
- `data/dbt/models/marts/counties_geo.sql`, `data/dbt/macros/emit_feature_collection.sql`,
  `data/dbt/models/marts/ecoregions_geo.sql` — comment updates pointing to #14.
- `package.json` — add `mapshaper` devDependency.

### Net dep changes
- Python: no net change. (Mid-investigation I added `topojson>=1.10`, then
  removed it after finding mapshaper was the right tool.)
- Node: + mapshaper (devDep). Node toolchain already exists at repo root.

## Verification

- **Topology** (DuckDB `ST_Intersection` polygon-area sum on final output):
  counties 0.000 km² overlap, ecoregions 0.000 km² overlap. Was 192 + 160 = 352 km² pre-fix.
- **dbt build**: `bash data/dbt/run.sh build` → PASS=44 WARN=0 ERROR=0.
- **dbt tests**: `pytest tests/test_dbt_scaffold.py tests/test_dbt_diff.py` →
  22 passed.
- **Visual** (Playwright, iPhone 15 + 1200×900 desktop, webkit):
  - Counties at the Okanogan/Chelan/Skagit three-way (-120.74, 48.59, zoom 10):
    clean three-line junction, no gaps.
  - Ecoregions at McClure Mountain (-120.75, 48.45, zoom 10): boundary runs
    continuously, no gaps.
- **File sizes**: counties.geojson 22 KB (was 34 KB), ecoregions.geojson 193 KB
  (was 194 KB). Lazy-loaded, no UX cost.

## Side benefits

- **84 bee occurrences no longer flip counties between runs.** The TIGER
  source's overlap polygons made ST_Within nondeterministic at the
  Benton/Grant and Chelan/King boundaries; CB 5m fixes that. Verified by
  test_occurrences_county_spatial_diff dropping from 84 → 0.
- One fewer authoritative-but-buggy data source in the pipeline.

## Caveats

- 2 of 66 "Strait of Georgia/Puget Lowland" sub-polygons (uninhabited sub-1-hectare
  rocks in Puget Sound) dropped by mapshaper's `gap-fill-area=0.01km2` threshold.
  Discussed and accepted as visual noise, not bee habitat.
- Adds Node.js requirement to data pipeline. `npm install` at repo root is now
  needed before running the full pipeline. Geographies are loaded manually
  (per CLAUDE.md), so dev iteration only needs Node when geographies are
  reloaded or the nightly run executes.

## Investigation notes (interesting, not load-bearing)

- First diagnosis claimed "100% topology integrity in the source data" — wrong
  due to a test bug (`fetchone()` over a duplicate-named feature returned the
  wrong polygon for vertex comparison). Re-test with `rid`-keyed joins found
  the real issue: TIGER ∪ EPA-L3 both have legitimate polygon-area overlaps,
  not just floating-point edge mismatches.
- `topojson` Python package (mattijn/topojson) was the originally planned tool
  but turned out to be insufficient — it can only deduplicate byte-identical
  shared coordinates into arcs; it can't reconcile two adjacent polygons with
  different vertex sets on a shared border. Mapshaper's `-clean` does, via a
  proper precision-model + arc-reconstruction pass.
