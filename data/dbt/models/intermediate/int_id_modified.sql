-- MAX(modified) per coreid from stg_ecdysis__identifications.
-- Mirrors export.py:41-44 (id_modified CTE).
SELECT
    coreid,
    MAX(modified) AS max_id_modified
FROM {{ ref('stg_ecdysis__identifications') }}
GROUP BY coreid
