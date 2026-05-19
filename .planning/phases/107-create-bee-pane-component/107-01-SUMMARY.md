---
phase: 107-create-bee-pane-component
plan: 01
subsystem: ui
tags: [lit, web-components, presenter, frontend, pane, tdd]

# Dependency graph
requires:
  - phase: 106-bee-atlas-state-machine
    provides: _paneState field on bee-atlas; PaneState type
provides:
  - BeePane LitElement skeleton with three-state chrome and navigation events
  - Source-scan tests for PANE-01..04, PANE-06, TABLE-01
affects:
  - 107-02 (Plan 02 fills in filter UI and occurrence detail into _renderListContent)
  - 108 (bee-atlas cutover wires bee-pane events)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-state pane presenter: collapsed/list/table driven by @property paneState from bee-atlas"
    - "Pane navigation events: pane-collapse, pane-expand-list, pane-expand-table, pane-shrink-list with bubbles+composed"
    - "TABLE-01 contract: bee-table embedded with .prop bindings only — no @event listeners; natural bubbling to bee-atlas"

key-files:
  created:
    - src/bee-pane.ts
    - src/tests/bee-pane.test.ts
  modified: []

key-decisions:
  - "void references used in _renderListContent() stub to satisfy noUnusedLocals for Plan 02 state fields"
  - "isFilterActive imported and void-referenced to satisfy unused imports until Plan 02 adds filter rendering"

patterns-established:
  - "Pane skeleton: toggle-btn always outside all paneState conditionals; expand-btn in list state only"
  - "Mobile breakpoint @media (max-aspect-ratio: 1) hides expand-btn (matches bee-atlas.ts convention)"

requirements-completed: [PANE-01, PANE-02, PANE-03, PANE-04, PANE-06, TABLE-01]

# Metrics
duration: 3min
completed: 2026-05-19
---

# Phase 107 Plan 01: bee-pane Skeleton Summary

**BeePane LitElement skeleton with three-state chrome (collapsed/list/table), four pane-navigation events, and bee-table embedding — source-scan tests RED→GREEN via TDD**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-19T20:18:16Z
- **Completed:** 2026-05-19T20:20:53Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Wave 0 RED test file created with 24 source-scan assertions covering PANE-01..04, PANE-06, TABLE-01, and sibling isolation
- bee-pane.ts skeleton created: three-state chrome, toggle/expand/shrink navigation events, bee-table embedded without event interception
- All 473 tests in full suite pass; `tsc --noEmit` exits 0

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 — create failing source-scan test file** - `40d4df3` (test)
2. **Task 2: GREEN — implement bee-pane skeleton** - `86e6c3a` (feat)

## Files Created/Modified

- `src/bee-pane.ts` - BeePane LitElement with three-state chrome, navigation events, bee-table embedding, and full filter @state field declarations for Plan 02
- `src/tests/bee-pane.test.ts` - Source-scan tests for PANE-01..04, PANE-06, TABLE-01, sibling isolation

## Final @property Fields on BeePane

| Property | Type | Default |
|----------|------|---------|
| paneState | 'collapsed' \| 'list' \| 'table' | 'collapsed' |
| filterState | FilterState | (required) |
| taxaOptions | TaxonOption[] | [] |
| countyOptions | string[] | [] |
| ecoregionOptions | string[] | [] |
| collectorOptions | CollectorEntry[] | [] |
| summary | DataSummary \| null | null |
| specimenCount | number \| null | null |
| occurrences | OccurrenceRow[] \| null | null |
| rows | OccurrenceRow[] | [] |
| rowCount | number | 0 |
| page | number | 1 |
| loading | boolean | false |
| sortBy | SpecimenSortBy | 'date' |
| filterActive | boolean | false |
| selectedIds | Set\<string\> \| null | null |

## Final @state Fields Declared (Passed Forward to Plan 02)

| Field | Type | Purpose |
|-------|------|---------|
| _open | boolean | filter panel open/closed |
| _taxonInput | string | taxon search input text |
| _selectedTaxon | {name, rank} \| null | current taxon filter |
| _collectorInput | string | collector search input text |
| _selectedCollectors | CollectorEntry[] | selected collectors |
| _whereInput | string | where search input text |
| _selectedCounties | Set\<string\> | selected counties |
| _selectedEcoregions | Set\<string\> | selected ecoregions |
| _selectedPlace | string \| null | selected place slug |
| _placeNameBySlug | Map\<string, string\> | place slug → display name |
| _elevMin | number \| null | elevation min filter |
| _elevMax | number \| null | elevation max filter |
| _yearThisYear | boolean | current year bucket |
| _yearLastYear | boolean | last year bucket |
| _yearEarlier | boolean | earlier years bucket |
| _openSection | 'taxon' \| 'collector' \| 'where' \| null | which suggestion dropdown is open |
| _suggestions | AnyS[] | autocomplete suggestions |
| _highlightIndex | number | highlighted suggestion index |

Note: `_placeOptions` is a plain private field (not `@state`) matching bee-filter-panel.ts line 77.

## bee-table Embedding Confirmation

TABLE-01 contract satisfied: `<bee-table>` is rendered in `_renderTableContent()` with `.rows=`, `.rowCount=`, `.page=`, `.loading=`, `.sortBy=`, `.filterActive=`, `.selectedIds=` property bindings only. No `@page-changed`, `@sort-changed`, `@row-pan`, `@download-csv`, or `@toggle-filter` listeners are attached. All bee-table events bubble naturally via `bubbles: true, composed: true` to bee-atlas (Phase 108 wires the handlers).

## CSS Class Names (No Deviations)

All CSS class names match the plan exactly:
- `.toggle-btn` — always-visible toggle button
- `.expand-btn` — expand to table (list state only, hidden on mobile)
- `.shrink-btn` — return to list (table state header)
- `.pane-chrome` — chrome container for toggle/expand buttons
- `.table-header` — table state header row
- `.list-placeholder` — stub content (Plan 02 replaces)

No deviations from planned CSS class names.

## Decisions Made

- **void references for Plan 02 state fields:** `_taxonInput`, `_collectorInput`, `_whereInput`, `_placeOptions`, `_openSection`, `_suggestions`, `_highlightIndex`, and `_emitFilter` are declared but not yet used by the skeleton. Added `void this._field` references in `_renderListContent()` to satisfy `noUnusedLocals: true` TypeScript config while preserving the declarations for Plan 02.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Plan 02 (107-02): `_renderListContent()` stub is in place with all filter @state fields declared. Plan 02 only needs to replace the stub with the merged filter UI rows (`_renderWhat/Who/Where/When` from bee-filter-panel.ts) and wire `bee-occurrence-detail` for occurrence display (PANE-05).

---
*Phase: 107-create-bee-pane-component*
*Completed: 2026-05-19*

## Self-Check: PASSED

- [x] `src/bee-pane.ts` exists
- [x] `src/tests/bee-pane.test.ts` exists
- [x] Commit `40d4df3` exists (test(107-01))
- [x] Commit `86e6c3a` exists (feat(107-01))
- [x] `npm test -- --run src/tests/bee-pane.test.ts` → 24/24 pass
- [x] `npm test -- --run` → 473/473 pass
- [x] `npx tsc --noEmit` → exits 0
