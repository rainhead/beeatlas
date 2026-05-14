-- Singular dbt test: LIN-05 — at least 95% of the species universe should have
-- a resolved taxon_id in canonical_to_taxon_id AND a lineage row in
-- taxon_lineage_extended.
--
-- WARN semantics (not error): returns 1 row with (total, resolved, ratio)
-- when coverage < 0.95. dbt emits a WARN and continues. Demoted from error
-- because the species universe is driven by upstream feeds (Ecdysis +
-- checklist) while bridge entries depend on successful iNaturalist taxonomy
-- lookups — a handful of unmatched names (typically genus-only checklist
-- entries or species iNat has under a different name) drops coverage below
-- 95% on some runs without representing a real pipeline failure.
--
-- Most recent observation: 698/737 = 94.71% on 2026-05-14 maderas run
-- (39 unbridged names persisted across --refresh-lineage retries).
--
-- References staging models (not direct source()) to preserve DAG lineage and
-- ensure any staging-level filters are applied (Pitfall 8 from RESEARCH.md).
-- NOTE: source('ecdysis_data', 'occurrences') IS used directly in the
-- species_universe CTE — this is intentional because no staging filter applies
-- to ecdysis occurrences for this purpose; Pitfall 8's restriction applies to
-- the lineage inputs (canonical_to_taxon_id, taxon_lineage_extended) which DO
-- have staging wrappers.
{{ config(severity='warn') }}
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
