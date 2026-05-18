---
phase: 98-pipeline-integration
plan: "03"
subsystem: data-pipeline
tags: [places, svg-maps, species-maps-reuse, ppipe, ppage]
dependency_graph:
  requires: [98-01, 98-02]
  provides: [data/places_maps.py, places-maps STEPS step, per-place SVG maps]
  affects: [data/run.py, public/data/place-maps/]
tech_stack:
  added: []
  patterns:
    - "places_maps.py imports _load_county_geojsons, _build_county_backdrop, _write_species_svg from species_maps.py (no code duplication)"
    - "mkdir(parents=True, exist_ok=True) only — no wipe-and-rewrite (Pitfall 6 avoidance)"
    - "WHERE place_slug IS NOT NULL filters occurrences.parquet to place-only rows"
    - "FileNotFoundError guard before reading occurrences.parquet (Parquet existence guard pattern)"
key_files:
  created:
    - data/places_maps.py
    - data/tests/test_places_maps.py
  modified:
    - data/run.py
decisions:
  - "Import _write_species_svg from species_maps.py (not redefined) — RESEARCH §A3 acceptable per tight coupling"
  - "No shutil.rmtree in places_maps.py — wipe-and-rewrite risks shared directory conflict with species-maps (Pitfall 6)"
  - "places-maps step inserted AFTER places-export, BEFORE feeds — keeps all places-* steps contiguous"
  - "0 SVGs written at current time is correct — neither polygon contains occurrence coordinates yet; Phase 99 must handle missing map gracefully"
metrics:
  duration: "2min"
  completed: "2026-05-18T01:27:59Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
requirements_completed: [PPAGE-03]
---

# Phase 98 Plan 03: Per-Place SVG Occurrence Maps Summary

**One-liner:** `places_maps.py` generates per-place SVG occurrence maps by reusing `_write_species_svg` and county backdrop helpers from `species_maps.py`; wired into run.py STEPS as the final places-* step before feeds; pytest covers SVG file existence and byte-stability.

## Tasks Completed

| # | Name | Commit | Key Output |
|---|------|--------|------------|
| 1 | Write failing pytest stubs for places_maps (RED) | 3f9eea9 | data/tests/test_places_maps.py — 2 tests, ModuleNotFoundError RED |
| 2 | Implement places_maps.py + wire into run.py STEPS (GREEN) | 37e59b5 | data/places_maps.py + run.py wired; both tests GREEN |

## Verification Results

1. `cd data && uv run pytest tests/test_places_maps.py -v` — 2 passed, 0 failed
2. `grep -c "from species_maps import" data/places_maps.py` → 1 (reuse, not duplication)
3. `grep -c "shutil.rmtree" data/places_maps.py` → 0 (Pitfall 6 avoidance confirmed)
4. STEPS order: places-validation → places-load → dbt-build → topology-postprocess → species-export → species-maps → places-export → places-maps → feeds (verified via grep)
5. `cd data && DB_PATH=.../beeatlas.duckdb EXPORT_DIR=.../public/data uv run python places_maps.py` → `place-maps/: 0 files, 0 total points clipped` (correct — no occurrences inside polygons yet)
6. Byte-stability: two consecutive runs produce identical output (diff -r exits 0)

## Deviations from Plan

None — plan executed exactly as written. The 0-SVG result is expected (documented in plan as "acceptable if zero occurrences fall inside TOML polygons").

## Known Stubs

None. places_maps.py is fully wired. SVG output will populate when real occurrence data falls within the seeded place polygons.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns beyond what is in the plan's `<threat_model>`.

- T-98-07 (f-string SQL injection via parquet path): `occurrences_parquet` is constructed from `ASSETS_DIR` (env-controlled, pipeline-owned) + fixed string `"occurrences.parquet"` — no user input crosses this boundary. Matches established `species_maps.py` pattern.
- T-98-08 (slug path traversal): slugs originate in `content/places.toml` and were validated by `places_validation.py` to `^[a-z0-9-]+$` in Phase 97; no `../` possible.
- T-98-09 (DoS from many places): `content/places.toml` is maintainer-curated with O(10s) entries; accepted.
- T-98-SC: no new package installs.

## TDD Gate Compliance

- RED commit: 3f9eea9 (`test(98-03): add failing pytest stubs for places_maps (RED)`)
- GREEN commit: 37e59b5 (`feat(98-03): implement places_maps.py + wire into run.py STEPS (GREEN)`)
- REFACTOR: not needed (clean implementation on first pass)

## Self-Check: PASSED

Files exist:
- data/places_maps.py: FOUND
- data/tests/test_places_maps.py: FOUND
- data/run.py: FOUND (modified — places-maps step added)

Commits exist:
- 3f9eea9: FOUND (test(98-03): add failing pytest stubs)
- 37e59b5: FOUND (feat(98-03): implement places_maps.py)
