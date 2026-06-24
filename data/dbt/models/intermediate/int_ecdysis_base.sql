-- ecdysis_base projection: 20 columns joining ecdysis occurrences with occurrence_links,
-- iNat floral host, id_modified, and waba_link.
-- Mirrors export.py:57-85 (ecdysis_base CTE).
-- Note: the WHERE decimal_latitude IS NOT NULL filter (export.py:84) is already applied
-- by stg_ecdysis__occurrences and is not repeated here.
SELECT
    CAST(o.id AS INTEGER)                                                       AS ecdysis_id,
    o.catalog_number,
    CAST(o.decimal_longitude AS DOUBLE)                                         AS ecdysis_lon,
    CAST(o.decimal_latitude AS DOUBLE)                                          AS ecdysis_lat,
    o.event_date                                                                AS ecdysis_date,
    CAST(o.year AS INTEGER)                                                     AS year,
    CAST(o.month AS INTEGER)                                                    AS month,
    o.scientific_name                                                           AS scientificName,
    o.recorded_by                                                               AS recordedBy,
    o.field_number                                                              AS fieldNumber,
    o.genus,
    o.family,
    NULLIF(regexp_extract(o.associated_taxa, 'host:"([^"]+)"', 1), '')         AS floralHost,
    links.host_observation_id,
    {{ is_plant_taxon('inat') }} AS inat_host,
    inat.quality_grade                                                          AS inat_quality_grade,
    strftime(GREATEST(o.modified, COALESCE(im.max_id_modified, o.modified)), '%Y-%m-%d') AS modified,
    wl.specimen_observation_id,
    TRY_CAST(NULLIF(o.minimum_elevation_in_meters, '') AS INTEGER)              AS elevation_m,
    o.canonical_name
FROM {{ ref('stg_ecdysis__occurrences') }} o
LEFT JOIN {{ ref('stg_ecdysis__occurrence_links') }} links ON links.occurrence_id = o.occurrence_id
LEFT JOIN {{ ref('stg_inat__observations') }} inat ON inat.id = links.host_observation_id
LEFT JOIN {{ ref('int_id_modified') }} im ON im.coreid = o.id
-- D-05: int_waba_link is now 1:N per catalog_suffix (MIN() removed). ARM 1 needs exactly one
-- specimen_observation_id per ecdysis row to avoid fan-out. De-duplicate here by picking the
-- MIN(specimen_observation_id) as a stable representative; the choice of which WABA obs to
-- surface for the ecdysis link is arbitrary (both obs represent the same catalog entry).
-- int_matched_waba_ids covers the full set for filter purposes; this per-suffix pick is
-- only for carrying specimen_observation_id into the ecdysis mart row (display, not counting).
LEFT JOIN (
    SELECT catalog_suffix, MIN(specimen_observation_id) AS specimen_observation_id
    FROM {{ ref('int_waba_link') }}
    GROUP BY catalog_suffix
) wl ON wl.catalog_suffix = CAST(regexp_extract(o.catalog_number, '[0-9]+$', 0) AS BIGINT)
