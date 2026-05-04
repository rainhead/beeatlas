# Phase 81: Filter UX & Nav — Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Source:** /gsd-discuss-phase 81

<domain>
## Phase Boundary

Phase 81 layers interactive filter, navigation, seasonality visualization, and SPA-deep-link UI atop the Phase 80 static skeleton at `/species/`. The DOM stays the same — 735 server-rendered `<bee-species-card>` elements in a flat alphabetical list — but Phase 81 adds presenter components and wires them through the coordinator's existing state shape.

Phase 81 ships:

- `src/species/bee-taxon-nav.ts` — vertical left-rail tree (family → subfamily → tribe → genus → subgenus → species) with expand-on-click, mute-not-hide on filtered-out branches, `_activeTaxonPath` round-tripped through URL state. Server-rendered as nested `<details>`/`<ul>` so the page is navigable without JS.
- `src/species/bee-species-filter.ts` — county multi-select, ecoregion-l3 multi-select, month-range inputs. Each multi-select is a `<details><summary>` popover containing a checkbox list (mobile-friendly, no-JS-degradable, matches the NAV-05 `<details>` aesthetic).
- `src/species/seasonality-viz.ts` — inline SVG seasonality chart from a 12-element monthly histogram via Lit template. No chart-library dep. Bars when `n ≥ 5`, text fallback ("3 records, May–June") when `n < 5`. J F M A M J J A S O N D x-axis, BeeSearch-style winter/spring/summer/fall season-band tints, sample-size star annotation (`*` 20–49 / `**` 50–99 / `***` 100–999 / `****` ≥1000).
- `src/species/url-state.ts` — round-trips `?fam=&subf=&tribe=&gen=&subg=&county=&ecor=&m0=&m1=` (params disjoint from the SPA's `?taxon=&taxonRank=` namespace).
- `src/lib/spa-link.ts` — new shared module exporting `buildSpaTaxonLink(name, rank='species')`. No imports from `src/filter.ts` so it can be imported from both `src/species/` (per ARCH-04) and `src/url-state.ts` (where the LINK-04 header doc lives).
- Coordinator wiring on the existing `<bee-species-page>`: parse URL on connect, propagate state changes to URL via push/replaceState, compute filtered counts centrally and pass `Map<scientificName, number>` to cards.
- `<bee-species-card>` gains a `filteredCount` `@property`, an in-card "N records" badge, mute-not-hide styling when `filteredCount === 0`, and a "View N occurrences →" button using `buildSpaTaxonLink()`.
- New Vitest suite: URL round-trip in `src/species/url-state.ts`, `buildSpaTaxonLink` round-trip against the SPA's `parseParams` (LINK-02), taxon-nav mute-not-hide rendering, filter empty-state, seasonality viz bar/fallback branches.

Out of scope for Phase 81: visual polish of the card itself (responsive grid, photo carousel, designed typography) — Phase 80 deferred those, but Phase 81's success criteria don't require them either, so they remain deferred. Performance/a11y hardening is Phase 82.

</domain>

<decisions>
## Implementation Decisions

### Filter → Count Compute
- **D-01 Coordinator computes; cards are dumb [LOCKED]** — `<bee-species-page>` watches its own filter state, reads `public/data/seasonality.json` once at startup into a module-level cache, and computes `Map<scientificName, number>` whenever filter state changes. Each `<bee-species-card>` receives only its `filteredCount` as a `@property`. Cards apply mute styling locally based on `filteredCount === 0` (presentation logic stays card-side; data logic stays coordinator-side). Matches the ARCH-03 state-ownership pattern carried forward from `<bee-atlas>`.

  Researcher should confirm: does Lit's `@property` diffing across 735 children with identical types cost more than expected? Anticipate yes-and-fine; if profiling shows otherwise, fall back to a `WeakMap` lookup the cards consult instead of prop-passing.

### Filter Combine Semantics (Geography × Month)
- **D-02 Union geo, then mask by month range [LOCKED]** — Per-card filtered count formula:

  ```
  county_vec[m]    = sum over selected counties C of seasonality[name]["county:" + C][m]
  ecoregion_vec[m] = sum over selected ecoregions E of seasonality[name]["ecoregion_l3:" + E][m]
  combined_vec[m]  = max(county_vec[m], ecoregion_vec[m])     // OR semantics, approx
  filtered_count   = sum over m in [m0, m1] of combined_vec[m]
  ```

  When no geo is selected, `combined_vec = seasonality[name]["_total"]`. When no month range is set, `[m0, m1] = [0, 11]`. The same `combined_vec` slice feeds `<seasonality-viz>` (D-04).

  **Known approximation:** `seasonality.json` does NOT carry crossed county×ecoregion slices, so the per-month `max()` is a deduplicating proxy for OR-across-overlapping-geos. A record in King county that also falls in Puget Lowland appears once in `county:King` and once in `ecoregion_l3:Strait of Georgia/Puget Lowland`; `max()` avoids double-counting in the common case but can still mis-count when both sets contribute non-trivially. Exact OR would require crossed slices from a Phase 78 pipeline change — explicitly deferred. Document the approximation in `src/species/url-state.ts` (or a sibling) so future readers don't try to "fix" it without understanding the trade.

### Filter Widget
- **D-03 `<details>`-popover checkbox list for county and ecoregion-l3 [LOCKED]** — Each multi-select is a `<details>` with a `<summary>County (3 selected) ▾</summary>` and a `<ul>` of `<input type="checkbox">` rows. Server-rendered with all options unchecked; Lit upgrade attaches `change` handlers that drive the URL/state. This:
  - Works with NO JS (`<details>` is browser-native; checkboxes submit via a wrapping `<form>` if we choose to support that, otherwise the no-JS interaction is just "summary toggles list" — the filter does nothing without JS, which is acceptable since cards already render unfiltered)
  - Scales to 39 counties without scroll-pain on desktop
  - Keyboard- and screen-reader-accessible by default (no custom focus management)
  - Matches the pnwmoths/`<details>` aesthetic NAV-05 already establishes
  - Mobile: stack the popovers vertically; tap to expand

  Month range uses two `<input type="number" min="1" max="12">` inputs (or a single dual-handle slider — planner picks; numerics are fine as a baseline).

### Seasonality Viz Slice Selection
- **D-04 Viz uses the same `combined_vec` from D-02 [LOCKED]** — `<seasonality-viz>` receives the resolved 12-vector as its `data` `@property`. The coordinator computes it per-card alongside `filteredCount` (single computation pass over `seasonality.json` for the active filter). When 0 geos are selected, the vector is `_total`. When `n = sum(vec) < 5`, the viz renders the text fallback per VIZ-02. The month-range filter is reflected in the count badge and breadcrumb, but the viz still draws all 12 months (months outside `[m0, m1]` are NOT dimmed in v1; revisit if user feedback demands it).

  **Per-card vs. shared viz:** each card has its own `<seasonality-viz>` because each species' vector is different. The 735 inline SVGs are tiny (≤12 rects + 12 axis labels each) — well within the page's content-visibility budget.

### `buildSpaTaxonLink` Location
- **D-05 New file `src/lib/spa-link.ts` [LOCKED]** — The helper lives in a new shared module that imports nothing from `src/filter.ts` or other forbidden ARCH-04 paths. Both `src/url-state.ts` (re-exports it for the SPA, and the LINK-04 header comment documenting the `taxon`+`taxonRank` contract lives at the top of `src/url-state.ts`) and `src/species/**.ts` import from it directly. This:
  - Keeps ARCH-04 clean (no `src/species/` → `src/url-state.ts` import that would transitively pull `src/filter.ts`)
  - Single source for the link-construction logic (LINK-01/02/03 all use it)
  - Matches the spirit of LINK-04 (the contract is documented at the SPA's URL-state entry point, even though the function body lives in `src/lib/`)

### URL State Round-Trip
- **D-06 New `src/species/url-state.ts`, disjoint from SPA's `src/url-state.ts` [LOCKED]** — The species page parses `?fam=&subf=&tribe=&gen=&subg=&county=&ecor=&m0=&m1=` into the coordinator's existing state shape (`_activeTaxonPath`, `_geoFilter`, `_seasonFilter` declared in Phase 80 D-07). Round-trip Vitest test asserts parse(build(state)) === state for representative inputs. The two `url-state.ts` files have NO shared code — they're two separate URL contracts living at two separate routes (`/` vs. `/species/`).

### Breadcrumb & Empty State
- **D-07 Breadcrumb pill row above the cards; "Clear filters" resets all params [LOCKED]** — Each active filter (taxon path, county, ecoregion, month range) renders as a dismissable pill. Click-to-dismiss removes only that filter. A "Clear filters" button resets everything to the empty URL. Empty state ("No species match these filters. [Clear filters]") renders when zero cards have nonzero filtered count — coordinator detects this via `Math.max(...filteredCount values) === 0`.

### Claude's Discretion
- Exact Lit template structure for each new component (planner picks — closest analogs are `src/bee-sidebar.ts` for chip UI and `src/bee-cluster-summary.ts` for compact card-style layouts; researcher should confirm)
- Whether the month-range UI is two `<input type="number">` boxes, a dual-handle slider, or a 12-checkbox month grid — pick the simplest that's accessible. Two number inputs is the baseline.
- How `_data/species.js` exposes the option lists for county and ecoregion-l3 — extend it to compute `Set<county>` and `Set<ecoregion_l3>` from `seasonality.json` keys, or hard-code from `counties.geojson` / `ecoregions.geojson`. Either works — pick what's already wired.
- Push vs. replace state on filter changes — `replaceState` for typing-flow filters (typeahead, slider drag), `pushState` for discrete actions (checkbox toggle, breadcrumb dismiss). Researcher proposes; planner locks.
- Exact CSS for `opacity: 0.35` muting — inline style vs. attribute selector vs. shadow part. Inline is simplest; planner picks.
- How `<bee-taxon-nav>` server-renders the tree (Eleventy/Nunjucks template generating nested `<details>`/`<ul>` from `_data/species.js` tree shape). The data shape already has `{ tree, flat, byScientificName }` per Phase 80; Phase 81 just consumes `tree`.
- Whether `_data/photos.js` needs any changes — probably not (photo data is per-species and orthogonal to filter state).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Specs and requirements
- `.planning/ROADMAP.md` (lines 589–598) — Phase 81 success criteria (5 items)
- `.planning/REQUIREMENTS.md` (lines 78–107) — NAV-01..05, FILT-01..07, VIZ-01..05, LINK-01..04 (verbatim contract)
- `.planning/seeds/species-tab.md` — original v3.2 scoping; BeeSearch reference for season-band tints + sample-size annotation
- `.planning/PROJECT.md` — milestone v3.2 framing
- `.planning/phases/080-page-scaffolding/080-CONTEXT.md` — Phase 80 decisions (D-05 light-DOM SSR, D-07 coordinator state shape) that Phase 81 builds on

### Upstream artifacts (now in `public/data/`)
- `public/data/species.json` — 735 species; carries `month_histogram[12]` (global), `county_count`, `ecoregion_count`, taxonomy fields. Drives the option lists and the nav tree shape.
- `public/data/seasonality.json` — 260 KB; keyed `<lower-scientific-name> → {_total | county:<Name> | ecoregion_l3:<Name>} → int[12]`. **Primary input for filtered-count compute (D-01) and seasonality viz slices (D-04).**
- `public/data/species-maps/<slug>.svg` — per-species SVG occurrence maps (Phase 78 output; Phase 80 already references them)
- `content/species-photos.toml` — photo manifest (Phase 79; Phase 80 already wired)

### Existing patterns to mirror
- `src/bee-atlas.ts` — ARCH-03 state-ownership coordinator; `<bee-species-page>` extends this pattern (D-01 compute model)
- `src/bee-sidebar.ts` — chip/pill UI close analog for the breadcrumb pill row (D-07)
- `src/bee-cluster-summary.ts` — compact Lit presenter pattern
- `src/url-state.ts` — SPA URL contract; LINK-04 header doc lives here. Phase 81's `src/species/url-state.ts` is a *separate* file with disjoint params.
- `_data/build.js` and the Phase 80 `_data/species.js` / `_data/photos.js` — `_data/*.js` build-time pattern for any added option-list computation
- `_layouts/default.njk` — provides `<bee-header>` chrome; Phase 81 doesn't change layout
- `src/tests/seed-species-photos.test.ts` and `src/tests/validate-species.test.ts` — Vitest source-analysis pattern (closest analog for any new arch-style assertions)

### Library locks
- `lit` — already in use; new presenters extend `LitElement`
- No chart library — VIZ-01 explicitly forbids
- No new runtime deps anticipated

### Forbidden imports under `src/species/**.ts` (ARCH-04, carried from Phase 80)
- `mapbox-gl`, `wa-sqlite`
- `../sqlite.ts`, `../filter.ts`, `../bee-map.ts`, `../bee-atlas.ts`, `../url-state.ts` (transitively pulls `../filter.ts`)
- New: `src/species/**` may import from `src/lib/spa-link.ts` (D-05) — this file must NOT import from `src/filter.ts` or anything that does.

### Pitfalls applicable to Phase 81
- `.planning/research/PITFALLS.md` Pitfall #7 — Single accidental import balloons the species chunk (mitigated by ARCH-04 test, extended to cover `src/lib/spa-link.ts` if needed)
- `.planning/research/PITFALLS.md` Pitfall #10 — Osmia/Andrena ~80-card subgenera (already mitigated by `content-visibility: auto`; per-card seasonality SVG is small enough not to regress this)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `<bee-species-page>` coordinator skeleton already declares `_activeTaxonPath`, `_geoFilter`, `_seasonFilter` (Phase 80 D-07) — Phase 81 wires URL parsing + event handlers onto these existing fields rather than introducing new ones.
- `<bee-species-card>` light-DOM skeleton already in place — Phase 81 adds `filteredCount` `@property`, badge slot, mute styling.
- `_data/species.js` already exposes `{ tree, flat, byScientificName }` — `<bee-taxon-nav>` consumes `tree`; the filter widget consumes option lists derivable from `flat` (or from `seasonality.json` keys).
- `src/url-state.ts` `parseParams` is the round-trip target for `buildSpaTaxonLink` (LINK-02). Lines 35–89 define the `taxon`+`taxonRank` contract.

### Established Patterns
- **State-ownership invariant (ARCH-03):** coordinator owns reactive state; presenters are dumb. D-01 makes this explicit for the filter-count flow.
- **Light-DOM Lit components (D-05 from Phase 80):** `<bee-taxon-nav>`, `<bee-species-filter>`, `<seasonality-viz>` all override `createRenderRoot() { return this }` and render into existing server-rendered DOM.
- **`<details>`-as-progressive-enhancement (NAV-05):** taxon nav and filter widgets both use this. No-JS users get a navigable but not-filterable page.

### Integration Points
- `src/entries/species.ts` — Vite side-effect entry. Phase 81 adds three more component imports here (`bee-taxon-nav`, `bee-species-filter`, `seasonality-viz`).
- `_pages/species.njk` — Eleventy template. Phase 81 adds the server-rendered taxon-nav `<details>`/`<ul>` (driven by `species.tree`), the filter `<bee-species-filter>` host element with empty checkbox lists pre-populated, and per-card placeholders for the count badge / "View N occurrences" button. `<seasonality-viz>` host element is rendered empty; Lit fills in on upgrade.
- `src/tests/arch.test.ts` (Phase 80) — extend its forbidden-import list if new `src/lib/` paths need protecting.
- New Vitest tests live in `src/tests/` alongside existing ones, named after the contract they cover (`species-url-state.test.ts`, `spa-link.test.ts`, `bee-taxon-nav.test.ts`, `seasonality-viz.test.ts`, `bee-species-filter.test.ts`).

</code_context>

<specifics>
## Specific Ideas

- **`seasonality.json` cache strategy:** load once via `fetch('/data/seasonality.json')` on `<bee-species-page>` connect; store in a module-level singleton; coordinator's filter-change handler reads from the singleton. Don't load it eagerly in `_data/*.js` (that would inline 260 KB into HTML).
- **Filtered-count recompute trigger:** the coordinator's `willUpdate(changedProps)` hook recomputes `Map<scientificName, number>` whenever `_activeTaxonPath`, `_geoFilter`, or `_seasonFilter` changes. Pass to cards via `@property` on `<bee-species-card>` (one prop per card; Lit handles the diff). With 735 cards × O(1) prop set, this is fine.
- **Pill row ordering:** taxon path first (Family → Subfamily → … → species), then county pills, then ecoregion pills, then month range pill. Each is dismissable; the dismiss icon is a button (a11y).
- **Empty state:** detect `Math.max(...counts.values()) === 0`; render a single `<div class="empty">No species match these filters. <button>Clear filters</button></div>` BELOW the breadcrumb pill row but above the (now all-muted) card list. Cards stay rendered (mute-not-hide); the empty-state div is additive.
- **Subgenus visibility (NAV-02):** during nav-tree render, walk children of each genus; only emit the subgenus level if `species.some(s => s.subgenus !== null)`.
- **`buildSpaTaxonLink('Andrena anograe')` return shape (LINK-01/02):** `/?taxon=Andrena%20anograe&taxonRank=species`. Round-trip test feeds the URL into `src/url-state.ts::parseParams(url.search)` and asserts `result.filter.taxonName === 'Andrena anograe' && result.filter.taxonRank === 'species'`.
- **Geo combine approximation (D-02) — disclosure in code:** add a comment in the count-compute function explaining the `max()` semantics so future readers don't refactor it into a sum that double-counts.

</specifics>

<deferred>
## Deferred Ideas

- **Crossed county×ecoregion seasonality slices** — would require Phase 78 pipeline changes to emit `county:X|ecoregion_l3:Y` keys in `seasonality.json`. Defer until user feedback shows the D-02 approximation is misleading. Future Phase 78 task.
- **Visual design pass for cards** (responsive grid, photo carousel, designed typography) — Phase 80 deferred this to "Phase 81 or a dedicated `/gsd-ui-phase 80` follow-up." Phase 81's roadmap success criteria don't actually mandate it, so it remains deferred. Suggest running `/gsd-ui-phase 81` if a styling pass is wanted alongside the new components.
- **Mobile/responsive nav rail** — Phase 81 ships left-rail at desktop widths and a stacked variant on mobile (the `<details>` filter widget already adapts). Real responsive design (drawer, collapsible rail with toggle) is a Phase 82 hardening concern.
- **Dimming out-of-month-range bars in `<seasonality-viz>`** (D-04) — current decision draws all 12 months always. Revisit if user testing shows the disconnect between viz and month filter is confusing.
- **Push-vs-replace URL state nuance** — exact policy is left to planner. Future improvement: a small history-state library for the species page if filter-change patterns get more complex.
- **`src/lib/spa-link.ts` as a broader shared utility** — for now it carries only `buildSpaTaxonLink`. If other cross-route helpers emerge (e.g., `buildSpaCountyLink`, `buildSpaTimeRangeLink`), consolidate them here.
- **Native `<form>` no-JS submission of filter state** — current decision: filter does nothing without JS, which is acceptable. If audience analytics show meaningful no-JS traffic, wrap the filter UI in `<form action="/species/" method="get">` so checkbox state submits as URL params.

</deferred>

---

*Phase: 081-filter-ux-nav*
*Context captured 2026-05-04 via /gsd-discuss-phase 81*
