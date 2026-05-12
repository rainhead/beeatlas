-- Wraps source('ecdysis_data', 'identifications').
-- Narrow projection: int_id_modified (Plan 03) only needs coreid and modified
-- to compute MAX(modified) per specimen (export.py lines 42-44).
{{ config(materialized='view') }}

SELECT
    coreid,
    modified
FROM {{ source('ecdysis_data', 'identifications') }}
