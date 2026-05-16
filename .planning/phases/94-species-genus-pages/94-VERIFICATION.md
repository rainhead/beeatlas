---
phase: 94-species-genus-pages
verified: 2026-05-16T02:26:36Z
status: human_needed
score: 9/10 must-haves verified
overrides_applied: 0
gaps: []
deferred:
  - truth: "PIPE-01 full delivery: Eleventy generates one static page per species, genus, subgenus, and tribe"
    addressed_in: "Phase 95"
    evidence: "Phase 95 success criteria: 'Visiting /species/Andrena/Melandrena/ shows the subgenus page'; 'Visiting /species/tribe/Andrenini/ shows the tribe page'. Phase 94 plans explicitly scope PIPE-01 to species+genus only and mark subgenus+tribe as Phase 95 scope."
human_verification:
  - test: "Photo renders correctly on species page (CR-01: CSS photo hero rule may be broken)"
    expected: "Visiting /species/Agapostemon/femoratus/ shows a photo constrained to 4:3 aspect ratio with max-height 360px. If the photo loads at intrinsic size (potentially very large), CR-01 is a real defect: the CSS rule .taxon-page > img:first-of-type never matches because the img is inside .media-grid (not a direct child of .taxon-page). The .photo-hero class is defined in CSS but never applied in any template."
    why_human: "Cannot verify rendered visual layout programmatically. The DOM structure confirms the CSS rule cannot fire. Whether this causes a visible layout defect depends on the photo's intrinsic dimensions vs viewport."
  - test: "Seasonality chart renders 12 monthly bars in the browser"
    expected: "The <seasonality-viz> custom element renders a bar chart for all 12 months using the injected month_histogram data. For Agapostemon femoratus, the histogram is [0,0,0,4,18,7,33,14,5,10,0,0] — bars should be visible for Apr-Oct."
    why_human: "LitElement custom element rendering requires a live browser; not verifiable from static HTML assertions."
  - test: "Color swatches on genus page visually match SVG dot colors (Phase 93 D-02 cross-check)"
    expected: "On /species/Agapostemon/, the first species in the list (agapostemon angelicus alphabetically) shows a swatch of color #d92626. The SVG map at /data/species-maps/genus/Agapostemon.svg should have dots of that same color for Agapostemon angelicus occurrences. The alphabetical-by-canonical_name sort order must match between the JS _data/species.js producer and the Python species_maps.py producer."
    why_human: "Verifying swatch-to-SVG dot color equivalence requires visual inspection with both the genus page and SVG map visible simultaneously."
  - test: "Responsive layout collapses to single column on mobile (<768px)"
    expected: "At viewport width below 768px, the media-grid on both species and genus pages stacks to a single column (photo above map on species page; SVG map above species list on genus page)."
    why_human: "CSS @media behavior requires a live browser at reduced viewport width."
---

# Phase 94: Species & Genus Pages Verification Report

**Phase Goal:** Users can navigate to a dedicated static page for any species or genus and see occurrence data and photos
**Verified:** 2026-05-16T02:26:36Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `_data/species.js` exports `speciesList` (527 species-only entries) and `genusList` (42 genus groups) on the default export | VERIFIED | Node.js smoke check: `sl:527, gl:42`. `grep -c speciesList _data/species.js` = 3, `grep -c genusList` = 2. Default-export-only rule: 0 named exports, 1 default export. |
| 2 | `genusList` groups sorted alphabetically by genus; each group's `species[]` sorted by `canonical_name`; every species carries `hexColor` matching Phase 93 D-01 HSL formula | VERIFIED | All 8 Vitest tests in `data-species.test.ts` pass (8/8). Anchor: Agapostemon first species hexColor = `#d92626` (hue=0) confirmed by node smoke check and by test assertion. |
| 3 | `_pages/species-detail.njk` paginates over `species.speciesList` producing `/species/{Genus}/{epithet}/` pages | VERIFIED | Front matter: `data: species.speciesList`, `alias: sp`, `permalink: "/species/{{ sp.slug }}/"`. 527 pages confirmed in `_site/species/` (`find _site/species -mindepth 3 -name index.html | wc -l` = 527). |
| 4 | `_pages/genus.njk` paginates over `species.genusList` producing `/species/{Genus}/` pages | VERIFIED | Front matter: `data: species.genusList`, `alias: genus`, `permalink: "/species/{{ genus.genus }}/"`. 42 pages confirmed in `_site/species/` (`find _site/species -mindepth 2 -maxdepth 2 -name index.html | wc -l` = 42). |
| 5 | Species pages render: breadcrumb with linked genus, `<h1><em>{scientificName}</em></h1>`, photo (or placeholder), per-species SVG map, `<seasonality-viz>`, metadata row, atlas deep-link | VERIFIED (partial) | Generated `_site/species/Agapostemon/femoratus/index.html` contains: `<em>Agapostemon femoratus</em>`, `<seasonality-viz`, `/data/species-maps/Agapostemon/femoratus.svg`, `View 91 occurrences on the atlas →`, `91 records · 10 counties · 3 ecoregions`, `breadcrumb` nav, linked genus in breadcrumb. Photo loads from iNat URL (real photo, not placeholder). **Partial:** Photo hero CSS sizing may not apply — see CR-01 in Anti-Patterns. |
| 6 | Genus pages render: breadcrumb, `<h1><em>{Genus}</em></h1>`, `{speciesCount} species · {totalOccurrences} records` subheading, genus SVG map, species list with hex swatches | VERIFIED | Generated `_site/species/Agapostemon/index.html` contains: `<em>Agapostemon</em>`, `/data/species-maps/genus/Agapostemon.svg`, `class="species-list"`, `background: #d92626` (first species swatch). Template confirmed: speciesCount, totalOccurrences, swatch span with hexColor, count span. |
| 7 | Color swatches on genus page use the same alphabetical-by-canonical_name order as Phase 93 SVG (D-02 contract) | VERIFIED (automated) | `background: #d92626` confirmed in generated Agapostemon genus page HTML; hue=0 maps to first species alphabetically (agapostemon angelicus). SVG color index integrity requires human visual cross-check. |
| 8 | `src/entries/taxon-page.ts` imports exactly 4 modules (strict subset of `species.ts`); both templates reference it via `<script type="module">` | VERIFIED | `grep -c import src/entries/taxon-page.ts` = 4. Forbidden imports (bee-species-page, bee-species-card, bee-taxon-nav, bee-species-filter) = 0. Both templates contain `src="/src/entries/taxon-page.ts"`. Vite chunk `_site/assets/taxon-page-BONHvBt5.js` emitted. |
| 9 | `src/tests/build-output.test.ts` contains 9 tests (4 original + 5 new) covering all 10 phase requirements | VERIFIED | `grep -cE "^\s*test\(" src/tests/build-output.test.ts` = 9. New tests: Agapostemon femoratus content, lazy loading, Agapostemon genus content, genus→species link, taxon-page chunk. `findTaxonChunk` helper present. All 4 original tests intact. |
| 10 | Human reviewer confirms photo render, seasonality chart, swatch-to-SVG color match, and no JS console errors | NOT VERIFIED | Human checkpoint in Plan 03 Task 2 was **auto-approved** via `workflow.auto_advance=true`. No actual human reviewed the rendered pages. This truth remains unconfirmed. |

**Score:** 9/10 truths verified (automated); 1 truth requires human verification

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | PIPE-01 full scope: subgenus and tribe static pages | Phase 95 | Phase 95 goal: "Users can navigate to dedicated static pages for subgenera and tribes." Phase 94 plans explicitly scope PIPE-01 to species+genus only; subgenus+tribe are Phase 95 scope throughout all 3 plans and both summaries. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `_data/species.js` | speciesList, genusList, hslToHex on default export | VERIFIED | All keys present. 527 species, 42 genera. hslToHex local function only. No named exports. |
| `src/tests/data-species.test.ts` | 8 tests (3 original + 5 new) covering speciesList, genusList, hexColor | VERIFIED | 8 tests confirmed, all pass. |
| `_pages/species-detail.njk` | Eleventy pagination template for /species/{Genus}/{epithet}/ | VERIFIED | Exists, substantive (41 lines), pagination over speciesList, full content wired. |
| `_pages/genus.njk` | Eleventy pagination template for /species/{Genus}/ | VERIFIED | Exists, substantive (34 lines), pagination over genusList, full content wired. |
| `src/styles/taxon-pages.css` | .taxon-page, .species-list, .swatch, .breadcrumb, .photo-placeholder, @media 768px | VERIFIED | All required classes present. 104 lines. One CSS selector bug noted in Anti-Patterns (CR-01). |
| `src/entries/taxon-page.ts` | 4 side-effect imports; no heavy dependencies | VERIFIED | 4 imports confirmed. No forbidden imports. |
| `src/tests/build-output.test.ts` | 9 tests (4 + 5 new) covering taxon-page build artifacts | VERIFIED | 9 tests present, findTaxonChunk helper present. |
| `_site/species/Agapostemon/femoratus/index.html` | Generated species page with correct content | VERIFIED | File exists, contains all required content strings. |
| `_site/species/Agapostemon/index.html` | Generated genus page with species-list and swatch | VERIFIED | File exists, contains species-list, background #d92626. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `_pages/species-detail.njk` | `species.speciesList` | Eleventy pagination `data: species.speciesList` | WIRED | Pattern confirmed in front matter, 527 pages emitted |
| `_pages/genus.njk` | `species.genusList` | Eleventy pagination `data: species.genusList` | WIRED | Pattern confirmed in front matter, 42 pages emitted |
| `_pages/species-detail.njk` | `_data/photos.js` | `photos[sp.scientificName]` Nunjucks lookup | WIRED | `grep -c "photos\[sp\.scientificName\]"` = 1. Generated Agapostemon femoratus page shows iNat photo URL — lookup is working. |
| `_pages/species-detail.njk` | `<seasonality-viz>` data property | `{{ sp.month_histogram | dump | safe }}` inline script | WIRED | Generated HTML: `document.getElementById('sviz').data = [0,0,0,4,18,7,33,14,5,10,0,0];` — real data flowing. |
| Both templates | `src/entries/taxon-page.ts` | `<script type="module" src="/src/entries/taxon-page.ts">` | WIRED | Both templates confirmed, Vite chunk `taxon-page-BONHvBt5.js` emitted. |
| `src/tests/build-output.test.ts` | `_site/species/Agapostemon/femoratus/index.html` | `readFileSync` inside `describe.skipIf(SKIP_BUILD)` | WIRED | Pattern and file path confirmed in test line 78. Build output artifact confirmed at path. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `_pages/species-detail.njk` | `sp` (pagination alias) | `species.speciesList` from `_data/species.js` → `public/data/species.json` | Yes — 527 real species entries from pipeline JSON | FLOWING |
| `_pages/genus.njk` | `genus` (pagination alias) | `species.genusList` from `_data/species.js` | Yes — 42 real genus groupings computed from speciesList | FLOWING |
| `_pages/species-detail.njk` | `sp.month_histogram` | `public/data/species.json` field, injected via inline script | Yes — Agapostemon femoratus: `[0,0,0,4,18,7,33,14,5,10,0,0]` (real data) | FLOWING |
| `_pages/genus.njk` | `sp.hexColor` | Precomputed in `genusList` by `hslToHex` in `_data/species.js` | Yes — `#d92626` verified in generated HTML | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `speciesList.length = 527`, `genusList.length = 42`, `firstHex = #d92626` | `node --input-type=module -e "import s from '_data/species.js'; ..."` | `{"sl":527,"gl":42,"agSpeciesCount":3,"agTotal":185,"firstHex":"#d92626"}` | PASS |
| 527 species pages emitted | `find _site/species -mindepth 3 -name index.html | wc -l` | 527 | PASS |
| 42 genus pages emitted | `find _site/species -mindepth 2 -maxdepth 2 -name index.html | wc -l` | 42 | PASS |
| Agapostemon femoratus page has correct content | `grep` on `_site/species/Agapostemon/femoratus/index.html` | "View 91 occurrences on the atlas", seasonality-viz, SVG map URL all present | PASS |
| Agapostemon genus page has #d92626 swatch | `grep "background: #d92626" _site/species/Agapostemon/index.html` | Found | PASS |
| taxon-page Vite chunk emitted | `find _site/assets -name "taxon-page-*.js"` | `taxon-page-BONHvBt5.js` | PASS |
| All 8 data-species tests pass | `npm test -- src/tests/data-species.test.ts` | 8 passed (8) | PASS |

### Probe Execution

Not applicable — this phase has no `scripts/*/tests/probe-*.sh` probes.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| URL-01 | 94-02, 94-03 | Species page at `/species/{Genus}/{specificEpithet}/` | SATISFIED | 527 pages emitted; Agapostemon/femoratus/index.html confirmed |
| URL-02 | 94-02, 94-03 | Genus page at `/species/{Genus}/` | SATISFIED | 42 pages emitted; Agapostemon/index.html confirmed |
| SPE-01 | 94-02, 94-03 | Each species has a dedicated static page | SATISFIED | 527 pages, scientific name in `<em>` confirmed |
| SPE-02 | 94-02, 94-03 | Species page displays photo(s) or fallback | SATISFIED (automated) | Photo lookup `photos[sp.scientificName]` wired; placeholder `<div class="photo-placeholder">` present for fallback. Visual render needs human check. |
| SPE-03 | 94-02, 94-03 | Species page displays per-species SVG occurrence map | SATISFIED | SVG map URL `/data/species-maps/Agapostemon/femoratus.svg` in generated HTML |
| SPE-04 | 94-02, 94-03 | Species page displays seasonality visualization | SATISFIED (automated) | `<seasonality-viz` tag in generated HTML with real data injected. Browser render needs human check. |
| GEN-01 | 94-01, 94-02, 94-03 | Genus page lists all species with specimen counts | SATISFIED | species-list with `{{ sp.occurrence_count }} records` per species, confirmed in generated HTML |
| GEN-02 | 94-02, 94-03 | Genus page displays multi-color SVG map | SATISFIED (automated) | Genus SVG map URL in generated HTML; swatch colors require human D-02 cross-check |
| GEN-03 | 94-02, 94-03 | Each species entry on genus page links to its species page | SATISFIED | `href="/species/Agapostemon/femoratus/"` confirmed in generated genus page HTML |
| PIPE-01 | 94-01, 94-02, 94-03 | Eleventy generates pages per species and genus | PARTIAL (deferred) | Species+genus pages fully generated (527+42). Subgenus+tribe portions are Phase 95 scope — deferred above. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/styles/taxon-pages.css` | 14-21 | `.taxon-page > img:first-of-type` — direct-child combinator; the `<img>` is inside `.media-grid` (not a direct child of `.taxon-page`), so this rule never fires. `.photo-hero` class is defined in CSS selector but never applied to any element in either template. | WARNING | Photo hero has no `aspect-ratio`, `max-height`, or `object-fit: contain` from this rule. Photo may render at intrinsic size causing layout instability. Genus SVG map is unaffected (has inline `style="aspect-ratio: 15/8"`). Identified as CR-01 in 94-REVIEW.md. |
| `_data/species.js` | 8 | `placeholder shape -- Phase 81 (NAV-01) will harden` | INFO | Pre-existing comment about the `tree` export, not introduced by this phase. Not a stub for Phase 94 functionality. |

No `TBD`, `FIXME`, or `XXX` debt markers found in any file modified by this phase.

### Human Verification Required

#### 1. Photo hero layout — CSS selector bug (CR-01)

**Test:** Start `npm run dev`. Open `http://localhost:8080/species/Agapostemon/femoratus/` (a species confirmed to have a photo). Inspect the photo element in DevTools.

**Expected:** The photo should be constrained to a 4:3 aspect ratio with max-height 360px and object-fit contain.

**Actual risk:** The CSS rule `.taxon-page > img:first-of-type` requires a direct child relationship, but the `<img>` is inside `.media-grid` (grandchild). `.photo-hero` class is never applied in the template. If the photo has large intrinsic dimensions (common for iNat photos), it may render much larger than intended, pushing the SVG map and seasonality chart far down the page.

**Why human:** CSS layout defects require a live browser. The selector mismatch is confirmed by code inspection, but the visual impact depends on photo dimensions and browser rendering.

#### 2. Seasonality chart renders in browser

**Test:** On the species page opened above, confirm the `<seasonality-viz>` custom element renders 12 monthly bars.

**Expected:** 12 bars visible (Apr-Oct populated for Agapostemon femoratus), with existing season-color bands. The inline script `document.getElementById('sviz').data = [0,0,0,4,18,7,33,14,5,10,0,0];` is confirmed in the HTML.

**Why human:** LitElement custom elements require JavaScript execution in a live browser; static HTML inspection confirms the element tag and data injection but not actual rendering.

#### 3. Color swatch to SVG dot color cross-check (D-02)

**Test:** Open `http://localhost:8080/species/Agapostemon/`. Note the swatch color for the top species (Agapostemon angelicus — alphabetically first). Compare to dot colors in the SVG map displayed on the same page.

**Expected:** The swatch color for Agapostemon angelicus (#d92626) should match the color of its dots in the genus SVG map. Repeat for 1-2 more species in the list.

**Why human:** Verifying color equivalence between CSS swatch (HTML) and SVG path fill color requires visual side-by-side inspection.

#### 4. Mobile responsive collapse

**Test:** Resize browser to <768px on either the species or genus page.

**Expected:** The two-column grid collapses to single column (media-grid stacks vertically).

**Why human:** CSS media query behavior requires a live browser at specific viewport width.

### Gaps Summary

No automated gaps. The phase goal is structurally achieved: 527 species pages and 42 genus pages are generated with the correct URLs, content, and wiring.

One code quality issue (CR-01 CSS selector mismatch) and one deferred visual verification (human checkpoint was auto-approved, not human-approved) prevent a `passed` status.

CR-01 (CSS photo hero selector never fires) is a **WARNING** rather than a BLOCKER: the photo does still load (the `<img>` tag and URL are correct), the layout just may not apply the intended size constraints. Whether this constitutes a blocker depends on visual review — elevated to a human verification item.

---

_Verified: 2026-05-16T02:26:36Z_
_Verifier: Claude (gsd-verifier)_
