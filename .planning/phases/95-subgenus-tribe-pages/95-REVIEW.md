---
phase: 95-subgenus-tribe-pages
reviewed: 2026-05-15T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - _data/species.js
  - _pages/subgenus.njk
  - _pages/tribe.njk
  - src/tests/build-output.test.ts
  - src/tests/data-species.test.ts
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: issues_found
---

# Phase 95: Code Review Report

**Reviewed:** 2026-05-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 95 adds subgenus and tribe listing pages via two new Nunjucks templates (`subgenus.njk`, `tribe.njk`) and two new data groupings (`subgenusList`, `tribeList`) in `_data/species.js`. The URL scheme is sound: subgenus names are always CamelCase and specific epithets are always lowercase, so no filesystem collision can occur on macOS or Linux. The pipeline already generates all required SVG files (Phase 93). The color index logic faithfully mirrors Python's `_group_colors`. Test coverage is thorough for the happy path.

Two warnings surface around `totalOccurrences` semantics: the subgenus and tribe totals include unresolved records (no `specific_epithet`), while the pre-existing genus total excludes them. This inconsistency means a subgenus page can advertise more records than the sum of its displayed species list. Additionally, the 14 unresolved-only subgenus groups (e.g., Apis/Apis with 265 occurrences, Bombus/Thoracobombus with 81) render as "0 species · N records" with no user-facing explanation — the RESEARCH.md Pitfall 2 analysis called for an explanatory note that was not added to the template.

## Warnings

### WR-01: Subgenus `totalOccurrences` includes unresolved records absent from the species list

**File:** `_data/species.js:186`
**Issue:** `subgenusList[i].totalOccurrences` is computed over `withOcc` (all members with `occurrence_count > 0`), which includes records with `specific_epithet === null`. These unresolved records are intentionally excluded from the displayed `species` array. As a result, the page metadata "N species · M records" can have M exceed the sum of the listed species' record counts — for example, Andrena/Melandrena shows 183 total records but only 178 are attributable to the 8 named species listed. For Apis/Apis the gap is 0 species vs 265 records.

The pre-existing `genusList` has the opposite inconsistency: `totalOccurrences` is computed only over resolved species, undercounting unresolved occurrences by hundreds for data-rich genera like Agapostemon (185 shown vs 543 actual).

The current code for `subgenusList`:
```js
totalOccurrences: withOcc.reduce((acc, sp) => acc + sp.occurrence_count, 0),
```
`withOcc` contains both resolved and unresolved members.

**Fix:** Pick one convention and apply it consistently. The most honest option for subgenus is to keep the current behavior (total = all occurrences of the taxon, including unresolved identifications) but add a template note or tooltip explaining the discrepancy. Alternatively, match `genusList` and compute only over resolved species:
```js
totalOccurrences: species.reduce((acc, sp) => acc + sp.occurrence_count, 0),
```
If keeping the "all occurrences" convention for subgenus and tribe, fix `genusList` to match for consistency.

---

### WR-02: Unresolved-only subgenus pages display "0 species · N records" with no explanation

**File:** `_pages/subgenus.njk:16,22`
**Issue:** Fourteen subgenus groups (e.g., Apis/Apis: 265 occurrences; Bombus/Thoracobombus: 81; Anthidium/Proanthidium: 26) have zero resolved species but non-zero occurrence counts. These groups are correctly included in `subgenusList` (SVG maps exist and are informative), but the template renders "0 species · 265 records" and then displays nothing where the species list would be. A user landing on the Apis/Apis subgenus page sees a map and the stat line with no explanation of why the species list is absent.

`95-RESEARCH.md` Pitfall 2 explicitly noted this case and recommended either omitting the list or adding a brief note: "All records identified to subgenus level only."

Current template guard (suppresses list, adds nothing):
```njk
{%- if subgenus.speciesCount > 0 -%}
<ul class="species-list">
  ...
</ul>
{%- endif -%}
```

**Fix:** Add an `else` branch explaining the situation:
```njk
{%- if subgenus.speciesCount > 0 -%}
<ul class="species-list">
  ...
</ul>
{%- else -%}
<p class="unresolved-note">All records for this subgenus are identified to subgenus level only — no named species yet.</p>
{%- endif -%}
```

## Info

### IN-01: No test coverage for the unresolved-only subgenus page code path

**File:** `src/tests/build-output.test.ts:127-168`
**Issue:** All Phase 95 subgenus build-output tests target Andrena/Melandrena, which has 8 resolved species. There is no test asserting that an unresolved-only subgenus page (speciesCount === 0) renders correctly — specifically that no `<ul class="species-list">` is emitted and no broken `<a href="/species/.../">` links appear. If the `{% if subgenus.speciesCount > 0 %}` guard were accidentally removed, the species loop would try to render an empty array and silently produce no links, which may be hard to notice without a dedicated assertion.

A good candidate fixture is Apis/Apis (265 occurrences, 0 resolved species), or Bombus/Thoracobombus (81 occurrences).

**Fix:** Add a build-output test:
```ts
test('unresolved-only subgenus page omits species list (SUBG-04)', () => {
  // Apis/Apis: 265 occurrences, zero resolved species in WA dataset
  const html = readFileSync(
    resolve(ROOT, '_site/species/Apis/Apis/index.html'), 'utf-8'
  );
  expect(html).toContain('/data/species-maps/subgenus/Apis/Apis.svg');
  expect(html).not.toContain('class="species-list"');
});
```

---

_Reviewed: 2026-05-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
