---
phase: 069-table-drawer
verified: 2026-04-20T18:10:00Z
human_verified: 2026-04-28T00:00:00Z
status: verified
score: 6/6 must-haves verified
overrides_applied: 0
gaps: []
human_verification_results:
  - test: "Visual check — map strip visible above drawer in table mode"
    result: pass
    confirmed: 2026-04-28
  - test: "Row click pans map strip in browser"
    result: pass
    confirmed: 2026-04-28
---

# Phase 069: Table Drawer Verification Report

**Phase Goal:** Table slides up over map rather than replacing it; spatial context preserved
**Verified:** 2026-04-20T18:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | bee-map is always in the DOM when content area is rendered; never conditionally removed | VERIFIED | `render()` at lines 150–167 of bee-atlas.ts renders `<bee-map>` unconditionally inside `.content`. No viewMode ternary wraps it. |
| 2 | bee-table appears as absolute overlay covering 82% height from bottom when `_viewMode === 'table'` | VERIFIED | CSS: `bee-table { position: absolute; bottom: 0; left: 0; right: 0; height: 82%; z-index: 2; }` (lines 90–97). Conditional render via `${this._viewMode === 'table' ? html\`<bee-table...\` : nothing}` (lines 168–178). |
| 3 | bee-filter-panel and bee-sidebar are not rendered when `_viewMode === 'table'` | VERIFIED | Both are wrapped in `${this._viewMode === 'map' ? html\`...\` : nothing}` (lines 179–193). `nothing` sentinel removes them from the DOM, not just hides them. |
| 4 | Switching to table mode sets `_sidebarOpen` to false | VERIFIED | `_onViewChanged` contains `this._sidebarOpen = false; // D-08` inside the `if (this._viewMode === 'table')` block (line 637). |
| 5 | Clicking a table row pans the map strip to center on that occurrence's lat/lon | VERIFIED | `_onRowClick` in bee-table.ts dispatches `row-pan` event with `{lat, lon}`. bee-atlas.ts handles via `@row-pan=${this._onRowPan}` (line 177). `_onRowPan` sets `this._viewState = { lat, lon, zoom: this._currentView.zoom }` (line 643), which flows to `bee-map.viewState` → `bee-map.updated()` → OL `setCenter/setZoom` (bee-map.ts lines 280–282). |
| 6 | Rows without lat/lon are silently skipped (no error, no event dispatched) | VERIFIED | `_onRowClick` guards: `if (lat === null \|\| lon === null) return;` (bee-table.ts line 190). Tests TABLE-09 cover null-lat and null-lon cases separately; both pass. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/bee-table.ts` | `_onRowClick` handler + `row-pan` event dispatch | VERIFIED | `_onRowClick` at line 187; `dispatchEvent(new CustomEvent('row-pan', {..., bubbles: true, composed: true}))` at lines 191–195; `@click=${() => this._onRowClick(row...)} style="cursor: pointer"` at line 261. |
| `frontend/src/bee-atlas.ts` | Drawer layout, view-mode gating, `_onRowPan` handler | VERIFIED | CSS at lines 90–97 (absolute overlay); render() restructured at lines 148–196; `_onRowPan` at lines 642–644; `_onViewChanged` closes sidebar at line 637. |
| `frontend/src/tests/bee-table.test.ts` | Tests for row-pan event, null guards, pointer cursor | VERIFIED | `describe('TABLE-09: bee-table row-pan event on row click', ...)` at lines 227–290: 4 tests covering valid dispatch, null-lat, null-lon, and cursor style. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `bee-table.ts _onRowClick` | `bee-atlas.ts _onRowPan` | `row-pan` CustomEvent, `bubbles: true, composed: true` | WIRED | `@row-pan=${this._onRowPan}` on `<bee-table>` at bee-atlas.ts line 177; event dispatched with `composed: true` traverses shadow DOM boundary. |
| `bee-atlas.ts _onRowPan` | `bee-map.ts` OL map | `this._viewState` → `.viewState` property → `updated()` → `setCenter/setZoom` | WIRED | `_onRowPan` assigns `this._viewState` (line 643); `bee-map.ts` lines 280–282 detect `viewState` change and call `setCenter/setZoom`. |
| `bee-atlas.ts render()` | `<bee-map>` element | Always rendered inside `.content`, no viewMode guard | WIRED | Confirmed by code inspection: `<bee-map>` is the first element inside `.content`, never inside a conditional. |
| `bee-atlas.ts render()` | `<bee-filter-panel>` and `<bee-sidebar>` | `_viewMode === 'map'` guard → `nothing` removes them | WIRED | Lines 179–193: both elements wrapped in `${this._viewMode === 'map' ? html\`...\` : nothing}`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `bee-table.ts` rows render | `this.rows` | Set by bee-atlas via `.rows=${this._tableRows}` property | Yes — `_tableRows` populated by `queryTablePage()` (SQLite query in filter.ts) | FLOWING |
| `bee-map.ts` (map center) | `this.viewState` | Set by bee-atlas via `.viewState=${this._viewState}` property → `_onRowPan` sets from `e.detail.lat/lon` | Yes — lat/lon sourced from SQLite occurrence rows passed through row-pan event | FLOWING |

### Behavioral Spot-Checks

Tests run against committed HEAD (phase 069 commits: `504acc7`, `1b6fe82`, `692dd9f`, `0f2bb53`):

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All 163 tests pass (committed state) | `git stash && npm test --run` | 163 passed, 0 failed | PASS |
| row-pan dispatched with {lat, lon} | TABLE-09 test "clicking a row with lat/lon dispatches row-pan" | Passes | PASS |
| null lat silently skipped | TABLE-09 test "clicking a row with lat=null does not dispatch row-pan" | Passes | PASS |
| null lon silently skipped | TABLE-09 test "clicking a row with lon=null does not dispatch row-pan" | Passes | PASS |
| pointer cursor on tr | TABLE-09 test "tr elements have cursor: pointer style" | Passes | PASS |

**Note on working-tree test failure:** The working tree has uncommitted modifications to `frontend/src/bee-filter-panel.ts`, `frontend/src/bee-atlas.ts`, and `frontend/src/bee-map.ts` (visible from `git status`). Running tests in the working tree shows 1 failure (`FILTER-PANEL: bee-filter-panel source structure > bee-filter-panel.ts source contains bee-filter-controls sub-component tag`) because the uncommitted `bee-filter-panel.ts` removes the `bee-filter-controls` import. This failure is unrelated to phase 069 (which only modifies `bee-table.ts` and `bee-atlas.ts`). Against the committed HEAD, all 163 tests pass.

### Requirements Coverage

No formal REQ IDs assigned to this phase (UI flow redesign). All success criteria tracked directly as observable truths above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `bee-atlas.ts` | 637 | `this._sidebarOpen = false` — sidebar state set but sidebar was already not rendered in table mode due to viewMode gate | Info | Not a stub; this is defensive state management. The `_sidebarOpen = false` ensures that if the user switches back to map mode, the sidebar is not unexpectedly open. Correct behavior. |

No stubs, placeholders, or hollow implementations found. All event handlers produce real behavior.

### Human Verification Required

1. **Visual check — map strip visible above drawer**

   **Test:** Switch to table mode in the browser and inspect the layout.
   **Expected:** The map is visible as a strip above the bee-table overlay; approximately 18% of the content area height shows map tiles. The table covers the bottom 82%.
   **Why human:** CSS `height: 82%` on bee-table and `flex-grow: 1` on bee-map produce the layout, but actual pixel-accurate rendering and visual proportions require a real browser.

2. **Row click pans map strip in browser**

   **Test:** In table mode, click a row that has lat/lon coordinates (e.g., any row showing a county and ecoregion).
   **Expected:** The visible map strip re-centers on that occurrence's geographic location. No sidebar opens.
   **Why human:** The `_viewState` → `bee-map.viewState` → OL `setCenter/setZoom` path is verified by code inspection, but actual OpenLayers rendering requires a real browser with the map initialized.

### Gaps Summary

No gaps found. All 6 observable truths verified by code inspection and automated tests.

The phase goal — "table slides up over map rather than replacing it; spatial context preserved" — is fully achieved in the committed code:
- bee-map is never removed from the DOM
- bee-table renders as a `position: absolute` overlay covering 82% height
- Filter panel and sidebar are removed from DOM in table mode
- Sidebar is closed when entering table mode
- Row clicks pan the map via the `row-pan` → `_onRowPan` → `_viewState` chain
- Null lat/lon rows are silently skipped

---

_Verified: 2026-04-20T18:10:00Z_
_Verifier: Claude (gsd-verifier)_
