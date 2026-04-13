# Phase 52: Header Component - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Create a `<bee-header>` Lit component that renders inside the existing `<header>` in `index.html`. The header contains: nav tabs for Specimens/Samples layer switching (left side), greyed-out placeholder tabs for Species and Plants (future roadmap), and a Map/Table view icon toggle (right side). On viewports ≤640px, nav tabs collapse to a hamburger menu. This phase does NOT move filter controls or touch the sidebar — that is Phase 53.

</domain>

<decisions>
## Implementation Decisions

### Header Architecture
- **D-01:** Create a new `<bee-header>` Lit custom element (tag: `bee-header`). It replaces/extends the plain `<header>` content in `index.html`. The BeeAtlas title and GitHub icon link become part of the `<bee-header>` template, or remain alongside it in `index.html` — planner's choice based on what's cleaner.
- **D-02:** `<bee-atlas>` passes `layerMode` (`'specimens' | 'samples'`) and `viewMode` (`'map' | 'table'`) as `@property` inputs. `<bee-header>` emits `layer-changed` (detail: `'specimens' | 'samples'`) and `view-changed` (detail: `'map' | 'table'`) CustomEvents — identical contract to the existing bee-sidebar events so bee-atlas event handlers can be reused.
- **D-03:** Hamburger open/closed state is internal `@state()` within `<bee-header>`. `bee-atlas` does not manage it.

### View Toggle Icons
- **D-04:** Two inline SVG icons from Heroicons (or equivalent free set), hand-picked — no icon library added as a dependency. Good candidates: `map-pin` or `globe-alt` for Map; `table-cells` for Table. Exact paths chosen by planner/implementer.
- **D-05:** Two side-by-side icon buttons on the right side of the header. Active button gets accent color treatment (e.g., white fill with opacity 1 against the dark header); inactive is muted (lower opacity or greyed). Similar visual weight to the existing GitHub icon.

### Hamburger Menu
- **D-06:** Use native `<details>/<summary>` for the hamburger. The `<summary>` is the hamburger button (☰ or similar); the `<details>` body renders nav items vertically when open. Zero JS required, accessible by default.
- **D-07:** Breakpoint at 640px (40rem). Below 640px: hamburger shown, inline tabs hidden. Above 640px: inline tabs shown, hamburger hidden. This is a new breakpoint independent of the existing `max-aspect-ratio: 1` media query in bee-atlas.

### Placeholder Tabs
- **Claude's Discretion:** Species and Plants placeholder tabs are greyed-out text (e.g., `opacity: 0.4`, `pointer-events: none`, `cursor: default`), no tooltip. They appear in both the desktop inline tabs and the hamburger dropdown so the roadmap is always visible.

### URL State
- **D-08:** `lm=` (layer mode) and `view=` (view mode) URL params must continue to round-trip correctly through the new header controls. `<bee-header>` reads these via its props (already computed by bee-atlas from URL on startup) — no direct URL reading inside bee-header.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above.

### Existing files to read before planning
- `frontend/index.html` — existing `<header>` structure to understand what moves where
- `frontend/src/index.css` — CSS custom properties including `--header-bg`, `--accent`, `--text-hint`; existing `header` and `h1` styles
- `frontend/src/bee-sidebar.ts` — `_renderToggle()` and `_renderViewToggle()` show the existing toggle pattern; `.layer-toggle`/`.toggle-btn` CSS to inform the new tab style
- `frontend/src/bee-atlas.ts` — existing `@layer-changed` and `@view-changed` event handlers; `_layerMode`/`_viewMode` state that will be passed as props to `<bee-header>`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.toggle-btn`/`.layer-toggle` CSS pattern in bee-sidebar: active tab uses `border-bottom: 2px solid var(--accent)` and `color: var(--accent)`. Adapt (don't copy directly — shadow DOM isolation) for nav tabs.
- GitHub SVG inline icon in `index.html`: establishes the pattern of pasting raw SVG paths. Same approach for Map/Table icons.
- `layer-changed` / `view-changed` CustomEvent shape from bee-sidebar: bee-atlas already has `@layer-changed=${this._onLayerChanged}` and `@view-changed=${this._onViewChanged}` handlers — they can be wired to bee-header with zero changes to bee-atlas's event handling logic.

### Established Patterns
- All interactive components are Lit custom elements with `@property` inputs and CustomEvent outputs — bee-header must follow this pattern.
- Responsive layout in bee-atlas uses `@media (max-aspect-ratio: 1)` — this phase adds a separate `@media (max-width: 640px)` breakpoint for the header specifically.
- `--header-bg: rgb(8, 13, 38)` is the dark navy header color. Nav tab text and icons should be white/light (with muted/dimmed treatment for inactive tabs).

### Integration Points
- `index.html` `<header>`: introduce `<bee-header>` element here
- `bee-atlas.ts` `render()`: add `<bee-header>` above bee-map/bee-sidebar, pass `layerMode` and `viewMode` props, wire `layer-changed` and `view-changed` events (same handlers as currently on bee-sidebar)

</code_context>

<specifics>
## Specific Ideas

No specific visual references provided — standard Heroicons-style inline SVG icons are fine.

</specifics>

<deferred>
## Deferred Ideas

- Placeholder tab "coming soon" tooltip — not needed for this phase; greyed text suffices
- Animated hamburger menu transition — deferred to polish phase
- Placeholder tabs hidden from hamburger on mobile — user did not select this; both placeholders appear in hamburger too

</deferred>

---

*Phase: 52-header-component*
*Context gathered: 2026-04-13*
