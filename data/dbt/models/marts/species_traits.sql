-- Species traits mart: one row per atlas species (canonical_name) carrying
-- ecological trait labels assembled from committed seeds:
--   * bee_traits_beegap     — USGS Bee-Gap 2017 (public domain), species-level
--                             native / nesting / sociality / foraging.
--   * bee_genus_traits       — genus-level sociality/nesting backbone, derived from
--                             Bee-Gap but emitted ONLY for unambiguous (single-valued)
--                             genera. Fills species the species-level table misses.
--   * bee_specialist_hosts   — Fowler & Droege, Pollen Specialist Bees of the Western
--                             United States. Authoritative diet-breadth (oligolecty)
--                             overlay with host plant family; far broader than Bee-Gap's
--                             sparse `foraging` flag, so it wins ties for diet_breadth.
--   * bee_parasite_hosts     — Bee-Gap host *bee* of cleptoparasites (host_bees column).
--
-- Precedence: species-level Bee-Gap value first, genus backbone as fallback; every
-- emitted label carries a *_source column so consumers can see provenance and weight it.
-- Diet breadth: a Fowler specialist match is authoritative; otherwise fall back to the
-- (sparse) Bee-Gap generalist/specialist flag. Absence of a label is left NULL — NOT
-- inferred as "generalist" (absence from a positive specialist list is suggestive, not
-- proof). Diet breadth is genuinely species-level and is never assigned from the genus.
--
-- Name reconciliation: the three species-keyed seeds use Bee-Gap / Fowler spellings, which
-- differ from atlas-accepted names by gender variants etc. Each seed's join key is routed
-- through int_synonyms (the same curated map the occurrence pipeline uses), so a synonym
-- added to occurrence_synonyms bridges trait data automatically. Post-normalization
-- collisions are de-duplicated (preferring the most-populated row) to keep one row/species.

{{ config(
    materialized='external',
    location='target/sandbox/species_traits.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}

WITH syn AS (
    SELECT synonym, accepted_name FROM {{ ref('int_synonyms') }}
),

-- Bee-Gap species traits, join key normalized through synonymy, deduped on collision.
beegap AS (
    SELECT canonical_name, native, nesting, sociality, foraging
    FROM (
        SELECT
            COALESCE(syn.accepted_name, b.canonical_name) AS canonical_name,
            b.native, b.nesting, b.sociality, b.foraging
        FROM {{ ref('bee_traits_beegap') }} b
        LEFT JOIN syn ON syn.synonym = b.canonical_name
    )
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY canonical_name
        -- Prefer the most-populated synonym-merged row across ALL four fields (native
        -- included so a populated native_status is never dropped), then break ties on the
        -- field values themselves for a build-deterministic pick. Ordering by canonical_name
        -- would be a no-op here since it is the partition key (CR WR-01 follow-up).
        ORDER BY (sociality <> '') DESC, (nesting <> '') DESC, (foraging <> '') DESC, (native <> '') DESC,
                 native, nesting, sociality, foraging
    ) = 1
),

-- Local corrections to values an upstream source gets wrong (stelis st-t4t).
-- Highest precedence: a correction beats the species-level source it corrects.
-- Two actions, both needed by the very first correction:
--   replace — publish corrected_value in place of the upstream one.
--   retract — publish NOTHING from the species-level source, falling through to the
--             genus backbone (which may itself be empty). This is "we know this is
--             wrong" WITHOUT "and here is the right answer" — the alternative being
--             to invent a replacement, which is how override tables start lying.
-- `expected_upstream` is deliberately NOT read here: it records the value the
-- correction was written against, and stelis gates the build when upstream no longer
-- matches it, so a correction cannot silently outlive the error it fixes. A
-- correction naming a species with no Bee-Gap row drops out — the same drift gate
-- catches that, because the expected value will not be found either.
corrections AS (
    SELECT
        COALESCE(syn.accepted_name, c.canonical_name) AS canonical_name,
        MAX(CASE WHEN c.trait = 'sociality' THEN c.action END)          AS sociality_action,
        MAX(CASE WHEN c.trait = 'sociality' THEN c.corrected_value END) AS sociality_value,
        MAX(CASE WHEN c.trait = 'nesting'   THEN c.action END)          AS nesting_action,
        MAX(CASE WHEN c.trait = 'nesting'   THEN c.corrected_value END) AS nesting_value
    FROM {{ ref('bee_traits_corrections') }} c
    LEFT JOIN syn ON syn.synonym = c.canonical_name
    GROUP BY 1
),

-- Bee-Gap AFTER corrections. Applying them here rather than in the final SELECT keeps
-- the precedence chain below reading as it always did — corrected value, then genus
-- backbone — with only the *_source arms needing to know corrections exist.
beegap_corrected AS (
    SELECT
        b.canonical_name,
        b.native,
        b.foraging,
        CASE cx.sociality_action
             WHEN 'replace' THEN cx.sociality_value
             WHEN 'retract' THEN ''
             ELSE b.sociality END AS sociality,
        CASE cx.nesting_action
             WHEN 'replace' THEN cx.nesting_value
             WHEN 'retract' THEN ''
             ELSE b.nesting END AS nesting,
        cx.sociality_action,
        cx.nesting_action
    FROM beegap b
    LEFT JOIN corrections cx ON cx.canonical_name = b.canonical_name
),

-- Fowler specialist hosts, normalized + deduped.
specialist AS (
    SELECT canonical_name, host_plant_family, host_plant_detail
    FROM (
        SELECT
            COALESCE(syn.accepted_name, sp.canonical_name) AS canonical_name,
            sp.host_plant_family, sp.host_plant_detail
        FROM {{ ref('bee_specialist_hosts') }} sp
        LEFT JOIN syn ON syn.synonym = sp.canonical_name
    )
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY canonical_name
        -- Prefer a populated family, then a populated detail, then break ties on the values
        -- themselves so the chosen host row is stable across builds (partition-key ordering
        -- would be a no-op; CR WR-01 follow-up).
        ORDER BY (host_plant_family <> '') DESC, (host_plant_detail <> '') DESC,
                 host_plant_family, host_plant_detail
    ) = 1
),

-- Cuckoo host bees: normalize the parasite key, then re-aggregate (synonymy may merge
-- two parasite spellings onto one accepted name).
parasite AS (
    SELECT
        COALESCE(syn.accepted_name, p.parasite) AS parasite,
        STRING_AGG(DISTINCT p.host_taxon, ', ' ORDER BY p.host_taxon) AS host_bees,
        COUNT(DISTINCT p.host_taxon) AS host_bee_count
    FROM {{ ref('bee_parasite_hosts') }} p
    LEFT JOIN syn ON syn.synonym = p.parasite
    GROUP BY 1
)

SELECT
    s.canonical_name,
    s.genus,
    s.family,

    -- Sociality: social / solitary / cleptoparasitic ("Parasitic"). Genus-stable for
    -- most taxa, so the genus backbone fills gaps the species table leaves.
    COALESCE(NULLIF(bg.sociality, ''), NULLIF(gb.sociality, '')) AS sociality,
    CASE
        WHEN bg.sociality_action = 'replace' AND NULLIF(bg.sociality, '') IS NOT NULL THEN 'correction'
        WHEN NULLIF(bg.sociality, '') IS NOT NULL THEN 'beegap-species'
        WHEN NULLIF(gb.sociality, '') IS NOT NULL THEN 'genus-backbone'
    END AS sociality_source,

    -- Nesting biology: Ground / Cavity / Wood / Host Nest (parasites) / Multiple / Open.
    COALESCE(NULLIF(bg.nesting, ''), NULLIF(gb.nesting, '')) AS nesting,
    CASE
        WHEN bg.nesting_action = 'replace' AND NULLIF(bg.nesting, '') IS NOT NULL THEN 'correction'
        WHEN NULLIF(bg.nesting, '') IS NOT NULL THEN 'beegap-species'
        WHEN NULLIF(gb.nesting, '') IS NOT NULL THEN 'genus-backbone'
    END AS nesting_source,

    -- Diet breadth: specialist (oligolectic) vs generalist (polylectic). Species-level.
    CASE
        WHEN sp.canonical_name IS NOT NULL THEN 'specialist'
        WHEN bg.foraging = 'Specialist' THEN 'specialist'
        WHEN bg.foraging = 'Generalist' THEN 'generalist'
    END AS diet_breadth,
    CASE
        WHEN sp.canonical_name IS NOT NULL THEN 'fowler'
        WHEN bg.foraging IN ('Specialist', 'Generalist') THEN 'beegap-species'
    END AS diet_breadth_source,
    NULLIF(sp.host_plant_family, '') AS host_plant_family,
    NULLIF(sp.host_plant_detail, '') AS host_plant_detail,  -- consistent nullability (CR WR-04)

    -- Native vs introduced (Bee-Gap species-level; partial coverage).
    NULLIF(bg.native, '') AS native_status,

    -- Host bee(s) parasitized by cleptoparasitic species (Bee-Gap 2017; one cuckoo may
    -- list several hosts, some recorded only to host genus). Comma-joined for the
    -- one-row-per-species shape; the relation lives in seed bee_parasite_hosts.
    ph.host_bees,
    ph.host_bee_count

FROM {{ ref('species') }} s
LEFT JOIN beegap_corrected bg ON s.canonical_name = bg.canonical_name
LEFT JOIN {{ ref('bee_genus_traits') }} gb ON LOWER(s.genus) = gb.genus
LEFT JOIN specialist      sp ON s.canonical_name = sp.canonical_name
LEFT JOIN parasite        ph ON s.canonical_name = ph.parasite
WHERE s.specific_epithet IS NOT NULL
