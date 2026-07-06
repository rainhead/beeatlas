-- Wilderness no-collect overlay (beeatlas-2vj): the National Wilderness
-- Preservation System polygons where collecting is prohibited.
--
-- Source is the PAD-US 4.1 Designation feature class (geographies.padus_designations,
-- loaded by geographies_pipeline.load_padus_designations). Des_Tp='WA' is the
-- PAD-US domain code for "Wilderness Area"; State_Nm='WA' keeps only Washington
-- while the source table may hold other states as BeeAtlas expands.
--
-- Olympic carve-out: BeeAtlas has a collecting relationship with Olympic National
-- Park, so the wilderness inside it is NOT off-limits and is excluded from the
-- overlay. PAD-US labels it "Olympic Wilderness" (Congress renamed it the
-- "Daniel J. Evans Wilderness" in 2017); exclude either spelling defensively.
{{ config(materialized='view') }}

SELECT
    unit_name AS name,
    geom
FROM {{ source('geographies', 'padus_designations') }}
WHERE des_tp = 'WA'
  AND state_nm = 'WA'
  AND unit_name NOT ILIKE '%Olympic Wilderness%'
  AND unit_name NOT ILIKE '%Daniel J. Evans%'
