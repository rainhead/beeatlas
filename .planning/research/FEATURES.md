# Feature Research

**Domain:** Biodiversity occurrence atlas — taxonomy hierarchy browse/filter for a bee-only static site
**Researched:** 2026-06-01
**Milestone:** v4.6 Taxonomy Hierarchy & Normalization
**Confidence:** HIGH (domain patterns from iNaturalist and comparable sites; implementation details from codebase inspection)

---

## Scope Constraints That Shape Every Feature Decision

- **Static hosting, no server runtime.** All taxon–occurrence joins must be materialized at pipeline time. No real-time descendant queries against a live DB.
- **~90K occurrences, ~600 bee species.** This is small enough to load entire occurrence sets into wa-sqlite in-browser; there is no pagination or streaming requirement.
- **Bee-only browse tree.** Non-bee bycatch taxa live in the hierarchy so their map points resolve to a name, but they get no tree nodes, no autocomplete entries, and no taxon pages. Filtering the tree to Anthophila is a pipeline-time decision.
- **Two sources, two count types.** Every per-node count must split into: Ecdysis specimens (physical vouchers) and iNaturalist community observations. This split is already established on per-taxon pages; the tree extends the same visual language.
- **Existing per-taxon pages are the content backend.** The tree is navigation TO those pages, not a replacement for them. Links from tree nodes to taxon pages are load-bearing; the pages already handle the detail rendering.
- **Checklist-only species (no occurrences) must remain visible** with their existing badge treatment. They are expected in the tree at the species leaf level.
- **Floral hosts: out of scope.**

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that must ship for the milestone to feel complete. These mirror what iNaturalist, GBIF, and ALA all provide at comparable scales. Missing any of these makes the taxonomy browse feel unfinished.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Expandable tree default view (family → genus → species) | Every taxonomy browse site (iNat life list, ALA classification tab, GBIF species page) shows the standard Linnaean hierarchy starting at family | MEDIUM | Default open state: families collapsed; genus level pre-expanded is reasonable given only 42 genera. Species rendered as static leaf nodes. |
| Per-node rollup count (specimens + observations, split) | iNaturalist shows "N at or below" for every tree node; absence of a count makes nodes feel like dead-end categories | MEDIUM | Counts precomputed at pipeline time per taxon_id. Node shows "N specimens · N observations" matching existing page header style. Must include all descendants, not just direct children. |
| Rank-agnostic taxon selection → map filter | The stated goal of the milestone. GBIF resolves any search to a taxon key and returns all descendant occurrences; iNat's explore page filters "Anthophila and all descendants" transparently. Users expect clicking a family or genus name to show all matching map points. | HIGH | Requires hierarchy foundation (ancestor-array or closure table in SQLite artifact) + query that expands selection to descendant taxon_ids. This is the core payoff of the whole normalization effort. |
| Subfamily / tribe / subgenus as first-class nodes when present | iNat's "Full taxonomy" tree view shows all intermediate ranks. Users familiar with bee taxonomy expect Halictinae, Augochlorini, Dialictus to appear as navigable nodes, not just decorative labels. | MEDIUM | These ranks exist in taxa.csv.gz lineage; they already have taxon pages. Tree nodes link to existing pages. Lazy expand (see Differentiators) defers rendering until parent is expanded. |
| Type-to-filter collapses tree to matching nodes | The existing `/species/` index already does this (species-index.ts). Users already expect it; removing it from the browse tree would be a regression. | LOW | Existing JS pattern (hide non-matching `.family-section` / `.genus-row` elements) applies to the tree. Matching a genus should auto-expand its family. Matching a species should auto-expand family + genus. |
| Checklist-only species shown with existing badge | Already present on per-taxon pages. Tree must be consistent — checklist-only species are real taxa that belong in the browse. Hiding them would create a discrepancy between the tree and the individual pages. | LOW | Badge treatment (existing CSS class) reused. These nodes are leaves with 0 occurrence count but non-zero checklist-record count. |
| URL round-trip for taxon filter | Already implemented for the autocomplete filter. Tree-based taxon selection must write the same `taxon=` URL param and be restored on page load. Users share URLs after clicking into a taxon in the tree. | LOW | Tree node click → writes `taxon_id` to URL state → same filter pipeline as autocomplete. Requires taxon_id → display name reverse lookup for the chip. |
| New subfamily pages (19 families → + subfamily level) | Subfamily is the only bee rank currently missing static pages. With subfamily/tribe/subgenus as first-class nodes in the tree, a subfamily node with no destination page is a dead link. | MEDIUM | 6 bee families → ~20 subfamilies. Page template mirrors tribe pages (multi-color SVG map, "N specimens · N observations", genus list). Pipeline generates pages from hierarchy. |

### Differentiators (Competitive Advantage)

Features not strictly expected at this scale but that meaningfully raise usability or scientific value. BeeAtlas's core value is "tighten learning cycles for volunteer collectors" — these serve that goal.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Lazy expand of intermediate ranks (subfamily/tribe/subgenus) | iNat's life list defaults to showing simplified ranks and requires a toggle for "Full taxonomy". For BeeAtlas's ~600-species scope, tribe/subgenus nodes add depth without overwhelming beginners. Lazy rendering (only expand on click) keeps the default view clean while making depth accessible. | LOW | Tree renders family → genus → species by default. Clicking a genus reveals subgenus/tribe nodes if they exist. This is a progressive disclosure pattern; no AJAX needed (all tree data is in the static page). |
| Per-node "at exactly this rank" count alongside rollup | iNat's life list shows two numbers: total at-or-below (plain number) and observations at exactly this rank (green circle). For a bee atlas, genus-level Ecdysis records (unidentified to species) are scientifically meaningful. Showing "3 specimens at genus" makes visible that some records are identified only to genus. | LOW | Pipeline must track: occurrences where `taxon_id = N exactly` vs `taxon_id in descendants(N)`. The "at exactly this rank" count is meaningful only for genus and higher; species and below already have a single count. |
| Autocomplete extended to subfamily/tribe/subgenus (bee taxa only) | Existing autocomplete covers family/genus/species. Volunteer collectors often think in terms of tribe (Augochlorini) or subgenus (Dialictus). Extending autocomplete to all bee ranks gives experts a faster path than expanding the tree manually. | MEDIUM | Autocomplete data source expands from current string-column matching to taxon_id-keyed hierarchy query. Disambiguation needed (subgenus names often match genus names). Rank label in dropdown ("Subgenus", "Tribe") disambiguates. |
| Occurrence normalization size win (transfer weight reduction) | Dropping denormalized rank columns (genus, family, scientificName, canonical_name) from occurrences.db shrinks the SQLite artifact. Faster initial load directly serves "tighten learning cycles" — volunteers waiting for data to load is a friction point. | HIGH | This is the normalization half of the milestone. Drop columns from the 37-col contract; names resolve from hierarchy. Measurable: compare before/after occurrences.db size. |
| Reusability across atlases | Current code has BEE_FAMILIES constant, bee-specific filter logic. The project context says "wasp atlas should be a config flip". A clean rank-agnostic hierarchy with no bee-hardcoded logic in the structure is a long-term multiplier. | LOW | Design decision: hierarchy structure code must not contain `Anthophila` or family-name constants. The bee-only browse filter is a configuration value, not a code branch. |

### Anti-Features (Commonly Requested, Often Problematic)

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| Real-time descendant count queries at browse time | "Why precompute? Just query the DB live" | occurrences.db is a static SQLite artifact with no taxon hierarchy table; adding the full hierarchy table + real-time ancestor queries would require DuckDB WASM (already rejected for page weight) or a server (violates static hosting constraint) | Precompute per-taxon rollup counts at pipeline time; write to a `taxon_counts` table in the SQLite artifact |
| Show non-bee bycatch in the tree | "It's in the hierarchy, why not show it?" | The atlas is about bees. Showing flies and wasps in the browse tree confuses the audience and dilutes the value. Bycatch taxa exist in the hierarchy only so their map points resolve to a name. | Non-bee taxa: hierarchy-resident, silently excluded from tree rendering and autocomplete. Their map points still display correctly. |
| Floral host taxonomy in the tree | "Plants are an interesting dimension" | Floral host taxon_ids don't exist yet (explicitly out of scope in milestone context). Mixing host plants into the bee taxonomy tree would require a separate tree component or confusing interleaving. | Deferred to a future milestone. Host taxonomy is a distinct research question. |
| Full-depth tree rendered on page load (all ranks visible at once) | "More information upfront" | 600 species × multiple intermediate ranks = large DOM on initial render. Type-to-filter already handles search; the tree is for browsing, not for showing everything at once. | Default view: families + genera only. Intermediate ranks (subfamily/tribe/subgenus) revealed on expand. |
| Separate tree page vs. integrating into existing `/species/` index | "A dedicated tree URL feels cleaner" | The existing `/species/` index already has the type-to-filter UX that users know. A separate page splits navigation and requires users to learn two surfaces. | Replace the flat family→genus index at `/species/` with the expandable tree. Same URL, enhanced behavior. The index is the tree. |
| Paginated tree nodes | "Large genera might have too many species" | BeeAtlas has ~600 species total. Even the largest genus (Andrena, ~100 species in WA) renders comfortably without pagination. Pagination complexity far exceeds the problem at this scale. | Full list render with CSS `max-height` + scroll if a genus list is very long. No pagination logic needed. |
| Per-rank occurrence count in the map filter autocomplete pill | "When I filter to Halictidae, show me 'Halictidae (12,430 occurrences)'" | Count becomes stale the moment the DB is updated; autocomplete dropdown items with counts require re-querying on every keystroke. More complexity, marginal value for volunteers. | Count shown on the taxon's static page (already exists); autocomplete pill shows just the name. Selecting a taxon → map updates and the visible count is the map point density. |

---

## Feature Dependencies

```
Hierarchy Foundation (pipeline: taxon_id-keyed ancestor table in SQLite)
    └──enables──> Rank-agnostic descendant filter (map filter cutover)
    └──enables──> Per-node rollup counts (precomputed from hierarchy)
    └──enables──> Expandable tree nodes (tree data from hierarchy)
    └──enables──> Subfamily pages (generated from hierarchy ranks)
    └──enables──> Autocomplete extension to all bee ranks

Expandable tree (browser UI)
    └──links to──> Existing per-taxon pages (species/genus/subgenus/tribe/subfamily)
    └──requires──> Subfamily pages (otherwise subfamily nodes are dead links)
    └──reuses──> Type-to-filter JS pattern (existing species-index.ts pattern)
    └──reuses──> Checklist-only badge treatment (existing CSS)

Map filter cutover (taxon_id replacing string-column matching)
    └──requires──> Hierarchy in occurrences.db (ancestor IDs queryable in wa-sqlite)
    └──preserves──> URL round-trip (same taxon= param, now keyed by taxon_id)
    └──extends──> Autocomplete (adds subfamily/tribe/subgenus entries)

Occurrence normalization (drop denormalized rank columns)
    └──requires──> Hierarchy foundation (names must resolve from hierarchy, not columns)
    └──produces──> Smaller occurrences.db (measurable size win)
    └──rewrites──> 37-col contract (new column contract)
    └──requires──> Frontend cutover before columns drop (filter.ts must use taxon_id not strings)
```

### Dependency Notes

- **Subfamily pages require hierarchy foundation:** Subfamily taxon_ids and names come from the ancestor table, not from the existing denormalized columns (which have no subfamily column). Subfamily pages cannot be generated until the hierarchy is built.
- **Map filter cutover is a prerequisite for occurrence normalization:** The denormalized `genus`, `family`, `scientificName` columns cannot be dropped until the frontend filter no longer reads those columns. The filter must use `taxon_id` + hierarchy descendant lookup before the columns disappear.
- **Checklist-only species require no hierarchy work:** They already have taxon_ids (from v4.5). They appear in the tree as leaves. Their badge treatment is a CSS class, not a hierarchy query.
- **Lazy expand of intermediate ranks is independent:** This is a pure frontend decision about when to render child nodes. It does not affect the pipeline schema or the filter query.

---

## MVP Definition for v4.6

This is a subsequent milestone on a mature app, not a greenfield MVP. "MVP" here means: what is the minimum set of features that makes the milestone coherent and delivers the stated goal (descendant-by-any-rank browsing and filter)?

### Must Ship (core milestone scope)

- [ ] Hierarchy foundation — `taxon_id`-keyed ancestor table in SQLite artifact, covering all bee taxa, enabling descendant queries
- [ ] Rank-agnostic descendant filter — map filter resolves any selected taxon_id to its full descendant set
- [ ] Map filter cutover — filter.ts reads taxon_id + hierarchy, not string columns; autocomplete extended to subfamily/tribe/subgenus (bee only)
- [ ] Expandable tree at `/species/` — default family → genus → species; lazy intermediate ranks; type-to-filter preserved
- [ ] Per-node rollup counts — specimen/observation split, precomputed, shown on each tree node
- [ ] Subfamily pages — generated from hierarchy; without these, subfamily tree nodes are dead links
- [ ] Occurrence normalization — drop denormalized rank columns; new column contract; measurable size win

### Add Within Milestone If Straightforward

- [ ] Per-node "at exactly this rank" count — meaningful for genus-level records; LOW complexity once pipeline rollup is built
- [ ] Slug-collision edge cases — resolved at planning time as noted in milestone context; must not be discovered mid-implementation

### Defer to Future Milestone

- [ ] Floral host taxonomy — explicitly out of scope
- [ ] Non-bee taxa in tree or autocomplete — out of scope
- [ ] Count in autocomplete pill — anti-feature at this scale
- [ ] Paginated tree nodes — unnecessary at this scale

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Hierarchy foundation (pipeline) | HIGH — enables everything else | HIGH | P1 |
| Rank-agnostic descendant filter | HIGH — core milestone payoff | MEDIUM (depends on foundation) | P1 |
| Map filter cutover (taxon_id) | HIGH — prerequisite for normalization | MEDIUM | P1 |
| Expandable tree at /species/ | HIGH — replaces flat index | MEDIUM | P1 |
| Subfamily pages | MEDIUM — required for tree completeness | MEDIUM | P1 |
| Per-node rollup counts | HIGH — expected by any taxonomy browse | MEDIUM (precomputed pipeline) | P1 |
| Occurrence normalization / size win | MEDIUM — developer value + load perf | HIGH | P1 |
| Autocomplete extension to all bee ranks | MEDIUM — expert usability | MEDIUM | P2 |
| Lazy expand of intermediate ranks | MEDIUM — polish | LOW | P2 |
| Per-node "at exactly this rank" count | LOW — scientific nicety | LOW | P2 |
| Reusability / no bee-hardcoded logic | LOW visible now, HIGH future | LOW | P2 |

---

## Comparable Site Analysis

| Feature | iNaturalist Life List | GBIF Species Browse | ALA Classification Tab | BeeAtlas v4.6 Target |
|---------|----------------------|---------------------|------------------------|----------------------|
| Tree default depth | Simplified (family → order), toggle for full | Flat species list with rank filter | Full lineage breadcrumb only | Family → genus → species; intermediate ranks lazy |
| Intermediate ranks (tribe/subfamily/subgenus) | Available via "Full taxonomy" toggle | Not in tree; rank filter on search | Shown in classification tab, not in browse tree | First-class lazy nodes, link to taxon pages |
| Per-node count: at-or-below total | Yes — plain number | No tree view; occurrence count on taxon page | No tree; per-species count on search results | Precomputed rollup count per node (specimen + obs split) |
| Per-node count: at exactly this rank | Yes — green circle (iNat life list) | N/A | N/A | Nice-to-have; pipeline supports it |
| Rank-agnostic filter (select any rank → descendant occurrences) | Yes — "Anthophila" returns all bee observations | Yes — taxon key resolution to descendants | Yes — backbone match includes descendants | Yes — taxon_id + ancestor table, resolved at pipeline time |
| Type-to-filter / autocomplete | Yes — global autocomplete, any rank | Yes — species search with rank filter | Yes — species search | Existing pattern extended; tribe/subgenus added |
| Checklist-only species in tree | N/A (iNat is observation-only) | N/A | N/A | Yes — existing badge treatment |
| Two-source count split (specimens vs. community obs) | No — single observation count | Yes — by record type, not prominently | No | Yes — existing page header convention extended to tree |
| URL sharing for selected taxon | Yes | Yes | Yes | Yes — existing `taxon=` param, now keyed by taxon_id |

### Key takeaway from comparable sites

iNaturalist's life list is the closest design reference: expandable tree with at-or-below counts, togglable intermediate ranks, type-to-filter. Its core insight — that "plain number = total at or below" and "green circle = at exactly this rank" — maps directly to BeeAtlas's need to show genus-level unidentified specimens separately from fully-identified species. GBIF's rank-agnostic taxon key resolution is the backend pattern for the map filter cutover. Neither iNat nor GBIF handles the two-source (specimen vs. observation) split that BeeAtlas already shows on per-taxon pages; this is a genuine BeeAtlas differentiator.

---

## Sources

- `/home/peter/dev/beeatlas/.planning/PROJECT.md` — milestone goals, constraints, existing features
- `/home/peter/dev/beeatlas/src/filter.ts` — current `FilterState` (taxonName string + taxonRank enum); shows what must change for taxon_id cutover
- `/home/peter/dev/beeatlas/src/entries/species-index.ts` — existing type-to-filter JS pattern (hide/show DOM nodes); directly reusable for tree
- iNaturalist life list design (from search results): "plain numbers = observations at or below that node; green circles = observations at exactly that rank" — HIGH confidence (multiple corroborating sources)
- iNaturalist "Full taxonomy" toggle vs. simplified list — MEDIUM confidence (from iNat forum posts and blog)
- GBIF taxon key resolution for descendant occurrence filtering — HIGH confidence (from GBIF Species API documentation)
- ALA classification tab linking parent ranks — MEDIUM confidence (from ALA support documentation)
- Washington's Native Bees site: family → subfamily → tribe → genus → species navigation, no counts shown — HIGH confidence (direct content extraction)
- Discover Life bee checklist: alpha ordering within subfamily→tribe→genus→subgenus→species — MEDIUM confidence (from search result descriptions; frameset prevented direct scraping)
