---
phase: 132-page-rebuild-subfamily-pages
plan: "03"
subsystem: data-pipeline
tags: [python, svg, species-maps, subfamily, taxonomy, D-06, D-08, PAGE-02]
dependency_graph:
  requires:
    - phase: 132-01
      provides: higher_taxa dbt mart (species.parquet is the parquet source)
  provides:
    - public/data/species-maps/subfamily/{Name}.svg (12 bee subfamily SVGs, colored by genus)
  affects:
    - plan 132-04 (subfamily page template consumes these SVGs)
tech_stack:
  added: []
  patterns:
    - "subfamily group-map pass in _generate_group_maps: fourth pass after genus/subgenus/tribe"
    - "color-by-genus: _group_colors called on sorted unique-genus list, not sorted species list"
    - "broader membership query: occurrence_count > 0 OR on_checklist = true, consistent with per-species SVGs"
key_files:
  created: []
  modified:
    - data/species_maps.py
    - data/tests/test_species_maps.py
key-decisions:
  - "Query filter extended to occurrence_count > 0 OR on_checklist = true for membership building — consistent with per-species SVG generation and enables Melittinae (checklist-only subfamily) to get its map, completing the 12-subfamily requirement (D-08)"
  - "Genus-of lookup (genus_of dict) built in the existing membership loop — no second DB sweep needed for color assignment"
  - "Test fixture extended from 4 to 6 species (added Bombus flavidus + Apis mellifera) to enable the genus-color assertion (Bombus x2 must share one fill; Apis gets different fill)"
requirements-completed: [PAGE-02]
duration: ~25 min
completed: 2026-06-03
---

# Phase 132 Plan 03: Subfamily SVG Maps — Summary

**12 bee subfamily SVGs generated under `public/data/species-maps/subfamily/`, colored by genus (D-06), with no Eumeninae wasp map (D-08); all 15 pytest assertions GREEN.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-03T16:45Z
- **Completed:** 2026-06-03T17:05Z
- **Tasks:** 1 (TDD)
- **Files modified:** 2

## Accomplishments

- Extended `_generate_group_maps` in `data/species_maps.py` with a fourth pass for subfamilies
- 12 SVGs emitted at `public/data/species-maps/subfamily/{Name}.svg` (Andreninae, Apinae, Colletinae, Halictinae, Hylaeinae, Megachilinae, Melittinae, Nomadinae, Nomiinae, Panurginae, Rophitinae, Xylocopinae)
- No Eumeninae.svg generated (wasp bycatch gate via species.parquet data, D-08 / HIER-05)
- Apinae SVG: 81 species groups, exactly 11 distinct fill colors (one per genus) — confirms genus-level coloring (D-06)

## Task Commits

1. **RED — failing subfamily SVG tests** - `40f3ce5` (test)
2. **GREEN — subfamily pass in `_generate_group_maps`** - `f8f71fe` (feat)

## Files Created/Modified

- `data/species_maps.py` — extended SQL SELECT (+ subfamily column), added `subfamily_members` + `genus_of` dicts, broadened membership query to include checklist-only species, added subfamily pass after tribe pass, updated final print()
- `data/tests/test_species_maps.py` — extended test fixture to 6 species; added `test_generate_group_maps_emits_subfamily_svgs` (sandbox-gated, 12 SVGs, no Eumeninae), `test_generate_group_maps_subfamily_genus_coloring` (Bombus fills match, D-06), `test_generate_group_maps_no_eumeninae_svg` (unit fixture test)

## Decisions Made

**Query filter broadened to `occurrence_count > 0 OR on_checklist = true`**

The plan said to use the existing `WHERE occurrence_count > 0` filter for the parquet read. That filter yields only 11 subfamilies because Melittinae has a single checklist-only species (`Hesperapis regularis`) with `occurrence_count = 0`. Using `OR on_checklist = true` is consistent with how per-species SVGs are generated (see `generate_species_maps` species_rows query) and correctly emits 12 subfamily SVGs as required by D-08. The broader filter also ensures future checklist-only species in other subfamilies don't silently lose their group map.

## Subfamily SVGs Generated (12)

| Subfamily | Genera | Note |
|-----------|--------|------|
| Andreninae | 1 (Andrena) | |
| Apinae | 11 | Bombus, Anthophora, Apis, Brachymelecta, Diadasia, Epimelissodes, Eucera, Habropoda, Melecta, Melissodes, Zacosmia |
| Colletinae | 1 (Colletes) | |
| Halictinae | 4 (Agapostemon, Halictus, Lasioglossum, Sphecodes) | |
| Hylaeinae | 1 (Hylaeus) | |
| Megachilinae | 15 | |
| Melittinae | 1 (Hesperapis) | checklist-only; map is empty county backdrop |
| Nomadinae | 5 | |
| Nomiinae | 1 (Ashmeadiella) | |
| Panurginae | 3 (Calliopsis, Perdita, Protandrena) | |
| Rophitinae | 1 (Dieunomia) | |
| Xylocopinae | 2 (Ceratina, Xylocopa) | |

**Sorted-genus-list ordering for Plan 04 swatch coloring (Pitfall 2):**

For each subfamily, `_group_colors(sorted(unique_genera))` assigns colors. Plan 04's `species.js` `hslToHex` must use the same sorted genus list. Example for Apinae (alphabetical): `['Anthophora', 'Apis', 'Bombus', 'Brachymelecta', 'Diadasia', 'Epimelissodes', 'Eucera', 'Habropoda', 'Melecta', 'Melissodes', 'Zacosmia']` — 11 genera, hues evenly spaced at `i * 360 / 11`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Query filter extended to include checklist-only species for complete 12-subfamily coverage**
- **Found during:** Task 1 (RED phase — first test run)
- **Issue:** The plan specified `WHERE occurrence_count > 0` for the SQL query, but that filter yields only 11 subfamilies. Melittinae's single species has `occurrence_count = 0` (checklist-only), so no subfamily map was generated, violating the 12-subfamily requirement from D-08.
- **Fix:** Extended filter to `WHERE occurrence_count > 0 OR on_checklist = true`, consistent with how `generate_species_maps` queries per-species SVG membership (same broader filter).
- **Files modified:** data/species_maps.py
- **Verification:** 12 SVGs generated including Melittinae.svg; 15 tests GREEN
- **Committed in:** f8f71fe

---

**Total deviations:** 1 auto-fixed (Rule 1 — data discrepancy between plan assumption and actual Melittinae occurrence data)
**Impact on plan:** Necessary correction; no scope creep. The behavior is more consistent with per-species SVG generation.

## Known Stubs

None. All 12 SVGs contain real occurrence data (or an empty county backdrop for Melittinae, which has no occurrence coordinates — correct behavior for a checklist-only subfamily).

## Threat Flags

No new network endpoints, auth paths, or schema changes. Threat mitigations verified:
- T-132-08: Eumeninae.svg absent — confirmed by `ls public/data/species-maps/subfamily/` (12 files, no Eumeninae)
- T-132-09: Genus dot color = page swatch color — both sides use `_group_colors(sorted(unique_genera))`; per-genus single-color SVG test passes
- T-132-10: Per-species coloring absent — Apinae.svg has 11 distinct fills for 81 species groups; test confirms both Bombus species share one fill

## Self-Check: PASSED

Files exist:
- [FOUND] data/species_maps.py (modified)
- [FOUND] data/tests/test_species_maps.py (modified)
- [FOUND] public/data/species-maps/subfamily/Andreninae.svg
- [FOUND] public/data/species-maps/subfamily/Apinae.svg
- [FOUND] public/data/species-maps/subfamily/Melittinae.svg
- [FOUND] public/data/species-maps/subfamily/Xylocopinae.svg
- [NOT FOUND — correct] public/data/species-maps/subfamily/Eumeninae.svg

Commits:
- [FOUND] 40f3ce5 — test(132-03): add failing subfamily SVG tests (RED)
- [FOUND] f8f71fe — feat(132-03): add subfamily group-map pass to _generate_group_maps (GREEN)

---
*Phase: 132-page-rebuild-subfamily-pages*
*Completed: 2026-06-03*
