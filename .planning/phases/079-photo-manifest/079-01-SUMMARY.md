---
phase: 079-photo-manifest
plan: 01
subsystem: validation
tags: [toml, validation, build-chain, vitest, license-gate, attribution]

requires:
  - phase: 078-species-aggregation
    provides: public/data/species.json (used by validator for unknown-name cross-reference)
provides:
  - scripts/validate-species.mjs (CLI + named export validateSpeciesPhotos / LICENSE_WHITELIST)
  - content/species-photos.toml (empty starter manifest, ready for Plan 02 seed + human edits)
  - npm run validate-species build chain step (between validate-schema and typecheck)
  - src/tests/seed-species-photos.test.ts (10 todo stubs, contract for Plan 02)
affects: [079-02-seed-species-photos, 079-03-render-photos, phase-080, phase-082]

tech-stack:
  added: ["@iarna/toml@^2.2.5"]
  patterns:
    - "CLI guard idiom: fileURLToPath(import.meta.url) === resolve(process.argv[1]) keeps Vitest in-process imports free of process.exit side effects"
    - "Error-accumulator validator: returns { errors[], warnings[] } so caller decides exit policy; mirrors validate-schema.mjs failed-flag pattern"
    - "Graceful degradation: speciesJsonArray=null skips cross-reference checks (mirrors validate-schema.mjs CloudFront fallback for fresh checkouts without parquet)"
    - "Subprocess test with try/finally restoration: rigging committed manifest then restoring exact bytes keeps working tree clean (verified via git diff --exit-code in CI)"

key-files:
  created:
    - scripts/validate-species.mjs
    - content/species-photos.toml
    - src/tests/validate-species.test.ts
    - src/tests/seed-species-photos.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Single named export validateSpeciesPhotos(tomlSource, speciesJsonArray|null) returning { errors, warnings } — caller (CLI) decides exit code; Vitest can import without side effects"
  - "License whitelist exported as LICENSE_WHITELIST Set so test can assert exact membership"
  - "speciesJsonArray=null path skips unknown-name cross-reference entirely but still runs license/attribution checks (Pitfall 7)"
  - "Subprocess integration test uses npm run validate-species directly, not full npm run build, to isolate the TOML gate from the parquet schema gate (which requires public/data/*.parquet to exist locally)"

patterns-established:
  - "CLI-as-named-module guard for Node ESM scripts that need both Vitest in-process testing and direct invocation"
  - "Error-accumulator over throw-on-first: enables surfacing all manifest violations in one pass at build time"

requirements-completed: [PHOTO-01, PHOTO-02, PHOTO-03, PHOTO-05, PHOTO-06, PHOTO-08]

duration: 3min
completed: 2026-05-04
---

# Phase 079 Plan 01: Photo Manifest Validator Summary

**TOML photo manifest validator wired into npm build chain — rejects non-whitelisted licenses and missing attribution at build time, with 16 Vitest tests covering all branches and a subprocess gate proving the build fails on bad licenses.**

## Performance

- **Duration:** ~3 min wall clock
- **Started:** 2026-05-04T16:18:38Z
- **Completed:** 2026-05-04T16:21:16Z
- **Tasks:** 3
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- `validateSpeciesPhotos(tomlSource, speciesJsonArray|null)` named export returning `{ errors[], warnings[] }` — testable in-process via Vitest with no `process.exit` side effects
- License whitelist enforced via exported `LICENSE_WHITELIST` Set (`cc0`, `cc-by`, `cc-by-nc`, `cc-by-sa`, `cc-by-nc-sa`); rejects `null`, missing, `all-rights-reserved`, `cc-by-nc-nd`
- Attribution required for non-CC0 photos (rejects missing field and empty string); CC0 photos may omit it
- Unknown `scientificName` produces a warning (exit 0); when `species.json` is absent the cross-reference check is skipped entirely while license/attribution checks still run
- `npm run validate-species` wired into `scripts.build` between `validate-schema` and `typecheck` — load-bearing order: parquet gate → TOML gate → type gate → eleventy
- Subprocess gate (PHOTO-06) proves rigging the committed manifest with `license = "all-rights-reserved"` causes `npm run validate-species` to exit 1, with `try/finally` restoration leaving `git diff content/species-photos.toml` clean
- Plan 02 contract pre-staged: `src/tests/seed-species-photos.test.ts` has 10 `test.todo` stubs ready to fill in

## Task Commits

1. **Task 1: Wave 0 scaffolding** — `5aca996` (chore)
2. **Task 2: Implement validate-species.mjs + Vitest coverage** — `c9fb8db` (feat)
3. **Task 3: Wire into npm build chain + subprocess integration tests** — `a1c08cf` (feat)

## Files Created/Modified

- `scripts/validate-species.mjs` (created, 109 lines) — CLI + exported `validateSpeciesPhotos` and `LICENSE_WHITELIST`
- `content/species-photos.toml` (created) — empty `[species]` manifest with schema header comment
- `src/tests/validate-species.test.ts` (created, 16 tests) — 13 in-process unit tests + 3 subprocess gate tests
- `src/tests/seed-species-photos.test.ts` (created, 10 todos) — Plan 02 stub
- `package.json` (modified) — added `@iarna/toml@^2.2.5` dependency, `validate-species` npm script, extended `build` chain
- `package-lock.json` (modified) — regenerated by `npm install @iarna/toml`

## Decisions Made

- **ESM interop:** `@iarna/toml`'s default export works directly via `import TOML from '@iarna/toml'` under Node 22 — no `createRequire` workaround needed (Pitfall 8 was a non-issue). Verified by `node --input-type=module -e "import TOML from '@iarna/toml'; console.log(typeof TOML.parse, typeof TOML.stringify);"` printing `function function`.
- **Error-accumulator pattern:** validator collects all errors before returning rather than throwing on the first one, so a single build-time pass surfaces every license/attribution violation in the manifest.
- **Subprocess test scope:** chose to invoke `npm run validate-species --silent` directly rather than the full `npm run build`. The latter would also run `validate-schema`, which fails on a fresh checkout without `public/data/*.parquet`. Isolating the TOML gate keeps the test deterministic across local/CI environments.

## Deviations from Plan

None — plan executed exactly as written. The plan-as-written `verify` block predicted `npm run validate-species` would print `1 warning(s)` against the empty manifest because `public/data/species.json` is absent locally. Actual output is `0 warning(s)` because the species.json absence message is a `console.warn` from the CLI block, not a `warnings[]` array entry — the count reflects only validator-emitted warnings. This is consistent with the implementation contract (`warnings[]` is for per-photo issues like unknown scientificName, not infrastructure status). Both behaviors satisfy the `done` criterion of "exit 0".

## Issues Encountered

None.

## User Setup Required

None — no external service configuration. The validator runs at build time on local checkouts and CI alike.

## Next Phase Readiness

- **Plan 02 (seed-species-photos.mjs):** Test stub at `src/tests/seed-species-photos.test.ts` enumerates the 10 contract points (PHOTO-04 URL transformation, license filtering at seed time, fill-only merge per D-01, rate limiting per PHOTO-07). Plan 02 fills these in and adds the seed script.
- **Plan 03 (render photos in species page):** Validator gate is upstream — Plan 03 can assume any TOML committed past this point has valid licenses and attribution.
- **Build chain:** `npm run build` now includes the TOML gate. Any future hand-edit that introduces a non-whitelisted license or missing attribution will fail CI before reaching `eleventy`.

## Self-Check: PASSED

- `scripts/validate-species.mjs` exists and exports `validateSpeciesPhotos` + `LICENSE_WHITELIST` (verified: 109 lines, both exports grep-confirmed)
- `content/species-photos.toml` exists with `[species]` table (verified)
- `src/tests/validate-species.test.ts` (16 tests passing) and `src/tests/seed-species-photos.test.ts` (10 todos passing) exist and parse cleanly
- `package.json` `scripts.build` is exactly `npm run validate-schema && npm run validate-species && npm run typecheck && eleventy`
- `@iarna/toml` is in `dependencies` (not `devDependencies`)
- All 3 task commits exist on `main`: `5aca996`, `c9fb8db`, `a1c08cf` (verified via `git log --oneline`)
- `git diff --exit-code content/species-photos.toml` clean (subprocess test restored manifest bytes)
- Full test suite: `npm test` → 188 passed / 10 todo / 1 skipped, no regressions

---
*Phase: 079-photo-manifest*
*Completed: 2026-05-04*
