# Phase 68: Filter Panel Redesign — Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 3 (1 new, 2 modified)
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `frontend/src/bee-filter-panel.ts` | component (overlay) | event-driven (toggle + filter-changed) | `frontend/src/bee-filter-toolbar.ts` | role-match (wrapper → floating panel) |
| `frontend/src/bee-atlas.ts` | coordinator/owner | request-response | itself | self (modify existing) |
| `frontend/src/bee-filter-controls.ts` | component (filter input) | event-driven | itself | self (modify: remove localStorage) |

---

## Pattern Assignments

### `frontend/src/bee-filter-panel.ts` (new component, map overlay)

**Primary analog:** `frontend/src/bee-filter-toolbar.ts`
**Secondary analog (for absolute overlay positioning):** `frontend/src/bee-map.ts` (`.region-control` pattern)

#### Imports pattern — copy from `bee-filter-toolbar.ts` lines 1–5

```typescript
import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { FilterState, CollectorEntry } from './filter.ts';
import type { DataSummary, TaxonOption } from './bee-sidebar.ts';
import './bee-filter-controls.ts';
```

Add `isFilterActive` from `filter.ts` (used to drive the active-state CSS class on the toggle button):

```typescript
import { isFilterActive } from './filter.ts';
```

#### `@property` inputs — copy from `bee-filter-toolbar.ts` lines 9–15 (same set, minus summary can be added for count display)

```typescript
@property({ attribute: false }) filterState!: FilterState;
@property({ attribute: false }) taxaOptions: TaxonOption[] = [];
@property({ attribute: false }) countyOptions: string[] = [];
@property({ attribute: false }) ecoregionOptions: string[] = [];
@property({ attribute: false }) collectorOptions: CollectorEntry[] = [];
@property({ attribute: false }) summary: DataSummary | null = null;

@state() private _open = false;
```

#### Toggle state pattern — copy from `bee-filter-toolbar.ts` lines 74–84 (`_toggleMenu` + `_menuOpen`)

The `_open` state follows the exact same toggle pattern used for `_menuOpen` in the toolbar, and for `_sidebarOpen` in `bee-atlas.ts`:

```typescript
private _togglePanel() {
  this._open = !this._open;
}
```

#### Overlay CSS positioning — copy from `bee-map.ts` lines 148–153

The floating panel trigger button is an absolutely-positioned overlay inside `.content` (which has `position: relative` per `bee-atlas.ts` lines 81–86). The `bee-map` `:host` itself has `position: relative` (line 140–144), and the `.region-control` sits at `top: 0.5em, right: 0.5em`. The filter control sits at the same `top: 0.5em`, to the left of the Regions button (D-10: use a flex row container for the two controls, or set a `right` that accounts for Regions button width).

```css
/* Inside bee-map.ts host — position: relative is already set on :host */
.region-control {
  position: absolute;
  top: 0.5em;
  right: 0.5em;
  z-index: 1;
}
```

For `bee-filter-panel`, the component will be placed **inside `<bee-map>`** (per D-10), so it renders its own trigger absolutely. The recommended CSS for the new component's host and inner layout:

```css
:host {
  position: absolute;
  top: 0.5em;
  /* right offset is set by bee-map to account for region control width */
  z-index: 1;
}
.panel-container {
  position: relative;  /* anchor for expanded panel dropdown */
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
```

#### Map-overlay button style — copy from `bee-map.ts` lines 154–166

The toggle trigger button (collapsed state) should visually match the `.region-btn` style — white background, subtle box-shadow, border-radius:

```css
.filter-btn {
  background: white;
  border: 1px solid rgba(0,0,0,0.3);
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
  cursor: pointer;
  font-size: 0.85rem;
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.filter-btn:hover { background: #f0f0f0; }
.filter-btn.active {
  background: var(--accent, #2c7a2c);
  color: white;
  border-color: var(--accent, #2c7a2c);
}
```

#### Expanded panel style — copy from `bee-filter-toolbar.ts` lines 18–30 + `bee-map.ts` `.region-menu` lines 167–178

The panel dropdown container (visible when `_open === true`) should use `var(--surface)`, `var(--border)` and a drop shadow matching `.region-menu`:

```css
.filter-panel {
  position: absolute;
  top: calc(100% + 0.3rem);
  right: 0;
  background: var(--surface, #fff);
  border: 1px solid rgba(0,0,0,0.2);
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  min-width: 22rem;
  z-index: 10;
  padding: 0.75rem;
  box-sizing: border-box;
}
```

#### `bee-filter-controls` wiring — copy from `bee-filter-toolbar.ts` lines 88–97

The new panel passes the same props to `<bee-filter-controls>` unchanged. `@filter-changed` bubbles/composed so it propagates up to `bee-atlas` without re-wiring:

```typescript
html`
  <bee-filter-controls
    .filterState=${this.filterState}
    .taxaOptions=${this.taxaOptions}
    .countyOptions=${this.countyOptions}
    .ecoregionOptions=${this.ecoregionOptions}
    .collectorOptions=${this.collectorOptions}
    .summary=${this.summary}
  ></bee-filter-controls>
`
```

#### Custom event dispatch — copy from `bee-sidebar.ts` lines 94–99 (close pattern) and `bee-filter-toolbar.ts` lines 84

`@filter-changed` already bubbles/composed from `<bee-filter-controls>` and propagates through the shadow DOM automatically (no re-emit needed). The only outbound event from `bee-filter-panel` itself is `filter-changed` if you need to intercept/enrich, but for now simply let it propagate.

---

### `frontend/src/bee-atlas.ts` (modify existing coordinator)

**Analog:** itself — surgical edits only.

#### `_sidebarOpen` → `_filterOpen` state pattern (lines 53, 241–244, 516–517)

The new `_filterOpen` boolean follows the exact pattern of `_sidebarOpen`:

```typescript
// bee-atlas.ts line 53 — add alongside _sidebarOpen:
@state() private _filterOpen = false;
```

Toggle handler (model after `_onClose`, lines 679–685):

```typescript
private _onFilterToggle() {
  this._filterOpen = !this._filterOpen;
}
```

#### Render change — remove `<bee-filter-toolbar>`, add `<bee-filter-panel>` inside `<bee-map>`

Current render (lines 133–190) passes `<bee-filter-toolbar>` as a sibling before `.content`. The change removes it and passes filter props + `_filterOpen` to `<bee-map>`, which then slots `<bee-filter-panel>` as an absolutely-positioned child inside its own host.

**Option A (preferred per D-10):** Pass `bee-filter-panel` props to `bee-map` and have `bee-map` render it internally. This keeps `bee-map` as the positioning context.

**Option B:** Render `bee-filter-panel` directly inside `.content` (which already has `position: relative`) and let `bee-atlas` own the absolute positioning.

The CONTEXT.md (code_context section) says: "add the floating control inside the `.content` div (which has `position: relative`)". This favors Option B — `bee-atlas` renders `<bee-filter-panel>` as a direct child of `.content` at a known `top`/`right` offset, without modifying `bee-map`'s API.

```typescript
// In bee-atlas render(), replace:
//   <bee-filter-toolbar ...></bee-filter-toolbar>
// with nothing at the top level.
// Inside .content, add (alongside bee-map):

html`
  <div class="content">
    ${this._viewMode === 'map' ? html`<bee-map ...></bee-map>` : html`<bee-table ...></bee-table>`}
    <bee-filter-panel
      .filterState=${this._filterState}
      .taxaOptions=${this._taxaOptions}
      .countyOptions=${this._countyOptions}
      .ecoregionOptions=${this._ecoregionOptions}
      .collectorOptions=${this._collectorOptions}
      .summary=${this._summary}
      @filter-changed=${this._onFilterChanged}
    ></bee-filter-panel>
    ${this._sidebarOpen ? html`<bee-sidebar ...></bee-sidebar>` : ''}
  </div>
`
```

Note: `<bee-filter-panel>` with `position: absolute` inside `.content` (which has `position: relative`) is analogous to `.region-control` inside `<bee-map>` (whose `:host` also has `position: relative`).

#### Remove `@csv-download` handler from toolbar wiring (line 147)

`@csv-download` currently flows from `<bee-filter-toolbar>` to `bee-atlas._onDownloadCsv`. Per D-11, CSV moves to table view. `bee-table.ts` already has `@download-csv=${this._onDownloadCsv}` at line 178 — no change needed there. Just remove the `@csv-download` on the former toolbar.

#### Import change (lines 7–8)

```typescript
// Remove:
import './bee-filter-toolbar.ts';
// Add:
import './bee-filter-panel.ts';
```

---

### `frontend/src/bee-filter-controls.ts` (modify: remove localStorage recents)

**Analog:** itself.

#### Remove `localStorage` recents (lines 192–234)

Per D-09, delete:
- `RECENTS_KEY` constant (line 192)
- `RECENTS_MAX` constant (line 193)
- `loadRecentTokens()` function (lines 195–201)
- `saveRecentToken()` function (lines 204–214)
- `getRecentSuggestions()` function (lines 216–234)

#### Update call sites after removing recents

In `_selectSuggestion` (line 496), remove `saveRecentToken(s.token)` call.

In `_onInput` (lines 432–441) and `_onFocus` (lines 444–449), replace `getRecentSuggestions(this._tokens)` with an empty array or skip suggestion open:

```typescript
private _onInput(e: Event) {
  const value = (e.target as HTMLInputElement).value;
  this._inputText = value;
  if (value === '') {
    this._suggestions = [];
    this._open = false;
  } else {
    this._suggestions = getSuggestions(value, this.taxaOptions, this.countyOptions, this.ecoregionOptions, this.collectorOptions, this._tokens);
    this._open = this._suggestions.length > 0;
  }
  this._highlightIndex = -1;
}

private _onFocus() {
  // No-op without recents — dropdown only opens on typed input
}
```

---

## Shared Patterns

### CSS Custom Properties (apply to bee-filter-panel)

**Source:** `frontend/src/index.css` lines 3–30

All new component CSS must use these tokens — never hardcode colors (exception: the map overlay buttons mirror `.region-btn` which uses `white` and `rgba(0,0,0,x)` directly for OpenLayers control aesthetics):

```css
--text-body:       #213547;
--accent:          #2c7a2c;
--border:          #ddd;
--border-input:    #ccc;
--surface:         #fafafa;
--surface-subtle:  #f5f5f5;
--surface-hover:   #f8f8f8;
--surface-muted:   #f0f0f0;
--surface-pressed: #d0d0d0;
```

### Lit Component Structure (apply to bee-filter-panel)

**Source:** `frontend/src/bee-filter-toolbar.ts` lines 1–17 and `frontend/src/bee-sidebar.ts` lines 1–5

Every component in this codebase follows this structure:

```typescript
import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('bee-filter-panel')
export class BeeFilterPanel extends LitElement {
  @property({ attribute: false }) propName!: Type;
  @state() private _internalState = false;

  static styles = css`...`;

  render() { return html`...`; }
}
```

### Custom Event Dispatch (apply to bee-filter-panel toggle)

**Source:** `frontend/src/bee-sidebar.ts` lines 94–99 and `frontend/src/bee-filter-toolbar.ts` line 84

All custom events in this codebase use `bubbles: true, composed: true`:

```typescript
this.dispatchEvent(new CustomEvent('event-name', {
  bubbles: true,
  composed: true,
  detail: payload,
}));
```

### Toggle State Pattern (apply to _filterOpen in bee-atlas)

**Source:** `frontend/src/bee-atlas.ts` lines 53, 516–517, 679–685

`_sidebarOpen` pattern — boolean `@state`, set to `true` on open event, `false` on close handler, conditionally render child in `render()`:

```typescript
@state() private _sidebarOpen = false;

// Opened by event from child:
this._sidebarOpen = true;

// Closed by _onClose handler:
private _onClose() {
  this._selectedOccurrences = null;
  this._selectedOccIds = null;
  this._selectedCluster = null;
  this._sidebarOpen = false;
  this._pushUrlState();
}

// In render():
${this._sidebarOpen ? html`<bee-sidebar ...></bee-sidebar>` : ''}
```

For `_filterOpen` the pattern is simpler (no selection to clear on close) — just toggle the boolean.

---

## No Analog Found

No files fall into this category. All files have clear analogs in the codebase.

---

## Notes on Elevation Input Constraint

**Source:** `frontend/src/bee-filter-controls.ts` lines 354–379 (`.elev-inputs` outside `.search-section`)

The CONTEXT.md notes: "Elevation inputs are placed outside `.search-section` in `bee-filter-controls.ts` to avoid z-index clipping from the suggestion dropdown." This constraint is internal to `bee-filter-controls` and carries forward unchanged — the new panel simply embeds `<bee-filter-controls>` as-is.

---

## Metadata

**Analog search scope:** `frontend/src/`
**Files scanned:** bee-atlas.ts, bee-filter-toolbar.ts, bee-filter-controls.ts, bee-sidebar.ts, bee-map.ts, bee-header.ts, index.css, filter.ts
**Pattern extraction date:** 2026-04-20
