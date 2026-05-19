# Stack Research

**Domain:** Three-state sidebar pane in existing Lit + Mapbox SPA
**Researched:** 2026-05-19
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

No new core technologies needed. v3.9 is a UI restructuring milestone, not a technology addition. All required capabilities are already present.

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Lit | 3.3.2 (installed) | Component authoring | `classMap` directive + CSS custom properties handle all three-state layout needs without additions |
| CSS custom properties + `transition` | Platform | Pane width animation | `transition: width 220ms ease` between three explicit rem values gives compositor-adjacent performance at zero bundle cost |
| `classMap` directive | included in `lit` | Drive state classes on pane host | `class=${classMap({ collapsed, list, table })}` is idiomatic Lit; no new import beyond `lit/directives/class-map.js` |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lit/directives/class-map.js` | included in lit 3.3.2 | Apply `.collapsed`/`.list`/`.table` state classes to unified pane host | Use in `render()` of the new `bee-unified-pane` component |
| `lit/directives/style-map.js` | included in lit 3.3.2 | Inline style overrides | Only if dynamic pixel values from ResizeObserver are needed — prefer static CSS classes |

### Development Tools

No changes needed to Vite, TypeScript, or Vitest configuration.

## Installation

```bash
# No new packages required — all needed APIs are in lit@3.3.2 already installed
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| CSS `transition: width` on three explicit rem values | `@lit-labs/motion` FLIP directive | If the pane needed to animate arbitrary layout changes (e.g. element reordering); overkill for a deterministic slide between three known widths |
| CSS class-driven state with `classMap` | `styleMap` with inline `width` values | Only if widths must be computed dynamically (e.g. via ResizeObserver); the three target widths are static constants |
| `width` transition on in-flow pane | `transform: translateX` overlay | Use `translateX` only if the pane should float over the map; the spec calls for the map to shrink when the pane expands, so in-flow `width` is correct |
| Lazy-import `bee-table.ts` on first table-state entry | Eagerly import at startup | The table component is already lazy-loaded (`import('./bee-table.ts')` in `bee-atlas.ts:247`); keep this pattern |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@lit-labs/motion` | Explicitly experimental (Lit Labs); may receive breaking changes or be abandoned; FLIP animation is designed for DOM element reordering, not a simple width slide | CSS `transition: width` on explicit values |
| Third-party animation libraries (GSAP, Framer Motion, Popmotion, Motion One) | Not web-component aware; add bundle weight; the project has a validated bundle-size check (`validate-bundle-size.mjs`); all are overkill for a single-axis width transition | CSS transitions |
| `interpolate-size: allow-keywords` for `width: auto` transitions | Chromium-only as of 2026; Firefox and Safari do not support it; target widths are known constants, not content-driven | Explicit `rem` or `px` values for collapsed / list / table states |
| DuckDB WASM | Already rejected (project memory); unrelated to this milestone | wa-sqlite (already in use) |
| A third-party drawer / panel component library | Shadow DOM encapsulation makes third-party drawer components fragile in Lit apps (slot composition, event retargeting, focus management). The sidebar is ~120 lines; keep it in-house | Custom `bee-unified-pane` LitElement |
| React-style `viewMode` toggle replacing `paneState` | Current `_viewMode: 'map' | 'table'` toggle in `bee-atlas.ts` should be replaced by `_paneState: 'collapsed' | 'list' | 'table'`; the old table full-screen mode goes away | Three-state pane property on `bee-atlas` |

## Stack Patterns by Variant

**Desktop three-state pane (collapsed / list / table):**
- Single `bee-unified-pane` LitElement with `paneState: 'collapsed' | 'list' | 'table'` `@property`
- `classMap` applies the state class on `:host`
- CSS defines three explicit widths: `0rem` (collapsed), `22rem` (list), `44rem`+ (table) — widths are tunable, but must be explicit values for transitions to work
- `transition: width 220ms ease` on `:host`; `overflow: hidden` prevents content spillover during animation
- Toggle button (`bee-atlas` renders it as absolutely positioned sibling) stays visible when pane is `collapsed`

**Mobile (existing open/close, no three-state treatment):**
- `@media (max-aspect-ratio: 1)` gate already exists in `bee-atlas.ts` static styles
- Coordinator maps mobile gestures to `collapsed` / `list` only; `table` state is a desktop-only concept
- No changes needed to mobile layout

**Table state vs. current `_viewMode='table'`:**
- `_viewMode: 'map' | 'table'` in `bee-atlas` is replaced by `_paneState: 'collapsed' | 'list' | 'table'`
- `bee-table` renders inside the pane in `table` state instead of as a full-screen sibling; `bee-map` shrinks but stays visible
- Lazy-import pattern (`import('./bee-table.ts')`) preserved on first transition to `table` state
- `bee-filter-panel` merges into the unified pane; `bee-sidebar` merges into the unified pane

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `lit@3.3.2` | TypeScript 5.8, Vite 6, Vitest 4 | All directives in `lit/directives/*` are part of the `lit` package; no separate install needed |

## Sources

- Lit official docs (lit.dev) — `classMap` and `styleMap` directive docs verified — HIGH confidence
- `@lit-labs/motion` README, github.com/lit/lit — explicit experimental/Labs status confirmed; FLIP is not the right tool for deterministic width slides — HIGH confidence
- MDN CSS Transitions — `transform: translateX` vs `width` performance trade-off; `interpolate-size` browser support gap — HIGH confidence
- Direct codebase inspection — `bee-filter-panel.ts`, `bee-sidebar.ts`, `bee-atlas.ts`, `bee-table.ts` layout and animation patterns; confirmed no animation library in use — HIGH confidence

---
*Stack research for: v3.9 Sidebar & Table Unification*
*Researched: 2026-05-19*
