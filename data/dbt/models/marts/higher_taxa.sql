-- Higher-taxa rollup mart: one row per higher-rank taxon (genus/subgenus/tribe/subfamily)
-- with rolled-up counts and member_taxon_ids (D-10 membership, PAGE-01/PAGE-02/PAGE-04).
--
-- Grouped by ancestor taxon_id (NOT rank-name strings) — PAGE-01 core requirement.
-- Fan-out avoided: each rank uses a separate GROUP BY after a name-match join (Pitfall 1).
-- Checklist-only species (occurrence_count=0, on_checklist=TRUE) are included — PAGE-04.
-- Eumeninae excluded by the bee-family WHERE clause in int_species_universe (D-08).
--
-- member_taxon_ids: JSON array of direct child taxon_ids per rank:
--   genus/subgenus -> species.taxon_id (per-species)
--   tribe/subfamily -> genus taxon_id (from stg_inat__genus_taxon_ids)
--
-- 13 emitted columns; ALL 13 must be declared in the enforced schema.yml contract.
{{ config(
    materialized='external',
    location='target/sandbox/higher_taxa.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}

-- Genus rollup: join via stg_inat__genus_taxon_ids (lowercase name match)
WITH genus_rollup AS (
    SELECT
        gtids.taxon_id                                                AS taxon_id,
        'genus'                                                       AS rank,
        sp.genus                                                      AS name,
        MAX(sp.family)                                                AS family,
        MAX(sp.subfamily)                                             AS subfamily,
        MAX(sp.tribe)                                                 AS tribe,
        NULL::VARCHAR                                                 AS genus,
        SUM(sp.specimen_count)::BIGINT                                AS specimen_count,
        SUM(sp.inat_obs_count)::BIGINT                                AS inat_obs_count,
        SUM(sp.occurrence_count)::BIGINT                              AS occurrence_count,
        COUNT(*)::BIGINT                                              AS species_count,
        to_json(list(DISTINCT sp.taxon_id ORDER BY sp.taxon_id))::VARCHAR AS member_taxon_ids
    FROM {{ ref('species') }} sp
    JOIN {{ ref('stg_inat__genus_taxon_ids') }} gtids
        ON lower(sp.genus) = gtids.genus_name
    WHERE sp.genus IS NOT NULL AND sp.genus <> ''
    GROUP BY gtids.taxon_id, sp.genus
),

-- Subgenus rollup: join via stg_inat__higher_rank_taxon_ids on rank='subgenus'
subgenus_rollup AS (
    SELECT
        htids.taxon_id                                                AS taxon_id,
        'subgenus'                                                    AS rank,
        sp.subgenus                                                   AS name,
        MAX(sp.family)                                                AS family,
        MAX(sp.subfamily)                                             AS subfamily,
        MAX(sp.tribe)                                                 AS tribe,
        MAX(sp.genus)                                                 AS genus,
        SUM(sp.specimen_count)::BIGINT                                AS specimen_count,
        SUM(sp.inat_obs_count)::BIGINT                                AS inat_obs_count,
        SUM(sp.occurrence_count)::BIGINT                              AS occurrence_count,
        COUNT(*)::BIGINT                                              AS species_count,
        to_json(list(DISTINCT sp.taxon_id ORDER BY sp.taxon_id))::VARCHAR AS member_taxon_ids
    FROM {{ ref('species') }} sp
    JOIN {{ ref('stg_inat__higher_rank_taxon_ids') }} htids
        ON sp.subgenus = htids.name AND htids.rank = 'subgenus'
    WHERE sp.subgenus IS NOT NULL AND sp.subgenus <> ''
    GROUP BY htids.taxon_id, sp.subgenus
),

-- Tribe rollup: member_taxon_ids = distinct genus taxon_ids in tribe
tribe_rollup AS (
    SELECT
        htids.taxon_id                                                AS taxon_id,
        'tribe'                                                       AS rank,
        sp.tribe                                                      AS name,
        MAX(sp.family)                                                AS family,
        MAX(sp.subfamily)                                             AS subfamily,
        NULL::VARCHAR                                                 AS tribe,
        NULL::VARCHAR                                                 AS genus,
        SUM(sp.specimen_count)::BIGINT                                AS specimen_count,
        SUM(sp.inat_obs_count)::BIGINT                                AS inat_obs_count,
        SUM(sp.occurrence_count)::BIGINT                              AS occurrence_count,
        COUNT(DISTINCT sp.taxon_id)::BIGINT                          AS species_count,
        to_json(list(DISTINCT gtids.taxon_id ORDER BY gtids.taxon_id))::VARCHAR AS member_taxon_ids
    FROM {{ ref('species') }} sp
    JOIN {{ ref('stg_inat__higher_rank_taxon_ids') }} htids
        ON sp.tribe = htids.name AND htids.rank = 'tribe'
    JOIN {{ ref('stg_inat__genus_taxon_ids') }} gtids
        ON lower(sp.genus) = gtids.genus_name
    WHERE sp.tribe IS NOT NULL AND sp.tribe <> ''
    GROUP BY htids.taxon_id, sp.tribe
),

-- Subfamily rollup: member_taxon_ids = distinct genus taxon_ids in subfamily
subfamily_rollup AS (
    SELECT
        htids.taxon_id                                                AS taxon_id,
        'subfamily'                                                   AS rank,
        sp.subfamily                                                  AS name,
        MAX(sp.family)                                                AS family,
        NULL::VARCHAR                                                 AS subfamily,
        NULL::VARCHAR                                                 AS tribe,
        NULL::VARCHAR                                                 AS genus,
        SUM(sp.specimen_count)::BIGINT                                AS specimen_count,
        SUM(sp.inat_obs_count)::BIGINT                                AS inat_obs_count,
        SUM(sp.occurrence_count)::BIGINT                              AS occurrence_count,
        COUNT(DISTINCT sp.taxon_id)::BIGINT                          AS species_count,
        to_json(list(DISTINCT gtids.taxon_id ORDER BY gtids.taxon_id))::VARCHAR AS member_taxon_ids
    FROM {{ ref('species') }} sp
    JOIN {{ ref('stg_inat__higher_rank_taxon_ids') }} htids
        ON sp.subfamily = htids.name AND htids.rank = 'subfamily'
    JOIN {{ ref('stg_inat__genus_taxon_ids') }} gtids
        ON lower(sp.genus) = gtids.genus_name
    WHERE sp.subfamily IS NOT NULL AND sp.subfamily <> ''
    GROUP BY htids.taxon_id, sp.subfamily
)

SELECT
    taxon_id,
    rank,
    name,
    family,
    subfamily,
    tribe,
    genus,
    specimen_count,
    inat_obs_count,
    occurrence_count,
    species_count,
    member_taxon_ids
FROM genus_rollup

UNION ALL

SELECT
    taxon_id,
    rank,
    name,
    family,
    subfamily,
    tribe,
    genus,
    specimen_count,
    inat_obs_count,
    occurrence_count,
    species_count,
    member_taxon_ids
FROM subgenus_rollup

UNION ALL

SELECT
    taxon_id,
    rank,
    name,
    family,
    subfamily,
    tribe,
    genus,
    specimen_count,
    inat_obs_count,
    occurrence_count,
    species_count,
    member_taxon_ids
FROM tribe_rollup

UNION ALL

SELECT
    taxon_id,
    rank,
    name,
    family,
    subfamily,
    tribe,
    genus,
    specimen_count,
    inat_obs_count,
    occurrence_count,
    species_count,
    member_taxon_ids
FROM subfamily_rollup
