# Phase 81: Filter UX & Nav — Research

**Researched:** 2026-05-04
**Domain:** Lit 3 light-DOM presenters + URL-state round-trip + inline-SVG charting + `<details>`-popover progressive enhancement, layered atop the Phase 80 SSR scaffold
**Confidence:** HIGH for repo-local mechanics (every load-bearing claim verified against source); MEDIUM for the BeeSearch design conventions (no upstream design source located in-tree — see Open Question 2).

## Summary

Phase 81 is composition over already-installed primitives. Every architectural piece — Lit 3 light-DOM components, `@property`-driven downward state flow, `CustomEvent` upward, `_data/*.js` build-time feeds, ARCH-04 source-analysis tests, the `?taxon=&taxonRank=` SPA contract, the `replaceState`-then-debounced-`pushState` URL pattern — already exists in the repo. Phase 81 introduces no new dependencies; `lit ^3.2.1`, `vitest ^4.1.2` (happy-dom), `@iarna/toml ^2.2.5`, and Eleventy 3.1.5 + plugin-vite 7.1.1 cover everything.

The riskiest non-trivial work is (a) keeping the Phase 80 light-DOM contract intact while now needing to *add* per-card behavior and slotted children (filteredCount badge, "View N occurrences" button) and (b) the D-02 month×geo combine math (the seasonality.json shape is keyed but does not carry crossed slices, so `max(county_vec[m], ecoregion_vec[m])` is an approximation locked by CONTEXT). Everything else is well-trodden ground in this codebase.

**Primary recommendation:** Build five plans in dependency order — (1) `src/lib/spa-link.ts` + `src/species/url-state.ts` + ARCH-04 test extension as the foundational, dependency-free layer; (2) `<bee-taxon-nav>` consuming the existing `_data/species.js` `tree`; (3) `<bee-species-filter>` using `<details>`-popover checkbox lists; (4) `<seasonality-viz>` rendering inline SVG via lit-html templates; (5) `<bee-species-page>` coordinator wiring (URL parse, seasonality.json fetch singleton, filteredCount Map compute, `<bee-species-card>` `filteredCount` `@property` + badge/button additions, breadcrumb pill row, empty state). Phase 80's `render() → noChange` invariant must be preserved on `<bee-species-page>` and `<bee-species-card>`; new presenters MAY define `render()` because their server-rendered DOM (taxon-nav `<details>` tree, filter widgets, viz host) is either pre-populated by Eleventy and queried/decorated rather than re-rendered, or rendered fresh by Lit on upgrade for elements the server emits empty. See Open Question 1 below for the specific recommendation per component.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Coordinator (`<bee-species-page>`) computes `Map<scientificName, number>` filteredCount; cards are dumb. Cards apply `opacity: 0.35` mute styling locally based on `filteredCount === 0`. ARCH-03 state-ownership invariant carried forward from `<bee-atlas>`. Researcher confirms Lit `@property` diffing across 735 cards is fine — see Open Question 1.
- **D-02:** Filter combine semantics: per-card formula
  - `county_vec[m]    = Σ over selected counties C of seasonality[name]["county:" + C][m]`
  - `ecoregion_vec[m] = Σ over selected ecoregions E of seasonality[name]["ecoregion_l3:" + E][m]`
  - `combined_vec[m]  = max(county_vec[m], ecoregion_vec[m])` (deduplicating proxy for OR — known approximation)
  - `filtered_count = Σ m∈[m0,m1] combined_vec[m]`
  - When no geo selected, `combined_vec = seasonality[name]["_total"]`. When no month range, `[m0,m1] = [0,11]`.
- **D-03:** `<details><summary>` popover wrapping `<ul>` of `<input type="checkbox">` for both county and ecoregion-l3. Native `<details>` keyboard/screen-reader story by default.
- **D-04:** `<seasonality-viz>` consumes the same `combined_vec` from D-02. Per-card; one SVG per card. Out-of-month-range bars NOT dimmed in v1.
- **D-05:** New file `src/lib/spa-link.ts` exporting `buildSpaTaxonLink(name, rank='species')`. Imports nothing from `src/filter.ts` or any other forbidden ARCH-04 path. Both `src/url-state.ts` and `src/species/**.ts` import from it.
- **D-06:** New `src/species/url-state.ts` parses `?fam=&subf=&tribe=&gen=&subg=&county=&ecor=&m0=&m1=` — disjoint from SPA's `src/url-state.ts`. No shared code between the two URL contracts. Round-trip Vitest test required.
- **D-07:** Breadcrumb pill row above cards renders dismissable pills for each active filter; "Clear filters" resets every URL param. Empty state ("No species match these filters. [Clear filters]") renders when `Math.max(...filteredCount values) === 0`.

### Claude's Discretion

- Exact Lit template structure for each new component (closest analogs: `src/bee-sidebar.ts` for chip/pill UI; `src/bee-filter-controls.ts` for token-driven filter UI).
- Month-range UI: two `<input type="number" min="1" max="12">` boxes is the baseline; dual-handle slider or 12-checkbox grid acceptable.
- Whether `_data/species.js` exposes county and ecoregion-l3 option lists (extend existing module to compute `Set<county>` / `Set<ecoregion_l3>` from `seasonality.json` keys) or hard-codes from `counties.geojson` / `ecoregions.geojson`.
- Push vs. replace state policy on filter changes — `replaceState` for typing-flow inputs (slider drag, number-input typing), `pushState` for discrete actions (checkbox toggle, breadcrumb dismiss, "Clear filters"). See Open Question 4.
- Mute-styling implementation: inline `style="opacity:0.35"` vs. `[data-muted]` attribute selector vs. CSS variable. Inline simplest.
- How `<bee-taxon-nav>` is server-rendered (Nunjucks recursive macro emitting nested `<details>`/`<ul>` from `species.tree`).
- Whether `_data/photos.js` needs changes — researcher confirms: NO. Photo data is per-species and orthogonal to filter state.

### Deferred Ideas (OUT OF SCOPE)

- Crossed county×ecoregion seasonality slices (would require Phase 78 pipeline change to emit `county:X|ecoregion_l3:Y` keys).
- Visual design pass for cards (responsive grid, photo carousel, designed typography).
- Mobile/responsive nav rail (drawer, collapsible rail with toggle) — Phase 82.
- Dimming out-of-month-range bars in `<seasonality-viz>`.
- Push-vs-replace nuance beyond the planner's chosen baseline (history-state library).
- Broader `src/lib/spa-link.ts` utility (additional cross-route helpers).
- Native `<form>` no-JS submission of filter state.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NAV-01 | `<bee-taxon-nav>` vertical left-rail tree, expand-on-click, root=families | Existing `_data/species.js` `tree` (`{ rows, children }` recursive shape, _data/species.js:33-58) provides traversal. Light-DOM Lit + Nunjucks macro for SSR (Phase 80 D-05). |
| NAV-02 | Subgenus level renders only when `species.some(s => s.subgenus !== null)` | `_data/species.js` already separates `subgenus: null` vs. populated as a tree key (`'null'` vs. actual name); Nunjucks macro can skip the `'null'` subgenus level inline. |
| NAV-03 | Selecting a node updates `_activeTaxonPath` + URL | Coordinator pattern from bee-atlas.ts:475-491 (`_pushUrlState` with `replaceState` + debounced `pushState`). |
| NAV-04 | Mute-not-hide (opacity 0.35) for filtered-out branches | Pure CSS attribute selector or inline style on tree `<li>` elements based on coordinator-computed branch active set. |
| NAV-05 | No-JS fallback: nested `<details>`/`<ul>` SSR | Native `<details>` works without JS; Phase 80 light-DOM pattern (createRenderRoot returns this) preserves SSR markup. |
| FILT-01 | County + ecoregion-l3 multi-selects + month range, sourced from `_data/species.js` | Researcher recommends extending `_data/species.js` to also export `counties: string[]` and `ecoregionL3: string[]`, computed from `seasonality.json` keys at build time (deduped, sorted). Avoids duplicate truth source. |
| FILT-02 | URL params `?fam=&subf=&tribe=&gen=&subg=&county=&ecor=&m0=&m1=` | New `src/species/url-state.ts` per D-06. Mirror existing CSV encoding from `src/url-state.ts:52-57`. |
| FILT-03 | Round-trip Vitest tests | Existing pattern: `src/tests/url-state.test.ts:25+`. |
| FILT-04 | Cards muted (not hidden) when filteredCount=0; per-card "N records" badge | `<bee-species-card>` gets `@property({ type: Number }) filteredCount`; coordinator sets via prop; card adds light-DOM `<span class="count-badge">` updated reactively. Card MUST stay light-DOM and MUST keep its `render() → noChange` invariant — the badge slot is server-rendered (empty) by `_pages/species.njk`, and Lit upgrade only updates the badge text via a `willUpdate` hook that pokes `this.querySelector(...)`. Alternative: convert the card to define `render()` and re-emit children — but this clobbers Phase 80's locked SSR-preservation invariant, so DO NOT. |
| FILT-05 | Empty state when `Math.max(...counts.values()) === 0` | Coordinator detects condition; renders `<div class="empty">` *additively* above the (now all-muted) card list. |
| FILT-06 | Breadcrumb pill row | Closest analog: `src/bee-sidebar.ts` (chip/pill chrome, `dispatchEvent(new CustomEvent('close', ...))` pattern). |
| FILT-07 | "Clear filters" resets all params | Coordinator method; sets all state to defaults; calls `_pushUrlState()` with empty filter. |
| VIZ-01 | Inline `<svg>` from 12-element histogram via lit-html, no chart-library | lit-html supports inline SVG (use `svg` template tag from `lit`). Path/rect data interpolated into the template. |
| VIZ-02 | Bars when `n ≥ 5`, text fallback when `n < 5` | Trivial conditional in `render()`. |
| VIZ-03 | J F M A M J J A S O N D x-axis labels; BeeSearch winter/spring/summer/fall season-band tints | Season bands: Winter=Dec/Jan/Feb, Spring=Mar/Apr/May, Summer=Jun/Jul/Aug, Fall=Sep/Oct/Nov (meteorological convention). Implementation: 4 background `<rect>`s. See Open Question 2 for design source. |
| VIZ-04 | Pre-binned slices from `seasonality.json` (no in-browser KDE) | Coordinator computes the slice (D-04); viz only renders. |
| VIZ-05 | Sample-size annotation `*` 20–49 / `**` 50–99 / `***` 100–999 / `****` ≥1000 | Render in viz; computed from `sum(combined_vec)`. |
| LINK-01 | "View N occurrences →" navigates to `/?taxon=<scientificName>&taxonRank=species` via `buildSpaTaxonLink()` | Verified at `src/url-state.ts:35-38, 83-89`: BOTH `taxon` AND `taxonRank` are required by `parseParams`. The seed example `/collection?taxon=...` (seeds/species-tab.md:31) is wrong; LINK-01 codifies the correction. |
| LINK-02 | Vitest round-trip: `buildSpaTaxonLink('Andrena anograe')` → SPA `parseParams` → `{ taxonName, taxonRank: 'species' }` | Round-trip can use the existing `parseParams` import directly (test lives in `src/tests/spa-link.test.ts` and crosses module boundaries — that's fine for a test). |
| LINK-03 | Genus/family-level deep-links use `taxonRank=genus`/`taxonRank=family` | `buildSpaTaxonLink(name, rank)` second arg covers all three valid ranks (`'family' \| 'genus' \| 'species'` per `src/url-state.ts:85-86`). |
| LINK-04 | SPA URL contract documented at top of `src/url-state.ts` | Add header comment to `src/url-state.ts` (Phase 81 may touch this file for the comment only — does NOT violate any boundary). |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Parse URL → coordinator state | Browser (Lit coordinator `connectedCallback`) | — | URL is a browser concern; coordinator owns state per ARCH-03. |
| Build URL from coordinator state | Browser (`_pushUrlState`) | — | Mirrors `bee-atlas.ts:477-492` pattern (`replaceState` immediate + debounced `pushState`). |
| Compute `filteredCount` Map | Browser (coordinator `willUpdate`) | — | D-01 LOCKED. |
| Read seasonality.json | Browser (one-shot `fetch`, module-level singleton) | — | 260 KB inlined into HTML would balloon SSR; lazy `fetch('/data/seasonality.json')` keeps the SSR payload clean. |
| Build option lists (counties, ecoregion-l3) | Build-time `_data/species.js` extension | — | Already reading `species.json`; cheap to also derive from `seasonality.json` keys at build. Avoids per-page-load cost. |
| Render taxon tree | Build-time Nunjucks macro (SSR) | Browser (`<bee-taxon-nav>` upgrade) | NAV-05 mandates no-JS-navigable; SSR is primary. Lit attaches click/expand state on upgrade. |
| Render filter widget | Build-time Nunjucks (`<details>` popovers, empty checkbox lists) | Browser (`<bee-species-filter>` upgrade) | `<details>` works without JS; Lit binds change handlers on upgrade. |
| Render seasonality SVG | Browser (`<seasonality-viz>` `render()`) | — | Per-card data is filter-dependent (D-04); cannot SSR. Server emits empty `<seasonality-viz>` host; Lit fills on upgrade. |
| Card mute styling | Browser CSS, driven by `filteredCount=0` attribute or inline style | — | Pure presentation; coordinator just sets the `@property`. |
| SPA deep-link href | Build-time Nunjucks (initial href) + browser (live update of "N occurrences") | — | Static href is correct without JS (LINK-01); browser updates the count text on filter change. |
| Architectural boundary enforcement | Build-time Vitest source-analysis | — | Existing `src/tests/arch.test.ts` extends to cover `src/lib/spa-link.ts`. |

## Existing Patterns (file:line refs)

### Pattern 1: Light-DOM Lit element preserving SSR children (Phase 80 D-05 invariant)
`src/species/bee-species-page.ts:32-50` and `src/species/bee-species-card.ts:24-53` — `createRenderRoot() { return this }` + NO `render()` method. Default `render() → noChange` is a no-op.

**Phase 81 implication:** `<bee-species-page>` and `<bee-species-card>` MUST keep this invariant. The card test at `src/tests/bee-species-card.test.ts:11-13` *prototype-identity-asserts* `BeeSpeciesCard.prototype.render === LitElement.prototype.render` — adding a `render()` method to either class fails this test. Phase 81 must achieve "filteredCount badge" and "View N occurrences" by mutating server-rendered child nodes via `willUpdate(changedProps)` + `this.querySelector(...)`, NOT by re-rendering.

For NEW Phase 81 components (`<bee-taxon-nav>`, `<bee-species-filter>`, `<seasonality-viz>`):
- `<bee-taxon-nav>`: SSR'd nested `<details>`/`<ul>` (NAV-05). Use the same light-DOM + no-render pattern; on upgrade, walk the existing tree and attach click handlers / mute classes. (Don't re-emit the tree from Lit — the tree is server-rendered for no-JS.)
- `<bee-species-filter>`: SSR'd `<details><summary>` + empty `<ul>`. Lit fills the `<ul>` on upgrade with checkbox rows from `_data/species.js`. EITHER pattern works: Lit-rendered `<ul>` children inside a server-rendered host (light-DOM, define `render()` returning the `<ul>` content; the `<details>`/`<summary>` is server-rendered around the host element, NOT inside it). Researcher recommends: emit `<bee-species-filter>` host with NO children server-side, and let `render()` emit the entire `<details>` tree on upgrade. This is acceptable because no-JS users get... nothing for the filter widget, which CONTEXT.md D-03 explicitly accepts ("the filter does nothing without JS, which is acceptable").
- `<seasonality-viz>`: same as filter — SSR empty host; `render()` emits inline SVG. Per-card; data flows in via `@property data: number[]` and `@property sampleSize: number`.

### Pattern 2: ARCH-04 forbidden-import test
`src/tests/arch.test.ts:26-34` — `FORBIDDEN` array of module specifiers; static + dynamic import regex; per-file describe block. Phase 81 extends this in two ways:
1. Add `src/lib/spa-link.ts` to a new check that asserts `src/lib/spa-link.ts` ITSELF imports nothing from `../filter.ts`, `../bee-map.ts`, `../bee-atlas.ts`, `../sqlite.ts`, `mapbox-gl`, `wa-sqlite` (D-05 prerequisite). Otherwise the file becomes a Trojan that lets `src/species/**` transitively pull `mapbox-gl` (Pitfall #7).
2. The `FORBIDDEN` list for `src/species/**` already covers `'../url-state.ts'` (`src/tests/arch.test.ts:33`) — confirming `src/species/url-state.ts` (relative path inside species/) is fine, and `src/url-state.ts` (one level up) stays forbidden. The two `url-state.ts` files coexist by directory, not by path-rewriting.

### Pattern 3: URL state push/replace (the canonical Phase 81 pattern)
`src/bee-atlas.ts:477-492` `_pushUrlState`:
```
window.history.replaceState({}, '', '?' + params.toString());     // immediate
clearTimeout(this._mapMoveDebounce);
this._mapMoveDebounce = setTimeout(() => {
  window.history.pushState({}, '', '?' + params.toString());      // debounced 500ms
  this._mapMoveDebounce = null;
}, 500);
```
Plus `connectedCallback` at `src/bee-atlas.ts:275, 294`: initial `replaceState` to canonicalize the URL on load, plus `popstate` listener for back/forward.

**Phase 81 recommendation:** copy this pattern verbatim into `<bee-species-page>`. Filter changes call `_pushUrlState()`, which immediately `replaceState`s and debounces a `pushState` (500ms idle) to coalesce slider drags / typing into a single history entry. Discrete actions (checkbox toggle, breadcrumb dismiss, "Clear filters") would still go through this same path; the debounce just means rapid sequential changes don't pollute history.

### Pattern 4: URL round-trip Vitest
`src/tests/url-state.test.ts:1-50` — `buildParams → parseParams` round-trip per filter dimension. `src/species/url-state.ts` test mirrors this exactly: `buildParams(state) → URLSearchParams → parseParams(string) → state`.

### Pattern 5: `_data/*.js` build-time data feed
`_data/species.js:1-60` — sync `readFileSync` of JSON, sync transform, default export. Eleventy 3.x caches per build. Phase 81 extension to derive `counties` / `ecoregionL3` reads `seasonality.json` once at build time and dedupes the `county:*` / `ecoregion_l3:*` key prefixes:
```
const counties = new Set<string>();
const ecoregionL3 = new Set<string>();
for (const speciesEntry of Object.values(seasonality)) {
  for (const key of Object.keys(speciesEntry)) {
    if (key.startsWith('county:')) counties.add(key.slice('county:'.length));
    else if (key.startsWith('ecoregion_l3:')) ecoregionL3.add(key.slice('ecoregion_l3:'.length));
  }
}
```
Sorted alphabetically into arrays for option-list rendering. Pitfall #8 mitigation (no parquet read) is preserved; pitfall #23 mitigation (no swallowed errors) is the existing pattern (let `JSON.parse` throw and Eleventy fail loudly).

### Pattern 6: Vitest light-DOM Lit component test
`src/tests/bee-sidebar.test.ts:1-22` shows `vi.mock` for heavy modules + `await import` of the component. `src/tests/bee-species-card.test.ts:11-18` shows prototype-identity assertions (no DOM needed). For Phase 81 components, prefer the prototype-identity / `elementProperties` assertions where possible (zero DOM dependency). For DOM-rendering tests of the new presenters, `happy-dom` is configured (`vite.config.ts` `test.environment = 'happy-dom'`).

### Pattern 7: Inline SVG from data via Lit
The repo currently has no inline-SVG-from-Lit example (occurrence maps are `<img src=".svg">` per Phase 80 D-03). This is a new pattern. Lit 3 exports an `svg` tagged template literal alongside `html`:
```ts
import { LitElement, html, svg } from 'lit';
// inside render():
return html`
  <svg viewBox="0 0 240 80" role="img" aria-label="Seasonality, 12 months">
    ${months.map((count, i) => svg`
      <rect x="${i*20}" y="${80 - count*scale}" width="18" height="${count*scale}" />
    `)}
  </svg>
`;
```
The `svg` tag is required for SVG-namespace child elements; using `html` for SVG children silently produces HTML-namespace nodes that don't render. [VERIFIED: lit 3 docs — `svg` tag is the documented pattern; this is stable since lit-html 1.0.]

## Library Locks & Versions

| Library | Version | Source | Notes |
|---------|---------|--------|-------|
| lit | ^3.2.1 | package.json | `html`, `svg`, `LitElement`, `@customElement`, `@property`, `@state` — all in use already. |
| @11ty/eleventy | ^3.1.5 | package.json | Phase 81 adds Nunjucks macro for taxon-nav SSR; no new plugin needed. |
| @11ty/eleventy-plugin-vite | ^7.1.1 | package.json | MPA auto-discovery already producing the `species-*.js` chunk. Phase 81 adds 3 more component imports to `src/entries/species.ts`; same chunk. |
| vitest | ^4.1.2 | package.json | happy-dom env (`vite.config.ts:test.environment`). |
| happy-dom | ^20.8.9 | package.json | Sufficient for Lit 3 light-DOM + customElements registration. |
| @iarna/toml | ^2.2.5 | package.json | Not used in Phase 81 directly. |
| Node.js | 24.12 | `.nvmrc` | Already satisfied. |

**Forbidden / new deps:** none. No chart library (VIZ-01); no router; no popover library; no a11y helper. Native `<details>`, native `customElements`, native `URLSearchParams`, native `history.pushState/replaceState`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Popover open/close, click-outside-to-close, focus management | Custom popover with manual outside-click listener and ARIA | Native `<details><summary>` | NAV-05 already mandates `<details>` for the taxon nav; reuse for filters (D-03). Browser handles keyboard, screen-reader announcement, click-outside (no, but clicking outside doesn't close — see Open Question 3 — and we accept that). |
| Inline SVG bar chart | DOM `<canvas>` chart, or import D3, or import a charting library | `<svg>` + `<rect>` via lit-html `svg` tag | VIZ-01 explicitly forbids chart-library deps. 12 rects + 12 labels + 4 season bands per chart is trivial; lit-html `svg` tag is the standard pattern. |
| URL parsing | Hand-rolled query-string split with split('&') etc. | Native `URLSearchParams` | Already in use throughout `src/url-state.ts`. |
| URL state synchronization | Custom history library, react-router-style abstractions | `window.history.pushState` / `replaceState` + `popstate` listener | Already the pattern in `src/bee-atlas.ts:477-499`. Mirror exactly. |
| Multi-select state | Re-implementing checked-set tracking | `<input type="checkbox">` + `change` event + `Set<string>` in state | Native is fine for ≤39 counties / ~10 ecoregions. |
| Tree expand/collapse | Custom JS show/hide + ARIA expanded state | Native `<details>` `open` attribute | Free keyboard + screen-reader story. |
| `taxonRank` enum | Magic strings sprinkled across files | Reuse `'family' \| 'genus' \| 'species'` from `src/url-state.ts:85` | The SPA's contract is canonical; `buildSpaTaxonLink` re-uses it. |

**Key insight:** every UI primitive Phase 81 needs ships in modern browsers. The temptation to import a popover / multiselect / chart library should be resisted — the static-hosting + content-visibility + per-card-SVG envelope only stays cheap if we don't pile on KB.

## Pitfalls Applicable to Phase 81

### Pitfall #7 — Single accidental import balloons the species chunk (CITED: `.planning/research/PITFALLS.md:266-292`)
**New Phase 81 surface:** `src/lib/spa-link.ts` is a new file *outside* `src/species/` that `src/species/**.ts` will import. ARCH-04 guards `src/species/**` against forbidden imports but does NOT guard `src/lib/spa-link.ts` itself. If someone adds `import { foo } from '../filter.ts'` to `src/lib/spa-link.ts`, every species-page consumer transitively pulls `mapbox-gl` and the chunk balloons.

**Mitigation:** Extend `src/tests/arch.test.ts` with a new `describe` block asserting `src/lib/spa-link.ts` itself contains zero forbidden imports (same `FORBIDDEN` list as `src/species/**`). One new test, identical mechanics. Phase 80's verification confirmed the species chunk at 1.34 KB; budget headroom is ample but the regression risk is real.

### Pitfall #10 — Largest-subgenus card list ships too much per page (CITED: `.planning/research/PITFALLS.md:296-336`)
**Phase 81 angle:** the page is FLAT (Phase 80 D-01 — 735 cards in alphabetical list, no subgenus pagination) and Phase 81 ADDS per-card inline SVG (~12 rects + 4 background rects + axis labels). Per-card SVG size estimate: ~600 bytes of HTML when serialized (12 * ~30 bytes for rects + ~150 bytes for axis text + ~120 bytes for season bands). 735 * 600 = ~440 KB *added DOM* (NOT bundle). Combined with `content-visibility: auto` already on the cards (`src/species/bee-species-card.ts:39-43`), this is OK — content-visibility skips off-screen layout/paint, and 440 KB of DOM strings is comparable to today's per-card metadata.

**Mitigation already in place:** `content-visibility: auto` + `contain-intrinsic-size: 1px 400px` (PAGE-07). New mitigation: emit `<seasonality-viz>` empty server-side and let Lit fill on upgrade ONLY for cards that come into view. Phase 81 should NOT eagerly render all 735 viz on connect — instead, populate `data` `@property` only when the coordinator's filter pass touches that card, OR rely on `content-visibility:auto` to skip the upgrade for off-screen elements (browser-driven; works today). Confirm with manual scroll-test on Lighthouse during Wave verification.

### Pitfall #15 — Filter on species page hides cards with no "0 species" empty state (CITED: `.planning/research/PITFALLS.md:733`)
**Already locked by D-07 (FILT-05).** Empty state renders explicitly when `Math.max(...counts.values()) === 0`. Plan must include a Vitest test asserting the empty-state DOM appears under that condition.

### Pitfall #16 — Species-page filter URL schema collides with SPA `/?...` (CITED: `.planning/research/PITFALLS.md:751`)
**Already locked by D-06 (FILT-02).** Disjoint param namespaces: SPA owns `taxon, taxonRank, x, y, z, yr0, yr1, months, counties, ecor, collectors, elev_min, elev_max, o, bm, view`. Species page owns `fam, subf, tribe, gen, subg, county, ecor, m0, m1`. **Collision risk:** `ecor` is used by BOTH (`src/url-state.ts:53-57` and Phase 81's `src/species/url-state.ts`). This is intentional — they're disjoint *routes* (`/` vs. `/species/`), so a URL only ever carries one schema at a time. But: `buildSpaTaxonLink('Bombus mixtus')` returning `/?taxon=...` means the species page's `ecor` value is dropped on navigation — by design. Document this in `src/url-state.ts` header (LINK-04).

### Pitfall #17 — Pre-filtered SPA link uses wrong query param (CITED: `.planning/research/PITFALLS.md:340`)
**Already locked by LINK-01 + verified at `src/url-state.ts:35-89`:** `parseParams` requires BOTH `taxon` and `taxonRank`; if `taxonRank` is missing, the SPA silently sets `resolvedTaxonName = null` (`src/url-state.ts:88`). The seed example `/collection?taxon=...` (seeds/species-tab.md:31) is wrong on two counts: wrong path AND missing `taxonRank`. Phase 81's `buildSpaTaxonLink(name, rank)` MUST emit BOTH params; LINK-02's round-trip test asserts it.

### Pitfall #18 / #19 — Slug divergence + scientificName authority suffix (CITED: `.planning/research/PITFALLS.md:376, 406`)
**Phase 81 mitigation:** `buildSpaTaxonLink(name, rank)` accepts the *scientificName* (already-canonical, no authority suffix per `_data/species.js`'s consumption of `species.json` which already strips authorities at Phase 78 ingest). Don't slug — the SPA's `parseParams` URL-decodes raw `scientificName`. So `buildSpaTaxonLink('Andrena anograe', 'species')` returns `?taxon=Andrena%20anograe&taxonRank=species` (URL-encoded space, NOT slug). LINK-02 round-trip test asserts no slug transformation occurs.

### NEW Pitfall #81-A — Light-DOM Lit `render()` clobbers SSR children
**What goes wrong:** Phase 81 needs `<bee-species-card>` to display `filteredCount` somewhere. The natural Lit instinct is to define `render()` returning a template. But `<bee-species-card>` is light-DOM (Phase 80 D-05 LOCKED) and overriding `render()` would clobber the server-rendered `<h2>`, photo `<img>`, map `<img>`, attribution `<p>`, description `<p>`, and SPA link `<a>` — a cascade of broken cards.

**Mitigation:**
1. Card MUST keep `render() === LitElement.prototype.render` (the prototype-identity test at `src/tests/bee-species-card.test.ts:11-13` enforces this — Phase 81 plan must NOT modify or weaken this test).
2. Phase 81 server-renders the badge slot in `_pages/species.njk` as `<span class="count-badge"></span>` — empty initially.
3. Card defines `willUpdate(changedProps)` that, when `filteredCount` changes, does `this.querySelector('.count-badge').textContent = String(this.filteredCount)`. Same for `.opacity-mute` class toggle and `.spa-link` text update.
4. SSR-time href is `?taxon=<scientificName>&taxonRank=species` (correct LINK-01 even without JS, computed from a Nunjucks `urlencode`-able value).

### NEW Pitfall #81-B — Race between seasonality.json fetch and filter URL
**What goes wrong:** Coordinator `connectedCallback` parses URL → sets state → triggers filter compute. But `seasonality.json` (260 KB) is still being fetched. Without coordination, the first compute pass returns all-zero counts, the empty state flashes, then the real data arrives.

**Mitigation:** module-level singleton promise `let seasonalityPromise: Promise<...> | null = null; export function loadSeasonality() { if (!seasonalityPromise) seasonalityPromise = fetch('/data/seasonality.json').then(r => r.json()); return seasonalityPromise; }`. Coordinator's `connectedCallback` awaits this before the first filter compute. While awaiting, render a "Loading…" placeholder in the breadcrumb or simply don't run the compute (cards show their server-rendered "all" state — fine because Phase 80's flat alphabetical list is already correct as a fallback). Cache lifetime = page lifetime (no eviction; module-level singleton).

### NEW Pitfall #81-C — `<details>` on iOS Safari + form submission
**What goes wrong:** `<details>` in a `<form>` on older Safari (≤14) used to forcibly close on form interaction. CONTEXT.md D-03 explicitly skips `<form>` wrapping (no-JS submission deferred), so this is moot, but the planner should NOT wrap `<bee-species-filter>` children in a `<form>` "for symmetry" without revisiting this.

**Mitigation:** No `<form>` element. Period. Just `<details>` + `<input type="checkbox">` + JS `change` listener.

### NEW Pitfall #81-D — `@property({ type: Number })` without default fires reactive update on initial connect
**What goes wrong:** `<bee-species-card>` declares `@property({ type: Number }) filteredCount = 0`. On first connection, Lit fires `willUpdate` with `filteredCount: 0`. If `willUpdate` writes to the DOM ("0 records") before the coordinator has computed real counts, every card flashes "0 records" then updates.

**Mitigation:** Default `filteredCount` to a sentinel (`-1`) and skip DOM writes when `filteredCount === -1` (initial state, "not yet computed"). Coordinator's first compute pass sets real counts and triggers a clean update. Or simpler: in `_pages/species.njk` server-render the badge with the *unfiltered* `occurrence_count` (already in `_data/species.js`'s flat array). The coordinator overwrites on first filter pass.

## Runtime State Inventory

Phase 81 is purely additive code/template work. No databases, no OS-registered services, no live-service config. Specifically:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — verified by code inspection. seasonality.json and species.json are read-only build outputs from Phase 78. | none |
| Live service config | None — no external services. Static hosting only (CLAUDE.md). | none |
| OS-registered state | None — verified by checking `data/nightly.sh` (cron-driven on maderas, generates parquet → JSON → SVG; orthogonal to Phase 81 frontend). | none |
| Secrets/env vars | None — no auth, no API keys. Phase 81 components fetch only same-origin static assets. | none |
| Build artifacts | The `_site/assets/species-*.js` chunk grows (Phase 80 baseline 1.34 KB; Phase 81 adds 4 components — recommend ≤30 KB ungzipped, ≤10 KB gzipped budget). No stale artifact concern; `npm run build` regenerates. | none |

## Common Pitfalls

(See Phase 81 pitfalls above. Repo-general pitfalls are catalogued in `.planning/research/PITFALLS.md`; the items applicable to Phase 81 are #7, #10, #15, #16, #17, #18, #19 plus the four new ones surfaced here.)

## Code Examples

### Example 1: `src/lib/spa-link.ts` (D-05)
```ts
// Source: docs at top of src/url-state.ts (added in Phase 81 per LINK-04).
// Verified contract at src/url-state.ts:35-89 (Phase 80 baseline).
//
// Stable interface: the SPA's parseParams requires BOTH `taxon` AND
// `taxonRank` query params (one of 'family', 'genus', 'species').
// If either is missing, parseParams resolves taxonName=null (silent
// drop). Therefore both MUST be emitted by every cross-route deep-link.
//
// This module imports nothing from src/filter.ts, src/bee-map.ts,
// src/bee-atlas.ts, src/sqlite.ts, mapbox-gl, or wa-sqlite —
// enforced by src/tests/arch.test.ts (Pitfall #7 mitigation).

export type TaxonRank = 'family' | 'genus' | 'species';

export function buildSpaTaxonLink(
  scientificName: string,
  rank: TaxonRank = 'species'
): string {
  const params = new URLSearchParams();
  params.set('taxon', scientificName);
  params.set('taxonRank', rank);
  return '/?' + params.toString();
}
```

### Example 2: `src/species/url-state.ts` (D-06)
```ts
// Source: pattern mirrors src/url-state.ts:25-65 (build) and :67-130 (parse).
// DISJOINT from the SPA's url-state.ts — no shared code, no shared params.
// Param namespace: fam, subf, tribe, gen, subg, county (CSV), ecor (CSV), m0, m1.
//
// Known approximation (D-02): combined_vec[m] = max(county_vec[m], ecoregion_vec[m]).
// seasonality.json carries no crossed county×ecoregion slices; max() is a
// deduplicating proxy for OR. See CONTEXT.md D-02 for the long-form rationale.

export interface SpeciesPageState {
  taxonPath: { family: string | null; subfamily: string | null; tribe: string | null; genus: string | null; subgenus: string | null };
  counties: Set<string>;
  ecoregions: Set<string>;
  monthFrom: number;  // 1..12, default 1
  monthTo: number;    // 1..12, default 12
}

export function buildParams(s: SpeciesPageState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.taxonPath.family)    p.set('fam',   s.taxonPath.family);
  if (s.taxonPath.subfamily) p.set('subf',  s.taxonPath.subfamily);
  if (s.taxonPath.tribe)     p.set('tribe', s.taxonPath.tribe);
  if (s.taxonPath.genus)     p.set('gen',   s.taxonPath.genus);
  if (s.taxonPath.subgenus)  p.set('subg',  s.taxonPath.subgenus);
  if (s.counties.size > 0)   p.set('county', [...s.counties].sort().join(','));
  if (s.ecoregions.size > 0) p.set('ecor',  [...s.ecoregions].sort().join(','));
  if (s.monthFrom !== 1)     p.set('m0', String(s.monthFrom));
  if (s.monthTo   !== 12)    p.set('m1', String(s.monthTo));
  return p;
}

export function parseParams(search: string): SpeciesPageState {
  const p = new URLSearchParams(search);
  const csv = (k: string) => {
    const v = p.get(k) ?? '';
    return new Set(v ? v.split(',').map(s => s.trim()).filter(Boolean) : []);
  };
  const month = (k: string, fallback: number) => {
    const n = parseInt(p.get(k) ?? '');
    return (Number.isFinite(n) && n >= 1 && n <= 12) ? n : fallback;
  };
  return {
    taxonPath: {
      family:    p.get('fam')   || null,
      subfamily: p.get('subf')  || null,
      tribe:     p.get('tribe') || null,
      genus:     p.get('gen')   || null,
      subgenus:  p.get('subg')  || null,
    },
    counties:   csv('county'),
    ecoregions: csv('ecor'),
    monthFrom:  month('m0', 1),
    monthTo:    month('m1', 12),
  };
}
```

### Example 3: Coordinator filteredCount compute (D-01, D-02)
```ts
// Inside <bee-species-page> (extending Phase 80 skeleton at src/species/bee-species-page.ts).
// Triggered from willUpdate when _activeTaxonPath / _geoFilter / _seasonFilter changes.

private _seasonality: Record<string, Record<string, number[]>> | null = null;
private _filteredCounts: Map<string, number> = new Map();

private async _ensureSeasonality(): Promise<void> {
  if (this._seasonality) return;
  this._seasonality = await loadSeasonality();   // module-level singleton
}

private _computeFilteredCounts(): void {
  if (!this._seasonality) return;
  const counties = this._geoFilter?.counties ?? new Set();
  const ecoregions = this._geoFilter?.ecoregions ?? new Set();
  const m0 = this._seasonFilter?.monthFrom ?? 1;
  const m1 = this._seasonFilter?.monthTo ?? 12;
  const newCounts = new Map<string, number>();

  for (const [nameLower, slices] of Object.entries(this._seasonality)) {
    let combined: number[];
    if (counties.size === 0 && ecoregions.size === 0) {
      combined = slices['_total'] ?? new Array(12).fill(0);
    } else {
      const cv = new Array(12).fill(0);
      const ev = new Array(12).fill(0);
      for (const c of counties) {
        const v = slices['county:' + c];
        if (v) for (let i = 0; i < 12; i++) cv[i] += v[i];
      }
      for (const e of ecoregions) {
        const v = slices['ecoregion_l3:' + e];
        if (v) for (let i = 0; i < 12; i++) ev[i] += v[i];
      }
      combined = cv.map((c, i) => Math.max(c, ev[i]));    // D-02 approximation
    }
    let total = 0;
    for (let m = m0 - 1; m <= m1 - 1; m++) total += combined[m];
    newCounts.set(nameLower, total);
  }
  this._filteredCounts = newCounts;
  this._propagateCountsToCards();
}

private _propagateCountsToCards(): void {
  for (const card of this.querySelectorAll('bee-species-card')) {
    const name = (card as any).scientificName?.toLowerCase();
    if (!name) continue;
    (card as any).filteredCount = this._filteredCounts.get(name) ?? 0;
  }
}
```

### Example 4: Inline SVG seasonality viz (VIZ-01..05)
```ts
// src/species/seasonality-viz.ts — light-DOM Lit element that DOES define render()
// (no SSR contract for the SVG content; server emits empty <seasonality-viz> host).

import { LitElement, html, svg, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

const MONTH_LABELS = ['J','F','M','A','M','J','J','A','S','O','N','D'];
// Meteorological seasons (NH): Dec-Feb winter, Mar-May spring, Jun-Aug summer, Sep-Nov fall.
const SEASON_BANDS = [
  { from: 0,  to: 1,  cls: 'winter' },  // Jan, Feb
  { from: 2,  to: 4,  cls: 'spring' },  // Mar, Apr, May
  { from: 5,  to: 7,  cls: 'summer' },  // Jun, Jul, Aug
  { from: 8,  to: 10, cls: 'fall'   },  // Sep, Oct, Nov
  { from: 11, to: 11, cls: 'winter' },  // Dec
];

@customElement('seasonality-viz')
export class SeasonalityViz extends LitElement {
  @property({ attribute: false }) data: number[] = new Array(12).fill(0);

  protected createRenderRoot(): HTMLElement { return this; }

  render() {
    const total = this.data.reduce((a, b) => a + b, 0);
    if (total < 5) {
      const months = this.data.map((n, i) => n > 0 ? MONTH_LABELS[i] : null).filter(Boolean);
      const range = months.length > 0 ? `${months[0]}–${months[months.length-1]}` : '';
      return html`<p class="viz-fallback">${total} record${total === 1 ? '' : 's'}${range ? `, ${range}` : ''}</p>`;
    }
    const stars = total >= 1000 ? '****' : total >= 100 ? '***' : total >= 50 ? '**' : total >= 20 ? '*' : '';
    const max = Math.max(...this.data);
    const W = 240, H = 80, BAR_W = 18, GAP = 2;
    return html`
      <svg viewBox="0 0 ${W} ${H + 14}" role="img" aria-label="Monthly seasonality, ${total} records">
        ${SEASON_BANDS.map(b => svg`
          <rect class="band-${b.cls}" x="${b.from * (BAR_W + GAP)}" y="0"
                width="${(b.to - b.from + 1) * (BAR_W + GAP)}" height="${H}" />`)}
        ${this.data.map((n, i) => svg`
          <rect class="bar" x="${i * (BAR_W + GAP) + 1}" y="${H - (n / max) * H}"
                width="${BAR_W}" height="${(n / max) * H}" />`)}
        ${MONTH_LABELS.map((label, i) => svg`
          <text class="axis" x="${i * (BAR_W + GAP) + BAR_W/2 + 1}" y="${H + 12}"
                text-anchor="middle">${label}</text>`)}
      </svg>
      ${stars ? html`<span class="sample-stars" aria-label="Sample size ${stars.length}">${stars}</span>` : ''}
    `;
  }

  static styles = css`
    :host { display: inline-block; }
    .band-winter { fill: #f0f4ff; }
    .band-spring { fill: #e8f5e8; }
    .band-summer { fill: #fff4dc; }
    .band-fall   { fill: #fde8d8; }
    .bar { fill: #2a5a8a; }
    .axis { font: 10px system-ui; fill: #555; }
    .viz-fallback { color: var(--text-hint); font-style: italic; font-size: 0.85rem; }
    .sample-stars { color: var(--text-hint); font-size: 0.8rem; margin-left: 0.4rem; }
  `;
}
```

### Example 5: ARCH-04 test extension for `src/lib/spa-link.ts`
```ts
// Add to src/tests/arch.test.ts (alongside the existing src/species describe blocks):

describe('ARCH-04: src/lib/spa-link.ts boundary (D-05)', () => {
  const file = resolve(ROOT, 'src/lib/spa-link.ts');
  const FORBIDDEN_FOR_LIB = [...FORBIDDEN, '../url-state.ts', '../url-state'];

  test('src/lib/spa-link.ts contains no forbidden imports', () => {
    const src = readFileSync(file, 'utf8');
    const all = [
      ...extractImports(src, STATIC_IMPORT_RE),
      ...extractImports(src, DYNAMIC_IMPORT_RE),
    ];
    const violations = all.filter(s => FORBIDDEN_FOR_LIB.some(bad => s === bad || s.startsWith(bad + '/')));
    expect(violations, `forbidden imports: ${violations.join(', ')}`).toEqual([]);
  });
});
```

## Open Questions Resolved

### OQ-1: Lit `@property` diffing across 735 cards — is it expensive? (CONTEXT predicted "yes-and-fine")

**Recommendation: yes-and-fine, no profiling needed.** Lit's reactive update is per-element: setting `card.filteredCount = N` schedules a microtask-driven `update()` on that one card; `hasChanged` (default `===`) prevents work when value is unchanged. 735 prop-sets is 735 trivial setter invocations and ≤735 microtask scheduling. The actual *render* cost on cards stays at zero because `<bee-species-card>` does NOT define `render()` (Phase 80 invariant — `LitElement.prototype.render` returns `noChange` and lit-html commits a no-op, verified at `node_modules/lit-element/development/lit-element.js:95-130` per Phase 80 RESEARCH.md). The only DOM work is the explicit `willUpdate` hook that pokes `.querySelector('.count-badge')` per card — also O(1) per card.

[ASSUMED — no profiling done] Worst case at 735 cards: ~5-10 ms total update budget on a midrange laptop, well below the 16 ms frame budget. If profiling later shows an issue, the fallback is to skip the `@property` per card entirely and have the coordinator publish a `WeakMap<BeeSpeciesCard, number>` that cards consult on connect — but this is unnecessary complexity ahead of measurement.

**Decision input for planner:** proceed with `@property({ type: Number }) filteredCount = -1`. Sentinel default avoids initial-render flash (Pitfall #81-D).

### OQ-2: BeeSearch season-band tints + sample-size annotation — design source?

**Searched:** the seed at `seeds/species-tab.md:37` cites the Wiley paper "https://onlinelibrary.wiley.com/doi/10.1002/ece3.72049" and references `~/dev/BeeSearch` as code/data. No design artifact is checked into the BeeAtlas repo (verified: no `seasonality-viz` reference image, no Figma export, no design tokens in `_includes/` or `src/style.ts`).

[ASSUMED] The `*` 20-49 / `**` 50-99 / `***` 100-999 / `****` ≥1000 thresholds and meteorological-quarter season bands are inherited from BeeSearch by convention (per CONTEXT.md). Without access to the BeeSearch repo, I cannot verify exact tint hex values. **Recommendation:** planner picks reasonable pastels (winter=cool blue `#f0f4ff`, spring=fresh green `#e8f5e8`, summer=warm yellow `#fff4dc`, fall=warm orange `#fde8d8`) per Example 4 above; user can adjust during `/gsd-ui-phase 81` follow-up if BeeSearch parity is desired. Bar fill `#2a5a8a` matches the existing `--text-secondary` family.

**User confirmation suggested:** before locking, ask the user whether to inspect `~/dev/BeeSearch` for exact tints, or accept the proposed pastels as starting values.

### OQ-3: `<details>` popover keyboard/a11y best practices, click-outside-to-close

**Resolved:**
- **Keyboard:** native `<details><summary>` is keyboard-accessible by default (Tab to focus summary, Space/Enter to toggle). No custom JS needed.
- **Screen reader:** announced as "expanded/collapsed group" — natively. Add `aria-label` on `<summary>` if the visible text isn't sufficient (e.g., `aria-label="County filter, 3 selected"`).
- **Click-outside-to-close:** `<details>` does NOT close on outside click natively. **Recommendation: don't add it.** It's a common UI choice but violates user expectation when several details panels are open simultaneously (a multi-select workflow exactly like our county+ecoregion case). Users close panels by clicking the summary again. If usability testing later demands click-outside, add a `document` `click` listener that closes panels not containing `event.target`.
- **Multi-select state binding to URL:** debounce `change` events on the checkbox group to coalesce rapid clicks into a single URL update. Use the same `replaceState` immediate + 500ms `pushState` debounce pattern from `src/bee-atlas.ts:486-491`.
- **Mobile:** `<details>` works on iOS/Android. Tap the summary to toggle. Use CSS `details > ul { max-height: 60vh; overflow-y: auto }` for long county lists.

### OQ-4: URL push vs. replace — typing-flow vs. discrete actions

**Resolved (mirroring existing repo pattern):**
- **All filter changes** call the same `_pushUrlState()` method.
- That method does immediate `replaceState` (so the URL reflects current state for refresh-survival and shareability) THEN schedules a debounced `pushState` after 500 ms of idle.
- Result: rapid changes (slider drag, typing in month input) coalesce into a single history entry; discrete actions (single checkbox click) get their own entry after 500 ms.

This is the exact pattern at `src/bee-atlas.ts:477-492`. Copy verbatim. **Don't add per-action push/replace policy** unless usability testing later shows a need.

### OQ-5: seasonality.json fetch strategy

**Resolved:**
- Module-level singleton `Promise<...>` in `src/species/seasonality-cache.ts` (or inline at top of `bee-species-page.ts`).
- One `fetch('/data/seasonality.json')` for the page lifetime.
- `Cache-Control` is governed by the static-host (S3 + CloudFront, AWS resources per MEMORY.md). The site's CDN cache headers default to long-lived (data files are versioned by content); a stale read is fine because seasonality is a build-time output that only changes nightly.
- Error handling: `.catch` logs and resolves to `null`; coordinator falls back to "no filtering" (cards stay un-muted, filteredCount = occurrence_count). The page degrades gracefully — better than a hung loading state.

```ts
// src/species/seasonality-cache.ts
let promise: Promise<Record<string, Record<string, number[]>> | null> | null = null;
export function loadSeasonality() {
  if (!promise) {
    promise = fetch('/data/seasonality.json')
      .then(r => r.ok ? r.json() : null)
      .catch(err => { console.warn('seasonality.json fetch failed', err); return null; });
  }
  return promise;
}
```

### OQ-6: Vitest test patterns for Lit light-DOM components in this repo

**Resolved:** three pattern tiers, pick per test:
1. **Prototype-identity / static analysis** (no DOM) — fastest, no happy-dom hookup. Example: `src/tests/bee-species-card.test.ts:11-13` (asserts `render === LitElement.prototype.render`). Use for invariant locks like "card never overrides render", "filter file does not declare taxon @state".
2. **`elementProperties` reflection** (no DOM) — verify `@property` declarations exist. Example: `src/tests/bee-sidebar.test.ts:23-32`. Use for "card has filteredCount property".
3. **Full DOM upgrade** (happy-dom env) — instantiate, append to `document.body`, assert rendered DOM. Use for VIZ-02 (bar vs. fallback rendering), FILT-05 (empty state appears), NAV-04 (mute class applied to filtered branches).

Plan should prefer (1)/(2) over (3) where possible — faster, more invariant-shaped, no happy-dom flakiness. The 5 Vitest suites named in CONTEXT line 148 break down naturally:
- `species-url-state.test.ts` — pure function round-trip; no DOM (tier 1).
- `spa-link.test.ts` — pure function round-trip; no DOM (tier 1).
- `bee-taxon-nav.test.ts` — DOM (tier 3): instantiate with a small fake tree, set `_activeTaxonPath`, assert mute classes applied.
- `seasonality-viz.test.ts` — DOM (tier 3): two test cases — `data=[5,5,5,5,5,5,5,5,5,5,5,5]` renders 12 `<rect class="bar">`; `data=[1,1,1,0,0,0,0,0,0,0,0,0]` renders fallback `<p>`.
- `bee-species-filter.test.ts` — DOM (tier 3): filter-changed CustomEvent payload assertions.

### OQ-7: `content-visibility: auto` interaction with per-card inline SVG

**Resolved:** safe. `content-visibility: auto` skips layout/paint for off-screen elements; SVG is just more layout/paint and gets the same skip. The 735 cards × ~600 byte SVG strings is ~440 KB of HTML — that's parsed once (cheap) and laid out lazily. Combined with `contain-intrinsic-size: 1px 400px` already at `src/species/bee-species-card.ts:41`, scrollbar height stays accurate.

**Mitigation against regression:** Phase 81 plan should include a manual Lighthouse pass (or a Vitest assertion that the species-page chunk + per-card-SVG-bytes total stays under a budget — recommend ≤500 KB DOM-bytes, ≤30 KB JS-bytes ungzipped, measured via `_site/index.html` size + `_site/assets/species-*.js` size). This complements PERF-01 (Phase 82) without preempting it.

### OQ-8: ARCH-04 forbidden-import enforcement — `src/lib/spa-link.ts`

**Resolved:** `src/tests/arch.test.ts:50-62` (`listTsFiles`) walks `src/species/` recursively and asserts each file's imports against `FORBIDDEN`. Phase 81 must extend in two ways:
1. Add a NEW describe block that walks `src/lib/spa-link.ts` (single file) and asserts no forbidden imports — see Example 5 above.
2. The existing `FORBIDDEN` array under `src/species/**` does NOT need updating; the relative path `../lib/spa-link.ts` is allowed (it's not in the forbidden list, and the file itself is verified clean by (1)).

**Side benefit:** because `src/url-state.ts` (the SPA's) re-exports `buildSpaTaxonLink` from `src/lib/spa-link.ts` (per D-05's "documented at the SPA's URL-state entry point"), the LINK-04 header comment in `src/url-state.ts` becomes the canonical contract location, and any future cross-route helper (e.g., `buildSpaCountyLink`) lives in the same `src/lib/spa-link.ts` module — preserving the boundary.

## Recommended Plan Decomposition

The phase decomposes naturally into 5 plans on a clean dependency line. Researcher recommends the following structure (planner is free to merge/split):

### Plan 1 — Foundation: `spa-link` + `url-state` + ARCH-04 extension + Wave 0 RED tests
**Requirements covered:** LINK-01, LINK-02, LINK-03, LINK-04, FILT-02, FILT-03, ARCH-04 extension
**Files:** `src/lib/spa-link.ts` (new); `src/species/url-state.ts` (new); `src/url-state.ts` (header comment add only); `src/tests/arch.test.ts` (extend); `src/tests/spa-link.test.ts` (new); `src/tests/species-url-state.test.ts` (new).
**Depends on:** Phase 80.
**Why first:** all subsequent plans import from these. Pure functions; fast TDD. The ARCH-04 extension catches Pitfall #81-A regressions in Plans 2-5.

### Plan 2 — Build-time data extension: `_data/species.js` option lists + Nunjucks taxon-tree macro + `<bee-taxon-nav>`
**Requirements covered:** NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, FILT-01 (option lists portion)
**Files:** `_data/species.js` (extend with `counties`, `ecoregionL3` arrays computed from `seasonality.json`); `_pages/species.njk` (add Nunjucks recursive macro emitting nested `<details>`/`<ul>` from `species.tree`); `src/species/bee-taxon-nav.ts` (new); `src/tests/data-species.test.ts` (extend); `src/tests/bee-taxon-nav.test.ts` (new).
**Depends on:** Plan 1 (uses `buildSpaTaxonLink` for genus/family deep-links).
**Why second:** SSR'd nav tree is the user-visible scaffold for everything else; no-JS testable in isolation.

### Plan 3 — `<bee-species-filter>` (`<details>`-popover checkbox lists + month range)
**Requirements covered:** FILT-01 (rendering), FILT-02 (URL emission), FILT-06, FILT-07
**Files:** `src/species/bee-species-filter.ts` (new); `_pages/species.njk` (add filter host element); `src/entries/species.ts` (add component import); `src/tests/bee-species-filter.test.ts` (new).
**Depends on:** Plan 1 (URL state types) + Plan 2 (option lists from `_data/species.js`).
**Why third:** filter widget is independent of the viz and the count-compute; emits CustomEvents the coordinator wires up in Plan 5.

### Plan 4 — `<seasonality-viz>` (inline SVG)
**Requirements covered:** VIZ-01, VIZ-02, VIZ-03, VIZ-04 (consumer side), VIZ-05
**Files:** `src/species/seasonality-viz.ts` (new); `_pages/species.njk` (add empty `<seasonality-viz>` host inside each card); `src/entries/species.ts` (add import); `src/tests/seasonality-viz.test.ts` (new).
**Depends on:** Plan 1 (no — pure presenter, only reads its `data` prop).
**Why fourth:** independent of filter widget; can start in parallel with Plan 3 if the team wants. Sequencing it after Plan 3 keeps the test suite RED in linear order.

### Plan 5 — Coordinator wiring + `<bee-species-card>` extensions + breadcrumb + empty state + integration tests
**Requirements covered:** D-01, D-02, D-04 wiring, FILT-04, FILT-05, FILT-06 (rendering), FILT-07 (action), NAV-03 (state→URL), and integration of all preceding plans.
**Files:** `src/species/bee-species-page.ts` (extend: URL parse on connect, `_pushUrlState`, `_computeFilteredCounts`, `_propagateCountsToCards`, breadcrumb pill render, empty-state render, popstate listener); `src/species/bee-species-card.ts` (add `@property filteredCount`, `willUpdate` hook to update badge text + mute class; **MUST keep the prototype-identity invariant intact**); `src/species/seasonality-cache.ts` (new — fetch singleton); `_pages/species.njk` (add per-card `.count-badge` placeholder, `<seasonality-viz>` host, "View N occurrences" `<a>`, breadcrumb pill row container, empty-state container); `src/tests/bee-species-page.test.ts` (extend with full integration: feed fake URL → assert filteredCounts → assert empty state renders).
**Depends on:** Plans 1, 2, 3, 4.
**Why last:** integrates everything; biggest test surface; the place where Phase 80's locked invariants are most likely to be accidentally violated.

**Alternative shape considered:** combining Plans 3+4 (filter + viz are both small and independent of each other). Reject: Plan 3's `<details>`-popover DOM mechanics are unrelated to Plan 4's SVG mechanics; keeping them separate keeps RED→GREEN cycles short. Combine only if velocity demands.

**Wave 0 / scaffolding:** all RED test files for Plans 1-5 land in Plan 1's commit (or a dedicated Wave 0 commit) so the test suite goes RED for everything Phase 81 will fix, then progresses to GREEN plan-by-plan. This mirrors Phase 80's verified pattern (`080-01-PLAN.md` Wave 0 + 7 RED test files).

## Validation Architecture (Nyquist Dimension 8)

Project config has `workflow.nyquist_validation: true` (`.planning/config.json`). All Phase 81 requirements admit observable signals:

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 + happy-dom 20.8.9 |
| Config file | `vite.config.ts` (`test.environment = 'happy-dom'`) — no separate `vitest.config.ts` |
| Quick run command | `npm test -- --run src/tests/<file>.test.ts` |
| Full suite command | `npm test` (runs all under `src/tests/`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| NAV-01 | Tree renders with families at root | DOM (tier 3) | `npm test -- --run src/tests/bee-taxon-nav.test.ts` | ❌ Wave 0 (Plan 2) |
| NAV-02 | Subgenus level skipped when all-null | DOM (tier 3) | same | ❌ Wave 0 |
| NAV-03 | Selecting node updates `_activeTaxonPath` + URL | DOM + URL assertion | `npm test -- --run src/tests/bee-species-page.test.ts` | ❌ Wave 0 (Plan 5) |
| NAV-04 | Mute class on filtered-out branches | DOM (tier 3) | same as NAV-01 | ❌ Wave 0 |
| NAV-05 | SSR'd `<details>`/`<ul>` markup present | static (tier 1, readFileSync `_site/species/index.html` after `npm run build`) | manual subprocess test in CI; or just `grep <details> _site/species/index.html` | ❌ Wave 0 (Plan 2) |
| FILT-01 | Filter widget renders county+ecoregion+month inputs | DOM | `npm test -- --run src/tests/bee-species-filter.test.ts` | ❌ Wave 0 (Plan 3) |
| FILT-02 | URL has correct param namespace | round-trip (tier 1) | `npm test -- --run src/tests/species-url-state.test.ts` | ❌ Wave 0 (Plan 1) |
| FILT-03 | Round-trip parse(build(state)) === state | round-trip (tier 1) | same | ❌ Wave 0 |
| FILT-04 | Card mute when filteredCount=0 + badge updates | DOM (tier 3) | `npm test -- --run src/tests/bee-species-page.test.ts` | ❌ Wave 0 (Plan 5) |
| FILT-05 | Empty state DOM appears when max(counts)=0 | DOM (tier 3) | same | ❌ Wave 0 |
| FILT-06 | Breadcrumb pills render per active filter | DOM (tier 3) | same | ❌ Wave 0 |
| FILT-07 | Clear filters resets all state + URL | DOM + URL (tier 3) | same | ❌ Wave 0 |
| VIZ-01 | Inline `<svg>` from Lit template | DOM (tier 3) | `npm test -- --run src/tests/seasonality-viz.test.ts` | ❌ Wave 0 (Plan 4) |
| VIZ-02 | Bars when n≥5; text fallback when n<5 | DOM (tier 3) | same — two test cases | ❌ Wave 0 |
| VIZ-03 | J F M A M J J A S O N D labels + 4 season-band rects | DOM (tier 3) | same | ❌ Wave 0 |
| VIZ-04 | Viz consumes pre-binned slice (no in-browser KDE) | static analysis (tier 1, regex-assert no `kde\|kernel` in source) | `npm test -- --run src/tests/seasonality-viz.test.ts` | ❌ Wave 0 |
| VIZ-05 | `*`/`**`/`***`/`****` annotation thresholds | DOM (tier 3) | same — 4 test cases | ❌ Wave 0 |
| LINK-01 | `buildSpaTaxonLink` returns `/?taxon=…&taxonRank=species` | unit (tier 1) | `npm test -- --run src/tests/spa-link.test.ts` | ❌ Wave 0 (Plan 1) |
| LINK-02 | Round-trip: link → SPA `parseParams` → species | unit (tier 1) — imports `parseParams` from `src/url-state.ts` | same | ❌ Wave 0 |
| LINK-03 | rank=genus/family branch in helper | unit (tier 1) | same | ❌ Wave 0 |
| LINK-04 | Header comment present in `src/url-state.ts` | static analysis (readFileSync regex) | `npm test -- --run src/tests/spa-link.test.ts` | ❌ Wave 0 |
| ARCH-04 | `src/lib/spa-link.ts` itself imports nothing forbidden | static analysis | `npm test -- --run src/tests/arch.test.ts` | ❌ Wave 0 (extend existing file) |
| Phase 80 invariants preserved | Card prototype identity holds; coordinator state shape holds | static (tier 1) | `npm test -- --run src/tests/bee-species-card.test.ts src/tests/bee-species-page.test.ts` | ✅ exists (must not regress) |

### Sampling Rate
- **Per task commit:** `npm test -- --run src/tests/<just-touched>.test.ts` (typically <2 s).
- **Per wave merge:** `npm test` (full suite — Phase 80 reports 242 tests green; Phase 81 adds ~30-40 more).
- **Phase gate:** full `npm test` + `npm run build` green before `/gsd-verify-work`. The build runs `validate-schema → validate-species → typecheck → eleventy`, which catches Nunjucks template errors that Vitest cannot.

### Wave 0 Gaps
- [ ] `src/tests/spa-link.test.ts` — covers LINK-01, LINK-02, LINK-03, LINK-04, ARCH-04 (lib portion)
- [ ] `src/tests/species-url-state.test.ts` — covers FILT-02, FILT-03
- [ ] `src/tests/bee-taxon-nav.test.ts` — covers NAV-01, NAV-02, NAV-04 (NAV-03 lives in coordinator test); plus a static-analysis sub-test for NAV-05 SSR markup if `_site/` is available.
- [ ] `src/tests/bee-species-filter.test.ts` — covers FILT-01, FILT-06 (pill emission), FILT-07
- [ ] `src/tests/seasonality-viz.test.ts` — covers VIZ-01..05
- [ ] `src/tests/bee-species-page.test.ts` (extend existing) — covers NAV-03, FILT-04, FILT-05, FILT-06 rendering, FILT-07 action, D-01/D-02 compute
- [ ] `src/tests/arch.test.ts` (extend existing) — covers ARCH-04 for `src/lib/spa-link.ts`
- [ ] `src/tests/data-species.test.ts` (extend existing) — covers `counties` / `ecoregionL3` option list export

No framework install needed.

## Environment Availability

Phase 81 has no external dependencies beyond what Phase 80 already exercises.

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | npm scripts | ✓ | 24.12 (`.nvmrc`) | — |
| `npm test` (Vitest) | Wave 0 RED tests | ✓ | 4.1.2 | — |
| `npm run build` (Eleventy + Vite) | Final SSR + chunk emission | ✓ | 3.1.5 / 6.2.3 | — |
| `public/data/seasonality.json` | D-01 / D-02 compute, D-04 viz | ✓ | 260 KB, 556 species (smaller than `species.json`'s 735 — see Open Question 9 below) | — |
| `public/data/species.json` | tree + counts | ✓ | 735 species | — |

**Note (NEW Open Question #9):** `seasonality.json` covers 556 species (verified by inspection); `species.json` covers 735. The 179 checklist-only species (no occurrences, hence no seasonality data) will have `filteredCount === undefined` from the seasonality lookup. Coordinator must default missing entries to `0` (or to `species.occurrence_count` if no filter is active). Plan 5's `_computeFilteredCounts` must handle this — see Example 3 above which iterates over `Object.entries(this._seasonality)` and silently skips checklist-only species. Recommendation: when no geo+month filter is active, fall back to `species.occurrence_count` (which IS present for all 735); when any filter is active, checklist-only species get count 0 (correct: no occurrences means no county/ecoregion match by definition).

## State of the Art

No SOTA shifts relevant to Phase 81. Lit 3 has been stable since 2023; native `<details>`, `URLSearchParams`, `history.pushState`, `customElements`, and `loading="lazy"` are all baseline. The `content-visibility: auto` CSS property reached cross-browser baseline in 2024 (Safari 18.0). The `svg` tagged template literal in Lit has been the documented pattern since lit-html 1.x.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | BeeSearch tint hex values not in repo; recommended pastels are reasonable defaults | OQ-2 | Visual mismatch with BeeSearch reference; correctable in Phase 82 / `/gsd-ui-phase 81`. Low risk. |
| A2 | Lit `@property` diffing across 735 cards is fast enough without profiling | OQ-1 | If actually slow, fallback is a `WeakMap` published by coordinator. Low risk on 2024+ hardware. |
| A3 | `content-visibility: auto` skips Lit upgrade for off-screen cards (browser-driven) | Pitfall #10 mitigation | If Lit upgrades all 735 components on connect regardless, that's ~735 upgrade calls (fast: ~5 ms total). Low risk. |
| A4 | `seasonality.json` keys are stable lowercase (e.g., `'agapostemon femoratus'`) | Example 3 | Verified: keys ARE lowercase per inspection (`agapostemon femoratus` etc.). [VERIFIED] — strike from this table; no risk. |
| A5 | The 179 checklist-only species (in species.json but not seasonality.json) should default to filteredCount=0 when any filter is active | OQ-9 / Environment Availability note | If user wants checklist-only species to stay always-visible, plan must add an explicit clause. Low risk; planner can verify with user. |

## Open Questions

1. **A1 — BeeSearch tints.** Researcher recommends planner defer to user; either accept proposed pastels or inspect `~/dev/BeeSearch` for exact tints during the planning step.
2. **A5 — Checklist-only species behavior under filter.** Researcher recommends: filtered-out (count=0, muted) when any filter active; visible (count=occurrence_count=0; still muted because count=0) when no filter — same as today. User confirmation suggested before locking; alternative is "always visible regardless of filter" which would require a special-case in `_computeFilteredCounts`.
3. **Plan 4 / Plan 3 ordering.** Researcher's recommendation is sequential (3 then 4) for linear test progression. If team wants parallelism, they're independent — confirm no shared file edits.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/081-filter-ux-nav/081-CONTEXT.md` — locked decisions D-01..D-07
- `.planning/phases/080-page-scaffolding/080-CONTEXT.md` — Phase 80 D-05/D-07 (light-DOM SSR, coordinator state shape)
- `.planning/phases/080-page-scaffolding/080-RESEARCH.md` — verified Lit `render()` semantics from `node_modules/lit-element/development/lit-element.js:95-130`
- `.planning/REQUIREMENTS.md:78-107` — NAV/FILT/VIZ/LINK requirement IDs verbatim
- `.planning/ROADMAP.md:589-598` — Phase 81 success criteria
- `.planning/research/PITFALLS.md:266-336, 340-440, 733-770` — Pitfalls #7, #10, #15-19
- `src/url-state.ts:1-130` — SPA URL contract; `parseParams` requires both `taxon` and `taxonRank`
- `src/bee-atlas.ts:265-300, 477-499` — coordinator URL-state pattern (replaceState immediate + debounced pushState + popstate)
- `src/species/bee-species-page.ts`, `src/species/bee-species-card.ts` — Phase 80 light-DOM scaffold
- `src/tests/arch.test.ts:1-168` — ARCH-04 test mechanics
- `src/tests/bee-species-card.test.ts:11-13` — prototype-identity invariant
- `src/tests/url-state.test.ts:1-50` — round-trip Vitest pattern
- `_data/species.js:1-60` — build-time data feed pattern
- `_pages/species.njk:1-26` — Phase 80 SSR template
- `vite.config.ts` — happy-dom env config
- `tsconfig.json` — `rewriteRelativeImportExtensions`, `experimentalDecorators`, strict mode
- `package.json` — version locks (lit 3.2.1, vitest 4.1.2, etc.)
- `public/data/seasonality.json` (sampled) — confirmed shape `<lower-name> → {_total | county:X | ecoregion_l3:Y} → int[12]`
- `public/data/species.json` (sampled) — confirmed shape with `month_histogram[12]`, `county_count`, etc.

### Secondary (MEDIUM confidence)
- Lit 3 docs (training data) — `svg` tagged template literal is documented; semantics stable since lit-html 1.x.
- `<details>` browser support and click-outside semantics — well-established native behavior.

### Tertiary (LOW confidence)
- BeeSearch tint hex values — assumed; not verified in-tree (see A1).

## Project Constraints (from CLAUDE.md)

- **Static hosting only.** No server runtime. Phase 81 introduces no server-side filtering, no API routes. ✓ All filtering is client-side over a one-shot `seasonality.json` fetch.
- **Python 3.14+ for `data/`.** Phase 81 doesn't touch `data/`. ✓
- **State ownership invariant (ARCH-03).** `<bee-species-page>` owns all reactive state. `<bee-taxon-nav>`, `<bee-species-filter>`, `<seasonality-viz>` are pure presenters — receive state via `@property`, emit `CustomEvent`s. No shared module-level mutable state EXCEPT the seasonality.json fetch singleton (a frozen Promise — read-only after first call). ✓
- **`speicmenLayer` typo deferred.** Not touched by Phase 81. ✓
- **Filter race guard.** Coordinator should increment a generation counter on filter changes; async results discarded if stale. Phase 81's `seasonality.json` is loaded once (no race), and the compute pass is synchronous (no race), so the guard is unneeded for Phase 81 — but if the planner ever adds an async dimension to filtering, mirror `bee-atlas.ts:308-314`'s pattern.
- **ID format.** Phase 81 uses scientificName (string), not ID prefixes. The SPA's `parseParams` resolves scientificName → occurrences via `taxonName + taxonRank` matching, not via ID lookup. ✓

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package is already pinned and exercised by Phase 80.
- Architecture: HIGH — every pattern is repo-local (light-DOM Lit, `_pushUrlState`, ARCH-04 source-analysis, `_data/*.js`).
- Pitfalls: HIGH for repo-cited pitfalls (#7, #10, #15-19); HIGH for the 4 newly surfaced (verified mechanics).
- BeeSearch design conventions: MEDIUM — tints inferred, not verified in-tree.
- D-01 perf claim (735-card `@property` diffing): MEDIUM-HIGH — sound based on Lit's documented semantics; not profiled.

**Research date:** 2026-05-04
**Valid until:** 2026-06-04 (30 days; lit/vite/eleventy versions are stable; Phase 78/79/80 outputs are stable; only triggers for re-research are a Lit major bump or a `seasonality.json` schema change).

## RESEARCH COMPLETE
