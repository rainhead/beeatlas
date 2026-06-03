-- specimen_obs_base projection: 8 columns from waba observations.
-- Mirrors export.py:104-119 (specimen_obs_base CTE).
-- Phase 131 NORM-01: dropped specimen_inat_genus and specimen_inat_family (dead downstream)
-- and the stg_waba__taxon_lineage JOIN (nothing retained uses it).
SELECT
    waba.id                             AS waba_obs_id,
    waba._dlt_id                        AS waba_dlt_id,
    waba.user__login                    AS specimen_inat_login,
    waba.taxon__name                    AS specimen_inat_taxon_name,
    waba.longitude,
    waba.latitude,
    waba.observed_on,
    waba.quality_grade
FROM {{ ref('stg_waba__observations') }} waba
