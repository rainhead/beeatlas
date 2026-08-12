-- Singular dbt test: int_ecdysis_identifications reconciles per-coreid with its
-- staging input under the arm's own filter predicate (beeatlas-fc4 acceptance).
--
-- PASS semantics: 0 rows. A row means a coreid whose identification-event count
-- differs between staging (named, non-sentinel rows) and the arm — i.e. either
-- the arm's filter drifted from the predicate spelled here (rows dropped), or a
-- downstream JOIN fanned out (e.g. an identifier-register name/alt_spelling
-- collision matching one determiner to two register rows, or a duplicate
-- int_synonyms key).
--
-- Shared-predicate tautology (same posture as assert_id_date_parse_complete):
-- the filter here is byte-equivalent to the arm's WHERE clause, so on any data
-- this returns 0 rows unless the arm itself regresses. Severity: warn, matching
-- that precedent (nightly-non-blocking).

{{ config(severity='warn') }}

WITH src AS (
    SELECT coreid, COUNT(*) AS n
    FROM {{ ref('stg_ecdysis__identifications') }}
    WHERE canonical_name IS NOT NULL
      AND canonical_name != 'undetermined'
      AND TRIM(COALESCE(identified_by, '')) != 'Nomenclatural Adjustment'
    GROUP BY coreid
),

arm AS (
    SELECT coreid, COUNT(*) AS n
    FROM {{ ref('int_ecdysis_identifications') }}
    GROUP BY coreid
)

SELECT
    COALESCE(src.coreid, arm.coreid) AS coreid,
    src.n                            AS staging_rows,
    arm.n                            AS arm_rows
FROM src
FULL OUTER JOIN arm ON arm.coreid = src.coreid
WHERE src.n IS DISTINCT FROM arm.n
