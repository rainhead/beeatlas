-- waba_obs_ids matched via catalog_suffix <-> ecdysis_catalog_suffixes.
-- Mirrors export.py:125-129 (matched_waba_ids CTE).
-- D-05: int_waba_link is now 1:N (multiple obs per catalog_suffix), so this
-- model returns the full SET of waba_obs_ids that match any Ecdysis catalog suffix.
-- SELECT DISTINCT is defensive: collapses any (suffix, obs_id) duplicates so
-- the result is a clean filter set for int_provisional_waba_ids's NOT IN clause.
SELECT DISTINCT wl.specimen_observation_id AS waba_obs_id
FROM {{ ref('int_waba_link') }} wl
JOIN {{ ref('int_ecdysis_catalog_suffixes') }} ecs
    ON ecs.catalog_suffix = wl.catalog_suffix
