-- Wraps source('inaturalist_data', 'host_plant_lineage').
-- Written by data/host_plant_lineage.load_host_plant_lineage (Phase 175 plant taxonomy).
-- Columns: taxon_id (BIGINT), family (VARCHAR), genus (VARCHAR).
-- Consumed by: int_species_host_plants (per-bee family/genus host aggregate)
{{ config(materialized='view') }}

SELECT *
FROM {{ source('inaturalist_data', 'host_plant_lineage') }}
