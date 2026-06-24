-- catalog_suffix -> all WABA obs ids (1:N; D-05 fix).
-- Mirrors export.py:46-55 (waba_link CTE), but WITHOUT MIN() GROUP BY:
-- the original MIN(waba.id) GROUP BY catalog_suffix caused obs 320276469 to be
-- shadowed by obs 320276018 (both share catalog suffix 25000848); 320276469
-- fell into the provisional arm and collided with its own ARM 3 row.
-- Now returns ALL WABA obs per catalog_suffix so every obs with a matching
-- Ecdysis suffix is recognized as matched (D-05).
-- CONSUMERS: int_matched_waba_ids uses this as a filter set (NOT IN — no fan-out).
-- int_ecdysis_base also joins here for specimen_observation_id — that consumer
-- MUST de-duplicate the link to stay 1:1 per ecdysis row (see comment there).
SELECT
    CAST(ofv.value AS BIGINT) AS catalog_suffix,
    waba.id AS specimen_observation_id
FROM {{ ref('stg_waba__observations') }} waba
JOIN {{ ref('stg_waba__ofvs') }} ofv
    ON ofv._dlt_root_id = waba._dlt_id
    AND ofv.field_id = {{ inat_ofv_catalog_suffix() }}
    AND ofv.value != ''
