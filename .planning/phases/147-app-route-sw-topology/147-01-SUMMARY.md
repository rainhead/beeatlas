---
phase: 147-app-route-sw-topology
plan: "01"
subsystem: pwa
tags: [service-worker, eleventy, vite, mpa, pwa, sw-scope]

# Dependency graph
requires:
  - phase: 146-debounce-url-updates-when-zooming-and-panning-the-map
    provides: "stable viewport URL updates; no changes to bee-atlas.ts needed here"
provides:
  - "Unlisted /app Eleventy+Vite route serving the full <bee-atlas> SPA"
  - "src/app-entry.ts as the dedicated Vite entry for /app (imports bee-atlas + SW registration)"
  - "src/sw-registration.ts: navigator.serviceWorker.register('/app/sw.js', {scope:'/app'})"
  - "public/app/sw.js: pass-through stub SW (install/activate/fetch, no caching, no skipWaiting, no clients.claim)"
  - "build-output.test.ts assertions for /app route (ROUTE-01, D-04, D-12)"
  - "No-SW-on-/ import-topology guarantee (grep -rln sw-registration src/ == 1)"
affects: [148-app-shell, 149-data-caching, 150-freshness-ux, 151-installability]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sub-path SPA page uses absolute /src/ paths (not ./src/) — Vite resolves relative paths from .11ty-vite/<page>/ where src/ is not a subdirectory"
    - "Vite MPA chunk naming: chunk name derives from HTML page path (app/index-*.js), not the entry module name (app-entry-*.js)"
    - "SW scope isolation via import topology: SW registration module imported only by app-entry.ts, never by bee-atlas.ts or index.html"
    - "public/app/ as Vite passthrough directory for stable SW URL (unhashed _site/app/sw.js)"

key-files:
  created:
    - _pages/app/index.html
    - src/app-entry.ts
    - src/sw-registration.ts
    - public/app/sw.js
  modified:
    - src/tests/build-output.test.ts

key-decisions:
  - "Use absolute /src/ paths in _pages/app/index.html (not relative ./src/) — Vite resolves relative paths from .11ty-vite/app/ where src/ is not a subdirectory; mirrors convention of other sub-path pages"
  - "Build-output hashed-chunk assertion matches app/index-[hash].js (Vite MPA behavior) not app-entry-[hash].js; the D-12 must_haves truth is satisfied by this real Vite naming"
  - "No skipWaiting and no clients.claim in stub SW — preserves the prompt-to-reload lifecycle (OFF-03 invariant) with zero app-code/DB version skew"
  - "Pass-through fetch handler intercepts /data/* because SW scope governs pages (all fetches from /app pages), not URL prefixes of the fetched resource"

patterns-established:
  - "SW scope isolation: register SW only from the dedicated entry, never from shared bee-atlas.ts"
  - "Stub SW lifecycle: install + activate + pass-through fetch; no caching, no lifecycle shortcuts — establishes the baseline Phases 148-151 build on"
  - "Unlisted dogfood route: eleventyExcludeFromCollections: true, no noindex, no nav link — trivially reversible"

requirements-completed: [ROUTE-01, ROUTE-02]

# Metrics
duration: 45min
completed: "2026-06-10"
---

# Phase 147 Plan 01: App Route + SW Topology Summary

**Unlisted `/app` Eleventy+Vite route with a correctly-scoped pass-through service worker (`scope:'/app'`) and strict no-SW-on-`/` import-topology guarantee (ROUTE-01, ROUTE-02)**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-06-10
- **Completed:** 2026-06-10
- **Tasks:** 4 completed + 1 checkpoint (auto-approved)
- **Files modified:** 5

## Accomplishments

- Created `_pages/app/index.html` as an Eleventy template (not passthrough) mirroring `_pages/index.html`, excluded from collections via front matter, referencing the dedicated `src/app-entry.ts` Vite entry
- Created `src/app-entry.ts` + `src/sw-registration.ts`; SW registration isolated to this import chain — `grep -rln sw-registration src/` returns exactly one hit (`src/app-entry.ts`), guaranteeing no SW on `/`
- Created `public/app/sw.js`: pass-through stub with install/activate/fetch listeners, no caching, no `skipWaiting`, no `clients.claim` — preserves the prompt-to-reload lifecycle (OFF-03)
- Extended `src/tests/build-output.test.ts` with three `/app` assertions; full build integration gate passes confirming `_site/app/index.html` and `_site/app/sw.js` are emitted correctly

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend build-output test for /app route** - `ed359b4` (test)
2. **Task 2: Create /app SPA template + Vite entry + SW registration** - `4a21be5` (feat)
3. **Task 3: Create pass-through stub service worker** - `1d48ace` (feat)
4. **Task 4: Full build verification (integration gate)** - `8a5ad36` (fix — Rule 1 deviation applied, see below)

**Plan metadata:** _(this commit)_ (docs: complete plan)

## Files Created/Modified

- `_pages/app/index.html` — Eleventy SPA template for `/app`; mirrors `_pages/index.html`, references `/src/app-entry.ts`, front matter sets `eleventyExcludeFromCollections: true`
- `src/app-entry.ts` — Dedicated Vite entry for `/app`; imports `./bee-atlas.ts` then `./sw-registration.ts` as side effects; no exports
- `src/sw-registration.ts` — SW registration module; calls `navigator.serviceWorker.register('/app/sw.js', { scope: '/app' })` inside try/catch; fires immediately at module bottom
- `public/app/sw.js` — Pass-through stub SW; install/activate/fetch listeners; `event.respondWith(fetch(event.request))`; no caching, no `skipWaiting`, no `clients.claim`
- `src/tests/build-output.test.ts` — Three new assertions inside existing `describe.skipIf(SKIP_BUILD)` block: `_site/app/index.html` exists, contains hashed `/assets/app/index-*.js` chunk reference, and `_site/app/sw.js` exists

## Decisions Made

- **Absolute /src/ paths in `_pages/app/index.html`:** Used `/src/index.css` and `/src/app-entry.ts` (absolute), not `./src/...` (relative). Vite resolves relative paths from `.11ty-vite/app/` where `src/` is not a subdirectory. This is consistent with other sub-path pages in the project.
- **No `skipWaiting` or `clients.claim` even in the stub:** Both halves of D-06 locked — preserves the prompt-to-reload lifecycle so app-code and DB version can never diverge silently. Phases 148-151 build on this invariant.
- **SW scope governs pages, not fetch URL prefixes:** A SW with `scope:'/app'` intercepts all fetches from `/app` pages, including `/data/*` fetches. The pass-through handler demonstrates this without caching.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Absolute /src/ paths in `_pages/app/index.html` (D-02)**
- **Found during:** Task 4 (full build integration gate)
- **Issue:** Initial `_pages/app/index.html` used relative `./src/app-entry.ts` and `./src/index.css`. Vite resolves these paths from `.11ty-vite/app/` during the MPA build pass, where `src/` is not a subdirectory — causing the template to be treated as a passthrough and the script tag to remain unrewritten.
- **Fix:** Changed `./src/index.css` → `/src/index.css` and `./src/app-entry.ts` → `/src/app-entry.ts` in `_pages/app/index.html`. Mirrors the absolute-path convention used by other sub-path pages in this project.
- **Files modified:** `_pages/app/index.html`
- **Verification:** `_site/app/index.html` contains a hashed `/assets/app/index-*.js` chunk reference (Vite rewrote the entry)
- **Committed in:** `8a5ad36` (Task 4 fix commit)

**2. [Rule 1 - Bug] Hashed chunk assertion uses `app/index-[hash].js` not `app-entry-[hash].js`**
- **Found during:** Task 4 (full build integration gate)
- **Issue:** The build-output test written in Task 1 asserted `/assets/app-entry-[^"]+\.js` based on the entry module name. Vite MPA mode names chunks from the HTML page path (`app/index`), not the entry module name (`app-entry`). The test failed with the raw `app-entry-` pattern.
- **Fix:** Updated the regex in `src/tests/build-output.test.ts` to match `app/index-[hash].js`. The PLAN D-12 truth ("hashed app-entry chunk") is satisfied by `app/index-*.js` — it is the hashed output of the `app-entry.ts` module; the naming convention is Vite's, not a plan violation.
- **Files modified:** `src/tests/build-output.test.ts`
- **Verification:** Three new `/app` build-output tests pass
- **Committed in:** `8a5ad36` (Task 4 fix commit)

---

**3. Pre-existing test failure (out of scope, deferred)**
- **Found during:** Task 4 full build run
- **Issue:** `build-output.test.ts` line 74 — `"emits a species-index chunk distinct from index-*.js (Phase 96, IDX-02)"` — fails because the root SPA chunk is now emitted as `bee-atlas-*.js` (not `index-*.js`) due to a Rolldown/Vite chunk-naming change in a prior phase. This failure pre-dates Phase 147.
- **Action:** Logged to `.planning/phases/147-app-route-sw-topology/deferred-items.md`. Not caused by this phase. Not fixed — out of scope.

---

**Total deviations:** 2 auto-fixed (Rule 1 bugs found during integration gate) + 1 pre-existing out-of-scope failure deferred
**Impact on plan:** Both auto-fixes required for correctness (template path resolution and test accuracy). No scope creep.

## Human Checkpoint Status

**Task 5 (checkpoint:human-verify, D-11):** AUTO-APPROVED in the auto chain. Real DevTools verification (SW-on-`/app`, no-SW-on-`/`, `/data/*` intercept) recorded as PENDING in `.planning/phases/147-app-route-sw-topology/147-HUMAN-UAT.md`.

## Issues Encountered

Pre-existing: one unrelated build-output test failure (`emits a species-index chunk distinct from index-*.js`) deferred to `deferred-items.md`. Not caused by this phase.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 148 (app shell): `/app` route + `src/app-entry.ts` entry boundary in place; SW topology established
- Phase 149 (data caching): `public/app/sw.js` is the file to extend with caching logic; SW is already registered and controlling `/app` pages
- Phase 150/151: SW lifecycle baseline (no `skipWaiting`/`clients.claim`) established — update prompts can be layered on
- **Pending human UAT:** D-11 DevTools verification in `147-HUMAN-UAT.md`; non-blocking for Phase 148 (topology is structurally verified via tests)

---
*Phase: 147-app-route-sw-topology*
*Completed: 2026-06-10*

## Self-Check: PASSED

- `_pages/app/index.html` — confirmed created (commit `4a21be5`, modified `8a5ad36`)
- `src/app-entry.ts` — confirmed created (commit `4a21be5`)
- `src/sw-registration.ts` — confirmed created (commit `4a21be5`)
- `public/app/sw.js` — confirmed created (commit `1d48ace`)
- `src/tests/build-output.test.ts` — confirmed modified (commits `ed359b4`, `8a5ad36`)
- `147-HUMAN-UAT.md` — confirmed created (this execution)
- Commits `ed359b4`, `4a21be5`, `1d48ace`, `8a5ad36` all exist in git log
