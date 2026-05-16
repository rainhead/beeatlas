# Phase 94: Species & Genus Pages — Research

**Researched:** 2026-05-16
**Domain:** Eleventy 3.x pagination / Nunjucks templates / CSS / data pipeline
**Confidence:** HIGH

---

## Summary

Phase 94 adds two new static page types to the Eleventy build: one page per species
(`/species/{Genus}/{specificEpithet}/`) and one page per genus (`/species/{Genus}/`). The
data source is `public/data/species.json`, already produced by the pipeline and fetched by CI.
The photo manifest, SVG maps, and seasonality data needed by the templates are all available
at build time or as served static assets.

Eleventy 3.x pagination with `size: 1` and `alias` is the standard pattern for generating one
page per data item. Eleventy's pagination uses `lodashGet` to resolve `data:` paths, so
`species.speciesList` and `species.genusList` (dot-notation into the `_data/species.js`
default export) work correctly. The planner should add these two filtered/grouped arrays to
the default export of `_data/species.js`.

The color swatch computation for genus pages — matching the SVG hex colors produced by Phase
93's `_group_colors` — can be replicated exactly in JavaScript using the same HLS formula.
CSS `hsl(h, 70%, 50%)` produces the same RGB bytes as Python's `colorsys.hls_to_rgb`, so
either hex strings or CSS `hsl()` literals could be used. Precomputing hex in `species.js`
is recommended so the planner can expose testable, deterministic data rather than
rely on browser CSS evaluation.

**Primary recommendation:** Two new Nunjucks templates (`_pages/species-detail.njk`,
`_pages/genus.njk`) using Eleventy pagination over `species.speciesList` and
`species.genusList`; a new `_data/species.js` default-export extension (no named exports);
a new `src/entries/taxon-page.ts` entry that imports `src/index.css` and
`src/styles/taxon-pages.css`; and a new `src/styles/taxon-pages.css` layout file.

---

<user_constraints>
## User Constraints (from Phase 93 CONTEXT.md — D-01/D-02 carry into Phase 94)

### Locked Decisions (from Phase 93)
- **D-01:** Sort species alphabetically by `canonical_name` within each genus group; assign
  HSL hues `hue = i * 360 / n` (saturation 70%, lightness 50%). Deterministic across runs.
- **D-02:** The Eleventy template's species sort order on genus pages MUST use the same
  alphabetical `canonical_name` key as D-01 so color swatches in HTML match SVG dot colors.
- **D-03:** No SVG legend. Color swatches go in the HTML genus page species listing, not the
  SVG. (Phase 93 closed.)

### UI-SPEC Locked Decisions (from 94-UI-SPEC.md)
- Templates: `_pages/species-detail.njk` and `_pages/genus.njk`, both using `layout: default.njk`
- CSS: new `src/styles/taxon-pages.css` file
- No new LitElement components; reuse `<bee-header>`, `<seasonality-viz>` unchanged
- Photo lookup key: `photos[sp.scientificName]` (the `Record<scientificName, …>` already exposed
  by `_data/photos.js`)
- `<seasonality-viz>` data set via inline `<script>` using `document.getElementById` pattern
- First photo only (`photos[0]`) — no gallery in Phase 94
- Species with `occurrence_count === 0`: omit `<img>` for SVG map; still list on genus page
  with grey swatch (`#ccc`)

### Deferred Ideas (OUT OF SCOPE for Phase 94)
- Subgenus pages (Phase 95)
- Tribe pages (Phase 95)
- `/species/` index page replacement (Phase 96)
- Photo lightbox/zoom
- Real-time filter on taxon pages
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| URL-01 | Each species has a page at `/species/{Genus}/{specificEpithet}/` | Eleventy pagination permalink: `/species/{{ sp.slug }}/` where `sp.slug = "Agapostemon/femoratus"` — the slash in slug creates nested dirs |
| URL-02 | Each genus has a page at `/species/{Genus}/` | Eleventy pagination over `species.genusList`; permalink: `/species/{{ genus.genus }}/` |
| SPE-01 | Each species in the WA checklist has a dedicated static page | `species.speciesList` = `species.flat.filter(s => s.specific_epithet)` — 527 species confirmed |
| SPE-02 | Species page displays photo(s) from `content/species-photos.toml` | `photos[sp.scientificName]` lookup — key format and photo structure verified |
| SPE-03 | Species page displays static SVG occurrence map | `/data/species-maps/{{ sp.slug }}.svg` — confirmed file at `public/data/species-maps/Agapostemon/femoratus.svg` |
| SPE-04 | Species page displays seasonality visualization | Inline script pattern: `document.getElementById('sviz').data = {{ sp.month_histogram \| dump \| safe }}` |
| GEN-01 | Genus page lists all species with specimen counts | `genusList[i].species` sorted by `canonical_name`; each item has `occurrence_count` |
| GEN-02 | Genus page displays static multi-color SVG map | `/data/species-maps/genus/{{ genus.genus }}.svg` — confirmed at `public/data/species-maps/genus/Agapostemon.svg` |
| GEN-03 | Each species entry on genus page links to its species page | `<a href="/species/{{ sp.slug }}/">` |
| PIPE-01 | Eleventy generates one static page per species and genus | Eleventy `pagination: size: 1` over `species.speciesList` (527 pages) and `species.genusList` (42 pages). **Note:** PIPE-01 in REQUIREMENTS.md spans species + genus + subgenus + tribe; Phase 94 delivers only the species + genus portion. Subgenus + tribe pages are Phase 95 scope. |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-species static page generation | Frontend Server (Eleventy SSG) | — | Eleventy pagination over `species.speciesList`; pure static HTML output |
| Per-genus static page generation | Frontend Server (Eleventy SSG) | — | Eleventy pagination over `species.genusList`; pure static HTML output |
| Color swatch computation | Build-time JS (`_data/species.js`) | — | Precomputed at build; stored in `genusList[i].species[j].hexColor`; avoids runtime calculation |
| Photo display | Frontend Server (Eleventy SSG) | — | `photos[sp.scientificName]` resolved at build from `content/species-photos.toml` |
| SVG map display | CDN / Static | — | Files at `public/data/species-maps/` served as static assets; `<img>` tag references runtime URL |
| Seasonality chart | Browser / Client (LitElement) | — | `<seasonality-viz>` component with inline `<script>` to set `.data` property; component renders SVG in browser |
| CSS layout | Browser / Client | Build-time (Vite chunk) | `src/styles/taxon-pages.css` bundled into taxon-page Vite chunk; design tokens from `src/index.css` |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Eleventy | 3.1.5 [VERIFIED: node_modules] | Static site generation, pagination | Already in project; Eleventy 3.x `pagination` feature generates one page per data item |
| Nunjucks | bundled with Eleventy | Template language | Already used in `_pages/species.njk`; `dump`, `urlencode`, `safe` filters built-in |
| Vite (via eleventy-plugin-vite) | bundled | JS/CSS bundling, MPA mode | Already in project; MPA auto-discovers new `<script type="module">` entries |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@iarna/toml` | in use | TOML parsing in `_data/photos.js` | Already used; `photos` global available in templates — no new dependency |
| LitElement / `seasonality-viz` | in use | Seasonality chart rendering | Reused unchanged per UI-SPEC |

### No New Dependencies

Phase 94 introduces zero new npm packages. All required tooling is already installed.

---

## Architecture Patterns

### System Architecture Diagram

```
species.json (S3 → public/data/)
    │
    ▼
_data/species.js (build-time)
    ├─ flat: all 630 entries
    ├─ speciesList: flat.filter(specific_epithet != null)  ← NEW
    └─ genusList: [{genus, family, species[], totalOccurrences}]  ← NEW (with hexColor per species)
         │
         ├─────────────────────────────────┐
         ▼                                 ▼
_pages/species-detail.njk            _pages/genus.njk
(pagination over speciesList)        (pagination over genusList)
         │                                 │
         ▼                                 ▼
_site/species/{Genus}/{epithet}/     _site/species/{Genus}/
index.html                           index.html
    │                                     │
    ├─ photos[sp.scientificName]          ├─ genus SVG <img>
    │  (from _data/photos.js)            │  /data/species-maps/genus/{Genus}.svg
    ├─ species SVG <img>                  └─ species list with swatches + links
    │  /data/species-maps/{sp.slug}.svg
    └─ <seasonality-viz> + inline script
```

### Recommended Project Structure

New/modified files for Phase 94:

```
_data/
  species.js              # extend default export: add speciesList, genusList
_pages/
  species-detail.njk      # new: one page per species
  genus.njk               # new: one page per genus
src/
  entries/
    taxon-page.ts         # new: Vite entry importing index.css + taxon-pages.css + bee-header + seasonality-viz
  styles/
    taxon-pages.css       # new: layout rules for both page types
src/tests/
  data-species.test.ts    # extend: assert speciesList and genusList exports
  build-output.test.ts    # extend: assert sample taxon pages exist in _site/
```

### Pattern 1: Eleventy Pagination for Species Pages

**What:** One HTML page per species generated from `species.speciesList` using `size: 1`
**When to use:** Any dataset where each item needs its own URL

```njk
{# _pages/species-detail.njk #}
---
pagination:
  data: species.speciesList
  size: 1
  alias: sp
permalink: "/species/{{ sp.slug }}/"
eleventyComputed:
  title: "{{ sp.scientificName }} — BeeAtlas"
layout: default.njk
---
{# template body #}
```

[VERIFIED: Eleventy Pagination.js uses `lodashGet(target, key)` where key = "species.speciesList",
confirmed dot-notation support. Source: node_modules/@11ty/eleventy/src/Plugins/Pagination.js line 123]

**Critical**: `sp.slug` = `"Agapostemon/femoratus"` — the slash IS the path separator; Eleventy
outputs this as `_site/species/Agapostemon/femoratus/index.html`. Confirmed by slug format in
`public/data/species.json` post Phase 92.

### Pattern 2: Genus Grouping in `_data/species.js`

**What:** Extend the default export with `speciesList` and `genusList` arrays
**When to use:** Whenever a `_data/*.js` file needs new exports for Eleventy pagination

**CRITICAL CONSTRAINT:** `_data/species.js` MUST export only a default export (no named
exports). Eleventy 3.x auto-unwraps the `default` export only when there are no named exports.
Adding named exports would expose the module namespace object instead, breaking all existing
template data access. [VERIFIED: photos.js comment lines 15-17 documents this behavior.]

```javascript
// In _data/species.js default export object (add alongside tree, flat, byScientificName):

// Filter to actual species (excludes genus-level records)
const speciesList = flat.filter(s => s.specific_epithet !== null);

// Build genus groupings with HSL colors matching Phase 93 D-01
function hslToHex(h, s, l) {
  // CSS HSL formula — verified to match Python colorsys.hls_to_rgb output exactly
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2*l - 1)) * s;
  const x = c * (1 - Math.abs((h/60) % 2 - 1));
  const m = l - c/2;
  let r=0, g=0, b=0;
  if (h < 60)       { r=c; g=x; b=0; }
  else if (h < 120) { r=x; g=c; b=0; }
  else if (h < 180) { r=0; g=c; b=x; }
  else if (h < 240) { r=0; g=x; b=c; }
  else if (h < 300) { r=x; g=0; b=c; }
  else              { r=c; g=0; b=x; }
  const toHex = n => Math.round((n+m)*255).toString(16).padStart(2,'0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const genusMap = {};
for (const sp of speciesList) {
  if (!genusMap[sp.genus]) genusMap[sp.genus] = { genus: sp.genus, family: sp.family, subfamily: sp.subfamily, species: [] };
  genusMap[sp.genus].species.push(sp);
}
const genusList = Object.values(genusMap)
  .sort((a, b) => a.genus.localeCompare(b.genus))
  .map(g => {
    // D-01: sort alphabetically by canonical_name (lowercase), assign hues
    const sorted = g.species.slice().sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
    const n = sorted.length;
    const speciesWithColors = sorted.map((sp, i) => ({
      ...sp,
      hexColor: sp.occurrence_count > 0
        ? hslToHex(i * 360 / n, 70, 50)
        : '#cccccc'
    }));
    return {
      ...g,
      species: speciesWithColors,
      speciesCount: sorted.length,
      totalOccurrences: sorted.reduce((acc, sp) => acc + sp.occurrence_count, 0),
    };
  });

export default { tree, flat, byScientificName, counties, ecoregionL3, speciesList, genusList };
```

[VERIFIED: `hslToHex` output matches Python `colorsys.hls_to_rgb` for hue=0 (rgb 217,38,38),
hue=120 (rgb 38,217,38), hue=240 (rgb 38,38,217) — tested via node inline script in this session]

### Pattern 3: Seasonality Viz on Standalone Static Pages

**What:** Pass `month_histogram` from build-time data to LitElement `<seasonality-viz>`
**When to use:** Any static page that embeds `<seasonality-viz>` without the coordinator

The existing `/species/` all-cards page uses `bee-species-page.ts` coordinator which sets
`viz.data` at runtime after loading `seasonality.json`. The new standalone pages bypass the
coordinator entirely — pass data directly via inline script.

```html
<seasonality-viz id="sviz-{{ sp.slug | replace("/", "-") }}"></seasonality-viz>
<script>
  document.getElementById('sviz-{{ sp.slug | replace("/", "-") }}').data =
    {{ sp.month_histogram | dump | safe }};
</script>
```

[VERIFIED: `SeasonalityViz.data` is a `@property({ attribute: false }) data: number[]`
that accepts an array directly. Source: `src/species/seasonality-viz.ts` line ~28]

[VERIFIED: Nunjucks `dump` filter = `JSON.stringify` (nunjucks/src/filters.js),
`safe` = no escaping, `urlencode` = built-in Nunjucks URL encoder (nunjucks/src/filters.js)]

### Pattern 4: Vite MPA Entry for Taxon Pages

**What:** New `src/entries/taxon-page.ts` side-effect entry that Vite discovers via the
`<script type="module">` tag in each taxon template
**When to use:** Any new Eleventy page type needing its own JS/CSS chunk

```typescript
// src/entries/taxon-page.ts
import '../index.css';          // CSS custom properties (--header-bg, --text-muted, etc.)
import '../styles/taxon-pages.css';  // layout rules
import '../bee-header.ts';      // bee-header custom element
import '../species/seasonality-viz.ts';  // seasonality-viz custom element
```

Templates reference: `<script type="module" src="/src/entries/taxon-page.ts">`

Vite MPA mode auto-discovers this entry from the `<script type="module">` tag and emits a
separate chunk (e.g., `_site/assets/taxon-page/index-*.js`). The CSS is included in that
chunk or emitted as a separate `taxon-page/index-*.css` file.

[VERIFIED: existing `src/entries/bee-header.ts` and `src/entries/species.ts` follow this
exact pattern; `src/entries/species.ts` imports species.css as a side-effect]

**IMPORTANT — validate-bundle-size.mjs scope:** The existing bundle-size gate only checks
the `species` chunk (100 KB gzipped budget). It does NOT currently check the `taxon-page`
chunk. The planner should note: taxon-page.ts imports are a strict subset of species.ts
imports (no `bee-species-page.ts`, no `bee-species-card.ts`, no `bee-taxon-nav.ts`, no
`bee-species-filter.ts`), so the taxon-page chunk will be significantly smaller. No budget
extension is strictly required, but the planner may choose to add a check.

### Pattern 5: `eleventyComputed` for Dynamic Page Title

**What:** Dynamic `<title>` tag per paginated page
**When to use:** Any Eleventy pagination template that needs per-page `<title>`

```yaml
# In front matter YAML:
eleventyComputed:
  title: "{{ sp.scientificName }} — BeeAtlas"
```

[VERIFIED: Eleventy data-computed.md shows `eleventyComputed` with Nunjucks template syntax
works in YAML front matter. `title` is available to `base.njk` via data cascade.]

### Anti-Patterns to Avoid

- **Named exports in `_data/*.js`:** Adding `export const genusList = ...` instead of
  putting it in the `default` export object. Eleventy unwraps `default` ONLY when no named
  exports exist; named exports make templates see the module namespace, not the data.
  [VERIFIED: `_data/photos.js` comment lines 15-17 documents this explicitly]

- **Using `pagination.filter` to exclude genus-level entries:** Eleventy's `filter` option
  only excludes exact values from the iteration set; it does not support predicate functions.
  The correct approach is to pre-filter in `species.js` as `speciesList`.

- **Using `<link rel="stylesheet" href="/src/index.css">` in each template:** While this
  works, using a Vite entry (`taxon-page.ts` importing `index.css`) is the project pattern;
  Vite then injects a `<link>` in the final HTML correctly. Direct `<link>` references in
  Nunjucks templates are also acceptable for this project (see index.html pattern).

- **Sharing the species entry point:** Do NOT add taxon page components to
  `src/entries/species.ts`. The `bee-species-page.ts` coordinator would be loaded on taxon
  pages unnecessarily and the validate-bundle-size gate would flag it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| One page per species | Custom file-writing script | Eleventy `pagination: size: 1` | Built-in, handles permalinks, layout inheritance, and data cascade |
| HSL to hex conversion | Custom implementation | Standard CSS HSL formula (verified) | Simple formula, exact match to Python colorsys confirmed |
| Photo lookup | Custom TOML reader | `_data/photos.js` already exposes `photos` global | Already wired into Eleventy data cascade |
| Nunjucks `urlencode`, `dump`, `safe` | Custom Nunjucks filters | Built-in Nunjucks filters | Already available in Eleventy/Nunjucks without registration |

---

## Common Pitfalls

### Pitfall 1: Named Exports Break Eleventy Data Cascade
**What goes wrong:** Adding `export const genusList = [...]` as a named export from
`_data/species.js` causes Eleventy to expose the entire module namespace as `species`
in templates, hiding the data behind `species.default`. All existing template references
(`species.flat`, `species.tree`) break silently.
**Why it happens:** Eleventy 3.x auto-unwraps `default` only when there are NO named exports.
**How to avoid:** Add `genusList` and `speciesList` as keys in the existing default export
object — `export default { tree, flat, ..., speciesList, genusList }`.
**Warning signs:** Nunjucks errors like "TypeError: Cannot read properties of undefined
reading 'length'" on `species.flat.length`.

### Pitfall 2: `eleventyComputed` vs Static Front-Matter `title`
**What goes wrong:** Using `title: "{{ sp.scientificName }} — BeeAtlas"` as a plain YAML
string (not under `eleventyComputed`). Eleventy does not evaluate Nunjucks in plain YAML
front matter values — the literal string `{{ sp.scientificName }} — BeeAtlas` appears in
the `<title>` tag.
**How to avoid:** Use `eleventyComputed: { title: "{{ sp.scientificName }} — BeeAtlas" }`.
**Warning signs:** The built `<title>` contains literal `{{` braces.

### Pitfall 3: `<seasonality-viz>` Element ID Uniqueness
**What goes wrong:** If multiple `<seasonality-viz>` elements exist on a page (they don't
in Phase 94 since each page has exactly one), using `id="sviz"` for all would cause
`document.getElementById` to pick the first. In Phase 94 this is not an issue since each
static page has exactly one seasonality viz.
**How to avoid:** Use a stable unique id per page — `id="sviz"` is sufficient for Phase 94.

### Pitfall 4: `occurrence_count === 0` for Species SVG Map
**What goes wrong:** Rendering `<img src="/data/species-maps/Andrena/knuthiana.svg">` when
that species has `occurrence_count === 0` — no SVG file exists for zero-occurrence species.
**How to avoid:** Per UI-SPEC: only render `<img>` when `occurrence_count > 0`. The Nunjucks
condition: `{% if sp.occurrence_count > 0 %}`.

### Pitfall 5: `sp.slug` Slash in Nunjucks Permalink
**What goes wrong:** Assuming the slug needs URL-encoding or path manipulation. The slash in
`"Agapostemon/femoratus"` is intentional — Eleventy interprets it as nested directory output.
**How to avoid:** Use `permalink: "/species/{{ sp.slug }}/"` directly. No filters needed.
**Confirmed:** Phase 92 migration set `slug = "Agapostemon/femoratus"` format explicitly for
this purpose.

### Pitfall 6: `taxon-page.ts` entry vs `species.ts` entry
**What goes wrong:** Adding `import '../species/seasonality-viz.ts'` to an entry that also
imports heavy SPA modules (bee-species-page, bee-species-card, etc.) for the new taxon pages.
**How to avoid:** Create a lean new entry `src/entries/taxon-page.ts` with ONLY what taxon
pages need: `index.css`, `taxon-pages.css`, `bee-header.ts`, `seasonality-viz.ts`.

### Pitfall 7: Genus Page URL Collision with Species Pages
**What goes wrong:** The genus page at `/species/Agapostemon/` could be confused with the
species page directory `/species/Agapostemon/femoratus/`. In Eleventy these are distinct
output files: `_site/species/Agapostemon/index.html` and
`_site/species/Agapostemon/femoratus/index.html`.
**Why it's not an issue:** Eleventy pagination generates independent files; directory listing
is not served by static hosting. The paths are structurally compatible.

---

## Code Examples

### Verified Eleventy Pagination Template (Nunjucks)

```njk
{# _pages/species-detail.njk #}
---
pagination:
  data: species.speciesList
  size: 1
  alias: sp
permalink: "/species/{{ sp.slug }}/"
eleventyComputed:
  title: "{{ sp.scientificName }} — BeeAtlas"
layout: default.njk
---
<link rel="stylesheet" href="/src/index.css">
<link rel="stylesheet" href="/src/styles/taxon-pages.css">

<nav class="breadcrumb">
  {{ sp.family }} /
  <a href="/species/{{ sp.genus }}/">{{ sp.genus }}</a> /
  {{ sp.specific_epithet }}
</nav>

<h1><em>{{ sp.scientificName }}</em></h1>

{%- set photoEntry = photos[sp.scientificName] -%}
{%- if photoEntry and photoEntry.photos and photoEntry.photos.length > 0 -%}
  {%- set p = photoEntry.photos[0] -%}
  <img loading="lazy" src="{{ p.src or p.url }}" alt="{{ p.caption or sp.scientificName }}">
  <p class="attribution">{{ p.attribution }}</p>
{%- else -%}
  <div class="photo-placeholder">No photo available</div>
{%- endif -%}

{%- if sp.occurrence_count > 0 -%}
  <img loading="lazy"
       src="/data/species-maps/{{ sp.slug }}.svg"
       alt="Occurrence map for {{ sp.scientificName }}"
       style="aspect-ratio: 15/8; width: 100%; max-width: 600px;">
{%- endif -%}

<seasonality-viz id="sviz"></seasonality-viz>
<script>
  document.getElementById('sviz').data = {{ sp.month_histogram | dump | safe }};
</script>

<p class="metadata">{{ sp.occurrence_count }} records · {{ sp.county_count }} counties · {{ sp.ecoregion_count }} ecoregions</p>
<a href="/?taxon={{ sp.scientificName | urlencode }}&amp;taxonRank=species">View {{ sp.occurrence_count }} occurrences on the atlas →</a>

<script type="module" src="/src/entries/taxon-page.ts"></script>
```

[Source: Pattern verified from `_pages/species.njk` existing template; `photos` global,
`dump`, `urlencode`, `safe` all verified in-session]

### Genus Page with Color Swatches

```njk
{# _pages/genus.njk — species list with swatches #}
<ul class="species-list">
{%- for sp in genus.species -%}
  <li>
    <span class="swatch" style="background: {{ sp.hexColor }};"></span>
    <a href="/species/{{ sp.slug }}/"><em>{{ sp.scientificName }}</em></a>
    <span class="count">{{ sp.occurrence_count }} records</span>
  </li>
{%- endfor -%}
</ul>
```

[Source: UI-SPEC genus species list pattern; hexColor precomputed in genusList]

---

## Key Data Shape Findings

### `species.json` Entry Shapes

**Species entry** (527 total, `specific_epithet` is non-null):
```json
{
  "canonical_name": "agapostemon femoratus",
  "county_count": 10,
  "ecoregion_count": 3,
  "family": "Halictidae",
  "genus": "Agapostemon",
  "month_histogram": [0, 0, 0, 4, 18, 7, 33, 14, 5, 10, 0, 0],
  "occurrence_count": 91,
  "scientificName": "Agapostemon femoratus",
  "slug": "Agapostemon/femoratus",
  "specific_epithet": "femoratus",
  "subfamily": "Halictinae",
  "subgenus": "Agapostemon",
  "tribe": "Halictini"
}
```

**Genus-level entry** (103 total, `specific_epithet` is null — these are records identified
only to genus, NOT genus summary rows):
```json
{
  "canonical_name": "agapostemon",
  "genus": "Agapostemon",
  "occurrence_count": 18,
  "scientificName": "agapostemon",
  "slug": "Agapostemon",
  "specific_epithet": null
}
```

The `occurrence_count` in genus-level entries represents records identified only to genus
(not summed species counts). See Open Question 1 (RESOLVED below) for the Phase 94 decision
on how these entries factor into `totalOccurrences`.

**Unique genera from species entries:** 42 genera → 42 genus pages.
**Species entries:** 527 → 527 species pages.

### `_data/photos.js` Key Format

The `photos` global is keyed by `scientificName` exactly as stored in `species.json`. The
lookup `photos[sp.scientificName]` works for both capitalized (`"Agapostemon femoratus"`) and
lowercase (`"agapostemon subtilior"`) entries — the TOML keys match the `scientificName` values
exactly after Phase 92 migration. [VERIFIED: tested 5 entries in-session, all resolved correctly]

### SVG Map File Paths

[VERIFIED: directory listing in-session after Phase 93 pipeline run]

| URL | Disk path |
|-----|-----------|
| `/data/species-maps/Agapostemon/femoratus.svg` | `public/data/species-maps/Agapostemon/femoratus.svg` |
| `/data/species-maps/genus/Agapostemon.svg` | `public/data/species-maps/genus/Agapostemon.svg` |
| `/data/species-maps/subgenus/Agapostemon/{Subgenus}.svg` | `public/data/species-maps/subgenus/Agapostemon/...` |
| `/data/species-maps/tribe/{Tribe}.svg` | `public/data/species-maps/tribe/...` |

Phase 94 uses only species maps and genus maps. Subgenus and tribe maps are for Phase 95.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 94 is a code/template/data change with no new external tools.
All dependencies are in-repo (Node.js, Eleventy, Vite) or already fetched by CI
(species.json from S3). No new CLI tools, databases, or services required.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (bundled in project) |
| Config file | `vite.config.ts` (`test:` section) |
| Quick run command | `npm test` |
| Full suite command | `npm test` (same — no slow subset currently) |
| Build test guard | `VITEST_SKIP_BUILD=1 npm test` skips `build-output.test.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PIPE-01 | `species.speciesList` and `species.genusList` exports exist and have correct shape | unit | `npm test -- src/tests/data-species.test.ts` | ❌ Wave 0 extension |
| PIPE-01 | `_site/species/Agapostemon/femoratus/index.html` exists post-build | build | `npm test` (build-output.test.ts) | ❌ Wave 0 extension |
| PIPE-01 | `_site/species/Agapostemon/index.html` exists post-build | build | `npm test` (build-output.test.ts) | ❌ Wave 0 extension |
| SPE-02 | Photo lookup pattern: `photos[sp.scientificName]` works for all 527 species | unit | `npm test -- src/tests/data-species.test.ts` | ❌ Wave 0 |
| GEN-01 | genusList speciesCount + totalOccurrences match expected values for Agapostemon | unit | `npm test -- src/tests/data-species.test.ts` | ❌ Wave 0 |
| GEN-02/D-01 | Color for Agapostemon femoratus (first alphabetically in genus) = `#d92626` (hue=0) | unit | `npm test -- src/tests/data-species.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test` (fast, < 30s without build gate)
- **Per wave merge:** `npm run build` (includes typecheck + eleventy + validate-bundle-size)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/tests/data-species.test.ts` — extend with `speciesList`, `genusList`, `hexColor` assertions
- [ ] `src/tests/build-output.test.ts` — extend with taxon page existence assertions
- [ ] `src/entries/taxon-page.ts` — new entry (no tests needed, but must exist before Vite can discover it)
- [ ] `src/styles/taxon-pages.css` — new file (referenced by entry)

---

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json`. Applying standard
check.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Static pages, no auth |
| V3 Session Management | No | No sessions |
| V4 Access Control | No | Public content |
| V5 Input Validation | No | All data is build-time; no user input on these pages |
| V6 Cryptography | No | No crypto |

These are fully static HTML pages with no user input, no server processing, no auth. The
only client-side JS is LitElement custom element registration and an inline script that
writes to `<seasonality-viz>.data`. No XSS surface: the inline script uses
`{{ sp.month_histogram | dump | safe }}` where `month_histogram` is a controlled array of
integers from the pipeline-produced `species.json`. No string interpolation of user-supplied
data.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Adding `genusList` and `speciesList` to the default export object does NOT require updating `data-species.test.ts` to pass (only extending it) | Validation | Low — existing test only checks `flat`, `byScientificName`, `tree` presence; it does not assert the export has NO other keys |
| A2 | `eleventyComputed.title` with Nunjucks syntax resolves the `sp` pagination alias correctly | Pattern 5 | Medium — if the alias is not in scope for eleventyComputed, title would render literally. Fall back: use JavaScript function `(data) => data.sp.scientificName + " — BeeAtlas"` |
| A3 | The `<link rel="stylesheet" href="/src/index.css">` approach (direct in template) is acceptable as an alternative to the Vite entry approach | Pattern 4 | Low — either works; Vite entry is the project standard but direct link is simpler |
| A4 | The `validate-bundle-size.mjs` script only checks the `species` chunk; a new `taxon-page` chunk will not trigger its budget check | Common Pitfalls | Low — confirmed by reading the script; the taxon-page chunk should be much smaller than the species chunk anyway |

**If A2 is wrong:** Use JavaScript-style computed data in front matter YAML using a function
body instead of template string. Eleventy supports both.

---

## Open Questions

1. **Genus page `totalOccurrences` — include genus-level records? (RESOLVED)**
   - What we know: `species.json` has 103 genus-level entries (records identified only to
     genus). Agapostemon genus-level entry has `occurrence_count: 18`. The 3 Agapostemon
     species sum to 185 occurrences. Total = 203 or 185 depending on interpretation.
   - **RESOLVED:** Use species-only sum for `totalOccurrences`. Genus-level records
     (`specific_epithet: null`) are excluded so the genus page total stays consistent with
     the sum of its species page counts. Rationale: the species page occurrence_count column
     reflects species-level counts; the genus subheading must agree with the sum a user sees
     by adding up the species rows below it. The 18 genus-only Agapostemon records remain
     accessible via the atlas filter but are not counted in `genus.totalOccurrences`.
   - **Implemented in:** Plan 01 Task 1 `<behavior>` (`totalOccurrences = species-only sum`)
     and PATTERNS.md `_data/species.js` excerpt
     (`sorted.reduce((acc, sp) => acc + sp.occurrence_count, 0)` over the species-only list).

2. **`eleventyComputed` title with Nunjucks alias scope**
   - What we know: The pattern works per Eleventy docs; `sp` is the pagination alias.
   - What's unclear: Whether `eleventyComputed` template strings have access to `sp` before
     the alias is set in the front matter.
   - Recommendation: Test with a simple build; fall back to a JS function if needed:
     `eleventyComputed: { title: (data) => data.sp.scientificName + ' — BeeAtlas' }`

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Old flat slug `andrena-milwaukeensis` | Hierarchical `Andrena/milwaukeensis` | Phase 92 (2026-05-15) | Species SVG paths and permalink patterns use hierarchical format |
| No per-taxon pages | Static pages via Eleventy pagination | Phase 94 (this phase) | Species and genus pages generated at build time |

---

## Sources

### Primary (HIGH confidence)

- `node_modules/@11ty/eleventy/src/Plugins/Pagination.js` — confirmed `lodashGet` dot-notation
  support for `pagination.data` values
- `_data/species.js`, `_data/photos.js`, `_pages/species.njk` — verified existing patterns
- `public/data/species.json` — verified field shapes, species/genus entry distinction, slug
  format, 527 species + 42 genera confirmed
- `content/species-photos.toml` / `_data/photos.js` — verified key format and lookup behavior
- `data/species_maps.py` `_group_colors()` — verified Python HLS formula
- `node_modules/nunjucks/src/filters.js` — confirmed `dump`, `urlencode`, `safe` built-in
- `eleventy.config.js`, `vite.config.ts` — verified MPA mode, passthrough copy, dir config
- `src/species/seasonality-viz.ts` — verified `data` property interface
- `src/entries/species.ts` — verified Vite entry pattern (CSS side-effect import)
- `scripts/validate-bundle-size.mjs` — confirmed only checks `species` chunk, not `taxon-page`
- `.github/workflows/*.yml` — confirmed CI fetches only `species.json` + `seasonality.json`
- `_layouts/base.njk`, `_layouts/default.njk` — verified layout chain, no global CSS injection

### Secondary (MEDIUM confidence)

- Context7 `/11ty/11ty-website` — confirmed pagination `size: 1`, `alias`, permalink patterns,
  `eleventyComputed` dynamic title approach
- `_data/photos.js` comment — confirmed named-export prohibition rule

### Tertiary (LOW confidence)

- None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies verified in project
- Architecture: HIGH — all patterns verified against existing codebase
- Pitfalls: HIGH — most derived from reading actual source code (photos.js comment,
  Pagination.js lodashGet usage)
- Color algorithm: HIGH — verified Python/JS equivalence numerically

**Research date:** 2026-05-16
**Valid until:** 2026-06-16 (stable Eleventy 3.x APIs, 30-day window)
