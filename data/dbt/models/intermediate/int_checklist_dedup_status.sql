-- int_checklist_dedup_status: exposes dedup_status on each collapsed checklist record (DUP-03).
--
-- LEFT JOINs int_checklist_collapsed through int_dedup_candidates to the committed
-- dedup_decisions seed. Mirrors the int_synonyms.sql LEFT JOIN view pattern.
--
-- dedup_status semantics:
--   NULL      = no candidate pair, or candidate exists but no seed row (unreviewed → NOT suppressed)
--   'confirmed' = curator confirmed cross-source duplicate (D-08: ANY confirmed pair for the
--                 ObjectID suppresses the whole record)
--   'rejected'  = curator reviewed and rejected as a false positive (record kept)
--
-- Phase 137 consumes this view with: WHERE dedup_status IS DISTINCT FROM 'confirmed'
-- (i.e. keep all records except curator-confirmed duplicates).
--
-- NOTE: The fan-out from multiple candidate pairs per ObjectID is collapsed by the
-- window aggregation (bool_or / MAX OVER PARTITION BY ObjectID), so each ObjectID
-- appears once in the output.
{{ config(materialized='view') }}

SELECT DISTINCT ON (cl.ObjectID)
    cl.*,
    CAST(CASE
        WHEN bool_or(CAST(dd.dedup_status AS VARCHAR) = 'confirmed') OVER (PARTITION BY cl.ObjectID)
        THEN 'confirmed'
        ELSE MAX(CAST(dd.dedup_status AS VARCHAR)) OVER (PARTITION BY cl.ObjectID)
    END AS VARCHAR) AS dedup_status
FROM {{ ref('int_checklist_collapsed') }} cl
LEFT JOIN {{ ref('int_dedup_candidates') }} cand
    ON cand.checklist_ObjectID = cl.ObjectID
LEFT JOIN {{ ref('dedup_decisions') }} dd
    ON dd.pair_key = cand.pair_key
