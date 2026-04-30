---
phase: 075-authoring-scaffold
plans_completed: [01, 02]
requirements_completed: [D-01, D-02, D-03, D-04, D-05]
milestone: v3.1
completed: 2026-04-30
---

# Phase 75: Authoring Scaffold and Verification — Phase Summary

**Two-layer Nunjucks layout chain (`base.njk` + `default.njk`), side-effect Vite entry for `<bee-header>`, build-time metadata data file, and orphan verification page at `/_scaffold-check/` all in place. `npm run build` produces a working `_site/` artifact through the Eleventy + Vite plugin pipeline; the orphan page renders bee-header chrome + build-info table in browser; SPA at `/` unchanged; 172 Vitest tests green; v3.1 Eleventy Build Wrapper milestone complete.**

## Plans

| # | Title | Commit(s) | Status |
|---|-------|-----------|--------|
| 01 | Layout chain + bee-header entry + `_data/build.js` + orphan diagnostic page | `b86d67c` (atomic feat); `ba7eaf3` (docs) | ✅ |
| 02 | Manual UAT + milestone-close paperwork (ROADMAP/STATE/phase-summary) | `155b79f` | ✅ |

## Requirements Status (CONTEXT.md decisions as the requirements set)

- ✅ **D-01**: Orphan stub at `/_scaffold-check/` — `_pages/scaffold-check.njk` ships permanently as a deploy diagnostic. (Plan 01)
- ✅ **D-02**: Nunjucks templating — three new `.njk` files (`base.njk`, `default.njk`, `scaffold-check.njk`); SPA `index.html` continues as Liquid no-op (Phase 74 invariant). (Plan 01)
- ✅ **D-03**: Two-layer base+default layout chain via Eleventy front-matter `layout:` + `{{ content | safe }}` (NOT Nunjucks `{% extends %}`/`{% block %}`). (Plan 01)
- ✅ **D-04**: `<bee-header>` Lit component embedded in `default.njk`; chrome visibly renders on the orphan page (BeeAtlas title + map/table icons + GitHub link, dark bg) — UAT confirmed in-browser render. (Plan 01 build + Plan 02 UAT)
- ✅ **D-05**: Multi-entry Vite build — research-confirmed automatic via the plugin's HTML processor (`appType: "mpa"`). `_site/assets/bee-header-DNHAQll3.js` produced alongside `_site/assets/index-pgqDAatT.js` with no `rollupOptions.input` config and no `_data/manifest.js`. The load-bearing A5 probe (Vite rewrites `<script src="/src/entries/bee-header.ts">` to `<script src="/assets/bee-header-[hash].js">` across every templated HTML page) verified end-to-end. (Plan 01)

## Phase Boundary Preserved

- ✅ No new user-facing content pages added (the orphan diagnostic page is not user-facing per CONTEXT decision #1).
- ✅ SPA still serves at `/` (no URL changes — deferred to v3.2).
- ✅ No Lit SSR decisions (deferred to v3.2).
- ✅ 172 Vitest tests green throughout the phase (no test count changes; verified in Plan 01 Task 4).

## v3.2 Entry Conditions

- ✅ `_layouts/base.njk` and `_layouts/default.njk` ready for content pages — drop a new `.njk` into `_pages/` declaring `layout: default.njk` and it gets bee-header chrome automatically.
- ✅ `src/entries/` directory established for additional standalone bundle entries (v3.2 likely adds species-page entries here as siblings of `bee-header.ts`).
- ✅ `_data/build.js` pattern established for build-time metadata; v3.2 can add `_data/species.js`, `_data/photos.js`, etc. following the same default-export-an-object shape.
- ✅ The `dir.{includes,layouts,data}` `..` traversal in `eleventy.config.js` is documented inline (Plan 01 Rule 1 deviation) — visible to any v3.2 contributor adding more `_data/` consumers.

## Patterns Established

- **Eleventy front-matter layout chain via `{{ content | safe }}`**: pnwmoths-pattern verbatim. NEVER mix with Nunjucks `{% extends %}` / `{% block %}` (Pitfall #1).
- **Side-effect entries in `src/entries/`**: one-line `import` modules whose sole purpose is to be Rollup entries that trigger custom-element registration via Lit `@customElement` decorators. No manual `customElements.define` calls. v3.2 follows the same pattern.
- **Underscore-prefix-in-URL via `permalink:`**: filename has no leading underscore (`scaffold-check.njk`, sidesteps Eleventy underscore-prefix-in-input ambiguity); URL has the underscore via `permalink: /_scaffold-check/index.html` (Pitfall #2).
- **Vite HTML processor auto-derives entries** from every templated HTML output. No `rollupOptions.input` config needed for additional bundle entries — declare the `<script type="module" src="/...">` in the layout, and Vite walks every emitted page and produces a hashed bundle (research assumption A5 verified end-to-end).
- **`dir.{includes,layouts,data}` resolve relative to `dir.input`** in Eleventy 3.x. When `dir.input` is a leaf folder (e.g. `_pages/`) but the layout files live at repo root, use `"../_<name>"` traversal. Documented inline in `eleventy.config.js`.

## Phase Metrics

- **Total plans:** 2 (075-01: 4 tasks, all `type="auto"`; 075-02: 3 tasks including 1 `checkpoint:human-verify`)
- **Net new tracked files:** 5 (`_layouts/base.njk`, `_layouts/default.njk`, `_data/build.js`, `src/entries/bee-header.ts`, `_pages/scaffold-check.njk`) + 2 plan SUMMARYs + this phase summary
- **Net deleted:** 0
- **Tests:** 172 → 172 (unchanged)
- **Bee-header bundle size:** 22779 B raw / **8474 B gzipped** (~8.47 KB gz). Better than research's ~17–18 KB gz estimate, likely thanks to Rollup's shared-chunk dedup with the SPA bundle. Well under CONTEXT's <100 KB budget.
- **CI runtime impact:** Negligible — one additional small bundle (~22 KB raw / 8.5 KB gz) and one additional 1 KB HTML page (`_site/_scaffold-check/index.html`).
- **Phase duration:** ~15 min total (075-01: ~5 min execution; 075-02: ~10 min including UAT recording + paperwork)

## Milestone v3.1 Status

- ✅ Phase 74 (Eleventy Outer Build Integration) complete (2026-04-30).
- ✅ Phase 75 (this phase) complete (2026-04-30).
- ✅ v3.1 Eleventy Build Wrapper milestone shippable. Next user-facing step: merge `gsd/phase-074-eleventy-build-wrapper` (the milestone branch — kept across both phases per `branching_strategy: none`) to `main`. The deploy job will publish `_site/` (with the new `/_scaffold-check/` orphan page included as a permanent deploy diagnostic) to the production CloudFront distribution.

## Next Milestone

v3.2 Species Tab — see `.planning/seeds/species-tab.md`. Phase 75's scaffold makes v3.2 content pages a drop-in:

- Declare `layout: default.njk` in any new `.njk` file → automatic bee-header chrome.
- Add `_data/<topic>.js` (default-export-an-object) for any build-time data feed.
- Add `src/entries/<name>.ts` (1-line side-effect import) if a page needs an additional standalone Vite bundle.

---
*Phase: 075-authoring-scaffold*
*Phase summary completed: 2026-04-30*
