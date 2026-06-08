---
phase: 260607-syt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - _data/species.js
  - src/tests/data-species.test.ts
  - _pages/genus.njk
autonomous: true
requirements: [genus-page-subgenera-breakout]

must_haves:
  truths:
    - "Each genusList entry exposes a subgenera array (alphabetical) and an ungroupedSpecies array"
    - "The union of subgenera[].species + ungroupedSpecies equals the existing species array (no drops, no dupes, same objects/colors)"
    - "The synthetic 'Genus sp.' entry lands in ungroupedSpecies, never in a subgenus"
    - "/species/Andrena/ renders an <h2> per subgenus linking to /species/Andrena/{Subgenus}/index.html, with that subgenus's species below it"
    - "A genus with no subgenera falls back to today's flat species list (D-05 pattern)"
  artifacts:
    - path: "_data/species.js"
      provides: "genusList entries with subgenera[] and ungroupedSpecies[]"
      contains: "subgenera"
    - path: "_pages/genus.njk"
      provides: "grouped subgenus rendering with flat fallback"
      contains: "taxon-members"
    - path: "src/tests/data-species.test.ts"
      provides: "grouping + lossless-partition tests"
      contains: "ungroupedSpecies"
  key_links:
    - from: "_pages/genus.njk"
      to: "genus.subgenera / genus.ungroupedSpecies"
      via: "Nunjucks for-loop over precomputed data"
      pattern: "genus\\.subgenera"
    - from: "_pages/genus.njk"
      to: "/species/{Genus}/{Subgenus}/"
      via: "subgenus heading link"
      pattern: "/species/\\{\\{ genus\\.genus \\}\\}/\\{\\{ sg\\.subgenus \\}\\}"
---

<objective>
Group the genus species list by subgenus on genus pages. When a genus has ≥1 subgenus,
render an `<h2>` per subgenus (linking to the subgenus page) followed by that subgenus's
species, with subgenus-less species (and the synthetic "Genus sp." entry) in a trailing
unheaded flat list. Genera with no subgenus keep today's flat list.

Purpose: parity with the nested subfamily.njk layout; makes large genera (e.g. Andrena, 22 subgenera) navigable.
Output: extended genusList data in _data/species.js, grouped rendering in _pages/genus.njk, and grouping/lossless-partition tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md

@_data/species.js
@_pages/genus.njk
@_pages/subfamily.njk
@_pages/subgenus.njk
@src/tests/data-species.test.ts

<interfaces>
<!-- Verified facts from the codebase — executor needs no further exploration. -->

genusList entries (built at _data/species.js ~89-133) already carry:
  { genus, family, subfamily, species, speciesCount, totalOccurrences, taxon_id }

`species` is built as `[...speciesOnly, ...checklistSpecies]` then optionally
appended with a synthetic `{ scientificName: `${genus} sp.`, hexColor: '#aaaaaa',
occurrence_count, specimen_count, inat_obs_count, slug: null }` (no canonical_name, no subgenus).

VERIFIED: each non-synthetic entry is `{ ...sp, hexColor }` spread from a flat row,
and flat rows carry a `subgenus` field (confirmed: Andrena rows have subgenus="Andrena",
22 distinct Andrena subgenera). So `subgenus` is ALREADY present on genus.species entries —
no mapping change needed to carry it through. The synthetic "Genus sp." entry has NO subgenus.

Subgenus guard convention (from subgenusList build, species.js ~141):
  treat as "in a subgenus" only when `sp.subgenus` is a non-empty trimmed string.

subgenus page permalink (from _pages/subgenus.njk): /species/{Genus}/{Subgenus}/
Link form used elsewhere for index files: /species/{Genus}/{Subgenus}/index.html

subfamily.njk template precedent (the EXACT layout to mirror):
  - `.media-grid` has TWO children: the <img> SVG map, then a single `.taxon-members` <div>.
  - Inside `.taxon-members`: when groups exist, `<h2><a href=...>Group</a></h2>` + `<ul class="species-list">`, repeated; else a single flat `<ul class="species-list">`.

Existing per-species <li> markup in genus.njk (~24-34) to REUSE verbatim:
  swatch span + (slug ? <a><em>name</em></a> : <em>name</em>) + count span with
  occurrence_count>0 / on_checklist / else(0) branches, all via `quantify` filter.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add subgenera[] + ungroupedSpecies[] to genusList, with tests</name>
  <files>_data/species.js, src/tests/data-species.test.ts</files>
  <behavior>
    - genusList Andrena entry has non-empty `subgenera`; each entry is `{ subgenus: string, species: array }`.
    - subgenera sorted alphabetically by `subgenus` name.
    - Lossless partition: for Andrena, `[...subgenera.flatMap(s=>s.species), ...ungroupedSpecies]` has same length AND same set of (canonical_name ?? scientificName) as `species`.
    - The synthetic `${genus} sp.` entry (when present) is in `ungroupedSpecies`, never in any subgenus.
    - A genus with NO subgenera has `subgenera.length === 0` and a non-empty `ungroupedSpecies`/`species`.
    - hexColors are preserved (each subgenera[].species / ungroupedSpecies entry is the SAME object reference as in `species`, so color is untouched).
    - All existing tests stay green.
  </behavior>
  <action>
    In _data/species.js, inside the genusList `.map(g => {...})` (currently ~91-133), AFTER the `species` array is fully assembled (including the optional synthetic "Genus sp." push at ~121-123) and BEFORE the `return`, compute two new fields from the already-built `species` array (do NOT rebuild from `allMembers` — derive from `species` so colors/objects are preserved exactly):
      - Partition `species` into grouped vs ungrouped using the existing guard convention (species.js ~141): a species is "in a subgenus" only when `sp.subgenus` is a non-empty trimmed string. The synthetic entry has no subgenus so it falls to ungrouped automatically.
      - `ungroupedSpecies` = species with no (non-empty trimmed) subgenus, preserving their existing order.
      - `subgenera` = group the grouped species by `sp.subgenus`, producing `{ subgenus, species }` objects, sorted alphabetically by `subgenus` via localeCompare. Within each group preserve the species' existing relative order from `species` (do NOT re-sort the species themselves — they are already in the established display order).
    Add `subgenera` and `ungroupedSpecies` to the returned object alongside existing fields. Keep `species` as-is (back-compat + flat fallback). Do not recompute any hexColor.
    Then extend src/tests/data-species.test.ts (add tests at the end of the existing `_data/species.js (PAGE-02)` describe block) covering every item in <behavior>. Reuse the existing `species` import. For the "no subgenera" case, find a genus whose every species lacks a subgenus by scanning genusList for one with `subgenera.length === 0` rather than hardcoding a name (data-driven). Use `canonical_name ?? scientificName` as the identity key so the synthetic entry is handled.
  </action>
  <verify>
    <automated>npx vitest run src/tests/data-species.test.ts</automated>
  </verify>
  <done>All data-species tests pass, including new subgenera grouping + lossless-partition + synthetic-entry placement + no-subgenera-fallback tests.</done>
</task>

<task type="auto">
  <name>Task 2: Render grouped subgenus sections in genus.njk</name>
  <files>_pages/genus.njk</files>
  <action>
    Replace the single `<ul class="species-list">…</ul>` block inside `.media-grid` (genus.njk ~22-36) with a single `.taxon-members` <div> wrapper that mirrors subfamily.njk exactly (so the 2-col map|members grid is preserved and sections stack vertically):
      - If `genus.subgenera.length > 0`: for each `sg` in `genus.subgenera`, emit `<h2><a href="/species/{{ genus.genus }}/{{ sg.subgenus }}/index.html"><em>{{ sg.subgenus }}</em></a></h2>` followed by a `<ul class="species-list">` iterating `sg.species`, using the EXACT existing per-species `<li>` markup (swatch + slug/name + count span with the occurrence/checklist/zero branches and quantify filters — copy verbatim from the current block). After the subgenus loop, if `genus.ungroupedSpecies.length`, emit one trailing `<ul class="species-list">` (NO heading) iterating `genus.ungroupedSpecies` with the same `<li>` markup.
      - Else: emit today's flat `<ul class="species-list">` iterating `genus.species` (D-05 fallback), unchanged markup.
    Do NOT change the page header, the metadata `<p>`, the SVG `<img>`, or the `taxon-action` links. The `<img>` stays as the first child of `.media-grid`; `.taxon-members` is the second child.
  </action>
  <verify>
    <automated>npm run build && grep -q 'species/Andrena/' _site/species/Andrena/index.html &amp;&amp; grep -E -c '&lt;h2&gt;&lt;a href="/species/Andrena/[^/]+/index.html"' _site/species/Andrena/index.html</automated>
  </verify>
  <done>`npm run build` succeeds; built _site/species/Andrena/index.html contains multiple subgenus `<h2>` headings linking to /species/Andrena/{Subgenus}/index.html; a small no-subgenus genus page still renders its flat list; no "1 counties"-style quantify regressions (the <li> count markup was copied verbatim).</done>
</task>

</tasks>

<verification>
- `npx vitest run` is fully green (new + existing tests).
- `npm run build` succeeds (tsc --noEmit → eleventy + Vite).
- _site/species/Andrena/index.html shows subgenus `<h2>` sections linking to subgenus pages, plus a trailing unheaded list for subgenus-less / "Andrena sp." entries.
- A genus with no subgenera renders the flat fallback list unchanged.
- No Python/dbt/pipeline changes; no count/rollup changes.
</verification>

<success_criteria>
- genusList entries expose `subgenera` (alphabetical) and `ungroupedSpecies`; lossless-partition invariant holds and is tested.
- Synthetic "Genus sp." entry sits in `ungroupedSpecies`.
- genus.njk groups by subgenus when present, falls back to flat list otherwise, preserving all existing per-species markup (swatch, link, counts) and the 2-col media-grid.
- Existing colors (hexColor) untouched — same object references reused.
</success_criteria>

<output>
Create `.planning/quick/260607-syt-break-out-subgenera-on-genus-pages-group/260607-syt-SUMMARY.md` when done
</output>
