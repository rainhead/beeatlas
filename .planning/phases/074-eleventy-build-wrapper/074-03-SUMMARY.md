---
phase: 074-eleventy-build-wrapper
plan: 03
subsystem: docs
tags: [docs, uat, ci, eleventy]

# Dependency graph
requires:
  - phase: 074-eleventy-build-wrapper
    provides: 074-01 hoist (single-package layout), 074-02 CI (`_site/` artifact paths)
provides:
  - CLAUDE.md "Running Locally" reflects single-package commands (no `cd frontend`)
  - Manual UAT confirmation (`npm run dev` → map renders, tiles load, filters work, HMR confirmed)
  - GitHub Actions build job green on push (run 25150313947)
affects: [phase 74 close-out, phase 75 entry conditions]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - ".planning/phases/074-eleventy-build-wrapper/074-03-SUMMARY.md"
    - ".planning/phases/074-eleventy-build-wrapper/074-PHASE-SUMMARY.md"
  modified:
    - "CLAUDE.md (Running Locally section: drop `cd frontend &&`, add `npm run build` block)"

key-decisions:
  - "`.planning/PROJECT.md` left untouched: grep confirmed no `cd frontend` command references (the file mentions `frontend` only as a descriptive noun — `static frontend`, `frontend build only`, etc. — not as a `cd` target)."
  - "Dev server on port 8080 (Eleventy default) replaces Vite's 5173 — documented in CLAUDE.md as `npm run dev` without an explicit port; the Eleventy banner prints the actual URL on startup."

patterns-established: []

requirements-completed: [ELEV-04 (doc clause), phase 74 close-out]

# Metrics
duration: ~30 min (across two sessions; doc edit + smoke fixes + UAT)
completed: 2026-04-30
---

# Phase 74 Plan 03: Doc updates, smoke, UAT — Summary

**`CLAUDE.md` "Running Locally" rewritten for the hoisted layout; clean smoke green (172 tests, `_site/` shape correct); CI build job green on push (run 25150313947); manual UAT approved including HMR. Phase 74 ready to close.**

## Performance

- **Duration:** ~30 min across two sessions (Task 1 doc edit + commits; Task 2 smoke surfacing two fix commits; Task 3 UAT)
- **Tasks:** 3 (1 auto + 1 auto + 1 checkpoint:human-verify)

## Accomplishments

- Updated `CLAUDE.md` "Running Locally" block: `npm run dev` / `npm test` / `npm run build` from repo root; data-pipeline blocks unchanged; `cd frontend` references gone (commit `e22dee3`).
- Confirmed `.planning/PROJECT.md` had no `cd frontend` command references — descriptive `frontend` mentions retained as accurate.
- Clean smoke (`rm -rf node_modules _site .11ty-vite && npm ci && npm test && npm run build`) surfaced two real bugs in the hoisted setup that were fixed inline:
  - `00739c9` — `data/export.py` still wrote to `frontend/public/data/`; corrected to `public/data/`.
  - `5bfca85` — Vite plugin's `viteOptions.envDir` and `optimizeDeps.exclude` were not passing through; `eleventy.config.js` updated to route them via the plugin's `viteOptions` (per `feedback_hoist_plan_coverage.md` — Vite wrapper dev config must go through plugin options, not `vite.config.ts`).
- Phase branch `gsd/phase-074-eleventy-build-wrapper` pushed; GitHub Actions build job green; deploy/lighthouse jobs correctly skipped on non-main branch.
- Manual UAT (`npm run dev` → http://localhost:8080/) approved: SPA renders, Mapbox tiles load, data dots load, filter panel applies, HMR confirmed working.

## Smoke Evidence

```
Test Files  7 passed (7)
     Tests  172 passed (172)
  Duration  682ms
```

```
$ ls _site/
assets  data  index.html  public  src

$ ls _site/assets/
bee-sidebar-CR4PvdrG.js
bee-table-2VKTrUAR.js
index-B_7PMgUM.css
index-XDux_vGB.js
wa-sqlite-Bkv7CwRB.wasm
```

## CI Evidence

- Run: <https://github.com/rainhead/beeatlas/actions/runs/25150313947>
- Branch: `gsd/phase-074-eleventy-build-wrapper`
- Trigger commit: `e22dee3` (docs(074-03): update CLAUDE.md Running Locally for hoisted layout)
- Result: `Build site` ✅ success (35s); `Deploy to S3 + CloudFront` ⏭ skipped; `Lighthouse audit` ⏭ skipped

## UAT Evidence

- Local URL: <http://localhost:8080/> (Eleventy dev server; Vite as middleware)
- Map renders with header + filter button overlay: ✅
- Mapbox tiles load (root `.env` `VITE_MAPBOX_TOKEN` resolves correctly): ✅
- Data layer (`/data/occurrences.parquet` via dev-server static): ✅
- Filter panel apply + count update: ✅
- HMR (`src/bee-header.ts` edit → browser updates without full reload): ✅

## Task Commits

1. **Task 1 (doc edit):** `e22dee3` — `docs(074-03): update CLAUDE.md Running Locally for hoisted layout`
2. **Task 2 (smoke + push, with two inline fix commits surfaced during smoke):**
   - `00739c9` — `fix(074): drop frontend/ prefix in data pipeline export paths`
   - `5bfca85` — `fix(074): pass envDir + optimizeDeps.exclude through plugin viteOptions`
   - Branch pushed; CI green on `e22dee3`.
3. **Task 3 (manual UAT):** human-verify checkpoint — approved.

## Decisions Made

1. **`.planning/PROJECT.md` left untouched.** Grep for `cd frontend` returned 0 matches; the file's `frontend` mentions are descriptive ("static frontend", "frontend build only") and remain accurate post-hoist. The plan's Task 1 step 2 explicitly allows this no-op outcome.

## Deviations from Plan

None at the plan level. Two unrelated bugs surfaced during Task 2's smoke run (export.py path, Vite plugin options pass-through) and were fixed inline as separate commits — these were latent issues from plan 01 that the smoke caught.

## Issues Encountered

- **`data/export.py` writing to `frontend/public/data/`:** Plan 01 (74-01) hoisted the SPA but missed updating the Python pipeline's export path. Fixed in `00739c9`. Captured as a feedback memory (`feedback_hoist_plan_coverage.md`).
- **Vite plugin not honoring `envDir`/`optimizeDeps.exclude`:** Setting these in `vite.config.ts` worked for `vite build` directly but not via the Eleventy plugin's middleware (Vite picks up `vite.config.ts` only for build, not for dev). Routed through `viteOptions` in `eleventy.config.js`. Fixed in `5bfca85`.

## User Setup Required

None.

## Next Phase Readiness

- **Phase 74 ready to close.** All four ELEV requirements complete (see `074-PHASE-SUMMARY.md` for the rollup).
- **Phase 75 entry conditions intact:** `_pages/`, `_includes/`, `_layouts/`, `_data/` exist (tracked via `.gitkeep`); `eleventy.config.js` has explicit `dir` block; SPA serves at `/` with no URL changes.

## Self-Check: PASSED

- `grep "cd frontend" CLAUDE.md` → 0 matches.
- `grep "cd frontend" .planning/PROJECT.md` → 0 matches.
- `grep "npm run dev" CLAUDE.md` and `grep "npm run build" CLAUDE.md` → both match.
- `npm test` → 172 passed.
- `_site/index.html` matches `src="/assets/index-XDux_vGB.js"` (current hashed bundle).
- CI run 25150313947 → Build job success; deploy/lighthouse correctly skipped on non-main branch.
- Manual UAT → approved including HMR.

---
*Phase: 074-eleventy-build-wrapper*
*Completed: 2026-04-30*
