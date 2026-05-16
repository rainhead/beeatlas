---
phase: 93-multi-color-svg-map-generation
plan: "02"
subsystem: pipeline
tags: [python, svg, duckdb, pyarrow, pytest]

# Dependency graph
requires:
  - phase: 93-01
    provides: _group_colors(canonical_names) helper with D-01 deterministic HSL color assignment

provides:
  - _write_group_svg: per-group multi-color SVG writer with alphabetical-canonical_name circle ordering (D-01/D-02)
  - _generate_group_maps: reads species.parquet, builds genus/subgenus/tribe member dicts, emits SVGs under maps_dir/{genus,subgenus,tribe}/
  - Integration: _generate_group_maps called from generate_species_maps after per-species loop, sharing occ_by_canon + backdrop + maps_dir
  - Test coverage: 2 new tests (emits_expected_files + deterministic) + synthetic-parquet helper; 0 skips

affects: [94-genus-pages, 95-subgenus-tribe-pages]

# Tech tracking
tech-stack:
  added: [pyarrow (test-only, already a project dep via species_export.py)]
  patterns:
    - "D-01/D-02 alphabetical sort: sorted(species_points.keys()) in _write_group_svg ensures hue order in SVG matches Phase 94 HTML swatch order"
    - "Per-species <g fill='#rrggbb'> grouping: circles nested inside a <g> rather than per-element fill; keeps SVG readable and fill overrides .occ CSS class"
    - "Subgenus null guard in Python (not SQL): subgenus is not None and subgenus.strip() != '' — catches both DuckDB NULL and empty string"
    - "slash-in-slug → nested mkdir: _write_group_svg slug_path='Andrena/Melandrena' + out_path.parent.mkdir(parents=True) creates subgenus/<Genus>/ subdir automatically"

key-files:
  created: []
  modified:
    - data/species_maps.py
    - data/tests/test_species_maps.py

key-decisions:
  - "D-02 compliance: _write_group_svg iterates sorted(species_points.keys()) — alphabetical canonical_name is the canonical sort key; Phase 94 Eleventy templates must use the same key for HTML color-swatch ordering"
  - "No second DB sweep: occ_by_canon passed in from generate_species_maps, avoiding a second occurrences query"
  - "Subgenus null guard in Python not SQL: DuckDB read_parquet returns None for NULL and '' for empty string; both filtered by Python-side strip check per PATTERNS observation #3"
  - "Single wipe invariant preserved: _generate_group_maps never calls shutil.rmtree; only generate_species_maps wipes species-maps/ once at startup"

patterns-established:
  - "Group SVG writer pattern: deepcopy backdrop, iterate sorted species, emit <g fill=color> + circles, apply sorted-attrib idempotency pass, write via out_path.parent.mkdir(parents=True)"
  - "slug_path with slash creates nested directory via parent.mkdir(parents=True, exist_ok=True): e.g. slug_path='Genus/Subgenus' + out_dir='maps_dir/subgenus' → maps_dir/subgenus/Genus/Subgenus.svg"

requirements-completed:
  - PIPE-02

# Metrics
duration: 15min
completed: 2026-05-15
---

# Phase 93 Plan 02: Group SVG Map Generation Summary

**_generate_group_maps and _write_group_svg implemented in species_maps.py; wired into generate_species_maps; emits genus/<G>.svg, subgenus/<G>/<S>.svg, tribe/<T>.svg with per-species colored circles sorted alphabetically (D-01/D-02)**

**Status: COMPLETE — human verification approved 2026-05-15**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-15T23:40:00Z
- **Completed:** 2026-05-15T23:55:00Z (Tasks 1+2 only; Task 3 awaits human)
- **Tasks:** 2/3 complete (Task 3 is human-verify checkpoint)
- **Files modified:** 2

## Accomplishments
- Added `_write_group_svg` to `data/species_maps.py`: deepcopies backdrop, emits per-species `<g fill="...">` groups with circles in alphabetical `canonical_name` order (D-01), sorted attribs for idempotency, parent.mkdir for nested subgenus paths; returns clipped count
- Added `_generate_group_maps` to `data/species_maps.py`: reads `species.parquet`, builds genus/subgenus/tribe member dicts, iterates in sorted key order calling `_write_group_svg`; subgenus null guard in Python (strips both NULL and empty string); MUST NOT wipe maps_dir; prints group summary line
- Wired `_generate_group_maps(con, occ_by_canon, backdrop, maps_dir)` into `generate_species_maps` after the per-species summary print, sharing the single occ_by_canon sweep and county backdrop
- Replaced skip-guarded scaffold test with `test_generate_group_maps_emits_expected_files`: synthetic parquet via pyarrow, in-memory DuckDB, asserts all 6 output paths exist and SVG contains `<g fill="...">` elements without `class="occ"`
- Added `test_generate_group_maps_deterministic`: two runs on identical inputs produce byte-identical SVGs
- All 9 tests pass in 0.69s; 0 skips

## Task Commits

Each task was committed atomically:

1. **Task 1: Add _write_group_svg and _generate_group_maps, wire into generate_species_maps** - `11f9f52` (feat)
2. **Task 2: Activate group-map tests; add determinism test and synthetic-parquet fixture** - `38de977` (test)
3. **Task 3: Human verification** - APPROVED 2026-05-15

Additional post-checkpoint fixes committed by orchestrator:
- `fix(93)`: switched occurrence sweep from `ecdysis_data.occurrences` to `occurrences.parquet` dbt mart — now includes both Ecdysis and iNat-only records, matching the main map
- `fix(93)`: filter per-species SVGs with `specific_epithet IS NOT NULL` — excludes 102 genus-only occurrence records from getting their own SVG
- `fix(93)`: grey (`#aaaaaa`) for unresolved members on group maps — taxa identified only to genus/subgenus/tribe level shown as grey dots rather than a hue

## Files Created/Modified
- `data/species_maps.py` - Added `_write_group_svg` (51 lines) and `_generate_group_maps` (91 lines) before `generate_species_maps`; added call to `_generate_group_maps` at end of `generate_species_maps` body
- `data/tests/test_species_maps.py` - Replaced skip-guarded scaffold with real `test_generate_group_maps_emits_expected_files`; added `test_generate_group_maps_deterministic`; added `_write_test_species_parquet` helper; added `pyarrow`, `duckdb`, `_generate_group_maps` imports

## Decisions Made
- Alphabetical `canonical_name` sort in `_write_group_svg` (D-02 compliance): Phase 94 Eleventy templates must use the same key for HTML color-swatch ordering so colors match SVG dots
- Subgenus null guard in Python not SQL: catches both DuckDB NULL (Python `None`) and empty string via `.strip() != ''`
- `<g fill="...">` grouping over per-element fill: cleaner SVG, readable group structure, naturally avoids `class="occ"` CSS conflict
- No second DB sweep: pass `occ_by_canon` from `generate_species_maps` into `_generate_group_maps`

## Deviations from Plan

Three fixes applied during human verification (Task 3):
1. **Occurrence data source**: plan assumed `ecdysis_data.occurrences`; switched to `occurrences.parquet` dbt mart to match the main map (both Ecdysis + iNat arms).
2. **Per-species SVG filter**: added `AND specific_epithet IS NOT NULL` — 102 genus-only records were getting spurious per-species SVG files.
3. **Unresolved color**: taxa identified only to group level (no `specific_epithet`) now render grey (`#aaaaaa`) on group maps rather than a hue color.

## Issues Encountered

Pre-existing test failure in `tests/test_feeds.py::test_run_py_integration` (noted in 93-01 SUMMARY too; not caused by these changes).

## Known Stubs

None.

## Threat Flags

None — pure file-system output, no network or DB writes.

## Next Phase Readiness
- `_generate_group_maps` is wired and tested; running `cd data && uv run python species_maps.py` against a populated `beeatlas.duckdb` will emit all three directory trees
- Task 3 human verification required before declaring PIPE-02 complete
- Phase 94 (Genus Pages) can consume `public/data/species-maps/genus/<Genus>.svg` once Task 3 approved
- D-02 constraint documented: Phase 94 Eleventy templates must sort species by `canonical_name` alphabetically for color-swatch ordering to match SVG dot colors

## Self-Check

- [x] `data/species_maps.py` modified — `_write_group_svg` and `_generate_group_maps` present
- [x] `data/tests/test_species_maps.py` modified — 9 tests, 0 skips
- [x] Commits exist: `11f9f52` (feat) and `38de977` (test)
- [x] All plan acceptance criteria for Tasks 1 and 2 pass

---
*Phase: 93-multi-color-svg-map-generation*
*Completed: 2026-05-15*
