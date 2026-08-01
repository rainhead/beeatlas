-- Singular dbt test: fails (returns rows) if a name declared a SYNONYM in
-- int_synonyms still stands as its own species in int_species_universe.
--
-- The universe is a FULL OUTER JOIN of the checklist against the occurrence arms,
-- and synonymy has to be applied on EVERY arm feeding it — stg_checklist__species
-- (the checklist's species list), stg_checklist__records_full, the Ecdysis agg in
-- int_species_occurrences_agg, and the iNat agg in int_species_universe itself.
-- Miss one and the synonym does not merge: it survives as a ghost species with a
-- generated page and zero of everything, while its records sit under the accepted
-- name. That is exactly what Bombus lapponicus was before it was folded into
-- B. sylvicola (2026-07-31) — the checklist's species list still said lapponicus
-- while its 145 records were already filed under sylvicola.
--
-- Cheap to state, and it fails the build rather than publishing a page for a
-- species nobody accepts. Hard-fail deliberately: a ghost species is wrong data,
-- not a warning.
--
-- Scope note: this asserts the synonym is GONE, not that the accepted name is
-- present. A synonym whose accepted name is absent from the atlas entirely
-- (nothing recorded under either spelling) correctly yields no row here.

SELECT
    u.canonical_name,
    s.accepted_name,
    s.source
FROM {{ ref('int_species_universe') }} u
JOIN {{ ref('int_synonyms') }} s ON s.synonym = u.canonical_name
