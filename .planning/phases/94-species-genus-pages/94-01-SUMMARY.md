---
phase: 94-species-genus-pages
plan: "01"
subsystem: data
tags: [eleventy, species, genus, hsl, color, vitest]

# Dependency graph
requires:
  - phase: 93-multi-color-svg-map-generation
    provides: "D-01/D-02 alphabetical-by-canonical_name sort order and HSL color formula"
  - phase: 92-species-slug-migration
    provides: "Hierarchical slug format (Genus/epithet) in species.json"
provides:
  - "speciesList: flat.filter(specific_epithet !== null) — 527 species entries on default export"
  - "genusList: 42 genus groupings sorted alphabetically, each with species[], speciesCount, totalOccurrences, hexColor per species"
  - "hslToHex helper (local function) verifying Phase 93 D-01 Python formula in JS"
affects: [94-02, 94-03, 95-subgenus-tribe-pages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "HSL-to-hex precomputed at build time in _data/*.js; avoids runtime CSS evaluation"
    - "speciesList/genusList added as keys to existing default export object (not named exports) — Eleventy data cascade constraint"
    - "TDD: RED commit (test), then GREEN commit (feat) with all 8 tests passing"

key-files:
  created: []
  modified:
    - "_data/species.js"
    - "src/tests/data-species.test.ts"

key-decisions:
  - "totalOccurrences uses species-only sum (excludes genus-level occurrence_count entries) so genus page total is consistent with sum of species page counts"
  - "hslToHex is a local function declaration only — not exported — preserving Eleventy default-export-only constraint"
  - "Color index i derived from alphabetical-by-canonical_name sort within each genus group (D-01/D-02) — load-bearing for SVG/HTML color match"

patterns-established:
  - "Pattern: All new computed data in _data/*.js goes into the existing default export object; named exports break Eleventy data cascade"

requirements-completed:
  - PIPE-01
  - GEN-01
  - GEN-02

# Metrics
duration: 10min
completed: 2026-05-16
---

# Phase 94 Plan 01: Species & Genus Pages Data Layer Summary

**speciesList (527 entries) and genusList (42 genus groups with per-species HSL hexColor swatches) added to `_data/species.js` default export, enabling Eleventy pagination in Plan 02**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-16T01:55:00Z
- **Completed:** 2026-05-16T01:58:03Z
- **Tasks:** 2 (TDD: RED + GREEN commits)
- **Files modified:** 2

## Accomplishments

- Extended `_data/species.js` default export with `speciesList` and `genusList` keys; no named exports added (Eleventy data cascade preserved)
- `speciesList`: 527 entries filtered from `flat` by `specific_epithet !== null`; excludes 103 genus-level records
- `genusList`: 42 genus groups sorted alphabetically by genus; each group's `species[]` sorted by `canonical_name` (D-02 sort order); `speciesCount` and `totalOccurrences` (species-only sum per open question 1 resolution) computed
- `hslToHex` local function matches Phase 93 D-01 Python `colorsys.hls_to_rgb` exactly; Agapostemon first species (alphabetically) → `#d92626` (hue=0) verified
- Zero-occurrence species get `hexColor = '#cccccc'` (grey swatch per UI-SPEC)
- 5 new Vitest assertions added; total test count in `data-species.test.ts` went from 3 to 8; all 8 pass

## Task Commits

Each task was committed atomically (TDD flow):

1. **Task 2 RED: Extend tests with speciesList, genusList, hexColor assertions** — `9f8ae84` (test)
2. **Task 1 GREEN: Implement speciesList, genusList, hslToHex in species.js** — `86f6d2e` (feat)

_Note: TDD order — tests written first (RED), implementation second (GREEN)._

## Files Created/Modified

- `_data/species.js` — Added `hslToHex`, `speciesList`, `genusMap`, `genusList` after existing `tree` computation; extended default export object
- `src/tests/data-species.test.ts` — Added 5 new `test()` blocks inside existing `describe` block; existing 3 tests unchanged

## Decisions Made

- **totalOccurrences = species-only sum:** Open question 1 from 94-RESEARCH.md resolved: genus-level entries (103 records where `specific_epithet === null`) are excluded from `totalOccurrences`. Agapostemon example: 3 species sum to 185 occurrences (not 203 which would include 18 genus-only records). Rationale: genus page total must be consistent with sum of species page counts shown below it.
- **TDD flow reversed from plan task order:** Plan lists Task 1 (implementation) before Task 2 (tests) but both have `tdd="true"`. TDD protocol requires RED before GREEN — tests were written first.

## Deviations from Plan

None — plan executed exactly as written. The `public/data/` symlink was created as a worktree-local artifact to make tests accessible (the directory is gitignored; only exists in main repo), not committed.

## Issues Encountered

- The git worktree did not have `public/data/` (gitignored), causing test import of `_data/species.js` to fail with ENOENT on `species.json`. Resolution: created a symlink `public/data -> /Users/rainhead/dev/beeatlas/public/data` inside the worktree. This is a worktree-only artifact not committed to git.

## Next Phase Readiness

- Plan 02 (Eleventy pagination templates) can now iterate `species.speciesList` and `species.genusList` via Eleventy lodash dot-notation data paths
- All 527 species pages and 42 genus pages can be generated; each species carries `hexColor` pre-computed for genus page swatches
- `species.genusList[i].species` is already sorted by `canonical_name` — templates do not need to sort

---
*Phase: 94-species-genus-pages*
*Completed: 2026-05-16*
