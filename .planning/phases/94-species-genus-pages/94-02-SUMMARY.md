---
phase: 94-species-genus-pages
plan: "02"
subsystem: frontend
tags: [eleventy, nunjucks, pagination, species, genus, css, vite]

# Dependency graph
requires:
  - phase: 94-species-genus-pages
    plan: "01"
    provides: "speciesList (527 entries) and genusList (42 genus groups with hexColor per species) on the _data/species.js default export"
  - phase: 93-multi-color-svg-map-generation
    provides: "D-01/D-02 alphabetical canonical_name sort order and HSL color formula for genus SVG maps"
provides:
  - "_pages/species-detail.njk: Eleventy pagination template at /species/{Genus}/{epithet}/ for 527 species pages"
  - "_pages/genus.njk: Eleventy pagination template at /species/{Genus}/ for 42 genus pages"
  - "src/styles/taxon-pages.css: CSS layout for both page types (.taxon-page, .breadcrumb, .swatch, .species-list, .photo-placeholder, @media grid)"
  - "src/entries/taxon-page.ts: Lean Vite MPA entry (4 imports: index.css, taxon-pages.css, bee-header.ts, seasonality-viz.ts)"
affects: [94-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Eleventy pagination size:1 over Eleventy global data (species.speciesList / species.genusList) via dot-notation lodashGet path"
    - "eleventyComputed.title YAML form confirmed working for per-page dynamic <title> (Assumption A2 resolved: YAML form works)"
    - "Vite MPA entry auto-discovery via <script type=module> in Nunjucks templates — no vite.config.ts changes needed"
    - "Seasonality viz data injection via inline <script> + document.getElementById (bypasses coordinator; data from build-time month_histogram)"
    - "public/data symlink workaround for Eleventy dry-run in worktree (gitignored; worktree-local artifact)"

key-files:
  created:
    - "src/styles/taxon-pages.css"
    - "src/entries/taxon-page.ts"
    - "_pages/species-detail.njk"
    - "_pages/genus.njk"
  modified: []

key-decisions:
  - "eleventyComputed YAML form confirmed: YAML form with Nunjucks template string works; the sp/genus pagination alias is in scope for eleventyComputed values (Assumption A2 verified)"
  - "Attribution placed after media-grid closing tag per plan order; photo variable re-set in second conditional block (Nunjucks does not retain set from inside a block outside it)"
  - "Species-detail photo block uses set within the media-grid conditional; attribution uses a second conditional block outside media-grid — this is necessary because Nunjucks set scoping"
  - "T-94-04 grep for 'token' matched 'tokens' in CSS comment (design tokens reference) — false positive, not a security issue"

requirements-completed:
  - URL-01
  - URL-02
  - SPE-01
  - SPE-02
  - SPE-03
  - SPE-04
  - GEN-01
  - GEN-02
  - GEN-03

# Metrics
duration: 4min
completed: 2026-05-16
---

# Phase 94 Plan 02: Taxon Page Templates Summary

**Four new files (two Nunjucks templates, one CSS layout, one Vite entry) that enable Eleventy to generate 527 species pages and 42 genus pages at build time**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-16T02:01:40Z
- **Completed:** 2026-05-16T02:06:25Z
- **Tasks:** 3
- **Files created:** 4
- **Files modified:** 0

## Accomplishments

### src/styles/taxon-pages.css
Layout file for both page types. Key CSS classes:
- `.taxon-page` — max-width 1100px, centered, 1rem padding
- `.taxon-page > img:first-of-type, .taxon-page .photo-hero` — 4:3 aspect ratio, max 360px, object-fit contain
- `.taxon-page img[src*="/species-maps/"]` — 15:8 aspect ratio, max 600px
- `.taxon-page .attribution`, `.taxon-page .metadata` — 0.75rem/0.85rem muted text
- `.breadcrumb` — 0.85rem muted; `.breadcrumb a` links with `--link` color
- `.swatch` — 12×12px inline-block color swatch with 2px border-radius
- `.species-list li` — flex row with `margin-left: auto` for right-aligned count
- `.photo-placeholder` — centered italic placeholder, same 4:3 aspect as photo
- `@media (min-width: 768px) .taxon-page .media-grid` — 2-column 1fr/1fr grid, 1.5rem gap
- All color values use `var(--token, fallback)` from `src/index.css`

### src/entries/taxon-page.ts
Lean Vite MPA entry with exactly 4 side-effect imports:
1. `'../index.css'` — design tokens
2. `'../styles/taxon-pages.css'` — taxon page layout
3. `'../bee-header.ts'` — bee-header custom element
4. `'../species/seasonality-viz.ts'` — seasonality chart custom element

Deliberately omits `bee-species-page`, `bee-species-card`, `bee-taxon-nav`, `bee-species-filter` (all from the heavier `species.ts` entry). Result: taxon-page chunk is significantly smaller than the species chunk.

### _pages/species-detail.njk
Eleventy pagination template for 527 per-species pages:
- **Front matter:** `pagination: { data: species.speciesList, size: 1, alias: sp }`, `permalink: "/species/{{ sp.slug }}/"`, `eleventyComputed: { title: "{{ sp.scientificName }} — BeeAtlas" }`, `layout: default.njk`
- **Breadcrumb:** Family (plain) / linked Genus / epithet (plain)
- **Photo block:** `photos[sp.scientificName]` lookup; first photo only; falls back to `.photo-placeholder` with "No photo available"
- **SVG map:** Conditional on `sp.occurrence_count > 0`; no placeholder when absent
- **Seasonality:** `<seasonality-viz id="sviz">` with inline `<script>` injecting `sp.month_histogram | dump | safe`
- **Metadata row:** `{N} records · {N} counties · {N} ecoregions` (exact UI-SPEC copy)
- **Atlas link:** `View {N} occurrences on the atlas →` per UI-SPEC copywriting contract
- **Vite entry:** `<script type="module" src="/src/entries/taxon-page.ts">` after closing `</article>`

### _pages/genus.njk
Eleventy pagination template for 42 per-genus pages:
- **Front matter:** `pagination: { data: species.genusList, size: 1, alias: genus }`, `permalink: "/species/{{ genus.genus }}/"`, `eleventyComputed: { title: "{{ genus.genus }} — BeeAtlas" }`, `layout: default.njk`
- **Breadcrumb:** Family / Genus (both plain text; family link deferred Phase 96)
- **Subheading:** `{speciesCount} species · {totalOccurrences} records`
- **Genus SVG map:** `/data/species-maps/genus/{{ genus.genus }}.svg` (no guard — genus always has species)
- **Species list:** `<ul class="species-list">` with hex swatch + linked scientific name + record count; sorted by Phase 01's alphabetical `canonical_name` order which matches D-01/D-02 SVG color assignment
- **No seasonality-viz** (per-species chart only)

## Task Commits

1. **Task 1: CSS layout + Vite entry** — `4076863`
2. **Task 2: species-detail.njk template** — `6eac840`
3. **Task 3: genus.njk template** — `a1fce0b`

## Decisions Made

- **eleventyComputed YAML form confirmed (Assumption A2 RESOLVED):** The YAML form `eleventyComputed: { title: "{{ sp.scientificName }} — BeeAtlas" }` resolves the pagination alias correctly. No fallback to JS function form needed.
- **srcset intentionally omitted** from photo `<img>` per plan note — Phase 94 uses `src="{{ p.src or p.url }}"` only. Phase 95 can reintroduce srcset.
- **Attribution conditional** uses a second set block outside the media-grid because Nunjucks `set` inside an `if` block is accessible after the block closes (Nunjucks scoping is hoisted). The same `photoEntry` variable set inside the media-grid conditional is accessible in the attribution block.

## Deviations from Plan

None — plan executed exactly as written. The `public/data` symlink is a worktree-local artifact (gitignored in main repo) required for Eleventy dry-run to access `species.json`.

## Known Stubs

None — all four files are complete implementations with no placeholder data or TODO markers.

## Threat Flags

No new security-relevant surface beyond what the plan's threat model documents:
- T-94-01, T-94-02, T-94-03 mitigations implemented as specified
- T-94-04 grep for `process.env|secret|token` matched "tokens" in a CSS comment about design tokens — false positive, not a security concern

## Self-Check

Files created:
- `src/styles/taxon-pages.css`: YES
- `src/entries/taxon-page.ts`: YES
- `_pages/species-detail.njk`: YES
- `_pages/genus.njk`: YES

Commits:
- `4076863` (Task 1): YES
- `6eac840` (Task 2): YES
- `a1fce0b` (Task 3): YES

`tsc --noEmit`: PASS
`npx @11ty/eleventy --dryrun --quiet`: PASS (exit 0)

## Self-Check: PASSED
