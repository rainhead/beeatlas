# Pitfalls Research

**Domain:** v4.6 Taxonomy Hierarchy & Normalization — adding a normalized taxon hierarchy and dropping denormalized rank columns from an existing dbt/DuckDB/SQLite-WASM occurrence-mapping system.
**Researched:** 2026-06-01
**Confidence:** HIGH — all findings from direct code inspection of the current system (no training-data assumptions).

---

## Critical Pitfalls

### Pitfall 1: Name-non-uniqueness merge — genus *Bombus* vs. subgenus *Bombus* silently collapse

**What goes wrong:**
Taxon names are NOT unique within a kingdom. The genus *Bombus* (taxon_id ~65707) and the subgenus *Bombus* (taxon_id ~119019) share the name "Bombus". Any query, JOIN, or display logic that keys on `name` instead of `taxon_id` will treat them as the same taxon. Concretely:

- A hierarchy lookup `WHERE name = 'Bombus'` returns two rows; `first()` / `LIMIT 1` silently picks one.
- Autocomplete deduplication by display name loses one of the two Bombus nodes.
- Page generation using the name as the primary key (`/species/Bombus/`) collides — the genus page and subgenus page want the same slug.
- `higher_rank_taxon_ids.json` (produced by `species_export.py`) maps `name → taxon_id`; writing it as a dict silently drops whichever Bombus (genus vs. subgenus) sorts last.

The existing `stg_inat__genus_taxon_ids.sql` already defends against this with `HAVING COUNT(*) = 1` to exclude cross-phylum homonyms, but that defense only covers the genus-rank backfill. The new hierarchy table must be built and queried exclusively by `taxon_id`.

**Why it happens:**
Developers reaching for the human-readable name as a join or lookup key — it feels natural and worked in the old denormalized world where `genus` was a plain string column. The hierarchy makes the trap more dangerous because now two nodes genuinely exist in the same tree with the same name at different ranks.

**How to avoid:**
Enforce `taxon_id` as the sole join and lookup key everywhere in the hierarchy model. No `WHERE name = X` queries against the hierarchy table. The hierarchy dbt model should have a `NOT NULL` constraint on `taxon_id` and a `UNIQUE` constraint — if the same `taxon_id` appears twice, the build fails loudly. Autocomplete must resolve to `taxon_id`, not name string. Page generation must key on `taxon_id` internally; the public URL slug is derived from name + rank combination (see Pitfall 7).

**Warning signs:**
- `higher_rank_taxon_ids.json` has fewer entries than distinct names in the hierarchy (dict key collision dropped one).
- A `SELECT count(*) FROM taxa WHERE name = 'Bombus'` returns > 1 and some downstream model does not GROUP BY `taxon_id`.
- A genus page and subgenus page accidentally share the same Eleventy output path.
- Autocomplete shows one "Bombus" entry when two distinct taxa (different ranks) should appear.

**Phase to address:**
Foundation — when designing and building the hierarchy table. The `taxon_id`-only key contract must be established before any downstream model is built on top of it.

---

### Pitfall 2: Contract rewrite creates a hidden failure cascade across six codebases simultaneously

**What goes wrong:**
The 37-column dbt contract on `marts/occurrences` is enforced at every `bash data/dbt/run.sh build`. Dropping `genus`, `family`, `scientificName`, and `canonical_name` creates simultaneous breakage in:

1. **`schema.yml`** — `data_type` declarations for the removed columns must be removed; leaving them causes a dbt contract violation (column declared but absent from SELECT).
2. **`filter.ts` `OCCURRENCE_COLUMNS`** — a `const` tuple enumerating all 35 column names selected in every SQLite query. Any column listed but absent from the DB causes `undefined` in every fetched row, silently breaking display and filter logic.
3. **`filter.ts` `OccurrenceRow` interface** — TypeScript type definition; if `genus: string | null` remains but the column is gone, tsc may not catch it (the field just resolves to `undefined` at runtime, not a type error, because the DB returns a value-less column).
4. **`filter.ts` `buildFilterSQL()`** — three clauses: `family = '...'`, `genus = '...'`, `scientificName = '...'`; each becomes a SQLite runtime error after the columns drop.
5. **`features.ts` `_buildGeoJSONFromRaw()`** — reads `geo_blob` columns by positional index: `row[6]` = `scientificName`, `row[7]` = `genus`, `row[8]` = `family`. `sqlite_export.py` hardcodes `_GEO_COLS = ["lat", "lon", "ecdysis_id", "observation_id", "specimen_observation_id", "year", "scientificName", "genus", "family", "source"]`. If those columns are gone, `geo_blob` must be rebuilt with different positional layout, and `features.ts` positional indexes must be updated to match.
6. **`bee-atlas.ts`** — inline SQL `COUNT(DISTINCT genus) AS genus_count, COUNT(DISTINCT family) AS family_count` and `SELECT DISTINCT family, genus, scientificName FROM occurrences WHERE ecdysis_id IS NOT NULL`.
7. **`filter.test.ts`** — `expect(OCCURRENCE_COLUMNS).toContain('scientificName')` and `expect(occurrenceWhere).toBe("family = 'Apidae'")` etc. are hard assertions that will fail at the test level before the app even runs.
8. **`checklist` mart** — `schema.yml` declares `genus` and `family` columns on the checklist mart too. If checklist columns are also being dropped, that contract needs updating as well.
9. **`bee-map.ts` checklist filter** — reads columns `['county', 'scientificName', 'genus', 'family', 'year', 'month']` from the checklist parquet and filters by `r.genus !== taxon` / `r.family !== taxon`.
10. **`species_export.py`** — `SPECIES_COLUMNS` list includes `'scientificName'`, `'canonical_name'`, `'family'`, `'genus'`, `'subgenus'`. The species mart drops different columns than occurrences — but the Python list must stay in sync with the dbt contract.

**Why it happens:**
Each of these consumers was written when the columns existed. No single place lists all consumers — the contract is implicit across TypeScript, Python, SQL, and test files. "Drop a column" feels like a one-file change; it is actually a 10-surface migration.

**How to avoid:**
Before removing any column from the occurrences mart, produce a complete audit list of every surface that references it. Use `grep -rn 'genus\|family\|scientificName\|canonical_name'` across `src/`, `data/`, and `_pages/` to find all consumers. Then migrate them all in a single coordinated phase — or introduce a compatibility shim (e.g., a computed column that derives `genus` from the hierarchy JOIN) that preserves the old column name temporarily, cutting over consumers one at a time.

The `geo_blob` positional-index coupling between `sqlite_export.py` and `features.ts` is the most dangerous because it fails silently at runtime: the column reads wrong data, not an error. This pair must be updated atomically.

**Warning signs:**
- `dbt build` exits 0 but `schema.yml` still lists a dropped column — contract enforcement only catches columns the SELECT emits but the YAML does not declare; it does not catch YAML columns the SELECT no longer emits.
- `npm test` passes (tests assert column names that exist in the old schema fixture) but runtime queries fail.
- `filter.test.ts` assertions `expect(occurrenceWhere).toBe("family = 'Apidae'")` still pass because they test the SQL string, not whether the column exists in the DB.
- GeoJSON features appear but all have `null` scientificName — silent positional mismatch in `geo_blob`.

**Phase to address:**
Normalization phase — contract rewrite. Must include a pre-rewrite audit and simultaneous migration of all consumers, not a phased column removal.

---

### Pitfall 3: Recursive CTE descendant queries in SQLite-WASM are unbounded and slow for large subtrees

**What goes wrong:**
A recursive CTE to find all descendants of a taxon (e.g., all species under Apidae) in SQLite looks like:
```sql
WITH RECURSIVE descendants(id) AS (
  SELECT taxon_id FROM taxa WHERE parent_id = ?
  UNION ALL
  SELECT t.taxon_id FROM taxa t JOIN descendants d ON t.parent_id = d.id
)
SELECT * FROM occurrences WHERE taxon_id IN (SELECT id FROM descendants);
```
In the browser on wa-sqlite with the full hierarchy in MemoryVFS, this is evaluated at filter-query time — every time the user changes the taxon selection. For a large family (Apidae has ~4000 bee species), the CTE walks the entire subtree and then executes `taxon_id IN (4000-element list)`. SQLite IN-list performance degrades nonlinearly past ~100 elements; at 4000 it is noticeable.

Additionally, wa-sqlite with MemoryVFS has no disk I/O, so all reads are from RAM — fast, but the recursive walk itself is pure CPU. In Firefox's slower JS engine (vs. Chrome V8), a 4000-species family CTE walk can take 200–400 ms, blocking the main thread if not offloaded.

**Why it happens:**
Recursive CTEs feel like the natural SQL solution for hierarchy traversal. They work well in server-side DuckDB (fast native code) but the same query runs in the browser on WASM SQLite, which has different performance characteristics.

**How to avoid:**
Evaluate two precomputed structures instead of recursive CTEs:

**Option A: Nested sets (MPTT)**. Precompute `lft`/`rgt` integers at pipeline time (DuckDB, during the hierarchy build step). Descendant query becomes `WHERE lft >= ? AND rgt <= ?` — a two-integer range scan, O(log n) with an index. Extremely fast in SQLite. The tradeoff: inserts/updates require recomputing `lft`/`rgt` for the entire tree, which is acceptable since the pipeline runs nightly and the hierarchy is read-only in the browser.

**Option B: Closure table**. A separate `taxon_closure(ancestor_id, descendant_id, depth)` table with one row per ancestor-descendant pair. Descendant query: `JOIN taxon_closure ON ancestor_id = ? AND taxon_id = descendant_id`. Fast point lookup. Tradeoff: the closure table for ~6000 bee taxa at average depth 6 is ~36,000 rows — small. For bycatch taxa added to support map rendering, depth is similar. Total remains well under 100K rows.

**Option C: Materialized `ancestor_path` string**. Store `ancestor_path VARCHAR` in the taxa table (e.g., `'/1/2/630955/65707/'`). Descendant query: `WHERE ancestor_path LIKE '/1/2/630955/65707/%'`. Works but LIKE with leading wildcard requires a full table scan on SQLite (no index prefix optimization). For 6000 rows this is acceptable; for occurrences (50K rows) it is not — so filtering occurrences must still go via taxon_id set.

**Recommendation**: Nested sets for the hierarchy table in `occurrences.db`. Build the MPTT `lft`/`rgt` in DuckDB at pipeline time with a recursive CTE (fast in DuckDB), export to SQLite with an index on `(lft, rgt)`. The browser then does a range query, not a recursive walk.

**Warning signs:**
- Taxon filter performance is fine for species-rank selection (no recursion needed) but noticeably slow when a genus or family is selected.
- SQLite `EXPLAIN QUERY PLAN` shows `SCAN taxa` (full table scan) for the descendants query.
- Filter response time increases roughly proportionally to the number of descendants of the selected taxon.

**Phase to address:**
Foundation — choose the hierarchy structure before building. The choice determines what `sqlite_export.py` exports and what the frontend query looks like. Changing from recursive CTE to nested sets later requires rebuilding the export and rewriting filter SQL.

---

### Pitfall 4: Orphan and missing-parent taxa in taxa.csv.gz cause silent hierarchy gaps

**What goes wrong:**
`taxa.csv.gz` from iNaturalist Open Data uses a slash-separated `ancestry` column (e.g., `1/2/67101/630955/65707`) that lists ancestor IDs but does NOT include the taxon itself. The `taxa_pipeline.py` already handles this with a `UNION ALL self_rows` arm — but the ancestor walk JOINs back to `all_active_bees`, which is filtered to active Anthophila. If a parent taxon is:
- inactive (not in the active filter), or
- outside Anthophila (e.g., a kingdom or phylum node), or
- simply missing from the file (data quality issue),

then the JOIN to `ancestor_rows` produces NULL for that rank, and the hierarchy node has no parent_id to connect it to. In a nested-set or closure-table model, this creates disconnected subtrees — nodes that are present but unreachable from the root.

For bycatch taxa (wasps/flies with `kingdom = Animalia`): the current v4.5 design resolves their genus-level `taxon_id` using the Animalia disambiguation, but their full lineage (family, subfamily, etc.) was never loaded into `taxon_lineage_extended` because that table is Anthophila-filtered. When the hierarchy must also hold bycatch taxa (so their occurrence points can still resolve a name after `genus`/`family` columns drop), their parents may be absent from the hierarchy — creating dangling nodes.

**Why it happens:**
The Anthophila filter that makes the taxa pipeline fast and focused is exactly the wrong boundary for a hierarchy that must also serve non-bee taxa's names. Extending the boundary naively means loading all of taxa.csv.gz (37 MB gzipped, millions of rows) just to get wasp family nodes.

**How to avoid:**
Separate the hierarchy loading into two passes:
1. Load all active Anthophila taxa (current approach) into the hierarchy — this covers all bee taxa.
2. For each bycatch `taxon_id` that appears in `occurrences.parquet`, walk the ancestry column from taxa.csv.gz for just those IDs and their direct ancestors up to family rank, then insert those additional rows into the hierarchy. The bycatch set is small (wasps, flies — likely < 50 genera based on current data).

Alternatively: load all taxa at rank ≥ family from taxa.csv.gz for the relevant ancestor IDs, without pulling in the millions of species rows.

After building the hierarchy, run a consistency check: every `taxon_id` in `occurrences.parquet` must have an entry in the hierarchy table. A `LEFT JOIN` with `WHERE hierarchy.taxon_id IS NULL` reports gaps.

**Warning signs:**
- `SELECT count(*) FROM occurrences WHERE taxon_id NOT IN (SELECT taxon_id FROM taxa)` returns > 0.
- Map points for wasp or fly bycatch occurrences show no name in the detail card after the `genus`/`family` columns drop.
- Bycatch genera (e.g., Bembix, Sphex) are absent from the hierarchy but present in `occurrences.parquet`.

**Phase to address:**
Foundation — hierarchy build. The bycatch-ancestry loading strategy must be decided before the hierarchy table schema is finalized.

---

### Pitfall 5: Synonym/inactive-taxon interaction corrupts hierarchy lookups

**What goes wrong:**
v4.5 introduced `auto_synonyms` + `occurrence_synonyms` to remap inactive taxon names to accepted names at the `int_combined` layer. After normalization, `occurrences.parquet` will store `taxon_id` instead of name strings. The synonym mechanism must produce the accepted taxon's `taxon_id`, not the synonym's `taxon_id`. Two failure modes exist:

**Mode A: Synonym maps to inactive taxon_id.** If `occurrence_synonyms.csv` maps synonym `agapostemon texanus → subtilior` but the `taxon_id` resolved for `subtilior` is an inactive taxon ID (because iNat updated the taxonomy again after the manual entry was written), the hierarchy lookup for that `taxon_id` finds an inactive node. The hierarchy table built from active taxa only has no entry for that ID, so `LEFT JOIN taxa ON taxa.taxon_id = occurrences.taxon_id` produces NULL — the occurrence has a `taxon_id` but no hierarchy entry.

**Mode B: Hierarchy built from active taxa, occurrence uses old taxon_id.** The genus-taxon-id backfill in `stg_inat__genus_taxon_ids.sql` uses `HAVING COUNT(*) = 1` deduplication — correct. But if between nightly runs iNat inactivates a genus and splits it, the `taxon_id` stored in `occurrences.parquet` becomes stale. The hierarchy (rebuilt from the updated `taxa.csv.gz`) no longer contains that old ID. Occurrences with the old ID become orphaned from the hierarchy.

**Why it happens:**
The synonym/remapping system was designed to fix names, not IDs. It operates at the canonical_name level. After normalization shifts the authoritative key from name to `taxon_id`, the same mismatch risk shifts to IDs — and is less visible because the ID is an opaque integer.

**How to avoid:**
The hierarchy build step must run AFTER the synonym resolution step. Every `taxon_id` written into `occurrences.parquet` must come from the same `taxa.csv.gz` snapshot that the hierarchy was built from. If `taxa.csv.gz` is re-downloaded and the hierarchy is rebuilt, the taxon_id resolution for occurrences must also be re-run against the same snapshot.

Add a post-build assertion: `SELECT count(*) FROM occurrences o LEFT JOIN taxa h ON h.taxon_id = o.taxon_id WHERE o.taxon_id IS NOT NULL AND h.taxon_id IS NULL`. This must be 0.

For `occurrence_synonyms.csv` manual entries: any manually-specified `accepted_name` must be checked against the current `taxa.csv.gz` to confirm it maps to an active taxon_id. Add a pipeline gate that fails if any manual synonym's accepted name resolves to an inactive or missing taxon_id.

**Warning signs:**
- `LEFT JOIN taxa ON taxa.taxon_id = occurrences.taxon_id` produces NULLs for occurrences with non-null taxon_id.
- `auto_synonyms` entries appear for taxa that `occurrence_synonyms.csv` already covers — the deduplication gate did not fire.
- A species' map points disappear after a pipeline run that updated `taxa.csv.gz`.

**Phase to address:**
Foundation — establish taxon_id provenance rule: ID and hierarchy built from same taxa.csv.gz snapshot. Normalization phase — add the post-build JOIN assertion.

---

### Pitfall 6: Rank-rollup count double-counting when a species belongs to both the genus and a subgenus

**What goes wrong:**
The current genus/subgenus page counts are computed by `species_export.py` by grouping `species.parquet` (which has denormalized `genus` and `subgenus` columns). After normalization, counts will be computed by descending the hierarchy from a given node and counting distinct occurrences. A species in subgenus *Bombus* of genus *Bombus* will appear in a descendant query rooted at the genus AND in a descendant query rooted at the subgenus. If genus page counts are computed as "all occurrences where taxon is a descendant of this genus node", and separately subgenus page counts as "all occurrences where taxon is a descendant of this subgenus node", neither double-counts — each occurrence appears exactly once under its species node. The risk is if counts are computed as SUM of children's counts rather than COUNT DISTINCT of occurrences.

A related issue: the species mart currently has `occurrence_count`, `specimen_count`, `inat_obs_count` as denormalized pre-aggregated fields. Page counts for genus/subgenus/tribe are computed by summing these fields for member species. If the normalization milestone removes these denormalized fields from the species mart and requires computing them from occurrence-level joins, any species that appears under multiple taxonomy nodes (e.g., listed in both genus Bombus and subgenus Bombus in a misconfigured hierarchy) will be counted twice.

**Why it happens:**
The hierarchy adds a new dimension: taxa at intermediate ranks (subgenus, tribe) have their own subtrees. A correct hierarchy has each occurrence mapped to exactly one leaf node (its species or finest-rank taxon), and ancestor counts are derived by summing leaves. If the hierarchy has a node at both genus and subgenus for "Bombus" and the subgenus is NOT correctly nested under the genus, both the genus and subgenus subtrees each contain the same species — double-counted.

**How to avoid:**
Compute occurrence counts at the leaf (species) level exclusively. Genus/subgenus/tribe counts are derived by walking the hierarchy tree and summing leaf counts. Never aggregate from `occurrence_count` fields stored at intermediate nodes. Assert: `SUM(species.occurrence_count WHERE parent_chain includes genus G) == genus G occurrence count`. Run this for at least 5 genera after each pipeline build.

Also verify the hierarchy's structural integrity: every non-root node has exactly one parent, subgenus nodes are children of genus nodes, genus nodes are children of family nodes. A DuckDB `WITH RECURSIVE` cycle check during the pipeline build catches structural errors before export.

**Warning signs:**
- Genus "Bombus" occurrence count > sum of all Bombus species occurrence counts (indicates occurrences counted at multiple levels).
- A tribe page shows the same species appearing twice in its species list (structural duplication in the hierarchy).
- Total occurrence count on the family page > sum of genus page counts within that family.

**Phase to address:**
Pages phase — when genus/subgenus/tribe page counts are recomputed from the hierarchy. But the structural integrity check belongs in the Foundation phase.

---

### Pitfall 7: Slug collisions for same-named taxa at different ranks

**What goes wrong:**
Public URL slugs are name-based. Currently:
- Genus Bombus → `/species/Bombus/`
- Subgenus Bombus → `/species/Bombus/Bombus/`

This convention happens to avoid collision because subgenus slugs use the two-component `Genus/Subgenus` format. But when adding new ranks (subfamily pages for the first time, tribe pages already exist), the naming scheme must be consistent. Specifically:
- Tribe *Bombini* → currently `/species/tribe/Bombini/`
- If subfamily pages are added at `/species/subfamily/Apinae/`, the `tribe/` prefix is inconsistent with genus slugs lacking a `genus/` prefix.

More critically: if the tree page generates paths from the hierarchy by node type without per-rank prefix logic, a genus named "Bombini" (hypothetical, but names reuse is real) and a tribe named "Bombini" would both generate the same URL.

The existing `subgenusList` WARNING-02 in PROJECT.md notes that `subgenus.totalOccurrences` includes unresolved records — this is a pre-existing count inaccuracy that the hierarchy normalization is meant to fix.

**Why it happens:**
URL slugs were designed incrementally — species got `Genus/epithet`, genera got `Genus/`, subgenera got `Genus/Subgenus/`, tribes got `tribe/TribeName/`. Adding subfamilies adds another rank, and the existing scheme doesn't have a coherent rank-prefix convention.

**How to avoid:**
Define the full URL scheme for all ranks before generating any pages:
- Family: `/species/family/{Family}/` (new in v4.6, or omit family pages if not planned)
- Subfamily: `/species/subfamily/{Subfamily}/` (new in v4.6)
- Tribe: keep existing `/species/tribe/{TribeName}/` (do not change — would break external links)
- Genus: keep existing `/species/{Genus}/`
- Subgenus: keep existing `/species/{Genus}/{Subgenus}/`
- Species: keep existing `/species/{Genus}/{epithet}/`

Then verify: no two taxa at different ranks produce the same path. A pre-generation check: `SELECT rank, name, count(*) FROM taxa GROUP BY name HAVING count(*) > 1` identifies all same-name taxa; for each pair, confirm their generated URLs are distinct.

**Warning signs:**
- Eleventy pagination emits two pages at the same `permalink` — the second silently overwrites the first.
- A genus page and subgenus page disappear after a build (the permalink collision causes one to overwrite the other).
- A tree node links to a URL that serves a different rank's page.

**Phase to address:**
Pages phase — define the URL scheme before generating any new rank pages. Confirm with a pre-generation collision check.

---

### Pitfall 8: Bycatch leaking into bee-only surfaces via the hierarchy

**What goes wrong:**
Non-bee aculeate bycatch (wasps, flies, etc.) must be in the hierarchy so their occurrence map points resolve to a name after `genus`/`family` columns drop. But they must NOT appear in:
- The autocomplete (which currently returns family/genus/species options derived from `occurrences.parquet`)
- The `/species/` browse tree (bee-only)
- The taxonomy pages (genus, subfamily, tribe pages)
- The `speciesList`, `genusList`, `subgenusList` in `species.js`

The current filter for the species universe is in `int_species_universe.sql`:
```sql
WHERE family IN ('Andrenidae', 'Apidae', 'Colletidae', 'Halictidae',
                 'Megachilidae', 'Melittidae', 'Stenotritidae')
```
This filter works because `family` is a denormalized string column. After normalization, the filter must query the hierarchy: "taxon is a descendant of Anthophila (taxon_id=630955)". If the hierarchy JOIN is missing or the Anthophila root ID changes, bycatch taxa leak through.

The current autocomplete is built in `bee-atlas.ts` from:
```sql
SELECT DISTINCT family, genus, scientificName FROM occurrences WHERE ecdysis_id IS NOT NULL
```
After the columns drop, this query must be replaced. The replacement must still exclude bycatch taxa from the dropdown.

**Why it happens:**
The bee-only filter is currently enforced at two independent places: the `int_species_universe` SQL gate and the `stg_inat__genus_taxon_ids` `HAVING COUNT(*) = 1` deduplication. After normalization, the filter must be expressed in terms of the hierarchy, and every surface that builds a bee-only list must use the same hierarchy-based filter consistently.

**How to avoid:**
Define one canonical hierarchy filter: "is a descendant of Anthophila (taxon_id=630955)". Express this as a computed column or a `is_bee` flag on the hierarchy table that is set during the pipeline build. Any query that needs bee-only data JOINs the hierarchy and filters on `is_bee = TRUE`. This is a single definition rather than duplicated family-name lists.

Assert: `SELECT count(*) FROM taxa WHERE is_bee = TRUE AND family NOT IN ('Andrenidae', 'Apidae', ...)` must be 0 (the two filter mechanisms agree). Assert: `SELECT count(*) FROM taxa WHERE is_bee = FALSE AND family IN ('Andrenidae', 'Apidae', ...)` must be 0.

**Warning signs:**
- Wasp or fly genera (e.g., Bembix, Sphex, Eristalis) appear in the taxon autocomplete.
- A genus page is generated for a non-bee genus.
- The `/species/` browse tree contains non-Anthophila nodes.
- `speciesList` in species.js includes entries with NULL `on_checklist` for bycatch taxa.

**Phase to address:**
Foundation — the `is_bee` flag must be established on the hierarchy table. Frontend cutover — autocomplete replacement must use hierarchy-based filter.

---

### Pitfall 9: DB size regression if the hierarchy table is large

**What goes wrong:**
The entire `occurrences.db` is seeded into wa-sqlite MemoryVFS on page load. Current size is not specified in PROJECT.md, but v4.3 notes it took 1–3 ms to open (vs. 1229 ms INSERT loop), implying a reasonable size. Adding a hierarchy table must not cause a significant size increase.

A closure table for ~6000 bee taxa at average depth 6 = ~36,000 rows × (two INTEGER columns + depth INTEGER) ≈ 864 KB uncompressed in SQLite. Manageable.

A nested-set table for ~6000 taxa = ~6000 rows × (taxon_id, parent_id, lft, rgt, rank, name) ≈ 6000 × ~40 bytes = 240 KB. Small.

The risk is if the hierarchy includes bycatch taxa with their full ancestry (pulling in kingdom-level ancestors), or if the closure table is built for the full ancestor set (including all ranks from kingdom to species). For a closure table, adding kingdom/phylum/class/order nodes above family increases depth from 6 to ~10, blowing the row count to ~60,000 and size to ~1.4 MB — still acceptable but worth measuring.

The more significant risk is the OCCURRENCE side: if ancestor arrays are stored in `occurrences` (50K rows × 8 ancestor IDs × 8 bytes = 3.2 MB per array column), that is a real regression. Ancestor data belongs in the hierarchy table, not denormalized into occurrences.

**Why it happens:**
Copying the ancestor chain into each occurrence row seems convenient for query performance but undoes the size savings that motivated the normalization.

**How to avoid:**
Measure `occurrences.db` size before and after each hierarchy table addition. The hierarchy table belongs in `occurrences.db` only if it is needed for frontend queries; if it is only used server-side for count aggregation, it can stay out of the exported SQLite.

Keep the exported SQLite occurrences table to its normalized form: `taxon_id` column only, no ancestor columns. The hierarchy table (nested sets or closure) is added to `occurrences.db` alongside the occurrences table to enable descendant queries.

Target: total `occurrences.db` size should decrease vs. v4.5 (fewer columns per row in occurrences), with the hierarchy table addition being a modest offset.

**Warning signs:**
- `occurrences.db` size increases after the normalization milestone (expected to decrease — investigate immediately).
- `tablesReady` benchmark time increases from the current ~250 ms baseline.
- The MemoryVFS seeding step (currently 1–3 ms) slows measurably.

**Phase to address:**
Foundation — decide what tables go in `occurrences.db`. Normalization — measure size before/after column removal. Frontend cutover — measure `tablesReady` time.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep `genus`/`family` columns as computed columns derived from hierarchy JOIN in the dbt mart | Zero frontend migration required during normalization | Perpetuates name-keyed logic; doesn't actually shrink the DB until the shim columns are dropped | Acceptable as a transitional shim for one milestone if it enables incremental testing |
| Use recursive CTE in SQLite-WASM instead of precomputed nested sets | No pipeline preprocessing required | Filter latency spikes on large family selections (Apidae: ~4000 species); degrades user experience | Never — nested sets add one pipeline step and eliminate the latency permanently |
| Store bycatch taxa names without full hierarchy entry | Faster to implement | After genus/family columns drop, bycatch occurrence points have no name to display | Never — the whole point of the hierarchy is to resolve names for every taxon_id |
| Emit `is_bee` from application code (hardcoded family list) rather than hierarchy flag | No schema change | Same family-name list duplication risk as the current `int_species_universe` WHERE clause | Acceptable temporarily if the hierarchy `is_bee` flag is blocked; must be resolved within the milestone |
| Skip slug collision check and rely on "it works" | Saves 30 minutes | One silent page overwrite corrupts navigation; found only by a user or UAT | Never — the check is a single GROUP BY query |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `sqlite_export.py` + `features.ts` positional coupling | Updating `_GEO_COLS` in the exporter without updating the matching positional indexes in `_buildGeoJSONFromRaw` | Change both files atomically in the same commit; add an assertion that `_GEO_COLS` length == the number of positional reads in `features.ts` |
| dbt contract enforcement | Leaving a dropped column in `schema.yml` — dbt does NOT error if a declared column is absent from SELECT | After dropping a column from the SELECT, remove it from schema.yml in the same commit; `dbt build` will fail if it is present in SELECT but missing from schema.yml, but NOT the reverse |
| `checklist` mart and `checklist.parquet` | `checklist` mart also declares `genus` and `family` columns; dropping them from occurrences does NOT automatically remove them from checklist | Audit the `checklist` mart contract separately; `bee-map.ts` reads `['county', 'scientificName', 'genus', 'family', 'year', 'month']` from checklist — these columns need migration too |
| `higher_rank_taxon_ids.json` dict keying | Keying by name loses subgenus-vs-genus distinction | Key by taxon_id; if the consumer needs name lookup, build a `{taxon_id: name, rank}` structure |
| `taxa.csv.gz` active filter | Using `active = true` (boolean) instead of `active = 'true'` (string) matches no rows silently | Always use string literal; new code reading taxa.csv.gz must include this guard |
| `test_dbt_diff.py` column count docstrings | Column count in comments (currently "30 cols", actually 37) misleads future developers who update to "N+1 cols" thinking the comment was current | Fix the docstring to say "37 cols" at the start of the milestone; update it when the contract changes |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Recursive CTE descendant query in wa-sqlite at filter time | Taxon filter fast for species but slow for genus/family; latency proportional to subtree size | Use nested-set range query `lft BETWEEN ? AND ?` instead | Noticeable at genus-level selection (100+ species); severe at family level (Apidae: ~4000 species) |
| Ancestor columns stored in occurrences table | `occurrences.db` size increase; `tablesReady` slower than v4.3 baseline of ~250 ms | Keep occurrences table normalized (taxon_id only); hierarchy in separate table | Immediate — each ancestor column adds 50K × 8 bytes = 400 KB to the DB |
| Closure table built for all ranks including kingdom/phylum | Closure table row count explodes (10× vs. family-to-species depth); DB size regression | Cap hierarchy at family rank (not above); build closure only from family to species | Breaks at kingdom-to-species depth of ~10 — closure rows grow from ~36K to ~60K |
| Eleventy tree page generating one HTML file per taxon node | Slow build if the tree is fully expanded (6000 species × N ranks = many pages); or excessive S3 upload time | The tree should be a single interactive JS page, not one-page-per-node | Breaks when species count grows past ~1000 if generated as static pages |

---

## "Looks Done But Isn't" Checklist

- [ ] **Hierarchy foreign key coverage:** `SELECT count(*) FROM occurrences WHERE taxon_id IS NOT NULL AND taxon_id NOT IN (SELECT taxon_id FROM taxa)` returns 0 — every occurrence taxon_id has a hierarchy entry.
- [ ] **Bycatch in hierarchy, not in bee surfaces:** Wasp/fly genera (Bembix, Sphex, Eristalis etc.) appear in `taxa` table but NOT in `speciesList`, autocomplete options, or species page generator output.
- [ ] **Name-uniqueness invariant:** `SELECT name, count(*) FROM taxa GROUP BY name HAVING count(*) > 1` returns rows — confirm that every such name has distinct ranks and distinct generated URLs; no URL collisions.
- [ ] **Dropped columns gone from schema.yml:** `grep -n "^\s*- name: genus\|family\|scientificName\|canonical_name" data/dbt/models/marts/schema.yml` returns empty for any column that was dropped from the SELECT.
- [ ] **`OCCURRENCE_COLUMNS` in `filter.ts` updated:** Every column listed in the tuple exists in the new `occurrences` table schema; removed columns are removed from the tuple.
- [ ] **`buildFilterSQL` updated:** No clause references `genus = `, `family = `, or `scientificName = ` after those columns drop; filter uses hierarchy-based descendant query instead.
- [ ] **`geo_blob` column layout updated:** `_GEO_COLS` in `sqlite_export.py` and positional reads in `features.ts` both updated atomically; test by confirming occurrence popup shows correct `scientificName` for a known record.
- [ ] **`bee-atlas.ts` inline SQL updated:** `COUNT(DISTINCT genus)`, `COUNT(DISTINCT family)`, and `SELECT DISTINCT family, genus, scientificName` all replaced with hierarchy-based equivalents.
- [ ] **`bee-map.ts` checklist filter updated:** Column list `['county', 'scientificName', 'genus', 'family', 'year', 'month']` and `r.genus !== taxon` / `r.family !== taxon` predicates replaced.
- [ ] **DB size measured:** `occurrences.db` after normalization is smaller than before (fewer columns) even with hierarchy table addition; record the size diff in the phase VERIFICATION.md.
- [ ] **`tablesReady` timing:** Benchmark confirms performance not regressed from v4.3 baseline (~250 ms); measure in both Chrome and Firefox.
- [ ] **Slug collision check run:** `SELECT rank, name FROM taxa WHERE name IN (SELECT name FROM taxa GROUP BY name HAVING count(*) > 1)` — all colliding names map to distinct URLs.
- [ ] **`filter.test.ts` assertions updated:** Tests for `family = '...'`, `genus = '...'`, `scientificName = '...'` SQL generation replaced with hierarchy-based filter assertions; tests for `OCCURRENCE_COLUMNS` updated.
- [ ] **`species_export.py` `SPECIES_COLUMNS` updated:** Any columns dropped from the species mart are removed from the Python constant; column order matches dbt SELECT order.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Name-non-uniqueness merge discovered after hierarchy built | MEDIUM | Add `taxon_id` uniqueness constraint; find and fix all name-keyed JOINs; rebuild hierarchy table |
| `geo_blob` positional mismatch (silent wrong data) | LOW | Fix `_GEO_COLS` + positional indexes atomically; rebuild `occurrences.db`; re-upload to S3 |
| Bycatch leaking into autocomplete | LOW | Add `is_bee` filter to autocomplete query; no schema change needed |
| Recursive CTE too slow in wa-sqlite | MEDIUM | Replace with nested-set range query; rebuild hierarchy table with `lft`/`rgt`; update filter SQL |
| Orphan bycatch taxa (no hierarchy entry) | LOW | Add targeted ancestry loading for bycatch taxon IDs; rebuild hierarchy; rebuild `occurrences.db` |
| Slug collision (genus + subgenus same URL) | MEDIUM | Define and implement rank-prefixed URL scheme; add collision check to pipeline; rebuild Eleventy output |
| DB size regression (ancestor columns in occurrences) | LOW | Remove ancestor columns from occurrences mart SELECT; rebuild and re-measure |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Name-non-uniqueness merge | Foundation — hierarchy schema | `taxon_id` UNIQUE constraint on hierarchy table; name-collision audit |
| Contract rewrite cascade (6+ consumers) | Normalization — coordinated migration | `npm test` passes; `dbt build` passes; runtime filter tested for genus/family/species |
| Recursive CTE performance | Foundation — structure choice | Nested-set MPTT chosen; `EXPLAIN QUERY PLAN` shows index range scan for descendant query |
| Orphan bycatch taxa | Foundation — hierarchy build | Post-build JOIN assertion: 0 orphaned taxon_ids in occurrences |
| Synonym/inactive-taxon ID corruption | Foundation + Normalization | Post-build assertion: 0 non-null taxon_ids in occurrences without hierarchy entry |
| Rank-rollup double-counting | Pages — count recomputation | SUM of leaf counts == ancestor count; spot-check 5 genera |
| Slug collisions | Pages — URL scheme definition | Pre-generation collision check: GROUP BY name HAVING count > 1; all colliding names → distinct URLs |
| Bycatch leaking into bee-only surfaces | Frontend cutover | `is_bee` flag query; autocomplete manual test for known bycatch genus |
| DB size regression | Normalization (measure) + Foundation (prevent) | `occurrences.db` size delta logged in VERIFICATION.md |
| `geo_blob` positional mismatch | Normalization — atomic update | Occurrence popup shows correct name for known ecdysis record |
| `filter.test.ts` test breakage | Normalization | `npm test` exits 0 after column removal |

---

## Sources

All findings from direct code inspection of (paths relative to `/home/peter/dev/beeatlas/`):

- `data/dbt/models/marts/schema.yml` — 37-column contract being rewritten
- `data/dbt/models/marts/occurrences.sql` — current column SELECT
- `data/dbt/models/intermediate/int_combined.sql` — three-arm UNION, synonym joins, taxon_id backfill
- `data/dbt/models/intermediate/int_species_universe.sql` — bee-family filter gate, `DISTINCT ON` collapse
- `data/dbt/models/marts/species.sql` — species mart (separate contract)
- `data/sqlite_export.py` — `_GEO_COLS` hardcoded list and geo_blob construction
- `data/taxa_pipeline.py` — Anthophila-filtered hierarchy, `active = 'true'` string guard
- `data/species_export.py` — `SPECIES_COLUMNS`, `higher_rank_taxon_ids.json`
- `src/filter.ts` — `OCCURRENCE_COLUMNS`, `OccurrenceRow`, `buildFilterSQL`, `queryFilteredCounts`
- `src/features.ts` — `_buildGeoJSONFromRaw`, positional column indexes
- `src/bee-atlas.ts` — inline SQL `COUNT(DISTINCT genus/family)`, autocomplete query
- `src/bee-map.ts` — checklist column list and filter predicates
- `src/tests/filter.test.ts` — hard assertions on SQL strings and `OCCURRENCE_COLUMNS` contents
- `src/tests/build-output.test.ts` — build-time page assertions
- `.planning/PROJECT.md` — v4.6 milestone context, Key Decisions, WARNING-02 (subgenus counts)
- Prior PITFALLS.md (v4.5 research, 2026-05-29) — context on contract change mechanics

---
*Pitfalls research for: v4.6 Taxonomy Hierarchy & Normalization*
*Researched: 2026-06-01*
