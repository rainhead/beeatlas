---
phase: 81-filter-ux-nav
plan: 02
subsystem: taxon-nav-tree
tags: [ssr, nunjucks, lit, light-dom, nav, link-03, decorate-ssr]
requires:
  - 81-01 (buildSpaTaxonLink shape, Wave 0 RED stubs)
provides:
  - _includes/taxon-tree.njk recursive macro (renderTree, renderNode, renderFamily..renderSubgenus)
  - _data/species.js extended with counties[] + ecoregionL3[] from seasonality.json
  - src/species/bee-taxon-nav.ts decorate-SSR Lit presenter
  - SSR'd <bee-taxon-nav> on /species/ with NAV-01..05 + LINK-03 hrefs
affects:
  - _pages/species.njk (renderTree invocation prepended above bee-species-page)
tech-stack:
  added: []
  patterns:
    - decorate-SSR Lit (light DOM + no render override; pattern established by bee-species-card in Phase 80)
    - Nunjucks recursive include/macro composition keyed by taxon level
    - dictsort filter for stable iteration order over Object children
key-files:
  created:
    - _includes/taxon-tree.njk
    - src/species/bee-taxon-nav.ts
    - .planning/phases/081-filter-ux-nav/081-02-SUMMARY.md
  modified:
    - _data/species.js
    - _pages/species.njk
decisions:
  - NAV-02 subgenus-skip implemented at the genus level (renderGenus inspects
    node.children keys), not at the subgenus level as the plan pseudocode
    suggested. Reason: buildTree in _data/species.js stores species rows on
    the subgenus leaf node and leaves its children empty, so the subgenus key
    set is only visible from the genus's perspective.
  - Used Nunjucks bracket notation `node.children["null"]` instead of dot
    notation; `null` is a Nunjucks literal and parses as a token, breaking
    template compilation.
  - Dispatch separate single-purpose macros (renderFamily, renderSubfamily,
    renderTribe, renderGenus, renderSubgenus, renderSpecies) instead of one
    polymorphic renderNode. Same SSR output, but each level encodes its own
    NAV/LINK rules locally — easier to audit against PATTERNS.md and to
    extend in Plans 03–05.
metrics:
  duration: ~12 minutes
  tasks_completed: 3
  files_created: 2 (excluding SUMMARY.md)
  files_modified: 2
  tests_added: 0 (turns 5 prior RED tests GREEN)
  completed: 2026-05-04
---

# Phase 81 Plan 02: SSR Taxon Tree + bee-taxon-nav Presenter Summary

**One-liner:** Shipped the server-rendered family→subfamily→tribe→genus→subgenus→species tree as nested `<details>/<ul>` plus the decorate-SSR `<bee-taxon-nav>` Lit element that mutes filtered branches in place (NAV-01..05, LINK-03), turning the Plan 01 Wave 0 RED stubs in `bee-taxon-nav.test.ts` GREEN.

## Tasks Completed

| Task | Name                                                                | Commit  |
| ---- | ------------------------------------------------------------------- | ------- |
| 1    | Extend `_data/species.js` with counties + ecoregionL3 option lists  | d4231d6 |
| 2    | Create `_includes/taxon-tree.njk` macro and embed in species.njk    | f16c157 |
| 3    | Create `src/species/bee-taxon-nav.ts` decorate-SSR Lit presenter    | a8b6ac7 |

## RED → GREEN Transition

`src/tests/bee-taxon-nav.test.ts` (5 tests authored in Plan 01):

- **NAV-01/05** `does NOT override render() — preserves Eleventy SSR tree`
  → GREEN (prototype-identity match against `LitElement.prototype.render`).
- **declares activeTaxonPath @property** → GREEN (`@property({ attribute: false })`
  registers the property in `BeeTaxonNav.elementProperties`).
- **NAV-04 mute-not-hide** → GREEN (`_applyMuteClasses` toggles `.muted` on
  filtered `<li[data-taxon]>`; never touches `display`).
- **NAV-03 click dispatches taxon-selected** → GREEN (delegate-click walks
  ancestor `<li[data-taxon]>` chain to build `path` + `rank`, fires bubbling
  + composed `CustomEvent`).
- **NAV-05 light-DOM** → GREEN (`createRenderRoot()` returns `this`).

```
$ npm test -- --run src/tests/bee-taxon-nav.test.ts src/tests/arch.test.ts
 Test Files  2 passed (2)
      Tests  29 passed (29)
```

`arch.test.ts` ARCH-04 + PAGE-06 boundary checks pass on the new file: no
forbidden static or dynamic imports, no coordinator import.

## NAV-02 Subgenus-skip Implementation Details

The plan pseudocode placed the skip-rule at `level === 4`, but inspecting
`buildTree` in `_data/species.js` shows that species rows are pushed onto the
subgenus *leaf* node (its `children` map is empty afterward). The set of
subgenus keys is therefore only visible from the genus's perspective.

`renderGenus` resolves this by inspecting its own `node.children`:

```njk
{%- set keys = node.children | dictsort -%}
{%- set onlyNull = (keys | length == 1) and (node.children["null"] is defined) -%}
<li data-taxon="{{ name }}" data-rank="genus">
  <details>
    <summary><a href="/?taxon={{ name | urlencode }}&taxonRank=genus">{{ name }}</a></summary>
    <ul>
      {%- if onlyNull -%}
        {{ renderSpecies(node.children["null"].rows) }}
      {%- else -%}
        {%- for subgKey, subgNode in keys -%}
          {{ renderSubgenus(subgKey, subgNode) }}
        {%- endfor -%}
      {%- endif -%}
    </ul>
  </details>
</li>
```

When `onlyNull` is true, species are rendered directly under the genus's
`<ul>` and the synthetic `(no subgenus)` wrapper is suppressed. When real
subgenera exist, the literal `'null'` key is preserved and labeled
`(no subgenus)` — Phase 80 buildTree encoding.

Tree counts after build (`npx eleventy`):

- Total `<details>` elements: 435
- `data-rank="species"` `<li>`s: 735 (matches `species.flat.length`)
- `taxonRank=family` href occurrences: 31 (one per family — bee + non-bee
  families that hold occurrence records)
- `taxonRank=genus` href occurrences: 128 (one per genus)
- `taxonRank=species` href occurrences: 735

## LINK-03 Compatibility

Family/genus/species `<a href>` values are pre-baked at Eleventy build time
to match `buildSpaTaxonLink(name, rank)` (Plan 01, `src/lib/spa-link.ts`):
`/?taxon=<urlencoded-name>&taxonRank=<family|genus|species>`. Subfamily and
tribe summaries render as plain text because `src/url-state.ts` only resolves
`family|genus|species` ranks (Phase 80 invariant).

## counties / ecoregionL3 Derivation

`_data/species.js` now reads `public/data/seasonality.json` at build time and
derives two arrays from key prefixes (Phase 78 pipeline encoding):

- `counties` — `String[]` of 39 county names from `county:<name>` keys.
- `ecoregionL3` — `String[]` of 9 EPA L3 ecoregion names from
  `ecoregion_l3:<name>` keys.

Both are sorted and exposed on `species.counties` / `species.ecoregionL3` for
Plan 03's `<bee-species-filter>` widget. Pitfall #8 invariant preserved:
`grep -c "parquet" _data/species.js` returns 0; the
`src/tests/data-species.test.ts` parquet-prohibition assertion stays GREEN.

## Build Verification

Full `npm run build` is partially red because Plan 01's intentional Wave 0
RED stubs (`bee-species-filter.test.ts`, `seasonality-viz.test.ts`) reference
modules that Plans 03–05 will create. This was anticipated and is documented
in `081-01-SUMMARY.md` lines 68–73. The Eleventy template build itself
(`npx eleventy`) succeeds end-to-end and emits the expected SSR markup.

## Deviations from Plan

### [Rule 3 - Blocking] Worktree missing public/data symlink

- **Found during:** Task 1 (data-species test fails to import seasonality.json)
- **Issue:** `public/data/` is gitignored and absent from the parallel-executor
  worktree, so `_data/species.js` cannot resolve `seasonality.json`.
- **Fix:** Symlinked `public → /Users/rainhead/dev/beeatlas/public` inside
  the worktree (the symlink itself is gitignored so it does not enter any
  commit).
- **Files modified:** none committed; symlink only.

### [Rule 1 - Bug] Nunjucks `null` literal in property access

- **Found during:** Task 2 (first `npx eleventy` run)
- **Issue:** `node.children.null` is parsed by Nunjucks as a literal token,
  not a property name, and aborts template compilation with
  `expected name as lookup value, got null`.
- **Fix:** Switched to bracket notation `node.children["null"]` in both the
  `onlyNull` test and the species-rows access.
- **Files modified:** `_includes/taxon-tree.njk`
- **Commit:** rolled into f16c157.

### [Plan deviation - Architectural pseudocode mismatch]

- **Found during:** Task 2 (translating plan pseudocode to live macros)
- **Issue:** The plan's pseudocode placed the NAV-02 skip-rule at
  `level === 4`, but `buildTree` stores species rows on the subgenus node and
  leaves its `children` empty, so the key inspection has to happen at
  level=3 (genus). Documented in the `decisions:` frontmatter and §NAV-02
  Implementation Details above. Same SSR output as plan intent — only the
  control-flow location moved.

## Self-Check: PASSED

- _includes/taxon-tree.njk — FOUND
- src/species/bee-taxon-nav.ts — FOUND
- _data/species.js (modified, exports counties/ecoregionL3) — FOUND
- _pages/species.njk (renderTree imported + invoked) — FOUND
- Commit d4231d6 — FOUND
- Commit f16c157 — FOUND
- Commit a8b6ac7 — FOUND
- `npm test -- --run src/tests/bee-taxon-nav.test.ts` exits 0 — VERIFIED
- `npm test -- --run src/tests/arch.test.ts` exits 0 — VERIFIED
- `npm test -- --run src/tests/data-species.test.ts` exits 0 — VERIFIED
