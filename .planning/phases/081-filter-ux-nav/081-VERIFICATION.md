---
phase: 81-filter-ux-nav
verified: 2026-05-04T15:15:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Browse /species/ in dev server; click a family in the SSR'd taxon tree"
    expected: "Tree expands; non-matching branches mute (opacity 0.35) but remain visible; URL gains ?fam=<Name>"
    why_human: "Visual mute-not-hide behavior (NAV-04) and SSR-decorate Lit upgrade are runtime/visual; programmatic check confirms class toggling but not perceived UX"
  - test: "Toggle a county checkbox in <bee-species-filter>; observe cards"
    expected: "Cards with zero records under filter mute (opacity 0.35), not hidden; per-card '.count-badge' updates to filtered N; breadcrumb pill appears above cards; URL gains ?county=<Name>"
    why_human: "End-to-end filter UX (FILT-04, FILT-06) requires real browser fetch of seasonality.json + filteredCount propagation; integration tests cover units but not perceived flow"
  - test: "Apply a filter combo that excludes every species (e.g. months 1-2 in summer-only fixture)"
    expected: "Empty state ('No species match these filters. [Clear filters]') becomes visible; Clear filters button resets state and URL"
    why_human: "FILT-05/07 visual empty-state flow; integration test asserts attribute toggle but not user perception"
  - test: "Click 'View N occurrences →' on a species card"
    expected: "Navigate to / (SPA) with both taxon and taxonRank=species params; SPA filters to that species"
    why_human: "LINK-01/02 cross-route deep-link is verified by round-trip test, but actual SPA filter resolution is a runtime behavior in the other route"
  - test: "Verify <seasonality-viz> renders bars on cards with n>=5 records and text fallback for sparse species"
    expected: "Inline SVG with 12 bars, axis labels J F M A M J J A S O N D, season-band tints; sparse species show 'N records, May–June' style fallback"
    why_human: "VIZ-02/03 visual rendering; unit tests assert DOM nodes but not perceived chart"
  - test: "Browser back/forward after a filter change"
    expected: "URL state restored; cards re-mute/un-mute accordingly via popstate handler"
    why_human: "URL-state debounce + popstate restoration is a runtime navigation behavior"
---

# Phase 81: Filter UX & Nav Verification Report

**Phase Goal:** Volunteers can browse the species list via a hierarchical taxon tree, narrow by geography and month, see seasonality at a glance, and deep-link any species into the existing SPA pre-filtered.

**Verified:** 2026-05-04
**Status:** human_needed (5/5 truths VERIFIED programmatically; visual/runtime UX requires human validation)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| #   | Truth                                                                                                                                                                                       | Status     | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `<bee-taxon-nav>` SSR'd nested `<details>`/`<ul>` tree (family→species), expand-on-click, subgenus skip when 'null'-only, mute-not-hide on filter, taxon-selected event, URL update         | ✓ VERIFIED | `src/species/bee-taxon-nav.ts` (104 lines) light-DOM, no `render()` override; `_includes/taxon-tree.njk` (111 lines) recursive macro emits SSR tree with `data-taxon`/`data-rank`; `_site/species/index.html` contains `<bee-taxon-nav>` (2446 markers); `bee-taxon-nav.test.ts` covers NAV-01..05 (mute-not-hide assertion verifies `display !== 'none'`); coordinator pushes `_activeTaxonPath` to nav (PLAN-05 truth, commit b95d9c4). Subgenus-skip rule baked into `taxon-tree.njk`. |
| 2   | `<bee-species-filter>` county/ecoregion multi-selects + month-range; URL params disjoint from SPA (`fam,subf,tribe,gen,subg,county,ecor,m0,m1`); muted cards + filtered N badge + breadcrumb + empty state + Clear filters | ✓ VERIFIED | `src/species/bee-species-filter.ts` (145 lines) renders `<details>` popovers + month inputs + `filter-changed` event; `src/species/url-state.ts` (68 lines) round-trips disjoint param namespace, NO import from SPA url-state; `bee-species-page.ts` `_renderBreadcrumb()`, `_toggleEmptyState()`, `_clearFilters()`, `_pushUrlState()` all present; integration tests `bee-species-page.test.ts` cover FILT-04/05/06/07 + URL round-trip. `species-url-state.test.ts` (9 cases) GREEN. |
| 3   | `<seasonality-viz>` inline SVG via Lit `svg` template, no chart lib; n>=5 bars / n<5 text fallback; J F M A M J J A S O N D axis + 4 season-band tints; sample-size stars; pre-binned only (no KDE) | ✓ VERIFIED | `src/species/seasonality-viz.ts` (106 lines) imports `svg` tagged template; `seasonality-viz.test.ts` 9 cases GREEN incl. VIZ-04 source-regex no-kde/kernel; `band-winter/spring/summer/fall` classes present; `viz-fallback` p element present; star thresholds (20/50/100/1000) match spec. Coordinator computes pre-binned 12-vector via D-02 max() approximation and propagates via `viz.data` property. |
| 4   | Each card "View N occurrences →" link → `/?taxon=<name>&taxonRank=<rank>` via shared `buildSpaTaxonLink()`; round-trip test asserts SPA `parseParams` resolves correctly; nav genus/family deep-links use rank=genus/family; LINK-04 header in `src/url-state.ts` | ✓ VERIFIED | `src/lib/spa-link.ts` (24 lines) exports `buildSpaTaxonLink` + `TaxonRank`; `spa-link.test.ts` round-trip GREEN; `src/url-state.ts` lines 1-15 contain LINK-04 header documenting `taxon`+`taxonRank` as stable interface; `_pages/species.njk` per-card `<a class="spa-link" href=".../?taxon=...&taxonRank=species">`; `_site/species/index.html` contains 974 `taxonRank=species` markers (>700 cards × deep-links). Tree macro emits `taxonRank=family`/`taxonRank=genus` per LINK-03. |
| 5   | `npm test` covers URL round-trip, `buildSpaTaxonLink` round-trip, taxon-nav mute-not-hide, filter empty-state, viz bar/fallback branches | ✓ VERIFIED | `VITEST_SKIP_BUILD=1 npm test`: **20 test files passed, 1 skipped, 300 tests passed, 4 skipped, 0 failed**. Test suite covers `spa-link.test.ts`, `species-url-state.test.ts`, `bee-taxon-nav.test.ts`, `bee-species-filter.test.ts`, `seasonality-viz.test.ts`, `bee-species-page.test.ts` (integration), and the existing `arch.test.ts` extended with the `src/lib/spa-link.ts` boundary block. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact                                | Expected                                                       | Status     | Details                                                                                |
| --------------------------------------- | -------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| `src/lib/spa-link.ts`                   | buildSpaTaxonLink + TaxonRank, zero imports                    | ✓ VERIFIED | 24 lines, exports both, no non-comment imports                                         |
| `src/species/url-state.ts`              | buildParams/parseParams disjoint from SPA                      | ✓ VERIFIED | 68 lines, no `../url-state` import, max() rationale comment present                    |
| `src/species/seasonality-cache.ts`      | loadSeasonality singleton                                      | ✓ VERIFIED | 18 lines, module-level Promise cache                                                   |
| `src/species/bee-taxon-nav.ts`          | Light-DOM Lit, no render(), willUpdate decorates, taxon-selected | ✓ VERIFIED | 104 lines, no render() defined; mute-class toggling; CustomEvent dispatch              |
| `src/species/bee-species-filter.ts`     | Light-DOM Lit, render() defined, filter-changed event          | ✓ VERIFIED | 145 lines, `<details>` popovers, month inputs, filter-changed dispatch                 |
| `src/species/seasonality-viz.ts`        | Light-DOM Lit, inline SVG, no kde/kernel                       | ✓ VERIFIED | 106 lines, imports `svg` template, season-bands, stars, no kde token                   |
| `src/species/bee-species-page.ts`       | Coordinator: URL parse, fetch, compute, propagate, breadcrumb, empty-state, _pushUrlState | ✓ VERIFIED | 393 lines, no render() override; `_pushUrlState`, `_onPopState`, `_renderBreadcrumb`, `_toggleEmptyState`, `_clearFilters`, D-02 max() comment, NAV-04 propagation |
| `src/species/bee-species-card.ts`       | filteredCount @property + willUpdate decorate (no render())    | ✓ VERIFIED | 88 lines; sentinel -1; willUpdate mutates .count-badge / .muted / .spa-link            |
| `_includes/taxon-tree.njk`              | Recursive Nunjucks macro                                       | ✓ VERIFIED | 111 lines; renderNode + renderTree; data-taxon/rank; LINK-03 hrefs                     |
| `_pages/species.njk`                    | SSR tree + per-card additive markup                            | ✓ VERIFIED | 39 lines; renderTree call; count-badge, seasonality-viz, spa-link with taxonRank, breadcrumb-pills, empty-state |
| `src/entries/species.ts`                | Side-effect imports for 3 new presenters                       | ✓ VERIFIED | 17 lines; imports bee-taxon-nav, bee-species-filter, seasonality-viz                   |

### Key Link Verification

| From                          | To                                | Via                                            | Status   | Details                                            |
| ----------------------------- | --------------------------------- | ---------------------------------------------- | -------- | -------------------------------------------------- |
| `_pages/species.njk`          | `_includes/taxon-tree.njk`        | `{% from "taxon-tree.njk" import renderTree %}` | ✓ WIRED  | Macro invoked above `<bee-species-page>`           |
| `bee-taxon-nav` SSR markup    | `bee-taxon-nav.ts willUpdate`     | `this.querySelectorAll('li[data-taxon]')`      | ✓ WIRED  | Decorate-SSR pattern; `_applyMuteClasses()`        |
| `bee-species-filter`          | `bee-species-page._onFilterChanged` | `addEventListener('filter-changed')`         | ✓ WIRED  | connectedCallback hookup                           |
| `bee-taxon-nav`               | `bee-species-page._onTaxonSelected` | `addEventListener('taxon-selected')`         | ✓ WIRED  | connectedCallback hookup                           |
| `bee-species-page` filteredCounts | `bee-species-card.filteredCount` | `card.filteredCount = newCount` (prop diff)  | ✓ WIRED  | `_computeAndPropagate()`; previousCounts diff      |
| `bee-species-page` slices     | `seasonality-viz.data`            | `viz.data = newSlices.get(name)`               | ✓ WIRED  | Per-card propagation                               |
| `_pages/species.njk` spa-link | `src/url-state.ts parseParams`    | Pre-baked `taxonRank=species` (LINK-01 fix)    | ✓ WIRED  | 974 markers in built `_site/species/index.html`    |
| `bee-species-page._activeTaxonPath` | `bee-taxon-nav.activeTaxonPath` | `nav.activeTaxonPath = [...]` (NAV-04 mute)  | ✓ WIRED  | `_computeAndPropagate()` final block (commit b95d9c4) |

### Behavioral Spot-Checks

| Behavior                                            | Command                                  | Result                                         | Status |
| --------------------------------------------------- | ---------------------------------------- | ---------------------------------------------- | ------ |
| Full Vitest suite passes                            | `VITEST_SKIP_BUILD=1 npm test`           | 20 files passed, 300 tests passed, 0 failed   | ✓ PASS |
| Build artifact has SSR'd taxon tree + deep-links   | `grep -c "taxonRank=species\|count-badge\|seasonality-viz\|bee-taxon-nav" _site/species/index.html` | 2446 markers (>2000 expected) | ✓ PASS |
| Phase 80 prototype-identity invariant on bee-species-card | `grep render() src/species/bee-species-card.ts` | No render() method | ✓ PASS |
| ARCH-04 boundary held                              | `npm test -- --run src/tests/arch.test.ts` | Part of full suite, passing                  | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description                                                   | Status      | Evidence                                                            |
| ----------- | ----------- | ------------------------------------------------------------- | ----------- | ------------------------------------------------------------------- |
| NAV-01      | 081-02      | Vertical left-rail tree, expand-on-click                      | ✓ SATISFIED | `taxon-tree.njk` recursive macro + `bee-taxon-nav.ts`; `_site` SSR  |
| NAV-02      | 081-02      | Subgenus level skipped when only 'null' key                   | ✓ SATISFIED | `taxon-tree.njk` keys-length check at level 4                       |
| NAV-03      | 081-02      | Click → `_activeTaxonPath` + URL update                       | ✓ SATISFIED | `taxon-selected` CustomEvent; coordinator `_onTaxonSelected`        |
| NAV-04      | 081-02      | Mute-not-hide (opacity 0.35), never display:none              | ✓ SATISFIED | `_applyMuteClasses()` + commit b95d9c4 propagation; test asserts `display !== 'none'` |
| NAV-05      | 081-02      | SSR'd nested `<details>`/`<ul>`, no-JS navigable              | ✓ SATISFIED | Eleventy macro emits SSR tree; bee-taxon-nav has no render() override |
| FILT-01     | 081-03      | County/ecoregion multi-selects + month-range                  | ✓ SATISFIED | `bee-species-filter.ts` `<details>` popovers + number inputs        |
| FILT-02     | 081-01      | Disjoint URL params (fam/subf/tribe/gen/subg/county/ecor/m0/m1) | ✓ SATISFIED | `src/species/url-state.ts buildParams` uses exact param names      |
| FILT-03     | 081-01      | Round-trip Vitest separate from SPA                            | ✓ SATISFIED | `species-url-state.test.ts` 9 cases GREEN                           |
| FILT-04     | 081-05      | Mute on zero filtered count + N records badge                 | ✓ SATISFIED | `bee-species-card.ts willUpdate` toggles .muted + badge text        |
| FILT-05     | 081-05      | Empty state when zero matches                                 | ✓ SATISFIED | `_toggleEmptyState()` checks `Math.max(...counts) === 0`            |
| FILT-06     | 081-05      | Breadcrumb pill row, dismissable                              | ✓ SATISFIED | `_renderBreadcrumb()` + `_onPillDismiss()`                          |
| FILT-07     | 081-05      | Clear filters resets all state and URL                        | ✓ SATISFIED | `_clearFilters()` + integration test                                |
| VIZ-01      | 081-04      | Inline SVG via Lit `svg` template, no chart lib               | ✓ SATISFIED | `seasonality-viz.ts` imports `svg` from lit; no chart lib import    |
| VIZ-02      | 081-04      | Bars when n>=5, fallback when n<5                             | ✓ SATISFIED | `total < 5` branch returns `<p class="viz-fallback">`               |
| VIZ-03      | 081-04      | Month axis + season bands                                     | ✓ SATISFIED | MONTH_LABELS const + 4 SEASON_BANDS classes                         |
| VIZ-04      | 081-04      | Pre-binned only, no KDE                                       | ✓ SATISFIED | Source-regex test rejects kde/kernel tokens                         |
| VIZ-05      | 081-04      | Star thresholds * 20-49 / ** 50-99 / *** 100-999 / **** 1000+ | ✓ SATISFIED | test.each on 4 thresholds passes                                    |
| LINK-01     | 081-01/05   | Card link → `/?taxon=...&taxonRank=species` via buildSpaTaxonLink | ✓ SATISFIED | spa-link.ts + species.njk fix; 974 markers in built HTML            |
| LINK-02     | 081-01      | Round-trip test: buildSpaTaxonLink → SPA parseParams           | ✓ SATISFIED | `spa-link.test.ts` round-trip GREEN                                 |
| LINK-03     | 081-02      | Genus/family deep-links use taxonRank=genus/family             | ✓ SATISFIED | `taxon-tree.njk` emits per-rank hrefs                               |
| LINK-04     | 081-01      | `src/url-state.ts` header documents stable contract           | ✓ SATISFIED | LINK-04 header lines 1-15 of `src/url-state.ts`                     |

**Coverage:** 21/21 requirement IDs SATISFIED. No orphaned IDs.

### Anti-Patterns Found

None blocking. The summary documents one auto-fix narrowing of a test scope and three pre-existing TS strictness items called out as out-of-scope (verified: those concern `seasonality-viz.ts:63` and `bee-taxon-nav.test.ts:8`, neither blocks the test suite).

### Human Verification Required

See frontmatter `human_verification` array. Six runtime/visual flows need human confirmation:

1. **Tree click + mute** — visually verify NAV-04 mute-not-hide
2. **County toggle + breadcrumb + URL** — end-to-end FILT-04/06
3. **Empty state + Clear filters** — FILT-05/07 visual flow
4. **Cross-route deep-link to SPA** — LINK-01/02 actual SPA filter resolution
5. **Seasonality viz rendering** — VIZ-02/03 perceived chart
6. **Browser back/forward** — popstate restoration

### Gaps Summary

No programmatic gaps. All five ROADMAP success criteria are evidenced by shipped artifacts, wiring, and a passing test suite (300 passed, 0 failed). All 21 requirement IDs are satisfied by the executed plans. The SUMMARY claims align with codebase state. The phase ships a functional /species/ page with filter UX; visual/runtime UX remains for human acceptance.

---

_Verified: 2026-05-04T15:15:00Z_
_Verifier: Claude (gsd-verifier)_
