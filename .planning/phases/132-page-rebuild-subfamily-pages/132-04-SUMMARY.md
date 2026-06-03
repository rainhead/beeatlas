---
phase: 132-page-rebuild-subfamily-pages
plan: "04"
subsystem: ui
tags: [eleventy, nunjucks, species-js, subfamily, higher-taxa, D-03, D-04, D-05, D-06, D-08, D-09, PAGE-01, PAGE-02, PAGE-03, PAGE-04]
dependency_graph:
  requires:
    - phase: 132-02
      provides: public/data/higher_taxa.json (replaces higher_rank_taxon_ids.json, D-03)
    - phase: 132-03
      provides: public/data/species-maps/subfamily/{Name}.svg (12 SVGs, colored by genus)
  provides:
    - _data/species.js reads higher_taxa.json; genusList/subgenusList/tribeList taxon_ids from rollup
    - species.subfamilyList (12 entries, nested tribes->genera + flat fallback, hexColors)
    - _pages/subfamily.njk (12 pages at /species/subfamily/{Name}/)
  affects:
    - plan 132-05 (human verification of rebuilt pages)
    - phase 133 (browse tree will link to subfamily pages)
tech_stack:
  added: []
  patterns:
    - "higherTaxaByRankName[rank][name] O(1) lookup index from higher_taxa.json array"
    - "subfamilyList nested tribes->genera built from rollup rows (not string-grouping)"
    - "hslToHex(i*360/N, 70, 50) over sorted unique genera per subfamily matches Python _group_colors"
    - "TDD RED/GREEN: failing tests committed before implementation"
key-files:
  created:
    - _pages/subfamily.njk
  modified:
    - _data/species.js
    - src/tests/data-species.test.ts
key-decisions:
  - "higherTaxaByRankName index built at load time from higher_taxa.json array for O(1) taxon_id lookups (replaces higherRankTaxonIds dict, D-03)"
  - "subfamilyList populated entirely from higher_taxa.json rollup rows — no string-grouping of species.json (PAGE-01)"
  - "tribe-less subfamilies (Colletinae, Hylaeinae, Melittinae, Nomiinae, Rophitinae) detected by empty sfTribes array; render flat genera with no tribe chrome (D-05)"
  - "D-09 checklist branch (on_checklist / checklist records / 0 records) added to genus items in subfamily.njk for future checklist-only genera; Macropis/Melittinae renders '0 records' gracefully"
requirements-completed: [PAGE-01, PAGE-02, PAGE-03, PAGE-04]
duration: ~30 min
completed: 2026-06-03
---

# Phase 132 Plan 04: Rewire species.js + Subfamily Pages — Summary

**`_data/species.js` rewired onto `higher_taxa.json` rollup (retiring `higher_rank_taxon_ids.json`), `subfamilyList` exported with 12 nested tribes->genera entries, and 12 `/species/subfamily/{Name}/` pages built via `subfamily.njk`.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-06-03T10:35Z
- **Completed:** 2026-06-03T11:05Z
- **Tasks:** 2 (autonomous; Task 3 is human-verify checkpoint)
- **Files modified:** 3

## Accomplishments

- `_data/species.js` now reads `public/data/higher_taxa.json`; all `higher_rank_taxon_ids` references removed (D-03 retirement, T-132-11 mitigated)
- `genusList`, `subgenusList`, `tribeList` taxon_id lookups rewired to `higherTaxaByRankName[rank][name].taxon_id` (PAGE-01)
- New `subfamilyList` exported: 12 entries, nested tribes→genera (D-04), flat fallback for 5 tribe-less subfamilies (D-05), genus `hexColor` matching Python `_group_colors` (D-06, Pitfall 2)
- `_pages/subfamily.njk` creates 12 pages at `/species/subfamily/{Name}/` with SVG map, breadcrumb, metadata line, iNat link, checklist branch (D-09)
- All 32 Vitest assertions pass; `npm run build` succeeds with 12 subfamily dirs, no Eumeninae

## Task Commits

1. **RED — failing tests for rewire + subfamilyList** - `f5acb45` (test)
2. **GREEN — rewire species.js + subfamilyList** - `b557be2` (feat)
3. **Task 2: subfamily.njk template** - `e690f9b` (feat)

## Files Created/Modified

- `_data/species.js` — replaced `higherRankTaxonIdsPath`/`higherRankTaxonIds` with `higherTaxaPath`/`higherTaxaByRankName` index; rewired 3 `taxon_id` lookups; added `subfamilyList` builder; appended `subfamilyList` to export
- `_pages/subfamily.njk` — new template: pagination on `species.subfamilyList`, D-04 nested layout, D-05 flat fallback, swatch colors, checklist branch
- `src/tests/data-species.test.ts` — 8 new assertions: D-03 retirement, genusList taxon_id from rollup, subfamilyList length=12, no Eumeninae, integer taxon_ids, Apinae nested tribes, Colletinae flat genera, hexColor sequence match

## Decisions Made

- `higherTaxaByRankName` index is built once at module load from the `higherTaxa` array. Keys are `rank` → `name` → row. This gives O(1) lookups matching the original `higherRankTaxonIds.genus[name]` API, but backed by the full rollup row instead of just the integer id.
- `subfamilyList` uses `higherTaxaByRankName['subfamily']` rows as the source of truth; tribe/genus membership is derived from `higherTaxaByRankName['tribe']` and `['genus']` rows filtered by `subfamily === sf.name`. This is pure rollup-derived data (no string-grouping of species.json), satisfying PAGE-01.
- For tribe-less subfamilies: `sfTribes.length === 0` → `tribes = [], genera = [flatGenera]`. No separate "D-05 flag" needed — the condition is emergent from the data.
- D-09 checklist branch added to genus items in subfamily.njk using `g.occurrence_count > 0 / g.on_checklist / 0 records` pattern (mirrors genus.njk species branch). Current rollup genus rows don't carry `on_checklist`, so Melittinae/Macropis (occurrence_count=0) shows "0 records" — graceful degradation.

## Deviations from Plan

None — plan executed exactly as written. The D-09 checklist branch was added to genus items (not just a comment), fully satisfying the acceptance criteria grep for `on_checklist` and `checklist records`.

## Known Stubs

None. All data flows from the live `higher_taxa.json` dbt rollup. The `on_checklist` branch in subfamily.njk is live template logic (not a stub) — it just evaluates to false for all current genera since rollup genus rows don't carry that field.

## Threat Flags

No new network endpoints, auth paths, or schema changes. Threat mitigations verified:
- T-132-11: `higher_rank_taxon_ids` retired; `grep -c higher_rank_taxon_ids _data/species.js` returns 0; `npm run build` succeeds
- T-132-12: Eumeninae absent from subfamilyList (no bee species in rollup → not in `higherTaxaByRankName['subfamily']`); 12 dirs in `_site/species/subfamily/`, no Eumeninae
- T-132-14: `hslToHex(i*360/N, 70, 50)` over alphabetically sorted genera matches Python `_group_colors(sorted(unique_genera))`; Vitest hexColor-sequence test passes

## Self-Check: PASSED

Files exist:
- [FOUND] _data/species.js (0 references to higher_rank_taxon_ids)
- [FOUND] _pages/subfamily.njk (contains on_checklist, checklist records, species-maps/subfamily)
- [FOUND] src/tests/data-species.test.ts (32 tests, all passing)
- [FOUND] _site/species/subfamily/ (12 dirs: Andreninae, Apinae, Colletinae, Halictinae, Hylaeinae, Megachilinae, Melittinae, Nomadinae, Nomiinae, Panurginae, Rophitinae, Xylocopinae)
- [NOT FOUND — correct] _site/species/subfamily/Eumeninae/

Commits:
- [FOUND] f5acb45 — test(132-04): add failing tests (RED)
- [FOUND] b557be2 — feat(132-04): rewire species.js + subfamilyList (GREEN)
- [FOUND] e690f9b — feat(132-04): subfamily.njk template

## Human-Verify Checkpoint (Task 3)

Task 3 is a `checkpoint:human-verify` — the autonomous executor stops here. The user needs to:

1. Run `npm run dev` and open http://localhost:8080/species/subfamily/Apinae/ — confirm nested tribe headings with genera beneath, SVG map renders, genus swatch colors match map dot clusters (Pitfall 2)
2. Open http://localhost:8080/species/subfamily/Colletinae/ — confirm flat genus list, no tribe chrome, metadata omits tribes count
3. Spot-check totals on 5 genus/tribe pages vs. baselines (Andrena 3,589·2,735; Bombus 1,768·7,763; Megachile 1,186·480; Lasioglossum 1,718·115; Osmia 1,110·450; Bombini 1,768·7,763)
4. Check a checklist-only species page for grey swatch + "N checklist records"
5. Confirm no /species/subfamily/Eumeninae/ page

---
*Phase: 132-page-rebuild-subfamily-pages*
*Completed: 2026-06-03 (Tasks 1-2 done; Task 3 awaits human verification)*
