-- Singular test: every (trait, action) pair in bee_traits_corrections is one
-- marts/species_traits actually implements.
--
-- accepted_values checks the two columns independently, so it cannot see that the
-- COMBINATION is unsupported. `host_bees` is aggregated out of bee_parasite_hosts by
-- the `parasite` CTE, which honours only `retract` (it anti-joins the retracted
-- species); there is no arm that substitutes a corrected host list. A `replace` row
-- on that trait would therefore pass every other test and silently do nothing — the
-- curator would see their correction land in git, in the drift gate, and nowhere in
-- the published data.
--
-- Failing loudly is the point: an unimplemented correction is worse than an absent
-- one, because it reads as handled. If a real need for host_bees replacement turns
-- up, implement the arm and delete the row from this test.
SELECT canonical_name, trait, action
FROM {{ ref('bee_traits_corrections') }}
WHERE trait = 'host_bees' AND action <> 'retract'
