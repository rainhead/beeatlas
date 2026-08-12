-- Wraps the two identification child tables of source('inat_expert_data', ...)
-- into one relation (beeatlas-9sy): the expert feed's identifications plus the
-- WABA-specimen-linked observations' identifications.
--
-- An observation can appear in BOTH parents (an expert-feed observation that is
-- also a linked specimen photo), so identification rows deduplicate by uuid.
--
-- ancestor_ids arrives as the loader's comma-joined string (a list-of-scalars
-- would have become a dlt grandchild table); split back to INTEGER[] here.
-- Ordering is root->leaf as the API sends it, matching int_taxon_nodes'
-- ancestor_or_self convention.
{{ config(materialized='view') }}

WITH unioned AS (
    SELECT
        uuid, current, category, own_observation, created_at,
        observation_id, taxon__id, taxon__name, taxon__rank,
        taxon__ancestor_ids, user__login
    FROM {{ source('inat_expert_data', 'observations__identifications') }}
    UNION ALL
    SELECT
        uuid, current, category, own_observation, created_at,
        observation_id, taxon__id, taxon__name, taxon__rank,
        taxon__ancestor_ids, user__login
    FROM {{ source('inat_expert_data', 'specimen_linked_observations__identifications') }}
),

deduped AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY uuid ORDER BY observation_id) AS rn
    FROM unioned
)

SELECT
    uuid                                       AS identification_uuid,
    CAST(observation_id AS BIGINT)             AS observation_id,
    user__login                                AS inat_login,
    current                                    AS identification_is_current,
    category,
    own_observation,
    created_at,
    CAST(taxon__id AS INTEGER)                 AS taxon_id,
    taxon__name                                AS taxon_name,
    taxon__rank                                AS taxon_rank,
    CASE WHEN taxon__ancestor_ids IS NULL OR taxon__ancestor_ids = '' THEN NULL
         ELSE list_transform(string_split(taxon__ancestor_ids, ','), x -> CAST(x AS INTEGER))
    END                                        AS ancestor_ids
FROM deduped
WHERE rn = 1
