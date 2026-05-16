---
phase: 95
plan: "01"
subsystem: frontend-ssg
tags:
  - eleventy
  - subgenus
  - taxon-pages
  - ssg
dependency_graph:
  requires:
    - 93-02  # Phase 93 PIPE-02 — subgenus SVG maps on disk
    - 94     # Phase 94 — genus pages pattern, genusList, hslToHex
  provides:
    - subgenusList  # default export key in _data/species.js
    - subgenus-pages  # 103 static HTML pages at /species/{Genus}/{Subgenus}/
  affects:
    - _data/species.js
    - _pages/subgenus.njk
    - src/tests/data-species.test.ts
    - src/tests/build-output.test.ts
tech_stack:
  added: []
  patterns:
    - Eleventy pagination over custom data list (same pattern as Phase 94 genusList)
    - Color index computed over withOcc (all occurrence_count > 0) to match Python _group_colors
key_files:
  created:
    - _pages/subgenus.njk
  modified:
    - _data/species.js
    - src/tests/data-species.test.ts
    - src/tests/build-output.test.ts
decisions:
  - "Use commoda (not milwaukeensis) for Melandrena link assertion — plan had milwaukeensis as a placeholder guess; species.json confirmed commoda is the correct Melandrena species"
  - "Symlinked public/ from main repo into worktree to enable tests (public/data/ is gitignored)"
metrics:
  duration: "~4 minutes"
  completed: "2026-05-16"
  tasks_completed: 2
  files_modified: 4
  files_created: 1
---

# Phase 95 Plan 01: Add Subgenus Static Pages Summary

**One-liner:** Eleventy pagination over `subgenusList` (103 groups) producing `/species/{Genus}/{Subgenus}/` pages with multi-color SVG map, swatch-decorated species list, and genus-linked breadcrumb.

## What Was Built

### Task 1: subgenusList in _data/species.js (commit 17349f5)

Extended `_data/species.js` with a `subgenusList` data key exposed on the default export. The implementation follows the same pattern as `genusList`:

- Groups `flat` records by composite key `${genus}::${subgenus}`, skipping null/empty subgenus values
- Computes color indices over `withOcc` (all members with `occurrence_count > 0`, sorted by `canonical_name`) to match Python `_group_colors` exactly — Pitfall 1 avoided
- Unresolved records (`specific_epithet === null`) get `#aaaaaa`; resolved species get `hslToHex(i * 360 / n, 70, 50)` via the existing helper
- Display species list filters to `specific_epithet !== null` only
- Terminal `.filter(g => g.totalOccurrences > 0)` excludes 10 zero-occurrence groups
- Result: 103 subgenus groups

7 new unit tests cover: array shape, Melandrena entry, display-list filter, alphabetical sort, hexColor format, color parity (Pitfall 1 invariant), totals filter.

### Task 2: _pages/subgenus.njk + build-output tests (commit 7d6f69a)

Created `_pages/subgenus.njk` using `_pages/genus.njk` as the structural base:

- Front matter: `data: species.subgenusList`, `alias: subgenus`, permalink `/species/{{ subgenus.genus }}/{{ subgenus.subgenus }}/`
- Breadcrumb: family / `<a href="/species/{Genus}/">{Genus}</a>` / {Subgenus} (genus is a link; subgenus is current page plain text)
- `<h1><em>{{ subgenus.subgenus }}</em></h1>` — subgenus name in italics
- SVG `<img>` with `loading="lazy"` referencing `/data/species-maps/subgenus/{Genus}/{Subgenus}.svg`
- Species list guarded by `{%- if subgenus.speciesCount > 0 -%}` for 14 unresolved-only groups
- `<script type="module" src="/src/entries/taxon-page.ts"></script>` included

Build produces 103 pages. 5 new build-output tests cover: page emission, species link, breadcrumb genus link, lazy img, no seasonality-viz.

## Verification Results

| Check | Result |
|-------|--------|
| `VITEST_SKIP_BUILD=1 npm test -- data-species` | 15 passed (8 existing + 7 new) |
| `npm test -- build-output` | 14 passed (9 existing + 5 new) |
| `_data/species.js` has exactly 1 `hslToHex` definition | Pass |
| `_data/species.js` has 0 named exports (only `export default`) | Pass |
| `_pages/subgenus.njk` exists | Pass |
| `_site/species/Andrena/Melandrena/index.html` exists after build | Pass |
| 103 capitalized/capitalized subgenus pages emitted | Pass |
| No new `.css` files introduced | Pass |

## Deviations from Plan

### Minor: Species name for link assertion

**Found during:** Task 2 (writing build-output tests)
**Issue:** Plan specified `milwaukeensis` as the Andrena/Melandrena species for the `href` assertion ("or whichever Melandrena species is verified present in species.json with occurrences"). Direct inspection of `species.json` confirmed `milwaukeensis` does NOT belong to subgenus Melandrena. Verified Melandrena species include: commoda, erythrogaster, lupinorum, perplexa, subaustralis, subtilis, transnigra, vicina.
**Fix:** Used `commoda` (alphabetically first Melandrena species with occurrences) for the link assertion.
**Files modified:** `src/tests/build-output.test.ts`
**Commit:** 7d6f69a

### Infrastructure: public/ symlink in worktree

**Found during:** Task 1 setup
**Issue:** Worktree doesn't have `public/data/` (gitignored); `_data/species.js` reads `species.json` relative to worktree root, causing ENOENT.
**Fix:** Created a symlink `{worktree}/public -> /Users/rainhead/dev/beeatlas/public` to enable tests. This symlink is not committed (it's in gitignored territory and auto-cleaned when the worktree is removed).
**Impact:** None — symlink is local worktree-only and not tracked by git.

## Known Stubs

None — all data flows wired. The `subgenusList` reads from the same `species.json` that drives genus/species pages. SVG maps are pre-built from Phase 93.

## Threat Flags

None — all surfaces were build-time SSG over trusted pipeline data. T-95-03 (URL collision) mitigation was verified: 103 subgenus pages emitted at capitalized paths, confirmed no collision with lowercase species epithet paths in built `_site/`.

## Self-Check: PASSED

- `_data/species.js` exists and contains `subgenusList`: FOUND
- `_pages/subgenus.njk` exists: FOUND
- Task 1 commit 17349f5: FOUND (git log)
- Task 2 commit 7d6f69a: FOUND (git log)
- All tests green: CONFIRMED
