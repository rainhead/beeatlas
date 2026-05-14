-- Species universe: FULL OUTER JOIN of checklist + ecdysis occurrences with
-- lineage backfill. Mirrors species_export.py lines 157-208.
-- Materialized as TABLE to prevent re-evaluating the FULL OUTER JOIN on each
-- mart pass (same reason as int_combined).
-- NOTE: month_histogram NULL backfill uses CASE, not COALESCE — DuckDB COALESCE
-- on INTEGER[12] is unimplemented in 1.4.x (Phase 078-02).
-- slug column is NOT emitted here — it is added by the Python post-step
-- (Plan 086-05) reading the species mart parquet. The _slugify function uses
-- unicodedata.normalize('NFKD') which cannot be replicated byte-identically in SQL.
{{ config(materialized='table') }}

WITH occ_agg AS (
    SELECT * FROM {{ ref('int_species_occurrences_agg') }}
),
provisional_agg AS (
    -- provisional_count: occurrences mart rows flagged is_provisional=TRUE.
    -- Inlined here (parallel to geo_agg) rather than as a separate intermediate
    -- model — reads ref('occurrences') external parquet, creating a DAG dependency.
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
        -- NULL backfill: DuckDB COALESCE on INTEGER[12] is unimplemented (1.4.x).
        -- Use CASE instead of COALESCE(oa.month_histogram, [0]*12) (Pitfall 2).
        CASE WHEN oa.month_histogram IS NULL
             THEN [0,0,0,0,0,0,0,0,0,0,0,0]::INTEGER[]
             ELSE oa.month_histogram
        END AS month_histogram,
        COALESCE(ga.county_count, 0) AS county_count,
        COALESCE(ga.ecoregion_count, 0) AS ecoregion_count
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
-- Collapse any accidental duplicate canonical_name rows, preferring the
-- checklist-favoring row when both arms produce one (Pitfall 7: DISTINCT ON).
-- Restrict to the seven Anthophila families (BEE_FAMILIES). Non-bee byproducts
-- of sample collection have no place in a bee species tree.
SELECT DISTINCT ON (canonical_name) *
FROM species_universe
WHERE family IN ('Andrenidae', 'Apidae', 'Colletidae', 'Halictidae',
                 'Megachilidae', 'Melittidae', 'Stenotritidae')
ORDER BY canonical_name, on_checklist DESC
