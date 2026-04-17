---
phase: 65-ui-unification
plan: "01"
subsystem: frontend/filter
tags: [refactor, types, filter, url-state, style]
dependency_graph:
  requires: []
  provides:
    - OccurrenceRow type in filter.ts
    - OCCURRENCE_COLUMNS array in filter.ts
    - unified queryVisibleIds/queryTablePage/queryAllFiltered/buildCsvFilename
    - UiState without layerMode
    - makeClusterStyleFn with getVisibleIds parameter
  affects:
    - frontend/src/bee-atlas.ts (callers updated in Plan 02)
    - frontend/src/bee-table.ts (callers updated in Plan 02)
tech_stack:
  added: []
  patterns:
    - OccurrenceRow replaces SpecimenRow/SampleRow union
    - OCCURRENCE_COLUMNS as const array replaces two separate column maps
key_files:
  created: []
  modified:
    - frontend/src/filter.ts
    - frontend/src/tests/filter.test.ts
    - frontend/src/url-state.ts
    - frontend/src/style.ts
decisions:
  - queryAllFiltered no longer builds custom URL-based selectCols; uses OCCURRENCE_COLUMNS directly
  - SAMPLE_ORDER removed; unified order is date DESC, recordedBy ASC, fieldNumber ASC for all occurrences
metrics:
  duration: "~15 minutes"
  completed: "2026-04-17T23:17:31Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 4
---

# Phase 65 Plan 01: Unify Filter Data Layer, URL State, and Style Utilities Summary

OccurrenceRow type and unified query functions replace dual SpecimenRow/SampleRow split with a single occurrence model; layerMode removed from URL state; sample dot style function deleted.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Unify filter.ts types, queries, and CSV filename | 6f8fd87 | frontend/src/filter.ts, frontend/src/tests/filter.test.ts |
| 2 | Remove layerMode from url-state.ts and clean up style.ts | 1dd8dbd | frontend/src/url-state.ts, frontend/src/style.ts |

## What Was Built

**filter.ts:**
- `OccurrenceRow` interface with all 25 fields from both Ecdysis and iNat occurrence columns
- `OCCURRENCE_COLUMNS` as-const array (replaces `SPECIMEN_COLUMNS` + `SAMPLE_COLUMNS`)
- `queryVisibleIds` now returns `Set<string> | null` with combined `ecdysis:N` and `inat:N` IDs in a single query
- `queryTablePage` and `queryAllFiltered` take no `layerMode` parameter; use `OCCURRENCE_COLUMNS` for all queries
- `buildCsvFilename` uses `'occurrences'` prefix always

**url-state.ts:**
- `UiState` interface no longer has `layerMode`
- `buildParams` no longer writes `lm` param
- `parseParams` no longer reads `lm`/`layerMode`

**style.ts:**
- `makeClusterStyleFn` parameter renamed from `getVisibleEcdysisIds` to `getVisibleIds`; internal variable renamed from `activeEcdysisIds` to `activeIds`
- Deleted: `SAMPLE_RECENCY_COLORS`, `SAMPLE_RECENCY_COLORS_ACTIVE`, `GHOSTED_SAMPLE_STYLE`, `sampleStyleCache`, `sampleStyleCacheActive`, `makeSampleDotStyleFn`

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Notable Decisions

**SAMPLE_ORDER removed:** The plan removed the samples-specific order `date DESC, observer ASC, sample_id ASC`. The unified order is `date DESC, recordedBy ASC, fieldNumber ASC`. The test for "samples with sortBy=modified should still use date DESC" was updated: with the unified model, `sortBy='modified'` now correctly produces `modified DESC` for all occurrences.

**queryAllFiltered simplified:** The old implementation built custom SELECT expressions per layerMode (with ecdysis URL construction, iNat URL construction). The new implementation uses `OCCURRENCE_COLUMNS.join(', ')` — the URL construction is deferred to the caller (Plan 02 / bee-sidebar context).

## Verification Results

- `npm test -- --run filter.test.ts`: 40/40 tests pass
- `grep -c 'layerMode' frontend/src/url-state.ts`: 0
- `grep -c 'makeSampleDotStyleFn' frontend/src/style.ts`: 0
- `grep -c 'SpecimenRow\|SampleRow' frontend/src/filter.ts`: 0
- TypeScript errors only in bee-atlas.ts, bee-table.ts, url-state.test.ts (callers updated in Plan 02 — expected)

## Known Stubs

None.

## Threat Flags

None — all changes are client-side refactoring of existing data paths. No new trust boundaries introduced.

## Self-Check: PASSED

- frontend/src/filter.ts: FOUND
- frontend/src/tests/filter.test.ts: FOUND
- frontend/src/url-state.ts: FOUND
- frontend/src/style.ts: FOUND
- Commit 6f8fd87: FOUND
- Commit 1dd8dbd: FOUND
