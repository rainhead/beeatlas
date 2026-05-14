-- Per-species geographic aggregate from the occurrences mart.
-- Mirrors species_export.py geo_agg CTE + occ_with_geo CTE (lines 100-156).
-- Reads from ref('occurrences') (external parquet) — creates a deliberate DAG
-- dependency on the occurrences mart; dbt build --select species+ will also
-- rebuild occurrences. Do NOT hardcode the parquet file path: ref() resolves
-- to the external location (Pitfall 6 from RESEARCH.md).
{{ config(materialized='view') }}

SELECT
    canonical_name,
    COUNT(DISTINCT county) AS county_count,
    COUNT(DISTINCT ecoregion_l3) AS ecoregion_count
FROM {{ ref('occurrences') }}
WHERE canonical_name IS NOT NULL
GROUP BY canonical_name
