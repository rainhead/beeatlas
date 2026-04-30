# Phase 75: Authoring Scaffold and Verification — Context

**Gathered:** 2026-04-30
**Status:** Ready for planning
**Source:** `/gsd-discuss-phase 75` interactive discussion + `074-CONTEXT.md` carry-forward + `074-PHASE-SUMMARY.md` entry conditions.

<domain>
## Phase Boundary

Lay down the empty Eleventy authoring scaffold (base layout chain + a single built-but-orphan verification page) and prove that an Eleventy-rendered page produces a working `_site/` artifact through the existing Eleventy + Vite plugin pipeline. **No user-facing content pages.** The SPA at `/` continues to serve unchanged.

This is the second and final phase of v3.1. After this phase ships, v3.2 (Species Tab) can drop content pages into `_pages/` using the layout chain established here.

</domain>

<decisions>
## Implementation Decisions

### Locked (carried forward from 074-CONTEXT.md and 074-PHASE-SUMMARY.md — do not re-litigate)

- **Eleventy outer + Vite inner via `@11ty/eleventy-plugin-vite`.** Pipeline shape, plugin contract, and `dir` block in `eleventy.config.js` are fixed (input `_pages`, output `_site`, includes `_includes`, layouts `_layouts`, data `_data`).
- **No URL changes.** SPA stays at `/`. The orphan verification page lives at `/_scaffold-check/` (see below) — not user-facing.
- **No new user-facing content pages in v3.1.** Welcome page, /about/, /collection/, species pages, etc. are all v3.2.
- **172 Vitest tests stay green throughout.**
- **Mapbox token wiring (`VITE_MAPBOX_TOKEN`) keeps working.** The new bee-header bundle entry must inherit the same `import.meta.env` access pattern the SPA uses.
- **Schema-validation gate (`scripts/validate-schema.mjs`) keeps running pre-build.**
- **No Lit SSR.** Deferred to v3.2.
- **pnwmoths is the pattern reference** for the two-layer layout chain (`base.njk` + `default.njk`).

### Decided in this discussion

1. **Verification approach: built-but-orphan stub page at `/_scaffold-check/`.** A real Eleventy template that Eleventy + Vite plugin processes and emits to `_site/_scaffold-check/index.html`. **Not linked from anywhere** (no nav entry, no sitemap, no robots disallow needed since there's nothing to crawl). Renders metadata + diagnostic info: Eleventy version, plugin version, build timestamp, possibly Git SHA — useful for debugging deploys. **Kept post-merge as living verification** (not a temp file removed before shipping). Doubles as the smallest possible "does the layout chain work?" smoke for any future scaffold change.

2. **Templating engine: Nunjucks (`.njk`)** for the base layout and any future content pages. Matches pnwmoths convention. The SPA's existing `_pages/index.html` stays as Liquid (default) — this is fine; Eleventy supports per-template engines simultaneously, and a Liquid no-op pass on the SPA index has already been proven by Phase 74.

3. **Two-layer layout chain.**
   - `_layouts/base.njk` — bare HTML5 shell: `<!doctype html>`, `<head>` block (title, meta, link tags), `<body>{{ content | safe }}</body>` (or Nunjucks block equivalent). No chrome. Pages or other layouts that want a chrome-less surface extend this directly.
   - `_layouts/default.njk` — extends `base.njk`; adds the bee-atlas chrome. Content pages default to this.

4. **Chrome: embed `<bee-header>` Lit component in `default.njk`.** Visual parity with the SPA. Static HTML approximation rejected (would diverge from SPA over time). The custom element gets defined by a separate Vite entry (see #5) — the layout just emits `<bee-header></bee-header>` plus a `<script type="module" src="/assets/bee-header-*.js">` reference (hashed path resolved by Vite's `manifest.json` or by Eleventy reading the manifest at build time — planner picks the exact mechanism).

5. **Multi-entry Vite build: a separate entry for `<bee-header>`.** The Vite build in this phase grows from "1 entry (SPA index.html)" to "2 entries: SPA index.html + a small bee-header standalone". Approximate shape:
   - New file `src/bee-header-entry.ts` (or similar — planner names it) that imports `./bee-header.ts` and (if needed) calls `customElements.define`. Side-effect import that registers the element.
   - `vite.config.ts` (or the plugin's `viteOptions`) gains a `build.rollupOptions.input` that lists both `_pages/index.html` (Eleventy templated, processed by the plugin's existing flow) and the new bee-header entry. Resulting bundles: `/assets/index-*.js` (the full SPA) and `/assets/bee-header-*.js` (just the header + Lit + dependencies — likely <50KB; planner verifies actual size).
   - Content pages reference only `/assets/bee-header-*.js`. The SPA continues to load the full SPA bundle. There is **no shared code-split** between the two entries (Vite/Rollup will dedupe Lit-core if both bundles need it, but a single shared chunk is fine — leave that to default Rollup chunking).

### Claude's Discretion (planner's call)

- **Layout file naming and Nunjucks block structure.** Whether `base.njk` uses `{% block content %}{% endblock %}` (Nunjucks block-style) or `{{ content | safe }}` (Eleventy front-matter content variable). Either is idiomatic; pnwmoths' convention is the tiebreaker.
- **Where the bee-header entry file lives.** `src/bee-header-entry.ts` is a placeholder name; planner picks the canonical location (e.g., `src/entries/bee-header.ts` if a multi-entry pattern emerges).
- **How `default.njk` resolves the hashed `bee-header-*.js` path.** Two valid approaches: (a) Vite manifest output → Eleventy `_data` plugin reads it → layout interpolates the hashed name; (b) the plugin's existing manifest handling already does this (verify in pnwmoths reference). Planner picks based on what `@11ty/eleventy-plugin-vite` provides out of the box.
- **What metadata the `/_scaffold-check/` page surfaces.** Eleventy version + plugin version + build timestamp at minimum. Git SHA, Node version, Vite version are nice-to-haves. Planner decides what's cheap to expose via `_data/build-info.js`.
- **Whether to add a `_data/site.js` (or similar) for the layout's `<title>`, meta description, etc.** Probably yes — site-wide constants belong in `_data/`. Planner scopes.
- **Test coverage.** Whether to add a Vitest test that asserts `<bee-header>` is registered after loading `bee-header-*.js`, or rely on the manual UAT (`npm run dev` + visit `/_scaffold-check/` + see the header render). The "172 tests stay green" gate is satisfied either way; an additional test is the planner's call.
- **How `npm run build` reports success of the new entry.** No specific assertion required beyond `_site/assets/bee-header-*.js` existing and `_site/_scaffold-check/index.html` containing the script tag. Planner can lock this in the verification step of the build plan.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase carry-forward (locked decisions and entry conditions)
- `.planning/phases/074-eleventy-build-wrapper/074-CONTEXT.md` — milestone-level locked decisions (URLs, plugin choice, no SSR, etc.)
- `.planning/phases/074-eleventy-build-wrapper/074-PHASE-SUMMARY.md` — entry conditions (`_pages/`, `_includes/`, `_layouts/`, `_data/` exist; explicit `dir` block; pattern: viteOptions pass-through for plugin dev middleware)
- `.planning/phases/074-eleventy-build-wrapper/074-01-SUMMARY.md` — the publicDir pipeline pattern (Eleventy passthrough + Vite default publicDir, two-step) and the "results.length === 0 short-circuits Vite build" pitfall

### Milestone scope
- `.planning/PROJECT.md` lines 1–28 — v3.1 milestone goal and explicit out-of-scope list (no welcome page, no /collection/, no Lit SSR, no new content pages)
- `.planning/seeds/species-tab.md` — v3.2 work this scaffold must enable (informs what the scaffold should make easy without committing to it)

### Reference implementation (pattern source)
- `~/dev/pnwmoths/eleventy.config.js` — `EleventyVitePlugin` registration; the two-layer layout chain pattern
- `~/dev/pnwmoths/_layouts/base.njk` and `~/dev/pnwmoths/_layouts/default.njk` — exact shape of the layout chain we're mirroring
- `~/dev/pnwmoths/vite.config.js` — multi-entry Rollup input; precedent for the bee-header entry shape

### Existing files this phase touches
- `eleventy.config.js` — already has `dir` block; this phase may add `_data/` consumers (build-info), and update plugin `viteOptions` if the multi-entry config flows through there
- `vite.config.ts` — `build.rollupOptions.input` likely grows; `optimizeDeps.exclude: ['wa-sqlite']` and `preloadAssets` plugin must remain
- `src/bee-header.ts` — the Lit component being embedded; check whether it has SPA-coupled side effects that would surprise a content page (planner audits)
- `_pages/index.html` — the SPA template; this phase does not modify it; the new bee-header entry must not regress its bundle
- `_layouts/.gitkeep` and `_includes/.gitkeep` — placeholders to be replaced (or supplemented) by the new layout files
- `package.json` scripts — `npm run build` should remain unchanged externally; if a manifest read step is added, wire it inside the Eleventy config, not as a separate npm script

</canonical_refs>

<specifics>
## Specific Ideas

### `/_scaffold-check/` page concrete shape
- File: `_pages/_scaffold-check.njk` (underscore prefix communicates "not for humans" without affecting URL — Eleventy includes it in the build)
- Front matter: `layout: default.njk`, `permalink: /_scaffold-check/index.html` (or default permalink, which derives the same path), `eleventyExcludeFromCollections: true` (so any future collection-based nav skips it)
- Body: a small block listing build metadata (Eleventy version, plugin version, build time, Vite version, node version, optional git SHA). Plain HTML — no fancy formatting needed.
- Visual confirmation: visiting `/_scaffold-check/` in the dev server or production deploy renders the page with the bee-header chrome and the metadata table. The page exists permanently as a deploy diagnostic.

### `default.njk` chrome shape
- Extends `base.njk`.
- Top of `<body>`: `<bee-header></bee-header>`.
- Loads `/assets/bee-header-*.js` (path resolved from the Vite manifest).
- Below the header: a single `{% block content %}{% endblock %}` (or Eleventy `{{ content | safe }}` — planner's call) for the page body.
- No footer in v3.1. v3.2 can add one when a footer-warranting page exists.

### bee-header entry shape
- Tiny side-effect-only module:
  ```ts
  // src/bee-header-entry.ts (placeholder — planner names)
  import './bee-header.ts';
  ```
- If `bee-header.ts` already calls `customElements.define('bee-header', BeeHeader)` at module top level (verify), nothing else needed.
- If it doesn't (e.g., the SPA registers it elsewhere), the entry file calls `customElements.define` itself.
- The Vite build emits `/assets/bee-header-[hash].js`. Layout reads the hash from the manifest.

### Bundle-size budget (informational, planner verifies)
- Target: bee-header bundle <100KB gzipped. Likely <50KB given Lit + a single component. If it ends up much larger (e.g., bee-header transitively imports SPA-only modules like `bee-map`), that's a refactor signal — flag in plan, don't blindly ship a fat bundle.

### What "verification" produces
1. `_site/_scaffold-check/index.html` exists, contains `<bee-header>` element + script tag, contains the build-info table.
2. `_site/assets/bee-header-*.js` exists, registers the custom element.
3. Visiting `/_scaffold-check/` in `npm run dev` renders the bee-header in browser without errors.
4. `npm test` reports 172 tests passing (no regression).
5. `npm run build` succeeds end-to-end with both the SPA index and the new entry.

### What this phase does NOT include (boundary preservation)
- Adding `/about/`, `/colophon/`, or any other real content page. (User declined this option explicitly.)
- Adding a footer.
- Adding sitemap.xml or robots.txt.
- Adding Pagefind, lychee, or other tooling pnwmoths uses.
- Lit SSR for the bee-header (it's client-side rendered on content pages too).
- Any change to the SPA's bundle composition (the SPA continues to load the full `/assets/index-*.js`).

</specifics>

<deferred>
## Deferred Ideas

- **Welcome/about page at `/`** — v3.2 (already deferred at milestone level).
- **SPA URL move to `/collection`** — v3.2.
- **Species tab + species pages** — v3.2 (entire content of `.planning/seeds/species-tab.md`).
- **Footer** — v3.2 or later, when a footer-warranting page exists.
- **Sitemap, robots.txt, RSS feeds for content pages** — out of scope; existing `/feeds/` Atom feeds are bee-determination feeds, not page feeds.
- **Pagefind / link validation / page-weight checks** — pnwmoths uses these; beeatlas may adopt later.
- **Lit SSR for the bee-header (or any layout component)** — v3.2 decision; v3.1 stays client-rendered.
- **Authoring documentation (e.g., a CONTRIBUTING note explaining how to add a v3.2 content page)** — not requested; can be added retroactively in v3.2's first phase or as a quick task.
- **Sharing the bee-header bundle with the SPA via Rollup manualChunks (true code-split)** — explicitly rejected for v3.1 (separate entries are simpler and the SPA bundle is unchanged); revisit if v3.2 finds the duplication painful.

</deferred>

---

*Phase: 075-authoring-scaffold*
*Context gathered: 2026-04-30 via /gsd-discuss-phase 75 (4 questions across 2 turns; advisor mode not active)*
