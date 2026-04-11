---
phase: 39-view-mode-toggle
verified: 2026-04-07T19:30:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open http://localhost:5173 in a browser, confirm the Map/Table toggle row is visible in the sidebar below the Specimens/Samples row"
    expected: "Two buttons labelled 'Map' and 'Table' are visible, 'Map' is active (accent underline/color)"
    why_human: "Visual rendering of Lit shadow DOM cannot be verified from the file system"
  - test: "Click the 'Table' button — confirm the map disappears and a blank area fills its place, and the URL bar gains view=table"
    expected: "OpenLayers map is gone from the DOM, a blank surface-colored div fills the content area, URL shows view=table"
    why_human: "DOM mutation and URL update require a live browser session"
  - test: "Click the 'Map' button — confirm map reappears and view=table is removed from the URL"
    expected: "OpenLayers map renders, URL no longer contains view=table"
    why_human: "Live browser session required"
  - test: "In table view, copy the URL, open a new tab, paste the URL — confirm the page opens directly in table view"
    expected: "Sidebar shows 'Table' as the active toggle, map area is blank on initial render"
    why_human: "Multi-tab browser navigation cannot be automated from the file system"
  - test: "From table view, press browser Back — confirm view returns to map view"
    expected: "Map reappears, 'Map' toggle is active"
    why_human: "Browser history API behaviour requires a live session"
---

# Phase 39: View Mode Toggle Verification Report

**Phase Goal:** Users can switch between map view and table view, with the choice bookmarkable in the URL
**Verified:** 2026-04-07T19:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

All code-verifiable must-haves are satisfied. Five items require human testing in a live browser.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can click a toggle control in the main UI to switch from map view to table view and back | VERIFIED | `_renderViewToggle()` in `bee-sidebar.ts` renders two buttons; `_onToggleView` dispatches `view-changed` event with no-op guard; `bee-atlas.ts` listens `@view-changed=${this._onViewChanged}` and sets `_viewMode` |
| 2 | In table view, the map is not visible and the table area occupies the full content space | VERIFIED | `bee-atlas.ts` line 122: `this._viewMode === 'map'` ternary — `<bee-map>` is absent from DOM when table; `<div class="table-slot"></div>` with `.table-slot { flex-grow: 1 }` fills the space (content is blank by design; Phase 40 will wire bee-table into this slot) |
| 3 | Navigating to a URL with view=table param opens directly in table view | VERIFIED | `firstUpdated` calls `parseParams(window.location.search)`, extracts `initViewMode = initialParams.ui?.viewMode ?? 'map'`, assigns `this._viewMode = initViewMode` |
| 4 | Copying a table-view URL and pasting in a new tab restores the table view | VERIFIED | `buildParams` emits `view=table` when `ui.viewMode !== 'map'` (line 49 of `url-state.ts`); `parseParams('view=table')` returns `result.ui.viewMode === 'table'` — confirmed by test at line 211 of `url-state.test.ts` |

**Score:** 4/4 truths verified (code analysis)

### Deferred Items

None — all phase-39 scope items are implemented. The empty `table-slot` div is intentionally deferred to Phase 40 (bee-table component), which will wire actual table content into the slot. This does not affect VIEW-02 compliance — the div exists, fills the layout space, and map is absent from DOM.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/url-state.ts` | UiState.viewMode field; buildParams default-omit; parseParams ternary whitelist | VERIFIED | `viewMode: 'map' \| 'table'` in `UiState` (line 16); `if (ui.viewMode !== 'map') params.set('view', ui.viewMode)` (line 49); `viewRaw === 'table' ? 'table' : 'map'` (line 131); condition at line 133 includes `\|\| viewMode !== 'map'` |
| `frontend/src/tests/url-state.test.ts` | 4 viewMode tests: round-trip, default-omit, invalid param, table-only URL | VERIFIED | Tests at lines 100-111 (viewMode=table round-trip, viewMode=map default-omit) and lines 205-215 (invalid view=grid, view=table table-only URL); combined round-trip at line 141 includes `viewMode: 'table'` |
| `frontend/src/bee-sidebar.ts` | viewMode @property, _renderViewToggle, _onToggleView, view-changed event | VERIFIED | `@property viewMode: 'map' \| 'table'` (line 88); `_renderViewToggle()` (line 229); `_onToggleView()` (line 244) with no-op guard; `view-changed` CustomEvent (line 246) |
| `frontend/src/tests/bee-sidebar.test.ts` | VIEW-01 describe block with 4 structural tests | VERIFIED | Lines 245-266: 4 tests checking `view-changed` string, `viewMode` property, absence of `@state _viewMode`, and `elementProperties.has('viewMode')` |
| `frontend/src/bee-atlas.ts` | _viewMode @state, _onViewChanged, conditional render, URL push, popstate restore | VERIFIED | `@state() private _viewMode` (line 32); conditional at line 122; `.viewMode=${this._viewMode}` (line 154); `@view-changed=${this._onViewChanged}` (line 165); `_onViewChanged` (line 466); both `buildParams` calls include `viewMode` (lines 228, 275); `_onPopState` restore (line 314); `firstUpdated` restore (lines 185-188) |
| `frontend/src/tests/bee-atlas.test.ts` | VIEW-02 describe block with 6 structural tests | VERIFIED | Lines 110-136: 6 tests for table-slot div, CSS rule, @state _viewMode, view-changed listener, viewMode binding, _onPopState restore |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `UiState.viewMode` | `buildParams ui argument` | TypeScript type enforcement | VERIFIED | `UiState` requires `viewMode`; both call sites in `bee-atlas.ts` (lines 228, 275) pass it |
| `parseParams view param` | `result.ui.viewMode` | ternary default | VERIFIED | `viewRaw === 'table' ? 'table' : 'map'` at `url-state.ts` line 131 |
| `bee-sidebar toggle button click` | `view-changed CustomEvent` | `_onToggleView` dispatch | VERIFIED | `bee-sidebar.ts` lines 244-251; guard `if (mode === this.viewMode) return` prevents no-op events |
| `bee-atlas viewMode property` | `bee-sidebar viewMode @property` | `.viewMode=${this._viewMode}` Lit binding | VERIFIED | `bee-atlas.ts` line 154 |
| `bee-sidebar view-changed event` | `bee-atlas _onViewChanged handler` | `@view-changed=${this._onViewChanged}` | VERIFIED | `bee-atlas.ts` line 165 |
| `bee-atlas _viewMode state` | `conditional bee-map render` | ternary in render() | VERIFIED | `bee-atlas.ts` lines 122-147: `_viewMode === 'map'` ? bee-map : table-slot |
| `bee-atlas _pushUrlState` | `buildParams ui argument` | `viewMode: this._viewMode` in ui object | VERIFIED | `bee-atlas.ts` line 275 |
| `bee-atlas _onPopState` | `_viewMode restore` | `parsed.ui?.viewMode ?? 'map'` | VERIFIED | `bee-atlas.ts` line 314 |
| `bee-atlas firstUpdated` | `_viewMode restore from URL` | `initialParams.ui?.viewMode ?? 'map'` | VERIFIED | `bee-atlas.ts` lines 185-188 |

### Data-Flow Trace (Level 4)

View mode is layout state, not data rendering — no DB query or external data source is involved. The flow is: URL param → `parseParams` → `_viewMode` state → conditional template. This is fully synchronous and entirely verified at Levels 1-3.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| URL round-trip: view=table parses to viewMode table | Vitest (url-state.test.ts line 211) | 77/77 tests pass | PASS |
| URL round-trip: viewMode=map omits view param | Vitest (url-state.test.ts line 108) | 77/77 tests pass | PASS |
| bee-sidebar has viewMode in elementProperties | Vitest (bee-sidebar.test.ts line 261) | 77/77 tests pass | PASS |
| bee-atlas conditional render has table-slot | Vitest (bee-atlas.test.ts line 113) | 77/77 tests pass | PASS |
| TypeScript compiles without errors | `npx tsc --noEmit` | No output (success) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| VIEW-01 | 39-02 | User can toggle between map view and table view via a control in the main UI | SATISFIED | `bee-sidebar.ts` has `_renderViewToggle()` rendering Map/Table buttons; `_onToggleView` emits `view-changed`; `bee-atlas.ts` handles the event and sets `_viewMode` |
| VIEW-02 | 39-03 | In table view, the map is not rendered, giving the table full layout space | SATISFIED | `bee-atlas.ts` conditional template: `_viewMode === 'map'` renders `<bee-map>`, else renders `<div class="table-slot">` with `flex-grow: 1`. `<bee-map>` is absent from the DOM in table view (not just hidden) |
| VIEW-03 | 39-01, 39-03 | View mode is encoded in the URL so the table view is bookmarkable and shareable | SATISFIED | `buildParams` emits `view=table` when non-default; `parseParams` restores it; `firstUpdated` and `_onPopState` in `bee-atlas.ts` restore `_viewMode` from URL |

All three requirements explicitly assigned to Phase 39 are satisfied. No orphaned requirements found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `frontend/src/bee-atlas.ts` | 146 | `<div class="table-slot"></div>` — empty div | Info | Intentional: this is the insertion point for the Phase 40 bee-table component. VIEW-02 is satisfied (map absent, slot fills layout space). Not a blocker. |

No TODO/FIXME markers, no hardcoded empty state arrays that feed rendering, no placeholder text. The empty table-slot div is structural scaffolding with explicit Phase 40 scope.

### Human Verification Required

The following items require a live browser session to confirm. All code-level checks pass; these test the visual and interactive layer.

#### 1. Toggle Control Visibility

**Test:** Start `npm run dev` in `/Users/rainhead/dev/beeatlas/frontend`, open http://localhost:5173. Look for a two-button row ("Map" / "Table") in the sidebar below the Specimens/Samples toggle.
**Expected:** The toggle row is visible. "Map" button shows the active style (accent color, bottom border).
**Why human:** Shadow DOM visual rendering cannot be verified from file inspection.

#### 2. Map-to-Table Switch

**Test:** Click the "Table" button in the sidebar.
**Expected:** The OpenLayers map disappears. A blank surface-colored area fills the content space. The URL bar gains `view=table`. The "Table" button becomes active.
**Why human:** DOM mutation visibility and URL bar state require a live browser.

#### 3. Table-to-Map Switch

**Test:** Click the "Map" button in the sidebar.
**Expected:** The OpenLayers map reappears. The URL no longer contains `view=table`. The "Map" button becomes active.
**Why human:** Live browser session required to observe DOM remount.

#### 4. URL Bookmarkability (New Tab)

**Test:** While in table view (URL contains `view=table`), copy the URL, open a new browser tab, paste and navigate.
**Expected:** The new tab opens directly in table view — "Table" is the active toggle, map area is blank.
**Why human:** Multi-tab browser navigation requires a live session.

#### 5. Browser Back/Forward

**Test:** Click "Table", then press the browser Back button.
**Expected:** View returns to map view. "Map" toggle is active. URL loses `view=table`.
**Why human:** `popstate` event firing and history state restoration require a running browser.

### Gaps Summary

No gaps found. All code-verifiable requirements are met. The phase is awaiting human confirmation of the visual/interactive layer.

---

_Verified: 2026-04-07T19:30:00Z_
_Verifier: Claude (gsd-verifier)_
