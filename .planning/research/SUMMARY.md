# Project Research Summary

**Project:** BeeAtlas v4.6 Taxonomy Hierarchy & Normalization
**Domain:** Static biodiversity occurrence atlas — normalized taxon hierarchy with runtime descendant filtering via WASM SQLite
**Researched:** 2026-06-01
**Confidence:** HIGH

## Executive Summary

v4.6 replaces a denormalized occurrence schema (string `genus`, `family`, `scientificName` columns) with a single `taxon_id` integer resolved against a rank-agnostic taxon hierarchy embedded in `occurrences.db`. The milestone has two interdependent payoffs: a measurable DB size reduction (fewer columns per occurrence row) and an unlocking of descendant-by-any-rank browsing — users can click a subfamily or tribe and see all descendant map points, which is impossible with the current string-column filter. The key infrastructural move is a new taxa/hierarchy table exported by `sqlite_export.py` into the existing `occurrences.db`, covering all bee taxa and non-bee bycatch, queried at runtime by the wa-sqlite worker in the browser.

The recommended approach is materialized-path ancestry (the `ancestry` column in `taxa.csv.gz` is already a slash-delimited ancestor-ID string and is already parsed by `taxa_pipeline.py`), but one critical performance decision must be made in the foundation phase before any code is written: whether to use materialized path with `instr()` scan, a closure table, or nested-set (MPTT) lft/rgt integers for the SQLite runtime. The research files diverge here. STACK.md argues materialized path wins because the source data already provides it and 17K rows make full scans fast enough. ARCHITECTURE.md proposed a closure table for clean single-JOIN descendant queries without recursive CTEs. PITFALLS.md raised nested sets as the best wa-sqlite option because Apidae alone has ~4000 species and a recursive CTE walk or `instr()` scan at filter time would be perceptible in Firefox. The materialized-path-already-exists fact makes it the leading candidate; the deciding risk is whether a 17K-row `instr()` scan in wa-sqlite is imperceptible for a family-level filter on a slow JS engine. This structural decision must be resolved in the foundation phase via a latency benchmark before any schema is finalized.

The central execution risk is not the hierarchy build itself — that is well-understood additive work — but the contract rewrite cascade. Dropping `genus`, `family`, and `scientificName` from the occurrences mart touches at least 10 distinct surfaces simultaneously (dbt schema.yml, `filter.ts` OCCURRENCE_COLUMNS, OccurrenceRow, buildFilterSQL, `features.ts` positional geo_blob indexes, `bee-atlas.ts` inline SQL, `bee-map.ts` checklist filter, `filter.test.ts` assertions, and the checklist parquet contract). The geo_blob positional-index coupling between `sqlite_export.py` and `features.ts` is the most dangerous because a mismatch produces silent data corruption, not a thrown error. The normalization phase must treat these as a single atomic migration, not incremental column removals.

## Key Findings

### Stack

No new libraries are needed. The full hierarchy — pipeline DuckDB queries, SQLite export, and runtime wa-sqlite descendant queries — is achievable with the existing tooling (Python 3.14+, DuckDB 1.5.2, dbt-duckdb 1.10.1, wa-sqlite 1.0.0 / SQLite 3.44). The only additions are new tables in `occurrences.db` and a rewritten dbt occurrences contract.

The `ancestry` column in `taxa.csv.gz` is already a materialized-path string (e.g., `48460/1/.../630955/47221/...`), and `taxa_pipeline.py` already uses `ancestry LIKE '%/630955/%'` to filter Anthophila. A bee-relative `lineage_path` of the form `/630955/.../self_id/` can be extracted in DuckDB with a regex and queried in wa-sqlite with `instr(lineage_path, '/47221/')`. At 17K rows, a full-scan `instr()` takes ~110 ms worst-case (6.4 us/callback x 17K); for large family subtrees this may be perceptible in Firefox. The deciding performance test is: measure `instr()` scan latency for a family-level filter (Apidae, ~4000 descendants) in wa-sqlite on a mid-range device. If that latency is acceptable, materialized path is the right choice and eliminates pipeline complexity. If not, nested-set lft/rgt integers add one DuckDB recursive-CTE step at export time and reduce the runtime query to an indexed range scan.

**Open structural decision for the foundation phase:**

| Structure | Build cost | Runtime query | Key fact |
|-----------|-----------|---------------|----------|
| Materialized path (instr()) | Zero - ancestry column already exists | Full scan, 17K rows | Leading candidate; needs latency measurement |
| Closure table | Medium - CTE to generate pairs | Single indexed JOIN | Clean SQL, ~250K rows |
| Nested sets (MPTT lft/rgt) | Medium - recursive CTE at export time | Indexed range scan O(log n) | Best worst-case for large families (Apidae ~4000 sp.) |

**Core technologies (unchanged):**
- DuckDB 1.5.2 — pipeline transforms, hierarchy build, SQLite export via ATTACH
- dbt-duckdb 1.10.1 / dbt-core 1.8.9 — model orchestration, occurrences contract enforcement
- wa-sqlite 1.0.0 (SQLite 3.44) — runtime SQL in WASM worker; both instr() and WITH RECURSIVE confirmed available
- Python 3.14+ — pipeline, sqlite_export.py hierarchy builder

**Hard-coded rank set (post-research decision):** family, subfamily, tribe, genus, subgenus, complex, species. Nothing above family surfaced. Complexes are hierarchy-resident, name-resolving, and filterable like any other rank. Complex pages deferred unless the foundation phase finds a meaningful count of complex-rank occurrences. Rank handling is hard-coded, not generic; reusability comes from taxon_id-keyed structure and a bee-only presentation flag, not from configurable rank sets.

### Features

The milestone scope is internally well-constrained. Features decompose into two streams with clear ordering dependencies.

**Must have (table stakes for milestone completeness):**
- Hierarchy foundation — taxon_id-keyed taxa table in occurrences.db, all bee + bycatch taxa, descendant queries working
- Rank-agnostic descendant filter — closure/path query replacing string column matches in buildFilterSQL
- Map filter cutover — FilterState.taxonId replaces taxonName/taxonRank; URL param migrates to integer; backward-compat parse for old URLs
- Occurrence normalization — drop 6 denormalized string columns from occurrences mart; new smaller dbt contract; canonical_name retained (display fallback for ~21K unidentified Ecdysis specimens with NULL taxon_id)
- Expandable tree at /species/ — default family → genus → species; intermediate ranks lazy-expanded; type-to-filter preserved; checklist-only badge retained
- Per-node rollup counts — specimen/observation split, precomputed at pipeline time
- Subfamily pages — ~20 new static pages; without them, subfamily tree nodes are dead links
- Autocomplete extended to subfamily/tribe/subgenus (bee taxa only)

**Should have (differentiators):**
- Per-node "at exactly this rank" count (meaningful for genus-level unidentified specimens) — low complexity once pipeline rollup is built
- DB size measurement before/after — validates the transfer-weight reduction rationale

**Defer:**
- Floral host taxonomy — explicitly out of scope
- Non-bee taxa in tree or autocomplete
- Complex pages — contingent on complex-rank occurrence count found in foundation phase
- Paginated tree nodes — unnecessary at ~600 species

**Non-negotiable feature dependency order:**
1. Hierarchy foundation precedes everything
2. Frontend filter cutover precedes occurrence column drop (frontend must stop reading old columns before they disappear)
3. Subfamily pages require hierarchy (subfamily taxon_ids come from hierarchy, not old denormalized columns)
4. Browse tree requires filter cutover (shares hierarchy infrastructure)

### Architecture Approach

The hierarchy ships as additional tables inside `occurrences.db` (not a separate file) — consistent with the geo_blob pre-computation pattern from v4.3. A new `_build_taxon_hierarchy` function in `sqlite_export.py` runs after the occurrences table is written, reads `taxa.csv.gz` via DuckDB, and writes the hierarchy tables. The frontend loads a taxonCache (Map<number, TaxonInfo>) lazily — on first autocomplete focus or as a background task after tablesReady — by querying the hierarchy table. Adding it to the tablesReady boot path is an anti-pattern (v4.3 reduced that latency from 930 ms to 250 ms; do not regress it).

**Major components and their changes:**

1. `data/sqlite_export.py` (MODIFIED) — adds `_build_taxon_hierarchy`: extracts referenced taxon_ids, resolves lineage from taxa.csv.gz, writes hierarchy tables + indexes; updates `_GEO_COLS` to drop genus/family/scientificName, add taxon_id
2. `data/dbt/models/intermediate/int_combined.sql` (MODIFIED) — removes 6 denormalized string columns from all three ARMs; canonical_name retained
3. `data/dbt/models/marts/schema.yml` (MODIFIED) — occurrences contract rewritten to ~29 columns; species mart contract unchanged (species mart keeps rank name columns for Eleventy page generation)
4. `src/filter.ts` (MODIFIED) — FilterState gains taxonId; buildFilterSQL taxon branch rewritten; OccurrenceRow and OCCURRENCE_COLUMNS updated
5. `src/features.ts` (MODIFIED) — _buildGeoJSONFromRaw column layout updated; taxaOptions built from hierarchy query instead of geo_blob
6. `src/bee-atlas.ts` + `src/bee-filter-controls.ts` (MODIFIED) — autocomplete queries hierarchy; URL param encodes integer; backward-compat parse
7. New Eleventy subfamily templates + `data/species_export.py` subfamily grouping + `data/species_maps.py` subfamily SVG maps

**Architecture invariants preserved:** bee-atlas owns all reactive state; bee-map and bee-sidebar are pure presenters; taxon cache and hierarchy queries belong in bee-atlas or a new src/taxon.ts, not in presenters.

**Schema divergence between research files:** ARCHITECTURE.md proposed two tables (taxon_hierarchy + taxon_closure); STACK.md proposed one table with lineage_path for materialized path. These represent the two competing structure choices. Resolving the structural decision (foundation phase benchmark) resolves the schema.

### Critical Pitfalls

1. **Hierarchy structure wrong for wa-sqlite performance** — recursive CTE descendant queries in WASM SQLite are unbounded for large subtrees; Apidae (~4000 species) would be noticeably slow in Firefox. Prevention: measure instr() scan latency in the foundation phase before committing; if over 50 ms, implement nested-set lft/rgt instead. Server-side DuckDB performance does not predict WASM SQLite performance.

2. **geo_blob positional-index mismatch produces silent data corruption** — `_GEO_COLS` in `sqlite_export.py` and column positions in `features.ts._buildGeoJSONFromRaw` are positionally coupled with no TypeScript type safety. Updating one without the other assigns wrong values to wrong fields silently. Prevention: update both files atomically in the same commit; add a test that asserts _GEO_COLS length matches positional constant count.

3. **Name non-uniqueness: genus Bombus and subgenus Bombus silently collapse** — taxon names are not unique within a kingdom. Any query keyed on name instead of taxon_id merges two distinct taxa. This affects higher_rank_taxon_ids.json (dict key collision), slug generation (URL collision), and autocomplete deduplication. Prevention: taxon_id is the sole hierarchy lookup key everywhere; UNIQUE constraint on taxon_id in hierarchy table; slug scheme includes rank prefix.

4. **Contract rewrite cascade across 10+ surfaces simultaneously** — dropping denormalized columns touches schema.yml, filter.ts OCCURRENCE_COLUMNS and buildFilterSQL, features.ts geo_blob layout, bee-atlas.ts inline SQL, bee-map.ts checklist filter, filter.test.ts assertions, checklist mart contract, species_export.py SPECIES_COLUMNS. dbt contract enforcement does NOT catch a column declared in schema.yml but absent from SELECT — only the reverse. Prevention: grep audit across src/, data/, _pages/ before removing any column; migrate all consumers in one coordinated phase.

5. **Orphan bycatch taxa after genus/family columns drop** — non-bee bycatch must be in the hierarchy for map point name resolution after string columns drop. taxon_lineage_extended is Anthophila-filtered; bycatch ancestry requires a separate targeted walk. Prevention: two-pass hierarchy load (Anthophila via existing approach; bycatch via targeted ancestry walk for each taxon_id in occurrences.parquet). Post-build assertion: zero unmatched taxon_ids.

## Implications for Roadmap

Based on combined research, the milestone decomposes into five sequential phases. Phases A and B can be developed in parallel (different files) but must deploy together as one pipeline change before Phase C.

### Phase A: Hierarchy Foundation (pipeline)

**Rationale:** All downstream work — filter cutover, browse tree, page rebuild — requires hierarchy tables in occurrences.db. This phase produces no visible user-facing change but is a prerequisite for all others. It also forces the structural decision (materialized path vs. closure vs. nested sets) before any UI work begins.

**Delivers:** Taxa hierarchy table(s) in occurrences.db; all bee + bycatch taxa covered; is_anthophila flag; post-build assertion (zero orphan taxon_ids); complex-rank occurrence count to inform complex page decision.

**Key gate:** Measure instr() scan latency for Apidae-level filter (4000 descendants) in wa-sqlite / Firefox before finalizing schema. If under 50 ms: materialized path. If over: nested-set lft/rgt.

**Avoids:** Pitfalls 1 (structure choice), 3 (name non-uniqueness — UNIQUE constraint), 5 (orphan bycatch — two-pass load + assertion)

**Research flag:** Needs the latency benchmark as a decision gate. Everything else well-understood.

### Phase B: Occurrence Normalization (pipeline contract rewrite)

**Rationale:** Can be developed in parallel with Phase A but must deploy together. Drops 6 denormalized string columns from int_combined.sql and rewrites the dbt occurrences contract. The frontend is NOT updated yet — the old consumer code temporarily coexists with the new pipeline schema until Phase C atomically cuts over.

**Delivers:** Smaller occurrences.parquet and occurrences.db (~29 columns); updated geo_blob column list (taxon_id replaces genus/family/scientificName); size delta documented.

**Requires:** Pre-migration grep audit across all consumers; atomic update of schema.yml + int_combined.sql + Python constants; checklist mart migration scope confirmed.

**Avoids:** Pitfalls 2 (geo_blob — atomic update), 4 (cascade — pre-audit ensures all consumers identified)

**Research flag:** No additional research needed; migration surface fully enumerated in PITFALLS.md Pitfall 2.

### Phase C: Frontend Filter Cutover

**Rationale:** First user-visible phase. Depends on A+B being deployed. Replaces all string-column taxon filter logic with taxon_id + hierarchy descendant queries. This is the point where old columns are safely removed from the frontend type system.

**Delivers:** FilterState.taxonId replaces taxonName/taxonRank; buildFilterSQL uses hierarchy descendant subquery; autocomplete extended to all bee ranks (subfamily/tribe/subgenus); taxaOptions from hierarchy query; URL taxon= param as integer with backward-compat parse; taxon cache loaded lazily; occurrence display resolves names from cache; bee-atlas.ts inline SQL and bee-map.ts checklist filter updated.

**Avoids:** Pitfall 4 (all TypeScript consumers updated atomically), Pitfall 3 (taxon_id-only queries, no name-keyed hierarchy lookups)

**Research flag:** No additional research needed; cutover pattern fully specified in ARCHITECTURE.md.

### Phase D: Page Rebuild (hierarchy-derived rollups + subfamily pages)

**Rationale:** Genus/subgenus/tribe page counts recomputed from hierarchy. New subfamily pages required before Phase E (browse tree links to them). Can begin as soon as Phase B completes since the species mart retains its rank name columns unchanged.

**Delivers:** Genus/tribe/subgenus page totals recomputed from hierarchy (behavior preserved); new subfamily pages at /species/subfamily/{Name}/ with multi-color SVG maps; URL scheme collision check run; slug collision pre-generation assertion passing.

**Avoids:** Pitfall 6 (double-counting — leaf-level rollup only), Pitfall 7 (slug collisions — pre-generation GROUP BY check)

**Research flag:** No additional research needed; subfamily pages follow existing tribe page pattern exactly.

### Phase E: Browse Tree (/species/ expandable tree)

**Rationale:** Last because it depends on Phase C (shared hierarchy infrastructure and filter state) and Phase D (subfamily page destinations must exist). Replaces the flat family→genus index at /species/ at the same URL.

**Delivers:** bee-species-tree component reading taxon_hierarchy (is_anthophila=1); default family → genus → species; lazy-expand of subfamily/tribe/subgenus; per-node specimen/observation rollup counts; type-to-filter auto-expand; checklist-only nodes with existing badge; URL taxon= param on tree selection.

**Reuses:** Existing type-to-filter JS pattern (species-index.ts); filter race guard; checklist badge CSS.

**Avoids:** Pitfall 8 (bycatch leaking — is_anthophila filter on all tree queries)

**Research flag:** No additional research needed; new component, established patterns.

### Phase Ordering Rationale

- A and B are pipeline-only, developed in parallel, deployed together as one pipeline change (geo_blob and occurrences table must change atomically)
- C is first frontend change; depends on A+B in production
- D depends only on B (species mart unchanged); can begin as soon as B completes
- E depends on C (shared filter infrastructure) and D (subfamily pages must exist as link destinations)
- Browse tree (E) is last because it has the most dependencies; building it last means it integrates finished infrastructure without workarounds

### Research Flags

**Phases needing focused investigation during planning:**
- **Phase A:** Structural decision (materialized path vs. nested sets) is the sole open technical question in the milestone. A 30-minute latency benchmark in wa-sqlite gates all subsequent schema decisions. Roadmapper should make this the first task in Phase A before any other work is planned.
- **Phase A:** One DuckDB query against live occurrences.parquet to count complex-rank occurrences and decide on complex pages.

**Phases with standard, well-documented patterns (skip research-phase):**
- **Phase B:** Migration surface fully enumerated; work is mechanical after the audit
- **Phase C:** Cutover pattern fully specified in ARCHITECTURE.md with exact SQL and TypeScript
- **Phase D:** Subfamily pages are a direct copy of the existing tribe page pattern
- **Phase E:** Browse tree follows iNaturalist life list design; component architecture established

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All capabilities verified against actual tool versions; no new libraries needed |
| Features | HIGH | Scope tightly constrained by existing architecture; comparable site patterns well-documented |
| Architecture | HIGH | All findings from direct codebase inspection; data flow fully traced |
| Pitfalls | HIGH | All pitfalls identified from live code with specific file paths and column names |

**Overall confidence: HIGH**

### Gaps to Address

- **Structural decision for hierarchy in wa-sqlite** — the one genuine open question. A 30-minute latency benchmark in Phase A resolves it permanently. The roadmapper should flag Phase A as requiring this benchmark before task breakdown.

- **Complex-rank occurrence count** — PROJECT.md defers complex pages unless the foundation phase finds a meaningful count. Run one query against live data in Phase A to decide. If count is meaningful (>50 occurrences), add complex pages task to Phase D.

- **Checklist mart migration scope** — PITFALLS.md notes bee-map.ts reads [county, scientificName, genus, family, year, month] from checklist parquet. Confirm during Phase B planning whether the checklist mart also drops these string columns or retains them (they serve a different query path than the occurrences mart).

- **canonical_name retention confirmed** — ARCHITECTURE.md is definitive: keep canonical_name. ~21K unidentified Ecdysis specimens have NULL taxon_id; canonical_name is their only textual taxon reference. Do not drop it in Phase B.

## Sources

### Primary (HIGH confidence — direct code inspection)
- `data/taxa_pipeline.py` — existing materialized-path usage, active = 'true' string guard
- `data/sqlite_export.py` — _GEO_COLS positional coupling, geo_blob construction
- `data/dbt/models/marts/schema.yml` — 37-column contract being rewritten
- `data/dbt/models/intermediate/int_combined.sql` — three-arm UNION, column selection
- `src/filter.ts` — OCCURRENCE_COLUMNS, OccurrenceRow, buildFilterSQL taxon branch
- `src/features.ts` — _buildGeoJSONFromRaw positional indexes
- `src/bee-atlas.ts` — inline SQL COUNT(DISTINCT genus/family), autocomplete query
- `src/bee-map.ts` — checklist column list and filter predicates
- `src/tests/filter.test.ts` — hard assertions on SQL strings and OCCURRENCE_COLUMNS
- `.planning/PROJECT.md` — v4.6 milestone scope, constraints, Key Decisions
- wa-sqlite binary inspection: confirmed SQLite 3.44.0
- inaturalist_data.taxon_lineage_extended row count 17,343 — queried from live DuckDB

### Secondary (MEDIUM confidence — comparable site analysis)
- iNaturalist life list design — plain number = at-or-below; green circle = at exactly this rank
- GBIF taxon key resolution for descendant occurrence filtering
- ALA classification tab linking parent ranks

### Tertiary (documentation)
- SQLite instr() availability: confirmed since 3.7.15 (well below wa-sqlite 3.44)
- DuckDB 1.5.2 WITH RECURSIVE, PIVOT, regexp_extract — verified by test

---
*Research completed: 2026-06-01*
*Ready for roadmap: yes*
