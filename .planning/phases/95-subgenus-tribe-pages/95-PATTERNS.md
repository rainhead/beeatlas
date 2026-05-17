# Phase 95: Subgenus & Tribe Pages — Pattern Map

**Mapped:** 2026-05-15
**Files analyzed:** 4 (2 new, 2 extended)
**Analogs found:** 4 / 4

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `_pages/subgenus.njk` | template (SSG pagination) | transform | `_pages/genus.njk` | exact |
| `_pages/tribe.njk` | template (SSG pagination) | transform | `_pages/genus.njk` | exact |
| `_data/species.js` | data provider (SSG) | transform / batch | `_data/species.js` (existing `genusList` block) | exact (self-extension) |
| `src/tests/data-species.test.ts` | test | — | `src/tests/data-species.test.ts` (existing `genusList` tests) | exact (self-extension) |
| `src/tests/build-output.test.ts` | test | — | `src/tests/build-output.test.ts` (existing genus page tests) | exact (self-extension) |

---

## Pattern Assignments

### `_pages/subgenus.njk` (template, SSG pagination)

**Analog:** `_pages/genus.njk` (entire file, 33 lines)

**Front matter / pagination pattern** (lines 1–10):
```njk
---
pagination:
  data: species.genusList
  size: 1
  alias: genus
permalink: "/species/{{ genus.genus }}/"
eleventyComputed:
  title: "{{ genus.genus }} — BeeAtlas"
layout: default.njk
---
```
Adapt for subgenus: `data: species.subgenusList`, `alias: subgenus`, permalink becomes
`/species/{{ subgenus.genus }}/{{ subgenus.subgenus }}/`, title becomes
`{{ subgenus.subgenus }} ({{ subgenus.genus }}) — BeeAtlas`.

**Breadcrumb pattern** (line 13):
```njk
{{ genus.family }}<span class="sep">/</span>{{ genus.genus }}
```
Adapt for subgenus — add the genus link and subgenus as the trailing plain-text segment:
```njk
{{ subgenus.family }}<span class="sep">/</span><a href="/species/{{ subgenus.genus }}/">{{ subgenus.genus }}</a><span class="sep">/</span>{{ subgenus.subgenus }}
```

**h1 pattern** (line 15):
```njk
<h1><em>{{ genus.genus }}</em></h1>
```
Adapt: `<h1><em>{{ subgenus.subgenus }}</em></h1>`. Subgenus names ARE in `<em>`.

**Metadata line** (line 16):
```njk
<p class="metadata">{{ genus.speciesCount }} species · {{ genus.totalOccurrences }} records</p>
```
Copy verbatim, swapping `genus` for `subgenus`.

**SVG img pattern** (lines 18–21):
```njk
<img loading="lazy"
     src="/data/species-maps/genus/{{ genus.genus }}.svg"
     alt="Occurrence map for genus {{ genus.genus }}"
     style="aspect-ratio: 15/8; width: 100%;">
```
Adapt src to `/data/species-maps/subgenus/{{ subgenus.genus }}/{{ subgenus.subgenus }}.svg`,
alt text to `Occurrence map for subgenus {{ subgenus.subgenus }} ({{ subgenus.genus }})`.
`loading="lazy"` is mandatory (asserted by build-output test line 26).

**Species list loop** (lines 22–30):
```njk
<ul class="species-list">
{%- for sp in genus.species -%}
  <li>
    <span class="swatch" style="background: {{ sp.hexColor }};" aria-hidden="true"></span>
    <a href="/species/{{ sp.slug }}/"><em>{{ sp.scientificName }}</em></a>
    <span class="count">{{ sp.occurrence_count }} records</span>
  </li>
{%- endfor -%}
</ul>
```
Copy verbatim, swapping `genus.species` for `subgenus.species`. Link target `/species/{{ sp.slug }}/` is unchanged (slug is already `Genus/specificEpithet`).

**Empty state addition** (no analog — new for unresolved-only subgenus groups):
Wrap the `<ul>` in a Nunjucks conditional. When `subgenus.speciesCount === 0`, omit the list
entirely (per RESEARCH.md Open Questions recommendation — silently omit, the SVG map still shows occurrences).

**Script tag** (line 33):
```njk
<script type="module" src="/src/entries/taxon-page.ts"></script>
```
Copy verbatim.

---

### `_pages/tribe.njk` (template, SSG pagination)

**Analog:** `_pages/genus.njk` (entire file, 33 lines)

**Front matter / pagination pattern** (lines 1–10):
```njk
---
pagination:
  data: species.genusList
  size: 1
  alias: genus
permalink: "/species/{{ genus.genus }}/"
eleventyComputed:
  title: "{{ genus.genus }} — BeeAtlas"
layout: default.njk
---
```
Adapt: `data: species.tribeList`, `alias: tribe`, permalink `/species/tribe/{{ tribe.tribe }}/`,
title `{{ tribe.tribe }} — BeeAtlas`.

**Breadcrumb pattern** (line 13):
```njk
{{ genus.family }}<span class="sep">/</span>{{ genus.genus }}
```
Adapt for tribe (two-segment, no genus link — tribe IS the current page):
```njk
{{ tribe.family }}<span class="sep">/</span>{{ tribe.tribe }}
```

**h1 pattern** (line 15):
```njk
<h1><em>{{ genus.genus }}</em></h1>
```
Adapt: `<h1>{{ tribe.tribe }}</h1>`. Tribe names are NOT in `<em>` — they are not Latinized binomials.
This is the key difference from subgenus and genus templates.

**Metadata line** (line 16):
```njk
<p class="metadata">{{ genus.speciesCount }} species · {{ genus.totalOccurrences }} records</p>
```
Adapt: `<p class="metadata">{{ tribe.generaCount }} genera · {{ tribe.totalOccurrences }} records</p>`.

**SVG img pattern** (lines 18–21):
```njk
<img loading="lazy"
     src="/data/species-maps/genus/{{ genus.genus }}.svg"
     alt="Occurrence map for genus {{ genus.genus }}"
     style="aspect-ratio: 15/8; width: 100%;">
```
Adapt src to `/data/species-maps/tribe/{{ tribe.tribe }}.svg`,
alt text to `Occurrence map for tribe {{ tribe.tribe }}`.
`loading="lazy"` mandatory.

**Genus list loop** (adapting lines 22–30):
```njk
<ul class="species-list">
{%- for g in tribe.genera -%}
  <li>
    <a href="/species/{{ g.genus }}/"><em>{{ g.genus }}</em></a>
    <span class="count">{{ g.occurrence_count }} records</span>
  </li>
{%- endfor -%}
</ul>
```
Key difference from genus/subgenus: NO `<span class="swatch">` on tribe genus list entries.
Genus name IS in `<em>`. Link target `/species/{{ g.genus }}/`.

**Script tag** (line 33):
```njk
<script type="module" src="/src/entries/taxon-page.ts"></script>
```
Copy verbatim.

---

### `_data/species.js` — extend with `subgenusList` and `tribeList`

**Analog:** `_data/species.js` lines 99–139 (existing `genusList` block and export line)

**Insertion point:** After the closing of the `genusList` block and before the `export default` line (currently line 139).

**`genusList` block to mirror** (lines 103–137):
```javascript
const genusMap = {};
for (const sp of flat) {
  if (!genusMap[sp.genus]) {
    genusMap[sp.genus] = { genus: sp.genus, family: sp.family, subfamily: sp.subfamily, allMembers: [] };
  }
  genusMap[sp.genus].allMembers.push(sp);
}
const genusList = Object.values(genusMap)
  .sort((a, b) => a.genus.localeCompare(b.genus))
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
    const species = withOcc
      .filter(sp => sp.specific_epithet !== null)
      .map(sp => ({ ...sp, hexColor: colorByCanon[sp.canonical_name] }));
    return {
      genus: g.genus,
      family: g.family,
      subfamily: g.subfamily,
      species,
      speciesCount: species.length,
      totalOccurrences: species.reduce((acc, sp) => acc + sp.occurrence_count, 0),
    };
  });
```
`subgenusList` mirrors this pattern exactly but:
- Groups on composite key `${sp.genus}::${sp.subgenus}` (skip entries where `sp.subgenus` is null/empty).
- Group object carries `genus`, `subgenus`, `family`, `subfamily`, `tribe`, `allMembers`.
- Sort: `a.genus.localeCompare(b.genus) || a.subgenus.localeCompare(b.subgenus)`.
- `totalOccurrences` sums `withOcc` (all members including unresolved), not just resolved species — matches Python `_group_colors` input.
- Add `.filter(g => g.totalOccurrences > 0)` at the end (genus page omits this but subgenus needs it to exclude Ammobatini-equivalent groups with zero occurrences).

`tribeList` uses the same `flat` iteration but accumulates genus-level occurrence sums:
- Group on `sp.tribe` (skip null/empty).
- `generaMap[sp.genus] += sp.occurrence_count` per member.
- Output shape: `{ tribe, family, genera: [{genus, occurrence_count}], generaCount, totalOccurrences }`.
- No color computation (tribe page has no per-entry swatches).
- Sort genera alphabetically before returning.
- Add `.filter(t => t.totalOccurrences > 0)` to exclude Ammobatini (0 occurrences).

**`hslToHex` function** (lines 80–94) — already present; do NOT duplicate.

**Export line** (line 139):
```javascript
export default { tree, flat, byScientificName, counties, ecoregionL3, speciesList, genusList };
```
Extend to:
```javascript
export default { tree, flat, byScientificName, counties, ecoregionL3, speciesList, genusList, subgenusList, tribeList };
```
Critical constraint: named exports break Eleventy data cascade. All additions MUST be keys inside this single default export object.

---

### `src/tests/data-species.test.ts` — extend with subgenus/tribe unit tests

**Analog:** `src/tests/data-species.test.ts` lines 40–65 (existing `genusList` tests)

**Test structure to copy** (lines 40–55):
```typescript
test('exports genusList with speciesCount and totalOccurrences', () => {
  const list = (species as any).genusList;
  expect(Array.isArray(list)).toBe(true);
  expect(list.length).toBeGreaterThan(0); // 42 genera
  const agapostemon = list.find((g: any) => g.genus === 'Agapostemon');
  expect(agapostemon).toBeDefined();
  expect(typeof agapostemon.speciesCount).toBe('number');
  expect(typeof agapostemon.totalOccurrences).toBe('number');
});

test('genusList species sorted alphabetically by canonical_name (D-02)', () => {
  const list = (species as any).genusList;
  const agapostemon = list.find((g: any) => g.genus === 'Agapostemon');
  const names = agapostemon.species.map((s: any) => s.canonical_name);
  const sorted = [...names].sort((a: string, b: string) => a.localeCompare(b));
  expect(names).toEqual(sorted);
});
```
New tests follow this exact `.find()` + field assertion + sort-check pattern.
Substitute: `subgenusList` keyed by `{genus: 'Andrena', subgenus: 'Melandrena'}`, `tribeList` keyed by `{tribe: 'Andrenini'}` or `{tribe: 'Halictini'}`.

**Import block** (lines 1–10): no changes needed — `species` import already covers the extended export.

**Placement:** Append new `test()` calls inside the existing `describe('_data/species.js (PAGE-02)', ...)` block.

---

### `src/tests/build-output.test.ts` — extend with subgenus/tribe page emission tests

**Analog:** `src/tests/build-output.test.ts` lines 96–111 (existing genus page tests)

**Test structure to copy** (lines 96–111):
```typescript
test('emits _site/species/Agapostemon/index.html (GEN-01, URL-02, PIPE-01)', () => {
  const html = readFileSync(
    resolve(ROOT, '_site/species/Agapostemon/index.html'), 'utf-8'
  );
  expect(html).toContain('<em>Agapostemon</em>');
  expect(html).toContain('/data/species-maps/genus/Agapostemon.svg');
  expect(html).toContain('class="species-list"');
  expect(html).toMatch(/background:\s*#80d926/);
});

test('genus page links each species to its species page (GEN-03)', () => {
  const html = readFileSync(
    resolve(ROOT, '_site/species/Agapostemon/index.html'), 'utf-8'
  );
  expect(html).toMatch(/href="\/species\/Agapostemon\/femoratus\/"/);
});
```
New tests for subgenus use path `_site/species/Andrena/Melandrena/index.html`,
check for `<em>Melandrena</em>`, SVG path `/data/species-maps/subgenus/Andrena/Melandrena.svg`,
`class="species-list"`, and a species link like `href="/species/Andrena/milwaukeensis/"`.

New tests for tribe use path `_site/species/tribe/Andrenini/index.html`,
check for `<h1>Andrenini</h1>` (not in `<em>`), SVG path `/data/species-maps/tribe/Andrenini.svg`,
`class="species-list"`, and a genus link like `href="/species/Andrena/"`.

**`beforeAll` and `describe.skipIf(SKIP_BUILD)` wrappers** (lines 15–17): do NOT duplicate.
Append new `test()` calls inside the existing `describe.skipIf(SKIP_BUILD)(...)` block.

**`ROOT` constant** (line 12): already defined; reuse.

---

## Shared Patterns

### Eleventy data cascade — default export only
**Source:** `_data/species.js` line 139; confirmed by `_data/photos.js` comment and Phase 94 PATTERNS.md.
**Apply to:** All additions to `_data/species.js`.
```javascript
// CORRECT — all data as keys of a single default export:
export default { tree, flat, byScientificName, counties, ecoregionL3, speciesList, genusList, subgenusList, tribeList };

// WRONG — named exports break Eleventy data cascade:
export { subgenusList };
export const tribeList = ...;
```

### `loading="lazy"` on all `<img>` tags
**Source:** `src/tests/build-output.test.ts` line 26 (asserted across all pages).
**Apply to:** Both new Nunjucks templates.
```njk
<img loading="lazy" src="..." alt="..." style="aspect-ratio: 15/8; width: 100%;">
```

### `hslToHex` — do not duplicate
**Source:** `_data/species.js` lines 80–94.
**Apply to:** `subgenusList` color computation in `_data/species.js`.
The function is already present in scope; call it directly. Do not copy or inline it.

### Color index must include unresolved records
**Source:** `_data/species.js` lines 113–124 (genusList `withOcc` comment and `colorByCanon` block).
**Apply to:** `subgenusList` color computation.
`withOcc` must include ALL members with `occurrence_count > 0`, not only those with `specific_epithet !== null`. Unresolved entries get `#aaaaaa`; resolved entries get the HSL-formula color. Resolved-only color indexing produces a mismatch with the Python-generated SVG.

### `taxon-page.ts` entry script tag
**Source:** `_pages/genus.njk` line 33.
**Apply to:** Both new Nunjucks templates.
```njk
<script type="module" src="/src/entries/taxon-page.ts"></script>
```

### `.taxon-page` / `.media-grid` / `.species-list` / `.swatch` CSS classes
**Source:** `src/styles/taxon-pages.css` (existing, unchanged).
**Apply to:** Both new Nunjucks templates.
No new CSS file needed. Reuse these classes exactly as in `_pages/genus.njk`.

---

## No Analog Found

All files have close analogs. No entries in this section.

---

## Metadata

**Analog search scope:** `_pages/`, `_data/`, `src/tests/`
**Files read:** 6 (`genus.njk`, `species.js`, `data-species.test.ts`, `build-output.test.ts`, `95-RESEARCH.md`, `95-UI-SPEC.md`)
**Pattern extraction date:** 2026-05-15
