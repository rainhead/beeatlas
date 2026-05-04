# Phase 80: Page Scaffolding — Research

**Researched:** 2026-05-04
**Domain:** Eleventy 3.x MPA + Vite multi-entry + Lit 3 light-DOM custom elements; build-time data feed (JSON/TOML); architectural-invariant Vitest source-analysis
**Confidence:** HIGH — every load-bearing claim verified directly against the local repo (vite/eleventy config, existing build output, lit-element source in node_modules) or against locked context/CLAUDE.md.

## Summary

Phase 80 is mostly composition: every primitive is already in the repo (Eleventy MPA via plugin-vite, side-effect Vite entries, light-DOM Lit components in `bee-header`, `_data/*.js` build-time feeds, source-analysis Vitest tests, validate-* CLI gates). The work is to (a) write `_pages/species.njk`, (b) add two thin `_data/*.js` modules, (c) ship two skeleton Lit classes that override `createRenderRoot` to render into themselves and rely on Lit's default `render() = noChange` to NOT clobber Eleventy's server-rendered children, (d) add a single new architectural-invariant Vitest file, and (e) regenerate the SVGs that Phase 78 should have produced (the `public/data/species-maps/` directory does not currently exist on disk — verified).

The riskiest area is D-05 (light-DOM Lit with no `render()`). Direct inspection of `node_modules/lit-element/development/lit-element.js` confirms the default `render()` returns `noChange`, and `lit-html`'s `render(noChange, container)` is a no-op — so combining `createRenderRoot() { return this }` with NO `render()` override does preserve server-rendered children. This is the right pattern; the discoverable Lit docs do not advertise it but the source unambiguously supports it.

**Primary recommendation:** Mirror `bee-header.ts` precisely for both `bee-species-page.ts` and `bee-species-card.ts`: `@customElement('...')` + `extends LitElement` + `@property`/`@state` declarations + override `createRenderRoot() { return this }` + NO `render()`. Wire `_pages/species.njk` to `layout: default.njk`, render every species via Nunjucks loop, reference `<script type="module" src="/src/entries/species.ts">`, and let plugin-vite's MPA auto-discovery emit a separate `species-*.js` chunk (verified pattern: `bee-header-DNHAQll3.js` already exists in `_site/assets/` as proof). Architectural test reads each `src/species/*.ts` file via `readFileSync`, regexes its `import` lines, asserts no forbidden module appears.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Server-render one card per species | Eleventy SSG (build) | — | Static hosting only — no runtime; cards are content not interaction. |
| Read species roster (~735 rows) | Build-time `_data/*.js` (Node) | — | Eleventy's data cascade; Pitfall #8 mandates JSON not parquet to keep HMR fast. |
| Read photo manifest (TOML) | Build-time `_data/*.js` (Node) | — | `@iarna/toml` already a dep; same data-cascade pattern. |
| Coordinate page-level state (taxonPath, geo, season) | `<bee-species-page>` Lit element (browser) | — | ARCH-03 invariant — coordinator owns reactive state for the page. Phase 80 declares fields with empty defaults; Phase 81 wires events/URL. |
| Render skeleton card content | Eleventy template (build) | `<bee-species-card>` (browser) | Markup is server-rendered; the custom element is a behavior-attachment shell that Lit upgrades on connection. |
| Lazy-load images / map SVG | Browser native (`loading="lazy"` + `content-visibility: auto`) | — | No JS code-paths needed; pure HTML/CSS attributes. PAGE-07. |
| SPA deep-link `/?taxon=…` | Eleventy template (build, plain `<a href>`) | — | URL contract owned by `src/url-state.ts`; Phase 80 emits the static href (`?taxon=<name>` only — no `taxonRank` because LINK-01 work lives in Phase 81). |
| Architectural boundary enforcement | Vitest source-analysis (build-test) | — | Existing pattern: `validate-species.test.ts`, `seed-species-photos.test.ts`. Static `readFileSync` + regex over `src/species/**`. |
| Bundle-chunk separation (`species-*.js`) | Vite plugin-vite MPA mode (build) | — | Verified working today: `bee-header-*.js` already split as a peer chunk to `index-*.js` in `_site/assets/`. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| lit | ^3.2.1 | Custom-element base for `bee-species-page` and `bee-species-card` | [VERIFIED: package.json] — the project's only Lit version; `bee-header` already follows this exact light-DOM pattern. |
| @11ty/eleventy | ^3.1.5 | Server-side rendering of `_pages/species.njk` via Nunjucks | [VERIFIED: package.json] |
| @11ty/eleventy-plugin-vite | ^7.1.1 | MPA-mode auto-discovery of `<script type="module">` entries; chunk-splitting | [VERIFIED: package.json + `_site/assets/bee-header-*.js` confirms separate chunk emission today] |
| @iarna/toml | ^2.2.5 | Sync TOML parse for `_data/photos.js` | [VERIFIED: package.json + `node_modules/@iarna/toml/toml.js` exposes `exports.parse` synchronously]. Already used by `scripts/seed-species-photos.mjs` and `scripts/validate-species.mjs` (sync `TOML.parse(readFileSync(...))`). |
| vitest | ^4.1.2 | Architectural-invariant test runner | [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:fs | built-in | `readFileSync` for JSON/TOML in `_data/*.js` and arch test | Mirror `_data/build.js` (already uses `readFileSync` synchronously). |
| node:path | built-in | Resolve `public/data/species.json` and `content/species-photos.toml` from repo root | Mirror `_data/build.js`'s `dirname(fileURLToPath(import.meta.url))` pattern. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `readFileSync` in `_data/species.js` | `fs/promises.readFile` | Both work in Eleventy 3.x. Sync mirrors `_data/build.js` exactly; one fewer concept. **Recommend sync.** |
| Single Nunjucks loop in `species.njk` | Per-card `{% macro %}` | Macro is reusable for Phase 81's grid component, but Phase 80 has only one consumer; YAGNI. **Recommend single loop**, refactor later if Phase 81 needs it. |
| Inline SVG occurrence map | `<img src=".svg">` | LOCKED (D-03) — `<img>`. |
| Lit class with `render() { return html\`<slot…>\` }` | Skeleton class with NO render | LOCKED (D-05) — preserve Eleventy markup; default `render() → noChange` is a no-op. |
| Add a `validate-page.mjs` step to `npm run build` | Rely on Vitest arch test only | Vitest already runs in CI/`npm test`; an extra .mjs gate adds a new failure mode without new coverage. **Recommend Vitest only.** |

**Installation:** No new dependencies needed. Every package above is already in `package.json`.

**Version verification:**
- `npm view lit version` → 3.4.0 latest at time of writing; pinned at 3.2.1 locally. Pinning is fine; the patterns we use (`@customElement`, `createRenderRoot`, `@property`) are stable across all 3.x.
- `npm view @11ty/eleventy version` → 3.1.x line current. [VERIFIED: project at 3.1.5]
- `npm view @11ty/eleventy-plugin-vite version` → 7.1.x line current. [VERIFIED: project at 7.1.1]
- `npm view @iarna/toml version` → 2.2.5 (stable since 2018; only library that round-trips both ways without reformatting per Pitfall #20 in PITFALLS.md).

## Architecture Patterns

### System Architecture Diagram

```
                         BUILD TIME (Eleventy + Vite)
+---------------------------------+      +-------------------------------------+
| public/data/species.json (735)  | ---> | _data/species.js                    |
| Phase 78 output                 |      | { tree, flat, byScientificName }    |
+---------------------------------+      +-------------------------------------+
                                                            |
+---------------------------------+      +-------------------------------------+
| content/species-photos.toml     | ---> | _data/photos.js                     |
| Phase 79 output (~735 species,  |      | Record<scientificName,              |
|  1424 photos, descriptions      |      |   { description, photos[] }>        |
|  almost all empty)              |      +-------------------------------------+
+---------------------------------+                         |
                                                            v
                                  +-------------------------------------------+
                                  | _pages/species.njk                        |
                                  | layout: default.njk                       |
                                  | permalink: /species/index.html            |
                                  | <bee-species-page>                        |
                                  |   {%- for s in species.flat -%}           |
                                  |     <bee-species-card>                    |
                                  |       <h2>{{ s.scientificName }}</h2>     |
                                  |       {% if photos[s.scientificName].photos[0] %}
                                  |         <img loading="lazy" ... />        |
                                  |       {% endif %}                         |
                                  |       {% if s.occurrence_count > 0 %}     |
                                  |         <img src="/data/species-maps/...">|
                                  |       {% endif %}                         |
                                  |       …attribution… …description…         |
                                  |       <a href="/?taxon={{ s.sciName|url_encode }}">|
                                  |     </bee-species-card>                   |
                                  |   {%- endfor -%}                          |
                                  | </bee-species-page>                       |
                                  | <script type="module"                     |
                                  |   src="/src/entries/species.ts"></script> |
                                  +-------------------------------------------+
                                                            |
                              Vite plugin-vite MPA auto-discovery
                                                            v
                                  +-------------------------------------------+
                                  | _site/species/index.html                  |
                                  | _site/assets/species-<hash>.js  (NEW)     |
                                  | _site/assets/bee-header-<hash>.js (today) |
                                  | _site/assets/index-<hash>.js (SPA only)   |
                                  +-------------------------------------------+

                         PAGE LOAD (browser)
                                  |
                                  v
                              Eleventy markup parses
                                  |
                              <script type="module"> fetches species-*.js
                                  |
                              import 'bee-header.ts'         (registers <bee-header>)
                              import 'bee-species-page.ts'   (registers <bee-species-page>)
                              import 'bee-species-card.ts'   (registers <bee-species-card>)
                                  |
                              Custom elements upgrade on connection.
                              Lit's default render() returns noChange  ⇒  pre-rendered
                              children PRESERVED. @property/@state reactive but with
                              empty defaults in Phase 80; nothing to react to yet.
```

### Recommended Project Structure
```
.
├── _data/
│   ├── build.js                 # existing — version metadata
│   ├── species.js               # NEW — readFileSync(public/data/species.json)
│   └── photos.js                # NEW — TOML.parse(readFileSync(content/species-photos.toml))
├── _pages/
│   ├── index.html               # existing — SPA entry
│   ├── scaffold-check.njk       # existing
│   └── species.njk              # NEW — Nunjucks loop emitting one card per species
├── src/
│   ├── entries/
│   │   ├── bee-header.ts        # existing
│   │   └── species.ts           # NEW — side-effect imports
│   ├── species/                 # NEW directory — entire ARCH-04 boundary
│   │   ├── bee-species-page.ts  # NEW — coordinator (skeleton)
│   │   └── bee-species-card.ts  # NEW — presenter (skeleton)
│   └── tests/
│       └── arch.test.ts         # NEW — ARCH-04 source-analysis test
└── public/data/species-maps/    # MUST be regenerated (does not exist on disk today)
```

### Pattern 1: Light-DOM Lit element that preserves server-rendered children

**What:** Override `createRenderRoot` to return `this` (the host element). Do not define a `render()` method. Lit's default `render()` returns `noChange` (literal export from `lit-html`), which `lit-html`'s render commits as a no-op. Result: pre-rendered light-DOM children are untouched on first upgrade and on every property change.

**When to use:** Any time Eleventy server-renders the markup and the custom element only adds reactive behavior (event handlers, deep-link logic, future filter wiring). Phase 80 cards have no behavior yet — but the pattern locks in for Phase 81.

**Verification (HIGH confidence):** Read `node_modules/lit-element/development/lit-element.js` lines 95–130:
```js
createRenderRoot() {
    const renderRoot = super.createRenderRoot();
    this.renderOptions.renderBefore ??= renderRoot.firstChild;
    return renderRoot;
}
update(changedProperties) {
    const value = this.render();      // override returns noChange
    super.update(changedProperties);
    this.__childPart = render(value, this.renderRoot, this.renderOptions);
}
render() {
    return noChange;                  // default — no-op when committed
}
```

**Example (recommended skeleton):**
```typescript
// Source: bee-header.ts (existing) + Lit 3 source
// src/species/bee-species-card.ts
import { LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('bee-species-card')
export class BeeSpeciesCard extends LitElement {
  // Empty-defaults @property fields for Phase 81 to wire onto.
  // Phase 80 card has no behavior yet — declarations are forward-looking only.
  @property({ attribute: false }) scientificName = '';
  @property({ attribute: false }) slug = '';
  @property({ type: Number }) occurrenceCount = 0;

  // Light-DOM: render into the host element directly.
  // Eleventy server-rendered our children; we MUST NOT clobber them.
  protected createRenderRoot(): HTMLElement {
    return this;
  }

  // INTENTIONALLY no render() override.
  // Inherited default: render() => noChange  ⇒  lit-html commits a no-op,
  // pre-rendered children survive (verified in lit-element source).
}
```

### Pattern 2: Eleventy MPA chunk auto-discovery

**What:** `@11ty/eleventy-plugin-vite` runs Vite in `appType: "mpa"` mode (verified in `eleventy.config.js` line 47). MPA mode auto-discovers entries from every `<script type="module" src="...">` in every emitted HTML file. Each unique entry becomes its own Rollup chunk. Shared transitive imports are factored into shared chunks via Rollup's default code-splitting.

**When to use:** Whenever a new page needs its own JS bundle. NO `vite.config.ts` changes; NO `build.rollupOptions.input` entries. Just reference the entry from the page's HTML.

**Verification (HIGH confidence):** Inspect `_site/assets/` from a current build:
```
bee-header-DNHAQll3.js   ← split from default.njk's <script src="/src/entries/bee-header.ts">
bee-sidebar-DcMmFt5l.js  ← dynamic import code-split from bee-atlas
bee-table-CTumM_KA.js    ← dynamic import code-split from bee-atlas
index-pgqDAatT.js         ← _pages/index.html's <script src="./src/bee-atlas.ts"> chunk
index-B_7PMgUM.css
wa-sqlite-Bkv7CwRB.wasm
```
The `bee-header-*.js` chunk is ~few KB — exactly the same shape `species-*.js` will take. PAGE-09 succeeds by adding the script tag; nothing else is required.

**Example:**
```html
<!-- _pages/species.njk (excerpt) -->
---
layout: default.njk
permalink: /species/index.html
title: Species — BeeAtlas
---
<bee-species-page>
  {%- for sp in species.flat -%}
  <bee-species-card>
    <h2>{{ sp.scientificName }}</h2>
    {%- set photoEntry = photos[sp.scientificName] -%}
    {%- if photoEntry and photoEntry.photos and photoEntry.photos[0] -%}
      {%- set p = photoEntry.photos[0] -%}
      <img loading="lazy" src="{{ p.url }}" alt="{{ sp.scientificName }}">
      <p class="attribution">{{ p.attribution }}</p>
    {%- endif -%}
    {%- if sp.occurrence_count > 0 -%}
      <img loading="lazy"
           src="/data/species-maps/{{ sp.slug }}.svg"
           alt="Occurrence map for {{ sp.scientificName }}">
    {%- endif -%}
    {%- if photoEntry and photoEntry.description -%}
      <p class="description">{{ photoEntry.description }}</p>
    {%- endif -%}
    <a href="/?taxon={{ sp.scientificName | urlencode }}">Open in atlas</a>
  </bee-species-card>
  {%- endfor -%}
</bee-species-page>
<script type="module" src="/src/entries/species.ts"></script>
```

```typescript
// src/entries/species.ts — exact analog of bee-header.ts
// Side-effect imports register custom elements via @customElement decorators.
import '../bee-header.ts';
import '../species/bee-species-page.ts';
import '../species/bee-species-card.ts';
```

### Pattern 3: Build-time data feed (Pitfall #8 mitigation)

**What:** `_data/*.js` modules read pre-aggregated JSON/TOML synchronously at build time. Eleventy caches the result for the server's lifetime; HMR stays sub-100ms. NO parquet reading — that was the failure mode Pitfall #8 catalogued.

**Source pattern:** `_data/build.js` (existing, verified).

**Example:**
```javascript
// _data/species.js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const speciesJsonPath = join(repoRoot, 'public/data/species.json');

const flat = JSON.parse(readFileSync(speciesJsonPath, 'utf8'))
  .slice() // do not mutate cached array
  .sort((a, b) => a.scientificName.localeCompare(b.scientificName));

const byScientificName = Object.fromEntries(
  flat.map(s => [s.scientificName, s])
);

// Hierarchical tree for Phase 81 (NAV-01..05).
// Phase 80 only consumes `flat`; build the tree anyway so PAGE-02 contract is met.
const tree = buildTree(flat); // family → subfamily → tribe → genus → subgenus → species

export default { tree, flat, byScientificName };

function buildTree(rows) {
  // Skeleton implementation — populate enough to satisfy "exports tree" contract.
  // Phase 81 hardens this when nav UI lands.
  const root = { children: new Map() };
  for (const r of rows) {
    let node = root;
    for (const level of ['family', 'subfamily', 'tribe', 'genus', 'subgenus']) {
      const key = r[level] ?? null; // null is a valid level (e.g. no subgenus)
      if (!node.children.has(key)) node.children.set(key, { children: new Map(), rows: [] });
      node = node.children.get(key);
    }
    node.rows.push(r);
  }
  // Convert Maps to plain objects for Nunjucks consumption.
  return toPlain(root);
}
function toPlain(n) {
  return {
    rows: n.rows ?? [],
    children: Object.fromEntries(
      [...n.children].map(([k, v]) => [String(k), toPlain(v)])
    ),
  };
}
```

```javascript
// _data/photos.js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import TOML from '@iarna/toml';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const tomlPath = join(repoRoot, 'content/species-photos.toml');

const manifest = TOML.parse(readFileSync(tomlPath, 'utf8'));
const speciesTable = manifest.species ?? {};

const result = {};
for (const [name, entry] of Object.entries(speciesTable)) {
  const description = typeof entry.description === 'string'
    ? entry.description.trim()
    : '';
  const photos = (entry.photos ?? [])
    .slice()
    .sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0));
  result[name] = { description, photos };
}

export default result;
```

### Pattern 4: Source-analysis architectural test

**What:** Vitest reads each `.ts` file under `src/species/` synchronously, applies a regex over `import` lines, asserts no forbidden module name appears. Same shape as `validate-species.test.ts` and `seed-species-photos.test.ts` (both verified to import `.mjs` named exports and parse fixture text).

**Example:**
```typescript
// src/tests/arch.test.ts
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');
const SPECIES_DIR = resolve(REPO_ROOT, 'src/species');

const FORBIDDEN = [
  'mapbox-gl',
  'wa-sqlite',
  '../sqlite.ts',
  '../sqlite',          // bare-extension form
  '../filter.ts',
  '../filter',
  '../bee-map.ts',
  '../bee-map',
  '../bee-atlas.ts',
  '../bee-atlas',
];

// Match `from '...';` and `import '...';` — both forms used in this codebase.
// Capture the bare module specifier; tolerant of single/double quotes and trailing semicolon/whitespace.
const IMPORT_RE = /(?:from|import)\s+['"]([^'"]+)['"]/g;

function listFiles(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .flatMap(d => {
        const p = join(dir, d.name);
        if (d.isDirectory()) return listFiles(p);
        return d.isFile() && d.name.endsWith('.ts') ? [p] : [];
      });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

describe('ARCH-04: src/species boundary (PAGE-08)', () => {
  const files = listFiles(SPECIES_DIR);

  test('src/species/ exists and contains TypeScript files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const rel = file.slice(REPO_ROOT.length + 1);
    test(`${rel} does not import forbidden modules`, () => {
      const src = readFileSync(file, 'utf8');
      const imports = [...src.matchAll(IMPORT_RE)].map(m => m[1]);
      const violations = imports.filter(spec =>
        FORBIDDEN.some(bad => spec === bad || spec.startsWith(bad + '/'))
      );
      expect(violations, `${rel} imports forbidden: ${violations.join(', ')}`)
        .toEqual([]);
    });
  }
});
```

### Anti-Patterns to Avoid

- **Adding `vite.config.ts` `build.rollupOptions.input`** for the species entry. The existing build proves auto-discovery works; explicit inputs would conflict with plugin-vite's MPA `appType` and risk breaking the SPA's auto-discovery. Anti-pattern flagged in 074-RESEARCH.md (referenced by `eleventy.config.js` comment) — "do NOT set viteOptions.root or viteOptions.build.outDir".
- **Defining `render() { return html\`...\` }` with `<slot>`** on `bee-species-card`. Light-DOM elements have no shadow root → `<slot>` is meaningless and Lit will replace your server-rendered children with a slot stub. The skeleton class must NOT define render at all.
- **Reading `species.parquet` from `_data/species.js`.** Pitfall #8. Use `species.json`.
- **Constructing `/?taxon=X&taxonRank=species`** in Phase 80. The `taxonRank` part lives in Phase 81 (LINK-01) via the shared `buildSpaTaxonLink()` helper. Phase 80's deep-link is the simpler `/?taxon=<name>` per D-02 — a deliberately partial URL the SPA gracefully ignores until LINK-01 ships. Note: `src/url-state.ts:88` says BOTH params required for the filter to apply; a `taxon`-only URL just opens the SPA unfiltered, which is acceptable Phase-80 behavior.
- **Hand-rolling Markdown rendering** for descriptions. D-02 locked plain text; descriptions are empty for ~all species today. Defer Markdown until at least one description exists that needs it.
- **Using `import.meta.glob` to load species** in the species entry. Static analysis of imports breaks; arch test would falsely pass while bundle size drifts. Stay with explicit `import '../species/...';` lines.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOML parsing | A regex/TOML parser | `@iarna/toml` (dep already) | Edge cases (multi-line strings, table arrays, hex/octal numbers) — already battle-tested by `seed-species-photos.mjs`. |
| Hierarchical tree builder | Recursive Map-of-Map merge with custom `Symbol` sentinels | Plain nested-object reduce as shown in Pattern 3 | Eleventy's Nunjucks engine traverses plain objects naturally; complex sentinels just add a translation step. |
| Custom-element registration | A manual `customElements.define(...)` boilerplate | `@customElement('...')` decorator from `lit/decorators.js` | The codebase has standardized on the decorator (every existing element). |
| AST-based architectural test | Babel/typescript parse | `readFileSync` + import-line regex | The existing `validate-species.test.ts` is the precedent: regex over source text is fast (<10ms), works for the import shapes the codebase uses, and makes false positives explicit (a malformed import would not match — but the typecheck step would already have failed). |
| Async `_data/*.js` | `await readFile(...)` + manual cache | Sync `readFileSync` mirroring `_data/build.js` | Eleventy 3.x supports both. Sync is simpler, faster startup, and matches the precedent. |

**Key insight:** Phase 80's whole job is composition of existing primitives. Every "could we just write…" instinct should be answered by "no — there's already a pattern in the repo for that."

## Runtime State Inventory

Phase 80 is **greenfield**: it adds new files (`_pages/species.njk`, `_data/species.js`, `_data/photos.js`, `src/entries/species.ts`, `src/species/*.ts`, `src/tests/arch.test.ts`) and one new permalink (`/species/index.html`). No renames, no migrations, no string replacements.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — verified by inspection of `data/beeatlas.duckdb`, no schema changes needed. | none |
| Live service config | None — verified, no external services configured for the species page. | none |
| OS-registered state | None — verified by inspection of nightly cron (`data/nightly.sh`) — no new cron entries needed. | none |
| Secrets/env vars | None — page uses no API keys at build or runtime. | none |
| Build artifacts | **`public/data/species-maps/` does not exist on disk** — verified via `ls`. Phase 78's wipe-and-rewrite policy (D-04) regenerates this directory each pipeline run; the directory is therefore not committed to git. The Phase 78 SVG step has not run since some clean-up. **Action:** before Phase 80 verification, run `cd data && uv run python species_maps.py` (or full `uv run python run.py`) to populate `public/data/species-maps/<slug>.svg` for every species with `occurrence_count > 0`. | data-pipeline run (precondition; see Open Questions Q1) |

**Greenfield qualifier:** the only "runtime state" concern is the Phase 78 build artifact above. Treat it as a Wave 0 / dependency-check task in the plan, not as a code task.

## Common Pitfalls

### Pitfall 1: Lit clobbers server-rendered children because someone added `render()`

**What goes wrong:** A future contributor sees an empty class and adds `render() { return html\`<slot></slot>\`; }` "for completeness." On the next deploy, every server-rendered card's children disappear.

**Why it happens:** Light-DOM Lit + no `render()` is genuinely unusual; it looks like a half-finished class. The pattern is unfamiliar enough that "fixing" it feels like progress.

**How to avoid:**
- Add a `// INTENTIONAL: do NOT define render() — see Phase 80 RESEARCH.md Pattern 1` comment above each class.
- Add a Vitest assertion: `expect(BeeSpeciesCard.prototype.render).toBe(LitElement.prototype.render)` — fails the moment someone shadows it.
- Reference the lit-element source line numbers in the comment for posterity.

**Warning signs:** Cards appear blank in production but the HTML source shows children. Hot-reload during dev "works" because Eleventy re-emits markup on every save — only production reveals the bug.

### Pitfall 2: `/species/` deep-link doesn't filter the SPA because `taxonRank` is missing

**What goes wrong:** D-02 specifies `/?taxon=<scientificName>` for the "Open in atlas" link. `src/url-state.ts:87-89` requires BOTH `taxon` AND `taxonRank` for the filter to apply: `const resolvedTaxonName = (taxonName && taxonRank) ? taxonName : null;`. A `taxon`-only URL opens the SPA unfiltered.

**Why it happens:** This is intentional partial behavior in Phase 80 (LINK-01 lands in Phase 81). But unwary planners may "fix" the link to include `&taxonRank=species` — that's correct in spirit but the helper to construct it lives in Phase 81.

**How to avoid:** Document explicitly in `_pages/species.njk` that the link is partial-by-design. Phase 81's plan reuses the same anchor, swapping `href` to `buildSpaTaxonLink(name, 'species')`.

**Warning signs:** The link works locally because dev defaults populate the filter eventually. Production URL is just `/?taxon=Bombus+mixtus` — still loads the full map. Phase 81 fixes; Phase 80 ships partial.

### Pitfall 3: Architectural test passes despite forbidden import

**What goes wrong:** The arch test regex (`from\s+['"]([^'"]+)['"]/g`) misses re-export shapes like `export { foo } from '...';` or dynamic `import('...')`. A future contributor adds `import('../bee-map.ts')` to lazy-load — bundle bloats by 1.7 MB.

**How to avoid:** Extend the regex to also match `export\s+.*\s+from\s+['"]([^'"]+)['"]` and `import\s*\(\s*['"]([^'"]+)['"]`. Document in test comments that these forms are also covered. Add a fixture test: write a temporary file in `src/species/` with each shape, assert each is caught.

**Warning signs:** `npm test` green, `_site/assets/species-*.js` size > 100 KB, Lighthouse warns about main-thread JS.

### Pitfall 4: SVG references in Eleventy markup 404 because the species-maps directory is empty

**What goes wrong:** `_data/species.js` reports `occurrence_count > 0` for ~556 species (per Phase 78 numbers). The Nunjucks template emits `<img src="/data/species-maps/<slug>.svg">` for every one. But the directory is currently empty (verified). Production deploy ships 556 broken-image icons.

**How to avoid:** Wave 0 / dependency check task: confirm `public/data/species-maps/` is populated. If not, run `cd data && uv run python species_maps.py`. Add a CI check (or a one-time verification step in the plan) that `ls public/data/species-maps/*.svg | wc -l` >= the count of species with `occurrence_count > 0` minus a small slack. Alternatively, `_data/species.js` could probe `existsSync(path.join('public/data/species-maps', sp.slug + '.svg'))` and emit `mapAvailable: true|false`, and the template could conditionalize on that field — defensive, but doubles the failure modes (file present at build, missing at deploy = different failure). **Recommend the first option** (populate the directory; trust the contract).

**Warning signs:** Browser DevTools shows 404s on `/data/species-maps/*.svg` after a clean build.

### Pitfall 5: HMR loop slows because `_data/photos.js` parses 15K-line TOML on every change

**What goes wrong:** `content/species-photos.toml` is 15,020 lines. `@iarna/toml` is reasonably fast but parsing on every page change in dev mode could add tens of milliseconds.

**How to avoid:** Eleventy 3.x caches `_data/*.js` exports for the server's lifetime — the parse happens once per `npm run dev` startup, not per page change. Verified by the precedent of `_data/build.js` running `git rev-parse` (subprocess fork — slow) only at startup.

**Warning signs:** `npm run dev` takes >2s to first-byte. If observed, profile and consider a precomputed JSON view of the manifest emitted by the data pipeline (defer to Phase 82 if it actually shows up).

## Code Examples

### Reading the species roster (build time)
See Pattern 3 above — `_data/species.js` recipe.

### Reading the photo manifest (build time)
See Pattern 3 above — `_data/photos.js` recipe.

### Skeleton coordinator with placeholder filter types
```typescript
// src/species/bee-species-page.ts
import { LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';

// Phase 81 will populate these. Phase 80 nails down the shape so Phase 81
// doesn't have to introduce them mid-flight.
//
// Aligned with src/filter.ts's FilterState shape (already in the codebase):
//   FilterState.selectedCounties: Set<string>
//   FilterState.selectedEcoregions: Set<string>
//   FilterState.months: Set<number>            (1..12)
//   FilterState.yearFrom / yearTo: number | null
//
// We mirror the SPA's Set<> + range shape so Phase 81's union/copy logic is
// trivial (the species-page filter is a STRICT SUBSET of the SPA filter).

export interface GeoFilter {
  counties: Set<string>;       // empty = no county filter
  ecoregions: Set<string>;     // empty = no ecoregion filter
}

export interface SeasonFilter {
  months: Set<number>;         // 1..12; empty = all months
  // Note: NOT a year range. FILT-02 specifies ?m0=&m1= (month range, not year).
  // If the design later wants a year filter, add it as a separate field.
}

@customElement('bee-species-page')
export class BeeSpeciesPage extends LitElement {
  // ARCH-03 / PAGE-05: coordinator owns reactive state; presenters never own it.
  // Phase 80: declarations only, no event wiring.
  @state() private _activeTaxonPath: string[] = [];
  @state() private _geoFilter: GeoFilter | null = null;
  @state() private _seasonFilter: SeasonFilter | null = null;

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  // INTENTIONAL: do NOT define render() — see Phase 80 RESEARCH.md Pattern 1.
}
```

### Verifying chunk separation post-build
```bash
# After `npm run build`:
ls _site/assets/ | grep -E '^(species|index|bee-header)-'
# Expect three distinct chunk hashes:
#   species-<hash>.js     — NEW
#   bee-header-<hash>.js  — existing (also imported by species entry → may dedup-share)
#   index-<hash>.js       — SPA only
```

```bash
# Verify mapbox-gl absent from species chunk:
grep -l "mapbox-gl" _site/assets/species-*.js && echo FAIL || echo OK
# Or, since the bundle is minified:
strings _site/assets/species-*.js 2>/dev/null | grep -c mapboxgl
# Expect 0.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Shadow-DOM Lit components for every element | Light-DOM via `createRenderRoot() { return this }` for SSR-friendly cases | Lit 2.x → 3.x — pattern now well-supported but still under-documented | We use it correctly; arch-test must lock it in. |
| Manual `vite.config.ts` `build.rollupOptions.input` for each entry | Auto-discovery via `<script type="module">` in HTML (MPA mode) | `@11ty/eleventy-plugin-vite` 7.x | One fewer config surface; entries declared at point of use. |
| Reading parquet at build time in `_data/*.js` | Pre-aggregating to JSON in the Python pipeline; `_data/*.js` reads the JSON | Phase 78 (this milestone) | Pitfall #8 mitigation. HMR < 100ms. |
| Inline SVG with interactive county highlighting | `<img src=".svg">` (D-03) | Phase 80 explicit decision | Smaller HTML; `loading="lazy"` works; defers interaction work to Phase 82. |

**Deprecated/outdated:**
- The seed example `/collection?taxon=...` (in `.planning/seeds/species-tab.md`): the SPA is at `/`, not `/collection`. Phase 80 uses `/?taxon=<name>`. Phase 81 LINK-01 finalizes to `/?taxon=<name>&taxonRank=species`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Eleventy 3.x preserves `_data/*.js` cache across page builds in `--serve` mode (fast HMR) | Pattern 3 | If false, HMR slows to ~hundreds of ms per change. Mitigation: precompute the manifest as JSON in the pipeline. |
| A2 | Vite `appType: "mpa"` auto-discovery picks up `<script type="module">` in any Eleventy-emitted HTML, not just the project root `index.html` | Pattern 2 | Verified empirically: `bee-header-*.js` chunk is in `_site/assets/` today, originating from `_layouts/default.njk`'s script tag. The species page reuses the exact same mechanism. Risk is LOW. |
| A3 | Lit's default `render() = noChange` survives unchanged across Lit 3.x patch versions | Pattern 1 | Verified against the local lit-element 4.2.2 (in `node_modules`). If a future Lit upgrade changes this, the arch test (Pitfall mitigation) would still catch it via a separate `expect(BeeSpeciesCard.prototype.render).toBe(LitElement.prototype.render)` assertion — recommend including. |
| A4 | `_data/photos.js`'s synchronous `TOML.parse(readFileSync(...))` of a 15K-line manifest takes < 200ms at Eleventy startup | Pitfall 5 | Mostly informational; if violated, profile and precompute. |
| A5 | The `species-maps/` directory will be populated by running `cd data && uv run python species_maps.py` against the current `data/beeatlas.duckdb` and that the SVGs produced will agree byte-for-byte with the `slug` column in `species.json` | Open Question Q1 | Verified by Phase 78 success criterion 4 (idempotent two-runs) and AGG-03 (slug agreement). Risk LOW. |

## Open Questions (RESOLVED)

1. **`public/data/species-maps/` is empty on disk. Should this be a Phase-80 task or a precondition check?**
   - What we know: Phase 78 wipe-and-rewrites this directory (D-04) so it's intentionally not committed; the pipeline must run before any consumer references it. Currently the directory does not exist.
   - What's unclear: whether Phase 80 should include "run the pipeline" as a Wave 0 task, or treat it as an environmental prerequisite (out of scope for the planner).
   - Recommendation: **Wave 0 task** — `cd data && uv run python species_maps.py` (or full `run.py`), assert `ls public/data/species-maps/*.svg | wc -l` ≥ 1, commit no SVGs (gitignored / build artifact). This makes Phase 80 self-contained: re-running it on a fresh checkout works.
   - RESOLVED: Phase 80 ships a Wave 0 task (Plan 01 Task 1) that regenerates `public/data/species-maps/` via the pipeline; SVGs remain gitignored.

2. **Does Eleventy 3.x's data cascade pass `default` exports correctly when the `_data/*.js` file is ESM (not CJS)?**
   - What we know: `_data/build.js` uses `export default { ... }` and works. Phase 80 mirrors this.
   - What's unclear: nothing — answered by precedent. Listed only for the planner's benefit.
   - RESOLVED: ESM `export default` works in the Eleventy 3.x data cascade; `_data/species.js` and `_data/photos.js` use it directly per Plan 02.

3. **Should the architectural test also assert that `src/species/*` files do NOT import via `import('...')` (dynamic)?**
   - What we know: Vite still bundles `import('...')` calls; a dynamic mapbox-gl import would still pull mapbox-gl into a code-split chunk that the species page would fetch.
   - Recommendation: **Yes** — extend the regex to cover `import\s*\(\s*['"]([^'"]+)['"]`. Pitfall 3 above. The cost is one extra regex; the benefit is the test's claim ("no forbidden import") becomes true.
   - RESOLVED: `src/tests/arch.test.ts` (Plan 01 Task 2) covers BOTH static `from '...'` and dynamic `import('...')` shapes via separate regexes (`STATIC_IMPORT_RE` and `DYNAMIC_IMPORT_RE`).

4. **Should `bee-species-page` lift the `<bee-header>` registration into `src/entries/species.ts`, or import it from inside `bee-species-page.ts`?**
   - What we know: D-06 says only `bee-species-page` and `bee-species-card` ship in Phase 80. ARCH-04 forbids `src/species/**` importing `../bee-atlas.ts` etc. but NOT `../bee-header.ts` (header is a leaf).
   - Recommendation: **Lift to entry**. `src/entries/species.ts` imports `'../bee-header.ts'` directly (mirrors the `bee-header.ts` entry). Keeps `src/species/` strictly bounded to species-tab concerns. Plays well with Phase 81 when more components join.
   - RESOLVED: `src/entries/species.ts` (Plan 03 Task 2) imports `'../bee-header.ts'` directly; `src/species/**.ts` never imports the header.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | All build steps | ✓ | v24.12.0 ([VERIFIED: `node --version`]) | — |
| `npm` packages | All build steps | ✓ | per package.json | — |
| `uv` (Python pipeline) | Regenerating `species-maps/` (precondition) | ✓ assumed (used in CLAUDE.md docs and prior phases) | — | If absent, ship without populating species-maps and skip the SVG slot per D-04. |
| `data/beeatlas.duckdb` | `species_maps.py` to regen SVGs | ✓ ([VERIFIED: `ls data/beeatlas.duckdb`]) | — | If absent, fetch from S3 cache via existing `data/nightly.sh` mechanism. |
| `public/data/species.json` | `_data/species.js` | ✓ ([VERIFIED: 735 species]) | — | None needed — this is committed. |
| `content/species-photos.toml` | `_data/photos.js` | ✓ ([VERIFIED: 735 species, 1424 photos, validator green per Phase 79 close]) | — | None — committed. |
| `public/data/species-maps/<slug>.svg` (×~556) | Map slot in cards | **✗ DIRECTORY MISSING** | — | Per D-04, omit map slot when SVG missing. The page renders correctly with all map slots elided — but that's not the desired Phase 80 behavior. **Action: regenerate as Wave 0 task.** |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:**
- `public/data/species-maps/*.svg` — D-04 lets cards render without the map slot. Phase 80 still ships if the pipeline can't run, but the demonstrated success criterion ("map renders for occurrence-bearing species") fails until the pipeline runs.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 ([VERIFIED: package.json `devDependencies`]) |
| Config file | `vite.config.ts` (test config inlined: `environment: 'happy-dom'`, exclusions for `_site/`, `node_modules/`, `.claire/`) |
| Quick run command | `npm test -- src/tests/arch.test.ts -t "ARCH-04"` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAGE-01 | `/species/index.html` is emitted, contains one `<bee-species-card>` per species | integration (build output) | `npm run build && test -f _site/species/index.html && grep -c '<bee-species-card' _site/species/index.html` (expect ≥ 735) | ❌ Wave 0 (`src/tests/page-build.test.ts` runs `eleventy --dry-run` or asserts on file post-build) |
| PAGE-01 | `_pages/species.njk` exists with `layout: default.njk` and `permalink: /species/index.html` | unit (file presence) | `npm test -- src/tests/page-scaffold.test.ts` (regex front-matter) | ❌ Wave 0 |
| PAGE-02 | `_data/species.js` reads `species.json` (NOT parquet) and exports `{ tree, flat, byScientificName }` | unit (import + shape) | `npm test -- src/tests/data-species.test.ts` — `import species from '../../_data/species.js'; expect(species.flat).toBeArray(); expect(species.byScientificName).toBeObject(); expect(species.tree).toBeObject();` plus `grep -L parquet _data/species.js` | ❌ Wave 0 |
| PAGE-03 | `_data/photos.js` reads TOML, sorts by `ordering`, exports `Record<scientificName, {description, photos[]}>` | unit (import + sort) | `npm test -- src/tests/data-photos.test.ts` — fixture-TOML with photos in scrambled `ordering` order, assert sorted | ❌ Wave 0 |
| PAGE-04 | `src/entries/species.ts` exists; only side-effect imports of `bee-header`, `bee-species-page`, `bee-species-card` | unit (source-text regex) | covered by `src/tests/arch.test.ts` (file-existence + import allowlist) | ❌ Wave 0 |
| PAGE-05 | `<bee-species-page>` declares `_activeTaxonPath`, `_geoFilter`, `_seasonFilter` as `@state` properties | unit (Lit instance shape) | `npm test -- src/tests/bee-species-page.test.ts` — `const el = new BeeSpeciesPage(); expect(el._activeTaxonPath).toEqual([]); expect(el._geoFilter).toBeNull(); expect(el._seasonFilter).toBeNull();` | ❌ Wave 0 |
| PAGE-06 (partial) | `<bee-species-card>` does NOT import from `bee-species-page.ts` | unit (source-text regex, included in arch test) | `src/tests/arch.test.ts` extension: assert `bee-species-card.ts` import lines do not match `bee-species-page` | ❌ Wave 0 |
| PAGE-07 | Every `<img>` carries `loading="lazy"` and every `<bee-species-card>` host applies `content-visibility: auto` | unit (rendered HTML grep) | post-build: `grep -c 'loading="lazy"' _site/species/index.html` ≥ (n_with_photo + n_with_map); CSS rule presence verified by `grep 'content-visibility' src/species/bee-species-card.ts` (or wherever the style is defined) | ❌ Wave 0 |
| PAGE-08 | No `src/species/**.ts` imports `mapbox-gl`, `wa-sqlite`, `../sqlite.ts`, `../filter.ts`, `../bee-map.ts`, `../bee-atlas.ts` (static AND dynamic) | unit (source-text regex) | `npm test -- src/tests/arch.test.ts` | ❌ Wave 0 |
| PAGE-09 | `_site/assets/species-*.js` exists; mapbox-gl symbols absent | integration (post-build) | `npm run build && ls _site/assets/species-*.js && ! grep -l mapboxgl _site/assets/species-*.js` | ❌ Wave 0 (`src/tests/build-output.test.ts` reads `_site/assets/` after `npm run build`; OR a separate CI step in plan) |
| D-05 lock | `BeeSpeciesCard.prototype.render === LitElement.prototype.render` (no override) | unit (prototype identity) | `npm test -- src/tests/bee-species-card.test.ts` — `expect(BeeSpeciesCard.prototype.render).toBe(LitElement.prototype.render); expect(BeeSpeciesCard.prototype.createRenderRoot.call({})).toBe({})` (returns `this`) | ❌ Wave 0 |
| D-04 (skip slot) | When `occurrence_count === 0`, `_pages/species.njk` does NOT emit a `<img>` for the map | unit (rendered HTML) | post-build snapshot test: pick a checklist-only species (e.g. `Agapostemon texanus` per fixture), assert no `species-maps/<slug>.svg` reference in its card subtree | ❌ Wave 0 |
| Skip when manifest empty | When photo manifest entry has zero `[[photos]]`, no `<img>` for the photo slot | unit (rendered HTML) | post-build snapshot: pick species with no photos, assert no `inaturalist-open-data` URL in its card subtree | ❌ Wave 0 |
| SVG precondition | `public/data/species-maps/*.svg` count ≥ 1 (population check) | environment (CI prerequisite) | `test $(ls public/data/species-maps/*.svg 2>/dev/null \| wc -l) -gt 0` — gates the `npm run build` step | ❌ Wave 0 (script + plan task) |

### Sampling Rate
- **Per task commit:** `npm test -- src/tests/arch.test.ts src/tests/bee-species-card.test.ts src/tests/bee-species-page.test.ts` (~ < 5s)
- **Per wave merge:** `npm test` (full Vitest suite)
- **Phase gate:** `npm run build && npm test` both green; `_site/species/index.html` exists; `_site/assets/species-*.js` exists; no `mapboxgl` symbols in species chunk.

### Wave 0 Gaps
- [ ] `src/tests/arch.test.ts` — covers PAGE-08 (and partial PAGE-06)
- [ ] `src/tests/bee-species-card.test.ts` — covers D-05 prototype-identity assertion + content-visibility presence
- [ ] `src/tests/bee-species-page.test.ts` — covers PAGE-05 state-shape
- [ ] `src/tests/data-species.test.ts` — covers PAGE-02
- [ ] `src/tests/data-photos.test.ts` — covers PAGE-03
- [ ] `src/tests/page-scaffold.test.ts` — covers PAGE-01 / PAGE-04 (front-matter, entry path)
- [ ] `src/tests/build-output.test.ts` (or split into a CI shell step in package.json) — covers PAGE-07 (lazy attrs in emitted HTML), PAGE-09 (chunk presence + no-mapbox), D-04 skip-slot snapshot
- [ ] No new framework install needed — Vitest 4.1.2 already in `devDependencies`.

## Sources

### Primary (HIGH confidence)
- `/Users/rainhead/dev/beeatlas/node_modules/lit-element/development/lit-element.js` — verified default `render() { return noChange; }`, `update()` calls render through `lit-html`'s render which is a no-op for `noChange`
- `/Users/rainhead/dev/beeatlas/eleventy.config.js` — verified `appType: "mpa"`, dirs (`_pages`, `../_layouts`, `../_data`), passthrough of `src/`
- `/Users/rainhead/dev/beeatlas/vite.config.ts` — verified `optimizeDeps.exclude: ['wa-sqlite']`, no `rollupOptions.input` (auto-discovery) confirms Pattern 2
- `/Users/rainhead/dev/beeatlas/package.json` — verified all dep versions, build chain order
- `/Users/rainhead/dev/beeatlas/_layouts/default.njk` and `_layouts/base.njk` — verified two-layer chain providing `<bee-header>` chrome
- `/Users/rainhead/dev/beeatlas/src/entries/bee-header.ts` — exact precedent for `src/entries/species.ts`
- `/Users/rainhead/dev/beeatlas/_data/build.js` — exact precedent for `_data/*.js` sync `readFileSync` pattern
- `/Users/rainhead/dev/beeatlas/src/url-state.ts` — verified `buildParams`/`parseParams` URL contract; the `?taxon=` deep-link path
- `/Users/rainhead/dev/beeatlas/src/filter.ts` — verified `FilterState` shape (`Set<string>` for counties/ecoregions; `Set<number>` for months) — used to align `GeoFilter`/`SeasonFilter` placeholders
- `/Users/rainhead/dev/beeatlas/scripts/validate-species.mjs` — verified CLI-guard pattern (`fileURLToPath(import.meta.url) === resolve(process.argv[1])`); reusable for any new validator
- `/Users/rainhead/dev/beeatlas/src/tests/seed-species-photos.test.ts` and `/Users/rainhead/dev/beeatlas/src/tests/validate-species.test.ts` — exact precedents for source-analysis Vitest pattern
- `/Users/rainhead/dev/beeatlas/_site/assets/` directory listing — verified `bee-header-*.js` chunk emission today (proof Pattern 2 works for the species entry without config changes)
- `/Users/rainhead/dev/beeatlas/.planning/phases/080-page-scaffolding/080-CONTEXT.md` — locked decisions D-01..D-08
- `/Users/rainhead/dev/beeatlas/.planning/research/PITFALLS.md` — Pitfalls #7, #8, #10 directly relevant; #11 / #20 noted
- `/Users/rainhead/dev/beeatlas/CLAUDE.md` — invariants: state-ownership ARCH-03, static hosting, `speicmenLayer` typo deferral

### Secondary (MEDIUM confidence)
- [Lit 3 upgrade guide](https://lit.dev/docs/releases/upgrade/) — confirmed `createRenderRoot` return type; light-DOM mechanics
- [Lit Rendering docs](https://lit.dev/docs/components/rendering/) — partial; do NOT document the no-render() preservation pattern explicitly (gap noted)
- [Lit Shadow DOM / RenderRoot](https://lit.dev/docs/components/shadow-dom/#renderroot) — confirmed `return this` mechanics; recommends against light-DOM in general (we accept the trade-off for SSR + chrome-less behavior shells)
- [GitHub: lit/lit#1994 — light-DOM SSR](https://github.com/lit/lit/issues/1994) — community confirmation that `createRenderRoot { return this }` + omit-render is a valid behavior-attachment pattern
- @iarna/toml ([npm registry, last published 2018](https://www.npmjs.com/package/@iarna/toml)) — version 2.2.5 stable; sync API verified by inspecting `node_modules/@iarna/toml/toml.js`

### Tertiary (LOW confidence)
- None — every Phase-80 claim is grounded in either local source code or locked context.

## Project Constraints (from CLAUDE.md)

- **State-ownership invariant (ARCH-03):** `<bee-atlas>` owns all reactive state for the SPA. `<bee-species-page>` extends this pattern to the species page. Cards are pure presenters in Phase 81; in Phase 80 they have NO reactive state at all (only forward-looking `@property` declarations on the page coordinator per D-07).
- **No shared module-level mutable state** in any new file. `_data/*.js` exports plain objects but the recipes above slice arrays and freeze nothing — Eleventy treats them as read-only by convention. Document with comments where Phase 81 might mutate.
- **ID format conventions:** Specimens are `ecdysis:<integer>`, samples are `inat:<integer>`. Species page URLs use `scientificName` (URL-encoded), NOT IDs. No prefix conflicts.
- **Static hosting only:** every recipe in this RESEARCH document obeys this. No server runtime needed.
- **Python 3.14+**: irrelevant for Phase 80 itself; the SVG-regen precondition uses the existing `data/run.py` which already complies.
- **`speicmenLayer` typo deferral:** unrelated to species page; do not opportunistically fix.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version verified against `node_modules/` and `package.json`.
- Architecture: HIGH — every pattern has a verified precedent in the same repo.
- Pitfalls: HIGH — pitfalls grounded in real source-code reads (lit-element source for D-05) or in the project's own pitfalls catalogue.
- Validation: HIGH — every requirement has at least one mechanical assertion, no manual-only success criteria.

**Research date:** 2026-05-04
**Valid until:** 2026-06-04 (30 days; stable foundations — Eleventy/Vite/Lit versions don't move quickly within minor bands).

---

## RESEARCH COMPLETE

- **D-05 mechanics verified at source level.** `node_modules/lit-element/development/lit-element.js` confirms the default `render()` returns `noChange`, which `lit-html`'s render commits as a no-op. Combining `createRenderRoot() { return this }` with NO `render()` override preserves Eleventy's server-rendered children — including across reactive property updates. Recommend a Vitest assertion `expect(BeeSpeciesCard.prototype.render).toBe(LitElement.prototype.render)` to lock the pattern against well-meaning future "completion."
- **PAGE-09 chunk separation works without `vite.config.ts` changes.** `_site/assets/bee-header-*.js` exists today as a peer chunk to the SPA's `index-*.js`, proving plugin-vite's MPA `appType` auto-discovers `<script type="module">` entries from any Eleventy-emitted HTML. The species entry follows the same recipe: declare `<script type="module" src="/src/entries/species.ts">` in `_pages/species.njk`. No additional Vite config.
- **Wave 0 must include regenerating `public/data/species-maps/*.svg`.** The directory does not exist on disk (verified). Phase 78's wipe-and-rewrite policy means it's intentionally not committed; the pipeline must run before Phase 80's verification can demonstrate map slots. Plan task: `cd data && uv run python species_maps.py` (or full `run.py`).
- **`GeoFilter`/`SeasonFilter` placeholder types proposed and aligned with the SPA.** `GeoFilter = { counties: Set<string>; ecoregions: Set<string> }`; `SeasonFilter = { months: Set<number> }`. Mirrors the existing `FilterState` shape in `src/filter.ts` so Phase 81's filter-merge logic is trivial. No `null`-vs-empty-Set ambiguity: `null` means "no filter active"; non-null with empty Set is unused (and could be tightened in Phase 81).
- **Architectural test pattern locked: `readFileSync` + import-line regex** (mirrors `validate-species.test.ts`). Single new file `src/tests/arch.test.ts`. NO new build step — Vitest already runs in CI via `npm test`. Adding `validate-page.mjs` to the build chain would duplicate coverage. The arch-test regex must cover both `from '...'` AND `import('...')` to defend against dynamic-import bypass.

Sources:
- [Lit 3 upgrade guide](https://lit.dev/docs/releases/upgrade/)
- [Lit Rendering docs](https://lit.dev/docs/components/rendering/)
- [Lit Shadow DOM / RenderRoot](https://lit.dev/docs/components/shadow-dom/#renderroot)
- [GitHub: lit/lit#1994 — light-DOM SSR](https://github.com/lit/lit/issues/1994)
- [@iarna/toml on npm](https://www.npmjs.com/package/@iarna/toml)
