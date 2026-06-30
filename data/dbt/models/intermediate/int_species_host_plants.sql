-- NO contract — private intermediate; marts/occurrences + marts/species contracts untouched.
-- Per-bee-species × plant-family/genus host aggregate with distinct-sample count.
-- "sample" = distinct host_observation_id (the sample proxy, not raw specimen rows).
-- See Phase 175 CONTEXT §Aggregation and §Output artifact.
--
-- Materialized to target/sandbox/species_host_plants.parquet for species_export.py.
-- species_export.py reads this parquet to produce public/data/species_hosts.json.
{{ config(
    materialized='external',
    location='target/sandbox/species_host_plants.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}

WITH base AS (
    -- int_ecdysis_base carries host_observation_id + canonical_name.
    -- Filter nulls early to reduce the join fanout.
    SELECT
        b.host_observation_id,
        b.canonical_name
    FROM {{ ref('int_ecdysis_base') }} b
    WHERE b.host_observation_id IS NOT NULL
      AND b.canonical_name IS NOT NULL
),
aggregated AS (
    SELECT
        -- Apply synonymy: Ecdysis canonical_name may pre-date taxonomy corrections.
        -- See feedback_checklist_synonymy_gap — apply int_synonyms join on any raw arm.
        COALESCE(syn.accepted_name, base.canonical_name)                            AS canonical_name,
        tle.family,
        -- Genus from lineage walk; fall back to first token of host taxon name.
        -- Handles species-rank hosts where the genus is the first name token.
        COALESCE(tle.genus, split_part(obs.taxon__name, ' ', 1))                   AS genus,
        base.host_observation_id
    FROM base
    LEFT JOIN {{ ref('int_synonyms') }}                  syn ON syn.synonym = base.canonical_name
    LEFT JOIN {{ ref('stg_inat__observations') }}        obs ON obs.id = base.host_observation_id
    LEFT JOIN {{ ref('stg_inat__host_plant_lineage') }}  tle ON tle.taxon_id = obs.taxon__id
    WHERE tle.family IS NOT NULL
)
SELECT
    canonical_name,
    family,
    genus,
    COUNT(DISTINCT host_observation_id) AS sample_count
FROM aggregated
GROUP BY canonical_name, family, genus
ORDER BY canonical_name, sample_count DESC
