---
phase: "157"
plan: "01"
subsystem: ui
tags: [ui, stacking, z-index, region-control, bee-atlas, bee-map, STACK-01, SC-1, SC-2, SC-3, SC-4]
dependency_graph:
  requires:
    - "bee-map { z-index: 0 } in bee-atlas.ts (Phase 108-02 / commit 014c6d15)"
    - "bee-pane :host z-index:1 baseline (bee-pane.ts)"
    - _boundaryMode @state + _onBoundaryModeChanged side effects (pre-existing)
  provides:
    - "Region control (markup + CSS + _regionMenuOpen + outside-click) in <bee-atlas>"
    - ".region-control z-index:2 sibling of <bee-pane> in .content"
    - _applyBoundaryMode shared method (extracted from _onBoundaryModeChanged)
    - _selectBoundaryMode + _toggleRegionMenu + _onDocumentClick in bee-atlas
    - "Collapsed bee-pane laid out beside the regions button (top:0.5em, right:calc(1em + 8rem))"
    - "STACK-01 source-analysis regression block"
  affects:
    - src/bee-atlas.ts
    - src/bee-map.ts
    - src/tests/bee-atlas.test.ts
tech_stack:
  added: []
  patterns:
    - "Lift a trapped control out of a z-index:0 child into the state-owner as a sibling (don't delete the load-bearing stacking context)"
    - "Shared side-effect method (_applyBoundaryMode) called by both in-component menu and any future event path"
    - "Source-analysis regression tests (readFileSync + toMatch) — no DOM mount, no Mapbox mock"
key_files:
  created: []
  modified:
    - src/bee-atlas.ts
    - src/bee-map.ts
    - src/tests/bee-atlas.test.ts
key-decisions:
  - "SC-2: bee-map { z-index: 0 } RETAINED — the fix is the relocation, not a z-index deletion (Phase 108 attribution-bleed guard)"
  - "Region control becomes a pure presenter inside the state-owner <bee-atlas>; <bee-map> sheds UI it never needed to own (strengthens the pure-presenter invariant)"
  - "_onDocumentClick checks composedPath against the .region-control element (queried from renderRoot), not the whole host — clicks on map/pane close the menu"
  - "Part A (revised after UAT): a top-right .map-toolbar flex row (gap 0.5rem) holds the region control then the collapsed <bee-pane> filter button; the collapsed pane is a flex item via `.map-toolbar bee-pane { position: static }` (outranks its :host absolute). When expanded, the toolbar dissolves with `display: contents` so <bee-pane> positions against .content again (flush right). This replaced the first cut's hard-coded `right: calc(1em + 8rem)`, which leaked into the open list pane and inset it ~8rem (UAT feedback)."
  - "_onDocumentClick registered in firstUpdated / removed in disconnectedCallback (matches bee-atlas's existing global-listener pattern, same as bee-map did)"
requirements-completed: [SC-1, SC-2, SC-3, SC-4]
duration: "inline (subagent spawn 529-overloaded; orchestrator executed)"
completed: "2026-06-21"
---

# Phase 157 Plan 01: Relocate Region Control out of bee-map into bee-atlas

**Moved the region dropdown control (markup + CSS + `_regionMenuOpen` state + outside-click close) from `<bee-map>`'s z-index:0 shadow DOM into `<bee-atlas>`, where it is a sibling of `<bee-pane>` in `.content` and paints above it (`.region-control` z-index:2 > pane's 1 > map's 0). `bee-map { z-index: 0 }` is retained, the collapsed filter button now sits beside the regions button, and a STACK-01 regression block locks it in. 828 tests green, `tsc --noEmit` clean.**

## What changed

### src/bee-atlas.ts
- Added `.region-control` (z-index:2), `.region-btn`, `.region-menu` CSS rules (copied from bee-map, elevated above the pane).
- Added the region control markup as a `.content` child (sibling of `<bee-map>`/`<bee-pane>`): conditional `.region-menu` with four boundary buttons (Off/Counties/Ecoregions/Places, `.active` when matching `_boundaryMode`) + the `.region-btn` toggle with the dynamic label.
- Added `@state() private _regionMenuOpen`, `_toggleRegionMenu()`, `_selectBoundaryMode(mode)` (closes menu; early-returns if unchanged; else calls `_applyBoundaryMode`), and `_onDocumentClick` (outside-click close via `composedPath()` against `.region-control`).
- Extracted `_applyBoundaryMode(newMode)` from `_onBoundaryModeChanged` carrying the identical side effects (set `_boundaryMode`; leaving-'places' clears `selectedPlace`, resets `_tablePage`, re-runs `_runFilterQuery`/`_runTableQuery`, `_replaceUrlState`). Removed `_onBoundaryModeChanged` and the `@boundary-mode-changed` binding on `<bee-map>`.
- Registered/unregistered `_onDocumentClick` in `firstUpdated`/`disconnectedCallback`.
- Re-positioned the collapsed `bee-pane` rule: `top: 0.5em; right: calc(1em + 8rem)` (beside the regions button) — no longer `top: calc(0.5em + 2.5rem)`. The `.pane-list` / `.pane-table` / `@media (max-aspect-ratio: 1)` geometry rules are untouched.
- **RETAINED** `bee-map { position: relative; z-index: 0 }`.

### src/bee-map.ts
- Removed `.region-control`/`.region-btn`/`.region-menu` CSS, the region control markup + dynamic label, `_regionMenuOpen`, `_toggleRegionMenu`, `_selectBoundary`, the `boundary-mode-changed` emit, `_onDocumentClick`, and its add/remove listener wiring. Dropped the now-unused `state` decorator import.
- **KEPT** `boundaryMode` @property and all map-click boundary logic (`map-click-region`, `_handleRegionClick`, `_applyBoundaryMode` layer-visibility, ecoregion-fill click). Updated the stale geolocate top-left comment.

### src/tests/bee-atlas.test.ts
- Renamed the `_onBoundaryModeChanged` signature test to `_applyBoundaryMode` (coupled to the refactor).
- Added `describe('STACK-01: regions dropdown above pane (Phase 157)')` — 4 assertions: z-index:0 retained, `.region-control` z-index:2 (with bee-pane :host z-index:1 from bee-pane.ts), relocation (present in bee-atlas / absent in bee-map, bee-map keeps boundaryMode + map-click-region), collapsed offset removed.

## Must-haves verification

- ✅ SC-1/SC-3: region control (button + 4-option menu + `_regionMenuOpen` + outside-click) lives in `<bee-atlas>` as a `.content` sibling of `<bee-pane>`, z-index:2 > pane's 1.
- ✅ SC-2: `bee-map { z-index: 0 }` retained (`grep` confirms; STACK-01 asserts; tsc clean). Map-click boundary selection unchanged in `<bee-map>`.
- ✅ SC-4: collapsed filter button laid out beside (left of) the regions button; no `top: calc(0.5em + 2.5rem)`.
- ✅ Behavior preserved: selection routes through shared `_applyBoundaryMode` (leaving-'places' clears `selectedPlace` + re-runs queries; URL `ui.boundaryMode` synced).
- ✅ Architecture invariants: `<bee-atlas>` owns state; `<bee-map>`/`<bee-pane>` stay pure presenters; no module-level mutable state.
- ✅ `npm test` green (32 files, 828 tests) including the new STACK-01 block; `tsc --noEmit` exit 0.

## Notes / deviations

- **Execution path:** the subagent spawn returned `529 Overloaded` twice (0 work each). Per the workflow's documented fallback for small single-plan waves on large-context models, the orchestrator executed the plan inline. Commits remain atomic per task (8226b87c = relocation, 14f59066 = STACK-01).
- **Part A mechanism (post-UAT):** the first cut used a fixed `right: calc(1em + 8rem)` offset on the collapsed pane, but that leaked into the OPEN list pane (the `.pane-list` rule never reset `right`), insetting the open sidebar ~8rem. Reworked (commit 53c5ae77) into the research-suggested flex toolbar after all: a `.map-toolbar` flex row that holds both buttons when collapsed and dissolves via `display: contents` when the pane expands, so `<bee-pane>` positions against `.content` again. Verified in-browser (wide + narrow) — collapsed flex row flush right, open list flush right, region menu above the pane, table-mode attribution behind the pane (SC-2).

## Self-Check: PASSED
