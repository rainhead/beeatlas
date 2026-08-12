-- occurrence_trust mart: the published trusted-taxon artifact (beeatlas-nyr,
-- ADR 0033). One row per occ_id with at least one current expert assertion —
-- SEPARATE from marts/occurrences BY DECISION (ADR 0034): trust-model changes
-- never touch the occurrences contract or its release sequence, and the
-- derived-judgement provenance boundary stays visible.
--
-- JOIN CONTRACT: occ_id is the synthetic canonical occurrence identity —
-- 'ecdysis:N' | 'inat:N' | 'inat_obs:N' | 'checklist:N' — the same CASE
-- priority as occurrence_places.sql, test_no_duplicate_occ_ids.sql, and
-- src/occurrence.ts occIdFromRow. Occurrence rows WITHOUT a current expert
-- assertion (checklist arm, samples) simply have no row here; consumers treat
-- absence as "no trust computed", never as distrust.
--
-- Consumers: the photo-pipeline gate (scripts/photo-pipeline/trust-gate.mjs,
-- repointed here by beeatlas-vsrh — its JS rule survives only as the fallback
-- for candidates newer than the artifact) and display claims (beeatlas-kmxs —
-- "determined to Neolarra by five independent people"). A record qualifies
-- for query taxon T iff T ∈ trusted_ancestor_or_self (ancestor-or-self,
-- root->leaf, includes the trusted taxon itself).
--
-- ORDER BY occ_id for byte-stable determinism (RESEARCH Pitfall 4).
{{ config(
    materialized='external',
    location='target/sandbox/occurrence_trust.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}

SELECT
    occ_id,
    trusted_taxon_id,
    trusted_taxon_name,
    trusted_taxon_rank,
    trusted_ancestor_or_self,
    is_disputed,
    has_expert_self_disagreement,
    has_uncomparable_assertion,
    expert_assertion_count,
    identifier_count,
    identifiers
FROM {{ ref('int_trusted_taxon') }}
ORDER BY occ_id
