---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/bee-map.ts
  - frontend/src/bee-filter-controls.ts
  - frontend/src/bee-atlas.ts
  - frontend/src/bee-sidebar.ts
autonomous: true
must_haves:
  truths:
    - "Region overlay toggle (Off/Counties/Ecoregions) no longer appears in the sidebar"
    - "A layers button overlays the map (bottom-left or top-right) and opens a small menu"
    - "Selecting a region mode from the menu changes the map overlay and closes the menu"
    - "Boundary mode state still persists in URL and restores on reload"
    - "Clicking map regions to filter by county/ecoregion still works"
  artifacts:
    - path: "frontend/src/bee-map.ts"
      provides: "Floating layers button + popover menu rendered inside shadow DOM"
    - path: "frontend/src/bee-filter-controls.ts"
      provides: "Boundary toggle removed from render output"
    - path: "frontend/src/bee-atlas.ts"
      provides: "Handles new boundary-mode-changed event from bee-map"
  key_links:
    - from: "frontend/src/bee-map.ts"
      to: "frontend/src/bee-atlas.ts"
      via: "boundary-mode-changed custom event"
      pattern: "boundary-mode-changed"
---

<objective>
Move the region overlay control (Off/Counties/Ecoregions toggle) from the sidebar filter controls to a floating button on the map that opens a small popover menu.

Purpose: The region overlay only affects the map display, not the table view. Placing it on the map makes it contextually correct and frees sidebar space.

Output: Region overlay toggle rendered as a map-overlay button/menu in bee-map, removed from bee-filter-controls.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@frontend/src/bee-map.ts
@frontend/src/bee-filter-controls.ts
@frontend/src/bee-atlas.ts
@frontend/src/bee-sidebar.ts
@frontend/src/region-layer.ts

<interfaces>
<!-- bee-atlas owns _boundaryMode state, passes it down as property -->
<!-- bee-filter-controls currently fires 'filter-changed' with boundaryMode bundled in -->
<!-- New pattern: bee-map emits dedicated 'boundary-mode-changed' event -->

From bee-sidebar.ts:
```typescript
export interface FilterChangedEvent {
  taxonName: string | null;
  taxonRank: 'family' | 'genus' | 'species' | null;
  yearFrom: number | null;
  yearTo: number | null;
  months: Set<number>;
  selectedCounties: Set<string>;
  selectedEcoregions: Set<string>;
  selectedCollectors: CollectorEntry[];
  boundaryMode: 'off' | 'counties' | 'ecoregions';  // currently bundled here
}
```

Architecture invariant: bee-map is a pure presenter — receives state as properties, emits custom events upward to bee-atlas. The new overlay button follows this pattern: it renders UI inside bee-map's shadow DOM and emits `boundary-mode-changed` events.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove boundary toggle from bee-filter-controls and clean up boundaryMode plumbing</name>
  <files>frontend/src/bee-filter-controls.ts, frontend/src/bee-sidebar.ts</files>
  <action>
In `bee-filter-controls.ts`:
1. Remove the `boundaryMode` property declaration (line ~195).
2. Remove the `_onBoundaryToggle` method (lines ~442-449).
3. Remove the 3-button boundary toggle from `render()` (the `div.layer-toggle` containing Off/Counties/Ecoregions buttons, lines ~453-457).
4. In `_emitFilterChanged()` (line ~348-352), stop including `boundaryMode` in the detail. The event detail should just spread `f` without `boundaryMode`. Set `boundaryMode` to `'off'` as a placeholder to satisfy the existing `FilterChangedEvent` type for now -- we will remove it from the type in the next step.

In `bee-sidebar.ts`:
1. Remove the `boundaryMode` property declaration (line ~105).
2. Remove passing `.boundaryMode` to `<bee-filter-controls>` in the render method (line ~361).
3. Remove `boundaryMode` from the `FilterChangedEvent` interface (line ~68). This is the key type change.

In `bee-atlas.ts` `_onFilterChanged` handler (line ~585-623):
1. Remove the lines that read `detail.boundaryMode` and update `this._boundaryMode` (lines ~587, 600-602). The filter-changed event no longer carries boundary mode.
2. Remove passing `.boundaryMode` to `<bee-sidebar>` in the render template (line ~178). Sidebar no longer needs it.

In `bee-filter-controls.ts` `_emitFilterChanged()` and `_onBoundaryToggle`: since `boundaryMode` is removed from `FilterChangedEvent`, the `_emitFilterChanged` method just dispatches `{ ...f }` without boundaryMode. Delete `_onBoundaryToggle` entirely.
  </action>
  <verify>
    <automated>cd /Users/rainhead/dev/beeatlas/frontend && npx tsc --noEmit</automated>
  </verify>
  <done>Boundary toggle is fully removed from sidebar/filter-controls. FilterChangedEvent no longer includes boundaryMode. TypeScript compiles clean.</done>
</task>

<task type="auto">
  <name>Task 2: Add floating region overlay button and popover menu to bee-map</name>
  <files>frontend/src/bee-map.ts, frontend/src/bee-atlas.ts</files>
  <action>
In `bee-map.ts`:

1. Add a `@state()` private `_regionMenuOpen = false` field to track popover visibility.

2. Add CSS for the overlay button and menu to `static styles`. Position it at bottom-left of the map, above the OL attribution, with `position: absolute`:
   ```
   .region-control { position: absolute; bottom: 2rem; left: 0.5rem; z-index: 1; }
   .region-btn { background: white; border: 1px solid rgba(0,0,0,0.3); border-radius: 4px; padding: 0.4rem 0.6rem; cursor: pointer; font-size: 0.85rem; box-shadow: 0 1px 4px rgba(0,0,0,0.15); display: flex; align-items: center; gap: 0.3rem; }
   .region-btn:hover { background: #f0f0f0; }
   .region-menu { position: absolute; bottom: 100%; left: 0; margin-bottom: 0.3rem; background: white; border: 1px solid rgba(0,0,0,0.2); border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); min-width: 10rem; overflow: hidden; }
   .region-menu button { display: block; width: 100%; text-align: left; padding: 0.5rem 0.75rem; border: none; background: transparent; cursor: pointer; font-size: 0.85rem; }
   .region-menu button:hover { background: #f0f0f0; }
   .region-menu button.active { font-weight: 600; color: var(--accent, #2c7be5); }
   ```
   Also update `:host` to add `position: relative` so the absolute-positioned overlay is contained.

3. Update `render()` to include the overlay control alongside the map div:
   ```typescript
   render() {
     const label = this.boundaryMode === 'off' ? 'Regions'
       : this.boundaryMode === 'counties' ? 'Counties'
       : 'Ecoregions';
     return html`
       <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ol@v10.8.0/ol.css" type="text/css" />
       <div id="map"></div>
       <div class="region-control">
         ${this._regionMenuOpen ? html`
           <div class="region-menu">
             <button class=${this.boundaryMode === 'off' ? 'active' : ''} @click=${() => this._selectBoundary('off')}>Off</button>
             <button class=${this.boundaryMode === 'counties' ? 'active' : ''} @click=${() => this._selectBoundary('counties')}>Counties</button>
             <button class=${this.boundaryMode === 'ecoregions' ? 'active' : ''} @click=${() => this._selectBoundary('ecoregions')}>Ecoregions</button>
           </div>
         ` : ''}
         <button class="region-btn" @click=${this._toggleRegionMenu}>
           <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
             <rect x="1" y="1" width="6" height="6" rx="1"/>
             <rect x="9" y="1" width="6" height="6" rx="1"/>
             <rect x="1" y="9" width="6" height="6" rx="1"/>
             <rect x="9" y="9" width="6" height="6" rx="1"/>
           </svg>
           ${label}
         </button>
       </div>
     `;
   }
   ```

4. Add methods:
   ```typescript
   private _toggleRegionMenu() {
     this._regionMenuOpen = !this._regionMenuOpen;
   }

   private _selectBoundary(mode: 'off' | 'counties' | 'ecoregions') {
     this._regionMenuOpen = false;
     if (mode === this.boundaryMode) return;
     this._emit<'off' | 'counties' | 'ecoregions'>('boundary-mode-changed', mode);
   }
   ```

5. Close the menu when clicking outside: In `firstUpdated`, after creating the OL map, add a click listener on `this.mapElement` (the `#map` div) that sets `this._regionMenuOpen = false`. This ensures clicking the map closes the popover.

In `bee-atlas.ts`:

1. Add a new handler:
   ```typescript
   private _onBoundaryModeChanged(e: CustomEvent<'off' | 'counties' | 'ecoregions'>) {
     this._boundaryMode = e.detail;
     this._pushUrlState();
   }
   ```

2. In the `render()` template, add `@boundary-mode-changed=${this._onBoundaryModeChanged}` to the `<bee-map>` element.
  </action>
  <verify>
    <automated>cd /Users/rainhead/dev/beeatlas/frontend && npx tsc --noEmit && npm run build</automated>
  </verify>
  <done>Floating region overlay button appears on the map. Clicking it opens a menu with Off/Counties/Ecoregions. Selecting an option updates the map boundary layer and closes the menu. The button label reflects the current mode. Build succeeds with no errors.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>Region overlay control moved from sidebar to floating map button</what-built>
  <how-to-verify>
    1. Run `cd frontend && npm run dev` and open the app
    2. Verify the Off/Counties/Ecoregions toggle is gone from the sidebar
    3. Verify a "Regions" button appears floating over the bottom-left of the map
    4. Click the button -- a small menu should appear with Off, Counties, Ecoregions
    5. Select "Counties" -- county boundaries should appear on the map, button label changes to "Counties"
    6. Click a county polygon -- it should highlight and filter specimens (existing behavior preserved)
    7. Select "Ecoregions" -- ecoregion boundaries should appear
    8. Select "Off" -- boundaries disappear, button label returns to "Regions"
    9. Click the map background while menu is open -- menu should close
    10. Set a boundary mode, reload the page -- boundary mode should persist via URL
    11. Switch to Table view -- the region button should not be visible (bee-map is not rendered)
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

No new trust boundaries introduced. This is a pure UI reorganization moving an existing control between components. No new data flows, no new inputs from untrusted sources.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | T (Tampering) | boundary-mode-changed event | accept | Event only carries one of three string literals ('off'/'counties'/'ecoregions'); bee-atlas already validates boundary mode values via TypeScript union type. No user-supplied free text. |
</threat_model>

<verification>
- `cd frontend && npx tsc --noEmit` passes
- `cd frontend && npm run build` succeeds
- No references to boundaryMode remain in bee-filter-controls.ts or bee-sidebar.ts (except type imports if any)
- bee-map.ts contains the new region-control overlay
- bee-atlas.ts handles boundary-mode-changed event
</verification>

<success_criteria>
- Region overlay toggle is removed from sidebar
- Floating button on map opens popover with Off/Counties/Ecoregions
- Selecting a mode updates the map boundary layer
- URL persistence of boundary mode still works
- Existing region-click filtering still works
- TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/260408-roy-move-region-overlay-control-from-sidebar/260408-roy-SUMMARY.md`
</output>
