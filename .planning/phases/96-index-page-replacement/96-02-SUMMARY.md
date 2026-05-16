---
phase: 96-index-page-replacement
plan: "02"
subsystem: frontend-taxon-pages
tags: [eleventy, nunjucks, vite, typescript, css]

requires:
  - phase: 96-index-page-replacement
    plan: "01"
    provides: "RED test contract (species-index.test.ts, build-output.test.ts, page-scaffold.test.ts)"

provides:
  - "_pages/species.njk: Rewritten as static family→genus index template with groupby filter, filter input, genus/species links"
  - "src/entries/species-index.ts: Thin JS entry with input event listener and filter logic"
  - "src/styles/taxon-pages.css: .species-index modifier rules for filter input, family sections, genus rows"

affects:
  - 96-03-PLAN (arch.test.ts surgery and deletion of old components/entries)

tech-stack:
  added: []
  patterns:
    - "Nunjucks groupby chained pattern: species.flat | groupby(\"family\") then familyGroup | groupby(\"genus\")"
    - "Thin JS entry pattern: import side-effects only, no Lit, pure DOM event listener"
    - "CSS modifier class .species-index scoping new rules without touching existing .taxon-page styles"

key-files:
  created:
    - src/entries/species-index.ts
  modified:
    - _pages/species.njk
    - src/styles/taxon-pages.css

key-decisions:
  - "Worktree needs public/ symlink to main repo for Eleventy build data access (species.json, seasonality.json)"
  - "Vite emits species-index entry as _site/assets/species/index-<hash>.js (nested layout); findSpeciesChunk() in build-output.test.ts already handles this"

metrics:
  duration: 12min
  completed: 2026-05-16
---

# Phase 96 Plan 02: Index Page Implementation (Wave 2 GREEN) Summary

**Static family→genus index replacing bee-species-page monolith: 32 Plan 01 RED tests now GREEN after rewriting _pages/species.njk, creating species-index.ts filter entry, and appending .species-index CSS rules; production build produces 0.76 kB species-index chunk with no mapboxgl**

## Performance

- **Duration:** 12 min
- **Started:** 2026-05-16T08:28:00Z
- **Completed:** 2026-05-16T08:40:00Z
- **Tasks:** 3
- **Files modified:** 3 (1 rewrite, 1 create, 1 append)

## Accomplishments

- Rewrote `_pages/species.njk` from the bee-species-page monolith to a static family→genus index using `groupby("family")` and `groupby("genus")` Nunjucks filters; filter input, empty-state element, genus/species links all present
- Created `src/entries/species-index.ts` with three side-effect imports and the input event listener that hides/shows `.family-section`, `.genus-row`, and `li[data-name]` elements; genus-name matching via `row.dataset.genus` (Pitfall 4 guard)
- Appended three `.species-index` CSS rules to `src/styles/taxon-pages.css` for filter input styling and family/genus spacing
- All 32 Plan 01 tests (8 species-index unit, 2 page-scaffold, 22 build-output) now GREEN
- Production build succeeds; species-index chunk at `_site/assets/species/index-*.js` (0.76 kB, vs 100 kB limit)

## Task Commits

1. **Task 1: Rewrite _pages/species.njk** - `278d78b` (feat)
2. **Task 2: Create src/entries/species-index.ts** - `e98e784` (feat)
3. **Task 3: Append .species-index CSS rules; build GREEN** - `f72b636` (feat)

## Files Created/Modified

- `_pages/species.njk` - Rewritten: bee-species-page monolith replaced with groupby(family/genus) layout, filter input, genus/species links, species-index.ts script tag
- `src/entries/species-index.ts` - Created: thin entry with 3 side-effect imports + input event filter (38 lines)
- `src/styles/taxon-pages.css` - Appended: 3 .species-index modifier rules (21 lines)

## RED/GREEN State at Plan End

| Test | File | State |
|------|------|-------|
| permalink + layout | page-scaffold.test.ts | GREEN |
| entry-path to species-index.ts | page-scaffold.test.ts | GREEN |
| permalink + layout | species-index.test.ts | GREEN |
| species-index script tag | species-index.test.ts | GREEN |
| groupby("family") + groupby("genus") | species-index.test.ts | GREEN |
| id="species-filter" + type="search" | species-index.test.ts | GREEN |
| no bee-species-page or bee-species-card | species-index.test.ts | GREEN |
| imports index.css + taxon-pages.css | species-index.test.ts | GREEN |
| getElementById + addEventListener | species-index.test.ts | GREEN |
| .family-section + .genus-row + hidden | species-index.test.ts | GREEN |
| IDX-01 (family-section + URL-05) | build-output.test.ts | GREEN |
| IDX-02 (species-filter) | build-output.test.ts | GREEN |
| IDX-03 (genus links) | build-output.test.ts | GREEN |
| IDX-04 (species links) | build-output.test.ts | GREEN |
| species-index chunk emitted | build-output.test.ts | GREEN |
| species chunk no mapboxgl | build-output.test.ts | GREEN |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Infrastructure Deviation (Rule 3)

**Worktree build data access:** The worktree does not have `public/data/species.json` or `public/data/seasonality.json` (gitignored generated files only exist in the main repo working tree). Created a symlink `public -> /Users/rainhead/dev/beeatlas/public` in the worktree so Eleventy's `_data/species.js` could resolve these files during the worktree build. This symlink is untracked and not committed. The main repo merge will not be affected.

## Known Stubs

None - all data flows from `species.flat` (real data via `_data/species.js`) and all DOM interactions are implemented in `species-index.ts`.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced.

## Self-Check

- [x] `_pages/species.njk` exists and contains `groupby("family")`, `groupby("genus")`, `id="species-filter"`, `species-index.ts` script tag
- [x] `src/entries/species-index.ts` exists
- [x] `src/styles/taxon-pages.css` contains `.species-index` rules (4 occurrences)
- [x] Task 1 commit `278d78b` exists
- [x] Task 2 commit `e98e784` exists
- [x] Task 3 commit `f72b636` exists
- [x] 32 tests pass (build-output + species-index + page-scaffold)

## Self-Check: PASSED
