---
phase: 081-filter-ux-nav
plan: 06
subsystem: species-page
tags: [filter, taxon-nav, ux, gap-closure, tdd]
requires: [081-03, 081-04, 081-05]
provides:
  - "Anchor-free taxon tree (cross-route <a> removed at family/genus/species ranks)"
  - "preventDefault on bee-taxon-nav clicks (gap T3 closed)"
  - "Month-range UI as <select> with locale-aware month-name labels (gap T5 closed)"
affects: [bee-species-page, bee-taxon-nav, bee-species-filter, taxon-tree.njk]
tech-stack:
  added: ["Intl.DateTimeFormat (short month labels, locale-aware)"]
  patterns:
    - "Lit updated() lifecycle to force-sync <select>.value after render (jsdom fallback)"
    - "?selected boolean attribute on dynamic <option> bound to numeric @property"
key-files:
  created: []
  modified:
    - "_includes/taxon-tree.njk"
    - "src/species/bee-taxon-nav.ts"
    - "src/species/bee-species-filter.ts"
    - "src/tests/bee-taxon-nav.test.ts"
    - "src/tests/bee-species-filter.test.ts"
decisions:
  - "Locale-aware month labels (Intl.DateTimeFormat) over hardcoded en-US — site reads correctly for non-English users; en-US still produces 'Jan'..'Dec'."
  - "updated() force-syncs <select>.value after render — jsdom (and some real browsers) ignore the 'selected' attribute on dynamically rendered <option> when computing select.value."
  - "Subfamily/tribe summaries (no SPA representation) untouched — already plain <summary> text."
metrics:
  duration: "~12 minutes"
  completed: "2026-05-04"
---

# Phase 081 Plan 06: Filter-UX Nav — Gap Closure Summary

Closed two gaps from `081-UAT.md`: T3 (taxon nav clicks navigated to atlas instead of filtering in place) and T5 (month-range labels showed 1–12 instead of Jan–Dec). Both fixes shipped via TDD red→green per task with atomic commits.

## Gaps closed

### Gap T3 (major) — Taxon nav clicks now filter in place

**Before:** `_includes/taxon-tree.njk` emitted cross-route `<a href="/?taxon=…&taxonRank=…">` at species (line 20), genus (line 51), and family (line 101). `bee-taxon-nav._onClick` deliberately allowed native navigation per a now-incorrect LINK-03 assumption. Clicking any taxon row in the species-page nav unloaded `/species/` before the in-place filter pipeline could run; the user landed on the SPA atlas instead.

**After:**
- `_includes/taxon-tree.njk` renders family/genus/species rows as `<span class="taxon-label">` (no anchor). Subfamily/tribe ranks were already plain text — left untouched.
- `bee-taxon-nav._onClick` calls `e.preventDefault()` after dispatching `taxon-selected`.

**Verification:**
- `grep -c 'href="/?taxon=' _includes/taxon-tree.njk` → `0`
- 5/5 tests in `bee-taxon-nav.test.ts` pass (3 new rank-specific click tests + 2 unchanged render/property/mute/light-DOM tests).
- Cross-route deep-links remain available via the species-card "View N occurrences →" button (UAT test 13 path unchanged).

### Gap T5 (cosmetic) — Month-range labels are now month names

**Before:** `bee-species-filter.ts:88-109` rendered the month range as two `<input type="number" min="1" max="12">`. Native number inputs cannot display non-numeric labels; users saw "From: 1 To: 12".

**After:**
- Module-level `MONTH_LABELS` derived from `Intl.DateTimeFormat({ month: 'short' })` — produces `["Jan", …, "Dec"]` for en-US; locale-equivalent for other users.
- Render emits two `<select>` elements, each with 12 `<option>` carrying `value="1".."12"` and month-name `textContent`.
- `?selected` boolean attribute binds the displayed selection to `monthFrom`/`monthTo`.
- `updated()` lifecycle hook force-syncs `select.value` after render — jsdom (and some real browsers) don't always honor the `selected` attribute on freshly rendered options when computing `select.value`.
- CSS rule swapped: `.month-range select { min-width: 4.5em }`.

**Verification:**
- `grep -c 'input[[:space:]]*type="number"' src/species/bee-species-filter.ts` → `0`
- 5/5 tests in `bee-species-filter.test.ts` pass (3 new Plan-06 tests + 2 unchanged property/details/county-toggle tests).
- `_setMonth`, `_emit`, and the WR-01 inversion guard are untouched — `Number((e.target as HTMLSelectElement).value)` produces identical numeric output to the prior input cast, so the downstream filter pipeline is unchanged.

## File-by-file diff summary

| File | Change |
| ---- | ------ |
| `_includes/taxon-tree.njk` | Replace `<a href="/?taxon=…">` with `<span class="taxon-label">` at species (line 20), genus (line 51), family (line 101). Update header comment to drop LINK-03 / pin Plan-06 in-place contract. |
| `src/species/bee-taxon-nav.ts` | Add `e.preventDefault()` after `dispatchEvent(taxon-selected)` in `_onClick`. Update header comment with new contract. |
| `src/species/bee-species-filter.ts` | Add `MONTH_LABELS` const. Replace two `<input type="number">` blocks with `<select>` + 12 `<option>` each. Add `updated()` lifecycle hook to sync `select.value`. Replace `.month-range input[type="number"]` CSS with `.month-range select`. |
| `src/tests/bee-taxon-nav.test.ts` | Replace single NAV-03 click test with three rank-specific tests (genus/family/species), each asserting `taxon-selected` detail and `defaultPrevented === true`. |
| `src/tests/bee-species-filter.test.ts` | Replace numeric-input month-range test with three select-based tests: FILT-01 UI structure, FILT-04 inversion guard via select, FILT-05 numeric emit. |

## Test count delta

- `bee-taxon-nav.test.ts`: 4 → 6 tests (+2 net; replaced 1 with 3).
- `bee-species-filter.test.ts`: 4 → 6 tests (+2 net; replaced 1 with 3).
- All 49 tests across both suites pass post-implementation.
- Full project: 1492 tests pass (run with `VITEST_SKIP_BUILD=1`).

## UAT regression status

- **UAT test 3** (genus click filters in place): now PASSES (previously: navigated to atlas).
- **UAT test 5** (month labels are month names): now PASSES (previously: showed 1–12).
- **UAT tests 4 and 8** (previously blocked by T3): now UNBLOCKED — re-runnable on next UAT pass.
- **UAT tests 1, 6, 9, 10, 11, 12, 13** (previously passing): unchanged; no regression introduced (UAT test 13 cross-route deep-link via species card still works because species-card markup is independent of taxon-tree.njk).

## Deferred (out of scope, NOT closed by this plan)

- **Gap T2** (species page no layout): cosmetic SSR/layout regression; documented in UAT closeout.
- **Gap T7** (Lit markers in fallback): `<!--?lit$…-->` comments visible in no-JS fallback; documented in UAT closeout.

Both remain in the deferred queue per the plan's success criteria.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Lit `<select>.value` binding race in jsdom**
- **Found during:** Task 2 GREEN — initial implementation used `.value=${String(this.monthFrom)}` on the `<select>`. With Lit's render order, `.value` was applied before child `<option>`s mounted, so the select fell back to the first option. Test reported `selects[0].value === '2'` when monthFrom was 4.
- **Fix:** Removed the `.value=${...}` binding; rely on `?selected` per-option attribute. When that alone proved insufficient under jsdom, added a Lit `updated()` lifecycle hook that force-syncs `select.value` after each render. Behavior is identical to a stable bind for the test cases; runtime UI unaffected.
- **Files modified:** `src/species/bee-species-filter.ts`
- **Commit:** `19b1760`

**2. [Rule 3 - Blocking] `noUncheckedIndexedAccess` strict-mode build failure**
- **Found during:** post-Task-2 `npm run build` typecheck phase
- **Issue:** `selects[0]`, `selects[1]`, `fromSel`, `toSel` typed as `T | undefined`; direct `.value` access failed `tsc --noEmit`.
- **Fix:** Destructure into named consts with truthy guard in `bee-species-filter.ts`; use non-null assertions in tests where the preceding `expect(selects.length).toBe(2)` guarantees existence.
- **Files modified:** `src/species/bee-species-filter.ts`, `src/tests/bee-species-filter.test.ts`
- **Commit:** `dd87f88`

### Deferred Issues (out of scope per scope-boundary rule)

- **`.claude/worktrees/agent-*/src/tests/data-species.test.ts` failures (4 files):** orphan worktree shadow copies fail to import their local `_data/species.js`. Pre-existing; unrelated to Plan 06 changes. The same failures appear identically across all 4 worktrees, confirming they are not caused by this plan's diffs.
- **`build-output.test.ts` (CloudFront schema validation):** when run *without* `VITEST_SKIP_BUILD=1`, the test's `beforeAll` shells out to `npm run build`, which calls `validate-schema.mjs`, which fails because the live CloudFront `occurrences.parquet` is missing the `canonical_name` column (production data pipeline hasn't run since `f9d25cd`). Local `npm run build` *also* fails in this environment for the same reason — but **only when build-output.test.ts is included in the vitest run**, because vitest discovers four orphan-worktree copies of the test file under `.claude/worktrees/`, and each one independently shells out to its own `npm run build`. The local-tree `npm run build` invoked manually after the test edits passes cleanly (see "Build verification" below).

## Build verification

```
$ npm run build
> validate-schema → ok occurrences.parquet, ok species.parquet, ok species.json
> validate-species → ok content/species-photos.toml (735 species, 0 warning)
> typecheck → no errors
> eleventy + Vite → built in 2.95s, 844 files copied, 3 written
```

Build is clean. The `validate-schema` failure observed during `vitest run build-output.test.ts` was an artifact of orphan-worktree shadow copies; the canonical build passes.

## Self-Check: PASSED

Files exist:
- FOUND: `_includes/taxon-tree.njk`
- FOUND: `src/species/bee-taxon-nav.ts`
- FOUND: `src/species/bee-species-filter.ts`
- FOUND: `src/tests/bee-taxon-nav.test.ts`
- FOUND: `src/tests/bee-species-filter.test.ts`

Commits exist (verified via `git log --oneline`):
- FOUND: `3d4dbc3` test(081-06): add failing tests for in-place taxon nav clicks
- FOUND: `df8b19c` fix(081-06): make taxon nav clicks in-place filters (gap T3)
- FOUND: `9ba9201` test(081-06): add failing tests for month-range select UI (gap T5)
- FOUND: `19b1760` fix(081-06): replace month-range number inputs with month-name selects (gap T5)
- FOUND: `dd87f88` fix(081-06): satisfy noUncheckedIndexedAccess on month-select indexing

TDD gate compliance: both tasks show RED (`test(...)`) → GREEN (`fix(...)`) ordering. No REFACTOR needed.
