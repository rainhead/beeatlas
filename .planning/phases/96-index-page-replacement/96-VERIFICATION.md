---
phase: 96-index-page-replacement
verified: 2026-05-16T09:02:00Z
status: passed
score: 9/9 must-haves verified
overrides_applied: 0
re_verification: false
---

# Phase 96: Index Page Replacement Verification Report

**Phase Goal:** Replace the SPA-based `/species/` index page with a static family→genus→species index rendered server-side by Eleventy, fulfilling IDX-01..04 and URL-05.
**Verified:** 2026-05-16T09:02:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | IDX-01: `/species/` lists all species grouped by family, then by genus within each family | VERIFIED | `_pages/species.njk` uses `species.speciesList | groupby("family")` chained with `familyGroup | groupby("genus")`; `_site/species/index.html` contains 6 `.family-section` elements; `groupby("family")` and `groupby("genus")` both present |
| 2 | IDX-02: A type-to-filter text input narrows displayed genera and species as the user types | VERIFIED | `_pages/species.njk` has `<input type="search" id="species-filter">`; `src/entries/species-index.ts` wires `getElementById('species-filter')` and `addEventListener('input', ...)` with hide/show logic over `.family-section`, `.genus-row`, `li[data-name]` |
| 3 | IDX-03: Clicking a genus name navigates to `/species/{Genus}/` | VERIFIED | Template: `<a href="/species/{{ genus }}/">`. Built output: `href="/species/Agapostemon/"` confirmed present (grep count: 1) |
| 4 | IDX-04: Clicking a species name navigates to `/species/{Genus}/{specificEpithet}/` | VERIFIED | Template: `<a href="/species/{{ sp.slug }}/">`. Built output: `href="/species/Agapostemon/femoratus/"` confirmed present (grep count: 1) |
| 5 | URL-05: The old tree-nav + all-cards layout is completely replaced — `<bee-species-page>`, `<bee-species-filter>`, `<bee-taxon-nav>`, `<bee-species-card>` absent from `/species/` | VERIFIED | `_site/species/index.html` contains 0 occurrences of `bee-species-page`; all 8 monolith production files deleted from repo; no production-code references to deleted symbols remain |
| 6 | D-01: All 8 monolith production files deleted | VERIFIED | All 8 files confirmed absent: `src/entries/species.ts`, `src/species/bee-species-page.ts`, `bee-species-filter.ts`, `bee-species-card.ts`, `bee-taxon-nav.ts`, `url-state.ts`, `src/styles/species.css`, `_includes/taxon-tree.njk` |
| 7 | All 6 dedicated test files for deleted components deleted | VERIFIED | All 6 confirmed absent: `bee-species-page.test.ts`, `bee-species-filter.test.ts`, `bee-species-card.test.ts`, `bee-taxon-nav.test.ts`, `species-url-state.test.ts`, `src/species/tests/a11y.test.ts` |
| 8 | `src/tests/arch.test.ts` asserts the new `species-index.ts` allowlist (not old `species.ts` allowlist) | VERIFIED | `grep -c "describe(" arch.test.ts` returns 3; `species-index.ts allowlist (IDX-02, Phase 96)` describe block present; PAGE-06 and `species.ts allowlist` blocks absent |
| 9 | `npm test`-visible test suite passes on the new contract (species-index.test.ts, page-scaffold.test.ts, build-output.test.ts, arch.test.ts) | VERIFIED | `VITEST_SKIP_BUILD=1 npx vitest run` on all 4 files: 19 passed, 22 skipped (build-output skipped by design under SKIP_BUILD), 0 failed |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `_pages/species.njk` | New static index template with groupby family/genus, filter input, links | VERIFIED | Contains `groupby("family")`, `groupby("genus")`, `id="species-filter"`, `type="search"`, `href="/species/{{ genus }}/"`, `href="/species/{{ sp.slug }}/"`, `<script type="module" src="/src/entries/species-index.ts">`. Uses `species.speciesList` (CR-01 fix applied, commit `0f54a8d`) |
| `src/entries/species-index.ts` | Thin JS entry with input event listener, hidden-toggle filter logic | VERIFIED | Imports `'../index.css'`, `'../styles/taxon-pages.css'`, `'../bee-header.ts'`; wires `getElementById('species-filter')`, `addEventListener('input', ...)`, triple-loop toggling `li.hidden`, `row.hidden`, `section.hidden`; genus-name matching via `row.dataset.genus` |
| `src/styles/taxon-pages.css` | `.species-index` modifier rules for filter input + section spacing | VERIFIED | Contains `.species-index #species-filter`, `.species-index .family-section`, `.species-index .genus-row` rules (4 occurrences of `.species-index` in file) |
| `src/tests/species-index.test.ts` | Unit test contract for template and entry (IDX-01..04, URL-05) | VERIFIED | Two describe blocks, 8 tests total; asserts `groupby("family")`, `groupby("genus")`, `id="species-filter"`, `type="search"`, `getElementById('species-filter')`, `addEventListener('input'`, `.family-section`, `.genus-row`, `hidden`, absence of `bee-species-page`, `bee-species-card` |
| `src/tests/arch.test.ts` | Updated architectural test with species-index.ts allowlist | VERIFIED | 3 describe blocks; new `species-index.ts allowlist (IDX-02, Phase 96)` block with ALLOWED set and FORBIDDEN_PATTERNS; PAGE-06 block and `species.ts allowlist` block deleted |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `_pages/species.njk` | `src/entries/species-index.ts` | `<script type="module" src="/src/entries/species-index.ts">` | WIRED | Exact match confirmed; Vite emits `_site/assets/species/index-C6EakvHX.js` |
| `_pages/species.njk` | `_data/species.js` (speciesList) | Nunjucks `species.speciesList \| groupby("family")` | WIRED | `species.speciesList` is exported from `_data/species.js` line 227; filtered to `specific_epithet !== null` entries (line 97) |
| `src/entries/species-index.ts` | `#species-filter` input + DOM | `getElementById` + `querySelectorAll` | WIRED | `getElementById('species-filter')`, `querySelectorAll<HTMLElement>('.family-section')`, `.genus-row`, `li[data-name]`, `li.hidden`, `row.hidden`, `section.hidden` all present in 39-line implementation |
| `src/tests/arch.test.ts` | `src/entries/species-index.ts` | `readFileSync` + allowlist assertion | WIRED | `ENTRY_FILE_INDEX = resolve(ROOT, 'src/entries/species-index.ts')` reads the file and asserts only allowed imports |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `_pages/species.njk` | `species.speciesList` | `_data/species.js` line 97: `flat.filter(s => s.specific_epithet !== null)` reading from `public/data/species.json` | Yes — real DB-backed JSON file, filtered to actual species entries | FLOWING |

Note: CR-01 fix (commit `0f54a8d`) corrected the data source from `species.flat` (which included 103 genus-level records) to `species.speciesList` (species-only). The built output at `_site/species/index.html` reflects the corrected data.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Built index page has 6 family sections | `grep -c "class=\"family-section\"" _site/species/index.html` | 6 | PASS |
| Built index page has species-filter input | `grep -c "id=\"species-filter\"" _site/species/index.html` | 1 | PASS |
| Built index page has Agapostemon genus link | `grep -c "href=\"/species/Agapostemon/\"" _site/species/index.html` | 1 | PASS |
| Built index page has Agapostemon/femoratus species link | `grep -c "href=\"/species/Agapostemon/femoratus/\"" _site/species/index.html` | 1 | PASS |
| Built index page has no bee-species-page | `grep -c "bee-species-page" _site/species/index.html` | 0 | PASS |
| species-index chunk emitted with no mapboxgl | `_site/assets/species/index-C6EakvHX.js` exists; `grep "mapboxgl" ...` = 0 | chunk exists, no mapboxgl | PASS |
| Unit tests (19 tests, 3 files) pass | `VITEST_SKIP_BUILD=1 npx vitest run species-index.test.ts page-scaffold.test.ts arch.test.ts` | 19/19 passed | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| URL-05 | 96-01, 96-02, 96-03 | Old SPA all-cards layout replaced entirely | SATISFIED | `_site/species/index.html` has 0 `<bee-species-page>` refs; all 8 monolith files deleted; `_pages/species.njk` has 0 `bee-species-(page\|card\|filter)\|bee-taxon-nav\|taxon-tree` matches |
| IDX-01 | 96-01, 96-02 | `/species/` lists species grouped by family then genus | SATISFIED | Template uses chained `groupby("family")` + `groupby("genus")`; built output has 6 `.family-section` elements |
| IDX-02 | 96-01, 96-02, 96-03 | Type-to-filter input narrows display in real time | SATISFIED | `id="species-filter"` `type="search"` in template; full filter logic in `species-index.ts`; arch.test.ts guards import allowlist |
| IDX-03 | 96-01, 96-02 | Clicking genus navigates to `/species/{Genus}/` | SATISFIED | `href="/species/{{ genus }}/"` in template; `href="/species/Agapostemon/"` confirmed in build output |
| IDX-04 | 96-01, 96-02 | Clicking species navigates to `/species/{Genus}/{epithet}/` | SATISFIED | `href="/species/{{ sp.slug }}/"` in template; `href="/species/Agapostemon/femoratus/"` confirmed in build output |

All 5 requirements are satisfied. No orphaned requirements found — REQUIREMENTS.md maps all 5 IDs exclusively to Phase 96.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `_pages/species.njk` | 10 | `placeholder="Filter genera and species…"` | Info | HTML `placeholder` attribute on filter input — not a code anti-pattern; correct usage of the HTML attribute |
| `src/styles/taxon-pages.css` | 92 | `.photo-placeholder` class name | Info | Class name contains "placeholder" but is a legitimate CSS class for the photo fallback UI — not a stub indicator |

No debt markers (TBD, FIXME, XXX), no empty implementations, no hardcoded empty state in data-rendering paths.

**Note on pre-existing failures:** The SUMMARY documents two pre-existing test failures unrelated to Phase 96: `frontend/src/tests/bee-sidebar.test.ts` (orphaned from Phase 74 hoist) and `src/tests/build-output.test.ts` race condition with `validate-species.test.ts`. Both predate Phase 96 and are out of scope.

### Human Verification Required

None. All observable truths are verifiable programmatically via source inspection and build output analysis.

### Gaps Summary

No gaps. All 9 must-haves are verified against actual codebase evidence:

- The new Nunjucks template exists and is substantive (32 lines of real template logic, not a placeholder)
- The JS entry exists and is substantive (39 lines with complete filter logic)
- The CSS rules are appended and correctly scoped
- The data flow is real (`species.speciesList` from `_data/species.js` backed by `species.json`)
- All monolith files are deleted — confirmed absent from disk
- The arch.test.ts surgical update is correct — 3 describe blocks, new allowlist present, dead blocks removed
- The test suite passes 19/19 unit assertions
- The build output confirms IDX-01..04 and URL-05 in the rendered HTML

The CR-01 fix (iterating `species.speciesList` instead of `species.flat`) was correctly applied post-review, eliminating the 103 genus-level record defect. This fix is load-bearing for IDX-01/IDX-04 correctness and is confirmed in the current template source.

---

_Verified: 2026-05-16T09:02:00Z_
_Verifier: Claude (gsd-verifier)_
