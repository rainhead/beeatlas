---
phase: 95
plan: "02"
subsystem: frontend-ssg
tags:
  - eleventy
  - tribe
  - taxon-pages
  - ssg
dependency_graph:
  requires:
    - 95-01  # subgenusList pattern, public/ symlink workaround
    - 93-02  # Phase 93 PIPE-02 — tribe SVG maps on disk (19 files)
    - 94     # Phase 94 — genus pages, genusList, hslToHex
  provides:
    - tribeList  # default export key in _data/species.js
    - tribe-pages  # 19 static HTML pages at /species/tribe/{TribeName}/
  affects:
    - _data/species.js
    - _pages/tribe.njk
    - src/tests/data-species.test.ts
    - src/tests/build-output.test.ts
tech_stack:
  added: []
  patterns:
    - Eleventy pagination over custom data list (same pattern as Phase 94 genusList and 95-01 subgenusList)
    - tribeList aggregates per-genus occurrence counts; terminal filter excludes zero-occurrence tribes
key_files:
  created:
    - _pages/tribe.njk
  modified:
    - _data/species.js
    - src/tests/data-species.test.ts
    - src/tests/build-output.test.ts
decisions:
  - "Used 'no swatch' design for tribe genus list per UI-SPEC (tribe SVG handles color; genera list is name+count only)"
  - "Halictini chosen for genus sort assertion (4 genera: Agapostemon, Halictus, Lasioglossum, Sphecodes — verified against species.json)"
  - "existsSync imported from node:fs in build-output.test.ts (was not present before)"
metrics:
  duration: "~3 minutes"
  completed: "2026-05-16"
  tasks_completed: 2
  files_modified: 3
  files_created: 1
requirements_completed:
  - URL-04
  - TRIBE-01
  - TRIBE-02
  - TRIBE-03
---

# Phase 95 Plan 02: Add Tribe Static Pages Summary

**One-liner:** Eleventy pagination over `tribeList` (19 tribes) producing `/species/tribe/{TribeName}/` pages with multi-color tribe SVG, non-italic h1, and swatch-free genus list linking to genus pages.

## What Was Built

### Task 1: tribeList in _data/species.js (commit 5d8da48)

Extended `_data/species.js` with a `tribeList` data key exposed on the default export. The implementation inserts after the `subgenusList` block (added by Plan 95-01):

- Iterates `flat` records, skipping null/empty `tribe` values
- Groups records into `tribeMap` accumulating `generaMap[genus] += occurrence_count`
- Captures `family` from the first member encountered (all WA tribes are single-family per Data Inventory A1)
- Sorts tribes alphabetically; per tribe builds genera sorted alphabetically by genus with `occ > 0` filter
- Computes `totalOccurrences` from genera sum
- Terminal `.filter(t => t.totalOccurrences > 0)` excludes Ammobatini (0 occurrences, no SVG on disk)
- Result: 19 tribe groups (20 tribes in species.json minus Ammobatini)

7 new unit tests cover: array shape (length > 10), Andrenini entry (generaCount, totalOccurrences > 0), Halictini genera alphabetical sort, per-genus occ > 0, totals filter, Ammobatini exclusion, Andrenini family === 'Andrenidae'.

### Task 2: _pages/tribe.njk + build-output tests (commit 154f5dd)

Created `_pages/tribe.njk` using `_pages/subgenus.njk` as the structural base, with these key differences from subgenus:

- Front matter: `data: species.tribeList`, `alias: tribe`, permalink `/species/tribe/{{ tribe.tribe }}/`
- Breadcrumb: two segments — `{{ tribe.family }}` / `{{ tribe.tribe }}` (both plain text; no genus link since tribe spans multiple genera)
- `<h1>{{ tribe.tribe }}</h1>` — NO `<em>` wrapper (tribe names are not Latinized binomials per UI-SPEC Typography)
- Metadata: `{{ tribe.generaCount }} genera · {{ tribe.totalOccurrences }} records`
- SVG `<img>` with `loading="lazy"` referencing `/data/species-maps/tribe/{{ tribe.tribe }}.svg`
- Genus list: `<ul class="species-list">` with NO `<span class="swatch">` entries — each `<li>` contains `<a href="/species/{{ g.genus }}/"><em>{{ g.genus }}</em></a>` + count span
- `<script type="module" src="/src/entries/taxon-page.ts"></script>` included

Build produces 19 pages. 6 new build-output tests cover: page emission with h1 assertion (not in em), genus page link, no swatches, no seasonality-viz, lazy img, Ammobatini not emitted.

## Verification Results

| Check | Result |
|-------|--------|
| `VITEST_SKIP_BUILD=1 npm test -- data-species` | 22 passed (15 existing + 7 new) |
| `npm test -- build-output` | 20 passed (14 existing + 6 new) |
| `_data/species.js` has exactly 1 `hslToHex` definition | Pass |
| `_data/species.js` has 0 named exports (only `export default`) | Pass |
| `_data/species.js` export default contains both `subgenusList` and `tribeList` | Pass |
| `_pages/tribe.njk` exists | Pass |
| `_site/species/tribe/Andrenini/index.html` exists after build | Pass |
| `_site/species/tribe/Ammobatini/` does NOT exist | Pass |
| 19 tribe pages emitted | Pass |
| No new `.css` files under `src/styles/` | Pass (taxon-pages.css pre-existing) |

## Deviations from Plan

None — plan executed exactly as written. The `existsSync` import was added to `build-output.test.ts` as specified in the plan action. The `public/` symlink setup followed the same workaround documented in Plan 95-01 (local only, not committed).

## Known Stubs

None — all data flows wired. `tribeList` reads from the same `species.json` that drives all other taxon pages. Tribe SVG maps are pre-built from Phase 93 (19 files confirmed on disk). The zero-occurrence tribe filter prevents stale `<img>` references.

## Threat Flags

None — T-95-06 (URL collision mitigation) was confirmed valid: no genus named "tribe" or "Tribe" exists in species.json; the `/species/tribe/` namespace is safe. All pages are SSG over trusted pipeline data.

## Self-Check: PASSED

- `_data/species.js` exists and contains `tribeList`: FOUND
- `_pages/tribe.njk` exists: FOUND
- Task 1 commit 5d8da48: FOUND (git log)
- Task 2 commit 154f5dd: FOUND (git log)
- All 22 data-species tests green: CONFIRMED
- All 20 build-output tests green: CONFIRMED
