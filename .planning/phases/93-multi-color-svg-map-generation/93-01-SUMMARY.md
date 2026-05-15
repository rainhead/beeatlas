---
phase: 93-multi-color-svg-map-generation
plan: "01"
subsystem: pipeline
tags: [python, svg, colorsys, testing, pytest]

# Dependency graph
requires:
  - phase: 92-slug-migration-pipeline-prep
    provides: Hierarchical slug format (Genus/epithet) in species.parquet and _write_species_svg subdir support

provides:
  - Pure helper _group_colors(canonical_names) -> dict[str, str] with D-01 deterministic HSL color assignment
  - Full unit test battery for _group_colors (7 tests) in test_species_maps.py
  - Skip-guarded path assertion scaffold test for _generate_group_maps (activates when Plan 02 lands)

affects: [93-02, 94-genus-pages]

# Tech tracking
tech-stack:
  added: [colorsys (stdlib, no new dependency)]
  patterns:
    - "D-01 color assignment: sort canonical_names alphabetically, assign hue = i * 360 / n, use colorsys.hls_to_rgb(hue/360, 0.5, 0.7) with round() for channel conversion"
    - "skipif hasattr guard pattern: @pytest.mark.skipif(not hasattr(module, 'fn'), reason='...') for forward-looking tests"

key-files:
  created: []
  modified:
    - data/species_maps.py
    - data/tests/test_species_maps.py

key-decisions:
  - "Use round() not int() for colorsys channel conversion to avoid systematic truncation bias across all three channels"
  - "Single-name group receives hue 0 (n=1 case: i * 360 / 1 = 0 for i=0)"

patterns-established:
  - "HLS argument order: colorsys.hls_to_rgb(hue/360, 0.5, 0.7) — note HLS not HSL order (hue, lightness, saturation)"
  - "Skip-guarded scaffold test: skipif not hasattr(module, 'function_name') lets forward-looking tests activate automatically when Plan 02 ships"

requirements-completed:
  - PIPE-02

# Metrics
duration: 8min
completed: 2026-05-15
---

# Phase 93 Plan 01: Color Helper and Test Scaffold Summary

**Pure `_group_colors` helper added to species_maps.py implementing D-01 HSL color assignment; 7-test battery + skip-guarded Plan 02 scaffold added to test_species_maps.py**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-15T23:19:00Z
- **Completed:** 2026-05-15T23:27:59Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `import colorsys` and `_group_colors` pure helper to `data/species_maps.py` with D-01 semantics: alphabetical sort, evenly-spaced HSL hues, lowercase hex output, `round()` for channel conversion
- Expanded `data/tests/test_species_maps.py` from 1 test to 8 tests: 6 new `_group_colors` unit tests + 1 skip-guarded path scaffold
- Skip-guarded `test_group_map_output_paths_skip_guarded` uses `hasattr(species_maps_module, '_generate_group_maps')` so it automatically unskips when Plan 02 lands that function

## Task Commits

Each task was committed atomically:

1. **Task 1: Add _group_colors helper to species_maps.py** - `ce967b6` (feat)
2. **Task 2: Expand test_species_maps.py with color helper tests and forward-looking assertions** - `ad6f7e8` (test)

**Plan metadata:** (committed with SUMMARY.md)

## Files Created/Modified
- `data/species_maps.py` - Added `import colorsys` and `_group_colors(canonical_names: list[str]) -> dict[str, str]` helper placed before `_write_species_svg`
- `data/tests/test_species_maps.py` - Added 7 new tests (6 `_group_colors` unit tests + 1 skip-guarded scaffold); existing `test_write_species_svg_creates_subdir` unchanged

## Decisions Made
- `round()` over bare `int()` for float→byte channel conversion to avoid systematic low truncation bias (all channels would trend slightly dark otherwise)
- Single-species input receives hue 0 naturally (n=1, i=0 → 0 * 360 / 1 = 0) — no special case needed
- Skip-guard uses `hasattr` approach (simpler than `pytest.mark.skip` with early `pytest.skip()`) to let the test activate automatically when `_generate_group_maps` lands

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing test failure found in `tests/test_feeds.py::test_run_py_integration` (fails because it looks for a `run.STEPS['export']` entry that was renamed). This failure was present before my changes (verified via `git stash`). Deferred per scope boundary rules — not caused by this plan's changes.

## Known Stubs

None.

## Threat Flags

None — pure utility helper with no network, file I/O, or DB access.

## Next Phase Readiness
- `_group_colors` is importable, pure, and deterministic — Plan 02 can `from species_maps import _group_colors` immediately
- Skip-guarded `test_group_map_output_paths_skip_guarded` will automatically activate when Plan 02 adds `_generate_group_maps`
- No blockers

## Self-Check

- [x] `data/species_maps.py` modified — `_group_colors` present
- [x] `data/tests/test_species_maps.py` modified — 8 tests collected
- [x] Commits exist: `ce967b6` and `ad6f7e8`
- [x] All plan acceptance criteria pass

---
*Phase: 93-multi-color-svg-map-generation*
*Completed: 2026-05-15*
