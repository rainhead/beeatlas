-- samples_base projection: 9 columns from iNat observations + count OFV + sample_id OFV.
-- Mirrors export.py:86-103 (samples_base CTE).
SELECT
    op.id                                                                       AS observation_id,
    op.user__login                                                              AS host_inat_login,
    CAST(op.observed_on AS VARCHAR)                                             AS sample_date,
    op.observed_on                                                              AS sample_date_raw,
    op.longitude                                                                AS sample_lon,
    op.latitude                                                                 AS sample_lat,
    CAST(sc.value AS INTEGER)                                                   AS specimen_count,
    TRY_CAST(sid.value AS INTEGER)                                              AS sample_id,
    {{ is_plant_taxon('op') }} AS sample_host
FROM {{ ref('stg_inat__observations') }} op
JOIN {{ ref('stg_inat__ofvs') }} sc
    ON sc._dlt_root_id = op._dlt_id AND sc.field_id = {{ inat_ofv_specimen_count() }} AND sc.value != ''
LEFT JOIN {{ ref('stg_inat__ofvs') }} sid
    ON sid._dlt_root_id = op._dlt_id AND sid.field_id = {{ inat_ofv_sample_id() }}
WHERE op.longitude IS NOT NULL AND op.latitude IS NOT NULL
