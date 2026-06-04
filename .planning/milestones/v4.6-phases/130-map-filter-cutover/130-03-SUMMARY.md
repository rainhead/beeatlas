---
phase: 130-map-filter-cutover
plan: "03"
subsystem: frontend/detail-card
tags: [taxon, cache, detail-card, presenter, tdd]
requirements-completed: [MFILT-03]
depends-on: ["130-02"]
provides: [taxonCache-detail-card, D07-cache-name-resolution, No-determination-fallback]
affects: [src/bee-occurrence-detail.ts, src/bee-pane.ts, src/bee-atlas.ts, src/tests/bee-sidebar.test.ts]
tech-stack:
  added: []
  patterns: [prop-threading-presenter, cache-get-null-fallback, tdd-red-green]
key-files:
  created:
    - src/tests/bee-sidebar.test.ts
  modified:
    - src/bee-occurrence-detail.ts
    - src/bee-pane.ts
    - src/bee-atlas.ts
decisions:
  - "_taxonCache re-render: _taxaOptions is @state and is assigned immediately after _taxonCache in _loadSummaryFromSQLite; the @state change triggers render() which passes the updated _taxonCache to bee-pane — no separate requestUpdate() needed"
  - "row.scientificName completely removed from bee-occurrence-detail (both _renderCollectorGroup and _renderInatObs); treated as already-gone per D-07 to de-risk Phase 131"
metrics:
  duration-minutes: 8
  completed-date: "2026-06-02"
  tasks-completed: 1
  files-modified: 4
---

# Phase 130 Plan 03: Detail Card taxonCache Name Resolution Summary

Switched the occurrence detail card to resolve taxon names from `_taxonCache` by `taxon_id` (D-07), threading `bee-atlas._taxonCache` through `bee-pane` to `bee-occurrence-detail` as a property. `row.scientificName` no longer appears anywhere in name determination render paths. `taxon_id IS NULL` and cache misses both render the existing `No determination` span — never blank or undefined. All 582 tests pass; tsc clean; build green.

## Tasks Completed

### Task 1: Thread taxonCache prop and resolve names by taxon_id (TDD)

**RED commit:** `441b79f` — 9 failing tests in `src/tests/bee-sidebar.test.ts` covering: taxonCache @property declaration, cache.get lookup, taxon_id null guard, .taxonCache forwarding in bee-pane, and .taxonCache binding in bee-atlas.

**GREEN commit:** `aa744e8` — implemented all changes.

Changes in `src/bee-occurrence-detail.ts`:
- Added `import type { TaxonCacheEntry } from './taxa.ts'`
- Added `@property({ attribute: false }) taxonCache: Map<number, TaxonCacheEntry> | null = null`
- `_renderCollectorGroup`: replaced `row.scientificName ? row.scientificName : <No determination>` with block-body map: `const info = row.taxon_id != null ? this.taxonCache?.get(row.taxon_id) : null; const displayName = info?.name ?? null;` → renders `displayName` when present, `No determination` span otherwise
- `_renderInatObs`: replaced `row.scientificName` primary label and alt-text with same cache lookup pattern (`inatInfo`/`inatDisplayName`); alt-text uses `inatDisplayName ?? 'bee'`

Changes in `src/bee-pane.ts`:
- Added `import type { TaxonCacheEntry } from './taxa.ts'`
- Added `@property({ attribute: false }) taxonCache: Map<number, TaxonCacheEntry> | null = null`
- `bee-occurrence-detail` render: added `.taxonCache=${this.taxonCache}` prop pass-through

Changes in `src/bee-atlas.ts`:
- `bee-pane` render block: added `.taxonCache=${this._taxonCache}`
- No `requestUpdate()` needed: `_taxaOptions` is `@state` and is assigned immediately after `_taxonCache` in `_loadSummaryFromSQLite`; the reactive update from `_taxaOptions` propagates the new `_taxonCache` reference to all presenters

Changes in `src/tests/bee-sidebar.test.ts` (new):
- 13 source-pattern tests covering: DC-01 taxonCache @property declaration, DC-02 cache.get lookup + row.scientificName absent from _renderCollectorGroup, DC-03 null guard + nullish coalesce + no-determination span, DC-04 bee-pane forwarding, DC-05 bee-atlas binding

## Deviations from Plan

None — plan executed exactly as written.

## Threat Flags

None — T-130-DC and T-130-NULL mitigated as designed: names come from the bundled read-only taxa cache (trusted reference data), auto-escaped by Lit html template; explicit null guard + cache-miss fallback asserted by render tests.

## Self-Check: PASSED

Files confirmed:
- `src/bee-occurrence-detail.ts`: contains `taxonCache` @property and `taxonCache?.get` lookup ✓
- `src/bee-occurrence-detail.ts`: zero occurrences of `row.scientificName` ✓
- `src/bee-pane.ts`: contains `taxonCache` and `.taxonCache=${this.taxonCache}` ✓
- `src/bee-atlas.ts`: contains `.taxonCache=${this._taxonCache}` ✓
- `src/tests/bee-sidebar.test.ts`: created with 13 tests ✓

Commits confirmed:
- 441b79f (Task 1 RED tests) ✓
- aa744e8 (Task 1 GREEN implementation) ✓

`npx tsc --noEmit` exits 0 ✓
`npm test -- --run` 582/582 pass ✓
`npm run build` exits 0 ✓
