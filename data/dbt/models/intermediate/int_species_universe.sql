-- Species universe: FULL OUTER JOIN of checklist + ecdysis occurrences with
-- lineage backfill. Mirrors species_export.py lines 157-208.
-- Materialized as TABLE to prevent re-evaluating the FULL OUTER JOIN on each
-- mart pass (same reason as int_combined).
-- NOTE: month_histogram NULL backfill uses CASE, not COALESCE — DuckDB COALESCE
-- on INTEGER[12] is unimplemented in 1.4.x (Phase 078-02).
-- NOTE 2: In DuckDB 1.5.3, CASE branches must NOT mix INTEGER[12] and other types when
-- stg_inat taxon-lineage joins are present + ORDER BY; DuckDB's planner fails with
-- "Unimplemented type for case expression: INTEGER[12]". Workaround: cast occ_agg
-- month_histogram to INTEGER[] (variable-length) so the CASE expression operates over
-- uniform INTEGER[] branches; cast the final CASE result to INTEGER[12] (Phase 118-03).
-- slug column is NOT emitted here — it is added by the Python post-step
-- (Plan 086-05) reading the species mart parquet. The _slugify function uses
-- unicodedata.normalize('NFKD') which cannot be replicated byte-identically in SQL.
{{ config(materialized='table') }}

WITH occ_agg AS (
    -- Cast month_histogram to INTEGER[] to avoid DuckDB 1.5.3 CASE-type-inference
    -- bug with fixed-size arrays (INTEGER[12]) when stg_inat joins + ORDER BY present.
    SELECT canonical_name, occurrence_count, specimen_count, first_occurrence_date,
           last_occurrence_date, month_histogram::INTEGER[] AS month_histogram
    FROM {{ ref('int_species_occurrences_agg') }}
),
checklist_month_agg AS (
    -- Aggregate checklist month data per species (NULL months skipped — ~15% of rows).
    -- Pattern mirrors int_species_occurrences_agg.sql list_value(SUM(CASE...))::INTEGER[12].
    -- Only non-NULL months contribute to the histogram (D-11).
    SELECT
        canonical_name,
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
        ) AS checklist_month_histogram
    FROM {{ ref('checklist') }}
    WHERE canonical_name IS NOT NULL
      AND month IS NOT NULL
    GROUP BY canonical_name
),
checklist_count_agg AS (
    -- Separate CTE for total checklist_count — does NOT filter by month IS NOT NULL
    -- so that all checklist records (including those with unknown month) are counted.
    SELECT canonical_name, COUNT(*) AS checklist_count
    FROM {{ ref('checklist') }}
    WHERE canonical_name IS NOT NULL
    GROUP BY canonical_name
),
-- Per-species iNat expert obs count (OCC-02). Reads source directly to avoid circular DAG with occurrences mart.
inat_obs_count_agg AS (
    SELECT canonical_name, COUNT(*) AS inat_obs_count
    FROM {{ source('inat_obs_data', 'observations') }}
    WHERE canonical_name IS NOT NULL
    GROUP BY canonical_name
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
        -- Merged month_histogram: element-wise sum of WABA + checklist months.
        -- Four-branch CASE guards against NULL for both arms (DuckDB 1.4.x COALESCE
        -- on INTEGER[12] is unimplemented — Pitfall 1; CASE not COALESCE).
        -- CASE branches use INTEGER[] throughout (occ_agg casts to INTEGER[]);
        -- final ::INTEGER[12] cast applied to the whole expression to preserve contract
        -- type while avoiding DuckDB 1.5.3 planner bug (NOTE 2 above, Phase 118-03).
        (CASE WHEN oa.month_histogram IS NULL AND cma.checklist_month_histogram IS NULL
             THEN [0,0,0,0,0,0,0,0,0,0,0,0]
             WHEN oa.month_histogram IS NULL
             THEN cma.checklist_month_histogram
             WHEN cma.checklist_month_histogram IS NULL
             THEN oa.month_histogram
             ELSE list_value(
                 oa.month_histogram[1]  + cma.checklist_month_histogram[1],
                 oa.month_histogram[2]  + cma.checklist_month_histogram[2],
                 oa.month_histogram[3]  + cma.checklist_month_histogram[3],
                 oa.month_histogram[4]  + cma.checklist_month_histogram[4],
                 oa.month_histogram[5]  + cma.checklist_month_histogram[5],
                 oa.month_histogram[6]  + cma.checklist_month_histogram[6],
                 oa.month_histogram[7]  + cma.checklist_month_histogram[7],
                 oa.month_histogram[8]  + cma.checklist_month_histogram[8],
                 oa.month_histogram[9]  + cma.checklist_month_histogram[9],
                 oa.month_histogram[10] + cma.checklist_month_histogram[10],
                 oa.month_histogram[11] + cma.checklist_month_histogram[11],
                 oa.month_histogram[12] + cma.checklist_month_histogram[12]
             )
        END)::INTEGER[12] AS month_histogram,
        COALESCE(ga.county_count, 0) AS county_count,
        COALESCE(ga.ecoregion_count, 0) AS ecoregion_count,
        COALESCE(cca.checklist_count, 0)::BIGINT AS checklist_count,
        COALESCE(ioa.inat_obs_count, 0)::BIGINT AS inat_obs_count
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
    LEFT JOIN checklist_month_agg cma
        ON cma.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
    LEFT JOIN checklist_count_agg cca
        ON cca.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
    LEFT JOIN inat_obs_count_agg ioa
        ON ioa.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
)
-- Collapse any accidental duplicate canonical_name rows, preferring the
-- checklist-favoring row when both arms produce one (Pitfall 7: DISTINCT ON).
-- Sole gate for restricting species universe to the seven Anthophila bee families.
-- This WHERE clause is the only filter in the pipeline — there is no other family
-- restriction. The Python BEE_FAMILIES constant in species_export.py was removed in
-- Phase 102 (PY-02) because it was dead code; this SQL clause was always the real gate.
SELECT DISTINCT ON (canonical_name) *
FROM species_universe
WHERE family IN ('Andrenidae', 'Apidae', 'Colletidae', 'Halictidae',
                 'Megachilidae', 'Melittidae', 'Stenotritidae')
ORDER BY canonical_name, on_checklist DESC
