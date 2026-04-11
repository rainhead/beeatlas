# Phase 39: View Mode Toggle - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a `viewMode` state (`map` | `table`) to `bee-atlas`, a toggle UI control inside `bee-sidebar`, and URL bookmarking via a `view` param. The actual table component is Phase 40 — this phase only creates the toggle infrastructure and the empty slot the table will occupy.

</domain>

<decisions>
## Implementation Decisions

### Toggle Control Placement
- **D-01:** The view mode toggle lives **inside `bee-sidebar`**, rendered as a button row below the Specimens/Samples tabs and above the filter controls.
- **D-02:** Visual form: `[🗺 Map] [Table]` — two segmented buttons in a row, active one highlighted.

### Layout in Table View
- **D-03:** The sidebar **stays visible** in table view. The table replaces the map area (`bee-map` is hidden/unmounted); the sidebar remains on the right with the toggle and filter controls accessible.
- **D-04:** `bee-map` should not render (or render hidden) in table view — it should not consume OL canvas resources unnecessarily. The simplest approach is a conditional `${viewMode === 'map' ? html\`<bee-map ...>\` : html\`<div class="table-slot"></div>\`}` in `bee-atlas` render.

### URL State
- **D-05:** URL param is `view=table`; map view omits the param entirely (absence = map, matching the existing convention for `lm`).
- **D-06:** `UiState` in `url-state.ts` gains a `viewMode: 'map' | 'table'` field. `buildParams` omits it when `map`; `parseParams` defaults to `map` when absent.

### Table-Area Placeholder
- **D-07:** Phase 39 renders an **empty `<div class="table-slot">`** in table view (no message, no stub component). Phase 40 slots `<bee-table>` into this area.

### Claude's Discretion
- Toggle button styling: match existing UI conventions (CSS custom properties, `bee-sidebar` static styles).
- Event propagation: toggle emits a `view-changed` custom event from `bee-sidebar` up to `bee-atlas`, following the established event-up / property-down pattern.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above.

### Key source files to read
- `frontend/src/bee-atlas.ts` — state ownership, render template, URL wiring
- `frontend/src/url-state.ts` — `UiState` interface + `buildParams`/`parseParams` to extend
- `frontend/src/bee-sidebar.ts` — where the toggle control is added
- `.planning/ROADMAP.md` §Phase 39 — success criteria (four items, all must be true)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `UiState` interface (`url-state.ts`): already holds `layerMode` and `boundaryMode` — extend with `viewMode`
- `buildParams` / `parseParams`: established pattern for omitting default values (e.g., `lm` omitted when `specimens`)
- `bee-atlas` `_layerMode`/`_boundaryMode` `@state()` fields: model for adding `_viewMode`
- `_onLayerChanged` event handler: model for a `_onViewChanged` handler
- `bee-sidebar` already receives `layerMode` as a `@property()` — same pattern for `viewMode`

### Established Patterns
- State ownership: `bee-atlas` owns `_viewMode`; `bee-sidebar` receives it as `@property()` and emits `view-changed` events up
- URL defaults omitted: absence of a param = default value (map mode, specimens layer, off boundary)
- Event naming: `layer-changed`, `filter-changed` → `view-changed` follows the same kebab-case convention
- `@state()` / `@property()` Lit decorators throughout

### Integration Points
- `bee-atlas.ts` render(): conditional `<bee-map>` vs `<div class="table-slot">` based on `_viewMode`
- `bee-sidebar.ts`: new toggle row in template; emits `view-changed` CustomEvent
- `url-state.ts`: `UiState` extended; `buildParams` + `parseParams` updated
- `bee-atlas` `firstUpdated()` and `_onPopState()`: restore `viewMode` from URL on load and back/forward

</code_context>

<specifics>
## Specific Ideas

- Toggle mockup chosen: `[🗺 Map] [Table]` as a segmented button pair inside `bee-sidebar`, below the Specimens/Samples tab row.
- "Full content space" in the success criteria means the table fills the area currently occupied by `bee-map` — sidebar remains alongside it.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 39-view-mode-toggle*
*Context gathered: 2026-04-07*
