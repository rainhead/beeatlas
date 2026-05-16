# Phase 96: Index Page Replacement - Pattern Map

**Mapped:** 2026-05-16
**Files analyzed:** 9 new/modified files (plus 9 deletions)
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `_pages/species.njk` (rewrite) | template | request-response (build-time) | `_pages/genus.njk` | exact |
| `src/entries/species-index.ts` (new) | entry/utility | event-driven | `src/entries/taxon-page.ts` | exact |
| `src/styles/taxon-pages.css` (add rules) | config/style | — | `src/styles/taxon-pages.css` (self) | exact |
| `src/tests/arch.test.ts` (update) | test | — | self (surgery inside file) | exact |
| `src/tests/build-output.test.ts` (update) | test | — | self (surgery inside file) | exact |
| `src/tests/species-index.test.ts` (new) | test | — | `src/tests/page-scaffold.test.ts` | role-match |
| `src/tests/page-scaffold.test.ts` (update) | test | — | self (surgery inside file) | exact |

---

## Pattern Assignments

### `_pages/species.njk` (template, build-time)

**Analog:** `_pages/genus.njk`

**Frontmatter pattern** (`_pages/genus.njk` lines 1-10):
```nunjucks
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
For the index page, frontmatter is simpler (no pagination):
```nunjucks
---
layout: default.njk
permalink: /species/index.html
title: Species — BeeAtlas
---
```
The permalink `/species/index.html` must be preserved exactly from the current `_pages/species.njk` line 3.

**Article wrapper pattern** (`_pages/genus.njk` line 11):
```nunjucks
<article class="taxon-page">
```
For the index, use `class="taxon-page species-index"` — the modifier class is new but follows the same pattern.

**Species list pattern** (`_pages/genus.njk` lines 23-30):
```nunjucks
<ul class="species-list">
{%- for sp in genus.species -%}
  <li>
    <a href="/species/{{ sp.slug }}/"><em>{{ sp.scientificName }}</em></a>
    <span class="count">{{ sp.occurrence_count }} records</span>
  </li>
{%- endfor -%}
</ul>
```

**Script tag pattern** (`_pages/genus.njk` line 33):
```nunjucks
<script type="module" src="/src/entries/taxon-page.ts"></script>
```
For the index, change the src to `/src/entries/species-index.ts`.

**Full template (from UI-SPEC and RESEARCH.md — verbatim target):**
```nunjucks
---
layout: default.njk
permalink: /species/index.html
title: Species — BeeAtlas
---
<article class="taxon-page species-index">
  <h1>Species</h1>
  <input type="search" id="species-filter"
         aria-label="Filter genera and species"
         placeholder="Filter genera and species…"
         autocomplete="off">
  <p id="filter-empty" hidden>No genera or species match "<span id="filter-query"></span>".</p>
  {%- for family, familyGroup in species.flat | groupby("family") -%}
  <section class="family-section" data-family="{{ family }}">
    <h2>{{ family }}</h2>
    {%- for genus, genusGroup in familyGroup | groupby("genus") -%}
    <div class="genus-row" data-genus="{{ genus }}">
      <a href="/species/{{ genus }}/"><em>{{ genus }}</em></a>
      <ul class="species-list">
        {%- for sp in genusGroup -%}
        <li data-name="{{ sp.scientificName | lower }}">
          <a href="/species/{{ sp.slug }}/"><em>{{ sp.scientificName }}</em></a>
          <span class="count">{{ sp.occurrence_count }} records</span>
        </li>
        {%- endfor -%}
      </ul>
    </div>
    {%- endfor -%}
  </section>
  {%- endfor -%}
</article>
<script type="module" src="/src/entries/species-index.ts"></script>
```

---

### `src/entries/species-index.ts` (entry, event-driven)

**Analog:** `src/entries/taxon-page.ts`

**Imports pattern** (`src/entries/taxon-page.ts` lines 10-13):
```typescript
import '../index.css';
import '../styles/taxon-pages.css';
import '../bee-header.ts';
import '../species/seasonality-viz.ts';
```
For `species-index.ts`, copy the first three imports and omit `seasonality-viz.ts` (not used on the index page):
```typescript
import '../index.css';
import '../styles/taxon-pages.css';
import '../bee-header.ts';
```

**File header comment pattern** (`src/entries/taxon-page.ts` lines 1-9):
```typescript
// Vite Rollup entry for Eleventy-rendered taxon pages — see
// _pages/species-detail.njk and _pages/genus.njk.
// Side-effect registrations trigger @customElement(...) via Lit decorators.
// Plugin-vite MPA mode auto-discovers this entry from the pages'
// <script type="module"> tag and emits a separate taxon-page chunk.
// No vite.config.ts changes required.
//
// This is a strict subset of src/entries/species.ts — the heavier
// coordinator components are omitted so the taxon-page chunk stays lean.
```

**Core event-driven filter pattern** (from RESEARCH.md Pattern 2 — no existing analog; this is new logic):
```typescript
const input = document.getElementById('species-filter') as HTMLInputElement | null;
const emptyMsg = document.getElementById('filter-empty') as HTMLElement | null;

input?.addEventListener('input', () => {
  const query = input.value.trim().toLowerCase();
  let anyVisible = false;
  for (const section of document.querySelectorAll<HTMLElement>('.family-section')) {
    let sectionVisible = false;
    for (const row of section.querySelectorAll<HTMLElement>('.genus-row')) {
      const genusName = (row.dataset.genus ?? '').toLowerCase();
      let rowVisible = false;
      for (const li of row.querySelectorAll<HTMLElement>('li[data-name]')) {
        const match = !query || (li.dataset.name ?? '').includes(query) || genusName.includes(query);
        li.hidden = !match;
        if (match) rowVisible = true;
      }
      row.hidden = !rowVisible;
      if (rowVisible) sectionVisible = true;
    }
    section.hidden = !sectionVisible;
    if (sectionVisible) anyVisible = true;
  }
  if (emptyMsg) {
    emptyMsg.hidden = anyVisible || !query;
    const querySpan = document.getElementById('filter-query');
    if (querySpan) querySpan.textContent = input.value.trim();
  }
});
```
Note: genus-name matching (`genusName.includes(query)`) is required — see RESEARCH.md Pitfall 4.

---

### `src/styles/taxon-pages.css` (config/style, add `.species-index` rules)

**Analog:** `src/styles/taxon-pages.css` itself (lines 15-111 — existing patterns to extend)

**Existing pattern to follow** (taxon-pages.css lines 15-20, 72-90):
```css
.taxon-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1rem;
  box-sizing: border-box;
}

.species-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

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

**New rules to add** (CSS variables from `src/index.css` — follow existing token pattern):
```css
/* Phase 96: species index page modifier. Added to .taxon-page via .species-index class. */
.species-index #species-filter {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 0.5rem;   /* var(--sm, 8px) */
  padding: 0.5rem;
  background: var(--surface-subtle, #f5f5f5);
  border: 1px solid var(--border, #ddd);
  font-size: 1rem;
  border-radius: 4px;
}

.species-index .family-section {
  margin-bottom: 1.5rem;   /* var(--lg, 24px) */
}

.species-index .genus-row {
  margin-bottom: 0.5rem;   /* var(--sm, 8px) */
}
```

---

### `src/tests/arch.test.ts` (test, update — surgery)

**Analog:** `src/tests/arch.test.ts` itself (reading it for surgical guidance)

**Blocks to DELETE** (arch.test.ts lines 114-193):
- `describe('PAGE-06: presenter→coordinator non-import', ...)` — lines 114-140: coordinator `bee-species-page.ts` is deleted; entire block is vacuous.
- `describe('src/entries/species.ts allowlist (PAGE-04 partial)', ...)` — lines 142-193: entry file is deleted; entire block is vacuous.

**Block to KEEP AS-IS** (arch.test.ts lines 203-224):
```typescript
describe('ARCH-04: src/lib/spa-link.ts boundary (D-05)', () => {
  // ...keep unchanged
});
```

**Block to KEEP with trim** (arch.test.ts lines 82-107):
```typescript
describe('ARCH-04: src/species boundary (PAGE-08)', () => {
  const files = listTsFiles(SPECIES_DIR);
  // Keep as-is: after deletion, src/species/ still contains
  // seasonality-viz.ts and seasonality-cache.ts — the ARCH-04
  // boundary still applies to those remaining files.
```
Update the comment from "RED until Plan 03" to document that it now guards `seasonality-viz.ts` and `seasonality-cache.ts` only.

**New block to ADD** (modeled on the existing allowlist describe structure, lines 142-194):
```typescript
describe('src/entries/species-index.ts allowlist (IDX-02, Phase 96)', () => {
  const ENTRY_FILE_INDEX = resolve(ROOT, 'src/entries/species-index.ts');
  const ALLOWED_INDEX = new Set([
    '../index.css',
    '../styles/taxon-pages.css',
    '../bee-header.ts', '../bee-header',
  ]);
  const FORBIDDEN_PATTERNS = [
    'bee-species-page', 'bee-species-filter', 'bee-atlas', 'filter',
    'wa-sqlite', 'mapbox-gl',
  ];

  test('only imports CSS side-effects + bee-header (no SPA modules)', () => {
    const src = readFileSync(ENTRY_FILE_INDEX, 'utf8');
    const imports = [
      ...extractImports(src, STATIC_IMPORT_RE),
      ...extractImports(src, DYNAMIC_IMPORT_RE),
    ];
    const disallowed = imports.filter(spec => !ALLOWED_INDEX.has(spec));
    expect(disallowed, `unexpected imports: ${disallowed.join(', ')}`).toEqual([]);
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(src).not.toContain(pattern);
    }
  });
});
```

---

### `src/tests/build-output.test.ts` (test, update — surgery)

**Analog:** `src/tests/build-output.test.ts` itself

**Tests to DELETE** (build-output.test.ts lines 20-73):
- Lines 20-24: `emits _site/species/index.html with one <bee-species-card> per species (PAGE-01)` — delete entirely.
- Lines 26-31: `every <img> tag has loading="lazy" (PAGE-07)` on the index page — delete (new index has no `<img>` tags).
- Lines 62-67: `emits a species-page chunk distinct from index-*.js (PAGE-09)` — replace (see below).
- Lines 69-74: `species chunk does NOT contain mapboxgl symbol (PAGE-09)` — replace (see below).

**Tests to ADD** (insert after the `beforeAll` and before the first remaining test):
```typescript
test('emits _site/species/index.html with .family-section elements (IDX-01, URL-05)', () => {
  const html = readFileSync(resolve(ROOT, '_site/species/index.html'), 'utf-8');
  expect(html).toMatch(/class="family-section"/);
  expect(html).not.toContain('<bee-species-page');
});

test('index page has #species-filter input (IDX-02)', () => {
  const html = readFileSync(resolve(ROOT, '_site/species/index.html'), 'utf-8');
  expect(html).toMatch(/id="species-filter"/);
});

test('index page has genus links to /species/{Genus}/ (IDX-03)', () => {
  const html = readFileSync(resolve(ROOT, '_site/species/index.html'), 'utf-8');
  expect(html).toMatch(/href="\/species\/Agapostemon\/"/);
});

test('index page has species links to /species/{Genus}/{epithet}/ (IDX-04)', () => {
  const html = readFileSync(resolve(ROOT, '_site/species/index.html'), 'utf-8');
  expect(html).toMatch(/href="\/species\/Agapostemon\/femoratus\/"/);
});
```

**Chunk-finder to UPDATE** (build-output.test.ts lines 38-48) — rename `findSpeciesChunk` to remain accurate; the new chunk is `species-index-<hash>.js`. The existing regex `/^species-.*\.js$/` matches `species-index-*.js` — keep it but update the test label:
```typescript
test('emits a species-index chunk distinct from index-*.js (Phase 96, IDX-02)', () => {
  const speciesChunk = findSpeciesChunk();
  expect(speciesChunk, 'no species-index chunk emitted under _site/assets/').toBeDefined();
  const indexChunks = readdirSync(resolve(ROOT, '_site/assets')).filter(f => /^index-.*\.js$/.test(f));
  expect(indexChunks.length, 'SPA index chunk missing').toBeGreaterThan(0);
});

test('species-index chunk does NOT contain mapboxgl symbol (Phase 96)', () => {
  const speciesChunk = findSpeciesChunk();
  expect(speciesChunk).toBeDefined();
  const src = readFileSync(speciesChunk!, 'utf-8');
  expect(src).not.toMatch(/mapboxgl/);
});
```

---

### `src/tests/species-index.test.ts` (new unit test)

**Analog:** `src/tests/page-scaffold.test.ts` (readFileSync + regex pattern)

**File structure pattern** (page-scaffold.test.ts lines 1-22):
```typescript
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('_pages/species.njk (...)' () => {
  test('declares layout: default.njk and permalink: /species/index.html', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toMatch(/^---[\s\S]*layout:\s*default\.njk[\s\S]*---/);
    expect(src).toMatch(/permalink:\s*\/species\/index\.html/);
  });
```

**Target assertions for `species-index.test.ts`:**
```typescript
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('_pages/species.njk (Phase 96 — index page, IDX-01..04)', () => {
  test('declares layout: default.njk and permalink: /species/index.html', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toMatch(/^---[\s\S]*layout:\s*default\.njk[\s\S]*---/);
    expect(src).toMatch(/permalink:\s*\/species\/index\.html/);
  });

  test('references species-index entry (not old species.ts)', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toMatch(/<script\s+type="module"\s+src="\/src\/entries\/species-index\.ts"/);
    expect(src).not.toContain('species.ts');
  });

  test('contains groupby("family") and groupby("genus") for IDX-01', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toContain('groupby("family")');
    expect(src).toContain('groupby("genus")');
  });

  test('contains #species-filter input for IDX-02', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).toMatch(/id="species-filter"/);
    expect(src).toMatch(/type="search"/);
  });

  test('does not contain <bee-species-page> (URL-05)', () => {
    const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
    expect(src).not.toContain('bee-species-page');
    expect(src).not.toContain('bee-species-card');
  });
});

describe('src/entries/species-index.ts (IDX-02 entry wiring)', () => {
  test('imports index.css and taxon-pages.css side-effects', () => {
    const src = readFileSync(resolve(ROOT, 'src/entries/species-index.ts'), 'utf-8');
    expect(src).toContain("'../index.css'");
    expect(src).toContain("'../styles/taxon-pages.css'");
  });

  test('wires input event listener to #species-filter', () => {
    const src = readFileSync(resolve(ROOT, 'src/entries/species-index.ts'), 'utf-8');
    expect(src).toContain("getElementById('species-filter')");
    expect(src).toContain("addEventListener('input'");
  });

  test('toggles hidden on .family-section, .genus-row, and li elements', () => {
    const src = readFileSync(resolve(ROOT, 'src/entries/species-index.ts'), 'utf-8');
    expect(src).toContain('.family-section');
    expect(src).toContain('.genus-row');
    expect(src).toContain('hidden');
  });
});
```

---

### `src/tests/page-scaffold.test.ts` (update — surgery)

**Analog:** `src/tests/page-scaffold.test.ts` itself (lines 11-22)

**Test to UPDATE** (page-scaffold.test.ts lines 16-22):
```typescript
// BEFORE (delete this test):
test('references the species entry script (PAGE-04)', () => {
  const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
  expect(src).toMatch(/<script\s+type="module"\s+src="\/src\/entries\/species\.ts"/);
});
```
Replace with:
```typescript
// AFTER:
test('references the species-index entry script (Phase 96)', () => {
  const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
  expect(src).toMatch(/<script\s+type="module"\s+src="\/src\/entries\/species-index\.ts"/);
});
```
The first test in that describe block (permalink + layout check, lines 12-15) is preserved unchanged.

---

## Shared Patterns

### CSS Custom Property Tokens
**Source:** `src/styles/taxon-pages.css` (lines 29, 47, 57, 84, 90, 100)
**Apply to:** All new CSS rules in `src/styles/taxon-pages.css`
```css
/* Always use fallback values matching src/index.css declarations */
var(--surface-subtle, #f5f5f5)
var(--border, #ddd)
var(--text-muted, #666)
var(--link, #646cff)
```

### TypeScript File Header Pattern
**Source:** `src/entries/taxon-page.ts` (lines 1-9), `src/entries/species.ts` (lines 1-13)
**Apply to:** `src/entries/species-index.ts`
New entry files begin with a comment explaining: what entry this is for, which Eleventy page consumes it, how Vite MPA mode auto-discovers it, and what chunk it emits.

### Test File Import Block Pattern
**Source:** `src/tests/page-scaffold.test.ts` (lines 1-8), `src/tests/arch.test.ts` (lines 16-21)
**Apply to:** `src/tests/species-index.test.ts`
```typescript
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
```

### `extractImports` Utility (arch.test.ts)
**Source:** `src/tests/arch.test.ts` (lines 46-79) — `STATIC_IMPORT_RE`, `DYNAMIC_IMPORT_RE`, `extractImports` function
**Apply to:** The new `describe` block added to `arch.test.ts` for `species-index.ts`. Reference these already-declared helpers; do not redefine them.

---

## Deletions (no pattern extraction needed)

| File | Reason |
|------|--------|
| `src/entries/species.ts` | Entry for old page; replaced by `species-index.ts` |
| `src/species/bee-species-page.ts` | Lit coordinator for old page |
| `src/species/bee-species-filter.ts` | Presenter; old page only |
| `src/species/bee-taxon-nav.ts` | Presenter; only used by `taxon-tree.njk` (deleted) |
| `src/species/url-state.ts` | URL sync for old page |
| `src/species/bee-species-card.ts` | Card component; only used by old page |
| `src/styles/species.css` | Old page stylesheet; only imported by `src/entries/species.ts` |
| `_includes/taxon-tree.njk` | Nunjucks macro; only used by old `_pages/species.njk` |
| `src/tests/bee-species-page.test.ts` | Tests deleted component |
| `src/tests/bee-species-filter.test.ts` | Tests deleted component |
| `src/tests/bee-species-card.test.ts` | Tests deleted component |
| `src/tests/bee-taxon-nav.test.ts` | Tests deleted component |
| `src/tests/species-url-state.test.ts` | Tests deleted `src/species/url-state.ts` |
| `src/species/tests/a11y.test.ts` | Tests deleted components; imports `bee-taxon-nav.ts` |

**Files to KEEP** (do not delete):
- `src/species/seasonality-viz.ts` — used by `src/entries/taxon-page.ts` line 13, which is loaded by `_pages/species-detail.njk`
- `src/species/seasonality-cache.ts` — supporting module for `seasonality-viz.ts`
- `src/tests/seasonality-viz.test.ts` — `seasonality-viz.ts` is kept

---

## No Analog Found

All files for Phase 96 have close analogs in the codebase. The filter event-listener logic in `species-index.ts` has no direct analog (it is new behavior), but the entry module structure is fully matched by `taxon-page.ts`.

---

## Metadata

**Analog search scope:** `_pages/`, `src/entries/`, `src/tests/`, `src/styles/`, `_data/`
**Files read:** 11 source files + 3 planning docs
**Pattern extraction date:** 2026-05-16
