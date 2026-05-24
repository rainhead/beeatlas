-- Rewritten Phase 110 D-01: was waba taxon_lineage source;
-- delegates to stg_inat__taxon_lineage_extended, selecting the 3 cols
-- that int_specimen_obs_base consumes (taxon_id, genus, family).
{{ config(materialized='view') }}

SELECT taxon_id, genus, family
FROM {{ ref('stg_inat__taxon_lineage_extended') }}
