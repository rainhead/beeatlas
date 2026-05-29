# Features Research

**Domain:** Biodiversity occurrence atlas — taxonomy completeness, taxon ID resolution, inactive taxon handling, nested-set prep
**Researched:** 2026-05-29
**Milestone:** v4.5 iNat Taxonomy & Species Completeness

---

## Table Stakes

Features that must ship for the milestone to be considered complete. Missing = product is in a broken or misleading state.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| All observed species visible in species tree | 65 species / 1,745 occurrences currently invisible because `specific_epithet` is sourced only from the WA checklist; users navigating to any of these taxa get a dead-end | Medium | `int_species_universe` gate must admit non-checklist species with occurrences by deriving `specific_epithet` from `canonical_name` when checklist arm is absent |
| `taxon_id` in `species.parquet` and `occurrences.parquet` | Required for stable deep-linking and future subtaxon queries; it is already being resolved by `resolve_taxon_ids.py` but is not emitted into the marts | Low | Add `taxon_id INTEGER` column to `species.sql` mart and `occurrences.sql` mart; no schema change to `int_combined` needed beyond the existing LEFT JOIN on `stg_inat__canonical_to_taxon_id` |
| Occurrences of inactive/synonymized taxa remapped at dbt layer | Occurrences recorded under an old name must surface under the current accepted name; the existing `occurrence_synonyms.csv` mechanism is curator-managed and therefore incomplete — it cannot cover hundreds of potential iNat taxonomy changes | High | Pull accepted-name mappings from `taxon_lineage_extended` or the iNat inactive-taxa bridge; extend `occurrence_synonyms` dbt seed or create a new `inactive_taxon_remapping` table |
| Unmappable occurrences flagged, not silently dropped | When an inactive name cannot be resolved to a current accepted species, the occurrence must not disappear; it should be marked with a `taxon_status` flag so curators can investigate | Low | `taxon_status` enum column on species: `'active'`, `'synonym'`, `'unmappable'` |
| Ancestor chain persisted in pipeline for future subtaxon queries | Nested-set or ancestor-array representation must be materialized at pipeline time; querying the ancestor walk at frontend runtime is not possible given static hosting | Medium | Data-layer only this milestone: write `taxon_ancestors` or `nested_set` table to DuckDB; no frontend exposure needed |

---

## Differentiators

Features not strictly expected but that raise quality and usability meaningfully.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `taxon_id`-based deep links on species pages | Stable URL `/species/inat/N/` or `?taxon=N` survives species renames; useful for partner systems linking in | Low | Eleventy page generation can generate redirect stubs; low priority unless requested |
| Managed/invasive species badge on species pages | "Apis mellifera (European honey bee) — managed / non-native" contextualizes why this species appears on a native bee atlas | Low | `status` field already in `stg_checklist__species.sql` (`'status'` column); need to propagate to non-checklist species via `taxon_lineage_extended` metadata or a curator annotation |
| `inat_url` on species pages linking to the iNat taxon page | `https://www.inaturalist.org/taxa/{taxon_id}` gives users the authoritative iNat species page with photos, range maps, ID tips | Very low | `taxon_id` is already in `canonical_to_taxon_id`; once emitted to `species.parquet`, the template adds a one-line link |
| Lineage coverage completeness reporting | How many species in the universe have `taxon_id`, `family`, `subfamily` resolved? Surfaced as a pipeline diagnostic log line | Very low | One SELECT COUNT(*) query at the end of `taxa_pipeline.py`; mirrors existing lineage coverage test |

---

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Frontend subtaxon query ("show all Halictidae occurrences") | Static hosting; the nested-set or ancestor-array lives in DuckDB server-side; the SQLite `occurrences.db` frontend artifact does not have a taxon hierarchy table | Persist the nested-set data in DuckDB this milestone; wire it to the frontend in a future milestone once the query pattern is clear |
| Automated GBIF or COL synonym resolution | Out of scope for this milestone; adds a new data dependency and disambiguation complexity; GBIF/COL have different ID spaces than iNat | Stick to iNat taxonomy as the single source of truth; extend `occurrence_synonyms.csv` for known mismatches |
| Splitting active/inactive status handling across both pipeline and frontend | Mixing runtime name resolution into the TypeScript layer adds complexity and breaks static hosting assumptions | All taxon status decisions made at pipeline time; frontend only displays the resolved canonical_name and a status flag |
| Retroactive reingestion of Ecdysis records with renamed taxa | Re-downloading Ecdysis for all records just because a taxon name changed is expensive and fragile; the dbt LEFT JOIN on `occurrence_synonyms` already handles name remapping without reingestion | Extend `occurrence_synonyms` or the new inactive-taxon remapping table instead |
| DuckDB-WASM on the frontend for taxonomy hierarchy queries | Already rejected for page weight (see project memory) | wa-sqlite with pre-flattened columns |
| Nested-set LEFT/RIGHT values surfaced in frontend | No frontend use case yet; the query `WHERE lft BETWEEN parent.lft AND parent.rgt` requires the full hierarchy table which is not in `occurrences.db` | Persist in DuckDB only; document the pattern |

---

## Feature Details

### Feature 1: Invisible Species Visibility Fix

**Problem statement:** `int_species_universe.sql` gates species pages via `specific_epithet IS NOT NULL` in `_data/species.js` (line 97). For species that appear only in `occ_agg` (the ecdysis/inat_obs occurrence arm) and not in `stg_checklist__species`, `specific_epithet` is `NULL` because the checklist is the sole source of that field. The `DISTINCT ON (canonical_name)` row already exists in the mart but is filtered out downstream.

**Root cause in the SQL:** `c.specific_epithet AS specific_epithet` — no fallback to derive it from `canonical_name` when `c.scientificName IS NULL` (i.e., when the species is not on the checklist).

**Fix:** Add a `COALESCE` fallback in `int_species_universe.sql`:
```sql
COALESCE(
    c.specific_epithet,
    NULLIF(split_part(COALESCE(c.canonical_name, oa.canonical_name), ' ', 2), '')
) AS specific_epithet
```
This derives `specific_epithet` from the second token of `canonical_name` for any species not on the checklist. The `NULLIF(..., '')` guard prevents an empty string when `canonical_name` is a genus-only token.

**Downstream impacts:**
- `species.sql` mart: no SQL change, but the emitted parquet gains `specific_epithet` values for 65 previously-null rows
- `_data/species.js` filter: the `s.specific_epithet !== null` guard now passes for these species
- `species_export.py`: no change needed; slug already computed from `canonical_name`
- `species_maps.py`: gains 65 new species in the species universe; map generation runs for them
- Eleventy pagination: generates ~65 new species pages
- dbt column count: no change (column already present; value changes from NULL to non-null)

**Scope:** dbt-only change + pytest assertion that `specific_epithet IS NOT NULL` for all rows in the species mart. LOW complexity.

---

### Feature 2: Taxon ID in Marts

**Current state:** `canonical_to_taxon_id` table exists (written by `resolve_taxon_ids.py`) and is LEFT JOINed in `int_species_universe.sql`, but `taxon_id` is not in the SELECT list of `species.sql` or `occurrences.sql` marts. The joined `ctt` alias is used only indirectly for the `stg_inat__taxon_lineage_extended` join; the `taxon_id` value itself is discarded.

**Required changes:**

For `species.sql`: add `ctt.taxon_id` to the SELECT (add column to `int_species_universe` species_universe CTE first, then propagate to the mart). dbt schema.yml contract updates from 20 to 21 columns (or 19 to 20 SQL-emittable columns; the slug is Python-added).

For `occurrences.sql`: the `canonical_to_taxon_id` bridge is not currently joined in `int_combined.sql` or `occurrences.sql`. Adding it there would require a new LEFT JOIN in `int_combined` on `canonical_name`. The join is cheap (in-memory; `canonical_to_taxon_id` is small). Alternatively, the `taxon_id` can be written only to `species.parquet` and the frontend can look it up via the species mart rather than the occurrences mart. For the purpose of filtering by taxon_id (future), having it in `occurrences.parquet` is necessary. For the purpose of deep-linking from occurrence sidebar, the frontend can look up the species entry. **Recommended:** add `taxon_id` to `species.parquet` only in this milestone; defer to `occurrences.parquet` until there is a concrete frontend query need.

**Scope:** dbt `int_species_universe` + `species.sql` mart change. dbt schema.yml contract update. `species_export.py` PyArrow schema update to include `taxon_id INTEGER`. LOW complexity.

---

### Feature 3: Inactive Taxon Handling

**Problem statement:** iNaturalist periodically synonymizes or inactivates taxa. An occurrence recorded as "Halictus confusus" may now be classified under "Halictus rubicundus" (example only) in iNat's current taxonomy. The current `occurrence_synonyms.csv` dbt seed is curator-managed (one row manually added for Agapostemon texanus → subtilior). It cannot scale to cover the full iNat taxonomy churn history.

**Taxonomy databases: how they handle inactive taxa:**

- **iNaturalist (`taxa.csv.gz`):** The `active` column distinguishes active (`'true'`) from inactive (`'false'`) taxa. Inactive taxa appear in the file with their `taxon_id`. The `ancestry` chain always points to the accepted active taxon at each rank. However, the `taxa.csv.gz` file does NOT directly expose "this inactive taxon is a synonym of that active taxon" — that relationship requires the iNat API `/v1/taxa/{id}` which returns `current_synonymous_taxon_ids` for inactive taxa. (MEDIUM confidence — from iNat forum posts and Open Data documentation.)

- **GBIF:** Publishes a `taxon.txt` DwC-A with `taxonomicStatus` (`ACCEPTED`, `SYNONYM`, `DOUBTFUL`) and `acceptedNameUsageID` for synonyms. GBIF's backbone is the authoritative cross-source reconciliation but uses a different ID space than iNat.

- **Catalogue of Life (COL):** Similarly publishes synonym→accepted mappings, also in a different ID space.

**Recommended approach for this milestone:**

Use the iNat inactive-taxon API endpoint to augment `resolve_taxon_ids.py`: after resolving a canonical_name to a `taxon_id`, if the returned taxon is inactive (`is_active: false`), follow the `current_synonymous_taxon_ids` field (array of active taxon IDs) to find the accepted name. Write the result as an additional column `accepted_taxon_id` in `canonical_to_taxon_id`.

Alternatively — simpler and more reliable — extend the existing `_pick_match` function in `resolve_taxon_ids.py` to:
1. Accept inactive taxon IDs too (currently it filters `is_active == true`)
2. When a match is inactive, follow the API `GET /v1/taxa/{id}` to retrieve `current_synonymous_taxon_ids`
3. Store the mapping `canonical_name → accepted_canonical_name` in a new `inactive_taxon_map` table
4. Expose this as a dbt seed or dbt source alongside `occurrence_synonyms`

The result flows into `int_combined` via the same LEFT JOIN pattern as `occurrence_synonyms`.

**Taxon stability across taxonomy updates:** iNat taxon IDs are stable identifiers — a given integer ID always refers to the same concept, even if the taxon is later inactivated or renamed. The `canonical_to_taxon_id` bridge already stores integer IDs. Using `taxon_id` as the join key (rather than string `canonical_name`) is the correct long-term strategy for stability.

**Scope for this milestone:** Add `taxon_status` column to `canonical_to_taxon_id` (values: `'active'`, `'inactive_remapped'`, `'inactive_unmappable'`). Extend `resolve_taxon_ids.py` to follow `current_synonymous_taxon_ids` and write remapping. Update dbt staging to treat `inactive_remapped` records like `occurrence_synonyms`. Add `taxon_status` to `species.parquet`. HIGH complexity (requires API calls + new pipeline logic + dbt changes).

---

### Feature 4: Nested-Set / MPTT Prep

**What it is:** A nested-set (also called Modified Preorder Tree Traversal, MPTT) stores `lft` and `rgt` integer values per taxon node such that all descendants of a node N satisfy `lft BETWEEN N.lft AND N.rgt`. This enables "all Halictidae" queries in O(1) range scan rather than recursive CTE. An equivalent alternative is storing an ancestor-ID array per taxon.

**iNat's `ancestry` column:** The `taxa.csv.gz` archive already contains an `ancestry` column: a slash-separated string of ancestor taxon IDs from root to parent (not including self). This is semantically equivalent to a materialized ancestor path, which supports "is this taxon a descendant of N?" queries as `ancestry LIKE '%/N/%' OR ancestry LIKE '%/N'`. This is how `taxa_pipeline.py` currently filters to Anthophila descendants.

**Recommended representation for this milestone:** Materialize the ancestor-array approach rather than nested-set integers. Nested-set requires a stable ordering pass over the entire tree and must be recomputed every time the taxonomy changes. Ancestor-array (or ancestry-path) is additive: new taxa can be inserted without renumbering existing records.

**Concrete schema:**
```sql
CREATE TABLE inaturalist_data.taxon_ancestors AS
SELECT
    taxon_id,
    name AS taxon_name,
    rank,
    ancestry,
    -- Array of ancestor IDs as integers
    array_transform(
        string_split(ancestry, '/'),
        x -> TRY_CAST(x AS BIGINT)
    ) AS ancestor_ids,
    -- Convenience: immediate parent ID
    TRY_CAST(
        list_element(string_split(ancestry, '/'), -1)
    AS BIGINT) AS parent_id
FROM all_active_bees  -- same CTE as taxa_pipeline.py
```

**Frontend use:** Not exposed in this milestone. The `taxon_ancestors` table lives in `beeatlas.duckdb` only. Future milestone will materialize a `subtaxon_occurrence_counts` table at pipeline time for "all Halictidae" queries.

**Scope:** Data-layer only — extend `taxa_pipeline.py` to write `taxon_ancestors` table after `taxon_lineage_extended`. No dbt change. No export. No frontend change. MEDIUM complexity (the DuckDB SQL is straightforward given the existing `all_active_bees` CTE; the main work is testing correctness of the array representation).

---

## Expected User-Facing Behaviors (When All Features Work)

| Behavior | Current State | Target State |
|----------|---------------|--------------|
| Navigate to species page for Apis mellifera | 404 (no page generated because `specific_epithet = NULL`) | Valid page at `/species/Apis/mellifera/` showing occurrence count, SVG map, iNat link, managed-species badge |
| Navigate to species page for Halictus rubicundus | 404 | Valid page with occurrence data |
| Click iNat link on species page | N/A | Opens `https://www.inaturalist.org/taxa/{taxon_id}` |
| Search species index for "mellifera" | No results | Species appears in genus/family index |
| Occurrence with outdated name in Ecdysis | Occurrence visible under old name or invisible | Occurrence remapped to current accepted name; visible under accepted species page |
| Taxon filter in sidebar autocomplete | 65 species missing | All observed species appear |

---

## Feature Dependencies

```
Feature 1 (Invisible species fix)
  → dbt int_species_universe.sql: add COALESCE fallback for specific_epithet
  → _data/species.js: no change (filter already works once specific_epithet is non-null)
  → species_maps.py: gains 65 species; map generation runs
  → Eleventy: generates ~65 new pages
  → PREREQUISITE for: Feature 2 (taxon_id meaningless for invisible species)

Feature 2 (taxon_id in species.parquet)
  → int_species_universe.sql: add taxon_id to SELECT
  → species.sql mart: +1 column
  → species_export.py: PyArrow schema update
  → Eleventy templates: add iNat link
  → dbt schema.yml contract: update column count
  → DEPENDS ON: Feature 1 (species must be visible to receive taxon_id)
  → PREREQUISITE for: Feature 3 (accepted_taxon_id tracking)

Feature 3 (Inactive taxon handling)
  → resolve_taxon_ids.py: follow current_synonymous_taxon_ids for inactive taxa
  → canonical_to_taxon_id table: add taxon_status + accepted_canonical_name columns
  → occurrence_synonyms dbt seed: augmented OR new inactive_taxon_map dbt source
  → int_combined.sql: extend synonym LEFT JOIN to cover inactive remappings
  → int_species_universe.sql: filter or flag unmappable inactive taxa
  → DEPENDS ON: Feature 2 (taxon_id is the stable handle for following synonymy)
  → INDEPENDENT OF: Feature 4

Feature 4 (Nested-set / ancestor-array prep)
  → taxa_pipeline.py: add taxon_ancestors table write after taxon_lineage_extended
  → No dbt change, no export, no frontend change
  → DEPENDS ON: Feature 1 (conceptually, but not technically — can build independently)
  → INDEPENDENT OF: Features 2 and 3
```

---

## Complexity Summary

| Feature | Pipeline | dbt | Frontend | Eleventy | Overall |
|---------|----------|-----|----------|----------|---------|
| 1. Invisible species fix | None | Low (1 COALESCE) | None | Automatic (new pages) | Low |
| 2. taxon_id in species.parquet | None | Low (+1 column) | Very low (1 template link) | Very low | Low |
| 3. Inactive taxon handling | High (API calls + new logic) | Medium (new join) | None | None | High |
| 4. Nested-set prep | Medium (new DuckDB table) | None | None | None | Medium |

**Recommended phase order:** 1 → 2 → 4 → 3. Features 1 and 2 are low-risk pipeline+dbt changes that unblock visible user value. Feature 4 is data-layer-only with no user-facing exposure (low risk, good to do early). Feature 3 requires iNat API calls and a new resolution pathway — best done last after the stable infrastructure is in place.

---

## Sources

- `data/dbt/models/intermediate/int_species_universe.sql` — gate for species visibility; `specific_epithet` sourcing
- `data/dbt/models/staging/stg_inat__canonical_to_taxon_id.sql` — taxon_id bridge table schema
- `data/dbt/models/staging/stg_inat__taxon_lineage_extended.sql` — lineage table schema
- `data/dbt/models/marts/species.sql` — current 20-column (SQL) + 1-Python mart
- `data/dbt/models/marts/occurrences.sql` — 36-column occurrence mart
- `data/dbt/models/intermediate/int_combined.sql` — ARM 1/2/3 UNION ALL; existing occurrence_synonyms LEFT JOIN pattern
- `data/resolve_taxon_ids.py` — `_pick_match` function; `canonical_to_taxon_id` write path; `lineage_unresolved.csv` pattern
- `data/taxa_pipeline.py` — `all_active_bees` CTE; ancestry column usage; `active = 'true'` string comparison
- `.planning/PROJECT.md` — milestone goals; "65 species / 1,745 occurrences currently invisible"
- iNat API: inactive taxon `current_synonymous_taxon_ids` field — documented in iNat API Explorer `/v1/taxa/{id}` response schema (HIGH confidence from direct API inspection)
- iNat Open Data `taxa.csv.gz` `active` column — string `'true'`/`'false'`, confirmed in `taxa_pipeline.py` comments and tests
- DuckDB `string_split` + `array_transform` for ancestry-array materialization: standard DuckDB array functions (HIGH confidence)
