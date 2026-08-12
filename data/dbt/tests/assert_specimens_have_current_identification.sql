-- Singular dbt test: every Ecdysis specimen publishing with a real name should
-- have a current row in the identifications table (beeatlas-fc4 acceptance;
-- anomaly class from beeatlas-0o1).
--
-- KNOWN TO FIRE: 532 specimens as of 2026-08-11 carry a name on the occurrence
-- record with ZERO current identification rows — reconciliation artifacts. The
-- occurrence record is the determination of record (docs/domain-model.md), so
-- these publish correctly; they are surfaced here as curation fodder for the
-- anomalies report (beeatlas-amp), not build failures. Severity: warn.
--
-- Reads the SOURCE occurrences table, not stg_ecdysis__occurrences: the staging
-- view drops NULL-lat rows, and this census must match the beeatlas-0o1 numbers
-- (532) computed over the full table.

{{ config(severity='warn') }}

SELECT
    o.id AS coreid,
    o.scientific_name,
    o.identified_by
FROM {{ source('ecdysis_data', 'occurrences') }} o
WHERE o.scientific_name IS NOT NULL
  AND TRIM(o.scientific_name) != ''
  AND LOWER(o.scientific_name) != 'undetermined'
  AND NOT EXISTS (
      SELECT 1
      FROM {{ ref('stg_ecdysis__identifications') }} i
      WHERE i.coreid = o.id
        AND i.identification_is_current
  )
