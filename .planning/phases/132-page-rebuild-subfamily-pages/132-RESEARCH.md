# Phase 132: Page Rebuild & Subfamily Pages - Research

**Researched:** 2026-06-02
**Domain:** dbt rollup model, Eleventy data layer, SVG map generation, static page generation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** — Hierarchy-keyed higher-rank rollups produced by a NEW dbt model. One row per higher-rank
  taxon (subfamily/tribe/genus/subgenus), keyed by `taxon_id`, with rolled-up `specimen_count` /
  `inat_obs_count`. dbt is the sole producer; `_data/species.js` + templates become thin presenters.
- **D-02** — Rollup resolves ancestors by reading `taxa.csv.gz` natively in dbt, extending
  `stg_inat__genus_taxon_ids.sql` to all surfaced higher ranks. Groups by ancestor **`taxon_id`**,
  NOT rank-name strings. `taxa.csv.gz` is the single source.
- **D-03** — Supersede `higher_rank_taxon_ids.json`. The new dbt rollup is already keyed on the same
  taxon_ids; retire `higher_rank_taxon_ids.json` and its Python builder; rewire eleventy data layer
  and iNat-link rendering.
- **D-04** — Subfamily pages use tribes→genera NESTED layout. Tribes as headings linking to their
  `/species/tribe/{Tribe}/` pages; genera nested beneath each tribe heading.
- **D-05** — Tribe-less genera render as a flat list with no heading. The 5 single-genus subfamilies
  (Colletinae, Rophitinae, Hylaeinae, Melittinae, Nomiinae) degrade to a plain genus list.
- **D-06** — Subfamily SVG maps colored by GENUS (one color per genus), reusing `_group_colors` /
  `_write_group_svg` from `data/species_maps.py` at genus granularity.
- **D-07** — Pre-generation collision check HARD-FAILS the build. Enumerates every taxon's public
  URL across all ranks; errors out on any collision. No auto-suffix.
- **D-08** — Generate only `is_anthophila=1` subfamilies with ≥1 member genus in the species universe.
  Yields 12 subfamilies; EXCLUDES Eumeninae (wasp bycatch, HIER-05).
- **D-09** — Preserve existing checklist treatment unchanged. Checklist-only species keep current
  rendering; data feeding it comes from hierarchy rollup, not string grouping.

### Claude's Discretion

- **D-10** — Rollup artifact carries membership edges, not just counts (leaning). Emit
  `taxon_id`-based parent→child membership edges alongside counts so member lists are
  hierarchy-derived. Planner may split into a counts model + separate edges model if a single
  combined dbt model gets unwieldy.
- Exact shape/location of the new dbt model (one combined `higher_taxa` mart vs. per-rank), its
  `schema.yml` contract, and the eleventy data wiring are left to research/planning, constrained
  by D-01..D-03 and D-10.

### Deferred Ideas (OUT OF SCOPE)

- Complex-rank pages (PAGE-05): dropped in Phase 129.
- `/species` browse tree (Phase 133).
- Changing the species mart's retained rank-name strings.
- Map filtering / autocomplete (delivered in Phase 130).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PAGE-01 | Genus, subgenus, and tribe page SVG maps and totals recomputed from hierarchy + `taxon_id` (no rank-specific string grouping) | dbt rollup model with ancestor `taxon_id` resolution; `_data/species.js` rewire onto rollup JSON |
| PAGE-02 | Subfamily pages generated (SVG map + specimen/observation counts + attribution) consistent with existing pages | New `_pages/subfamily.njk` pagination on `species.subfamilyList`; subfamily group-map pass in `species_maps.py` |
| PAGE-03 | Page generation keys on `taxon_id` internally; same-named distinct taxa never collapse; any genuine slug collision hard-fails | Slug collision check in Python build step; URL scheme verified collision-free across all ranks |
| PAGE-04 | Checklist-only bee species present in page generation with existing "checklist only" badge | Rollup carries membership for all species in `int_species_universe` (occurrence + checklist); behavior preserved unchanged |
</phase_requirements>

---

## Summary

Phase 132 has three parallel workstreams: (1) a new dbt mart model that produces hierarchy-keyed
higher-rank rollups consumed by the Eleventy data layer, (2) a new subfamily page template and
generation path cloned from existing tribe/genus patterns, and (3) a new subfamily SVG map pass
added to `species_maps.py`. All three ship together because the rollup is the data source for both
the Eleventy pagination and the map generation.

The existing code is well-factored and provides clear extension points. `stg_inat__genus_taxon_ids.sql`
is the exact template for ancestor-`taxon_id` resolution — the same `read_csv('../raw/taxa.csv.gz')`
pattern extended to subfamily/tribe/subgenus ranks. The `_generate_group_maps` / `_write_group_svg`
functions in `species_maps.py` need only a new `subfamily_members` pass at genus granularity. The
Eleventy pagination in `genus.njk` / `tribe.njk` / `subgenus.njk` is the template for
`subfamily.njk` — the data shape is a known target.

The highest-complexity decision is the dbt rollup model shape. The recommendation (see Architecture
Patterns) is a single `marts/higher_taxa.sql` external parquet combining counts AND membership in a
normalized (long) format — one row per (higher-rank taxon, member species/genus) edge, with counts
denormalized on each row for the rollup use case. This keeps a single dbt model, a single JSON
artifact, and a straightforward Eleventy data transform.

**Primary recommendation:** One combined `marts/higher_taxa` model; one Python export step producing
`higher_taxa.json`; `_data/species.js` reads `higher_taxa.json` instead of string-grouping; retire
`higher_rank_taxon_ids.json` and its builder.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Ancestor `taxon_id` resolution (genus/tribe/etc.) | dbt (pipeline) | — | D-02 locked: taxa.csv.gz in dbt is the single source |
| Higher-rank rollup counts | dbt (pipeline) | — | D-01 locked: dbt is sole producer |
| Membership edges (genus→species, tribe→genus, subfamily→tribe) | dbt (pipeline) OR Python post-step | — | D-10 leaning toward dbt; planner has discretion to split |
| Rollup JSON artifact export | Python post-step (`species_export.py`) | — | Consistent with species.json pattern; slug post-step requires Python anyway |
| Slug computation + collision check | Python post-step | — | Unicode normalization not reproducible in SQL; all URLs known at export time |
| Page template + pagination | Eleventy (static) | — | Existing pattern for all taxon pages |
| Subfamily SVG maps | Python (`species_maps.py`) | — | D-06 reuses existing group-map functions |
| Checklist-only species rendering | Eleventy template | dbt rollup | D-09: behavior preserved; data source changes |
| `taxon_id`-based iNat links | Eleventy template | dbt rollup | D-03: taxon_ids now come from rollup, not `higher_rank_taxon_ids.json` |

---

## Standard Stack

No new external packages required. This phase extends existing pipeline code.

### Core (all already present)
| Library | Purpose | Notes |
|---------|---------|-------|
| DuckDB | dbt external materializations, `read_csv` | Existing; `taxa.csv.gz` pattern proven in `stg_inat__genus_taxon_ids.sql` |
| dbt (DuckDB adapter) | New `higher_taxa` model | Existing; `marts/schema.yml` extended |
| PyArrow | Parquet write for rollup artifact | Existing in `species_export.py` |
| Eleventy 3.x | Page template pagination | Existing; `pagination:` frontmatter pattern reused |

### No Package Legitimacy Audit Required

This phase installs no new packages.

---

## Architecture Patterns

### System Architecture Diagram

```
taxa.csv.gz
    |
    v
[dbt: stg_inat__higher_rank_taxon_ids]  (new staging view)
    |
    v
[dbt: marts/higher_taxa.sql]  (new external parquet)
    |  reads species mart (ref('species')) for per-species counts
    |  reads int_species_universe for membership gating
    |  reads ancestor taxon_ids from staging view above
    v
higher_taxa.parquet  (data/dbt/target/sandbox/)
    |
    v
[species_export.py: _build_higher_taxa()]  (new function)
    |  computes slug collision check (hard-fail gate)
    |  retires higher_rank_taxon_ids.json
    v
public/data/higher_taxa.json  (new artifact)
    |
    +----> _data/species.js  (rewired: reads higher_taxa.json instead of string-grouping)
    |          |
    |          +--> genusList / tribeList / subgenusList / subfamilyList (new)
    |          v
    |      _pages/genus.njk / tribe.njk / subgenus.njk (rebuilt onto rollup)
    |      _pages/subfamily.njk (new)
    |
    +----> species_maps.py: _generate_group_maps()  (new subfamily pass)
               |
               v
           public/data/species-maps/subfamily/{Name}.svg  (new)
```

### Recommended Project Structure for New Files

```
data/dbt/models/
├── staging/
│   └── stg_inat__higher_rank_taxon_ids.sql  [NEW] all-rank ancestor taxon_id lookup
└── marts/
    ├── higher_taxa.sql                       [NEW] external parquet rollup
    └── schema.yml                            [EXTENDED] add higher_taxa contract

data/
└── species_export.py                         [MODIFIED] add _build_higher_taxa(), 
                                              retire _build_higher_rank_taxon_ids()

public/data/
└── higher_taxa.json                          [NEW artifact, replaces higher_rank_taxon_ids.json]
    
public/data/species-maps/
└── subfamily/
    └── {Name}.svg                            [NEW family of SVGs]

_pages/
└── subfamily.njk                             [NEW]

_data/
└── species.js                                [MODIFIED] rewire onto higher_taxa.json
```

---

### Pattern 1: Ancestor `taxon_id` Resolution in dbt (D-02)

The proven `stg_inat__genus_taxon_ids.sql` pattern reads `taxa.csv.gz` via `read_csv` and resolves
genus names to their `taxon_id`. For higher-rank ancestor resolution, the same approach extends to
resolving any species/occurrence's ANCESTOR at a given rank (subfamily, tribe, genus, subgenus) using
the `ancestry` column.

Key insight from `stg_inat__genus_taxon_ids.sql`: the `ancestry` field is a `/`-delimited list of
ancestor taxon_ids. To find a species' ancestor at rank X:

```sql
-- Source: data/dbt/models/staging/stg_inat__genus_taxon_ids.sql (proven pattern)
-- Extended pattern for higher-rank ancestor lookup:
-- 1. Enumerate all taxa at the target rank (e.g. subfamily)
-- 2. For each species, its ancestor at that rank is the one whose taxon_id
--    appears in the species' ancestry string.

-- New staging view: stg_inat__higher_rank_taxon_ids.sql
-- Returns one row per (rank, taxon_id) for all higher-rank bee ancestors.
WITH raw AS (
    SELECT
        taxon_id::INTEGER  AS taxon_id,
        name               AS name,
        rank               AS rank,
        ancestry           AS ancestry
    FROM read_csv(
        '../raw/taxa.csv.gz',
        delim = chr(9),
        header = true,
        compression = 'gzip',
        columns = {
            'taxon_id': 'BIGINT',
            'ancestry': 'VARCHAR',
            'rank_level': 'BIGINT',
            'rank': 'VARCHAR',
            'name': 'VARCHAR',
            'active': 'VARCHAR'
        }
    )
    WHERE rank IN ('subfamily', 'tribe', 'genus', 'subgenus')
      AND active = 'true'
      AND list_contains(string_split(ancestry, '/'), '630955')  -- Anthophila only
)
SELECT taxon_id, name, rank FROM raw
```

**Critical implementation note:** The species mart already carries per-species `taxon_id`. To resolve
the ANCESTOR at each rank for each species, join the species' `taxon_id` lineage_path (from the
`taxa` SQLite table or from the `ancestry` field of its own entry in `taxa.csv.gz`) against the
higher-rank taxon_ids above. The join key is: `list_contains(string_split(species_ancestry, '/'), higher_rank.taxon_id::VARCHAR)`.

However, the species mart does NOT carry the ancestry string. The simplest approach that avoids
re-reading taxa.csv.gz twice is to JOIN the staging view directly to the species mart via the
existing `stg_inat__taxon_lineage_extended` view which has `subfamily`, `tribe`, `genus`, `subgenus`
as name strings, OR to build a new staging view that maps species `taxon_id` → each ancestor
`taxon_id` at each rank using a self-join on the ancestry field.

**Recommended join path for the rollup:**

```sql
-- In higher_taxa.sql, the join to get ancestor taxon_ids is:
-- species.taxon_id -> find its ancestry string in taxa.csv.gz
-- -> match against each higher-rank taxon_id
-- This can be done as a set of LEFT JOINs on the ancestry string.
--
-- For genus: species in the mart already carry genus name; join
-- stg_inat__genus_taxon_ids (existing view) on lower(genus) = genus_name.
--
-- For tribe/subfamily/subgenus: a new staging view following the same pattern
-- but filtered to those ranks + Anthophila ancestry, giving name -> taxon_id.
-- Then join species mart on name match (tribe, subfamily, subgenus strings).
--
-- IMPORTANT: This name-match join is acceptable here because we are ONLY
-- resolving to taxon_id for the rollup key — the resulting rollup itself
-- is taxon_id-keyed (PAGE-01 satisfied). The name match is a join key, not
-- a grouping key.
```

**[ASSUMED]** The name-match join for tribe/subfamily/subgenus is safe when names are unique within
their rank among Anthophila. This is likely true (verified for genus by `stg_inat__genus_taxon_ids`
unique test) but requires a `unique` dbt test on the new staging view as a fail-loud safety net.

---

### Pattern 2: dbt Rollup Model Shape (D-10 Recommendation)

**Recommendation: one combined `marts/higher_taxa.sql` external parquet, using a WIDE format with
one row per higher-rank taxon (not a long edge format).**

Rationale: The Eleventy data layer needs to build `genusList`, `tribeList`, `subgenusList`,
`subfamilyList` — each a list of objects with counts and member lists. A WIDE format (one row per
higher-rank taxon with counts + a membership JSON array) maps directly to this without a secondary
reduce step.

```
Columns for higher_taxa.parquet:
  taxon_id      INTEGER    -- the higher-rank taxon's own taxon_id (PK)
  rank          VARCHAR    -- 'genus' | 'tribe' | 'subgenus' | 'subfamily'
  name          VARCHAR    -- raw capitalized name (as it appears in taxa.csv.gz)
  family        VARCHAR    -- parent family name (for breadcrumb)
  subfamily     VARCHAR    -- parent subfamily name (NULL for subfamily rows themselves)
  tribe         VARCHAR    -- parent tribe name (NULL for tribe/subfamily rows)
  genus         VARCHAR    -- parent genus name (NULL for genus/tribe/subfamily rows)
  specimen_count  BIGINT   -- SUM of member species specimen_counts
  inat_obs_count  BIGINT   -- SUM of member species inat_obs_counts
  occurrence_count BIGINT  -- SUM (for filtering out empty taxa)
  species_count   BIGINT   -- COUNT of member species in the universe
  member_taxon_ids VARCHAR -- JSON array of direct child taxon_ids (genera for subfamily, etc.)
```

**Alternative: counts model + separate membership model.** If the `member_taxon_ids` JSON array in
dbt gets unwieldy (e.g., DuckDB JSON aggregation syntax is complex), the planner may split:
- `marts/higher_taxa_counts.sql` — one row per taxon, counts only
- `marts/higher_taxa_edges.sql` — one row per (parent_taxon_id, child_taxon_id) edge

The Python export step then joins them before writing `higher_taxa.json`. Either shape satisfies
D-10; the single combined model is preferred for simplicity.

---

### Pattern 3: Eleventy Data Layer Rewire (D-03)

Current `_data/species.js` imports `higher_rank_taxon_ids.json` and uses it only for the `taxon_id`
lookup in `genusList` / `tribeList` / `subgenusList` (lines 154, 224, 264):

```javascript
// CURRENT (to be replaced):
taxon_id: higherRankTaxonIds.genus[g.genus] ?? null,

// NEW (reads from higher_taxa.json rollup):
taxon_id: higherTaxaByName.genus[g.genus]?.taxon_id ?? null,
```

The `genusList`, `tribeList`, `subgenusList` build loops in `species.js` currently string-group
`species.json` and sum per-species counts. After the rewire, these lists are built from
`higher_taxa.json` rows directly (the rollup already has the sums). The species list per genus/tribe
is derived from the rollup's member_taxon_ids or the membership edges, mapped back to the species
flat array by `taxon_id`.

**New `subfamilyList` in `species.js`** — follows the same pattern as `tribeList` but with an
additional nesting level: tribe headings within each subfamily, each tribe containing its genera.

```javascript
// Shape of each subfamilyList entry (consumed by _pages/subfamily.njk):
{
  subfamily: "Apinae",
  family: "Apidae",
  taxon_id: 67742,  // from rollup
  specimen_count: 3676,
  inat_obs_count: 10172,
  species_count: 98,
  tribes: [
    {
      tribe: "Bombini",
      taxon_id: 53850,
      specimen_count: 1768,
      inat_obs_count: 7763,
      genera: [
        { genus: "Bombus", taxon_id: 52775, specimen_count: 1768, inat_obs_count: 7763 }
      ]
    },
    // ...
  ],
  // D-05: tribe-less genera rendered as flat list (no tribe wrapper)
  // For Colletinae: tribes = [], genera = [{genus: "Colletes", ...}]
}
```

**`higher_rank_taxon_ids.json` retirement:** After `_data/species.js` is rewired to read
`higher_taxa.json`, remove the `readFileSync` import of `higher_rank_taxon_ids.json` from
`species.js`. The `species_export.py` `_build_higher_rank_taxon_ids()` function and its call in
`export_species_parquet()` are also retired. The artifact `public/data/higher_rank_taxon_ids.json`
is deleted and removed from `nightly.sh`'s `_upload_hashed` call and the `manifest.json` template.

---

### Pattern 4: Subfamily SVG Maps (D-06)

`_generate_group_maps()` in `species_maps.py` currently has three passes: genus, subgenus, tribe.
A fourth pass for subfamily is added, following the **same pattern** as the tribe pass but using
genus as the coloring granularity (not species).

```python
# In _generate_group_maps(), after the tribe pass:

# Subfamily maps: subfamily/<Name>.svg  (colored by genus)
subfamily_dir = maps_dir / "subfamily"
subfamily_members: dict[str, list[str]] = defaultdict(list)  # subfamily_name -> canonical_names

# Build per-subfamily genus membership from species rows
for canonical_name, genus, subgenus, tribe, specific_epithet, subfamily in rows_extended:
    if subfamily:
        subfamily_members[subfamily].append(canonical_name)

# But color by GENUS, not species — so the color map keys on genus canonical names
# The swatch in the HTML template also shows genus-level colors.
for subfamily_name in sorted(subfamily_members.keys()):
    member_species = subfamily_members[subfamily_name]
    # Get the unique genera for this subfamily
    genera_for_sf = sorted(set(g for g in ... if ...))  # derive from member_species
    genus_colors = _group_colors(genera_for_sf)  # one color per genus
    # Map each species to its genus color
    species_points = {c: occ_by_canon.get(c, []) for c in member_species}
    colors = {c: genus_colors.get(genus_of[c], '#aaaaaa') for c in member_species}
    total_clipped += _write_group_svg(subfamily_name, species_points, colors, backdrop, subfamily_dir)
```

**Key difference from other group maps:** `_group_colors` is called with genera (not species), so
the `N` in `hue = i * 360 / N` is the genus count. The result is one solid color per genus across
all its member species in the SVG.

**D-08 gating:** The `species.parquet` `WHERE occurrence_count > 0` query that `_generate_group_maps`
uses filters to species with occurrences. The subfamily gating (is_anthophila + ≥1 member genus) is
naturally satisfied if the loop over `species.parquet` only sees bee species (the family gate in
`int_species_universe` already excludes non-bees). Eumeninae will have 0 bee species in `species.parquet`,
so no map is generated. No explicit Eumeninae exclusion is needed in Python — the data gate is
already in the dbt bee-family filter.

**Checklist county fill for subfamily maps:** The existing `_write_group_svg` does NOT draw
checklist county fills (only `_write_species_svg` does). For subfamily pages, the checklist fill is
not rendered at the group SVG level (consistent with genus/tribe maps). This is the existing behavior
— no change needed. [ASSUMED] The design intent doesn't require county fills on group maps.

---

### Pattern 5: Slug Collision Check (D-07, PAGE-03)

**Location:** Python build step in `species_export.py`, called from `export_species_parquet()`, AFTER
all higher-rank taxon_ids and names are known. [CITED: CONTEXT.md §Established Patterns — "The
collision check likely belongs in the page-generation / Python build step where all final URLs are
known, not in dbt"]

**URL scheme per rank** (from D-07):
```python
URL_SCHEME = {
    'genus':     lambda t: f"/species/{t['name']}/",
    'subgenus':  lambda t: f"/species/{t['genus']}/{t['name']}/",
    'tribe':     lambda t: f"/species/tribe/{t['name']}/",
    'subfamily': lambda t: f"/species/subfamily/{t['name']}/",
    # species slugs: /species/{Genus}/{epithet}/ — computed separately in species_export
}
```

**Important note on `domain.slugify`:** Higher-rank URLs use raw capitalized names (not slugified),
per CONTEXT.md §Established Patterns. Only species slugs go through `domain.slugify()`. The
collision check should use the same raw-name URL for higher ranks. Subfamily names are already
URL-safe ASCII (e.g., "Apinae"), so no transliteration is needed — but the check should still be
applied.

**Implementation:**
```python
def _check_slug_collisions(higher_taxa_rows, species_rows) -> None:
    """Hard-fail if any two distinct taxa produce the same public URL.
    
    Called in export_species_parquet() after all taxon names are resolved.
    """
    seen: dict[str, tuple] = {}  # url -> (taxon_id, rank, name)
    for row in higher_taxa_rows:
        url = _url_for_taxon(row)
        key = (row['taxon_id'], row['rank'], row['name'])
        if url in seen and seen[url] != key:
            raise AssertionError(
                f"Slug collision: {seen[url]} and {key} both produce URL {url!r}. "
                f"Resolve the genuine name clash deliberately — no auto-suffix."
            )
        seen[url] = key
    for sp in species_rows:
        url = f"/species/{sp['slug']}/"
        key = (sp['taxon_id'], 'species', sp['canonical_name'])
        if url in seen:
            raise AssertionError(
                f"Slug collision between species {key!r} and existing {seen[url]!r} at URL {url!r}"
            )
        seen[url] = key
```

**Bombus ambiguity:** The current data has Bombus as both a genus (`/species/Bombus/`) and a subgenus
(`/species/Bombus/Bombus/`). These are distinct URLs — no collision. The check must compare full
URL paths, not just names.

---

### Pattern 6: Pipeline Integration (run.py + nightly.sh)

**New artifact:** `public/data/higher_taxa.json` produced by `species_export.py` (new function
`_build_higher_taxa`).

**run.py STEPS changes:**
- No new steps needed. `higher_taxa.json` is emitted by the existing `"species-export"` step.
- The dbt rollup model is built in the existing `"dbt-build"` step.
- `"species-maps"` step gains the subfamily pass in `_generate_group_maps`.

**nightly.sh changes:**
- Add `higher_taxa_name=$(_upload_hashed "$EXPORT_DIR/higher_taxa.json" "higher_taxa")` (replaces
  the `higher_rank_taxon_ids` line).
- Update `manifest.json` template: replace `"higher_rank_taxon_ids": "$higher_rank_name"` with
  `"higher_taxa": "$higher_taxa_name"`.
- The `species-maps/` recursive S3 sync already covers `species-maps/subfamily/` because it uses
  `--recursive` on the directory. No nightly.sh change needed for the new SVGs.
- CloudFront invalidation path `/data/species-maps/*` already covers subfamily SVGs.

**IMPORTANT:** `higher_rank_taxon_ids.json` is in the current `manifest.json` template and is read
at build time by `_data/species.js`. The rename/retirement must be done atomically:
  1. Ship `higher_taxa.json` (new artifact)
  2. Update `_data/species.js` to read `higher_taxa.json` (not `higher_rank_taxon_ids.json`)
  3. Remove `higher_rank_taxon_ids.json` upload from `nightly.sh`
  4. Keep `higher_rank_taxon_ids.json` in `public/data/` until the eleventy rewire is verified

**Eleventy build-time:** `_data/species.js` reads `public/data/higher_taxa.json` at build time (same
as the current `species.json` read pattern). No changes to `eleventy.config.js`.

---

### Anti-Patterns to Avoid

- **String-grouping in the rollup:** The existing `_data/species.js` groups by `sp.genus`, `sp.tribe`,
  etc. string fields. The new rollup must group by `taxon_id`, not name — but the current data
  has no same-named taxa at different ranks causing visible bugs. The test that validates PAGE-01
  is correctness at the data level (see Validation Architecture).

- **Re-computing higher_taxa.json in Eleventy:** Do NOT derive `subfamilyList` by string-grouping
  `species.json` in `species.js` — that's exactly what PAGE-01 requires us to stop doing. Read the
  rollup artifact directly.

- **Emitting subfamily maps from the Eleventy template** (server-side image generation): SVGs are
  pre-built by the Python pipeline and referenced by path in the template. No change to this pattern.

- **Collision check in dbt:** Slug computation uses `unicodedata.normalize('NFKD')` which is not
  SQL-reproducible. The check belongs in Python.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Ancestor taxon_id from ancestry string | Custom parser | `read_csv` + `list_contains(string_split(ancestry, '/'), ...)` | Proven pattern in `stg_inat__genus_taxon_ids.sql`; DuckDB list functions handle it natively |
| Deterministic HSL coloring | New color function | `_group_colors(canonical_names)` in `species_maps.py` | Already deterministic, pure, tested |
| Per-county SVG polygon rendering | Custom SVG writer | `_write_group_svg` in `species_maps.py` | Already handles group coloring, bbox clipping, attribute sort for idempotency |
| Eleventy pagination (one page per taxon) | Custom generator | Eleventy `pagination:` frontmatter | Existing pattern in `genus.njk`, `tribe.njk`, `subgenus.njk` |
| Unicode slug normalization | Inline `str.lower()` | `domain.slugify()` | Phase 78 D-01 byte-for-byte invariant; all callers must use this single function |

---

## Common Pitfalls

### Pitfall 1: Rollup counts drift from per-species counts
**What goes wrong:** The rollup's `specimen_count` for a genus does not match the sum of per-species
`specimen_count` values shown on the genus page. This breaks success criterion 1 (count-equivalence
spot-check).
**Why it happens:** The rollup queries `int_species_universe` (which has the correct aggregation
logic including the `DISTINCT ON (canonical_name)` dedup) but the join to ancestor taxon_ids
introduces duplication if a species resolves to multiple ancestor rows at the same rank.
**How to avoid:** The dbt rollup model must be a `GROUP BY ancestor_taxon_id` with `SUM`
aggregation — not a JOIN that fans out. Verify with a dbt test: `assert SUM(genus_rollup.specimen_count)
= SUM(species.specimen_count)` across all bee species.
**Warning signs:** Any genus page showing totals different from the sum of its species' individual counts.

### Pitfall 2: `hslToHex` vs. `_group_colors` color mismatch for subfamily swatches
**What goes wrong:** The genus-level swatches on the subfamily page HTML use `hslToHex` in
`_data/species.js` but the SVG map uses `_group_colors` in Python. The two implementations must
produce identical hex strings for the same genus at the same color index.
**Why it happens:** `hslToHex` in `species.js` mirrors Python's `colorsys.hls_to_rgb` — the formula
is numerically equivalent but any deviation causes swatch/dot color mismatch.
**How to avoid:** For subfamily pages, the genus-level color assignment uses `_group_colors` inputs
(alphabetically sorted genera for the subfamily, NOT all species). The `species.js` `hslToHex` call
for subfamily swatches must use the same sorted genus list as the Python map pass.
**Warning signs:** Genus swatch color on the page doesn't match the dot cluster color on the map.

### Pitfall 3: `higher_rank_taxon_ids.json` still referenced after retirement
**What goes wrong:** Build fails because `_data/species.js` tries to read the old file path after it
is removed from `public/data/`.
**Why it happens:** The retirement of `_build_higher_rank_taxon_ids` and its artifact must be
coordinated with the `species.js` rewrite. If `species.js` still has `readFileSync(higherRankTaxonIdsPath)`
but the file is gone, the Eleventy build throws.
**How to avoid:** The plan must sequence the rewire and retirement as a single wave: update
`species.js` to read `higher_taxa.json` BEFORE removing the old artifact's generation code.
**Warning signs:** `npm run build` or `npm run dev` throws `ENOENT: no such file or directory`.

### Pitfall 4: Eumeninae page generated (HIER-05 violation)
**What goes wrong:** A subfamily page `/species/subfamily/Eumeninae/` is published, putting a wasp
page on a bee-only surface.
**Why it happens:** Eumeninae exists in the `taxa` table with `is_anthophila=0` and appears in the
hierarchy for bycatch name resolution. If the rollup model or the `species.js` subfamilyList build
doesn't gate on `is_anthophila`, Eumeninae appears.
**How to avoid:** The natural data gate is the bee-family WHERE clause in `int_species_universe`.
Eumeninae species don't appear in `species.parquet` (they fail the family filter). Therefore the
rollup model built FROM species.parquet will naturally have 0 members for Eumeninae, and the D-08
filter (`≥1 member genus`) will exclude it. Verify with a test: `assert 'Eumeninae' not in
subfamilyList.map(s => s.subfamily)`.
**Warning signs:** 13 subfamily pages generated instead of 12.

### Pitfall 5: Subgenus/genus Bombus URL collision check false alarm
**What goes wrong:** The collision check hard-fails because both `genus:Bombus` → `/species/Bombus/`
and `subgenus:Bombus` → `/species/Bombus/Bombus/` look like a collision to a naive check.
**Why it happens:** Not a collision — the URLs are distinct. The check must compare FULL URL paths.
`/species/Bombus/` ≠ `/species/Bombus/Bombus/`.
**How to avoid:** The collision check dict key must be the full URL string, not just the name.
The current data has no genuine collision.
**Warning signs:** Build fails during collision check even though the page would work correctly.

### Pitfall 6: Subfamily map missing `checklist.parquet`-based county fills
**What goes wrong:** Checklist-present counties (blue fill) are absent on subfamily maps even though
they appear on genus/tribe maps.
**Why it happens:** `_write_group_svg` does not draw checklist county fills (only `_write_species_svg`
does). The existing genus/tribe group maps also don't have county fills — this is consistent behavior.
**How to avoid:** Do not add county fill logic to `_write_group_svg`. The PAGE-04 requirement (checklist
species on pages) applies to the species LIST on the page, not the SVG map's county fills. The
species list behavior is preserved by D-09.
**Warning signs:** N/A — this is correct behavior.

---

## Runtime State Inventory

> Greenfield additions + data-pipeline changes. The rename/refactor inventory does not apply
> fully, but the `higher_rank_taxon_ids.json` retirement is a soft migration.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `public/data/higher_rank_taxon_ids.json` — flat JSON file, not a DB record | Delete file + remove from nightly.sh manifest after `species.js` rewire |
| Live service config | `nightly.sh` manifest.json template references `higher_rank_taxon_ids` key | Update manifest template key and `_upload_hashed` call |
| OS-registered state | None | None |
| Secrets/env vars | `EXPORT_DIR`, `DB_PATH`, `DBT_SANDBOX_DIR` — code rename only, no key changes | No change needed |
| Build artifacts | `public/data/species-maps/subfamily/` — new directory, not stale | Created fresh by `species_maps.py` wipe-and-rewrite (D-04 idempotency pattern) |

**Nothing found in other categories:** Verified by reading `nightly.sh`, `run.py`, `species_export.py`.

---

## Data Facts (from current `species.json` / `higher_rank_taxon_ids.json`)

Used for the spot-check baseline (success criterion 1).

### Current subfamilies in bee species universe (pre-normalization baseline)

| Subfamily | Species | Genera | Tribes | Specimen count | iNat obs count |
|-----------|---------|--------|--------|----------------|----------------|
| Andreninae | 108 | 1 | 1 | 3,589 | 2,735 |
| Apinae | 98 | 11 | 6 | 3,676 | 10,172 |
| Colletinae | 15 | 1 | 0 | 669 | 312 |
| Halictinae | 88 | 4 | 1 | 5,191 | 2,763 |
| Hylaeinae | 16 | 1 | 0 | 343 | 29 |
| Megachilinae | 194 | 15 | 4 | 3,317 | 1,641 |
| Melittinae | 1 | 1 | 0 | 0 | 0 |
| Nomadinae | 49 | 5 | 4 | 694 | 697 |
| Nomiinae | 1 | 1 | 0 | 2 | 15 |
| Panurginae | 19 | 3 | 2 | 330 | 125 |
| Rophitinae | 7 | 1 | 0 | 40 | 15 |
| Xylocopinae | 6 | 2 | 2 | 497 | 104 |
| **Total (12)** | **602** | | | **18,348** | **18,608** |

**Note on tribe-less subfamilies (D-05):** Colletinae, Hylaeinae, Melittinae, Nomiinae, Rophitinae
all have 0 tribes in current data — their single genus has no tribe assignment. These degrade to
flat genus lists per D-05. No "mixed" subfamilies exist (all genera in a subfamily either all have
tribes, or none do).

### Sample baseline counts for cross-family spot-check

| Taxon | Rank | Specimen count | iNat obs count |
|-------|------|----------------|----------------|
| Andrena | genus | 3,589 | 2,735 |
| Bombus | genus | 1,768 | 7,763 |
| Megachile | genus | 1,186 | 480 |
| Lasioglossum | genus | 1,718 | 115 |
| Osmia | genus | 1,110 | 450 |
| Nomada | genus | 565 | 616 |
| Bombini | tribe | 1,768 | 7,763 |
| Andrenini | tribe | 3,589 | 2,735 |
| Osmiini | tribe | 1,696 | 483 |
| Bombus/Pyrobombus | subgenus | 1,465 | — |

These are derived from current string-grouping in `species.json`. The new rollup should produce
identical values (success criterion 1).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest (Python pipeline tests); Vitest (frontend) |
| Config file | `data/pyproject.toml` (pytest); `vitest.config.ts` (frontend) |
| Quick run command | `cd data && uv run pytest tests/test_species_export.py tests/test_species_maps.py -x` |
| Full pipeline test suite | `cd data && uv run pytest -x` |
| Frontend test suite | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAGE-01 | Genus/tribe/subgenus totals from rollup match pre-normalization string-sum baseline (count-equivalence spot-check) | pytest (sandbox-gated) | `cd data && uv run pytest tests/test_higher_taxa.py -x` | ❌ Wave 0 |
| PAGE-01 | rollup model produces non-zero row count per rank; no NULL taxon_ids | dbt test in `schema.yml` | `bash data/dbt/run.sh test --select higher_taxa` | ❌ Wave 0 |
| PAGE-01 | `genusList` / `tribeList` in `species.js` read from rollup (not string-grouped) | Vitest unit | `npm test -- data-species.test.ts` | ✅ partial (file exists; new assertions needed) |
| PAGE-02 | `subfamilyList` contains exactly 12 entries; no Eumeninae | Vitest unit | `npm test -- data-species.test.ts` | ❌ Wave 0 (new assertions in existing file) |
| PAGE-02 | Subfamily SVG files exist for all 12 bee subfamilies | pytest (sandbox-gated) | `cd data && uv run pytest tests/test_species_maps.py -x` | ✅ partial (new test case needed) |
| PAGE-03 | Slug collision check runs and hard-fails on synthetic collision | pytest unit | `cd data && uv run pytest tests/test_species_export.py -x` | ✅ partial (new test case needed) |
| PAGE-03 | No collision among real data: all URLs unique across all 12 subfamilies + N tribes + N genera + N subgenera + N species | pytest (sandbox-gated) | `cd data && uv run pytest tests/test_species_export.py::test_slug_collision_clean -x` | ❌ Wave 0 |
| PAGE-04 | Checklist-only species appear in genus/subgenus member lists from rollup | pytest unit | `cd data && uv run pytest tests/test_higher_taxa.py -x` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd data && uv run pytest tests/test_species_export.py tests/test_species_maps.py -x && npm test`
- **Per wave merge:** `cd data && uv run pytest -x && npm test`
- **Phase gate:** Full suite green + `npm run build` succeeds before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `data/tests/test_higher_taxa.py` — unit tests for the new dbt rollup model:
  - count-equivalence spot-check against baseline (sandbox-gated)
  - no Eumeninae in rollup rows
  - checklist-only species membership coverage (PAGE-04)
  - rollup counts match per-species sums
- [ ] New assertions in `data/tests/test_species_maps.py`:
  - `_generate_group_maps` emits `species-maps/subfamily/{Name}.svg` for each of the 12 bee subfamilies
  - Genus-level coloring: all circles in an Apinae SVG for genus Bombus use the same hex color
- [ ] New assertions in `data/tests/test_species_export.py`:
  - `_check_slug_collisions` hard-fails with `AssertionError` on a synthetic collision
  - `_check_slug_collisions` passes on current real data (sandbox-gated)
  - `higher_rank_taxon_ids.json` is no longer emitted after the retirement
- [ ] `data/dbt/models/marts/schema.yml` — add `higher_taxa` contract (see §dbt Contract Shape below)
- [ ] New assertions in `src/tests/data-species.test.ts`:
  - `species.subfamilyList` has length 12
  - `species.subfamilyList` contains no entry with `subfamily === 'Eumeninae'`
  - Each `subfamilyList` entry has `taxon_id` set (non-null integer)
  - `genusList[i].taxon_id` is now populated from rollup (not `higher_rank_taxon_ids.json`)

### dbt Contract Shape for `higher_taxa` (recommended)

Add to `data/dbt/models/marts/schema.yml`:

```yaml
- name: higher_taxa
  config:
    contract:
      enforced: true
  columns:
    - name: taxon_id
      data_type: integer
      constraints:
        - type: not_null
      data_tests:
        - not_null
        - unique
    - name: rank
      data_type: varchar
      constraints:
        - type: not_null
    - name: name
      data_type: varchar
      constraints:
        - type: not_null
    - name: family
      data_type: varchar
    - name: subfamily
      data_type: varchar
    - name: tribe
      data_type: varchar
    - name: genus
      data_type: varchar
    - name: specimen_count
      data_type: bigint
    - name: inat_obs_count
      data_type: bigint
    - name: occurrence_count
      data_type: bigint
    - name: species_count
      data_type: bigint
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.14+ | All pipeline steps | ✓ | (project constraint) | — |
| DuckDB (uv) | dbt rollup model | ✓ | (existing) | — |
| taxa.csv.gz | `stg_inat__higher_rank_taxon_ids.sql` | ✓ | (downloaded by taxa-download step) | — |
| `public/data/species.parquet` | `_generate_group_maps()` (subfamily pass) | ✓ | (written by species-export step) | — |
| `public/data/occurrences.parquet` | SVG map occurrence points | ✓ | (written by dbt-build step) | — |

All dependencies are produced earlier in the STEPS pipeline. No blocking missing dependencies.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| String-group `species.json` in `species.js` for genus/tribe/subgenus lists | Read `higher_taxa.json` rollup from dbt | PAGE-01: `taxon_id`-keyed grouping, no string collation fragility |
| `higher_rank_taxon_ids.json` (separate artifact for iNat link taxon_ids) | `higher_taxa.json` (rollup carries taxon_ids inline) | One fewer S3 artifact; one fewer Python builder function |
| No subfamily pages | 12 subfamily pages at `/species/subfamily/{Name}/` | PAGE-02 complete |
| No slug collision check | Hard-fail assertion across all ranks at build time | PAGE-03 enforced |

---

## Open Questions

1. **Member list representation in the rollup (D-10)**
   - What we know: D-10 says membership edges should be `taxon_id`-derived; the planner has discretion
     to split into counts + edges model.
   - What's unclear: Whether DuckDB's `list_aggregate` / JSON array aggregation is ergonomic enough
     in a single dbt model, or whether a separate edges mart simplifies the implementation.
   - Recommendation: Start with a single combined model. If the SQL gets complex (e.g., `ARRAY_AGG(DISTINCT
     child_taxon_id)` across different rank-pair combinations), split at planning time.

2. **`_data/species.js` reads `higher_taxa.json` at build time: file-not-found on first dev setup**
   - What we know: Currently `higher_rank_taxon_ids.json` is read with `readFileSync`; if absent,
     build throws. The new file has the same pattern.
   - What's unclear: Whether `scripts/make-local-manifest.js` or `scripts/fetch-data.sh` should
     be updated to download `higher_taxa.json` instead of `higher_rank_taxon_ids.json`.
   - Recommendation: Update `fetch-data.sh` (which downloads pre-built artifacts from S3) to
     fetch `higher_taxa.json`; the manifest key change handles the hashed URL lookup.

3. **Checklist-county SVG fills for subfamily maps (D-09)**
   - What we know: `_write_group_svg` does not draw checklist county fills. Genus/tribe maps also
     lack county fills.
   - What's unclear: Whether PAGE-04 requires county fills on subfamily map SVGs, or only that
     checklist species appear in the member list.
   - Recommendation: No county fills on group SVGs — consistent with existing behavior (PAGE-04
     applies to the species list, not the map).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Tribe/subfamily/subgenus names are unique within rank among Anthophila taxa (needed for name→taxon_id join in the new staging view) | Architecture Patterns §Pattern 1 | Rollup would have duplicate rows for homonymous taxa; mitigated by a `unique` dbt test on the staging view |
| A2 | No "mixed" subfamily exists with both tribe-assigned and tribe-less genera in current data | Data Facts + D-05 | D-05 graceful degradation assumption needs a second case; verified clean by data check above |
| A3 | County fill is not required on group SVGs (including new subfamily SVGs) | Common Pitfalls §Pitfall 6 | PAGE-04 would be incompletely implemented if county fills are expected on maps |
| A4 | `fetch-data.sh` and `make-local-manifest.js` need updating for the `higher_taxa.json` rename | Open Questions | Dev build throws `ENOENT` until updated |

---

## Sources

### Primary (HIGH confidence — directly verified from codebase)
- `data/dbt/models/staging/stg_inat__genus_taxon_ids.sql` — ancestor resolution pattern, `read_csv` usage, Animalia filter, unique test
- `data/dbt/models/staging/stg_inat__taxon_lineage_extended.sql` — name-based lineage columns available
- `data/dbt/models/intermediate/int_species_universe.sql` — membership gating (FULL OUTER JOIN, bee-family WHERE clause)
- `data/dbt/models/marts/species.sql` — 21-col species mart, external parquet, slug omitted
- `data/dbt/models/marts/schema.yml` — enforced contract pattern for both occurrences and species
- `data/species_export.py` — `_build_higher_rank_taxon_ids`, `SPECIES_COLUMNS`, export pattern
- `data/species_maps.py` — `_group_colors`, `_write_group_svg`, `_generate_group_maps`
- `data/domain.py` — `slugify()` implementation
- `_data/species.js` — current `genusList`/`tribeList`/`subgenusList` build pattern, `higherRankTaxonIds` usage
- `_pages/genus.njk`, `_pages/tribe.njk`, `_pages/subgenus.njk` — pagination frontmatter pattern
- `data/run.py` — STEPS list, dbt-build + species-export + species-maps ordering
- `data/nightly.sh` — S3 upload pattern, manifest.json template, `higher_rank_taxon_ids` reference
- `.planning/phases/129-hierarchy-foundation/129-VERIFICATION.md` — 13 subfamilies in hierarchy (12 bee + Eumeninae), `is_anthophila` semantics, Anthophila root 630955
- `public/data/species.json` — live data: 12 subfamilies, per-subfamily species/tribe/genus counts, baseline totals

### Secondary (MEDIUM confidence)
- `.planning/phases/132-page-rebuild-subfamily-pages/132-CONTEXT.md` — all locked decisions D-01..D-10

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all extensions of existing verified patterns
- Architecture (rollup model shape): MEDIUM — D-10 is "leaning" not locked; planner has discretion
- Pitfalls: HIGH — derived from direct code reading of the affected modules
- Data facts: HIGH — computed from live `public/data/species.json`

**Research date:** 2026-06-02
**Valid until:** 2026-07-02 (stable domain; taxa data changes nightly but schema is stable)
