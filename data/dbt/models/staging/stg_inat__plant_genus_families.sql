-- Wraps source('inaturalist_data', 'plant_genus_families').
-- Written by data/host_plant_lineage.load_plant_genus_families (stelis st-d64).
-- Columns: genus (VARCHAR, unique), family (VARCHAR): every plant genus name in
-- iNat's taxonomy archive, retired names included, with its one family.
-- Consumed by: int_specialist_host_plants (families for Fowler's host genera)
{{ config(materialized='view') }}

SELECT *
FROM {{ source('inaturalist_data', 'plant_genus_families') }}
