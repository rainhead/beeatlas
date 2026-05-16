# Phase 95: Subgenus & Tribe Pages - Research

**Researched:** 2026-05-16
**Domain:** Eleventy static page generation — subgenus and tribe grouping pages
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| URL-03 | Each subgenus has a dedicated page at `/species/{Genus}/{Subgenus}/` (both capitalized) | Eleventy pagination over `species.subgenusList`; permalink `/species/{{ item.genus }}/{{ item.subgenus }}/`; no runtime disambiguation needed — capitalized subgenus vs lowercase epithet is a build-time structural distinction |
| URL-04 | Each tribe has a dedicated page at `/species/tribe/{TribeName}/` | Eleventy pagination over `species.tribeList`; permalink `/species/tribe/{{ item.tribe }}/`; "tribe" namespace is safe — confirmed no genus named "tribe" or "Tribe" |
| SUBG-01 | Subgenus page lists species belonging to that subgenus with specimen counts | `subgenusList[i].species[]` array contains only entries with `specific_epithet != null`; 89 subgenus groups have species; 14 have only unresolved records (empty species list, SVG still shown) |
| SUBG-02 | Subgenus page displays a multi-color static SVG occurrence map | SVGs already exist at `public/data/species-maps/subgenus/{Genus}/{Subgenus}.svg` — Phase 93 PIPE-02 complete; 103 SVGs generated; all match species.json data |
| SUBG-03 | Each species entry links to its individual species page | Link target `/species/{{ sp.slug }}/` where `sp.slug = "Genus/specificEpithet"` — same pattern as genus page |
| TRIBE-01 | Tribe page lists all genera belonging to that tribe | `tribeList[i].genera[]` array of `{ genus, occurrence_count }` objects; 20 tribes; all single-family in WA dataset |
| TRIBE-02 | Tribe page displays a multi-color static SVG occurrence map | SVGs already exist at `public/data/species-maps/tribe/{TribeName}.svg` — Phase 93 complete; 19 SVGs (Ammobatini has no species with occurrences, so no SVG exists) |
| TRIBE-03 | Each genus entry links to its genus page | Link target `/species/{{ genus_entry.genus }}/` — genus page pattern from Phase 94 |
</phase_requirements>

---

## Summary

Phase 95 adds subgenus and tribe static pages to the Eleventy site following the same pattern Phase 94 established for genus pages. The work is mechanical: two new Nunjucks templates (`_pages/subgenus.njk`, `_pages/tribe.njk`), two new data lists in `_data/species.js` (`subgenusList`, `tribeList`), and new test assertions. No new CSS file, no new web components, no new pipeline work.

All SVG maps were generated in Phase 93 and are already on disk. The data fields (`subgenus`, `tribe`, `family`, `occurrence_count`, `canonical_name`) are present in `public/data/species.json` for all records. The color assignment formula is the same `hslToHex` function already in `_data/species.js`. The CSS classes (`.taxon-page`, `.media-grid`, `.species-list`, `.swatch`, `.breadcrumb`) are already defined in `src/styles/taxon-pages.css`.

The one non-trivial decision: whether to generate subgenus pages for the 14 groups that have only unresolved records (identified-to-subgenus-level only, no named species). These groups have SVG maps but would show an empty species list. The recommendation is to include them (the SVG map is informative) and display the map without a species list when `species.length === 0`.

**Primary recommendation:** Extend `_data/species.js` with `subgenusList` and `tribeList` (pattern exactly mirrors `genusList`), then create two Nunjucks templates using the genus page as a copy/adapt base.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Subgenus/tribe page HTML | Frontend Server (SSG/Eleventy) | — | Static generation at build time; Eleventy pagination over data arrays |
| Color assignment | Frontend Server (SSG) | — | Pre-computed in `_data/species.js` at build time; same `hslToHex` as genusList |
| SVG map delivery | CDN / Static | — | Maps already on disk in `public/data/species-maps/`; served as static files |
| Data grouping | Frontend Server (SSG) | — | `_data/species.js` builds `subgenusList` and `tribeList` from `species.json` at build time |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @11ty/eleventy | ^3.1.5 | Static site generation with pagination | Already in use; genus/species pages already generated this way |
| @11ty/eleventy-plugin-vite | ^7.1.1 | Vite bundling for MPA entries | Already wired; taxon-page.ts entry already discovered |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Nunjucks | (bundled with Eleventy) | Template rendering | Used for all existing `.njk` templates |
| Vitest | (from vite.config.ts) | Unit and build-output tests | Used for all existing tests |

No new libraries needed for Phase 95.

**Installation:** None required.

---

## Architecture Patterns

### System Architecture Diagram

```
species.json (public/data/)
       |
       v
_data/species.js ──────> subgenusList (103 groups, sorted by genus then subgenus)
       |                  tribeList (20 tribes, sorted by tribe name)
       v
Eleventy pagination ──> _pages/subgenus.njk  ──> _site/species/{Genus}/{Subgenus}/index.html (103 pages)
                   ──> _pages/tribe.njk      ──> _site/species/tribe/{TribeName}/index.html (20 pages)

public/data/species-maps/subgenus/{Genus}/{Subgenus}.svg  ──> served at /data/species-maps/subgenus/...
public/data/species-maps/tribe/{TribeName}.svg            ──> served at /data/species-maps/tribe/...
```

### Recommended Project Structure

No new directories. New files:

```
_pages/
├── subgenus.njk         # New — pagination over species.subgenusList
├── tribe.njk            # New — pagination over species.tribeList
├── genus.njk            # Existing — reference/copy base
_data/
└── species.js           # Extend: add subgenusList, tribeList to default export
src/tests/
├── data-species.test.ts # Extend: subgenusList/tribeList unit tests
└── build-output.test.ts # Extend: subgenus/tribe page emission tests
```

### Pattern 1: Eleventy Pagination for Group Pages

Directly mirrors the genus page pattern.

```njk
---
pagination:
  data: species.subgenusList
  size: 1
  alias: subgenus
permalink: "/species/{{ subgenus.genus }}/{{ subgenus.subgenus }}/"
eleventyComputed:
  title: "{{ subgenus.subgenus }} ({{ subgenus.genus }}) — BeeAtlas"
layout: default.njk
---
```

For tribes:
```njk
---
pagination:
  data: species.tribeList
  size: 1
  alias: tribe
permalink: "/species/tribe/{{ tribe.tribe }}/"
eleventyComputed:
  title: "{{ tribe.tribe }} — BeeAtlas"
layout: default.njk
---
```

Source: `_pages/genus.njk` (Phase 94), `_pages/species-detail.njk` (Phase 94). [VERIFIED: codebase]

### Pattern 2: `subgenusList` in `_data/species.js`

The color assignment logic must match the Python `_group_colors` function exactly: iterate ALL members of the subgenus group with `occurrence_count > 0` (including unresolved/null `specific_epithet` rows), sort by `canonical_name`, assign hues. Unresolved records get `#aaaaaa`; resolved species get the HSL-formula color. Only resolved species appear in the HTML species list.

```javascript
// Build subgenus groupings. allMembers includes both resolved species AND
// unresolved records (specific_epithet=null) — required for color index
// to match Python _group_colors input for the subgenus SVG.
const subgenusMap = {};
for (const sp of flat) {
  if (!sp.subgenus || sp.subgenus.trim() === '') continue;  // null guard
  const key = `${sp.genus}::${sp.subgenus}`;
  if (!subgenusMap[key]) {
    subgenusMap[key] = {
      genus: sp.genus,
      subgenus: sp.subgenus,
      family: sp.family,
      subfamily: sp.subfamily,
      tribe: sp.tribe,
      allMembers: [],
    };
  }
  subgenusMap[key].allMembers.push(sp);
}

const subgenusList = Object.values(subgenusMap)
  .sort((a, b) => a.genus.localeCompare(b.genus) || a.subgenus.localeCompare(b.subgenus))
  .map(g => {
    const withOcc = g.allMembers
      .filter(sp => sp.occurrence_count > 0)
      .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
    const n = withOcc.length;
    const colorByCanon = Object.fromEntries(
      withOcc.map((sp, i) => [
        sp.canonical_name,
        sp.specific_epithet !== null ? hslToHex(i * 360 / n, 70, 50) : '#aaaaaa',
      ])
    );
    // Display list: only resolved species (specific_epithet != null)
    const species = withOcc
      .filter(sp => sp.specific_epithet !== null)
      .map(sp => ({ ...sp, hexColor: colorByCanon[sp.canonical_name] }));
    return {
      genus: g.genus,
      subgenus: g.subgenus,
      family: g.family,
      subfamily: g.subfamily,
      tribe: g.tribe,
      species,
      speciesCount: species.length,
      totalOccurrences: withOcc.reduce((acc, sp) => acc + sp.occurrence_count, 0),
    };
  })
  .filter(g => g.totalOccurrences > 0);  // only emit pages for groups with occurrences
```

Source: `_data/species.js` genusList pattern [VERIFIED: codebase] + Python `_group_colors` in `data/species_maps.py` [VERIFIED: codebase]

### Pattern 3: `tribeList` in `_data/species.js`

The tribe page lists genera (not species). No per-species color swatches in the HTML genus list (the SVG map handles color; listing swatches per species would bloat the genus list unacceptably per UI-SPEC).

```javascript
const tribeMap = {};
for (const sp of flat) {
  if (!sp.tribe || sp.tribe.trim() === '') continue;
  if (!tribeMap[sp.tribe]) {
    tribeMap[sp.tribe] = {
      tribe: sp.tribe,
      generaMap: {},  // genus -> occurrence_count sum
      family: sp.family,  // all WA tribes are single-family; first encountered is authoritative
    };
  }
  if (!tribeMap[sp.tribe].generaMap[sp.genus]) {
    tribeMap[sp.tribe].generaMap[sp.genus] = 0;
  }
  tribeMap[sp.tribe].generaMap[sp.genus] += sp.occurrence_count;
}

const tribeList = Object.values(tribeMap)
  .sort((a, b) => a.tribe.localeCompare(b.tribe))
  .map(t => {
    const genera = Object.entries(t.generaMap)
      .filter(([, occ]) => occ > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([genus, occurrence_count]) => ({ genus, occurrence_count }));
    const totalOccurrences = genera.reduce((acc, g) => acc + g.occurrence_count, 0);
    // UI-SPEC: family from first genus alphabetically (all WA tribes are single-family).
    const firstGenus = genera[0];
    // The family is already on the tribe object; confirm via firstGenus entry in flat if needed.
    return {
      tribe: t.tribe,
      family: t.family,
      genera,
      generaCount: genera.length,
      totalOccurrences,
    };
  })
  .filter(t => t.totalOccurrences > 0);
```

Source: UI-SPEC Data Requirements section + species.json tribe field analysis [VERIFIED: codebase]

### Pattern 4: Subgenus Page Template

```njk
<article class="taxon-page">
  <nav class="breadcrumb">
    {{ subgenus.family }}<span class="sep">/</span><a href="/species/{{ subgenus.genus }}/">{{ subgenus.genus }}</a><span class="sep">/</span>{{ subgenus.subgenus }}
  </nav>
  <h1><em>{{ subgenus.subgenus }}</em></h1>
  <p class="metadata">{{ subgenus.speciesCount }} species · {{ subgenus.totalOccurrences }} records</p>
  <div class="media-grid">
    <img loading="lazy"
         src="/data/species-maps/subgenus/{{ subgenus.genus }}/{{ subgenus.subgenus }}.svg"
         alt="Occurrence map for subgenus {{ subgenus.subgenus }} ({{ subgenus.genus }})"
         style="aspect-ratio: 15/8; width: 100%;">
    <ul class="species-list">
    {%- for sp in subgenus.species -%}
      <li>
        <span class="swatch" style="background: {{ sp.hexColor }};" aria-hidden="true"></span>
        <a href="/species/{{ sp.slug }}/"><em>{{ sp.scientificName }}</em></a>
        <span class="count">{{ sp.occurrence_count }} records</span>
      </li>
    {%- endfor -%}
    </ul>
  </div>
</article>
<script type="module" src="/src/entries/taxon-page.ts"></script>
```

Source: `_pages/genus.njk` adapted per UI-SPEC Layout Contract [VERIFIED: codebase]

### Pattern 5: Tribe Page Template

```njk
<article class="taxon-page">
  <nav class="breadcrumb">
    {{ tribe.family }}<span class="sep">/</span>{{ tribe.tribe }}
  </nav>
  <h1>{{ tribe.tribe }}</h1>
  <p class="metadata">{{ tribe.generaCount }} genera · {{ tribe.totalOccurrences }} records</p>
  <div class="media-grid">
    <img loading="lazy"
         src="/data/species-maps/tribe/{{ tribe.tribe }}.svg"
         alt="Occurrence map for tribe {{ tribe.tribe }}"
         style="aspect-ratio: 15/8; width: 100%;">
    <ul class="species-list">
    {%- for g in tribe.genera -%}
      <li>
        <a href="/species/{{ g.genus }}/"><em>{{ g.genus }}</em></a>
        <span class="count">{{ g.occurrence_count }} records</span>
      </li>
    {%- endfor -%}
    </ul>
  </div>
</article>
<script type="module" src="/src/entries/taxon-page.ts"></script>
```

Important: Tribe `<h1>` is NOT in `<em>` — tribe names are not Latinized binomials per UI-SPEC.
Source: UI-SPEC Layout Contract + `_pages/genus.njk` pattern [VERIFIED: codebase]

### Anti-Patterns to Avoid

- **Adding named exports to `_data/species.js`:** Eleventy 3 auto-unwraps the default export only when there are no named exports. All new data (`subgenusList`, `tribeList`) must go into the existing `export default { ... }` object. [VERIFIED: `_data/photos.js` comment + Phase 94 PATTERNS.md]
- **Computing colors from only resolved species:** The Python `_group_colors` for subgenus includes ALL members with `occurrence_count > 0`, including unresolved records (null `specific_epithet`). The JS color index must match. [VERIFIED: `data/species_maps.py` lines 299–342]
- **Tribe h1 in italic:** Tribe names (e.g. Andrenini) are NOT Latinized binomials — do not wrap in `<em>`. Subgenus and genus names ARE in `<em>`. [VERIFIED: UI-SPEC Typography section]
- **Omitting `loading="lazy"` on `<img>`:** The build-output test asserts this on all species page images. Follow the same discipline on new templates. [VERIFIED: `src/tests/build-output.test.ts` line 26]
- **Using a slash directly in the Nunjucks permalink for subgenus:** The permalink `/species/{{ subgenus.genus }}/{{ subgenus.subgenus }}/` requires both `genus` and `subgenus` to be separate variables, not a compound slug with a slash. This is safe because the genus and subgenus fields are always bare names (e.g., "Andrena", "Melandrena") without slashes. [VERIFIED: species.json fields]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HSL to hex conversion | New hex function | `hslToHex` already in `_data/species.js` | Numerical equivalence with Python `colorsys.hls_to_rgb` is load-bearing; do not duplicate or vary |
| SVG map generation | New Python script | Already generated by Phase 93 | 103 subgenus SVGs + 19 tribe SVGs already on disk |
| CSS layout | New CSS file | `taxon-pages.css` already has all classes needed | `.taxon-page`, `.media-grid`, `.species-list`, `.swatch`, `.breadcrumb` are sufficient |

---

## Data Inventory (Verified)

| Item | Count | Notes |
|------|-------|-------|
| Subgenus SVG files on disk | 103 | All in `public/data/species-maps/subgenus/{Genus}/{Subgenus}.svg` |
| Tribe SVG files on disk | 19 | All in `public/data/species-maps/tribe/{TribeName}.svg` (Ammobatini absent — no occurrences) |
| Unique (genus, subgenus) pairs with `occurrence_count > 0` | 103 | All have SVGs; 89 have at least one resolved species; 14 have only unresolved records |
| Unique tribes with `occurrence_count > 0` | 19 | All have SVGs |
| Tribes crossing family boundaries | 0 | All 20 WA tribes are single-family; `family` field from any member is authoritative |
| Species records with `subgenus` field populated | 513 | Includes both resolved species and unresolved records |
| Species records with `tribe` field populated | 588 | |

Source: Verified by direct inspection of `public/data/species.json` and `public/data/species-maps/`. [VERIFIED: codebase]

---

## Common Pitfalls

### Pitfall 1: Color Index Mismatch (subgenus)

**What goes wrong:** Subgenus page species list colors don't match dots in SVG map.
**Why it happens:** Building color index from only resolved species (null `specific_epithet` excluded), while Python's `_group_colors` includes ALL members with `occurrence_count > 0`.
**How to avoid:** Build `withOcc` from all subgenus members including unresolved records. Use the same colorByCanon lookup; unresolved records get `#aaaaaa`. Resolved species get the hue-formula color.
**Warning signs:** First species alphabetically in a subgenus that also has an unresolved record will have wrong hue if unresolved is excluded.

### Pitfall 2: Empty Species List for 14 Unresolved-Only Subgenus Groups

**What goes wrong:** 14 subgenus groups (e.g., Andrena/Callandrena, Apis/Apis, Bombus/Thoracobombus) have SVG maps but zero resolved species. If the template only renders `{%- for sp in subgenus.species -%}` with no fallback, these pages will show an empty list with no explanation.
**Why it happens:** Records identified to subgenus level but not to species are stored in species.json with `specific_epithet = null`. They have occurrence_count > 0 and contribute to SVGs but are excluded from the display species list.
**How to avoid:** Include these groups in `subgenusList` (they have SVG maps and totalOccurrences > 0). Template should handle `speciesCount === 0` gracefully — either omit the list or show a brief note such as "All records identified to subgenus level only."

### Pitfall 3: URL Collision

**What goes wrong:** Subgenus page at `/species/Genus/Subgenus/` collides with a species page at `/species/Genus/specificEpithet/`.
**Why it doesn't happen in practice:** Subgenus names are always capitalized (e.g., "Melandrena"); specific epithets are always lowercase (e.g., "milwaukeensis"). Eleventy static output directory creation follows the same path — they never overlap.
**Warning signs:** If data pipeline ever emits a species record with a capitalized specific epithet, this assumption breaks. Confirmed zero such records currently exist in species.json.

### Pitfall 4: Ammobatini Tribe Has No SVG

**What goes wrong:** A tribe page for Ammobatini is generated but references a non-existent SVG at `/data/species-maps/tribe/Ammobatini.svg`.
**Why it happens:** Ammobatini has only one genus (Oreopasites) with no occurrence records in the current dataset, so Phase 93 did not generate an SVG. The tribe itself appears in species.json records.
**How to avoid:** The `tribeList.filter(t => t.totalOccurrences > 0)` filter in `_data/species.js` will exclude Ammobatini automatically — confirmed it has 0 occurrences summed across all members. Verify the filter is in place.

### Pitfall 5: `tribeMap.family` from First-Encountered vs First-Alphabetically

**What goes wrong:** The UI-SPEC specifies family from first genus alphabetically. If `flat` is iterated and `family` is captured from the first record encountered for each tribe, the result is non-deterministic.
**How to avoid:** Since all WA tribes are single-family, `tribeMap[sp.tribe].family` can be set from any member. But if the tribe ever spans families in future data, set `family` from `genera[0].family` after sorting genera alphabetically (guarantees UI-SPEC rule). The safer implementation is to look up the family from `flat` filtered to the first alphabetical genus after building the genera list.

---

## Code Examples

### Subgenus Page Breadcrumb (SUBG-03 link target)
```njk
{# Source: UI-SPEC Breadcrumb Navigation section #}
<nav class="breadcrumb">
  {{ subgenus.family }}<span class="sep">/</span><a href="/species/{{ subgenus.genus }}/">{{ subgenus.genus }}</a><span class="sep">/</span>{{ subgenus.subgenus }}
</nav>
```

### Tribe Page Breadcrumb (no genus link — tribe is current page)
```njk
{# Source: UI-SPEC Breadcrumb Navigation section #}
<nav class="breadcrumb">
  {{ tribe.family }}<span class="sep">/</span>{{ tribe.tribe }}
</nav>
```

### Eleventy `genusList` export extension (existing reference)
```javascript
// Source: _data/species.js line 139 (current)
export default { tree, flat, byScientificName, counties, ecoregionL3, speciesList, genusList };
// Phase 95 target:
export default { tree, flat, byScientificName, counties, ecoregionL3, speciesList, genusList, subgenusList, tribeList };
```

### Build-Output Test Assertions (new assertions to add)
```typescript
// Source: existing pattern from src/tests/build-output.test.ts
test('emits _site/species/Andrena/Melandrena/index.html (SUBG-01, URL-03)', () => {
  const html = readFileSync(
    resolve(ROOT, '_site/species/Andrena/Melandrena/index.html'), 'utf-8'
  );
  expect(html).toContain('<em>Melandrena</em>');
  expect(html).toContain('/data/species-maps/subgenus/Andrena/Melandrena.svg');
  expect(html).toContain('class="species-list"');
});

test('subgenus page links species to species page (SUBG-03)', () => {
  const html = readFileSync(
    resolve(ROOT, '_site/species/Andrena/Melandrena/index.html'), 'utf-8'
  );
  // Andrena milwaukeensis is a Melandrena species
  expect(html).toMatch(/href="\/species\/Andrena\/milwaukeensis\/"/);
});

test('emits _site/species/tribe/Andrenini/index.html (TRIBE-01, URL-04)', () => {
  const html = readFileSync(
    resolve(ROOT, '_site/species/tribe/Andrenini/index.html'), 'utf-8'
  );
  expect(html).toContain('<h1>Andrenini</h1>'); // NOT in <em>
  expect(html).toContain('/data/species-maps/tribe/Andrenini.svg');
  expect(html).toContain('class="species-list"');
});

test('tribe page links genera to genus pages (TRIBE-03)', () => {
  const html = readFileSync(
    resolve(ROOT, '_site/species/tribe/Andrenini/index.html'), 'utf-8'
  );
  expect(html).toMatch(/href="\/species\/Andrena\/"/);
});
```

### Data-Species Unit Test Assertions (new assertions)
```typescript
test('exports subgenusList with species and totalOccurrences', () => {
  const list = (species as any).subgenusList;
  expect(Array.isArray(list)).toBe(true);
  expect(list.length).toBeGreaterThan(0);
  const melandrena = list.find((g: any) => g.genus === 'Andrena' && g.subgenus === 'Melandrena');
  expect(melandrena).toBeDefined();
  expect(typeof melandrena.speciesCount).toBe('number');
  expect(melandrena.speciesCount).toBeGreaterThan(0);
  expect(typeof melandrena.totalOccurrences).toBe('number');
});

test('subgenusList species sorted alphabetically by canonical_name', () => {
  const list = (species as any).subgenusList;
  const melandrena = list.find((g: any) => g.genus === 'Andrena' && g.subgenus === 'Melandrena');
  const names = melandrena.species.map((s: any) => s.canonical_name);
  const sorted = [...names].sort((a: string, b: string) => a.localeCompare(b));
  expect(names).toEqual(sorted);
});

test('exports tribeList with genera and totalOccurrences', () => {
  const list = (species as any).tribeList;
  expect(Array.isArray(list)).toBe(true);
  const andrenini = list.find((t: any) => t.tribe === 'Andrenini');
  expect(andrenini).toBeDefined();
  expect(andrenini.generaCount).toBeGreaterThan(0);
  expect(typeof andrenini.totalOccurrences).toBe('number');
  expect(andrenini.totalOccurrences).toBeGreaterThan(0);
});

test('tribeList genera sorted alphabetically', () => {
  const list = (species as any).tribeList;
  const halictini = list.find((t: any) => t.tribe === 'Halictini');
  const names = halictini.genera.map((g: any) => g.genus);
  const sorted = [...names].sort((a: string, b: string) => a.localeCompare(b));
  expect(names).toEqual(sorted);
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat species slug (andrena-milwaukeensis) | Hierarchical slug (Andrena/milwaukeensis) | Phase 92 | Species pages and SVG paths use nested directories |
| Single-color per-species SVG maps only | Multi-color group SVGs (genus/subgenus/tribe) | Phase 93 | Phase 95 Eleventy pages reference these pre-built group maps |
| No per-genus Eleventy pages | Genus pages generated from `genusList` | Phase 94 | Phase 95 follows the same pagination pattern |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | All WA tribe instances in species.json are single-family (no tribe spans two families) | Data Inventory / Pitfall 5 | If a tribe spans families, the family field for tribe breadcrumb needs different logic (lookup from genera list after sorting) | 

The assumption A1 was verified by querying species.json directly. [VERIFIED: codebase]

**All other claims were verified against the codebase.** No unverified assumptions remain.

---

## Open Questions (RESOLVED)

1. **Unresolved-only subgenus pages (14 groups)**
   - What we know: 14 (genus, subgenus) groups (e.g., Apis/Apis, Bombus/Thoracobombus) have SVG maps with occurrence dots but zero named species in the display list.
   - What's unclear: Should these pages be generated? If yes, what copy appears in the species list area?
   - Recommendation: Generate the pages (omit the `<ul>` when `speciesCount === 0`; the SVG map still shows where occurrences are). The UI-SPEC empty state copy ("No occurrence records for this subgenus yet.") doesn't fit these cases — occurrences exist, just no identified species. Omitting the list entirely (no copy) is cleaner. Planner should decide whether to add a note or silently omit.
   - RESOLVED: Silently omit `<ul>` when `speciesCount === 0` (wrap in `{%- if subgenus.speciesCount > 0 -%}` guard). No additional copy. Decision adopted in 95-01 Task 2.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — all required data and maps are already on disk; phase is code/config changes only).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (via vite.config.ts `test` block) |
| Config file | `vite.config.ts` (test section) |
| Quick run command | `npm test` |
| Full suite command | `npm test` (same; no separate suite) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUBG-01 | `subgenusList` species array contains only resolved species | unit | `npm test -- data-species` | ✅ `src/tests/data-species.test.ts` (extend) |
| SUBG-02 | Subgenus page `<img>` references correct SVG path | build | `npm test -- build-output` | ✅ `src/tests/build-output.test.ts` (extend) |
| SUBG-03 | Subgenus page species links go to correct species URL | build | `npm test -- build-output` | ✅ `src/tests/build-output.test.ts` (extend) |
| TRIBE-01 | `tribeList` genera array sorted alphabetically | unit | `npm test -- data-species` | ✅ `src/tests/data-species.test.ts` (extend) |
| TRIBE-02 | Tribe page `<img>` references correct SVG path | build | `npm test -- build-output` | ✅ `src/tests/build-output.test.ts` (extend) |
| TRIBE-03 | Tribe page genus links go to `/species/{Genus}/` | build | `npm test -- build-output` | ✅ `src/tests/build-output.test.ts` (extend) |
| URL-03 | Subgenus page emitted at `/species/{Genus}/{Subgenus}/` | build | `npm test -- build-output` | ✅ `src/tests/build-output.test.ts` (extend) |
| URL-04 | Tribe page emitted at `/species/tribe/{TribeName}/` | build | `npm test -- build-output` | ✅ `src/tests/build-output.test.ts` (extend) |

### Sampling Rate
- **Per task commit:** `VITEST_SKIP_BUILD=1 npm test` (unit tests only, fast)
- **Per wave merge:** `npm test` (full suite including build-output tests)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements. Tests need extending (not creating). Both test files already exist; the build-output tests already run `npm run build` in `beforeAll`.

---

## Security Domain

Not applicable — this phase generates static HTML pages from trusted build-time data. No user input, no authentication, no server runtime. `security_enforcement` context not present; static hosting constraint (from CLAUDE.md) confirms no server surface.

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 95 |
|-----------|-------------------|
| Static hosting only — no server runtime | Confirms Eleventy SSG pagination approach; no server-side routing needed |
| Python 3.14+ | Not relevant — no Python changes in Phase 95 |
| `speicmenLayer` typo in bee-map.ts is intentionally deferred | Not relevant to this phase |

Additional constraint from established patterns:
- `_data/*.js` modules: default export ONLY. Named exports break Eleventy data cascade. `subgenusList` and `tribeList` must be added as keys to the existing `export default { ... }` object. [VERIFIED: `_data/photos.js` comment + Phase 94 PATTERNS.md]

---

## Sources

### Primary (HIGH confidence — verified against codebase)
- `_data/species.js` — Current `genusList` implementation; `hslToHex` formula; default-export-only constraint
- `data/species_maps.py` lines 133–350 — `_group_colors`, `_generate_group_maps` for subgenus and tribe
- `_pages/genus.njk` — Reference template for subgenus page pattern
- `_pages/species-detail.njk` — Reference template for breadcrumb and link patterns
- `src/styles/taxon-pages.css` — All CSS classes available for reuse
- `src/tests/data-species.test.ts` — Existing test structure to extend
- `src/tests/build-output.test.ts` — Existing build-output test structure to extend
- `public/data/species.json` — 630 records; subgenus/tribe fields verified
- `public/data/species-maps/` — 103 subgenus SVGs, 19 tribe SVGs verified present
- `eleventy.config.js` — Eleventy 3.x config; `_data/` path; no changes needed
- `.planning/phases/94-species-genus-pages/94-PATTERNS.md` — Full pattern map for Phase 94

### Secondary (HIGH confidence — from Phase 94 PATTERNS.md)
- Phase 94 PATTERNS.md Pattern 1 — Eleventy pagination front-matter idiom
- Phase 94 PATTERNS.md Shared Patterns — `loading="lazy"`, default-export constraint, Nunjucks filter list
- Phase 93 93-02-SUMMARY.md — Confirms PIPE-02 complete; subgenus/tribe SVGs verified in Phase 93

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — identical to Phase 94; no new libraries
- Architecture: HIGH — direct extension of verified Phase 94 pattern
- Data shape: HIGH — verified by direct inspection of species.json and SVG file counts
- Pitfalls: HIGH — identified by tracing Python vs JS color logic; collision risk analyzed empirically

**Research date:** 2026-05-16
**Valid until:** Stable — next invalidation trigger is pipeline rerun that changes subgenus/tribe data coverage
