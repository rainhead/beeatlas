# Phase 80: Page Scaffolding — Pattern Map

**Mapped:** 2026-05-04
**Files analyzed:** 13 new files
**Analogs found:** 13 / 13 (every primitive has a precedent in-repo)

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `_pages/species.njk` | Eleventy template (page) | build-time SSR (loop over data feed) | `_pages/index.html` (entry shape) + `_layouts/default.njk` (layout chain) | role-match (no existing njk page in `_pages/`; HTML page is the closest entry analog) |
| `_data/species.js` | build-time data feed | file-read → parse → export plain object | `_data/build.js` | exact (same role + sync `readFileSync` flow) |
| `_data/photos.js` | build-time data feed | file-read → TOML.parse → export keyed object | `_data/build.js` (sync read pattern) + `scripts/seed-species-photos.mjs` (TOML.parse usage) | exact for shape; partial for TOML library call |
| `src/entries/species.ts` | Vite MPA entry (side-effect) | static-import registration | `src/entries/bee-header.ts` | exact (one-liner side-effect entry) |
| `src/species/bee-species-page.ts` | Lit coordinator (skeleton) | reactive-state holder; no events Phase 80 | `src/bee-atlas.ts` (state-ownership shape) + `src/bee-header.ts` (Lit class shape) | role-match (no existing light-DOM-no-render coordinator; ARCH-03 shape is the precedent) |
| `src/species/bee-species-card.ts` | Lit presenter (skeleton, light DOM) | property-receiver; no `render()` | `src/bee-header.ts` (Lit class shape) | role-match (existing presenters use shadow DOM + `render()`; light-DOM/no-render is novel for this repo) |
| `src/tests/arch.test.ts` | Vitest source-analysis test | `readFileSync` + regex over import lines | `src/tests/seed-species-photos.test.ts` (build-chain isolation block, lines 269–320) + `src/tests/validate-species.test.ts` | exact (same shape: read repo file, regex, assert) |
| `src/tests/bee-species-card.test.ts` | Vitest unit (Lit prototype assertion) | import class → assert prototype identity | `src/tests/seed-species-photos.test.ts` (named-export-import + `expect`) | role-match |
| `src/tests/bee-species-page.test.ts` | Vitest unit (instance shape) | `new BeeSpeciesPage()` → assert state defaults | `src/tests/seed-species-photos.test.ts` | role-match |
| `src/tests/data-species.test.ts` | Vitest unit (data-feed shape) | import `_data/species.js` → assert keys/types | `src/tests/seed-species-photos.test.ts` (named-export import via `// @ts-expect-error`) | role-match (importing a JS data feed from TS test mirrors the .mjs import pattern) |
| `src/tests/data-photos.test.ts` | Vitest unit (data-feed sort) | import `_data/photos.js` → assert sorted | same as above | role-match |
| `src/tests/page-scaffold.test.ts` | Vitest unit (front-matter / file presence) | `readFileSync` + regex front-matter | `src/tests/seed-species-photos.test.ts` build-chain block (lines 269–320) | exact |
| `src/tests/build-output.test.ts` | Vitest integration (post-build assertions) | `execSync('npm run build')` then `readFileSync`/`readdir` over `_site/` | `src/tests/validate-species.test.ts` lines 117–164 (`execSync('npm run validate-species')` + filesystem read) | exact (only existing `execSync` + post-build precedent) |

## Pattern Assignments

### `_pages/species.njk` (Eleventy template, build-time SSR)

**Analog:** `_pages/index.html` for entry shape; `_layouts/default.njk` for layout chain. No `_pages/*.njk` exists today (only `scaffold-check.njk`); this is the first real Nunjucks page.

**Front-matter pattern** (mirrors `_layouts/default.njk` lines 1–3):
```yaml
---
layout: default.njk
permalink: /species/index.html
title: Species — BeeAtlas
---
```

**Script-tag entry pattern** (copy from `_layouts/default.njk` line 5):
```html
<script type="module" src="/src/entries/species.ts"></script>
```
The leading `/` is load-bearing — plugin-vite's MPA auto-discovery resolves this against repo root. `_pages/index.html:10` uses `./src/bee-atlas.ts` (relative); `_layouts/default.njk:5` uses `/src/entries/bee-header.ts` (absolute). Either works; the absolute form is preferred for entries since it doesn't depend on the consuming page's depth.

**Loop body** — no in-repo Nunjucks loop precedent exists; researcher proposes the shape (RESEARCH.md Pattern 2, lines 222–251). Single `{% for %}` over `species.flat`, conditional `{% if %}` blocks for photo / map / description per D-04.

---

### `_data/species.js` (build-time data feed)

**Analog:** `_data/build.js`

**Imports + repoRoot pattern** (copy from `_data/build.js` lines 1–7):
```javascript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
```

**Sync read + try/catch + plain-object default-export pattern** (copy from `_data/build.js` lines 9–37):
```javascript
function pkgVersion(name) {
  try {
    const p = JSON.parse(
      readFileSync(join(repoRoot, 'node_modules', name, 'package.json'), 'utf8')
    );
    return p.version;
  } catch {
    return 'unknown';
  }
}

export default {
  // ...
};
```

For `_data/species.js`: read `public/data/species.json` (NOT parquet — Pitfall #8). Sort by `scientificName`. Build `flat`, `byScientificName`, and a recursive `tree` per RESEARCH Pattern 3 lines 270–316. Plain ESM default-export — Eleventy 3.x consumes `default` correctly (precedent: `_data/build.js` works today).

---

### `_data/photos.js` (build-time data feed)

**Analog:** `_data/build.js` for the read pattern; `scripts/seed-species-photos.mjs` for the TOML.parse call.

**Imports** (copy from `_data/build.js` lines 1–4 plus the TOML import):
```javascript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import TOML from '@iarna/toml';
```

**TOML parse pattern** (call shape verified in `scripts/seed-species-photos.mjs`; same library used to validate the manifest in `scripts/validate-species.mjs`):
```javascript
const manifest = TOML.parse(readFileSync(tomlPath, 'utf8'));
```
`@iarna/toml`'s `TOML.parse` is synchronous. Manifest top-level is `{ species: { [scientificName]: { description, photos[] } } }` — see `content/species-photos.toml` head sample.

**Sort + shape** (RESEARCH Pattern 3 lines 318–344): for each species entry, slice + sort `photos` by `ordering` (numeric ascending), trim `description`, default to empty string. Export `Record<scientificName, { description: string; photos: Photo[] }>`.

---

### `src/entries/species.ts` (Vite MPA entry)

**Analog:** `src/entries/bee-header.ts` — exact one-line precedent.

**Full file pattern** (copy verbatim from `src/entries/bee-header.ts` lines 1–4 and extend):
```typescript
// Vite Rollup entry for Eleventy-rendered pages — see
// _pages/species.njk. Side-effect imports trigger
// @customElement(...) registration via Lit decorators.
import '../bee-header.ts';
import '../species/bee-species-page.ts';
import '../species/bee-species-card.ts';
```

ARCH-04 allows `../bee-header.ts` (header is a leaf — does not pull mapbox-gl/wa-sqlite). Per Open Question Q4 in RESEARCH.md, the header lives in the entry, not inside `src/species/`.

---

### `src/species/bee-species-page.ts` (Lit coordinator, skeleton)

**Analog for state-ownership shape:** `src/bee-atlas.ts` lines 1–53 (`@state` private field block; ARCH-03 invariant).
**Analog for class skeleton:** `src/bee-header.ts` lines 1–8 (decorator + extends LitElement).

**Imports pattern** (mirror `src/bee-header.ts:1-2`, drop `css`/`html` since this class has no `render()`):
```typescript
import { LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
```

**State block pattern** (copy structure from `src/bee-atlas.ts` lines 17–30; SHRINK to Phase 80 fields only — D-07):
```typescript
// ARCH-03 / PAGE-05: coordinator owns reactive state; presenters never own it.
// Phase 80: declarations only with empty defaults. Phase 81 wires events/URL onto these.
@state() private _activeTaxonPath: string[] = [];
@state() private _geoFilter: GeoFilter | null = null;
@state() private _seasonFilter: SeasonFilter | null = null;
```

`GeoFilter` and `SeasonFilter` types defined in same file (RESEARCH.md lines 525–534), aligned with `src/filter.ts:11-22` (`Set<string>` for counties/ecoregions, `Set<number>` for months — exact mirror).

**Light-DOM override + no-render pattern** (RESEARCH Pattern 1; novel for this repo — no in-repo precedent. Documented at `node_modules/lit-element/development/lit-element.js` lines 95–130):
```typescript
@customElement('bee-species-page')
export class BeeSpeciesPage extends LitElement {
  @state() private _activeTaxonPath: string[] = [];
  @state() private _geoFilter: GeoFilter | null = null;
  @state() private _seasonFilter: SeasonFilter | null = null;

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  // INTENTIONAL: do NOT define render() — see Phase 80 RESEARCH.md Pattern 1.
  // Default render() returns noChange; lit-html commits as a no-op,
  // preserving Eleventy's server-rendered children.
}
```

---

### `src/species/bee-species-card.ts` (Lit presenter, skeleton, light DOM)

**Analog:** `src/bee-header.ts` lines 1–8 for the decorator pattern. Forward-looking `@property` declarations only — no `render()`, no `static styles` (Phase 81 styles).

**Imports** (drop `css`, `html` — no template literal in skeleton):
```typescript
import { LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
```

**Class shape** (RESEARCH Pattern 1 lines 178–201):
```typescript
@customElement('bee-species-card')
export class BeeSpeciesCard extends LitElement {
  // Empty-defaults @property fields for Phase 81 to wire onto.
  @property({ attribute: false }) scientificName = '';
  @property({ attribute: false }) slug = '';
  @property({ type: Number }) occurrenceCount = 0;

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  // INTENTIONAL: do NOT define render() — see Phase 80 RESEARCH.md Pattern 1.
}
```

**Critical:** no `<slot>` (light-DOM elements have no shadow root; `<slot>` is meaningless and the skeleton must NOT define `render()` at all per D-05).

---

### `src/tests/arch.test.ts` (source-analysis test)

**Analog:** `src/tests/seed-species-photos.test.ts` lines 269–320 (the build-chain isolation block — exact precedent for `readFileSync` + regex over a repo file).

**Imports + repo-root pattern** (copy from `src/tests/seed-species-photos.test.ts` lines 1, 262–267):
```typescript
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
```

**Per-file regex assertion pattern** (copy structure from `src/tests/seed-species-photos.test.ts` lines 293–319 — `readFileSync(...)` + `expect(src).toMatch(...)` shape):
```typescript
test('seed script declares CLI guard (does not call main() at module load)', () => {
  const src = readFileSync(resolve(ROOT, 'scripts/seed-species-photos.mjs'), 'utf-8');
  expect(src).toMatch(/.../);
});
```

**Full arch-test recipe** in RESEARCH.md Pattern 4 lines 351–412. Forbidden list (ARCH-04, lines 362–373):
```typescript
const FORBIDDEN = [
  'mapbox-gl',
  'wa-sqlite',
  '../sqlite.ts', '../sqlite',
  '../filter.ts', '../filter',
  '../bee-map.ts', '../bee-map',
  '../bee-atlas.ts', '../bee-atlas',
];
```

**Pitfall 3 mitigation:** regex must cover BOTH `from '...'` AND `import('...')` (dynamic) shapes. RESEARCH.md Open Question 3.

---

### `src/tests/bee-species-card.test.ts` (D-05 prototype identity)

**Analog:** `src/tests/seed-species-photos.test.ts` for the named-import + assertion shape.

**Import shape** (mirror `src/tests/seed-species-photos.test.ts` lines 2–9; no `// @ts-expect-error` needed since the source is `.ts`):
```typescript
import { describe, test, expect } from 'vitest';
import { LitElement } from 'lit';
import { BeeSpeciesCard } from '../species/bee-species-card.ts';
```

**Core assertion** (D-05 + RESEARCH.md Validation table line 652):
```typescript
test('does NOT override render() — preserves Eleventy SSR children (D-05)', () => {
  expect(BeeSpeciesCard.prototype.render).toBe(LitElement.prototype.render);
});

test('createRenderRoot returns this (light DOM)', () => {
  const fakeHost = {} as HTMLElement;
  expect(BeeSpeciesCard.prototype.createRenderRoot.call(fakeHost)).toBe(fakeHost);
});
```

---

### `src/tests/bee-species-page.test.ts` (PAGE-05 state shape)

**Analog:** `src/tests/seed-species-photos.test.ts` for shape.

**Core assertion** (PAGE-05; RESEARCH.md Validation table line 647):
```typescript
import { BeeSpeciesPage } from '../species/bee-species-page.ts';

test('declares _activeTaxonPath / _geoFilter / _seasonFilter with empty defaults (PAGE-05)', () => {
  const el = new BeeSpeciesPage();
  // @state private fields — accessed via `as any` since they are private.
  expect((el as any)._activeTaxonPath).toEqual([]);
  expect((el as any)._geoFilter).toBeNull();
  expect((el as any)._seasonFilter).toBeNull();
});
```

Vitest test environment is `happy-dom` (`vite.config.ts:18`) — `customElements.define` works without browser; `new BeeSpeciesPage()` constructs cleanly.

---

### `src/tests/data-species.test.ts` (PAGE-02)

**Analog:** `src/tests/seed-species-photos.test.ts` lines 2–9 for the JS-from-TS import shape with `// @ts-expect-error`.

**Import + grep-against-source pattern** (combines two precedents: data-feed import like `_data/build.js` is consumed by Eleventy, plus `readFileSync` + regex on the source file like `seed-species-photos.test.ts` lines 269–278):
```typescript
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
import species from '../../_data/species.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

test('exports { tree, flat, byScientificName } (PAGE-02)', () => {
  expect(Array.isArray(species.flat)).toBe(true);
  expect(species.flat.length).toBeGreaterThan(0);
  expect(typeof species.byScientificName).toBe('object');
  expect(typeof species.tree).toBe('object');
});

test('does NOT read parquet (Pitfall #8)', () => {
  const src = readFileSync(resolve(ROOT, '_data/species.js'), 'utf-8');
  expect(src).not.toMatch(/parquet/i);
});
```

---

### `src/tests/data-photos.test.ts` (PAGE-03)

**Analog:** same `// @ts-expect-error`-import pattern.

**Sort assertion** (RESEARCH.md Validation table line 645):
```typescript
// @ts-expect-error
import photos from '../../_data/photos.js';

test('photos are sorted by ordering ascending (PAGE-03)', () => {
  for (const [name, entry] of Object.entries(photos)) {
    const orderings = (entry as any).photos.map((p: any) => p.ordering);
    const sorted = [...orderings].sort((a, b) => a - b);
    expect(orderings, `${name} photos not sorted`).toEqual(sorted);
  }
});

test('exports Record<scientificName, { description, photos[] }>', () => {
  for (const [, entry] of Object.entries(photos)) {
    expect(typeof (entry as any).description).toBe('string');
    expect(Array.isArray((entry as any).photos)).toBe(true);
  }
});
```

---

### `src/tests/page-scaffold.test.ts` (PAGE-01 / PAGE-04 front-matter + entry path)

**Analog:** `src/tests/seed-species-photos.test.ts` lines 293–319 — `readFileSync` + `expect(src).toMatch(...)` over a repo file.

**Pattern**:
```typescript
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('_pages/species.njk has correct front-matter (PAGE-01)', () => {
  const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
  expect(src).toMatch(/^---[\s\S]*layout:\s*default\.njk[\s\S]*---/);
  expect(src).toMatch(/permalink:\s*\/species\/index\.html/);
});

test('_pages/species.njk references the species entry script (PAGE-04)', () => {
  const src = readFileSync(resolve(ROOT, '_pages/species.njk'), 'utf-8');
  expect(src).toMatch(/<script\s+type="module"\s+src="\/src\/entries\/species\.ts"/);
});
```

---

### `src/tests/build-output.test.ts` (PAGE-07 / PAGE-09 post-build assertions)

**Analog:** `src/tests/validate-species.test.ts` lines 117–164 — only existing precedent for `execSync('npm run build'-style)` + post-build filesystem reads.

**`execSync` + filesystem-assertion pattern** (copy structure from `src/tests/validate-species.test.ts` lines 118–125):
```typescript
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('build output (PAGE-07/09)', () => {
  // Build runs once for the whole describe block (slow; gated behind beforeAll).
  beforeAll(() => {
    execSync('npm run build', { cwd: ROOT, stdio: 'pipe' });
  }, 120_000);

  test('emits _site/species/index.html with one card per species (PAGE-01)', () => {
    const html = readFileSync(resolve(ROOT, '_site/species/index.html'), 'utf-8');
    const cardCount = (html.match(/<bee-species-card\b/g) ?? []).length;
    expect(cardCount).toBeGreaterThan(700); // ~735 species
  });

  test('every <img> has loading="lazy" (PAGE-07)', () => {
    const html = readFileSync(resolve(ROOT, '_site/species/index.html'), 'utf-8');
    const imgs = html.match(/<img\b[^>]*>/g) ?? [];
    for (const img of imgs) {
      expect(img, img).toMatch(/loading="lazy"/);
    }
  });

  test('emits _site/assets/species-*.js chunk (PAGE-09)', () => {
    const files = readdirSync(resolve(ROOT, '_site/assets'));
    expect(files.some(f => /^species-.*\.js$/.test(f))).toBe(true);
  });

  test('species chunk does NOT contain mapbox-gl symbols (PAGE-09)', () => {
    const files = readdirSync(resolve(ROOT, '_site/assets'));
    const speciesChunk = files.find(f => /^species-.*\.js$/.test(f));
    const src = readFileSync(resolve(ROOT, '_site/assets', speciesChunk!), 'utf-8');
    expect(src).not.toMatch(/mapboxgl/);
  });
});
```

**Verification proof:** `_site/assets/` already shows `bee-header-DNHAQll3.js` as a separate chunk from `index-pgqDAatT.js` — Pattern 2 (auto-discovered MPA chunk) is empirically working today. The species chunk just adds another `<script type="module">` reference.

**Caveat (planner decision):** if `npm run build` in `beforeAll` is too slow for the standard test suite, split this into a CI-only script invoked separately from `npm test`. RESEARCH.md line 651 flags this option.

---

## Shared Patterns

### Path resolution (build-time + tests)
**Source:** `_data/build.js:1-7` and `src/tests/seed-species-photos.test.ts:262-267`
**Apply to:** `_data/species.js`, `_data/photos.js`, every test file
```javascript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
```
This is THE repo idiom for "find a file relative to the script that's running." Every new build-time and test file uses it.

### Light-DOM Lit class shape (D-05)
**Source:** RESEARCH.md Pattern 1 + `node_modules/lit-element/development/lit-element.js:95-130` (no in-repo precedent)
**Apply to:** `src/species/bee-species-page.ts`, `src/species/bee-species-card.ts`
```typescript
@customElement('TAG-NAME')
export class ClassName extends LitElement {
  // ...@state / @property declarations...
  protected createRenderRoot(): HTMLElement {
    return this;
  }
  // INTENTIONAL: do NOT define render() — see Phase 80 RESEARCH.md Pattern 1.
}
```
Locked in by `src/tests/bee-species-card.test.ts` (`expect(BeeSpeciesCard.prototype.render).toBe(LitElement.prototype.render)`) — Pitfall 1 mitigation.

### Lit class import block
**Source:** `src/bee-header.ts:1-2`
**Apply to:** `src/species/bee-species-page.ts` (with `state`), `src/species/bee-species-card.ts` (with `property`)
```typescript
import { LitElement } from 'lit';
import { customElement, state /* or property */ } from 'lit/decorators.js';
```
Drop `css` and `html` since skeleton classes have no `render()` and Phase 81 introduces styles.

### `// @ts-expect-error` for JS imports from TS tests
**Source:** `src/tests/seed-species-photos.test.ts:8` (and `src/tests/validate-species.test.ts:6`)
**Apply to:** `src/tests/data-species.test.ts`, `src/tests/data-photos.test.ts`
```typescript
// @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
import species from '../../_data/species.js';
```
The data feeds are ES modules with no type declarations; this is the established way to import them from a typechecked test.

### Vitest `describe`/`test` shape
**Source:** `src/tests/seed-species-photos.test.ts:1` and every other test file
**Apply to:** every new test file
```typescript
import { describe, test, expect } from 'vitest';
```
No `beforeEach`/`afterEach` is needed for any Phase 80 test (state is loaded once per file). `beforeAll` is needed only in `build-output.test.ts` to invoke the build.

### URL contract for SPA deep-link
**Source:** `src/url-state.ts:35-38`
**Apply to:** `_pages/species.njk` "Open in atlas" link
```html
<a href="/?taxon={{ sp.scientificName | urlencode }}">Open in atlas</a>
```
Phase 80 emits a deliberately partial URL — `taxon` only. `src/url-state.ts:88` requires both `taxon` AND `taxonRank` to apply the filter; without `taxonRank` the SPA opens unfiltered. Phase 81 LINK-01 introduces `buildSpaTaxonLink(name, 'species')` and the existing anchor is rewritten then. RESEARCH.md Pitfall 2.

### Vite MPA chunk auto-discovery (no config changes)
**Source:** `eleventy.config.js:42-75` (`appType: "mpa"`); `vite.config.ts` (no `rollupOptions.input`); empirical proof in `_site/assets/bee-header-DNHAQll3.js`
**Apply to:** `_pages/species.njk` script tag
```html
<script type="module" src="/src/entries/species.ts"></script>
```
NO changes to `vite.config.ts` or `eleventy.config.js` required. Plugin-vite's MPA mode auto-discovers entries from any `<script type="module">` in any emitted HTML.

---

## No Analog Found

None. Every Phase 80 file has at least a role-match precedent. The novel patterns (light-DOM Lit + no `render()`, post-build integration test in Vitest) are documented in RESEARCH.md Pattern 1 / Pattern 4 with verification grounded in `node_modules/lit-element/development/lit-element.js` and the existing `bee-header-*.js` chunk emission.

## Metadata

**Analog search scope:**
- `_data/` — 1 file (`build.js`)
- `_layouts/` — 2 files (`default.njk`, `base.njk`)
- `_pages/` — 2 files (`index.html`, `scaffold-check.njk` — empty)
- `src/entries/` — 1 file (`bee-header.ts`)
- `src/` — `bee-header.ts`, `bee-atlas.ts`, `filter.ts`, `url-state.ts` (sampled)
- `src/tests/` — `seed-species-photos.test.ts`, `validate-species.test.ts`
- `eleventy.config.js`, `vite.config.ts`, `package.json`
- `_site/assets/` — verified chunk-split precedent

**Files scanned:** 14 distinct precedent files
**Pattern extraction date:** 2026-05-04

---

## PATTERN MAPPING COMPLETE

**Phase:** 80 — Page Scaffolding
**Files classified:** 13
**Analogs found:** 13 / 13

### Coverage
- Files with exact analog: 7 (`_data/species.js`, `_data/photos.js`, `src/entries/species.ts`, `src/tests/arch.test.ts`, `src/tests/page-scaffold.test.ts`, `src/tests/build-output.test.ts`, plus structural mirrors of `seed-species-photos.test.ts` for the unit tests)
- Files with role-match analog: 6 (`_pages/species.njk` mirrors `_pages/index.html` shape; the two Lit components mirror `src/bee-header.ts`'s decorator/class shape; the three remaining unit tests mirror `seed-species-photos.test.ts`)
- Files with no analog: 0

### Key Patterns Identified
- All build-time + test files use the `dirname(fileURLToPath(import.meta.url))` + `../` repo-root idiom (`_data/build.js:1-7` is canonical).
- Light-DOM Lit + omitted `render()` is novel for this repo; locked in by a `prototype.render === LitElement.prototype.render` Vitest assertion (Pitfall 1 mitigation).
- Vite MPA chunk-splitting requires NO config changes — `_site/assets/bee-header-DNHAQll3.js` proves Pattern 2 is working today.
- Vitest source-analysis (`readFileSync` + regex) is the existing repo-wide arch-test idiom (`seed-species-photos.test.ts:269-320`); `arch.test.ts` extends it to enforce the ARCH-04 import boundary.
- The "Open in atlas" deep-link is intentionally partial in Phase 80 (`taxon=` only, no `taxonRank=`); `src/url-state.ts:87-89` gracefully ignores partial URLs by opening unfiltered.

### File Created
`.planning/phases/080-page-scaffolding/080-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns in PLAN.md files.
