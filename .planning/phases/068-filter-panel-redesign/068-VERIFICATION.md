---
phase: 068-filter-panel-redesign
verified: 2026-04-20T22:00:00Z
status: human_needed
score: 8/8 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Visual layout — filter button placement and panel behavior"
    expected: "Magnifying-glass button floats over map at top-right, to the LEFT of the Regions button; panel expands below on click; four section headers visible; filter input works; active state turns button green; panel collapses on second click"
    why_human: "Absolute positioning with calc(0.5em + 6rem) offset relative to Regions button cannot be verified by static code inspection; browser rendering required"
  - test: "Table view — CSV download location"
    expected: "In table view, no Download CSV control appears in the filter panel area; CSV button is only in the table view's own controls"
    why_human: "Conditional rendering based on _viewMode; requires switching between map and table views in a browser"
  - test: "Filter state propagation end-to-end"
    expected: "Selecting a suggestion in the filter panel's bee-filter-controls causes the occurrence count to reflect the filtered result and the map dots to update"
    why_human: "Requires the full app with loaded SQLite data; bubbles+composed event propagation through shadow DOM cannot be verified statically"
---

# Phase 068: Filter Panel Redesign Verification Report

**Phase Goal:** Replace the always-visible filter toolbar with a floating map overlay control (magnifying glass + count) that expands into a structured what/who/where/when filter panel
**Verified:** 2026-04-20T22:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `<bee-filter-toolbar>` is removed from bee-atlas.ts render() | VERIFIED | bee-atlas.ts has no `<bee-filter-toolbar` tag; import is `'./bee-filter-panel.ts'` not `'./bee-filter-toolbar.ts'` (line 8) |
| 2 | `<bee-filter-panel>` exists in bee-atlas.ts render() inside .content | VERIFIED | Lines 176-184 of bee-atlas.ts: `<bee-filter-panel>` with all five filter props + `@filter-changed` wired, placed inside `.content` div |
| 3 | bee-filter-panel.ts exports BeeFilterPanel with trigger button, count display, active state, toggle | VERIFIED | `@customElement('bee-filter-panel') export class BeeFilterPanel` at lines 8-9; `_togglePanel()` method; `class=${'filter-btn' + (active ? ' active' : '')}` at line 92; `${count}` displayed in trigger (line 103) |
| 4 | Four sections (What/Who/Where/When) exist in bee-filter-panel.ts | VERIFIED | Lines 107-133: four `.section-header` divs with SVG icons and labels What, Who, Where, When |
| 5 | localStorage is no longer referenced in bee-filter-controls.ts | VERIFIED | grep for `localStorage`, `RECENTS_KEY`, `saveRecentToken`, `getRecentSuggestions`, `RECENTS_MAX`, `loadRecentTokens` all return no matches |
| 6 | @filter-changed is wired from bee-filter-panel to bee-atlas._onFilterChanged | VERIFIED | bee-atlas.ts line 183: `@filter-changed=${this._onFilterChanged}` on `<bee-filter-panel>`; event propagates via `bubbles: true, composed: true` from bee-filter-controls (line 362 of bee-filter-controls.ts) |
| 7 | @csv-download is NOT on bee-filter-panel | VERIFIED | No `@csv-download` binding on `<bee-filter-panel>` in bee-atlas.ts; `@download-csv=${this._onDownloadCsv}` remains only on `<bee-table>` (line 172) |
| 8 | bee-filter-controls is embedded in bee-filter-panel | VERIFIED | bee-filter-panel.ts lines 134-141: `<bee-filter-controls>` rendered inside `.filter-panel` div with all five props passed through |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/bee-filter-panel.ts` | Floating overlay filter panel component | VERIFIED | 148 lines, complete Lit component with BeeFilterPanel class, trigger button, panel, four section headers, bee-filter-controls embedded |
| `frontend/src/bee-filter-controls.ts` | Filter input component without localStorage recents | VERIFIED | No localStorage references; `getSuggestions` intact; `_onFocus` is a no-op; `_onInput` returns empty suggestions on empty input |
| `frontend/src/bee-atlas.ts` | Coordinator wiring bee-filter-panel | VERIFIED | Imports `./bee-filter-panel.ts`; renders `<bee-filter-panel>` inside `.content`; CSS rule `bee-filter-panel { right: calc(0.5em + 6rem); }` at lines 102-104 |
| `frontend/src/tests/bee-filter-toolbar.test.ts` | Updated tests covering bee-filter-panel | VERIFIED | All tests now cover BeeFilterPanel property interface, source structure, localStorage removal, and bee-atlas integration |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| bee-filter-panel.ts | bee-filter-controls | `<bee-filter-controls>` in render() | WIRED | Lines 134-141 of bee-filter-panel.ts; all five props passed |
| bee-filter-panel.ts | filter.ts isFilterActive | import and call in render | WIRED | Line 3: `import { isFilterActive }` ; line 87: `const active = isFilterActive(this.filterState)` |
| bee-atlas.ts render() | bee-filter-panel | `<bee-filter-panel>` inside .content | WIRED | Lines 176-184 of bee-atlas.ts |
| bee-atlas.ts | _onFilterChanged | `@filter-changed=${this._onFilterChanged}` | WIRED | Line 183 of bee-atlas.ts |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| bee-filter-panel.ts trigger button | `summary.totalSpecimens` | `this.summary` prop from bee-atlas | Populated from SQLite query in bee-atlas `_loadSummaryFromSQLite()` and `_onDataLoaded` event | FLOWING |
| bee-filter-panel.ts active state | `isFilterActive(this.filterState)` | `this.filterState` prop from bee-atlas | Real `_filterState` reactive state in bee-atlas | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — requires running browser + SQLite WASM; no runnable entry points testable without a server.

### Requirements Coverage

No formal REQ IDs assigned to this phase — UI flow redesign. Phase goal verified directly against success criteria.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `frontend/src/bee-filter-controls.ts` line 20 | `CollectorToken` interface uses field name `observer` but `CollectorEntry` in filter.ts uses `host_inat_login` | Info (pre-existing, CR-01) | The mismatch is confined to bee-filter-controls.ts internal token type and its mapping to CollectorEntry. In `tokensToFilterState` (line 58), `observer: t.observer` is pushed as a CollectorEntry, but CollectorEntry has `host_inat_login` not `observer`. This is a **pre-existing issue from Phase 67** noted in the SUMMARY files as an incomplete rename. It is out of scope for Phase 68's goal. |
| `frontend/src/bee-atlas.ts` line 386 | `satisfies CollectorEntry` with `observer` field on object that has `host_inat_login` field in CollectorEntry | Info (pre-existing, CR-01) | Same rename mismatch as above — `observer` column from DB is stored as `observer` in the options objects but CollectorEntry expects `host_inat_login`. Pre-existing from Phase 67. |

No blockers from anti-pattern scan. The pre-existing CR-01 mismatch means collector filtering by iNat username may silently fail to match, but this is not introduced by or in scope for Phase 68.

### Human Verification Required

#### 1. Visual Layout — Filter Button Placement

**Test:** Run `cd frontend && npm run dev`, open http://localhost:5173
**Expected:** The white toolbar bar above the map is completely gone. A small button with a magnifying-glass icon and a number floats in the top-right of the map area, visually to the LEFT of the "Regions" button. Clicking it expands a panel showing "What", "Who", "Where", "When" section labels and the filter input below them.
**Why human:** The `right: calc(0.5em + 6rem)` CSS clearance calculation depends on actual rendered button widths; layout cannot be verified statically.

#### 2. Filter Active State

**Test:** In the expanded panel, type "Bombus" and select a suggestion. Observe the trigger button.
**Expected:** The trigger button turns green (background: var(--accent, #2c7a2c)) indicating active filter state. The count remains visible in the button. Clicking the button again collapses the panel.
**Why human:** Dynamic CSS class application (`filter-btn active`) and visual rendering require a browser.

#### 3. Table View — CSV Download Location

**Test:** Switch to table view using the header toggle.
**Expected:** The filter panel button still appears over the content area. The Download CSV control appears only in the table's own controls area, NOT on the filter panel button. No `@csv-download` binding exists on bee-filter-panel (verified in code).
**Why human:** Conditional rendering based on `_viewMode` requires switching views to confirm visual correctness.

### Gaps Summary

No gaps found. All 8 must-haves verified against actual codebase. The three human verification items cover visual rendering and interactive behavior that cannot be confirmed statically.

**Note on CR-01 (pre-existing, out of scope):** `bee-filter-controls.ts` uses `observer` as the iNat username field name in its internal `CollectorToken` type, while `filter.ts` `CollectorEntry` uses `host_inat_login`. This mismatch predates Phase 68 (Phase 67 renamed the field in filter.ts but not in bee-filter-controls.ts). The field passes through as `observer` in CollectorEntry objects, which TypeScript may accept due to structural typing or flag as a type error. This does not affect Phase 68's goal (filter panel UI redesign) but should be addressed in a follow-up phase.

---

_Verified: 2026-04-20T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
