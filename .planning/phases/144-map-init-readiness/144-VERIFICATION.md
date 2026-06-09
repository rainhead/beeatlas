---
phase: 144-map-init-readiness
verified: 2026-06-09T16:27:59Z
status: passed
score: 5/5
overrides_applied: 0
---

# Phase 144: Map-Init Readiness Verification Report

**Phase Goal:** The recurring map-init race class is retired structurally. Legacy-taxon URL resolution awaits `taxaReady` instead of storing-and-polling; a single `intendedFilterActive` gate (backed by a dedicated `_filterResolving` flag, not `_pendingLegacyTaxon`) governs hide-all + URL suppression; and the first occurrence-layer render is a pure function of `(filteredGeoJSON, intendedFilterActive)` gated on `mapReady` — so an unfiltered flash or a stranded legacy-taxon URL is no longer structurally possible, not merely timed-around.
**Verified:** 2026-06-09T16:27:59Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Legacy-taxon URL resolution awaits `taxaReady`; no store-and-poll dance | VERIFIED | `_awaitLegacyTaxonResolution` at line 465: sets `_filterResolving=true`, `await taxaReady` (line 468), then calls `_resolveLegacyTaxon`; `_pendingLegacyTaxon` fully removed; `_resolveLegacyTaxon` has no `cache.size === 0` re-store branch; `_loadSummaryFromSQLite` no longer calls `_resolveLegacyTaxon` |
| 2 | A single `intendedFilterActive` getter feeds both hide-all and URL suppression; `_filterResolving` is the dedicated flag | VERIFIED | Getter at line 96: `isFilterActive(this._filterState) \|\| this._filterResolving`; URL suppression in `_replaceUrlState` (line 660) and `_pushUrlStateDebounced` (line 670) both gate on `this._filterResolving` (not `_pendingLegacyTaxon`); `_filterResolving` is `@state()` (line 70) per WR-01/02/03 fix |
| 3 | `<bee-map>` render decision is pure function of `(filteredGeoJSON, intendedFilterActive)` gated on map load lifecycle; unfiltered-flash path removed structurally | VERIFIED | `_applyVisibleIds` branches on `this.intendedFilterActive` (line 580): when true, `filteredGeoJSON ?? { type: 'FeatureCollection', features: [] }` (line 585); load handler triggers apply when `visibleIds !== null \|\| intendedFilterActive` (line 458); `filteredGeoJSON !== null` is no longer the hide-all branch criterion |
| 4 | State ownership preserved: `<bee-atlas>` owns all reactive state; `_filterGuard` and ID-format prefixes unregressed; `_pendingLegacyTaxon` removed entirely | VERIFIED | `_filterGuard = makeStaleGuard(...)` at line 81; `bee-map.intendedFilterActive` declared `@property` (line 59) — input-only, no `this.intendedFilterActive =` assignment in method bodies; `ecdysis:`/`inat:`/`inat_obs:`/`checklist:` prefixes in `occurrence.ts`; `_pendingLegacyTaxon` absent from `bee-atlas.ts` |
| 5 | `bee-atlas-legacy-taxon.test.ts` passes; tests cover await-resolution path and `intendedFilterActive` gate; `npm test` is green; typecheck clean | VERIFIED | `npx vitest run src/tests/bee-atlas-legacy-taxon.test.ts src/tests/bee-map.test.ts src/tests/bee-atlas.test.ts`: 148/148 passed; full suite `npx vitest run`: 653/653 passed; `npx tsc --noEmit`: exit 0 |

**Score:** 5/5 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/bee-atlas.ts` | `await taxaReady` path + `_filterResolving` `@state` field + `intendedFilterActive` getter | VERIFIED | All three present; `_pendingLegacyTaxon` removed; `markTaxaReady()` in `finally` block (CR-01 fix) |
| `src/bee-map.ts` | `intendedFilterActive @property` + `_applyVisibleIds` as pure function | VERIFIED | `@property({ attribute: false }) intendedFilterActive = false;` at line 59; `_applyVisibleIds` branches on `intendedFilterActive` |
| `src/tests/bee-atlas-legacy-taxon.test.ts` | Regression net covering await path and `intendedFilterActive` gate; CR-01 coverage | VERIFIED | 13 tests total including 2 CR-01 regression tests for empty-DB and catch paths; all pass |
| `src/tests/bee-map.test.ts` | Render-decision + mapReady-gating coverage | VERIFIED | 6 new tests in `144-02:` describe block; all pass |
| `src/tests/bee-atlas.test.ts` | Wiring + pre-seed removal coverage | VERIFIED | 5 new tests in `144-02:` describe block; all pass |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `bee-atlas.ts firstUpdated` | `_awaitLegacyTaxonResolution` | call when `initialParams.pendingLegacyTaxon` present | WIRED | Line 278 |
| `_awaitLegacyTaxonResolution` | `taxaReady` | `await taxaReady` | WIRED | Line 468 |
| `bee-atlas.ts render()` | `<bee-map>.intendedFilterActive` | Lit property binding `.intendedFilterActive=${this.intendedFilterActive}` | WIRED | Line 180 |
| `bee-map.ts _applyVisibleIds` | `this.intendedFilterActive + filteredGeoJSON ?? empty` | pure-function source-data decision | WIRED | Lines 580–608 |
| `bee-map.ts updated()` | `_applyVisibleIds` | `changedProperties.has('intendedFilterActive')` guard | WIRED | Line 299 |
| `_loadSummaryFromSQLite` | `markTaxaReady()` | `finally` block (CR-01 fix) | WIRED | Lines 445–455; empty-DB early return and catch path now also reach `markTaxaReady` |
| `_replaceUrlState` / `_pushUrlStateDebounced` | `_filterResolving` | `if (this._filterResolving) return;` | WIRED | Lines 660, 670 |

---

## CR-01 Fix Verification (Critical Regression Closed)

The REVIEW.md identified that `markTaxaReady()` was unreachable on the empty-DB early return and `catch` paths, which would strand `taxaReady` permanently and leave the map permanently hidden for legacy-taxon users on empty-DB or error paths.

**Fix confirmed in `src/bee-atlas.ts`:**
- `markTaxaReady()` is at line 455 inside the `finally` block (lines 445–456)
- The `finally` block runs unconditionally: after the happy path (cache built), after the empty-DB early-return path (which exits the try block), and after the `catch` path
- Comment at lines 447–454 explicitly documents this guarantee
- Two regression tests in `bee-atlas-legacy-taxon.test.ts` (lines 213–238) verify both paths: empty-DB exec (no callback rows) and error-throwing exec both call `markTaxaReady`; both tests pass

**WR-01/02/03 fix confirmed:**
- `_filterResolving` is declared `@state() private _filterResolving = false;` (line 70)
- Comment at lines 64–70 explains why `@state` is required: the getter is bound into `<bee-map>`, so Lit must schedule a re-render on mutation

---

## Data-Flow Trace

Not applicable for this phase — no new data pipelines or data-rendering components introduced. The refactor rewires existing async coordination paths.

---

## Behavioral Spot-Checks

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| `intendedFilterActive` returns `true` when `_filterResolving=true` | Code read at `bee-atlas.ts:96–98` | `isFilterActive(_filterState) \|\| _filterResolving` — `_filterResolving=true` → returns `true` | PASS |
| `_applyVisibleIds` renders empty when `intendedFilterActive=true` and `filteredGeoJSON=null` | Code read at `bee-map.ts:580–598` | `filteredGeoJSON ?? { features: [] }` → empty collection rendered | PASS |
| `markTaxaReady()` reaches `finally` block on error path | Test at `bee-atlas-legacy-taxon.test.ts:226–238` | Test passes: `getDB` throws, `markTaxaReady` is called | PASS |
| Full suite passes | `npx vitest run` | 653/653 tests pass | PASS |
| TypeScript clean | `npx tsc --noEmit` | Exit 0, no output | PASS |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/bee-atlas.ts` | 1079 | `console.log('[BENCHMARK] data-loaded...')` | Info | Debug artifact left on production boot path (IN-03 from REVIEW.md — deferred to `.planning/todos/pending/`) |
| `src/bee-atlas.ts` | 74 | `_selectionDrawnGeneration` written but never read | Info | Dead code (IN-01 from REVIEW.md — deferred) |

No blockers. The two info items are pre-existing and explicitly deferred in the REVIEW.md resolution entry.

---

## Requirements Coverage

| Success Criterion | Status | Evidence |
|-------------------|--------|----------|
| SC-1: Legacy-taxon URL resolution awaits `taxaReady`; store-and-poll removed | SATISFIED | `_awaitLegacyTaxonResolution` + `await taxaReady` at line 468; `_pendingLegacyTaxon` removed |
| SC-2: `_filterResolving` dedicated flag; single `intendedFilterActive` getter; both hide-all and URL suppression read it | SATISFIED | `@state() _filterResolving` at line 70; getter at line 96; `_replaceUrlState`/`_pushUrlStateDebounced` gate on `_filterResolving` |
| SC-3: `<bee-map>` render = f(filteredGeoJSON, intendedFilterActive) gated on map load; unfiltered-flash removed structurally | SATISFIED | `_applyVisibleIds` branches on `intendedFilterActive`; load handler gates apply on `visibleIds !== null \|\| intendedFilterActive` |
| SC-4: State ownership preserved; `_filterQueryGeneration` / style-cache bypass / ID-format prefixes unregressed | SATISFIED | `_filterGuard` via `makeStaleGuard` present; `bee-map.intendedFilterActive` is input-only `@property`; `ecdysis:`/`inat:`/`inat_obs:`/`checklist:` prefixes unchanged in `occurrence.ts` |
| SC-5: `bee-atlas-legacy-taxon.test.ts` green; tests cover await path and `intendedFilterActive` gate; `npm test` green; typecheck clean | SATISFIED | 653/653 tests pass; `tsc --noEmit` exit 0 |

---

## Human Verification Required

None. All success criteria are verifiable programmatically. The behavioral change (no unfiltered flash, no URL strand on legacy-taxon deep links) is structural — enforced by the code paths verified above rather than by timing. No visual or UX behavior was altered beyond what the structural fix implies.

---

## Gaps Summary

No gaps. All five success criteria are verified. The CR-01 critical regression (unreachable `markTaxaReady` on empty-DB and error paths) identified during the code review was fixed in commit `01760e5` and is confirmed present: `markTaxaReady()` lives in the `finally` block and is covered by two regression tests that both pass.

---

_Verified: 2026-06-09T16:27:59Z_
_Verifier: Claude (gsd-verifier)_
