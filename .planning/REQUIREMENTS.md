# Requirements: Washington Bee Atlas — v4.6 Taxonomy Hierarchy & Normalization

**Defined:** 2026-06-01
**Core Value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.

**Milestone goal:** Replace denormalized rank columns with a single `taxon_id` resolved against a rank-agnostic taxon hierarchy — shrinking transfer weight and the SQLite DB, eliminating rank-specific fragility, and unlocking descendant-by-any-rank browsing and filtering for bees.

## v1 Requirements

### Hierarchy Foundation (pipeline)

- [ ] **HIER-01**: A `taxon_id`-keyed taxon hierarchy is built in the pipeline from `taxa.csv.gz`, covering every taxon referenced by occurrences and the checklist (bees *and* non-bee aculeate bycatch), and supports descendant-by-any-rank queries.
- [ ] **HIER-02**: The hierarchy resolves any occurrence's `taxon_id` to its name, rank, and ancestry — including complex-rank and bycatch taxa — so every map point remains renderable after the denormalized rank columns are dropped.
- [ ] **HIER-03**: The hierarchy ships to the frontend (inside `occurrences.db` or a companion artifact) and answers descendant queries efficiently in SQLite-WASM; the structure (materialized-path vs. closure/nested-set) is chosen by benchmarking the largest bee subtree (Apidae, ~4000 spp.) before the schema is finalized.
- [ ] **HIER-04**: The hierarchy uses active taxa and respects the v4.5 synonym / inactive-taxon bridge; a post-build assertion detects orphan / missing-parent taxa and fails the nightly gate.
- [ ] **HIER-05**: Non-bee bycatch taxa carry an `is_bee = false` (or equivalent) flag so they never leak into bee-only surfaces; all hierarchy joins/keys use `taxon_id`, never names.
- [ ] **HIER-06**: The foundation phase reports the count of complex-rank and bycatch occurrences/species, recording the decision on whether dedicated complex pages are generated (PAGE-05).

### Occurrence Normalization (size win)

- [ ] **NORM-01**: Denormalized rank columns (`genus`, `family`, `scientificName`, and the iNat taxon-name columns) are dropped from the `occurrences` mart; `canonical_name` is retained for the ~21k genuinely-unidentified rows. The new column contract is documented and enforced at every dbt build.
- [ ] **NORM-02**: `occurrences.db` and its `geo_blob` serialization are updated atomically with the contract; a measurable transfer-weight + DB-size reduction is recorded against a captured pre-change baseline.
- [ ] **NORM-03**: Every downstream consumer of the dropped columns is audited and migrated to the hierarchy in the same change (no silent `geo_blob` positional-index breakage); the `species` mart and page generation are unaffected (they keep rank-name strings).

### Map Filtering Cutover (frontend)

- [ ] **MFILT-01**: User can filter the map by any taxon at family / subfamily / tribe / genus / subgenus / complex / species rank and see all descendant occurrences, via `taxon_id` + hierarchy descendant queries rather than string-column matching.
- [ ] **MFILT-02**: The taxon autocomplete includes subfamily, tribe, subgenus, and complex (bee taxa) alongside family/genus/species; selecting an entry resolves to a `taxon_id` with rank disambiguation (names are not unique — e.g. genus vs. subgenus *Bombus*).
- [ ] **MFILT-03**: Filter URL round-trip, clear-filters, boundary/region filtering, and selection-rectangle interactions are all preserved under the `taxon_id`-based filter.

### Per-Taxon Page Rebuild (static)

- [ ] **PAGE-01**: Genus, subgenus, and tribe page occurrence SVG maps and "N specimens · N community observations" totals are recomputed from the hierarchy + `taxon_id` (behavior preserved; no rank-specific string grouping).
- [ ] **PAGE-02**: Subfamily pages are generated (SVG map + specimen/observation counts + attribution) consistent with the existing genus/subgenus/tribe pages.
- [ ] **PAGE-03**: Page generation keys on `taxon_id` internally; public slugs stay name-based; same-named distinct taxa (e.g. genus vs. subgenus *Bombus*) never collapse, and any genuine slug collision is resolved deterministically.
- [ ] **PAGE-04**: Checklist-only bee species remain present in page generation with their existing "checklist only" badge/treatment.

### /species Browse Tree (bee-only)

- [ ] **TREE-01**: `/species` presents an expandable taxonomy tree, default family → genus → species, with subfamily / tribe / subgenus / complex available as lazy deeper expansions (not forced rows).
- [ ] **TREE-02**: Each tree node shows a specimen / community-observation count split, rolled up over its descendants.
- [ ] **TREE-03**: Type-to-filter search narrows the tree and auto-expands the ancestors of matching taxa.
- [ ] **TREE-04**: Non-bee bycatch never appears in the tree; tree nodes link to the corresponding taxon page and/or a descendant-filtered map view.

## v2 Requirements

Acknowledged but deferred — not in this milestone's roadmap.

### Conditional this milestone (decided in foundation phase)

- **PAGE-05**: Dedicated complex pages (map + counts), generated only if HIER-06 finds a meaningful count of complex-rank occurrences/species. Otherwise complex tree nodes deep-link to a filtered map view instead of a static page.

### Floral host hierarchy

- **HOST-01**: Resolve floral host (plant) names to plant `taxon_id`s (iNat-observation-preferred), enabling host taxa as hierarchy nodes.
- **HOST-02**: Filter occurrences by host plant taxon (e.g. "all bees collected on Asteraceae"); browse/host pages.

*(Deferred: no host `taxon_id`s exist today and nothing depends on them yet.)*

## Out of Scope

Explicitly excluded for v4.6.

| Feature | Reason |
|---------|--------|
| Floral host taxa in the hierarchy | No host `taxon_id`s exist; nothing depends on them yet — deferred (HOST-01/02) |
| Ranks above family (subfamily↑ to superfamily/order) | Not needed until/unless non-bee groups (e.g. wasps) become a first-class atlas |
| Non-bee bycatch in tree / autocomplete / pages | Bees are monophyletic; bycatch is hierarchy-resident for name resolution only |
| Generic configurable rank set | Ranks stay hard-coded — several ranks carry rank-specific design; reusability comes from a bee-agnostic, `taxon_id`-keyed structure, not generic rank handling |
| Real-time / recursive descendant queries at request time | Static hosting; descendant resolution is precomputed at build time |
| `taxon_id`s in public URLs | Public slugs stay human-readable and name-based |
| Fixing rollup counts | No miscounts observed; page rebuild is a faithful reimplementation on the new foundation |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| HIER-01 | Phase 129 | Pending |
| HIER-02 | Phase 129 | Pending |
| HIER-03 | Phase 129 | Pending |
| HIER-04 | Phase 129 | Pending |
| HIER-05 | Phase 129 | Pending |
| HIER-06 | Phase 129 | Pending |
| MFILT-01 | Phase 130 | Pending |
| MFILT-02 | Phase 130 | Pending |
| MFILT-03 | Phase 130 | Pending |
| NORM-01 | Phase 131 | Pending |
| NORM-02 | Phase 131 | Pending |
| NORM-03 | Phase 131 | Pending |
| PAGE-01 | Phase 132 | Pending |
| PAGE-02 | Phase 132 | Pending |
| PAGE-03 | Phase 132 | Pending |
| PAGE-04 | Phase 132 | Pending |
| TREE-01 | Phase 133 | Pending |
| TREE-02 | Phase 133 | Pending |
| TREE-03 | Phase 133 | Pending |
| TREE-04 | Phase 133 | Pending |

**Coverage:**
- v1 requirements: 20 total
- Mapped to phases: 20/20 (100%)
- Unmapped: 0

---
*Requirements defined: 2026-06-01*
*Last updated: 2026-06-01 — traceability remapped: MFILT→130, NORM→131, PAGE→132, TREE→133 (5-phase split)*
