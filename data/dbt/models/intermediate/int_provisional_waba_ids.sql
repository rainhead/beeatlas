-- waba_obs_ids with NO catalog match (provisional WABA arm).
-- Mirrors export.py:130-134 (provisional_waba_ids CTE).
SELECT id AS waba_obs_id
FROM {{ ref('stg_waba__observations') }}
WHERE id NOT IN (SELECT waba_obs_id FROM {{ ref('int_matched_waba_ids') }})
