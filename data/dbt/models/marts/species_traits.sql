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
        WHEN NULLIF(bg.sociality, '') IS NOT NULL THEN 'beegap-species'
        WHEN NULLIF(gb.sociality, '') IS NOT NULL THEN 'genus-backbone'
    END AS sociality_source,

    -- Nesting biology: Ground / Cavity / Wood / Host Nest (parasites) / Multiple / Open.
    COALESCE(NULLIF(bg.nesting, ''), NULLIF(gb.nesting, '')) AS nesting,
    CASE
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
LEFT JOIN beegap          bg ON s.canonical_name = bg.canonical_name
LEFT JOIN {{ ref('bee_genus_traits') }} gb ON LOWER(s.genus) = gb.genus
LEFT JOIN specialist      sp ON s.canonical_name = sp.canonical_name
LEFT JOIN parasite        ph ON s.canonical_name = ph.parasite
WHERE s.specific_epithet IS NOT NULL
