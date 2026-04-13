# Phase 53: Filter Toolbar - Research

**Researched:** 2026-04-13
**Domain:** Lit web components, bee-atlas UI architecture
**Confidence:** HIGH

---

## Summary

Phase 53 moves all filter controls and the CSV download button from `bee-sidebar` into a new `bee-filter-toolbar` component that sits between the header and content area. The UI contract is fully specified in `53-UI-SPEC.md`. The codebase is well-understood from direct inspection — no external library research is needed beyond confirming patterns already in use.

The work is a pure structural refactor: create `bee-filter-toolbar`, wire it into `bee-atlas`, move `<bee-filter-controls>` out of `bee-sidebar`, reroute the `filter-changed` event, and add a CSV download button that dispatches `csv-download` to `bee-atlas`. The existing `_onDownloadCsv` handler in `bee-atlas` can be reused verbatim.

**Primary recommendation:** Create `bee-filter-toolbar` as a thin wrapper component. Move `<bee-filter-controls>` into it. Add inline CSV button. Remove both from `bee-sidebar`. Wire events in `bee-atlas`. Write Vitest tests mirroring the pattern in `bee-header.test.ts`.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FILT-08 | All filter controls (taxon, year, month, county, ecoregion) presented in persistent toolbar below the header, replacing current sidebar placement | `bee-filter-controls` is a self-contained Lit component that can be moved wholesale; `bee-atlas` already passes all required props to it via `bee-sidebar` |
| FILT-09 | CSV download button appears in the filter toolbar | `bee-atlas._onDownloadCsv` already exists and handles the full CSV logic; `bee-filter-toolbar` only needs to dispatch `csv-download` event and `bee-atlas` handles the rest |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Lit | ^3.2.1 | Web component base class | Already used for all components in project |

No new dependencies needed. This phase is a structural reorganization within the existing Lit + TypeScript codebase.

**Version verification:** `[VERIFIED: package.json]` — Lit 3.2.1 confirmed at `/Users/rainhead/dev/beeatlas/frontend/package.json`.

---

## Architecture Patterns

### Project Architecture Invariants (from CLAUDE.md)

- `<bee-atlas>` owns all reactive state. `<bee-filter-toolbar>` will be a pure presenter — receives state as properties, emits custom events upward.
- `<bee-sidebar>` currently renders `<bee-filter-controls>` and the CSV button. After this phase it no longer does either.
- All filter state ownership remains in `bee-atlas`. No new `@state()` fields needed in the new component.

### DOM Structure After Phase

```
body
├── bee-atlas
│   ├── bee-header          (dark navy, 48px)
│   ├── bee-filter-toolbar  (NEW — surface bg, 48px min-height, border-bottom)
│   │   ├── bee-filter-controls   (flex-grow: 1)
│   │   └── .csv-btn (inline button)
│   └── .content
│       ├── bee-map | bee-table
│       └── bee-sidebar     (filter-controls and csv button REMOVED from here)
```

### Pattern: New Thin Wrapper Component

`bee-filter-toolbar` follows the same pattern as `bee-header`:

- `@customElement('bee-filter-toolbar')` in new file `frontend/src/bee-filter-toolbar.ts`
- `import './bee-filter-toolbar.ts'` in `bee-atlas.ts`
- Properties received: `filterState`, `taxaOptions`, `countyOptions`, `ecoregionOptions`, `collectorOptions`, `summary`, `layerMode`
- Events dispatched (bubble + composed): `filter-changed` (re-emitted from `bee-filter-controls`), `csv-download`

### Pattern: Event Re-emission

`bee-filter-controls` dispatches `filter-changed` with `bubbles: true, composed: true`. Because shadow DOM event retargeting causes composed events to continue bubbling through host elements, `bee-filter-toolbar` does NOT need to manually re-emit `filter-changed` — the event will naturally bubble up through `bee-filter-toolbar`'s shadow root to `bee-atlas`.

**Critical:** Verify this in testing. If `bee-filter-controls` is used in the shadow DOM of `bee-filter-toolbar`, composed events bubble through. The existing `bee-atlas` handler at `@filter-changed=${this._onFilterChanged}` on `<bee-sidebar>` demonstrates this works — `bee-filter-controls` is inside `bee-sidebar`'s shadow DOM and the event reaches `bee-atlas` today.

### Pattern: CSV Event Routing

The table view already has a `download-csv` event dispatched by `bee-table` and handled by `bee-atlas._onDownloadCsv`. The toolbar will use a different event name (`csv-download` per the UI spec) dispatched directly from `bee-filter-toolbar`. `bee-atlas` needs a new listener `@csv-download=${this._onDownloadCsv}` on `<bee-filter-toolbar>`.

The `_onDownloadCsv` method in `bee-atlas` (line 703) is already written and can be bound to both sources.

### Pattern: Sidebar Cleanup

The sidebar currently renders:
1. `<bee-filter-controls>` — remove
2. Layer toggle (Specimens/Samples) — these are now in `bee-header`, already removed or will be redundant
3. View toggle (Map/Table) — same, in header
4. CSV download — remove (moves to toolbar)
5. Specimen detail, sample detail, recent events, feeds — keep

After cleanup, `bee-sidebar.render()` renders only the specimen/sample detail panels, recent events, and feeds section. The `filter-changed` event listener on `<bee-sidebar>` in `bee-atlas` is removed; the new one goes on `<bee-filter-toolbar>`.

Props that `bee-sidebar` received only to pass to `bee-filter-controls` can be removed from `bee-sidebar`'s `@property` declarations: `taxaOptions`, `countyOptions`, `ecoregionOptions`, `collectorOptions`, `filterState`. These stay in `bee-atlas` and are passed to `bee-filter-toolbar` instead.

Note: `bee-sidebar` also receives `summary` currently, but this is used for its own `_renderSummary()`. Check if `bee-filter-controls` uses `summary` — it does (property exists on the component). The toolbar receives `summary` per the UI spec.

### Anti-Patterns to Avoid

- **State duplication:** Do not add `@state()` fields to `bee-filter-toolbar` for filter values — the component is a pure presenter.
- **Re-emitting composed events manually:** `filter-changed` from `bee-filter-controls` is already `composed: true` — manual re-emission creates double-firing.
- **Removing sidebar props in use:** Confirm which sidebar props are used only for filter-controls passthrough vs. the summary panel before deleting them.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| CSS custom properties for colors | Custom color values | Existing `index.css` CSS variables (`--surface`, `--border`, `--accent`, etc.) |
| Touch target sizing | Custom height calculations | Follow `min-height: 44px` pattern from `.icon-btn` in `bee-header.ts` |
| Event bubbling through shadow DOM | Manual event forwarding | Lit composed events bubble automatically through shadow DOM hosts |

---

## Common Pitfalls

### Pitfall 1: Removing bee-sidebar props that feed _renderSummary

**What goes wrong:** `bee-sidebar` uses `summary` and `filteredSummary` in `_renderSummary()`. If the planner removes these because they were "filter props," the summary panel breaks.

**Why it happens:** Some props serve double duty: they go to `bee-filter-controls` AND to sidebar rendering.

**How to avoid:** Audit each prop before removal. Props to remove from sidebar: `filterState`, `taxaOptions`, `countyOptions`, `ecoregionOptions`, `collectorOptions`. Props to keep: `summary`, `filteredSummary`, `layerMode`, `viewMode`, `samples`, `selectedSampleEvent`, `recentSampleEvents`, `sampleDataLoaded`, `activeFeedEntries`.

**Warning signs:** TypeScript errors on unused props, sidebar content rendering incorrectly.

### Pitfall 2: filter-changed event listener left on bee-sidebar

**What goes wrong:** `bee-atlas` currently listens for `filter-changed` on `<bee-sidebar>`. After the move, filter-controls is in `bee-filter-toolbar`, so `filter-changed` events will reach `bee-atlas` via `<bee-filter-toolbar>`. If the old listener on `<bee-sidebar>` remains, it becomes dead code (no harm, but confusing).

**How to avoid:** Remove `@filter-changed=${this._onFilterChanged}` from `<bee-sidebar>` in `bee-atlas.render()`. Add it to `<bee-filter-toolbar>`.

### Pitfall 3: download-csv vs csv-download event name mismatch

**What goes wrong:** `bee-table` dispatches `download-csv`. The UI spec for `bee-filter-toolbar` specifies `csv-download` (different name). If `bee-atlas` listens for the wrong name on `<bee-filter-toolbar>`, the CSV button does nothing.

**How to avoid:** Use `csv-download` on `bee-filter-toolbar` (per UI spec). Keep `download-csv` on `bee-table`. In `bee-atlas`, add `@csv-download=${this._onDownloadCsv}` to `<bee-filter-toolbar>`.

### Pitfall 4: Existing test in bee-sidebar.test.ts expects bee-filter-controls in sidebar

**What goes wrong:** `bee-sidebar.test.ts` line 157-160 has: `expect(src).toMatch(/bee-filter-controls/)`. After this phase removes `<bee-filter-controls>` from the sidebar, this test fails.

**How to avoid:** Update `bee-sidebar.test.ts` — remove or invert this test. Add corresponding test asserting `bee-filter-controls` appears in `bee-filter-toolbar.ts`.

Specifically, these tests in `bee-sidebar.test.ts` describe block `DECOMP-04` need updating:
- `'bee-sidebar.ts contains bee-filter-controls sub-component tag'` — becomes FAIL (correct outcome, but test must change from "contains" to "does NOT contain")

### Pitfall 5: `boundaryMode` property in existing filter-controls test

**What goes wrong:** `bee-sidebar.test.ts` line 62 expects `bee-filter-controls` to have a `boundaryMode` @property, but `bee-filter-controls.ts` has no such property today. This test is already failing before Phase 53. Phase 53 does not need to add `boundaryMode` to filter-controls — it's not in the UI spec.

**How to avoid:** Note this pre-existing failing test. If the test suite gate requires all tests to pass, this test must be removed or fixed separately from Phase 53 work. Do not introduce `boundaryMode` to `bee-filter-controls` to make it pass — it's not in scope.

---

## Code Examples

Verified patterns from existing codebase:

### New Lit Component Shell (mirrors bee-header.ts)

```typescript
// Source: /Users/rainhead/dev/beeatlas/frontend/src/bee-header.ts
import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('bee-filter-toolbar')
export class BeeFilterToolbar extends LitElement {
  @property({ attribute: false }) filterState!: FilterState;
  // ... other props

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      width: 100%;
      padding: 0 8px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      min-height: 48px;
      box-sizing: border-box;
    }
    bee-filter-controls { flex-grow: 1; }
    .csv-btn {
      flex-shrink: 0;
      margin-left: 8px;
      /* per UI spec */
      background: transparent;
      border: 1px solid var(--border-input);
      border-radius: 4px;
      padding: 6px 12px;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-body);
      cursor: pointer;
      min-height: 44px;
      white-space: nowrap;
    }
    .csv-btn:hover { background: var(--surface-muted); }
    .csv-btn:active { background: var(--surface-pressed); }
  `;

  private _onCsvClick() {
    this.dispatchEvent(new CustomEvent('csv-download', {
      bubbles: true, composed: true,
    }));
  }

  render() {
    return html`
      <div role="toolbar" aria-label="Filter controls" style="display:contents">
        <bee-filter-controls
          .filterState=${this.filterState}
          .taxaOptions=${this.taxaOptions}
          .countyOptions=${this.countyOptions}
          .ecoregionOptions=${this.ecoregionOptions}
          .collectorOptions=${this.collectorOptions}
          .summary=${this.summary}
        ></bee-filter-controls>
        <button class="csv-btn" @click=${this._onCsvClick}>Download CSV</button>
      </div>
    `;
  }
}
```

### bee-atlas Wiring (key change)

```typescript
// Source: /Users/rainhead/dev/beeatlas/frontend/src/bee-atlas.ts (modified)
// In render():
html`
  <bee-header ...></bee-header>
  <bee-filter-toolbar
    .filterState=${this._filterState}
    .taxaOptions=${this._taxaOptions}
    .countyOptions=${this._countyOptions}
    .ecoregionOptions=${this._ecoregionOptions}
    .collectorOptions=${this._collectorOptions}
    .summary=${this._summary}
    .layerMode=${this._layerMode}
    @filter-changed=${this._onFilterChanged}
    @csv-download=${this._onDownloadCsv}
  ></bee-filter-toolbar>
  <div class="content">
    ...
    <bee-sidebar
      .samples=${this._selectedSamples}
      .summary=${this._summary}
      .filteredSummary=${this._filteredSummary}
      .layerMode=${this._layerMode}
      .viewMode=${this._viewMode}
      .recentSampleEvents=${...}
      .sampleDataLoaded=${this._sampleDataLoaded}
      .selectedSampleEvent=${this._selectedSampleEvent}
      .activeFeedEntries=${this._activeFeedEntries}
      @close=${this._onClose}
      @layer-changed=${this._onLayerChanged}
      @view-changed=${this._onViewChanged}
      @sample-event-click=${this._onSampleEventClick}
    ></bee-sidebar>
  </div>
`
```

Note: `@filter-changed`, `taxaOptions`, `countyOptions`, `ecoregionOptions`, `collectorOptions`, `filterState` are removed from `<bee-sidebar>`.

### Test Pattern (mirrors bee-header.test.ts)

```typescript
// Source: /Users/rainhead/dev/beeatlas/frontend/src/tests/bee-header.test.ts
describe('FILT-08: bee-filter-toolbar property interface', () => {
  test('BeeFilterToolbar has @property declarations for required inputs', async () => {
    const { BeeFilterToolbar } = await import('../bee-filter-toolbar.ts');
    const props = (BeeFilterToolbar as any).elementProperties;
    expect(props.has('filterState')).toBe(true);
    expect(props.has('taxaOptions')).toBe(true);
  });
});

describe('FILT-09: csv-download event', () => {
  test('clicking Download CSV dispatches csv-download event', async () => {
    await import('../bee-filter-toolbar.ts');
    const el = document.createElement('bee-filter-toolbar') as any;
    document.body.appendChild(el);
    await el.updateComplete;
    let fired = false;
    el.addEventListener('csv-download', () => { fired = true; });
    const btn = el.shadowRoot.querySelector('.csv-btn');
    btn.click();
    expect(fired).toBe(true);
    document.body.removeChild(el);
  });
});
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 |
| Config file | `frontend/vite.config.ts` (test.environment: happy-dom) |
| Quick run command | `cd frontend && npm test -- --run src/tests/bee-filter-toolbar.test.ts` |
| Full suite command | `cd frontend && npm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FILT-08 | `bee-filter-toolbar` has correct @property declarations | unit | `cd frontend && npm test -- --run src/tests/bee-filter-toolbar.test.ts` | Wave 0 |
| FILT-08 | `bee-filter-controls` is rendered inside `bee-filter-toolbar` shadow DOM | unit | same | Wave 0 |
| FILT-08 | `bee-sidebar.ts` does NOT contain `bee-filter-controls` tag | unit (source scan) | same | Wave 0 |
| FILT-08 | `filter-changed` from toolbar reaches `bee-atlas` | integration — manual only | — | manual |
| FILT-09 | Clicking CSV button dispatches `csv-download` event | unit | same | Wave 0 |
| FILT-09 | `bee-atlas.ts` listens for `csv-download` on `bee-filter-toolbar` | unit (source scan) | same | Wave 0 |

### Sampling Rate

- **Per task commit:** `cd frontend && npm test -- --run src/tests/bee-filter-toolbar.test.ts`
- **Per wave merge:** `cd frontend && npm test -- --run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `frontend/src/tests/bee-filter-toolbar.test.ts` — covers FILT-08 and FILT-09
- [ ] Update `frontend/src/tests/bee-sidebar.test.ts` — change `DECOMP-04` test "bee-sidebar.ts contains bee-filter-controls sub-component tag" to assert it does NOT contain it

---

## Environment Availability

Step 2.6: SKIPPED — no external dependencies. This is a pure TypeScript/Lit code change within the existing frontend dev environment.

---

## Runtime State Inventory

Step 2.5: SKIPPED — this is not a rename/refactor/migration phase. No stored data, live service config, or OS-registered state is affected. Filter state lives in URL params and in-memory `@state()` on `bee-atlas`; neither changes shape in this phase.

---

## Security Domain

This phase introduces no authentication, session management, cryptography, or user data handling. The CSV download uses `URL.createObjectURL` on a `Blob` — the existing pattern already in production. No ASVS categories apply.

---

## Open Questions

1. **`role="toolbar"` on `:host` vs inner div**
   - What we know: The UI spec says use `<div role="toolbar" aria-label="Filter controls">` as the shadow root's root element. The `:host` is a `<bee-filter-toolbar>` custom element with `display: flex`. In Lit, `:host` styles apply to the custom element itself. The `role` attribute would need to go on the host element or an inner wrapper div.
   - What's unclear: Whether `role="toolbar"` should be on `:host` (via `this.setAttribute` in constructor or host CSS) or on a wrapping div inside the shadow.
   - Recommendation: Place a wrapping `<div role="toolbar">` inside the shadow root. This is the most explicit approach and matches the UI spec language "as the shadow root's root element." The `:host` remains the flex container.

2. **Existing `boundaryMode` test failure in bee-sidebar.test.ts**
   - What we know: Line 62 of `bee-sidebar.test.ts` expects `bee-filter-controls` to have a `boundaryMode` property; the current implementation does not have this property. This test is already failing before Phase 53 begins.
   - Recommendation: Phase 53 should remove or update this test as part of the sidebar cleanup work, since Phase 53 already touches `bee-sidebar.test.ts` to update the `DECOMP-04` suite.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Composed events from `bee-filter-controls` bubble through `bee-filter-toolbar`'s shadow DOM to `bee-atlas` without manual re-emission | Architecture Patterns | If wrong, `filter-changed` won't reach `bee-atlas`; fix is to add explicit re-emission in the toolbar |

**Note on A1:** This is the established Lit/Web Components composed-event model. The existing `bee-sidebar` → `bee-atlas` wiring provides empirical evidence it works at the current site. Risk is LOW.

---

## Sources

### Primary (HIGH confidence)

- `[VERIFIED: /Users/rainhead/dev/beeatlas/frontend/src/bee-atlas.ts]` — current event wiring, `_onDownloadCsv` logic, `bee-sidebar` props
- `[VERIFIED: /Users/rainhead/dev/beeatlas/frontend/src/bee-sidebar.ts]` — current filter-controls usage, props to remove
- `[VERIFIED: /Users/rainhead/dev/beeatlas/frontend/src/bee-filter-controls.ts]` — component API, event name, `filter-changed` dispatch
- `[VERIFIED: /Users/rainhead/dev/beeatlas/frontend/src/bee-header.ts]` — style and structure pattern to follow
- `[VERIFIED: /Users/rainhead/dev/beeatlas/frontend/src/index.css]` — all CSS custom properties used in UI spec
- `[VERIFIED: /Users/rainhead/dev/beeatlas/.planning/phases/53-filter-toolbar/53-UI-SPEC.md]` — layout, spacing, color, accessibility contract
- `[VERIFIED: /Users/rainhead/dev/beeatlas/frontend/src/tests/bee-sidebar.test.ts]` — existing test suite, DECOMP-04 tests that need updating
- `[VERIFIED: /Users/rainhead/dev/beeatlas/frontend/src/tests/bee-header.test.ts]` — test pattern to follow
- `[VERIFIED: /Users/rainhead/dev/beeatlas/frontend/package.json]` — Vitest 4.1.2, Lit 3.2.1, happy-dom test environment

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — read directly from package.json and existing source files
- Architecture: HIGH — component structure fully specified in UI spec; event patterns verified from existing wiring
- Pitfalls: HIGH — identified from direct code inspection of files that will be modified

**Research date:** 2026-04-13
**Valid until:** This is a static codebase analysis. Valid until any of the source files change.
