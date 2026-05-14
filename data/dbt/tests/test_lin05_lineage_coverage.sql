-- Singular dbt test: LIN-05 — at least 95% of the species universe must have a
-- resolved taxon_id in canonical_to_taxon_id AND a lineage row in
-- taxon_lineage_extended.
--
-- PASS semantics: returns 0 rows when coverage >= 0.95.
-- FAIL: returns 1 row with (total, resolved, ratio) when coverage < 0.95.
--
-- References staging models (not direct source()) to preserve DAG lineage and
-- ensure any staging-level filters are applied (Pitfall 8 from RESEARCH.md).
-- NOTE: source('ecdysis_data', 'occurrences') IS used directly in the
-- species_universe CTE — this is intentional because no staging filter applies
-- to ecdysis occurrences for this purpose; Pitfall 8's restriction applies to
-- the lineage inputs (canonical_to_taxon_id, taxon_lineage_extended) which DO
-- have staging wrappers.
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
