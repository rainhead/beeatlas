# Phase 086: Port Remaining Transforms — Pattern Map

**Mapped:** 2026-05-13
**Files analyzed:** 13 new/modified files
**Analogs found:** 12 / 13 (1 greenfield: ingestion-boundary.md documentation)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `data/dbt/models/sources.yml` | config (source declarations) | — | itself — add to existing blocks | self |
| `data/dbt/models/staging/stg_inat__canonical_to_taxon_id.sql` | model (staging) | transform | `data/dbt/models/staging/stg_waba__observations.sql` | exact |
| `data/dbt/models/staging/stg_inat__taxon_lineage_extended.sql` | model (staging) | transform | `data/dbt/models/staging/stg_waba__observations.sql` | exact |
| `data/dbt/models/staging/stg_checklist__species.sql` | model (staging) | transform | `data/dbt/models/staging/stg_waba__observations.sql` | exact |
| `data/dbt/models/staging/schema.yml` | config (test decl) | — | itself (add new model blocks) | self |
| `data/dbt/models/intermediate/int_species_occurrences_agg.sql` | model (intermediate) | CRUD/batch | `data/dbt/models/intermediate/int_waba_link.sql` + `species_export.py` occurrences_agg CTE | role-match |
| `data/dbt/models/intermediate/int_species_geo_agg.sql` | model (intermediate) | CRUD/batch | `data/dbt/models/intermediate/int_waba_link.sql` + `species_export.py` geo_agg CTE | role-match |
| `data/dbt/models/intermediate/int_species_universe.sql` | model (intermediate) | transform | `data/dbt/models/intermediate/int_combined.sql` (FULL OUTER JOIN + COALESCE pattern) | role-match |
| `data/dbt/models/marts/species.sql` | model (mart) | batch | `data/dbt/models/marts/occurrences.sql` | exact |
| `data/dbt/models/marts/schema.yml` | config (contract) | — | itself (add species contract block) | self |
| `data/dbt/tests/test_lin05_lineage_coverage.sql` | test (singular) | — | `data/dbt/tests/test_ecdysis_id_references_source.sql` | exact |
| `data/tests/test_dbt_diff.py` | test (pytest) | batch | itself (add 5 species test functions) | self |
| `.planning/phases/086-port-remaining-transforms/ingestion-boundary.md` | documentation | — | none — greenfield decision record | greenfield |

---

## Pattern Assignments

### `data/dbt/models/sources.yml` (config, source declarations)
**REQs:** PORT-01, PORT-03, PORT-04

**Analog:** `data/dbt/models/sources.yml` itself (lines 1-29)

**Current file shape** (all 29 lines):
```yaml
version: 2
sources:
  - name: ecdysis_data
    schema: ecdysis_data
    tables:
      - name: occurrences
      - name: identifications
      - name: occurrence_links

  - name: inaturalist_data
    schema: inaturalist_data
    tables:
      - name: observations
      - name: observations__ofvs

  - name: inaturalist_waba_data
    schema: inaturalist_waba_data
    tables:
      - name: observations
      - name: observations__ofvs
      - name: taxon_lineage

  - name: geographies
    schema: geographies
    tables:
      - name: us_counties
      - name: us_states
      - name: ecoregions
```

**Apply:** Add two tables to the `inaturalist_data` block and add a new `checklist_data` source block. Match the existing indentation (2-space, table entries with no description):

```yaml
  - name: inaturalist_data
    schema: inaturalist_data
    tables:
      - name: observations
      - name: observations__ofvs
      - name: canonical_to_taxon_id   # written by resolve_taxon_ids.py (ingestion)
      - name: taxon_lineage_extended  # written by inaturalist_pipeline.enrich_taxon_lineage_extended (ingestion)

  - name: checklist_data
    schema: checklist_data
    tables:
      - name: species
      - name: species_counties
```

**Critical ordering:** Add `checklist_data` and the two new `inaturalist_data` tables in `sources.yml` BEFORE creating any staging views that reference them — dbt will compilation-error otherwise.

---

### `data/dbt/models/staging/stg_inat__canonical_to_taxon_id.sql` (staging, transform)
**REQs:** PORT-03, PORT-01

**Analog:** `data/dbt/models/staging/stg_waba__observations.sql` (lines 1-10)

**Analog pattern (full file):**
```sql
-- Wraps source('inaturalist_waba_data', 'observations').
-- Used by:
--   int_waba_link (Plan 03): JOIN on _dlt_id for waba_link CTE (export.py:46-55)
--   int_specimen_obs_base (Plan 03): main table for specimen_obs_base CTE
--     (export.py:104-119), joined with taxon_lineage on taxon__id
--   int_provisional_waba_ids (Plan 03): for provisional WABA rows not in matched set
{{ config(materialized='view') }}

SELECT *
FROM {{ source('inaturalist_waba_data', 'observations') }}
```

**Target pattern — copy this structure exactly:**
```sql
-- Wraps source('inaturalist_data', 'canonical_to_taxon_id').
-- Written by data/resolve_taxon_ids.py (ingestion step — iNat API calls;
-- see ingestion-boundary.md). Columns: canonical_name (PK), taxon_id,
-- resolved_at, source.
-- Used by:
--   int_species_universe: LEFT JOIN to resolve canonical_name → taxon_id
--   test_lin05_lineage_coverage: coverage ratio assertion (PORT-03)
{{ config(materialized='view') }}

SELECT *
FROM {{ source('inaturalist_data', 'canonical_to_taxon_id') }}
```

---

### `data/dbt/models/staging/stg_inat__taxon_lineage_extended.sql` (staging, transform)
**REQs:** PORT-03, PORT-01

**Analog:** `data/dbt/models/staging/stg_waba__observations.sql` (exact same shape)

**Target pattern:**
```sql
-- Wraps source('inaturalist_data', 'taxon_lineage_extended').
-- Written by data/inaturalist_pipeline.enrich_taxon_lineage_extended (ingestion
-- step — iNat API calls). Columns: taxon_id (PK BIGINT), family, subfamily,
-- tribe, genus, subgenus (VARCHAR).
-- Used by:
--   int_species_universe: LEFT JOIN on taxon_id for lineage backfill
--   test_lin05_lineage_coverage: coverage ratio assertion (PORT-03)
{{ config(materialized='view') }}

SELECT *
FROM {{ source('inaturalist_data', 'taxon_lineage_extended') }}
```

---

### `data/dbt/models/staging/stg_checklist__species.sql` (staging, transform)
**REQ:** PORT-01, PORT-03

**Analog:** `data/dbt/models/staging/stg_waba__observations.sql` (exact same shape)

**Target pattern:**
```sql
-- Wraps source('checklist_data', 'species').
-- Contains the authoritative bee species checklist: scientificName, canonical_name,
-- family, subfamily, tribe, genus, subgenus, specific_epithet, status columns.
-- Used by:
--   int_species_universe: FULL OUTER JOIN axis (checklist half)
--   test_lin05_lineage_coverage: species_universe CTE
{{ config(materialized='view') }}

SELECT *
FROM {{ source('checklist_data', 'species') }}
```

---

### `data/dbt/models/staging/schema.yml` (config, test declarations)
**REQs:** PORT-01, PORT-03

**Analog:** `data/dbt/models/staging/schema.yml` itself (lines 1-29)

**Current file shape:**
```yaml
version: 2

models:
  - name: stg_ecdysis__occurrences
    columns:
      - name: catalog_number
        data_tests:
          - not_null
          - unique    # VERIFIED unique: 46,090 rows, 46,090 distinct catalog_numbers

  - name: stg_waba__observations
    ...

  - name: stg_inat__observations
    ...
```

**Apply:** Append three new model blocks following the same pattern. Inline-comment tests with VERIFIED counts once confirmed:
```yaml
  - name: stg_inat__canonical_to_taxon_id
    columns:
      - name: canonical_name
        data_tests:
          - not_null
          - unique    # VERIFIED: 735 rows, 735 distinct canonical_names

  - name: stg_inat__taxon_lineage_extended
    columns:
      - name: taxon_id
        data_tests:
          - not_null
          - unique    # VERIFIED: 2196 rows, 2196 distinct taxon_ids

  - name: stg_checklist__species
    columns:
      - name: canonical_name
        data_tests:
          - not_null
```

---

### `data/dbt/models/intermediate/int_species_occurrences_agg.sql` (intermediate, batch)
**REQ:** PORT-01

**Analog:** `data/dbt/models/intermediate/int_waba_link.sql` (simple SELECT+GROUP BY pattern) plus `data/species_export.py` lines 116-140 (the `occurrences_agg` CTE — the SQL to translate)

**int_waba_link.sql structure (full file):**
```sql
-- catalog_suffix -> MIN(waba.id) via waba ofvs field_id=18116.
-- Mirrors export.py:46-55 (waba_link CTE).
SELECT
    CAST(ofv.value AS BIGINT) AS catalog_suffix,
    MIN(waba.id) AS specimen_observation_id
FROM {{ ref('stg_waba__observations') }} waba
JOIN {{ ref('stg_waba__ofvs') }} ofv
    ON ofv._dlt_root_id = waba._dlt_id
    AND ofv.field_id = 18116
    AND ofv.value != ''
GROUP BY catalog_suffix
```

**Source SQL to translate** (`species_export.py` lines 116-140, `occurrences_agg` CTE):
```sql
SELECT
    canonical_name,
    COUNT(*) AS occurrence_count,
    SUM(CASE WHEN id IS NOT NULL THEN 1 ELSE 0 END) AS specimen_count,
    MIN(TRY_CAST(event_date AS DATE)) AS first_occurrence_date,
    MAX(TRY_CAST(event_date AS DATE)) AS last_occurrence_date,
    list_value(
        SUM(CASE WHEN TRY_CAST(month AS INT) =  1 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) =  2 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) =  3 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) =  4 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) =  5 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) =  6 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) =  7 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) =  8 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) =  9 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) = 10 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) = 11 THEN 1 ELSE 0 END),
        SUM(CASE WHEN TRY_CAST(month AS INT) = 12 THEN 1 ELSE 0 END)
    )::INTEGER[12] AS month_histogram
FROM ecdysis_data.occurrences
WHERE canonical_name IS NOT NULL
GROUP BY canonical_name
```

**Target pattern — translate the CTE to a standalone dbt model:**
```sql
-- Per-species temporal aggregates from ecdysis_data.occurrences.
-- Mirrors species_export.py lines 116-140 (occurrences_agg CTE).
-- NOTE: month_histogram NULL backfill (for checklist-only rows in the FULL OUTER
-- JOIN) is handled in int_species_universe via CASE expression — DuckDB COALESCE
-- on INTEGER[12] is unimplemented in 1.4.x (Phase 078-02).
{{ config(materialized='view') }}

SELECT
    canonical_name,
    COUNT(*) AS occurrence_count,
    SUM(CASE WHEN id IS NOT NULL THEN 1 ELSE 0 END) AS specimen_count,
    MIN(TRY_CAST(event_date AS DATE)) AS first_occurrence_date,
    MAX(TRY_CAST(event_date AS DATE)) AS last_occurrence_date,
    list_value(
        SUM(CASE WHEN TRY_CAST(month AS INT) =  1 THEN 1 ELSE 0 END),
        ...
        SUM(CASE WHEN TRY_CAST(month AS INT) = 12 THEN 1 ELSE 0 END)
    )::INTEGER[12] AS month_histogram
FROM {{ source('ecdysis_data', 'occurrences') }}
WHERE canonical_name IS NOT NULL
GROUP BY canonical_name
```

**Note:** Use `{{ source('ecdysis_data', 'occurrences') }}` (not `ref('stg_ecdysis__occurrences')`) here — the staging view for ecdysis applies a spatial lat filter that should NOT be applied to this aggregation (temporal counts should include records even if lat is null in the raw source).

---

### `data/dbt/models/intermediate/int_species_geo_agg.sql` (intermediate, batch)
**REQ:** PORT-01

**Analog:** `data/dbt/models/intermediate/int_waba_link.sql` (simple SELECT+GROUP BY) plus `species_export.py` lines 149-156 (geo_agg CTE)

**Source SQL to translate** (`species_export.py` lines 149-156, `geo_agg` CTE):
```sql
geo_agg AS (
    SELECT
        canonical_name,
        COUNT(DISTINCT county) AS county_count,
        COUNT(DISTINCT ecoregion_l3) AS ecoregion_count
    FROM occ_with_geo
    GROUP BY canonical_name
),
```

Where `occ_with_geo` reads `occurrences.parquet` (the external mart). In dbt, `occ_with_geo` is replaced by `ref('occurrences')`.

**Target pattern:**
```sql
-- Per-species geographic aggregate from the occurrences mart.
-- Mirrors species_export.py geo_agg CTE + occ_with_geo CTE.
-- Reads from ref('occurrences') (external parquet) — creates a DAG dependency
-- on the occurrences mart; dbt build --select species+ will rebuild occurrences.
-- Do NOT hardcode the parquet file path: ref() resolves to the external location.
{{ config(materialized='view') }}

SELECT
    canonical_name,
    COUNT(DISTINCT county) AS county_count,
    COUNT(DISTINCT ecoregion_l3) AS ecoregion_count
FROM {{ ref('occurrences') }}
WHERE canonical_name IS NOT NULL
GROUP BY canonical_name
```

---

### `data/dbt/models/intermediate/int_species_universe.sql` (intermediate, transform)
**REQ:** PORT-01

**Analog:** `data/dbt/models/intermediate/int_combined.sql` (FULL OUTER JOIN + COALESCE + UNION ALL pattern, lines 1-86) and `species_export.py` lines 157-208 (species_universe CTE + DISTINCT ON final query)

**int_combined.sql core patterns to copy:**

Config block (line 6):
```sql
{{ config(materialized='table') }}
```
Use `materialized='table'` (same reason as int_combined: prevents re-evaluation of the full join on every downstream pass).

FULL OUTER JOIN + COALESCE pattern (int_combined lines 9-43, ARM 1):
```sql
SELECT
    COALESCE(e.ecdysis_lon, s.sample_lon)          AS lon,
    COALESCE(e.ecdysis_lat, s.sample_lat)          AS lat,
    ...
FROM {{ ref('int_ecdysis_base') }} e
FULL OUTER JOIN {{ ref('int_samples_base') }} s ON e.host_observation_id = s.observation_id
LEFT JOIN {{ ref('int_specimen_obs_base') }} sob ON sob.waba_obs_id = e.specimen_observation_id
```

**Source SQL to translate** (`species_export.py` lines 157-208, `species_universe` CTE + final SELECT):
```sql
species_universe AS (
    SELECT
        COALESCE(c.scientificName, oa.canonical_name) AS scientificName,
        COALESCE(c.canonical_name, oa.canonical_name) AS canonical_name,
        COALESCE(c.family, tle.family) AS family,
        COALESCE(c.subfamily, tle.subfamily) AS subfamily,
        COALESCE(c.tribe, tle.tribe) AS tribe,
        COALESCE(
            c.genus,
            tle.genus,
            split_part(COALESCE(c.canonical_name, oa.canonical_name), ' ', 1)
        ) AS genus,
        COALESCE(c.subgenus, tle.subgenus) AS subgenus,
        c.specific_epithet AS specific_epithet,
        c.scientificName IS NOT NULL AS on_checklist,
        c.status AS status,
        COALESCE(oa.occurrence_count, 0) AS occurrence_count,
        COALESCE(oa.specimen_count, 0) AS specimen_count,
        COALESCE(pa.provisional_count, 0) AS provisional_count,
        oa.first_occurrence_date,
        oa.last_occurrence_date,
        -- NULL backfill: DuckDB COALESCE on INTEGER[12] unimplemented (1.4.x).
        -- Use CASE instead of COALESCE(oa.month_histogram, [0]*12).
        CASE WHEN oa.month_histogram IS NULL
             THEN [0,0,0,0,0,0,0,0,0,0,0,0]::INTEGER[]
             ELSE oa.month_histogram
        END AS month_histogram,
        COALESCE(ga.county_count, 0) AS county_count,
        COALESCE(ga.ecoregion_count, 0) AS ecoregion_count
    FROM checklist_data.species c
    FULL OUTER JOIN occurrences_agg oa
        ON oa.canonical_name = c.canonical_name
    LEFT JOIN inaturalist_data.canonical_to_taxon_id ctt
        ON ctt.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
    LEFT JOIN inaturalist_data.taxon_lineage_extended tle
        ON tle.taxon_id = ctt.taxon_id
    LEFT JOIN provisional_agg pa
        ON pa.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
    LEFT JOIN geo_agg ga
        ON ga.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
)
SELECT DISTINCT ON (canonical_name) *
FROM species_universe
WHERE family IN ('Andrenidae', 'Apidae', 'Colletidae', 'Halictidae',
                 'Megachilidae', 'Melittidae', 'Stenotritidae')
ORDER BY canonical_name, on_checklist DESC
```

**Target pattern — translate to dbt model using refs:**
```sql
-- Species universe: FULL OUTER JOIN of checklist + ecdysis occurrences with
-- lineage backfill. Mirrors species_export.py lines 157-208.
-- Materialized as TABLE to prevent re-evaluating the FULL OUTER JOIN on each
-- mart pass (same reason as int_combined).
-- NOTE: month_histogram NULL backfill uses CASE, not COALESCE — DuckDB COALESCE
-- on INTEGER[12] is unimplemented in 1.4.x (Phase 078-02).
-- slug column is NOT emitted here — it is added by the Python post-step reading
-- the species mart parquet.
{{ config(materialized='table') }}

WITH occ_agg AS (
    SELECT * FROM {{ ref('int_species_occurrences_agg') }}
),
provisional_agg AS (
    SELECT canonical_name, COUNT(*) AS provisional_count
    FROM {{ ref('occurrences') }}
    WHERE is_provisional = TRUE AND canonical_name IS NOT NULL
    GROUP BY canonical_name
),
geo_agg AS (
    SELECT * FROM {{ ref('int_species_geo_agg') }}
),
species_universe AS (
    SELECT
        COALESCE(c.scientificName, oa.canonical_name) AS scientificName,
        COALESCE(c.canonical_name, oa.canonical_name) AS canonical_name,
        COALESCE(c.family, tle.family) AS family,
        ...
    FROM {{ ref('stg_checklist__species') }} c
    FULL OUTER JOIN occ_agg oa ON oa.canonical_name = c.canonical_name
    LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt
        ON ctt.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
    LEFT JOIN {{ ref('stg_inat__taxon_lineage_extended') }} tle
        ON tle.taxon_id = ctt.taxon_id
    LEFT JOIN provisional_agg pa
        ON pa.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
    LEFT JOIN geo_agg ga
        ON ga.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
)
SELECT DISTINCT ON (canonical_name) *
FROM species_universe
WHERE family IN ('Andrenidae', 'Apidae', 'Colletidae', 'Halictidae',
                 'Megachilidae', 'Melittidae', 'Stenotritidae')
ORDER BY canonical_name, on_checklist DESC
```

**slug column decision:** `_slugify` in `data/feeds.py` (lines 132-148) uses `unicodedata.normalize('NFKD')`, `.encode('ascii', 'ignore')`, `re.sub` (3 patterns), and `strip('-')`. The `unicodedata.normalize` step cannot be replicated byte-identically in DuckDB SQL. Therefore `slug` must NOT be included in this model — it is added by the Python post-step that reads `species.parquet` and invokes `feeds._slugify` directly.

---

### `data/dbt/models/marts/species.sql` (mart, batch)
**REQ:** PORT-01

**Analog:** `data/dbt/models/marts/occurrences.sql` (lines 1-83)

**occurrences.sql config block (lines 11-17) — copy this pattern exactly:**
```sql
{{ config(
    materialized='external',
    location='target/sandbox/species.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}
```

**occurrences.sql SELECT pattern (lines 68-83):**
```sql
SELECT
    j.ecdysis_id, j.catalog_number,
    j.lon, j.lat, j.date, j.year, j.month,
    ...
    fc.county, fe.ecoregion_l3
FROM joined j
JOIN final_county fc ON fc._row_id = j._row_id
JOIN final_eco    fe ON fe._row_id = j._row_id
```

**Target pattern for species.sql — much simpler (no spatial join needed):**
```sql
-- Species mart: 18-column external parquet (species.parquet).
-- slug column is intentionally OMITTED — it requires unicodedata.normalize()
-- which is not byte-identically reproducible in SQL. The Python post-step
-- (reads this mart, adds slug via feeds._slugify, overwrites the parquet) adds
-- the 19th column before public/data/ deployment.
-- Enforced contract in schema.yml covers all 18 SQL-emittable columns.
{{ config(
    materialized='external',
    location='target/sandbox/species.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}

SELECT
    scientificName,
    canonical_name,
    family,
    subfamily,
    tribe,
    genus,
    subgenus,
    specific_epithet,
    on_checklist,
    status,
    occurrence_count,
    specimen_count,
    provisional_count,
    first_occurrence_date,
    last_occurrence_date,
    month_histogram,
    county_count,
    ecoregion_count
FROM {{ ref('int_species_universe') }}
```

**Note on slug:** The Python post-step reads the 18-column parquet, appends `slug` using `from feeds import _slugify`, writes back a 19-column parquet (using pyarrow as in `species_export.py` lines 232-256), then the diff harness asserts the 19-column schema matches `public/data/species.parquet`. The dbt contract enforces the 18 SQL columns; the post-step adds the 19th.

---

### `data/dbt/models/marts/schema.yml` (config, contract)
**REQ:** PORT-01

**Analog:** `data/dbt/models/marts/schema.yml` itself, the `occurrences` contract block (lines 1-69)

**occurrences contract pattern (lines 4-8):**
```yaml
  - name: occurrences
    config:
      contract:
        enforced: true
    columns:
      - name: ecdysis_id
        data_type: integer
      ...
```

**Apply:** Append a `species` model block after `occurrences`. The contract covers the 18 SQL-emittable columns (slug is added by Python post-step and is covered by the diff harness, not the dbt contract):

```yaml
  - name: species
    config:
      contract:
        enforced: true
    columns:
      - name: scientificName
        data_type: varchar
      - name: canonical_name
        data_type: varchar
      - name: family
        data_type: varchar
      - name: subfamily
        data_type: varchar
      - name: tribe
        data_type: varchar
      - name: genus
        data_type: varchar
      - name: subgenus
        data_type: varchar
      - name: specific_epithet
        data_type: varchar
      - name: on_checklist
        data_type: boolean
      - name: status
        data_type: varchar
      - name: occurrence_count
        data_type: bigint
      - name: specimen_count
        data_type: bigint
      - name: provisional_count
        data_type: bigint
      - name: first_occurrence_date
        data_type: date
      - name: last_occurrence_date
        data_type: date
      - name: month_histogram
        data_type: integer[]
      - name: county_count
        data_type: bigint
      - name: ecoregion_count
        data_type: bigint
```

**Note:** `slug` is NOT in the dbt contract — it is verified by `test_species_parquet_schema_matches` in the diff harness after the Python post-step writes the 19th column.

---

### `data/dbt/tests/test_lin05_lineage_coverage.sql` (singular test)
**REQ:** PORT-03

**Analog:** `data/dbt/tests/test_ecdysis_id_references_source.sql` (lines 1-32)

**Analog pattern — header comment style + 0-rows PASS semantics (lines 1-32):**
```sql
-- Singular dbt test: every int_ecdysis_base.ecdysis_id must exist in stg_ecdysis__occurrences.
--
-- PASS semantics: this query returns 0 rows (no orphaned ecdysis_id values).
--
-- What this replaces:
--   ...
SELECT ib.ecdysis_id
FROM {{ ref('int_ecdysis_base') }} ib
WHERE ib.ecdysis_id IS NOT NULL
  AND CAST(ib.ecdysis_id AS VARCHAR) NOT IN (
    SELECT id FROM {{ ref('stg_ecdysis__occurrences') }}
  )
```

**Target pattern — full file content (from RESEARCH.md §PORT-03):**
```sql
-- Singular dbt test: LIN-05 — at least 95% of the species universe must have a
-- resolved taxon_id in canonical_to_taxon_id AND a lineage row in
-- taxon_lineage_extended.
--
-- PASS semantics: returns 0 rows when coverage >= 0.95.
-- FAIL: returns 1 row with (total, resolved, ratio) when coverage < 0.95.
--
-- References staging models (not direct source()) to preserve DAG lineage and
-- ensure any staging-level filters are applied (Pitfall 8 from RESEARCH.md).
--
-- Verified baseline: 735/735 = 100% coverage as of 2026-05-13.
WITH species_universe AS (
    SELECT DISTINCT COALESCE(c.canonical_name, oa.canonical_name) AS canonical_name
    FROM {{ ref('stg_checklist__species') }} c
    FULL OUTER JOIN (
        SELECT DISTINCT canonical_name
        FROM {{ source('ecdysis_data', 'occurrences') }}
        WHERE canonical_name IS NOT NULL
    ) oa ON oa.canonical_name = c.canonical_name
),
coverage AS (
    SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN tle.taxon_id IS NOT NULL THEN 1 ELSE 0 END) AS resolved
    FROM species_universe su
    LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} b
        ON b.canonical_name = su.canonical_name
    LEFT JOIN {{ ref('stg_inat__taxon_lineage_extended') }} tle
        ON tle.taxon_id = b.taxon_id
)
SELECT total, resolved, CAST(resolved AS DOUBLE) / NULLIF(total, 0) AS ratio
FROM coverage
WHERE CAST(resolved AS DOUBLE) / NULLIF(total, 0) < 0.95
```

---

### `data/tests/test_dbt_diff.py` (pytest, batch)
**REQ:** VALIDATE-01

**Analog:** `data/tests/test_dbt_diff.py` itself (lines 1-301)

**SANDBOX_GUARD pattern (lines 26-29) — copy this exactly for each new guard:**
```python
_SANDBOX_GUARD = pytest.mark.skipif(
    not (SANDBOX / "occurrences.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)
```

**Test function shape — row count (lines 36-48):**
```python
@_SANDBOX_GUARD
def test_occurrences_row_count_matches():
    """Sandbox occurrences.parquet has the same row count as public/data/occurrences.parquet.

    Verified baseline: both 47,883 rows.
    """
    s = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{SANDBOX}/occurrences.parquet')"
    ).fetchone()[0]
    p = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{PUBLIC}/occurrences.parquet')"
    ).fetchone()[0]
    assert s == p, f"Row count mismatch: sandbox={s}, public={p}"
```

**Test function shape — schema match (lines 51-74):**
```python
@_SANDBOX_GUARD
def test_occurrences_schema_matches():
    """Column names AND types from DESCRIBE match exactly between sandbox and public (30 cols).
    ...
    """
    s_cols = [
        (r[0], r[1])
        for r in duckdb.execute(
            f"DESCRIBE SELECT * FROM read_parquet('{SANDBOX}/occurrences.parquet')"
        ).fetchall()
    ]
    p_cols = [...]
    assert s_cols == p_cols, (...)
```

**Test function shape — full anti-join / key set (lines 101-130):**
```python
@_SANDBOX_GUARD
def test_occurrences_ecdysis_id_join_full():
    """Full anti-join: ecdysis_ids present in one file but absent in the other must be 0."""
    only_in_sandbox = duckdb.execute(
        f"""
        SELECT COUNT(*) FROM (
            SELECT ecdysis_id FROM read_parquet('{SANDBOX}/occurrences.parquet')
            WHERE ecdysis_id IS NOT NULL
            EXCEPT
            SELECT ecdysis_id FROM read_parquet('{PUBLIC}/occurrences.parquet')
            WHERE ecdysis_id IS NOT NULL
        )
        """
    ).fetchone()[0]
    only_in_public = duckdb.execute(...).fetchone()[0]
    assert only_in_sandbox == 0, (...)
    assert only_in_public == 0, (...)
```

**JSON byte-comparison test shape — copy from the `counties.geojson` test (lines 246-257) as structural analog, but compare file bytes not JSON structure:**
```python
@pytest.mark.skipif(
    not (SANDBOX / "counties.geojson").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)
def test_counties_geojson_feature_count_matches():
    s = json.loads((SANDBOX / "counties.geojson").read_text())
    p = json.loads((PUBLIC / "counties.geojson").read_text())
    assert len(s["features"]) == len(p["features"]), (...)
```

**Apply — add the following 5 functions and 2 guards after the existing tests:**

```python
SANDBOX_SPECIES_PARQUET_GUARD = pytest.mark.skipif(
    not (SANDBOX / "species.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox species.parquet",
)

@SANDBOX_SPECIES_PARQUET_GUARD
def test_species_parquet_row_count_matches():
    """Sandbox species.parquet has same row count as public/data/species.parquet.

    Verified baseline: both 629 rows.
    """
    s = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{SANDBOX}/species.parquet')"
    ).fetchone()[0]
    p = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{PUBLIC}/species.parquet')"
    ).fetchone()[0]
    assert s == p, f"Row count mismatch: sandbox={s}, public={p}"


@SANDBOX_SPECIES_PARQUET_GUARD
def test_species_parquet_schema_matches():
    """19-column schema (names + types) identical between sandbox and public (19 cols)."""
    s_cols = [(r[0], r[1]) for r in duckdb.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{SANDBOX}/species.parquet')"
    ).fetchall()]
    p_cols = [(r[0], r[1]) for r in duckdb.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{PUBLIC}/species.parquet')"
    ).fetchall()]
    assert s_cols == p_cols, (
        f"Schema mismatch.\nSandbox only: {[c for c in s_cols if c not in p_cols]}\n"
        f"Public only:  {[c for c in p_cols if c not in s_cols]}"
    )


@SANDBOX_SPECIES_PARQUET_GUARD
def test_species_canonical_name_key_set_matches():
    """Full anti-join on canonical_name: 0 rows in both EXCEPT directions."""
    only_in_sandbox = duckdb.execute(f"""
        SELECT COUNT(*) FROM (
            SELECT canonical_name FROM read_parquet('{SANDBOX}/species.parquet')
            EXCEPT
            SELECT canonical_name FROM read_parquet('{PUBLIC}/species.parquet')
        )
    """).fetchone()[0]
    only_in_public = duckdb.execute(f"""
        SELECT COUNT(*) FROM (
            SELECT canonical_name FROM read_parquet('{PUBLIC}/species.parquet')
            EXCEPT
            SELECT canonical_name FROM read_parquet('{SANDBOX}/species.parquet')
        )
    """).fetchone()[0]
    assert only_in_sandbox == 0, f"{only_in_sandbox} canonical_names in sandbox but not public"
    assert only_in_public == 0, f"{only_in_public} canonical_names in public but not sandbox"


@pytest.mark.skipif(
    not (SANDBOX / "species.json").exists(),
    reason="run species JSON post-step first",
)
def test_species_json_matches():
    """sandbox/species.json content == public/data/species.json (byte-comparable)."""
    s = (SANDBOX / "species.json").read_bytes()
    p = (PUBLIC / "species.json").read_bytes()
    assert s == p, "species.json content differs between sandbox and public"


@pytest.mark.skipif(
    not (SANDBOX / "seasonality.json").exists(),
    reason="run species JSON post-step first",
)
def test_seasonality_json_matches():
    """sandbox/seasonality.json content == public/data/seasonality.json (byte-comparable)."""
    s = (SANDBOX / "seasonality.json").read_bytes()
    p = (PUBLIC / "seasonality.json").read_bytes()
    assert s == p, "seasonality.json content differs between sandbox and public"
```

**Note on test ordering:** The 5 new tests go at the end of the file in a clearly labelled section (`# PORT-01: Species artifact diff tests`). The SANDBOX guard for parquet tests must check `SANDBOX / "species.parquet"` not the occurrences guard — use a separately-named guard constant (`SANDBOX_SPECIES_PARQUET_GUARD`) to avoid confusion with `_SANDBOX_GUARD`.

---

### `.planning/phases/086-port-remaining-transforms/ingestion-boundary.md` (documentation)
**REQ:** PORT-02, PORT-04

**Analog:** None — greenfield decision record. No existing ingestion-boundary documents in the codebase.

**Content shape — write a document covering both PORT-02 and PORT-04 decisions:**
- What each Python script does (Ecdysis HTML scraper via `load_links`, iNat API caller via `resolve_taxon_ids.py`)
- Why it stays in Python (HTTP calls, rate-limiting, procedural policy, stateful UPSERT)
- The ingestion/transform seam: script writes → DB table → dbt `source()` → staging view → consumed by dbt model
- For PORT-02: confirm that `ecdysis_data.occurrence_links` → `stg_ecdysis__occurrence_links` → `int_ecdysis_base` is already complete; the Python `load_links` step is the ingestion boundary
- For PORT-04: confirm that `inaturalist_data.canonical_to_taxon_id` → `stg_inat__canonical_to_taxon_id` → `int_species_universe` is the seam; `resolve_taxon_ids.py` stays as-is

---

## Shared Patterns

### dbt staging view — pass-through wrapper
**Source:** `data/dbt/models/staging/stg_waba__observations.sql` (all 10 lines)
**Apply to:** All three new staging views (stg_inat__canonical_to_taxon_id, stg_inat__taxon_lineage_extended, stg_checklist__species)

Convention: opening comment block identifies (a) what source table is wrapped, (b) what writes to that table (ingestion script), (c) what downstream models consume it. Then `{{ config(materialized='view') }}`, then `SELECT * FROM {{ source(...) }}`. No column aliasing or filtering at this layer unless there is a load-bearing reason (as in stg_inat__observations where a tombstone row is filtered).

### dbt mart — external parquet with enforced contract
**Source:** `data/dbt/models/marts/occurrences.sql` (lines 11-17) + `data/dbt/models/marts/schema.yml` (lines 4-69)
**Apply to:** `data/dbt/models/marts/species.sql` + `data/dbt/models/marts/schema.yml` species block

Config block:
```sql
{{ config(
    materialized='external',
    location='target/sandbox/species.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}
```
Contract block in schema.yml uses `contract: enforced: true` with explicit `data_type` per column.

### dbt singular test — 0-rows-pass semantics
**Source:** `data/dbt/tests/test_ecdysis_id_references_source.sql` (lines 1-32)
**Apply to:** `data/dbt/tests/test_lin05_lineage_coverage.sql`

Convention: opening comment block states what the test checks, PASS = 0 rows semantics, what it replaces (if anything), and VERIFIED baseline. Body is a pure SELECT that returns rows only when the invariant is violated.

### dbt test annotation in schema.yml
**Source:** `data/dbt/models/staging/schema.yml` (lines 8-10, 15-17, 26-28)
**Apply to:** All new staging schema.yml entries

Inline comment after test name encodes verification status:
```yaml
data_tests:
  - not_null
  - unique    # VERIFIED unique: N rows, N distinct values
```
or for known-fail:
```yaml
  - not_null    # OBSERVED FAIL (reason) — kept as tripwire
```

### Python JSON serialization — byte-comparable output
**Source:** `data/species_export.py` lines 269-316
**Apply to:** Python post-step that reads sandbox species.parquet and writes JSON sidecars

Two patterns used in the same file:
```python
# species.json — sorted keys, 2-space indent
json.dumps(_jsonify_rows(species_rows), sort_keys=True, indent=2)

# seasonality.json — sorted keys, compact (no spaces)
json.dumps(out_seas, sort_keys=True, separators=(',', ':'))
```
The `_jsonify_rows` helper (lines 54-73) converts `datetime.date` → `.isoformat()` string. The Python post-step must use these exact serialization forms to produce byte-comparable output.

### pytest skipif guard with named constant
**Source:** `data/tests/test_dbt_diff.py` lines 26-29
**Apply to:** New species diff tests in test_dbt_diff.py

Use a separately-named guard per artifact so SKIP reason messages are specific:
```python
_SANDBOX_GUARD = pytest.mark.skipif(
    not (SANDBOX / "occurrences.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)
SANDBOX_SPECIES_PARQUET_GUARD = pytest.mark.skipif(
    not (SANDBOX / "species.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox species.parquet",
)
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `.planning/phases/086-port-remaining-transforms/ingestion-boundary.md` | documentation | — | No ingestion-boundary decision records exist in the codebase yet — this is the first. Write as a plain technical memo covering PORT-02 and PORT-04. |

---

## Notes / Surprises

1. **`_slugify` uses `unicodedata.normalize('NFKD')` + `encode('ascii', 'ignore')`.** This cannot be replicated byte-identically in DuckDB SQL — the `unicodedata` step transliterates accented characters in a way that has no DuckDB equivalent. The slug column MUST be added by the Python post-step, not in the dbt mart SQL. This resolves RESEARCH assumption A1 (confirmed NOT viable as SQL).

2. **The species mart contract should cover 18 columns (not 19).** The dbt contract enforces what the SQL mart emits. The Python post-step adds `slug` as the 19th column by rewriting the parquet. The diff harness (`test_species_parquet_schema_matches`) asserts the final 19-column shape including slug.

3. **`int_species_occurrences_agg` should read from `source('ecdysis_data', 'occurrences')` not `ref('stg_ecdysis__occurrences')`.** The staging view applies a `decimal_latitude IS NOT NULL` spatial filter (from Phase 085 TEST-01 resolution pattern). The temporal aggregates (occurrence_count, month_histogram) should include all ecdysis records regardless of spatial completeness.

4. **`int_combined` does not need modification in Phase 086** unless the planner explicitly decides to clean up the three deferred columns (`specimen_inat_login`, `specimen_inat_genus`, `specimen_inat_family`). This was deferred from Phase 085 per 085-04-SUMMARY.md. The species mart DAG does not pass through `int_combined` at all.

5. **PORT-02 has no new dbt models.** The `int_waba_link` and `int_ecdysis_base` models already express the occurrence-links join. PORT-02's only deliverable is the ingestion-boundary document confirming `ecdysis_pipeline.load_links` (HTML scraping) stays in Python and `ecdysis_data.occurrence_links` is already declared as a `source()` in `sources.yml` (line 8).

---

## Metadata

**Analog search scope:** `data/dbt/models/`, `data/dbt/tests/`, `data/tests/`, `data/species_export.py`, `data/export.py`, `data/feeds.py`
**Files scanned:** 19 source files read
**Pattern extraction date:** 2026-05-13
