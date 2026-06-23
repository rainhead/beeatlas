---
phase: 161-add-wdfw-wildlife-areas-as-places
plan: "02"
subsystem: data/places
tags: [places, wdfw, duckdb-spatial, pipeline, geojson]

dependency-graph:
  requires:
    - phase: 161-01
      provides: data/add_wdfw_wildlife_areas.py (curation script, dissolve logic, slug convention)
  provides:
    - content/places.toml (33 new WDFW wildlife-area entries, 134→167 total)
    - public/data/places.geojson (167 features, 895,784 bytes, TOL=0.0005°)
    - public/data/places.json (167 places)
  affects:
    - frontend bee-sidebar (WDFW areas appear in Regions/place filter)
    - occurrence_places bridge (8,450 new rows assigned via ST_Within)

tech-stack:
  added: []
  patterns:
    - D-05 weight-budget check via before/after geojson byte measurement
    - Tolerance ratification (0.0002° → over cap; 0.0005° → 895 KB → accepted)
    - Full pipeline exercised via direct step invocation when full run.py blocked by auth gate

key-files:
  created: []
  modified:
    - content/places.toml
    - data/add_wdfw_wildlife_areas.py
    - public/data/places.geojson
    - public/data/places.json

key-decisions:
  - "TOL=0.0005° chosen (vs 0.0002°): 0.0002° would yield ~1.05 MB total (over cap); 0.0005° yields 895,784 bytes — under the ~1 MB cap (D-05)"
  - "16 WDFW↔existing-place overlaps loaded cleanly without any rejection — Phase 160 many-to-many model confirmed working"
  - "Full pipeline place steps run individually (places-validation → places-load → dbt-build → places-export → places-maps) because ecdysis auth gate blocked full run.py in local dev"

requirements-completed: [WLA-DISSOLVE, WLA-WGS84, WLA-VALID, WLA-WEIGHT]

duration: ~9min
completed: "2026-06-23"
---

# Phase 161 Plan 02: WDFW Wildlife Areas Content Addition Summary

**33 WDFW wildlife-area MultiPolygons dissolved and appended to places.toml (TOL=0.0005°, 895 KB result), flowing end-to-end through places-validation, dbt ST_Within join, occurrence_places bridge (8,450 rows), and places-export — all under the ~1 MB weight cap**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-23T21:00:00Z
- **Completed:** 2026-06-23T21:09:17Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Ran `data/add_wdfw_wildlife_areas.py` with TOL=0.0005°: 33 WDFW wildlife-area entries appended to `content/places.toml` (134 → 167 total), Jackman Creek correctly excluded (D-01)
- `validate_places_step()` exited 0 on the 167-entry file; the 16 known WDFW↔existing-place partial overlaps loaded cleanly as multi-place membership (Phase 160 many-to-many model confirmed operational)
- `public/data/places.geojson` regenerated: 345,580 → 895,784 bytes (BEFORE → AFTER); FeatureCollection contains all 33 `-wildlife-area` slug features; 31 of 33 WDFW areas contain ≥1 bee occurrence (8,450 total bridge rows)
- All 17 place contract tests pass (`test_places_validation.py`, `test_places_load.py`, `test_places_export.py`)

## D-05 Weight Budget (Required Report)

| Metric | Value |
|--------|-------|
| Simplification tolerance (final) | **0.0005°** (~55 m) |
| places.geojson BEFORE | 345,580 bytes |
| places.geojson AFTER | 895,784 bytes |
| Delta | +550,204 bytes |
| Cap | ~1,048,576 bytes (~1 MB) |
| Result | **Under cap** (895,784 < 1,048,576) |

Note: TOL=0.0002° was the default from Plan 01. Per D-05 research, this would yield ~716 KB WDFW contribution → ~1.05 MB total (marginally over cap). Raised to 0.0005° as specified in the plan's rationale; both tolerances produce valid geometries.

## Overlap Validation (D-03 Confirmation)

`validate_places_step()` ran against the updated 167-entry `content/places.toml` and exited 0 with no exceptions. The 16 known WDFW↔existing-place partial overlaps (e.g., Klickitat Wildlife Area ↔ Klickitat Trail) loaded cleanly — the former `ST_Overlaps` rejection was removed in Phase 160, and multi-place membership is correctly assigned via the `occurrence_places` bridge.

## Occurrence Bridge Results

| Metric | Value |
|--------|-------|
| Total WDFW occurrence_places rows | 8,450 |
| WDFW areas with ≥1 occurrence | 31 of 33 |
| WDFW areas with 0 occurrences | 2 (no bees collected in those areas yet) |

## Task Commits

1. **Task 1: Ratify tolerance and run the script to append 33 WDFW entries** - `fdeab07f` (feat)
2. **Task 2: Validate, run the full place pipeline, and confirm places.geojson weight** - `0b8c8c73` (feat)

## Files Created/Modified

- `content/places.toml` - 33 new `[[places]]` WDFW wildlife-area entries appended (134 → 167)
- `data/add_wdfw_wildlife_areas.py` - TOL constant updated from 0.0002 to 0.0005 (D-05 ratification)
- `public/data/places.geojson` - Regenerated: 167 features, 895,784 bytes, 33 WDFW slugs
- `public/data/places.json` - Regenerated: 167 places metadata

## Decisions Made

- **TOL=0.0005°**: The Plan 01 default of 0.0002° would exceed the ~1 MB cap (estimated ~1.05 MB total). Raised to 0.0005° per D-05 plan instruction. Both tolerances produce valid MULTIPOLYGON geometries; the coarser tolerance is acceptable for large wildlife-area boundaries.
- **Pipeline run strategy**: The full `run.py` failed at the first step (ecdysis) because the Ecdysis auth credentials are not configured in this local dev environment (auth gate, not a bug). Per the plan's stated pipeline scope, the places-specific steps were run individually: `places-validation` → `places-load` → `dbt build` → `places-export` → `places-maps`. All green.

## Deviations from Plan

**1. [Rule 3 - Blocking] TOL constant updated in the curation script before running**
- **Found during:** Task 1 (ratify tolerance)
- **Issue:** The Plan 01 default TOL=0.0002° was the correct research-phase default. The D-05 weight analysis showed it would yield ~1.05 MB total places.geojson (over cap). The plan explicitly directs: "Use 0.0005° if 0.0002° lands the total over ~1 MB."
- **Fix:** Set TOL=0.0005° in `data/add_wdfw_wildlife_areas.py` before running the script.
- **Files modified:** `data/add_wdfw_wildlife_areas.py`
- **Verification:** places.geojson = 895,784 bytes (under cap); all 33 entries valid MULTIPOLYGON.
- **Committed in:** fdeab07f (Task 1 commit)

---

**Total deviations:** 1 auto-applied (1 blocking / required per plan instructions)
**Impact on plan:** Necessary to meet the D-05 weight cap. No scope creep.

## Issues Encountered

- **Ecdysis auth gate**: `cd data && uv run python run.py` failed at the first step with HTTP 401 from `ecdysis.org`. This is expected in local dev — the nightly cron on maderas has credentials configured. The places-specific pipeline steps were run individually, all green. The dbt build (which enforces the 36-column occurrences contract) and occurrence_places bridge assignment were both confirmed green.

## User Setup Required

None — no external service configuration required. The nightly cron on maderas will run the full pipeline automatically. The data artifacts (`places.geojson`, `places.json`, and the updated `occurrence_places.parquet`) are committed and ready for S3 upload on the next nightly run.

## Next Phase Readiness

- All 33 WDFW wildlife areas are now in `content/places.toml` with correct MultiPolygon geometries, slugs, and `land_owner` strings
- `places.geojson` is under the weight cap and ready to ship
- Human UAT required (Manual-Only from VALIDATION.md): confirm WDFW areas appear in the map Regions/place filter and boundaries render on the map
- Phase 161 is complete pending UAT sign-off

---
*Phase: 161-add-wdfw-wildlife-areas-as-places*
*Completed: 2026-06-23*

## Known Stubs

None. All 33 WDFW entries are fully wired: geometry is present, slugs are set, land_owner is set, permits are set, and occurrence_places bridge rows have been assigned.

## Threat Flags

No new network endpoints, auth paths, or schema changes introduced beyond the ArcGIS REST GET (read-only, public government service) already covered by T-161-06 in the threat model.
