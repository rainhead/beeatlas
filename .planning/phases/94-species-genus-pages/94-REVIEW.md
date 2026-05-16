---
phase: 94-species-genus-pages
reviewed: 2026-05-15T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - _data/species.js
  - src/tests/data-species.test.ts
  - _pages/species-detail.njk
  - _pages/genus.njk
  - src/styles/taxon-pages.css
  - src/entries/taxon-page.ts
  - src/tests/build-output.test.ts
findings:
  critical: 1
  warning: 2
  info: 1
  total: 4
status: issues_found
---

# Phase 94: Code Review Report

**Reviewed:** 2026-05-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the species/genus page implementation: the Eleventy data module (`_data/species.js`), two Nunjucks page templates, a shared CSS file, the Vite entry point, and two Vitest test files. The data logic (HSL color assignment, tree build, species filtering) is correct and verified against live data. The test suite exercises the right contracts. One layout-affecting CSS bug is present, plus two test quality weaknesses worth fixing before this ships as a production feature.

## Critical Issues

### CR-01: Photo `<img>` receives no aspect-ratio CSS — `.taxon-page > img:first-of-type` never matches

**File:** `src/styles/taxon-pages.css:14`

**Issue:** The rule that constrains the photo hero to a 4:3 box uses a direct-child combinator (`>`):

```css
.taxon-page > img:first-of-type,
.taxon-page .photo-hero { … }
```

In both `_pages/species-detail.njk` and `_pages/genus.njk` every `<img>` sits inside `.media-grid`, which is itself a child of `.taxon-page`. Because the combinator requires the `<img>` to be an **immediate** child of `.taxon-page`, the rule never fires. Additionally, the `.photo-hero` class referenced in the selector is never applied to any element in either template. The result is that the photo hero has no `aspect-ratio`, no `max-height`, and no `object-fit: contain` — it will render at its intrinsic size (potentially very large) and create layout thrash before the image loads.

**Fix:** Either (a) remove the `>` combinator so the rule becomes a descendant selector, or (b) apply `.photo-hero` to the `<img>` in the template:

Option A — fix the CSS selector:
```css
/* was: .taxon-page > img:first-of-type */
.taxon-page .media-grid img:first-child,
.taxon-page .photo-hero {
  aspect-ratio: 4 / 3;
  max-height: 360px;
  width: 100%;
  object-fit: contain;
  background: var(--surface-subtle, #f5f5f5);
}
```

Option B — apply the class in `species-detail.njk` (line 20):
```html
<img class="photo-hero" loading="lazy" src="{{ p.src or p.url }}" alt="{{ p.caption or sp.scientificName }}">
```

## Warnings

### WR-01: `taxon-page` chunk test asserts existence but not distinctness from the species chunk

**File:** `src/tests/build-output.test.ts:113-124`

**Issue:** The test is titled "emits a taxon-page chunk **distinct from** species chunk" but never actually checks that the two chunks are different files. Both `findSpeciesChunk()` and `findTaxonChunk()` run independently; the test only verifies that `taxonChunk` is defined and `hasFlatTaxon || hasNestedTaxon` is true. A build that emits a single merged chunk containing both entry points would pass this test while violating the Pattern 4 requirement the test was written to enforce.

**Fix:** After resolving both chunks, assert their paths differ:
```ts
const speciesChunk = findSpeciesChunk();
const taxonChunk   = findTaxonChunk();
expect(taxonChunk,   'no taxon-page chunk emitted').toBeDefined();
expect(speciesChunk, 'no species chunk emitted').toBeDefined();
expect(taxonChunk, 'taxon-page and species chunks must be distinct files')
  .not.toBe(speciesChunk);
```

### WR-02: No assertion that the taxon-page chunk excludes heavy dependencies (e.g. mapboxgl)

**File:** `src/tests/build-output.test.ts:69-74`

**Issue:** `build-output.test.ts` verifies that the **species** chunk does not embed `mapboxgl` (line 69), but there is no equivalent assertion for the **taxon-page** chunk. The taxon-page entry (`src/entries/taxon-page.ts`) imports a strict subset of the species entry, but that invariant is untested. A future import added to `taxon-page.ts` could silently pull in a heavy dependency.

**Fix:** Add a parallel test mirroring the existing species-chunk assertion:
```ts
test('taxon-page chunk does NOT contain mapboxgl symbol (lean chunk invariant)', () => {
  const taxonChunk = findTaxonChunk();
  expect(taxonChunk).toBeDefined();
  const src = readFileSync(taxonChunk!, 'utf-8');
  expect(src).not.toMatch(/mapboxgl/);
});
```

## Info

### IN-01: `dump | safe` inline script is an unguarded injection point if pipeline data changes type

**File:** `_pages/species-detail.njk:36`

**Issue:**
```html
<script>document.getElementById('sviz').data = {{ sp.month_histogram | dump | safe }};</script>
```

`dump` serializes to JSON and `safe` disables Nunjucks auto-escaping. Today `month_histogram` is always a 12-element numeric array (verified in live data), so there is no injection risk. However, `safe` means any non-numeric value — including a string containing `</script>` — would break out of the script context. If the pipeline ever changes `month_histogram` to include strings (e.g., a schema migration error emits `null` or a string), this becomes an XSS vector.

**Fix:** Add a type guard in the pipeline export, or validate in the template by checking `sp.month_histogram` is an array before emitting. At minimum, document the invariant with a comment so reviewers know `safe` is intentional:
```html
{#- month_histogram is always number[12] from the pipeline; safe is intentional -#}
<script>document.getElementById('sviz').data = {{ sp.month_histogram | dump | safe }};</script>
```

---

_Reviewed: 2026-05-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
