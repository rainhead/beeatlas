---
phase: 109-beepane-v2-unified-occurrence-view
verified: 2026-05-20T13:20:00Z
status: gaps_found
score: 8/9 roadmap success criteria verified
overrides_applied: 0
gaps:
  - truth: "After selecting a genus from autocomplete, the pane remains open showing filtered results"
    status: failed
    reason: "_onFilterChanged in bee-atlas.ts never calls _runListQuery() when _paneState === 'list'. Plan 05 added the guard to keep the pane open (if (this._paneState !== 'list') this._paneState = 'collapsed'), but did not add the corresponding _runListQuery() call. The occurrence list remains stale after a filter change while the pane is open."
    artifacts:
      - path: "src/bee-atlas.ts"
        issue: "_onFilterChanged calls _runFilterQuery() and _runTableQuery() but NOT _runListQuery() when pane is in list state (lines 813-818)"
    missing:
      - "Add to _onFilterChanged after line 811: if (this._paneState === 'list') { this._listPage = 1; this._runListQuery(); }"
---

# Phase 109: BeePane v2 — Unified Occurrence View — Verification Report

**Phase Goal:** The bee-pane UX is redesigned with a unified occurrence model: selection and filter feed the same query so the pane always shows one consistent list; the collapsed button matches the old filter-panel design; the table view is a split-screen instead of a full-width overlay; old component files are deleted.
**Verified:** 2026-05-20T13:20:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | Clicking a map point opens the pane showing occurrences at that cluster, with "N selected · Clear" banner; Clear restores the list | ✓ VERIFIED | `bee-pane.ts:1079-1085` renders `.selection-banner` with `${this.selectionCount} selected · Clear`; `pane-clear-selection` event dispatched at line 585; `_onClearSelection` in `bee-atlas.ts` resets state and calls `_runListQuery` |
| SC-2 | With both filter and selection active, the pane shows their intersection | ✓ VERIFIED (query) / ✗ FAILED (refresh) | `queryListPage` in `filter.ts:381-426` correctly intersects filter WHERE with selection ID lists. However, `_onFilterChanged` never calls `_runListQuery()` when pane is in list state — list shows stale data after filter change. See Gaps. |
| SC-3 | With no filter and no selection, the pane shows the first page of all occurrences | ✓ VERIFIED | `_runListQuery` passes empty `selectedEcdysisIds`/`selectedInatIds` and null `_selectionBounds` when no selection; `queryListPage` returns all occurrences paged |
| SC-4 | Collapsed toggle is a floating button matching old filter-panel design: magnifying-glass SVG + specimen count, highlighted when filter OR selection active | ✓ VERIFIED | `bee-pane.ts:1121-1139` renders `.filter-btn` with circle+line SVG in collapsed state; active class applied when `filterActive \|\| (this.selectionCount ?? 0) > 0`; PANE-V2-01 tests all pass |
| SC-5 | Panel's close button is an X visible while the list scrolls | ✓ VERIFIED | X button placed as first flex child inside `.sidebar-header` (line 1067) which is outside `.list-scroll`; functionally always visible. Originally spec'd as absolutely positioned — changed to flex header item in plan 05 to fix overlap bug; functional goal preserved via different mechanism |
| SC-6 | Table view is split-screen: map in top ~40%, table in bottom ~60% | ✓ VERIFIED | `bee-atlas.ts` CSS: `.content.pane-table bee-pane { bottom:0; left:0; right:0; top:auto; height:60%; }` (lines 105-111); PANE-V2-03 tests pass |
| SC-7 | Table icon removed from bee-header; table accessible only via pane's expand button | ✓ VERIFIED | `bee-header.ts` has no `viewMode`, `_onViewClick`, or "Table view" text; PANE-V2-04 tests all pass |
| SC-8 | bee-filter-panel.ts and bee-sidebar.ts do not exist; no dynamic import('./bee-sidebar.ts') in bee-atlas.ts | ✓ VERIFIED | Files confirmed absent; PANE-V2-05 tests pass; `grep` of bee-atlas.ts returns no bee-sidebar references |
| SC-9 | npm test passes; tsc --noEmit exits 0 | ✓ VERIFIED | 478 tests passing, 0 failures; tsc exits 0 |

**Score:** 8/9 (SC-2 partially — query logic correct but list never refreshes on filter change)

### Deferred Items

None.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/filter.ts` | queryListPage, DataSummary, TaxonOption, FilterChangedEvent exports | ✓ VERIFIED | All four exports present; queryListPage executes real SQLite queries (COUNT + SELECT) |
| `src/bee-atlas.ts` | _runListQuery, list state fields, no _selectedOccurrences, updated CSS | ✓ VERIFIED | Fields present at lines 42-46; _runListQuery at line 474; CSS height:60% at line 110 |
| `src/bee-header.ts` | No viewMode prop, no table icon, no _onViewClick | ✓ VERIFIED | Confirmed by grep (no matches) and PANE-V2-04 tests |
| `src/bee-pane.ts` | filter-btn, pane-close in sidebar-header, selection-banner, list pagination props | ✓ VERIFIED | All elements present; listRows/listPage/listRowCount/listLoading/selectionCount properties at lines 65-69 |
| `src/tests/bee-atlas.test.ts` | UNIFY-01, PANE-V2-01..05 describe blocks | ✓ VERIFIED | All blocks present and passing |
| `src/tests/bee-pane.test.ts` | PANE-01 checks filter-btn; PANE-V2 block | ✓ VERIFIED | Present and passing |
| `src/bee-filter-panel.ts` (deleted) | Must not exist | ✓ VERIFIED | File absent; existsSync returns false |
| `src/bee-sidebar.ts` (deleted) | Must not exist | ✓ VERIFIED | File absent; existsSync returns false |
| `src/bee-filter-toolbar.ts` (deleted) | Must not exist | ✓ VERIFIED | File absent |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/filter.ts` | SQLite `occurrences` table | COUNT + SELECT queries | ✓ WIRED | Real queries at lines 410-425; no static return |
| `src/bee-atlas.ts` | `filter.ts` | `queryListPage` import + call in `_runListQuery` | ✓ WIRED | Import confirmed; called at line 487 |
| `src/bee-atlas.ts` | `src/bee-pane.ts` | `.listRows`, `.listPage`, `.listRowCount`, `.listLoading`, `.selectionCount` props | ✓ WIRED | All five bindings at lines 174-178 |
| `src/bee-atlas.ts` | `_onFilterChanged` | `_runListQuery` when pane is in list state | ✗ NOT WIRED | `_onFilterChanged` (lines 780-818) calls `_runFilterQuery` and `_runTableQuery` but not `_runListQuery`. The guard at line 811 prevents collapse but no list refresh follows. |
| `src/bee-pane.ts` | `pane-clear-selection` event | `_onClearSelection` dispatch | ✓ WIRED | Dispatched at line 585; handled in bee-atlas at line 840 |
| `src/bee-pane.ts` | `list-page-changed` event | `_onListPagePrev` / `_onListPageNext` dispatch | ✓ WIRED | Dispatched at lines 590/599; handled in bee-atlas at line 835 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `src/bee-pane.ts` | `listRows` (rendered in `bee-occurrence-detail`) | `_runListQuery()` in `bee-atlas.ts` → `queryListPage()` in `filter.ts` | Yes — real SQLite SELECT query on `occurrences` table | ✓ FLOWING |
| `src/bee-atlas.ts` `_runListQuery` | `_listRows`, `_listRowCount` | `queryListPage` SQL queries | Yes — COUNT(*) + SELECT from real DB | ✓ FLOWING |
| `src/bee-pane.ts` | `selectionCount` | `_selectionCount` in bee-atlas, computed from `_runListQuery` total | Yes — set to query total when IDs or bounds present | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| npm test — full suite | `npm test` | 478 passed, 0 failed | ✓ PASS |
| tsc type check | `npx tsc --noEmit` | exit 0 (no output) | ✓ PASS |
| filter.ts exports queryListPage | source grep | Line 373: `export async function queryListPage` | ✓ PASS |
| bee-sidebar.ts deleted | `ls src/bee-sidebar.ts` | No such file | ✓ PASS |
| pane-close not position:absolute | source grep | No `position: absolute` in .pane-close CSS block | ✓ PASS |
| _onFilterChanged guard present | source grep | Line 811: `if (this._paneState !== 'list') this._paneState = 'collapsed'` | ✓ PASS |
| _onFilterChanged calls _runListQuery | source grep | Lines 813-817: only `_runFilterQuery` and `_runTableQuery` called — no `_runListQuery` | ✗ FAIL |

### Probe Execution

Step 7c: SKIPPED (no probe scripts; phase is UI/frontend, not a CLI/migration phase)

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TABLE-02 | Plans 01-05 | Full-screen viewMode='table' replaced by pane sub-state; table accessible only via pane expand button | ✓ SATISFIED | bee-header.ts has no viewMode/table icon; bee-atlas.ts CSS has height:60% split-screen; PANE-V2-03 and PANE-V2-04 tests pass; PANE-V2-05 confirms bee-sidebar.ts deleted |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/bee-atlas.ts` | 62 | `_selectionDrawnGeneration` field declared and incremented but never read (dead code from pre-109 design) | Info | No functional impact; minor dead code |
| `src/bee-pane.ts` | 8 | Static `import './bee-table.ts'` defeats bee-atlas.ts dynamic import optimization | Warning | bee-table.ts loads on initial page load; lazy-load intent of dynamic import in bee-atlas.ts is nullified |
| `src/bee-atlas.ts` | 487 | `_runListQuery` passes `this._tableSortBy` — list ordering coupled to table sort state | Warning | If table sort order changes, list silently reorders on next list query |

No TBD, FIXME, or XXX markers found in any phase-modified files.

### Human Verification Required

The following items require manual testing (not automatable by source scan or unit tests):

#### 1. Filter change refreshes occurrence list while pane is open

**Test:** Open the list pane. Type "Apis" in the Species filter and select a genus from autocomplete. Observe the occurrence list.
**Expected:** The occurrence list immediately updates to show only occurrences matching "Apis" (genus filter). The pane stays open.
**Why human:** The CR-01 defect (missing `_runListQuery()` call in `_onFilterChanged`) means the list will NOT update. This is the blocking defect. Human confirmation of whether the stale-list behavior is observable.

#### 2. Occurrence list containment — no page scroll

**Test:** Open the list pane with a full dataset (no filter). Scroll within the occurrence list.
**Expected:** The page itself does not scroll; only the occurrence list area scrolls. The pane stays bounded within the viewport.
**Why human:** The CSS fixes (max-height, overflow:hidden, .list-scroll) were added in plan 05. Visual confirmation required that the list is contained.

#### 3. Selection banner — Clear resets to full list

**Test:** Click a cluster on the map. Observe banner. Click Clear.
**Expected:** Banner disappears; occurrence list reloads showing all occurrences matching the current filter (not just the cluster's occurrences).
**Why human:** The sequence tests both the clear event propagation and the subsequent _runListQuery call in _onClearSelection.

### Gaps Summary

**1 BLOCKER: List pane never refreshes when filter changes while pane is open**

`_onFilterChanged` in `src/bee-atlas.ts` (lines 780-818) was updated by plan 05 to stop collapsing the pane when a filter change fires from within the open list pane (`if (this._paneState !== 'list') this._paneState = 'collapsed'`). However, the corresponding `_runListQuery()` call was never added. When the user selects a taxon from the inline autocomplete while the list pane is open, the pane correctly stays visible but the occurrence list shows the pre-filter results indefinitely.

The code review (109-REVIEW.md CR-01) identified this defect. The plan 05 UAT must-have truth "After selecting a genus from autocomplete, the pane remains open showing filtered results" is therefore only half-satisfied: the pane stays open (verified) but does not show filtered results (failed).

**Fix required in `src/bee-atlas.ts` `_onFilterChanged`:**
```typescript
// After line 811:
if (this._paneState !== 'list') this._paneState = 'collapsed';
// Add:
if (this._paneState === 'list') {
  this._listPage = 1;
  this._runListQuery();
}
```

---

_Verified: 2026-05-20T13:20:00Z_
_Verifier: Claude (gsd-verifier)_
