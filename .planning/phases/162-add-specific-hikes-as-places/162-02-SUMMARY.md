---
phase: 162-add-specific-hikes-as-places
plan: "02"
subsystem: data-pipeline
tags: [places, hikes, geojson, pipeline, corridor, multi-place]
dependency_graph:
  requires: ["162-01"]
  provides: ["places.geojson with 13 hike corridors", "occurrence_places bridge hike slug assignments"]
  affects: [public/data/places.geojson, public/data/places.json, content/places.toml, data/add_hikes_as_places.py]
tech_stack:
  added: []
  patterns: ["corridor buffer (UTM Zone 10N, 250 m, tol=0.0002°)", "multi-place membership via ST_Within + occurrence_places bridge"]
key_files:
  created: []
  modified:
    - content/places.toml
    - data/add_hikes_as_places.py
    - data/tests/test_add_hikes_as_places.py
    - public/data/places.geojson
    - public/data/places.json
decisions:
  - "snoqualmie-pass-to-olallie-meadow-trail deferred (2026-06-23): OSM only has full PCT Section J (~75 km), over-claiming ~9× vs the ~8 km day-hike to Olallie Meadow; needs hand-traced GPX"
  - "tol=0.0002° (~22 m) ratified: 13 corridors add +24 KB vs the baseline 895,784 bytes; total 919,929 bytes, well under the 1 MB cap"
  - "geyser-valley-trail accepted as-is (OSM way 261478799, ~2.4 km)"
metrics:
  duration: "~45 minutes (including dbt build)"
  completed: "2026-06-24"
  tasks_completed: 3
  files_modified: 5
---

# Phase 162 Plan 02: Add Hike Corridors — Pipeline Run Summary

**One-liner:** 13 hike corridors loaded as buffered MULTIPOLYGON places, pipeline green end-to-end, places.geojson 895 KB → 920 KB (+24 KB, tol=0.0002°); Snoqualmie–Olallie deferred.

## What Was Done

### Task 1b: Resolve OSM-gap hikes (human decision applied)

Human decision received at checkpoint:

- **`snoqualmie-pass-to-olallie-meadow-trail`**: DEFERRED. OSM relation 1296807 is the full PCT Section J (~75 km, I-90 to Stevens Pass), over-claiming ~9× vs the ~8 km day-hike to Olallie Meadow. Removed from `content/places.toml`; commented out in `data/add_hikes_as_places.py` HIKES list with a dated deferral reason and a `gpx_path` pointer for future resolution. Commit: `a1174883`.
- **`geyser-valley-trail`**: ACCEPTED as-is. OSM way 261478799, ~2.4 km. Already present in places.toml from Task 1a. No action needed.
- All other 12 corridors: kept as-is.

**Net: 13 hike corridors ship in this POC.**

### Task 2: Validate, run pipeline, ratify tolerance

**Validation:** `validate_places_step()` exits 0. Trail↔WDFW area / trail↔national forest overlaps load cleanly as multi-place membership — no ST_Overlaps rejection (Phase 160 removed it).

**Contract tests:** 29/29 pass (one test assertion updated: `len(HIKES) == 14` → `13`, with a comment explaining the deferral).

**Pipeline run (place subset):**
- `validate_places_step()` — OK; 180 places valid
- `load_places_step()` — OK; 180 rows loaded to `geographies.places`
- `bash data/dbt/run.sh build` — 90 PASS, 1 WARN (pre-existing `test_lin05_lineage_coverage`), 0 ERROR
- `sqlite_export.py` — OK; occurrences.db 30.1 MB written to `public/data/`
- `export_places_step()` — OK; 180 features, 919,929 bytes, 180 places
- `generate_place_maps()` — OK; 119 files

**Weight budget ratification:**
| Metric | Value |
|--------|-------|
| BEFORE places.geojson | 895,784 bytes |
| AFTER places.geojson | 919,929 bytes |
| Delta | +24,145 bytes (+24 KB) |
| Cap | 1,048,576 bytes (~1 MB) |
| Headroom | ~128 KB |
| Tolerance | tol=0.0002° (~22 m) — ratified |

**Hike slugs in places.geojson (13):**
- big-four-ice-caves-trail
- boulder-de-roux-trail
- catherine-creek-loop-trail
- deception-pass-goose-rock-trail
- fortune-creek-pass-trail
- geyser-valley-trail
- icicle-gorge-loop-trail
- iron-peak-trail
- monte-cristo-trail
- naches-peak-loop-trail
- perry-creek-trail
- tomyhoi-lake-trail
- umtanum-creek-canyon-trail

**Occurrence_places bridge:** 1,943 hike-corridor occurrence assignments across 12 of 13 slugs. `fortune-creek-pass-trail` has 0 occurrences in the current DB — expected (remote trail, no iNat records yet). Multi-place membership confirmed: Umtanum Creek Canyon trail occurrences overlap `wenas-wildlife-area` (e.g., `ecdysis:6314081` belongs to both places by design — Phase 160 D-05 double-count).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated test assertion from 14 to 13 HIKES**
- **Found during:** Task 2 contract test run
- **Issue:** `test_all_hike_slugs_match_regex` asserted `len(HIKES) == 14`, but after deferring snoqualmie the active HIKES list has 13 entries. Test failed with `AssertionError: Expected 14 HIKES entries, got 13`.
- **Fix:** Updated assertion to 13 and added a comment referencing the deferral date and reason. Also updated the module docstring from "14" to "13 active".
- **Files modified:** `data/tests/test_add_hikes_as_places.py`
- **Commit:** `d98dc312`

## Known Stubs

None. All 13 hike corridors have real OSM-sourced MULTIPOLYGON geometry.

## Deferred Items

| Item | Reason | Future Action |
|------|---------|--------------|
| `snoqualmie-pass-to-olallie-meadow-trail` | OSM relation 1296807 spans full PCT Section J (~75 km); over-claims ~9× vs ~8 km day-hike to Olallie Meadow | Hand-trace route in caltopo.com/USFS layer (not AllTrails/WTA); commit GPX to `data/fixtures/hike-gpx/snoqualmie-pass-to-olallie-meadow.gpx`; re-run `add_hikes_as_places.py` |

## Local UAT Note

**Before testing the place filter / map corridors locally:**

The gitignored `public/data/occurrences.db` must be regenerated:
```bash
cd data && uv run python sqlite_export.py
```
(The full `uv run python run.py` is blocked locally by the Ecdysis auth gate — only the place subset pipeline steps run locally without credentials.)

After regenerating occurrences.db: hard-reload `/app` in the browser, then use the Regions menu or `?place=umtanum-creek-canyon-trail` to verify the place filter returns along-trail occurrences.

**Manual-only verifications (operator UAT):**
- Hike corridor polygons render as expected in the map (Regions → hike name)
- Sidebar shows filtered occurrence count for a hike with data (e.g., `umtanum-creek-canyon-trail`: ~1,243 occurrences)
- `fortune-creek-pass-trail` shows 0 occurrences (correct — no iNat data there yet)

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes introduced. All geometry is OSM-sourced (ODbL) or public domain. The `places.geojson` update is a data artifact refresh, not a structural change.

## Self-Check

Checking created/modified files and commits...

## Self-Check: PASSED

| Item | Status |
|------|--------|
| content/places.toml | FOUND |
| data/add_hikes_as_places.py | FOUND |
| data/tests/test_add_hikes_as_places.py | FOUND |
| public/data/places.geojson | FOUND |
| public/data/places.json | FOUND |
| Commit 2e5e09fa (Task 1a) | FOUND |
| Commit a1174883 (Task 1b) | FOUND |
| Commit d98dc312 (Task 2) | FOUND |
| snoqualmie removed from places.toml | OK |
| 13 hike slugs in places.geojson | OK |
| places.geojson ≤ 1 MB | OK (919,929 bytes) |
