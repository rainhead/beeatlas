-- DISTINCT catalog suffix BIGINTs from ecdysis occurrences.
-- Mirrors export.py:120-124 (ecdysis_catalog_suffixes CTE).
-- Note: the lat-NULL filter from export.py line 123 is already applied by
-- stg_ecdysis__occurrences (WHERE decimal_latitude IS NOT NULL AND decimal_latitude != ''),
-- so it is not repeated here — this is a simplification, not a deviation.
SELECT DISTINCT
    CAST(regexp_extract(catalog_number, '[0-9]+$', 0) AS BIGINT) AS catalog_suffix
FROM {{ ref('stg_ecdysis__occurrences') }}
