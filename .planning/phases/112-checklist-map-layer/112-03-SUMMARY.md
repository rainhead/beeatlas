---
phase: 112-checklist-map-layer
plan: "03"
subsystem: ui
tags: [mapbox, lit, hyparquet, parquet, checklist, county-fill, url-state]

requires:
  - phase: 112-01
    provides: RED test gates for MAP-01, MAP-02, MAP-03, MAP-04
  - phase: 112-02
    provides: url-state.ts UiState.checklistVisible, manifest.ts checklist key

provides:
  - bee-pane checklist toggle row with layers icon (_renderShow, _showChecklist, checklist-layer-changed event)
  - bee-atlas _checklistVisible state, _onChecklistLayerChanged handler, property bindings to bee-map, URL restore
  - bee-map checklist-county-fill Mapbox layer with parquet fetch, generation guard, rank-aware taxon filter

affects: [Phase 113 species pages, Phase 114 species index]

tech-stack:
  added: []
  patterns:
    - "bee-pane filter row pattern: _renderShow mirrors _renderWhen structure"
    - "bee-atlas coordinator pattern: _onChecklistLayerChanged mirrors _onBoundaryModeChanged"
    - "bee-map async fetch with generation guard (_checklistGeneration mirrors _filterQueryGeneration)"
    - "parquetReadObjects with columns projection: ['county', 'scientificName', 'genus', 'family']"

key-files:
  created: []
  modified:
    - src/bee-pane.ts
    - src/bee-atlas.ts
    - src/bee-map.ts

key-decisions:
  - "checklistTaxonRank added as third bee-map property to enable rank-aware filter (species/genus/family)"
  - "Checklist parquet rows cached in _checklistAllRows; subsequent taxon changes filter in JS without re-fetch"
  - "_checklistGeneration counter guards against stale async fetch results (mirrors _filterQueryGeneration pattern)"
  - "addLayer for checklist-county-fill uses beforeId 'ghost-points' to ensure specimen dots render on top"

requirements-completed:
  - MAP-01
  - MAP-02
  - MAP-03
  - MAP-04

duration: 25min
completed: 2026-05-24
---

# Phase 112 Plan 03: Checklist Map Layer — Implementation Summary

**STATUS: COMPLETE — All 4 tasks done, browser UAT approved.**

Checklist county-fill Mapbox layer wired end-to-end: bee-pane toggle dispatches event, bee-atlas coordinates state and URL persistence, bee-map fetches checklist.parquet and renders rgba(44,122,44) county fill filtered by taxon rank.

## Performance

- **Duration:** ~25 min
- **Started:** 2026-05-24T15:35:00Z
- **Completed (tasks 1-3):** 2026-05-24T16:00:00Z
- **Tasks completed:** 4 of 4
- **Files modified:** 3

## Accomplishments

- Task 1: Added "Checklist records" toggle to bee-pane filter panel with layers SVG icon, `_showChecklist` state, `_renderShow()` method, `_onChecklistChange` handler, and `checklist-layer-changed` CustomEvent. All 6 MAP-01 gates GREEN.
- Task 2: Wired bee-atlas with `_checklistVisible` state, `_onChecklistLayerChanged` handler, property bindings to `<bee-map>` (`.showChecklist`, `.checklistTaxon`, `.checklistTaxonRank`), `@checklist-layer-changed` listener on `<bee-pane>`, `_buildCurrentParams()` extension, and URL restore in `firstUpdated()` and `_onPopState()`. All 4 MAP-03 gates GREEN.
- Task 3: Added `checklist-county-fill` Mapbox fill layer (beforeId `ghost-points`), `parquetReadObjects` import, `_checklistGeneration` generation guard, `_loadChecklistData` with rank-aware filtering, `_applyChecklistLayer/_applyChecklistVisibility/_applyChecklistFilter` methods. All 8 MAP-02 gates GREEN.
- Full test suite: 502 tests passed (all MAP-01/02/03/04 gates GREEN, zero regressions).
- `npm run build` exits 0.

## Task Commits

1. **Task 1: Add checklist toggle UI to bee-pane (MAP-01)** - `7b8dd77` (feat)
2. **Task 2: Wire bee-atlas state, handler, bindings, URL restore (MAP-03)** - `afd5ea5` (feat)
3. **Task 3: Add Mapbox layer, fetch, reactive update to bee-map (MAP-02)** - `0b0dd64` (feat)

## Files Modified

- `/Users/rainhead/dev/beeatlas/src/bee-pane.ts` — Added `_showChecklist` @state, `_renderShow()`, `_onChecklistChange()`, invocation in `_renderListContent()`
- `/Users/rainhead/dev/beeatlas/src/bee-atlas.ts` — Added `_checklistVisible` @state, `_onChecklistLayerChanged()`, property bindings on `<bee-map>`, listener on `<bee-pane>`, URL plumbing
- `/Users/rainhead/dev/beeatlas/src/bee-map.ts` — Added `parquetReadObjects` import, 3 @property fields, 3 private fields, `checklist-county-fill` layer add, `updated()` hook, 4 new private methods

## Decisions Made

- Added `checklistTaxonRank` as a third property on bee-map (beyond what Task 2 spec required) to enable rank-aware filtering (species matches `scientificName`, genus matches `genus`, family matches `family`). This was required by the Task 3 spec and avoids a future breaking change.
- Task 3 action item #7 (adding `.checklistTaxonRank` binding in bee-atlas) was included in Task 2's commit since the binding is in bee-atlas.ts.
- `_checklistAllRows` cache initialized as empty array; fetch only happens on first `showChecklist = true` activation. Subsequent taxon changes re-filter the in-memory cache without re-fetching.

## Deviations from Plan

None — plan executed exactly as written. The `checklistTaxonRank` binding was mentioned as a Task 3 amendment to Task 2 (plan action #7) and was included in the Task 2 commit since it modifies bee-atlas.ts.

## CLAUDE.md Invariants Verified

- `speicmenLayer` typo in bee-map.ts preserved (grep count unchanged: 2).
- `bee-atlas` owns all cross-component state (`_checklistVisible`); bee-map and bee-pane are pure presenters.
- Style cache untouched — checklist layer does not interact with occurrence layer styles.
- No new module-level mutable state introduced.

## Threat Model Compliance

- T-112-03-01 (Mapbox setFilter tampering): county names come from parquet (server-controlled). Expression uses `['in', ['get', 'NAME'], ['literal', counties]]` — no template string concatenation.
- T-112-03-02 (DoS re-fetch): `_checklistAllRows` cached; generation counter active.
- T-112-03-04 (URL cl param): strict `=== '1'` parsing (implemented in Plan 02).

## Known Stubs

None — all checklist data paths are wired to real fetch from `resolveDataUrl('checklist')`.

## Browser UAT (Task 4)

UAT approved 2026-05-24. All 9 verification steps passed:
- "Checklist records" row visible in filter panel with layers icon.
- Toggle shows semi-transparent green county fill; specimen dots visible on top; URL gains `cl=1`.
- Taxon filter narrows checklist fill; clearing restores all counties.
- Year/Month filter leaves checklist fill unchanged.
- Page reload with `cl=1` restores pre-checked toggle and fill.
- Uncheck removes fill and drops `cl` param from URL.
- No JavaScript console errors.

## Next Phase Readiness

- All four MAP-* requirements (MAP-01 through MAP-04) satisfied end-to-end.
- Phase 113 (species pages with checklist data) can begin.

---
*Phase: 112-checklist-map-layer*
*Status: COMPLETE*
*Completed: 2026-05-24*
