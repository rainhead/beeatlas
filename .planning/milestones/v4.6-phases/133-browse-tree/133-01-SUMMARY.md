---
phase: 133-browse-tree
plan: "01"
subsystem: data
tags: [tree-data, species-index, fullTree, higher-taxa, taxonomy]
dependency_graph:
  requires: [higher_taxa.json, species.json, seasonality.json]
  provides: [species.fullTree]
  affects: [_pages/species.njk]
tech_stack:
  added: []
  patterns: [higherTaxaByRankName-lookup, D-05-graceful-degradation, D-06-genusName-contract, D-08-rollup-counts]
key_files:
  created: []
  modified:
    - _data/species.js
    - src/tests/data-species.test.ts
decisions:
  - fullTree sources higher-rank counts from higher_taxa.json pre-rolled totals (D-08) rather than recomputing from species leaves
  - genusName on subgenus nodes uses row.genus (the parent genus name) not row.name; this is a hard contract for Plan 02 URL construction
  - Family nodes carry no taxon_id (higher_taxa.json has no family rows); taxon_id is null for family rank
  - buildFullTree() walks families from genus rows (bee-only by construction via higher_taxa.json), naturally excluding Eumeninae
  - D-05 graceful degradation: tribe-less subfamilies attach genera directly; subgenus-less genera attach species directly; orphan genera (no matching subfamily row) attach directly to family
metrics:
  duration: "5m 44s"
  completed: "2026-06-03T19:33:36Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
requirements_completed: [TREE-01, TREE-02, TREE-04]
---

# Phase 133 Plan 01: fullTree Data Foundation Summary

**One-liner:** Six-rank nested taxonomy tree (family→subfamily→tribe→genus→subgenus→species) built from higher_taxa.json pre-rolled counts with guaranteed genusName on every subgenus node.

## What Was Built

Added `buildFullTree()` to `_data/species.js` that produces a `fullTree` export — a nested array of family nodes consumed by `_pages/species.njk`. The tree carries all six taxonomy ranks with D-05 graceful degradation (missing intermediate ranks skip to nearest present ancestor), D-08 pre-rolled counts from `higher_taxa.json`, D-06 `genusName` on every subgenus node, and bee-only sourcing naturally excluding Eumeninae.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wave 0 RED fullTree contract tests | a8a566c | src/tests/data-species.test.ts |
| 2 | Build fullTree in _data/species.js | 2a72553 | _data/species.js |

## Test Results

- 45/45 tests passing (`data-species.test.ts`)
- 12 new tests added for the `fullTree` contract (TREE-01/02/04)
- 33 pre-existing tests continue to pass (no regression)
- TDD gate: RED (Task 1 commit) → GREEN (Task 2 commit) completed

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. `fullTree` is fully wired from `higher_taxa.json` + `species.json` build-time data.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. All data sources are trusted build-time pipeline artifacts (higher_taxa.json, species.json). Nunjucks autoescaping is ON in downstream templates (T-133-01 downstream mitigation). No Eumeninae bycatch leaks into the tree (TREE-04 / T-133-02 verified by test).

## Self-Check

- [x] `_data/species.js` modified with `fullTree` export
- [x] `src/tests/data-species.test.ts` modified with new describe block
- [x] Task 1 commit a8a566c exists
- [x] Task 2 commit 2a72553 exists
- [x] All 45 tests green
- [x] No parquet reads (`grep -v '^//' _data/species.js | grep -c parquet` = 0)
- [x] Every subgenus node has non-empty genusName (113/113 verified)
- [x] fullTree is a non-empty array (length=6, one per bee family)
