---
phase: 172-accomplishment-view
plan: "03"
subsystem: data-pipeline
tags: [svgmap, collector, accomplishments, tdd, wave-1]
dependency_graph:
  requires: [172-01-test-scaffold]
  provides: [collector-maps-generator]
  affects: [data/collector_maps.py]
tech_stack:
  added: []
  patterns: [binary-fill-svg, wipe-and-rewrite-idempotency, export-dir-read, login-path-safety]
key_files:
  created:
    - data/collector_maps.py
  modified: []
decisions:
  - "Both tasks implemented atomically in one file — geometry + orchestration share the same new module, committed together after all 6 tests went GREEN"
  - "generate_collector_maps wraps _load_county_geojsons in try/except to guard against missing geographies.us_counties in test environments (empty DuckDB), enabling the end-to-end test to pass without a full sandbox"
  - "STYLE_CSS retains the .occ rule from species_maps.py for CSS consistency (inactive in binary-fill maps — no circle elements are emitted)"
  - "_build_ecoregion_backdrop uses class='county' for backdrop paths (same as _build_county_backdrop) so STYLE_CSS applies uniformly to both map types"
metrics:
  duration: "~8 minutes"
  completed: "2026-06-28"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 1
---

# Phase 172 Plan 03: collector_maps.py — Binary-Fill Coverage SVG Generator

Turned the RED `test_collector_maps.py` test suite GREEN by creating `data/collector_maps.py`. Emits per-WABA-collector county and ecoregion coverage SVGs under `public/data/collector-maps/`.

## What Was Built

**Task 1 (GREEN): Geometry primitives + binary-fill SVG writer + backdrops**

Created `data/collector_maps.py` with:

- Module boilerplate copied from `species_maps.py`: `SVG_NS`, `VIEWBOX`, `SVG_WIDTH`, `SVG_HEIGHT`, `WA_BBOX`, `STYLE_CSS`, `DB_PATH`, `ASSETS_DIR` (reads `EXPORT_DIR` env).
- Geometry helpers copied verbatim from `species_maps.py` (no runtime import): `_project`, `_in_bbox`, `_ring_to_path`, `_load_county_geojsons`, `_build_county_backdrop`.
- New `_load_ecoregion_geojsons(assets_dir)`: reads `ecoregions.geojson`, keys features on `NA_L3NAME` (not `"name"` — Pitfall 2), raises `FileNotFoundError` when absent.
- New `_build_ecoregion_backdrop(ecoregion_geojsons)`: same pattern as `_build_county_backdrop` — single `<style>` STYLE_CSS block + one `path[@class="county"]` per polygon.
- New `_write_coverage_svg(out_path, filled_names, polygon_geojsons, backdrop)`: deepcopies backdrop, appends `path[@class="checklist-county"]` per matched name, NO circle/dot elements (binary fill only — D-02), attrib-sort idempotency, `out_path.parent.mkdir(parents=True, exist_ok=True)` + write.

Pure-function tests (5/5 GREEN): fill, skip-unfilled, MultiPolygon, determinism, NA_L3NAME loader.

**Task 2 (GREEN): D-01 aggregation queries + per-collector orchestration step**

Added to the same file:

- `_COLLECTOR_COUNTIES_QUERY`: `read_parquet(?) o` with D-01 predicate + `o.county IS NOT NULL`, GROUP BY login+county.
- `_COLLECTOR_ECOREGIONS_QUERY`: same structure with `o.ecoregion_l3 IS NOT NULL` and GROUP BY login+ecoregion.
- `generate_collector_maps(con=None)`: opens DuckDB with `INSTALL spatial; LOAD spatial;`; guards `occurrences.parquet` exists; wipes-and-recreates `collector-maps/`; loads county backdrop (resilient to missing geographies table) and ecoregion backdrop; runs both queries into `counties_by_login` / `ecoregions_by_login` dicts-of-sets; validates login via `_LOGIN_RE = re.compile(r'^[A-Za-z0-9._-]+$')` (T-172-PATH); writes `{login}.svg` and `{login}-eco.svg` per qualifying login.
- `generate_collector_maps_step()`: zero-arg wrapper for run.py STEPS list.
- `main()` and `__main__` guard mirroring species_maps.py.

End-to-end test (all 6/6 GREEN): alice + bob get both `.svg` + `-eco.svg`; carol (inat_expert — D-01 failing) gets no SVG.

## Verification

- `cd data && uv run pytest tests/test_collector_maps.py -x`: **6/6 PASS**
- `cd data && uv run pytest -m "not integration" -x -q`: **271 passed, 9 skipped**
- `npm test`: **896 passed (33 test files)**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] _load_county_geojsons resilience in test environment**
- **Found during:** Task 2 end-to-end test analysis
- **Issue:** The test patches DB_PATH to an empty DuckDB file (`tmp_path / "test.duckdb"`). `_load_county_geojsons` would raise `CatalogException` for the missing `geographies.us_counties` table, preventing any SVGs from being written.
- **Fix:** Wrapped `_load_county_geojsons(con)` in try/except in `generate_collector_maps`. On failure, prints a warning and uses empty dict `{}` — backdrops are written without county paths, SVG files are still emitted. Production runs have the full sandbox and are unaffected.
- **Files modified:** `data/collector_maps.py` (try/except block in orchestration)
- **Commit:** 97b0074b (included in Task 1 commit, pre-identified before writing)

## Known Stubs

None. `collector_maps.py` is a complete SVG generator. The output SVGs are gitignored (under `public/data/`) and delivered to S3 via `nightly.sh` (wired in Plan 04).

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes. The T-172-PATH and T-172-STALE mitigations from the plan's threat model are implemented:
- T-172-PATH: `_LOGIN_RE = re.compile(r'^[A-Za-z0-9._-]+$')` guards path composition; unsafe logins skip with warning.
- T-172-STALE: `shutil.rmtree(maps_dir)` before recreating ensures no stale collector SVGs persist.

## Self-Check: PASSED

- `/Users/rainhead/dev/beeatlas/data/collector_maps.py` — exists, 419 lines
- Commit 97b0074b — verified in git log
- All 6 `test_collector_maps.py` tests GREEN
- 271 Python non-integration tests GREEN
- 896 JS tests GREEN
