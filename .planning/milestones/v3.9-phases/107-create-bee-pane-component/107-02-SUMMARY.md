---
phase: 107-create-bee-pane-component
plan: 02
subsystem: ui
tags: [lit, web-components, filter-ui, occurrence-detail, frontend, tdd]

# Dependency graph
requires:
  - phase: 107-01
    provides: BeePane skeleton with all @property and @state fields; _renderListContent stub
  - phase: 106-bee-atlas-state-machine
    provides: _paneState field on bee-atlas; PaneState type
provides:
  - Complete bee-pane component with merged filter UI rows (What/Who/Where/When) and occurrence detail
  - PANE-05 source-scan test coverage
affects:
  - 108 (bee-atlas cutover replaces bee-filter-panel + bee-sidebar with bee-pane)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Copy-merge from existing sibling: verbatim copy of handler methods and render methods from bee-filter-panel.ts and bee-sidebar.ts"
    - "Filter rows always visible in list state (no _open gate on filter-panel rows); _open remains for document-click dropdown management"

key-files:
  created: []
  modified:
    - src/bee-pane.ts
    - src/tests/bee-pane.test.ts

key-decisions:
  - "Filter rows render unconditionally inside _renderListContent (no _open gating) — pane itself is the persistent filter surface per UI-SPEC"
  - "_open @state and document-click handler retained from Plan 01 to manage suggestion dropdown open/close state"
  - "isFilterActive import retained (suppressed via void) — bee-pane does not show specimen count in a filter-btn, so the function is not called"

patterns-established:
  - "Sidebar-header in list state uses sidebar-title class with 'Filters' label (not close button — toggle handles collapse)"
  - "Divider between filter rows and occurrence detail: 1px var(--border-subtle) div.divider"

requirements-completed: [PANE-05]

# Metrics
duration: 3min
completed: 2026-05-19
---

# Phase 107 Plan 02: bee-pane Filter UI + Occurrence Detail Summary

**BeePane completed with verbatim-copy filter UI rows (What/Who/Where/When) from bee-filter-panel.ts and occurrence detail shell from bee-sidebar.ts; all 484 tests green; tsc clean**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-19T20:22:54Z
- **Completed:** 2026-05-19T20:26:16Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added 11 PANE-05 source-scan test assertions (RED: 7 failures, 28 passes) confirming _renderWhat/Who/Where/When presence, bee-occurrence-detail conditional, filter-changed event, updated() sync, _ensurePlaceNamesLoaded, all 11 FilterChangedEvent detail fields, and stub removal
- Extended bee-pane.ts with all handler methods (_handleKeydown, _pickSuggestion, _onBlur, taxon/collector/where/elev handlers) and render methods (_renderWhat, _renderWho, _renderWhere, _renderWhen) — verbatim copies from bee-filter-panel.ts
- Replaced _renderListContent stub with sidebar-header + filter-panel div + divider + bee-occurrence-detail conditional
- Full test suite: 484/484 pass; tsc --noEmit exits 0; npm run build succeeds

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 — extend test file with PANE-05 source-scan assertions (RED)** - `778914e` (test)
2. **Task 2: GREEN — merge filter UI rows + occurrence detail into bee-pane list state** - `2324da9` (feat)

## Files Created/Modified

- `src/bee-pane.ts` — 1004 lines total; extended from 384-line skeleton with 620 lines of handler/render/CSS content
- `src/tests/bee-pane.test.ts` — Extended with PANE-05 describe block (11 new test assertions)

## Total Line Count: src/bee-pane.ts

**1004 lines**

## Verbatim-Copy Provenance

| Block | Source File | Source Lines |
|-------|-------------|-------------|
| Filter CSS (filter-panel, filter-row, chips, suggestions, elev-row, year-row, etc.) | `src/bee-filter-panel.ts` | 104–284 |
| Sidebar-header CSS (.sidebar-header, .sidebar-title, .close-btn) | `src/bee-sidebar.ts` | 77–103 |
| `_handleKeydown` | `src/bee-filter-panel.ts` | 397–424 |
| `_pickSuggestion` | `src/bee-filter-panel.ts` | 426–431 |
| `_onBlur` | `src/bee-filter-panel.ts` | 433–435 |
| `_onTaxonInput`, `_selectTaxon`, `_clearTaxon` | `src/bee-filter-panel.ts` | 439–475 |
| `_onCollectorInput`, `_selectCollector`, `_removeCollector` | `src/bee-filter-panel.ts` | 479–523 |
| `_onWhereInput`, `_selectWhere`, `_removeCounty`, `_removeEcoregion`, `_removePlace` | `src/bee-filter-panel.ts` | 527–595 |
| `_onElevMinInput`, `_onElevMaxInput` | `src/bee-filter-panel.ts` | 624–634 |
| `_renderWhat` | `src/bee-filter-panel.ts` | 638–683 |
| `_renderWho` | `src/bee-filter-panel.ts` | 686–735 |
| `_renderWhere` | `src/bee-filter-panel.ts` | 737–822 |
| `_renderWhen` | `src/bee-filter-panel.ts` | 824–853 |
| `_renderListContent` shell (sidebar-header + bee-occurrence-detail conditional) | `src/bee-sidebar.ts` | 113–122 (adapted) |

## No Runtime Side-Effect Imports Confirmed

`src/bee-pane.ts` does NOT contain runtime (non-type) imports of:
- `bee-atlas.ts` — confirmed absent
- `bee-filter-panel.ts` — confirmed absent
- `bee-sidebar.ts` (side-effect import) — confirmed absent

The only `bee-sidebar.ts` reference is a type-only import: `import type { DataSummary, TaxonOption, FilterChangedEvent } from './bee-sidebar.ts'`

## FilterChangedEvent Detail Keys Confirmed Present

All 11 required fields present in `_emitFilter()`:

| Field | Status |
|-------|--------|
| taxonName | present |
| taxonRank | present |
| yearFrom | present |
| yearTo | present |
| months | present (always `new Set<number>()`) |
| selectedCounties | present |
| selectedEcoregions | present |
| selectedCollectors | present |
| elevMin | present |
| elevMax | present |
| selectedPlace | present |

## Decisions Made

- **Filter rows unconditionally visible:** `_renderListContent` renders filter rows directly without `_open` gating. The pane itself is the persistent filter surface — it collapses/expands at the pane level, not the row level. `_open` is retained for suggestion dropdown management (the document-click handler uses it).
- **No close button in sidebar-header:** bee-pane uses toggle-btn (pane-collapse event) instead of a close button. The sidebar-header only shows the "Filters" label.
- **divider + panel-content + hint CSS added:** Three new CSS rules added (not in bee-filter-panel.ts) to complete the list state layout below the filter rows.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Open Issues for Phase 108 Cutover

| Issue | Notes |
|-------|-------|
| `isFilterActive` import unused | Imported from filter.ts but not called in bee-pane. Suppressed via `void isFilterActive` at file bottom. Phase 108 can either remove it or wire it to show filter-active state in the pane chrome. |
| `_open` / document-click handler | Retained from Plan 01. In bee-pane, `_open` gates suggestion dropdowns (via `_openSection`), not the filter panel itself. Works correctly as-is; no change needed. |
| bee-pane not yet rendered in bee-atlas | Phase 108 cutover wires bee-pane into bee-atlas.ts in place of bee-filter-panel + bee-sidebar. No action needed here. |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- bee-pane is feature-complete: chrome (Plan 01) + filter UI + occurrence detail conditional (Plan 02)
- Filter behaviors match bee-filter-panel exactly (verbatim copies)
- FilterChangedEvent detail shape matches bee-filter-panel exactly
- Phase 108 unblocked: bee-atlas can swap bee-filter-panel + bee-sidebar for bee-pane

---
*Phase: 107-create-bee-pane-component*
*Completed: 2026-05-19*

## Self-Check: PASSED

- [x] `src/bee-pane.ts` exists (1004 lines)
- [x] `src/tests/bee-pane.test.ts` exists with PANE-05 describe block
- [x] Commit `778914e` exists (test(107-02))
- [x] Commit `2324da9` exists (feat(107-02))
- [x] `npm test -- --run` → 484/484 pass
- [x] `npx tsc --noEmit` → exits 0
- [x] `npm run build` → succeeds
- [x] Stub `List content (Plan 02 fills in` absent from bee-pane.ts
- [x] `bee-occurrence-detail .occurrences=${this.occurrences}` present in _renderListContent
- [x] `occurrences !== null` guard present
- [x] `resolveDataUrl('places_meta')` present
- [x] All 11 FilterChangedEvent detail keys present in _emitFilter
