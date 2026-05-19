# Architecture Research: v3.9 Sidebar & Table Unification

**Domain:** Lit coordinator/presenter SPA — three-state unified pane
**Researched:** 2026-05-19
**Confidence:** HIGH (direct source inspection of all affected files)

---

## Current Architecture

### Component Tree (pre-v3.9)

```
<bee-atlas>                        coordinator; owns ALL reactive state
  <bee-header>                     nav, emits view-changed('map'|'table')
  <div.content>
    <bee-map>                      pure presenter; 9 @property inputs, 11 events out
    <bee-table>                    pure presenter; conditionally rendered in table mode
    <bee-filter-panel>             hybrid: @property inputs from coordinator,
                                   BUT owns _open/@state internally (884 lines)
    <bee-sidebar>                  pure presenter; rendered when _sidebarOpen=true (125 lines)
      <bee-occurrence-detail>      pure presenter
```

### State Ownership in bee-atlas (relevant fields)

| Field | Type | Purpose |
|-------|------|---------|
| `_viewMode` | `'map' \| 'table'` | Controls table vs map layout; encoded in URL as `view=` |
| `_sidebarOpen` | `boolean` | Shows/hides bee-sidebar overlay |
| `_tableFilterOpen` | `boolean` | Drives `externalOpen` prop on bee-filter-panel in table mode |
| `_filterState` | `FilterState` | All filter dimensions; flows to bee-filter-panel, bee-map, bee-table |
| `_visibleIds` | `Set<string> \| null` | Async filter query result; flows to bee-map |
| `_selectedOccurrences` | `OccurrenceRow[] \| null` | Flows to bee-sidebar |
| `_selectedOccIds` | `string[] \| null` | Flows to bee-map (highlight) and bee-table (row emphasis) |
| `_tablePage`, `_tableSortBy` | pagination | Drive bee-table |
| `_tableRows`, `_tableRowCount`, `_tableLoading` | table data | Flow to bee-table |

### Existing Pane State (implicit, three separate mechanisms)

1. `_viewMode='table'` — replaces map with bee-table and shrinks bee-map to 18% height
2. `_sidebarOpen=true` — overlays bee-sidebar as absolute-positioned element over the map
3. `bee-filter-panel._open` — internal `@state` inside bee-filter-panel; toggle button always visible in map mode

The `viewMode` is encoded in the URL (`view=table`). The sidebar open/closed state is not persisted independently — it is implied by the presence of a selection (`o=`, `sel=`).

---

## Target Architecture: Three-State Unified Pane

### New Pane State Machine

`_paneState: 'collapsed' | 'list' | 'table'` replaces both `_viewMode` and `_sidebarOpen`.

| State | What's Visible | URL Encoding |
|-------|---------------|--------------|
| `collapsed` | Toggle button only (desktop); hidden (mobile) | `pane=` absent |
| `list` | Filters + occurrence detail | `pane=list` or inferred when `o=`/`sel=` present |
| `table` | Full table view embedded in pane | `pane=table` |

On mobile, `collapsed` means fully hidden; `list` means full-height slide-up panel. No `table` state on mobile — either omit or treat as `list`.

### New Component: `<bee-pane>`

**Source file:** `src/bee-pane.ts`

**Replaces:** `bee-filter-panel.ts` + `bee-sidebar.ts` merged into one component.

**Responsibility:** Render pane chrome (toggle button, expand-to-table button, close button) and conditionally render filter content or occurrence detail or embedded `<bee-table>`. This is a layout shell and pure presenter — all filter state and occurrence data still flow in as `@property`; nothing is owned internally except genuinely transient UI state (suggestion dropdown open/closed, uncommitted text input values).

**Properties in (from bee-atlas):**

| Property | Sourced from (current) | Purpose |
|----------|------------------------|---------|
| `paneState` | NEW | `'collapsed' \| 'list' \| 'table'` |
| `filterState` | bee-filter-panel.filterState | All filter dimensions |
| `taxaOptions` | bee-filter-panel.taxaOptions | Autocomplete data |
| `countyOptions` | bee-filter-panel.countyOptions | Autocomplete data |
| `ecoregionOptions` | bee-filter-panel.ecoregionOptions | Autocomplete data |
| `collectorOptions` | bee-filter-panel.collectorOptions | Autocomplete data |
| `summary` | bee-filter-panel.summary | Unfiltered totals |
| `specimenCount` | bee-filter-panel.specimenCount | Filtered total |
| `occurrences` | bee-sidebar.occurrences | Occurrence detail for list state |
| `tableRows` | bee-table.rows | Pass-through to embedded bee-table |
| `tableRowCount` | bee-table.rowCount | Pass-through |
| `tablePage` | bee-table.page | Pass-through |
| `tableLoading` | bee-table.loading | Pass-through |
| `tableSortBy` | bee-table.sortBy | Pass-through |
| `filterActive` | bee-table.filterActive | Pass-through |
| `selectedIds` | bee-table.selectedIds | Pass-through |

**Events out (to bee-atlas):**

| Event | Replaces | Payload |
|-------|---------|---------|
| `pane-state-changed` | `view-changed` + `close` | `{ paneState: 'collapsed' \| 'list' \| 'table' }` |
| `filter-changed` | bee-filter-panel `filter-changed` | `FilterChangedEvent` (unchanged shape) |
| `page-changed` | bee-table `page-changed` | `{ page: number }` |
| `sort-changed` | bee-table `sort-changed` | `{ sortBy: SpecimenSortBy }` |
| `download-csv` | bee-table `download-csv` | (none) |
| `row-pan` | bee-table `row-pan` | `{ lat, lon }` |

### Modified: bee-atlas

**Remove:** `_viewMode`, `_sidebarOpen`, `_tableFilterOpen`

**Add:** `@state() private _paneState: 'collapsed' | 'list' | 'table' = 'collapsed'`

**Remove imports:** `import './bee-filter-panel.ts'`, `import './bee-sidebar.ts'`

**Add import:** `import './bee-pane.ts'`

**Render change:** Replace the `<bee-filter-panel>` + conditionally-rendered `<bee-sidebar>` + conditionally-rendered `<bee-table>` with a single `<bee-pane>` receiving all relevant props.

**Key handler changes:**

- `_onPaneStateChanged(e)` replaces `_onViewChanged(e)` + `_onClose()`: when `paneState='collapsed'`, clear `_selectedOccurrences`, `_selectedOccIds`, `_selectedCluster`, `_selectionBounds` and push URL. When `paneState='table'`, run `_runTableQuery()` + dynamic import `./bee-table.ts`.
- `_onOccurrenceClick` sets `_paneState = 'list'` instead of `_sidebarOpen = true`.
- `_onSelectionDrawn` sets `_paneState = 'list'` on non-empty result.
- `_onRegionClick` / `_onPlaceSelected`: open pane to `list` when filter has results.
- `_onFilterChanged`: clear selections and set `_paneState = 'collapsed'` (mirrors current sidebar-close-on-filter-change behavior) OR keep `list` — decision needed in planning phase.

**bee-map layout CSS:** Remove `.content.table-mode bee-map { height: 18%; flex-grow: 0 }`. bee-map stays full-height in all pane states. The pane is positioned absolutely on desktop, as a bottom panel on mobile.

### Modified: url-state.ts

`UiState` drops `viewMode`, adds `paneState`:

```typescript
export interface UiState {
  boundaryMode: 'off' | 'counties' | 'ecoregions' | 'places';
  paneState: 'collapsed' | 'list' | 'table';
}
```

`buildParams`: emit `pane=table` when `paneState='table'`, `pane=list` when `paneState='list'`, omit `pane=` when collapsed.

`parseParams`: read `pane=` first; also treat `view=table` (legacy) as `pane=table` for backward compatibility. Infer `pane=list` when `o=` or `sel=` is present and no explicit `pane=` is set.

### Untouched Components

| Component | Status | Reason |
|-----------|--------|--------|
| `<bee-map>` | Unchanged | Pure presenter; coordinator/presenter boundary holds |
| `<bee-occurrence-detail>` | Unchanged | Pure presenter; embedded by bee-pane |
| `<bee-header>` | Unchanged | No longer emits view-changed; view toggle moves to bee-pane |
| `filter.ts` | Unchanged | Pure query functions |
| `sqlite.ts` | Unchanged | |
| `occurrence.ts` | Unchanged | Pure predicates |

---

## Data Flow After Unification

### Filter Change Flow

```
User types in bee-pane filter input
  → bee-pane emits filter-changed (unchanged event shape)
    → bee-atlas._onFilterChanged()
      → _filterState updated
      → _runFilterQuery() async → _visibleIds updated
      → bee-map receives filterState + visibleIds
      → bee-pane receives filterState
```

### Occurrence Click Flow

```
User clicks map cluster
  → bee-map emits map-click-occurrence
    → bee-atlas._onOccurrenceClick()
      → _selectedOccurrences, _selectedOccIds set
      → _paneState = 'list'         (was: _sidebarOpen = true)
      → bee-pane receives occurrences + paneState='list'
        → renders occurrence detail section
```

### Expand to Table Flow

```
User presses expand-to-table button in bee-pane (visible in list state)
  → bee-pane emits pane-state-changed({ paneState: 'table' })
    → bee-atlas._onPaneStateChanged()
      → _paneState = 'table'
      → import('./bee-table.ts') dynamic
      → _runTableQuery()
      → bee-pane receives paneState='table' + tableRows
        → renders embedded bee-table
```

### Pane Toggle Flow (collapsed ↔ list)

```
User presses toggle button in bee-pane chrome
  → bee-pane emits pane-state-changed({ paneState: 'list' or 'collapsed' })
    → bee-atlas._onPaneStateChanged()
      → if collapsing: clear _selectedOccurrences, _selectedOccIds, etc.
      → _paneState updated
      → URL pushed
```

---

## Internal Structure of bee-pane

The 884-line `bee-filter-panel` plus the 125-line `bee-sidebar` merge into one component. The internal `@state` fields that `bee-filter-panel` currently owns are transient UI state (suggestion dropdown visibility, input text values) and legitimately live inside `bee-pane`. They do not violate the state-ownership invariant because they do not affect app behavior until committed (emitting `filter-changed`).

Committed filter dimensions (`selectedTaxon`, `selectedCounties`, etc.) must NOT be duplicated as `@state` inside `bee-pane`. The existing `bee-filter-panel.updated()` sync pattern — copying incoming `filterState` `@property` into local rendering vars — is acceptable and carries over.

```
bee-pane internal render sections (conditional on paneState):
  'collapsed':
    toggle-open button only
  'list' (no occurrences):
    close/collapse button
    filter form (taxon, collector, where, when inputs)
    expand-to-table button
  'list' (with occurrences):
    close/collapse button
    <bee-occurrence-detail .occurrences=${occurrences}>
    expand-to-table button
  'table':
    filter form header (compact)
    <bee-table> embedded
    collapse-to-list button
```

The `toggle-filter` event emitted by `bee-table`'s filter button is caught inside `bee-pane` (not forwarded to `bee-atlas`). `bee-pane` handles switching the visible sub-section between filter form and table internally, without needing coordinator involvement. This eliminates the current `_tableFilterOpen` / `setOpen()` imperative coordination path in `bee-atlas`.

---

## Layout Model

### Desktop

```
┌────────────────────────────────────────────────┐
│  <bee-header>                                   │
├────────────────────────────────────────────────┤
│  <bee-map>  (flex-grow:1; always full area)    │
│                                      ┌─────────┤
│                                      │bee-pane │
│                                      │(abs,    │
│                                      │ right)  │
│                                      └─────────┤
└────────────────────────────────────────────────┘
```

bee-map always fills the content area. In `table` state, bee-pane expands to a wider panel (or full width) that overlays or sits beside the map — the map does NOT shrink to 18%.

### Mobile (max-aspect-ratio: 1)

```
┌─────────────────┐
│  <bee-map>      │
│  (full height)  │
├─────────────────┤
│  <bee-pane>     │  bottom drawer, slides up in list state
│  (list state)   │
└─────────────────┘
```

The existing `@media (max-aspect-ratio: 1)` CSS block in `bee-atlas` adapts. No `table` state on mobile.

---

## Build Order (Dependency-Constrained)

### Phase 1: url-state.ts Update

Update `UiState` to use `paneState` instead of `viewMode`. Update `buildParams` and `parseParams`. Preserve backward compat: `view=table` parses as `pane=table`. Update `url-state.test.ts`.

**Why first:** Every subsequent phase depends on `bee-atlas` using `_paneState`. Getting the URL contract right before touching components avoids double-editing.

### Phase 2: bee-atlas State Migration

Replace `_viewMode`, `_sidebarOpen`, `_tableFilterOpen` with `_paneState`. Add `_onPaneStateChanged()` handler. Remove the 18%/82% layout CSS. Update all internal callsites. Keep `<bee-filter-panel>` and `<bee-sidebar>` in the render temporarily — this phase only changes `bee-atlas`'s state machine. Run tests after to confirm coordinator logic works before touching child components.

**Why second:** Establishes the single source of truth before component changes.

### Phase 3: Create bee-pane

Create `src/bee-pane.ts` merging filter panel + sidebar. Receives all `@property` inputs; emits events listed above. Renders correct section based on `paneState`. Extracts filter form markup from `bee-filter-panel`. Embeds `<bee-occurrence-detail>`. Handles `<bee-table>` via dynamic import in `table` state. Intercepts `toggle-filter` from bee-table internally.

**Why third:** `bee-atlas` is now ready to receive events from the unified pane.

### Phase 4: bee-atlas Cutover

Replace `<bee-filter-panel>` and `<bee-sidebar>` in `bee-atlas`'s `render()` with `<bee-pane>`. Wire all events. Remove `import './bee-filter-panel.ts'` and `import './bee-sidebar.ts'`.

**Why fourth:** Final wiring after `bee-pane` is tested in isolation.

### Phase 5: Delete Retired Files + Update Tests

Delete `src/bee-filter-panel.ts`, `src/bee-sidebar.ts`. Update `bee-filter-toolbar.test.ts` tests that assert `bee-atlas` imports `bee-filter-panel` — change assertion to `bee-pane`. Migrate or rewrite `bee-sidebar.test.ts` structural invariant tests to apply to `bee-pane` (no internal filter state, no cross-component imports).

**Why last:** Deletion is safe only after `bee-pane` confirmed working end-to-end.

---

## Critical Integration Points

### 1. Filter Pane Open/Close Synchronization

Currently `bee-filter-panel` has its own `_open` `@state` and an imperative `setOpen(bool)` public method called from `bee-atlas._onToggleFilter()` for table mode. In the unified pane, this mechanism disappears entirely: `paneState` drives everything. The `externalOpen` and `hideButton` properties on `bee-filter-panel` have no equivalent in `bee-pane`.

The filter toggle within the table (bee-table's filter button emitting `toggle-filter`) is now caught and handled inside `bee-pane` directly, without routing through `bee-atlas`. This is architecturally cleaner: the pane controls its own sub-sections.

### 2. Dynamic Import of bee-table

Currently `bee-atlas` dynamically imports `./bee-table.ts` when entering table mode. In the unified pane, `bee-pane` owns this import. The pattern moves from `bee-atlas._onViewChanged()` into `bee-pane`'s handler for the expand-to-table action (fire-and-forget, same pattern).

### 3. Selection State on Collapse

The current `_onClose()` in `bee-atlas` clears `_selectedOccurrences`, `_selectedOccIds`, `_selectedCluster`, `_selectionBounds`, and `_sidebarOpen`. In the new model, `_onPaneStateChanged({ paneState: 'collapsed' })` must do the same cleanup. The coordinator still owns what is "selected" — `bee-pane` cannot clear these directly.

### 4. row-pan Event Routing

`row-pan` events from `bee-table` use `bubbles: true, composed: true`. Since `bee-table` is embedded inside `bee-pane`'s shadow DOM, these events bubble through `bee-pane` to `bee-atlas` without any re-emission logic. No changes needed as long as the event composition flags remain.

### 5. URL Backward Compatibility

Old bookmarked URLs with `view=table` must continue to work. `parseParams` reads `view=table` as `pane=table`. Old URLs with `o=` or `sel=` params but no `pane=` infer `pane=list`.

### 6. FilterChangedEvent Type Move

`FilterChangedEvent` is currently defined in `bee-sidebar.ts` and imported by `bee-filter-panel.ts` and `bee-atlas.ts`. When `bee-sidebar.ts` is deleted, this type needs a new home. Move it to `filter.ts` (alongside `FilterState`) or a new `src/types.ts`. This is a low-risk housekeeping step best done in Phase 1 or Phase 5.

---

## Anti-Patterns to Avoid

### Duplicating filter state inside bee-pane as @state

**What it looks like:** `@state() private _selectedCounties = new Set<string>()`

**Why wrong:** Creates a second source of truth. Filter changes from map clicks (region click, place click) update `bee-atlas._filterState`, which flows down as a `@property`. If `bee-pane` also maintains local `@state` for the same data, they diverge until the next Lit update cycle.

**Do this instead:** Use `bee-filter-panel`'s existing `updated()` sync pattern. Copy incoming `filterState @property` into local rendering vars only for fields with transient UI state (input text values). All committed filter dimensions come from the `@property`.

### Letting bee-pane coordinate queries

**What it looks like:** `bee-pane` calling `queryVisibleIds()` or `queryTablePage()` directly.

**Why wrong:** Violates the state-ownership invariant. `bee-atlas` runs all queries and pushes results back down as properties.

**Do this instead:** `bee-pane` emits events; `bee-atlas` handles queries and sets reactive state.

### Moving pane toggle into bee-header

**What it looks like:** Moving collapsed/list/table toggle buttons into `<bee-header>`.

**Why wrong:** `bee-header` handles global navigation. Pane-state control is spatially part of the pane (the toggle button appears at the pane edge) and belongs in `bee-pane`. Coupling them to the header prevents independent layout control.

### Keeping two separate open/close mechanisms

**What it looks like:** Keeping `_sidebarOpen` and `_viewMode` alongside the new `_paneState` as transitional state during the migration.

**Why wrong:** Having both during even a partial migration means two sources of truth for layout. They will desync. The Phase 2 migration must be complete before Phase 3 begins.

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Component boundaries | HIGH | Direct read of all 5 affected files |
| State ownership rules | HIGH | CLAUDE.md invariants + test suite confirmed |
| URL state changes | HIGH | Full url-state.ts read; backward compat pattern is clear |
| Build order | HIGH | Dependency graph from import graph |
| Mobile layout | MEDIUM | Existing CSS pattern clear; exact behavior needs visual UAT |
| bee-table embed event routing | MEDIUM | composed:true bubbling in shadow DOM is spec-correct; no empirical test yet |

---

*Architecture research for: v3.9 Sidebar & Table Unification*
*Researched: 2026-05-19*
