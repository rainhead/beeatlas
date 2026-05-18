# Phase 99: Place Static Pages — Pattern Map

**Mapped:** 2026-05-17
**Files analyzed:** 5 new files
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `_data/places.js` | data-module | batch (build-time JSON load) | `_data/species.js` | exact |
| `_pages/places.njk` | template (index) | request-response (SSG) | `_pages/species.njk` | exact |
| `_pages/place-detail.njk` | template (detail, paginated) | request-response (SSG) | `_pages/species-detail.njk` | exact |
| `src/styles/places.css` | stylesheet | — | `src/styles/taxon-pages.css` | role-match |
| `src/tests/data-places.test.ts` | test | — | `src/tests/data-species.test.ts` | exact |
| `src/tests/build-output.test.ts` | test (augment) | — | `src/tests/build-output.test.ts` | exact |

---

## Pattern Assignments

### `_data/places.js` (data-module, build-time batch)

**Analog:** `_data/species.js`

**Imports pattern** (`_data/species.js` lines 13-19):
```javascript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const speciesJsonPath = join(repoRoot, 'public/data/species.json');
```

**Core pattern** (`_data/species.js` lines 22, 39, 244 — key structure):
```javascript
const raw = JSON.parse(readFileSync(speciesJsonPath, 'utf8'));

// places.js equivalent — no sort needed (pipeline order is authoritative)
const placesArray = raw;

export default { placesArray };
```

Adaptation notes:
- Path argument: `join(repoRoot, 'public/data/places.json')`
- Export key: `placesArray` (not `flat` or `speciesList`). Templates reference `places.placesArray`.
- No derived arrays needed (no tree, no color computation). The module is minimal.
- Do NOT read `seasonality.json` or any parquet file — only `places.json`. (Mirrors species.js Pitfall #8 comment.)
- Confirmed field names from `public/data/places.json`: `slug`, `name`, `land_owner`, `specimen_count`, `sample_count`.

**Leading file-level comment pattern** (`_data/species.js` lines 1-11):
```javascript
// Build-time data feed for the places page. Read by Eleventy's data cascade
// and exposed to _pages/places.njk and _pages/place-detail.njk as the `places` global.
//
// Contract (PPAGE-01, PPAGE-02): exports { placesArray }.
// - placesArray: array of place objects in pipeline order (slug, name, land_owner, specimen_count, sample_count)
//
// Pitfall: this module reads places.json (NOT parquet) so Eleventy HMR stays sub-100ms.
```

---

### `_pages/places.njk` (template, index, no pagination)

**Analog:** `_pages/species.njk`

**Front-matter pattern** (`_pages/species.njk` lines 1-5):
```yaml
---
layout: default.njk
permalink: /species/index.html
title: Species — BeeAtlas
---
```

Adaptation:
```yaml
---
layout: default.njk
permalink: /places.html
title: Places — BeeAtlas
---
```

Note: `permalink: /places.html` (flat file) — NOT `/places/` or `/places/index.html`. D-02 requires direct-path.

**CSS delivery** (D-09 + D-08 — no JS entry; `<link>` in template body following `_pages/index.html` line 9 as Vite MPA precedent):
```nunjucks
<link rel="stylesheet" href="/src/styles/places.css">
```
Place this as the first line of template content (before `<article>`), since `default.njk` renders `{{ content | safe }}` inside `<main>` without `<head>` injection. Vite MPA mode scans the entire HTML document for `<link>` tags.

**Core listing pattern** (`_pages/species.njk` lines 6-31, adapted — ul instead of grouped sections):
```nunjucks
<article class="places-page places-index">
  <h1>Places</h1>
  <ul class="places-list">
    {%- for place in places.placesArray -%}
    <li>
      <a href="/places/{{ place.slug }}.html">{{ place.name }}</a>
      <span class="owner">{{ place.land_owner }}</span>
      <span class="count">{{ place.specimen_count }} specimens</span>
    </li>
    {%- endfor -%}
  </ul>
</article>
```

Do NOT add `<script type="module">` (D-09). Species.njk has one on line 32 — omit the equivalent here.

---

### `_pages/place-detail.njk` (template, detail, Eleventy pagination)

**Analog:** `_pages/species-detail.njk` (primary) and `_pages/genus.njk` (eleventyComputed title)

**Front-matter pattern** (`_pages/species-detail.njk` lines 1-9, adapted):
```yaml
---
pagination:
  data: places.placesArray
  size: 1
  alias: place
permalink: "/places/{{ place.slug }}.html"
eleventyComputed:
  title: "{{ place.name }} — BeeAtlas"
layout: default.njk
---
```

Critical: `permalink` uses `.html` suffix, not trailing slash. Species pages use `/species/{{ sp.slug }}/` which writes `/species/slug/index.html` — that pattern must NOT be copied for place pages. CloudFront on this project has no subdirectory redirect. (D-02, CLAUDE.md constraint.)

The `eleventyComputed: title:` pattern is from `_pages/genus.njk` lines 7-8:
```yaml
eleventyComputed:
  title: "{{ genus.genus }} — BeeAtlas"
```

**CSS delivery** (same as places.njk — first line of content):
```nunjucks
<link rel="stylesheet" href="/src/styles/places.css">
```

**Core detail pattern** (`_pages/species-detail.njk` lines 11-40, adapted — no photo, no seasonality-viz, no breadcrumb, no JS entry):
```nunjucks
<article class="places-page place-detail">
  <h1>{{ place.name }}</h1>
  <div class="media-grid">
    {%- if place.specimen_count > 0 -%}
      <img loading="lazy"
           src="/data/places-maps/{{ place.slug }}.svg"
           alt="Occurrence map for {{ place.name }}">
    {%- endif -%}
  </div>
  <p class="metadata">{{ place.specimen_count }} specimens · {{ place.land_owner }}</p>
  <a href="/?place={{ place.slug }}">View occurrences on the atlas →</a>
</article>
```

**SVG guard pattern** (`_pages/species-detail.njk` line 24):
```nunjucks
{%- if sp.occurrence_count > 0 -%}
  <img loading="lazy" src="/data/species-maps/{{ sp.slug }}.svg" ...>
{%- endif -%}
```
Adapted to `place.specimen_count > 0` (field name from `places.json` is `specimen_count`, confirmed).

**SVG map path warning:** RESEARCH.md Pitfall 1 notes the current disk path is `public/data/place-maps/` (singular "map") while CONTEXT.md D-07 says `places-maps/` (plural). The plan must include a Wave 0 task to confirm Phase 98's actual export path before writing the `<img src>` attribute. Until confirmed, use the path from D-07 as written above and flag it for verification.

Do NOT add `<script type="module">` (D-09). Species-detail.njk has one on line 40 — omit here.

---

### `src/styles/places.css` (stylesheet)

**Analog:** `src/styles/taxon-pages.css`

**File-level comment pattern** (`src/styles/taxon-pages.css` lines 1-4):
```css
/* Phase 94: layout for /species/{Genus}/{epithet}/ and /species/{Genus}/ pages.
 * Extends species.css conventions; light-DOM patterns not needed here (no
 * custom elements wrapping the page body). Design tokens from src/index.css.
 */
```

Adaptation:
```css
/* Phase 99: layout for /places.html and /places/{slug}.html pages.
 * Mirrors taxon-pages.css conventions. Design tokens from src/index.css.
 */
```

**Container pattern** (`src/styles/taxon-pages.css` lines 16-20 — `.taxon-page` block):
```css
.taxon-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1rem;
  box-sizing: border-box;
}
```
Use `.places-page` as the root class instead of `.taxon-page`.

**SVG map sizing pattern** (`src/styles/taxon-pages.css` lines 32-36):
```css
.taxon-page img[src*="/species-maps/"] {
  aspect-ratio: 15 / 8;
  width: 100%;
  max-width: 600px;
}
```
Adapted to `img[src*="/places-maps/"]` (or `place-maps/` pending path confirmation).

**Metadata text pattern** (`src/styles/taxon-pages.css` lines 44-47):
```css
.taxon-page .metadata {
  font-size: 0.85rem;
  color: var(--text-muted, #666);
}
```

**media-grid responsive pattern** (`src/styles/taxon-pages.css` lines 104-111):
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
Adapt: `.places-page .media-grid`. On the detail page the `media-grid` contains only the SVG (no photo), so a single-column grid is fine; the two-column layout can be kept for when photos are eventually added, or omitted.

**List item pattern** (`src/styles/taxon-pages.css` lines 73-84 — `.species-list li`):
```css
.species-list li {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.25rem 0;
  border-bottom: 1px solid var(--border, #ddd);
}
.species-list .count {
  margin-left: auto;
  font-size: 0.85rem;
  color: var(--text-muted, #666);
}
```
Adapted to `.places-list li` and `.places-list .count`.

Design tokens to reference: `--text-muted`, `--border`, `--link`, `--surface-subtle` (all established in `src/index.css`).

---

### `src/tests/data-places.test.ts` (new unit test file)

**Analog:** `src/tests/data-species.test.ts`

**File structure pattern** (`src/tests/data-species.test.ts` lines 1-11):
```typescript
// Phase 99 — unit contract for _data/places.js (PPAGE-01, PPAGE-02).

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
import places from '../../_data/places.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
```

**Test describe structure** (`src/tests/data-species.test.ts` lines 32-49):
```typescript
describe('_data/places.js (PPAGE-01)', () => {
  test('exports placesArray as an array', () => {
    expect(Array.isArray((places as any).placesArray)).toBe(true);
  });

  test('placesArray items have required fields', () => {
    const arr = (places as any).placesArray;
    expect(arr.length).toBeGreaterThan(0);
    for (const p of arr) {
      expect(typeof p.slug).toBe('string');
      expect(typeof p.name).toBe('string');
      expect(typeof p.land_owner).toBe('string');
      expect(typeof p.specimen_count).toBe('number');
      expect(typeof p.sample_count).toBe('number');
    }
  });

  test('does NOT read parquet (HMR pitfall)', () => {
    const src = readFileSync(resolve(ROOT, '_data/places.js'), 'utf-8');
    expect(src).not.toMatch(/parquet/i);
  });
});
```

---

### `src/tests/build-output.test.ts` (augment existing file)

**Analog:** Existing `src/tests/build-output.test.ts` — add new tests inside the existing `describe.skipIf(SKIP_BUILD)` block.

**Test pattern** (from `src/tests/build-output.test.ts` lines 84-91 — per-item page assertion):
```typescript
test('emits _site/places.html with places-list items (PPAGE-01)', () => {
  const html = readFileSync(resolve(ROOT, '_site/places.html'), 'utf-8');
  expect(html).toMatch(/class="places-list"/);
  expect(html).toMatch(/href="\/places\/[a-z0-9-]+\.html"/);
});

test('emits _site/places/{slug}.html with correct content (PPAGE-02)', () => {
  // Use first slug from places.json — "rattlesnake-ledge"
  const html = readFileSync(resolve(ROOT, '_site/places/rattlesnake-ledge.html'), 'utf-8');
  expect(html).toContain('Rattlesnake Ledge');
  expect(html).toContain('Washington Department of Natural Resources');
  expect(html).toMatch(/\d+ specimens/);
  expect(html).toMatch(/href="\/?place=rattlesnake-ledge"/);
});

test('place detail page has no SVG img when specimen_count == 0 (PPAGE-02)', () => {
  const html = readFileSync(resolve(ROOT, '_site/places/rattlesnake-ledge.html'), 'utf-8');
  // Current seed data: specimen_count = 0 — guard must suppress the <img>
  expect(html).not.toMatch(/places-maps/);
});
```

The `resolve(ROOT, ...)` and `readFileSync` imports are already present in the analog file (lines 9-10). The new tests slot directly into the existing describe block without additional imports.

---

## Shared Patterns

### CSS delivery without a JS entry
**Source:** `_pages/index.html` line 9 (Vite MPA `<link rel="stylesheet">` precedent)
**Apply to:** `_pages/places.njk` and `_pages/place-detail.njk`
```html
<link rel="stylesheet" href="/src/styles/places.css">
```
Place at top of template content (before `<article>`). Vite MPA mode scans the full HTML output — the link does not need to be in `<head>`.

### Eleventy build-time JSON read
**Source:** `_data/species.js` lines 13-22
**Apply to:** `_data/places.js`
```javascript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const raw = JSON.parse(readFileSync(join(repoRoot, 'public/data/places.json'), 'utf8'));
```

### `<img loading="lazy">` on every map image
**Source:** `_pages/species-detail.njk` line 25; `_pages/genus.njk` line 18
**Apply to:** `_pages/place-detail.njk` SVG map `<img>`
Every `<img>` must carry `loading="lazy"` — `build-output.test.ts` asserts this for species pages and the same check will be added for place pages.

### `@ts-expect-error` for plain-ESM `_data/*.js` imports in tests
**Source:** `src/tests/data-species.test.ts` line 9
**Apply to:** `src/tests/data-places.test.ts`
```typescript
// @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
import places from '../../_data/places.js';
```

---

## No Analog Found

None — all five files have a direct or role-match analog in the codebase.

---

## Open Issue for Planner

**SVG map directory name (Pitfall 1 from RESEARCH.md):** The current disk path is `public/data/place-maps/` (singular "map") while CONTEXT.md D-07 says `places-maps/` (plural with trailing s). The planner must add a Wave 0 task: read Phase 98's plan or pipeline output to confirm the canonical directory name, then set the `<img src>` path in `place-detail.njk` and the CSS attribute selector in `places.css` to match. Do not hard-code either path until confirmed.

---

## Metadata

**Analog search scope:** `_data/`, `_pages/`, `_layouts/`, `src/styles/`, `src/tests/`
**Files scanned:** 10
**Pattern extraction date:** 2026-05-17
