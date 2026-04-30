# Phase 75: Authoring Scaffold and Verification — Pattern Map

**Mapped:** 2026-04-30
**Files in scope:** 5 NEW, 0 MODIFIED config (research-confirmed: no `eleventy.config.js` or `vite.config.ts` edits required)
**Reference projects:**
- `/Users/rainhead/dev/pnwmoths` — single-layer layout chain with shared script tag (closest analog for layouts + side-effect entry)
- `/Users/rainhead/dev/beeatlas` — current repo (Phase 74 baseline establishes `dir` block, passthrough conventions)

This map mirrors pnwmoths verbatim where it can. Two beeatlas-specific deviations are flagged: (a) **two-layer chain** (`base.njk` + `default.njk`) where pnwmoths is single-layer (`base.njk` includes the chrome directly); (b) **explicit `_layouts/` dir** where pnwmoths defaults to `_includes/` for both. Both deviations follow CONTEXT decision #3 and Phase 74's existing `dir` block.

---

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `_layouts/base.njk` | layout (chrome-less HTML5 shell) | request-response (build-time render) | `~/dev/pnwmoths/src/_includes/base.njk` | exact (strip chrome) |
| `_layouts/default.njk` | layout (chrome wrapper extending base) | request-response (build-time render) | `~/dev/pnwmoths/src/_includes/base.njk` (chrome bits) + Eleventy front-matter chain pattern | hybrid — pnwmoths is single-layer; chain is synthesized |
| `_pages/scaffold-check.njk` | page (orphan diagnostic) | request-response (build-time render) | `~/dev/pnwmoths/src/index.njk` (front-matter shape) + `~/dev/pnwmoths/src/glossary/index.njk` (data-iteration shape) | exact (front-matter), good (body) |
| `src/entries/bee-header.ts` | entry (Vite Rollup entry; side-effect import) | event-driven (browser custom-element registration on module load) | `~/dev/pnwmoths/src/components/main.js` | exact — same one-line side-effect import pattern |
| `_data/build.js` | data (build-time metadata producer) | batch (one shot per build/dev-server start) | `~/dev/pnwmoths/src/_data/glossary.js` (shape only — DuckDB body irrelevant) | role-match — analog uses CSV+DuckDB; ours uses fs+execSync |

**Files NOT modified** (despite earlier scope speculation — research closed these):
- `eleventy.config.js` — no edits. The plugin's `appType: "mpa"` HTML processor auto-derives Rollup inputs from Eleventy HTML outputs (see `node_modules/@11ty/eleventy-plugin-vite/EleventyVite.js:122-125`). Adding the bee-header entry as a `<script type="module" src="…">` in `default.njk` is sufficient.
- `vite.config.ts` — no edits. The plugin runs Vite in-process; `viteOptions.envDir` and `viteOptions.optimizeDeps.exclude` already pass through from `eleventy.config.js` (Phase 74-03). Adding `rollupOptions.input` is the explicit anti-pattern called out in research.
- `_layouts/.gitkeep`, `_includes/.gitkeep` — `.gitkeep` files coexist with new `.njk` siblings; no removal needed (they remain as defensive placeholders for any future empty-dir scenario; or can be deleted as a janitorial gesture, planner's call). `_data/.gitkeep` similarly coexists with `_data/build.js`.

---

## Pattern Assignments

### `_layouts/base.njk` (NEW — chrome-less HTML5 shell)

**Analog:** `~/dev/pnwmoths/src/_includes/base.njk` lines 1-14, 32-42 (extract `<head>` + `{{ content | safe }}` skeleton; **drop the entire `<header>...</header>` chrome block at lines 15-31** — that moves to `default.njk`)

**Why this analog:** Pnwmoths' base.njk is the canonical "Eleventy front-matter + `{{ content | safe }}` chain" reference verified by research (`base.njk:34` reads `{{ content | safe }}`, `base.njk:40` injects the script tag). Beeatlas inherits the same shape with the chrome layer split off.

**Imports/header pattern** (lines 1-14 — keep):

```nunjucks
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title or "PNW Moths" }}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?..." rel="stylesheet">
  <link rel="stylesheet" href="/css/pico.min.css">
  <link rel="stylesheet" href="/styles/theme.css">
  ...
</head>
```

**Beeatlas adaptation** (drop pnwmoths-specific assets; bee-header has its own shadow-DOM styles):
- Keep: `<!doctype html>` declaration, `<html lang="en">`, `<meta charset>`, `<meta viewport>`, `<title>{{ title or "BeeAtlas" }}</title>`.
- Add: `<link rel="icon" href="data:,">` to mirror `_pages/index.html:7` (beeatlas favicon convention).
- Drop: Pico CSS link, Google Fonts preconnects, theme.css, pagefind UI link (no equivalents in beeatlas).
- Drop: `data-theme="light"` attribute (no theme system yet).
- Open question 1 (research): whether to add a single inline `<style>` reset for body font/margin. Recommendation: defer (no inline style); add only if v3.1 UAT shows the orphan page looking unstyled.

**Body/content-slot pattern** (lines 14, 32-36, 41-42 — adapt):

```nunjucks
<body>
  <header>...chrome...</header>      ← REMOVE (moves to default.njk)
  <main>
    <div class="content-wrapper">
      {{ content | safe }}            ← KEEP literal — Eleventy front-matter chain content variable
    </div>
  </main>
  <footer>...</footer>                ← REMOVE (no footer in v3.1; CONTEXT)
  <script type="module" src="/components/main.js"></script>  ← REMOVE (moves to default.njk)
</body>
</html>
```

**Beeatlas final shape** (~12 lines; matches research §Pattern 1 example verbatim):
- `<!doctype html>` / `<html lang="en">` / `<head>` (charset, viewport, title, favicon) / `</head>`
- `<body>{{ content | safe }}</body>` — single content slot, no chrome, no script tag
- `</html>`

**Pitfall to avoid** (research Pitfall 1): Do NOT use `{% extends "base.njk" %}` + `{% block content %}{% endblock %}`. Use front-matter `layout: base.njk` + `{{ content | safe }}` exclusively. Mixing the two within a single chain causes empty `<main>` or double-rendered content.

---

### `_layouts/default.njk` (NEW — chrome wrapper, extends base.njk)

**Analog:** `~/dev/pnwmoths/src/_includes/base.njk` lines 14-31, 40 (extract chrome block + script-tag) + Eleventy front-matter chain pattern from `~/dev/pnwmoths/src/index.njk:1-5` (front-matter `layout: base.njk` declaration shape)

**Why this analog:** Pnwmoths is single-layer (chrome lives in `base.njk` directly). Beeatlas splits per CONTEXT decision #3 (`base.njk` chrome-less, `default.njk` with chrome). The chain mechanics are pure Eleventy and the chrome bits transplant 1:1 from pnwmoths' base.njk.

**Front-matter chain declaration** (synthesized from `~/dev/pnwmoths/src/index.njk:1-5`):

```nunjucks
---
layout: base.njk
---
```

The literal value `base.njk` resolves against `dir.layouts: "_layouts"` (set in `eleventy.config.js:82`) → `_layouts/base.njk`. **Do NOT** prefix with `_layouts/` — Eleventy resolves layout names against the configured `dir.layouts` automatically.

**Chrome pattern from pnwmoths** (lines 14-31 of `_includes/base.njk` — adapt to beeatlas):

```nunjucks
<body>
  <header>
    <div class="banner">
      <img src="/images/header.png" alt="...">
      <div class="pnwm-site-name">Pacific Northwest Moths</div>
    </div>
    <nav class="site-nav" data-pagefind-ignore>
      <ul>
        <li><a href="{{ '/' | url }}">Home</a></li>
        ...
      </ul>
    </nav>
  </header>
```

**Beeatlas adaptation** — replace the entire static `<header>...</header>` block with a single Lit custom element (CONTEXT decision #4: visual parity with SPA, no static HTML approximation):

```nunjucks
---
layout: base.njk
---
<bee-header></bee-header>
<script type="module" src="/src/entries/bee-header.ts"></script>
<main>
{{ content | safe }}
</main>
```

**Script-tag pattern** (adapted from `~/dev/pnwmoths/src/_includes/base.njk:40`):

```nunjucks
<script type="module" src="/components/main.js"></script>   ← pnwmoths
<script type="module" src="/src/entries/bee-header.ts"></script>   ← beeatlas
```

Vite's `appType: "mpa"` HTML processor (already enabled by the plugin in `eleventy.config.js:47`) walks every emitted HTML file, finds each `<script type="module" src="…">`, bundles the module, hashes the path, and rewrites the `src` attribute in-place to `/assets/bee-header-[hash].js`. **Verified by research:** all three pnwmoths `_site/*.html` files (`index.html`, `browse/index.html`, `glossary/index.html`) show the identical hashed `/assets/main-mrwqL7M5.js` path despite the source `.njk` files referencing the unhashed `/components/main.js`.

**Critical paths** (research Pitfall 3):
- Source path in HTML: `/src/entries/bee-header.ts` — root-absolute, must match the path inside `.11ty-vite/` at Vite-build time.
- Eleventy passes `src/` through unchanged (`eleventy.config.js:28` → `addPassthroughCopy({ "src": "src" })`). Subdirectories are included automatically. The new `src/entries/bee-header.ts` lands at `_site/src/entries/bee-header.ts` → renamed to `.11ty-vite/src/entries/bee-header.ts` at build time → Vite resolves it from its root.
- **No new passthrough rule needed.**

**Pitfalls to avoid** (research Anti-Patterns):
- Do NOT put the `<script>` tag in `base.njk`. Pages that extend base.njk directly (none yet, but possible) should NOT pull in bee-header.
- Do NOT add a manualChunks Rollup config for bee-header. The SPA already imports `./bee-header.ts` at `src/bee-atlas.ts:7`; Rollup's default chunking will dedup Lit core between the two entries automatically (CONTEXT decision #5 framing).
- Do NOT set `viteOptions.build.rollupOptions.input` in `eleventy.config.js`. The plugin auto-derives entries from emitted HTML.

---

### `_pages/scaffold-check.njk` (NEW — orphan diagnostic page)

**Analog (front-matter shape):** `~/dev/pnwmoths/src/index.njk:1-5` (`layout:` + `permalink:` front-matter pattern)

**Analog (body shape — data-iteration HTML):** `~/dev/pnwmoths/src/glossary/index.njk:1-22` (front-matter + plain HTML body that consumes `_data/*.js` content via `{{ namespace.* }}`)

**Why this analog:** Both pnwmoths pages declare `layout: base.njk` + `permalink: /…/index.html` and consume `_data/` content via templated values. Beeatlas's scaffold-check page is the same shape with `default.njk` (not `base.njk`) and `build.*` data (not `glossary.*`).

**Front-matter pattern** (from `~/dev/pnwmoths/src/index.njk:1-5`):

```nunjucks
---
layout: base.njk
title: PNW Moths
permalink: /index.html
---
<h1>PNW Moths</h1>
<p>A natural history catalog of Pacific Northwest moths...</p>
```

**Beeatlas adaptation** (research §Pattern 4 example verbatim):

```nunjucks
---
layout: default.njk
permalink: /_scaffold-check/index.html
eleventyExcludeFromCollections: true
title: BeeAtlas — Scaffold Check
---
<h1>Scaffold Check</h1>
<p>Built-but-orphan verification page. Confirms the Eleventy + Vite + Lit pipeline is producing chrome correctly.</p>

<table>
  <tr><th>Eleventy</th><td>{{ build.eleventyVersion }}</td></tr>
  <tr><th>Plugin (eleventy-plugin-vite)</th><td>{{ build.pluginVersion }}</td></tr>
  <tr><th>Vite</th><td>{{ build.viteVersion }}</td></tr>
  <tr><th>Lit</th><td>{{ build.litVersion }}</td></tr>
  <tr><th>Node</th><td>{{ build.nodeVersion }}</td></tr>
  <tr><th>Built at</th><td>{{ build.builtAt }}</td></tr>
  <tr><th>Git SHA</th><td>{{ build.gitSha }}</td></tr>
</table>
```

**Front-matter rules** (research Pattern 4 + Pitfall 2):
- `layout: default.njk` — chains through `default.njk` → `base.njk`. Bee-header chrome appears above `<main>{{ content | safe }}</main>`.
- `permalink: /_scaffold-check/index.html` — sidesteps the underscore-prefix-in-input ambiguity. Source filename is `scaffold-check.njk` (no leading underscore); URL is `/_scaffold-check/` per CONTEXT decision #1.
- `eleventyExcludeFromCollections: true` — defensive against a future `collections.all`-iterating layout (e.g., a sitemap). Page won't appear in any collection.
- `title: ` — populates `{{ title or "BeeAtlas" }}` in `base.njk`'s `<head>`.

**Data-consumption pattern** (from `~/dev/pnwmoths/src/glossary/index.njk:32`):

Pnwmoths: `{% for letter, terms in glossary %}` consumes `_data/glossary.js`'s default export, exposed as `{{ glossary }}`.

Beeatlas: `{{ build.eleventyVersion }}` consumes `_data/build.js`'s default export, exposed as `{{ build }}`. Filename → namespace mapping is filename-minus-extension (research §Pattern 3, assumption A2).

---

### `src/entries/bee-header.ts` (NEW — side-effect Vite entry)

**Analog:** `~/dev/pnwmoths/src/components/main.js` (1-line-per-import side-effect entry)

**Why this analog:** Pnwmoths' main.js is the exact pattern beeatlas needs — a tiny module whose only purpose is to be a Rollup entry that triggers side-effect-driven custom-element registration via `import './<component>.js'` statements. Verified by research: pnwmoths' `_site/index.html` and others reference the hashed `/assets/main-mrwqL7M5.js` produced from this file via Vite's HTML processor.

**Full pnwmoths file** (lines 1-7 — entire file):

```javascript
import './pnwm-occurrence-map.js';
import './pnwm-phenology-chart.js';
import './pnwm-filter-bar.js';
import './pnwm-image-slideshow.js';
import './pnwm-taxon-browser.js';
import './pnwm-plate-viewer.js';
import './glossary-tooltip.js';
```

Each imported module self-registers a custom element on load (the same `@customElement` decorator pattern Lit uses).

**Beeatlas adaptation** (research §Pattern 2 — exactly 1 line):

```typescript
import '../bee-header.ts';
```

**Why this works** (verified):
- `src/bee-header.ts:4` declares `@customElement('bee-header')` ([VERIFIED Read: `src/bee-header.ts:4`]). Lit registers the custom element on module load.
- `src/bee-header.ts:1-2` imports only `lit` and `lit/decorators.js` ([VERIFIED Read]). Zero SPA-coupled imports — bundle is Lit core + the component.
- The relative path `../bee-header.ts` resolves from `src/entries/` up one level to `src/bee-header.ts`. Vite/Rollup walks the import graph from this entry; produces `_site/assets/bee-header-[hash].js`.

**Pitfalls to avoid** (research Anti-Patterns):
- Do NOT call `customElements.define('bee-header', BeeHeader)` here. The `@customElement` decorator already does so on module load; manual registration would emit a `DOMException: NotSupportedError`.
- Do NOT add additional imports. This file is **deliberately one line** — its job is to be a Rollup entry, not to compose features. Future v3.2 entries (e.g., a species-page entry) will be sibling files in `src/entries/`.

---

### `_data/build.js` (NEW — build metadata for templates)

**Analog (shape):** `~/dev/pnwmoths/src/_data/glossary.js` lines 1-3, 33-46 (ESM `export default async function () { ... return rows; }` shape with sync filesystem reads at build time)

**Note on analog body:** The pnwmoths body uses DuckDB to read CSV — irrelevant to beeatlas. Only the **module shape** transfers (default-exported function/object, sync at build time, returns plain JS values for template consumption). Body is synthesized from research §Pattern 3.

**Pnwmoths shape** (lines 1-3, 33-46 — extract structure, ignore body):

```javascript
import { DuckDBInstance } from '@duckdb/node-api';

export default async function () {
  // ... build-time CSV read + transform ...

  const rows = result.getRowObjectsJS();
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.letter]) grouped[row.letter] = [];
    grouped[row.letter].push(row);
  }
  return grouped;
}
```

Eleventy reads `_data/<name>.js`, evaluates the default export (function or value), and exposes the result to all templates as `{{ <name>.* }}`. Filename `glossary.js` → `{{ glossary.* }}`. Filename `build.js` → `{{ build.* }}`.

**Beeatlas adaptation** (research §Pattern 3 — synchronous, no DuckDB):

```javascript
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

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

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: repoRoot })
      .toString().trim();
  } catch {
    return 'unknown';  // shallow CI clone or no git
  }
}

export default {
  eleventyVersion: pkgVersion('@11ty/eleventy'),
  pluginVersion: pkgVersion('@11ty/eleventy-plugin-vite'),
  viteVersion: pkgVersion('vite'),
  litVersion: pkgVersion('lit'),
  nodeVersion: process.version,
  builtAt: new Date().toISOString(),
  gitSha: gitSha(),
};
```

**Filename decision** (research Open Question 3): use `_data/build.js` (not `_data/buildInfo.js`). Shorter, no camelCase ambiguity. Templates consume as `{{ build.eleventyVersion }}`, `{{ build.gitSha }}`, etc.

**Pitfall** (research Pitfall 5): `_data/*.js` is evaluated **once** per Eleventy invocation — once at `npm run dev` start, once at `npm run build`. Editing `_data/build.js` itself triggers a rebuild; making a git commit during a long `npm run dev` session does NOT refresh `gitSha`. Document this behavior on the scaffold-check page or accept the staleness as a dev-only quirk (production builds are always fresh).

**Module type** (research-implicit, beeatlas-specific): root `package.json` is `"type": "module"` (set by Phase 74). `_data/build.js` is an ESM file by extension — `import` statements work directly. No `.cjs` rename needed.

---

## Shared Patterns

### Front-matter layout chain (Eleventy native, NOT Nunjucks `extends`/`block`)

**Source:** Locked by CONTEXT decision Claude's-Discretion bullet ("pnwmoths' convention is the tiebreaker") + research §Pattern 1 verification of `~/dev/pnwmoths/src/_includes/base.njk:34` (`{{ content | safe }}`).

**Apply to:** All three new `.njk` files (`base.njk`, `default.njk`, `scaffold-check.njk`).

```nunjucks
---
layout: <parent>.njk
---
<page or layout body>
{{ content | safe }}
```

`base.njk` has no front-matter (it's the root of the chain). `default.njk` declares `layout: base.njk`. `scaffold-check.njk` declares `layout: default.njk`.

Layout-name resolution: bare `<name>.njk` resolves against `dir.layouts: "_layouts"` (set in `eleventy.config.js:82`). Do NOT prefix with `_layouts/`.

### Custom-element self-registration via `@customElement`

**Source:** `src/bee-header.ts:4` (Lit decorator pattern); pnwmoths' `_site/*.html` proof that side-effect-imported custom elements upgrade on script load.

**Apply to:** `src/entries/bee-header.ts` (deliberate side-effect-only entry); future v3.2 entries follow the same pattern.

```typescript
// In the component file (already exists for bee-header):
@customElement('bee-header')
export class BeeHeader extends LitElement { ... }

// In the entry file (new):
import '../bee-header.ts';   // side-effect: registers <bee-header> on module load
```

No `customElements.define` call; no exports from the entry file.

### Build-time data files via Eleventy `_data/`

**Source:** `~/dev/pnwmoths/src/_data/glossary.js` (shape only) + research §Pattern 3.

**Apply to:** `_data/build.js` (this phase). Future v3.2 data files (species, plates, etc.) follow the same default-export-an-object-or-function shape.

### Vite HTML processor auto-rewrites `<script type="module" src="…">`

**Source:** `node_modules/@11ty/eleventy-plugin-vite/EleventyVite.js:122-125` (auto-injects Eleventy HTML outputs into Rollup `input`); pnwmoths verification (research §Pattern 1, `_site/*.html` all show identical hashed paths).

**Apply to:** Every templated `.html` file emitted by Eleventy. The `<script type="module" src="/src/entries/bee-header.ts">` tag in `default.njk` will appear in `_site/_scaffold-check/index.html` as `<script type="module" crossorigin src="/assets/bee-header-[hash].js">` after `npm run build`. **No `rollupOptions.input` config needed.**

### Passthrough copy already covers `src/`

**Source:** `eleventy.config.js:28` — `eleventyConfig.addPassthroughCopy({ "src": "src" })` (Phase 74).

**Apply to:** `src/entries/bee-header.ts` lands inside the existing passthrough; no rule update. Verify post-build: `_site/src/entries/bee-header.ts` exists alongside `_site/assets/bee-header-*.js`.

---

## No Analog Found

| File | Reason |
|------|--------|
| (none) | Every new file has a close pnwmoths analog or is one line synthesized from research. |

---

## Beeatlas Invariants That MUST Keep Working (Quick-Reference Checklist)

The planner should treat each of these as a regression risk; a plan is only "done" when all still hold:

| Invariant | Source | Risk Surface |
|-----------|--------|--------------|
| 172 Vitest tests pass | CONTEXT non-negotiable | New entry/data file should not break existing test discovery; Vitest excludes `_site/**` (`vite.config.ts:22`) |
| `VITE_MAPBOX_TOKEN` keeps working in SPA | CONTEXT non-negotiable | bee-header bundle does NOT consume Mapbox env (verified: `bee-header.ts:1-2` imports only Lit). New entry has no env coupling |
| `optimizeDeps.exclude: ['wa-sqlite']` | `eleventy.config.js:65-67` (Phase 74-03) | New entry does NOT import wa-sqlite; SPA still does. Both work because exclusion is global |
| `preloadAssets()` plugin | `vite.config.ts:5` | Plugin emits `<link rel="preload">` tags for `_pages/index.html` (the SPA). The new `_scaffold-check/index.html` doesn't need preloads (no parquet/wasm fetch); plugin's `transformIndexHtml` should be a no-op there |
| `validate-schema.mjs` runs pre-build | `package.json` build script | No interaction with new files; gate runs as before |
| SPA at `/` continues unchanged | CONTEXT decision; `_pages/index.html` not touched | New phase touches NO file in `_pages/` except adding `scaffold-check.njk`. `_pages/index.html` Liquid no-op pass already proven by Phase 74 |
| `src/bee-header.ts` is dual-imported (SPA + new entry) | `src/bee-atlas.ts:7` (existing); `src/entries/bee-header.ts` (new) | Rollup default chunking dedups Lit core between the two entries; CONTEXT decision #5 explicitly accepts this |
| `_pages/index.html` script tag still rewrites | Phase 74 invariant | Vite's HTML processor handles all templated HTML pages; adding a second page doesn't regress the first |

---

## Metadata

**Analog search scope:**
- `/Users/rainhead/dev/pnwmoths/` — primary reference (verified by Phase 74 patterns + Phase 75 research)
- `/Users/rainhead/dev/beeatlas/` — invariants source (Phase 74 baseline)

**Files read this session:**
- pnwmoths: `src/_includes/base.njk`, `src/_data/glossary.js`, `src/_data/images.js`, `src/components/main.js`, `src/index.njk`, `src/glossary/index.njk` (head), `eleventy.config.js`
- beeatlas: `eleventy.config.js`, `vite.config.ts`, `src/bee-header.ts`, `src/bee-atlas.ts` (head), `_pages/index.html`
- Phase docs: `075-CONTEXT.md`, `075-RESEARCH.md`, `074-PATTERNS.md`, `CLAUDE.md`

**Pattern extraction date:** 2026-04-30

## PATTERN MAPPING COMPLETE
