-- UNION ALL of ARM 1 (ecdysis FOJ samples + LEFT JOIN specimen_obs) and
-- ARM 2 (provisional WABA via ofv1718). Materialized as TABLE (not view) per
-- RESEARCH Pitfall 5: prevents re-evaluating the full UNION ALL on every spatial
-- join in the occurrences mart.
-- Mirrors export.py:135-197 (combined CTE).
{{ config(materialized='table') }}

-- ARM 1: Ecdysis rows (FULL OUTER JOIN preserved) with WABA specimen fields LEFT JOINed
SELECT
    e.ecdysis_id,
    e.catalog_number,
    COALESCE(e.ecdysis_lon, s.sample_lon)          AS lon,
    COALESCE(e.ecdysis_lat, s.sample_lat)          AS lat,
    COALESCE(e.ecdysis_date, s.sample_date)        AS date,
    COALESCE(e.year, YEAR(s.sample_date_raw))      AS year,
    COALESCE(e.month, MONTH(s.sample_date_raw))    AS month,
    e.scientificName,
    e.recordedBy,
    e.fieldNumber,
    e.genus,
    e.family,
    e.floralHost,
    e.host_observation_id,
    e.inat_host,
    e.inat_quality_grade,
    e.modified,
    e.specimen_observation_id,
    e.elevation_m,
    s.observation_id,
    s.host_inat_login,
    s.specimen_count,
    s.sample_id,
    s.sample_host,
    sob.specimen_inat_login,
    sob.specimen_inat_taxon_name,
    sob.specimen_inat_genus,
    sob.specimen_inat_family,
    sob.quality_grade                              AS specimen_inat_quality_grade,
    FALSE                                          AS is_provisional,
    e.canonical_name,
    NULL                                           AS image_url,
    NULL                                           AS obs_url,
    NULL                                           AS user_login,
    NULL                                           AS license,
    'ecdysis'                                      AS source
FROM {{ ref('int_ecdysis_base') }} e
FULL OUTER JOIN {{ ref('int_samples_base') }} s ON e.host_observation_id = s.observation_id
LEFT JOIN {{ ref('int_specimen_obs_base') }} sob ON sob.waba_obs_id = e.specimen_observation_id

UNION ALL

-- ARM 2: Provisional WABA rows (unmatched WABA obs with no Ecdysis catalog match)
SELECT
    NULL                                                                        AS ecdysis_id,
    NULL                                                                        AS catalog_number,
    sob.longitude                                                               AS lon,
    sob.latitude                                                                AS lat,
    CAST(sob.observed_on AS VARCHAR)                                            AS date,
    YEAR(sob.observed_on)                                                       AS year,
    MONTH(sob.observed_on)                                                      AS month,
    NULL                                                                        AS scientificName,
    NULL                                                                        AS recordedBy,
    NULL                                                                        AS fieldNumber,
    sob.specimen_inat_genus                                                     AS genus,
    sob.specimen_inat_family                                                    AS family,
    NULL                                                                        AS floralHost,
    CAST(regexp_extract(ofv1718.value, '([0-9]+)$', 1) AS BIGINT)              AS host_observation_id,
    NULL                                                                        AS inat_host,
    sob.quality_grade                                                           AS inat_quality_grade,
    NULL                                                                        AS modified,
    sob.waba_obs_id                                                             AS specimen_observation_id,
    NULL                                                                        AS elevation_m,
    s.observation_id,
    s.host_inat_login,
    s.specimen_count,
    s.sample_id,
    s.sample_host,
    sob.specimen_inat_login,
    sob.specimen_inat_taxon_name,
    sob.specimen_inat_genus,
    sob.specimen_inat_family,
    sob.quality_grade                                                           AS specimen_inat_quality_grade,
    TRUE                                                                        AS is_provisional,
    NULL                                                                        AS canonical_name,
    NULL                                                                        AS image_url,
    NULL                                                                        AS obs_url,
    NULL                                                                        AS user_login,
    NULL                                                                        AS license,
    'waba_sample'                                                               AS source
FROM {{ ref('int_provisional_waba_ids') }} p
JOIN {{ ref('int_specimen_obs_base') }} sob ON sob.waba_obs_id = p.waba_obs_id
LEFT JOIN {{ ref('stg_waba__ofvs') }} ofv1718
    ON ofv1718._dlt_root_id = sob.waba_dlt_id AND ofv1718.field_id = {{ inat_ofv_host_obs_url() }}
LEFT JOIN {{ ref('int_samples_base') }} s
    ON s.observation_id = CAST(regexp_extract(ofv1718.value, '([0-9]+)$', 1) AS BIGINT)
WHERE sob.longitude IS NOT NULL AND sob.latitude IS NOT NULL

UNION ALL

-- ARM 3: iNat expert observations (Phase 118 / OCC-01)
SELECT
    NULL                               AS ecdysis_id,
    NULL                               AS catalog_number,
    io.lon,
    io.lat,
    CAST(io.observed_on AS VARCHAR)    AS date,
    YEAR(io.observed_on)               AS year,
    MONTH(io.observed_on)              AS month,
    io.scientific_name                 AS scientificName,
    NULL                               AS recordedBy,
    NULL                               AS fieldNumber,
    NULL                               AS genus,
    NULL                               AS family,
    io.floral_host                     AS floralHost,
    NULL::BIGINT                       AS host_observation_id,
    NULL                               AS inat_host,
    io.quality_grade                   AS inat_quality_grade,
    NULL                               AS modified,
    io.obs_id                          AS specimen_observation_id,
    NULL::INTEGER                      AS elevation_m,
    NULL::BIGINT                       AS observation_id,
    NULL                               AS host_inat_login,
    NULL::INTEGER                      AS specimen_count,
    NULL::INTEGER                      AS sample_id,
    NULL                               AS sample_host,
    NULL                               AS specimen_inat_login,
    NULL                               AS specimen_inat_taxon_name,
    NULL                               AS specimen_inat_genus,
    NULL                               AS specimen_inat_family,
    NULL                               AS specimen_inat_quality_grade,
    FALSE                              AS is_provisional,
    io.canonical_name,
    io.image_url,
    io.obs_url,
    io.user_login,
    io.license,
    'inat_obs'                         AS source
FROM {{ source('inat_obs_data', 'observations') }} io
WHERE io.lat IS NOT NULL AND io.lon IS NOT NULL
