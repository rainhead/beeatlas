---
phase: 109-beepane-v2-unified-occurrence-view
verified: 2026-05-20T13:40:00Z
status: human_needed
score: 9/9 roadmap success criteria verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 8/9
  gaps_closed:
    - "SC-2 / TABLE-02: occurrence list now refreshes when user changes a filter while list pane is open — fix at bee-atlas.ts line 812"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Open the list pane. Type 'Apis' in the Species filter and select a genus from autocomplete. Observe the occurrence list."
    expected: "The occurrence list immediately updates to show only occurrences matching 'Apis'. The pane stays open."
    why_human: "The fix calls _runListQuery() inside _onFilterChanged, but the interaction between the inline autocomplete inside the pane and the filter-changed event can only be confirmed by running the app."
  - test: "Open the list pane with a full dataset (no filter). Scroll within the occurrence list."
    expected: "The page itself does not scroll; only the occurrence list area scrolls. The pane stays bounded within the viewport."
    why_human: "CSS containment (max-height, overflow:hidden, .list-scroll) added in plan 05 requires visual confirmation."
  - test: "Click a cluster on the map. Observe banner. Click Clear."
    expected: "Banner disappears; occurrence list reloads showing all occurrences matching current filter (not just the cluster's occurrences)."
    why_human: "Tests the clear event propagation and the subsequent _runListQuery call in _onClearSelection end-to-end."
---

# Phase 109: BeePane v2 — Unified Occurrence View — Final Verification Report

**Phase Goal:** The bee-pane UX is redesigned with a unified occurrence model: selection and filter feed the same query so the pane always shows one consistent list; the collapsed button matches the old filter-panel design; the table view is a split-screen instead of a full-width overlay; old component files are deleted.
**Verified:** 2026-05-20T13:40:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (109-06)

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | Clicking a map point opens the pane showing occurrences at that cluster, with "N selected · Clear" banner; Clear restores the list | VERIFIED | Carried forward: `bee-pane.ts:1079-1085` renders `.selection-banner`; `pane-clear-selection` event dispatched; `_onClearSelection` calls `_runListQuery` |
| SC-2 | With both filter and selection active, the pane shows their intersection | VERIFIED | `queryListPage` in `filter.ts` intersects filter WHERE with selection IDs. `_onFilterChanged` now calls `_runListQuery()` at line 812 when `_paneState === 'list'` — gap from previous verification closed |
| SC-3 | With no filter and no selection, the pane shows the first page of all occurrences | VERIFIED | Carried forward: `_runListQuery` with empty selection passes full result set |
| SC-4 | Collapsed toggle is a floating button matching old filter-panel design: magnifying-glass SVG + specimen count, highlighted when filter OR selection active | VERIFIED | Carried forward: `.filter-btn` rendering at `bee-pane.ts:1121-1139` |
| SC-5 | Panel's close button is an X visible while the list scrolls | VERIFIED | Carried forward: X button as first flex child in `.sidebar-header` outside `.list-scroll` |
| SC-6 | Table view is split-screen: map in top ~40%, table in bottom ~60% | VERIFIED | Carried forward: CSS `height:60%` at `bee-atlas.ts` line 110; PANE-V2-03 tests pass |
| SC-7 | Table icon removed from bee-header; table accessible only via pane's expand button | VERIFIED | Carried forward: `bee-header.ts` has no `viewMode`/`_onViewClick`; PANE-V2-04 tests pass |
| SC-8 | bee-filter-panel.ts and bee-sidebar.ts do not exist; no dynamic import('./bee-sidebar.ts') in bee-atlas.ts | VERIFIED | Carried forward: files absent; PANE-V2-05 tests pass |
| SC-9 | npm test passes; tsc --noEmit exits 0 | VERIFIED | 478 tests passing, 0 failures; tsc exits 0 — confirmed in this re-verification run |

**Score:** 9/9

### Gap Closure Verification

**Gap: SC-2 / TABLE-02 — occurrence list must refresh when user changes a filter while list pane is open**

Previous status: FAILED — `_onFilterChanged` called `_runFilterQuery` and `_runTableQuery` but not `_runListQuery` when pane in list state.

Fix introduced by 109-06 (commit `5e71caa`):

```typescript
// bee-atlas.ts line 812 — inside _onFilterChanged, after existing collapse guard
if (this._paneState === 'list') { this._listPage = 1; this._runListQuery(); }
```

Verification of fix:
- `grep -n "_paneState === 'list'" src/bee-atlas.ts` → line 812 match confirmed
- Line 812 is inside `_onFilterChanged` (method starts line 780, ends line 819)
- Placed immediately after existing guard at line 811: `if (this._paneState !== 'list') this._paneState = 'collapsed';`
- The two guards are mutually exclusive: if pane was NOT list (line 811 fires, collapses), then on line 812 `_paneState` is now 'collapsed', condition false. If pane WAS list (line 811 no-ops), then line 812 fires and refreshes.
- `npm test`: 478 passed, 0 failures
- `npx tsc --noEmit`: exit 0

**New status: VERIFIED (automated)**

### Required Artifacts

All artifacts verified in initial verification. Regression check for files touched by 109-06:

| Artifact | Status | Notes |
|----------|--------|-------|
| `src/bee-atlas.ts` | VERIFIED | One line added at 812; no regressions; tsc clean |

### Behavioral Spot-Checks (re-verification)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| npm test — full suite | `npm test` | 478 passed, 0 failed | PASS |
| tsc type check | `npx tsc --noEmit` | exit 0 | PASS |
| _onFilterChanged calls _runListQuery when pane is list | `grep -n "_paneState === 'list'" src/bee-atlas.ts` | Line 812: `if (this._paneState === 'list') { this._listPage = 1; this._runListQuery(); }` | PASS |
| Fix is inside _onFilterChanged | Context read lines 800-819 | Lines 780-819 are `_onFilterChanged`; fix at 812 is inside | PASS |
| Guards are mutually exclusive | Logic analysis | Line 811 may change `_paneState` from non-list to 'collapsed'; line 812 then reads the (possibly updated) state — correct | PASS |

### Human Verification Required

#### 1. Filter change refreshes occurrence list while pane is open

**Test:** Open the list pane. Type "Apis" in the Species filter and select a genus from autocomplete. Observe the occurrence list.
**Expected:** The occurrence list immediately updates to show only occurrences matching "Apis" (genus filter). The pane stays open.
**Why human:** The fix wires `_runListQuery()` into `_onFilterChanged` at the source level, but the end-to-end behavior through the inline autocomplete event chain can only be confirmed by running the app.

#### 2. Occurrence list containment — no page scroll

**Test:** Open the list pane with a full dataset (no filter). Scroll within the occurrence list.
**Expected:** The page itself does not scroll; only the occurrence list area scrolls. The pane stays bounded within the viewport.
**Why human:** CSS containment (`max-height`, `overflow:hidden`, `.list-scroll`) requires visual confirmation.

#### 3. Selection banner — Clear resets to full list

**Test:** Click a cluster on the map. Observe banner. Click Clear.
**Expected:** Banner disappears; occurrence list reloads showing all occurrences matching the current filter.
**Why human:** Tests the clear event propagation and the subsequent `_runListQuery` call in `_onClearSelection` end-to-end.

### Gaps Summary

No automated gaps remain. All 9/9 roadmap success criteria are verified in code. The 3 human verification items above are standard UAT for a UI phase — they are not blockers for code review or merge, but should be confirmed before milestone close.

---

_Verified: 2026-05-20T13:40:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification after gap closure by plan 109-06_
