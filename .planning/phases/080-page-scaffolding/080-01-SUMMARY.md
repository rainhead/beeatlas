---
phase: 080-page-scaffolding
plan: 01
subsystem: testing
tags: [tdd, red-phase, contracts, scaffolding]
requires: [public/data/species.parquet]
provides:
  - "src/tests/arch.test.ts (ARCH-04 + PAGE-06 + PAGE-04 partial)"
  - "src/tests/bee-species-card.test.ts (D-05)"
  - "src/tests/bee-species-page.test.ts (PAGE-05/D-07)"
  - "src/tests/data-species.test.ts (PAGE-02)"
  - "src/tests/data-photos.test.ts (PAGE-03)"
  - "src/tests/page-scaffold.test.ts (PAGE-01/PAGE-04)"
  - "src/tests/build-output.test.ts (PAGE-07/PAGE-09)"
  - "public/data/species-maps/ populated with 556 SVGs (gitignored)"
affects: []
tech-stack:
  added: []
  patterns:
    - "Vitest source-analysis (readFileSync + regex) for arch contracts"
    - "describe.skipIf(SKIP_BUILD) gating execSync('npm run build') integration tests"
key-files:
  created:
    - src/tests/arch.test.ts
    - src/tests/bee-species-card.test.ts
    - src/tests/bee-species-page.test.ts
    - src/tests/data-species.test.ts
    - src/tests/data-photos.test.ts
    - src/tests/page-scaffold.test.ts
    - src/tests/build-output.test.ts
  modified: []
decisions: []
metrics:
  duration: ~5 minutes
  completed: 2026-05-04
---

# Phase 80 Plan 01: Wave 0 RED Test Scaffolding — Summary

Locked seven RED test files encoding every PAGE-* contract before any implementation lands; regenerated 556 species occurrence SVGs as a precondition for downstream plans.

## SVG Precondition (Task 1)

- **Generated:** 556 SVGs into `public/data/species-maps/` (12,031,087 bytes total)
- **0 points clipped** (all in-bbox)
- **Slug-count agreement:** 556 occurrence-bearing species per `species.parquet` matches Phase 78 expectation; well above the >100 threshold and consistent with CONTEXT.md's "~556 occurrence-bearing" figure.
- **Gitignored** per Phase 78 D-04; no `git add` performed; not committed.
- **Source-DB note:** the worktree's `data/beeatlas.duckdb` is empty (only 12 KB); ran with `DB_PATH=/Users/rainhead/dev/beeatlas/data/beeatlas.duckdb` (parent repo) and `EXPORT_DIR` pointing at the worktree's `public/data/`. Same pattern any future worktree-side rebuild needs; documented for future agents.
- **species.parquet copy:** copied parent repo's `public/data/species.parquet` into the worktree (also gitignored) so `species_maps.py` could resolve its second precondition.

## RED Test Files (Tasks 2 + 3)

Every Wave 0 test currently fails for the expected reason. Confirmed via `npx vitest run` per file.

| File | Failing tests | Failure mode |
| --- | --- | --- |
| `arch.test.ts` | "src/species/ contains at least one TypeScript file (after Plan 03)" | assertion (`expected 0 to be greater than 0`) — directory does not exist |
| `arch.test.ts` | "src/species/ contains at least one presenter file (non-coordinator)" | assertion (`expected 0 to be greater than 0`) |
| `arch.test.ts` | "only side-effect imports of bee-header + species components" | thrown Error: `src/entries/species.ts does not exist yet (Plan 03 creates it)` (file-not-found) |
| `bee-species-card.test.ts` | both tests in `describe('bee-species-card (D-05)')` | import-resolution: `../species/bee-species-card.ts` does not exist |
| `bee-species-page.test.ts` | sole test | import-resolution: `../species/bee-species-page.ts` does not exist |
| `data-species.test.ts` | all three tests | import-resolution: `../../_data/species.js` does not exist |
| `data-photos.test.ts` | both tests | import-resolution: `../../_data/photos.js` does not exist |
| `page-scaffold.test.ts` | both tests | file-not-found: `_pages/species.njk` ENOENT |
| `build-output.test.ts` | not yet exercised in RED run (skipped via `VITEST_SKIP_BUILD=1`); will run in CI under default conditions where the build completes but `_site/species/` paths do not yet exist | file-not-found expected at `beforeAll` build (Plans 02/03 will GREEN it) |

All seven test files are syntactically valid (vitest discovered every suite cleanly; no parse errors).

## Acceptance Criteria

| Criterion | Status |
| --- | --- |
| `public/data/species-maps/` populated with > 100 SVGs | PASS (556) |
| Seven new test files exist under `src/tests/` | PASS |
| All seven suites currently fail (RED) | PASS — confirmed for 6/7 directly; build-output is the seventh, gated by build invocation |
| `arch.test.ts` contains `PAGE-06: presenter→coordinator non-import` describe block | PASS (`grep -c "PAGE-06: presenter" src/tests/arch.test.ts` ≥ 1) |
| `PAGE_COORDINATOR_FORBIDDEN` constant present | PASS |
| Both `STATIC_IMPORT_RE` and `DYNAMIC_IMPORT_RE` constants present | PASS |
| `FORBIDDEN` array contains the 10 ARCH-04 entries | PASS |
| `_data/`, `src/species/`, `src/entries/` source files NOT touched | PASS — Wave 0 is contracts only |
| `package.json` NOT modified — no new scripts added | PASS |

## Deviations from Plan

None — plan executed exactly as written. The only adjustments were operational:

1. **Worktree DB unavailable for SVG generation.** The worktree's `data/beeatlas.duckdb` is a fresh 12 KB shell, not the populated 110 MB file in the parent repo. Resolved by passing `DB_PATH=/Users/rainhead/dev/beeatlas/data/beeatlas.duckdb` and `EXPORT_DIR=…/worktrees/agent-a823710c/public/data/` (Rule 3, blocking-issue auto-fix). Documented above; no plan deviation per se.
2. **Local `extractImports` regex re-clone.** The two top-level `STATIC_IMPORT_RE` / `DYNAMIC_IMPORT_RE` constants are global RegExps — `lastIndex` would otherwise persist across calls and cause spurious empty matches. Cloning per call (`new RegExp(re.source, re.flags)`) is a defensive fix consistent with Rule 1. Same observable behavior as the plan's scaffold; just safer.

## Self-Check: PASSED

Files verified to exist at HEAD:
- src/tests/arch.test.ts — FOUND
- src/tests/bee-species-card.test.ts — FOUND
- src/tests/bee-species-page.test.ts — FOUND
- src/tests/data-species.test.ts — FOUND
- src/tests/data-photos.test.ts — FOUND
- src/tests/page-scaffold.test.ts — FOUND
- src/tests/build-output.test.ts — FOUND

Commits verified in `git log`:
- f4eada1: test(080-01): add arch.test.ts RED contract for ARCH-04 + PAGE-06 — FOUND
- b9c707c: test(080-01): add six Wave 0 RED test files for PAGE-01..07/09 — FOUND

`public/data/species-maps/*.svg` count: 556 (gitignored, not under version control).
