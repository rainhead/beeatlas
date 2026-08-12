-- iNat arm of the identifications model — CONTRACT PLACEHOLDER (beeatlas-xs1).
--
-- No iNat identification data exists locally yet (the hard data gap recorded in
-- beeatlas-9sy: the CSV export and dlt pipelines carry observation-level scalars
-- only). This model pins the arm's column contract so the union
-- (int_identification_events) and the trusted-taxon model build and are
-- unit-testable NOW; beeatlas-9sy replaces the zero-row SELECT with the
-- observations__identifications child table its loader ingests.
--
-- Contract notes for 9sy:
--   • ancestor_ids comes PER IDENTIFICATION ROW from the API's
--     taxon.ancestor_ids — it must cover taxa outside our local lineage
--     (complexes, non-bee maverick IDs), per ADR 0030.
--   • person_key resolves via identifier_register.inat_login; is_expert is the
--     register flag (governs iNat assertions only — ADR 0033 item 5).
--   • occ_id linkage happens downstream: an identification on observation N
--     attaches to every occurrence row linked to N (specimen_observation_id,
--     host_observation_id, or the inat_obs arm's own id).
{{ config(materialized='view') }}

SELECT
    CAST(NULL AS BIGINT)    AS observation_id,
    CAST(NULL AS VARCHAR)   AS inat_login,
    CAST(NULL AS VARCHAR)   AS person_key,
    CAST(NULL AS BOOLEAN)   AS is_expert,
    CAST(NULL AS BOOLEAN)   AS identification_is_current,
    CAST(NULL AS BOOLEAN)   AS own_observation,
    CAST(NULL AS INTEGER)   AS taxon_id,
    CAST(NULL AS VARCHAR)   AS taxon_name,
    CAST(NULL AS VARCHAR)   AS taxon_rank,
    CAST(NULL AS INTEGER[]) AS ancestor_ids,
    CAST(NULL AS TIMESTAMP) AS created_at
WHERE FALSE
