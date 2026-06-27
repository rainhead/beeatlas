-- Singular dbt test: assert the ARM-1 id_date parse never silently drops a real date.
--
-- PASS semantics: this query returns 0 rows. A row means an ecdysis occurrence whose RAW
-- date_identified matches one of the two keep-shapes (four-digit year, or full ISO date)
-- nonetheless landed with a NULL id_date in the mart — i.e. the parse regressed and a
-- genuine identification date was silently dropped (D-13, TEMP-01 criterion 3).
--
-- Severity: warn (matches Phase 167 D-06) — nightly-non-blocking. Hard-error is defensible
-- (by construction this should never fire), but warn is the conservative choice consistent
-- with the predecessor.
--
-- Shared-regex tautology: this test uses the EXACT SAME two regexes as the ARM-1 parse in
-- int_combined.sql (^[0-9]{4}$ and ^[0-9]{4}-[0-9]{2}-[0-9]{2}$). Because the keep-set here
-- is byte-identical to the keep-set there, a value that passes one passes the other — so on
-- existing good data this query returns 0 rows by construction. It can only fire on a real
-- parse regression (e.g. someone weakens or removes the ARM-1 regexes), never on the current
-- distribution. There is deliberately NO year-month (two-segment) pattern: none appears in the
-- live distribution, and adding one here without adding it to the parse would fire spuriously.
--
-- Join-key rationale (mirrors test_ecdysis_id_references_source.sql): the mart's INTEGER
-- ecdysis_id and the staging VARCHAR id are the same logical key in different namespaces
-- (the source is CSV-typed). CAST(m.ecdysis_id AS VARCHAR) bridges them. We read raw id +
-- date_identified from stg_ecdysis__occurrences (SELECT * passthrough), not the source ref,
-- so both columns are available without re-resolving the freeform source.

{{ config(severity='warn') }}

SELECT
    src.id AS ecdysis_id,
    src.date_identified
FROM {{ ref('stg_ecdysis__occurrences') }} src
JOIN {{ ref('occurrences') }} m ON CAST(m.ecdysis_id AS VARCHAR) = src.id
WHERE m.record_type = 'specimen'
  AND (
        regexp_full_match(trim(src.date_identified), '^[0-9]{4}$')
     OR regexp_full_match(trim(src.date_identified), '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
      )
  AND m.id_date IS NULL
