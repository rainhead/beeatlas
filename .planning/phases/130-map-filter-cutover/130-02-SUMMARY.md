---
phase: 130-map-filter-cutover
plan: "02"
subsystem: frontend/filter
tags: [filter, taxon, autocomplete, url, typescript, tdd]
requirements-completed: [MFILT-01, MFILT-02, MFILT-03]
depends-on: ["130-01"]
provides: [lazy-taxon-cache, D01-enumeration, D03-labels, D05-ordering, integer-taxon-url, legacy-url-backcompat]
affects: [src/bee-atlas.ts, src/bee-filter-controls.ts, src/url-state.ts, src/taxa.ts, src/tests/bee-filter-controls.test.ts, src/tests/url-state.test.ts]
tech-stack:
  added: []
  patterns: [ancestry-expansion-enumeration, two-phase-url-resolution, lazy-cache-post-tablesReady, tdd-red-green]
key-files:
  created:
    - src/taxa.ts
    - src/tests/bee-filter-controls.test.ts
  modified:
    - src/bee-atlas.ts
    - src/bee-filter-controls.ts
    - src/url-state.ts
    - src/tests/url-state.test.ts
decisions:
  - "Lazy taxon cache built in _loadSummaryFromSQLite (called from _onDataLoaded for all pane states, not just table), off the boot path per D-08"
  - "D-01 enumeration uses ancestry-expansion form: DISTINCT taxon_ids from occurrences + lineage_path walk; avoids 10-second EXISTS form (~3.5ms runtime verified)"
  - "buildTaxonLabel/RANK_ORDER/buildTaxonOptions extracted to src/taxa.ts as pure stateless helpers — respects no-module-level-mutable-state invariant"
  - "ParsedParams type extends Partial<AppState> with optional pendingLegacyTaxon — backward compatible return type change"
  - "_resolveLegacyTaxon handles both cache-ready and cache-pending cases; rank-based twin disambiguation"
  - "features.ts taxaOptions stub (taxonId: 0) remains but is now dead code — bee-atlas no longer reads e.detail.taxaOptions from data-loaded event"
metrics:
  duration-minutes: 13
  completed-date: "2026-06-02"
  tasks-completed: 2
  files-modified: 6
---

# Phase 130 Plan 02: Taxon Cache + Autocomplete + URL Round-Trip Summary

Wired the consumer side of the taxon_id cutover: lazy taxa cache built from the taxa table post-tablesReady, D-01 enumeration via ancestry-expansion (~3.5ms), D-03 labels and D-05 ordering applied, and integer taxon= URL with two-phase legacy back-compat decode. All 569 tests pass; tsc clean; build green.

## Tasks Completed

### Task 1: Lazy taxon cache + D-01 enumeration + D-03 labels + D-05 ordering

**RED commit:** `edb32c6` — 19 failing tests covering buildTaxonLabel, RANK_ORDER/sort comparator, buildTaxonOptions enumeration, and getSuggestions token shape.

**GREEN commit:** `d8d041d` — implemented all changes.

Changes:

- `src/taxa.ts` (new): pure stateless helpers:
  - `buildTaxonLabel(name, rank)`: D-03 label scheme (genus → `name (genus)`, subgenus → `name (subgenus)`, complex → `name complex`, all others plain)
  - `RANK_ORDER`: `{family:0, subfamily:1, tribe:2, subtribe:3, genus:4, subgenus:5, complex:6, species:7}`
  - `buildTaxonOptions(presentIds, taxonCache)`: D-01 enumeration — walks `lineage_path` of each present occurrence taxon_id to collect eligible anthophila ancestors; builds sorted TaxonOption[] with D-03 labels and D-05 ordering

- `src/bee-atlas.ts`:
  - Added `_taxonCache: Map<number, TaxonCacheEntry>` (non-reactive field)
  - Added `_pendingLegacyTaxon` field for two-phase legacy URL resolution
  - Replaced old `SELECT DISTINCT family, genus, scientificName FROM occurrences WHERE ecdysis_id IS NOT NULL` with two-step: (1) `SELECT taxon_id, rank, name, lineage_path FROM taxa WHERE is_anthophila = 1` → builds `_taxonCache`; (2) `SELECT DISTINCT taxon_id FROM occurrences WHERE taxon_id IS NOT NULL` → walks lineage_path via `buildTaxonOptions`
  - `_onDataLoaded` now calls `_loadSummaryFromSQLite()` (not `e.detail.taxaOptions`) — loading screen lift moves to `_loadSummaryFromSQLite`'s finally block
  - Added `_resolveLegacyTaxon` helper for cache-ready and cache-pending resolution

- `src/bee-filter-controls.ts`:
  - `getSuggestions` exported for unit testing (was package-private)
  - Token shape was already `taxonId + taxonDisplayName` from Plan 01 — no functional changes needed

- `src/tests/bee-filter-controls.test.ts` (new): 19 tests covering all four behavior specifications.

### Task 2: Integer taxon= URL encode + two-phase legacy back-compat decode

**RED commit:** `3cbd3a4` — 5 failing tests (1 actually failed on `pendingLegacyTaxon` being undefined; 4 others already pass since url-state.ts had integer encoding from Plan 01).

**GREEN commit:** `a49f629` — implemented all changes.

Changes:

- `src/url-state.ts`:
  - Added `ParsedParams` type: `Partial<AppState> & { pendingLegacyTaxon?: { name: string; rank: string | null } }`
  - `parseParams` return type changed to `ParsedParams`
  - Non-integer `taxon=` value now populates `result.pendingLegacyTaxon` (instead of silently ignored)
  - `taxonRankRaw` read for twin disambiguation in legacy records

- `src/bee-atlas.ts`:
  - `firstUpdated`: reads `initialParams.pendingLegacyTaxon` → sets `_pendingLegacyTaxon`
  - `_onPopState`: calls `_resolveLegacyTaxon` on navigation to legacy URLs
  - `_resolveLegacyTaxon`: if cache populated → immediate name+rank → taxonId lookup with rank-based twin disambiguation; if cache not yet ready → stores as `_pendingLegacyTaxon` for resolution in `_loadSummaryFromSQLite`

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written.

### Structural Observations

**1. features.ts taxaOptions stub is now dead code**

`src/features.ts` `_buildGeoJSONFromRaw` still builds a legacy `taxaOptions` array with `taxonId: 0` and passes it in the `data-loaded` event. `bee-atlas._onDataLoaded` no longer reads `e.detail.taxaOptions` — the field is ignored. The stub is benign dead code until Phase 131 removes the denormalized string columns. No action needed this plan.

**2. _loadSummaryFromSQLite called unconditionally from _onDataLoaded**

Previously `_loadSummaryFromSQLite` was only called from `loadOccurrencesTable().then()` when `paneState === 'table'`. Now it is called unconditionally from `_onDataLoaded` (which fires after the geo blob loads) for all pane states. This ensures the taxa cache loads for every user session. The table-pane-specific call was removed to avoid double-calling. The loading screen lift now happens in `_loadSummaryFromSQLite`'s finally block (slightly later than before, after the taxa cache is ready).

## Known Stubs

| File | Location | Description |
|------|----------|-------------|
| `src/features.ts` | `_buildGeoJSONFromRaw` taxaOptions build | `taxonId: 0` placeholder — dead code; `bee-atlas` no longer reads `e.detail.taxaOptions` |

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes. The pending-legacy taxon name is stored in memory and used only for in-memory cache equality lookup; it is never interpolated into SQL (T-130-LU mitigated).

## Self-Check: PASSED

Files confirmed:
- `src/taxa.ts` exists with `buildTaxonLabel`, `RANK_ORDER`, `buildTaxonOptions`
- `src/bee-atlas.ts` contains `_taxonCache` and `SELECT taxon_id, rank, name, lineage_path FROM taxa WHERE is_anthophila = 1`
- No `DISTINCT family, genus, scientificName` in `src/bee-atlas.ts`
- `src/url-state.ts` contains `parseInt` + `String(asInt) === taxonRaw` roundtrip guard
- No `params.set('taxonRank'` in `src/url-state.ts`
- `src/tests/bee-filter-controls.test.ts` created with 19 tests

Commits confirmed:
- edb32c6 (Task 1 RED) ✓
- d8d041d (Task 1 GREEN) ✓
- 3cbd3a4 (Task 2 RED) ✓
- a49f629 (Task 2 GREEN) ✓

`npx tsc --noEmit` exits 0 ✓
`npm test -- --run` 569/569 pass ✓
`npm run build` exits 0 ✓
