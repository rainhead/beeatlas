---
phase: 94-species-genus-pages
plan: "03"
subsystem: test
tags: [vitest, build-output, eleventy, vite, end-to-end, checkpoint]

# Dependency graph
requires:
  - phase: 94-species-genus-pages
    plan: "01"
    provides: "speciesList (527 entries) and genusList (42 genus groups with hexColor per species)"
  - phase: 94-species-genus-pages
    plan: "02"
    provides: "species-detail.njk, genus.njk, taxon-pages.css, taxon-page.ts — the four template/entry files"
provides:
  - "src/tests/build-output.test.ts: 5 new test assertions (9 total) covering URL-01, URL-02, SPE-01..04, GEN-01..03, PIPE-01"
  - "Build-proven _site/species/ with 527 species pages and 42 genus pages"
  - "taxon-page-*.js Vite chunk verified via automated test"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "findTaxonChunk() helper mirrors findSpeciesChunk() with flat/nested layout detection"
    - "Build-output test auto-approves human-verify checkpoint when workflow.auto_advance=true"

key-files:
  created: []
  modified:
    - "src/tests/build-output.test.ts"

key-decisions:
  - "findTaxonChunk added as local helper inside describe block for TypeScript compliance (unused function would cause TS6133 error — used it in test 9)"
  - "Human-verify checkpoint auto-approved (workflow.auto_advance=true)"
  - "Pre-existing bee-sidebar.test.ts failure (missing bee-filter-controls.ts) logged as out-of-scope; not caused by Phase 94"

requirements-completed:
  - URL-01
  - URL-02
  - SPE-01
  - SPE-02
  - SPE-03
  - SPE-04
  - GEN-01
  - GEN-02
  - GEN-03
  - PIPE-01

# Metrics
duration: 4min
completed: 2026-05-16
---

# Phase 94 Plan 03: Build Verification & Human Checkpoint Summary

**End-to-end build verification with 5 new automated assertions confirms 527 species pages and 42 genus pages are correctly generated; all 10 Phase 94 requirements have automated test coverage**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-16T02:09:37Z
- **Completed:** 2026-05-16T02:14:15Z
- **Tasks:** 1 auto (+ 1 human-verify auto-approved)
- **Files modified:** 1

## Accomplishments

### Build Run Results

The `npm run build` inside the test `beforeAll` produced:
- **527 species pages** under `_site/species/{Genus}/{epithet}/index.html`
- **42 genus pages** under `_site/species/{Genus}/index.html`
- **`_site/assets/taxon-page-DkZgKdTP.js`** — flat layout Vite chunk (lean entry with only 4 imports)
- **`_site/assets/taxon-page-R8tN0XSq.css`** — taxon-pages CSS extracted into its own chunk
- Bundle size validation: `index-n8ICTfzv.js: 4.6 KB / 100.0 KB` — well within budget
- Build time: ~4.4s for Eleventy + 3.6s for Vite

### 5 New Test Assertions

| Test # | Name | Requirements Covered |
|--------|------|---------------------|
| 5 | emits _site/species/Agapostemon/femoratus/index.html | SPE-01, URL-01, PIPE-01 |
| 6 | every `<img>` on species page has loading="lazy" | PAGE-07 carry-forward, SPE-02/SPE-03 |
| 7 | emits _site/species/Agapostemon/index.html | GEN-01, URL-02, PIPE-01 |
| 8 | genus page links each species to its species page | GEN-03 |
| 9 | emits a taxon-page chunk distinct from species chunk | Pattern 4 |

Total: 9 tests (4 pre-existing + 5 new), all passing.

### Content Verification (Agapostemon femoratus — species page)

- `<em>Agapostemon femoratus</em>` — scientific name in italic
- `/data/species-maps/Agapostemon/femoratus.svg` — per-species SVG map URL
- `<seasonality-viz` — seasonality chart element present
- `View 91 occurrences on the atlas` — exact atlas link copy per UI-SPEC

### Content Verification (Agapostemon — genus page)

- `<em>Agapostemon</em>` — genus in italic h1
- `/data/species-maps/genus/Agapostemon.svg` — genus multi-color SVG map URL
- `class="species-list"` — species list container present
- `background: #d92626` — first species alphabetically by canonical_name (agapostemon angelicus) gets hue=0 (#d92626) per D-01/D-02

### Per-Requirement Automated Coverage Map (94-VALIDATION.md cross-check)

| Req ID | Automated Assertion | Test |
|--------|---------------------|------|
| URL-01 | `_site/species/Agapostemon/femoratus/index.html` exists | Test 5 |
| URL-02 | `_site/species/Agapostemon/index.html` exists | Test 7 |
| SPE-01 | Scientific name in `<em>` on species page | Test 5 |
| SPE-02 | Photo lookup pattern in template (Plan 02 Task 2) + `loading="lazy"` on img | Tests 5, 6 |
| SPE-03 | SVG map URL `/data/species-maps/Agapostemon/femoratus.svg` in HTML | Test 5 |
| SPE-04 | `<seasonality-viz` tag present in species HTML | Test 5 |
| GEN-01 | Genus page with species list (Plan 01 genusList + Plan 02 genus.njk) | Test 7 |
| GEN-02 | Genus SVG map URL in genus HTML | Test 7 |
| GEN-03 | Per-species link `href="/species/Agapostemon/femoratus/"` in genus HTML | Test 8 |
| PIPE-01 | 527 species pages + 42 genus pages emitted by Eleventy | Tests 5, 7 (page count assertions run post-build) |

PIPE-01 note: Phase 94 covers species + genus page generation portion only. Subgenus + tribe pages are Phase 95 scope.

### Human Checkpoint (Task 2)

**Status:** Auto-approved (`workflow.auto_advance=true`).

The checkpoint requested visual verification of:
1. Photo rendering (or grey placeholder) on species page
2. Seasonality chart (12 monthly bars) rendering in browser
3. Color swatch on genus page visually matching SVG dot colors (D-02 cross-check)
4. Mobile responsive layout (single-column collapse at <768px)
5. No JavaScript console errors on either page type
6. taxon-page chunk loading in Network tab

These behaviors cannot be verified by automated tests. With `auto_advance=true`, the checkpoint is auto-approved. If visual issues are found during actual user review, they should be reported for a Plan 04 gap closure via `/gsd-plan-phase --gaps`.

## Task Commits

1. **Task 1: Extend build-output.test.ts with 5 new assertions** — `8f74432`
2. **Task 2: Human-verify checkpoint** — auto-approved (no commit)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript TS6133: findTaxonChunk declared but not used**

- **Found during:** Task 1 (typecheck step of npm run build)
- **Issue:** The plan specified `findTaxonChunk` as a helper and test 5 as an inline reimplementation using `readdirSync` directly. TypeScript flags unused local functions with TS6133, causing the typecheck step to fail.
- **Fix:** Changed test 9 to use `findTaxonChunk()` as the primary chunk lookup, keeping the inline `readdirSync` checks for the dual flat/nested assertion. This satisfies both `expect(taxonChunk).toBeDefined()` (via helper) and `expect(hasFlatTaxon || hasNestedTaxon)` (explicit). TypeScript no longer flags the function as unused.
- **Files modified:** `src/tests/build-output.test.ts`
- **Commit:** Included in 8f74432

## Known Stubs

None — all assertions use actual build output values. The `View 91 occurrences on the atlas` assertion uses the verified occurrence count from RESEARCH.md; the `#d92626` swatch assertion uses the mathematically-verified HSL formula output.

## Threat Flags

No new security-relevant surface introduced. Plan's threat model mitigations T-94-01 through T-94-04 verified:
- T-94-01: `<seasonality-viz` tag confirmed present in species page HTML (test 5)
- T-94-02: Expected escaped content verified in HTML assertions
- T-94-03: Exact SVG paths asserted in HTML (no `..` path traversal possible with slug format)
- T-94-04: Test file adds no new files that could leak secrets

## Deferred Issues

**Pre-existing bee-sidebar.test.ts failure** — `frontend/src/tests/bee-sidebar.test.ts` fails because `../bee-filter-controls.ts` does not exist in the frontend source tree. This failure is present in both the worktree and main repo. It is out of scope for Phase 94.

## Self-Check

Files modified:
- `src/tests/build-output.test.ts`: YES (8f74432)

Commits:
- `8f74432` (Task 1): YES

Post-build artifacts:
- `_site/species/Agapostemon/femoratus/index.html`: YES
- `_site/species/Agapostemon/index.html`: YES
- Species pages count: 527 (>500) ✓
- Genus pages count: 42 (>40) ✓
- taxon-page chunk: 1 ✓

## Self-Check: PASSED
