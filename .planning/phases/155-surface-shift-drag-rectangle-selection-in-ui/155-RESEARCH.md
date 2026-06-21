# Phase 155: Surface Shift-Drag Rectangle Selection in UI - Research

**Researched:** 2026-06-21
**Domain:** Lit Web Components / CSS media queries / presentational UI addition
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Pure desktop discoverability only. No new drawing path, no touch box-drawing, no behavior change.
- **D-02:** Affordance hidden on touch via `@media (hover: hover) and (pointer: fine)` capability query. NOT UA sniffing.
- **D-03:** Persistent hint text reusing the existing `.hint` class in `bee-pane.ts` (muted gray, 0.875rem). No new UI pattern.
- **D-04:** Always visible on desktop regardless of filter/bounds state. No persistence, no hide-after-first-use.
- **D-05:** Placement: in the sidebar filters section, immediately below the `where` ("County, ecoregion, or place") input. NOT overlaid on the map.
- **D-06:** Exact copy (verbatim): **"Shift-drag on map to set bounds"**

### Claude's Discretion
- Exact hint styling/spacing, optional emphasis on "Shift" (bold/`<kbd>`), whether an icon accompanies text.
- Precise media-query breakpoint expression (capability query form chosen).
- Whether hint is rendered conditionally in the Lit template vs. always-rendered-then-CSS-hidden — prefer always-rendered-then-hidden (simpler; no state binding).

### Deferred Ideas (OUT OF SCOPE)
- Touch / tap-to-draw bounds mode (new capability, different phase).
- First-visit onboarding / dismissible hint (localStorage persistence).
</user_constraints>

---

## Summary

This is a one-file presentational addition to `src/bee-pane.ts`. The change is:

1. Add a `<p class="hint hint--desktop-only">Shift-drag on map to set bounds</p>` immediately after the closing `</div>` of the `div.input-wrap` block at line 1085.
2. Add a single CSS rule to the `static styles` block (lines 127-510) gating `.hint--desktop-only` behind `@media (hover: hover) and (pointer: fine)`.
3. No state plumbing, no new properties, no event changes, no modifications to `bee-map.ts`.

The test surface is source-text matching (same pattern as `bee-sidebar.test.ts`) — no DOM mounting or mocking required.

**Primary recommendation:** Always-render the hint element; use a CSS modifier class + `@media` rule to `display: none` it on touch. This keeps the template free of JS logic and is consistent with the component's pure-presenter role. [ASSUMED — no alternative evaluated in official docs; based on Lit component conventions]

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Hint text render | Frontend (`bee-pane.ts`) | — | Pure presenter; hint is static content, no state |
| Desktop-only gating | CSS media query in `static styles` | — | No JS; the element is simply hidden via `display: none` on touch |
| Shift-drag gesture (read-only ref) | Frontend (`bee-map.ts`) | — | Unchanged; this phase only surfaces what it already does |

---

## Standard Stack

No new packages. This phase is a CSS + Lit template edit only.

### Existing tools in use
| Tool | Version | Role |
|------|---------|------|
| Lit | (project dep) | Web component base class; `css\`\`` tagged template for styles |
| Vitest | (project dep) | Test runner; source-text assertions used throughout |

---

## Package Legitimacy Audit

No external packages installed. Not applicable.

---

## Architecture Patterns

### Existing `.hint` class — verbatim CSS (lines 420-424)

```css
/* src/bee-pane.ts static styles, lines 420-424 */
.hint {
  color: var(--text-muted);
  font-size: 0.875rem;
  margin: 0;
}
```

[VERIFIED: read from source]

### Existing `.hint` usages

The class is used in two places, both inside `div.panel-content` in the occurrence list area (lines 1219, 1221):

```ts
html`<div class="panel-content"><p class="hint">No sources selected. Enable at least one source above.</p></div>`
html`<div class="panel-content"><p class="hint">Click a point on the map to see details.</p></div>`
```

The new hint does NOT wrap in `div.panel-content` — it sits directly in the filters section flow, at the same level as `div.input-wrap`. Spacing comes from the existing layout context. [VERIFIED: read from source]

### Exact insertion point (line 1085)

The `where` input block closes at line 1085:

```ts
// lines 1046-1085 — the "where" input-wrap block
<div class="input-wrap">
  <input
    type="text"
    class=${'filter-input has-near-me'}
    placeholder="County, ecoregion, or place"
    .value=${this.boundsFilterActive ? this.boundsFilterLabel : this._whereInput}
    ?readonly=${this.boundsFilterActive}
    @input=${this._onWhereInput}
    @keydown=${...}
    @blur=${this._onBlur}
    autocomplete="off"
    spellcheck="false"
  />
  ${this.boundsFilterActive ? html`
    <button type="button" class="near-me-btn"
      aria-label="Clear near-me filter"
      @click=${...}>&#x2715;</button>
  ` : html`
    <button type="button" class="near-me-btn"
      aria-label="Find occurrences near me"
      @click=${...}>
      ${this._crosshairSvg}
    </button>
  `}
  ${this._openSection === 'where' && this._suggestions.length > 0 ? html`
    <ul class="suggestions" role="listbox">...</ul>
  ` : nothing}
</div>
// ← INSERT HINT HERE (line 1085, after closing </div>)
<div class="elev-row">
```

[VERIFIED: read from source]

### Desktop-only CSS gating

Add a modifier class `.hint--desktop-only` and a media rule at the end of `static styles` (before the closing backtick at line 510):

```css
/* New addition — inside static styles block, before closing ` */
.hint--desktop-only {
  display: none;
}
@media (hover: hover) and (pointer: fine) {
  .hint--desktop-only {
    display: block;
  }
}
```

The element is always rendered in the DOM but hidden via `display: none` on touch. On desktop (pointer: fine + hover: hover) the media query overrides to `display: block`. This approach:
- Keeps the Lit template free of JS conditional logic (no `nothing` branch, no property binding)
- Respects the pure-presenter pattern (no state needed)
- Survives SSR / prerender correctly
- Is the idiomatic Lit / web-components CSS approach for capability-gated visibility

[ASSUMED — well-established CSS pattern; not verified against Lit official docs in this session]

### Template addition

```ts
// After </div> closing div.input-wrap, before <div class="elev-row">:
<p class="hint hint--desktop-only">Shift-drag on map to set bounds</p>
```

Discretionary: optionally wrap "Shift" in `<kbd>` for semantic clarity — `<kbd>Shift</kbd>-drag on map to set bounds`. This is low-risk (inline element inside `<p>`) and improves keyboard-affordance semantics. The planner may decide either way.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Desktop-only visibility | JS `navigator.maxTouchPoints` / UA sniff | CSS `@media (hover: hover) and (pointer: fine)` |
| New text styling | New CSS class | Reuse `.hint` (already exists) |

---

## Common Pitfalls

### Pitfall 1: Placing hint inside `div.panel-content`
**What goes wrong:** The two existing `.hint` usages are inside `div.panel-content`. Wrapping the new hint in `div.panel-content` would apply different padding and layout than the filters section expects.
**How to avoid:** Insert the bare `<p class="hint hint--desktop-only">` directly in the filters flow after `div.input-wrap`, without a wrapping `div.panel-content`.

### Pitfall 2: Binding hint visibility to `boundsFilterActive`
**What goes wrong:** It might seem natural to hide the hint when bounds are already active. D-04 explicitly rejects this — the hint is always visible on desktop.
**How to avoid:** No property binding on the hint element. Pure CSS gate only.

### Pitfall 3: Using `display: none` in the base rule without the media override order
**What goes wrong:** If the media rule appears before the base `.hint--desktop-only { display: none }` rule in the stylesheet, specificity is equal but cascade order matters; the base rule would win on desktop.
**How to avoid:** Always put the media query block after the base `display: none` rule (as shown in the pattern above). CSS cascade: later rule wins at equal specificity.

### Pitfall 4: Forgetting `static styles` is a Lit `css` tagged template
**What goes wrong:** Plain CSS string syntax differences — `css` tagged templates do not accept `//` comments (use `/* */` only).
**How to avoid:** Use block comments. The `/* New addition */` comment in the pattern above is correct form.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File |
|--------|----------|-----------|-------------------|------|
| D-05/D-06 | Hint text "Shift-drag on map to set bounds" exists in `bee-pane.ts` template | Source-text assertion | `npm test` | `src/tests/bee-sidebar.test.ts` (extend) |
| D-03 | Hint uses `.hint` class | Source-text assertion | `npm test` | same |
| D-02 | `@media (hover: hover) and (pointer: fine)` gates the hint | Source-text assertion on `static styles` | `npm test` | same |

### Recommended test additions in `src/tests/bee-sidebar.test.ts`

The existing `bee-sidebar.test.ts` already reads `paneSrc` via `readFileSync`. Add a new `describe` block — no new mocks, no DOM mounting:

```ts
// New describe block in src/tests/bee-sidebar.test.ts
// (paneSrc already declared at top of file)

describe('UI-01: shift-drag bounds hint in bee-pane', () => {
  test('bee-pane.ts contains the exact hint copy', () => {
    expect(paneSrc).toContain('Shift-drag on map to set bounds');
  });

  test('bee-pane.ts applies .hint class to the shift-drag hint', () => {
    // The hint <p> element must carry class="hint hint--desktop-only" (or similar)
    expect(paneSrc).toMatch(/class=["'][^"']*hint[^"']*["'][^>]*>Shift-drag on map to set bounds/);
  });

  test('bee-pane.ts gates hint with pointer capability media query', () => {
    expect(paneSrc).toMatch(/@media\s*\(\s*hover\s*:\s*hover\s*\).*pointer\s*:\s*fine/s);
  });
});
```

No `bee-pane.test.ts` exists — tests for `bee-pane.ts` currently live in `src/tests/bee-sidebar.test.ts` which already imports `paneSrc`. Extend that file rather than creating a new one. [VERIFIED: read from source]

### Wave 0 Gaps
None — `bee-sidebar.test.ts` already has the infrastructure. Only the new describe block needs adding.

---

## Security Domain

Not applicable. This phase is a read-only presentational addition with no data handling, auth, input, or network paths.

---

## Open Questions (RESOLVED)

1. **`<kbd>` on "Shift"** — RESOLVED: planner chose literal text (no `<kbd>`) to keep the D-06 copy as a single literal substring for the source-text test. No new CSS needed.
   - What we know: D-06 locks the copy as "Shift-drag on map to set bounds"; Claude's Discretion allows optional emphasis.
   - What's unclear: Whether `<kbd>` styling is defined anywhere in the project.
   - Recommendation: Planner may add `<kbd>Shift</kbd>` if it reads cleanly; otherwise literal text is fine. No new CSS needed for functional correctness.

---

## Sources

### Primary (HIGH confidence)
- `src/bee-pane.ts` lines 127-510 (static styles block), 420-424 (`.hint` rule), 1046-1085 (`div.input-wrap` block), 1219-1221 (existing `.hint` usages) — read directly from source
- `src/tests/bee-sidebar.test.ts` — read directly from source; establishes the source-text test pattern

### Secondary / Assumed
- CSS `@media (hover: hover) and (pointer: fine)` as the capability query for "non-touch / pointer device" — [ASSUMED] based on well-established CSS spec; not re-verified against MDN in this session

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | CSS `@media (hover: hover) and (pointer: fine)` correctly excludes touch devices | Desktop-only CSS gating | Minor: some hybrid devices fall into edge cases, but this is the industry-standard query per D-02 |
| A2 | Always-render + CSS hide is simpler than conditional template render for this use case | Architecture Patterns | Low: either approach works; if planner prefers conditional render, template uses `nothing` branch (no mocking needed either way) |

---

## Metadata

**Confidence breakdown:**
- Exact insertion point: HIGH — read from source, line confirmed
- `.hint` class definition and existing usages: HIGH — read from source
- CSS media query approach: HIGH (pattern) / ASSUMED (not re-verified vs. official spec in session)
- Test strategy: HIGH — mirrors existing `bee-sidebar.test.ts` pattern exactly

**Research date:** 2026-06-21
**Valid until:** Stable (no external deps; only valid until `bee-pane.ts` template structure changes near line 1085)
