---
phase: 260607-syt
plan: 01
subsystem: frontend/eleventy
tags: [genus-pages, subgenera, data-layer, presentation]
dependency_graph:
  requires: []
  provides: [genus-page-subgenera-breakout]
  affects: [_data/species.js, _pages/genus.njk]
tech_stack:
  added: []
  patterns: [lossless-partition, D-05-flat-fallback, subfamily.njk-mirror]
key_files:
  created: []
  modified:
    - _data/species.js
    - _pages/genus.njk
    - src/tests/data-species.test.ts
decisions:
  - Derive subgenera/ungroupedSpecies from already-built species[] to preserve hexColor and object identity; never recompute from allMembers
  - ungroupedSpecies includes synthetic "Genus sp." automatically (no subgenus field)
  - Mirror subfamily.njk exactly: .taxon-members wrapper, <h2><a><em>, flat fallback else branch
metrics:
  duration: "~5 minutes"
  completed: "2026-06-08T03:58:00Z"
  tasks_completed: 2
  files_changed: 3
---

# Phase 260607-syt Plan 01: Break Out Subgenera on Genus Pages — Summary

Genus pages now group species by subgenus when subgenera exist, mirroring the subfamily.njk layout. Andrena (22 subgenera) and other large genera are navigable through headed subgenus sections. Genera with no subgenera continue to render the existing flat species list unchanged.

## Tasks Completed

| Task | Name | Commit(s) | Files |
|------|------|-----------|-------|
| 1 | Add subgenera[] + ungroupedSpecies[] to genusList (TDD) | a2dd1a4 (RED), a03140f (GREEN) | _data/species.js, src/tests/data-species.test.ts |
| 2 | Render grouped subgenus sections in genus.njk | 89e281e | _pages/genus.njk |

## Verification Results

**`npx vitest run`:** 620/620 tests passed (23 test files). 6 new tests added for subgenera grouping + lossless-partition.

**`npm run build`:** Exited 0. Built `_site/species/Andrena/index.html` (29.03 kB) contains 22 subgenus `<h2>` headings linking to `/species/Andrena/{Subgenus}/index.html`. `Brachymelecta` and other no-subgenus genera render a flat `<ul class="species-list">` unchanged.

## Deviations from Plan

None — plan executed exactly as written.

**Worktree note:** `public/data/{species,higher_taxa,seasonality}.json` were missing from the worktree (worktrees share git history but not untracked/gitignored files). Symlinked to the main repo copies to enable tests. The symlinks are not committed (they point outside the worktree).

## Known Stubs

None — no hardcoded empty values introduced. All data is derived from the existing genusList species array.

## Threat Flags

None — this is a pure frontend/Eleventy data-layer and template change with no network endpoints, auth paths, or schema changes.

## TDD Gate Compliance

- RED gate: commit `a2dd1a4` — `test(260607-syt-01): add failing subgenera grouping + lossless-partition tests`
- GREEN gate: commit `a03140f` — `feat(260607-syt-01): add subgenera[] + ungroupedSpecies[] to genusList`

Both gates present and in correct order.

## Self-Check: PASSED

- `_data/species.js` modified: FOUND
- `_pages/genus.njk` modified: FOUND
- `src/tests/data-species.test.ts` modified: FOUND
- RED commit a2dd1a4: FOUND
- GREEN commit a03140f: FOUND
- Task 2 commit 89e281e: FOUND
- `_site/species/Andrena/index.html` has 22 subgenus h2 headings: VERIFIED
- `_site/species/Brachymelecta/index.html` renders flat list (no h2): VERIFIED
- All 620 vitest tests pass: VERIFIED
