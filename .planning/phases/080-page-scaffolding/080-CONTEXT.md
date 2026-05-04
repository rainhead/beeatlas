# Phase 80: Page Scaffolding — Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Source:** /gsd-discuss-phase 80

<domain>
## Phase Boundary

A static `/species/` page renders one server-rendered `<bee-species-card>` per species (skeleton content, no visual polish), shipped in its own Vite chunk that does NOT pull `mapbox-gl` or `wa-sqlite`. An `ARCH-04` source-analysis test enforces the chunk boundary. The page consumes the Phase 79 photo manifest (`content/species-photos.toml`) and the Phase 78 species feed (`public/data/species.json` + `public/data/species-maps/<slug>.svg`).

Phase 80 is a **scaffolding** phase — the page wires data and architecture, defers visual design and interaction. Filter UX, taxon nav, seasonality viz rendering, and SPA-deep-link refinement (`LINK-*`, `NAV-*`, `FILT-*`, `VIZ-*`) are Phase 81; hardening is Phase 82.

Specifically, Phase 80 ships:
- `_pages/species.njk` (`layout: default.njk`, `permalink: /species/index.html`) — Eleventy template emitting one card per species via Nunjucks loop
- `_data/species.js` — reads `public/data/species.json` (NOT parquet; Pitfall #8) and exposes `{ tree, flat, byScientificName }`
- `_data/photos.js` — reads `content/species-photos.toml` via `@iarna/toml`, sorts photos by `ordering`, exposes `Record<scientificName, { description, photos[] }>`
- `src/entries/species.ts` — Vite side-effect entry that imports `bee-header` plus the two new components below
- `src/species/bee-species-page.ts` — coordinator (skeleton; declares state properties with empty defaults; no event wiring yet)
- `src/species/bee-species-card.ts` — light-DOM card (skeleton; `createRenderRoot()` returns `this`; no `render()` method)
- `src/tests/arch.test.ts` — new file enforcing ARCH-04 (no `src/species/**.ts` imports `mapbox-gl`, `wa-sqlite`, `../sqlite.ts`, `../filter.ts`, `../bee-map.ts`, `../bee-atlas.ts`)
- Build chain extension producing a separate `_site/assets/species-*.js` chunk distinct from the SPA's `index-*.js`

Three of the five presenter components named in PAGE-06 (`bee-taxon-nav`, `bee-species-grid`, `bee-species-filter`, `seasonality-viz`) are deferred to Phase 81 when their interactive surfaces land.

</domain>

<decisions>
## Implementation Decisions

### Initial Render Shape
- **D-01 Flat alphabetical list of all species [LOCKED]** — `/species/` server-renders one card per species in the `public/data/species.json` array (currently ~735, including ~179 checklist-only species without occurrences), sorted alphabetically by `scientificName`. No grouping, no section headers, no JS-driven default filtering. `content-visibility: auto` on each card (PAGE-07) handles the long-scroll perf budget. Phase 81 layers the taxon-nav and filter UI on top of the same flat DOM (showing/hiding cards via CSS or property bindings).

### Card Content Depth
- **D-02 Skeleton card; visual design deferred [LOCKED]** — Phase 80 cards wire data into slots without a styling pass. Each card renders, in light DOM:
  - `scientificName` as a heading
  - **Photo slot:** the first photo by `ordering` (only one photo in skeleton, not a carousel) as `<img loading="lazy">`. **If the species has zero photos, the photo slot is omitted entirely** — no placeholder, no "no photo" string. Card heights vary.
  - **Map slot:** `<img src="/data/species-maps/{slug}.svg" loading="lazy" alt="Occurrence map for {scientificName}">`. **If the SVG file does not exist** (checklist-only species, `occurrence_count == 0`), the map slot is omitted entirely. `_data/species.js` decides whether to emit the `<img>` based on `occurrence_count > 0`.
  - **Description:** the `description` field from photos.toml as plain text. Currently empty for nearly all species (TOML seeded with empty strings); cards render an empty/zero-height block until humans hand-edit. Plain text only — no Markdown rendering, no innerHTML (consistent with PHOTO-03's posture toward attribution).
  - **Attribution:** photo attribution string from photos.toml rendered verbatim adjacent to the photo (PHOTO-03 contract preserved).
  - **SPA deep-link:** an "Open in atlas" `<a>` pointing to `/?taxon=<scientificName>` — reuses the existing `src/url-state.ts` URL contract.

  Visual polish (responsive grid, designed typography, photo carousel, attribution chrome) is deferred to a later UI pass — not Phase 80.

### SVG Embedding & Empty States
- **D-03 `<img>` reference, not inline SVG [LOCKED]** — Map renders as `<img src="/data/species-maps/{slug}.svg" loading="lazy">`. Inline SVG is rejected for Phase 80: heavier HTML, `loading="lazy"` doesn't apply, no interaction need yet. Phase 81/82 may revisit if county-highlight or filter-driven recoloring is wanted.
- **D-04 Skip the slot when data is missing [LOCKED]** — Same rule for both the photo slot (zero photos in TOML) and the map slot (no SVG file): emit nothing. No placeholders, no CTA links, no visual consistency hacks. Card heights vary by data presence.

### Light-DOM SSR + Hydration Mechanics
- **D-05 `createRenderRoot()` returns `this`; no `render()` override [LOCKED]** — `<bee-species-card>` (and `<bee-species-page>`) extend `LitElement` and override `createRenderRoot() { return this }` so Lit treats the host element as its render root. Neither class defines a `render()` method in Phase 80. The component markup is whatever Eleventy/Nunjucks emitted into the page — Lit upgrade attaches `@property` reactivity and (in Phase 81) event handlers without re-rendering. This eliminates SSR/CSR markup-mismatch risk.

  Researcher should confirm exact Lit semantics and document whether `@customElement` registration is sufficient or whether the class needs an explicit `connectedCallback()` shim. Pure `@property` declarations + `createRenderRoot` is the principle; mechanics are Claude's discretion.

### Phase 80 Component Scope
- **D-06 Ship `bee-species-page` + `bee-species-card` only [LOCKED]** — The remaining three presenters named in PAGE-06 (`bee-taxon-nav`, `bee-species-grid`, `bee-species-filter`, `seasonality-viz`) are NOT created in Phase 80. They land in Phase 81 when their interactive UIs are designed and built. ARCH-04 still passes (no forbidden imports anywhere under `src/species/`).
- **D-07 Coordinator declares state properties with empty defaults [LOCKED]** — `<bee-species-page>` declares `_activeTaxonPath: string[] = []`, `_geoFilter: GeoFilter | null = null`, `_seasonFilter: SeasonFilter | null = null`, plus URL-state hooks (no parsing logic yet — empty defaults only). Phase 81 wires events and URL parsing onto these existing fields rather than introducing them. Mirrors the v1.9 `<bee-atlas>` ARCH-03 pattern (PAGE-05).

### Claude's Discretion
- Exact Nunjucks template structure in `_pages/species.njk` (single loop vs. macro-per-card) — planner picks
- Precise type definitions for `GeoFilter` and `SeasonFilter` placeholder types — researcher proposes; planner locks
- Whether `_data/species.js` reads `species.json` synchronously at build time or via `fs/promises` — either works; Eleventy supports both
- Whether the "Open in atlas" link is a plain `<a href>` or wrapped in any custom element behavior — plain `<a>` is simpler; pick based on consistency with how the SPA's existing nav handles deep links
- Test layout for the new arch test (whether `src/tests/arch.test.ts` reads files via `readFileSync` like the validate-species pattern, or uses `import` graph analysis) — researcher picks; existing `src/tests/seed-species-photos.test.ts` and `src/tests/validate-species.test.ts` are the closest analogs
- Vite chunk-splitting tactics (named entry vs. dynamic import boundary) — planner picks; PAGE-09 only requires the resulting chunk be distinct
- Whether attribution and the SPA link live inside a designated slot or as direct card children — pick whichever makes Phase 81's styling pass simplest
- Description handling in `_data/photos.js` (trim whitespace, default to empty string, etc.) — pick the cleanest

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Specs and requirements
- `.planning/ROADMAP.md` — Phase 80 success criteria (5 items) and dependency on Phase 79
- `.planning/REQUIREMENTS.md` — PAGE-01..PAGE-09 (verbatim contract); ARCH-04 invariant
- `.planning/seeds/species-tab.md` — original v3.2 scoping (taxonomy primary: Ecdysis; photos via TOML manifest; static SVG maps; no headless browser)
- `.planning/PROJECT.md` — milestone v3.2 framing; v3.1 multi-entry pattern reference

### Upstream artifacts (Phase 78 + Phase 79 outputs)
- `public/data/species.json` — primary data source for `_data/species.js`. Schema includes `scientificName`, `slug`, `canonical_name`, `family`, `genus`, `subgenus`, `tribe`, `subfamily`, `occurrence_count`, `month_histogram`, etc. (Phase 78 contract)
- `public/data/species-maps/<slug>.svg` — per-species SVG maps; **NOTE: directory is currently empty (0 SVGs)** — verify Phase 78 SVG generation has run before Phase 80 references them. Slug column in species.json drives the filename.
- `content/species-photos.toml` — photo manifest produced by Phase 79 seed; ~735 species tables, license-whitelisted; many empty `[[photos]]` arrays; all `description` fields empty
- `.planning/phases/078-pipeline-outputs/078-CONTEXT.md` — species.json schema decisions, SVG-byte-stability decision, slug provenance
- `.planning/phases/079-photo-manifest/079-CONTEXT.md` — photo manifest schema, license whitelist, attribution rendering rules

### Existing patterns to mirror
- `_layouts/default.njk` + `_layouts/base.njk` — two-layer Nunjucks chain; `<bee-header>` lives in `default.njk` via Vite side-effect entry. Species page declares `layout: default.njk` and gets the chrome for free.
- `src/entries/bee-header.ts` — single-line side-effect Vite entry pattern. `src/entries/species.ts` follows the same shape.
- `src/bee-atlas.ts` (state-ownership invariant ARCH-03) — Lit coordinator owns reactive state; presenters receive via `@property` + emit `CustomEvent`. `<bee-species-page>` mirrors this for the species page (PAGE-05/06).
- `src/tests/seed-species-photos.test.ts` and `src/tests/validate-species.test.ts` — Vitest source-analysis pattern (`readFileSync` against repo files); the new `src/tests/arch.test.ts` follows this shape.
- `_data/build.js` — `_data/*.js` build-time data pattern; `_data/species.js` and `_data/photos.js` follow it.
- `src/url-state.ts` — existing SPA URL-state contract; `?taxon=<scientificName>` is the deep-link target for D-02's "Open in atlas" link.

### Library locks
- `@iarna/toml` — already a Phase 79 dependency; `_data/photos.js` reads via this library
- `lit` — already in use; `<bee-species-page>` and `<bee-species-card>` extend `LitElement`
- `@11ty/eleventy-plugin-vite` — handles the multi-entry chunk-splitting required for PAGE-09

### Forbidden imports under `src/species/**.ts` (ARCH-04)
- `mapbox-gl` — would balloon the species chunk from ~50 KB to ~2 MB (PITFALLS #7)
- `wa-sqlite` — same rationale; species page does no client-side SQL
- `../sqlite.ts`, `../filter.ts`, `../bee-map.ts`, `../bee-atlas.ts` — pull mapbox-gl/wa-sqlite transitively

### Pitfalls applicable to Phase 80
- `.planning/research/PITFALLS.md` Pitfall #1 — Photo manifest drift (Phase 79 fill-only policy mitigates, but Phase 80 should not assume every photo URL still resolves)
- `.planning/research/PITFALLS.md` Pitfall #7 — Single accidental import balloons the species chunk (mitigated by ARCH-04 test, PAGE-08)
- `.planning/research/PITFALLS.md` Pitfall #8 — `_data/species.js` reading parquet would kill HMR (locked: read JSON, not parquet — PAGE-02)
- `.planning/research/PITFALLS.md` Pitfall #10 — Osmia/Andrena ~80-card subgenera (mitigated by `content-visibility: auto`, PAGE-07)
- `.planning/research/PITFALLS.md` Pitfall #11 — SVG visual identity for sparse species (Phase 78 concern; Phase 80 just renders the SVG as authored)

### Downstream consumers (forthcoming)
- Phase 81 — adds `bee-taxon-nav`, `bee-species-grid`, `bee-species-filter`, `seasonality-viz`; wires URL parsing into the state properties Phase 80 declared (D-07); adds LINK-*/NAV-*/FILT-*/VIZ-* features
- Phase 82 — hardening pass; may revisit inline-SVG decision (D-03) if interaction surfaces require it

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_layouts/default.njk` — provides `<bee-header>` chrome automatically. Species page just declares `layout: default.njk` in front-matter.
- `src/entries/bee-header.ts` — exact pattern for `src/entries/species.ts` (one-line side-effect import).
- `_data/build.js` — `_data/*.js` build-time data pattern; copy the structure for `_data/species.js` and `_data/photos.js`.
- `src/url-state.ts` — existing `?taxon=` URL contract; the species card's deep-link reuses it without modification.
- `src/index.css` `:root` design tokens (`--text-body`, `--surface`, etc.) — even though Phase 80 defers visual polish, any minimal styling should reach for these tokens.

### Established Patterns
- **State-ownership invariant (ARCH-03):** `<bee-atlas>` owns all reactive state; `<bee-map>` and `<bee-sidebar>` are pure presenters. `<bee-species-page>` extends this pattern to the species page (PAGE-05/06).
- **Light-DOM Lit components in Eleventy pages:** `<bee-header>` already follows this — Eleventy emits the tag, side-effect Vite entry registers the class, browser upgrades on connection. Card and page coordinator follow the same model with the additional `createRenderRoot() { return this }` override (D-05).
- **Build-chain gates:** `validate-schema.mjs` then `validate-species.mjs` then `tsc --noEmit` then `eleventy`. Phase 80 may need to extend this if a new validator is warranted (planner decides — current state of `species.json` and `species-photos.toml` is already validated upstream).

### Integration Points
- `eleventy.config.js` already passes `src/` and `public/` through correctly. No changes expected.
- `vite.config.ts` already excludes `wa-sqlite` from `optimizeDeps`. The new `src/entries/species.ts` MPA entry is auto-discovered by `appType: "mpa"` if `_pages/species.njk` references it via `<script type="module" src="/src/entries/species.ts">` (PAGE-04).
- `src/tests/arch.test.ts` is a new file; pattern mirrors `src/tests/seed-species-photos.test.ts` and `src/tests/validate-species.test.ts` (Vitest + `readFileSync`).
- `package.json` build chain — extend if a new validate step is needed; otherwise unchanged.

</code_context>

<specifics>
## Specific Ideas

- **State observation — verify before planning:** `public/data/species-maps/` directory is currently empty (0 SVGs) despite Phase 78's `D-04 wipe-and-rewrite each run` policy. The pipeline has not run recently; SVGs need regeneration before Phase 80 references them. Add a precondition to research: "Run `cd data && python run.py` (or just the SVG step) and confirm `public/data/species-maps/*.svg` populates with one file per `slug` in `species.json` where `occurrence_count > 0`."
- ~735 total species, ~556 occurrence-bearing, ~179 checklist-only (per 078-CONTEXT.md and 079-CONTEXT.md). Skeleton card with ~one photo + map img + small text per card → roughly 100KB of HTML for the full page; well within budget for content-visibility-deferred render.
- "Open in atlas" link target: `/?taxon=<scientificName>` (D-02). The SPA's `src/url-state.ts` parses this into the existing taxon filter; no SPA changes needed for Phase 80.
- Photo attribution rendered verbatim, never `innerHTML` (PHOTO-03 contract from Phase 79). Same rule extends to description text in Phase 80 — plain text only, no Markdown rendering, no `innerHTML`.
- `<bee-species-page>` skeleton state shape (D-07): `_activeTaxonPath: string[] = []`, `_geoFilter: GeoFilter | null = null`, `_seasonFilter: SeasonFilter | null = null`. Researcher proposes precise types for `GeoFilter` and `SeasonFilter`; planner locks them.

</specifics>

<deferred>
## Deferred Ideas

- **Visual design pass for cards** (responsive grid, photo carousel, designed typography, attribution chrome, link-to-SPA button styling) — out of scope for Phase 80; belongs in Phase 81 alongside the filter/nav UI design or a dedicated `/gsd-ui-phase 80` follow-up.
- **Photo carousel / multiple photos per card** — Phase 80 ships first photo only. The TOML may carry up to 3 photos per species; rendering all of them as a carousel is a Phase 81 feature.
- **Empty-state placeholders** ("no photo yet", "iNat add-a-photo CTA") — explicitly rejected for Phase 80 (D-04). Revisit if user testing shows the variable card heights are jarring.
- **Inline SVG with interactive county/ecoregion highlighting** — rejected for Phase 80 (D-03). Revisit in Phase 82 hardening if filter-driven map recoloring is wanted.
- **Description Markdown rendering** — currently descriptions are plain text. If hand-authored descriptions later want bold/italic/links, introduce a Markdown step in `_data/photos.js` (e.g., `marked` with sanitization). Defer until at least one description exists that needs it.
- **Scaffolding the three deferred presenter components** (`bee-taxon-nav`, `bee-species-grid`, `bee-species-filter`, `seasonality-viz`) as empty stubs in Phase 80 — explicitly rejected (D-06); Phase 81 introduces them when their UIs are designed.
- **Description authoring workflow / preview mode** — separate concern from Phase 80 page scaffolding; volunteer-authoring tooling is post-v3.2.

</deferred>

---

*Phase: 080-page-scaffolding*
*Context captured 2026-05-04 via /gsd-discuss-phase 80*
