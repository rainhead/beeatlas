# Phase 70: Map Overlay Sidebar — Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Convert `<bee-sidebar>` from a flex sibling that shifts the map to an absolutely-positioned overlay panel anchored below the filter button. The map remains full-width at all times. Sidebar is visible only when specimens are selected. Phase 70 does not introduce a specimen list panel or change the filter panel — those are future scope.

</domain>

<decisions>
## Implementation Decisions

### Overlay Positioning
- **D-01:** `<bee-sidebar>` becomes `position: absolute` within `.content` (which is already `position: relative`). It anchors to the right edge, below the filter button: `right: 0.5em; top: [header height + filter button height + gap]; width: 25rem`. Exact `top` offset is Claude's discretion — it must clear the filter button.
- **D-02:** The sidebar fills from its top anchor to the bottom of `.content`, with `overflow-y: auto` inside. No fixed max-height.
- **D-03:** The sidebar only renders when `_sidebarOpen` is true (no change to existing visibility condition).
- **D-04:** The `bee-sidebar` flex styles (`flex-shrink: 0; width: 25rem; border-left: ...`) are removed. The `.content` flex layout no longer accounts for sidebar width.

### Mobile / Portrait
- **D-05:** On portrait screens (`@media (max-aspect-ratio: 1)`), the sidebar stays in the current below-map layout (flex-column sibling, `width: 100%`, `border-top`). The overlay positioning applies to landscape/desktop only.

### Visual Treatment
- **D-06:** The sidebar panel has a drop shadow (consistent with the filter panel style). No backdrop or scrim. The map behind the sidebar remains fully interactive.

### Panel Header
- **D-07:** The sidebar header gains a "Selected specimens" label alongside the existing close button (replacing the current close-only header). Exact label wording and styling at Claude's discretion.

### Claude's Discretion
- **Exact `top` offset** for the overlay: must clear both the header bar (`2.5rem`) and the filter button height; the planner calculates the correct value from the existing CSS.
- **Z-index coordination** between sidebar and filter panel: sidebar should appear above the map but the exact layering relative to filter panel is implementation detail.
- **Sidebar width on overlay**: 25rem preserved unless it clips at narrow viewport widths — handle at planner's discretion.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture
- `frontend/src/bee-atlas.ts` — coordinator; owns `_sidebarOpen`, layout CSS for `.content` and `bee-sidebar`; render method is where sidebar visibility is gated
- `frontend/src/bee-sidebar.ts` — the panel being repositioned; currently has minimal header (close button only)
- `frontend/src/bee-filter-panel.ts` — already `position: absolute` within `.content`; sidebar positioning follows same pattern

### Constraints
- `CLAUDE.md` §Architecture Invariants — `<bee-atlas>` owns all reactive state; `<bee-sidebar>` is a pure presenter
- `CLAUDE.md` §Constraints — `speicmenLayer` typo in `bee-map.ts` is intentionally deferred

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bee-filter-panel` overlay pattern: `:host { position: absolute; z-index: 1; }` set on the component, positioned via `bee-atlas` CSS (`bee-filter-panel { right: 0.5em; top: calc(0.5em + 2.5rem); }`) — sidebar follows the identical approach
- `_sidebarOpen: boolean` in `bee-atlas.ts` — already controls render gating; no change needed
- Existing `bee-sidebar` drop shadow and border styles can be adapted; filter panel uses `box-shadow: 0 2px 8px rgba(0,0,0,0.15)`

### Established Patterns
- `.content` layout: `position: relative; display: flex; flex-row; flex-grow: 1` — `bee-map` is the flex-grow child; overlays use `position: absolute`
- Current `bee-sidebar` CSS in `bee-atlas.ts`: `bee-sidebar { flex-shrink: 0; width: 25rem; border-left: 1px solid var(--border-input); overflow-y: auto; scrollbar-gutter: stable; }` — these rules change to overlay positioning
- Portrait media query: `bee-sidebar { width: 100%; border-left: none; border-top: 1px solid var(--border-input); flex-grow: 1; }` — this block stays unchanged

### Integration Points
- `bee-atlas.ts` styles: remove `flex-shrink: 0; width: 25rem; border-left` from `bee-sidebar` rule; add `position: absolute; right: 0.5em; top: [calculated]; width: 25rem; bottom: 0; overflow-y: auto; z-index: 1` (or similar)
- `bee-atlas.ts` render: `<bee-map>` stays as sole flex-grow child; `<bee-sidebar>` becomes a sibling overlay inside `.content` (same pattern as `<bee-filter-panel>`)
- `bee-sidebar.ts` header: add "Selected specimens" label to `.sidebar-header`

</code_context>

<specifics>
## Specific Ideas

- Mental model from discussion: selected specimens ⊆ filtered specimens ⊆ loaded specimens. The sidebar panel is the "selected" view — it surfaces only what the user clicked, not the full filtered list.
- The panel appears/disappears without shifting anything — the map stays full-width throughout.

</specifics>

<deferred>
## Deferred Ideas

- **Specimen list panel**: filter panel expanding vertically to list filtered specimens, with a transition to/from the table view — interesting direction discussed during Phase 70 context session; belongs in a future phase after Phase 70 ships.

</deferred>

---

*Phase: 070-map-overlay-sidebar*
*Context gathered: 2026-04-21*
