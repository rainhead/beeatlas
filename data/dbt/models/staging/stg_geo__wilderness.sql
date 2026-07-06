-- Wilderness no-collect overlay (beeatlas-2vj): the National Wilderness
-- Preservation System polygons where collecting is prohibited.
--
-- Source is geographies.padus_wilderness (loaded by
-- geographies_pipeline.load_padus_wilderness), already filtered to the PAD-US
-- Wilderness-Area designation (Des_Tp='WA'). The des_tp/state_nm predicates below
-- are redundant belt-and-suspenders that also document intent and keep the model
-- correct if the loader ever broadens.
--
-- Olympic carve-out: BeeAtlas has a collecting relationship with Olympic National
-- Park, so the wilderness inside it is NOT off-limits and is excluded from the
-- overlay. PAD-US 4.1 labels it "Daniel J. Evans Wilderness Area" (Congress
-- renamed the former "Olympic Wilderness" in 2017); exclude either spelling.
{{ config(materialized='view') }}

SELECT
    unit_name AS name,
    geom
FROM {{ source('geographies', 'padus_wilderness') }}
WHERE des_tp = 'WA'
  AND state_nm = 'WA'
  AND unit_name NOT ILIKE '%Olympic Wilderness%'
  AND unit_name NOT ILIKE '%Daniel J. Evans%'
