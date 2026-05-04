---
phase: 81-filter-ux-nav
plan: 01
subsystem: species-page-foundation
tags: [url-state, spa-link, seasonality, arch, red-stubs]
requires: []
provides:
  - buildSpaTaxonLink (src/lib/spa-link.ts)
  - SpeciesPageState + buildParams/parseParams (src/species/url-state.ts)
  - loadSeasonality singleton (src/species/seasonality-cache.ts)
  - Wave 0 RED test stubs for plans 02..05
  - ARCH-04 boundary for src/lib/spa-link.ts
affects:
  - src/url-state.ts (LINK-04 header only — no behavior change)
  - src/tests/arch.test.ts (added describe block)
tech-stack:
  added: []
  patterns:
    - module-level fetch singleton (Pitfall #81-B)
    - disjoint URL contract namespace (D-06)
    - prepend-only header documentation (LINK-04)
key-files:
  created:
    - src/lib/spa-link.ts
    - src/species/url-state.ts
    - src/species/seasonality-cache.ts
    - src/tests/spa-link.test.ts
    - src/tests/species-url-state.test.ts
    - src/tests/bee-taxon-nav.test.ts
    - src/tests/bee-species-filter.test.ts
    - src/tests/seasonality-viz.test.ts
  modified:
    - src/url-state.ts (LINK-04 header inserted before existing import)
    - src/tests/arch.test.ts (ARCH-04 D-05 describe block appended)
decisions:
  - D-05 enforced via FORBIDDEN_FOR_LIB extension that bans `../url-state.ts` from src/lib/spa-link.ts to prevent transitive filter.ts pulls
  - D-06 disjoint URL namespace: species page uses fam/subf/tribe/gen/subg/county/ecor/m0/m1; shares zero code with SPA url-state.ts
  - D-02 max() approximation documented in src/species/url-state.ts header; refactor to sum is forbidden without revisiting CONTEXT.md
metrics:
  duration: ~3 minutes
  tasks_completed: 4
  files_created: 8
  files_modified: 2
  tests_added: 34 GREEN + 14 expected-RED (5 nav, 4 filter, 5 viz)
  completed: 2026-05-04
---

# Phase 81 Plan 01: Foundation (URL helpers, fetch singleton, Wave 0 RED stubs) Summary

**One-liner:** Shipped dependency-free Phase 81 foundation — `buildSpaTaxonLink` (LINK-04), disjoint species-page URL contract (D-06), `loadSeasonality` fetch singleton (Pitfall #81-B), plus five RED test files locking the Wave 0 surface area before any presenter is built.

## Tasks Completed

| Task | Name                                                                                       | Commit  |
| ---- | ------------------------------------------------------------------------------------------ | ------- |
| 1    | spa-link helper + LINK-04 contract header + round-trip tests (LINK-01..04)                 | 2b7d053 |
| 2    | species/url-state + seasonality-cache + 9 round-trip tests (FILT-02/03)                    | 81ef670 |
| 3    | Wave 0 RED stubs: bee-taxon-nav, bee-species-filter, seasonality-viz                       | d62a49e |
| 4    | arch.test.ts ARCH-04 D-05 describe block for src/lib/spa-link.ts                           | dcdf7b4 |

## Test Counts

**GREEN now (this plan):**
- `src/tests/spa-link.test.ts` — 5 tests (LINK-01..04)
- `src/tests/species-url-state.test.ts` — 9 tests (D-06, FILT-02, FILT-03)
- `src/tests/arch.test.ts` — 20 tests total (3 new for ARCH-04 D-05; 17 prior)

**Expected RED (turn GREEN in plans 02..05):**
- `src/tests/bee-taxon-nav.test.ts` — 5 tests (NAV-01..05) — Plan 03
- `src/tests/bee-species-filter.test.ts` — 4 tests (FILT-01, FILT-04..07) — Plan 04
- `src/tests/seasonality-viz.test.ts` — 9 tests including `test.each` 4 cases (VIZ-01..05) — Plan 04/05

All three RED files currently fail with module-not-found errors at the `await import('../species/<name>.ts')` call, exactly as designed.

## LINK-04 Header Insertion

A 14-line block was prepended to `src/url-state.ts` *before* the original
`import type { FilterState, CollectorEntry } from './filter.ts';` line.
The header documents the cross-route stable URL contract:
- BOTH `taxon` and `taxonRank` query params required.
- `parseParams` silently drops the taxon filter if either is missing.
- Cross-route deep-links from `/species/` MUST go through `buildSpaTaxonLink()`.

No behavior in `src/url-state.ts` was modified.

## ARCH-04 Extension Shape

Appended a third top-level `describe` block to `src/tests/arch.test.ts`:

```
describe('ARCH-04: src/lib/spa-link.ts boundary (D-05)', () => {
  const FORBIDDEN_FOR_LIB = [...FORBIDDEN, '../url-state.ts', '../url-state'];
  // 3 tests: file exists, no static-forbidden imports, no dynamic-forbidden imports
});
```

This re-uses the existing `STATIC_IMPORT_RE`, `DYNAMIC_IMPORT_RE`, `FORBIDDEN`,
`extractImports`, and `ROOT` constants from the prior file (defined at lines
22, 27, 46, 48, 72). The extension passes immediately because `src/lib/spa-link.ts`
contains zero non-comment imports.

## Verification Snapshot

```
$ npm test -- --run src/tests/spa-link.test.ts src/tests/species-url-state.test.ts src/tests/arch.test.ts
 Test Files  3 passed (3)
      Tests  34 passed (34)
```

## Deviations from Plan

None — plan executed exactly as written. The CSV ordering test for
ecoregions was already insertion-order safe via `.sort()` in `buildParams`,
and the round-trip survived `URLSearchParams` percent-encoding without
adjustment.

## Self-Check: PASSED

- src/lib/spa-link.ts — FOUND
- src/species/url-state.ts — FOUND
- src/species/seasonality-cache.ts — FOUND
- src/tests/spa-link.test.ts — FOUND
- src/tests/species-url-state.test.ts — FOUND
- src/tests/bee-taxon-nav.test.ts — FOUND
- src/tests/bee-species-filter.test.ts — FOUND
- src/tests/seasonality-viz.test.ts — FOUND
- Commits 2b7d053, 81ef670, d62a49e, dcdf7b4 — all FOUND in `git log`
