---
phase: 161-add-wdfw-wildlife-areas-as-places
verified: 2026-06-23T22:00:00Z
status: human_needed
score: 3/4 must-haves verified (SC-4 split: automated portion VERIFIED; UI filter visual is human-only)
overrides_applied: 0
human_verification:
  - test: "Load /app, open Regions panel, confirm all 33 WDFW wildlife areas are listed as selectable place filters, click one and confirm its boundary renders on the map"
    expected: "WDFW areas appear in the Regions/place-filter UI with correct names; clicking one filters occurrences to that area and draws the MultiPolygon boundary on the map"
    why_human: "Frontend auto-exposes new places.toml entries; visual and interactive confirmation is the only way to verify the full UI rendering pipeline"
---

# Phase 161: Add WDFW Wildlife Areas as Places — Verification Report

**Phase Goal:** Add the 33 web-listed WDFW wildlife areas as `[[places]]` entries in `content/places.toml`, pipeline-validated, under the ~1 MB browser weight cap, with occurrence membership assigned.
**Verified:** 2026-06-23T22:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth (Success Criterion) | Status | Evidence |
|---|--------------------------|--------|----------|
| 1 | 33 WDFW `[[places]]` entries in `content/places.toml`, each with correct `land_owner`, immutable `[a-z0-9-]` slug ending in `-wildlife-area`, and valid WGS84 MultiPolygon `geometry_wkt`; Jackman Creek excluded | VERIFIED | `python3` count: 167 total entries, 33 with `land_owner  = "Washington Department of Fish & Wildlife"` (two-space alignment correct); 0 bad slugs; 0 non-MULTIPOLYGON geometries; 0 Jackman Creek entries |
| 2 | Full place pipeline (validation → load → dbt-build → export → maps) completes green with new entries, including the 16 overlapping areas | VERIFIED | 26 tests pass across `test_add_wdfw_wildlife_areas.py` + `test_places_validation.py` + `test_places_load.py` + `test_places_export.py`; `occurrence_places.parquet` committed with 8,450 WDFW bridge rows; ST_Within join confirmed in `data/dbt/models/marts/occurrence_places.sql` |
| 3 | `public/data/places.geojson` weight delta measured; geometry simplified to recorded tolerance; total stays within ~1 MB | VERIFIED | File size: 895,784 bytes (< 1,048,576 byte cap); baseline was 345,580 bytes; delta +550,204 bytes; TOL=0.0005° recorded in `data/add_wdfw_wildlife_areas.py` line 34 and both SUMMARY files |
| 4 (automated portion) | Occurrences inside WDFW areas acquire that area's slug in `occurrence_places` bridge; 33 WDFW slugs present in `places.geojson`; bridge uses ST_Within join | VERIFIED | `occurrence_places.parquet`: 8,450 rows across 31 of 33 WDFW areas (2 areas have no collected occurrences — expected); all 33 WDFW slugs present in `places.geojson` FeatureCollection; `occurrence_places.sql` confirmed uses `ST_Within(occ_pt.pt, p.geom)` |
| 4 (UI filter visual) | WDFW areas selectable as place filter on map; boundaries render | HUMAN_NEEDED | Frontend auto-exposes new entries; visual confirmation required |

**Score:** 3/4 success criteria fully verified automatically; SC-4 UI portion deferred to human UAT

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/add_wdfw_wildlife_areas.py` | Curation script: fetch WDFW layer, DuckDB dissolve, emit 33 TOML blocks | VERIFIED | 204 lines; all required functions present (`fetch_wdfw_features`, `dissolve_to_wkt`, `slug_for`, `main`); `ST_Union_Agg`, `ST_SimplifyPreserveTopology`, `outSR=4326` confirmed; `ST_Overlaps` absent; `SystemExit` absent; `shapely` absent; TOL=0.0005° |
| `data/tests/test_add_wdfw_wildlife_areas.py` | Golden-fixture test: 9 tests, no network, Jackman Creek excluded | VERIFIED | 5782 bytes; 9 tests pass in 2.03s; imports `dissolve_to_wkt` and `slug_for`; no network call |
| `content/places.toml` | 33 new WDFW `[[places]]` entries, 134→167 total | VERIFIED | Exactly 167 total entries, 33 with WDFW `land_owner` (two-space aligned); all MULTIPOLYGON; all slugs end in `-wildlife-area`; Jackman Creek absent |
| `public/data/places.geojson` | FeatureCollection, 167 features, 33 WDFW slugs, ≤ ~1 MB | VERIFIED | 895,784 bytes; FeatureCollection with 167 features; all 33 WDFW slugs present; size within cap |
| `public/data/places.json` | 167 places with WDFW land_owner | VERIFIED | 33 WDFW entries with `land_owner = "Washington Department of Fish & Wildlife"` and real occurrence counts |
| `public/data/occurrence_places.parquet` | Bridge rows for WDFW areas via ST_Within | VERIFIED | 8,450 WDFW bridge rows; 31 of 33 WDFW areas with ≥1 row; 2 areas with 0 rows (no bees collected there yet — not a bug) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `content/places.toml` | `data/places_validation.py validate_places_step()` | places-validation pipeline step | VERIFIED | 17 place contract tests pass; overlaps load cleanly (Phase 160 guard removed) |
| `content/places.toml` | `data/dbt/models/marts/occurrence_places.sql` ST_Within | places-load → geographies.places → ST_Within join in dbt | VERIFIED | `occurrence_places.sql` line 40: `JOIN wa_places p ON ST_Within(occ_pt.pt, p.geom)`; 8,450 WDFW bridge rows in committed parquet |
| `content/places.toml` | `public/data/places.geojson` | places-export step | VERIFIED | All 33 WDFW slugs from toml appear in geojson; geojson is a valid FeatureCollection |
| `data/add_wdfw_wildlife_areas.py` | `data/add_new_places.py` | `toml_block()` reused verbatim | VERIFIED | Script contains `toml_block()` implementation with same two-space alignment as add_new_places.py template |
| `data/add_wdfw_wildlife_areas.py` | WDFW ArcGIS REST layer | `requests.get` with `outSR=4326`, `f=geojson` | VERIFIED | Source code lines 45–57: `requests.get(WDFW_URL, params={..., "outSR": "4326", "f": "geojson"}, timeout=120)` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `public/data/places.geojson` | WDFW place features | `data/places_export.py` → `geographies.places` table populated from `content/places.toml` | Yes — 33 real MultiPolygon geometries from WDFW ArcGIS REST | FLOWING |
| `public/data/occurrence_places.parquet` | WDFW bridge rows | `occurrence_places.sql` ST_Within join against `geographies.places` | Yes — 8,450 real rows across 31 WDFW areas | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| places.toml has 167 entries, 33 WDFW | `python3 -c "import tomllib; p=tomllib.load(open('content/places.toml','rb'))['places']; wdfw=[x for x in p if x.get('land_owner')=='Washington Department of Fish & Wildlife']; print(len(p), len(wdfw))"` | `167 33` | PASS |
| All 33 WDFW slugs end in `-wildlife-area` | python3 count | 0 exceptions | PASS |
| No Jackman Creek entry | python3 filter | 0 entries | PASS |
| All WDFW geometries are MULTIPOLYGON | python3 filter | 0 exceptions | PASS |
| places.geojson ≤ 1 MB | `ls -la public/data/places.geojson` | 895,784 bytes | PASS |
| places.geojson has 33 WDFW features | python3 count | 33 | PASS |
| All 26 tests pass | `cd data && uv run pytest tests/test_add_wdfw_wildlife_areas.py tests/test_places_validation.py tests/test_places_load.py tests/test_places_export.py -q` | 26 passed in 2.03s | PASS |
| occurrence_places bridge has 8,450 WDFW rows across 31 areas | DuckDB parquet query | 8,450 rows, 31 slugs | PASS |
| ST_Overlaps absent from curation script | `grep -c 'ST_Overlaps' data/add_wdfw_wildlife_areas.py` | 0 | PASS |
| SystemExit absent from curation script | `grep -c 'SystemExit' data/add_wdfw_wildlife_areas.py` | 0 | PASS |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TBD/FIXME/XXX/placeholder/stub patterns found in modified files | — | — |

Checked files: `data/add_wdfw_wildlife_areas.py`, `data/tests/test_add_wdfw_wildlife_areas.py`, `content/places.toml` (new entries only).

---

### SC-2 Pipeline Note

The SUMMARY reports the full pipeline was run via individual step invocation (places-validation → places-load → dbt-build → places-export → places-maps) rather than via a single `data/run.py` call, because the Ecdysis auth gate blocks the first run.py step in local dev. This is a known and documented local-dev constraint (the nightly cron on maderas has credentials). The committed artifacts (`places.geojson`, `places.json`, `occurrence_places.parquet`) are consistent with a successful pipeline execution: they contain the expected 33 WDFW features and 8,450 bridge rows. The 26 place contract tests pass independently. This is sufficient evidence that SC-2 is met.

---

### Human Verification Required

#### 1. WDFW Areas Appear in Map Regions Filter and Render

**Test:** Load `/app` in a browser. Open the Regions/place filter panel. Scroll through the list and confirm all 33 WDFW wildlife areas are present (e.g., "Asotin Creek", "L.T. Murray", "Oak Creek", "Wenas"). Select one WDFW area filter. Confirm the map zooms/pans to show the area's boundary polygon and that occurrences are filtered to that area.

**Expected:** All 33 WDFW areas appear in the Regions filter; selecting one filters the occurrence layer and draws the area's MultiPolygon boundary on the map.

**Why human:** The frontend auto-exposes new `places.toml` entries via `places.geojson` — no code was changed. Visual and interactive verification is the only way to confirm the boundary layer renders correctly and the filter chip is wired to the map filter state.

---

### Gaps Summary

No automated gaps found. All four success criteria are verified in their automated portions. The sole remaining item is the visual/interactive UAT for SC-4's map filter UI.

---

## D-05 Weight Budget (Verified)

| Metric | Value |
|--------|-------|
| Simplification tolerance (final) | 0.0005° (~55 m) |
| places.geojson BEFORE | 345,580 bytes |
| places.geojson AFTER | 895,784 bytes |
| Delta | +550,204 bytes |
| Cap | ~1,048,576 bytes (~1 MB) |
| Result | Under cap (895,784 < 1,048,576) |

Tolerance recorded in `data/add_wdfw_wildlife_areas.py` line 34 as `TOL = 0.0005`.

---

_Verified: 2026-06-23T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
