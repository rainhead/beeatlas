# Phase 39: View Mode Toggle - Research

**Researched:** 2026-04-07
**Domain:** Lit Web Components — state management, URL serialization, conditional rendering
**Confidence:** HIGH

## Summary

Phase 39 is a pure internal wiring exercise with no new libraries. Every building block is already present in the codebase and follows established patterns. The work is: (1) add a `viewMode` field to `UiState` and the `buildParams`/`parseParams` round-trip, (2) add a `_viewMode` `@state()` field to `bee-atlas` with a `_onViewChanged` handler and URL push, (3) add a `viewMode` `@property()` to `bee-sidebar` and a second toggle row that emits `view-changed`, and (4) make `bee-atlas.render()` conditionally render `<bee-map>` vs `<div class="table-slot">`.

The CONTEXT.md and UI-SPEC.md are fully prescriptive — they specify exact class names, CSS values, URL param name, event names, and placeholder markup. No design decisions remain open for research. Research effort focuses on verifying the exact code shape needed and identifying test gaps.

**Primary recommendation:** Follow the `layerMode` / `layer-changed` pattern exactly. Each of the four integration points (`url-state.ts`, `bee-sidebar.ts`, `bee-atlas.ts` render, `bee-atlas.ts` event handler + URL push) maps to a near-mechanical extension of existing code.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Toggle lives inside `bee-sidebar`, rendered below the Specimens/Samples layer-toggle row and above filter controls.
- **D-02:** Visual form: two segmented buttons — "Map" and "Table" (UI-SPEC final form is text-only; emoji deferred). Active button highlighted with accent color and bottom border.
- **D-03:** Sidebar stays visible in table view. Table replaces map area; sidebar remains on the right.
- **D-04:** `bee-map` must not render (absent from DOM) in table view. Use conditional in `bee-atlas` render: `${viewMode === 'map' ? html\`<bee-map ...>\` : html\`<div class="table-slot"></div>\`}`.
- **D-05:** URL param is `view=table`; map view omits the param entirely (absence = map).
- **D-06:** `UiState` in `url-state.ts` gains `viewMode: 'map' | 'table'`. `buildParams` omits when `map`; `parseParams` defaults to `map` when absent.
- **D-07:** Phase 39 renders empty `<div class="table-slot">` in table view. No stub message. Phase 40 populates it.

### Claude's Discretion

- Toggle button styling: match existing UI conventions (CSS custom properties, `bee-sidebar` static styles).
- Event propagation: toggle emits a `view-changed` CustomEvent from `bee-sidebar` up to `bee-atlas`, following event-up / property-down pattern.
- Button labels: "Map" and "Table" (text-only, no emoji — per UI-SPEC).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VIEW-01 | User can toggle between map view and table view via a control in the main UI | New toggle row in `bee-sidebar`, mirroring existing `_renderToggle()` / `_onToggleLayer()` pattern |
| VIEW-02 | In table view, the map is not rendered, giving the table full layout space | Conditional render in `bee-atlas.render()` — `<bee-map>` replaced by `<div class="table-slot">` |
| VIEW-03 | View mode (map/table) is encoded in the URL so the table view is bookmarkable and shareable | `UiState.viewMode` field + `buildParams`/`parseParams` extension + `_onPopState` restoration |
</phase_requirements>

---

## Standard Stack

No new libraries. Phase uses the existing project stack exclusively.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lit | ^3.2.1 | Web Component base, `@state`, `@property`, `html` template literals | [VERIFIED: package.json] Project standard since Phase 1 |
| TypeScript | ^5.8.2 | Type safety | [VERIFIED: package.json] Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^4.1.2 | Unit tests (happy-dom environment) | [VERIFIED: package.json] All new behavior tested here |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Project Structure

No new files. All changes are in-place edits to three existing files:

```
frontend/src/
├── url-state.ts       # UiState + buildParams + parseParams — add viewMode
├── bee-sidebar.ts     # add viewMode @property, new toggle row, view-changed event
├── bee-atlas.ts       # add _viewMode @state, _onViewChanged handler, conditional render
└── tests/
    └── url-state.test.ts   # extend with viewMode round-trip tests
```

### Pattern 1: State Ownership (Lit property-down / event-up)

**What:** `bee-atlas` owns `_viewMode` as `@state()`. It passes it down to `bee-sidebar` as a `@property()`. `bee-sidebar` emits `view-changed` CustomEvent upward. `bee-atlas` handles it, updates state, pushes URL.

**When to use:** This is the ONLY valid pattern for this codebase. CLAUDE.md states: "`<bee-atlas>` owns all reactive state. `<bee-map>` and `<bee-sidebar>` are pure presenters — they receive state as properties and emit custom events upward."

**Example (existing model to follow):**
```typescript
// Source: frontend/src/bee-sidebar.ts [VERIFIED: read in session]
// Layer toggle — exact model for view toggle:

private _onToggleLayer(mode: 'specimens' | 'samples') {
  if (mode === this.layerMode) return;  // no-op if already active
  this.dispatchEvent(new CustomEvent<'specimens' | 'samples'>('layer-changed', {
    bubbles: true,
    composed: true,
    detail: mode,
  }));
}
```

```typescript
// Source: frontend/src/bee-atlas.ts [VERIFIED: read in session]
// Handler — exact model:

private _onLayerChanged(e: CustomEvent<'specimens' | 'samples'>) {
  this._layerMode = e.detail;
  this._selectedSamples = null;
  this._selectedOccIds = null;
  this._selectedSampleEvent = null;
  this._pushUrlState();
}
```

### Pattern 2: URL State — Omit Default

**What:** Non-default UI state serialized to URL params. Default value omitted entirely (absence = default).

**Example (existing `buildParams` pattern):**
```typescript
// Source: frontend/src/url-state.ts [VERIFIED: read in session]
if (ui.layerMode !== 'specimens') params.set('lm', ui.layerMode);  // omit default
if (ui.boundaryMode !== 'off') params.set('bm', ui.boundaryMode);  // omit default
// New addition follows same pattern:
// if (ui.viewMode !== 'map') params.set('view', ui.viewMode);
```

**`parseParams` default:**
```typescript
// Source: frontend/src/url-state.ts [VERIFIED: read in session]
// Existing pattern for layerMode:
const lmRaw = p.get('lm') ?? '';
const layerMode: 'specimens' | 'samples' = lmRaw === 'samples' ? 'samples' : 'specimens';
// New pattern follows same form:
// const viewRaw = p.get('view') ?? '';
// const viewMode: 'map' | 'table' = viewRaw === 'table' ? 'table' : 'map';
```

### Pattern 3: Conditional Render (bee-map absent in table view)

**What:** `bee-atlas.render()` replaces `<bee-map>` with `<div class="table-slot">` when `_viewMode === 'table'`. Lit removes the element from the DOM when the conditional branch changes.

**What to use:**
```typescript
// Source: CONTEXT.md D-04 [VERIFIED: read in session]
${this._viewMode === 'map'
  ? html`<bee-map ...all existing props...></bee-map>`
  : html`<div class="table-slot"></div>`
}
```

The CSS for `.table-slot` goes in `bee-atlas` static styles (not `bee-sidebar`):
```css
/* Source: UI-SPEC.md [VERIFIED: read in session] */
.table-slot {
  flex-grow: 1;
  background: var(--surface);
}
```

### Pattern 4: Toggle Row HTML (bee-sidebar)

The view toggle row reuses **existing CSS classes** `.layer-toggle` and `.toggle-btn` / `.toggle-btn.active` — no new CSS rules needed.

```typescript
// Source: UI-SPEC.md + bee-sidebar.ts [VERIFIED: read in session]
private _renderViewToggle() {
  return html`
    <div class="layer-toggle">
      <button
        class=${this.viewMode === 'map' ? 'toggle-btn active' : 'toggle-btn'}
        @click=${() => this._onToggleView('map')}
      >Map</button>
      <button
        class=${this.viewMode === 'table' ? 'toggle-btn active' : 'toggle-btn'}
        @click=${() => this._onToggleView('table')}
      >Table</button>
    </div>
  `;
}

private _onToggleView(mode: 'map' | 'table') {
  if (mode === this.viewMode) return;
  this.dispatchEvent(new CustomEvent<'map' | 'table'>('view-changed', {
    bubbles: true,
    composed: true,
    detail: mode,
  }));
}
```

Insert `${this._renderViewToggle()}` immediately after `${this._renderToggle()}` in `bee-sidebar.render()`.

### Pattern 5: _onPopState Restoration

`bee-atlas._onPopState` restores all URL state on browser back/forward. The `viewMode` restoration follows the `layerMode` restoration pattern already in the handler.

**Addition needed in `_onPopState`:**
```typescript
// Source: bee-atlas.ts _onPopState [VERIFIED: read in session]
this._layerMode = parsed.ui?.layerMode ?? 'specimens';
this._boundaryMode = parsed.ui?.boundaryMode ?? 'off';
// Add:
this._viewMode = parsed.ui?.viewMode ?? 'map';
```

And in `firstUpdated()`, same restoration pattern:
```typescript
const initLayerMode = initialParams.ui?.layerMode ?? 'specimens';
const initBoundaryMode = initialParams.ui?.boundaryMode ?? 'off';
// Add:
const initViewMode = initialParams.ui?.viewMode ?? 'map';
this._viewMode = initViewMode;
```

And `buildParams` call sites in `bee-atlas.ts` must pass `viewMode` in the `ui` argument.

### Anti-Patterns to Avoid

- **`bee-sidebar` owning `viewMode` as `@state()`:** Violates architecture invariant. `bee-sidebar` is a pure presenter — viewMode must come in as `@property()`.
- **Rendering `<bee-map hidden>` instead of conditional omission:** D-04 specifies bee-map must not render (not just be hidden) to avoid consuming OL canvas resources. Use the conditional branch, not CSS `display:none` or `hidden` attribute.
- **Adding CSS to `bee-sidebar` for `.table-slot`:** The table slot is rendered by `bee-atlas`, so its CSS belongs in `bee-atlas` static styles.
- **Forgetting `buildParams` call site in `firstUpdated()`:** There are two places in `bee-atlas` that call `buildParams` — `_pushUrlState()` and `firstUpdated()` (for the initial `replaceState` call). Both must pass the updated `UiState` with `viewMode`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Segmented button UI | Custom button component | Reuse `.layer-toggle` / `.toggle-btn` CSS | Already exists, already tested visually, maintains design consistency |
| URL serialization | Custom string building | Extend existing `buildParams`/`parseParams` | Round-trip behavior already tested; edge cases (invalid values, absent params) already handled |
| State routing | Hash-based router, History API wrapper | Existing `_pushUrlState` + `_onPopState` pattern | Pattern already handles debounce, history push vs replace, and restoration |

---

## Common Pitfalls

### Pitfall 1: Missing `viewMode` in `UiState` interface

**What goes wrong:** TypeScript allows `buildParams(view, filter, selection, { layerMode, boundaryMode })` without `viewMode` if the interface isn't updated. The URL will serialize without `view=table` even when table view is active.

**Why it happens:** Adding `@state() private _viewMode` and calling `_pushUrlState()` without updating `UiState` in `url-state.ts` — TypeScript won't complain if `viewMode` isn't in the interface but the object literal doesn't include it.

**How to avoid:** Update `UiState` interface first, then TypeScript will enforce the field is passed at all `buildParams` call sites.

### Pitfall 2: Incomplete `buildParams` call sites

**What goes wrong:** `_pushUrlState()` passes `viewMode` correctly but `firstUpdated()` still calls `buildParams` with the old `{ layerMode, boundaryMode }` object. Initial page load writes a URL without `view=table` even when restored from URL.

**Why it happens:** There are two `buildParams` call sites in `bee-atlas.ts` (lines 213 and 259–264 in the current file). [VERIFIED: read in session]

**How to avoid:** Search for all `buildParams(` occurrences in `bee-atlas.ts` before finishing. Both must receive `viewMode`.

### Pitfall 3: `view=table` left in URL when switching back to map

**What goes wrong:** `_pushUrlState` always sets `view=table`, so back-navigation never clears the param.

**Why it happens:** `buildParams` is called without the omit-default logic for `viewMode`.

**How to avoid:** `buildParams` must omit `view` param entirely when `viewMode === 'map'` — following the established `lm` / `bm` pattern.

### Pitfall 4: `_onPopState` not restoring `viewMode`

**What goes wrong:** User switches to table, navigates away, presses back — lands in table view in the browser URL, but `bee-atlas` shows map view because `_onPopState` doesn't restore `_viewMode`.

**Why it happens:** Adding `_viewMode` to `@state()` and `firstUpdated` but forgetting `_onPopState`.

**How to avoid:** Check `_onPopState` restores all three: `_layerMode`, `_boundaryMode`, and `_viewMode`.

### Pitfall 5: `bee-map` receiving stale properties after remount

**What goes wrong:** When switching map → table → map, `<bee-map>` is unmounted and remounted. Lit will re-run property setters, but OL map initialization may re-trigger `view-moved` events before `_isRestoringFromHistory` is set.

**Why it happens:** The conditional render creates a new element instance each time table → map switch occurs; the OL map inside will re-initialize and fire `view-moved`.

**How to avoid:** This is pre-existing behavior for the pattern chosen (D-04). The `_onViewMoved` handler only calls `_pushUrlState()` when `!_isRestoringFromHistory`, so normal user-driven map → table → map cycles won't corrupt URL state. No special handling needed unless tests reveal a regression.

---

## Code Examples

### UiState extension
```typescript
// Source: frontend/src/url-state.ts [VERIFIED: read in session]
export interface UiState {
  layerMode: 'specimens' | 'samples';
  boundaryMode: 'off' | 'counties' | 'ecoregions';
  viewMode: 'map' | 'table';  // ADD THIS
}
```

### buildParams addition
```typescript
// After the existing bm line:
if (ui.viewMode !== 'map') params.set('view', ui.viewMode);
```

### parseParams addition
```typescript
// After the existing boundaryMode block:
const viewRaw = p.get('view') ?? '';
const viewMode: 'map' | 'table' = viewRaw === 'table' ? 'table' : 'map';
// Include in ui object when non-default:
if (layerMode !== 'specimens' || boundaryMode !== 'off' || viewMode !== 'map') {
  result.ui = { layerMode, boundaryMode, viewMode };
}
```

Note: The current `parseParams` condition `if (layerMode !== 'specimens' || boundaryMode !== 'off')` must be expanded to also include `|| viewMode !== 'map'` — otherwise table-view URLs that have no `lm` or `bm` param won't populate `result.ui` and `_onPopState` won't restore `_viewMode`.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 (happy-dom environment) |
| Config file | `frontend/vite.config.ts` (test section) |
| Quick run command | `cd frontend && npm test -- --run` |
| Full suite command | `cd frontend && npm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VIEW-01 | `view-changed` event emitted when inactive button clicked | unit (source inspection) | `npm test -- --run` | ❌ Wave 0 |
| VIEW-01 | No-op when active button clicked again | unit (source inspection) | `npm test -- --run` | ❌ Wave 0 |
| VIEW-02 | `bee-atlas` render: `<bee-map>` absent when `_viewMode='table'` | unit (source inspection) | `npm test -- --run` | ❌ Wave 0 |
| VIEW-03 | `viewMode=table` round-trips via `buildParams`/`parseParams` | unit (url-state.test.ts extension) | `npm test -- --run` | ❌ Wave 0 |
| VIEW-03 | `viewMode=map` (default): `view` param absent from URL | unit (url-state.test.ts extension) | `npm test -- --run` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && npm test -- --run`
- **Per wave merge:** `cd frontend && npm test -- --run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

The existing test files use source-inspection patterns (readFileSync + string matching) — this is the established pattern for structural tests in this project. [VERIFIED: bee-sidebar.test.ts read in session]

New tests to add:

- [ ] `frontend/src/tests/url-state.test.ts` — extend with `viewMode` round-trip cases (VIEW-03). Pattern: extend existing `url-state.test.ts`, add to the `buildParams -> parseParams round-trip` and `validation and rejection` describe blocks.
- [ ] `frontend/src/tests/bee-sidebar.test.ts` — source inspection: `bee-sidebar.ts` contains `view-changed` string; contains `viewMode` property declaration (VIEW-01).
- [ ] `frontend/src/tests/bee-atlas.test.ts` — source inspection: `bee-atlas.ts` contains `table-slot` string; contains `_viewMode` field (VIEW-02).

No new test files needed — extend existing files.

---

## Security Domain

No security-relevant surface introduced. This phase:
- Adds a URL query parameter with a two-value enum (`map` | `table`) — no user-supplied string is echoed into the DOM or used in SQL
- `parseParams` will default to `map` for any unrecognized value (the `viewRaw === 'table' ? 'table' : 'map'` pattern) — input validated by construction
- No authentication, session, access control, or cryptography involved

ASVS V5 (Input Validation): The `view` param is validated by the ternary default — only `'table'` produces non-default behavior; all other values silently become `'map'`. [ASSUMED — matches existing `lm` param validation pattern in codebase]

---

## Environment Availability

Step 2.6: SKIPPED — phase is a pure code/config change with no external tool dependencies. Existing Node.js + npm toolchain confirmed available (package.json verified in session).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `bee-map` re-initializes OL map on remount (table→map switch) but `_isRestoringFromHistory` guard prevents URL corruption | Common Pitfalls §5 | If OL fires `view-moved` before guard is set, URL could be overwritten; would need additional guard in `_onViewMoved` |

**All other claims were verified by reading the source files in this session.**

---

## Open Questions

1. **`bee-map` remount side-effects on table → map switch**
   - What we know: `bee-map` is conditionally rendered; OL map initializes in `bee-map.connectedCallback` or equivalent; `view-moved` events fire on initialization.
   - What's unclear: Whether the initialization `view-moved` event fires before or after `bee-atlas` has set `_viewState` correctly from the saved view.
   - Recommendation: Implement as specified (D-04). If integration testing shows a view-position reset on toggle-back, add a guard checking `_isRestoringFromHistory` is false AND `_viewMode` just changed from `table` to `map` before pushing URL state. Flag for Phase 40 verification.

---

## Sources

### Primary (HIGH confidence)
- `frontend/src/url-state.ts` — read in full; `UiState` interface, `buildParams`, `parseParams` exact shape verified
- `frontend/src/bee-atlas.ts` — read in full; `_onLayerChanged`, `_pushUrlState`, `_onPopState`, `firstUpdated` patterns verified; two `buildParams` call sites identified
- `frontend/src/bee-sidebar.ts` — read in full; `_renderToggle`, `_onToggleLayer`, `@property` declarations verified
- `.planning/phases/39-view-mode-toggle/39-CONTEXT.md` — all locked decisions read
- `.planning/phases/39-view-mode-toggle/39-UI-SPEC.md` — CSS classes, layout, copywriting contract verified
- `frontend/src/tests/url-state.test.ts` — read in full; test pattern for extending verified
- `frontend/src/tests/bee-sidebar.test.ts` — read in full; source-inspection test pattern verified
- `frontend/vite.config.ts` — test environment (happy-dom) confirmed
- `frontend/package.json` — versions confirmed

### Secondary (MEDIUM confidence)
- None needed — all decisions are locked by CONTEXT.md and all patterns verified from codebase.

### Tertiary (LOW confidence)
- None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — read from package.json in session
- Architecture patterns: HIGH — verified against actual source files in session
- Pitfalls: HIGH — derived from reading exact code that will be modified; one ASSUMED item (OL remount behavior) flagged
- Test gaps: HIGH — test directory contents listed; existing test files read in full

**Research date:** 2026-04-07
**Valid until:** Stable — no external dependencies; valid until source files change
