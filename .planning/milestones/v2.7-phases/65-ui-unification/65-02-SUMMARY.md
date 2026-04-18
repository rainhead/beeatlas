---
phase: 65-ui-unification
plan: "02"
subsystem: frontend/components
tags: [refactor, components, lit, ui-unification, occurrence-model]
dependency_graph:
  requires:
    - 65-01 (OccurrenceRow, OCCURRENCE_COLUMNS, unified filter functions)
  provides:
    - bee-occurrence-detail component (unified specimen+sample detail view)
    - bee-sidebar wired to bee-occurrence-detail with OccurrenceRow[]
    - bee-atlas with _visibleIds and _selectedOccurrences
    - bee-map with visibleIds property and raw OccurrenceRow click payload
    - bee-table with OCCURRENCE_COLUMN_DEFS (10 unified columns)
    - bee-header without layer tabs
    - bee-filter-toolbar without layerMode
  affects:
    - All UI components now use unified OccurrenceRow type throughout
tech_stack:
  added: []
  patterns:
    - bee-occurrence-detail: groupBySpecimenSample groups ecdysis rows by year/month/collector/field before rendering
    - Null-omit pattern: ecdysis_id==null rows render as sample-only, non-null as specimen groups
    - Raw feature property collection: OCCURRENCE_COLUMNS loop replaces buildSamples()
key_files:
  created:
    - frontend/src/bee-occurrence-detail.ts
  modified:
    - frontend/src/bee-sidebar.ts
    - frontend/src/bee-atlas.ts
    - frontend/src/bee-map.ts
    - frontend/src/bee-header.ts
    - frontend/src/bee-table.ts
    - frontend/src/bee-filter-toolbar.ts
    - frontend/src/tests/bee-sidebar.test.ts
    - frontend/src/tests/bee-atlas.test.ts
    - frontend/src/tests/bee-table.test.ts
    - frontend/src/tests/bee-header.test.ts
    - frontend/src/tests/bee-filter-toolbar.test.ts
  deleted:
    - frontend/src/bee-specimen-detail.ts
    - frontend/src/bee-sample-detail.ts
decisions:
  - bee-occurrence-detail renders specimen groups (grouped by year/month/recordedBy/fieldNumber) above a separator, then sample-only rows below
  - _restoreSelectionOccurrences queries both ecdysis: and inat: prefixed IDs in a single SQL OR clause using OCCURRENCE_COLUMNS
  - _restoreClusterSelection now yields raw OccurrenceRow[] instead of building Sample[] structs
  - bee-header layer tabs removed entirely (Specimens/Samples/Species/Plants all gone); hamburger menu removed with them
  - bee-header tests for layer-changed events and disabled Species/Plants stubs replaced with tests for viewMode-only interface
  - bee-filter-toolbar test updated to assert layerMode absent (false) rather than present
metrics:
  duration: "~30 minutes"
  completed: "2026-04-17T23:50:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 13
---

# Phase 65 Plan 02: Unified UI Components Summary

New bee-occurrence-detail component with specimen-group and sample-only render paths replaces bee-specimen-detail and bee-sample-detail; all six UI components migrated from dual layerMode/visibleEcdysisIds/visibleSampleIds model to single visibleIds/selectedOccurrences/OccurrenceRow[] model; v2.7 UI unification complete.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create bee-occurrence-detail and update bee-sidebar | fc1a1a0 | bee-occurrence-detail.ts (created), bee-sidebar.ts, bee-specimen-detail.ts (deleted), bee-sample-detail.ts (deleted), bee-sidebar.test.ts |
| 2 | Update bee-atlas, bee-map, bee-header, bee-table, bee-filter-toolbar and remaining tests | 0872425 | bee-atlas.ts, bee-map.ts, bee-header.ts, bee-table.ts, bee-filter-toolbar.ts, bee-atlas.test.ts, bee-table.test.ts, bee-header.test.ts, bee-filter-toolbar.test.ts |

## What Was Built

**bee-occurrence-detail.ts (new):**
- `groupBySpecimenSample()` groups ecdysis-backed OccurrenceRows by `year-month-recordedBy-fieldNumber` key
- `_renderSpecimenGroup()` renders sample header + species list with ecdysis links, host info, and iNat photo links
- `_renderSampleOnly()` renders date/observer/count/elevation/iNat link for rows with `ecdysis_id == null`
- `render()` splits occurrences into specimenBacked vs sampleOnly, renders both with a separator if both present
- Pure presenter: only `@property`, no `@state()`

**bee-sidebar.ts:**
- Deleted `Specimen`, `Sample`, `SampleEvent` interfaces
- Replaced `samples: Sample[] | null` and `selectedSampleEvent: SampleEvent | null` with `occurrences: OccurrenceRow[] | null`
- Render: single conditional — `bee-occurrence-detail` or hint paragraph

**bee-atlas.ts:**
- `_visibleIds: Set<string> | null` replaces `_visibleEcdysisIds` + `_visibleSampleIds`
- `_selectedOccurrences: OccurrenceRow[] | null` replaces `_selectedSamples` + `_selectedSampleEvent`
- `_layerMode` and `_onLayerChanged` deleted
- `_restoreSelectionOccurrences` queries both ecdysis: and inat: IDs using OCCURRENCE_COLUMNS
- `_restoreClusterSelection` yields raw `OccurrenceRow[]`
- `queryTablePage` and `queryAllFiltered` called without `layerMode`
- `buildParams`/`parseParams` calls updated (no `layerMode` in ui object)

**bee-map.ts:**
- `visibleIds: Set<string> | null` replaces `visibleEcdysisIds` + `visibleSampleIds`
- `layerMode` property deleted
- Click handler: `OCCURRENCE_COLUMNS` loop builds `OccurrenceRow[]` from feature properties
- Event payload: `{ occurrences, occIds, centroid?, radiusM? }` replaces `{ samples, occIds, ... }`
- `buildSamples()` and `_buildRecentSampleEvents()` deleted
- `data-loaded` event no longer includes `recentEvents`

**bee-header.ts:**
- `layerMode` property deleted
- `_onLayerClick()` and `layer-changed` event dispatch deleted
- `_renderTabItems()` (Specimens/Samples/Species/Plants buttons) deleted
- Hamburger menu `<details>` removed (contained only layer tab items)

**bee-table.ts:**
- `OCCURRENCE_COLUMN_DEFS` (10 columns: Date, Species, Collector, Observer, County, Ecoregion, Elev (m), Field #, Modified, Photo) replaces `SPECIMEN_COLUMN_DEFS` + `SAMPLE_COLUMN_DEFS`
- `layerMode` property deleted; `const noun = 'occurrences'`
- Sort guard: `col.key === 'date' || col.key === 'modified'` (no layerMode check)

**bee-filter-toolbar.ts:**
- `layerMode` property deleted

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] bee-header.test.ts tested removed functionality**
- **Found during:** Task 2 verification (test run)
- **Issue:** `bee-header.test.ts` tested `layerMode` property, `layer-changed` event, Specimens/Samples/Species/Plants tab buttons, and hamburger `<details>` element — all removed by this plan
- **Fix:** Rewrote `bee-header.test.ts` to test only the remaining interface: `viewMode` property present, `layerMode` absent, `view-changed` event works, active button does not re-dispatch
- **Files modified:** `frontend/src/tests/bee-header.test.ts`
- **Commit:** 0872425

**2. [Rule 1 - Bug] bee-filter-toolbar.test.ts asserted layerMode present**
- **Found during:** Task 2 verification (test run)
- **Issue:** FILT-08 test asserted `props.has('layerMode')).toBe(true)` which now fails since layerMode was removed
- **Fix:** Updated assertion to `expect(props.has('layerMode')).toBe(false)` and updated test name
- **Files modified:** `frontend/src/tests/bee-filter-toolbar.test.ts`
- **Commit:** 0872425

## Verification Results

- `npm test -- --run`: 150/150 tests pass (7 test files)
- `grep -r 'layerMode' frontend/src/ --include='*.ts' | grep -v node_modules | grep -v '.test.ts'`: no matches
- `grep -r 'bee-specimen-detail\|bee-sample-detail' frontend/src/ --include='*.ts'`: only in test assertions (not.toMatch)
- `ls frontend/src/bee-specimen-detail.ts frontend/src/bee-sample-detail.ts`: files not found
- `grep -c 'bee-occurrence-detail' frontend/src/bee-sidebar.ts`: 2

## Known Stubs

None — all data flows are wired end-to-end. `bee-occurrence-detail` receives live `OccurrenceRow[]` from `bee-atlas._selectedOccurrences` which is populated from either map click events (raw feature properties) or SQLite restore queries.

## Threat Flags

None — all changes are client-side refactoring of existing rendering paths. External links use `target="_blank" rel="noopener"` as required. No new trust boundaries.

## Self-Check: PASSED

- frontend/src/bee-occurrence-detail.ts: FOUND
- frontend/src/bee-sidebar.ts: FOUND (contains bee-occurrence-detail)
- frontend/src/bee-atlas.ts: FOUND (contains _visibleIds, _selectedOccurrences)
- frontend/src/bee-map.ts: FOUND (contains visibleIds)
- frontend/src/bee-header.ts: FOUND (no layerMode)
- frontend/src/bee-table.ts: FOUND (contains OCCURRENCE_COLUMN_DEFS)
- frontend/src/bee-filter-toolbar.ts: FOUND (no layerMode)
- Commit fc1a1a0: FOUND
- Commit 0872425: FOUND
- bee-specimen-detail.ts: DELETED (confirmed)
- bee-sample-detail.ts: DELETED (confirmed)
- All 150 tests: PASS
