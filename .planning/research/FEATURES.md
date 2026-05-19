# Feature Landscape — v3.9 Sidebar & Table Unification

**Domain:** Three-state collapsible/expandable sidebar pane in a data-heavy mapping application (Lit/Mapbox GL JS, desktop-first)
**Researched:** 2026-05-19
**Confidence:** HIGH — grounded in codebase inspection plus verified UX patterns from W3C WAI-ARIA APG, ArcGIS Experience Builder docs, and CSS animation research.

> Scope: What UX behaviors belong to the new unified three-state pane (collapsed / list / table), what are differentiators, what to explicitly avoid, and what each feature depends on.

---

## Context: What Already Exists

Three separate components are being merged into one unified pane:

- `bee-filter-panel` (884 lines) — floating, self-manages `_open` state, has `hideButton` / `externalOpen` / `openUpward` escape hatches
- `bee-sidebar` (125 lines) — absolutely positioned overlay, shows occurrence detail or "click a point" hint
- `bee-table` (distinct component) — full-screen mode that replaces the map via `_viewMode: 'map' | 'table'` in `bee-atlas`

URL state is already encoded via `buildParams`/`parseParams` in `url-state.ts`. The `view=table` param drives `_viewMode`. `bee-atlas` owns all reactive state. This architecture is a hard constraint for the new pane — the pane must remain a pure presenter (receives state, emits events).

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Single visible toggle button in collapsed state | Users need a clear re-open affordance at all times on desktop; losing the pane with no button is confusing | LOW | Fixed-position button, always in DOM, changes icon between states. Chevron or panel-expand icon. |
| Smooth CSS transition on state change | Users expect sliding/fade transitions on any panel open/close — jarring snap is perceived as broken | LOW | Animate `transform: translateX()` or `width` only if GPU-composited. Use `translateX` + fixed position to avoid layout reflow. See animation section. |
| `Escape` key closes pane to collapsed | Standard expectation for any overlay/panel; also required by WCAG 2.1.1 for keyboard-only users | LOW | `keydown` listener on document while pane is open, dispatch `close` event upward. |
| `aria-expanded` on toggle button | Screen readers must announce whether pane is open or closed (WCAG 4.1.2) | LOW | Single attribute, updated on state change. |
| Filter state visible in list state | Users need to see what filters are active without switching to full table; filter chips / summary are table stakes for any data explorer | MEDIUM | `bee-filter-panel` content rendered inside pane in list state. Already built — wire into pane. |
| Occurrence detail rendered in list state | `bee-sidebar` content rendered in list state when a cluster/selection is active | LOW | Already built in `bee-occurrence-detail`. Compose inside the pane. |
| Table state shows `bee-table` | The table was previously a full-screen mode; users expect tabular data accessible from the pane without replacing the map entirely | MEDIUM | `bee-table` rendered inside pane in table state; map stays visible (shrinks or stays full-width behind pane). |
| URL round-trip for pane state | Existing `view=table` URL param already drives `_viewMode`; the pane state must encode to URL so shared/bookmarked links restore the pane position | LOW | Extend existing `url-state.ts` `UiState` — rename/extend `viewMode` field or add `paneState: 'collapsed'|'list'|'table'`. |
| Mobile preserves existing open/close | PROJECT.md explicitly requires no three-state treatment on mobile | LOW | Detect via CSS media query (aspect-ratio breakpoint already present in `bee-atlas`). Pane component ignores table-expand button on mobile. |
| Focus management on open | When the pane opens, focus moves into it (first interactive element); when closed, focus returns to the toggle button | MEDIUM | Required by WCAG 2.4.3 Focus Order. Use `element.focus()` after transition. |

### Differentiators (Competitive Advantage)

Features that go beyond baseline but add real value for this specific use case.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Two-button affordance: toggle + expand-to-table | In list state, a separate "expand to table" button makes the three-state progression explicit; users don't have to discover it via drag or context menu | LOW | A secondary button rendered inside the pane header in list state. Common in ArcGIS Instant Apps Sidebar template. |
| Persist pane state across page loads | Returning users expect their layout preference remembered; pane state in `localStorage` means they don't re-open the pane on every visit | LOW | `localStorage.setItem('paneState', ...)` on state change. Falls back to default if missing. Does NOT go in URL (URL encodes intent, not persistent layout preference). |
| Pane width configurable via drag handle | Data-heavy list/table views benefit from horizontal width control; different users want more map vs. more data | HIGH | Requires drag listeners, `min-width`/`max-width` constraints, `localStorage` width persistence. Arrow keys on handle for keyboard resize. Not in scope for v3.9 — defer. |
| Filter summary chip row when collapsed | Show active filter count or abbreviated chips below the toggle button when collapsed — users can tell filters are active without opening the pane | MEDIUM | Adds a compact state below the toggle button showing e.g. "3 filters active". Useful but not blocking. |
| Animate map resize as pane expands | When pane opens, map container smoothly shrinks rather than being covered; gives spatial continuity | MEDIUM | Requires coordinating CSS transitions on both pane and map container. Complex with Mapbox GL which must call `map.resize()` after layout change. Calls `map.resize()` at transition end via `transitionend` event. |

### Anti-Features (Explicitly Do Not Build)

| Feature | Why Requested | Why Wrong | What to Do Instead |
|---------|---------------|-----------|-------------------|
| Animate `width` property | Feels natural for a sidebar that grows/shrinks | `width` animation forces layout recalculation every frame; causes jank on lower-end devices and saturates main thread | Animate `translateX` with fixed positioning, OR animate `max-width` with `overflow: hidden`. The latter reflows but only one axis. The `translateX` approach (GitLab pattern) is the high-fidelity choice. |
| Three-state treatment on mobile | "Consistency" across breakpoints | Mobile screen is too narrow for a persistent pane + visible map; the existing open/close overlay is correct for mobile | Use the existing `@media (max-aspect-ratio: 1)` breakpoint to suppress the expand-to-table button and keep two-state behavior. |
| Pane state in URL for collapsed vs list | "Share your exact view" | Collapsed is a layout preference, not a content state. Sharing `?pane=collapsed` would cause recipients to load the page with no pane visible — worse than defaulting to list. Table state IS meaningful (shares a specific data view) and belongs in URL. | Encode `view=table` in URL (already done for the old full-screen mode). Collapsed vs. list: restore from `localStorage`, not URL. |
| Drag resize on v3.9 | Power users want it | Drag resize requires handling `mousemove`, `mouseup`, `touch*`, keyboard arrow resize on the handle, `min-width`/`max-width` guards, `localStorage` width save, AND triggering `map.resize()` after drag — a distinct mini-feature with its own bugs (misfire on fast drags, resize during filter queries). Scope creep for this milestone. | Defer. Add a separate task for "resizable pane" after unification ships. |
| Pane as a `<dialog>` or modal on desktop | Semantic correctness | A `<dialog>` traps focus and requires explicit dismiss; incorrect for a persistent data panel that coexists with the map | Use `role="complementary"` (ARIA landmark for sidebar) or `role="region"` with `aria-label`. Not `role="dialog"`. |
| Tabs inside the pane for filter vs. detail | "Clean separation" | Filters and occurrence detail are complementary, not competing — users want to see both. Tabs would require switching to see detail after filtering. | Compose both in a scrollable single column: filters above, occurrence detail below (or vice versa). |
| Separate CSS transition per state direction | "Feels right-to-left vs left-to-right" | Directional transitions (slide-in from right when expanding to table, slide back when collapsing) are complex to implement correctly with Lit's reactive rendering and Mapbox's resize event | Single `transition: transform 200ms ease` on the pane; keep it simple. |

---

## Feature Dependencies

```
Collapsed/list/table pane state (bee-atlas @state)
    drives --> pane render mode (which sub-component renders inside)
    drives --> toggle button icon
    drives --> URL param (view=table for table state)
    drives --> map.resize() call (on any state change that changes map visible area)

bee-filter-panel content
    requires --> pane is in list or table state
    already built --> compose inside unified pane

bee-occurrence-detail content
    requires --> pane is in list state AND selectedOccurrences non-null
    already built --> compose inside unified pane

bee-table content
    requires --> pane is in table state
    already built --> compose inside unified pane
    triggers --> map.resize() call at transition end

Expand-to-table button
    requires --> pane is in list state
    drives --> pane state transition to table
    visible only on desktop (≥ aspect ratio breakpoint)

Toggle button (always visible)
    visible in all three states
    drives --> collapsed ↔ list transition

URL round-trip
    requires --> url-state.ts UiState extended or viewMode semantics changed
    list state is default (no URL param); table state encodes as view=table; collapsed encodes as view=collapsed (new value) or omitted (depends on decision)

localStorage pane state
    independent of URL
    read at init before URL parse; URL overrides if view= present

focus management
    requires --> transition end event (do not focus before animation complete)
    drives --> first focusable element in pane on open; toggle button on close
```

### Dependency Notes

- **map.resize() must fire after pane transitions:** Mapbox GL requires explicit `map.resize()` when the map container changes size. Wire to `transitionend` on the pane element, dispatched as a `pane-resized` custom event that `bee-atlas` handles by calling down to `bee-map`.
- **bee-atlas owns the state, not the pane:** `_paneState: 'collapsed'|'list'|'table'` lives in `bee-atlas`, matching the CLAUDE.md architecture invariant. The pane component receives `paneState` as a `@property` and emits `pane-state-changed` events.
- **bee-filter-panel's internal `_open` toggle is superseded:** In the unified pane, the filter is always visible when the pane is open. `bee-filter-panel`'s own toggle button and `_open` state become irrelevant. Either pass `hideButton=true externalOpen=true` (the existing escape hatches) or refactor to remove the internal toggle entirely. The `hideButton` property already exists for this.

---

## MVP Definition for v3.9

### Must Have (v3.9 ships these)

- [ ] `bee-atlas` `_paneState: 'collapsed' | 'list' | 'table'` replaces `_viewMode` and `_sidebarOpen`
- [ ] Single `<bee-pane>` component (or renamed `bee-sidebar`) with three render modes
- [ ] Toggle button always visible; expand-to-table button visible in list state on desktop
- [ ] CSS transition on state changes (translateX or max-width, 150–200ms)
- [ ] `Escape` key closes to collapsed
- [ ] `aria-expanded` on toggle button; `role="complementary"` on pane
- [ ] URL param: `view=table` encodes table state (existing param reused); collapsed/list round-trip via localStorage
- [ ] `pane-resized` event triggers `map.resize()` via `bee-atlas`
- [ ] Mobile: no three-state; existing open/close behavior preserved

### Add After Validation (v3.9+)

- [ ] Filter summary chips visible when pane is collapsed — add after observing whether users miss filter status
- [ ] Smooth map-container resize animation — needs `transitionend` coordination; add if the snap is jarring in user testing
- [ ] `prefers-reduced-motion` check — skip transitions when set; low effort but defer until animation is wired

### Defer to Future Milestone

- [ ] Drag-to-resize pane — distinct feature, separate milestone; see anti-features
- [ ] Pane state in URL for collapsed (sharing layout preference has no clear benefit)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Toggle button + three-state transitions | HIGH | LOW | P1 |
| Unified filter + detail + table in one pane | HIGH | MEDIUM | P1 |
| URL round-trip (view=table) | HIGH | LOW | P1 — existing param, extend semantics |
| `Escape` key + `aria-expanded` | MEDIUM | LOW | P1 — accessibility baseline |
| Focus management on open/close | MEDIUM | LOW | P1 |
| map.resize() on transition end | HIGH | LOW | P1 — Mapbox requires it |
| localStorage pane state | MEDIUM | LOW | P2 |
| Filter chips in collapsed state | LOW | MEDIUM | P3 |
| Drag resize | LOW | HIGH | Defer |

---

## Sources

- WAI-ARIA APG Disclosure pattern: https://www.w3.org/WAI/ARIA/apg/patterns/
- ArcGIS Experience Builder Sidebar widget (verified states, auto-expand on selection, resize): https://doc.arcgis.com/en/experience-builder/latest/configure-widgets/sidebar-widget.htm
- Sidebar animation performance — `translateX` vs `width` reflow, GPU compositing: https://www.joshuawootonn.com/sidebar-animation-performance
- MDN `prefers-reduced-motion`: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion
- Codebase inspection: `src/bee-atlas.ts`, `src/bee-sidebar.ts`, `src/bee-filter-panel.ts`, `src/bee-table.ts`, `src/url-state.ts`
- CLAUDE.md architecture invariants (state ownership in `bee-atlas`, pure-presenter children)

*Feature research for: v3.9 Sidebar & Table Unification*
*Researched: 2026-05-19*
