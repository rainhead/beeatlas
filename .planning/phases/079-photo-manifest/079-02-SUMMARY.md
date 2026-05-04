---
phase: 079-photo-manifest
plan: 02
subsystem: seed
tags: [inaturalist, duckdb, rate-limit, toml, fill-only, build-chain-isolation]

requires:
  - phase: 079-photo-manifest
    plan: 01
    provides: scripts/validate-species.mjs (LICENSE_WHITELIST single source of truth)
provides:
  - scripts/seed-species-photos.mjs (CLI helper + named exports for in-process Vitest)
  - 31 Vitest cases in src/tests/seed-species-photos.test.ts replacing the 10 todo stubs from Plan 01
affects: [079-03-render-photos, phase-080]

tech-stack:
  added: []
  patterns:
    - "CLI-as-named-module guard (mirrors validate-species.mjs): fileURLToPath(import.meta.url) === resolve(process.argv[1]) keeps Vitest imports side-effect free"
    - "RateLimiter as a tiny class with rolling lastCall timestamp; first wait() free, subsequent waits sleep just long enough to hold the cap (PHOTO-07)"
    - "Defensive observation walking: photos = obs?.photos ?? [], license = photo?.license_code — Pitfall 3 (missing fields) and Pitfall 1 (per-photo license) both met without try/catch noise"
    - "Fill-only merge as a pure function returning new manifests (D-01); easier to test than in-place mutation, no Object.assign sharp edges"

key-files:
  created:
    - scripts/seed-species-photos.mjs
  modified:
    - src/tests/seed-species-photos.test.ts

key-decisions:
  - "iNat fallback: WA-preferred top-up. Take all WA photos that pass the license filter, then top up from a global query to fill remaining slots up to 3 — minimizes 'no photo' gaps for species rare in WA. (Resolves CONTEXT.md open question about fallback behavior.)"
  - "description = '' is always written for new entries (never omitted). Rationale: keeps the validator's optional-field rule exercised on every seeded entry and gives humans an obvious empty placeholder to fill."
  - "photos key is omitted entirely when no license-clean photos found (rather than writing photos = []). Cleaner TOML, round-trips identically through @iarna/toml. Validator already handles the 'photos field absent' case via `entry.photos ?? []`."
  - "Task 2's `describe('build-chain isolation')` block was co-located in Task 1's commit (single test file, single import block). Task 2 became a verification-only task — no separate commit was created. Documented as deviation below."
  - "Tests use a real RateLimiter with minIntervalMs=30..50ms (not Vitest fake timers). Real-time assertions catch off-by-one in lastCall bookkeeping that fake timers would mask."

patterns-established:
  - "Build-chain isolation regression guard: a Vitest assertion that scans package.json scripts for forbidden references (here: seed-species-photos). Reusable pattern for any 'this must NEVER be in CI' invariant."
  - "Per-photo (not per-observation) license filter encoded as a unit test fixture where obs.license_code differs from photo.license_code — codifies Pitfall 1 in executable form."

requirements-completed: [PHOTO-04, PHOTO-07, PHOTO-08]

duration: ~6min
completed: 2026-05-04
---

# Phase 079 Plan 02: Seed Species Photos Summary

**One-shot iNat seed helper with WA-preferred + global-top-up fallback, ≤1 req/sec rate limiting, fill-only merge into `content/species-photos.toml`, and 31 Vitest cases covering every pure helper plus 5 build-chain isolation guards proving the seed will never run in CI.**

## Performance

- **Duration:** ~6 min wall clock
- **Started:** 2026-05-04T16:25:36Z
- **Completed:** 2026-05-04T16:31:00Z (approx)
- **Tasks:** 2 (Task 2 collapsed into Task 1's commit; see Deviations)
- **Files modified:** 2 (1 created, 1 modified)
- **Tests:** 188 → 219 (added 31 cases, replaced 10 todos)

## Accomplishments

- `scripts/seed-species-photos.mjs` implements all six named exports per the plan contract:
  - `photoUrlToLarge(url)` — `/square.{ext}` → `/large.{ext}` regex anchored at end (PHOTO-04)
  - `extractPhotos(observations, maxCount=3, startOrdering=1)` — per-photo license filter (Pitfall 1), defensive against null `photos`/`obs` arrays (Pitfall 3), URL transform applied at extraction time (PHOTO-04)
  - `mergeFillOnly(manifest, name, entry)` — pure, non-mutating, never overwrites (D-01)
  - `sortManifestSpecies(manifest)` — alphabetical key sort for stable diffs (Pitfall 9)
  - `RateLimiter` class — first-wait-free, then ≥minIntervalMs sleep (PHOTO-07)
  - `loadTaxonIds(dbPath)` — DuckDB CLI shell-out for the canonical_to_taxon_id bridge
- CLI guarded by `fileURLToPath(import.meta.url) === resolve(process.argv[1])`; Vitest imports run zero side-effect code
- License whitelist is imported from `./validate-species.mjs` — single source of truth; Plan 01 changes propagate to seed automatically
- Task 1 RED→GREEN cycle: replaced 10 `test.todo` stubs from Plan 01 with 26 real assertions in 5 `describe` blocks (URL transform, license filter, fill-only merge, sort, rate limiter); Task 2 added 5 more cases in a 6th `describe('build-chain isolation')` block enforcing the PHOTO-07 NOT-in-CI invariant
- Dry-run sanity confirmed: `node scripts/seed-species-photos.mjs --dry-run --limit 1` exits 1 with the Pitfall-5 fail-fast message because `public/data/species.json` is absent locally — and `git diff --exit-code content/species-photos.toml` is clean afterward (no spurious writes)
- Full suite: 219 passed / 0 failed / 0 todo

## Task Commits

1. **Task 1 (+Task 2 test block): seed-species-photos pure helpers + 31 Vitest cases** — `ca2bc9f` (feat)
2. **Task 2: verification-only** — no commit (see Deviations)

## Files Created/Modified

- `scripts/seed-species-photos.mjs` (created, ~250 lines) — CLI + 6 named exports, license whitelist re-imported from `validate-species.mjs`
- `src/tests/seed-species-photos.test.ts` (modified, 14 → 313 lines) — 31 test cases across 6 `describe` blocks

## Decisions Made

- **iNat fallback behavior (was open in CONTEXT.md "Claude's Discretion"):** WA-preferred top-up. Pull up to 3 WA photos passing the license filter, then if fewer than 3 query iNat globally and top up the remainder, deduping by `photo_id`. Implemented in `fetchPhotosForTaxon`. Rationale: minimizes "no photo" gaps for species rare in WA without abandoning the WA-first preference. Costs at most one extra iNat call per species (≤1 sec/species at the rate limit).
- **`description = ""` always written:** every new seeded entry carries `description = ""`. Keeps validator optional-field branch exercised; gives humans an unambiguous empty placeholder. Trivial to delete by hand if a human prefers to omit.
- **`photos` omitted when empty (not `photos = []`):** `@iarna/toml` round-trips both shapes identically, but writing nothing for the empty case keeps the manifest visually quieter and avoids stranded empty arrays after a re-run. Validator handles missing `photos` field via `entry.photos ?? []`.
- **Test rate-limiter intervals at 30–50 ms (not 1000 ms):** keeps the test suite under 1 s wall clock while still proving the timing contract. The production CLI hardcodes `new RateLimiter(1000)` — only the constructor argument changes between test and prod.
- **No Vitest fake timers:** real `Date.now()` and `setTimeout` exercise the rolling-window logic end-to-end. Fake timers would mask off-by-one bugs in `lastCall` bookkeeping.

## Deviations from Plan

**Task 2 had no code changes — collapsed into Task 1's commit.** The plan splits the seed test file into two waves: Task 1 fills the 10 todos, Task 2 appends `describe('build-chain isolation')`. Both blocks live in the same file and share one import header, so I wrote both at once and committed them together as Task 1. Task 2's remaining work — dry-run sanity check, manifest-unchanged check, `npm test` regression check — is verification, not file changes; creating an empty commit for a "no-op" task would muddy the log. The substance of Task 2 (the 5 build-chain isolation tests, the dry-run output, the clean-manifest assertion, and the green full suite) is all delivered and recorded in this SUMMARY.

This deviation is consistent with the plan's `success_criteria` block, all of which are satisfied: the assertions exist, the regression guard is in place, and the dry-run leaves the manifest untouched.

**Pre-existing typecheck failure (out of scope):** `npm run typecheck` reports `TS7016 Could not find a declaration file for module '../../scripts/validate-species.mjs'` in `src/tests/validate-species.test.ts`. This error existed on `main` before Plan 02 began (verified by `git stash && npm run typecheck` against Plan 01's tip commit `0588efc`). Plan 02 does not introduce a new instance — my new test file uses `@ts-expect-error` on the equivalent `.mjs` import so the second source-of-the-error is suppressed. Per execute-plan.md SCOPE BOUNDARY, this pre-existing issue is logged here but not auto-fixed; if tracked separately it belongs to a Plan 01 follow-up (likely a 2-line `.d.ts` shim or a single project-wide `// @ts-ignore` policy).

## Issues Encountered

None during seed execution. The pre-existing typecheck issue (above) was the only friction point, and it pre-dates this plan.

## Dry-Run Sanity Result

```
$ node scripts/seed-species-photos.mjs --dry-run --limit 1
x /Users/rainhead/dev/beeatlas/public/data/species.json: not found.
  Run the data pipeline first: cd data && uv run python run.py
$ echo $?
1

$ git diff --exit-code content/species-photos.toml
$ echo $?
0
```

Pitfall 5 fail-fast triggered as designed; manifest untouched. **No live iNat API calls were made** — the script exits before reaching the network layer because the precondition (`species.json`) is absent. This is the correct behavior on a fresh dev machine without the data pipeline run.

To exercise the live path, a human would run `cd data && uv run python run.py` first to generate `species.json` and `beeatlas.duckdb`, then `node scripts/seed-species-photos.mjs --dry-run --limit 5` to hit iNat for 5 species without writing the manifest. That live exercise is intentionally deferred to the Plan 03 readiness check below.

## User Setup Required

None for the seed code itself. The seed *invocation* (Plan 03 next step) requires:
1. Local data pipeline output: `cd data && uv run python run.py` to generate `public/data/species.json` and `data/beeatlas.duckdb`
2. Network access to `api.inaturalist.org` from the dev machine
3. ~12 minutes wall clock for ~735 species at 1 req/sec, doubled to ~24 minutes if every species hits the global fallback

## Plan 03 Readiness Signal

**Ready to seed full ~735 species when user gives the go-ahead.** All plumbing is in place:
- License-clean writes guaranteed by `extractPhotos` filtering at write time
- D-01 fill-only guarantees re-runnability — humans can interrupt and resume
- Incremental checkpoints every 50 species means a Ctrl-C mid-run loses at most 49 species of work
- The validator gate (`npm run validate-species`) will catch any future hand edits that introduce a bad license or missing attribution

When the user says "seed it", the call is: `node scripts/seed-species-photos.mjs` (no flags). Dry-run first via `--dry-run --limit 5` to confirm iNat connectivity is recommended.

## Self-Check: PASSED

- `scripts/seed-species-photos.mjs` exists with all 6 named exports — verified via grep:
  - `export function photoUrlToLarge` ✓
  - `export function extractPhotos` ✓
  - `export function mergeFillOnly` ✓
  - `export function sortManifestSpecies` ✓
  - `export class RateLimiter` ✓
  - `export function loadTaxonIds` ✓
- `import { LICENSE_WHITELIST } from './validate-species.mjs'` present in seed (single source of truth) ✓
- CLI guard `fileURLToPath(import.meta.url) === resolve(process.argv[1])` present ✓
- All 31 Vitest cases pass: `npx vitest run src/tests/seed-species-photos.test.ts` → 31 passed ✓
- Full test suite green: `npm test` → 219 passed / 0 failed / 0 todo ✓
- `node -e "..."` confirms zero `package.json` script references seed-species-photos ✓
- `git diff --exit-code content/species-photos.toml` clean after dry-run ✓
- Task 1 commit `ca2bc9f` exists on `main` (verified via `git log --oneline`) ✓

---
*Phase: 079-photo-manifest*
*Completed: 2026-05-04*
