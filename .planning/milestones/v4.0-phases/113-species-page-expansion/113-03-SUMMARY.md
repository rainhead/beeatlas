---
phase: 113-species-page-expansion
plan: "03"
subsystem: data-pipeline
tags: [python, svg, checklist, species-maps, county-fill, tdd]
nyquist_compliant: true

dependency_graph:
  requires:
    - "113-01 (RED test gates for county fill)"
    - "113-02 (dbt + species_export checklist_count + merged histogram)"
  provides:
    - "Extended _write_species_svg with county fills for checklist counties (SPEC-03)"
    - "_load_county_geojsons returns dict[str, dict] keyed by county name"
    - "STYLE_CSS contains .checklist-county rule (fill: #b0cfe8, fill-opacity: 0.5)"
    - "generate_species_maps query expanded to include checklist-only species"
    - "527 species SVGs with county fills; 693 total SVGs"
    - "All three Plan 01 RED pytest cases for county fills are GREEN"
  affects:
    - "data/species_maps.py"
    - "data/tests/test_species_maps.py"
    - "public/data/species-maps/ (generated output, gitignored)"

tech_stack:
  added: []
  patterns:
    - "dict[str, dict] county-name-keyed GeoJSON mapping for fill lookup"
    - "SVG document-order fill-before-dot rendering (Pitfall 4)"
    - "defaultdict(set) per-species county set from checklist.parquet single-pass read"
    - "Graceful checklist.parquet missing-file guard (empty mapping, no crash)"

key_files:
  created: []
  modified:
    - path: "data/species_maps.py"
      changes: "STYLE_CSS: added .checklist-county rule; _load_county_geojsons: returns dict[str, dict]; _build_county_backdrop: iterates county_geojsons.values(); _write_species_svg: extended signature with checklist_counties + county_geojsons_by_name, fills before dots; generate_species_maps: query expanded to (occurrence_count > 0 OR on_checklist = true), reads checklist.parquet once, passes county set per species"
    - path: "data/tests/test_species_maps.py"
      changes: "test_write_species_svg_creates_subdir: updated for new 6-arg signature; _write_test_species_parquet: added checklist_count column to fixture"

decisions:
  - "County name mismatches in checklist.parquet ('No LatLon', 'Whtiman') are data quality issues — no normalize-by-trim added since trim doesn't fix these; both produce no fill silently (correct behavior)"
  - "SVG generation run against main repo EXPORT_DIR (not worktree) since worktree lacks gitignored parquet files — source code changes committed to worktree"

metrics:
  duration: "~4 minutes"
  completed_date: "2026-05-25"
  tasks_completed: 2
  files_modified: 2
  commits: 2
---

# Phase 113 Plan 03: SVG County Fills for Checklist Species

Extended the static SVG pipeline to render county-fill polygons (class="checklist-county", fill #b0cfe8) for checklist counties on every species page, while preserving occurrence-dot rendering for WABA species.

**One-liner:** Extended `species_maps.py` to render county fills under occurrence dots via named GeoJSON dict lookup; all three Plan 01 RED pytest tests now green; 527 species SVGs carry checklist-county fills.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend _load_county_geojsons to return dict keyed by county name and add STYLE_CSS rule | ecdb866 | data/species_maps.py, data/tests/test_species_maps.py |
| 2 | Extend _write_species_svg signature, read checklist.parquet, expand species query, render county fills | 25c9164 | data/species_maps.py |

## SVG File Count Before/After

| Metric | Before Plan 03 | After Plan 03 |
|--------|---------------|---------------|
| Species-level SVGs | 527 (occurrence > 0 only) | 527 (all on_checklist OR occurrence > 0) |
| Group SVGs (genus/subgenus/tribe) | 166 | 166 |
| Total SVGs | 693 | 693 |
| SVGs with class="checklist-county" fills | 0 | 527 |

Note: The total species-level SVG count did not increase from 527 because the production data already had `on_checklist = true` for all 527 species-level SVGs. The plan estimate of "565" was based on a projected checklist count; the actual data has 527 unique canonical names (confirmed in Plan 02 SUMMARY). All 527 species-level SVGs now carry checklist-county fills.

## County Fill Verification

SVGs containing `class="checklist-county"` path elements: **527**

Fills-before-dots ordering verified in `Stelis/laticincta.svg`:
```
[39] path  class='county'           (backdrop)
[40] path  class='checklist-county' (fill — before dots)
[41] path  class='checklist-county'
[42] path  class='checklist-county'
[43] path  class='checklist-county'
[44] circle class='occ'             (dot — after fills)
[45] circle class='occ'
[46] circle class='occ'
```

## pytest Results

```
12 passed in 0.72s (tests/test_species_maps.py)
```

Plan 01 RED tests now GREEN:
- `test_style_css_contains_checklist_county_class` — PASS
- `test_write_species_svg_renders_checklist_county_fill` — PASS
- `test_write_species_svg_no_checklist_fill_when_county_absent` — PASS

## County Name Mismatch Finding

One-shot verification found 2 county values in `checklist.parquet` that don't match `geographies.us_counties.name`:
- `'No LatLon'` — invalid placeholder value, not a county name
- `'Whtiman'` — misspelling of 'Whitman'

These are data quality issues in the source CSV (not a naming convention problem like "King" vs "King County"). The plan specified normalize-by-trim only for whitespace mismatches; these are typos. No normalization added — both produce no fill silently, which is the correct behavior for invalid county values.

## Deviations from Plan

### Auto-fixed Issues

None.

### Minor Adjustments

**1. [Rule 1 - Bug] test_write_species_svg_creates_subdir updated for new signature**
- **Found during:** Task 1 implementation
- **Issue:** Existing test called `_write_species_svg(slug, [], backdrop, tmp_path)` with old 4-arg signature; would fail with TypeError after signature extension
- **Fix:** Updated to `_write_species_svg(slug, [], set(), {}, backdrop, tmp_path)` (passes empty stubs for new params)
- **Files modified:** `data/tests/test_species_maps.py`
- **Commit:** ecdb866

**2. [Rule 2 - Missing] _write_test_species_parquet fixture added checklist_count column**
- **Found during:** Task 1 review
- **Issue:** Fixture lacked `checklist_count` column; would cause failures if tests exercise code paths that read the column
- **Fix:** Added `checklist_count: [3, 2, 1, 4]` to fixture table
- **Files modified:** `data/tests/test_species_maps.py`
- **Commit:** ecdb866

## Known Stubs

None — all data paths are fully wired.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond those in the plan threat model.

## Self-Check

Files exist:
- `data/species_maps.py` — FOUND (modified)
- `data/tests/test_species_maps.py` — FOUND (modified)

Commits exist:
- `ecdb866` — FOUND (Task 1)
- `25c9164` — FOUND (Task 2)

Acceptance criteria verified:
- `grep -c "dict[str, dict]"` → 3 (annotation present in _load_county_geojsons) ✓
- `grep -c "checklist-county"` → 2 in STYLE_CSS rule ✓
- `grep -c "#b0cfe8"` → 1 ✓
- `grep -c "fill-opacity: 0.5"` → 1 ✓
- SELECT name, ST_AsGeoJSON appears in _load_county_geojsons ✓
- All 12 pytest tests pass ✓
- _load_county_geojsons returns dict with 39 entries; keys str; values dicts ✓
- 693 total SVGs (>= 560) ✓
- 527 SVGs contain class="checklist-county" path element ✓
- Fills before dots order confirmed ✓

## Self-Check: PASSED
