---
phase: 93-multi-color-svg-map-generation
verified: 2026-05-15T00:00:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Phase 93: Multi-Color SVG Map Generation Verification Report

**Phase Goal:** Deliver multi-color SVG maps for genus, subgenus, and tribe taxon pages (PIPE-02) — one SVG per genus, one per (genus, subgenus) where subgenus is non-null, one per tribe; each with per-species colored circles using deterministic HSL hue assignment.
**Verified:** 2026-05-15
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `_group_colors` pure helper assigns deterministic HSL-derived hex color to each species in a group, sorted alphabetically by canonical_name (D-01) | VERIFIED | Function defined at line 133 of species_maps.py; 6 unit tests pass (determinism, sort-order independence, hex format, empty, single, large-group) |
| 2 | Unit tests assert determinism, sort order, and group-size handling of the color helper without requiring the full pipeline | VERIFIED | tests/test_species_maps.py 9 tests run in 0.68s with no DB; `test_group_colors_*` battery present |
| 3 | Running species_maps.py against populated DB produces one SVG per genus, one per (Genus, Subgenus) where subgenus is non-null/non-empty, and one per tribe | VERIFIED | 44 genus SVGs, 103 subgenus SVGs under nested `<Genus>/` subdirs, 19 tribe SVGs confirmed in `public/data/species-maps/` |
| 4 | Each group SVG contains per-species `<g fill="#rrggbb">` circle groups and no `class="occ"` on circles | VERIFIED | Grep on genus/Andrena.svg: 0 `class="occ"` matches; `<g fill="#...">` elements present; test_generate_group_maps_emits_expected_files asserts this programmatically |
| 5 | Group-map generation reuses the single occurrence sweep (occ_by_canon) and county backdrop — no second DB pass | VERIFIED | `occ_by_canon` built once at line 421, passed to `_generate_group_maps` at line 444; `_generate_group_maps` takes it as a parameter and uses `.get(c, [])` — no second DB query |
| 6 | Single wipe of `species-maps/` happens exactly once; `_generate_group_maps` never calls `shutil.rmtree` | VERIFIED | Only one `shutil.rmtree` call at line 378 inside `generate_species_maps`; `_generate_group_maps` body contains no `rmtree` call |
| 7 | Color assignment is deterministic across runs (D-01) | VERIFIED | `test_generate_group_maps_deterministic` passes: byte-identical SVG output from two runs with identical inputs |
| 8 | Unresolved taxa (specific_epithet IS NULL) render grey (`#aaaaaa`) on group maps; per-species SVGs exclude genus-only records (specific_epithet IS NOT NULL filter) | VERIFIED | Grey override applied at lines 325, 337, 350; `specific_epithet IS NOT NULL` filter at line 398; 4 grey `<g fill="#aaaaaa">` groups in Andrena.svg confirmed |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/species_maps.py` | `_group_colors`, `_write_group_svg`, `_generate_group_maps` functions; call site in `generate_species_maps` | VERIFIED | All three functions defined (lines 133, 206, 262); call at line 444 |
| `data/tests/test_species_maps.py` | 9 tests total, 0 skips, covers color helper + group-map output paths + determinism | VERIFIED | 9 tests collected, all pass in 0.68s, 0 skips |
| `public/data/species-maps/genus/` | One SVG per genus with occurrence_count > 0 | VERIFIED | 44 genus SVGs present |
| `public/data/species-maps/subgenus/` | One SVG per non-null subgenus nested under `<Genus>/` subdir | VERIFIED | 103 subgenus SVGs across 34 genus subdirs |
| `public/data/species-maps/tribe/` | One SVG per tribe | VERIFIED | 19 tribe SVGs present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `generate_species_maps` | `_generate_group_maps` | shared occ_by_canon + backdrop + maps_dir | VERIFIED | Call at line 444: `_generate_group_maps(con, occ_by_canon, backdrop, maps_dir)` |
| `_generate_group_maps` | `species.parquet` | DuckDB `read_parquet` — SELECT canonical_name, genus, subgenus, tribe, specific_epithet WHERE occurrence_count > 0 | VERIFIED | Query at lines 283–290 |
| `_generate_group_maps` | `_group_colors` | called for each group (genus, subgenus, tribe) | VERIFIED | Called at lines 323, 335, 348 |
| `_write_group_svg` | occurrence points | `species_points = {c: occ_by_canon.get(c, []) for c in members}` | VERIFIED | Pattern at lines 322, 334, 347; no second DB sweep |
| Occurrence sweep | `occurrences.parquet` (dbt mart) | `read_parquet(occurrences_parquet)` | VERIFIED | Line 414; post-checkpoint fix switched from `ecdysis_data.occurrences` to dbt mart; includes both Ecdysis and iNat arms |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `genus/<G>.svg` | `species_points` (per-species point lists) | `occ_by_canon` populated from `occurrences.parquet` dbt mart at lines 411–425 | Yes — DB query with lat/lon/canonical_name columns | FLOWING |
| `subgenus/<G>/<S>.svg` | same `occ_by_canon` passed in | same source | Yes | FLOWING |
| `tribe/<T>.svg` | same `occ_by_canon` passed in | same source | Yes | FLOWING |
| Color assignment | `colors` dict from `_group_colors(members)` | `members` list built from `species.parquet` rows | Yes — parquet query returns real species rows | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `_group_colors` importable and pure | `cd data && uv run python -c "from species_maps import _group_colors"` | exit 0 | PASS |
| All 9 tests pass, no skips | `cd data && uv run pytest tests/test_species_maps.py -x -v` | 9 passed in 0.68s | PASS |
| Genus SVG exists in output | `ls public/data/species-maps/genus/Andrena.svg` | file exists, 44 genus SVGs total | PASS |
| No `class="occ"` in group SVGs | `grep -c 'class="occ"' public/data/species-maps/genus/Andrena.svg` | 0 | PASS |
| Grey color present for unresolved taxa | `grep -o '<g fill="#aaaaaa"' public/data/species-maps/genus/Andrena.svg \| wc -l` | 4 grey groups | PASS |
| Single `shutil.rmtree` call | `grep -c "shutil.rmtree" data/species_maps.py` | 1 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PIPE-02 | 93-01-PLAN.md, 93-02-PLAN.md | `species_maps.py` generates multi-color SVG occurrence maps for genus, subgenus, and tribe pages (each species assigned a distinct color within the group) | SATISFIED | `_generate_group_maps` wired and producing 44 genus + 103 subgenus + 19 tribe SVGs; per-species fill colors from `_group_colors`; human verification approved 2026-05-15 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | — |

No debt markers (TBD, FIXME, XXX, TODO, HACK, PLACEHOLDER) found in either modified file.

### Human Verification Required

None. Task 3 (human checkpoint) was explicitly completed and approved by the user on 2026-05-15. Pipeline was run against production `beeatlas.duckdb`; visual inspection of Andrena.svg and other group SVGs confirmed:
- Multi-colored dots visible in browser (Andrena ~72 species, many distinct colors)
- `<g fill="#...">` structure in SVG source, no `class="occ"` on circles
- Byte-identical output on second pipeline run (D-01 determinism verified)
- Full pytest suite passed post-verification

### Deviations Applied During Verification (Human-Approved)

Three fixes applied during Task 3 human checkpoint, all committed and present in codebase:

1. **Occurrence data source**: switched from `ecdysis_data.occurrences` to `occurrences.parquet` dbt mart — includes both Ecdysis and iNat-only records.
2. **Per-species filter**: `AND specific_epithet IS NOT NULL` added to species query — excluded 102 genus-only occurrence records from generating spurious per-species SVGs.
3. **Unresolved grey**: taxa with `specific_epithet IS NULL` receive `#aaaaaa` on group maps rather than a computed hue color.

All three deviations are verified present in `data/species_maps.py` (lines 300–302, 325/337/350, 398).

### Pre-existing Test Failures (Not Phase 93)

`tests/test_dbt_diff.py::test_species_json_matches` fails due to species.json content difference between sandbox and public — this failure pre-dates phase 93 and is unrelated to the two files this phase modified (`data/species_maps.py`, `data/tests/test_species_maps.py`). Confirmed by checking that `test_dbt_diff.py` is not in any phase 93 commit.

---

_Verified: 2026-05-15_
_Verifier: Claude (gsd-verifier)_
