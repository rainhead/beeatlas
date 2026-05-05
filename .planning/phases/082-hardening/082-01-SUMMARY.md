---
phase: 082-hardening
plan: 01
subsystem: testing
tags: [bundle-size, gzip, ci-gate, build-chain, vite, node-zlib]

requires:
  - phase: 080-species-page
    provides: Vite chunk splitting that produces species-*.js in _site/assets/

provides:
  - CI gate enforcing 100 KB gzipped budget on species-*.js chunk (PERF-01)
  - scripts/validate-bundle-size.mjs with named export for testability
  - npm run validate-bundle-size script
  - build chain extended with validate-bundle-size after eleventy step

affects: [083, future-perf-phases]

tech-stack:
  added: []
  patterns:
    - "validate-*.mjs gate pattern: hand-rolled build-time checks chained into npm run build"
    - "Optional assetsDir param on validateBundleSize for in-process test import without subprocess"

key-files:
  created:
    - scripts/validate-bundle-size.mjs
    - src/tests/validate-bundle-size.test.ts
  modified:
    - package.json
    - src/tests/validate-species.test.ts
    - src/tests/seed-species-photos.test.ts

key-decisions:
  - "validateBundleSize accepts optional assetsDir param so tests can pass a temp directory directly — avoids import.meta.url path resolution issues in Vitest's Vite transform context"
  - "Test uses node:crypto randomBytes for incompressible over-budget content (crypto.getRandomValues limited to 65536 bytes)"
  - "TDD cycle: RED commit (b679130), GREEN commit (c039bae), wiring commit (801d0f4)"

patterns-established:
  - "New build gate scripts export a named function so Vitest can import in-process without spawning a subprocess"
  - "Over-budget test content: use randomBytes(150 * 1024) for reliably incompressible gzip content"

requirements-completed: [PERF-01]

duration: 7min
completed: 2026-05-05
---

# Phase 082 Plan 01: Bundle-Size Gate Summary

**Gzipped CI gate for species-*.js chunk using node:zlib — fails build at 100 KB (PERF-01), wired after eleventy in the npm run build chain**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-05T06:40:00Z
- **Completed:** 2026-05-05T06:47:00Z
- **Tasks:** 2 (plus TDD RED commit)
- **Files modified:** 5

## Accomplishments
- Hand-rolled `scripts/validate-bundle-size.mjs` enforcing 100 KB gzipped budget on `_site/assets/species-*.js`
- D-05: Hard fails if zero species-*.js files match (guards against Vite output-naming drift)
- D-04: Wired as append-only suffix to the build chain (`&& npm run validate-bundle-size`) after eleventy
- 7 in-process Vitest tests covering all behavior branches (under budget, over budget, missing dir, zero matches, wiring assertions)
- Updated 2 existing tests that asserted the previous exact build chain string

## Task Commits

Each task was committed atomically:

1. **RED: Failing tests** - `b679130` (test)
2. **Task 1: validate-bundle-size.mjs** - `c039bae` (feat)
3. **Task 2: package.json wiring** - `801d0f4` (feat)

## Files Created/Modified
- `scripts/validate-bundle-size.mjs` - PERF-01 gzipped budget gate; exports `validateBundleSize(assetsDir?)` named function
- `src/tests/validate-bundle-size.test.ts` - 7 Vitest tests for behavior + package.json wiring
- `package.json` - Added `validate-bundle-size` script + appended to `build` chain after eleventy
- `src/tests/validate-species.test.ts` - Updated build chain assertion to include new step
- `src/tests/seed-species-photos.test.ts` - Updated build chain assertion to include new step

## Decisions Made

- **Optional assetsDir parameter:** `validateBundleSize` accepts an optional `assetsDir` to override the default (`_site/assets/` relative to the script). Required because Vitest/Vite transforms .mjs imports and `import.meta.url` in the transformed context resolves to `/@fs/...` or a virtual path, not the real filesystem path. Passing the dir explicitly in tests eliminates this path ambiguity.
- **randomBytes for over-budget test:** `crypto.getRandomValues` is capped at 65536 bytes (WebCrypto spec limit). Used Node's `node:crypto` `randomBytes(150 * 1024)` instead for 150 KB of high-entropy incompressible content reliably over the 100 KB budget.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] validateBundleSize accepts optional assetsDir for testability**
- **Found during:** Task 1 (TDD GREEN phase)
- **Issue:** The plan's implementation uses a module-level `ASSETS_DIR = new URL('../_site/assets/', import.meta.url).pathname` constant. When Vitest imports the .mjs via Vite transform, `import.meta.url` may resolve to a virtual path, making `ASSETS_DIR` point to a non-existent directory. Tests that created `_site/assets/` in REPO_ROOT had `existsSync(ASSETS_DIR)` return `false`.
- **Fix:** Changed `validateBundleSize()` signature to `validateBundleSize(assetsDir = ASSETS_DIR)` — default preserves CLI behavior; tests pass an explicit temp path.
- **Files modified:** `scripts/validate-bundle-size.mjs`, `src/tests/validate-bundle-size.test.ts`
- **Verification:** All 7 tests pass; CLI invocation still uses default ASSETS_DIR
- **Committed in:** c039bae (Task 1 feat commit)

**2. [Rule 2 - Missing Critical] Updated build chain assertions in two pre-existing tests**
- **Found during:** Task 2 (full test suite run after package.json edit)
- **Issue:** `validate-species.test.ts:163` and `seed-species-photos.test.ts:282` both assert the exact `scripts.build` string. After appending `&& npm run validate-bundle-size`, both failed.
- **Fix:** Updated both assertions to include the new suffix, with a comment citing 082-01 as the reason.
- **Files modified:** `src/tests/validate-species.test.ts`, `src/tests/seed-species-photos.test.ts`
- **Verification:** Both tests pass; total test suite passes on all non-pre-existing failures
- **Committed in:** 801d0f4 (Task 2 feat commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 2 missing critical)
**Impact on plan:** Both fixes necessary for test correctness. No scope creep.

## Issues Encountered

- Pre-existing test failures in `build-output.test.ts` (stale local `occurrences.parquet` missing `canonical_name` column) and `data-species.test.ts` (no local `species.json`). These are out of scope — unrelated to this plan's changes.

## Known Stubs
None.

## Threat Flags
None — no new network endpoints, auth paths, or trust boundaries introduced.

## Next Phase Readiness
- PERF-01 CI gate is wired and operational — build now fails if species chunk exceeds 100 KB gzipped
- Gate confirmed passing against current build (species chunk well under budget per Phase 80)
- Proceed to 082-02 (Lighthouse runner) or other Phase 82 plans

---
*Phase: 082-hardening*
*Completed: 2026-05-05*
