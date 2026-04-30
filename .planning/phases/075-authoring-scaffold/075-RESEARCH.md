# Phase 75: Authoring Scaffold and Verification — Research

**Researched:** 2026-04-30
**Domain:** Eleventy 3.x layout chains + Vite multi-HTML processing for static authoring scaffold
**Confidence:** HIGH

## Summary

Phase 75 lays down a two-layer Nunjucks layout chain (`base.njk` + `default.njk` extending `base.njk`), embeds a real `<bee-header>` Lit component via a tiny side-effect entry, and ships one orphan verification page at `/_scaffold-check/`. The good news: every mechanism this phase needs already works in the Phase 74 pipeline. The non-obvious news: **the multi-entry Vite build the planner anticipated is not necessary**. Vite's `appType: "mpa"` HTML processor (already enabled by `@11ty/eleventy-plugin-vite`) treats every HTML file Eleventy emits as a Rollup entry candidate, parses each `<script type="module" src="…">` tag, hashes the referenced module, and rewrites the tag in-place. Pnwmoths verifies this end-to-end: a single `<script type="module" src="/components/main.js">` in `base.njk` produces a single hashed `/assets/main-mrwqL7M5.js` reference on every page that uses the layout. No `rollupOptions.input` config; no manifest read in templates.

For beeatlas, that means: write `<script type="module" src="/src/entries/bee-header.ts">` in `default.njk`, pass `src/` through (already done in `eleventy.config.js`), and Vite produces `/assets/bee-header-[hash].js` automatically. The SPA's separate `_pages/index.html` continues to use its own script tag (`./src/bee-atlas.ts`), and Rollup's default chunking dedupes shared modules (Lit core) between the two entries without a manualChunks config.

`bee-header.ts` self-registers via the `@customElement('bee-header')` decorator and imports only `lit` and `lit/decorators.js` — no SPA-coupled side effects. The entry file is a one-line side-effect import.

**Primary recommendation:** Mirror the pnwmoths pattern verbatim for the layout chain (`{{ content | safe }}`, single shared `<script type="module" src="…">` in the chrome layout). Skip Rollup `rollupOptions.input` and skip `_data/manifest.js` — both are unnecessary for the v3.1 surface.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Page-level HTML structure (chrome-less shell) | Eleventy `_layouts/base.njk` | — | Templating layer; pnwmoths reference shape |
| Page-level HTML structure (with bee-header chrome) | Eleventy `_layouts/default.njk` extending `base.njk` | — | Decision #3 in CONTEXT.md; layout chain pattern |
| Bee-header custom element registration | Browser (Lit `@customElement` decorator at module load) | — | Already self-registered in `src/bee-header.ts:4`; no decision needed |
| Bee-header bundle production | Vite (HTML processor on every templated page) | — | Vite's `appType: "mpa"` parses `<script type="module">` tags in all HTML inputs |
| Hashed asset path rewriting | Vite (in-place HTML rewrite at build time) | — | No manifest needed; Vite rewrites paths in HTML directly |
| Build metadata exposure (versions, timestamp) | Eleventy `_data/build-info.js` | — | Standard Eleventy data file pattern; runs at build time before templates render |
| `/_scaffold-check/` URL | Eleventy `permalink:` front matter | — | Decouples URL from filename; avoids Eleventy underscore-prefix ambiguity |

## Standard Stack

### Core (already installed; no new packages required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@11ty/eleventy` | `3.1.5` [VERIFIED: `npm view @11ty/eleventy version` 2026-04-30 → 3.1.5; matches `node_modules/@11ty/eleventy/package.json`] | Outer SSG | Phase 74 installed; provides Nunjucks template engine, layout chains, `_data/` build-time data |
| `@11ty/eleventy-plugin-vite` | `7.1.1` [VERIFIED: installed; `node_modules/@11ty/eleventy-plugin-vite/package.json`] | Vite integration | Phase 74 installed; auto-injects HTML pages from Eleventy outputs into Rollup `input` (see `EleventyVite.js:122-125`) |
| `vite` | `6.4.2` (root) + `7.3.2` (plugin's nested) [VERIFIED: `node_modules/vite/package.json`] | HTML processor + bundler | Phase 74; the plugin uses its nested `vite@7.3.2` for the build pass |
| `lit` | `3.2.1` [VERIFIED: `package.json` deps] | bee-header component | Existing dep; the entry will side-effect-import `bee-header.ts` which imports `lit` and `lit/decorators.js` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Nunjucks | bundled with Eleventy 3.1.5 [VERIFIED] | Layout chain template engine | All new `.njk` files (base, default, scaffold-check). Liquid stays the default for `_pages/index.html` (Phase 74's no-op pass) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single shared `<script>` in `default.njk` (recommended) | Multi-entry Rollup `rollupOptions.input` for explicit `bee-header` entry | More complex config; required if we wanted bee-header-only HTML pages without the SPA index. With layout-driven script injection, Vite handles entries automatically. Pnwmoths uses the layout-driven approach. |
| `{{ content \| safe }}` (recommended; pnwmoths pattern) | Nunjucks `{% block content %}{% endblock %}` | Both idiomatic in Eleventy. `{{ content \| safe }}` is the Eleventy-native variable; works regardless of layout engine. Block-style requires `{% extends "base.njk" %}` in `default.njk`. Mixing the two within a single chain has known footguns (see Pitfall 1). Pick one and use it consistently. |
| Filename `_pages/scaffold-check.njk` + permalink (recommended) | Filename `_pages/_scaffold-check.njk` (literal underscore prefix) | Eleventy's behavior on underscore-prefixed input files is **not documented clearly**. The 11ty.dev docs say underscore is the convention for `_includes/`, `_data/`, `_layouts/` — but don't pin down whether a leading-underscore filename in the input dir is processed or skipped. [WebSearch 2026-04-30: AI summarization of Issue #1057 suggested skipped; the issue itself reads as a feature request, not a confirmed default.] **Sidestep the ambiguity:** name the file without the underscore, set `permalink: /_scaffold-check/index.html` in front matter, the URL is preserved. |

**No new packages to install.** Phase 75 is config + new template files only.

**Version verification (recorded for the planner):**
- `@11ty/eleventy@3.1.5` confirmed via `npm view` 2026-04-30; matches `node_modules`
- `@11ty/eleventy-plugin-vite@7.1.1` confirmed via `npm view` 2026-04-30; matches `node_modules`

## Project Constraints (from CLAUDE.md)

From `/Users/rainhead/dev/beeatlas/CLAUDE.md`:

- **Static hosting only** — no server runtime. Layouts emit static HTML; Vite produces static JS. ✓
- **`speicmenLayer` typo deferred** — irrelevant here; do not touch.
- **State ownership invariant** — `<bee-atlas>` owns reactive state; `<bee-header>` is a pure presenter. The new `default.njk` embeds `<bee-header>` as a *sibling* of the (yet-nonexistent) page-content slot, not nested under `<bee-atlas>`. This is fine — bee-header is independent of bee-atlas (verified: `src/bee-header.ts` imports nothing from bee-atlas, bee-map, or bee-sidebar; only `lit` and `lit/decorators.js`).
- **Domain vocabulary** — no specimen/sample/observation logic in this phase; documentation only.

From `~/.claude/CLAUDE.md`:

- **Node version pinned in `.nvmrc`** → `24.12` [VERIFIED: read `.nvmrc`]. Eleventy 3.x and the plugin both support Node 18+; no change needed.
- **Update READMEs before pushing** — applies if any README documents the new layout files; `CLAUDE.md` already documents `npm run dev` (Phase 74-03 update); no further README edits anticipated for this phase.

## Architecture Patterns

### System Architecture Diagram

```
                        ┌──────────────────────────────────────┐
                        │ npm run build                        │
                        │   (validate-schema → typecheck → eleventy) │
                        └────────────┬─────────────────────────┘
                                     │
                                     ▼
              ┌──────────────────────────────────────────────────────┐
              │ Eleventy renders templates from _pages/              │
              │                                                      │
              │   _pages/index.html ─────► (Liquid no-op)            │
              │                            _site/index.html          │
              │                            (SPA — script: ./src/bee-atlas.ts) │
              │                                                      │
              │   _pages/scaffold-check.njk ─► default.njk ─► base.njk │
              │                                _site/_scaffold-check/index.html │
              │                                (script: /src/entries/bee-header.ts) │
              │                                                      │
              │   _data/build-info.js evaluated once, available as   │
              │     {{ build.eleventyVersion }}, {{ build.gitSha }}, │
              │     {{ build.builtAt }}, {{ build.viteVersion }}     │
              └────────────────────────┬─────────────────────────────┘
                                       │
                                       ▼ Plugin's eleventy.after hook
              ┌──────────────────────────────────────────────────────┐
              │ EleventyVite.runBuild():                             │
              │   1. fs.rename(_site → .11ty-vite)                   │
              │   2. vite build with                                 │
              │        root:    .11ty-vite                           │
              │        outDir:  _site                                │
              │        rollupOptions.input: { (auto-derived from     │
              │           Eleventy HTML outputs)                     │
              │             index.html, _scaffold-check/index.html  │
              │           }                                          │
              │   3. Vite parses each HTML, finds <script>, bundles, │
              │      rewrites src to /assets/<name>-<hash>.js        │
              │   4. fs.rm(.11ty-vite)                               │
              └────────────────────────┬─────────────────────────────┘
                                       │
                                       ▼
              ┌──────────────────────────────────────────────────────┐
              │ _site/                                               │
              │   index.html (SPA, /assets/index-*.js)               │
              │   _scaffold-check/index.html (chrome+meta, /assets/bee-header-*.js) │
              │   assets/index-*.js     (full SPA bundle)            │
              │   assets/bee-header-*.js (~20-30KB gz, Lit + bee-header) │
              │   assets/*.css          (hashed CSS)                 │
              │   assets/*.wasm         (hashed wa-sqlite)           │
              │   data/, public/, src/  (passthroughs)               │
              └──────────────────────────────────────────────────────┘
```

The plugin's `EleventyVite.runBuild()` (verified by Read: `node_modules/@11ty/eleventy-plugin-vite/EleventyVite.js:114-165`) automatically injects every Eleventy-emitted HTML output into `viteOptions.build.rollupOptions.input` — see lines 122-125: it merges `getEleventyRollupOptionsInput(input)` (HTML outputs with `outputPath` ending in `.html`) with `getUserRollupOptionsInput(viteOptions.build.rollupOptions.input)`. So adding new templated `.html` outputs (like `_scaffold-check/index.html`) makes them additional Vite entry points without any user config.

### Recommended Project Structure (additive — Phase 74 baseline preserved)

```
beeatlas/
├── eleventy.config.js               # UNCHANGED
├── vite.config.ts                   # UNCHANGED
├── _pages/
│   ├── index.html                   # SPA (Liquid no-op) — UNCHANGED
│   └── scaffold-check.njk           # NEW: orphan diagnostic page
├── _layouts/
│   ├── base.njk                     # NEW: chrome-less HTML5 shell
│   └── default.njk                  # NEW: extends base.njk + bee-header chrome
├── _data/
│   └── build-info.js                # NEW: surfaces Eleventy/plugin/vite versions, timestamp, git SHA
├── _includes/                       # remains empty (no shared partials yet)
├── src/
│   ├── bee-atlas.ts                 # UNCHANGED
│   ├── bee-header.ts                # UNCHANGED — already self-registers
│   └── entries/
│       └── bee-header.ts            # NEW: side-effect import for the layout's script tag
└── (rest unchanged)
```

Naming notes:
- **`src/entries/bee-header.ts`** chosen over `src/bee-header-entry.ts` because (a) Phase 74 established `src/` as the JS source root passthrough-copied into `_site/src/` (and renamed to `.11ty-vite/src/`), and (b) v3.2 will likely add more standalone bundle entries (e.g., a species-page entry); a dedicated `src/entries/` subdirectory keeps them grouped without colliding with the SPA's top-level `src/*.ts`. The path inside the layout is `/src/entries/bee-header.ts` (root-absolute, mirrors how Vite resolves Vite-root paths inside `.11ty-vite/`).

### Pattern 1: Layout chain via `{{ content | safe }}` (the pnwmoths pattern)

**What:** `default.njk` declares `layout: base.njk` in its front matter. Eleventy renders `default.njk`'s body, then injects that into `base.njk`'s `{{ content | safe }}` slot. Pages declaring `layout: default.njk` work the same way — their body lands in `default.njk`, which then lands in `base.njk`.

**When to use:** Always (this phase only). Decision is locked: `{{ content | safe }}`, not `{% block content %}{% endblock %}`. This matches pnwmoths verbatim ([VERIFIED: read `~/dev/pnwmoths/src/_includes/base.njk:34` — `{{ content | safe }}`]). Mixing block-style and content-variable in a single chain is the documented footgun.

**Example — `_layouts/base.njk` (~12 lines):**

```nunjucks
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title or "BeeAtlas" }}</title>
  <link rel="icon" href="data:,">
</head>
<body>
{{ content | safe }}
</body>
</html>
```

**Example — `_layouts/default.njk` (~10 lines):**

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

Notes on the `default.njk` shape:

1. The `<script type="module" src="/src/entries/bee-header.ts">` path is a **literal source-path** — Vite's HTML processor (under `appType: "mpa"`) will (a) resolve `/src/entries/bee-header.ts` relative to its `root` (which the plugin sets to `.11ty-vite/`), (b) bundle and hash it, and (c) rewrite the `src` attribute in the emitted HTML to `/assets/bee-header-[hash].js`. Pnwmoths proves this works at scale: `<script type="module" src="/components/main.js">` in `src/_includes/base.njk` becomes `<script type="module" crossorigin src="/assets/main-mrwqL7M5.js">` in every emitted page [VERIFIED: read `~/dev/pnwmoths/_site/index.html`, `_site/browse/index.html`, `_site/glossary/index.html` — all three pages show the identical hashed path].

2. **No `rollupOptions.input` configuration needed.** The plugin auto-derives entries from Eleventy's HTML outputs (`EleventyVite.js:122-125`). The SPA's `_pages/index.html` becomes one Rollup entry; `_scaffold-check/index.html` becomes another. Vite walks the `<script>` tags in each, produces independent (or shared, via Rollup's default chunking) bundles. Locked decision in CONTEXT (decision #5) said "Multi-entry Vite build" — that is what happens, **but it is automatic**. The planner does NOT need to add `viteOptions.build.rollupOptions.input` to `eleventy.config.js`.

3. The `<bee-header>` element appears in the HTML directly. The custom element is registered by the imported module (`src/entries/bee-header.ts` → `src/bee-header.ts` → `@customElement('bee-header')` decorator at module load). Element upgrades automatically when the script loads. No `customElements.define` call needed in the entry file.

### Pattern 2: Side-effect entry file (one line)

**What:** A tiny module whose only purpose is to be a Rollup entry that triggers `bee-header.ts`'s side-effect-driven custom-element registration.

**When to use:** When a layout needs a custom element bundle separate from the SPA bundle. Beeatlas: `default.njk` references this entry; the SPA uses its own different entry.

**Example — `src/entries/bee-header.ts` (1 line):**

```ts
import '../bee-header.ts';
```

Why this works:
- `src/bee-header.ts:4` declares `@customElement('bee-header')` (Lit decorator). On module load, Lit registers the custom element with the browser. [VERIFIED: read of `src/bee-header.ts:1-5`.]
- `src/bee-header.ts` imports only from `lit` and `lit/decorators.js` ([VERIFIED: lines 1-2]). Zero SPA-coupled imports. The bundle is `lit` core + the component.
- Therefore the entry needs no `customElements.define(...)` call — the side-effect import is enough.

Bundle-size estimate (informational, planner verifies during execution):
- Lit core: ~16 KB gzipped (training knowledge, `[ASSUMED]`)
- bee-header component: ~3-4 KB raw, ~1-2 KB gzipped
- Total: ~20-25 KB gzipped, well under the 100 KB CONTEXT budget. If it ends up much larger, that's a signal to investigate transitive imports — but the source confirms there aren't any.

### Pattern 3: `_data/build-info.js` for diagnostic surface

**What:** Eleventy reads `.js` files in `_data/` at build time and exposes their default export to all templates. The data file resolves package versions by reading `node_modules/<pkg>/package.json` and timestamps via `Date.now()`.

**When to use:** Any time you need build-time metadata in templates. Phase 75 uses it to populate the `/_scaffold-check/` page.

**Example — `_data/build-info.js`:**

```js
// Source: synthesized from Eleventy 3.x _data/ docs + node_modules read pattern
// Runs once per build (or once per dev-server start). Data is exposed to
// templates as the "build" namespace because the file is named build-info.js
// (Eleventy strips "-info" — no, it doesn't; the variable name is the
// filename). Actually, Eleventy exposes the namespace as the filename
// minus extension. Use `{{ buildInfo.eleventyVersion }}`. Or rename to
// `_data/build.js` to get `{{ build.eleventyVersion }}`. Planner picks.
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

Filename → namespace mapping: Eleventy exposes `_data/foo.js` as `{{ foo.* }}` in templates. Choose `_data/build.js` for `{{ build.eleventyVersion }}` etc., or `_data/buildInfo.js` for `{{ buildInfo.eleventyVersion }}`. **Recommend `_data/build.js`** — short, no dash-or-camelCase ambiguity.

[VERIFIED: read `~/dev/pnwmoths/src/_data/glossary.js`, `images.js`, etc. — same `export default` pattern; Eleventy 3.x ESM `_data/` files are standard.]

### Pattern 4: `_pages/scaffold-check.njk` page (filename without underscore, URL with underscore via permalink)

**What:** A small page template that consumes `default.njk` and surfaces the `build.*` data.

**When to use:** This phase only. Not removed post-merge — kept as living deploy diagnostic per CONTEXT decision #1.

**Example — `_pages/scaffold-check.njk`:**

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

Front matter notes:
- `layout: default.njk` — bee-header chrome appears above the `<main>` block; `{{ content | safe }}` slots in everything below the `---`.
- `permalink: /_scaffold-check/index.html` — overrides Eleventy's default permalink derivation. Source filename has no underscore; output URL does. Sidesteps the underscore-prefix-in-input ambiguity (see Pitfall 2).
- `eleventyExcludeFromCollections: true` — defensive for v3.2; if any layout (e.g., a future `default.njk` that lists `collections.all` for a sitemap) iterates pages, this page won't appear.

### Anti-Patterns to Avoid

- **Setting `viteOptions.build.rollupOptions.input` in `eleventy.config.js`.** The plugin auto-derives input from Eleventy HTML outputs and merges with user input. Adding `bee-header` here is **redundant** with the layout's `<script>` tag — Vite would discover it via the HTML processor anyway, and an explicit input would make `bee-header` a Rollup entry without a corresponding HTML host (which works, but adds a config surface that drifts from the pnwmoths reference).
- **Mixing `{{ content | safe }}` and `{% block content %}{% endblock %}`** within the same layout chain. Pick one (we picked `{{ content | safe }}`). Mixing leads to double-rendered content or empty slots depending on which engine processes which layer.
- **Putting the `<script>` tag in `base.njk`.** Phase 75 wants base.njk to be **chrome-less** (CONTEXT decision #3). Pages or layouts that extend base directly should NOT pull in bee-header. Keep the `<script>` tag in `default.njk` (with chrome) only.
- **Using `_pages/_scaffold-check.njk` (literal underscore prefix on the source filename).** Eleventy 3.x's behavior on underscore-prefixed input files is not unambiguously documented. The safe path: filename without underscore, URL with underscore via `permalink:`.
- **Calling `customElements.define('bee-header', BeeHeader)` in the entry file.** Redundant — the `@customElement` decorator already registers it on module load. Adding the manual call would emit a `DOMException: NotSupportedError` (element already defined).
- **Importing bee-header into the SPA bundle from the new entry.** The SPA already imports `./bee-header.ts` at `src/bee-atlas.ts:7`. Two entries that both reach `bee-header.ts` will share the chunk via Rollup's default dedup — no `manualChunks` config needed. Don't add one.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hashed asset path lookup | `_data/manifest.js` reading `_site/.vite/manifest.json` | `<script type="module" src="/src/entries/bee-header.ts">` in the layout — let Vite rewrite | Vite's HTML processor does this inline; reading a manifest is unnecessary indirection. Pnwmoths proves the pattern. |
| Multi-entry Rollup config | Explicit `viteOptions.build.rollupOptions.input` | Trust the plugin's auto-derivation from Eleventy HTML outputs | Plugin merges Eleventy outputs with user input (`EleventyVite.js:122`); user input is for Rollup entries that have NO HTML host. Bee-header has an HTML host (`/_scaffold-check/index.html`), so no user input needed. |
| Custom-element registration in entry | `customElements.define('bee-header', BeeHeader)` | Side-effect `import './bee-header.ts'` | Lit `@customElement` decorator already self-registers. Manual registration is redundant and double-defines. |
| Layout-engine differences in `_pages/` | Forcing all pages to one engine | Per-template engine selection | Eleventy supports `.html` (Liquid default) and `.njk` (Nunjucks) side-by-side. SPA stays Liquid no-op (proven Phase 74); new pages are Nunjucks. No transpilation needed. |
| Build-time metadata propagation | A separate npm script that writes a JSON file | `_data/build.js` (Eleventy's standard data-file mechanism) | Eleventy 3.x evaluates `_data/*.js` once at build start; data is available to all templates without filesystem reads. Pnwmoths uses the same pattern (`src/_data/glossary.js`, `images.js`, etc.). |

**Key insight:** Every mechanism this phase needs is standard Eleventy or standard Vite. The phase is template-writing and one tiny entry file — no pipeline engineering.

## Runtime State Inventory

> Phase 75 is greenfield (all new files; no rename or refactor). Inventory included only for completeness — no items found.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — phase adds new files only; no existing record references new identifiers. | None |
| Live service config | None. The new `/_scaffold-check/` URL path is not registered in CloudFront, robots, sitemap, etc. (CONTEXT decision #1: orphan, no robots disallow needed). | None |
| OS-registered state | None. | None |
| Secrets/env vars | None new. `VITE_MAPBOX_TOKEN` flow unaffected (the new bee-header bundle does not consume Mapbox env; bee-header is presentation-only). | None |
| Build artifacts / installed packages | None new — no package adds. `node_modules/` regenerates on `npm ci` as before. | None |

**Canonical question answer:** Phase 75 introduces new files only. Nothing to update post-merge.

## Common Pitfalls

### Pitfall 1: Mixed layout-content syntax (block vs. content-variable)

**What goes wrong:** A layout uses `{% block content %}{% endblock %}`, the page uses `{{ content | safe }}` semantics (Eleventy's default), or vice-versa. Result: empty `<main>`, or the page body appears twice.

**Why it happens:** Eleventy 3.x supports both Nunjucks-native blocks (`{% extends %}` + `{% block %}{% endblock %}`) AND its own front-matter-driven layout chain (`layout: foo.njk` + `{{ content | safe }}`). They are different mental models; a layout written for one will misbehave in the other.

**How to avoid:** Use the front-matter-driven model exclusively. `default.njk` declares `layout: base.njk` in its OWN front matter. Pages declare `layout: default.njk`. Both `base.njk` and `default.njk` use `{{ content | safe }}` for the content slot. Never use `{% extends %}` or `{% block %}` for layout chaining in this repo. (Pnwmoths model — verified.)

**Warning signs:** `_site/_scaffold-check/index.html` has empty `<main>`; or contains the build-info table twice; or contains the bee-header element twice (with two registrations).

### Pitfall 2: Underscore-prefixed source filename in input directory

**What goes wrong:** A file named `_pages/_scaffold-check.njk` may or may not be processed by Eleventy 3.x — the docs are not unambiguous. If it isn't processed, no `_site/_scaffold-check/index.html` is emitted; the page silently doesn't exist.

**Why it happens:** Eleventy reserves the underscore prefix for `_includes/`, `_data/`, `_layouts/` as directories. Whether files starting with underscore in the input dir itself are skipped is a separate (and unclear) question. WebSearch on 2026-04-30 returned an AI-summarized claim that they are skipped, but the underlying GitHub issues read as unresolved feature requests. Source-of-truth verification by writing a test file is the only sure answer; the planner should NOT block on resolving this — instead, sidestep.

**How to avoid:** Name the source file `_pages/scaffold-check.njk` (no underscore prefix on the filename) and set `permalink: /_scaffold-check/index.html` in front matter. Eleventy uses the permalink verbatim for the output path. The output URL `/_scaffold-check/` is preserved per CONTEXT decision #1. The source filename is unambiguously processed.

**Warning signs:** Build runs without errors but `_site/_scaffold-check/index.html` does not exist after a successful `npm run build`.

### Pitfall 3: Vite cannot resolve `/src/entries/bee-header.ts` from inside `.11ty-vite/`

**What goes wrong:** The layout's `<script type="module" src="/src/entries/bee-header.ts">` produces a Vite build error: `Could not resolve "/src/entries/bee-header.ts" from ".11ty-vite/_scaffold-check/index.html"`. The bundle is never produced; the script tag in the emitted HTML still points at the un-rewritten source path; the page errors out client-side trying to load `.ts` directly.

**Why it happens:** The plugin renames `_site/` → `.11ty-vite/` before Vite runs. Vite's `root` is `.11ty-vite/`. For Vite to resolve `/src/entries/bee-header.ts`, the file must exist at `.11ty-vite/src/entries/bee-header.ts`. Phase 74 already passes `src/` through Eleventy (`eleventyConfig.addPassthroughCopy({ "src": "src" })` — verified `eleventy.config.js:28`), so `src/` lands in `_site/src/` which becomes `.11ty-vite/src/`. The new `src/entries/bee-header.ts` must therefore land inside the existing `src/` passthrough — which it does naturally, because subdirectories are included. No new passthrough rule needed.

**How to avoid:** Place the entry file at `src/entries/bee-header.ts` (as recommended). Verify by inspecting `_site/src/entries/bee-header.ts` after a build (it should exist as an unmodified passthrough copy alongside the bundled `_site/assets/bee-header-*.js`).

**Warning signs:** Vite error during `npm run build`: `Rollup failed to resolve import "/src/entries/bee-header.ts" from ".11ty-vite/_scaffold-check/index.html"`. Or: `_site/_scaffold-check/index.html` contains the un-rewritten `src="/src/entries/bee-header.ts"` (Vite skipped the page).

### Pitfall 4: `<bee-header>` upgrade timing in dev mode

**What goes wrong:** In dev (`npm run dev` → Eleventy serve + Vite middleware), the `<bee-header>` element renders as an unstyled inert tag for a moment before the script loads. On a slow network (or with `network: throttling: 3G`) this is visible as a layout shift. In production this is generally fine because Vite produces `<script type="module" crossorigin>` which the browser preloads efficiently.

**Why it happens:** Custom elements upgrade asynchronously after the registration script loads. Standard web-platform behavior.

**How to avoid:** Accept it for v3.1 — bee-header is small, the FOUC is brief. Phase 74 verified HMR works for `src/bee-header.ts` (the `<bee-header>` element re-renders on edit). v3.2 may add SSR for layout components if the FOUC becomes a problem; CONTEXT defers SSR explicitly.

**Warning signs:** Visible flash of un-styled element on `/_scaffold-check/` first paint. Not a regression — same behavior as in the SPA.

### Pitfall 5: `_data/build.js` runs during dev-server start; values become stale during long sessions

**What goes wrong:** A developer runs `npm run dev`, leaves the server running for hours, makes a commit. The `/_scaffold-check/` page still shows the old `gitSha` and old `builtAt`. They think the build is broken.

**Why it happens:** `_data/*.js` files are evaluated **once** when Eleventy starts the dev server. They do not re-run on file changes (unless the data file itself changes). This is by design — Eleventy treats `_data/` as build-time-static.

**How to avoid:** Document this in the page itself: "Built at: {{ build.builtAt }} (refreshed on dev-server restart, NOT on file change)". For production, the values are accurate because the dev server does not produce `/_scaffold-check/` — production builds run `_data/build.js` once per `npm run build` invocation.

**Warning signs:** Stale `gitSha` after commits during a long-lived `npm run dev` session. Restart `npm run dev` to refresh.

### Pitfall 6: `npm run build` succeeds but produces no `assets/bee-header-*.js`

**What goes wrong:** Build returns exit 0; `_site/_scaffold-check/index.html` exists. But `ls _site/assets/bee-header-*.js` returns no matches. The page emits `<script src="/src/entries/bee-header.ts">` (un-rewritten) and the browser fails to load it.

**Why it happens:** Could be (a) the layout's `<script>` tag was put inside a comment or wrapped in a way Vite's HTML processor skipped, (b) the entry file path doesn't exist (typo, not yet committed), or (c) the page was emitted but Eleventy reported `results.length === 0` somehow (edge case from Phase 74-01).

**How to avoid:** Verification step in the plan: after `npm run build`, assert all of:
- `test -f _site/_scaffold-check/index.html`
- `ls _site/assets/bee-header-*.js | head -1` matches a file
- `grep -E 'src="/assets/bee-header-[A-Za-z0-9_-]+\.js"' _site/_scaffold-check/index.html` succeeds

**Warning signs:** Manual smoke (`open http://localhost:8080/_scaffold-check/`) shows no header chrome. DevTools network tab shows 404 on `/src/entries/bee-header.ts`.

## Code Examples

The four examples above (Pattern 1's `base.njk`, `default.njk`; Pattern 2's entry file; Pattern 3's `_data/build.js`; Pattern 4's `scaffold-check.njk`) cover all the new files this phase introduces. Sources for each:

- `base.njk` shape — derived from `~/dev/pnwmoths/src/_includes/base.njk:1-43` [VERIFIED Read]
- `default.njk` shape — synthesized; pnwmoths is single-layer so no direct analog. The `layout: base.njk` front-matter chain is documented in Eleventy 3.x docs ([CITED: 11ty.dev/docs/layouts/, accessed via training knowledge — planner should sanity-check on first build])
- Entry file — `src/bee-header.ts:4` self-registration confirmed by Read; one-line side-effect import is a standard Vite/Rollup pattern
- `_data/build.js` — pattern matches `~/dev/pnwmoths/src/_data/glossary.js:1-30` (synchronous file read at build time, default-exported data) [VERIFIED Read]
- `scaffold-check.njk` — Eleventy front-matter `permalink:` and `eleventyExcludeFromCollections:` are documented features [CITED: 11ty.dev/docs/permalinks/ and 11ty.dev/docs/collections/, training knowledge]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-rolled `_data/manifest.js` reading Vite's `manifest.json` | Layout `<script>` tag → Vite rewrites in-place | Vite 2.x onward (HTML processing in `appType: "mpa"`) | No manifest read needed; pnwmoths confirms |
| Lit `customElements.define(...)` manually | `@customElement('name')` decorator | Lit 2.x onward | Fewer lines, registration on module load |
| Eleventy 2.x with CommonJS `.eleventy.js` | Eleventy 3.x with ESM `eleventy.config.js` | Eleventy 3.x release | Already on 3.x; ESM data files use `export default` |

**Deprecated/outdated:**
- `slinkity` — listed as unmaintained in the official `eleventy-plugin-vite` README. No longer relevant.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Bundle size of bee-header bundle ~20-25 KB gzipped | Pattern 2 | Low. If much larger, planner investigates transitive imports during build verification. CONTEXT budget is <100 KB gzipped — easily met. |
| A2 | `_data/*.js` filename → namespace mapping (filename minus extension) is current Eleventy 3.x behavior | Pattern 3 | Low. Same as Eleventy 2.x; pnwmoths uses this pattern in `_data/glossary.js`. Verify on first build by templating `{{ build.eleventyVersion }}` and running. |
| A3 | Eleventy 3.x's behavior on underscore-prefixed input files is ambiguous | Pitfall 2 | Low — the recommendation is to sidestep entirely (filename without underscore + permalink). Even if underscore IS processed, the chosen pattern still works. |
| A4 | Lit core gzip size ~16 KB | Pattern 2 | Cosmetic — bundle-size estimate only. Actual size confirmed during build. |
| A5 | Vite's HTML processor under `appType: "mpa"` rewrites `<script type="module">` paths in every templated HTML page (not just one designated entry) | Pattern 1 | LOW after pnwmoths verification — `_site/index.html`, `_site/browse/index.html`, `_site/glossary/index.html` all contain identical hashed `/assets/main-mrwqL7M5.js` references derived from `<script src="/components/main.js">` in the shared layout. This is the load-bearing assumption of the entire phase; verified evidence makes it HIGH confidence in practice, but the underlying Vite docs were not directly read in this research. |
| A6 | Two HTML entries (SPA `index.html` and `_scaffold-check/index.html`) referencing different scripts will produce two independent hashed bundles, with Lit core de-duped via Rollup's default chunking | Pattern 1 / Anti-Patterns | Medium. Default Rollup chunking dedupes shared modules into common chunks when multiple entries share dependencies. Lit core is shared between bee-atlas.ts (SPA) and bee-header.ts (chrome entry). Outcome should be: one `bee-header-*.js` bundle, the SPA bundle, and possibly a shared `lit-*.js` chunk. CONTEXT decision #5 said "no shared code-split" — Rollup's default behavior may emit a small shared chunk anyway. This is fine and matches the CONTEXT framing ("Vite/Rollup will dedupe Lit-core if both bundles need it, but a single shared chunk is fine"). |

**Recommendation to planner:** Treat assumption A5 as the single most important thing to validate by smoke after writing the layouts. If `_site/_scaffold-check/index.html` does NOT show a hashed path after the first build, the rest of the phase architecture has to be rethought. Confirm this in the first build of the first plan; do not defer to phase-end UAT.

## Open Questions (RESOLVED)

1. **Do we want `default.njk` to also load a stylesheet?**
   - What we know: pnwmoths' `base.njk` loads `pico.min.css`, `theme.css` from `<link>` tags. bee-header has `static styles = css\`...\`` — Lit shadow DOM styles encapsulate within the component.
   - What's unclear: Does the chrome need any global stylesheet (font, color tokens, body reset)? CONTEXT doesn't specify.
   - **RESOLVED:** Don't add a global stylesheet in this phase. bee-header's encapsulated styles cover the chrome. Phase 75 ships a minimal layout; v3.2 adds typography/site-wide CSS when content pages need it. If the planner's UAT shows the orphan page looking "naked" (Times New Roman defaults), add a single inline `<style>` in `base.njk` for body font and margin reset — but defer to v3.2 for a real stylesheet pipeline.

2. **Should we add a Vitest test that asserts `<bee-header>` registers from the entry?**
   - What we know: `src/tests/bee-header.test.ts` already exists (covers component behavior). 172 tests stay green.
   - What's unclear: Whether to add a 173rd test that imports `src/entries/bee-header.ts` and asserts `customElements.get('bee-header')` is defined. Trivial (~5 lines) but slightly redundant with existing tests.
   - **RESOLVED:** Skip in Phase 75. The orphan `/_scaffold-check/` page IS the verification — visiting it in dev mode and seeing the chrome render is the manual UAT. CONTEXT decision-area says "Whether to add a Vitest test … is the planner's call. The 172 tests stay green gate is satisfied either way."

3. **Filename convention: `_data/build.js` vs `_data/buildInfo.js`?**
   - What we know: Eleventy maps filename to template namespace. `_data/build.js` → `{{ build.* }}`. `_data/buildInfo.js` → `{{ buildInfo.* }}`.
   - What's unclear: Naming preference only.
   - **RESOLVED:** `_data/build.js`. Shorter, unambiguous, no camelCase.

4. **HMR for the new layout files:**
   - What we know: Phase 74 confirmed HMR works for `src/bee-header.ts` (component edits propagate without full reload). Edits to `_layouts/*.njk` and `_pages/*.njk` should trigger Eleventy rebuilds (not full Vite HMR) because those are server-rendered.
   - What's unclear: Whether the dev server picks up new `_data/build.js` edits without a full restart.
   - **RESOLVED:** Document the limitation: `_data/*.js` is evaluated once on dev-server start. To refresh `gitSha` after a commit during a long dev session, restart `npm run dev`. Not a regression; standard Eleventy behavior.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 18+ | Eleventy, Vite, ESM data files | ✓ | 24.12.0 [VERIFIED `node --version`] | — |
| `@11ty/eleventy` | Layout chain, `_data/`, page templating | ✓ | 3.1.5 [VERIFIED] | — |
| `@11ty/eleventy-plugin-vite` | HTML script-tag rewriting | ✓ | 7.1.1 [VERIFIED] | — |
| `vite` | HTML processor, bundler | ✓ | 6.4.2 (root) + 7.3.2 (plugin nested) [VERIFIED] | — |
| `lit` | bee-header element | ✓ | 3.2.1 [VERIFIED] | — |
| `git` | `_data/build.js` for `gitSha` | ✓ (local + CI checkout uses it) | — | `'unknown'` string fallback in shallow-clone CI |
| `vitest` | 172-test gate | ✓ | 4.1.2 [VERIFIED] | — |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None — `git rev-parse` failure (shallow CI clone) is handled by the `try/catch` in `_data/build.js` returning `'unknown'`.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 with happy-dom 20.8.9 |
| Config file | `vite.config.ts` (root; `test:` block) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |
| Test count target | **172 → 172** (no test count change required; CONTEXT decision Claude's-Discretion bullet allows but does not require a 173rd test) |

### Phase Requirements → Test Map

Note: Phase 75 has no explicit `REQ-XX` IDs in PROJECT.md or ROADMAP.md (per the additional_context). The CONTEXT decisions table is the requirements set. Mapping each decision to a verification:

| Req (CONTEXT) | Behavior | Test Type | Automated Command | File Exists? |
|---------------|----------|-----------|-------------------|-------------|
| Decision #1: orphan page emits to `/_scaffold-check/` | `_site/_scaffold-check/index.html` exists post-build | smoke | `npm run build && test -f _site/_scaffold-check/index.html` | ❌ Wave 0 (shell smoke) |
| Decision #1: page contains build-info | Page contains version strings | smoke | `npm run build && grep -E 'eleventy.+3\.[0-9]+\.[0-9]+' _site/_scaffold-check/index.html` | ❌ Wave 0 |
| Decision #2: Nunjucks layout chain | base.njk + default.njk render successfully | smoke | implicit in: `npm run build` exit 0 + scaffold-check page exists | ❌ Wave 0 |
| Decision #3: two-layer chain | Page contains both `<bee-header>` (from default.njk) AND wraps `<main>` content | smoke | `npm run build && grep '<bee-header' _site/_scaffold-check/index.html && grep '<main>' _site/_scaffold-check/index.html` | ❌ Wave 0 |
| Decision #4: bee-header chrome embedded | `<bee-header>` element + hashed bundle script tag in scaffold-check.html | smoke | `npm run build && grep -E 'src="/assets/bee-header-[A-Za-z0-9_-]+\.js"' _site/_scaffold-check/index.html` | ❌ Wave 0 (THIS IS THE ASSUMPTION-A5 PROBE) |
| Decision #5: bee-header bundle exists | `_site/assets/bee-header-*.js` exists | smoke | `npm run build && ls _site/assets/bee-header-*.js \| head -1` | ❌ Wave 0 |
| Decision #5: SPA bundle unchanged in shape | `_site/assets/index-*.js` still exists; `_site/index.html` still references it | smoke | `npm run build && grep -E 'src="/assets/index-[A-Za-z0-9_-]+\.js"' _site/index.html` | ❌ Wave 0 (regression of phase-74 invariant) |
| 172 tests stay green | Vitest run | unit | `npm test` | ✅ existing |
| `VITE_MAPBOX_TOKEN` keeps working | SPA still loads Mapbox tiles | manual UAT | `npm run dev` → http://localhost:8080/ → tiles render | ❌ manual |
| Bee-header renders on `/_scaffold-check/` in dev | Visible in browser | manual UAT | `npm run dev` → http://localhost:8080/_scaffold-check/ → header chrome visible | ❌ manual |
| Bundle size <100 KB gzipped | bee-header bundle within budget | smoke | `gzip -c _site/assets/bee-header-*.js \| wc -c` < 102400 | ❌ Wave 0 (informational; planner picks pass criterion) |

### Sampling Rate

- **Per task commit:** `npm test` (172 tests; happy-dom; <1s)
- **Per wave merge:** `npm test && npm run build` plus the smoke-grep block above (8 assertions, all shell)
- **Phase gate:** Full smoke + manual UAT (open `/_scaffold-check/` in browser; confirm header chrome + build-info table; confirm SPA at `/` still works)

### Wave 0 Gaps

- [ ] No new test FILES needed in `src/tests/` — existing 172-test suite covers component behavior; build-shape verification is shell-level (no value in unit-testing build orchestration).
- [ ] [ASSUMED] If the planner decides to add a 173rd test asserting `customElements.get('bee-header')` after importing the entry, it goes in `src/tests/bee-header-entry.test.ts`. Optional; CONTEXT does not require it.
- [ ] No framework install needed (Vitest 4.1.2 already present).

## Sources

### Primary (HIGH confidence)

- `/Users/rainhead/dev/beeatlas/src/bee-header.ts` [VERIFIED Read] — confirms `@customElement('bee-header')` self-registration, no SPA-coupled imports
- `/Users/rainhead/dev/beeatlas/src/bee-atlas.ts:7` [VERIFIED Read] — confirms SPA imports bee-header via side-effect (`import './bee-header.ts'`)
- `/Users/rainhead/dev/beeatlas/eleventy.config.js` [VERIFIED Read] — confirms current passthrough config (`src` is passthrough-copied)
- `/Users/rainhead/dev/beeatlas/vite.config.ts` [VERIFIED Read] — confirms current Vite config (no `rollupOptions.input` set; default chunking)
- `/Users/rainhead/dev/beeatlas/_pages/index.html` [VERIFIED Read] — confirms SPA's existing `<script type="module" src="./src/bee-atlas.ts">` and Liquid no-op pattern
- `/Users/rainhead/dev/beeatlas/node_modules/@11ty/eleventy-plugin-vite/EleventyVite.js:114-165` [VERIFIED Read] — confirms `runBuild()` auto-injects Eleventy HTML outputs into Rollup `input` and merges with user input
- `/Users/rainhead/dev/beeatlas/node_modules/@11ty/eleventy-plugin-vite/.eleventy.js` [VERIFIED Read] — confirms plugin auto-registers `addPassthroughCopy("public")` and the `eleventy.after` hook that calls `runBuild()`
- `/Users/rainhead/dev/beeatlas/node_modules/@11ty/eleventy-plugin-vite/README.md` [VERIFIED Read] — confirms plugin defaults: `appType: "mpa"`, `serverOptions.middlewareMode: true`, `build.emptyOutDir: true`
- `~/dev/pnwmoths/src/_includes/base.njk:34` [VERIFIED Read] — confirms `{{ content | safe }}` content-variable pattern
- `~/dev/pnwmoths/src/_includes/base.njk:40` [VERIFIED Read] — confirms `<script type="module" src="/components/main.js">` source-path pattern
- `~/dev/pnwmoths/_site/index.html`, `_site/browse/index.html`, `_site/glossary/index.html` [VERIFIED Bash] — all three pages contain `<script type="module" crossorigin src="/assets/main-mrwqL7M5.js">` — proves Vite rewrites layout-injected script tags across ALL templated HTML pages, not just an entry
- `~/dev/pnwmoths/_site/assets/main-*.js` [VERIFIED Bash ls] — confirms hashed bundle path
- `~/dev/pnwmoths/src/_data/glossary.js` [VERIFIED Read] — confirms `_data/*.js` ESM `export default` pattern
- `~/dev/pnwmoths/eleventy.config.js` [VERIFIED Read] — confirms plugin registration shape (`viteOptions: { appType: "mpa", ... }`)
- `~/dev/pnwmoths/vite.config.js` [VERIFIED Read] — confirms standalone-Vite root/outDir config (NOT used in beeatlas; recorded for completeness)
- `~/dev/pnwmoths/package.json` [VERIFIED Read] — confirms `@11ty/eleventy@^3.1.5`, `@11ty/eleventy-plugin-vite@^7.0.0` versions in pnwmoths
- `npm view @11ty/eleventy version` 2026-04-30 → 3.1.5 [VERIFIED Bash]
- `npm view @11ty/eleventy-plugin-vite version` 2026-04-30 → 7.1.1 [VERIFIED Bash]
- `node --version` → v24.12.0 [VERIFIED Bash]
- `/Users/rainhead/dev/beeatlas/.nvmrc` [VERIFIED Read] → 24.12
- `.planning/phases/074-eleventy-build-wrapper/074-PHASE-SUMMARY.md` [VERIFIED Read] — Phase 74 entry conditions and patterns
- `.planning/phases/074-eleventy-build-wrapper/074-01-SUMMARY.md` [VERIFIED Read] — `results.length === 0` short-circuit pitfall, two-step publicDir pipeline
- `.planning/phases/074-eleventy-build-wrapper/074-03-SUMMARY.md` [VERIFIED Read] — viteOptions pass-through pattern for dev (envDir, optimizeDeps.exclude); HMR confirmed on bee-header

### Secondary (MEDIUM confidence)

- 11ty.dev/docs/layouts/ [CITED training knowledge, not directly fetched in this session] — Eleventy 3.x layout-chain mechanics (front-matter `layout:` + `{{ content | safe }}`)
- 11ty.dev/docs/permalinks/ [CITED training knowledge] — `permalink:` front-matter override
- 11ty.dev/docs/collections/ [CITED training knowledge] — `eleventyExcludeFromCollections: true` semantics

### Tertiary (LOW confidence)

- WebSearch 2026-04-30: "eleventy 3.x file starting with underscore in input directory processed or skipped" — AI summary said skipped; underlying GitHub issues (#1057, #774) read as feature requests rather than confirmed defaults. **Documented as Pitfall 2 with sidestep recommendation; planner does not depend on resolving this.**
- WebFetch 11ty.dev/docs/ignores/ — explicitly does not cover the underscore-in-input-dir question

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against npm + node_modules; no new packages
- Architecture (layout chain + Vite HTML processing): HIGH — pnwmoths end-to-end verification of the script-rewrite pattern across multiple pages
- Pitfalls: HIGH — derived from concrete file inspection (Phase 74 SUMMARY's documented deviations + bee-header.ts source reading)
- Bundle size estimate: MEDIUM (assumption A4 — Lit core size from training knowledge; verified during build is the planner's call)
- Underscore-prefix-in-input-dir behavior: LOW (not resolvable from available sources; **sidestepped by recommendation, not depended on**)

**Research date:** 2026-04-30
**Valid until:** 2026-05-30 (30 days — Eleventy 3.x and the plugin are stable; pnwmoths reference is current)

## RESEARCH COMPLETE
