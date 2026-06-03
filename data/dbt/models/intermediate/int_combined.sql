-- UNION ALL of ARM 1 (ecdysis FOJ samples + LEFT JOIN specimen_obs),
-- ARM 2 (provisional WABA via ofv1718), and ARM 3 (iNat expert observations).
-- Materialized as TABLE (not view) per RESEARCH Pitfall 5: prevents re-evaluating
-- the full UNION ALL on every spatial join in the occurrences mart.
-- Mirrors export.py:135-197 (combined CTE).
-- Phase 123 (SYN-02): synonymy applied via LEFT JOIN on ref('int_synonyms')
-- for ARM 1 (ecdysis) and ARM 3 (inat_obs); ARM 2 (provisional WABA) has
-- NULL canonical_name (no scientific name) and is not joined.
-- Phase 127 (ITR-03): repointed to int_synonyms so auto-generated remappings
-- flow through the same synonym JOIN path as curated entries.
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
    e.recordedBy,
    e.fieldNumber,
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
    sob.quality_grade                              AS specimen_inat_quality_grade,
    FALSE                                          AS is_provisional,
    COALESCE(syn_e.accepted_name, e.canonical_name) AS canonical_name,
    COALESCE(ctt.taxon_id, g_e.taxon_id)::INTEGER  AS taxon_id,
    NULL                                           AS image_url,
    NULL                                           AS obs_url,
    NULL                                           AS user_login,
    NULL                                           AS license,
    'ecdysis'                                      AS source
FROM {{ ref('int_ecdysis_base') }} e
FULL OUTER JOIN {{ ref('int_samples_base') }} s ON e.host_observation_id = s.observation_id
LEFT JOIN {{ ref('int_specimen_obs_base') }} sob ON sob.waba_obs_id = e.specimen_observation_id
LEFT JOIN {{ ref('int_synonyms') }} syn_e ON syn_e.synonym = e.canonical_name
LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt
    ON ctt.canonical_name = COALESCE(syn_e.accepted_name, e.canonical_name)
-- Phase 128 (TID-02): genus self-row backfill — fires only when the species bridge missed
-- (ctt.taxon_id IS NULL) AND the post-synonymy name is single-token (a genus, no space).
LEFT JOIN {{ ref('stg_inat__genus_taxon_ids') }} g_e
    ON ctt.taxon_id IS NULL
   AND position(' ' IN COALESCE(syn_e.accepted_name, e.canonical_name)) = 0
   AND g_e.genus_name = lower(COALESCE(syn_e.accepted_name, e.canonical_name))

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
    NULL                                                                        AS recordedBy,
    NULL                                                                        AS fieldNumber,
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
    sob.quality_grade                                                           AS specimen_inat_quality_grade,
    TRUE                                                                        AS is_provisional,
    lower(trim(
        CASE WHEN position(' ' IN trim(sob.specimen_inat_taxon_name)) > 0
             THEN split_part(trim(sob.specimen_inat_taxon_name), ' ', 1)
                  || ' ' || split_part(trim(sob.specimen_inat_taxon_name), ' ', 2)
             ELSE trim(sob.specimen_inat_taxon_name)
        END
    ))::VARCHAR                                                                 AS canonical_name,
    COALESCE(ctt_w.taxon_id, g_w.taxon_id)::INTEGER                             AS taxon_id,
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
LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt_w
    ON ctt_w.canonical_name = lower(trim(
        CASE WHEN position(' ' IN trim(sob.specimen_inat_taxon_name)) > 0
             THEN split_part(trim(sob.specimen_inat_taxon_name), ' ', 1)
                  || ' ' || split_part(trim(sob.specimen_inat_taxon_name), ' ', 2)
             ELSE trim(sob.specimen_inat_taxon_name)
        END
    ))
-- Phase 128 (TID-02): genus self-row backfill for ARM 2. The join key reuses the exact inline
-- lower(trim(CASE ...)) expression already present above (already single/double-token aware);
-- fires only when the species bridge missed and that key is single-token.
LEFT JOIN {{ ref('stg_inat__genus_taxon_ids') }} g_w
    ON ctt_w.taxon_id IS NULL
   AND position(' ' IN lower(trim(
        CASE WHEN position(' ' IN trim(sob.specimen_inat_taxon_name)) > 0
             THEN split_part(trim(sob.specimen_inat_taxon_name), ' ', 1)
                  || ' ' || split_part(trim(sob.specimen_inat_taxon_name), ' ', 2)
             ELSE trim(sob.specimen_inat_taxon_name)
        END
    ))) = 0
   AND g_w.genus_name = lower(trim(
        CASE WHEN position(' ' IN trim(sob.specimen_inat_taxon_name)) > 0
             THEN split_part(trim(sob.specimen_inat_taxon_name), ' ', 1)
                  || ' ' || split_part(trim(sob.specimen_inat_taxon_name), ' ', 2)
             ELSE trim(sob.specimen_inat_taxon_name)
        END
    ))
WHERE sob.longitude IS NOT NULL AND sob.latitude IS NOT NULL
  AND lower(trim(
        CASE WHEN position(' ' IN trim(sob.specimen_inat_taxon_name)) > 0
             THEN split_part(trim(sob.specimen_inat_taxon_name), ' ', 1)
                  || ' ' || split_part(trim(sob.specimen_inat_taxon_name), ' ', 2)
             ELSE trim(sob.specimen_inat_taxon_name)
        END
      )) NOT IN ('cicindela pugetana', 'cleridae', 'encopognathus')

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
    NULL                               AS recordedBy,
    NULL                               AS fieldNumber,
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
    NULL                               AS specimen_inat_quality_grade,
    FALSE                              AS is_provisional,
    COALESCE(syn_io.accepted_name, io.canonical_name) AS canonical_name,
    COALESCE(ctt_io.taxon_id, g_io.taxon_id)::INTEGER AS taxon_id,
    io.image_url,
    io.obs_url,
    io.user_login,
    io.license,
    'inat_obs'                         AS source
FROM {{ source('inat_obs_data', 'observations') }} io
LEFT JOIN {{ ref('int_synonyms') }} syn_io ON syn_io.synonym = io.canonical_name
LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt_io
    ON ctt_io.canonical_name = COALESCE(syn_io.accepted_name, io.canonical_name)
-- Phase 128 (TID-02): genus self-row backfill for ARM 3 — same guards as ARM 1, keyed on the
-- post-synonymy single-token canonical_name.
LEFT JOIN {{ ref('stg_inat__genus_taxon_ids') }} g_io
    ON ctt_io.taxon_id IS NULL
   AND position(' ' IN COALESCE(syn_io.accepted_name, io.canonical_name)) = 0
   AND g_io.genus_name = lower(COALESCE(syn_io.accepted_name, io.canonical_name))
WHERE io.lat IS NOT NULL AND io.lon IS NOT NULL
