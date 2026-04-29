# Phase 74: Eleventy Outer Build Integration — Context

**Gathered:** 2026-04-29
**Status:** Ready for planning
**Source:** Synthesized from `.planning/PROJECT.md` v3.1 milestone scope + `.planning/seeds/species-tab.md` + reference project `~/dev/pnwmoths`. ROADMAP.md was reconciled in this same change to match the new milestone direction (was: "Plants Tab", now: "Eleventy Build Wrapper").

<domain>
## Phase Boundary

This phase adds Eleventy (3.x) as the outer build wrapping the existing Vite SPA. The SPA must continue to serve at `/` with **no user-visible changes** and **no behavioral drift**. The 172-test Vitest suite must continue to pass. CI/CD (GitHub Actions deploy → S3 + CloudFront) must continue to deploy a working site.

This phase is **purely infrastructural**. It does not add a single new content page. Phase 75 (next) lays down the empty authoring scaffold (input dir, base layout, base template) and runs UAT. New content pages — Species tab, welcome page — are entirely v3.2 work and out of scope here.

The reference implementation is `~/dev/pnwmoths`, a sibling project Peter shipped that uses `@11ty/eleventy` + `@11ty/eleventy-plugin-vite` with `vite.config.js` rooted at `_site` and `emptyOutDir: false`. That pattern is the default; deviations require justification.

</domain>

<decisions>
## Implementation Decisions

### Locked

- **Eleventy is the outer build, Vite is the inner bundler.** Eleventy is invoked first and produces HTML/templates into a working dir; the Vite plugin (`@11ty/eleventy-plugin-vite`) then bundles client-side JS/CSS into the same output. This matches `~/dev/pnwmoths`. Do not invert (Vite outer + Eleventy inner) — that breaks the SSG model needed for v3.2.
- **Use `@11ty/eleventy-plugin-vite`.** Do not hand-roll a separate build orchestration. The plugin owns the integration contract, including Vite's `appType: "mpa"` and the `writeBundle` hook ordering for passthrough copies.
- **No URL changes in this milestone.** The SPA stays at `/`. The seed at `.planning/seeds/species-tab.md` records the v3.2 decision to move the SPA to `/collection`; that move is **not** in this phase or this milestone.
- **No new content pages in this milestone.** Phase 75 produces an empty authoring scaffold ready for v3.2; this phase does not.
- **Existing Vitest suite must remain green throughout.** All 172 tests must pass at every executable plan boundary in this phase. This is a hard gate, not a stretch goal.
- **Schema-validation CI gate (`scripts/validate-schema.mjs`) must continue to run before build.** It's currently invoked from the root `npm run validate-schema` script and the deploy workflow runs it pre-build. This invariant is non-negotiable.
- **Mapbox token wiring (`VITE_MAPBOX_TOKEN`) must keep working.** The token flows from GitHub Actions secret → build env → Vite `import.meta.env`. Whatever build re-architecture happens, this contract holds.
- **The npm `workspaces` setup must keep working OR be intentionally replaced.** Current root `package.json` declares `workspaces: ["frontend"]`; if the Vite app moves to repo root (mirroring pnwmoths' layout), the workspaces array must be updated coherently.

### Claude's Discretion

- **Where the Vite app lives after migration.** Two viable shapes:
  - **(A) Keep `frontend/` as the Vite root** and add Eleventy at repo root with `eleventy.config.js` pointing input/output across the boundary. Lower CI churn but unusual layout for `eleventy-plugin-vite`.
  - **(B) Hoist `frontend/` contents to repo root** (mirroring pnwmoths) so Eleventy and Vite share the same root. Cleaner long-term, larger diff, requires coherent updates to npm workspaces, `tsconfig.json` paths, vitest config, CI paths, dev-server commands, and any tooling that hard-codes `frontend/`.
- **Output directory.** pnwmoths uses `_site/`. Beeatlas currently uses `frontend/dist/`. Either is acceptable; CI deploy paths and CloudFront cache rules must match whatever is chosen.
- **Phase chunking.** How many plans this phase decomposes into is the planner's call. Reasonable axes: package install + config scaffolding | Vite root integration | npm script + workspace updates | CI workflow updates | dev-server parity verification.
- **Whether to keep `npm workspaces`** at all. Pnwmoths is single-package; beeatlas may simplify by collapsing the workspace. Or may keep it. Either is fine; whichever is chosen, all references to it must be updated coherently.
- **TypeScript build integration.** Frontend build is currently `tsc && vite build`. The `tsc` step is type-checking only (since Vite handles transpilation). Whether `tsc --noEmit` runs before/after Eleventy or only in CI is the planner's call, but it must continue to fail the build on type errors.
- **Whether to add `.eleventyignore`** to keep Eleventy from trying to template `frontend/` source files, or whether the `dir.input` config alone is sufficient. Planner picks based on chosen layout.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope (authoritative)
- `.planning/PROJECT.md` lines 1–28 — v3.1 milestone goal, target features, out-of-scope list
- `.planning/STATE.md` — milestone metadata, current position
- `.planning/seeds/species-tab.md` — v3.2 work this scaffold must enable; clarifies what's *not* in v3.1

### Reference implementation (pattern source)
- `~/dev/pnwmoths/package.json` — script ordering, devDependencies, plugin versions
- `~/dev/pnwmoths/eleventy.config.js` — `EleventyVitePlugin` registration, `viteOptions: { appType: "mpa" }`, passthrough copy patterns
- `~/dev/pnwmoths/vite.config.js` — `root: "_site"`, `outDir: "_site"`, `emptyOutDir: false` (CRITICAL)
- `~/dev/pnwmoths/Dockerfile` and `docker-compose.yml` — for any deployment-related cross-references (informational)

### Existing build artifacts that must keep working
- `package.json` (root) — workspaces, scripts (`build`, `build:data`, `validate-schema`, `fetch-data`)
- `frontend/package.json` — scripts (`dev`, `build`, `preview`, `test`)
- `frontend/vite.config.ts` — `optimizeDeps.exclude: ['wa-sqlite']`, `preloadAssets()` plugin, vitest config (`environment: 'happy-dom'`)
- `frontend/vite-plugin-preload.ts` — custom plugin producing `<link rel="modulepreload">` tags
- `frontend/tsconfig.json` — TS config including `"types": ["node"]` (added in v2.6 Phase 61)
- `.github/workflows/deploy.yml` — build job + deploy job; OIDC; `VITE_MAPBOX_TOKEN` injection; per-prefix `aws s3 sync` with cache-control rules
- `scripts/validate-schema.mjs` — invoked via `npm run validate-schema` at the root; CI runs it pre-build
- `frontend/index.html` — entry point with module imports and Vite-managed asset references
- `frontend/public/data/` — runtime-fetched parquet/geojson; layout must remain reachable at `/data/...`
- `CLAUDE.md` — documents `cd frontend && npm run dev`; update if dev command changes

</canonical_refs>

<specifics>
## Specific Ideas

### What "no user-visible changes" means concretely
- Visiting `/` after deploy renders the SPA identically: same Mapbox map, same sidebar, same filter UI, same data load behavior, same URL state round-trip.
- All public asset paths (`/data/occurrences.parquet`, `/data/counties.geojson`, `/data/ecoregions.geojson`, `/db/...`, `/feeds/...`, favicon, etc.) continue to resolve.
- Cache-control headers continue to behave: hashed `/assets/*` files remain `max-age=31536000, immutable`; everything else `max-age=0`. Whatever path-shape Eleventy + Vite produces, the deploy `aws s3 sync` rules must keep producing this distinction.
- Mapbox token is still injected at build time via `VITE_MAPBOX_TOKEN`.
- Dev server hot-reload still works for changes to `src/**/*.ts`.

### Scaffold shape for Phase 75 readiness (informational)
Phase 75 — not this phase — will add input dir + base layout + base template. This phase only needs to leave the project in a state where Phase 75 can drop those files in without re-architecting. Concretely:
- An `eleventy.config.js` exists and runs.
- The Eleventy `dir.input`, `dir.output`, `dir.includes`, `dir.layouts` settings are explicit in config (not defaulted), so Phase 75 knows exactly where to add files.
- A passthrough rule for the SPA's existing `index.html` + `frontend/public/` is in place (the SPA has to be a "thing Eleventy passes through" to coexist with future Eleventy pages).

### CI deploy specifics worth flagging
- Build job runs on **all** branches; deploy job only on `main` (`if: github.ref == 'refs/heads/main'`). Both must keep working.
- The build job uploads `frontend/dist/` as `frontend-dist` artifact. The deploy job downloads it and syncs from `frontend/dist/`. If the output dir moves (e.g., to `_site/`), all five places (upload path, download path, two `aws s3 sync` source paths, comments) must be updated coherently.
- `npm test --workspace=frontend` runs in CI before build. If workspace is collapsed, this command must be replaced with the equivalent.

### Dev workflow specifics
- `frontend/CLAUDE.md`-equivalent guidance and `.planning/PROJECT.md` reference `cd frontend && npm run dev`. If the layout changes, both should be updated.
- `npm run dev` currently runs Vite in dev mode at the SPA root. Under Eleventy + Vite plugin, dev typically runs `eleventy --serve` which delegates to Vite's dev server middleware. The user-facing UX should be equivalent (one command, hot-reload).

</specifics>

<deferred>
## Deferred Ideas

- **SPA URL move to `/collection`** — v3.2 Species Tab milestone.
- **Welcome/about page at `/`** — v3.2.
- **New Eleventy content pages** (Species hub, per-species cards, etc.) — v3.2.
- **Lit SSR decision** for Eleventy-rendered pages — v3.2.
- **TOML photo manifest, BeeSearch seasonality viz, static SVG occurrence maps** — captured in `.planning/seeds/species-tab.md`; entirely v3.2 work.
- **Pagefind, lychee link validation, page-weight checks** — pnwmoths uses these; beeatlas may adopt later but not required for the SPA-only state v3.1 leaves us in.

</deferred>

---

*Phase: 074-eleventy-build-wrapper*
*Context gathered: 2026-04-29 (synthesized from PROJECT.md milestone scope; user opted to skip discuss-phase given prior pnwmoths reference)*
