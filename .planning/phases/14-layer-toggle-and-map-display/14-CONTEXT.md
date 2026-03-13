# Phase 14: Layer Toggle and Map Display - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire `SampleParquetSource` (created in Phase 13) to the OpenLayers map and add an exclusive toggle between specimen clusters and sample dots. The sidebar and URL (`lm=` parameter) reflect the active layer. Filter controls adapt to active layer. Sample sidebar shows recent events by default. Phase 15 handles the full sample click detail (observer, iNat link, specimen count).

</domain>

<decisions>
## Implementation Decisions

### Toggle UI placement and structure
- Toggle lives inside `bee-sidebar` at the very top of the panel, above summary stats and filter controls
- Two adjacent buttons: `[ Specimens ] [ Samples ]` — active mode highlighted, inactive muted
- `bee-sidebar` receives `layerMode` as a property from `bee-map`, renders the toggle, emits a `layer-changed` event back up
- Follows the existing event-driven pattern (`filter-changed`, `close`) — no new architectural patterns needed

### Filter controls treatment in sample mode
- Specimen taxon/date filter controls (autocomplete, year range, month picker) are **hidden entirely** when sample mode is active
- When switching back to specimen mode, previously active filters are **restored** — filter state is preserved across the toggle (not cleared)
- `bee-sidebar` handles the hide/show via conditional rendering based on `layerMode` prop

### Sample mode default sidebar state
- When sample mode is active but no dot has been clicked, the sidebar shows collection events from the **last 2–3 weeks** sorted by date descending
- Each entry shows the same fields as a clicked-dot detail (observer, date, specimen count) — same format, not a special compact layout
- Each entry is **clickable**: clicking an event pans and zooms the map to that sample dot and shows its full detail
- This gives users an immediate sense of recent activity when they first enter sample mode

### Layer mode and URL
- `lm=` URL parameter encodes active layer mode (`specimens` | `samples`)
- Switching layers clears the sidebar (no stale specimen or sample detail remains visible)
- `o=` param (selected occurrence IDs) is cleared when switching layers, since IDs are layer-specific

### Claude's Discretion
- Exact highlight/active style for the toggle buttons (color, border, weight — should be consistent with existing sidebar aesthetic)
- Exact date window for "last 2–3 weeks" (2 weeks is a clean default)
- How `layerMode` state is held in `bee-map` (`@state` property is the natural choice given existing patterns)
- Whether `SampleParquetSource` is initialized at module level (like `specimenSource`) or lazily in `firstUpdated()`
- Transition animation (none is fine — instant toggle)

</decisions>

<specifics>
## Specific Ideas

- "Most recent collection events" as the default sample sidebar view — gives users immediate context about what data is available when they first switch to sample mode
- The toggle should feel like a primary mode switch, not a filter — placing it at the very top of the sidebar (above stats and filters) establishes that hierarchy

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SampleParquetSource` (parquet.ts): Already exists from Phase 13 — same module-level instantiation pattern as `specimenSource`
- `sampleDotStyle` (style.ts): Already exists from Phase 13 — ready to wire as the `VectorLayer` style
- `bee-sidebar` event pattern: `filter-changed` CustomEvent → handle in `bee-map`; `layer-changed` follows the same pattern
- `buildSamples()`, `computeSummary()` in `bee-map.ts`: Reference for building display data from Feature arrays — adapt for sample features

### Established Patterns
- Module-level layer: `specimenSource`, `clusterSource`, `specimenLayer` created at module level, added to map in `firstUpdated()` — follow same pattern for `sampleLayer`
- `layer.setVisible(bool)`: The exclusive toggle mechanism — `specimenLayer.setVisible(mode === 'specimens')`, `sampleLayer.setVisible(mode === 'samples')`
- `@state` in `BeeMap`: Used for `selectedSamples`, `summary`, etc. — `layerMode` follows the same pattern
- `bee-sidebar` receives props via `.property=${value}` bindings and emits events back — same channel for `layerMode` and `layer-changed`
- URL param sync: `buildSearchParams()` / `parseUrlParams()` already handle `replaceState`/`pushState` — add `lm=` param to both functions

### Integration Points
- `bee-map.ts` `firstUpdated()`: Add `sampleLayer` to the `layers` array alongside `specimenLayer`; initialize `sampleLayer.setVisible(false)` (specimens default)
- `bee-map.ts` `render()`: Pass `.layerMode` to `bee-sidebar`; handle `@layer-changed` event
- `bee-sidebar`: Add `@property() layerMode` prop; render toggle at top; conditionally render filter section; emit `layer-changed`
- `buildSearchParams()` / `parseUrlParams()`: Add `lm=` parameter (value: `'specimens'` | `'samples'`)
- `singleclick` handler in `bee-map.ts`: Route click to `specimenLayer` or `sampleLayer` based on `layerMode`; sample click shows recent-format detail

</code_context>

<deferred>
## Deferred Ideas

- URL encoding of selected sample marker (`inat=` param) — explicitly deferred as MAP-06 in REQUIREMENTS.md
- Sample dot size-encoded by specimen count — MAP-08, deferred
- Combined specimens + samples view — MAP-07, deferred

</deferred>

---

*Phase: 14-layer-toggle-and-map-display*
*Context gathered: 2026-03-12*
