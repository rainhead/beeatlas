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
    CASE WHEN inat.taxon__iconic_taxon_name = 'Plantae' THEN inat.taxon__name ELSE NULL END AS inat_host,
    inat.quality_grade                                                          AS inat_quality_grade,
    strftime(GREATEST(o.modified, COALESCE(im.max_id_modified, o.modified)), '%Y-%m-%d') AS modified,
    wl.specimen_observation_id,
    TRY_CAST(NULLIF(o.minimum_elevation_in_meters, '') AS INTEGER)              AS elevation_m,
    o.canonical_name
FROM {{ ref('stg_ecdysis__occurrences') }} o
LEFT JOIN {{ ref('stg_ecdysis__occurrence_links') }} links ON links.occurrence_id = o.occurrence_id
LEFT JOIN {{ ref('stg_inat__observations') }} inat ON inat.id = links.host_observation_id
LEFT JOIN {{ ref('int_id_modified') }} im ON im.coreid = o.id
LEFT JOIN {{ ref('int_waba_link') }} wl ON wl.catalog_suffix = CAST(regexp_extract(o.catalog_number, '[0-9]+$', 0) AS BIGINT)
