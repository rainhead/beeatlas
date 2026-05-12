-- specimen_obs_base projection: 10 columns from waba observations + taxon_lineage.
-- Mirrors export.py:104-119 (specimen_obs_base CTE).
SELECT
    waba.id                             AS waba_obs_id,
    waba._dlt_id                        AS waba_dlt_id,
    waba.user__login                    AS specimen_inat_login,
    waba.taxon__name                    AS specimen_inat_taxon_name,
    waba.longitude,
    waba.latitude,
    waba.observed_on,
    waba.quality_grade,
    tl.genus                            AS specimen_inat_genus,
    tl.family                           AS specimen_inat_family
FROM {{ ref('stg_waba__observations') }} waba
LEFT JOIN {{ ref('stg_waba__taxon_lineage') }} tl ON tl.taxon_id = waba.taxon__id
