---
phase: 101-typescript-occurrence-domain-module
plan: 02
subsystem: ui
tags: [typescript, refactoring, occurrence-domain, pure-functions]

requires:
  - 101-01 (src/occurrence.ts with six exports)

provides:
  - "All six caller files import from src/occurrence.ts"
  - "No inline ecdysis:/inat: ID construction outside occurrence.ts"
  - "No inline occurrence-type discriminants (ecdysis_id != null, is_provisional) in production code"

affects:
  - src/bee-atlas.ts
  - src/bee-table.ts
  - src/features.ts
  - src/filter.ts
  - src/bee-occurrence-detail.ts
  - src/bee-map.ts

tech-stack:
  added: []
  patterns:
    - "occIdFromRow replaces three inline ecdysis:/inat: ternary constructors in bee-atlas.ts"
    - "parseOccId replaces two manual startsWith+slice+parseInt parse loops in bee-atlas.ts"
    - "isSpecimenBacked replaces ecdysis_id != null discriminants in features.ts, bee-occurrence-detail.ts, bee-table.ts"
    - "isSpecimenId replaces startsWith('ecdysis:') guards in features.ts and bee-map.ts"
    - "isProvisional replaces row.is_provisional ternary in bee-occurrence-detail.ts"
    - "filter.ts uses occIdFromRow via partial-row construction (safe: occurrence.ts uses import type only, no runtime cycle)"

key-files:
  created: []
  modified:
    - src/bee-atlas.ts
    - src/bee-table.ts
    - src/features.ts
    - src/filter.ts
    - src/bee-occurrence-detail.ts
    - src/bee-map.ts

key-decisions:
  - "filter.ts uses partial-row construction for occIdFromRow (not two-line inline): { ecdysis_id: v, observation_id: null, is_provisional: false } as OccurrenceRow — safe because occurrence.ts uses import type, erased before bundle resolution"
  - "bee-occurrence-detail.ts nonSpecimen variable (renamed from sampleOnly) uses !isSpecimenBacked not isSampleOnly — RESEARCH Pitfall 2: isSampleOnly excludes provisional rows which must still be in the partition"
  - "bee-map.ts speicmenLayer typo preserved per CLAUDE.md constraint"
  - "bee-table.ts ecdysis link-URL guard (row.ecdysis_id != null for URL building) also replaced with isSpecimenBacked — discovered during Task 3 grep gate (Rule 1 auto-fix)"

requirements-completed: [TS-01, TS-02, TS-03]

duration: 5m
completed: 2026-05-19
---

# Phase 101 Plan 02: Caller Migration to occurrence.ts Summary

**Six caller files migrated to import from src/occurrence.ts — all inline ID construction and occurrence-type discriminants replaced with named predicates; 391 tests green; tsc clean**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-19T00:01:26Z
- **Completed:** 2026-05-19T00:06:30Z
- **Tasks:** 3 (Task 1: bee-atlas/bee-table/features; Task 2: filter/bee-occurrence-detail/bee-map; Task 3: gate verification)
- **Files modified:** 6

## Accomplishments

- Migrated all six caller files to import from `src/occurrence.ts`
- Eliminated all inline `ecdysis:${...}` / `inat:${...}` template-literal ID construction outside `occurrence.ts`
- Eliminated all TypeScript `ecdysis_id != null` occurrence-type discriminants in production code
- Eliminated all `row.is_provisional` inline discriminants in production code
- Preserved the `speicmenLayer` typo in `bee-map.ts` per CLAUDE.md constraint
- All 391 previously-passing tests continue to pass; `tsc --noEmit` exits 0

## Task Commits

Each task was committed atomically:

1. **Task 1: bee-atlas.ts, bee-table.ts, features.ts migration** - `337b303`
2. **Task 2: filter.ts, bee-occurrence-detail.ts, bee-map.ts migration** - `7ca92dc`
3. **Task 3: Remediation fix (bee-table.ts URL guard)** - `26b69be`

## Task 3: Verification Gate Results

### Grep 1 — `'ecdysis:'` single-quoted
```
src/occurrence.ts
src/url-state.ts
```
Expected: only `occurrence.ts` and `url-state.ts` (URL-input validation per RESEARCH Open Question 3). PASS.

### Grep 2 — `'inat:'` single-quoted
```
src/occurrence.ts
src/url-state.ts
```
Expected: same allowed set. PASS.

### Grep 3 — Template-literal construction (`ecdysis:${` / `inat:${`)
```
src/occurrence.ts
```
Expected: only `occurrence.ts`. PASS.

### Grep 4 — Double-quoted `"ecdysis:"`
```
(empty)
```
Expected: empty. PASS.

### Grep 5 — Double-quoted `"inat:"`
```
(empty)
```
Expected: empty. PASS.

### Grep 6 — TypeScript `ecdysis_id != null` discriminants in production code
```
src/occurrence.ts
```
Expected: only `occurrence.ts`. PASS. (Note: `bee-table.ts` originally had a hit — `row.ecdysis_id != null` used to build an Ecdysis URL. Fixed in Task 3 via Rule 1 auto-fix, commit `26b69be`.)

### Grep 7 — Inline `is_provisional` discriminants in production code (outside occurrence.ts)
```
(empty)
```
Expected: empty. PASS.

### Grep 8 — Files importing from `./occurrence.ts`
```
src/bee-atlas.ts
src/bee-map.ts
src/bee-occurrence-detail.ts
src/bee-table.ts
src/features.ts
src/filter.ts
```
Expected: all six caller files. PASS. (Test file `src/tests/occurrence.test.ts` imports via `'../occurrence.ts'` — different path, not counted in this grep.)

### Gate 9 — `npm test`
Exit code: 0 (391 tests passing; 2 pre-existing failures from missing pipeline artifacts)

### Gate 10 — `npx tsc --noEmit`
Exit code: 0

### Gate 11 — `npm run build`
Exit code: non-zero — fails on `public/data/species.json` missing in this worktree (pre-existing pipeline-data condition; same failure observed in Plan 01 SUMMARY, unrelated to this plan's changes). TypeScript compilation (`tsc --noEmit`) and test suite pass cleanly.

## Files Created/Modified

- `src/bee-atlas.ts` — Added `import { occIdFromRow, parseOccId }` from occurrence.ts; replaced three inline ecdysis/inat constructors with `occIdFromRow(r)!`; replaced two parse loops with `parseOccId` single-loop pattern
- `src/bee-table.ts` — Deleted local `rowOccId` helper; added `import { occIdFromRow, isSpecimenBacked }`; updated three call sites and the URL-builder ecdysis guard
- `src/features.ts` — Added `import { occIdFromRow, isSpecimenBacked, isSpecimenId }` + `import type { OccurrenceRow }`; replaced inline ID construction, `ecdysis_id != null` discriminant, and `startsWith('ecdysis:')` guard
- `src/filter.ts` — Added `import { occIdFromRow }`; replaced two inline template-literal lines in `queryVisibleIds` with partial-row occIdFromRow calls
- `src/bee-occurrence-detail.ts` — Added `import { isSpecimenBacked, isProvisional }`; replaced `ecdysis_id` discriminants with named predicates; renamed `sampleOnly` → `nonSpecimen`; replaced `row.is_provisional` ternary with `isProvisional(row)`
- `src/bee-map.ts` — Added `import { isSpecimenId }`; replaced `startsWith('ecdysis:')` guard with `isSpecimenId()`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed bee-table.ts ecdysis_id != null occurrence-type discriminant in URL builder**
- **Found during:** Task 3 grep gate (Grep 6)
- **Issue:** `row.ecdysis_id != null` at line 353 (now ~353) in the links-cell render path was used to conditionally build an Ecdysis URL — missed in Task 1 because it was not in the explicit lines 312/313/351 inventory from PATTERNS.md.
- **Fix:** Replaced with `isSpecimenBacked(row)`, added `isSpecimenBacked` to the occurrence.ts import
- **Files modified:** `src/bee-table.ts`
- **Commit:** `26b69be`

**2. [Rule 3 - Blocking] TypeScript cast error in features.ts**
- **Found during:** Task 1 `tsc --noEmit`
- **Issue:** `obj as OccurrenceRow` rejected by TypeScript (Record<string, unknown> does not sufficiently overlap with OccurrenceRow). Plan's action said "add as OccurrenceRow cast" but the compiler requires `as unknown as OccurrenceRow`.
- **Fix:** Changed to `const row = obj as unknown as OccurrenceRow` — idiomatic TypeScript double-assertion for SQLite row objects.
- **Files modified:** `src/features.ts`
- **Commit:** included in Task 1 commit `337b303`

## filter.ts Circular-Import Decision

The plan offered two approaches: (a) import occIdFromRow directly (safe because occurrence.ts uses `import type` only), or (b) use inline partial-row construction as fallback.

**Chosen:** Direct import + partial-row construction at the call site. `import { occIdFromRow } from './occurrence.ts'` was added. The two replacement lines use `occIdFromRow({ ecdysis_id: ecdysisId, observation_id: null, is_provisional: false } as OccurrenceRow)` and the symmetric inat call. No circular-dependency warnings observed in `npm test`.

## bee-occurrence-detail.ts Partition Decision (RESEARCH Pitfall 2)

The non-specimen partition uses `!isSpecimenBacked` (NOT `isSampleOnly`). The variable was renamed from `sampleOnly` to `nonSpecimen` to accurately reflect that it includes both sample-only and provisional rows. Within the `.map()`, dispatch uses `isProvisional(row)` to choose between `_renderProvisional` and `_renderSampleOnly`. This matches the RESEARCH Pitfall 2 requirement and passes the `bee-sidebar.test.ts` provisional-render tests.

## bee-map.ts speicmenLayer Typo

The `speicmenLayer` typo is intact in `src/bee-map.ts` (grep returns 2 hits — preserved per CLAUDE.md constraint). No incidental fix applied.

## Known Stubs

None — all changes are pure refactoring; no data dependencies introduced.

## Threat Flags

None — this plan modifies no network endpoints, auth paths, file access patterns, or schema. Pure TypeScript refactoring.

---

## Self-Check

### Files exist:
- `src/bee-atlas.ts` — FOUND
- `src/bee-table.ts` — FOUND
- `src/bee-map.ts` — FOUND
- `src/bee-occurrence-detail.ts` — FOUND
- `src/features.ts` — FOUND
- `src/filter.ts` — FOUND

### Commits exist:
- `337b303` (Task 1: feat — bee-atlas, bee-table, features)
- `7ca92dc` (Task 2: feat — filter, bee-occurrence-detail, bee-map)
- `26b69be` (Task 3: fix — bee-table URL guard)

## Self-Check: PASSED

---
*Phase: 101-typescript-occurrence-domain-module*
*Completed: 2026-05-19*
