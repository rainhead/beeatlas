-- catalog_suffix -> MIN(waba.id) via waba ofvs field_id=18116.
-- Mirrors export.py:46-55 (waba_link CTE).
SELECT
    CAST(ofv.value AS BIGINT) AS catalog_suffix,
    MIN(waba.id) AS specimen_observation_id
FROM {{ ref('stg_waba__observations') }} waba
JOIN {{ ref('stg_waba__ofvs') }} ofv
    ON ofv._dlt_root_id = waba._dlt_id
    AND ofv.field_id = 18116
    AND ofv.value != ''
GROUP BY catalog_suffix
