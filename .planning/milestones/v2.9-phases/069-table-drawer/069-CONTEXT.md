# Phase 69: Table Drawer — Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the full-view swap (map ↔ table) with a table drawer that slides up over the map. The map is always rendered and visible; the table is an overlay. Phases 70 (sidebar overlay) is out of scope here.

</domain>

<decisions>
## Implementation Decisions

### Drawer Layout
- **D-01:** The table drawer covers ~80-85% of the content area height; a fixed strip of ~15-20% of the map is always visible above the drawer when it's open.
- **D-02:** The map (`<bee-map>`) is always in the DOM and rendered — never replaced. The drawer is an absolutely-positioned overlay on top of it, not a sibling that swaps in.

### Trigger
- **D-03:** The existing header icon buttons (map icon / table icon) continue to control drawer open/closed state. No new UI element (FAB, bottom handle) needed.
- **D-04:** `_viewMode: 'map' | 'table'` state model is unchanged — "table" now means drawer-open rather than map-replaced. URL serialization is unaffected.

### Row → Map Interaction
- **D-05:** Clicking a table row pans the map strip to center on that occurrence's lat/lon. `<bee-table>` emits an event with the occurrence coordinates; `<bee-atlas>` updates `_viewState` to pan `<bee-map>`.
- **D-06:** Row clicks do NOT open the sidebar. The sidebar never shows in table mode.

### Table Mode Is a Clean Mode
- **D-07:** When `_viewMode === 'table'`, both the filter panel (`<bee-filter-panel>`) and the detail sidebar (`<bee-sidebar>`) are hidden/not rendered. Table mode presents only the map strip + the table drawer — no floating overlays.
- **D-08:** If the sidebar is open when the user switches to table mode, it must close (`_sidebarOpen` → false).

### Claude's Discretion
- **Drawer CSS approach:** Whether the drawer uses `position: absolute; bottom: 0; height: 80%` on `.content`, a CSS transform slide-in, or a flex-column split — implementation detail for the planner.
- **Pan zoom level:** Whether a row-click pan preserves the current zoom or snaps to a fixed close-up zoom — implementation detail.
- **Drawer open/close animation:** Whether the drawer slides in with a CSS transition — implementation detail.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture
- `frontend/src/bee-atlas.ts` — coordinator; owns `_viewMode`, `_sidebarOpen`, `_viewState`, `_selectedOccIds`; render method is the layout source of truth
- `frontend/src/bee-header.ts` — view toggle buttons (map/table icons); emits `view-changed` event
- `frontend/src/bee-table.ts` — table presenter; needs to emit row-click pan event
- `frontend/src/bee-map.ts` — map presenter; receives `viewState` property to pan/zoom
- `frontend/src/bee-filter-panel.ts` — floating filter overlay (Phase 68); must be hidden in table mode
- `frontend/src/bee-sidebar.ts` — detail sidebar; must not appear in table mode

### Constraints
- `CLAUDE.md` §Architecture Invariants — `<bee-atlas>` owns all reactive state; `<bee-map>`, `<bee-table>`, `<bee-sidebar>` are pure presenters; no module-level mutable state

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_viewState: { lon, lat, zoom }` in `bee-atlas.ts` — already drives map pan/zoom via `.viewState` property on `<bee-map>`; row-click pan reuses this path
- `_sidebarOpen: boolean` — already controls sidebar visibility; set to false on table mode entry
- `_selectedOccIds` — already wires highlight state to `<bee-map>`; may be reused or extended for row-click selection

### Established Patterns
- Current layout: `.content` is `position: relative; display: flex; flex-row`. `<bee-map>` and `<bee-table>` are currently flex siblings that swap via conditional render.
- For the drawer: `<bee-map>` stays as a flex-grow child; `<bee-table>` becomes `position: absolute` within `.content` (same pattern as `<bee-filter-panel>` and `<bee-sidebar>` in their overlay forms after Phase 70).
- `<bee-filter-panel>` is already `position: absolute` within `.content` (Phase 68) — same positioning model applies to the drawer.

### Integration Points
- `bee-atlas.ts` render(): remove the `_viewMode === 'map' ? <bee-map> : <bee-table>` ternary; always render `<bee-map>`; conditionally render `<bee-table>` as overlay when `_viewMode === 'table'`
- `bee-atlas.ts`: gate `<bee-filter-panel>` and `<bee-sidebar>` on `_viewMode === 'map'`
- `bee-table.ts`: add a new event (e.g. `row-pan`) carrying `{ lat, lon }` or occurrence ID + coords; `bee-atlas` handles it by setting `_viewState`
- `bee-atlas._onViewChanged()`: when switching to table mode, set `_sidebarOpen = false`

</code_context>

<specifics>
## Specific Ideas

- "Spatial context preserved" — the map strip is not decorative; it stays live and pannable from row clicks.
- Table mode is intentionally clean: no sidebar, no filter panel overlay. The user is in a data-inspection mode, not an exploration mode.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope.

</deferred>

---

*Phase: 069-table-drawer*
*Context gathered: 2026-04-20*
