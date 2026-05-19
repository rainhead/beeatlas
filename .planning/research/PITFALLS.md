# Pitfalls Research

**Domain:** Sidebar & table unification — three-state pane in Lit + Mapbox coordinator app
**Researched:** 2026-05-19
**Confidence:** HIGH (based on direct code inspection of all affected files)

---

## Critical Pitfalls

### Pitfall 1: `viewMode='table'` URL param left alive after table becomes a pane sub-state

**What goes wrong:**
`url-state.ts` `buildParams` currently emits `view=table` when `ui.viewMode === 'table'`. After the unification, table is a pane sub-state (call it `paneState: 'collapsed' | 'list' | 'table'`), not a top-level view mode. If the old `view=table` param is not removed from `buildParams`/`parseParams`, old shared URLs that contain `?view=table` will either silently no-op or produce a broken UI where table is shown inside a pane whose concept of "table mode" no longer maps to full-screen.

**Why it happens:**
`parseParams` constructs a `viewMode: 'map' | 'table'` from the `view=` param (url-state.ts line 224-225). `UiState` carries `viewMode`. `bee-atlas` reads `this._viewMode` and uses it to conditionally render `<bee-table>`. All three layers touch the same string. Changing the pane model to three states requires a coordinated change across all three — if any one is missed, the old param silently persists and is re-emitted.

**How to avoid:**
In the phase that introduces `paneState`, update `UiState`, `buildParams`, `parseParams`, and `_onViewChanged` atomically. Introduce a `pane=` param with the three-state vocabulary in the same commit that removes `viewMode`. Add a url-state round-trip test asserting that `view=table` in the query string is either migrated to the new param or dropped — not re-emitted, and not silently ignored on popstate.

**Warning signs:**
- `url-state.ts` still references `viewMode` after the pane refactor
- `parseParams` still has a `viewMode: 'map' | 'table'` branch
- Sharing a URL with `?view=table` still activates full-screen table behavior
- `buildParams` emits `view=table` for the new table-pane state

**Phase to address:**
Phase introducing the unified pane component — before any URL encoding of pane state is added.

---

### Pitfall 2: `bee-filter-panel._open` internal state becomes orphaned when panel moves into the pane

**What goes wrong:**
`bee-filter-panel` owns `@state() private _open = false`. The coordinator controls open/close through `setOpen(bool)` — an imperative method call, not a property. When the filter panel is merged into the unified pane, its open/close state must become driven by the pane's state machine. If `_open` remains internal and `setOpen` is the only escape hatch, any pane state transition that does not call `setOpen` leaves the internal boolean out of sync — the filter panel thinks it is open when the pane is collapsed, or vice versa.

**Why it happens:**
This is the exact pattern `bee-filter-panel` already exhibits for table-mode: `bee-atlas._onToggleFilter()` calls `setOpen(bool)` imperatively via `querySelector`. This worked as a one-off workaround but is fragile across multiple callers. The `externalOpen` property exists but is passed in as a `@property` and only used as a hint — the internal `_open` still gates rendering.

**How to avoid:**
Externalize open/close entirely. Remove `_open` from `bee-filter-panel` (or make `externalOpen` the sole source of truth replacing `_open`). The pane parent passes `open` as a property; `bee-filter-panel` does not own open state at all. The `setOpen` imperative method becomes unnecessary. Also remove the `document.addEventListener('click', ...)` document-level close listener from `bee-filter-panel` — the pane parent handles outside-click dismissal.

**Warning signs:**
- `setOpen` still exists on the merged component after unification
- `_open` is still `@state` inside the merged component while a parent also holds pane state
- Filter panel closes when clicking inside the pane (document click listener fires)
- Filter panel stays open when pane is collapsed via the toggle button

**Phase to address:**
Phase merging `bee-filter-panel` + `bee-sidebar` — redesign open/close ownership before wiring the pane toggle.

---

### Pitfall 3: Mapbox canvas does not resize when pane width changes

**What goes wrong:**
Mapbox GL JS does not observe container size changes by default. When the pane slides open (or table state expands the pane), the map canvas stays at its original pixel dimensions. This produces a blank strip on the right (or bottom on mobile) where the canvas does not cover the available space. Calling `map.resize()` is required after any layout change that alters the canvas container's dimensions.

**Why it happens:**
`bee-map` positions the Mapbox canvas inside a shadow DOM host. When the parent layout changes (pane appears, width changes), the host element resizes but the Mapbox canvas does not receive a native resize event — GL JS requires an explicit `map.resize()` call. The current code has no pane-width-change path; in the existing full-screen table mode the map shrinks to 18% height (`.table-mode bee-map { height: 18% }`) but no explicit `resize()` is triggered, which may already be a latent cosmetic gap.

**How to avoid:**
In `bee-map`, add a `ResizeObserver` on the host element (or the map container div) and call `map.resize()` in the callback. This is the idiomatic Mapbox pattern for dynamic layouts. The resize observer fires reliably when CSS dimensions change, including during pane open/close transitions. Alternative: emit a `pane-changed` event from the coordinator and handle it in `bee-map.updated()`, but the observer approach is self-contained and does not add a new cross-component coupling.

**Warning signs:**
- Map has a blank right-side strip when pane is open
- Map does not fill its container after switching pane states
- `map.getCanvas().width` does not match `map.getContainer().offsetWidth` after pane opens

**Phase to address:**
Phase introducing the pane toggle button and CSS that changes the map's effective width.

---

### Pitfall 4: Lazy-loaded `bee-table.ts` is not registered when pane transitions to table state

**What goes wrong:**
`bee-atlas.ts` lazy-imports `bee-table.ts` in three places: `firstUpdated` (when `initViewMode === 'table'`), `_onViewChanged` (when switching to table), and nowhere else. After unification, table is a pane sub-state navigated from `list` state. If the import call is missing from the new pane-state transition handler, the `<bee-table>` custom element is not registered when the table sub-state renders. Lit silently renders an unknown element — no error thrown, no rows shown.

**Why it happens:**
Dynamic imports are "fire and forget" — the call must be present in every code path that can render `<bee-table>`. In the current code the table is only rendered under `this._viewMode === 'table'`, so only two call sites need the import. After unification there will be a new code path (`_onPaneStateChanged`) that triggers table rendering, and the import call must be added there.

**How to avoid:**
Either (a) convert the dynamic `import('./bee-table.ts')` to a static import at the top of `bee-atlas.ts` — acceptable given that `bee-table.ts` is 421 lines with no heavy deps — or (b) centralize the import into a single `_ensureTableLoaded()` helper called from all pane-state transitions that target `'table'`. Never duplicate the raw dynamic import at multiple call sites.

**Warning signs:**
- `<bee-table>` renders as an empty unknown element in DevTools
- No error in console but table pane is blank
- `customElements.get('bee-table')` returns `undefined` when table pane is first opened via the new button

**Phase to address:**
Phase introducing the expand-to-table button in the pane.

---

### Pitfall 5: Mobile viewport broken when three-state pane is added without mobile guard

**What goes wrong:**
Mobile currently uses `@media (max-aspect-ratio: 1)` to switch `bee-sidebar` from absolute-positioned to `position: static; width: 100%`. The pane must not get three-state treatment on mobile — it should retain the existing open/closed binary behavior. If the three-state toggle button is rendered on mobile or if CSS for the `'table'` pane state is not gated behind the desktop media query, users get a partial-width pane that does not cover the full viewport, and the expand-to-table button appears on a mobile-sized screen where horizontal space is too tight for the table layout.

**Why it happens:**
The existing media query breakpoint is aspect-ratio-based, not width-based. The new pane will have state management in the coordinator (`_paneState: 'collapsed' | 'list' | 'table'`). Without an explicit guard, the state machine applies equally to all viewports. The CSS that sizes the pane at a fixed sidebar width will cause the wrong layout on narrow screens.

**How to avoid:**
Clamp `_paneState` to `'collapsed' | 'list'` on mobile. Add a `matchMedia('(max-aspect-ratio: 1)')` listener in `bee-atlas` that resets `_paneState` to `'list'` (or `'collapsed'`) whenever the viewport becomes portrait. CSS for `pane-state='table'` (e.g., fixed width, two-column layout) must live inside a `@media (min-aspect-ratio: 1)` rule. The expand-to-table button must be `display: none` on mobile.

**Warning signs:**
- Expand-to-table button appears on mobile
- Pane renders at sidebar width (not full-width) on mobile after the merge
- `_paneState === 'table'` is reachable on a portrait phone

**Phase to address:**
Phase introducing the three-state pane CSS — include mobile exclusion in the same phase, not as a follow-up.

---

### Pitfall 6: Summary data not loaded when pane opens in list state on initial map load

**What goes wrong:**
`_loadSummaryFromSQLite()` is currently called only when `_viewMode === 'table'` at startup, and from `_onViewChanged` when switching to table. In the new model, the filter panel is always visible in list state (the default pane state). `bee-filter-panel` needs `_summary` and `_taxaOptions` to populate the specimen count button and autocomplete. On first load in list mode, these are populated by `_onDataLoaded` (fired by Mapbox's tile load). If the summary loading path is inadvertently left table-only, the filter panel will show "… specimens" permanently in list mode.

**Why it happens:**
The `_loadSummaryFromSQLite` path is currently guarded by `_viewMode === 'table'`. In the new pane model, the filter panel is always present (not just in table mode), so the summary must always load. The data flow for `_taxaOptions` and `_countyOptions` in map mode comes from `_onDataLoaded` (the Mapbox tile load event), not from SQLite. These two paths must remain separate after unification.

**How to avoid:**
Verify that `_taxaOptions`, `_countyOptions`, `_ecoregionOptions`, and `_collectorOptions` are populated from `_onDataLoaded` for map mode (unchanged). Verify that `_loadSummaryFromSQLite` is called unconditionally (not gated on pane state) so the filter panel's specimen count is populated even when the pane is in list state. Add a Vitest test: mount `bee-atlas`, simulate data-loaded, assert `specimenCount` is non-null in list pane state.

**Warning signs:**
- Filter panel always shows "… specimens" and never a real count
- Autocomplete suggestions are always empty on initial load
- `_summary` is null when the pane is in list state

**Phase to address:**
Phase merging filter panel into the pane — audit both data-load paths before writing the merge.

---

### Pitfall 7: `_tableFilterOpen` / `setOpen` imperative coupling survives the merge as dead or broken code

**What goes wrong:**
`bee-atlas` holds `_tableFilterOpen: boolean` specifically to drive `bee-filter-panel.setOpen()` in table mode. The coordinator calls `(this.shadowRoot?.querySelector('bee-filter-panel') as any)?.setOpen(this._tableFilterOpen)` from `_onToggleFilter`. After the merge, if `bee-filter-panel` is no longer a separate element (it is merged into the pane), this `querySelector` silently returns `null` and the toggle button in the table toolbar does nothing.

**Why it happens:**
`querySelector` with `as any` cast is type-unsafe and silently no-ops on mismatch. If the custom element tag name changes or the element is inside a different shadow root, the call fails silently. This pattern was always a temporary workaround; the merge is the correct time to eliminate it.

**How to avoid:**
Delete `_tableFilterOpen` from `bee-atlas`. Replace the imperative `setOpen` call with a reactive property (`filterPanelOpen: boolean`) passed to the pane. The pane reads that property and shows/hides the filter section accordingly. Eliminate all `querySelector` casts to `any` that reach into child shadow DOMs.

**Warning signs:**
- "Filter" button in table toolbar is non-functional after the merge
- `_tableFilterOpen` still present in `bee-atlas` after merge
- `setOpen` method still exists on the merged component

**Phase to address:**
Phase merging filter panel into the pane — delete `_tableFilterOpen` in the same commit as the merge.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep `viewMode: 'map' \| 'table'` in `UiState` and add `paneState` alongside it | Avoids touching URL round-trip tests during pane refactor | Two overlapping state fields that can get out of sync; `view=table` URL param persists but is meaningless | Never — clean up in the same phase |
| Use `querySelector('bee-filter-panel') as any` to drive pane state | Quick workaround for imperative open/close | Silent failure when element tag changes; undetectable in TypeScript | Never |
| Defer mobile pane exclusion to a polish phase | Faster desktop-first delivery | Broken mobile UX ships; risk of re-working pane state machine after CSS is settled | Never — mobile guard must ship in the same phase as three-state CSS |
| Eagerly import `bee-table.ts` at module scope in bee-atlas.ts | Eliminates lazy-import silent failure class | Slightly larger initial bundle (acceptable — `bee-table.ts` is 421 lines, no heavy deps) | Acceptable for this project |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Mapbox resize | Relying on CSS flexbox resize to notify the canvas | Call `map.resize()` explicitly; use `ResizeObserver` on the host element in `bee-map` |
| Lit `updated()` for pane width change | Passing `paneState` as a property to `bee-map` and triggering resize in `updated()` | Works, but ResizeObserver in `bee-map` is self-contained and does not require the coordinator to know Mapbox resize semantics |
| `bee-filter-panel` place names lazy load | `_placeNameBySlug` is empty until `_ensurePlaceNamesLoaded()` is called — triggered by `setOpen` | After open/close becomes property-driven, call `_ensurePlaceNamesLoaded()` in `updated()` whenever `open` becomes true |
| `bee-table` lazy import | `import('./bee-table.ts')` has no `await` — element may not be registered by the time Lit renders `<bee-table>` on the same microtask | Prefer static import to eliminate the race entirely |
| URL `popstate` and pane state | `_onPopState` restores `_viewMode` but after unification there is no `paneState` in the URL yet | Add `pane=` to `buildParams`/`parseParams` in the same phase as the pane state machine, or `popstate` will reset the pane to collapsed on back-navigation |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Pane open/close triggers full `_runFilterQuery` | Filter query fires on every pane toggle, even when filter state has not changed | Pane open/close must not touch `_filterState`; only `filter-changed` events should trigger the query | Immediately — wasted SQLite round-trips per toggle |
| `_loadSummaryFromSQLite` called redundantly on pane open | Summary query fires every time the pane enters list state | Call summary load once (on `tablesReady`), cache result in `_summary`, never re-fetch | At low query volume it is unnoticeable, but adds 50-200ms latency to pane open |
| Table state triggers `_runTableQuery` even when filter/sort is unchanged | User switches to table pane; filter unchanged; table re-queries the full page | Guard `_runTableQuery` with a dirty flag or only trigger it when `paneState` transitions to `'table'` and filter or sort has actually changed | Noticeable on slow network — full 45k-row page query on every pane toggle |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Pane toggle button overlaps Mapbox controls (zoom +/-) | User cannot reach zoom controls; pane button obscures the top-right corner | Offset pane button to avoid Mapbox default control position (top-right); or move Mapbox controls to bottom-right |
| Table pane state clears sidebar occurrences silently | User has a cluster selected in list state, clicks expand-to-table — occurrences disappear | Preserve `_selectedOccIds` when transitioning to table state; `bee-table` already highlights selected rows |
| Filter panel `_open` animation plays inside an also-animating pane | Pane goes from collapsed to list — filter panel animates open inside a pane that is itself animating | Remove filter panel's own open animation when it is always-shown inside the pane; keep animation only for the pane toggle itself |
| No visual distinction between pane's list and table states | Users do not understand the expand button | Use distinct icons (list-lines icon for list state, grid/table icon for table state); button must have a toggle-like affordance |

---

## "Looks Done But Isn't" Checklist

- [ ] **Pane toggle button:** Verify `aria-expanded` reflects actual pane state, not just a boolean class; verify keyboard focus moves into pane on expand.
- [ ] **URL round-trip:** After replacing `viewMode` with `paneState`, verify `?pane=table` restores table state on page load AND that old `?view=table` URLs do not 404 or silently no-op — they should redirect to or be treated as the new param equivalent.
- [ ] **Mapbox resize:** After pane opens/closes, verify `map.getCanvas().width === map.getContainer().offsetWidth` (no blank strip).
- [ ] **Mobile non-regression:** On portrait viewport, verify pane shows as full-width open/close (no three-state, no expand-to-table button).
- [ ] **Filter panel data:** After page load in list pane state (no prior table mode), verify `specimenCount` is populated and autocomplete suggests taxa.
- [ ] **`bee-table` registration:** Verify `customElements.get('bee-table')` is defined when table pane first renders.
- [ ] **`setOpen` eliminated:** Verify no `querySelector` casts reach into child shadow DOMs after the merge.
- [ ] **`_tableFilterOpen` deleted:** Verify no stale boolean lingers in `bee-atlas` state after `_tableFilterOpen` is superseded by pane-state-driven filter visibility.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| URL param collision (`view=table` persists) | LOW | Add `parseParams` migration: if `view=table` present and no `pane=` param, return `paneState: 'table'`; remove old branch |
| `_open` internal state desync | MEDIUM | Delete `_open` from merged component; add `open` as `@property`; update all render guards from `this._open` to `this.open` |
| Mapbox blank strip | LOW | Add `ResizeObserver` to `bee-map` constructor; call `this._map.resize()` in callback |
| `bee-table` not registered | LOW | Convert dynamic `import('./bee-table.ts')` to static import at top of `bee-atlas.ts` |
| Mobile layout broken | MEDIUM | Add `matchMedia` listener to clamp `_paneState`; add CSS `@media` guards; QA on physical device |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| URL `viewMode`/`paneState` collision | Phase introducing unified pane component | url-state round-trip test: `view=table` either maps to new param or is ignored; `pane=table` round-trips correctly |
| `_open` internal state orphaned | Phase merging bee-filter-panel + bee-sidebar | Grep for `_open` in merged component — must be gone; `setOpen` method must not exist |
| Mapbox canvas no-resize | Phase introducing pane toggle CSS | Manual: open/close pane, verify no blank strip; automated: `map.getCanvas().width` assertion in ResizeObserver test |
| `bee-table` lazy import missing | Phase introducing expand-to-table button | `customElements.get('bee-table')` assertion in Vitest render test for table pane state |
| Mobile three-state regression | Phase introducing pane CSS | Manual QA on portrait viewport; CSS: expand-to-table button is `display:none` in portrait media query |
| Summary data not in list mode | Phase merging filter panel into pane | Vitest: mount bee-atlas, simulate data-loaded, assert `specimenCount` non-null in list state |
| `_tableFilterOpen` dead coupling | Phase merging filter panel | Grep: `_tableFilterOpen` must not appear in bee-atlas.ts after merge; `setOpen` must not appear on merged component |

---

## Sources

- Direct inspection of `src/bee-atlas.ts` (coordinator, all state fields and event handlers)
- Direct inspection of `src/bee-filter-panel.ts` (`_open` state, `setOpen` method, document-click listener, `externalOpen` property)
- Direct inspection of `src/bee-sidebar.ts` (thin layout shell, close event)
- Direct inspection of `src/bee-table.ts` (lazy import pattern, pagination, filter button, `toggle-filter` event)
- Direct inspection of `src/url-state.ts` (`viewMode: 'map' | 'table'`, `buildParams`, `parseParams`, `UiState`)
- `CLAUDE.md` architecture invariants (state ownership, filter race guard, style cache)
- `PROJECT.md` v3.9 active milestone requirements and key decisions log

---
*Pitfalls research for: sidebar & table unification (v3.9)*
*Researched: 2026-05-19*
