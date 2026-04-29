# Phase 68: Filter Panel Redesign — Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the always-visible `<bee-filter-toolbar>` with a floating map overlay control that expands into a structured filter panel. The map remains visible at all times. Phases 69 (table drawer) and 70 (sidebar overlay) are out of scope here.

</domain>

<decisions>
## Implementation Decisions

### Collapsed State (the trigger control)
- **D-01:** The control floats over the map (not in a toolbar row above it)
- **D-02:** Shows a magnifying-glass icon and the current specimen count
- **D-03:** When any filter is active, the control adopts a distinct active state via coloring (not just a badge or count change)
- **D-04:** Tapping the control opens the panel; tapping again closes it (toggle)

### Filter Panel Layout
- **D-05:** Filters are organized into four sections in this order: **What** (taxon), **Who** (collector), **Where** (county, ecoregion), **When** (year, month)
- **D-06:** Each section is denoted by an icon (in addition to or instead of a text label) — exact icons at Claude's discretion
- **D-07:** Panel opens/closes on toggle of the same control (no separate close button required, though one is fine)

### Discovery
- **D-08:** The what/who/where/when icon-based structure is sufficient for discoverability — no "top genera in view" hints or dynamic suggestions needed

### Filter Input Style
- **D-09:** Remove the `localStorage`-based recent filter memory (`beeatlas.recentFilters` key in `bee-filter-controls.ts:192`). Rely on the browser's native input history/autofill for recall instead. The programmatic datalists (taxon names, collector names, etc. populated from loaded data) are still appropriate for autocomplete candidates.

### Placement
- **D-10:** The filter control lives inside `<bee-map>`, positioned `top: 0.5em` (same as `.region-control`), to the left of the Regions button — i.e. `right` offset accounts for Regions button width + gap, or use a flex row container for the two controls
- **D-11:** Download button moves to the table view only (CSV export is only meaningful there)

### Claude's Discretion
- **Elevation filter placement:** Doesn't map cleanly to what/who/where/when — place under "Where" (it is a spatial characteristic of the collection site)
- **Panel open direction:** Whether the panel expands downward, upward, or sideways from the trigger control

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture
- `frontend/src/bee-atlas.ts` — coordinator component; owns all app state and layout; current toolbar/header/content structure is what's being redesigned
- `frontend/src/bee-filter-toolbar.ts` — current filter toolbar wrapper (to be replaced)
- `frontend/src/bee-filter-controls.ts` — filter input logic and token system (reused inside the new panel)
- `frontend/src/bee-sidebar.ts` — current sidebar (not in scope for Phase 68 but shares the layout)
- `frontend/src/bee-header.ts` — fixed header (view toggle lives here; not in scope for Phase 68)

### Constraints
- `CLAUDE.md` §Architecture Invariants — `<bee-atlas>` owns all reactive state; `<bee-map>` and `<bee-sidebar>` are pure presenters

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `<bee-filter-controls>`: The full token/chip filter input component — reuse as-is inside the new panel. All filter logic stays in this component.
- `_sidebarOpen: boolean` state already exists in `bee-atlas.ts` — a similar `_filterOpen` state follows the same pattern
- CSS custom properties (`--surface`, `--border`, `--text-body`, etc.) used throughout; floating panel should use same tokens

### Established Patterns
- Overlay positioning: `<bee-sidebar>` uses `position: relative` on `.content` + fixed width column. The new control uses `position: absolute` within `.content` instead.
- Active/idle state styling: `<bee-filter-toolbar>` uses `var(--surface)` / `var(--border)` — active state needs a distinct color from the existing palette
- Elevation inputs are placed outside `.search-section` in `bee-filter-controls.ts` to avoid z-index clipping from the suggestion dropdown — this constraint carries into the panel layout

### Integration Points
- `bee-atlas.ts` render method: remove `<bee-filter-toolbar>` from the top-level layout; add the floating control inside the `.content` div (which has `position: relative`)
- `@filter-changed` event: wire from the new panel component back to `bee-atlas._onFilterChanged` — same event contract as today
- `@csv-download` event: currently on `<bee-filter-toolbar>`; move to `<bee-table>` or `<bee-header>` (Claude's discretion per D decisions above)

</code_context>

<specifics>
## Specific Ideas

From the user's description (April 2026 explore session):
- The current filter "uses a huge amount of space while not really hinting at what you could filter by"
- Desired flow: overview → narrow → dive; filter panel is the "narrow" step
- The control should feel like a map UI element (like OL zoom controls), not a toolbar

</specifics>

<deferred>
## Deferred Ideas

- Discovery hints showing top genera/counties/collectors in current view — discussed and explicitly deferred; icon-based structure is sufficient for now
- Guided exploration / "teasing common queries" — came up in the April explore session as a possible future phase
- Mobile-specific filter panel behavior — the existing `@media (max-aspect-ratio: 1)` layout may need revisiting when the panel is a map overlay, but that's Phase 68's own concern to resolve

</deferred>

---

*Phase: 068-filter-panel-redesign*
*Context gathered: 2026-04-20*
