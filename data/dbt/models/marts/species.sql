-- Species mart: 22-column external parquet (species.parquet).
-- slug column is intentionally OMITTED — it requires unicodedata.normalize('NFKD')
-- which is not byte-identically reproducible in SQL (PATTERNS.md Surprise 1).
-- The Python post-step (Plan 086-05) reads this mart, adds slug via feeds._slugify,
-- and overwrites the parquet to reach 23 columns before public/data/ deployment.
-- Enforced contract in schema.yml covers all 22 SQL-emittable columns.
-- 22 SQL columns + 1 Python-added slug = 23 final columns.
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
    ecoregion_count,
    checklist_count,
    checklist_record_count,
    inat_obs_count,
    taxon_id
FROM {{ ref('int_species_universe') }}
