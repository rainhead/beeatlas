---
phase: 133-browse-tree
verified: 2026-06-03T16:48:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Visual rendering of the /species tree"
    expected: "Default view shows family → genus → species with disclosure triangles; 'Show all ranks' reveals intermediate ranks; filter narrows + auto-expands ancestors; focus rings visible; no-JS fallback shows all ranks"
    why_human: "happy-dom has no layout engine — display:contents skip and CSS rendering require a real browser"
    note: "Confirmed by operator 2026-06-03, recorded in 133-04-SUMMARY.md §Gap Closure (three rounds of re-verify post code-review CR-01/02/03)"
---

# Phase 133: Browse Tree Verification Report

**Phase Goal:** `/species` presents an expandable bee-only taxonomy tree with per-node counts and type-to-filter search, replacing the flat family→genus index at the same URL.
**Verified:** 2026-06-03T16:48:00Z
**Status:** PASSED
**Re-verification:** No — initial verification (post gap-closure cycle)

## Context

This phase went through a full gap-closure cycle. Code review (133-REVIEW.md) found 3 critical blockers (CR-01: intermediate ranks hiding entire subtrees via `hidden` attribute; CR-02: auto-expand not un-hiding ancestors; CR-03: filter reset not clearing non-intermediate nodes). These were fixed in commits 220a502 and af750e8 plus two interactive re-verify rounds. Key architectural change: behavior logic extracted from `src/entries/species-index.ts` into pure-DOM `src/species-tree.ts`, unit-tested under happy-dom. Human-verify was re-approved after all fixes.

Per the prompt: CSS-rendered visual behavior (display:contents skip, disclosure triangle) was confirmed by human-verify on 2026-06-03 (recorded in 133-04-SUMMARY.md §Gap Closure), since happy-dom has no layout engine.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `/species` renders an expandable tree defaulting to family → genus → species; clicking a family node expands it; subfamily, tribe, and subgenus are available as lazy deeper expansions without being forced into the default view | ✓ VERIFIED | `_pages/species.njk` walks `species.fullTree` with a recursive `renderNode` macro emitting `<details class="tree-node">` for all six ranks. Default skip of intermediate ranks is done at runtime via `rank-skipped` class (`display:contents`) + forced-open (NOT `hidden` attribute) in `src/species-tree.ts:applyRankToggle`. Template test asserts no `data-rank="subfamily"` node carries `hidden`. Human-verify approved. |
| 2 | Each tree node shows a specimen count and community-observation count, correctly rolled up over all descendants | ✓ VERIFIED | `_data/species.js` exports `fullTree` with `specimen_count`/`inat_obs_count` sourced directly from `higher_taxa.json` rollup rows (descendant-rolled). Template renders `{{ node.specimen_count }} · {{ node.inat_obs_count }}` in `.node-counts` span. Test in `data-species.test.ts` asserts Bombus genus `specimen_count` equals sum of its species descendants (D-08 rollup). 77/77 tests pass. |
| 3 | Typing in the filter input narrows the tree to matching taxon names and auto-expands the ancestor chain of each match so matches are visible without manual expansion | ✓ VERIFIED | `src/species-tree.ts:runFilter` iterates `[data-rank]` nodes, hides non-matches via `node.hidden = true`, calls `openAncestors(node)` on matches — which sets `.hidden = false` AND `.open = true` on every ancestor `[data-rank]` element. Filter reset clears all `[data-rank]` hidden states then re-applies rank toggle (CR-03 fix). happy-dom behavioral tests cover: genus match hides non-matches + un-hides ancestor family + opens it; deep species match opens all ancestors; filter reset restores all nodes; zero matches returns true (triggers empty state). |
| 4 | No wasp, fly, or other non-bee taxon appears anywhere in the tree; every bee tree node links to the corresponding taxon page and/or a descendant-filtered map view | ✓ VERIFIED | `fullTree` sourced exclusively from `higher_taxa.json` (bee-only by pipeline construction). Test asserts no `Eumeninae` node. Template emits page links for genus/subgenus/tribe/subfamily/species and 🗺 map links (`/?taxon=…&taxonRank=…`) for all ranks including family. Family is plain `<span>` (no broken dead link — correct for a rank with no generated page). |

**Score:** 4/4 truths verified

---

## Requirement ID Coverage

| Requirement | Plans | Description | Status | Evidence |
|-------------|-------|-------------|--------|----------|
| TREE-01 | 133-01, 133-02, 133-03, 133-04 | Expandable tree default family → genus → species; subfamily/tribe/subgenus available as deeper expansions | ✓ SATISFIED | `species.fullTree` has all six ranks; template renders them; `applyRankToggle` skips intermediates via `rank-skipped` class (display:contents) in default view; toggle reveals them |
| TREE-02 | 133-01, 133-02, 133-03 | Per-node specimen/community-observation count split, rolled up over descendants | ✓ SATISFIED | Counts from `higher_taxa.json` rollup on every node; template renders `specimen_count · inat_obs_count` in `.node-counts`; rollup test passes |
| TREE-03 | 133-04 | Type-to-filter narrows tree and auto-expands ancestors of matches | ✓ SATISFIED | `runFilter` + `openAncestors` in `src/species-tree.ts`; happy-dom tests cover match, ancestor open, filter reset, empty state |
| TREE-04 | 133-01, 133-02 | No bycatch; tree nodes link to taxon page and/or map view | ✓ SATISFIED | Bee-only sourcing; Eumeninae exclusion test passes; all ranks have 🗺 link; page links emitted for all linkable ranks |

All four TREE-01..04 requirements satisfied. All were marked "Pending" in REQUIREMENTS.md traceability — this phase is the satisfying implementation.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `_data/species.js` | fullTree export with six-rank skeleton, descendant-rolled counts, bee-only | ✓ VERIFIED | `fullTree` exported at line 562, included in default export at line 564; no parquet read (grep returns 0) |
| `_pages/species.njk` | Recursive Nunjucks tree walking species.fullTree | ✓ VERIFIED | `renderNode` macro walks `species.fullTree`; all six rank branches present; no `\| safe` filter |
| `src/species-tree.ts` | Pure-DOM module: toggle, filter, localStorage, auto-expand | ✓ VERIFIED | Exports `STORAGE_KEY`, `loadToggleState`, `saveToggleState`, `applyRankToggle`, `runFilter`, `initSpeciesTree` |
| `src/entries/species-index.ts` | Thin Vite entry delegating to species-tree | ✓ VERIFIED | 17 lines; imports CSS side-effects + bee-header, imports `initSpeciesTree`, calls it |
| `src/styles/taxon-pages.css` | Control-bar + tree-node rules under .species-index | ✓ VERIFIED | Lines 141–297: control bar, rank-toggle-label, tree-node summary flex, node-counts, node-map, indentation, rank-skipped (display:contents), focus-visible, 480px media query |
| `src/tests/species-index.test.ts` | happy-dom behavioral tests for species-tree | ✓ VERIFIED | 32 tests across 6 describe blocks; real DOM execution, not source-grep for behavior |
| `src/tests/data-species.test.ts` | fullTree contract assertions | ✓ VERIFIED | 12 tests in `fullTree (TREE-01/02/04)` describe block |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `_data/species.js fullTree` | `public/data/higher_taxa.json` | `higherTaxaByRankName` lookup | ✓ WIRED | Line 360+ `buildFullTree()` reads `higherTaxaByRankName`; verified by test asserting genusName equals `row.genus` from actual file |
| `_pages/species.njk` | `species.fullTree` | Nunjucks `for family in species.fullTree` + `renderNode` macro | ✓ WIRED | Line 99: `{%- for family in species.fullTree -%}` |
| subgenus node link | `/species/{genusName}/{name}/` | `node.genusName` from Plan 01 | ✓ WIRED | Line 46: `href="/species/{{ node.genusName }}/{{ node.name }}/"` — template test asserts `node.genusName` present, no literal `/species/undefined/`; `_site` grep returns 0 |
| node-map link | `/?taxon=…&taxonRank=…` | `\| urlencode` + `&amp;` literal | ✓ WIRED | All rank branches use `| urlencode` on the taxon name and `&amp;` for the separator |
| `src/entries/species-index.ts` | `src/species-tree.ts:initSpeciesTree` | ESM import + call | ✓ WIRED | Line 14: `import { initSpeciesTree } from '../species-tree.ts'`; line 16: `initSpeciesTree()` |
| localStorage key | `beeatlas.speciesTree.showAllRanks` | strict `=== '1'` in try/catch | ✓ WIRED | `STORAGE_KEY = 'beeatlas.speciesTree.showAllRanks'`; `loadToggleState` uses strict compare; both getItem/setItem wrapped in try/catch |
| filter input → `[data-rank]` nodes | `dataset.name` match + `.open = true` on ancestors | `runFilter` + `openAncestors` | ✓ WIRED | Lines 73–106 of species-tree.ts; CR-02 fix: `openAncestors` clears `hidden` AND sets `.open` |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `_pages/species.njk` | `species.fullTree` | `_data/species.js:buildFullTree()` reading `higher_taxa.json` + `species.json` | Yes — nested tree built from real pipeline artifacts with descendant-rolled counts | ✓ FLOWING |
| `.node-counts` spans | `node.specimen_count`, `node.inat_obs_count` | `higher_taxa.json` rollup rows, sourced at Eleventy build time | Yes — test verifies Bombus genus count matches sum of species descendants | ✓ FLOWING |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `STORAGE_KEY` is the exact expected string | `grep -c "beeatlas.speciesTree.showAllRanks" src/species-tree.ts` | 1 | ✓ PASS |
| localStorage read uses strict `=== '1'` | `grep "=== '1'" src/species-tree.ts` | found | ✓ PASS |
| No `innerHTML` property access (XSS guard T-133-07) | `grep -P "\.innerHTML\b" src/species-tree.ts` | 0 matches | ✓ PASS |
| No parquet read in species.js | `grep -c parquet _data/species.js` | 0 | ✓ PASS |
| No `\| safe` in template | `grep -c "\| safe" _pages/species.njk` | 0 | ✓ PASS |
| Test suite green (77 tests) | `VITEST_SKIP_BUILD=1 npx vitest run src/tests/species-index.test.ts src/tests/data-species.test.ts` | 2 files, 77 tests, all passed | ✓ PASS |
| `rank-skipped` CSS uses `display:contents` (not `display:none`) | `grep "display: contents" src/styles/taxon-pages.css` | line 274 confirmed | ✓ PASS |
| Scoped `[data-rank][hidden]` rule overrides flex/contents | `grep ".species-index \[data-rank\]\[hidden\]" src/styles/taxon-pages.css` | line 219 confirmed | ✓ PASS |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/styles/taxon-pages.css` | 133–139 | `.species-index .family-section` and `.species-index .genus-row` rules remain from Phase 96 | ℹ️ Info | Dead CSS — the flat markup they styled is gone from the template. No functional impact; flagged as IN-01 in 133-REVIEW.md. Non-blocking per review resolution. |
| `_data/species.js` | 56–83 | Legacy `buildTree`/`TAXON_LEVELS`/`tree` export retained | ℹ️ Info | Flagged as IN-01 in 133-REVIEW.md. No consumer reads `species.tree` from the browse-tree path; non-blocking. |

No `TBD`, `FIXME`, or `XXX` markers found in phase-modified files.

---

## Human Verification Required

Per the PLAN.md Task 3 checkpoint (blocking gate) and the confirmed gap-closure re-verify:

### 1. Visual tree rendering and interactive behavior

**Test:** Run `npm run dev`, open `http://localhost:8080/species/`. Confirm default view shows family → genus → species with disclosure triangles (▸/▾). Toggle "Show all ranks" — subfamily/tribe/subgenus nodes appear. Reload — toggle state persists. Type a genus name — tree narrows, ancestors auto-expand. Type gibberish — empty-state message appears. Disable JS — all ranks visible and expandable (no-JS fallback).

**Expected:** All behaviors described above function correctly.

**Why human:** happy-dom has no layout engine. The `display:contents` intermediate-rank skip, the disclosure triangle `::before` glyph, focus rings, and tab order cannot be verified programmatically.

**Status: APPROVED 2026-06-03** — operator confirmed all behaviors after three rounds of gap-closure fixes (see 133-04-SUMMARY.md §Gap Closure). Verification note recorded here per phase instructions.

---

## Gaps Summary

No gaps. All four TREE-01..04 requirements are satisfied by the codebase evidence. The three critical blockers found by code review (CR-01/02/03 in 133-REVIEW.md) and the WR-03 source-grep-only test deficiency were all resolved before this verification:

- **CR-01** (intermediate ranks hiding subtrees via `hidden`): Fixed by switching to `rank-skipped` class with `display:contents` in CSS + forced `.open = true` in `applyRankToggle`. Template ships all ranks visible (no `hidden` attr) for no-JS. Verified by template test asserting absence of `hidden` on intermediate rank nodes, and by happy-dom test asserting genera stay un-hidden in default view.
- **CR-02** (auto-expand not un-hiding ancestors): Fixed in `openAncestors()` which now sets both `.hidden = false` and `.open = true`. Verified by happy-dom test for deep species match.
- **CR-03** (filter reset not restoring family/genus/species): Fixed — `runFilter` on empty query clears `hidden` on ALL `[data-rank]` nodes before re-applying the toggle. Verified by happy-dom test.
- **WR-03** (source-grep-only tests): Replaced with real happy-dom behavioral tests in `src/tests/species-index.test.ts`.

---

_Verified: 2026-06-03T16:48:00Z_
_Verifier: Claude (gsd-verifier)_
