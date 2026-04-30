---
phase: 074-eleventy-build-wrapper
plans_completed: [01, 02, 03]
requirements_completed: [ELEV-01, ELEV-02, ELEV-03, ELEV-04]
milestone: v3.1
completed: 2026-04-30
---

# Phase 74: Eleventy Outer Build Integration — Phase Summary

**Eleventy 3.1.5 + `@11ty/eleventy-plugin-vite` 7.1.1 wraps the Vite SPA. Single-package layout (frontend/ collapsed to repo root). All 172 Vitest tests green. CI builds and uploads `_site/` artifact. Dev server (`npm run dev`) on port 8080 with HMR confirmed. SPA URL unchanged (`/`); no content pages added; no SSR decisions made.**

## Plans

| # | Title | Commit(s) | Status |
|---|-------|-----------|--------|
| 01 | Hoist `frontend/` to repo root + scaffold Eleventy outer build | `7481b13` | ✅ |
| 02 | Update `.github/workflows/deploy.yml` for `_site/` artifact | `90ee2f5` | ✅ |
| 03 | Doc updates + clean smoke + UAT (incl. two follow-up fixes) | `e22dee3`, `00739c9`, `5bfca85` | ✅ |

## Requirements Status

- ✅ **ELEV-01**: Eleventy + plugin installed at root, configured via `eleventy.config.js`. (Plan 01)
- ✅ **ELEV-02**: `npm run build` produces a `_site/` artifact rendering the SPA at `/` with identical behavior — index.html with hashed `/assets/index-*.js`, public assets, Mapbox token. (Plans 01 + 03 UAT)
- ✅ **ELEV-03**: 172 Vitest tests pass on a clean checkout (`npm test`); `npm run validate-schema` runs in CI before build (preserved in deploy.yml). (Plans 01 + 02)
- ✅ **ELEV-04**: `.github/workflows/deploy.yml` updated; build artifact emitted as `site` from `_site/`; deploy job's `aws s3 sync` paths target `_site/`; cache-control rules unchanged. Dev workflow (`npm run dev` from repo root) works with hot-reload; CLAUDE.md updated. (Plans 02 + 03)

## Phase Boundary Preserved

- ✅ No new content pages added — empty `_pages/`, `_includes/`, `_layouts/`, `_data/` scaffolded only (Phase 75's job).
- ✅ SPA still serves at `/` (no URL changes — deferred to v3.2).
- ✅ No Lit SSR decisions (deferred to v3.2).
- ✅ 172 Vitest tests green throughout the phase (no test count changes).

## Phase 75 Entry Conditions

- ✅ `_pages/` exists, contains only `index.html` (the SPA template) and `.gitkeep` — Phase 75 can drop additional templates here.
- ✅ `_includes/`, `_layouts/`, `_data/` exist with `.gitkeep` placeholders — Phase 75 can populate without re-architecting.
- ✅ `eleventy.config.js` has explicit `dir` block (`input: "_pages"`, `output: "_site"`, `includes: "_includes"`, `layouts: "_layouts"`, `data: "_data"`) — ready for Phase 75 templates.
- ✅ Dev workflow (`npm run dev`) and CI build (`npm run build` + deploy.yml `_site/` paths) both green — Phase 75 inherits a known-good baseline.

## Patterns Established

- **Eleventy + Vite plugin behavior**: `results.length === 0` short-circuits the Vite build; index.html must be templated (in `_pages/`), not a passthrough copy. (Plan 01 deviation)
- **Two-step publicDir pipeline**: Eleventy passthrough copies `public/` → `_site/public/` → renamed to `.11ty-vite/public/` → Vite's default publicDir handling copies into final `_site/`. Single-owner publicDir is wrong for the rename-and-rm mechanics. (Plan 01 deviation)
- **Plugin viteOptions pass-through for dev**: `envDir` and `optimizeDeps.exclude` must be set via the Eleventy plugin's `viteOptions` (not `vite.config.ts`) for the dev server middleware to honor them. The build pass reads `vite.config.ts` directly; the dev pass does not. (Plan 03 fix `5bfca85`)
- **Single-package CI invocations**: `npm test` and `npm run build` from repo root — no `--workspace=frontend` flag. (Plan 02)

## Deferred Items

- **Schema validation gate sensitive to local parquet staleness** — captured in `.planning/phases/074-eleventy-build-wrapper/deferred-items.md`. Resolution path: developer re-runs `cd data && uv run python run.py`. CI is unaffected (always uses CloudFront).
- **No deferred items from plans 02 or 03.**

## Phase Metrics

- **Total duration:** ~2 hours across 3 sessions (74-01 ~70 min; 74-02 ~5 min; 74-03 ~30 min)
- **Files modified across phase:** ~40 (most are renames from the hoist)
- **Net new tracked files:** `eleventy.config.js`, `_pages/.gitkeep`, `_includes/.gitkeep`, `_layouts/.gitkeep`, `_data/.gitkeep`, `.env.example`
- **Net deleted:** `frontend/` directory + per-workspace `package.json` and `vite.config.ts`
- **Tests:** 172 → 172 (unchanged)
- **CI runtime impact:** Build job ~35s end-to-end (parquet schema validate + tsc + eleventy + vite)

## Milestone v3.1 Status

- ✅ Phase 74 (this phase) complete.
- 🔲 Phase 75 — Authoring Scaffold and Verification (Empty `_pages/index.html` template, base layout, smoke that an `_pages/about.md` would render). After 75 completes, v3.1 ships.

---
*Phase: 074-eleventy-build-wrapper*
*Phase summary completed: 2026-04-30*
