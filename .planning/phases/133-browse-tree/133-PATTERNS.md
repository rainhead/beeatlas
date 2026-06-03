# Phase 133: Browse Tree — Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 4 (modified files only)
**Analogs found:** 4 / 4

---

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `_pages/species.njk` | template | request-response (build-time, static) | `_pages/subfamily.njk` | exact — nested `<details>` markup + count display |
| `src/entries/species-index.ts` | client entry | event-driven (DOM filter + toggle) | self (existing file) + `src/bee-pane.ts` for filter focus | self-extension + role-match |
| `_data/species.js` | build-time data feed | transform (JSON → nested tree) | self (existing `subfamilyList` builder) | exact — same builder idiom already in file |
| `src/styles/taxon-pages.css` | stylesheet | — | self (existing `.species-index` block) | self-extension |

---

## Pattern Assignments

### `_pages/species.njk` (template, build-time static)

**Primary analog:** `_pages/subfamily.njk`
**Secondary analog:** `_pages/genus.njk`, `_pages/tribe.njk`, `_pages/subgenus.njk`, `_pages/species-detail.njk`

Rationale: `subfamily.njk` is the closest match — it already renders a nested two-level tree
(tribes → genera) using `<ul class="species-list">`, applies the `specimen_count · inat_obs_count`
count split, handles the tribe-less flat-fallback (D-05 mirror), and produces the URL forms used
throughout. The new tree is this same pattern extended to 3–6 levels with `<details>/<summary>`
replacing plain `<ul>` at each expandable rank.

**Frontmatter / permalink pattern** (`_pages/species.njk` lines 1–5, unchanged):
```njk
---
layout: default.njk
permalink: /species/index.html
title: Species — BeeAtlas
---
```

**Article wrapper pattern** (`_pages/species.njk` line 6, `_pages/genus.njk` line 11):
```njk
<article class="taxon-page species-index">
```
The existing `.taxon-page.species-index` dual-class is already set. Keep both classes.

**Control bar pattern** (new; modeled on UI-SPEC §Control bar):
```html
<div class="species-index-controls">
  <input type="search" id="species-filter"
         aria-label="Filter taxa"
         placeholder="Filter taxa…"
         autocomplete="off">
  <label class="rank-toggle-label">
    <input type="checkbox" id="show-all-ranks">
    Show all ranks
  </label>
</div>
<p id="filter-empty" hidden>No taxa match "<span id="filter-query"></span>".</p>
```
Note: the `aria-label` changes from "Filter genera and species" (current) to "Filter taxa" (UI-SPEC copywriting contract).

**URL forms for node links** — extracted from existing page permalinks:

| Rank | URL form | Source |
|---|---|---|
| species | `/species/{{ sp.slug }}/` | `_pages/species-detail.njk` line 6 |
| genus | `/species/{{ genus.genus }}/` | `_pages/genus.njk` line 6 |
| subgenus | `/species/{{ subgenus.genus }}/{{ subgenus.subgenus }}/` | `_pages/subgenus.njk` line 6 |
| tribe | `/species/tribe/{{ tribe.tribe }}/` | `_pages/tribe.njk` line 6 |
| subfamily | `/species/subfamily/{{ subfamily.subfamily }}/` | `_pages/subfamily.njk` line 6 |
| family | (no page — D-07; map link only) | — |

**Map affordance URL form** (from `_pages/species-detail.njk` line 46):
```njk
href="/?taxon={{ sp.scientificName | urlencode }}&amp;taxonRank=species"
```
All ranks use the same scheme: `/?taxon=<name|id>&amp;taxonRank=<rank>`.
For genus: `/?taxon={{ genus }}&amp;taxonRank=genus`. Family: `/?taxon={{ family }}&amp;taxonRank=family`.
`urlencode` filter is available in Eleventy's Nunjucks environment.

**Count display pattern** (`_pages/genus.njk` line 16, `_pages/subfamily.njk` lines 35–36):
```njk
{# On genus.njk metadata line — long form with quantify filter #}
<p class="metadata">{{ genus.speciesCount | quantify("species", "species") }} · {{ genus.totalOccurrences | quantify("record") }}</p>

{# On subfamily.njk species-list item — the exact "specimen · obs" split used on tree nodes #}
<span class="count">{{ g.specimen_count | quantify("specimen") }} · {{ g.inat_obs_count | quantify("community observation") }}</span>
```
For tree node summaries, use the compact form without the `quantify` filter (bare numbers + middle-dot separator), matching UI-SPEC §Copywriting: `{{ node.specimen_count }} · {{ node.inat_obs_count }}`.

**`<details>/<summary>` tree node markup** (new pattern; per UI-SPEC §Component Inventory):
```html
<!-- Page-backed node (genus, subgenus, tribe, subfamily) -->
<details class="tree-node tree-node--genus" data-rank="genus" data-name="{{ genus }}">
  <summary>
    <a href="/species/{{ genus }}/" class="node-name"><em>{{ genus }}</em></a>
    <span class="node-counts">{{ specimenCount }} · {{ inatObsCount }}</span>
    <a href="/?taxon={{ genus }}&amp;taxonRank=genus" class="node-map"
       aria-label="Map: {{ genus }} occurrences">🗺</a>
  </summary>
  <!-- children rendered inline -->
</details>

<!-- Family node — no page, plain text (D-07) -->
<details class="tree-node tree-node--family" data-rank="family" data-name="{{ family }}">
  <summary>
    <span class="node-name">{{ family }}</span>
    <span class="node-counts">{{ specimenCount }} · {{ inatObsCount }}</span>
    <a href="/?taxon={{ family }}&amp;taxonRank=family" class="node-map"
       aria-label="Map: {{ family }} occurrences">🗺</a>
  </summary>
  <!-- children -->
</details>
```
Intermediate-rank nodes (subfamily, tribe, subgenus) rendered with `hidden` attribute when "Show
all ranks" is OFF; JS removes/restores `hidden` per D-03. No `<details open>` attribute set in
HTML — JS sets `.open = true` only for filter auto-expand (D-09).

**Species leaf node** (inside a genus `<details>`, modeled on current `species.njk` `<li>`):
```html
<ul class="species-list">
  {%- for sp in genusSpecies -%}
  <li data-rank="species" data-name="{{ sp.scientificName | lower }}">
    <a href="/species/{{ sp.slug }}/" class="node-name"><em>{{ sp.scientificName }}</em></a>
    <span class="node-counts">{{ sp.specimen_count }} · {{ sp.inat_obs_count }}</span>
    <a href="/?taxon={{ sp.scientificName | urlencode }}&amp;taxonRank=species" class="node-map"
       aria-label="Map: {{ sp.scientificName }} occurrences">🗺</a>
  </li>
  {%- endfor -%}
</ul>
```

**Script tag pattern** (`_pages/species.njk` line 38, unchanged):
```html
<script type="module" src="/src/entries/species-index.ts"></script>
```

---

### `src/entries/species-index.ts` (client entry, event-driven)

**Primary analog:** Self (existing file — extend it)
**Secondary analog:** `src/bee-pane.ts` for filter-input focus pattern (lines 270–284)

**Existing import block** (lines 1–10, keep verbatim):
```typescript
import '../index.css';
import '../styles/taxon-pages.css';
import '../bee-header.ts';
```
No new imports needed — plain DOM manipulation, no Lit, no new npm packages.

**Existing filter loop pattern** (lines 11–38, current):
```typescript
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
    emptyMsg.hidden = !query || anyVisible;
    const querySpan = document.getElementById('filter-query');
    if (querySpan) querySpan.textContent = input.value.trim();
  }
});
```

**New DOM selector targets** replacing the old `.family-section`/`.genus-row`/`li[data-name]`:

The new tree uses `data-rank` attributes on `<details>` and `<li>` nodes:
- `document.querySelectorAll<HTMLElement>('[data-rank]')` — all rank nodes
- `document.querySelectorAll<HTMLDetailsElement>('details.tree-node')` — all expandable nodes
- Filter matching target: `node.dataset.name` (always lowercased in HTML)
- Auto-expand: set `ancestorDetails.open = true` for each matched node's ancestor chain

**localStorage pattern** (new — first localStorage usage in this codebase, keep minimal per D-04):
```typescript
const STORAGE_KEY = 'beeatlas.speciesTree.showAllRanks';

function loadToggleState(): boolean {
  return localStorage.getItem(STORAGE_KEY) === '1';
}

function saveToggleState(value: boolean): void {
  localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
}
```

**"Show all ranks" toggle pattern** (new; checkbox `#show-all-ranks`):
```typescript
const rankToggle = document.getElementById('show-all-ranks') as HTMLInputElement | null;

function applyRankToggle(showAll: boolean): void {
  for (const el of document.querySelectorAll<HTMLElement>('[data-rank="subfamily"],[data-rank="tribe"],[data-rank="subgenus"]')) {
    el.hidden = !showAll;
  }
  if (rankToggle) rankToggle.checked = showAll;
}

rankToggle?.addEventListener('change', () => {
  const showAll = rankToggle.checked;
  applyRankToggle(showAll);
  saveToggleState(showAll);
});

// Apply persisted state on load
applyRankToggle(loadToggleState());
```

**Filter interaction with `<details>` nodes** (auto-expand ancestors on match):
```typescript
// For each matched tree node, walk up the DOM and set .open = true on ancestor <details>
function openAncestors(el: HTMLElement): void {
  let parent = el.parentElement;
  while (parent) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    parent = parent.parentElement;
  }
}
```

---

### `_data/species.js` (build-time data feed, transform)

**Primary analog:** Self — the existing `subfamilyList` builder (lines 278–357) is the closest
pattern: it iterates `higherTaxaByRankName`, handles the tribes-present / tribe-less branch
(D-05 mirror), and computes the same `specimen_count`/`inat_obs_count` rollup fields.

**Existing infrastructure to reuse** (lines 13–31):
```javascript
const raw = JSON.parse(readFileSync(speciesJsonPath, 'utf8'));
const higherTaxa = JSON.parse(readFileSync(higherTaxaPath, 'utf8'));
// O(1) lookup index by rank + name
const higherTaxaByRankName = {};
for (const row of higherTaxa) {
  if (!higherTaxaByRankName[row.rank]) higherTaxaByRankName[row.rank] = {};
  higherTaxaByRankName[row.rank][row.name] = row;
}
```
`higherTaxaByRankName['genus']`, `['subfamily']`, `['tribe']`, `['subgenus']` are all already
populated with the exact fields the tree needs (`specimen_count`, `inat_obs_count`,
`occurrence_count`, `taxon_id`, parent rank strings).

**Existing placeholder `buildTree` / `TAXON_LEVELS`** (lines 56–83):
```javascript
const TAXON_LEVELS = ['family', 'subfamily', 'tribe', 'genus', 'subgenus'];

function buildTree(rows) {
  const root = { rows: [], children: new Map() };
  for (const r of rows) {
    let node = root;
    for (const level of TAXON_LEVELS) {
      const key = r[level] == null ? 'null' : String(r[level]);
      if (!node.children.has(key)) {
        node.children.set(key, { rows: [], children: new Map() });
      }
      node = node.children.get(key);
    }
    node.rows.push(r);
  }
  return toPlain(root);
}
```
This placeholder recurses over species rows only. The new builder must join counts from
`higherTaxaByRankName` (which already carries rolled-up totals per higher rank) so that
intermediate nodes show accurate `specimen_count`/`inat_obs_count`.

**`subfamilyList` builder pattern for tribe-less graceful degradation** (lines 299–337):
```javascript
if (sfTribes.length > 0) {
  // D-04: nested tribes→genera layout
  tribes = sfTribes.sort(...).map(t => { ... });
} else {
  // D-05: tribe-less subfamilies → flat genus list with no tribe heading
  flatGenera = sfGenera.sort(...).map(g => ({ genus: g.name, ... }));
}
```
The new `buildFullTree` function must implement the same conditional skip: if a rank has no
members at a given branch, attach children to the nearest present ancestor (D-05).

**Export line** (line 359, extend with new tree export):
```javascript
export default { tree, flat, byScientificName, counties, ecoregionL3, speciesList, genusList, subgenusList, tribeList, subfamilyList };
```
The new export adds a `fullTree` (or replaces `tree`) with the hardened nested structure. The
template (`species.njk`) must reference whichever key is chosen — planner decides.

**`higher_taxa.json` field shape** (confirmed by inspection):
```
genus row:    { rank, name, family, subfamily, tribe, taxon_id, specimen_count, inat_obs_count, occurrence_count, species_count }
subfamily row:{ rank, name, family, taxon_id, specimen_count, inat_obs_count, occurrence_count, species_count }
tribe row:    { rank, name, family, subfamily, taxon_id, specimen_count, inat_obs_count, occurrence_count }
subgenus row: { rank, name, family, subfamily, genus, tribe, taxon_id, specimen_count, inat_obs_count, occurrence_count }
```
Note: `genus` field on `higher_taxa` rows is `null` (confirmed). For subgenus rows the genus
parent is stored in `row.genus` (not `row.name`). Planner must account for this.

---

### `src/styles/taxon-pages.css` (stylesheet, self-extension)

**Primary analog:** Self — the existing `.species-index` block (lines 121–140) sets the pattern
for all `.species-index` modifier rules. New rules extend this block.

**Existing `.species-index` block to extend** (lines 121–140):
```css
/* Phase 96: species index page modifier */
.species-index #species-filter {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 0.5rem;   /* var(--sm, 8px) */
  padding: 0.5rem;
  background: var(--surface-subtle, #f5f5f5);
  border: 1px solid var(--border, #ddd);
  font-size: 1rem;
  border-radius: 4px;
}

.species-index .family-section {
  margin-bottom: 1.5rem;   /* var(--lg, 24px) */
}

.species-index .genus-row {
  margin-bottom: 0.5rem;   /* var(--sm, 8px) */
}
```

**Existing `.species-list` / `.count` pattern** (lines 72–91):
```css
.species-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.species-list li {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.25rem 0;
  border-bottom: 1px solid var(--border, #ddd);
}

.species-list .count {
  margin-left: auto;
  font-size: 0.85rem;
  color: var(--text-muted, #666);
}
```
`.node-counts` on tree nodes matches the same 0.85rem / `--text-muted` convention.

**Filter input focus pattern** (from `src/bee-pane.ts` lines 280–283 — replicate in light DOM):
```css
.species-index #species-filter:focus {
  outline: none;
  border-color: var(--accent, #2c7a2c);
}
```
The bee-pane uses this inside a shadow-DOM template literal. In the light-DOM taxon-pages.css,
apply the same rule under the `.species-index` scope.

**New rules to add** (per UI-SPEC; all under `.species-index` modifier scope):

```css
/* Control bar */
.species-index .species-index-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  flex-wrap: wrap;         /* mobile fallback < 480px */
}

.species-index .species-index-controls #species-filter {
  flex: 1 1 auto;
  min-width: 0;
  /* existing padding/bg/border rules via .species-index #species-filter — no duplication needed
     if the selector above replaces the old standalone rule */
}

.species-index .rank-toggle-label {
  flex: 0 0 auto;
  white-space: nowrap;
  font-size: 0.875rem;
}

/* "Show all ranks" active indicator (D-04 / UI-SPEC §Toggle) */
.species-index .rank-toggle-label:has(#show-all-ranks:checked) {
  border: 1px solid var(--accent);
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
}

/* Tree node <summary> row */
.species-index .tree-node > summary {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  cursor: pointer;
  padding: 0.25rem 0;
}

.species-index .node-name {
  flex: 1 1 auto;
}

.species-index .node-counts {
  flex: 0 0 auto;
  font-size: 0.85rem;
  color: var(--text-muted, #666);
}

.species-index .node-map {
  flex: 0 0 auto;
  font-size: 0.85rem;
  color: var(--text-muted, #666);
  padding: 0.5rem;
  margin: -0.5rem;        /* preserve layout while expanding tap target to 44×44px */
}

.species-index .node-map:hover,
.species-index .node-map:focus-visible {
  color: var(--text-body, #213547);
}

/* Tree indentation */
.species-index details.tree-node {
  padding-left: 1.5rem;
}
.species-index > details.tree-node--family {
  padding-left: 0;        /* top-level family nodes not indented */
}

/* Focus-visible rings */
.species-index summary:focus-visible,
.species-index .node-map:focus-visible,
.species-index #show-all-ranks:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}

/* Narrow viewport: reduce indent */
@media (max-width: 480px) {
  .species-index details.tree-node {
    padding-left: 1rem;
  }
}
```

---

## Shared Patterns

### Count display convention
**Source:** `_pages/genus.njk` line 28, `_pages/subfamily.njk` lines 35–36, `_pages/tribe.njk` line 26
**Apply to:** Every `<summary>` `.node-counts` span in `_pages/species.njk`

The canonical form on taxon pages is:
```njk
<span class="count">{{ g.specimen_count | quantify("specimen") }} · {{ g.inat_obs_count | quantify("community observation") }}</span>
```
On the tree node summary (compact form per UI-SPEC §Copywriting), omit unit labels:
```njk
<span class="node-counts">{{ node.specimen_count }} · {{ node.inat_obs_count }}</span>
```
Separator is U+00B7 (middle dot `·`), not a hyphen or pipe.

### `taxon_id` conditional guard
**Source:** `_pages/genus.njk` lines 38–40, `_pages/subfamily.njk` lines 55–57
**Apply to:** `_data/species.js` tree builder when attaching `taxon_id` to nodes

```njk
{%- if genus.taxon_id -%}
<a href="...">View on iNaturalist →</a>
{%- endif -%}
```
`taxon_id` may be null for some rows — guard against it in the template and in the data builder.

### `higherTaxaByRankName` lookup pattern
**Source:** `_data/species.js` lines 26–31
**Apply to:** Any new helper function in `_data/species.js` that attaches higher-rank metadata

```javascript
taxon_id: higherTaxaByRankName['genus']?.[g.genus]?.taxon_id ?? null,
```
Always use optional chaining + nullish coalescing — the rank key may be absent if the pipeline
adds a new rank later.

### Build-time script tag (entry point wiring)
**Source:** Every `_pages/*.njk` file uses this form
**Apply to:** `_pages/species.njk` (line 38, unchanged)

```html
<script type="module" src="/src/entries/species-index.ts"></script>
```
Vite MPA mode discovers the entry from this tag. No `vite.config.ts` change needed.

### `hidden` attribute for JS-controlled visibility
**Source:** `_pages/species.njk` line 12 (`<p id="filter-empty" hidden>`)
**Apply to:** All intermediate rank `<details>` nodes hidden by default, `#filter-empty`

Use the HTML `hidden` attribute (not `display:none`) as the initial collapsed state for
intermediate-rank nodes when "Show all ranks" is OFF (per UI-SPEC §Accessibility Contract).
JavaScript removes/sets `hidden` on toggle — this keeps the nodes accessible without JS
(they are visible in the no-JS fallback per D-02 / UI-SPEC §No-JS Fallback).

---

## No Analog Found

None. All four files have clear codebase analogs or are self-extensions.

---

## Metadata

**Analog search scope:** `_pages/`, `src/entries/`, `src/styles/`, `_data/`, `src/index.css`, `src/bee-pane.ts`
**Files read:** 14
**Data files inspected:** `public/data/higher_taxa.json`, `public/data/species.json` (schema sampled)
**Pattern extraction date:** 2026-06-03
