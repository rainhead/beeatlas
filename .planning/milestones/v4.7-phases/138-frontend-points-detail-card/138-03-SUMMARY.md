---
phase: 138-frontend-points-detail-card
plan: "03"
subsystem: frontend
tags: [checklist, source-filter, url-state, mapbox-paint, cleanup]
dependency_graph:
  requires: [138-01]
  provides: [checklist-source-integration, green-point-paint, county-fill-removed]
  affects: [src/url-state.ts, src/style.ts, src/bee-pane.ts, src/bee-atlas.ts, src/bee-map.ts]
tech_stack:
  added: []
  patterns:
    - source-keyed outer match in Mapbox circle-color expression
    - checklist as standard VALID_SOURCES member via hiddenSources path
key_files:
  created: []
  modified:
    - src/url-state.ts
    - src/style.ts
    - src/bee-pane.ts
    - src/bee-atlas.ts
    - src/bee-map.ts
    - src/tests/url-state.test.ts
    - src/tests/bee-pane.test.ts
    - src/tests/bee-map.test.ts
    - src/tests/bee-atlas.test.ts
decisions:
  - "Removed cl= legacy param entirely; stale bookmarks harmlessly no-op (checklist is default-on)"
  - "Deleted entire _showChecklist/_checklistVisible/_onChecklistLayerChanged chain across all components"
  - "Tests from Plan 01 RED phase updated to reflect retired behavior (inverse assertions + new behavior assertions)"
metrics:
  duration: "~12 minutes"
  completed: "2026-06-08"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 9
---

# Phase 138 Plan 03: Checklist Source Integration & County-Fill Removal Summary

Checklist points now render as flat opaque green (#2c7a2c) map points; the `checklist` source is a real VALID_SOURCES member that participates in the standard src= URL round-trip and hiddenSources toggle path; the entire county-fill / _showChecklist property chain is deleted.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add checklist to VALID_SOURCES + green point paint; remove county-fill spec | 6268cc9 | src/url-state.ts, src/style.ts, src/tests/url-state.test.ts |
| 2 | Migrate bee-pane checklist toggle to hiddenSources; update no-sources threshold | 6830039 | src/bee-pane.ts, src/tests/bee-pane.test.ts |
| 3 | Remove checklist county-fill plumbing from bee-atlas + bee-map | 737e1f1 | src/bee-atlas.ts, src/bee-map.ts, src/tests/bee-atlas.test.ts, src/tests/bee-map.test.ts |

## What Was Built

**Task 1 — VALID_SOURCES + green paint + county-fill spec removal:**
- Added `'checklist'` to `SourceKey` union and `VALID_SOURCES` set (now 4 members)
- Removed `checklistVisible?` from `UiState` interface
- Removed `cl=` serialization (`buildParams`) and parse (`parseParams`) paths
- Extended `_occurrencePointPaint` with source-keyed outer match: `['match', ['get','source'], 'checklist', '#2c7a2c', <recency-tier fallback>]`
- Deleted `checklistCountyFillLayerSpec` function body and export from `src/style.ts`
- Updated MAP-04 tests: removed cl= round-trip assertions, added legacy-param-removed assertions

**Task 2 — bee-pane migration:**
- Deleted `@state() private _showChecklist`, `@property() checklistVisible`, `_onChecklistChange` method
- Removed `checklistVisible` branch from `updated()` lifecycle
- Replaced ad-hoc checklist toggle with `_onSourceToggle('checklist', ...)` standard pattern
- Updated tooltip copy: "Published specimen records from Bartholomew et al. 2024" (D-12)
- Updated no-sources guard from `=== 3` to `=== 4`
- Updated MAP-01 tests: removed old assertions, added new hiddenSources-path assertions

**Task 3 — bee-atlas + bee-map cleanup:**
- bee-atlas: deleted `_checklistVisible` @state, `_onChecklistLayerChanged`, `.showChecklist=`/`.checklistTaxon=`/`.checklistTaxonRank=`/`@checklist-layer-changed=` template bindings, `_checklistTaxon` local variable, and all three URL-restore sites for checklistVisible
- bee-map: deleted `showChecklist`/`checklistTaxon`/`checklistTaxonRank` props, `_checklistCounties`/`_checklistAllRows`/`_checklistGeneration` state, `updated()` checklist guard, `checklistCountyFillLayerSpec` layer add block, and four private methods (`_applyChecklistLayer`, `_applyChecklistVisibility`, `_applyChecklistFilter`, `_loadChecklistData`); removed `checklistCountyFillLayerSpec` and `parquetReadObjects` imports
- Updated MAP-03 (bee-atlas.test.ts) and MAP-02 (bee-map.test.ts) RED tests to reflect retired behavior

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Test Updates (Plan 01 RED Tests)

The Plan 01 RED tests in bee-pane.test.ts (MAP-01), bee-map.test.ts (MAP-02), bee-atlas.test.ts (MAP-03), and url-state.test.ts (MAP-04) tested the OLD county-fill/cl= behavior that was intentionally being removed. These tests were updated in the same commit as their implementation changes, replacing assertions for retired behavior with assertions for the new hiddenSources path. This is the expected RED→GREEN transition for Plan 03.

## Verification Results

- `npm test -- --run src/tests/url-state.test.ts src/tests/bee-pane.test.ts src/tests/bee-map.test.ts src/tests/bee-atlas.test.ts`: **245/245 PASS**
- `npx tsc --noEmit`: **clean** (zero errors)
- `grep -c "'#2c7a2c'" src/style.ts`: 1 — green hex present in source-keyed match
- `grep -c "checklistCountyFillLayerSpec" src/style.ts src/bee-map.ts`: 0 — fully removed
- `grep -c "_showChecklist\|_checklistVisible\|_checklistAllRows" src/bee-pane.ts src/bee-atlas.ts src/bee-map.ts`: 0 — fully removed

## Known Stubs

None. All checklist source routing is live through the standard hiddenSources path.

## Threat Flags

None. The src= URL param change adds `checklist` to the bounded enum validated in `parseParams` — consistent with threat T-138-04 mitigation (VALID_SOURCES guard). No new network endpoints or auth paths introduced.

## Self-Check: PASSED

- SUMMARY.md: FOUND
- Commit 6268cc9: FOUND (Task 1)
- Commit 6830039: FOUND (Task 2)
- Commit 737e1f1: FOUND (Task 3)
- `#2c7a2c` in style.ts: 1 occurrence (correct)
- `checklistCountyFillLayerSpec` in style.ts: 0 (deleted)
- `checklistCountyFillLayerSpec` in bee-map.ts: 0 (deleted)
- All 245 tests passing
- tsc --noEmit: clean
