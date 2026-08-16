-- An int_combined row that matches NO branch of the occ_id CASE is unaddressable:
-- nothing can select it, link it, resolve its place membership, or find it in any
-- occ_id-keyed artifact (occurrence_trust, occurrence_places, the frontend's
-- occIdFromRow). Exactly ONE such row exists today — a checklist record whose
-- upstream ObjectID is null (beeatlas-cmsf).
--
-- WHY THIS TEST EXISTS. The bridge's not_null(occ_id) contract is what caught that
-- record, and it caught it only because beeatlas-8gcw made the Level IV ecoregions
-- into places: they tile the state, so the row finally acquired a membership and
-- tripped the contract. occurrence_places.sql now filters identity-less rows out —
-- correct, since a null occ_id is unjoinable by construction — which makes that
-- contract tautological and retires the alarm along with the symptom.
--
-- So the alarm moves here, upstream of the filter. If the checklist source
-- regresses and 500 records lose their ObjectIDs, they would otherwise vanish from
-- every place page, place filter and detail card while still plotting on the map,
-- with no gate firing anywhere.
--
-- The bound is the CURRENT known count, not zero: zero would fail today and teach
-- everyone to ignore it. Lower it to 0 when beeatlas-cmsf lands, and let it fail if
-- the number ever climbs.
{{ config(severity='error') }}

SELECT COUNT(*) AS identity_less_rows
FROM {{ ref('int_combined') }}
WHERE ecdysis_id IS NULL
  AND observation_id IS NULL
  AND specimen_observation_id IS NULL
  AND checklist_id IS NULL
HAVING COUNT(*) > 1
