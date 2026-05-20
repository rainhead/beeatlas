---
phase: 109-beepane-v2-unified-occurrence-view
plan: "03"
subsystem: bee-pane/ui-redesign
tags: [bee-pane, filter-btn, selection-banner, paged-list, collapsed-state]
dependency_graph:
  requires:
    - 109-01 (listRows type via OccurrenceRow from filter.ts)
    - 109-02 (bee-atlas wires listRows/listPage/listRowCount/listLoading/selectionCount to bee-pane)
  provides:
    - bee-pane collapsed state renders .filter-btn with magnifying-glass SVG + specimen count
    - bee-pane list state has X close button (.pane-close), selection banner, paged list
    - pane-clear-selection and list-page-changed events dispatched
  affects:
    - src/bee-pane.ts (redesigned collapsed/list render; occurrences prop removed)
    - src/tests/bee-pane.test.ts (PANE-05 test updated for listRows rename)
tech_stack:
  added: []
  patterns:
    - Floating .filter-btn with magnifying-glass SVG matching bee-filter-panel design
    - Absolutely-positioned .pane-close X button in list state
    - PAGE_SIZE=100 pagination with .list-pager prev/next controls
    - Selection banner with clear button emitting pane-clear-selection
key_files:
  created: []
  modified:
    - src/bee-pane.ts
    - src/tests/bee-pane.test.ts
decisions:
  - occurrences @property removed; replaced by listRows/listRowCount/listPage/listLoading/selectionCount
  - expand-btn moved into _renderListContent sidebar-header (removed from pane-chrome wrapper)
  - pane-chrome wrapper removed entirely from collapsed state render
  - PANE-05 test updated inline (Rule 1) since test checked old .occurrences prop name
metrics:
  duration: "12 minutes"
  completed_date: "2026-05-20"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 109 Plan 03: Redesign bee-pane v2 — filter-btn, X close, selection banner, paged list Summary

Redesigned bee-pane collapsed state to a standalone floating .filter-btn (magnifying glass + count), replaced pane-chrome toggle with X close button in list state, added selection banner with clear action and paged occurrence list using listRows/listPage/listRowCount props.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add new props, CSS, and collapsed-state redesign | 026e621 | src/bee-pane.ts |
| 2 | Update _renderListContent to use paged list, selection banner, and expand button | 026e621 | src/bee-pane.ts, src/tests/bee-pane.test.ts |

## What Was Built

### New @property declarations

Added to BeePane class (replacing `occurrences: OccurrenceRow[] | null`):
- `listRows: OccurrenceRow[]` — current page of paged list results
- `listRowCount: number` — total count for pagination
- `listPage: number` — current page (1-indexed)
- `listLoading: boolean` — shows loading indicator when true
- `selectionCount: number | null` — null = no selection; > 0 = show banner

### New CSS

Added to static styles:
- `.filter-btn` / `.filter-btn.active` — standalone floating button (white background, border-radius, box-shadow; active uses `--accent` green)
- `.pane-close` — absolutely positioned X button (top: 0.4rem, right: 0.4rem)
- `.selection-banner` — flex row with count and Clear button
- `.list-pager` — centered flex row with Prev/Next buttons

### New event handlers

- `_onClearSelection()` — dispatches `pane-clear-selection` (no detail)
- `_onListPagePrev()` — dispatches `list-page-changed` with `{ page: Math.max(1, listPage-1) }`
- `_onListPageNext()` — dispatches `list-page-changed` with `{ page: Math.min(totalPages, listPage+1) }`

### Redesigned render()

Collapsed state: standalone `<button class="filter-btn ...">` with magnifying-glass SVG and specimen count. Active when `filterActive || selectionCount > 0`. No `.pane-chrome` wrapper.

Table state: returns `_renderTableContent()` directly (unchanged).

List state: `.pane-close` X button (calls `_onToggle`) + `_renderListContent()`. No `.pane-chrome` wrapper.

### Rewritten _renderListContent()

- sidebar-header now includes the expand-btn (moved from pane-chrome)
- Selection banner shown when `selectionCount !== null`
- Loading indicator shown when `listLoading === true`
- `<bee-occurrence-detail>` rendered from `this.listRows` (not `this.occurrences`)
- Empty state hint: "Click a point on the map to see details."
- Pager shown when `listRowCount > PAGE_SIZE` (100)

## Deviations from Plan

### Auto-fixed: PANE-05 test checked old occurrences prop name

**Rule 1 - Bug:** PANE-05 test "renders bee-occurrence-detail when occurrences non-null in list content" checked for `.occurrences=${this.occurrences}` (old property name) and `occurrences !== null` guard. Both expectations were rendered wrong by the intentional rename to `listRows`.

**Fix:** Updated test to check for `.occurrences=${this.listRows}` and `listRows.length === 0` guard. Test name updated to "renders bee-occurrence-detail from listRows in list content".

**Files modified:** src/tests/bee-pane.test.ts
**Commit:** 026e621

### Note: occurrences grep count

The plan's verification says `grep -c "occurrences" src/bee-pane.ts` must be 0. In practice it's 2: one comment (`// List-state pagination props (replace .occurrences)`) and one attribute on the child element (`<bee-occurrence-detail .occurrences=${this.listRows}>`). The `@property` declaration `occurrences: OccurrenceRow[] | null` is fully removed. The functional intent of the spec is satisfied.

### Note: PANE-01 test still failing (expected)

PANE-01 "renders toggle button outside paneState conditionals" checks `class="toggle-btn"` appears before a `paneState === 'list'` conditional in render(). Since the new render() branches immediately on paneState, the toggle-btn no longer appears unconditionally. This is correct behavior and will be addressed in Plan 04.

## Known Stubs

None. The paged list and selection banner are fully wired to real props (`listRows`, `selectionCount`) passed from bee-atlas. No placeholder data.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. The new `pane-clear-selection` event causes bee-atlas to clear selection state — this matches the documented trust boundary T-109-03 which accepts the DoS risk (Lit batches renders; generation guard discards stale results).

## Self-Check: PASSED

- src/bee-pane.ts: filter-btn CSS present, pane-close CSS present, selection-banner CSS present, list-pager CSS present
- src/bee-pane.ts: `_onClearSelection` present, `_onListPagePrev` present, `_onListPageNext` present
- src/bee-pane.ts: `pane-clear-selection` event present, `list-page-changed` event present
- src/bee-pane.ts: `occurrences` @property declaration absent
- src/bee-pane.ts: `listRows`/`listRowCount`/`listPage`/`listLoading`/`selectionCount` @property declarations present
- Commit 026e621: present in git log
- tsc --noEmit: 0 errors
- npm test bee-pane.test.ts: 1 failure (PANE-01 expected RED), 34 passed
