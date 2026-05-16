# Phase 94: Species & Genus Pages — Pattern Map

**Mapped:** 2026-05-15
**Files analyzed:** 7 (5 new, 2 extended)
**Analogs found:** 7 / 7

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `_pages/species-detail.njk` | template | request-response (SSG) | `_pages/species.njk` | role-match |
| `_pages/genus.njk` | template | request-response (SSG) | `_pages/species.njk` | role-match |
| `src/styles/taxon-pages.css` | config/style | transform | `src/styles/species.css` | exact |
| `src/entries/taxon-page.ts` | config/entry | transform | `src/entries/species.ts` | exact |
| `_data/species.js` | service | CRUD/transform | self (extend) | exact |
| `src/tests/data-species.test.ts` | test | request-response | self (extend) | exact |
| `src/tests/build-output.test.ts` | test | request-response | self (extend) | exact |

---

## Pattern Assignments

### `_pages/species-detail.njk` (template, SSG)

**Analog:** `_pages/species.njk`

**Front matter / pagination pattern** (`_pages/species.njk` lines 1–5 + RESEARCH.md Pattern 1):
```njk
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
```
Note: `layout: default.njk` inherits `<bee-header>` and the `<main>` wrapper. The `{{ title or "BeeAtlas" }}` in `_layouts/base.njk` line 5 picks up `eleventyComputed.title`.

**Photo lookup pattern** (`_pages/species.njk` lines 32–39):
```njk
{%- set photoEntry = photos[sp.scientificName] -%}
{%- if photoEntry and photoEntry.photos and photoEntry.photos.length > 0 -%}
  {%- set p = photoEntry.photos[0] -%}
  <img loading="lazy"
       src="{{ p.src or p.url }}"
       {%- if p.srcset %} srcset="{{ p.srcset }}" sizes="(min-width: 768px) 500px, 100vw"{% endif %}
       alt="{{ p.caption or sp.scientificName }}">
  <p class="attribution">{{ p.attribution }}</p>
{%- endif -%}
```
Phase 94 uses only `photos[0]` (no gallery). The `p.src or p.url` fallback is critical — `_data/photos.js` derives `src` via `deriveSrcset`, but `src` may be empty for some entries; `p.url` is the raw TOML value.

**SVG map conditional render** (`_pages/species.njk` lines 41–43):
```njk
{%- if sp.occurrence_count > 0 -%}
  <img loading="lazy" src="/data/species-maps/{{ sp.slug }}.svg" alt="Occurrence map for {{ sp.scientificName }}">
{%- endif -%}
```
Species-detail adds CSS sizing inline per UI-SPEC: `style="aspect-ratio: 15/8; width: 100%; max-width: 600px;"`.

**Atlas deep-link pattern** (`_pages/species.njk` line 49):
```njk
<a class="spa-link" href="/?taxon={{ sp.scientificName | urlencode }}&amp;taxonRank=species">View {{ sp.occurrence_count }} occurrences →</a>
```
Phase 94 changes copy to "View {N} occurrences on the atlas →" per UI-SPEC Copywriting Contract.

**Seasonality viz inline-script pattern** (RESEARCH.md Pattern 3, verified against `src/species/seasonality-viz.ts` line 39 — `@property({ attribute: false }) data: number[]`):
```njk
<seasonality-viz id="sviz"></seasonality-viz>
<script>
  document.getElementById('sviz').data = {{ sp.month_histogram | dump | safe }};
</script>
```
`dump` = `JSON.stringify`, `safe` = no escaping. Both are built-in Nunjucks filters (verified in `node_modules/nunjucks/src/filters.js`).

**Vite entry script tag** (`_pages/species.njk` line 53 — adapted):
```njk
<script type="module" src="/src/entries/taxon-page.ts"></script>
```
Do NOT reuse `/src/entries/species.ts` — that entry imports `bee-species-page.ts` and heavy SPA modules.

---

### `_pages/genus.njk` (template, SSG)

**Analog:** `_pages/species.njk`

**Front matter / pagination pattern** (RESEARCH.md Pattern 1 — genus variant):
```njk
---
pagination:
  data: species.genusList
  size: 1
  alias: genus
permalink: "/species/{{ genus.genus }}/"
eleventyComputed:
  title: "{{ genus.genus }} — BeeAtlas"
layout: default.njk
---
```

**Genus SVG map** (no occurrence guard — genus always has at least one species):
```njk
<img loading="lazy"
     src="/data/species-maps/genus/{{ genus.genus }}.svg"
     alt="Occurrence map for genus {{ genus.genus }}"
     style="aspect-ratio: 15/8; width: 100%;">
```

**Species list with color swatches** (RESEARCH.md Code Examples — genus page):
```njk
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
`genus.species` is pre-sorted alphabetically by `canonical_name` in `_data/species.js` — matches D-01/D-02 color assignment order.

**Vite entry script tag** (same as species-detail):
```njk
<script type="module" src="/src/entries/taxon-page.ts"></script>
```

---

### `src/styles/taxon-pages.css` (style, transform)

**Analog:** `src/styles/species.css`

**File header comment pattern** (`src/styles/species.css` lines 1–5):
```css
/* Phase 94: layout for /species/{Genus}/{epithet}/ and /species/{Genus}/ pages.
 * Extends species.css conventions; light-DOM patterns not needed here (no
 * custom elements wrapping the page body). Design tokens from src/index.css.
 */
```

**Page container pattern** (`src/styles/species.css` lines 7–13):
```css
.taxon-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1rem;
  box-sizing: border-box;
}
```
UI-SPEC specifies `max-width: 1100px` (vs species.css's `1400px` — the species list page has a sidebar nav that needs the extra width).

**Photo hero sizing** (`src/styles/species.css` lines 95–103):
```css
/* First <img> child — photo hero. Reserve 4:3 box. */
.taxon-page > img:first-of-type,
.taxon-page .photo-hero {
  aspect-ratio: 4 / 3;
  max-height: 360px;
  width: 100%;
  object-fit: contain;
  background: #f5f5f5;
}
```

**SVG map sizing** (`src/styles/species.css` lines 105–109):
```css
.taxon-page img[src*="/species-maps/"] {
  aspect-ratio: 15 / 8;
  width: 100%;
  max-width: 600px;
}
```

**Attribution text** (`src/styles/species.css` lines 112–116):
```css
.taxon-page .attribution {
  font-size: 0.75rem;
  color: #666;  /* --text-muted */
  margin: 0.25rem 0 0.5rem;
}
```

**Desktop two-column breakpoint** (`src/styles/species.css` lines 142–148 — adapted):
```css
@media (min-width: 768px) {
  .taxon-page .media-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    align-items: start;
  }
}
```

**Swatch pattern** (UI-SPEC Interaction Contract, no existing analog — new rule):
```css
.swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 2px;
  vertical-align: middle;
  margin-right: 4px;
}
```

**Breadcrumb pattern** (new rule, no existing analog):
```css
.breadcrumb {
  font-size: 0.85rem;
  color: #666;
  margin-bottom: 0.5rem;
}
.breadcrumb a {
  color: #646cff;  /* --link */
}
.breadcrumb .sep {
  padding: 0 4px;
}
```

**Photo placeholder** (UI-SPEC Photo Display section):
```css
.photo-placeholder {
  aspect-ratio: 4 / 3;
  max-height: 360px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  color: #767676;
  font-style: italic;
  font-size: 0.85rem;
}
```

---

### `src/entries/taxon-page.ts` (Vite entry, transform)

**Analog:** `src/entries/species.ts`

**Full file pattern** (`src/entries/species.ts` lines 1–22 — adapted to taxon subset):
```typescript
// Vite Rollup entry for Eleventy-rendered taxon pages — see
// _pages/species-detail.njk and _pages/genus.njk.
// Side-effect imports trigger @customElement(...) registration.
// Plugin-vite MPA mode auto-discovers this entry from the pages'
// <script type="module"> tag and emits a separate taxon-page chunk.
// No vite.config.ts changes required.
//
// Imports are a strict subset of species.ts (no bee-species-page,
// bee-species-card, bee-taxon-nav, bee-species-filter) so the
// taxon-page chunk is much smaller than the species chunk.
import '../index.css';
import '../styles/taxon-pages.css';
import '../bee-header.ts';
import '../species/seasonality-viz.ts';
```

Note: `src/entries/bee-header.ts` (lines 1–4) shows the minimal single-import pattern. `src/entries/species.ts` shows the multi-import pattern with CSS side-effect as the first import. Follow the CSS-first ordering from `species.ts`.

---

### `_data/species.js` (extend — service, CRUD/transform)

**Analog:** self

**Current export shape** (`_data/species.js` line 76):
```javascript
export default { tree, flat, byScientificName, counties, ecoregionL3 };
```

**CRITICAL CONSTRAINT** (`_data/photos.js` comment lines 15–16):
> Default-export ONLY: Eleventy 3 auto-unwraps the default export of an `_data/*.js` file iff the module has no other named exports. Adding a named export here would cause Eleventy to expose the module namespace to templates, hiding the data table behind `photos.default`.

New additions go into the existing default export object only:
```javascript
export default { tree, flat, byScientificName, counties, ecoregionL3, speciesList, genusList };
```

**`speciesList` derivation pattern** (RESEARCH.md Pattern 2):
```javascript
// Filter to actual species entries (excludes genus-level records where specific_epithet is null)
const speciesList = flat.filter(s => s.specific_epithet !== null);
```

**`genusList` computation + `hslToHex` helper** (RESEARCH.md Pattern 2 — full excerpt, verified):
```javascript
function hslToHex(h, s, l) {
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
  if (!genusMap[sp.genus]) {
    genusMap[sp.genus] = { genus: sp.genus, family: sp.family, subfamily: sp.subfamily, species: [] };
  }
  genusMap[sp.genus].species.push(sp);
}
const genusList = Object.values(genusMap)
  .sort((a, b) => a.genus.localeCompare(b.genus))
  .map(g => {
    // D-01/D-02: sort alphabetically by canonical_name — matches SVG color assignment order
    const sorted = g.species.slice().sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
    const n = sorted.length;
    const speciesWithColors = sorted.map((sp, i) => ({
      ...sp,
      hexColor: sp.occurrence_count > 0 ? hslToHex(i * 360 / n, 70, 50) : '#cccccc',
    }));
    return {
      ...g,
      species: speciesWithColors,
      speciesCount: sorted.length,
      totalOccurrences: sorted.reduce((acc, sp) => acc + sp.occurrence_count, 0),
    };
  });
```

**Placement in file:** Add `hslToHex`, `speciesList`, `genusMap`, and `genusList` after the existing `tree` computation (after line 74), before the `export default` line.

---

### `src/tests/data-species.test.ts` (extend — test)

**Analog:** self (current file: lines 1–32)

**Existing test structure** (`src/tests/data-species.test.ts` lines 1–32):
```typescript
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
import species from '../../_data/species.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('_data/species.js (PAGE-02)', () => {
  test('exports { tree, flat, byScientificName }', () => { ... });
  test('flat is sorted alphabetically by scientificName (D-01)', () => { ... });
  test('does NOT read parquet (Pitfall #8)', () => { ... });
});
```

**New tests to add** (extend the existing `describe` block, matching Vitest idiom):
```typescript
  test('exports speciesList (only entries with specific_epithet)', () => {
    const list = (species as any).speciesList;
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(500); // 527 confirmed
    expect(list.every((s: any) => s.specific_epithet !== null)).toBe(true);
  });

  test('exports genusList with speciesCount and totalOccurrences', () => {
    const list = (species as any).genusList;
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0); // 42 genera
    const agapostemon = list.find((g: any) => g.genus === 'Agapostemon');
    expect(agapostemon).toBeDefined();
    expect(typeof agapostemon.speciesCount).toBe('number');
    expect(typeof agapostemon.totalOccurrences).toBe('number');
  });

  test('genusList species sorted alphabetically by canonical_name (D-02)', () => {
    const list = (species as any).genusList;
    const agapostemon = list.find((g: any) => g.genus === 'Agapostemon');
    const names = agapostemon.species.map((s: any) => s.canonical_name);
    const sorted = [...names].sort((a: string, b: string) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  test('first Agapostemon species has hexColor #d92626 (hue=0, D-01)', () => {
    const list = (species as any).genusList;
    const agapostemon = list.find((g: any) => g.genus === 'Agapostemon');
    // First species alphabetically = hue 0 → #d92626 (verified numerically in RESEARCH.md)
    expect(agapostemon.species[0].hexColor).toBe('#d92626');
  });

  test('zero-occurrence species gets grey swatch #cccccc', () => {
    const list = (species as any).genusList;
    for (const g of list) {
      for (const sp of g.species) {
        if (sp.occurrence_count === 0) {
          expect(sp.hexColor).toBe('#cccccc');
        }
      }
    }
  });
```

---

### `src/tests/build-output.test.ts` (extend — test)

**Analog:** self (current file: lines 1–63)

**Existing `findSpeciesChunk` helper and test structure** (lines 38–63) — copy the chunk-finding helper pattern for a new `findTaxonChunk` helper following the same flat/nested logic.

**New tests to add** (extend the existing `describe.skipIf(SKIP_BUILD)` block):
```typescript
  test('emits _site/species/Agapostemon/femoratus/index.html (SPE-01, URL-01)', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/Agapostemon/femoratus/index.html'), 'utf-8'
    );
    expect(html).toContain('Agapostemon femoratus');
    expect(html).toContain('<seasonality-viz');
    expect(html).toContain('/data/species-maps/Agapostemon/femoratus.svg');
    expect(html).toContain('View 91 occurrences on the atlas');
  });

  test('emits _site/species/Agapostemon/index.html genus page (GEN-01, URL-02)', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/Agapostemon/index.html'), 'utf-8'
    );
    expect(html).toContain('<em>Agapostemon</em>');
    expect(html).toContain('species-list');
  });

  test('emits a taxon-page chunk distinct from species chunk (Pattern 4)', () => {
    const assetsDir = resolve(ROOT, '_site/assets');
    // Check both flat and nested Rollup layouts (same pattern as findSpeciesChunk)
    const flatTaxon = readdirSync(assetsDir).filter(f => /^taxon-page-.*\.js$/.test(f));
    const hasFlatTaxon = flatTaxon.length > 0;
    let hasNestedTaxon = false;
    try {
      const nestedDir = resolve(assetsDir, 'taxon-page');
      hasNestedTaxon = readdirSync(nestedDir).some(f => /\.js$/.test(f));
    } catch { /* directory absent */ }
    expect(hasFlatTaxon || hasNestedTaxon, 'no taxon-page chunk emitted').toBe(true);
  });
```

---

## Shared Patterns

### Design Token Source
**Source:** `src/index.css` lines 1–46
**Apply to:** `src/styles/taxon-pages.css` (via `taxon-page.ts` import chain)

Key tokens used in Phase 94:
- `--text-muted: #666` — breadcrumb, attribution, record count badges
- `--text-hint: #767676` — photo placeholder text
- `--surface-subtle: #f5f5f5` — photo placeholder background
- `--border: #ddd` — card border
- `--link: #646cff` — breadcrumb ancestor links, atlas deep-link
- `--link-hover: #535bf2` — link hover

Do NOT redeclare these values in `taxon-pages.css`; reference the custom properties.

### `loading="lazy"` on All `<img>` Tags
**Source:** `_pages/species.njk` lines 35, 42 and `build-output.test.ts` test at line 26
**Apply to:** All `<img>` tags in `_pages/species-detail.njk` and `_pages/genus.njk`

The build-output test at line 26 asserts every `<img>` on `species/index.html` has `loading="lazy"`. That test only covers `species/index.html`, but follow the same discipline on new templates.

### Default Export Only Rule for `_data/*.js`
**Source:** `_data/photos.js` comment lines 15–16; `_data/species.js` line 76
**Apply to:** `_data/species.js` extension

Adding named exports breaks Eleventy data cascade. All new data computed in `_data/species.js` must be added as keys in the existing default export object, not as separate `export const` statements.

### Nunjucks Filters Available Without Registration
**Source:** RESEARCH.md (verified against `node_modules/nunjucks/src/filters.js`)
**Apply to:** Both `.njk` templates

| Filter | Purpose | Example |
|--------|---------|---------|
| `dump` | JSON.stringify | `{{ sp.month_histogram \| dump \| safe }}` |
| `safe` | Disable HTML escaping | `\| safe` |
| `urlencode` | URL-encode a string | `{{ sp.scientificName \| urlencode }}` |
| `replace` | String replace | `{{ sp.slug \| replace("/", "-") }}` |

---

## No Analog Found

All files have analogs. No entries in this table.

---

## Metadata

**Analog search scope:** `_pages/`, `_data/`, `src/entries/`, `src/styles/`, `src/tests/`, `_layouts/`
**Files scanned:** 11 (species.njk, default.njk, base.njk, species.js, photos.js, species.css, index.css, entries/species.ts, entries/bee-header.ts, tests/data-species.test.ts, tests/build-output.test.ts)
**Pattern extraction date:** 2026-05-15
