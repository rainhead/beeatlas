# Architecture Research

**Domain:** BeeAtlas — iNat Taxonomy & Species Completeness milestone
**Researched:** 2026-05-29
**Confidence:** HIGH — all findings from direct codebase inspection

---

## Existing DAG Baseline

The current dbt DAG for species data:

```
taxa.csv.gz (iNat S3)
    ↓ taxa_pipeline.py
inaturalist_data.taxon_lineage_extended
    ↓ stg_inat__taxon_lineage_extended (view)
    ↓
checklist_data.species              inat_obs_data.observations
    ↓ stg_checklist__species              ↓
    ↓                           int_species_occurrences_agg
    ↓                                     ↓
    └────────────────────┬────────────────┘
                         ↓
              int_species_universe (TABLE)
                         ↓
              marts/species (external parquet)
                         ↓
              species_export.py → species.json + species.parquet (21 cols)
```

The `stg_inat__canonical_to_taxon_id` bridge joins into `int_species_universe` to resolve `canonical_name → taxon_id`, then joins `stg_inat__taxon_lineage_extended` on `taxon_id` for lineage backfill. The bridge is populated by `resolve_taxon_ids.py` via iNat API name lookups.

---

## Integration Question 1: specific_epithet Backfill

### Current State

`stg_inat__taxon_lineage_extended` (line 10 of the staging view, lines 81-90 of `int_species_universe.sql`) provides:
- `taxon_id`, `family`, `subfamily`, `tribe`, `genus`, `subgenus`

It does **not** provide `specific_epithet`. The column does not exist in `inaturalist_data.taxon_lineage_extended` — the `taxa_pipeline.py` PIVOT expression outputs only those six columns.

Line 90 of `int_species_universe.sql` is `c.specific_epithet AS specific_epithet` with no COALESCE fallback. For non-checklist species (no `c.` row), this is NULL.

### Recommended Fix: Derive specific_epithet from canonical_name in int_species_universe

For species-rank taxa, `specific_epithet` is always the second token of `canonical_name`. The canonical_name is available for all rows via `COALESCE(c.canonical_name, oa.canonical_name)`.

Change line 90 of `int_species_universe.sql`:

```sql
-- Before:
c.specific_epithet AS specific_epithet,

-- After:
COALESCE(
    c.specific_epithet,
    CASE
        WHEN array_length(string_split(COALESCE(c.canonical_name, oa.canonical_name), ' ')) >= 2
        THEN string_split(COALESCE(c.canonical_name, oa.canonical_name), ' ')[2]
    END
) AS specific_epithet,
```

This is safe because:
- `canonical_name` is already the normalized binomial (genus + epithet) enforced by `canonical_name.py`
- The `CASE` guard prevents splitting genus-only names (single-token canonical_names like `"Andrena"`) that appear in the universe from occurrence data
- `c.specific_epithet` from the checklist still takes precedence (COALESCE left side)

**Do not extend `taxon_lineage_extended` to store specific_epithet.** The lineage table is keyed by `taxon_id`, not `canonical_name`, and taxon IDs exist for genera/families/subfamilies where `specific_epithet` is meaningless. Deriving from `canonical_name` directly in `int_species_universe` is the correct layer.

**Do not add a new staging model.** The derivation is one SQL expression, not a model worth materializing separately.

**Impact on marts/species schema.yml:** No change needed. `specific_epithet` is already declared as `data_type: varchar` in the enforced contract — it already permits NULL, and non-null values from the new expression are still VARCHAR.

---

## Integration Question 2: taxon_id Propagation into occurrences.parquet

### Decision: Add taxon_id column to int_combined and occurrences

**Why occurrences.parquet needs taxon_id:**
- Enables the frontend to link occurrences to iNat taxon pages without a separate lookup
- Enables future nested-set ancestor queries by taxon ID
- Consistent with the existing taxon_id infrastructure in `canonical_to_taxon_id`

### How to Propagate

The cleanest propagation path is:

**Step 1: Add taxon_id to int_combined.sql**

Each ARM in `int_combined.sql` needs a `taxon_id` column. The value comes from joining `canonical_to_taxon_id` on the resolved `canonical_name`:

```sql
-- In each ARM's SELECT list, add after canonical_name:
-- (The JOIN to occurrence_synonyms already resolves canonical_name)
-- Join canonical_to_taxon_id at the int_combined level:

LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt
    ON ctt.canonical_name = COALESCE(syn_e.accepted_name, e.canonical_name)
```

However, `int_combined` is a `UNION ALL` of three ARMs. Joining within each arm is verbose. The cleaner pattern: add the JOIN after the UNION ALL in occurrences.sql.

**Step 2: Add taxon_id in occurrences.sql (preferred)**

`occurrences.sql` reads from `int_combined` (already materialized as TABLE). The taxon_id JOIN belongs here because:
- `int_combined` is already the 36-column stable intermediate — extending its contract adds friction
- `occurrences.sql` already does spatial JOINs post-`int_combined`; a taxon_id lookup JOIN fits the same pattern
- The `stg_inat__canonical_to_taxon_id` view is a simple keyed lookup (735 rows, unique on `canonical_name`)

```sql
-- In occurrences.sql, add to the WITH chain after the joined CTE:
WITH joined AS (
    SELECT ROW_NUMBER() OVER () AS _row_id, *
    FROM {{ ref('int_combined') }}
),
...
-- Add before final SELECT:
taxon_ids AS (
    SELECT canonical_name, taxon_id
    FROM {{ ref('stg_inat__canonical_to_taxon_id') }}
),
```

Then in the final SELECT:
```sql
SELECT
    j.ecdysis_id, ...
    j.canonical_name,
    ti.taxon_id,        -- NEW
    j.source, ...
FROM joined j
JOIN final_county fc ON fc._row_id = j._row_id
JOIN final_eco    fe ON fe._row_id = j._row_id
LEFT JOIN place_dedup fp ON fp._row_id = j._row_id
LEFT JOIN taxon_ids ti ON ti.canonical_name = j.canonical_name   -- NEW
```

**Step 3: Update marts/schema.yml occurrences contract**

Add to the enforced column list:
```yaml
- name: taxon_id
  data_type: integer
```

The column is nullable (ARM 2 provisional WABA rows have `canonical_name = NULL` → no bridge entry; some unresolved names also have no taxon_id in the bridge).

**Step 4: propagation into species.json**

`species.json` is written by `species_export.py` from `species.parquet`. `species.parquet` reads `int_species_universe`, which already has the taxon_id available via the existing `ctt` JOIN (lines 123-126 of `int_species_universe.sql`). Currently `taxon_id` is joined but **not selected** — it's used only to resolve lineage, not emitted as a column.

Add `taxon_id` to the SELECT list of `int_species_universe.sql`:
```sql
-- In the species_universe CTE SELECT:
ctt.taxon_id AS taxon_id,
```

Then add to `marts/species.sql` SELECT list and to `species.parquet`'s schema.yml contract:
```yaml
- name: taxon_id
  data_type: integer
```

And add to `SPECIES_COLUMNS` in `species_export.py` (and the pyarrow schema as `pa.int64()`).

**Note on species.parquet column count:** The enforced dbt contract on species currently covers 20 SQL-emittable columns (21 with Python-added slug). Adding `taxon_id` increases the SQL count to 21 (22 with slug). This is the documented change process from `project_schema_validation.md`.

---

## Integration Question 3: Inactive Taxon Detection and Remapping

### Decision: New Python pipeline step + extension of occurrence_synonyms seed

**Why not a new dbt model alone:**
The inactive-taxon detection requires reading `taxa.csv.gz` to find rows where `active = 'false'` and pairing them with their `current_taxon_id`. This is a Python/DuckDB ingestion operation, not a SQL transform over already-ingested data.

**Why not extend occurrence_synonyms.csv manually:**
`occurrence_synonyms.csv` is a manually curated seed (currently one row). Inactive-taxon remappings can be numerous and change with each iNat taxonomy update. Manual curation doesn't scale.

### Recommended Architecture: stg_inat__inactive_taxa + new synonymy path

**Step 1: Extend taxa_pipeline.py to populate a new inactive_taxa table**

`load_taxon_lineage_extended` already reads `taxa.csv.gz` via DuckDB. Add a second function (or extend the existing one) to emit inactive Anthophila taxa:

```python
def load_inactive_taxon_remappings(db_path: str | None = None) -> None:
    """Populate inaturalist_data.inactive_taxa from local taxa.csv.gz.

    Columns: taxon_id (inactive), current_taxon_id (active replacement),
    inactive_name (VARCHAR), current_name (VARCHAR).

    Only emits rows where active='false' AND current_taxon_id IS NOT NULL
    (i.e., iNat knows the replacement). Rows with no replacement are
    unresolvable and excluded.
    """
```

The DuckDB query self-joins `taxa.csv.gz`: inactive bee taxa → JOIN on `current_taxon_id` to get the active replacement's name.

**Step 2: New dbt staging view stg_inat__inactive_taxa**

```sql
-- data/dbt/models/staging/stg_inat__inactive_taxa.sql
{{ config(materialized='view') }}
SELECT *
FROM {{ source('inaturalist_data', 'inactive_taxa') }}
```

Columns: `taxon_id` (inactive), `current_taxon_id`, `inactive_name`, `current_name`.

**Step 3: New dbt intermediate model int_inactive_taxon_synonyms**

This model bridges inactive canonical names to their active replacements, producing rows compatible with the `occurrence_synonyms` seed schema:

```sql
-- data/dbt/models/intermediate/int_inactive_taxon_synonyms.sql
{{ config(materialized='view') }}
-- Derive canonical_name (lowercase binomial) from inactive_name and current_name
SELECT
    lower(it.inactive_name) AS synonym,
    lower(it.current_name)  AS accepted_name,
    'inat_inactive_taxon'   AS source
FROM {{ ref('stg_inat__inactive_taxa') }} it
WHERE it.inactive_name IS NOT NULL AND it.current_name IS NOT NULL
  AND it.inactive_name != it.current_name
```

**Step 4: Union synonymy sources in int_combined and int_species_universe**

Rather than merging into the seed CSV, use a UNION ALL of both sources at the point of JOIN:

```sql
-- A reusable intermediate or inline CTE:
WITH all_synonyms AS (
    SELECT synonym, accepted_name FROM {{ ref('occurrence_synonyms') }}
    UNION ALL
    SELECT synonym, accepted_name FROM {{ ref('int_inactive_taxon_synonyms') }}
)
```

This CTE replaces `{{ ref('occurrence_synonyms') }}` in the LEFT JOINs in `int_combined.sql` (ARM 1, ARM 3) and `int_species_universe.sql` (inat_obs_count_agg CTE).

**Why not merge into the seed CSV:**
- Seeds are static files committed to the repo; inactive remappings change with each iNat taxonomy update (nightly)
- Merging dynamic data into a static seed would require Python to rewrite the CSV before dbt runs, which inverts the ingestion boundary
- The UNION ALL pattern keeps manual overrides (the seed) and automated remappings (the intermediate model) independent — manual overrides can still override automated ones by appearing first in COALESCE

**Conflict resolution:** If a name appears in both `occurrence_synonyms` (manual) and `int_inactive_taxon_synonyms` (automated), the LEFT JOIN will match whichever appears first in the UNION ALL. Put the manual seed first in the UNION ALL so manual overrides win.

---

## Integration Question 4: Ancestor Chain Storage

### Decision: Separate parquet file (ancestors.parquet), not a column in species.json

**Why not a column in species.json:**
- The ancestor chain is a variable-length array of integer taxon IDs. JSON encoding works but adds ~15-40 bytes per species row to a file that's already serialized flat.
- The ancestor chain is not needed for current UI rendering (species list, taxon filter, occurrence display). Adding it to species.json now adds weight with no immediate consumer.
- species.json is read entirely into memory by the Eleventy data layer. Ancestor data that is only used for future nested-set queries should not bloat the primary species record.

**Why a separate parquet file:**
- Parquet allows selective column reads. The frontend (wa-sqlite + hyparquet) can load `ancestors.parquet` on demand, separate from `species.parquet`.
- The ancestor chain is naturally a separate concern from species occurrence metrics.
- A flat table `(canonical_name, ancestor_taxon_ids INTEGER[])` or a normalized table `(canonical_name, depth, ancestor_taxon_id INTEGER)` fits cleanly in parquet.

**Recommended schema for ancestors.parquet:**

Flat array form (simpler, one row per species):
```
canonical_name VARCHAR
taxon_id INTEGER            -- the species' own taxon_id
ancestor_taxon_ids INTEGER[] -- ordered root-to-leaf, excluding self
```

Normalized form (enables SQL range queries on depth):
```
canonical_name VARCHAR
taxon_id INTEGER            -- species' own taxon_id
ancestor_taxon_id INTEGER   -- one row per ancestor
rank VARCHAR                -- 'family', 'subfamily', etc.
depth INTEGER               -- 0=self, 1=genus, 2=tribe, ...
```

**Recommendation:** Use the flat array form for now. It is sufficient for the stated goal (future nested-set queries) and avoids adding a large normalized table to the static hosting payload. The normalized form can be derived from the flat form in DuckDB at query time.

**Where it lives in the DAG:**

```sql
-- data/dbt/models/marts/ancestors.sql
{{ config(
    materialized='external',
    location='target/sandbox/ancestors.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}

SELECT
    COALESCE(c.canonical_name, oa.canonical_name) AS canonical_name,
    ctt.taxon_id,
    tle.ancestor_taxon_ids   -- NEW column in taxon_lineage_extended
FROM ...
```

However, this requires `taxon_lineage_extended` to store the raw ancestor chain (the `ancestry` column from `taxa.csv.gz` split and cast to `INTEGER[]`). Currently `taxa_pipeline.py` discards the raw ancestry after pivoting to named ranks.

**Extending taxa_pipeline.py to preserve raw ancestry:**

The `load_taxon_lineage_extended` function already unnests the ancestry column. Add a second output column to the final table: `ancestor_ids INTEGER[]` by using `string_split` cast:

```sql
SELECT
    target_taxon_id AS taxon_id,
    family, subfamily, tribe, genus, subgenus,
    -- Preserve raw ancestry as integer array (root-to-leaf, excluding self):
    list_transform(
        string_split(b.ancestry, '/'),
        x -> CAST(x AS BIGINT)
    ) AS ancestor_ids
FROM pivoted
JOIN all_active_bees b ON b.taxon_id = pivoted.target_taxon_id
```

This requires a JOIN back to `all_active_bees` to recover the ancestry string post-PIVOT.

**Alternative (simpler):** Store ancestor IDs in a separate DuckDB table `inaturalist_data.taxon_ancestor_ids(taxon_id BIGINT, ancestor_ids BIGINT[])` populated alongside `taxon_lineage_extended`, then join in the `ancestors` mart.

**Deployment:** Add `ancestors.parquet` to `_run_dbt_build` copy list in `run.py` and to `manifest.json`. The static-hosting constraint is respected — it's a static parquet file like `species.parquet`.

---

## Build Order (DAG for New Models)

```
taxa.csv.gz
    ↓
taxa_pipeline.load_taxon_lineage_extended (MODIFIED: preserve ancestor_ids)
taxa_pipeline.load_inactive_taxon_remappings (NEW)
    ↓
inaturalist_data.taxon_lineage_extended (TABLE — now has ancestor_ids)
inaturalist_data.inactive_taxa (TABLE — NEW)
    ↓                              ↓
stg_inat__taxon_lineage_extended   stg_inat__inactive_taxa (NEW view)
    ↓                              ↓
    │                   int_inactive_taxon_synonyms (NEW view)
    │                              ↓
    └──────────────────┐    (UNION ALL with occurrence_synonyms in int_combined)
                       ↓
int_combined (MODIFIED: uses unified synonymy + adds taxon_id)
    ↓
occurrences mart (MODIFIED: taxon_id column added to contract)

int_species_universe (MODIFIED: specific_epithet COALESCE + taxon_id emitted)
    ↓
species mart (MODIFIED: taxon_id in contract)
    ↓
species_export.py (MODIFIED: taxon_id in SPECIES_COLUMNS + pyarrow schema)

ancestors mart (NEW: reads taxon_lineage_extended + canonical_to_taxon_id)
    ↓
ancestors.parquet (NEW artifact in EXPORT_DIR)
```

**Execution order in run.py STEPS** (additions only — existing order preserved):

1. `taxa-download` (unchanged — `download_taxa_csv`)
2. `taxon-lineage-extended` (MODIFIED — `load_taxon_lineage_extended` adds ancestor_ids)
3. `inactive-taxon-remappings` (NEW step — `load_inactive_taxon_remappings`) — must run after `taxa-download`, before `dbt-build`
4. `dbt-build` (MODIFIED — copies `ancestors.parquet` alongside other artifacts)
5. `species-export` (MODIFIED — `taxon_id` in SPECIES_COLUMNS)

Insert `inactive-taxon-remappings` between `taxon-lineage-extended` and `places-validation` in the STEPS list.

---

## Component Boundaries

| Component | Type | What Changes |
|-----------|------|--------------|
| `data/taxa_pipeline.py` | MODIFIED | `load_taxon_lineage_extended`: add `ancestor_ids INTEGER[]` to output table; add new `load_inactive_taxon_remappings` function |
| `data/run.py` | MODIFIED | Add `("inactive-taxon-remappings", load_inactive_taxon_remappings)` step after `taxon-lineage-extended`; add `ancestors.parquet` to `_run_dbt_build` copy list |
| `data/dbt/models/staging/stg_inat__inactive_taxa.sql` | NEW | View over `inaturalist_data.inactive_taxa` |
| `data/dbt/models/staging/stg_inat__taxon_lineage_extended.sql` | UNCHANGED | Still reads `inaturalist_data.taxon_lineage_extended`; ancestor_ids visible automatically |
| `data/dbt/models/staging/schema.yml` | MODIFIED | Add `stg_inat__inactive_taxa` model with not_null/unique on `taxon_id` |
| `data/dbt/models/intermediate/int_inactive_taxon_synonyms.sql` | NEW | Derives synonym→accepted_name from inactive taxa table |
| `data/dbt/models/intermediate/int_combined.sql` | MODIFIED | Replace `ref('occurrence_synonyms')` joins with UNION ALL CTE combining seed + inactive synonyms; add taxon_id column (via LEFT JOIN to canonical_to_taxon_id) |
| `data/dbt/models/intermediate/int_species_universe.sql` | MODIFIED | Line 90: COALESCE specific_epithet with split_part fallback; add `ctt.taxon_id` to species_universe CTE SELECT |
| `data/dbt/models/intermediate/schema.yml` | MODIFIED | Document int_inactive_taxon_synonyms |
| `data/dbt/models/marts/occurrences.sql` | MODIFIED | Add LEFT JOIN to `stg_inat__canonical_to_taxon_id`; add `ti.taxon_id` to final SELECT |
| `data/dbt/models/marts/species.sql` | MODIFIED | Add `taxon_id` to SELECT |
| `data/dbt/models/marts/ancestors.sql` | NEW | External parquet mart joining taxon_lineage_extended + canonical_to_taxon_id for ancestor chain |
| `data/dbt/models/marts/schema.yml` | MODIFIED | Add `taxon_id integer` to occurrences contract; add `taxon_id integer` to species contract; add ancestors mart contract |
| `data/species_export.py` | MODIFIED | Add `taxon_id` to `SPECIES_COLUMNS` list and pyarrow schema |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Merging inactive remappings into occurrence_synonyms.csv

**What people do:** Append `inactive_name,current_name,inat_inactive` rows to the seed CSV from Python before dbt runs.

**Why it's wrong:** Seeds are committed static artifacts. Programmatically modifying a seed file from a nightly pipeline script inverts the ingestion boundary (Python should write to DuckDB tables, not git-tracked CSVs). It also creates a file that is perpetually dirty in git status.

**Do this instead:** Populate `inaturalist_data.inactive_taxa` from Python (same pattern as `taxon_lineage_extended`), expose via staging view, produce `int_inactive_taxon_synonyms`, and UNION ALL with the seed at the JOIN site.

### Anti-Pattern 2: Adding taxon_id to int_combined via UNION ALL column alignment

**What people do:** Add `taxon_id` as a column in each ARM of the `int_combined` UNION ALL — `NULL::INTEGER AS taxon_id` in ARM 2 (provisional WABA), and a subquery lookup in ARMs 1 and 3.

**Why it's wrong:** The UNION ALL is already verbose. A subquery or join per ARM duplicates the `canonical_to_taxon_id` join three times and makes the model harder to maintain. ARM 2 rows have `canonical_name = NULL` anyway.

**Do this instead:** Join `canonical_to_taxon_id` once in `occurrences.sql` after materializing `int_combined`. The lookup is a simple keyed join on a 735-row table — negligible cost.

### Anti-Pattern 3: Storing ancestor chain in species.json

**What people do:** Add `ancestor_taxon_ids: [630955, 47158, ...]` to each row in species.json.

**Why it's wrong:** species.json is loaded entirely into memory by Eleventy's `_data/species.js`. The ancestor chain has no current UI consumer. Adding 15-40 bytes per species for future use bloats a file that must load fast for static site generation.

**Do this instead:** Write a separate `ancestors.parquet` artifact. The frontend can load it on demand when nested-set queries are actually implemented.

### Anti-Pattern 4: Extending taxon_lineage_extended schema without updating the staging view

**What people do:** Add `ancestor_ids` to `inaturalist_data.taxon_lineage_extended` in Python but leave `stg_inat__taxon_lineage_extended` as `SELECT *` — this actually works fine since the view is `SELECT *`. But if the view ever gets an explicit column list (for documentation), the new column would be invisible.

**Do this instead:** Keep the view as `SELECT *` (current state is already correct for this). Document the new column in `staging/schema.yml` under `stg_inat__taxon_lineage_extended`.

---

## Key Architectural Decisions

**specific_epithet derived from canonical_name in int_species_universe, not from taxon_lineage_extended.** The lineage table is rank-keyed and has no concept of epithet for genera/families. The canonical_name is always the authoritative binomial for species-rank entries. One COALESCE + string_split expression in int_species_universe.sql is the minimal, correct fix.

**taxon_id joins in occurrences.sql, not int_combined.sql.** Keeps the UNION ALL compact. The lookup is cheap (735 rows, unique key). The pattern matches how spatial joins are already handled: int_combined is the stable intermediate, occurrences.sql adds derived attributes.

**Inactive remappings as a dynamic intermediate model, not a seed extension.** The iNat taxonomy changes nightly. A DuckDB table populated by taxa_pipeline.py + a dbt intermediate model UNION ALL'ed with the manual seed is the correct boundary. Manual overrides in the seed continue to win.

**Ancestor chain as separate parquet, flat array form.** The static-hosting constraint is respected. No server-side query needed. The flat `ancestor_ids INTEGER[]` column in ancestors.parquet supports future nested-set range queries when a UI consumer exists. Adding it to species.json now would carry dead weight on every page load.
