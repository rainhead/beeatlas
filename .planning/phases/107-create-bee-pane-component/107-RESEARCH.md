# Phase 107: Create bee-pane Component - Research

**Researched:** 2026-05-19
**Domain:** Lit web components, CSS layout, component composition
**Confidence:** HIGH

## Summary

Phase 107 creates `bee-pane`, a new LitElement custom element that merges `bee-filter-panel`
and `bee-sidebar` into a single unified pane with three CSS states: collapsed, list, and table.
The component receives `paneState: 'collapsed' | 'list' | 'table'` as input from `bee-atlas`
and emits events upward for state transitions. No new npm packages are needed.

The key architectural insight is that `bee-pane` is a **presenter**, not an owner. It renders
the correct sub-components based on `paneState` passed in from `bee-atlas`, and dispatches
events (`pane-collapse`, `pane-expand-list`, `pane-expand-table`, `pane-shrink-list`) when
the user clicks toggle/expand/shrink buttons. `bee-atlas` owns `_paneState` and decides
the next state on each event. The pane does not self-manage state transitions.

`bee-filter-panel.ts` currently implements the filter UI directly (not using
`bee-filter-controls`) with its own internal state (`_selectedTaxon`, `_selectedCollectors`,
etc.) kept in sync via `filterState` property. This same pattern should be preserved in
`bee-pane` — the filter UI logic moves into `bee-pane`.

`bee-table` already exists and is self-contained. In table state, `bee-pane` renders
`bee-table` exactly as `bee-atlas` does today, plus a shrink button in the header.

**Primary recommendation:** Create `src/bee-pane.ts` as a new LitElement containing the
merged filter panel UI (from `bee-filter-panel.ts`) and the occurrence detail sidebar (from
`bee-sidebar.ts`). Accept `paneState`, `filterState`, `occurrences`, and all data-option
properties from `bee-atlas`. Emit events upward. Write source-scan Vitest tests.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pane state ownership | `bee-atlas.ts` @state | — | Architecture invariant: `<bee-atlas>` owns all reactive state |
| Pane rendering (collapsed/list/table) | `bee-pane.ts` render() | — | New unified presenter; receives paneState as property |
| Toggle button visibility | `bee-pane.ts` CSS/template | — | Always visible at pane edge; pane owns its own chrome |
| Expand/shrink button actions | `bee-pane.ts` dispatches events | `bee-atlas.ts` handles | Pane emits; atlas decides next state |
| Filter controls (taxon, date, region, collector, place) | `bee-pane.ts` (merged from bee-filter-panel) | — | list state shows all filter rows |
| Occurrence detail | `bee-pane.ts` → `bee-occurrence-detail` | — | list state with selection |
| Table view | `bee-pane.ts` → `bee-table` | — | table state embeds existing bee-table |
| Mobile breakpoint | `bee-pane.ts` CSS media query | — | Hides expand button on max-aspect-ratio: 1 |
| Data options (taxaOptions, countyOptions, etc.) | passed through from `bee-atlas` | — | bee-pane is pure presenter; does not fetch data |

## Standard Stack

No new external packages are installed in this phase. Everything uses the existing toolchain.

### Existing Toolchain (all verified in codebase)

| Tool | Version | Role |
|------|---------|------|
| Lit | ^3.2.1 | LitElement, @property, @state, css\`\`, html\`\`, nothing |
| TypeScript | ^5.8.2 | Static typing; `tsc --noEmit` is the build gate |
| Vitest | ^4.1.2 | Unit test runner; `npm test` |
| happy-dom | ^20.8.9 | DOM environment for Vitest |

[VERIFIED: package.json in repo]

## Package Legitimacy Audit

No packages are installed in this phase.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
bee-atlas (state owner)
  │ _paneState: 'collapsed' | 'list' | 'table'
  │ _filterState, _occurrences, _taxaOptions, etc.
  │
  ├── bee-map (unchanged)
  │
  └── bee-pane (new unified presenter)
        │ Properties: paneState, filterState, occurrences, taxaOptions,
        │             countyOptions, ecoregionOptions, collectorOptions,
        │             summary, specimenCount, selectedIds, rows, rowCount,
        │             page, loading, sortBy, filterActive
        │ Events out: pane-collapse, pane-expand-table, pane-shrink-list,
        │             filter-changed, close, page-changed, download-csv,
        │             sort-changed, row-pan, toggle-filter
        │
        ├── [collapsed state]
        │     toggle button (always-visible at pane edge)
        │
        ├── [list state]
        │     toggle button (collapse)
        │     expand button (→ table, desktop only)
        │     filter panel UI (What/Who/Where/When rows — from bee-filter-panel)
        │     bee-occurrence-detail (when occurrences present)
        │
        └── [table state]
              toggle button (collapse)
              shrink button (→ list)
              bee-table (full table with pagination, CSV export)
              bee-filter-panel (filter button, openUpward=true — or integrate inline)
```

### Recommended Project Structure

```
src/
├── bee-pane.ts          # NEW: unified pane (this phase)
├── bee-atlas.ts         # unchanged in this phase; still renders bee-filter-panel + bee-sidebar
├── bee-filter-panel.ts  # unchanged (deleted in Phase 109)
├── bee-sidebar.ts       # unchanged (deleted in Phase 109)
└── tests/
    └── bee-pane.test.ts  # NEW: source-scan and render tests
```

### Pattern 1: Three-State Presenter Component

`bee-pane` follows the existing project pattern of pure presenter components:

```typescript
// Source: src/bee-pane.ts (to be created)
@customElement('bee-pane')
export class BeePane extends LitElement {
  @property({ attribute: false }) paneState: 'collapsed' | 'list' | 'table' = 'collapsed';
  @property({ attribute: false }) filterState!: FilterState;
  @property({ attribute: false }) occurrences: OccurrenceRow[] | null = null;
  @property({ attribute: false }) taxaOptions: TaxonOption[] = [];
  @property({ attribute: false }) countyOptions: string[] = [];
  @property({ attribute: false }) ecoregionOptions: string[] = [];
  @property({ attribute: false }) collectorOptions: CollectorEntry[] = [];
  @property({ attribute: false }) summary: DataSummary | null = null;
  @property({ attribute: false }) specimenCount: number | null = null;
  // Table-specific properties (needed for table state)
  @property({ attribute: false }) rows: OccurrenceRow[] = [];
  @property({ attribute: false }) rowCount = 0;
  @property({ attribute: false }) page = 1;
  @property({ attribute: false }) loading = false;
  @property({ attribute: false }) sortBy: SpecimenSortBy = 'date';
  @property({ attribute: false }) filterActive = false;
  @property({ attribute: false }) selectedIds: Set<string> | null = null;

  // Internal filter UI state (mirrored from filterState, same pattern as bee-filter-panel)
  @state() private _open = false;
  @state() private _selectedTaxon: { name: string; rank: 'family' | 'genus' | 'species' } | null = null;
  // ... (all internal filter state from bee-filter-panel.ts)
}
```

### Pattern 2: Persistent Toggle Button

The toggle button must be visible in ALL three states. The cleanest CSS approach is to
position the pane itself as an absolute overlay on the right edge, with the toggle button
always at the left edge of the pane. In collapsed state, the pane is a thin strip showing
only the toggle button.

```typescript
// Source: bee-atlas.ts existing pattern for positioned overlay
// bee-sidebar.ts current positioning (to be superseded by bee-pane)
// bee-sidebar position: absolute, right: 0.5em, top: calc(...)
```

The toggle button pattern:

```typescript
// In bee-pane render():
private _onToggle() {
  if (this.paneState === 'collapsed') {
    this.dispatchEvent(new CustomEvent('pane-expand-list', { bubbles: true, composed: true }));
  } else {
    this.dispatchEvent(new CustomEvent('pane-collapse', { bubbles: true, composed: true }));
  }
}

// Expand button (list → table, desktop only, hidden via CSS on mobile)
private _onExpand() {
  this.dispatchEvent(new CustomEvent('pane-expand-table', { bubbles: true, composed: true }));
}

// Shrink button (table → list, visible only in table state header)
private _onShrink() {
  this.dispatchEvent(new CustomEvent('pane-shrink-list', { bubbles: true, composed: true }));
}
```

### Pattern 3: Mobile CSS — Hide Expand Button

PANE-06 requires the expand button to be absent on mobile. The project already uses
`@media (max-aspect-ratio: 1)` as its mobile breakpoint (found in `bee-atlas.ts`). Use the
same breakpoint in `bee-pane`:

```css
/* In BeePane static styles */
.expand-btn {
  /* visible by default on desktop */
}
@media (max-aspect-ratio: 1) {
  .expand-btn {
    display: none;
  }
}
```

### Pattern 4: Filter UI Migration from bee-filter-panel

`bee-filter-panel.ts` directly implements the filter UI rows (What/Who/Where/When) using
`_renderWhat()`, `_renderWho()`, `_renderWhere()`, `_renderWhen()` private methods and a
set of `@state` fields for internal control state. These do NOT use `bee-filter-controls`;
they are self-contained inside `bee-filter-panel`.

In `bee-pane`, this entire implementation should be brought across directly. The key internal
state fields that must be preserved:

```typescript
// From bee-filter-panel.ts — these are internal to the filter panel UI
@state() private _open = false;              // panel open/closed
@state() private _taxonInput = '';
@state() private _selectedTaxon: { name: string; rank: 'family' | 'genus' | 'species' } | null = null;
@state() private _collectorInput = '';
@state() private _selectedCollectors: CollectorEntry[] = [];
@state() private _whereInput = '';
@state() private _selectedCounties: Set<string> = new Set();
@state() private _selectedEcoregions: Set<string> = new Set();
@state() private _selectedPlace: string | null = null;
@state() private _placeNameBySlug: Map<string, string> = new Map();
@state() private _elevMin: number | null = null;
@state() private _elevMax: number | null = null;
@state() private _yearThisYear = true;
@state() private _yearLastYear = true;
@state() private _yearEarlier = true;
@state() private _openSection: 'taxon' | 'collector' | 'where' | null = null;
@state() private _suggestions: AnyS[] = [];
@state() private _highlightIndex = -1;
private _placeOptions: { slug: string; name: string }[] = [];
```

The `updated(changed: PropertyValues)` method in `bee-filter-panel` syncs these from
`filterState` on property change. This pattern must be preserved in `bee-pane`.

Note: `bee-filter-panel`'s `hideButton` and `externalOpen` properties are pane-internal
mechanics. They are NOT exposed on `bee-pane` — `bee-pane` controls its own filter panel
open state internally.

### Pattern 5: Existing Positioning (for reference)

Current `bee-atlas.ts` CSS for the positioned overlay elements:

```css
bee-sidebar {
  right: 0.5em;
  top: calc(0.5em + 2.5rem + 2.5rem + 0.5em);
  width: 25rem;
  bottom: 0.5em;
}
bee-filter-panel {
  right: 0.5em;
  top: calc(0.5em + 2.5rem);
}
```

`bee-pane` will be positioned from `bee-atlas`. Since Phase 107 creates `bee-pane` but Phase 108
cuts over to it, the positioning CSS stays in `bee-atlas`. `bee-pane` itself just needs
`:host { position: absolute; }` with the actual top/right/etc. set from the parent.

### Anti-Patterns to Avoid

- **Don't give bee-pane @state() for paneState**: `paneState` is owned by `bee-atlas`, so
  it's a `@property` on `bee-pane`, not `@state`. Never update `paneState` from inside `bee-pane`.
- **Don't call map.resize() inside bee-pane**: Map resize on pane transition is Phase 108.
- **Don't remove bee-filter-panel or bee-sidebar yet**: Phase 109 deletes them. Phase 107
  only creates `bee-pane`; `bee-atlas` still renders the old components until Phase 108.
- **Don't duplicate bee-table's event handling in bee-pane**: `bee-pane` should re-emit or
  bubble events from `bee-table` rather than intercepting and re-creating them. All
  `bee-table` events already have `bubbles: true, composed: true`, so they naturally bubble
  to `bee-atlas` without intervention.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS three-state transitions | Custom JS animation | CSS classes + transitions | Lit re-render + CSS class toggle is sufficient |
| Filter state sync | Separate state management | `updated(changed: PropertyValues)` pattern | Already established in `bee-filter-panel.ts` |
| Mobile detection | `window.matchMedia` JS | CSS `@media (max-aspect-ratio: 1)` | No JS needed; pure CSS media query hides expand button |
| Place names lazy-load | Re-implement | Copy `_ensurePlaceNamesLoaded()` from `bee-filter-panel.ts` | Pattern is already established and working |
| Event bubbling for bee-table events | Manual re-dispatch | Allow natural bubbling | All bee-table events are `bubbles: true, composed: true` |

**Key insight:** `bee-pane` is largely a composition and copy exercise. The filter panel UI
exists in `bee-filter-panel.ts` and can be moved directly. The occurrence detail is in
`bee-sidebar.ts` (thin wrapper over `bee-occurrence-detail`). The table is `bee-table`.
Nothing needs reimplementing.

## Common Pitfalls

### Pitfall 1: Toggle button disappears in collapsed state

**What goes wrong:** If `bee-pane` uses `display: none` or `visibility: hidden` on itself
when `paneState === 'collapsed'`, the toggle button also disappears, violating PANE-01.

**Why it happens:** Conflating "pane content hidden" with "pane element hidden".

**How to avoid:** The `:host` element is always visible. In collapsed state, only the
content area is hidden (or the host is very narrow). The toggle button is always rendered
regardless of `paneState`.

**Warning signs:** PANE-01 test fails; user sees no toggle button when pane is collapsed.

### Pitfall 2: Expand button visible on mobile

**What goes wrong:** The expand button renders on mobile, violating PANE-06.

**Why it happens:** CSS media query scoped to the wrong breakpoint, or wrong media feature.
The project uses `max-aspect-ratio: 1` not `max-width`.

**How to avoid:** Use `@media (max-aspect-ratio: 1) { .expand-btn { display: none; } }` in
the Lit static styles, matching the existing `bee-atlas.ts` mobile breakpoint.

**Warning signs:** On portrait or narrow screens, the expand button appears and clicking it
crashes (since `bee-atlas` won't handle `pane-expand-table` on mobile if it's meant to be
hidden).

### Pitfall 3: Filter state not synced on property change

**What goes wrong:** The internal `_selectedTaxon`, `_selectedCollectors`, etc. in `bee-pane`
drift out of sync with the externally provided `filterState` after a filter is applied by
`bee-atlas` (e.g., from map region click).

**Why it happens:** Missing `updated(changed: PropertyValues)` implementation, or incorrect
change detection.

**How to avoid:** Copy the `updated()` method from `bee-filter-panel.ts` wholesale. It
already handles all the sync logic correctly with string comparison guards.

**Warning signs:** Filter chips in the pane don't update when `bee-atlas` sets `filterState`
programmatically (e.g., after region click).

### Pitfall 4: bee-table events intercepted unnecessarily

**What goes wrong:** Developer adds `@page-changed`, `@sort-changed`, etc. to the
`<bee-table>` template inside `bee-pane` and re-dispatches them, changing their event detail
or bubbling behavior.

**Why it happens:** Wanting to "handle" the events locally.

**How to avoid:** Do NOT add event listeners to `<bee-table>` in `bee-pane`. All bee-table
events have `bubbles: true, composed: true` and will naturally propagate to `bee-atlas`
which has the handlers. If `bee-pane` needs to react to a `bee-table` event (e.g.,
`toggle-filter`), it may listen but must still let the event continue bubbling.

**Warning signs:** bee-atlas event handlers stop firing for table events.

### Pitfall 5: test file references bee-sidebar or bee-filter-panel directly

**What goes wrong:** New `bee-pane.test.ts` imports `bee-sidebar.ts` or `bee-filter-panel.ts`
and asserts their APIs rather than asserting `bee-pane` behavior.

**How to avoid:** `bee-pane.test.ts` should only import and test `bee-pane.ts`. The ARCH-03
sibling isolation tests in `bee-atlas.test.ts` should be extended to verify that `bee-pane`
does not import `bee-atlas`.

### Pitfall 6: pane-collapse event name conflicts with existing close event

**What goes wrong:** Using `close` as the pane collapse event name conflicts with the
existing `close` event that `bee-sidebar` dispatches (and `bee-atlas._onClose` handles).
Since `bee-atlas` still renders `bee-sidebar` in this phase, both would bubble and interfere.

**How to avoid:** Name the new events with `pane-` prefix: `pane-collapse`, `pane-expand-table`,
`pane-shrink-list`, `pane-expand-list`. These are distinct from `close` and will not be caught
by `bee-atlas._onClose`. Phase 108 wires these new events.

## Code Examples

### bee-pane toggle + expand button rendering

```typescript
// Source: to be created in src/bee-pane.ts
render() {
  return html`
    <div class="pane-chrome">
      <button class="toggle-btn" @click=${this._onToggle}
        aria-label=${this.paneState === 'collapsed' ? 'Open pane' : 'Collapse pane'}
      >
        ${this.paneState === 'collapsed' ? '⟩' : '⟨'}
      </button>
      ${this.paneState === 'list' ? html`
        <button class="expand-btn" @click=${this._onExpand} aria-label="Expand to table">
          ⊞
        </button>
      ` : nothing}
    </div>
    ${this.paneState === 'list' ? this._renderListContent() : nothing}
    ${this.paneState === 'table' ? this._renderTableContent() : nothing}
  `;
}

private _renderTableContent() {
  return html`
    <div class="table-header">
      <button class="shrink-btn" @click=${this._onShrink} aria-label="Return to list view">
        ⊟
      </button>
    </div>
    <bee-table
      .rows=${this.rows}
      .rowCount=${this.rowCount}
      .page=${this.page}
      .loading=${this.loading}
      .sortBy=${this.sortBy}
      .filterActive=${this.filterActive}
      .selectedIds=${this.selectedIds}
    ></bee-table>
  `;
}
// Note: NO @page-changed, @sort-changed, etc. on <bee-table> — events bubble naturally
```

### bee-atlas wiring for new events (Phase 108, for reference)

```typescript
// This is Phase 108 work — documented here so the planner understands the direction:
// bee-atlas will listen to bee-pane events:
// @pane-collapse → this._paneState = 'collapsed'
// @pane-expand-list → this._paneState = 'list'
// @pane-expand-table → this._paneState = 'table'
// @pane-shrink-list → this._paneState = 'list'
```

### Source-scan test pattern (matching existing project conventions)

```typescript
// Source: src/tests/bee-pane.test.ts (to be created)
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, '../bee-pane.ts'), 'utf-8');

describe('PANE-01: toggle button always rendered', () => {
  test('bee-pane.ts renders toggle-btn in all three pane states', () => {
    // Source scan: toggle-btn must appear outside all paneState conditionals
    expect(src).toMatch(/toggle-btn/);
    // The toggle button must not be inside a paneState === 'list' conditional block only
  });
});

describe('PANE-03/PANE-06: expand button desktop-only', () => {
  test('bee-pane.ts contains expand-btn CSS class', () => {
    expect(src).toMatch(/expand-btn/);
  });
  test('bee-pane.ts has max-aspect-ratio:1 media query hiding expand-btn', () => {
    expect(src).toMatch(/max-aspect-ratio:\s*1/);
    expect(src).toMatch(/expand-btn[\s\S]{0,50}display:\s*none/);
  });
});

describe('PANE-04: shrink button in table state', () => {
  test('bee-pane.ts has shrink-btn in table state rendering', () => {
    expect(src).toMatch(/shrink-btn/);
    expect(src).toMatch(/pane-shrink-list/);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `bee-filter-panel` + `bee-sidebar` as sibling components | Single `bee-pane` component | Phase 107 | Unifies filter controls and occurrence detail into one pane |
| Full-screen table replacing map | Table as pane sub-state | Phase 107 | Map always present in DOM |
| `viewMode: 'map' | 'table'` header tabs | `paneState: 'collapsed' | 'list' | 'table'` | Phase 106 complete | Three-state pane replaces old binary view toggle |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Event names `pane-collapse`, `pane-expand-table`, `pane-shrink-list`, `pane-expand-list` are the canonical event API for `bee-pane` → `bee-atlas` communication | Architecture Patterns | If bee-atlas already has these wired differently (Phase 108), names must align |
| A2 | `bee-table` events (`page-changed`, `sort-changed`, `row-pan`, `download-csv`, `toggle-filter`) will naturally bubble through `bee-pane`'s shadow root to `bee-atlas` without intervention | Architecture Patterns | If Lit shadow DOM blocks cross-shadow bubbling for specific events, bee-pane may need to re-dispatch; test in practice |
| A3 | Phase 107 creates `bee-pane` but `bee-atlas` continues rendering the old `bee-filter-panel` and `bee-sidebar` until Phase 108 — `bee-pane` is created but not wired in this phase | Summary | If the success criteria require `bee-pane` to be live in the UI, this plan is wrong; but ROADMAP says Phase 108 is the cutover |
| A4 | The toggle button uses `⟩`/`⟨` arrows or similar icon; exact iconography is at Claude's discretion | Code Examples | No user impact unless iconography is prescriptive |

**If A2 is wrong:** Lit's `composed: true` flag means events do cross shadow DOM boundaries.
All `bee-table` events are dispatched with `composed: true`, so this should work. If it
doesn't, `bee-pane` adds `@page-changed=${(e: CustomEvent) => this.dispatchEvent(e)}` etc.

**If A3 is wrong:** The planner would need to include Phase 108 cutover work in the plan.
But the ROADMAP explicitly separates "Create bee-pane Component" (107) from "bee-atlas
Cutover & Map Resize" (108).

## Open Questions

1. **Should bee-pane wrap bee-filter-panel or internalize its code?**
   - What we know: `bee-filter-panel.ts` is not a sub-component of anything; its filter rows
     are private `_render*` methods. It does not use `bee-filter-controls`.
   - What's unclear: Whether to move the filter code into `bee-pane` directly, or embed
     `<bee-filter-panel>` inside `bee-pane` and adapt its `hideButton`/`openUpward` props.
   - Recommendation: Move the filter code directly into `bee-pane`. This avoids a second
     indirection layer and Phase 109's cleanup becomes simpler (just delete two files instead
     of needing to unwind a wrapper).

2. **How wide is the pane in each state?**
   - What we know: `bee-sidebar` is `width: 25rem`. No explicit width for `bee-filter-panel`
     (it's a floating overlay). The REQUIREMENTS.md says "deterministic widths per state are
     sufficient."
   - Recommendation: list state = 25rem (matching existing sidebar width); table state =
     full width of the content area (maps to the table-mode drawer behavior). Collapsed = a
     thin strip, e.g., 2.5rem (just the toggle button). These are plannable without user input.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies; pure TypeScript/Lit component creation)

## Phase Requirements

<phase_requirements>
| ID | Description | Research Support |
|----|-------------|------------------|
| PANE-01 | Persistent toggle button visible at pane edge in all three states (collapsed, list, table) | Toggle button rendered outside all paneState conditionals; always-visible CSS |
| PANE-02 | Toggle button opens (collapsed→list) and collapses (list/table→collapsed) the pane | `_onToggle` dispatches `pane-expand-list` or `pane-collapse`; bee-atlas handles |
| PANE-03 | Expand button in list state on desktop transitions to table state | `.expand-btn` rendered in list state; dispatches `pane-expand-table` |
| PANE-04 | Shrink button in table state header returns to list state | `.shrink-btn` in table header; dispatches `pane-shrink-list` |
| PANE-05 | List state shows all filter controls and occurrence detail on selection | Filter UI (merged from bee-filter-panel) + bee-occurrence-detail in list render |
| PANE-06 | Expand button hidden on mobile (max-aspect-ratio: 1); pane is open/close only | CSS `@media (max-aspect-ratio: 1) { .expand-btn { display: none; } }` |
| TABLE-01 | Table in table state retains all existing functionality (pagination, CSV export, filter state integration) | bee-table embedded in table state; events bubble naturally to bee-atlas |
</phase_requirements>

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | vite.config.ts (`test:` block) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PANE-01 | Toggle button present in all pane states | source scan | `npm test` | No — Wave 0 |
| PANE-02 | Toggle dispatches pane-collapse / pane-expand-list | source scan | `npm test` | No — Wave 0 |
| PANE-03 | expand-btn present in list state template | source scan | `npm test` | No — Wave 0 |
| PANE-04 | shrink-btn present in table state template, dispatches pane-shrink-list | source scan | `npm test` | No — Wave 0 |
| PANE-05 | List state renders filter rows and bee-occurrence-detail | source scan | `npm test` | No — Wave 0 |
| PANE-06 | max-aspect-ratio:1 hides expand-btn via CSS | source scan | `npm test` | No — Wave 0 |
| TABLE-01 | bee-table is in table state template without event handler interception | source scan | `npm test` | No — Wave 0 |

All tests are source scans (`readFileSync` + `expect(src).toMatch()`), following the
established project pattern in `bee-atlas.test.ts` and `bee-sidebar.test.ts`. No DOM render
tests are strictly required for Phase 107 since `bee-atlas` is not yet wired to `bee-pane`.

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test && npm run build`
- **Phase gate:** Full suite green + `tsc --noEmit` before `/gsd-verify-phase`

### Wave 0 Gaps

- [ ] `src/tests/bee-pane.test.ts` — covers PANE-01 through TABLE-01 via source scan
  assertions (new file needed; modeled on `bee-atlas.test.ts` structure)

## Security Domain

Phase 107 creates a new component that renders filter UI and occurrence detail. No new
network access, auth paths, or XSS vectors are introduced:
- Filter values are user-typed text used only in SQL WHERE clauses (via existing `filter.ts`
  functions, unchanged)
- Occurrence data is fetched by `bee-atlas` and passed as properties; `bee-pane` only renders
- Place names are fetched from `places_meta` manifest URL (existing behavior in `_ensurePlaceNamesLoaded`)

No new ASVS categories apply beyond those already addressed by the existing codebase.

## Sources

### Primary (HIGH confidence)

- `src/bee-atlas.ts` (full read, 1079 lines) — confirmed `_paneState`, current render tree,
  CSS positioning, existing event handlers that will listen to new bee-pane events in Phase 108
- `src/bee-filter-panel.ts` (full read, 884 lines) — confirmed filter UI internals, property
  interface (`hideButton`, `openUpward`, `filterState`, data options), `_renderWhat/Who/Where/When`,
  `_ensurePlaceNamesLoaded`, `updated()` sync pattern, `setOpen()` imperative API
- `src/bee-sidebar.ts` (full read, 126 lines) — confirmed thin layout shell: sidebar-header,
  close button, `bee-occurrence-detail` sub-component
- `src/bee-table.ts` (full read, 422 lines) — confirmed property interface (rows, rowCount,
  page, loading, sortBy, selectedIds, filterActive), all events (`bubbles: true, composed: true`),
  toggle-filter event for filter button in pagination bar
- `src/bee-header.ts` (full read, 222 lines) — confirmed `viewMode: 'map' | 'table'` API
  unchanged in Phase 107
- `src/tests/bee-atlas.test.ts` (full read, 599 lines) — confirmed source-scan test pattern,
  existing PANE/SM/SIDE/VIEW/SEL describe blocks, import structure
- `src/tests/bee-sidebar.test.ts` (full read) — confirmed test patterns for source scans and
  render tests
- `src/bee-filter-controls.ts` (partial read) — confirmed `bee-filter-controls` is NOT used
  inside `bee-filter-panel`; `bee-filter-panel` implements its own UI rows directly
- `.planning/phases/106-bee-atlas-state-machine/106-01-SUMMARY.md` — confirmed Phase 106
  shipped: `_paneState` is live, `bee-header` API unchanged, `bee-atlas` ready for Phase 107

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; existing toolchain confirmed in repo
- Architecture: HIGH — direct code reading of all four components to be composed; clear event
  boundary design
- Pitfalls: HIGH — derived from reading existing component implementations and the project's
  test patterns

**Research date:** 2026-05-19
**Valid until:** Until Phase 108 cutover (next phase) — changes to bee-atlas event wiring in
Phase 108 may require revisiting A1/A2 above
