# Phase 130: Map Filter Cutover - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

The frontend stops filtering occurrences on denormalized taxon **string** columns
(`family` / `genus` / `scientificName`) and switches to **`taxon_id` + hierarchy
descendant queries** against the `taxa` table Phase 129 shipped inside
`occurrences.db` (940 taxa; `taxon_id` PK, `rank`, `name`, `lineage_path`,
`is_anthophila`; `idx_taxa_lineage` on `lineage_path`). The taxon autocomplete
gains subfamily / tribe / subgenus / complex (and subtribe). URL round-trip,
clear-filters, region/boundary filtering, and selection-rectangle interactions
are all preserved. Occurrence detail cards resolve taxon names correctly with no
blank/undefined values.

**Additive phase.** The denormalized rank string columns stay present in the
pipeline output and are harmlessly ignored — they are dropped in Phase 131, not
here. No data-pipeline schema change in this phase.

Covers MFILT-01, MFILT-02, MFILT-03.

**In scope:**
- Replace string-column taxon WHERE-matching with `taxon_id` descendant queries
  (`lineage_path LIKE '%/<id>/%'` against the `taxa` table) across every filter
  path (`buildFilterSQL` and its callers: `queryVisibleGeoJSON`, `queryTablePage`,
  `queryListPage`).
- Extend the autocomplete to subfamily / tribe / subgenus / complex (+ subtribe);
  resolve each selected entry to a `taxon_id` with rank disambiguation.
- `taxon=` URL param now encodes an integer `taxon_id`, with a backward-compatible
  fallback for the old `taxon=<name>&taxonRank=<rank>` format.
- Detail cards resolve and display taxon names from the hierarchy/taxon cache.
- Lazy load of the taxon hierarchy/cache — NOT on the `tablesReady` boot path.

**Out of scope (later phases):**
- Dropping denormalized string columns + `geo_blob` rewrite + dbt contract rewrite
  (Phase 131).
- Page rebuilds / subfamily pages (Phase 132).
- `/species` browse tree (Phase 133).
- Bycatch (`is_anthophila = 0`) in any bee-only surface — never in autocomplete or
  tree; resolves names only (locked Phase 129 D-05).

</domain>

<decisions>
## Implementation Decisions

### Autocomplete content (the one fully-discussed area)
- **D-01 — Inclusion rule:** A bee taxon is selectable in the autocomplete iff it
  has **≥1 descendant occurrence record across ALL sources the map can render** —
  specimens (Ecdysis) + iNat observations + checklist county-fills. This replaces
  today's specimen-only source (`SELECT DISTINCT family, genus, scientificName
  FROM occurrences WHERE ecdysis_id IS NOT NULL`), which was inconsistent with the
  multi-source map. No dead-end entries: every selectable taxon changes the map.
  Bycatch never appears (Phase 129 D-05).
- **D-02 — Complexes surface via descendants only:** Verified against the shipped
  DB — **zero** occurrences resolve directly to a `complex` `taxon_id`; all 29 bee
  complexes are intermediate nodes whose records come entirely from descendant
  species. Selecting a complex filters to all species within it. No special-casing
  on the filter side — the descendant query handles it. A complex appears in the
  autocomplete iff ≥1 descendant species satisfies D-01.

### Autocomplete labels & disambiguation
- **D-03 — Label scheme** (resolves all 41 cross-rank name-twins):
  - Higher ranks (family / subfamily / tribe / subtribe) — **plain**, no rank
    annotation (`Apidae`, `Apinae`, `Bombini`). They are unique and recognizable
    and do not collide.
  - genus / subgenus — parenthetical rank: `Bombus (genus)`, `Bombus (subgenus)`.
    (15 genus/subgenus name-twins, e.g. *Bombus*, *Apis*, *Andrena*.)
  - complex — **natural phrasing**: `Bombus fervidus complex` (no parens). (~14
    species/complex name-twins where the complex is named after its representative
    species, e.g. *Bombus fervidus* exists as both species 52774 and complex
    1266534.)
  - species — **plain binomial**: `Bombus fervidus`.
- **D-04 — No occurrence counts** in autocomplete entries. Name + rank label only,
  matching today's clean list. (The D-01 inclusion rule already guarantees ≥1
  renderable record, so a "0" can never appear.)
- **D-05 — Ordering:** When a typed prefix matches multiple ranks, order **broader
  ranks first** (family → subfamily → tribe → subtribe → genus → subgenus →
  complex → species), then alphabetical by name within a rank. Rationale: a user
  reaching for "all of *Bombus*" finds the genus before scrolling past every
  species. (Note: complex sorts just above species, so a full-binomial query like
  `bombus fervidus` lists `Bombus fervidus complex` immediately above the species
  `Bombus fervidus` — acceptable.)

### Claude's Discretion (defaults to capture — user opted not to discuss; planner/researcher resolve within these guardrails)
- **D-06 — URL `taxon=` format & back-compat (roadmap-constrained):** `taxon=`
  encodes an integer `taxon_id` (success criterion #2). Recommended default: emit a
  single `taxon=<id>` param and **drop** the separate `taxonRank` param (rank is now
  derivable from the resolved taxon). Backward-compat: if `taxon=` parses as a
  non-integer, treat it as a legacy name and resolve `(name, taxonRank)` →
  `taxon_id` via the taxon cache (preferring the rank in the old `taxonRank` param
  when present to pick the right twin). Planner decides sync-vs-async resolution
  given the lazy-cache constraint (D-08). MFILT-03 paths (clear-filters,
  region/boundary, selection-rectangle) must round-trip unchanged.
- **D-07 — Detail-card name resolution:** Switch detail cards to resolve names from
  the hierarchy/taxon cache by `taxon_id` (success criterion #3), NOT from the
  still-present string column. `taxon_id IS NULL` (≈21k unidentified Ecdysis
  specimens) keeps the existing "No determination" treatment — never render blank/
  undefined. (The string column survives this phase but is treated as already-gone
  to de-risk Phase 131.)
- **D-08 — Cache load strategy:** The taxon hierarchy/cache loads **lazily** — never
  on the `tablesReady` boot path (Phase 129 locked this; `tablesReady` is the
  load-bearing 250 ms boot path). Open for research: (a) trigger — first autocomplete
  focus vs. background fetch just after `tablesReady`; (b) build the autocomplete
  index + name-lookup map by **precomputing it in the pipeline** (geo_blob-style
  pre-serialized table in `occurrences.db`) vs. **computing it in the worker** from
  the `taxa` + `occurrences` tables on first use. Researcher recommends; both must
  honor the no-boot-path rule and the D-01 inclusion rule.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — MFILT-01, MFILT-02, MFILT-03 (the three this phase
  closes); also PAGE-*/TREE-* for awareness of what later phases depend on.
- `.planning/ROADMAP.md` §"Phase 130: Map Filter Cutover" — goal + 3 success
  criteria (criterion #2 fixes `taxon=` as an integer `taxon_id`; criterion #3
  forces hierarchy-cache name resolution in detail cards).
- `.planning/PROJECT.md` — v4.6 milestone scope; key invariants (taxon names not
  unique; `taxon_id`-only keys; lazy hierarchy load; bee-only surfaces exclude
  bycatch).

### Phase 129 foundation (what this phase consumes)
- `.planning/phases/129-hierarchy-foundation/129-CONTEXT.md` — D-02 materialized
  `lineage_path` structure; D-05 bycatch finest-rank, no bee-only surface presence;
  lazy-load-not-boot constraint.
- `data/sqlite_export.py` §`_build_taxon_hierarchy` (≈L43–76) — the shipped `taxa`
  table schema + indexes inside `occurrences.db`; `ATTACH ... AS out (TYPE sqlite)`
  pattern; geo_blob pre-computation pattern (template for D-08 precompute option).

### Milestone research (resolves most technical questions)
- `.planning/research/STACK.md` — materialized-path / `instr()` (`LIKE '%/<id>/%'`)
  descendant-query latency math in wa-sqlite; tool-version capability checks.
- `.planning/research/ARCHITECTURE.md` — lazy `taxonCache` load placement (NOT on
  `tablesReady`); closure-table vs materialized-path schema discussion.
- `.planning/research/PITFALLS.md` — Pitfall 3 (name non-uniqueness → `taxon_id`
  keys + UNIQUE) directly motivates D-03's twin-disambiguation labels.

### Frontend code to modify (mapped during scout)
- `src/filter.ts` — `buildFilterSQL()` (L228; taxon WHERE at L232–241 is the
  string-match to replace); `TaxonOption` interface (L370–374; gains the new ranks
  + `taxon_id`); `queryVisibleGeoJSON` (L331), `queryTablePage` (L171),
  `queryListPage` (L400) all consume `buildFilterSQL`. County/ecoregion clauses
  (L257–267) and selection-bounds clause (L421–426) MUST keep working (MFILT-03).
- `src/bee-atlas.ts` — `_loadSummaryFromSQLite()` (L334; the autocomplete-source
  query at L369 changes per D-01); `_onDataLoaded()` (L934–950); `FilterState`
  taxon fields (`taxonName`/`taxonRank` → `taxon_id`-based); `_onFilterChanged()`
  (L797); race guards `_filterGuard`/`_tableGuard`/`_listGuard` (L71–73) — no
  change needed, must keep working.
- `src/bee-filter-controls.ts` — `getSuggestions()` (L103–189, substring match at
  L140) implements the autocomplete; D-03 labels + D-05 ordering land here;
  `taxaOptions` (L196); clear-filters token path (≈L426).
- `src/url-state.ts` — taxon encode (L57–59) / decode (L120–126); D-06 changes both.
- `src/bee-occurrence-detail.ts` — name rendering from `row.scientificName`
  (L186–196); D-07 switches to cache lookup by `taxon_id`.
- `src/sqlite.ts` / `src/sqlite-worker.ts` — boot sequence + `geo_blob` lazy-query
  pattern (`loadOccurrenceGeoJSON`, the `'build-geojson'` message); D-08 lazy
  taxon-cache load attaches here, post-`tablesReady`.
- `src/stale-guard.ts` — `makeStaleGuard` (the `_filterQueryGeneration` race guard
  invariant); preserve.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`geo_blob` lazy-query pattern** (`sqlite-worker.ts` `'build-geojson'` message +
  `sqlite.ts` `loadOccurrenceGeoJSON`) is the proven template for a lazy taxon-cache
  fetch that stays off the boot path (D-08).
- **`taxa` table is already shipped** in production `occurrences.db` (Phase 129,
  additive) — this phase is pure frontend wiring; no pipeline/export change needed.
- **`makeStaleGuard` + `_filter/_table/_listGuard`** already protect all three query
  paths; swapping the WHERE clause inside `buildFilterSQL` needs no guard changes.

### Established Patterns
- **`taxon_id`-only keys** — names are not unique (verified: 41 cross-rank twins).
  Internal filter state, URL param, and detail-card lookup all key on `taxon_id`;
  names are display-only (D-03).
- **Descendant query = `lineage_path LIKE '%/<id>/%'`** against `taxa`, intersected
  with `occurrences.taxon_id` — backed by `idx_taxa_lineage`. (Verified: 2.0 ms
  Apidae descendant query in Phase 129.)
- **Boot path is load-bearing** — `tablesReady` ≈250 ms; the taxon cache must load
  lazily (D-08).
- **SQL string-interpolation with `''`-escaping** is the existing convention in
  `filter.ts`; integer `taxon_id`s sidestep escaping entirely for the taxon clause.

### Integration Points
- The autocomplete source query (`bee-atlas.ts` L369) is replaced by a query that
  enumerates eligible taxa from the `taxa` table joined to renderable occurrences
  (D-01) — the single biggest data-source change in the phase.
- `FilterState` shape change (taxon name/rank → `taxon_id`) ripples to `filter.ts`,
  `url-state.ts`, `bee-filter-controls.ts`, and `bee-atlas.ts` handlers.

</code_context>

<specifics>
## Specific Ideas

- Label scheme is intentionally **mixed-style** (plain higher ranks, parenthetical
  genus/subgenus, "*X* complex" natural phrasing, plain species) — chosen by the
  user over a uniform `(rank)` suffix because it reads the way entomologists speak
  while still disambiguating every twin. Don't "normalize" it to one style.
- Concrete twin examples to test against: `Bombus` (genus 207/subgenus), `Bombus
  fervidus` (species 52774 / complex 1266534), `Colletes consors`, `Lasioglossum
  perdifficile`.
- Ordering preview the user approved (type `bomb`): `Bombini (tribe)` → `Bombus
  (genus)` → `Bombus (subgenus)` → `Bombus fervidus complex` → `Bombus appositus`
  → `Bombus bifarius` … (broader-first, then alphabetical).

</specifics>

<deferred>
## Deferred Ideas

- **Occurrence counts in autocomplete** — declined for now (D-04). If wanted later,
  it needs descendant counts baked into the cache/index.
- **Grouped-by-rank autocomplete (section headers)** — considered and rejected in
  favor of a flat broader-first list (D-05); revisit only if the flat list proves
  hard to scan.

### Reviewed Todos (not folded)
- **`cluster-selection-visual-feedback.md`** ("Cluster blobs need selection visual
  feedback") — map rendering / visual-feedback concern, unrelated to the `taxon_id`
  filter cutover. Deferred.
- **`data-test-suite-environmental-deps.md`** ("Data test suite has environmental
  dependencies — dbt build + slow checklist test") — Phase 129 testing debt, not a
  frontend filter concern. Deferred.

</deferred>

---

*Phase: 130-Map Filter Cutover*
*Context gathered: 2026-06-02*
