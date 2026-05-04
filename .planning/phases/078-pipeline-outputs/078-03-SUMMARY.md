---
phase: 078-pipeline-outputs
plan: 03
subsystem: data-pipeline

tags: [duckdb, svg, xml-etree, st-asgeojson, st-simplifypreservetopology, wa-bbox, idempotent, slug]

requires:
  - plan: 078-01
    provides: data/config.STATE_FIPS, OFFBBOX-01 fixture row, Wave 0 stubs in test_species_maps.py
  - plan: 078-02
    provides: public/data/species.parquet with byte-stable slug column (slug source = scientificName)
provides:
  - "data/species_maps.py::generate_species_maps — emits one <slug>.svg per species with occurrence_count > 0"
  - "public/data/species-maps/<slug>.svg — county backdrop + <circle class='occ'> per in-bbox occurrence"
  - "Constant STATE_FIPS-driven WA county polygon backdrop (config-sourced, not hardcoded)"
affects: [078-04-pipeline-wire, 080-species-tab]

tech-stack:
  added: ["xml.etree.ElementTree (stdlib) — first use as a writer outside data/feeds.py"]
  patterns:
    - "Build SVG county backdrop ONCE per run, then copy.deepcopy + append <circle> per species"
    - "Single <style> block with classes (.county / .occ) instead of per-element fill/stroke (D-03)"
    - "shutil.rmtree(species-maps) + mkdir at start of each run (D-04 idempotency)"
    - "Off-bbox occurrences silently dropped + logged via stdout — never raise (MAP-04 / Pitfall #5)"

key-files:
  created:
    - data/species_maps.py
  modified:
    - data/tests/test_species_maps.py

key-decisions:
  - "County polygon source: ST_GeomFromText(geometry_wkt) wrapped around ST_SimplifyPreserveTopology(.., 0.005) — fixture (and production) us_counties stores WKT in the geometry_wkt column. The plan's literal SQL referenced a bare `geom` column that does not exist in the schema; the WKT-cast was added as a Rule 3 (blocking) auto-fix."
  - "Slug source confirmed = scientificName (Plan 02 chose scientificName; this module never recomputes — it reads slug straight from species.parquet)."
  - "Test setup helper _setup_artifacts runs export → species_export → species_maps in sequence so each test gets a fresh full pipeline pointed at tmp_path. species_maps depends on species.parquet which depends on occurrences.parquet."

requirements-completed: [MAP-01, MAP-02, MAP-03, MAP-04, MAP-06]

duration: ~12min
completed: 2026-05-04
---

# Phase 078 Plan 03: Species Maps Summary

`generate_species_maps` emits one `public/data/species-maps/<slug>.svg` per species with `occurrence_count > 0`. Each SVG carries the WA county polygon backdrop (loaded once, deep-copied per species), a single `<style>` block with `.county`/`.occ` classes (D-03), and one `<circle class="occ">` per in-bbox occurrence; off-WA-bbox points are silently dropped and the clipped count is printed (MAP-04 / Pitfall #5).

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-04 (worktree session)
- **Completed:** 2026-05-04
- **Tasks:** 1 (TDD: RED test commit, then GREEN implementation commit)
- **Files changed:** 2 (1 created, 1 modified)
- **Test results:** 6/6 species_maps tests green; full pytest suite 119 passed (the single remaining failure is the documented Plan 078-04 idempotency Wave 0 stub)

## Accomplishments

- `data/species_maps.py::generate_species_maps(con)` produces all SVGs in one call.
- Single multi-CTE-free flow: load county backdrop once → fetch all occurrences once → group by canonical_name in Python → for each species in `species.parquet` with `occurrence_count > 0`, deepcopy backdrop, append circles, write file.
- Wipe-and-rewrite idempotency: `shutil.rmtree(species-maps)` then `mkdir(parents=True)` at the start of each run (D-04).
- Off-bbox clip is silent + logged: `species-maps/andrena-anograe.svg: 1 points clipped` line surfaced via stdout; the function never raises.
- Slug never recomputed in this module — read straight from `species.parquet` (Pitfall #3).
- All 6 acceptance-criteria greps pass (file present, `from config import STATE_FIPS`, `shutil.rmtree`, `<style>` emission, `viewBox`, `0 0 600 320`, WA_BBOX literal, `ST_SimplifyPreserveTopology(.., 0.005)`, `state_fips = ?`, `points clipped`, no `raise.*(clip|bbox|out of)`).
- `cd data && uv run python -c "import species_maps; print(species_maps.STATE_FIPS, species_maps.VIEWBOX)"` prints `53 0 0 600 320` as expected.

## Task Commits

1. **Task 1 RED — replace 6 Wave 0 stubs with real assertions** — `7ff0331` (`test(078-03)`)
2. **Task 1 GREEN — implement generate_species_maps** — `cf67180` (`feat(078-03)`)

## Files Created / Modified

### Created
- `data/species_maps.py` — 257 lines. Exports `generate_species_maps(con)` and `main()`. Module-level constants: `DB_PATH`, `ASSETS_DIR`, `SVG_NS`, `VIEWBOX`, `SVG_WIDTH`, `SVG_HEIGHT`, `WA_BBOX`, `STYLE_CSS`. Helpers: `_project`, `_in_bbox`, `_ring_to_path`, `_load_county_geojsons`, `_build_county_backdrop`, `_write_species_svg`.

### Modified
- `data/tests/test_species_maps.py` — replaced 6 Wave 0 stubs with real assertions wired around a shared `_setup_artifacts` helper.

## Plan-Required Output Documentation

### Largest fixture SVG byte size

`lasioglossum-zonulum.svg` = **1,605 bytes** (it has 1 in-bbox circle in addition to the 1 county backdrop path; the additional circle adds ~54 bytes vs. the 0-circle baseline of 1,551 bytes).

Full distribution across the 10 fixture SVGs:

| File | Bytes | In-bbox circles |
|------|-------|-----------------|
| lasioglossum-zonulum.svg | 1,605 | 1 |
| bombus-melanopygus.svg | 1,605 | 1 |
| osmia-californica.svg | 1,551 | 0 |
| xylocopa-virginica.svg | 1,551 | 0 |
| halictus-ligatus.svg | 1,551 | 0 |
| zzzzz-nonexistensia.svg | 1,551 | 0 |
| osmia-lignaria.svg | 1,551 | 0 |
| bombus-impatiens.svg | 1,551 | 0 |
| andrena-anograe.svg | 1,551 | 0 (only occurrence is the OFFBBOX-01 row, clipped) |
| megachile-rotundata.svg | 1,551 | 0 |
| **Total** | **15,618** | — |

(Production has 39 WA counties + ~700 species — file sizes will be higher; the dominant cost is the county backdrop, replicated per file via deepcopy. A future optimization could externalize the backdrop as a `<use href="#counties">` reference, but that is out of scope for this plan.)

### Conftest WA county count

The fixture seeds **exactly 1** WA county (Chelan, geoid=53007). The `test_county_paths_and_circles` assertion uses `SELECT COUNT(*) FROM geographies.us_counties WHERE state_fips = '53'` to compute the expected `<path class="county">` count dynamically, so the assertion holds against both the fixture (1 path) and production (39 paths) without modification.

### Verbatim STYLE_CSS

```css
.county { fill: #f4f4f0; stroke: #888; stroke-width: 0.5; }
.occ { fill: #c44; fill-opacity: 0.6; stroke: none; }
```

(In source: a single Python string constant `STYLE_CSS` joined with `"\n"` between the two rules — the `<style>` element's `text` attribute receives this value verbatim. Plan 04 verification can grep for `.county { fill: #f4f4f0` and `.occ { fill: #c44` to assert presence.)

### Total clipped count during the test run

**1 point clipped** — exactly the OFFBBOX-01 fixture row (`andrena anograe`, lon=-117.5, lat=44.8, eastern Oregon, outside WA bbox). The clip surfaces in stdout as:

```
  species-maps/andrena-anograe.svg: 1 points clipped
  species-maps/: 10 files, 15,618 bytes, 1 total points clipped
```

`test_off_bbox_clipping` asserts both that `"points clipped"` appears in captured stdout AND that `andrena-anograe.svg` has zero `<circle>` elements (its only occurrence is the off-bbox row, so the circle count must be 0).

### Deviations from RESEARCH Pattern 4

- **County polygon source column.** RESEARCH Pattern 4 / the plan's literal SQL referenced `geom` directly: `ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.005)) FROM geographies.us_counties`. The actual table schema (both fixture and production, per `data/tests/conftest.py:27-31` and `data/export.py:282-286`) stores the polygon as `geometry_wkt VARCHAR`, so DuckDB raises `Catalog Error: Column "geom" not found` against that literal SQL. Replaced with `ST_GeomFromText(geometry_wkt)` wrapping the simplification call — matches the existing `data/export.py::export_counties_geojson` idiom exactly. See deviation #1.
- **Class names.** RESEARCH Pattern 4 emitted the occurrence circles inside a `<g fill="#c44" fill-opacity="0.6">` group with no class. D-03 (LOCKED) requires class-based styling, so I dropped the `<g>` wrapper and put `class="occ"` directly on each `<circle>` — the parent `<style>` block carries the fill / fill-opacity declarations. The same swap applied to county paths: `<path class="county">` rather than `<path fill="#f4f4f0" stroke="#888">`. The plan's `<action>` section already prescribed this swap; the deviation is only against RESEARCH (the older draft).

## Decisions Made

- **County polygon SQL fix:** Use `ST_GeomFromText(geometry_wkt)` (matches `data/export.py::export_counties_geojson`). The `geom` column literal in the plan would have raised a Catalog Error on first call; treating this as a Rule 3 (blocking) auto-fix.
- **No re-import of `_slugify`:** This module never imports `_slugify` because it never slugifies. Slug is always read from `species.parquet`. The test file imports `_slugify` to verify byte-for-byte agreement, but the production code path stays slugify-free.
- **Backdrop reuse via `copy.deepcopy`:** Build the backdrop element tree once and `deepcopy` per species. Avoids re-running `ST_SimplifyPreserveTopology` per species (would be O(N_species × N_counties × geometry_size) — wasteful for production's 700 × 39 case).
- **Single occurrence sweep:** Fetch all occurrences once, group by canonical_name in Python with a `defaultdict(list)`. For 700 species, this is one DuckDB round-trip vs. 700 — same idiom as `data/feeds.py::write_all_variants` (which fetches per-variant) but flipped because we have a small fixed county count and a large variable species count.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `geom` column in plan's literal SQL doesn't exist in the schema**
- **Found during:** Task 1 GREEN, first run of `test_county_paths_and_circles`.
- **Issue:** The plan literal SQL `SELECT ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.005)) FROM geographies.us_counties WHERE state_fips = ?` raises `BinderException: Referenced column "geom" not found`. The fixture table — and production via `data/db_loaders/load_geographies.py` — stores polygons as `geometry_wkt VARCHAR` (verified at `data/tests/conftest.py:27-31` and `data/export.py:282-286`).
- **Fix:** Wrap the WKT column in `ST_GeomFromText(...)`: `ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_GeomFromText(geometry_wkt), 0.005))`. This matches `data/export.py::export_counties_geojson` (which uses tolerance `0.001` instead — D-03 specifies `0.005` for the smaller 600x320 viewport). Acceptance-criteria grep `ST_SimplifyPreserveTopology(geom, 0\.005)` was relaxed to also match the WKT-wrapped form.
- **Files modified:** `data/species_maps.py`
- **Verification:** All 6 species_maps tests pass; full suite 119/120 (the 1 known Plan 078-04 stub).
- **Committed in:** `cf67180` (Task 1 GREEN).

### Process deviations

None. The plan declared `tdd="true"` for Task 1; both the RED and GREEN gates were observed (RED commit `7ff0331` failed with `ModuleNotFoundError: No module named 'species_maps'`; GREEN commit `cf67180` flips all 6 tests green). No REFACTOR commit needed — the implementation matches the structure laid out in `<action>` verbatim.

## Issues Encountered

None beyond the deviation above.

## TDD Gate Compliance

- **RED commit:** `7ff0331 test(078-03): replace species_maps Wave 0 stubs with real assertions` — observed to fail with `ModuleNotFoundError: No module named 'species_maps'` before any implementation existed.
- **GREEN commit:** `cf67180 feat(078-03): implement generate_species_maps (county backdrop + per-species SVG)` — flips all 6 tests green.
- **REFACTOR commit:** None needed — the implementation matches the plan's `<action>` structure as written.

## User Setup Required

None — all changes are Python source and tests tracked in git. The new module reads from the existing fixture conftest (geographies.us_counties, ecdysis_data.occurrences) and from `public/data/species.parquet` written by `species_export.export_species_parquet`.

## Next Phase Readiness

- **Plan 078-04 (pipeline wire):** Adds `("species-maps", generate_species_maps)` to `data/run.py` STEPS *after* `("species-export", ...)` and *before* `("feeds", ...)`. The idempotency test (`test_idempotency_two_runs`) — currently the only Wave 0 stub still red — is the verification gate for that wiring. Plan 04 will exercise the full pipeline twice and assert byte-for-byte identical artifacts.
- **Phase 80 (Species Tab):** can `<img src="/data/species-maps/<slug>.svg" />` once Plan 04 ships nightly artifacts.

## Self-Check: PASSED

- `data/species_maps.py` — FOUND
- `data/tests/test_species_maps.py` (modified) — FOUND
- Commit `7ff0331` (test) — FOUND
- Commit `cf67180` (feat) — FOUND
- All 6 species_maps tests pass; full suite 119/120 (the single remaining failure is the documented Plan 078-04 stub)
- `import species_maps; species_maps.STATE_FIPS == '53'` — verified
- `species_maps.VIEWBOX == "0 0 600 320"` — verified
- All Task 1 acceptance criteria greps return ≥1

---

*Phase: 078-pipeline-outputs*
*Completed: 2026-05-04*
