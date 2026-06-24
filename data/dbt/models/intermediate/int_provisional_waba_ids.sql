-- D-03/D-11: provisional = WABA plant-images/sample-IDs project (166376) members
-- lacking a specimen-count OFV; these are floral-host / sample observations,
-- never bee specimen observations. By definition they never join other sources.
-- Source: inaturalist_data.observations__observation_projects (project_id=166376)
-- Anti-join: exclude any obs already in int_samples_base (those have specimen_count
-- OFVs and are already in ARM 1 via the FULL OUTER JOIN with int_ecdysis_base).
-- Coordinate filter: must be mappable (longitude/latitude NOT NULL).
SELECT obs.id AS observation_id
FROM {{ ref('stg_inat__observations') }} obs
JOIN {{ source('inaturalist_data', 'observations__observation_projects') }} op
    ON op.observation_uuid = obs.uuid
    AND op.project_id = 166376
WHERE obs.id NOT IN (SELECT observation_id FROM {{ ref('int_samples_base') }})
  AND obs.longitude IS NOT NULL
  AND obs.latitude IS NOT NULL
