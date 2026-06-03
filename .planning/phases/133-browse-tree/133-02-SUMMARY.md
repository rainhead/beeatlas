---
phase: 133-browse-tree
plan: "02"
subsystem: frontend-template
tags: [species-index, tree-template, details-summary, nunjucks, fullTree]
dependency_graph:
  requires: [species.fullTree]
  provides: [_pages/species.njk tree markup]
  affects: [_site/species/index.html]
tech_stack:
  added: []
  patterns: [nunjucks-macro-recursion, details-summary-tree, D-05-graceful-degradation, D-06-genusName-contract, D-07-family-plain-text, D-08-count-split]
key_files:
  created: []
  modified:
    - _pages/species.njk
    - src/tests/species-index.test.ts
decisions:
  - Nunjucks macro renderNode() handles all six ranks with rank-conditional logic; species leaves get ul.species-list, intermediate ranks get details/summary
  - Intermediate ranks (subfamily/tribe/subgenus) carry HTML hidden attribute in template; JS removes on toggle
  - Family uses span.node-name (no link, no italic — D-07); all other page-backed ranks use a.node-name with em child
  - Subgenus URL built from node.genusName directly (guaranteed by Plan 01 contract); no fallback needed
  - Middle dot U+00B7 used as compact count separator with no unit labels (UI-SPEC copywriting)
  - urlencode filter on all taxon names in map hrefs; &amp; literal in href for query separator (T-133-04)
  - No | safe filter anywhere — all names rely on Nunjucks autoescaping (T-133-03)
  - filter-empty paragraph carries role="status" for screen reader live-region announcement
metrics:
  duration: "4m 41s"
  completed: "2026-06-03T19:41:04Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
requirements_completed: [TREE-01, TREE-02, TREE-04]
---

# Phase 133 Plan 02: Tree Template Summary

**One-liner:** Expandable six-rank `<details>/<summary>` tree at `/species` using a Nunjucks macro walking `species.fullTree`, with per-node count splits, dual name/map links, family as plain text, hidden intermediate ranks, and zero `| safe` usage.

## What Was Built

Rewrote `_pages/species.njk` body to render `species.fullTree` via a recursive Nunjucks macro `renderNode(node)`. The macro handles all six taxonomy ranks with rank-specific branching: family nodes get plain-text `span.node-name`; genus/subgenus/tribe/subfamily get `a.node-name` with `<em>`; species leaves render in `ul.species-list` items. Intermediate ranks (subfamily, tribe, subgenus) carry the `hidden` attribute in HTML so JS can show/hide them via the "Show all ranks" toggle. The subgenus URL uses `node.genusName` directly (guaranteed non-empty by Plan 01 contract). All taxon names in map hrefs use `| urlencode`; `&amp;` is used as the literal query separator. No `| safe` filter anywhere.

Updated `src/tests/species-index.test.ts` to replace stale Phase 96 assertions (groupby/family-section) with tree markup assertions — these were RED before the template rewrite and GREEN after.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wave 0 RED tree template source assertions | 779d0a3 | src/tests/species-index.test.ts |
| 2 | Rewrite _pages/species.njk as the expandable tree | f2acf30 | _pages/species.njk |

## Test Results

- 14/14 tests passing (`species-index.test.ts`)
- 8 new/updated assertions for tree markup (TREE-01/02/04)
- 6 pre-existing assertions preserved (layout, permalink, script tag, entry checks)
- TDD gate: RED (Task 1 commit) → GREEN (Task 2 commit) completed
- `npm run build` succeeds; `_site/species/index.html` contains 197 tree-node details elements

## Verification Results

| Check | Result |
|-------|--------|
| `grep -c '| safe' _pages/species.njk` | 0 |
| `grep -c 'taxonRank=' _pages/species.njk` | 6 (one per rank branch) |
| `grep -c '/species/undefined/' _site/species/index.html` | 0 |
| `details class="tree-node"` count in built HTML | 197 |
| `node-counts` spans | 785 |
| Middle dot ` · ` occurrences | 785 |
| Family details with `hidden` attribute | 0 (correct) |
| Subfamily/tribe/subgenus details with `hidden` | 145 (correct) |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. The template is fully wired to `species.fullTree` (delivered by Plan 01). All nodes render real data from the build-time pipeline artifacts.

## Threat Flags

None. All acceptance criteria for T-133-03 and T-133-04 verified:
- T-133-03 (XSS): no `| safe` filter in species.njk; Nunjucks autoescaping handles all name interpolation
- T-133-04 (URL injection): `| urlencode` on every taxon name in map hrefs; `&amp;` literal in href
- T-133-05 (bycatch): template only walks `species.fullTree` (bee-only by Plan 01 construction)

## Self-Check

- [x] `_pages/species.njk` rewritten with macro renderNode() and fullTree walk
- [x] `src/tests/species-index.test.ts` updated with tree markup assertions
- [x] Task 1 commit 779d0a3 exists
- [x] Task 2 commit f2acf30 exists
- [x] All 14 species-index.test.ts tests GREEN
- [x] `npm run build` succeeded (917 files written)
- [x] No `| safe` in species.njk (grep -c = 0)
- [x] No `/species/undefined/` in built HTML (grep -c = 0)
- [x] 6 family nodes confirmed without `hidden` attribute (Python parser verification)
- [x] role="status" on filter-empty paragraph

## Self-Check: PASSED
