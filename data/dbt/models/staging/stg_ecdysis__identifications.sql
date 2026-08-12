-- Wraps source('ecdysis_data', 'identifications').
-- Widened for the identifications model (beeatlas-fc4); previously projected only
-- coreid+modified for int_id_modified's MAX(modified).
--
-- NO FILTERING here — int_id_modified aggregates MAX(modified) over ALL rows
-- (including 'undetermined' placeholders and blank-name workflow artifacts), and
-- changing its input set would regress the mart's `modified` column. Sentinel
-- filtering (placeholder names, the 'Nomenclatural Adjustment' process actor)
-- happens in int_ecdysis_identifications.
--
-- canonical_name is materialized at load time by
-- checklist_pipeline._update_identifications_canonical_name (data/canonical_name.py
-- normalization — the single parsing authority; subgenus parens, authority strings,
-- and trinomials are its job, never SQL's).
--
-- taxon_rank is deliberately NOT projected: it is empty on all 87,205 source rows
-- (verified 2026-08-11, beeatlas-0o1); rank derives from name shape downstream.
{{ config(materialized='view') }}

SELECT
    coreid,
    identified_by,
    date_identified,
    scientific_name,
    canonical_name,
    identification_qualifier,
    identification_is_current = '1' AS identification_is_current,
    genus,
    specific_epithet,
    infraspecific_epithet,
    modified
FROM {{ source('ecdysis_data', 'identifications') }}
