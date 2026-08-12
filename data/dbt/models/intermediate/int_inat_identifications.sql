-- iNat arm of the identifications model (beeatlas-9sy; contract placeholder
-- until 2026-08-12, now live on inat_expert_pipeline.py's ingestion).
--
-- One row per iNat identification event on an observation we track: the expert
-- feed plus the WABA-specimen-linked observations (staging dedupes the
-- overlap). person_key resolves via identifier_register.inat_login; is_expert
-- is the register flag — it governs whose iNat identifications assert or veto
-- trust (ADR 0033 item 5); iNat rows NEVER get Ecdysis's provenance trust.
--
-- ancestor_ids comes per row from the API (ADR 0030: ingested ancestor_ids,
-- no lookups) and covers taxa outside our local lineage (complexes, non-bee
-- maverick IDs).
{{ config(materialized='view') }}

SELECT
    i.observation_id,
    i.inat_login,
    r.person_key,
    COALESCE(r.is_expert, FALSE) AS is_expert,
    i.identification_is_current,
    i.own_observation,
    i.taxon_id,
    i.taxon_name,
    i.taxon_rank,
    i.ancestor_ids,
    CAST(i.created_at AS TIMESTAMP) AS created_at
FROM {{ ref('stg_inat_expert__identifications') }} i
LEFT JOIN {{ ref('identifier_register') }} r ON r.inat_login = i.inat_login
