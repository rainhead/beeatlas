---
phase: 81-filter-ux-nav
plan: 05
subsystem: species-page
tags: [filter-ux, coordinator, url-state, ssr, lit, phase-81]
requires:
  - 81-01  # url-state.ts, seasonality-cache.ts
  - 81-02  # bee-taxon-nav (SSR macro + Lit decorator)
  - 81-03  # bee-species-filter
  - 81-04  # seasonality-viz
provides:
  - filteredCount @property on <bee-species-card>
  - <bee-species-page> coordinator wiring (URL parse, seasonality fetch, compute, propagate, breadcrumb, empty state, _pushUrlState)
  - per-card SSR markup (count-badge, seasonality-viz, spa-link)
  - LINK-01 fix (taxonRank=species on every species deep link)
affects:
  - src/species/bee-species-card.ts
  - src/species/bee-species-page.ts
  - src/entries/species.ts
  - _pages/species.njk
  - src/tests/arch.test.ts
  - src/tests/bee-species-page.test.ts
tech-stack:
  patterns:
    - lit-willupdate-decorate-ssr  # Pitfall #81-A — extend SSR DOM via willUpdate + querySelector, never override render()
    - url-state-pushstate-debounce  # mirrors src/bee-atlas.ts:477-499 pattern (replaceState immediate + 500ms debounced pushState)
    - seasonality-singleton-fetch   # Pitfall #81-B — module-level Promise cache for /data/seasonality.json
    - lit-prop-diff-optimization    # Pitfall #8 — only set card.filteredCount when value changed
key-files:
  modified:
    - src/species/bee-species-card.ts
    - src/species/bee-species-page.ts
    - src/entries/species.ts
    - _pages/species.njk
    - src/tests/arch.test.ts
    - src/tests/bee-species-page.test.ts
decisions:
  - D-02 max() OR-approximation kept; refactor to sum explicitly forbidden via in-code comment
  - Phase 80 prototype-identity invariant on <bee-species-card> preserved (no render() override; willUpdate decorates)
  - <bee-taxon-nav> emitted by Plan 02 SSR macro lives ABOVE <bee-species-page> in DOM; coordinator pushes activeTaxonPath via document.querySelector fallback
metrics:
  duration: ~30 min
  completed: 2026-05-04
---

# Phase 81 Plan 05: Filter UX & Nav Wave 3 Wiring Summary

Wired the Phase 81 components into a working /species/ filter UX: URL-state hydration, seasonality.json fetch singleton, per-card filteredCount compute and propagation, breadcrumb pill row, empty state, clear-filters reset, popstate restoration, and incidental LINK-01 fix (taxonRank=species on 974 SSR'd hrefs).

## Files Modified

| File                                  | Change                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/species/bee-species-card.ts`     | Added `filteredCount = -1` @property + willUpdate hook decorating .count-badge / .muted / .spa-link children. `:host(.muted)` opacity 0.35 style. |
| `src/species/bee-species-page.ts`     | Full coordinator rewrite: URL parse, seasonality fetch await, filteredCount Map compute (D-02 max), propagation to cards + per-card seasonality-viz, NAV-04 activeTaxonPath push, _pushUrlState, popstate, breadcrumb pill row, empty state, clear-filters. |
| `src/entries/species.ts`              | Added side-effect imports: `bee-taxon-nav.ts`, `bee-species-filter.ts`, `seasonality-viz.ts`.                 |
| `_pages/species.njk`                  | Added `<span class="count-badge">`, `<seasonality-viz>` per card; replaced "Open in atlas" with `<a class="spa-link">` carrying `taxonRank=species` (LINK-01 fix); added `<bee-species-filter>` with JSON-encoded data attributes; added `.breadcrumb-pills` and `.empty-state` placeholder hosts. |
| `src/tests/arch.test.ts`              | Extended PAGE-04 ALLOWED set with the three new presenters (with and without `.ts`).                          |
| `src/tests/bee-species-page.test.ts`  | Replaced Phase 80 RED null-default state-shape contract with 7 integration tests covering FILT-04, FILT-05, FILT-06, FILT-07, URL round-trip, prototype-identity, and LINK-01 SSR HTML check. |

## Commits

| Hash      | Message                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------ |
| `7536602` | feat(081-05): extend bee-species-card with filteredCount + willUpdate decorate                          |
| `b3db6d9` | feat(081-05): wire bee-species-page coordinator (URL state, compute, breadcrumb, empty state)           |
| `8920aa8` | feat(081-05): wire species entry imports + extend ARCH-04 ALLOWED set                                   |
| `2e850ba` | feat(081-05): per-card SSR markup + LINK-01 fix in species.njk                                          |
| `b813503` | test(081-05): integration tests for FILT-04..07 + LINK-01 SSR check                                     |

(Pre-existing on base branch: `b95d9c4 fix(081-05): propagate _activeTaxonPath to <bee-taxon-nav> for NAV-04 mute` — that commit only added the truth bullet to the PLAN; the runtime wiring shipped here in `b3db6d9`.)

## Pitfall Mitigations Landed

- **#81-A (decorate-not-render):** `<bee-species-card>` extends behavior via `willUpdate(changed)` + `this.querySelector(...)`. The class still has NO `render()` method on its prototype, so `bee-species-card.test.ts:11-13` prototype-identity assertion stays GREEN. Same pattern applied to `<bee-species-page>`.
- **#81-B (singleton fetch):** Coordinator awaits `loadSeasonality()` (the module-level Promise cache from Plan 01) on connect. Multiple page-internal connects would share the same Promise.
- **#81-D (sentinel default):** `bee-species-card.filteredCount` defaults to `-1`. The `willUpdate` hook short-circuits when the value is still `-1`, preventing the initial "0 records" flash across 735 SSR'd cards before the seasonality fetch resolves.
- **Pitfall #8 (Lit prop-diff optimization):** Coordinator's `_previousCounts` Map ensures `card.filteredCount = newCount` is only assigned when the value actually changed.
- **Critical pitfall #6 (checklist-only species):** Species in `species.json` but missing from `seasonality.json` keep their SSR'd `occurrence_count` when no filter is active (sentinel `-1` is left untouched), and are forced to `0` (muted) when ANY filter is active. Matches CONTEXT D-01 contract.

## RED → GREEN Transitions

| File                                       | Before                                            | After                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/tests/arch.test.ts`                   | RED: ALLOWED set rejected new presenters          | GREEN: ALLOWED set extended; PAGE-04 + ARCH-04 + PAGE-06 all pass (32 cases)                                                 |
| `src/tests/bee-species-card.test.ts`       | GREEN baseline (Phase 80)                         | STILL GREEN: prototype-identity + light-DOM root assertions pass (Phase 80 invariant intact across the willUpdate addition)  |
| `src/tests/bee-species-page.test.ts`       | RED: 1 obsolete null-default state-shape contract | REPLACED with 7 GREEN integration tests covering FILT-04, FILT-05, FILT-06, FILT-07, URL round-trip, prototype-identity, LINK-01 SSR HTML |

Full suite (with `VITEST_SKIP_BUILD=1` to bypass the pre-existing `validate-species` × `build-output` race documented in PROJECT.md): **300 passed | 4 skipped | 0 failed**.

## D-02 max() Approximation — Rationale Comment Landed

`src/species/bee-species-page.ts` lines ~190-200:
> `seasonality.json carries no crossed county×ecoregion slices, so the per-month max() is a deduplicating proxy for OR. A record in King county that ALSO falls in Puget Lowland appears once in 'county:King' and once in 'ecoregion_l3:...'; max() avoids double-counting in the common case but can mis-count when both sets contribute non-trivially. Exact OR would require crossed slices from a Phase 78 pipeline change — explicitly deferred. Do NOT refactor into a sum.`

Same comment stub also lives in `src/species/url-state.ts` (Plan 01) — the rationale is now in two places by design: anyone reaching for the compute logic finds it next to the math, anyone reaching for the URL contract finds it next to the schema.

## LINK-01 Latent Bug Fix

Old `_pages/species.njk:24`:
```njk
<a href="/?taxon={{ sp.scientificName | urlencode }}">Open in atlas</a>
```

New `_pages/species.njk:34`:
```njk
<a class="spa-link" href="/?taxon={{ sp.scientificName | urlencode }}&taxonRank=species">View {{ sp.occurrence_count }} occurrences →</a>
```

The old form rendered without `taxonRank=species`, which made the SPA's `parseParams` fall back to family-level taxon resolution and surface unrelated species. Fixed incidentally per plan instructions.

## Build Artifact (`_site/species/index.html`)

Verified after `npx eleventy` (validate-schema bypassed — pre-existing CloudFront schema drift, unrelated):

| Marker                              | Count | Expected   | Status |
| ----------------------------------- | ----- | ---------- | ------ |
| `taxonRank=species`                 | 974   | ≥ 700      | PASS   |
| `count-badge`                       | 735   | ≥ 700      | PASS   |
| `<seasonality-viz></seasonality-viz>` | 735 | ≥ 700      | PASS   |
| `breadcrumb-pills`                  | 1     | ≥ 1        | PASS   |
| `<bee-taxon-nav>`                   | 1     | ≥ 1 (NAV-05) | PASS |

(`taxonRank=species` count 974 > card count 735 because the count includes occurrences inside the SSR'd `<bee-taxon-nav>` tree's leaf links per Plan 02.)

## ARCH-04 Boundary

Held — `npm test -- --run src/tests/arch.test.ts` exits 0 (32 cases, all green). `bee-species-page.ts` imports only `./url-state.ts` and `./seasonality-cache.ts` (both clean) plus `lit`. No imports from `../url-state.ts`, `../filter.ts`, `../bee-map.ts`, `../bee-atlas.ts`, `mapbox-gl`, or `wa-sqlite`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FILT-04 test "no filter active, cards not muted" needed scope narrowing**
- **Found during:** Task 5 (integration tests)
- **Issue:** The test fixture's "Rare specieus" entry has `_total: [0,…]` (all zeros). When no filter is active, the coordinator computes its filteredCount from `_total` → 0 → card gets `.muted` class (correct behavior per spec). The original test assertion that ALL cards stay unmuted was over-specified.
- **Fix:** Narrowed the assertion to species with non-zero seasonality data (Andrena, Bombus). The "Rare specieus" being muted with no filter is intentional — it has 0 records year-round even before filtering.
- **Files modified:** `src/tests/bee-species-page.test.ts`
- **Commit:** `b813503`

**2. [Rule 3 - Blocking] Strict TypeScript `combined[m]` possibly-undefined**
- **Found during:** Task 3 (after `tsc --noEmit`)
- **Issue:** `total += combined[m]` failed under strict noUncheckedIndexedAccess.
- **Fix:** Wrote `total += combined[m] ?? 0`. Conceptually safe because `combined` is always length 12 by construction; the `?? 0` is a TS narrowing nudge.
- **Files modified:** `src/species/bee-species-page.ts`
- **Commit:** `b3db6d9` (folded in)

**3. [Rule 3 - Blocking] Worktree missing public/data symlink**
- **Found during:** Task 2 build verification (`npx eleventy` couldn't load `_data/species.js`)
- **Issue:** Worktree didn't have `public/data/` (gitignored generated artifacts). Build fails without species.json + seasonality.json.
- **Fix:** `ln -s ../../../public/data` from the worktree's `public/` dir into the main checkout's `public/data/`. Symlink is local-only (gitignored); does not affect the commit graph or merge.
- **Files modified:** none (untracked symlink only)
- **Commit:** none

### Pre-Existing Issues NOT Fixed (Out of Scope)

- `src/species/seasonality-viz.ts:63` strict TS error — pre-existing on the base branch (`git stash` confirms). Tracked for a follow-up.
- `src/tests/bee-taxon-nav.test.ts:8` accesses `protected` `render` — pre-existing on the base branch.
- `scripts/validate-schema.mjs` failing against CloudFront's stale `occurrences.parquet` (missing `canonical_name`) — pipeline drift, unrelated.

## Deferred to Phase 82

PERF-01..06 deferred per CONTEXT — virtualization, IntersectionObserver-driven seasonality lazy-decorate, etc. Phase 81 ships the functional surface; Phase 82 owns the performance pass.

## Self-Check: PASSED

**Files exist:**
- src/species/bee-species-card.ts — FOUND
- src/species/bee-species-page.ts — FOUND
- src/entries/species.ts — FOUND
- _pages/species.njk — FOUND
- src/tests/arch.test.ts — FOUND
- src/tests/bee-species-page.test.ts — FOUND
- _site/species/index.html — FOUND (974 taxonRank=species, 735 count-badge)

**Commits exist on `worktree-agent-a351b75a`:**
- 7536602 — FOUND
- b3db6d9 — FOUND
- 8920aa8 — FOUND
- 2e850ba — FOUND
- b813503 — FOUND
