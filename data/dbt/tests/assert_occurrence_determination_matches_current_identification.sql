-- Singular dbt test: the occurrence-record determination and the specimen's
-- current identification row should assert the same taxon (beeatlas-fc4 review;
-- the "6+6 rows disagree between the two tables" finding from beeatlas-0o1).
--
-- KNOWN TO FIRE: 12 rows as of 2026-08-12 — 5 where both sides carry a real
-- name and they differ (e.g. 'Diadasia nitidifrons' vs 'Diadasia'), 6 where the
-- occurrence publishes a name but the current row is the 'undetermined'
-- placeholder, 1 where the occurrence is blank but the current row is named
-- ('Bombus mixtus'). Reconciliation artifacts: the occurrence record is the
-- determination of record (docs/domain-model.md), so these publish from the
-- occurrence side; they surface here as curation fodder for the anomalies
-- report (beeatlas-amp). Severity: warn.
--
-- Compared at CANONICAL level (both tables carry load-materialized
-- canonical_name) so authority-formatting or subgenus-spelling variants of the
-- same taxon never fire — only real taxon disagreement or named-vs-placeholder
-- mismatches do. Rows where NEITHER side has a real name (blank vs
-- 'undetermined') are no-determination agreement, not discrepancy.
--
-- Reads the SOURCE tables (not staging): the occurrences staging view drops
-- NULL-lat rows and this census must cover the full table, matching
-- assert_specimens_have_current_identification.

{{ config(severity='warn') }}

SELECT
    o.id                 AS coreid,
    o.scientific_name    AS occurrence_name,
    i.scientific_name    AS current_identification_name,
    o.identified_by      AS occurrence_identified_by,
    i.identified_by      AS identification_identified_by
FROM {{ source('ecdysis_data', 'occurrences') }} o
JOIN {{ source('ecdysis_data', 'identifications') }} i
    ON i.coreid = o.id
   AND i.identification_is_current = '1'
WHERE o.canonical_name IS DISTINCT FROM i.canonical_name
  AND (
        (o.canonical_name IS NOT NULL AND o.canonical_name != 'undetermined')
     OR (i.canonical_name IS NOT NULL AND i.canonical_name != 'undetermined')
      )
