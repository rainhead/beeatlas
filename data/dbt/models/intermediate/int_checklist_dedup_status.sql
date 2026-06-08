-- PLACEHOLDER — DUP-03 LEFT JOIN implemented in 136-04.
--
-- int_checklist_dedup_status: exposes dedup_status on each collapsed checklist record.
-- LEFT JOINs int_checklist_collapsed through int_dedup_candidates to dedup_decisions seed.
-- NULL dedup_status = unreviewed candidate or no candidate at all (unreviewed → not suppressed).
-- 'confirmed' = curator confirmed cross-source duplicate; Phase 137 filters these out.
{{ config(materialized='view') }}

SELECT *, CAST(NULL AS VARCHAR) AS dedup_status
FROM {{ ref('int_checklist_collapsed') }}
