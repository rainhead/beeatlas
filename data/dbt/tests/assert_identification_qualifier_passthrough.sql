-- Singular dbt test: identification_qualifier passes through the Ecdysis arm
-- intact (beeatlas-fc4 acceptance). The qualifiers are hedged assertions
-- (cf./aff./?/'zonalis group', 345 rows as of beeatlas-0o1) whose semantics the
-- trusted-taxon model (beeatlas-xs1) decides — so losing or mangling one here
-- would silently change trust decisions later.
--
-- PASS semantics: 0 rows. A row is a qualifier value whose row count differs
-- between staging (named, non-sentinel rows — the arm's filter predicate) and
-- the arm. The arm's only legal transformation is blank -> NULL (NULLIF/TRIM),
-- so both sides count trimmed non-blank values.
--
-- Severity: warn — tautological on current code by construction; fires only on
-- a projection regression (assert_id_date_parse_complete precedent).

{{ config(severity='warn') }}

WITH src AS (
    SELECT TRIM(identification_qualifier) AS qualifier, COUNT(*) AS n
    FROM {{ ref('stg_ecdysis__identifications') }}
    WHERE canonical_name IS NOT NULL
      AND canonical_name != 'undetermined'
      AND TRIM(COALESCE(identified_by, '')) != 'Nomenclatural Adjustment'
      AND TRIM(COALESCE(identification_qualifier, '')) != ''
    GROUP BY 1
),

arm AS (
    SELECT identification_qualifier AS qualifier, COUNT(*) AS n
    FROM {{ ref('int_ecdysis_identifications') }}
    WHERE identification_qualifier IS NOT NULL
    GROUP BY 1
)

SELECT
    COALESCE(src.qualifier, arm.qualifier) AS qualifier,
    src.n                                  AS staging_rows,
    arm.n                                  AS arm_rows
FROM src
FULL OUTER JOIN arm ON arm.qualifier = src.qualifier
WHERE src.n IS DISTINCT FROM arm.n
