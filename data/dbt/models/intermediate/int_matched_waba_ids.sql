-- waba_obs_ids matched via catalog_suffix <-> ecdysis_catalog_suffixes.
-- Mirrors export.py:125-129 (matched_waba_ids CTE).
SELECT wl.specimen_observation_id AS waba_obs_id
FROM {{ ref('int_waba_link') }} wl
JOIN {{ ref('int_ecdysis_catalog_suffixes') }} ecs
    ON ecs.catalog_suffix = wl.catalog_suffix
