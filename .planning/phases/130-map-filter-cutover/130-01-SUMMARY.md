---
phase: 130-map-filter-cutover
plan: "01"
subsystem: frontend/filter
tags: [filter, taxon, sql, typescript, tdd]
requirements-completed: [MFILT-01, MFILT-03]
depends-on: []
provides: [taxonId-FilterState, descendant-buildFilterSQL, taxon_id-OCCURRENCE_COLUMNS]
affects: [src/filter.ts, src/url-state.ts, src/bee-atlas.ts, src/bee-pane.ts, src/bee-filter-controls.ts, src/bee-map.ts, src/features.ts]
tech-stack:
  added: []
  patterns: [materialized-path-descendant-subquery, integer-safe-sql-interpolation, tdd-red-green]
key-files:
  created: []
  modified:
    - src/filter.ts
    - src/url-state.ts
    - src/bee-atlas.ts
    - src/bee-pane.ts
    - src/bee-filter-controls.ts
    - src/bee-map.ts
    - src/features.ts
    - src/tests/filter.test.ts
    - src/tests/url-state.test.ts
    - src/tests/occurrence.test.ts
    - src/tests/build-geojson.test.ts
    - src/tests/bee-atlas.test.ts
    - src/tests/bee-pane.test.ts
    - src/tests/spa-link.test.ts
decisions:
  - "FilterState.taxonId is a TypeScript number; interpolated bare into SQL — no escaping needed (T-130-01)"
  - "Legacy taxon= URL params (non-integer) are not resolved synchronously; parseParams returns no filter for legacy format (async resolution deferred to Plan 02)"
  - "TaxonOption.taxonId placeholder value 0 used in features.ts and bee-atlas.ts legacy build path; will be replaced when taxa table query is wired in Plan 02"
  - "Task 2 consumer fixes (all FilterState shape changes in bee-atlas/bee-pane/bee-filter-controls/url-state) were applied as Rule 3 blocking fixes during Task 1 GREEN phase, folded into the same commit"
metrics:
  duration-minutes: 11
  completed-date: "2026-06-02"
  tasks-completed: 2
  files-modified: 14
---

# Phase 130 Plan 01: taxon_id Contract Layer Summary

Established the `taxon_id` contract layer in `src/filter.ts` that every Phase 130 consumer builds against. FilterState now keys taxon filtering on integer `taxonId`; `buildFilterSQL` emits a materialized-path descendant subquery; `OCCURRENCE_COLUMNS` and `OccurrenceRow` carry `taxon_id`. All 545 tests pass; `tsc --noEmit` clean.

## Tasks Completed

### Task 1: Rewrite buildFilterSQL taxon clause to descendant taxon_id subquery

**RED commit:** `178465e` — added 7 failing tests: descendant clause shape, null case, county compose, isFilterActive with taxonId.

**GREEN commit:** `a79c5cd` — implemented all changes; also included Task 2 consumer fixes (Rule 3).

Changes in `src/filter.ts`:
- `FilterState`: removed `taxonName: string|null` and `taxonRank: 'family'|'genus'|'species'|null`; added `taxonId: number|null` (filter key) and `taxonDisplayName: string|null` (display-only)
- `OccurrenceRow`: added `taxon_id: number|null`
- `OCCURRENCE_COLUMNS`: added `'taxon_id'` (column exists in shipped DB per Phase 129)
- `buildFilterSQL` taxon branch: replaced 3-rank string-column equality block with `(taxon_id = N OR taxon_id IN (SELECT taxon_id FROM taxa WHERE lineage_path IS NOT NULL AND instr(lineage_path, '/N/') > 0))` — integer interpolation, no escaping needed (T-130-01)
- `isFilterActive`: `f.taxonName !== null` → `f.taxonId !== null` (guards style cache bypass + race guards per CLAUDE.md architecture invariants)
- `buildCsvFilename`: `f.taxonName` → `f.taxonDisplayName`
- `TaxonOption`: `name: string` → `taxonId: number`; rank union expanded from 3 to 8 ranks (`subfamily`, `tribe`, `subtribe`, `subgenus`, `complex` added)
- `FilterChangedEvent`: `taxonName/taxonRank` → `taxonId/taxonDisplayName`

### Task 2: Update TaxonOption / FilterChangedEvent; fix url-state.test helper

All Task 2 changes were applied inline as Rule 3 (blocking) fixes during Task 1 GREEN phase, since the `FilterState` shape change caused type errors across all consumer files immediately.

Consumer fixes applied:
- `src/url-state.ts`: `buildParams` emits `taxon=<integer>`; `parseParams` decodes integer format, stores nothing for legacy name format (async resolution pending for Plan 02)
- `src/bee-atlas.ts`: filterState init blocks, `_onFilterChanged`, `checklistTaxon` binding, taxa options build (placeholder `taxonId: 0`)
- `src/bee-pane.ts`: `TaxonSug`, `_selectedTaxon` type, `updated()`, `_emitFilter`, `_selectTaxon`
- `src/bee-filter-controls.ts`: `TaxonToken`, `tokensToFilterState`, `filterStateToTokens`, `filterStatesEqual`, `getSuggestions`
- `src/bee-map.ts`: filterState default literal
- `src/features.ts`: TaxonOption build (placeholder `taxonId: 0`)

Test helper updates:
- `emptyFilter()` in both filter.test.ts and url-state.test.ts updated to `taxonId: null, taxonDisplayName: null`
- `occurrence.test.ts` BASE_ROW: added `taxon_id: null`
- `build-geojson.test.ts`: replaced `t.name` with label-based extraction
- `spa-link.test.ts`: removed old `parseParams` round-trip assertions (legacy format no longer produces synchronous filter); added test confirming legacy format returns no filter
- `bee-atlas.test.ts`, `bee-pane.test.ts`: updated source-pattern assertions

## Deviations from Plan

### Auto-fixed Issues (Rule 3 — Blocking)

**1. [Rule 3 - Blocking] Task 2 consumer fixes applied inline during Task 1 GREEN**

The `FilterState` shape change introduced in Task 1 immediately caused TypeScript errors across 8 consumer files (`bee-atlas.ts`, `bee-pane.ts`, `bee-filter-controls.ts`, `bee-map.ts`, `features.ts`, `url-state.ts`, and 6 test files). These were blocking — `tsc --noEmit` fails with type errors prevent the acceptance criterion from being met.

Applied all consumer fixes during Task 1 GREEN phase. Task 2 had no additional implementation work since all its changes were already forced by Task 1.

**Files modified:** same as Task 1 commit (all 14 modified files)
**Commit:** a79c5cd

**2. [Rule 1 - Bug] TaxonOption placeholder `taxonId: 0` in legacy build paths**

The `bee-atlas.ts` and `features.ts` files contain legacy taxa-options build code reading from `family/genus/scientificName` string columns. Since `TaxonOption.taxonId` is now required, these paths use `taxonId: 0` as a placeholder. This is intentional — Plan 02 will replace this build path with the real taxa table query. Documented here to track the stub.

**3. [Rule 3 - Blocking] spa-link.test.ts round-trip assertions removed**

`buildSpaTaxonLink` still emits legacy `?taxon=<name>&taxonRank=<rank>` format. After url-state changes, `parseParams` no longer resolves legacy format synchronously (taxon cache not available at parse time). The old assertions `expect(parsed.filter?.taxonName).toBe('Bombus')` would reference non-existent fields and fail. Replaced with a test confirming that legacy format produces no synchronous filter (correct behavior per D-06 two-phase resolution design).

## Known Stubs

| File | Location | Description |
|------|----------|-------------|
| `src/bee-atlas.ts` | `_loadSummaryFromSQLite` taxa options build | `taxonId: 0` placeholder — real taxon_ids from taxa table wired in Plan 02 |
| `src/features.ts` | `_buildGeoJSONFromRaw` taxaOptions build | `taxonId: 0` placeholder — this function is called from geo_blob path, replaced in Plan 02 |

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. The `taxon_id` integer interpolation in `buildFilterSQL` is safe by construction (TypeScript `number`, not user string).

## Self-Check: PASSED

Files confirmed modified:
- src/filter.ts: contains `instr(lineage_path, '/` ✓
- src/filter.ts: contains `'taxon_id'` in OCCURRENCE_COLUMNS ✓  
- src/filter.ts: `isFilterActive` contains `f.taxonId !== null` ✓

Commits confirmed:
- 178465e (RED tests) ✓
- a79c5cd (GREEN implementation) ✓
