-- Wraps source('ecdysis_data', 'occurrences') with the lat-NULL filter from
-- export.py line 84. This filter is load-bearing: without it, NULL-lat rows
-- would flow into the downstream spatial join in the occurrences mart and break
-- ST_Within / ST_Distance calls that require non-null coordinate inputs.
-- Column rename/casting happens in int_ecdysis_base (Plan 03) — this layer
-- passes all columns through unchanged.
{{ config(materialized='view') }}

SELECT *
FROM {{ source('ecdysis_data', 'occurrences') }}
WHERE decimal_latitude IS NOT NULL AND decimal_latitude != ''
