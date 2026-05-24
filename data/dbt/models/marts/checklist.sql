-- Checklist parquet mart: county-range assertions from Bartholomew et al. 2024 WA checklist.
-- Architecture: checklist.parquet is a separate mart from occurrences.parquet.
-- Checklist records are county-range assertions (no point coordinates).
-- They MUST NOT appear in int_combined or occurrences.parquet (locked decision, STATE.md).
-- source='checklist' convention: all rows carry source='checklist'.
-- Future sources (GBIF, other Bee Atlas programs) should produce analogous parquet files
-- with their own source= constant and the same 12-column schema.
{{ config(
    materialized='external',
    location='target/sandbox/checklist.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}

WITH sc AS (
    -- One row per (species, county) pair from species_counties
    SELECT
        sp.canonical_name,
        sp.scientificName,
        sp.genus,
        sp.specific_epithet,
        sc.county
    FROM {{ source('checklist_data', 'species_counties') }} sc
    JOIN {{ ref('stg_checklist__species') }} sp USING (scientificName)
),
-- Enrich with family via iNat lineage (same join as int_species_universe)
with_lineage AS (
    SELECT
        sc.*,
        TRIM(tle.family) AS family
    FROM sc
    LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt
        ON ctt.canonical_name = sc.canonical_name
    LEFT JOIN {{ ref('stg_inat__taxon_lineage_extended') }} tle
        ON tle.taxon_id = ctt.taxon_id
),
-- County centroid for ecoregion spatial join
county_centroids AS (
    SELECT county, ST_Centroid(geom) AS centroid
    FROM {{ ref('stg_geo__us_counties') }}
),
with_eco AS (
    SELECT cc.county, e.ecoregion_l3
    FROM county_centroids cc
    LEFT JOIN {{ ref('stg_geo__ecoregions') }} e ON ST_Within(cc.centroid, e.geom)
),
eco_dedup AS (
    SELECT DISTINCT ON (county) county, ecoregion_l3
    FROM with_eco
),
eco_fallback AS (
    SELECT county,
        (SELECT ecoregion_l3 FROM {{ ref('stg_geo__ecoregions') }}
         ORDER BY ST_Distance(geom,
             (SELECT centroid FROM county_centroids cc2 WHERE cc2.county = eco_dedup.county))
         LIMIT 1) AS ecoregion_l3
    FROM eco_dedup
    WHERE ecoregion_l3 IS NULL
),
final_eco AS (
    SELECT * FROM eco_dedup WHERE ecoregion_l3 IS NOT NULL
    UNION ALL SELECT * FROM eco_fallback
)
SELECT
    wl.canonical_name,
    TRIM(wl.scientificName)    AS scientificName,
    TRIM(wl.genus)             AS genus,
    TRIM(wl.specific_epithet)  AS specific_epithet,
    wl.family,
    NULL::DOUBLE               AS lat,
    NULL::DOUBLE               AS lon,
    NULL::BIGINT               AS year,
    NULL::BIGINT               AS month,
    TRIM(wl.county)            AS county,
    fe.ecoregion_l3,
    'checklist'                AS source
FROM with_lineage wl
LEFT JOIN final_eco fe ON fe.county = wl.county
