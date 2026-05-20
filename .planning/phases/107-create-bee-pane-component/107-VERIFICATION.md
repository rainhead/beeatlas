---
phase: 107-create-bee-pane-component
verified: 2026-05-19T21:30:00Z
status: human_needed
score: 10/10
overrides_applied: 0
human_verification:
  - test: "Open the app in a browser (npm run dev) and navigate to the map view. Verify the toggle button is visible at all times regardless of pane state."
    expected: "A toggle button is always visible at the pane edge; it does not disappear when the pane is collapsed, in list state, or in table state."
    why_human: "UI rendering and visual layout cannot be verified programmatically from source code alone."
  - test: "With the pane in collapsed state, click the toggle button. Then click it again to collapse."
    expected: "Clicking the toggle from collapsed expands to list state; clicking it again collapses the pane."
    why_human: "Event dispatch and pane state transitions require browser DOM interaction to verify end-to-end."
  - test: "With the pane in list state on a desktop viewport (aspect ratio > 1), verify the expand button is visible. Click it."
    expected: "Expand button (⊞) is visible in list state. Clicking it transitions the pane to table state."
    why_human: "CSS visibility and click-to-state-transition require browser UAT."
  - test: "In table state, click the shrink button in the header."
    expected: "Pane returns to list state. The table disappears; the filter rows and occurrence detail area appear."
    why_human: "State transition and DOM re-render require browser verification."
  - test: "In list state on a mobile viewport (aspect ratio <= 1), verify the expand button is hidden."
    expected: "The expand button (⊞) is not visible. The toggle button remains visible."
    why_human: "@media (max-aspect-ratio: 1) visibility is a browser-rendered CSS rule; cannot be verified from source alone."
  - test: "In list state, interact with the filter controls (taxon search, collector multi-select, county/ecoregion/place where-input, elevation inputs, year buckets). Verify each control responds and the map/table updates."
    expected: "All four filter rows (What/Who/Where/When) are functional and emit filter-changed events that update the map view identically to the old bee-filter-panel behavior."
    why_human: "Filter interaction behavior and filter-changed event wiring to bee-atlas requires end-to-end browser verification."
  - test: "Click a cluster on the map. Verify the occurrence detail section appears in the list state pane."
    expected: "When a cluster is selected (occurrences is non-null), bee-occurrence-detail renders below the filter rows. When no cluster is selected, a hint 'Click a point on the map to see details.' is shown."
    why_human: "Occurrence detail conditional rendering requires live map interaction to produce a non-null occurrences prop."
  - test: "In table state, verify DuckDB-backed pagination, column sorting, CSV export, and filter state integration all work."
    expected: "The bee-table in table state has full functionality identical to before; bee-table events bubble naturally to bee-atlas without interception by bee-pane."
    why_human: "Table interaction, DuckDB SQL execution, and event bubbling require browser UAT."
---

# Phase 107: Create bee-pane Component — Verification Report

**Phase Goal:** Users can access all filter controls, occurrence detail, and table view through a single unified pane component
**Verified:** 2026-05-19T21:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | bee-pane.ts file exists and defines a Lit custom element registered as 'bee-pane' | VERIFIED | `src/bee-pane.ts` exists, 1004 lines; `@customElement('bee-pane')` on line 50 |
| 2 | bee-pane exposes paneState as @property accepting 'collapsed' \| 'list' \| 'table' | VERIFIED | Line 53: `@property({ attribute: false }) paneState: 'collapsed' \| 'list' \| 'table' = 'collapsed'` |
| 3 | Toggle button (.toggle-btn) rendered outside all paneState conditional branches (PANE-01) | VERIFIED | render() at line 987-1000 shows `class="toggle-btn"` in outer pane-chrome div before any `paneState === 'list'` check |
| 4 | Clicking toggle dispatches pane-expand-list when collapsed, pane-collapse otherwise (PANE-02) | VERIFIED | Lines 478-484: `_onToggle` dispatches `pane-expand-list` when `paneState === 'collapsed'`, `pane-collapse` otherwise |
| 5 | Expand button (.expand-btn) rendered in list state and dispatches pane-expand-table (PANE-03) | VERIFIED | Line 993-995: expand-btn in `paneState === 'list'` conditional; `_onExpand` dispatches `pane-expand-table` at line 487 |
| 6 | Shrink button (.shrink-btn) rendered in table state and dispatches pane-shrink-list (PANE-04) | VERIFIED | `_renderTableContent` at line 973 renders `.shrink-btn`; `_onShrink` dispatches `pane-shrink-list` at line 491 |
| 7 | CSS @media (max-aspect-ratio: 1) hides .expand-btn on mobile (PANE-06) | VERIFIED | Lines 194-198: `@media (max-aspect-ratio: 1) { .expand-btn { display: none; } }` |
| 8 | bee-table embedded in table state with property bindings only — no event listeners that would intercept bubbling (TABLE-01) | VERIFIED | `_renderTableContent` lines 975-983: `.rows=`, `.rowCount=`, `.page=`, `.loading=`, `.sortBy=`, `.filterActive=`, `.selectedIds=` — no `@page-changed`, `@sort-changed`, `@row-pan`, `@download-csv`, `@toggle-filter` |
| 9 | No runtime imports of bee-atlas.ts / bee-filter-panel.ts / bee-sidebar.ts (sibling isolation) | VERIFIED | Only `import type { ... } from './bee-sidebar.ts'` (type-only); no runtime imports of bee-atlas or bee-filter-panel |
| 10 | In list state, bee-pane renders all four filter section rows (PANE-05) and bee-occurrence-detail conditional | VERIFIED | `_renderListContent` (lines 951-968) calls `_renderWhat/Who/Where/When`; `bee-occurrence-detail` at line 964 guarded by `occurrences !== null` |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/bee-pane.ts` | BeePane LitElement with three-state chrome, navigation events, table embedding | VERIFIED | 1004 lines; `@customElement('bee-pane')`, all navigation event methods, `_renderWhat/Who/Where/When`, `_emitFilter`, `_ensurePlaceNamesLoaded` present |
| `src/tests/bee-pane.test.ts` | Source-scan tests for PANE-01..04, PANE-06, TABLE-01, PANE-05 | VERIFIED | Contains all 7 describe blocks: PANE-01..04, PANE-06, TABLE-01, sibling isolation, PANE-05; 35 tests total |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/bee-pane.ts` | `src/bee-table.ts` | `import './bee-table.ts'` | VERIFIED | Line 8: `import './bee-table.ts'` |
| `src/tests/bee-pane.test.ts` | `src/bee-pane.ts` | `readFileSync` source scan | VERIFIED | Line 23: `readFileSync(resolve(__dirname, '../bee-pane.ts'), 'utf-8')` |
| `src/bee-pane.ts` | `src/bee-occurrence-detail.ts` | `import './bee-occurrence-detail.ts'` and `<bee-occurrence-detail>` in list render | VERIFIED | Line 7: import; Line 964: `<bee-occurrence-detail .occurrences=${this.occurrences}>` |
| `src/bee-pane.ts` | `src/filter.ts` | FilterChangedEvent dispatch in `_emitFilter` | VERIFIED | Line 460: `new CustomEvent<FilterChangedEvent>('filter-changed', ...)` |
| `src/bee-pane.ts` | `src/manifest.ts` | `resolveDataUrl('places_meta')` inside `_ensurePlaceNamesLoaded` | VERIFIED | Line 710: `const url = await resolveDataUrl('places_meta')` |

### Data-Flow Trace (Level 4)

This phase creates a new component not yet wired into bee-atlas (Phase 108 cutover). The component is a presenter that receives all data as `@property` bindings. No API calls or data sources in bee-pane itself beyond `_ensurePlaceNamesLoaded` (uses existing `resolveDataUrl` already proven in bee-filter-panel). Level 4 data-flow trace is not applicable until Phase 108 wires bee-pane into bee-atlas.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite (484 tests) | `npm test -- --run` | 484/484 pass, 22 test files | PASS |
| TypeScript type check | `npx tsc --noEmit` | exit 0, no output | PASS |
| bee-pane.test.ts specifically | included in above | all PANE-01..06, TABLE-01, sibling isolation tests pass | PASS |

### Probe Execution

No probes declared for this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| PANE-01 | 107-01 | Persistent toggle button always visible | VERIFIED | Source-scan tests pass; toggle-btn in render() outer div |
| PANE-02 | 107-01 | Toggle dispatches pane-expand-list / pane-collapse | VERIFIED | `_onToggle` method; CustomEvent dispatch; tests pass |
| PANE-03 | 107-01 | Expand button in list state dispatches pane-expand-table | VERIFIED | expand-btn in list conditional; `_onExpand` method |
| PANE-04 | 107-01 | Shrink button in table state dispatches pane-shrink-list | VERIFIED | shrink-btn in `_renderTableContent`; `_onShrink` method |
| PANE-05 | 107-02 | List state shows all filter controls and occurrence detail | VERIFIED | `_renderWhat/Who/Where/When` in `_renderListContent`; bee-occurrence-detail conditional |
| PANE-06 | 107-01 | Expand button hidden on mobile (max-aspect-ratio: 1) | VERIFIED | CSS media query at lines 194-198 |
| TABLE-01 | 107-01 | bee-table embedded without event interception | VERIFIED | Property-only bindings in `_renderTableContent`; source-scan tests confirm absence of event listeners |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/bee-pane.ts` | 189 | `.list-placeholder` CSS class still defined | Info | Orphaned CSS rule — the `.list-placeholder` div is no longer rendered in any template (Plan 02 replaced `_renderListContent` stub), but the CSS rule remains. Not a stub; just dead CSS. |

No TBD, FIXME, or XXX markers found. No runtime stub implementations found.

### Sibling File Integrity

Verified via `git log --oneline 40d4df3..HEAD -- src/bee-atlas.ts src/bee-filter-panel.ts src/bee-sidebar.ts`: no commits modified any of these three files during Phase 107. All three are unchanged.

### Human Verification Required

Phase 107 has `UI hint: yes` in ROADMAP.md. The component is feature-complete and all automated checks pass, but the following require browser UAT (deferred to Phase 108 UAT when bee-pane is wired into bee-atlas):

#### 1. Toggle Button Visual Persistence

**Test:** Open the app in a browser (`npm run dev`) and cycle through all three pane states via the toggle and expand/shrink buttons.
**Expected:** The toggle button (⟩/⟨) is always visible at the pane edge in all three states.
**Why human:** Visual rendering and CSS layout cannot be verified from source code.

#### 2. Collapse / Expand Round-Trip

**Test:** Click the toggle to expand from collapsed to list; click again to collapse.
**Expected:** Pane transitions collapsed → list → collapsed; toggle button label updates correctly.
**Why human:** Event dispatch and DOM state transitions require browser interaction.

#### 3. List → Table → List Transitions

**Test:** In list state (desktop), click expand (⊞); in table state, click shrink (⊟).
**Expected:** Transitions work; expand button only visible in list state on desktop.
**Why human:** State transitions and conditional DOM rendering require browser UAT.

#### 4. Mobile Expand Button Hidden

**Test:** Load app in a mobile-sized viewport (portrait orientation, aspect ratio < 1).
**Expected:** The expand button (⊞) is not rendered/visible; only toggle button present.
**Why human:** CSS `@media (max-aspect-ratio: 1)` is a browser-rendered rule; viewport testing required.

#### 5. Filter Controls Functional in List State

**Test:** In list state, type in the taxon search field, select a taxon, add a collector, select a county, set elevation range, toggle year buckets.
**Expected:** Each filter control responds identically to the old bee-filter-panel; filter-changed events update the map.
**Why human:** Interactive UI behavior and event wiring to bee-atlas (Phase 108) cannot be verified pre-cutover.

#### 6. Occurrence Detail Conditional Rendering

**Test:** Click a data cluster on the map while pane is in list state.
**Expected:** `bee-occurrence-detail` renders below filter rows with occurrence data; hint text disappears.
**Why human:** Requires live map interaction to set occurrences prop to non-null.

#### 7. Table State Full Functionality

**Test:** Enter table state; page through results, sort columns, export CSV, apply filter from pane.
**Expected:** bee-table retains all existing DuckDB-backed functionality; events bubble to bee-atlas without interception.
**Why human:** Database integration, pagination, and event bubbling require browser integration test.

Note: Items 5-7 are most naturally tested in Phase 108 UAT after bee-pane is wired into bee-atlas. The component is registered and functional now but not rendered in the live app until Phase 108.

### Gaps Summary

No gaps found. All 10 must-have truths are verified. All automated checks pass. Phase 107 success criteria are satisfied in the codebase.

---

_Verified: 2026-05-19T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
