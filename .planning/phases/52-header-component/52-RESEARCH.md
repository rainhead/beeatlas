# Phase 52: Header Component - Research

**Researched:** 2026-04-13
**Domain:** Lit web components, CSS custom properties, native HTML `<details>/<summary>`, inline SVG
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Create a new `<bee-header>` Lit custom element (tag: `bee-header`). It replaces/extends the plain `<header>` content in `index.html`. The BeeAtlas title and GitHub icon link become part of the `<bee-header>` template, or remain alongside it in `index.html` — planner's choice based on what's cleaner.
- **D-02:** `<bee-atlas>` passes `layerMode` (`'specimens' | 'samples'`) and `viewMode` (`'map' | 'table'`) as `@property` inputs. `<bee-header>` emits `layer-changed` (detail: `'specimens' | 'samples'`) and `view-changed` (detail: `'map' | 'table'`) CustomEvents — identical contract to the existing bee-sidebar events so bee-atlas event handlers can be reused.
- **D-03:** Hamburger open/closed state is internal `@state()` within `<bee-header>`. `bee-atlas` does not manage it.
- **D-04:** Two inline SVG icons from Heroicons (or equivalent free set), hand-picked — no icon library added as a dependency. Good candidates: `map-pin` or `globe-alt` for Map; `table-cells` for Table. Exact paths chosen by planner/implementer.
- **D-05:** Two side-by-side icon buttons on the right side of the header. Active button gets accent color treatment (e.g., white fill with opacity 1 against the dark header); inactive is muted (lower opacity or greyed). Similar visual weight to the existing GitHub icon.
- **D-06:** Use native `<details>/<summary>` for the hamburger. The `<summary>` is the hamburger button (☰ or similar); the `<details>` body renders nav items vertically when open. Zero JS required, accessible by default.
- **D-07:** Breakpoint at 640px (40rem). Below 640px: hamburger shown, inline tabs hidden. Above 640px: inline tabs shown, hamburger hidden. This is a new breakpoint independent of the existing `max-aspect-ratio: 1` media query in bee-atlas.
- **D-08:** `lm=` (layer mode) and `view=` (view mode) URL params must continue to round-trip correctly through the new header controls. `<bee-header>` reads these via its props (already computed by bee-atlas from URL on startup) — no direct URL reading inside bee-header.

### Claude's Discretion

- Species and Plants placeholder tabs are greyed-out text (e.g., `opacity: 0.4`, `pointer-events: none`, `cursor: default`), no tooltip. They appear in both the desktop inline tabs and the hamburger dropdown so the roadmap is always visible.

### Deferred Ideas (OUT OF SCOPE)

- Placeholder tab "coming soon" tooltip — not needed for this phase; greyed text suffices
- Animated hamburger menu transition — deferred to polish phase
- Placeholder tabs hidden from hamburger on mobile — user did not select this; both placeholders appear in hamburger too
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HDR-01 | User can switch between Specimens and Samples data layers via header nav tabs; active tab is visually distinct | Lit @property + CustomEvent dispatch pattern verified in bee-sidebar.ts; tab CSS from UI-SPEC |
| HDR-02 | Header nav tabs collapse to a hamburger menu on narrow viewports | Native `<details>/<summary>` pattern; `@media (max-width: 640px)` breakpoint per D-07 |
| HDR-03 | Species and Plants appear as greyed-out disabled placeholders in the nav to signal the roadmap | CSS `opacity: 0.4; pointer-events: none; cursor: default` — no JS or click handler needed |
| HDR-04 | User can toggle between Map and Table view via an icon pair on the right side of the header | Inline SVG icon buttons with CustomEvent dispatch; same event shape as `_onViewChanged` in bee-atlas.ts |
</phase_requirements>

---

## Summary

Phase 52 adds a `<bee-header>` Lit custom element that replaces the bare `<header>` in `index.html`. The component is entirely self-contained: it receives `layerMode` and `viewMode` as `@property` inputs from `<bee-atlas>` and emits `layer-changed` / `view-changed` CustomEvents upward using the identical shape that `<bee-sidebar>` already emits. This means `bee-atlas`'s two existing event handlers (`_onLayerChanged`, `_onViewChanged`) wire to `bee-header` without modification.

All implementation decisions are fully locked in CONTEXT.md. There are no library choices to make — the stack is Lit 3, hand-rolled CSS custom properties, native HTML for the hamburger, and inline SVG (Heroicons paths, MIT license). The shadow DOM means all new CSS lives in the component's `static styles` block, inheriting from `index.css` only via CSS custom property inheritance, which works through shadow boundaries in Chromium and Firefox. [VERIFIED: MDN / CSS custom properties]

The only implementation subtlety is the `<details>/<summary>` hamburger in shadow DOM: the `<details>` element's `open` attribute is toggled by the browser natively without JS, but the D-03 decision says open/closed state is internal `@state()` — this means a click handler on `<summary>` should update the state, or the component can let the native `<details>` manage it and query the element directly. Either approach works; the planner should choose the cleaner of the two and document it in the plan.

**Primary recommendation:** Implement `bee-header` as a new `frontend/src/bee-header.ts` file, keeping the GitHub icon inside `bee-header` (cleaner than splitting it across `index.html` and the component), and import it in `bee-atlas.ts` alongside the other custom elements. Wire it above `bee-map`/`bee-sidebar` in `bee-atlas`'s `render()`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lit | ^3.2.1 | Custom element base class, templates, reactive properties | Already the project's component framework [VERIFIED: frontend/package.json] |
| TypeScript | ^5.8.2 | Type safety for props and event payloads | Already configured [VERIFIED: frontend/package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Heroicons inline SVG | 2.x (paths only, no package) | Map and Table view icons | Pick `map` and `table-cells` 24px outline paths; paste raw `<path d="...">` [VERIFIED: package.json — no @heroicons dep; MIT license] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native `<details>/<summary>` | JS-managed open state + click handler | D-06 locks native `<details>` — zero JS, accessible by default |
| Inline SVG paths | `@heroicons/react` or similar package | D-04 locks no package dependency — hand-pick paths only |

**Installation:** No new packages required. [VERIFIED: CONTEXT.md D-04]

---

## Architecture Patterns

### Recommended Project Structure

```
frontend/src/
├── bee-header.ts       ← NEW: <bee-header> custom element
├── bee-atlas.ts        ← modify: import bee-header, add to render(), wire events
├── index.html          ← simplify: <header> now empty or removed (bee-header owns it)
├── index.css           ← minimal change: existing `header` styles remain (bee-header :host inherits)
└── tests/
    └── bee-header.test.ts   ← NEW: property interface + event emission tests
```

### Pattern 1: Lit Custom Element with @property + CustomEvent

The established pattern in this codebase — identical to `bee-sidebar.ts`:

```typescript
// Source: verified from bee-sidebar.ts lines 80-293 in this codebase
@customElement('bee-header')
export class BeeHeader extends LitElement {
  @property({ attribute: false })
  layerMode: 'specimens' | 'samples' = 'specimens';

  @property({ attribute: false })
  viewMode: 'map' | 'table' = 'map';

  @state()
  private _hamburgerOpen = false;

  static styles = css`
    /* all styles here — shadow DOM isolated */
  `;

  private _onLayerClick(mode: 'specimens' | 'samples') {
    if (mode === this.layerMode) return;
    this.dispatchEvent(new CustomEvent('layer-changed', {
      bubbles: true,
      composed: true,
      detail: mode,
    }));
  }

  private _onViewClick(mode: 'map' | 'table') {
    if (mode === this.viewMode) return;
    this.dispatchEvent(new CustomEvent('view-changed', {
      bubbles: true,
      composed: true,
      detail: mode,
    }));
  }
}
```

### Pattern 2: Shadow DOM CSS Custom Property Inheritance

CSS custom properties pierce shadow DOM boundaries. `--accent`, `--header-bg`, `--text-hint` defined in `:root` of `index.css` are available inside `bee-header`'s shadow DOM without any additional setup. [VERIFIED: MDN — Inherited CSS custom properties cross shadow boundaries]

```css
/* Inside bee-header static styles — these resolve against index.css :root values */
:host {
  background-color: var(--header-bg);  /* rgb(8, 13, 38) */
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.tab-btn.active {
  color: var(--accent);
  border-bottom: 2px solid var(--accent);
}
```

### Pattern 3: Native `<details>/<summary>` Hamburger

```typescript
// Source: CONTEXT.md D-06; HTML spec — no external reference needed
render() {
  return html`
    <!-- desktop tabs, hidden at ≤640px -->
    <nav class="inline-tabs">
      ${this._renderTabs()}
    </nav>

    <!-- hamburger, hidden at >640px -->
    <details class="hamburger-menu">
      <summary aria-label="Navigation menu">☰</summary>
      <div class="hamburger-items">
        ${this._renderTabs()}
      </div>
    </details>
  `;
}
```

The `<details>` `open` attribute is managed natively by the browser — no JS needed. If `_hamburgerOpen` @state is also maintained (for conditional rendering or aria), sync it via a `toggle` event listener on the `<details>` element in `connectedCallback`.

### Pattern 4: Breakpoint via CSS @media in Shadow Styles

```css
/* >640px: show inline tabs, hide hamburger */
.hamburger-menu { display: none; }
.inline-tabs { display: flex; }

@media (max-width: 640px) {
  .inline-tabs { display: none; }
  .hamburger-menu { display: block; }
}
```

This is independent of the `@media (max-aspect-ratio: 1)` in `bee-atlas.ts` — they coexist without conflict. [VERIFIED: CONTEXT.md D-07]

### Pattern 5: Integration in bee-atlas render()

```typescript
// Source: verified from bee-atlas.ts render() structure
// Add ABOVE bee-map / bee-table / bee-sidebar:
import './bee-header.ts';

// In render():
html`
  <bee-header
    .layerMode=${this._layerMode}
    .viewMode=${this._viewMode}
    @layer-changed=${this._onLayerChanged}
    @view-changed=${this._onViewChanged}
  ></bee-header>
  ${this._viewMode === 'map' ? html`<bee-map ...>` : html`<bee-table ...>`}
  <bee-sidebar ...></bee-sidebar>
`
```

Note: `_onLayerChanged` and `_onViewChanged` already exist in `bee-atlas.ts` (lines 647–676) and handle the correct business logic. No changes needed to those handlers.

### Anti-Patterns to Avoid

- **Reading URL params inside bee-header:** D-08 locks out direct URL access. `bee-header` only reads props; `bee-atlas` owns all URL parsing.
- **Copying bee-sidebar CSS classes directly:** Shadow DOM isolation means `.toggle-btn` in `bee-sidebar`'s shadow does not apply inside `bee-header`'s shadow. Reimplement the same visual style in `bee-header`'s own `static styles`.
- **Using `attribute: true` on layerMode/viewMode:** The existing pattern throughout the codebase uses `{ attribute: false }` for complex or union-typed properties. Follow the same convention.
- **Removing the bee-sidebar layer/view toggles before Phase 53:** The sidebar toggles are removed in Phase 53 (sidebar cleanup), not this phase. Leave them in place.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hamburger accessibility | Custom ARIA role management | Native `<details>/<summary>` | Built-in keyboard support, open/close semantics, no ARIA boilerplate needed |
| Icon SVG | Custom icon drawings | Heroicons outline paths (hand-pasted) | Professionally designed, MIT license, pixel-aligned at 24×24 |
| CSS variable theming | Hardcoded colors in component | `var(--accent)`, `var(--header-bg)`, `var(--text-hint)` | Inherits through shadow DOM; consistent with rest of codebase |

---

## Common Pitfalls

### Pitfall 1: `<header>` in `index.html` Conflicts with bee-header

**What goes wrong:** If `<bee-header>` is rendered inside `<bee-atlas>` (a flex column), the `<header>` element in `index.html` (which has `display: flex; background: var(--header-bg)`) remains visible above it, creating a double header.

**Why it happens:** `<bee-atlas>` currently lives inside `<body>` as a sibling to `<header>`. If `bee-header` is placed inside `bee-atlas`'s shadow DOM, the static `<header>` in `index.html` is still rendered.

**How to avoid:** Two clean options — (a) replace the static `<header>` contents in `index.html` with `<bee-header>` as a top-level element (outside `<bee-atlas>`), keeping `index.html`'s `header` CSS styling the outer shell; or (b) move the h1 and GitHub icon entirely into `<bee-header>`'s template, remove the `<header>` from `index.html`, and have `<bee-header>` also handle the background/layout. Option (b) is cleaner (CONTEXT.md D-01 says the GitHub icon and h1 can move into bee-header). The planner should choose and document this.

**Warning signs:** Two dark navy bars at the top of the page in dev server preview.

### Pitfall 2: Shadow DOM `<details>` open State vs. Lit @state

**What goes wrong:** If `_hamburgerOpen` is toggled in a Lit `@state` but the native `<details>` `open` attribute is not kept in sync, Lit may re-render the template with a closed `<details>` unexpectedly.

**Why it happens:** Lit's render is declarative — it re-renders based on reactive state. If `_hamburgerOpen` doesn't reflect actual native `open` state, they diverge after the first toggle.

**How to avoid:** Either (a) bind `?open=${this._hamburgerOpen}` on the `<details>` element and handle the `toggle` event to update `_hamburgerOpen`, or (b) skip `_hamburgerOpen` entirely and let the native browser manage `<details>` open/closed — only use `@state` if you need the value for other rendering logic. D-03 says open/closed is internal state; if it's not used in any conditional rendering, option (b) is simpler.

**Warning signs:** Hamburger menu snapping shut immediately after clicking, or not opening at all.

### Pitfall 3: 44px Touch Target for Icon Buttons

**What goes wrong:** Icon buttons rendered at `width: 24px; height: 24px` (the SVG size) fail WCAG 2.5.5 minimum 44×44px touch target.

**Why it happens:** Default `<button>` sizing matches content unless explicitly padded.

**How to avoid:** Apply `min-width: 44px; min-height: 44px` (or `padding: 10px`) to the `<button>` wrapper around each SVG icon. This is specified in the UI-SPEC.

**Warning signs:** Users on mobile report difficulty tapping Map/Table icons.

### Pitfall 4: `composed: true` Missing on CustomEvents

**What goes wrong:** `layer-changed` and `view-changed` events emitted inside shadow DOM do not bubble out to `bee-atlas` in `index.html` unless `composed: true` is set.

**Why it happens:** Shadow DOM creates an event boundary. `bubbles: true` alone only bubbles within the shadow root.

**How to avoid:** Always use `{ bubbles: true, composed: true }` — as already done in `bee-sidebar.ts` (lines 288, 315). [VERIFIED: existing bee-sidebar.ts source]

---

## Code Examples

### Inline SVG Button Pattern (from existing index.html)

```html
<!-- Source: verified from frontend/index.html lines 15-19 -->
<a href="..." aria-label="GitHub repository" class="github-link">
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
       fill="currentColor" aria-hidden="true">
    <path d="..."/>
  </svg>
</a>
```

For Map and Table icon buttons, use `<button>` instead of `<a>`, add `aria-label`, and use `fill="currentColor"` so the CSS `color` property controls icon color.

### Active Tab CSS Pattern (adapted from bee-sidebar.ts)

```css
/* Source: verified from bee-sidebar.ts lines 149-169 — adapted for dark header context */
.tab-btn {
  padding: 0.6rem 1rem;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);   /* inactive: white at 0.7 opacity per UI-SPEC */
}
.tab-btn:hover {
  color: white;
  background: rgba(255, 255, 255, 0.08);
}
.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.tab-btn[disabled] {
  opacity: 0.4;
  pointer-events: none;
  cursor: default;
}
```

Note: sidebar uses light-mode colors (`color: var(--text-hint)`). Header tabs are on dark background — use white-based opacity instead.

### Heroicons SVG Paths (outline, 24×24) — for reference

Planners/implementers should copy paths from [https://heroicons.com](https://heroicons.com). Recommended candidates per D-04:
- **Map view:** `map` icon or `globe-alt` icon (24px outline)
- **Table view:** `table-cells` icon (24px outline)

These are MIT licensed. No attribution required in source. [VERIFIED: npm view @heroicons/react — version 2.2.0, MIT]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Layer/view toggle in sidebar | Header-level tabs + icon buttons | Phase 52 | Sidebar controls remain during this phase; removed in Phase 53 |
| Hamburger via JS libraries | Native `<details>/<summary>` | HTML5.1+ (now standard) | Zero JS, browser-managed open/close, keyboard accessible |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | CSS custom properties (`--accent` etc.) inherit through shadow DOM in all project-targeted browsers | Architecture Patterns | Active tab color/border won't render; fix: use `::part` or CSS vars directly — low risk, this is well-established behavior |
| A2 | Heroicons v2 paths are compatible with `fill="currentColor"` on 24×24 viewBox outline icons | Code Examples | Icon may not render correctly; fix: verify path on heroicons.com before implementation |

---

## Open Questions

1. **Where does `<bee-header>` live in the DOM tree?**
   - What we know: CONTEXT.md D-01 says it "replaces/extends" the `<header>` in `index.html`; the GitHub icon and h1 can move into the component or stay in `index.html`.
   - What's unclear: Whether `<bee-header>` is a child of `<bee-atlas>` (inside shadow DOM) or a sibling at `<body>` level (in `index.html` alongside `<bee-atlas>`).
   - Recommendation: Place `<bee-header>` inside `bee-atlas`'s render — consistent with D-02 which requires `bee-atlas` to pass props. Move h1 and GitHub icon into `<bee-header>`'s template and remove the bare `<header>` from `index.html`. The existing `header { ... }` CSS in `index.css` can be removed or left (it will no longer match anything meaningful). This eliminates the double-header pitfall entirely.

2. **Should `_hamburgerOpen` @state be used at all?**
   - What we know: D-03 says it's internal state. Native `<details>` manages open/closed without JS.
   - What's unclear: Whether any conditional rendering (e.g., switching hamburger icon between ☰ and ✕) requires Lit to know the state.
   - Recommendation: If the hamburger icon does not change on open, skip `_hamburgerOpen` entirely and let native `<details>` manage it. This simplifies implementation. If ✕/☰ swap is desired, add the `toggle` event listener.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely code/config changes with no external CLI tools, databases, or services. The Vite dev server and Vitest test runner are already confirmed available from the existing project setup.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (via vite.config.ts `test` block) |
| Config file | `frontend/vite.config.ts` (test.environment: 'happy-dom') |
| Quick run command | `cd frontend && npm test -- --run` |
| Full suite command | `cd frontend && npm test -- --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HDR-01 | `bee-header` has `layerMode` and `viewMode` @property declarations; emits `layer-changed` and `view-changed` events | unit | `cd frontend && npm test -- --run tests/bee-header.test.ts` | ❌ Wave 0 |
| HDR-02 | Hamburger menu present in DOM (as `<details>`) | unit | `cd frontend && npm test -- --run tests/bee-header.test.ts` | ❌ Wave 0 |
| HDR-03 | Species and Plants elements have `pointer-events: none` / disabled attribute | unit | `cd frontend && npm test -- --run tests/bee-header.test.ts` | ❌ Wave 0 |
| HDR-04 | View icon buttons emit `view-changed` event with correct detail | unit | `cd frontend && npm test -- --run tests/bee-header.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd frontend && npm test -- --run tests/bee-header.test.ts`
- **Per wave merge:** `cd frontend && npm test -- --run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `frontend/src/tests/bee-header.test.ts` — covers HDR-01 through HDR-04 (property interface + event emission)

*(Note: Existing test pattern in `bee-sidebar.test.ts` uses `elementProperties` map inspection to verify `@property` declarations — use the same approach for `bee-header`.)*

---

## Security Domain

This phase adds no authentication, session management, access control, cryptography, or external data input. The component emits only typed CustomEvents with string literals (`'specimens' | 'samples'`, `'map' | 'table'`) — no user-supplied string data enters the component's output. No ASVS categories apply.

---

## Project Constraints (from CLAUDE.md)

| Directive | Applies to This Phase |
|-----------|----------------------|
| Static hosting only — no server runtime | Not directly relevant (client-side component only) |
| Python 3.14+ for data pipeline | Not applicable |
| `speicmenLayer` typo in bee-map.ts is deferred — do not fix incidentally | Do not touch bee-map.ts |
| State ownership: `<bee-atlas>` owns all reactive state; presenters are pure | `<bee-header>` is a pure presenter — layerMode/viewMode as @property inputs, events upward only |
| Style cache: bypass when filterState active or selectedOccIds non-empty | Not applicable (header has no OL layer styles) |
| Filter race guard: discard stale async results | Not applicable (header has no async operations) |

---

## Sources

### Primary (HIGH confidence)
- `frontend/src/bee-sidebar.ts` — CustomEvent dispatch pattern, `.toggle-btn.active` CSS, `@property` declarations — verified by direct read
- `frontend/src/bee-atlas.ts` — `_onLayerChanged`, `_onViewChanged` event handlers, existing prop-passing render pattern — verified by direct read
- `frontend/src/index.css` — CSS custom property names and values (`--accent`, `--header-bg`, `--text-hint`) — verified by direct read
- `frontend/index.html` — existing `<header>` structure, inline SVG GitHub icon pattern — verified by direct read
- `frontend/package.json` — Lit 3.2.1, Vitest, TypeScript 5.8.2, happy-dom — verified by direct read
- `frontend/vite.config.ts` — Vitest config (happy-dom environment) — verified by direct read
- `.planning/phases/52-header-component/52-CONTEXT.md` — all locked decisions — verified by direct read
- `.planning/phases/52-header-component/52-UI-SPEC.md` — color, spacing, interaction contract — verified by direct read

### Secondary (MEDIUM confidence)
- MDN Web Docs — CSS custom property inheritance through shadow DOM — [ASSUMED based on training knowledge; well-established behavior]
- Heroicons MIT license, v2.2.0 — [VERIFIED: npm view @heroicons/react]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified from package.json
- Architecture: HIGH — patterns directly extracted from existing codebase source files
- Pitfalls: HIGH — derived from actual code structure and shadow DOM mechanics

**Research date:** 2026-04-13
**Valid until:** 2026-05-13 (stable stack — Lit 3, CSS, HTML5 — no fast-moving dependencies)
