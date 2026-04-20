# Phase 69: Table Drawer - Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 5 modified files
**Analogs found:** 5 / 5 (all analogs are the files themselves or direct peers — this phase modifies existing files only)

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `frontend/src/bee-atlas.ts` | coordinator/host | event-driven, request-response | self (all state patterns already present) | exact |
| `frontend/src/bee-table.ts` | presenter component | event-driven | `frontend/src/bee-map.ts` event dispatch | role-match |
| `frontend/src/bee-header.ts` | presenter component | event-driven | self (view-changed pattern already there) | exact |
| `frontend/src/bee-filter-panel.ts` | overlay component | request-response | self (`position: absolute`, `z-index: 1` on `:host`) | exact |
| `frontend/src/bee-sidebar.ts` | overlay component | event-driven | self (conditional render controlled by `_sidebarOpen` in bee-atlas) | exact |

---

## Pattern Assignments

### `frontend/src/bee-atlas.ts` — layout restructure + `_onViewChanged` + new `row-pan` handler

**Changes required:**
1. Always render `<bee-map>` (remove the `_viewMode === 'map'` ternary guard around it)
2. Render `<bee-table>` as an absolute overlay when `_viewMode === 'table'` instead of a flex sibling
3. Gate `<bee-filter-panel>` and `<bee-sidebar>` on `_viewMode === 'map'`
4. On `view-changed` → `'table'`: also set `_sidebarOpen = false`
5. Add handler for new `row-pan` event from `<bee-table>` that sets `_viewState`

**Existing layout CSS pattern** (`bee-atlas.ts` lines 73–135) — the `.content` block is `position: relative`, which already allows absolutely-positioned children:
```css
.content {
  display: flex;
  flex-direction: row;
  flex-grow: 1;
  overflow: auto;
  position: relative;
}
bee-map {
  flex-grow: 1;
}
```

**Absolute overlay positioning — copy from `bee-filter-panel.ts` `:host` block** (lines 84–88):
```css
:host {
  position: absolute;
  z-index: 1;
}
```
The drawer `<bee-table>` needs analogous host-level absolute positioning. Add CSS in `bee-atlas.ts` `static styles`:
```css
bee-table {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 82%;   /* ~82% leaves ~18% map strip visible — tune per D-01 */
  z-index: 2;
}
```

**Existing render() ternary to replace** (`bee-atlas.ts` lines 147–175):
```typescript
${this._viewMode === 'map'
  ? html`<bee-map ...></bee-map>`
  : html`<bee-table ...></bee-table>`
}
```
Replace with:
```typescript
<bee-map ...></bee-map>
${this._viewMode === 'table' ? html`<bee-table ...></bee-table>` : nothing}
```

**Existing filter-panel and sidebar conditional render** (`bee-atlas.ts` lines 177–189) — wrap both in `_viewMode === 'map'` guard:
```typescript
<bee-filter-panel ...></bee-filter-panel>
${this._sidebarOpen ? html`<bee-sidebar ...></bee-sidebar>` : ''}
```
Becomes:
```typescript
${this._viewMode === 'map' ? html`
  <bee-filter-panel ...></bee-filter-panel>
  ${this._sidebarOpen ? html`<bee-sidebar ...></bee-sidebar>` : ''}
` : nothing}
```

**Existing `_onViewChanged` handler** (`bee-atlas.ts` lines 624–635) — add `_sidebarOpen = false` on table entry:
```typescript
private _onViewChanged(e: CustomEvent<'map' | 'table'>) {
  this._viewMode = e.detail;
  if (this._viewMode === 'table') {
    this._tableLoading = true;
    this._runTableQuery();
    if (this._loading) {
      this._loadSummaryFromSQLite();
    }
    // D-08: close sidebar when entering table mode
    this._sidebarOpen = false;  // <-- ADD THIS
  }
  this._pushUrlState();
}
```

**New `_onRowPan` handler — copy event handler pattern from `_onViewMoved`** (`bee-atlas.ts` lines 501–509):
```typescript
private _onViewMoved(e: CustomEvent<{ lon: number; lat: number; zoom: number }>) {
  this._currentView = e.detail;
  if (!this._isRestoringFromHistory) {
    this._pushUrlState();
  } else {
    this._isRestoringFromHistory = false;
  }
}
```
New handler (does not update `_currentView` — pan is transient, not persisted to URL):
```typescript
private _onRowPan(e: CustomEvent<{ lat: number; lon: number }>) {
  this._viewState = { lat: e.detail.lat, lon: e.detail.lon, zoom: this._currentView.zoom };
}
```
Wire it on `<bee-map>`: `@row-pan=${this._onRowPan}`.

---

### `frontend/src/bee-table.ts` — add `row-pan` event on `<tr>` click

**Analog for event dispatch pattern — copy from `_onSortClick`** (`bee-table.ts` lines 179–185):
```typescript
private _onSortClick(sortBy: SpecimenSortBy) {
  this.dispatchEvent(new CustomEvent('sort-changed', {
    detail: { sortBy },
    bubbles: true,
    composed: true,
  }));
}
```

**New row-click handler:**
```typescript
private _onRowClick(row: OccurrenceRow) {
  const lat = row.lat != null ? Number(row.lat) : null;
  const lon = row.lon != null ? Number(row.lon) : null;
  if (lat === null || lon === null) return;
  this.dispatchEvent(new CustomEvent('row-pan', {
    detail: { lat, lon },
    bubbles: true,
    composed: true,
  }));
}
```

**Wire into `<tr>` in render()** (`bee-table.ts` lines 249–274) — add `@click` to each data row:
```typescript
${(this.rows as any[]).map(row => html`
  <tr @click=${() => this._onRowClick(row)} style="cursor: pointer">
    ...
  </tr>
`)}
```

**`lat`/`lon` fields availability** — `OccurrenceRow` already has `lat` and `lon` per the SQLite schema (confirmed by `_restoreClusterSelection` in `bee-atlas.ts` lines 760–800 which reads `obj.lat` / `obj.lon` from occurrence rows). No schema change needed.

---

### `frontend/src/bee-header.ts` — no changes required

The existing `view-changed` event dispatch pattern (lines 158–165) already supports `'map' | 'table'` and the header icon buttons already toggle between modes. No code changes needed; this file is included only to confirm the upstream event contract is stable.

---

### `frontend/src/bee-filter-panel.ts` — no changes required

The filter panel is already `position: absolute; z-index: 1` on `:host` (lines 84–88) and positioned via host-element CSS in `bee-atlas.ts` (lines 103–105):
```css
bee-filter-panel {
  right: 0.5em;
  top: calc(0.5em + 2.5rem);
}
```
Hiding it in table mode is handled entirely in `bee-atlas.ts` by the `_viewMode === 'map'` conditional render guard. No changes to `bee-filter-panel.ts` itself.

---

### `frontend/src/bee-sidebar.ts` — no changes required

Sidebar visibility is already controlled exclusively by `_sidebarOpen` in `bee-atlas.ts` (line 186). The `_viewMode === 'map'` guard added to `bee-atlas.ts` render() plus `_sidebarOpen = false` in `_onViewChanged` covers both D-06 and D-08. No changes to `bee-sidebar.ts` itself.

---

## Shared Patterns

### Property-down event-up (architecture invariant)
**Source:** `CLAUDE.md` §Architecture Invariants + every component file
**Apply to:** All changes in this phase
```
<bee-atlas> owns all reactive state.
Presenters (<bee-map>, <bee-table>, <bee-sidebar>) receive state as @property()
and emit CustomEvents upward with { bubbles: true, composed: true }.
```

### `viewState` property drives map pan/zoom
**Source:** `frontend/src/bee-map.ts` lines 115, 280–282
```typescript
@property({ attribute: false }) viewState: { lon: number; lat: number; zoom: number } | null = null;

// in updated():
if (changedProperties.has('viewState') && this.viewState && this.map) {
  this.map.getView().setCenter(fromLonLat([this.viewState.lon, this.viewState.lat]));
  this.map.getView().setZoom(this.viewState.zoom);
}
```
Setting `this._viewState` in `bee-atlas` triggers re-render → property flows down → OL map animates. The `row-pan` handler reuses this exact path.

### Conditional render gate for overlays
**Source:** `frontend/src/bee-atlas.ts` line 186
```typescript
${this._sidebarOpen ? html`<bee-sidebar ...></bee-sidebar>` : ''}
```
Same `condition ? html`...` : nothing` pattern is used to gate `<bee-filter-panel>` and `<bee-table>` (as drawer) on `_viewMode`.

### Absolute overlay positioning
**Source:** `frontend/src/bee-filter-panel.ts` lines 84–88 + `frontend/src/bee-atlas.ts` lines 103–105
```css
/* In component's static styles */
:host { position: absolute; z-index: 1; }

/* In bee-atlas static styles — host-element rule positions the overlay */
bee-filter-panel {
  right: 0.5em;
  top: calc(0.5em + 2.5rem);
}
```
The drawer `<bee-table>` should be positioned the same way: absolute rules on the `bee-table` selector in `bee-atlas.ts` `static styles`, with `:host` in `bee-table.ts` remaining `display: flex; flex-direction: column` (already set). The `position: absolute` is applied from the outside (host-element selector in `bee-atlas.ts`), not inside the component — keeping the component unaware of its positioning context.

### CustomEvent dispatch
**Source:** `frontend/src/bee-table.ts` lines 179–185, `frontend/src/bee-sidebar.ts` lines 94–99
```typescript
this.dispatchEvent(new CustomEvent('event-name', {
  detail: { /* payload */ },
  bubbles: true,
  composed: true,
}));
```

---

## No Analog Found

None — all patterns for this phase exist in the codebase. The drawer layout is directly analogous to the existing `bee-filter-panel` overlay positioning model.

---

## Metadata

**Analog search scope:** `frontend/src/` — all 6 canonical files read in full
**Files scanned:** 6
**Pattern extraction date:** 2026-04-20
