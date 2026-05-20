# Phase 109: BeePane v2 — Unified Occurrence View — Research

**Researched:** 2026-05-20
**Domain:** Lit web components, CSS layout, SQLite/wa-sqlite query design
**Confidence:** HIGH

## Summary

Phase 109 is the final step in the v3.9 sidebar unification: it redesigns bee-pane's UX so that selection and filter always query the same occurrence list, replaces the chrome-strip collapsed button with a floating map-overlay button matching the old bee-filter-panel button, makes table view a split-screen (map 40% / table 60%), removes the table icon from bee-header, and deletes the now-redundant `bee-filter-panel.ts` and `bee-sidebar.ts` files.

The main engineering challenge is the unified query: currently `_selectedOccurrences` is a pre-fetched OccurrenceRow array that is passed as `occurrences` to bee-pane and rendered directly, while the table path runs `queryTablePage` separately. The redesign replaces that split with a single paged list query in list state and the existing `queryTablePage` in table state, both constrained by the intersection of `filterState` AND the active selection IDs/bounds.

All the list-state content (filter controls, occurrence detail) already lives inside bee-pane.ts as of Phase 107. The work is: (1) add `queryListPage` to filter.ts, (2) remove `_selectedOccurrences` from bee-atlas state and wire the new list query, (3) restyle the collapsed toggle to match bee-filter-panel's floating button, (4) add an absolutely-positioned X close button, (5) change the table CSS to a flex-column split, (6) remove the table icon from bee-header, (7) delete the old files.

**Primary recommendation:** Keep `_selectedOccIds` and `_selectionBounds` as the canonical selection state in bee-atlas; eliminate `_selectedOccurrences`; add `queryListPage` to filter.ts that accepts both a `FilterState` and an optional `selectedIds` array/bounds to intersect.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Unified occurrence list query | API / Backend (filter.ts) | — | SQLite lives in the "backend" tier (wa-sqlite worker); all queries belong in filter.ts |
| Paged list display in list state | Frontend (bee-pane) | — | Same component already owns filter controls and occurrence detail |
| Floating collapsed button | Frontend (bee-pane) | — | The button is part of bee-pane's collapsed render; no state change needed in bee-atlas |
| Split-screen table layout | Frontend (bee-atlas CSS) | bee-pane CSS | bee-atlas positions bee-pane via `.content.pane-table bee-pane`; bee-pane's internal flex handles map/table split |
| Selection state ownership | bee-atlas | — | CLAUDE.md invariant: bee-atlas owns all reactive state |
| File deletion | — | — | Pure repo cleanup; no runtime impact |

---

## Standard Stack

No new packages. This phase is pure TypeScript + CSS changes to existing components. [VERIFIED: codebase grep]

### Environment Availability

Step 2.6: SKIPPED — no new external dependencies. `npm test` and `tsc --noEmit` are the only tools needed; both are confirmed installed.

---

## Question 1: Selection–Filter Unification

### Current state

`_selectedOccurrences: OccurrenceRow[] | null` is a pre-fetched array populated by:
- `_onOccurrenceClick` — fetched by the Mapbox cluster-leaves query, passed directly
- `_openSidebarForFilter` — result of `queryAllFiltered(filterState)`
- `_onSelectionDrawn` — result of `queryOccurrencesByBounds(filterState, bounds)`
- `_restoreSelectionOccurrences` / `_restoreClusterSelection` / `_restoreBoundsSelection` — URL restore paths

In the current `queryTablePage`, `selectedEcdysisIds` / `selectedInatIds` are used only to sort selected rows to the top of the full filter-constrained result set. They are NOT used to restrict the WHERE clause.

### Redesign: `queryListPage` in filter.ts

The list state needs a paged query constrained to the **intersection** of:
- `filterState` (existing `buildFilterSQL` clauses)
- selection IDs (when a cluster or bounds selection is active)

Proposed new export in `filter.ts`:

```typescript
// [ASSUMED] — implementation shape; will be implemented in this phase
export async function queryListPage(
  f: FilterState,
  page: number,
  sortBy: SpecimenSortBy = 'date',
  selectedEcdysisIds: number[] = [],  // pre-validated integers
  selectedInatIds: number[] = [],
  selectionBounds: { west: number; south: number; east: number; north: number } | null = null
): Promise<{ rows: OccurrenceRow[]; total: number }> {
  const { occurrenceWhere } = buildFilterSQL(f);

  // Selection constraint: IDs (from cluster click) OR bounds (from rectangle draw)
  const selParts: string[] = [];
  if (selectedEcdysisIds.length > 0)
    selParts.push(`ecdysis_id IN (${selectedEcdysisIds.join(',')})`);
  if (selectedInatIds.length > 0)
    selParts.push(`observation_id IN (${selectedInatIds.join(',')})`);

  // Bounds selection is always a WHERE addition, not an ORDER priority
  let boundsClause = '';
  if (selectionBounds !== null) {
    const { west, south, east, north } = selectionBounds;
    boundsClause =
      ` AND lat BETWEEN ${south} AND ${north} AND lon BETWEEN ${west} AND ${east}`;
  }

  // When IDs are present, restrict to only those rows (intersection with filter)
  const selFilter = selParts.length > 0 ? ` AND (${selParts.join(' OR ')})` : '';

  const fullWhere = `(${occurrenceWhere})${selFilter}${boundsClause}`;
  const orderBy = (sortBy === 'modified' ? SPECIMEN_ORDER_MODIFIED : SPECIMEN_ORDER);
  const offset = (page - 1) * PAGE_SIZE;
  const selectCols = OCCURRENCE_COLUMNS.join(', ');

  await tablesReady;
  const { sqlite3, db } = await getDB();

  let total = 0;
  await sqlite3.exec(db,
    `SELECT COUNT(*) as n FROM occurrences WHERE ${fullWhere}`,
    (rowValues: unknown[], columnNames: string[]) => {
      total = Number(rowValues[columnNames.indexOf('n')] ?? 0);
    }
  );

  const rows: Record<string, unknown>[] = [];
  await sqlite3.exec(db,
    `SELECT ${selectCols} FROM occurrences WHERE ${fullWhere} ORDER BY ${orderBy} LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    (rowValues: unknown[], columnNames: string[]) => {
      const obj: Record<string, unknown> = {};
      columnNames.forEach((col: string, i: number) => { obj[col] = rowValues[i]; });
      rows.push(obj);
    }
  );
  return { rows: rows as unknown as OccurrenceRow[], total };
}
```

Key differences from `queryTablePage`:
- When selection IDs are present, the WHERE clause is **restricted** to those IDs (intersection), not just priority-sorted. This implements success criteria 2 ("intersection, not union").
- Accepts `selectionBounds` as an alternative selection mode (from rectangle draw).
- No `CASE WHEN … THEN 0 ELSE 1` priority sort — not needed when all returned rows are in-selection.

### No filter active, no selection

When both `filterState` is inactive and no selection is active, `occurrenceWhere` = `1 = 1`, `selFilter` = `''`, `boundsClause` = `''`, so the query returns all rows paged — exactly success criterion 3.

---

## Question 2: State Model Changes

### Fields to remove from bee-atlas

- `_selectedOccurrences: OccurrenceRow[] | null` — eliminated. The list is now rendered via paged query, not a pre-fetched array.

### Fields to keep

- `_selectedOccIds: string[] | null` — kept; still needed for map halo highlighting and `bee-map.selectedOccIds` prop
- `_selectionBounds: { west, south, east, north } | null` — kept; encodes the rectangle selection
- `_selectedCluster: { lon, lat, radiusM } | null` — kept; URL state for cluster restore
- `_selectionCount: number | null` — NEW field; the total count from the last `queryListPage` call so the "N selected · Clear" banner can show a count without re-querying

### New fields needed in bee-atlas

```typescript
@state() private _listRows: OccurrenceRow[] = [];       // replaces _tableRows for list state
@state() private _listRowCount = 0;                     // total for list pagination
@state() private _listPage = 1;
@state() private _listLoading = false;
private _listQueryGeneration = 0;
```

Alternatively (simpler): reuse `_tableRows` / `_tableRowCount` / `_tablePage` for both modes, since only one pane state is active at a time and both queries use the same type. This avoids duplicating query state. The planner should choose based on readability vs. complexity — both approaches work.

### Props that bee-pane gains

- `listRows: OccurrenceRow[]` — the paged list for list state
- `listRowCount: number`
- `listPage: number`
- `listLoading: boolean`
- `listSortBy: SpecimenSortBy`
- `selectionCount: number | null` — if > 0, show the "N selected · Clear" banner; if null, no selection active
- `selectionActive: boolean` — drives the collapsed button highlight (already covered by `filterActive` + selectionCount; could be merged)

### Props that bee-pane loses

- `occurrences: OccurrenceRow[] | null` — removed; list-state detail is now driven by the paged list
- `selectedIds: Set<string> | null` — may still be needed for `bee-table` highlighting; keep for table state

### New events bee-pane must emit

- `pane-clear-selection` — emitted by the "Clear" button in the "N selected · Clear" banner; bee-atlas clears `_selectedOccIds`, `_selectionBounds`, `_selectedCluster` and re-runs the list query unfiltered
- `list-page-changed` — for list pagination (parallel to `page-changed` for table)
- `list-sort-changed` — for list sort

Note: `pane-expand-list / pane-collapse / pane-expand-table / pane-shrink-list` remain unchanged. The table icon removal means `pane-expand-table` is still emitted from the expand button inside the pane — no structural change needed there.

---

## Question 3: Collapsed Button Design

The old `bee-filter-panel` render for its floating button (from `bee-filter-panel.ts` lines 855–884):

```typescript
// From bee-filter-panel.ts render():
const active = isFilterActive(this.filterState);
const count = this.specimenCount ?? this.summary?.totalSpecimens ?? '…';
return html`
  <div class="panel-container">
    ${!this.hideButton ? html`<button
      class=${'filter-btn' + (active ? ' active' : '')}
      @click=${this._togglePanel}
      aria-label="Filter occurrences"
      aria-expanded=${this._open}
      aria-haspopup="true"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <circle cx="6.5" cy="6.5" r="4"/>
        <line x1="9.9" y1="9.9" x2="13.5" y2="13.5"/>
      </svg>
      ${count} specimens
    </button>` : nothing}
    ${this._open ? html`<div class="filter-panel" ...>` : nothing}
  </div>
`;
```

And the `.filter-btn` CSS:
```css
.filter-btn {
  background: white;
  border: 1px solid rgba(0,0,0,0.3);
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
  cursor: pointer;
  font-size: 0.85rem;
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
  display: flex;
  align-items: center;
  gap: 0.3rem;
  white-space: nowrap;
}
.filter-btn.active {
  background: var(--accent, #2c7a2c);
  color: white;
  border-color: var(--accent, #2c7a2c);
}
```

In Phase 109, the collapsed button on bee-pane (currently just `⟩` / `⟨` ASCII arrows with `.toggle-btn` styling) should be replaced with this floating-button design. Changes:

1. The `.pane-chrome` wrapper (which also contains the expand button in list state) should be eliminated in collapsed state — the collapsed button floats standalone.
2. In collapsed state, bee-pane renders only a floating `<button class="filter-btn">` that is active when `filterActive || (selectionCount ?? 0) > 0`.
3. In list/table state, bee-pane renders the existing panel chrome (without the `.toggle-btn`), and the close X (see Question 5).

CSS note: `bee-filter-panel`'s `:host` is `position: absolute; z-index: 1`. `bee-pane`'s `:host` already is `position: absolute; z-index: 1`. The floating button inherits that positioning, which is correct — it should sit at the `top: calc(0.5em + 2.5rem); right: 0.5em` anchor defined in bee-atlas's `bee-pane {}` rule.

---

## Question 4: Split-Screen Table Layout

### Current CSS (from bee-atlas.ts)

```css
.content.pane-table bee-pane {
  inset: 0;
}
```

This makes bee-pane a full-screen overlay. The map behind it is invisible.

### Desired layout

- Content area: `display: flex; flex-direction: row` (existing)
- `bee-map`: `flex-grow: 1` (existing — always fills full width)
- When `pane-table`:
  - `bee-pane` should NOT be `inset: 0` — instead it should occupy the bottom 60% of the content area
  - The map should remain visible as the top ~40%

The key insight: bee-map uses `flex-grow: 1` horizontally but has no explicit height. The content area is `flex-direction: row`, so bee-map takes the full height. If bee-pane is `position: absolute` with `bottom: 0; left: 0; right: 0; height: 60%`, the map shows in the top 40%.

But note: the current bee-atlas content area is `overflow: auto` which clips absolute children only if they overflow the scroll container. For a split-screen, the approach should be:

**Option A: Keep bee-pane as absolute overlay (current architecture)**

```css
/* bee-atlas static styles */
.content.pane-table bee-pane {
  bottom: 0;
  left: 0;
  right: 0;
  height: 60%;
  /* Remove: inset: 0 */
  /* Keep: top is NOT set — height: 60% from bottom gives 40% to the map */
}
```

This requires removing `top: calc(0.5em + 2.5rem); right: 0.5em` rules from the base `bee-pane {}` in table state. The `bee-pane {}` base rule needs to not apply `top` unconditionally when in table mode.

Revised CSS in bee-atlas:
```css
bee-pane {
  /* No top/right — those are set only for list and collapsed states */
  position: absolute; /* bee-pane's :host already sets this */
}
.content.pane-list bee-pane {
  top: calc(0.5em + 2.5rem);
  right: 0.5em;
  bottom: 0.5em;
  width: 25rem;
}
/* Collapsed state: top/right positioning for the floating button */
/* bee-pane in collapsed state is just a floating button — small, positioned top-right */
.content:not(.pane-list):not(.pane-table) bee-pane {
  top: calc(0.5em + 2.5rem);
  right: 0.5em;
}
.content.pane-table bee-pane {
  bottom: 0;
  left: 0;
  right: 0;
  height: 60%;
}
```

**Option B: Change content to flex-column when in table mode**

Make the content area `flex-direction: column` in table mode, with bee-map taking `flex: 0 0 40%` and bee-pane (no longer absolute) taking `flex: 0 0 60%`. This is cleaner but requires changing bee-pane's `:host { position: absolute }` to be conditional.

Option A is lower risk because it leaves bee-pane's `:host { position: absolute }` intact and avoids any Mapbox ResizeObserver interaction. The map container never shrinks.

**Critical caveat for MAP-01:** In table mode under Option A, bee-map's DOM element still fills the full content height, but 60% of it is visually covered by the bee-pane overlay. The visible portion is the top 40%. The Mapbox canvas size is unchanged — the user interacts only with the top 40% visually, but the canvas is full-height. This is fine for row-click pan (success criterion 6).

**Conclusion:** Use Option A. The bee-atlas CSS change is:
- Remove `inset: 0` from `.content.pane-table bee-pane`
- Add `bottom: 0; left: 0; right: 0; height: 60%`
- Rename the bare `bee-pane {}` rule to only apply in non-table state

### bee-pane's internal table layout

In table state, bee-pane currently renders:
```html
<div class="table-header">...</div>
<bee-table ...></bee-table>
```

In the new split-screen, bee-pane's shadow DOM in table state should fill its host element (which is 60% of the content area). No structural change needed to bee-pane's table content — `bee-table` already fills its container.

---

## Question 5: Panel Close Button (X)

The success criterion says "absolutely positioned X in top-right corner so it remains visible while the list scrolls." Currently bee-pane has:
```html
<div class="sidebar-header">
  <span class="sidebar-title">Filters</span>
</div>
```
with no close button in list state.

Changes to bee-pane in list state:
1. Add a close button (X) that dispatches `pane-collapse`
2. Position it `position: absolute; top: 0.5rem; right: 0.5rem` on the `:host` element, or set `:host { position: relative }` and position relative to that.

Note: `:host` already has `position: absolute` in bee-pane. An absolutely-positioned child inside an absolutely-positioned `:host` is valid — the child is positioned relative to the `:host`'s containing block (its nearest positioned ancestor, which is the `.content` div in bee-atlas).

Recommended approach: Add a wrapper `<div class="pane-close-wrap">` positioned sticky at top of the scrollable content, or add the X as `position: absolute; top: 0.5rem; right: 0.5rem` with `z-index: 2` so it stays above the scrolling list.

---

## Question 6: Pane Events

The current event set in bee-pane: `pane-expand-list`, `pane-collapse`, `pane-expand-table`, `pane-shrink-list`.

With the redesign:
- `pane-expand-list` — still needed (collapsed → list via toggle)
- `pane-collapse` — still needed (list → collapsed via X button, also dispatched from toggle when list)
- `pane-expand-table` — still needed (list → table via expand button)
- `pane-shrink-list` — still needed (table → list via shrink button)

New events:
- `pane-clear-selection` — clears `_selectedOccIds`, `_selectionBounds`, `_selectedCluster` in bee-atlas; triggers re-run of list query without selection constraint
- `list-page-changed` — `detail: { page: number }` — for list pagination (mirrors `page-changed` for table)
- `list-sort-changed` — `detail: { sortBy: SpecimenSortBy }` — for list sort

`pane-expand-table` remains needed. The table icon is removed from bee-header, but the expand button inside bee-pane's list state still triggers table expansion. The `_onViewChanged` handler in bee-atlas.ts (which handles the header table icon) will be simplified or removed since the header no longer has the table tab.

---

## Question 7: Tests — Which Change Shape

### Tests that must be **deleted or updated** (currently check for files/patterns that will be gone)

**`src/tests/bee-sidebar.test.ts`** — The entire file tests bee-sidebar which will be deleted. The test file itself should be deleted. If any tests within are still valuable post-deletion (e.g., `SID-01/SID-02` render tests for bee-occurrence-detail), they should be migrated to bee-pane.test.ts or a new bee-occurrence-detail.test.ts. Looking at the content:
- `DECOMP-01`, `DECOMP-02`, `DECOMP-04`, `DECOMP-04-RACE` — these test bee-filter-controls, bee-occurrence-detail, bee-sidebar structural properties; keep DECOMP-01/02 but test against bee-pane; DECOMP-04/SIDE-01/SIDE-02 tests can be removed (bee-sidebar is gone)
- `SID-01/SID-02` render tests for bee-occurrence-detail — move to a new `bee-occurrence-detail.test.ts` or into bee-pane.test.ts

**`src/tests/bee-filter-toolbar.test.ts`** — Tests `bee-filter-panel.ts` (via `FILTER-PANEL` describe block). When bee-filter-panel.ts is deleted, these tests will fail. Either:
- Delete the file, OR
- Update to only test the `bee-atlas.ts` integration assertions (the "FILTER-PANEL: bee-atlas integration" block doesn't reference bee-filter-panel.ts source directly)
The `BeeFilterPanel` import test will throw. This file needs deletion or significant rewrite.

**`src/tests/bee-atlas.test.ts`** — Tests that reference `bee-sidebar.ts` in ARCH-03:
```
test('bee-sidebar.ts does not import bee-map or bee-atlas', ...)
```
This reads `bee-sidebar.ts` which will be deleted — must be removed or guarded.

### Tests that need **new bodies** for Phase 109

**`src/tests/bee-atlas.test.ts` — new describe blocks needed:**

```
describe('UNIFY-01: selection–filter intersection query', () => {
  // filter.ts exports queryListPage
  // queryListPage has correct WHERE when selectedIds are present
  // queryListPage returns all rows when no filter and no selection
})

describe('PANE-V2-01: collapsed button matches filter-panel design', () => {
  // bee-pane.ts in collapsed state renders .filter-btn class (not .toggle-btn)
  // collapsed button has magnifying-glass SVG
  // collapsed button is highlighted (.active) when filterActive || selectionCount > 0
})

describe('PANE-V2-02: unified list state', () => {
  // bee-pane.ts renders selection banner when selectionCount > 0
  // bee-atlas.ts does NOT declare _selectedOccurrences
  // bee-atlas.ts calls queryListPage or _runListQuery
  // bee-atlas.ts wires list-page-changed / list-sort-changed / pane-clear-selection
})

describe('PANE-V2-03: split-screen table layout', () => {
  // bee-atlas.ts CSS for .content.pane-table bee-pane does NOT have inset: 0
  // bee-atlas.ts CSS for .content.pane-table bee-pane has height: 60%
  // bee-map is NOT hidden or removed in table mode
})

describe('PANE-V2-04: bee-header table icon removal', () => {
  // bee-header.ts does NOT render a table icon-btn
  // bee-header.ts does NOT accept viewMode prop (or prop is removed)
  // bee-atlas.ts does NOT pass .viewMode to bee-header
})

describe('PANE-V2-05: old file removal', () => {
  // bee-filter-panel.ts does not exist
  // bee-sidebar.ts does not exist
  // bee-atlas.ts has zero dynamic import('./bee-sidebar.ts') calls
})
```

**`src/tests/bee-pane.test.ts` — changes:**
- Add tests for the new collapsed button design (filter-btn class, magnifying-glass, active state)
- Add test for selection-clear banner
- Add test for X close button in list state
- Existing PANE-01 through PANE-06 / TABLE-01 tests remain valid and should pass without modification IF the pane-chrome structure is preserved (but the toggle-btn may change to filter-btn for collapsed, requiring update to PANE-01/PANE-02 tests)

**PANE-01 test impact:**
```
test('bee-pane.ts declares a toggle-btn CSS class', ...)
test('bee-pane.ts renders toggle button outside paneState conditionals', ...)
```
If the collapsed toggle becomes a `.filter-btn` (not `.toggle-btn`), PANE-01 tests fail. The planner should either: (a) keep `.toggle-btn` as an additional class, or (b) update the PANE-01 tests to check for `.filter-btn` in collapsed state. Recommend (b) since the spec explicitly says the collapsed button should match the filter-panel design.

**PANE-02 test impact:**
```
test('bee-pane.ts toggle dispatch branches on paneState collapsed', ...)
```
Still valid — the collapsed branch still dispatches `pane-expand-list`.

---

## Question 8: Old File Removal

### Files to delete

| File | Reason |
|------|--------|
| `src/bee-filter-panel.ts` | Replaced by bee-pane's collapsed state |
| `src/bee-sidebar.ts` | Replaced by bee-pane's list state |
| `src/tests/bee-sidebar.test.ts` | Tests a deleted file; migrate SID-01/SID-02 render tests |
| `src/tests/bee-filter-toolbar.test.ts` | Tests bee-filter-panel.ts which is deleted; migrate the bee-atlas integration assertions |

### Dynamic `import('./bee-sidebar.ts')` calls to remove from bee-atlas.ts

All 7 occurrences (confirmed by grep):

| Line | Context |
|------|---------|
| 239 | `firstUpdated`: `initSel?.type === 'ids'` branch |
| 243 | `firstUpdated`: `initSel?.type === 'cluster'` branch |
| 247 | `firstUpdated`: `initSel?.type === 'bounds'` branch |
| 590 | `_onOccurrenceClick` |
| 690 | `_openSidebarForFilter` |
| 719 | `_onSelectionDrawn` |
| 1018 | `_restoreBoundsSelection` |

All 7 are "pre-warm" dynamic imports that pre-load the `bee-sidebar` module before it's rendered. Since bee-sidebar no longer exists, all 7 must be removed.

The `import type { DataSummary, TaxonOption, FilterChangedEvent } from './bee-sidebar.ts'` at bee-atlas.ts line 7 must also be removed. The types should be moved to a shared location or imported from bee-pane.ts or filter.ts.

**Type migration:** `DataSummary`, `TaxonOption`, `FilterChangedEvent` are currently defined in `bee-sidebar.ts`. They are imported by:
- `bee-atlas.ts` (type-only)
- `bee-filter-panel.ts` (type-only, being deleted)
- `bee-pane.ts` (type-only)
- `bee-filter-controls.ts` (type-only)
- `bee-filter-toolbar.ts` (type-only)
- `bee-map.ts` (type-only — `DataSummary`, `FilteredSummary`)

These types need a new home after bee-sidebar.ts is deleted. The natural candidates:
- Move `DataSummary`, `TaxonOption`, `FilterChangedEvent` to `filter.ts` (already the home of `FilterState`, `OccurrenceRow`)
- OR move to a new `types.ts` module

Recommended: move to `filter.ts`. This avoids creating a new file and keeps all query/filter types together.

### Static imports referencing bee-sidebar.ts types (import type only — NOT runtime)

| File | Affected import |
|------|----------------|
| `bee-atlas.ts:7` | `import type { DataSummary, TaxonOption, FilterChangedEvent } from './bee-sidebar.ts'` |
| `bee-pane.ts:5` | `import type { DataSummary, TaxonOption, FilterChangedEvent } from './bee-sidebar.ts'` |
| `bee-filter-controls.ts:4` | `import type { DataSummary, TaxonOption, FilterChangedEvent } from './bee-sidebar.ts'` |
| `bee-filter-toolbar.ts:4` | `import type { DataSummary, TaxonOption } from './bee-sidebar.ts'` |
| `bee-map.ts:9` | `import type { DataSummary, FilteredSummary } from './bee-sidebar.ts'` |

All of these must be updated to import from the new location (e.g., `filter.ts`).

Note: `bee-filter-controls.ts` and `bee-filter-toolbar.ts` are NOT being deleted in this phase. They will need their import paths updated.

---

## Architecture Patterns

### System Architecture Diagram (Phase 109 end state)

```
bee-atlas (state owner)
├── _filterState, _selectedOccIds, _selectionBounds, _selectedCluster  [selection state]
├── _listRows, _listRowCount, _listPage, _listLoading                  [list query state]
├── _tableRows, _tableRowCount, _tablePage, _tableLoading              [table query state]
│
├── bee-map  [pure presenter, emits events up]
│   ├── @map-click-occurrence → _onOccurrenceClick
│   │     sets _selectedOccIds, runs _runListQuery
│   ├── @selection-drawn → _onSelectionDrawn
│   │     sets _selectionBounds, runs _runListQuery
│   └── @filter-changed → ... (via bee-pane)
│
└── bee-pane  [pure presenter, emits events up]
    ├── collapsed state: floating .filter-btn (magnifying glass + count, active if filter||selection)
    ├── list state:
    │   ├── filter controls (What/Who/Where/When)
    │   ├── selection banner: "N selected · Clear" [emits pane-clear-selection]
    │   ├── paged occurrence list (listRows, listPage → [emits list-page-changed])
    │   └── X close button [emits pane-collapse]
    └── table state:
        ├── bee-table (full-width, 60% height of content area)
        └── shrink button [emits pane-shrink-list]
```

```
filter.ts exports:
  queryListPage(f, page, sortBy, selectedEcdysisIds, selectedInatIds, selectionBounds)
  queryTablePage(f, page, sortBy, selectedEcdysisIds, selectedInatIds)   [unchanged]
  queryVisibleIds(f)     [unchanged]
  buildFilterSQL(f)      [unchanged]
  DataSummary, TaxonOption, FilterChangedEvent  [moved from bee-sidebar.ts]
```

### State Machine Transitions (unchanged from Phase 108)

```
collapsed → list: pane-expand-list
list → collapsed: pane-collapse (X button) OR _onMapClickEmpty
list → table: pane-expand-table
table → list: pane-shrink-list
* → collapsed: _onFilterChanged clears selection; _onMapClickEmpty
```

### Recommended Project Structure (no new files needed)

The phase touches:
```
src/
├── filter.ts               (add queryListPage; move DataSummary/TaxonOption/FilterChangedEvent)
├── bee-atlas.ts            (remove _selectedOccurrences, add _listRows state, remove bee-sidebar imports, CSS changes)
├── bee-pane.ts             (redesign collapsed button, add selection banner + X close, add list pagination)
├── bee-header.ts           (remove table icon-btn and viewMode prop)
├── [DELETE] bee-filter-panel.ts
├── [DELETE] bee-sidebar.ts
└── tests/
    ├── bee-atlas.test.ts   (update ARCH-03, add PANE-V2 blocks)
    ├── bee-pane.test.ts    (update PANE-01, add Phase 109 blocks)
    ├── [DELETE] bee-filter-toolbar.test.ts
    └── [DELETE] bee-sidebar.test.ts
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Intersection of filter + selection IDs | Manual JS array intersection | SQL WHERE clause with AND conditions — the DB does it in one query |
| Paging with total count | Two separate passes through the data | Single COUNT(*) + LIMIT/OFFSET — already the pattern in queryTablePage |
| Floating button active state | JS toggle class | CSS class binding via Lit template literal + isFilterActive() |

---

## Common Pitfalls

### Pitfall 1: Type import deletion order
**What goes wrong:** Deleting bee-sidebar.ts before updating all consumers of its exported types. TypeScript compile will fail.
**How to avoid:** Move types to filter.ts first, update all imports, THEN delete bee-sidebar.ts.

### Pitfall 2: _selectedOccurrences removal — forgetting _openSidebarForFilter
**What goes wrong:** `_openSidebarForFilter` fetches `queryAllFiltered` and assigns to `_selectedOccurrences`. After removal of that field, this method must be replaced by calling `_runListQuery()` instead.
**Warning signs:** TypeScript error on `_selectedOccurrences` assignment.

### Pitfall 3: CSS specificity for table split-screen
**What goes wrong:** Adding `height: 60%` to `.content.pane-table bee-pane` but the base `bee-pane {}` rule (which sets `top: calc(0.5em + 2.5rem); right: 0.5em`) still applies, causing `top` to constrain the bee-pane element to start below the header, giving less than 60% of the content area.
**How to avoid:** The `.content.pane-table bee-pane` rule must override `top` to `auto` (or omit top entirely). Use `top: auto` in the table state rule.

### Pitfall 4: ARCH-03 test reads bee-sidebar.ts
**What goes wrong:** The ARCH-03 test block in bee-atlas.test.ts reads `bee-sidebar.ts` at the top of the test:
```typescript
test('bee-sidebar.ts does not import bee-map or bee-atlas', () => {
  const sidebarSource = readFileSync(resolve(__dirname, '../bee-sidebar.ts'), 'utf-8');
  ...
})
```
If bee-sidebar.ts is deleted without updating this test, the test will throw (file not found), causing the entire ARCH-03 describe block to fail.
**How to avoid:** Remove that test before deleting bee-sidebar.ts. Or delete both in the same commit.

### Pitfall 5: bee-filter-toolbar.test.ts imports bee-filter-panel.ts class
**What goes wrong:** `const { BeeFilterPanel } = await import('../bee-filter-panel.ts')` — if this runs after bee-filter-panel.ts is deleted, Vitest module resolution fails.
**How to avoid:** Delete bee-filter-toolbar.test.ts in the same wave as bee-filter-panel.ts.

### Pitfall 6: _onViewChanged still tries to set table mode
**What goes wrong:** `_onViewChanged` is called from bee-header's `view-changed` event. If the table icon is removed from bee-header, bee-header no longer emits `view-changed` with `detail: 'table'`. But `_onViewChanged` still handles it. The method can be simplified or removed.
**How to avoid:** Remove the table icon AND update `_onViewChanged` in the same task. Also update/remove the `VIEW-02` test that checks `this._paneState = table` in `_onViewChanged`.

### Pitfall 7: URL restore for 'table' pane state
**What goes wrong:** On URL restore (`?pane=table`), `firstUpdated` calls `_runTableQuery()` but does NOT call `_runListQuery()`. After the redesign, entering table mode must trigger the table query, and entering list mode must trigger the list query. Check that `_runListQuery` is called when pane is restored to 'list' state.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Separate _selectedOccurrences array (pre-fetched full list) | Paged `queryListPage` with selection filter in WHERE clause | Handles large selections (100+ items) without loading all rows |
| Table replaces map (full viewport) | Table is lower 60% overlay; map visible top 40% | Spatial context preserved; row-click pan works intuitively |
| Floating filter button + separate sidebar component | Single bee-pane with three states | Fewer components, less DOM, clearer ownership |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | vitest.config.ts (root) |
| Quick run command | `npm test -- --reporter=verbose src/tests/bee-pane.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| TABLE-02 | Full-screen table viewMode removed; table accessible only as pane sub-state | source-scan | `npm test -- --reporter=verbose src/tests/bee-atlas.test.ts src/tests/bee-pane.test.ts` |
| SC-1 (cluster click shows only those occurrences) | queryListPage restricts WHERE to selectedIds | source-scan + unit | `npm test -- --reporter=verbose src/tests/filter.test.ts` |
| SC-2 (filter + selection = intersection) | queryListPage AND-combines filter WHERE + selection WHERE | source-scan | `npm test -- --reporter=verbose src/tests/filter.test.ts` |
| SC-4 (collapsed button = magnifying glass + count) | bee-pane collapsed renders .filter-btn with SVG | source-scan | `npm test -- --reporter=verbose src/tests/bee-pane.test.ts` |
| SC-7 (table icon removed from bee-header) | bee-header.ts has no table icon | source-scan | `npm test -- --reporter=verbose src/tests/bee-atlas.test.ts` |
| SC-8 (old files gone) | bee-filter-panel.ts and bee-sidebar.ts do not exist | source-scan | `npm test -- --reporter=verbose src/tests/bee-atlas.test.ts` |
| SC-9 (tests pass, tsc clean) | npm test passes; tsc --noEmit exits 0 | suite | `npm test && npx tsc --noEmit` |

### Wave 0 Gaps

- [ ] New `describe('PANE-V2-*', ...)` blocks in `src/tests/bee-pane.test.ts` — covers collapsed button design, selection banner, X close button
- [ ] New `describe('UNIFY-01', ...)` in `src/tests/filter.test.ts` or bee-atlas.test.ts — covers `queryListPage` WHERE-intersection logic
- [ ] Update PANE-01 test to check for `.filter-btn` in collapsed state (replaces `.toggle-btn`)
- [ ] New `describe('PANE-V2-05: old file removal')` in bee-atlas.test.ts — checks bee-sidebar.ts and bee-filter-panel.ts are absent

---

## Security Domain

No security domain changes. This is a UI restructuring phase. Input validation via `buildFilterSQL`'s existing SQL-escape patterns is unchanged. No new user inputs are introduced.

---

## Open Questions (RESOLVED)

1. **Type home for DataSummary / TaxonOption / FilterChangedEvent**
   - What we know: these are currently exported from bee-sidebar.ts which is being deleted.
   - What's unclear: whether bee-filter-controls.ts and bee-filter-toolbar.ts are expected to survive long-term (they are not being deleted in this phase).
   - Recommendation: Move to filter.ts (minimal churn); update all five import sites.

2. **bee-filter-toolbar.ts — orphaned component**
   - After bee-filter-panel.ts is deleted, `bee-filter-toolbar.ts` (which tests confirm is not rendered by bee-atlas.ts) may be dead code. The test file for it (bee-filter-toolbar.test.ts) tests bee-filter-panel.ts.
   - Recommendation: Verify whether bee-filter-toolbar.ts is rendered anywhere. If not, delete it too. If yes, only update its import.

3. **_runListQuery vs reusing _runTableQuery**
   - The planner must decide whether to add a separate `_listRows` / `_listPage` / `_listLoading` state bucket or reuse the existing `_tableRows` bucket.
   - The simplest approach: separate fields avoid any state-sharing confusion between list and table modes. The added verbosity is minimal.

4. **Selection banner count source**
   - The "N selected" count should come from `queryListPage`'s returned `total` (i.e., the count of rows matching the intersection). This may differ from `_selectedOccIds.length` if the selection includes IDs that don't match the active filter.
   - `_selectionCount` should be set from `queryListPage(...).total` when selection is active.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `queryListPage` function shape as specified | Q1 code snippet | Low — this is the natural extension of existing `queryTablePage` pattern |
| A2 | Option A (absolute overlay) for split-screen table is lower risk than Option B (flex-column) | Q4 | Low — both work; Option A avoids ResizeObserver changes |
| A3 | bee-filter-controls.ts and bee-filter-toolbar.ts are not deleted in this phase | Q8 | Medium — if they're dead code, they add noise; confirm before planning |

---

## Sources

### Primary (HIGH confidence)

All findings derived from direct source-file reads. [VERIFIED: codebase]

- `/Users/rainhead/dev/beeatlas/src/bee-atlas.ts` — complete state model, event handlers, CSS
- `/Users/rainhead/dev/beeatlas/src/filter.ts` — queryTablePage, buildFilterSQL, queryOccurrencesByBounds
- `/Users/rainhead/dev/beeatlas/src/bee-pane.ts` — current three-state render, filter controls, event dispatches
- `/Users/rainhead/dev/beeatlas/src/bee-filter-panel.ts` — collapsed button design to replicate
- `/Users/rainhead/dev/beeatlas/src/bee-header.ts` — table icon to remove
- `/Users/rainhead/dev/beeatlas/src/bee-sidebar.ts` — types to migrate, file to delete
- `/Users/rainhead/dev/beeatlas/src/tests/bee-atlas.test.ts` — ARCH-03 test reads bee-sidebar.ts
- `/Users/rainhead/dev/beeatlas/src/tests/bee-pane.test.ts` — PANE-01/02 test toggle-btn
- `/Users/rainhead/dev/beeatlas/src/tests/bee-sidebar.test.ts` — references bee-sidebar.ts class import
- `/Users/rainhead/dev/beeatlas/src/tests/bee-filter-toolbar.test.ts` — imports BeeFilterPanel class

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; pure TypeScript/CSS on established patterns
- Architecture: HIGH — derived from direct source reads
- Pitfalls: HIGH — derived from concrete test assertions that will fail

**Research date:** 2026-05-20
**Valid until:** 2026-06-20 (stable codebase; all context is current-codebase)
