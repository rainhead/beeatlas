---
phase: 101-typescript-occurrence-domain-module
plan: 01
subsystem: ui
tags: [typescript, vitest, pure-functions, occurrence-domain, refactoring]

requires: []
provides:
  - "src/occurrence.ts: occIdFromRow, parseOccId, isSpecimenBacked, isSampleOnly, isProvisional, isSpecimenId"
  - "src/tests/occurrence.test.ts: 24 unit tests covering all six exports"
affects:
  - 101-02 (caller migration — imports occIdFromRow, parseOccId, isSpecimenBacked, isSampleOnly, isProvisional, isSpecimenId)

tech-stack:
  added: []
  patterns:
    - "Pure-function TypeScript module: no default export, no classes, no module-level state, single type-only import"
    - "occIdFromRow returns string | null matching bee-table.ts rowOccId contract"
    - "TDD RED/GREEN: test file committed with module-not-found failure, then implementation committed green"

key-files:
  created:
    - src/occurrence.ts
    - src/tests/occurrence.test.ts
  modified: []

key-decisions:
  - "occIdFromRow returns string | null (not string) — matches bee-table.ts rowOccId contract; avoids silent inat:0 bug when both ecdysis_id and observation_id are null"
  - "isSpecimenId(occId: string) exported as sixth helper — allows features.ts:81 and bee-map.ts:966 to replace startsWith('ecdysis:') guards in Plan 02 without restating the prefix literal outside occurrence.ts"
  - "isSampleOnly defined as ecdysis_id == null && !is_provisional — deliberately excludes provisional rows; Plan 02 must not replace line-248 filter in bee-occurrence-detail.ts with isSampleOnly alone"
  - "occurrence.ts has exactly one import: import type { OccurrenceRow } from './filter.ts' — no runtime deps, no circular import risk"

patterns-established:
  - "TDD pattern: write failing test first (RED commit), then implementation (GREEN commit)"
  - "BASE_ROW factory constant with all OccurrenceRow fields + thin factory helpers (specimenRow, sampleRow, provisionalRow) for test fixture setup"

requirements-completed: [TS-01, TS-02, TS-03]

duration: 15min
completed: 2026-05-18
---

# Phase 101 Plan 01: TypeScript Occurrence Domain Module Summary

**Six pure-function exports in src/occurrence.ts covering occurrence ID construction, parsing, and type predicates — with 24 Vitest tests all passing green**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-18T16:50:00Z
- **Completed:** 2026-05-18T17:05:00Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 2 new files

## Accomplishments

- Created `src/occurrence.ts` with six named exports: `occIdFromRow`, `parseOccId`, `isSpecimenBacked`, `isSampleOnly`, `isProvisional`, `isSpecimenId`
- Created `src/tests/occurrence.test.ts` with 24 test cases across 6 describe blocks (one per export)
- All 24 tests pass; TypeScript compiles cleanly (`tsc --noEmit` exits 0)
- No caller files modified — Plan 02 (Wave 2) handles migration

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing Vitest unit tests (RED)** - `59f7133` (test)
2. **Task 2: Create src/occurrence.ts with six exports (GREEN)** - `3bd47d4` (feat)

## Files Created/Modified

- `src/occurrence.ts` — Occurrence domain module: ID construction, ID parsing, three occurrence-type predicates, one string-based ID predicate
- `src/tests/occurrence.test.ts` — 24 Vitest unit tests; BASE_ROW factory + specimenRow/sampleRow/provisionalRow helpers

## Decisions Made

**occIdFromRow returns `string | null`** (not `string`): The plan locked this decision to match the existing `rowOccId` helper in `bee-table.ts` (lines 39–43) which explicitly returns `string | null`. This avoids the silent `inat:0` bug that existed in the inline pattern `inat:${Number(row.observation_id)}` when `observation_id` is null. The test for the null-return case uses `provisionalRow()` with `observation_id: null`, mirroring the `bee-sidebar.test.ts` fixture.

**isSpecimenId exported as sixth helper**: The plan resolved Open Question 4 (RESEARCH) by adding `isSpecimenId(occId: string): boolean` to allow replacing `startsWith('ecdysis:')` guards in `src/features.ts:81` and `src/bee-map.ts:966` in Plan 02. This keeps the `'ecdysis:'` prefix literal confined to `occurrence.ts`.

**isSampleOnly semantics**: `ecdysis_id == null && !is_provisional` — deliberately excludes provisional rows. The test explicitly asserts `isSampleOnly(provisionalRow()) === false`. Plan 02 migration of `bee-occurrence-detail.ts` must use `!isSpecimenBacked` for the non-specimen partition then dispatch on `isProvisional`.

## Deviations from Plan

None — plan executed exactly as written. The actual `OccurrenceRow` type in `filter.ts` differs slightly from the plan's interface block (lat/lon are `number` not nullable; year/month are `number | null`; sample_id is `number | null`), but this is expected — the plan's block was slightly stale. The implementation uses the actual type from `filter.ts` as specified by the plan instruction to confirm the interface before writing.

## Issues Encountered

Pre-existing test failures in `src/tests/build-output.test.ts` and `src/tests/data-species.test.ts` (require pipeline-generated `public/data/species.json` absent in the worktree) — unrelated to this plan. All 391 other tests pass.

## Known Stubs

None — the module is purely functional with no data dependencies.

## Threat Flags

None — this plan creates no network endpoints, auth paths, file access patterns, or schema changes. Pure in-memory TypeScript functions.

## Next Phase Readiness

- `src/occurrence.ts` is ready for Plan 02 (Wave 2) caller migration
- All six exports verified with passing tests
- Design decisions documented in key-decisions frontmatter for Plan 02 reference

---
*Phase: 101-typescript-occurrence-domain-module*
*Completed: 2026-05-18*
