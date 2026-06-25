-- UNION ALL of five source arms:
--   ARM 1  source='ecdysis'       — catalogued Ecdysis specimens (± iNat sample FULL OUTER JOIN)
--   ARM 2  source='waba_sample'   — WABA plant-images/sample-IDs project (166376) members
--                                   lacking specimen_count OFV (is_provisional=TRUE, occ_id=inat:N)
--   ARM 3  source='waba_specimen' — WABA iNat-photo bee specimens not yet in Ecdysis (~33;
--                                   is_provisional=FALSE, occ_id=inat_obs:N, carries bee species)
--   ARM 4  source='inat_obs'      — expert iNat observations (research-grade; occ_id=inat_obs:N)
--   ARM 5  source='checklist'     — museum/collection checklist records
-- Materialized as TABLE (not view) per RESEARCH Pitfall 5: prevents re-evaluating
-- the full UNION ALL on every spatial join in the occurrences mart.
-- Mirrors export.py:135-197 (combined CTE).
-- Phase 123 (SYN-02): synonymy applied via LEFT JOIN on ref('int_synonyms')
-- for ARM 1 (ecdysis) and ARM 4 (inat_obs); ARM 2 (waba_sample) has
-- NULL canonical_name (plant obs, no bee species — D-08) and is not joined.
-- Phase 127 (ITR-03): repointed to int_synonyms so auto-generated remappings
-- flow through the same synonym JOIN path as curated entries.
-- Phase 165 (D-03/D-05/D-10): ARM 2 redefined on project membership (not unmatched WABA obs);
-- ARM 3 (waba_specimen) NEW — the 33 bee specimens awaiting Ecdysis upload.
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
    'ecdysis'                                      AS source,
    NULL::INTEGER                                  AS checklist_id,
    NULL::VARCHAR                                  AS verbatim_name,
    NULL::VARCHAR                                  AS locality,
    NULL::INTEGER                                  AS collapsed_count,
    COALESCE(specimen_inat_login, host_inat_login, user_login) AS collector_inat_login,
    -- D-06/D-07: id_date = the "Identified" timeline anchor, parsed from the dirty raw
    -- ecdysis date_identified. Keep year-only ('2025') and full ('YYYY-MM-DD') verbatim;
    -- blank '', 's.d.', and garbage ('female') fall to ELSE NULL. The two regexes are
    -- byte-identical to assert_id_date_parse_complete.sql (the tautology guarantee).
    CASE
        WHEN regexp_full_match(trim(e.date_identified), '^[0-9]{4}$')
          OR regexp_full_match(trim(e.date_identified), '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
        THEN trim(e.date_identified)
        ELSE NULL
    END::VARCHAR                                    AS id_date
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

-- ARM 2 (category 3 / D-03/D-11): WABA plant-images/sample-IDs project (166376) members
-- that lack a specimen_count OFV (anti-joined out of int_samples_base). These are
-- floral-host / sample observations — is_provisional=TRUE, occ_id=inat:N (via observation_id).
-- Per D-11: NO specimens here — specimen_observation_id is always NULL.
-- canonical_name/taxon_id NULL: plant obs carry no bee species (D-08 safe path per RESEARCH Pitfall 2).
-- host_inat_login from the plant obs user__login; all specimen fields NULL.
SELECT
    NULL                                                                        AS ecdysis_id,
    NULL                                                                        AS catalog_number,
    obs.longitude                                                               AS lon,
    obs.latitude                                                                AS lat,
    CAST(obs.observed_on AS VARCHAR)                                            AS date,
    YEAR(obs.observed_on)                                                       AS year,
    MONTH(obs.observed_on)                                                      AS month,
    NULL                                                                        AS recordedBy,
    NULL                                                                        AS fieldNumber,
    NULL                                                                        AS floralHost,
    NULL::BIGINT                                                                AS host_observation_id,
    NULL                                                                        AS inat_host,
    NULL                                                                        AS inat_quality_grade,
    NULL                                                                        AS modified,
    NULL::BIGINT                                                                AS specimen_observation_id,
    NULL::INTEGER                                                               AS elevation_m,
    obs.id                                                                      AS observation_id,
    obs.user__login                                                             AS host_inat_login,
    NULL::INTEGER                                                               AS specimen_count,
    NULL::INTEGER                                                               AS sample_id,
    NULL::VARCHAR                                                               AS sample_host,
    NULL                                                                        AS specimen_inat_login,
    NULL                                                                        AS specimen_inat_taxon_name,
    NULL                                                                        AS specimen_inat_quality_grade,
    TRUE                                                                        AS is_provisional,
    NULL::VARCHAR                                                               AS canonical_name,
    NULL::INTEGER                                                               AS taxon_id,
    NULL                                                                        AS image_url,
    NULL                                                                        AS obs_url,
    NULL                                                                        AS user_login,
    NULL                                                                        AS license,
    'waba_sample'                                                               AS source,
    NULL::INTEGER                                                               AS checklist_id,
    NULL::VARCHAR                                                               AS verbatim_name,
    NULL::VARCHAR                                                               AS locality,
    NULL::INTEGER                                                               AS collapsed_count,
    COALESCE(specimen_inat_login, host_inat_login, user_login)                 AS collector_inat_login,
    NULL::VARCHAR                                                               AS id_date  -- D-09: non-specimen arm, no identification date
FROM {{ ref('int_provisional_waba_ids') }} p
JOIN {{ ref('stg_inat__observations') }} obs ON obs.id = p.observation_id

UNION ALL

-- ARM 3 (category 2 / D-10/D-12): WABA iNat-photo bee specimens not yet in Ecdysis (~33).
-- source='waba_specimen', is_provisional=FALSE. occ_id=inat_obs:N (observation_id=NULL,
-- host_observation_id=NULL → falls to specimen_observation_id=sob.waba_obs_id).
-- Carries bee canonical_name/taxon_id (same derivation as old ARM 2 — these are specimens).
-- obs_url surfaces the iNat observation link (D-10 "ideally surface obs_url").
-- Verified: no inat_obs (ARM 4) overlap except 320276469, which the MIN fix moved to ecdysis:
-- so category 2 collides with nothing after D-05.
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
    NULL::BIGINT                                                                AS host_observation_id,
    NULL                                                                        AS inat_host,
    sob.quality_grade                                                           AS inat_quality_grade,
    NULL                                                                        AS modified,
    sob.waba_obs_id                                                             AS specimen_observation_id,
    NULL::INTEGER                                                               AS elevation_m,
    NULL::BIGINT                                                                AS observation_id,
    NULL                                                                        AS host_inat_login,
    NULL::INTEGER                                                               AS specimen_count,
    NULL::INTEGER                                                               AS sample_id,
    NULL::VARCHAR                                                               AS sample_host,
    sob.specimen_inat_login,
    sob.specimen_inat_taxon_name,
    sob.quality_grade                                                           AS specimen_inat_quality_grade,
    FALSE                                                                       AS is_provisional,
    lower(trim(
        CASE WHEN position(' ' IN trim(sob.specimen_inat_taxon_name)) > 0
             THEN split_part(trim(sob.specimen_inat_taxon_name), ' ', 1)
                  || ' ' || split_part(trim(sob.specimen_inat_taxon_name), ' ', 2)
             ELSE trim(sob.specimen_inat_taxon_name)
        END
    ))::VARCHAR                                                                 AS canonical_name,
    COALESCE(ctt_ws.taxon_id, g_ws.taxon_id)::INTEGER                          AS taxon_id,
    NULL                                                                        AS image_url,
    'https://www.inaturalist.org/observations/' || sob.waba_obs_id             AS obs_url,
    NULL                                                                        AS user_login,
    NULL                                                                        AS license,
    'waba_specimen'                                                             AS source,
    NULL::INTEGER                                                               AS checklist_id,
    NULL::VARCHAR                                                               AS verbatim_name,
    NULL::VARCHAR                                                               AS locality,
    NULL::INTEGER                                                               AS collapsed_count,
    COALESCE(specimen_inat_login, host_inat_login, user_login)                 AS collector_inat_login,
    NULL::VARCHAR                                                               AS id_date  -- D-08: identification = formal Ecdysis determination only; not-yet-catalogued specimen has none
FROM {{ ref('int_specimen_obs_base') }} sob
LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt_ws
    ON ctt_ws.canonical_name = lower(trim(
        CASE WHEN position(' ' IN trim(sob.specimen_inat_taxon_name)) > 0
             THEN split_part(trim(sob.specimen_inat_taxon_name), ' ', 1)
                  || ' ' || split_part(trim(sob.specimen_inat_taxon_name), ' ', 2)
             ELSE trim(sob.specimen_inat_taxon_name)
        END
    ))
-- Phase 128 (TID-02): genus self-row backfill for waba_specimen — same pattern as other arms.
LEFT JOIN {{ ref('stg_inat__genus_taxon_ids') }} g_ws
    ON ctt_ws.taxon_id IS NULL
   AND position(' ' IN lower(trim(
        CASE WHEN position(' ' IN trim(sob.specimen_inat_taxon_name)) > 0
             THEN split_part(trim(sob.specimen_inat_taxon_name), ' ', 1)
                  || ' ' || split_part(trim(sob.specimen_inat_taxon_name), ' ', 2)
             ELSE trim(sob.specimen_inat_taxon_name)
        END
    ))) = 0
   AND g_ws.genus_name = lower(trim(
        CASE WHEN position(' ' IN trim(sob.specimen_inat_taxon_name)) > 0
             THEN split_part(trim(sob.specimen_inat_taxon_name), ' ', 1)
                  || ' ' || split_part(trim(sob.specimen_inat_taxon_name), ' ', 2)
             ELSE trim(sob.specimen_inat_taxon_name)
        END
    ))
WHERE sob.longitude IS NOT NULL AND sob.latitude IS NOT NULL
  AND sob.waba_obs_id NOT IN (SELECT waba_obs_id FROM {{ ref('int_matched_waba_ids') }})
  -- CR-01: exclude obs that also appear in the expert iNat feed (ARM 4 wins; inat_obs wins).
  -- obs_id is the non-null PK of inat_obs_data.observations so NOT IN is NULL-safe.
  AND sob.waba_obs_id NOT IN (SELECT obs_id FROM {{ source('inat_obs_data', 'observations') }})
  AND lower(trim(
        CASE WHEN position(' ' IN trim(sob.specimen_inat_taxon_name)) > 0
             THEN split_part(trim(sob.specimen_inat_taxon_name), ' ', 1)
                  || ' ' || split_part(trim(sob.specimen_inat_taxon_name), ' ', 2)
             ELSE trim(sob.specimen_inat_taxon_name)
        END
      )) NOT IN ('cicindela pugetana', 'cleridae', 'encopognathus')

UNION ALL

-- ARM 4: iNat expert observations (Phase 118 / OCC-01)
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
    'inat_obs'                         AS source,
    NULL::INTEGER                      AS checklist_id,
    NULL::VARCHAR                      AS verbatim_name,
    NULL::VARCHAR                      AS locality,
    NULL::INTEGER                      AS collapsed_count,
    COALESCE(specimen_inat_login, host_inat_login, user_login) AS collector_inat_login,
    NULL::VARCHAR                      AS id_date  -- D-09: expert iNat obs, not volunteer work; no identification date
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

UNION ALL

-- ARM 5: Checklist records (Phase 137 / PRO-01)
-- Source: int_checklist_dedup_status (= int_checklist_collapsed.* + dedup_status)
-- Filter: dedup_status IS DISTINCT FROM 'confirmed' per int_checklist_dedup_status header
-- Belt-and-suspenders: lat/lon NOT NULL (already filtered upstream by coord_flag='valid')
SELECT
    NULL::INTEGER                          AS ecdysis_id,
    NULL::VARCHAR                          AS catalog_number,
    cl.lon,
    cl.lat,
    CAST(
        CASE cl.date_quality
            WHEN 'full'      THEN printf('%04d-%02d-%02d', cl.year, cl.month, cl.day)
            WHEN 'year_only' THEN printf('%04d', cl.year)
            ELSE NULL
        END
    AS VARCHAR)                            AS date,
    cl.year,
    cl.month,
    cl.recordedBy,
    NULL::VARCHAR                          AS fieldNumber,
    NULL::VARCHAR                          AS floralHost,
    NULL::BIGINT                           AS host_observation_id,
    NULL::VARCHAR                          AS inat_host,
    NULL::VARCHAR                          AS inat_quality_grade,
    NULL::VARCHAR                          AS modified,
    NULL::BIGINT                           AS specimen_observation_id,
    NULL::INTEGER                          AS elevation_m,
    NULL::BIGINT                           AS observation_id,
    NULL::VARCHAR                          AS host_inat_login,
    NULL::INTEGER                          AS specimen_count,
    NULL::INTEGER                          AS sample_id,
    NULL::VARCHAR                          AS sample_host,
    NULL::VARCHAR                          AS specimen_inat_login,
    NULL::VARCHAR                          AS specimen_inat_taxon_name,
    NULL::VARCHAR                          AS specimen_inat_quality_grade,
    FALSE::BOOLEAN                         AS is_provisional,
    cl.canonical_name,
    cl.taxon_id::INTEGER                   AS taxon_id,
    NULL::VARCHAR                          AS image_url,
    NULL::VARCHAR                          AS obs_url,
    NULL::VARCHAR                          AS user_login,
    NULL::VARCHAR                          AS license,
    'checklist'::VARCHAR                   AS source,
    cl.ObjectID::INTEGER                   AS checklist_id,
    cl.verbatim_name,
    cl.locality,
    cl.collapsed_count::INTEGER            AS collapsed_count,
    COALESCE(specimen_inat_login, host_inat_login, user_login) AS collector_inat_login,
    NULL::VARCHAR                          AS id_date  -- D-09: museum/checklist record, not volunteer work; no identification date
FROM {{ ref('int_checklist_dedup_status') }} cl
WHERE cl.dedup_status IS DISTINCT FROM 'confirmed'
  AND cl.lat IS NOT NULL
  AND cl.lon IS NOT NULL
