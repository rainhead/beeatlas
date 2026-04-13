# Phase 54: Sidebar Cleanup - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the sidebar a detail-only panel: hidden when no map feature is selected, visible when the user clicks a specimen cluster or sample dot, dismissible via a close button. Remove all non-detail content from the sidebar (layer toggle, view toggle, filter controls, feeds, summary stats, recent collections list).

</domain>

<decisions>
## Implementation Decisions

### Sidebar Visibility
- **D-01:** Sidebar is hidden by default on app load — `_sidebarOpen: boolean` state in `bee-atlas`, initially `false`
- **D-02:** Sidebar opens when user clicks a specimen cluster or sample dot on the map (existing `map-click-specimen` and `map-click-sample` events)
- **D-03:** Sidebar closes only via the close button inside the sidebar — explicit X button, no click-outside or Escape key

### Content Removal
- **D-04:** Summary stats panel (`_renderSummary`) removed entirely — not moved elsewhere
- **D-05:** Recent collections panel (`_renderRecentSampleEvents`) removed entirely — not moved elsewhere
- **D-06:** Layer toggle (`_renderToggle`) removed from sidebar — already in `bee-header`
- **D-07:** View toggle (`_renderViewToggle`) removed from sidebar — already in `bee-header`
- **D-08:** Feeds section (`_renderFeedsSection`) removed from sidebar — no replacement surface

### What Remains in Sidebar
- **D-09:** Sidebar shows only detail panels: `<bee-specimen-detail>` (specimen click) or `<bee-sample-detail>` (sample click)
- **D-10:** Close button appears in sidebar (emits `close` event — `bee-atlas` already listens on `@close`)

### Layout
- **D-11:** When sidebar is closed, map or table occupies the full content area (no sidebar width consumed)
- **D-12:** On narrow viewports (portrait), same hide/show behavior — sidebar appears below map/table when open, collapses away when closed

### Claude's Discretion
- Close button placement, icon, and styling within the sidebar
- Transition/animation (if any) — instant show/hide is fine; a simple CSS transition would also be acceptable

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture constraints
- `CLAUDE.md` — Architecture invariants (state ownership, pure presenters, event patterns)

### Current component implementations
- `frontend/src/bee-atlas.ts` — Root coordinator; owns `_selectedSamples`, `_selectedSampleEvent`, `_onClose` handler; renders sidebar
- `frontend/src/bee-sidebar.ts` — Current sidebar; has layer toggle, view toggle, summary, recent events, feeds, and detail panels to strip

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bee-atlas.ts` already has `_onClose()` handler wired to `@close` event from sidebar — just needs to set `_sidebarOpen = false`
- `bee-atlas.ts` already has `map-click-empty` handler (`_onMapClickEmpty`) — currently clears selection; could also close sidebar
- `bee-sidebar.ts` detail panels (`<bee-specimen-detail>`, `<bee-sample-detail>`) are the content to keep

### Established Patterns
- `bee-sidebar` is a pure presenter — close button should dispatch `close` CustomEvent, `bee-atlas` handles it
- Sidebar open/close controlled by `_sidebarOpen` boolean in `bee-atlas`; pass as `@property` or just conditionally render with `${this._sidebarOpen ? html\`<bee-sidebar ...>\` : nothing}`

### Integration Points
- `bee-atlas` render method: add `_sidebarOpen` state; wrap `<bee-sidebar>` in conditional; set to `true` in `_onSpecimenClick` and `_onSampleClick`, `false` in `_onClose`
- `bee-atlas` CSS: currently `bee-sidebar { flex-shrink: 0; width: 25rem; }` — this style only needs to apply when sidebar is rendered
- `bee-sidebar.ts` template: remove `_renderToggle()`, `_renderViewToggle()`, `_renderSummary()`, `_renderRecentSampleEvents()`, `_renderFeedsSection()` from render(); add close button

</code_context>

<specifics>
## Specific Ideas

- No specific references — straightforward implementation from decisions above

</specifics>

<deferred>
## Deferred Ideas

- Clicking empty map area to close sidebar (user chose close button only for now)
- Escape key to close sidebar
- Recent collections surface — removed, possible future phase if needed
- Feed subscription surface — removed with no replacement (per REQUIREMENTS.md)

</deferred>

---

*Phase: 54-sidebar-cleanup*
*Context gathered: 2026-04-13*
