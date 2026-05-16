# Phase 96: Index Page Replacement - Research

**Researched:** 2026-05-15
**Domain:** Eleventy/Nunjucks static page replacement + thin JS filter entry
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Delete all old `/species/` monolith components in Phase 96 — no deferral.
  - `src/species/bee-species-page.ts`
  - `src/species/bee-species-filter.ts`
  - `src/species/url-state.ts`
  - `_includes/taxon-tree.njk`
  - `src/entries/species.ts`: remove dead imports; delete if fully empty after cleanup
  - `src/tests/arch.test.ts`: remove/update guards referencing deleted components
  - All dedicated test files for those components
  - Rationale: `noUnusedLocals` does not catch orphaned side-effect imports; Phase 96 is the final v3.6 phase and URL-05 says "replaced entirely."

### Claude's Discretion
- **Filter mechanism:** Thin JS entry module `src/entries/species-index.ts` wires an `<input>` listener and toggles CSS `hidden` on non-matching family sections, genus rows, and species rows. A new Lit coordinator is NOT warranted.
- **Index data structure:** `_data/species.js` already provides `species.flat`. May group at Nunjucks template time via `groupby` filter or add a `familyIndex` computed export.
- **`bee-species-card.ts` and `seasonality-viz.ts`:** Check whether any other template still references them. If not, delete in this phase.

### Deferred Ideas (OUT OF SCOPE)
- Cluster blobs selection visual feedback
- Hash-versioned parquet URLs
- Nightly run failure notification
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| URL-05 | The existing `/species/` all-cards single-page layout is replaced entirely by the new index page | Template replacement + all old component deletions confirmed below |
| IDX-01 | `/species/` lists all species grouped by family, then by genus within each family | `species.flat` has `family` and `genus` fields; Nunjucks `groupby` filter verified present |
| IDX-02 | A type-to-filter text input narrows displayed genera and species as user types | Thin JS entry pattern modeled on `taxon-page.ts`; UI-SPEC provides full interaction contract |
| IDX-03 | Clicking a genus name navigates to `/species/{Genus}/` | `species.flat` `slug` field format is `Genus/specificEpithet`; genus href derived as `/species/{{ sp.genus }}/` |
| IDX-04 | Clicking a species name navigates to `/species/{Genus}/{specificEpithet}/` | `slug` field = `Genus/specificEpithet` → href `/species/{{ sp.slug }}/` |
</phase_requirements>

## Summary

Phase 96 is a pure Eleventy template replacement with minimal JS. The existing `/species/` page (`_pages/species.njk`) runs a heavy multi-component Lit coordinator (`bee-species-page`, `bee-species-filter`, `bee-taxon-nav`, `bee-species-card`) driven by `src/entries/species.ts`. This entire stack is deleted and replaced with a single static Nunjucks template (`_pages/species.njk` rewritten) plus one thin JS entry (`src/entries/species-index.ts`) that wires a plain `input` event listener for the filter.

All data needed for the new index already exists in `_data/species.js` via `species.flat` (array with `family`, `genus`, `slug`, `scientificName`, `occurrence_count` per row). Nunjucks' built-in `groupby` filter (verified present) is sufficient for the family→genus two-level grouping at template render time — no new computed property needed in `_data/species.js`.

The deletion surface is larger than just `_pages/species.njk`. Five source files, one Nunjucks macro, five dedicated test files, one accessibility test file, and substantial blocks inside `src/tests/arch.test.ts` and `src/tests/build-output.test.ts` must all be deleted or updated. Crucially, `seasonality-viz.ts` is still needed by `_pages/species-detail.njk` via `src/entries/taxon-page.ts`, so it must NOT be deleted. `bee-taxon-nav.ts` is referenced only by `_includes/taxon-tree.njk` (which is deleted) and `src/entries/species.ts` (which is deleted); it can be deleted along with its test file.

**Primary recommendation:** Rewrite `_pages/species.njk` in place using the HTML structure from `96-UI-SPEC.md` verbatim. Delete the monolith components and their tests. Wire a new `src/entries/species-index.ts` modeled on `taxon-page.ts`. Update `arch.test.ts` and `build-output.test.ts` to replace old assertions with new index-page assertions.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Family→genus grouping | Build time (Nunjucks) | — | `groupby` runs at Eleventy build; zero JS payload |
| Species data delivery | Build time (`_data/species.js`) | — | `species.flat` already provides all needed fields |
| Type-to-filter input | Browser (thin JS entry) | — | Plain `input` event listener, no framework needed |
| Hidden-row visibility toggle | Browser (thin JS entry) | — | HTML `hidden` attribute toggled by the same entry |
| URL permalink | Eleventy frontmatter | — | `permalink: /species/index.html` preserved from old page |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Eleventy | (project version) | Static site generation + Nunjucks template execution | Already the project build system [VERIFIED: eleventy.config.js] |
| Nunjucks | (bundled with Eleventy 3.x) | Template language with built-in `groupby` filter | Already used for all taxon pages [VERIFIED: codebase grep] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `taxon-pages.css` | (project file) | Existing `.taxon-page` and `.species-list` styles | Reuse as-is; add `.species-index` modifier [VERIFIED: src/styles/taxon-pages.css] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Nunjucks `groupby` at template time | `familyIndex` computed in `_data/species.js` | Template-time groupby is simpler; no JS export change needed |
| Plain JS `hidden` toggling | Lit coordinator | Lit is overkill for a single string-match filter with no reactive state |

**Installation:** No new dependencies. All needed libraries are already project dependencies.

## Architecture Patterns

### System Architecture Diagram

```
species.json (public/data/)
       |
       v
_data/species.js  ──── species.flat (family, genus, slug, scientificName, occurrence_count)
       |
       v
_pages/species.njk ── Nunjucks groupby("family") → groupby("genus")
       |                 renders static HTML at build time
       v
_site/species/index.html
       |
       v (browser)
src/entries/species-index.ts
  ├── imports taxon-pages.css
  ├── attaches input event listener to #species-filter
  └── toggles HTML hidden attribute on .family-section / .genus-row / li
```

### Recommended Project Structure

No new directories. New/changed files:

```
_pages/species.njk              ← rewrite in-place (same permalink)
src/entries/species-index.ts    ← new (models taxon-page.ts)
src/styles/taxon-pages.css      ← add .species-index modifier + filter input styles

DELETE:
  src/entries/species.ts
  src/species/bee-species-page.ts
  src/species/bee-species-filter.ts
  src/species/bee-taxon-nav.ts
  src/species/url-state.ts
  _includes/taxon-tree.njk

UPDATE (partial deletion):
  src/tests/arch.test.ts           ← remove species-entry allowlist + PAGE-06 guards
  src/tests/build-output.test.ts   ← replace PAGE-01 / old species-page assertions

DELETE (test files):
  src/tests/bee-species-page.test.ts
  src/tests/bee-species-filter.test.ts
  src/tests/bee-species-card.test.ts
  src/tests/species-url-state.test.ts
  src/species/tests/a11y.test.ts

KEEP:
  src/species/bee-species-card.ts   ← not needed if only referenced by species.njk
  src/species/seasonality-viz.ts    ← KEEP: used by species-detail.njk via taxon-page.ts
  src/tests/bee-taxon-nav.test.ts   ← DELETE: only tests bee-taxon-nav which is deleted
  src/tests/seasonality-viz.test.ts ← KEEP: seasonality-viz is still used
```

### Pattern 1: Nunjucks groupby for Two-Level Grouping

**What:** Use Nunjucks built-in `groupby` filter chained twice — first by `family`, then by `genus` within each family group. This produces the family→genus hierarchy at build time.

**When to use:** Any time static grouping of a flat array is needed at template time.

**Example (from UI-SPEC.md, verified against Nunjucks docs):**
```nunjucks
{%- for family, familyGroup in species.flat | groupby("family") -%}
<section class="family-section" data-family="{{ family }}">
  <h2>{{ family }}</h2>
  {%- for genus, genusGroup in familyGroup | groupby("genus") -%}
  <div class="genus-row" data-genus="{{ genus }}">
    <a href="/species/{{ genus }}/"><em>{{ genus }}</em></a>
    <ul class="species-list">
      {%- for sp in genusGroup -%}
      <li data-name="{{ sp.scientificName | lower }}">
        <a href="/species/{{ sp.slug }}/"><em>{{ sp.scientificName }}</em></a>
        <span class="count">{{ sp.occurrence_count }} records</span>
      </li>
      {%- endfor -%}
    </ul>
  </div>
  {%- endfor -%}
</section>
{%- endfor -%}
```

**Note:** `species.flat` is already sorted alphabetically by `scientificName`. The `groupby` filter in Nunjucks does NOT re-sort; it preserves insertion order within groups. Since `flat` is alphabetical within each genus (all species of one genus are adjacent and sorted), the groupby output will have genera and species in alphabetical order. [VERIFIED: `_data/species.js` line 39-41]

### Pattern 2: Thin JS Entry for Filter Interactivity

**What:** A plain TypeScript module (no Lit, no custom element) that attaches one `input` event listener and walks the DOM to toggle `hidden` attributes.

**When to use:** Simple string-match visibility filter on a statically rendered list.

**Example (modeled on `taxon-page.ts` pattern):**
```typescript
// src/entries/species-index.ts
import '../index.css';
import '../styles/taxon-pages.css';
import '../bee-header.ts';

const input = document.getElementById('species-filter') as HTMLInputElement | null;
const emptyMsg = document.getElementById('filter-empty') as HTMLElement | null;

input?.addEventListener('input', () => {
  const query = input.value.trim().toLowerCase();
  let anyVisible = false;
  for (const section of document.querySelectorAll<HTMLElement>('.family-section')) {
    let sectionVisible = false;
    for (const row of section.querySelectorAll<HTMLElement>('.genus-row')) {
      const genusName = (row.dataset.genus ?? '').toLowerCase();
      let rowVisible = false;
      for (const li of row.querySelectorAll<HTMLElement>('li[data-name]')) {
        const match = !query || (li.dataset.name ?? '').includes(query) || genusName.includes(query);
        li.hidden = !match;
        if (match) rowVisible = true;
      }
      row.hidden = !rowVisible;
      if (rowVisible) sectionVisible = true;
    }
    section.hidden = !sectionVisible;
    if (sectionVisible) anyVisible = true;
  }
  if (emptyMsg) {
    emptyMsg.hidden = anyVisible || !query;
    const querySpan = document.getElementById('filter-query');
    if (querySpan) querySpan.textContent = input.value.trim();
  }
});
```

**Note:** The UI-SPEC specifies the genus name should also be matched against the query (not just `li.dataset.name`). The genus name is available as `row.dataset.genus`. [VERIFIED: 96-UI-SPEC.md interaction contract]

### Pattern 3: arch.test.ts Updates After Deletion

**What:** The three `describe` blocks in `arch.test.ts` will all need to be removed or substantially revised after the monolith is deleted.

**Blocks to remove or replace:**
1. `ARCH-04: src/species boundary (PAGE-08)` — the ARCH-04 contract (no mapbox-gl/wa-sqlite in `src/species/`) remains valid for any remaining files under `src/species/` (just `seasonality-viz.ts` and `seasonality-cache.ts`). The test can be trimmed to cover those remaining files or deleted if the directory is fully removed.
2. `PAGE-06: presenter→coordinator non-import` — coordinator `bee-species-page.ts` is gone; entire block vacuous → delete.
3. `src/entries/species.ts allowlist (PAGE-04 partial)` — entry file is gone; entire block vacuous → delete.
4. `ARCH-04: src/lib/spa-link.ts boundary (D-05)` — `spa-link.ts` contract is independent; keep this block.

**Replacement:** Add a new describe block for `src/entries/species-index.ts` asserting that the new entry only imports allowed modules (no `bee-species-page`, no `bee-species-filter`, no SPA modules).

### Pattern 4: build-output.test.ts Updates

**What:** The first test in `build-output.test.ts` asserts `<bee-species-card>` appears 500+ times. After replacement, the index page has no cards — only links.

**Tests to update/add:**
- REMOVE: `emits _site/species/index.html with one <bee-species-card> per species (PAGE-01)` — old behavior gone
- REMOVE: `every <img> tag has loading="lazy" (PAGE-07)` on the index page — no `<img>` tags on new index
- REMOVE: `emits a species-page chunk distinct from index-*.js (PAGE-09)` — old species entry chunk gone; new `species-index` chunk will appear instead
- REMOVE: `species chunk does NOT contain mapboxgl symbol (PAGE-09)` — old species chunk gone
- ADD: assert index page contains `.family-section` elements (IDX-01)
- ADD: assert index page contains `#species-filter` input (IDX-02)
- ADD: assert index page contains genus links like `/species/Bombus/` (IDX-03)
- ADD: assert index page contains species links like `/species/Agapostemon/femoratus/` (IDX-04)
- ADD: assert old `<bee-species-page>` element is absent (URL-05)

### Anti-Patterns to Avoid

- **Grouping in `_data/species.js`:** `species.flat | groupby("family")` in Nunjucks is simpler and avoids changing the data module that is already stable and tested. [ASSUMED — either approach is acceptable per CONTEXT.md]
- **Adding `seasonality-viz` to the new entry:** The index page has no seasonality charts. Only `taxon-page.ts` and `species-detail.njk` need it.
- **Deleting `src/species/seasonality-viz.ts`:** `_pages/species-detail.njk` references `<seasonality-viz>` and loads it via `src/entries/taxon-page.ts` line 13. Deleting it would break species detail pages. [VERIFIED: species-detail.njk line 34, taxon-page.ts line 13]
- **Deleting `src/tests/seasonality-viz.test.ts`:** `seasonality-viz.ts` is kept; its test file stays too.
- **Keeping `src/tests/bee-taxon-nav.test.ts`:** `bee-taxon-nav.ts` is deleted; its test file has no remaining target — delete it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Family→genus grouping | Custom JS groupBy in `_data/species.js` | Nunjucks `groupby` filter | Already verified present; zero-cost at build time |
| CSS visibility toggle | Custom `display:none` class | HTML `hidden` attribute | Native semantics, assistive tech skips hidden elements correctly |

**Key insight:** The entire complexity of the old page (Lit coordinator, reactive state, URL sync, geo/month filters, taxon tree) is replaced by a 30-line JS module and a Nunjucks template. No library is needed beyond what's already imported.

## Common Pitfalls

### Pitfall 1: Nunjucks `groupby` Sort Order
**What goes wrong:** The `groupby` filter preserves insertion order from the input array, not alphabetical order. If `species.flat` is sorted by `scientificName` globally, species within a genus will be alphabetical (since `scientificName` = `genus + epithet`), but genera within a family might not be in alphabetical order if the source array is only sorted by full name (it is — `Agapostemon femoratus` sorts before `Apis mellifera`, so genera do sort correctly by family initial letter).
**Why it happens:** `groupby` does not sort keys; it groups by first occurrence.
**How to avoid:** Confirm `species.flat` is sorted alphabetically by `scientificName` (it is — see `_data/species.js` line 39-41). Since names sort as `Family Genus epithet`, all genera within a family will be contiguous and in alphabetical order. [VERIFIED: _data/species.js]
**Warning signs:** Family sections appear in unexpected order on the rendered page.

### Pitfall 2: `arch.test.ts` PAGE-04 Allowlist After Entry Deletion
**What goes wrong:** The allowlist test for `src/entries/species.ts` will fail with "file does not exist" if not removed, OR the test for `src/species/` will fail because `bee-species-page.ts` is no longer present.
**Why it happens:** The test guards were written against the old component set and treat missing files as failures.
**How to avoid:** Remove the three describe blocks that guard the deleted files. Keep the `spa-link.ts` describe block. Add a new describe block for the new `species-index.ts` entry.
**Warning signs:** `vitest run` fails immediately on arch.test.ts with "file not found" errors.

### Pitfall 3: `build-output.test.ts` Expects `<bee-species-card>` in Index HTML
**What goes wrong:** After deletion, `build-output.test.ts` line 20-23 asserts 500+ `<bee-species-card>` elements in `_site/species/index.html`. This fails immediately.
**Why it happens:** Test was written for the old page structure.
**How to avoid:** Delete or replace that test with IDX-01..04 assertions in the same wave as the template rewrite. Do not let a wave end with failing tests.
**Warning signs:** `npm test` (with build) fails on the `build-output.test.ts` test about PAGE-01.

### Pitfall 4: Filter Genus-Name Matching
**What goes wrong:** If the filter only matches `li.dataset.name` (species scientific name) and not the genus name, typing "Bombus" shows no results because the genus name is stored in `row.dataset.genus`, not in any `li.data-name`.
**Why it happens:** The genus link is in `.genus-row`, not in `<li>` elements.
**How to avoid:** The filter logic must check `row.dataset.genus.includes(query)` as an OR condition for each li's visibility (or use the row-level visibility check). The UI-SPEC behavior section specifies this explicitly.
**Warning signs:** Typing a genus name produces no results even though that genus exists.

### Pitfall 5: Empty Filter State Element
**What goes wrong:** Forgetting to include `<p id="filter-empty" hidden>` in the template means the JS cannot show the "no results" message.
**Why it happens:** The element must be present in the static HTML for the JS to toggle it.
**How to avoid:** Include the empty-state element in the Nunjucks template. The JS toggles `hidden` on it.

### Pitfall 6: CSS `.species-index` Modifier Not Added
**What goes wrong:** The `<article>` needs both `taxon-page` and `species-index` classes. If `.species-index` is never defined in `taxon-pages.css`, the modifier class is harmless but the filter input has no styling.
**Why it happens:** The UI-SPEC calls for a filter input background of `var(--surface-subtle)` = `#f5f5f5`, which requires a CSS rule targeting `#species-filter` or `.species-index input[type=search]`.
**How to avoid:** Add minimal `.species-index` CSS to `taxon-pages.css` for the filter input: background color, margin-bottom, border.

## Code Examples

### Complete Template Structure (from UI-SPEC)
```nunjucks
---
layout: default.njk
permalink: /species/index.html
title: Species — BeeAtlas
---
<article class="taxon-page species-index">
  <h1>Species</h1>
  <input type="search" id="species-filter"
         aria-label="Filter genera and species"
         placeholder="Filter genera and species…"
         autocomplete="off">
  <p id="filter-empty" hidden>No genera or species match "<span id="filter-query"></span>".</p>
  {%- for family, familyGroup in species.flat | groupby("family") -%}
  <section class="family-section" data-family="{{ family }}">
    <h2>{{ family }}</h2>
    {%- for genus, genusGroup in familyGroup | groupby("genus") -%}
    <div class="genus-row" data-genus="{{ genus }}">
      <a href="/species/{{ genus }}/"><em>{{ genus }}</em></a>
      <ul class="species-list">
        {%- for sp in genusGroup -%}
        <li data-name="{{ sp.scientificName | lower }}">
          <a href="/species/{{ sp.slug }}/"><em>{{ sp.scientificName }}</em></a>
          <span class="count">{{ sp.occurrence_count }} records</span>
        </li>
        {%- endfor -%}
      </ul>
    </div>
    {%- endfor -%}
  </section>
  {%- endfor -%}
</article>
<script type="module" src="/src/entries/species-index.ts"></script>
```
Source: 96-UI-SPEC.md (verified against `_data/species.js` field names)

### `species-index.ts` Entry (thin JS, no Lit)
The entry imports CSS side effects and wires the filter. See Pattern 2 above for the full implementation.

The module MUST import `taxon-pages.css` (for `.taxon-page`, `.species-list` styles) and `index.css` (base tokens). It MUST NOT import any species component (`bee-species-page`, `bee-species-filter`, etc.) or SPA modules (`bee-atlas`, `filter`, `wa-sqlite`). [VERIFIED: constraint consistent with existing arch.test.ts ARCH-04 boundary]

## Component Deletions: Complete Inventory

### Files Confirmed for Deletion [VERIFIED: grep audit]

| File | Confirmed Path | Currently Used By | Safe to Delete |
|------|----------------|-------------------|----------------|
| `bee-species-page.ts` | `src/species/bee-species-page.ts` | `src/entries/species.ts` only | Yes — entry deleted too |
| `bee-species-filter.ts` | `src/species/bee-species-filter.ts` | `src/entries/species.ts` only | Yes |
| `bee-taxon-nav.ts` | `src/species/bee-taxon-nav.ts` | `src/entries/species.ts` + `_includes/taxon-tree.njk` only | Yes — both deleted |
| `url-state.ts` (species) | `src/species/url-state.ts` | `src/tests/species-url-state.test.ts` only | Yes — test deleted too |
| `taxon-tree.njk` | `_includes/taxon-tree.njk` | `_pages/species.njk` only | Yes — page rewritten |
| `src/entries/species.ts` | `src/entries/species.ts` | `_pages/species.njk` only | Yes — page rewritten |

### Files Confirmed SAFE TO KEEP

| File | Why Keep |
|------|----------|
| `src/species/seasonality-viz.ts` | Used by `_pages/species-detail.njk` → `src/entries/taxon-page.ts` line 13 [VERIFIED] |
| `src/species/seasonality-cache.ts` | Supporting module for `seasonality-viz.ts` |
| `src/tests/seasonality-viz.test.ts` | `seasonality-viz.ts` is kept |
| `src/tests/bee-taxon-nav.test.ts` | DELETE — only tests `bee-taxon-nav.ts` which is deleted |

### `bee-species-card.ts` Decision
**Status:** [VERIFIED] `bee-species-card.ts` is referenced only in:
- `src/entries/species.ts` (deleted)
- `_pages/species.njk` (rewritten, new page has no `<bee-species-card>`)
- `src/tests/bee-species-card.test.ts` (deleted)
- `src/species/tests/a11y.test.ts` — the CARD_FIXTURE constant uses the element name as a string but does NOT import the module; the test still works without the file

**Conclusion:** `bee-species-card.ts` can be deleted. No other template or entry imports it after the rewrite. The a11y test uses the HTML fixture inline without importing the module.

### Test Files: Complete Deletion List
| Test File | Reason for Deletion |
|-----------|---------------------|
| `src/tests/bee-species-page.test.ts` | Tests `bee-species-page.ts` (deleted) |
| `src/tests/bee-species-filter.test.ts` | Tests `bee-species-filter.ts` (deleted) |
| `src/tests/bee-species-card.test.ts` | Tests `bee-species-card.ts` (deleted) |
| `src/tests/species-url-state.test.ts` | Tests `src/species/url-state.ts` (deleted) |
| `src/tests/bee-taxon-nav.test.ts` | Tests `bee-taxon-nav.ts` (deleted) |
| `src/species/tests/a11y.test.ts` | Imports `bee-taxon-nav.ts`; full content tests deleted components |

### `arch.test.ts` Surgery Required
The file has four `describe` blocks:
1. `ARCH-04: src/species boundary (PAGE-08)` — checks `src/species/**` has no forbidden SPA imports. After deletion, `src/species/` contains only `seasonality-viz.ts` and `seasonality-cache.ts`. The check still applies to those files — keep the test but it will pass trivially. Alternatively, this describe block can be kept entirely as a future-proofing guard.
2. `PAGE-06: presenter→coordinator non-import` — coordinator is gone → delete this entire describe block.
3. `src/entries/species.ts allowlist (PAGE-04 partial)` — entry is gone → delete this entire describe block.
4. `ARCH-04: src/lib/spa-link.ts boundary (D-05)` — `spa-link.ts` is unchanged → keep this describe block.

**New addition:** A describe block validating `src/entries/species-index.ts` has no SPA imports.

### `build-output.test.ts` Surgery Required
Specific test lines to replace:
- Line 20-23: `emits _site/species/index.html with one <bee-species-card> per species (PAGE-01)` → replace with IDX-01 assertion (`.family-section` elements present)
- Line 26-30: `every <img> tag has loading="lazy" (PAGE-07)` on index page → delete (new index page has no `<img>` tags)
- Line 62-66: `emits a species-page chunk distinct from index-*.js (PAGE-09)` → update to check for `species-index` chunk instead of `species` chunk
- Line 69-73: `species chunk does NOT contain mapboxgl symbol (PAGE-09)` → update for new `species-index` chunk name
- Add: IDX-02 assertion (`#species-filter` input present)
- Add: IDX-03 assertion (genus links like `/species/Agapostemon/` present)
- Add: IDX-04 assertion (species links like `/species/Agapostemon/femoratus/` present)
- Add: URL-05 assertion (`<bee-species-page>` absent)

### `build-output.test.ts` chunk name note
The chunk emitted by Vite for `src/entries/species-index.ts` will be named based on the entry file name. The current chunk-finding function `findSpeciesChunk()` looks for `/^species-.*\.js$/` in `_site/assets/`. The new entry `species-index.ts` would emit a chunk named `species-index-<hash>.js` — the regex `^species-.*` would still match it. However, the test should be updated to explicitly name the new behavior to prevent silent false-positives. [ASSUMED — Vite chunk naming from entry filename is standard behavior]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (project-installed) |
| Config file | none explicit — `vitest run` discovers via `package.json` |
| Quick run command | `npm test` (= `vitest run`) |
| Full suite command | `VITEST_SKIP_BUILD=1 npm test` (unit-only, fast) |
| Build-integrated | `npm test` (includes build-output.test.ts which runs `npm run build`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| URL-05 | `<bee-species-page>` absent from built index | build-output | `npm test` | ❌ Wave 0 — add assertion to `build-output.test.ts` |
| IDX-01 | `/species/` HTML contains `.family-section` elements | build-output | `npm test` | ❌ Wave 0 — add to `build-output.test.ts` |
| IDX-02 | `#species-filter` input present in HTML | build-output | `npm test` | ❌ Wave 0 — add to `build-output.test.ts` |
| IDX-03 | Genus links like `/species/Agapostemon/` present | build-output | `npm test` | ❌ Wave 0 — add to `build-output.test.ts` |
| IDX-04 | Species links like `/species/Agapostemon/femoratus/` present | build-output | `npm test` | ❌ Wave 0 — add to `build-output.test.ts` |
| IDX-02 | Filter JS wires `input` event to `#species-filter` | unit | `VITEST_SKIP_BUILD=1 npm test` | ❌ Wave 0 — new `src/tests/species-index.test.ts` |

### Sampling Rate
- **Per task commit:** `VITEST_SKIP_BUILD=1 npm test` (fast unit pass, ~5s)
- **Per wave merge:** `npm test` (full suite including build-output, ~2-3min)
- **Phase gate:** `npm run build` green + `npm test` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] New assertions in `src/tests/build-output.test.ts` for IDX-01..04 + URL-05 — covers build-time contract
- [ ] `src/tests/species-index.test.ts` — unit test for filter JS wiring IDX-02

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vite chunk for `species-index.ts` will be named `species-index-<hash>.js` and the existing `^species-.*` regex in `findSpeciesChunk()` will match it | build-output.test.ts chunk notes | Test may miss the chunk if Vite uses a different naming scheme — verify after first build |
| A2 | `species.flat | groupby("family")` in Nunjucks preserves alphabetical order within each family group because `flat` is sorted by `scientificName` globally | Architecture Patterns | Genera within a family might appear non-alphabetically if Nunjucks groupby uses key insertion order differently — verify in build output |
| A3 | The a11y test `src/species/tests/a11y.test.ts` does not import `bee-species-card.ts` by module path (only uses it as an HTML string) and will work after deletion | Component Deletions | If there is a hidden module import, deleting `bee-species-card.ts` would break the a11y test — verified by reading the file |

**If this table has entries for A3:** A3 is actually VERIFIED — the file was read and confirmed that only `bee-taxon-nav.ts` is imported; `bee-species-card` appears only as an HTML string in `CARD_FIXTURE`. The a11y test should be deleted anyway since its primary purpose (testing `bee-taxon-nav`) is gone.

## Open Questions

1. **Nunjucks groupby sort order for genera within a family**
   - What we know: `species.flat` is sorted alphabetically by `scientificName`. The sort key `scientificName = "Genus specificEpithet"` means all entries for `Agapostemon` sort before all entries for `Andrena`, and within `Agapostemon` they are alphabetical.
   - What's unclear: Does Nunjucks `groupby` iterate keys in insertion order? If yes, the rendered family→genus order will be alphabetical as expected. Jinja2 (Nunjucks' ancestor) and Nunjucks both document that `groupby` preserves order.
   - Recommendation: Accept as correct. Verify in the first build output and add an assertion if needed.

2. **`bee-species-card.ts` deletion and `species.css`**
   - What we know: `src/styles/species.css` contains all CSS for the old page including `bee-species-card` selectors. After deletion, `species.css` is no longer imported anywhere (it was only imported by `src/entries/species.ts`). `species.css` can be deleted along with `species.ts`.
   - What's unclear: Whether any other file imports `species.css`.
   - Recommendation: grep for `species.css` imports before deleting. From the research: only `src/entries/species.ts` imports it (VERIFIED). Safe to delete both.

## Environment Availability

Step 2.6: SKIPPED — this phase involves only template replacement and TypeScript source edits. No external tools, services, CLIs, runtimes, databases, or package managers beyond the project's own toolchain are needed.

## Security Domain

This phase adds no authentication, session management, access control, cryptography, or external data inputs. The filter input (`#species-filter`) is a client-side string match against statically rendered `data-name` attributes — no server processing occurs. The new entry module has no network requests.

No ASVS categories apply to this phase.

## Sources

### Primary (HIGH confidence)
- `_pages/species.njk` — verified current template structure and permalink
- `src/entries/species.ts` — verified import set and CSS side-effect
- `src/entries/taxon-page.ts` — verified `seasonality-viz.ts` is imported here (keeps it alive)
- `_pages/species-detail.njk` — verified `<seasonality-viz>` usage via taxon-page.ts entry
- `_data/species.js` — verified `species.flat` fields, `groupby` data shape, sort order
- `src/styles/taxon-pages.css` — verified existing CSS classes reusable for new index
- `src/styles/species.css` — verified only imported by `src/entries/species.ts`
- `src/tests/arch.test.ts` — verified all describe blocks and which to keep vs. delete
- `src/tests/build-output.test.ts` — verified all tests and which to replace
- All test files in `src/tests/` and `src/species/tests/` — verified import structure
- `eleventy.config.js` — verified Eleventy build setup
- `96-CONTEXT.md` — locked decisions and discretion areas
- `96-UI-SPEC.md` — complete HTML structure, interaction contract, CSS rules
- Nunjucks runtime test: `node --input-type=module` confirms `groupby` filter present [VERIFIED: Bash]

### Secondary (MEDIUM confidence)
- Nunjucks documentation: `groupby` filter preserves input array order within groups [CITED: nunjucks.org/templating.html#groupby]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all technology is already in the project; no new dependencies
- Architecture: HIGH — canonical reference (`_pages/genus.njk` + `taxon-page.ts`) is in the codebase and fully read
- Deletion surface: HIGH — every file confirmed by grep + direct read
- Pitfalls: HIGH — derived from actual code reading, not assumed
- Test surgery: HIGH — every affected test block identified by line number

**Research date:** 2026-05-15
**Valid until:** Indefinite — stable project codebase, no external dependencies
