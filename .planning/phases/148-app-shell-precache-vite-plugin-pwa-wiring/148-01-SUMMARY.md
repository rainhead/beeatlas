---
phase: 148-app-shell-precache-vite-plugin-pwa-wiring
plan: 01
subsystem: infra
tags: [service-worker, pwa, vite-plugin-pwa, workbox, injectManifest, offline, eleventy, precache]

requires:
  - phase: 147-app-route-sw-topology
    provides: /app route + SW topology (unhashed /app/sw.js URL, scope /app/, manual src/sw-registration.ts imported only by app-entry.ts, CDK no-cache behavior for /app/sw.js)
provides:
  - vite-plugin-pwa injectManifest wired via eleventy.config.js viteOptions.plugins (NOT vite.config.ts)
  - Workbox-built SW at stable unhashed /app/sw.js precaching the /app app shell (index.html + hashed JS/CSS)
  - maximumFileSizeToCacheInBytes raised to 30 MB (ready for Phase 149's occurrences.db runtime cache)
  - /app loads fully offline from the SW cache after one online visit
  - build-output.test.ts precache verification gate (OFF-01 criteria 1, 3, 4)
affects: [149-data-runtime-cache, OFF-03-update-prompt, 151-manifest-installability]

tech-stack:
  added: [vite-plugin-pwa@1.3.0, workbox-build@7.4.1, workbox-precaching@7.4.1, workbox-routing@7.4.1, workbox-window@7.4.1]
  patterns: [injectManifest SW with hand-written src/sw.ts, absolute process.cwd() paths in viteOptions to survive the .11ty-vite/ build root, /app-allowlisted NavigationRoute]

key-files:
  created: [src/sw.ts]
  modified: [eleventy.config.js, src/tests/build-output.test.ts, package.json, package-lock.json]

key-decisions:
  - "vite-plugin-pwa lives in eleventy.config.js viteOptions.plugins, not vite.config.ts (the eleventy-vite build never loads vite.config.ts)"
  - "outDir/globDirectory/swDest are absolute via resolve(process.cwd(), ...) — relative paths resolve under .11ty-vite/ and are deleted post-build"
  - "injectRegister: null + manifest: false — keep Phase 147's manual registration, emit no webmanifest (Phase 151)"
  - "No skipWaiting / clientsClaim — preserve prompt-to-reload lifecycle (OFF-03), avoid app-code/DB version skew"
  - "Verification extends the existing build-output.test.ts CI gate, not a standalone script (D-08)"

patterns-established:
  - "Service-worker source as a hand-written src/sw.ts compiled by vite-plugin-pwa injectManifest; self.__WB_MANIFEST injected at build time"
  - "modifyURLPrefix {'': '/'} makes precache cache keys absolute site paths when globDirectory is an absolute path"

requirements-completed: [OFF-01]

duration: ~12min execution + offline UAT
completed: 2026-06-14
---

# Phase 148: App Shell Precache + vite-plugin-pwa Wiring Summary

**`vite-plugin-pwa` injectManifest wired through `eleventy.config.js viteOptions.plugins`, building a Workbox SW at `/app/sw.js` that precaches the `/app` shell so it loads fully offline after one online visit; 30 MB cache cap set for Phase 149.**

## Performance

- **Tasks:** 3 (Wave-0 RED → GREEN → human-verify UAT)
- **Files created:** 1 (`src/sw.ts`)
- **Files modified:** 4 (`eleventy.config.js`, `src/tests/build-output.test.ts`, `package.json`, `package-lock.json`)
- **Files removed:** 1 (`public/app/sw.js` — Phase 147 stub)
- **Completed:** 2026-06-14

## Accomplishments
- `vite-plugin-pwa` 1.3.0 (`injectManifest`) wired into the two-step eleventy→vite build via `viteOptions.plugins`, producing the SW at the stable unhashed URL `/app/sw.js` (scope `/app/`).
- `src/sw.ts` precaches the app shell (`app/index.html` + `assets/**/*.{js,css}`) and registers an `/app/`-allowlisted `NavigationRoute(createHandlerBoundToURL('/app/index.html'))`, so any `/app/` navigation resolves to the cached shell offline without shadowing `/`.
- `maximumFileSizeToCacheInBytes: 30_000_000` set now (ready for Phase 149's ~23 MB `occurrences.db`).
- Phase 147 hand-written stub `public/app/sw.js` removed; the plugin now owns SW generation.
- `src/tests/build-output.test.ts` extended with 3 CI-enforced assertions (OFF-01 criteria 1, 3, 4): injected manifest present (no literal `self.__WB_MANIFEST`), every precached URL exists under `_site/`, 30 MB cap in `eleventy.config.js`.
- Offline load (criterion 2) confirmed in-browser — see [148-HUMAN-UAT.md](./148-HUMAN-UAT.md).

## Task Commits

1. **Task 1: Wave-0 RED — sw.ts skeleton + three failing build-output assertions** — `c8b5619` (test)
2. **Task 2: GREEN — wire VitePWA injectManifest, remove Phase 147 stub** — `82d394c` (feat)
3. **Task 3: HUMAN-UAT — offline /app load** — manual, PASSED 2026-06-14 (no commit; recorded in 148-HUMAN-UAT.md)

**Follow-up fix (post-checkpoint):** `794cd46` (build) — see Deviations.

## Files Created/Modified
- `src/sw.ts` — injectManifest SW source: `precacheAndRoute(self.__WB_MANIFEST)` + `/app`-allowlisted `NavigationRoute`; no `skipWaiting`/`clientsClaim`.
- `eleventy.config.js` — `VitePWA({...})` added to `viteOptions.plugins` with absolute `outDir`/`globDirectory`/`swDest`, `globPatterns`/`globIgnores`, 30 MB cap, `injectRegister: null`, `manifest: false`.
- `src/tests/build-output.test.ts` — 3 precache verification assertions.
- `package.json` / `package-lock.json` — declare `vite-plugin-pwa` + `workbox-*` (committed late — see Deviations).
- `public/app/sw.js` — removed.

## Decisions Made
None beyond the locked CONTEXT.md decisions (D-01…D-09) — followed as specified.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Build-output regex matched the wrong manifest format**
- **Found during:** Task 2 (GREEN)
- **Issue:** The plan's criterion-1/4 assertions expected `{url:"..."}`, but Workbox's injected manifest is JSON-format `"url":"..."`.
- **Fix:** Corrected the regex in both assertions to `/"url":"[^"]+"/`.
- **Committed in:** `82d394c`

**2. [Rule 2 - Missing Critical] Precache URLs lacked a leading slash**
- **Found during:** Task 2 (GREEN)
- **Issue:** With an absolute `globDirectory`, the glob scan yields relative paths (`app/index.html`), so cache keys weren't absolute site paths. `base: '/'` alone was insufficient.
- **Fix:** Added `injectManifest.modifyURLPrefix: {'': '/'}` so keys become `/app/index.html`, `/assets/...`.
- **Committed in:** `82d394c`

**3. [Rule 1 - Bug] `self.__WB_MANIFEST` failed `tsc --noEmit`**
- **Found during:** Task 1 (RED)
- **Issue:** The `/// <reference types="vite-plugin-pwa/client" />` directive alone didn't type `self.__WB_MANIFEST` under this `tsconfig.json` (TS2339).
- **Fix:** Added an explicit ambient `declare const self: ServiceWorkerGlobalScope & typeof globalThis & { __WB_MANIFEST: ... }`.
- **Committed in:** `c8b5619`

**4. [Rule 3 - Blocking, found post-checkpoint] Dependency manifest left uncommitted**
- **Found during:** Off-host build failure on the developer's laptop (clean checkout)
- **Issue:** `src/sw.ts` was committed but the `vite-plugin-pwa` + `workbox-*` additions to `package.json`/`package-lock.json` existed only as uncommitted edits on the build host (maderas). The host's installed `node_modules` masked the omission, so the executor's local build/test passed (a false GREEN); a clean `npm ci` elsewhere installed without the deps and `tsc --noEmit`/build failed (TS2307/TS2688/TS2304).
- **Fix:** Committed the manifest (additive only: +342 lockfile entries, 0 removed). Restores clean-checkout build parity.
- **Committed in:** `794cd46`
- **Lesson recorded:** memory `new-dep-manifest-uncommitted-false-green`.

---

**Total deviations:** 4 (3 in-task auto-fixes + 1 post-checkpoint blocking fix)
**Impact on plan:** All necessary for correctness and clean-checkout build parity. No scope creep — the deferred work (`/data` runtime cache, Mapbox tiles, update prompt, manifest/icons) remains untouched.

## Issues Encountered
- The eleventy→vite two-step `injectManifest` path resolution was the flagged #1 risk; resolved with absolute `process.cwd()` paths (research-confirmed) and verified by the build-output assertions.
- The uncommitted-manifest false-GREEN (deviation 4) cost an off-host debugging round; see the recorded memory for the prevention check.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- App-shell precache + 30 MB cap in place → **Phase 149** can add `/data/*` runtime caching (`occurrences.db` CacheFirst, GeoJSON) on this foundation.
- SW lifecycle intentionally has no `skipWaiting`/`clientsClaim`, leaving the prompt-to-reload UX for the **OFF-03** phase.
- `manifest: false` retained — real `manifest.webmanifest` + icons + installability are **Phase 151**.

---
*Phase: 148-app-shell-precache-vite-plugin-pwa-wiring*
*Completed: 2026-06-14*
