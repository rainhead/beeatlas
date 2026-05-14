-- Singular dbt test: every int_ecdysis_base.ecdysis_id must exist in stg_ecdysis__occurrences.
--
-- PASS semantics: this query returns 0 rows (no orphaned ecdysis_id values).
--
-- What this replaces:
--   The generic `relationships` test in data/dbt/models/intermediate/schema.yml that
--   ERRORed with "Conversion Error: Could not convert string 'WSDA_2303966' to INT32".
--   That test compared ecdysis_id (INTEGER, e.g. 5594060) to the wrong column in a
--   different identifier namespace — a cross-namespace mismatch that always failed at
--   the type-conversion layer before any data was inspected.
--
-- Why the original generic test was semantically wrong:
--   - int_ecdysis_base.ecdysis_id is INTEGER (e.g. 5594060), derived from CAST(o.id AS INTEGER).
--   - The `relationships` test joined to a VARCHAR column from a completely different
--     identifier authority (e.g. 'WSDA_2303966'). These are different namespaces.
--   - That comparison is meaningless; the NOT IN result would be ALL rows, always.
--
-- Why this test is correct (join via stg_ecdysis__occurrences.id):
--   - stg_ecdysis__occurrences.id is VARCHAR (e.g. '5594060') — the same logical key as
--     ecdysis_id, just string-typed because the source is a CSV.
--   - CAST(ib.ecdysis_id AS VARCHAR) produces '5594060', which IS in the id set.
--   - VERIFIED: this query returns 0 rows against live data (beeatlas.duckdb).
--
-- See RESEARCH.md §TEST-02 "Correct Singular Test" for the verified-correct join key
-- and Pitfall 1 for the explanation of why the wrong column was incorrect.

SELECT ib.ecdysis_id
FROM {{ ref('int_ecdysis_base') }} ib
WHERE ib.ecdysis_id IS NOT NULL
  AND CAST(ib.ecdysis_id AS VARCHAR) NOT IN (
    SELECT id FROM {{ ref('stg_ecdysis__occurrences') }}
  )
