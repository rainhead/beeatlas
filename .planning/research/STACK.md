# Stack Research: v4.5 iNat Taxonomy & Species Completeness

**Project:** BeeAtlas v4.5
**Researched:** 2026-05-29
**Scope:** New capabilities only. Existing stack (Python 3.14+, dbt-duckdb 1.10.1,
DuckDB 1.5.2, dlt, requests, wa-sqlite, Mapbox GL JS, Lit) is confirmed and not
re-researched. Previous STACK.md (v4.0) documents the taxa.csv.gz ancestry walk
pattern that is already in production.

---

## New Dependencies

None. All four milestone features are achievable with the existing stack.

---

## Feature 1: `specific_epithet` for Non-Checklist Species

### Problem

65 binomial species with 1,745 Ecdysis occurrences and 3,048 iNat obs have
`specific_epithet IS NULL` in `int_species_universe` because `specific_epithet`
currently flows only from `stg_checklist__species` (the Bartholomew 2024 checklist).
Occurrence-only species have no checklist row, so `specific_epithet` is never
populated from the FULL OUTER JOIN.

### Source Decision: taxa.csv.gz (already downloaded), not DwC-A

Two iNat taxonomy archives exist:

| Archive | URL | Columns | Use for epithet? |
|---------|-----|---------|-----------------|
| AWS Open Data `taxa.csv.gz` | `s3://inaturalist-open-data/taxa.csv.gz` | `taxon_id, ancestry, rank_level, rank, name, active` | YES — `split_part(name, ' ', 2)` |
| DwC-A taxonomy | `inaturalist-taxonomy.dwca.zip` | `id, taxonID, parentNameUsageID, kingdom, phylum, class, order, family, genus, specificEpithet, infraspecificEpithet, modified, scientificName, taxonRank, references` | NO — see below |

**DwC-A is disqualified for all four features:**
- Does NOT include `acceptedNameUsageID` or `taxonomicStatus` fields (confirmed by iNat
  forum feature request thread; these were proposed as future additions in 2026 but are
  not present in the current export). Inactive taxa are simply absent from the DwC-A.
- `parentNameUsageID` is a URL string, not an integer, requiring URL parsing for any join.
- Intermediate ranks (subfamily, tribe) are absent (confirmed in iNat forum reports on
  missing intermediate ranks).
- Requires a 65+ MB zip download and recursive tree traversal vs. the existing 37 MB
  taxa.csv.gz with its flat ancestry string.

**taxa.csv.gz is sufficient.** The `name` column contains the full binomial for species
(`rank = 'species'`), e.g. `'Andrena cuneilabris'`. Extract the epithet with:

```sql
NULLIF(split_part(name, ' ', 2), '') AS specific_epithet
```

This is pure DuckDB SQL — no new Python code needed.

### Implementation

Extend `stg_inat__taxon_lineage_extended` (or a new parallel staging model) to expose
`specific_epithet`. The cleanest approach is a new dbt staging model
`stg_inat__taxon_epithet` that joins `taxon_lineage_extended` back to the raw taxa table:

```sql
-- stg_inat__taxon_epithet.sql
SELECT
    tle.taxon_id,
    NULLIF(split_part(t.name, ' ', 2), '') AS specific_epithet
FROM {{ source('inaturalist_data', 'taxon_lineage_extended') }} tle
JOIN read_csv('{{ var("taxa_csv_path") }}', ...) t ON t.taxon_id = tle.taxon_id
WHERE t.rank = 'species'
```

Alternatively (simpler): extend `load_taxon_lineage_extended` in `taxa_pipeline.py` to
also write a `name` or `specific_epithet` column into the existing
`taxon_lineage_extended` table. This avoids a new model and keeps the data in one place.

**Recommendation:** Add `specific_epithet` column to `inaturalist_data.taxon_lineage_extended`
by extending the existing `taxa_pipeline.py` SQL. Then expose it via
`stg_inat__taxon_lineage_extended`. Then apply it in `int_species_universe`:

```sql
COALESCE(c.specific_epithet, tle.specific_epithet) AS specific_epithet
```

**Verified:** `split_part(name, ' ', 2)` on active bee species in taxa.csv.gz returns
correct epithets for all tested rows. Non-species ranks have single-word names, so
`NULLIF(..., '')` guards against genus-level rows emitting empty strings.

---

## Feature 2: Stable Integer Taxon IDs System-Wide

### Current State

The `canonical_to_taxon_id` bridge table (736 rows) maps `canonical_name → taxon_id`.
The `int_species_universe` model joins through it but does not yet pass `taxon_id` into
the `species` mart or `occurrences` mart.

Ecdysis occurrences already have `taxon_id` in `ecdysis_data.occurrences` (INTEGER,
46,090 non-null rows). The iNat expert obs CSV (`inat_expert_obs.csv`) has a `taxon_id`
column that the current `inat_obs_pipeline.py` does not read or persist.

### Implementation

No new libraries needed. Three coordinated changes:

**a) `inat_obs_pipeline.py`:** Read and persist `taxon_id` from the expert obs CSV into
`inat_obs_data.observations`. The column already exists in the CSV (confirmed via header
inspection); add it to the `CREATE TABLE` DDL and the `INSERT` statement.

**b) `int_species_universe.sql` → `species` mart:** Add `taxon_id BIGINT` via the
existing `stg_inat__canonical_to_taxon_id` LEFT JOIN (already in the model at line 123).
Expose `ctt.taxon_id` in the SELECT list. The `species_export.py` post-step will carry
it through to `species.json` / `species.parquet`.

**c) `occurrences` mart:** Add `taxon_id INTEGER` sourced from:
- ARM 1 (Ecdysis): `ecdysis_data.occurrences.taxon_id` (already available)
- ARM 3 (iNat expert obs): `inat_obs_data.observations.taxon_id` (after (a) above)
- ARM 2 (provisional WABA): NULL (WABA obs have no taxon_id)

The dbt 30-column contract on `marts/occurrences` must expand by 1 column. Update
`data/dbt/models/marts/schema.yml` and `data/sqlite_export.py` `CREATE TABLE`
simultaneously — these must stay in sync (per project memory on schema change procedure).

### Confidence

HIGH — all data is already in place. This is a wiring exercise across existing sources.

---

## Feature 3: Inactive Taxon Remapping

### Findings

**taxa.csv.gz does NOT contain `current_taxon_id` or any redirect column.**

Confirmed by inspecting the file: only 6 columns — `taxon_id, ancestry, rank_level,
rank, name, active`. Inactive taxa are present in the file (`active = 'false'` string)
but there is no pointer to the accepted replacement.

**The iNat API v1 `GET /taxa/{id}` response includes `current_synonymous_taxon_ids`**
for inactive taxa. For example, `taxon_id=199075` (Lasioglossum zephyrum, inactive)
returns `current_synonymous_taxon_ids: [905961]`. This is the authoritative source for
inactive→accepted remapping.

**DwC-A taxonomy does NOT include `acceptedNameUsageID` or `taxonomicStatus`** for
inactive taxa (confirmed: these fields were requested as a feature in 2026 but are not
present). The DwC-A simply omits inactive taxa entirely.

**Scale of problem in current data:**
- 5 canonical names in `int_species_universe` match only inactive taxa in taxa.csv.gz:
  `coelioxys octodentata`, `lasioglossum zephyrum`, `lasioglossum zonulum`,
  `melissodes metenua`, `melissodes semilupina`
- 1,454 inactive bee species exist in taxa.csv.gz total (1,717 inactive across all
  bee ranks)
- The iNat expert obs CSV uses `taxon_id` from iNat at time of download — some of
  these IDs may be inactive

### Implementation

**Source: iNat API `GET /taxa?id=id1,id2,...` with `is_active=false` filter.**

Pattern: a new `inactive_taxon_remapping.py` pipeline step (or extension of
`resolve_taxon_ids.py`) that:

1. Queries for all `taxon_id` values in `canonical_to_taxon_id` where the corresponding
   taxa.csv.gz row has `active = 'false'`
2. Calls `GET /api.inaturalist.org/v1/taxa?id=ID1,ID2,...` (up to 30 IDs per request
   per API convention) to retrieve `current_synonymous_taxon_ids`
3. When `current_synonymous_taxon_ids` has exactly 1 element: adds the remapping to
   `occurrence_synonyms.csv` seed (or a new `inactive_taxon_remaps` seed table)
4. When 0 or >1 elements: logs to a `taxon_remap_unresolved.csv` file (mirrors the
   `lineage_unresolved.csv` pattern)

The `occurrence_synonyms` dbt seed is the correct downstream home. Existing JOIN logic
in `int_combined` and `stg_checklist__species` already applies synonymy; inactive
remaps use the same mechanism.

**API pacing:** Reuse `_inat_get_with_retry` and `_INAT_PACE_SECONDS` from
`inaturalist_pipeline.py`. No new HTTP library needed.

**Nightly behavior:** Step runs incrementally — only new `taxon_id` values not yet
checked. Store `last_checked_at` in a sidecar JSON to avoid re-querying already-resolved
inactive taxa.

**Note on iNat expert obs taxon IDs:** The obs CSV `taxon_id` column records the taxon
ID at time of CSV export. iNat may have swapped the taxon since then; the
`current_synonymous_taxon_ids` lookup handles this case. For obs where `taxon_id` is
active, no remapping needed. For obs where `taxon_id` is inactive, the remapping step
resolves it to the accepted ID, which then maps to the accepted `canonical_name` via
`taxon_lineage_extended`.

---

## Feature 4: Nested-Set / MPTT Groundwork

### Findings

**DuckDB 1.5.2 does not need recursive CTEs for ancestor-descendant queries on this
data.** The `ancestry` column in taxa.csv.gz is a slash-delimited chain of integer
ancestor IDs (e.g. `'48460/1/630955/57668/571383'`). Ancestor-descendant relationships
can be expressed as LIKE queries:

```sql
-- All descendants of genus 571383:
WHERE ancestry LIKE '%/571383/%' OR ancestry LIKE '%/571383'
   OR taxon_id = 571383
```

This pattern is already used in `taxa_pipeline.py` for the Anthophila filter.

**For nested-set / MPTT prep**, the useful materialization is an
`int_taxon_ancestors` table that precomputes the full ancestor list per taxon:

```sql
-- In DuckDB, build ancestor-descendant closure table
CREATE OR REPLACE TABLE inaturalist_data.taxon_ancestry AS
WITH unnested AS (
    SELECT
        taxon_id AS descendant_id,
        CAST(unnest(string_split(ancestry, '/')) AS BIGINT) AS ancestor_id
    FROM read_csv('raw/taxa.csv.gz', ...)
    WHERE active = 'true'
      AND (ancestry LIKE '%/630955/%' OR ancestry LIKE '%/630955'
           OR taxon_id = 630955)
    UNION ALL
    SELECT taxon_id, taxon_id FROM [same filter]  -- self-reference
)
SELECT ancestor_id, list(descendant_id ORDER BY descendant_id) AS descendant_ids
FROM unnested
WHERE ancestor_id IN (SELECT taxon_id FROM [same filter])
GROUP BY ancestor_id
```

This produces one row per bee taxon with the list of all descendant taxon_ids — the
canonical closure table for subtaxon queries. Stored in DuckDB; not exported to the
frontend (too large). The frontend subtaxon filter would query `canonical_to_taxon_id`
to get `taxon_id`, then join against this closure table to expand the filter to all
descendant names.

**parent_id derivation:** `CAST(list_last(string_split(ancestry, '/')) AS BIGINT)`.
Verified correct in DuckDB 1.5.2.

**Depth:** `length(ancestry) - length(replace(ancestry, '/', '')) + 1`. Efficient,
no recursive CTE.

**Scale:** 17,343 active bee taxa in taxon_lineage_extended. The unnest step produces
~250K–500K (ancestor_id, descendant_id) pairs. A `GROUP BY` closure table is ~17K rows
with list columns — fits in memory and materializes in seconds.

**No new Python libraries needed.** This is pure DuckDB SQL, callable from
`taxa_pipeline.py`.

**Scope boundary:** The nested-set materialization is a pipeline-side artifact for
future subtaxon queries. The frontend filter UI is out of scope for v4.5. The milestone
calls for "groundwork" — materializing the closure table and proving the query pattern
is the deliverable, not the frontend integration.

---

## What NOT to Add

| Library | Reason |
|---------|--------|
| DwC-A taxonomy (`inaturalist-taxonomy.dwca.zip`) | No `acceptedNameUsageID`, no intermediate ranks, URL-form IDs, 65+ MB zip. taxa.csv.gz covers all four features. |
| `pyinaturalist` | Wrapper over the same API already called directly via `requests`. |
| `pandas` / `polars` | DuckDB handles all transforms. No dataframe needed. |
| Any recursive-CTE library | DuckDB's ancestry string + LIKE queries replace recursive CTEs for this tree structure. |
| `networkx` (already installed via dlt) | Not needed; ancestry string IS the tree encoding. |
| DuckDB-WASM (frontend) | Already rejected (project memory). |
| GBIF backbone taxonomy | iNat's own taxonomy is the authoritative source for iNat records. Do not mix. |

---

## Integration Points

| Integration | What Changes | Risk |
|-------------|-------------|------|
| `taxa_pipeline.py` `load_taxon_lineage_extended` | Add `specific_epithet` column to `taxon_lineage_extended` table | Low — additive column |
| `data/dbt/models/staging/stg_inat__taxon_lineage_extended.sql` | Expose `specific_epithet` | Low — pass-through |
| `data/dbt/models/intermediate/int_species_universe.sql` | `COALESCE(c.specific_epithet, tle.specific_epithet)` + `ctt.taxon_id` in SELECT | Low — existing JOIN already present |
| `data/dbt/models/marts/occurrences.sql` | Add `taxon_id INTEGER` column (ARM 1 from ecdysis, ARM 3 from inat_obs) | Medium — dbt contract expansion |
| `data/dbt/models/marts/schema.yml` | Expand contract to N+1 columns | Must be coordinated with sqlite_export.py |
| `data/sqlite_export.py` `CREATE TABLE` DDL | Add `taxon_id INTEGER` | Must coordinate with schema.yml |
| `data/inat_obs_pipeline.py` | Read and persist `taxon_id` from inat_expert_obs.csv | Low — column already in CSV |
| `data/run.py` STEPS | Add `inactive-taxon-remap` step before `dbt-build` | Low |
| `data/taxa_pipeline.py` | Add `taxon_ancestry` table materialization | Low — additive |
| `occurrence_synonyms.csv` seed | May gain rows from inactive remap step | Low — same format |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| `specific_epithet` from `split_part(name, ' ', 2)` | HIGH | Verified against live taxa.csv.gz; all species rows have binomial names |
| taxa.csv.gz has no `current_taxon_id` | HIGH | Directly inspected file; 6 columns confirmed |
| DwC-A lacks `acceptedNameUsageID` for inactive taxa | HIGH | Confirmed by iNat forum feature request (2026); MariaDB blog schema listing; SQL tutorial column list |
| iNat API `current_synonymous_taxon_ids` field | HIGH | Verified against live API for 6 inactive bee taxa |
| Ecdysis `taxon_id` already in raw data | HIGH | Inspected `ecdysis_data.occurrences`; 46,090 non-null rows |
| iNat expert obs CSV has `taxon_id` column | HIGH | Inspected `raw/inat_expert_obs.csv` header directly |
| DuckDB ancestry LIKE pattern for subtaxon queries | HIGH | Verified in DuckDB 1.5.2 with real taxa data |
| Closure table materialization via unnest | HIGH | Tested pattern in DuckDB 1.5.2; produces correct ancestor→descendants map |
| Scale of inactive remapping (~5 cases in current data) | MEDIUM | Based on name-match against taxa.csv.gz; iNat obs CSV taxon IDs may add more |

---

## Pre-Implementation Checks

```bash
# Verify taxa.csv.gz still has only 6 columns (no schema drift)
cd data && uv run python3 -c "
import gzip, csv
with gzip.open('raw/taxa.csv.gz', 'rt') as f:
    print(next(csv.reader(f, delimiter='\t')))
"

# Count inactive bee taxa that are in our canonical_to_taxon_id bridge
cd data && uv run python3 -c "
import gzip, csv, duckdb
con = duckdb.connect('beeatlas.duckdb', read_only=True)
bridge = {str(r[0]) for r in con.execute('SELECT taxon_id FROM inaturalist_data.canonical_to_taxon_id').fetchall()}
inactive = 0
with gzip.open('raw/taxa.csv.gz', 'rt') as f:
    for row in csv.DictReader(f, delimiter='\t'):
        if row['taxon_id'] in bridge and row['active'] == 'false':
            inactive += 1
print(f'Inactive bridge taxa: {inactive}')
"
```

---

## Sources

- taxa.csv.gz columns confirmed by direct file inspection: `/Users/rainhead/dev/beeatlas/data/raw/taxa.csv.gz`
- iNat API `current_synonymous_taxon_ids` verified: `GET https://api.inaturalist.org/v1/taxa/199075`
- DwC-A column list (no acceptedNameUsageID): https://forum.inaturalist.org/t/using-sql-to-query-inats-dwca-taxonomy-export/29377
- DwC-A missing synonym fields (feature request): https://forum.inaturalist.org/t/taxonomy-download-with-synonyms/38699
- DwC-A missing intermediate ranks: https://forum.inaturalist.org/t/missing-intermediate-ranks-and-default-photo-in-the-taxonomy-archive-file/49700
- iNat open data files: https://github.com/inaturalist/inaturalist-open-data
- Existing taxa pipeline (ancestry walk pattern): `/Users/rainhead/dev/beeatlas/data/taxa_pipeline.py`
- Existing taxon ID bridge: `/Users/rainhead/dev/beeatlas/data/resolve_taxon_ids.py`
- Existing species universe model: `/Users/rainhead/dev/beeatlas/data/dbt/models/intermediate/int_species_universe.sql`
- iNat expert obs CSV header verified: `/Users/rainhead/dev/beeatlas/data/raw/inat_expert_obs.csv`

*Stack research for: v4.5 iNat Taxonomy & Species Completeness*
*Researched: 2026-05-29*
