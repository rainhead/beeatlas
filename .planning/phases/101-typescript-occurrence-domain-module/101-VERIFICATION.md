---
phase: 101-typescript-occurrence-domain-module
verified: 2026-05-18T17:20:00Z
status: passed
score: 7/7
overrides_applied: 0
---

# Phase 101: TypeScript Occurrence Domain Module — Verification Report

**Phase Goal:** `src/occurrence.ts` is the single authoritative module for occurrence ID construction, ID parsing, and occurrence-type predicates. All six caller files import from it. After the phase, the only file in `src/` containing `'ecdysis:'`/`'inat:'` as ID prefixes is `src/occurrence.ts` (with intentional exceptions: `src/url-state.ts:192` for URL validation, and test fixtures asserting output format).

**Verified:** 2026-05-18T17:20:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `src/occurrence.ts` exists with 6 named exports: `occIdFromRow`, `parseOccId`, `isSpecimenBacked`, `isSampleOnly`, `isProvisional`, `isSpecimenId` | VERIFIED | `grep -c "^export function" src/occurrence.ts` returns 6; all 6 names confirmed present |
| 2 | `src/tests/occurrence.test.ts` exists with ≥12 test cases across ≥6 describe blocks | VERIFIED | 24 test cases, 6 describe blocks (one per export) |
| 3 | `npm test` exits 0 | VERIFIED | 442 tests pass (0 failures) |
| 4 | `npx tsc --noEmit` exits 0 | VERIFIED | No TypeScript errors |
| 5 | All 6 caller files import from `./occurrence.ts` | VERIFIED | `grep -rln "from './occurrence.ts'" src/` returns exactly: bee-atlas.ts, bee-map.ts, bee-occurrence-detail.ts, bee-table.ts, features.ts, filter.ts |
| 6 | No inline `'ecdysis:'`/`'inat:'` template-literal ID construction outside `occurrence.ts` (with allowed carve-outs) | VERIFIED | `grep -rlnE 'ecdysis:\$\{|inat:\$\{' src/` returns only `src/occurrence.ts`; single-quoted form returns only `src/occurrence.ts` and `src/url-state.ts` (the intentional URL-validation carve-out) |
| 7 | `src/bee-map.ts` `speicmenLayer` typo preserved | VERIFIED | `grep -c "speicmenLayer" src/bee-map.ts` returns 2 |

**Score:** 7/7 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/occurrence.ts` | 6 named exports, single `import type` from filter.ts, no default export | VERIFIED | Exactly 1 import line (`import type { OccurrenceRow } from './filter.ts'`); 6 `^export function` lines; no `export default` |
| `src/tests/occurrence.test.ts` | ≥12 tests, ≥6 describe blocks, imports all 6 exports | VERIFIED | 24 tests, 6 describe blocks; imports all 6 functions + `import type { OccurrenceRow }` from filter.ts; no runtime import from filter.ts |
| `src/bee-atlas.ts` | Imports `occIdFromRow`, `parseOccId` from occurrence.ts | VERIFIED | `import { occIdFromRow, parseOccId } from './occurrence.ts'` at line 4 |
| `src/bee-table.ts` | Local `rowOccId` deleted; imports `occIdFromRow`, `isSpecimenBacked` | VERIFIED | `grep -c "^function rowOccId" src/bee-table.ts` = 0; `grep -c "rowOccId" src/bee-table.ts` = 0 |
| `src/features.ts` | Imports `occIdFromRow`, `isSpecimenBacked`, `isSpecimenId`; no inline construction | VERIFIED | Import confirmed; `grep -c "startsWith('ecdysis:')" src/features.ts` = 0; template-literal construction absent |
| `src/filter.ts` | Imports `occIdFromRow`; no template-literal ID construction | VERIFIED | Import confirmed; partial-row construction delegates to `occIdFromRow`; no `ecdysis:${` or `inat:${` literal |
| `src/bee-occurrence-detail.ts` | Imports `isSpecimenBacked`, `isProvisional`; does NOT use `isSampleOnly` | VERIFIED | `isSampleOnly` absent; `!isSpecimenBacked(r)` used for non-specimen partition; `isProvisional(row)` used for dispatch |
| `src/bee-map.ts` | Imports `isSpecimenId`; `startsWith('ecdysis:')` replaced | VERIFIED | `grep -c "startsWith('ecdysis:')" src/bee-map.ts` = 0; `speicmenLayer` typo untouched |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/bee-atlas.ts` | `src/occurrence.ts` | `import { occIdFromRow, parseOccId }` | WIRED | Confirmed at line 4 |
| `src/bee-table.ts` | `src/occurrence.ts` | `import { occIdFromRow, isSpecimenBacked }` | WIRED | Confirmed at line 4; local `rowOccId` fully deleted |
| `src/features.ts` | `src/occurrence.ts` | `import { occIdFromRow, isSpecimenBacked, isSpecimenId }` | WIRED | Confirmed at line 4; all three functions in use |
| `src/filter.ts` | `src/occurrence.ts` | `import { occIdFromRow }` | WIRED | Confirmed at line 2; partial-row construction in `queryVisibleIds` |
| `src/bee-occurrence-detail.ts` | `src/occurrence.ts` | `import { isSpecimenBacked, isProvisional }` | WIRED | Confirmed at line 4; `!isSpecimenBacked` for non-specimen partition (not `isSampleOnly`) |
| `src/bee-map.ts` | `src/occurrence.ts` | `import { isSpecimenId }` | WIRED | Confirmed at line 11; used at former `startsWith('ecdysis:')` site |
| `src/occurrence.ts` | `src/filter.ts` | `import type { OccurrenceRow }` | WIRED | Type-only import — no runtime cycle |
| `src/tests/occurrence.test.ts` | `src/occurrence.ts` | `import { occIdFromRow, parseOccId, isSpecimenBacked, isSampleOnly, isProvisional, isSpecimenId }` | WIRED | All 6 exports imported and tested |

---

## ROADMAP Success Criteria Verification

| SC# | Criterion | Status | Evidence |
|-----|-----------|--------|----------|
| 1 | `grep -r '"ecdysis:"' src/` returns only `src/occurrence.ts` | VERIFIED | Grep returns empty — double-quoted form never used anywhere; `occurrence.ts` uses template literals and single-quoted form. No other file has the double-quoted form either (better than specified) |
| 2 | `grep -r '"inat:"' src/` returns only `src/occurrence.ts` | VERIFIED | Same — grep returns empty; double-quoted form not used |
| 3 | `isSpecimenBacked`, `isSampleOnly`, `isProvisional` are named exports of `src/occurrence.ts`; no inline discriminant in any other file | VERIFIED | All three exported from `occurrence.ts`; no `ecdysis_id != null`/`== null` or `is_provisional` inline discriminants in production code outside `occurrence.ts` (comments and type definitions excluded) |
| 4 | All existing Vitest tests pass; new unit tests cover `occIdFromRow`, `parseOccId`, and the three predicates | VERIFIED | 442 tests pass (0 failures); `occurrence.test.ts` has 24 tests across 6 describe blocks covering all exports including `isSpecimenId` |

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `occIdFromRow` returns correct prefixed string | `npm test -- src/tests/occurrence.test.ts` | 24/24 pass | PASS |
| `parseOccId` returns null for malformed inputs | Covered in test suite | 6 test cases in `parseOccId` describe block | PASS |
| `isSpecimenBacked` / `isSampleOnly` / `isProvisional` three-way taxonomy | Covered in test suite | 3+4+3 test cases | PASS |
| Full regression — no behavior change from refactor | `npm test` (full suite) | 442/442 pass | PASS |
| TypeScript validity | `npx tsc --noEmit` | Exit 0 | PASS |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No `TBD`, `FIXME`, `XXX`, placeholder returns, or stub patterns detected in modified files.

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TS-01 | 101-01, 101-02 | `occurrence.ts` owns ID construction and parsing; all caller files import from it | SATISFIED | `occIdFromRow`, `parseOccId` exported; all 6 callers import from `./occurrence.ts` |
| TS-02 | 101-01, 101-02 | `isSpecimenBacked`, `isSampleOnly`, `isProvisional` exported; inline discriminants replaced | SATISFIED | All 3 predicates exported; no inline `ecdysis_id != null` or `is_provisional` discriminants in production code |
| TS-03 | 101-01 | `occurrence.test.ts` covers all exports; `npm test` green | SATISFIED | 24 tests, 6 describe blocks; 442/442 pass |

---

## Human Verification Required

None. All phase criteria are verifiable programmatically.

---

## Deviations Noted (Not Gaps)

1. **bee-table.ts URL guard (auto-fixed during Task 3):** A `row.ecdysis_id != null` discriminant in the Ecdysis URL builder (not in the PATTERNS.md inventory) was caught by the Task 3 grep gate and replaced with `isSpecimenBacked(row)` in commit `26b69be`. This was a correct Rule 1 auto-fix, not a gap.

2. **features.ts double-cast:** `obj as OccurrenceRow` was rejected by TypeScript; executor used `obj as unknown as OccurrenceRow` (idiomatic for SQLite row objects). Semantically equivalent.

3. **`npm run build` skipped:** The build command fails in all worktrees due to missing `public/data/species.json` (pipeline-generated artifact absent in dev checkout). This is a pre-existing condition unrelated to this phase. `tsc --noEmit` and `npm test` — the authoritative type and behavior gates — both pass cleanly.

4. **ROADMAP SC#1/#2 use double-quoted form:** The greps `grep -r '"ecdysis:"' src/` and `grep -r '"inat:"' src/` return empty rather than "only `src/occurrence.ts`". This is better than specified: the double-quoted form was never used anywhere in the codebase; `occurrence.ts` uses template literals (`` ecdysis:${...} ``) and single-quoted string literals (`'ecdysis:'`). The intent of the success criteria — that no file other than `occurrence.ts` constructs prefixed IDs — is fully satisfied.

---

## Gaps Summary

No gaps. All 7 truths verified, all artifacts substantive and wired, all ROADMAP success criteria satisfied, tests green, TypeScript clean.

---

_Verified: 2026-05-18T17:20:00Z_
_Verifier: Claude (gsd-verifier)_
