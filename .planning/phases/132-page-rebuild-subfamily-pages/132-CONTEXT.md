# Phase 132: Page Rebuild & Subfamily Pages - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Rebuild the existing taxon static pages (genus, subgenus, tribe) so their
"N specimens · N community observations" totals and SVG occurrence maps derive
from the `taxon_id` hierarchy instead of denormalized rank-string grouping, and
add new **subfamily** pages at `/species/subfamily/{Name}/`. Public slugs stay
name-based; page generation keys on `taxon_id` internally; no two taxa at
different ranks may produce the same public URL. Covers PAGE-01, PAGE-02,
PAGE-03, PAGE-04.

**In scope:**
- New dbt rollup model producing hierarchy-keyed higher-rank totals (and
  membership) for genus/subgenus/tribe/subfamily.
- Subfamily page template + generation (tribes → genera nested layout).
- Subfamily SVG occurrence maps (colored by genus), consistent with existing
  group-map generation in `data/species_maps.py`.
- Pre-generation slug-collision check across all ranks (hard-fail).
- Re-pointing genus/subgenus/tribe page totals + maps onto the hierarchy rollup.

**Out of scope:**
- Complex-rank pages (PAGE-05 — **dropped** in Phase 129; 0 complex-rank
  occurrences; complex nodes deep-link to filtered map views, no static page).
- The `/species` browse tree (Phase 133, TREE-01..04).
- Changing the species mart's retained rank-name strings (Phase 131 deliberately
  kept them on the `species` mart).
- Map filtering / autocomplete (delivered in Phase 130).

</domain>

<decisions>
## Implementation Decisions

### Where the rollups live (Area 1)
- **D-01 — Hierarchy-keyed higher-rank rollups are produced by a NEW dbt model.**
  One row per higher-rank taxon (subfamily/tribe/genus/subgenus), keyed by
  `taxon_id`, with rolled-up `specimen_count` / `inat_obs_count` (and the counts
  the existing pages render). Chosen over a Python post-step or build-time JS to
  honor the "dbt is the sole producer of pipeline outputs" invariant and make the
  rollup testable in dbt/pytest. `_data/species.js` + the `.njk` templates become
  thin presenters of this artifact rather than re-deriving counts.
- **D-02 — The rollup resolves ancestors by reading `taxa.csv.gz` natively in
  dbt**, extending the existing `stg_inat__genus_taxon_ids.sql` pattern (which
  already `read_csv`s the raw dump for `rank` + `ancestry` + `taxon_id`) to all
  surfaced higher ranks. Each species/occurrence is grouped by its **ancestor
  `taxon_id`** at each rank — NOT by rank-name strings (this is the core PAGE-01
  requirement). No dependency on the Python-built `occurrences.db`/`taxa` table;
  `taxa.csv.gz` is the single source.
- **D-03 — Supersede `higher_rank_taxon_ids.json`.** Today
  `species_export._build_higher_rank_taxon_ids` builds the name→taxon_id map that
  supplies each genus/tribe/subgenus page's "View on iNaturalist" link. The new
  dbt rollup is already keyed on those same taxon_ids, so it becomes the single
  source of higher-rank taxon_ids; retire `higher_rank_taxon_ids.json` and its
  Python builder, and rewire the eleventy data layer + iNat-link rendering onto
  the dbt rollup.

### Subfamily page content (Area 2)
- **D-04 — Subfamily pages use a tribes → genera NESTED layout.** Tribes appear
  as headings (each → its `/species/tribe/{Tribe}/` page) with their genera
  nested beneath (each → its `/species/{Genus}/` page). This is a new layout
  pattern not used on existing taxon pages (genus lists species; tribe lists
  genera) — accepted deliberately for richer browse.
- **D-05 — Tribe-less genera render as a flat list with no heading.** The 5
  single-genus subfamilies (Colletinae, Rophitinae, Hylaeinae, Melittinae,
  Nomiinae) have a genus with no tribe; their pages degrade to a plain genus
  list (no empty tribe nesting chrome). Any future tribe-less genus in a
  multi-tribe subfamily renders directly under the subfamily, no "Other genera"
  bucket. Graceful degradation over explicit bucketing.
- **D-06 — Subfamily SVG occurrence maps are colored by GENUS** (one color per
  genus), with a genus-level swatch in the nested list correlating to map dots.
  Per-species coloring (current genus/tribe/subgenus map behavior) would be
  hundreds of colors across a whole subfamily — illegible. Color-by-genus matches
  the page's genus-level swatches. Reuses the deterministic HSL→hex coloring in
  `data/species_maps.py` (`_group_colors`), just at genus granularity.

### Slug collisions (PAGE-03)
- **D-07 — Pre-generation collision check HARD-FAILS the build.** A
  generation-time assertion enumerates every taxon's public URL across all ranks
  and errors out (stops the build) if two distinct taxa collide — matching the
  project's fail-loud gate philosophy (Phase 129 orphan-`taxon_id` nightly gate,
  dbt `enforced` contracts). NO deterministic-suffix auto-resolution (silent URL
  changes break inbound links). Collisions among taxon names are rare, so this
  rarely fires; when it does a human resolves the genuine clash deliberately.
  Current scheme: genus `/species/{Genus}/`, subgenus `/species/{Genus}/{Subgenus}/`,
  tribe `/species/tribe/{Tribe}/`, species `/species/{Genus}/{epithet}/`,
  subfamily `/species/subfamily/{Name}/` (higher ranks use raw capitalized names;
  only species slugs are lowercased — keep this convention for subfamily).

### Subfamily coverage (PAGE-02)
- **D-08 — Generate pages only for bee subfamilies (`is_anthophila = 1`) that
  have ≥1 member genus in the bee species universe.** This yields the **12**
  subfamilies present in the species mart and EXCLUDES **Eumeninae** — the 13th
  subfamily node in the hierarchy, which is potter *wasps* (bycatch), present only
  because a non-bee occurrence carries it. Generating "all 13" would publish a
  wasp page, violating **HIER-05** (bycatch must never appear on bee-only
  surfaces). Gating on members also matches how `genusList`/`tribeList` are built
  today (only taxa with members get pages).

### Checklist-only species (PAGE-04)
- **D-09 — Preserve existing checklist treatment unchanged.** Checklist-only bee
  species keep their current rendering (grey swatch + "N checklist records" when
  `occurrence_count === 0 && on_checklist`, per `genus.njk`/`subgenus.njk` and
  `species.js`). The only change is that the data feeding it comes from the
  hierarchy rollup, not string grouping. Behavior preserved on all rebuilt pages
  and on the new subfamily pages.

### Claude's Discretion
- **D-10 — Rollup artifact carries membership edges, not just counts (leaning).**
  User delegated the counts-only vs counts+membership split. Recommendation:
  emit the `taxon_id`-based parent→child membership edges alongside the counts so
  member lists (genus→species, tribe→genera, subfamily→tribes→genera) are
  hierarchy-derived too — fully honoring PAGE-01 (no string grouping anywhere)
  and keeping `.njk` templates pure-presentation. Planner may split this
  differently if a single combined dbt model gets unwieldy (e.g. a counts model
  + a separate edges model), provided member lists are still taxon_id-derived.
- Exact shape/location of the new dbt model (one combined `higher_taxa` mart vs
  per-rank), its `schema.yml` contract, and the eleventy data wiring are left to
  research/planning, constrained by D-01..D-03 and D-10.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & prior decisions
- `.planning/ROADMAP.md` §"Phase 132" — goal + success criteria (PAGE-01..04).
- `.planning/REQUIREMENTS.md` — PAGE-01..05 wording; PAGE-05 deferred/dropped.
- `.planning/phases/129-hierarchy-foundation/129-VERIFICATION.md` — PAGE-05
  dropped decision; complex/bycatch counts; subfamily count (13 in hierarchy,
  incl. bycatch Eumeninae); `is_anthophila` semantics; lineage_path format.
- `.planning/phases/131-occurrence-normalization/131-CONTEXT.md` — confirms the
  `species` mart RETAINS rank-name strings (NORM-03 excluded it); the occurrences
  mart drops happened there, not here.

### Page generation (rebuild targets)
- `_pages/genus.njk` — genus page; lists species w/ swatches; `/species/{Genus}/`.
- `_pages/tribe.njk` — tribe page; lists genera; `/species/tribe/{Tribe}/`.
- `_pages/subgenus.njk` — subgenus page; lists species; `/species/{Genus}/{Subgenus}/`.
- `_data/species.js` — Eleventy build-time feed; currently builds
  `genusList`/`subgenusList`/`tribeList` by string-grouping `species.json` and
  summing per-species counts. This is the string-grouping PAGE-01 replaces.
- `_layouts/default.njk` (via `layout: default.njk`) — page chrome.

### Data pipeline (rollup source + maps)
- `data/dbt/models/marts/species.sql` — 21-col species mart (retains rank-name
  strings + per-species `taxon_id` + counts); upstream of the new rollup.
- `data/dbt/models/staging/stg_inat__genus_taxon_ids.sql` — the `read_csv`
  pattern for resolving names→taxon_ids from `taxa.csv.gz` (extend to all ranks).
- `data/dbt/models/staging/stg_inat__taxon_lineage_extended.sql` — name-based
  lineage (family/subfamily/tribe/genus/subgenus per taxon_id).
- `data/dbt/models/intermediate/int_species_universe.sql` — bee species universe
  membership gating (occurrence + checklist).
- `data/species_export.py` — `_build_higher_rank_taxon_ids` (to be superseded,
  D-03) + slug post-step (`SPECIES_COLUMNS`, slug via `domain.slugify`).
- `data/species_maps.py` — `_generate_group_maps` / `_group_colors` /
  `_write_group_svg`; add subfamily maps (color-by-genus, D-06).
- `data/domain.py` — `slugify()` (name-based slugs; collision check uses this).
- `data/dbt/models/marts/schema.yml` — contract location for any new dbt model.

### Hierarchy (descendant queries)
- `data/sqlite_export.py` `_build_taxon_hierarchy` — `taxa` table schema
  (`taxon_id, rank, name, lineage_path, is_anthophila`) in `occurrences.db`;
  Anthophila root `630955`; bycatch `is_anthophila=0`. (Reference for semantics;
  D-02 reads `taxa.csv.gz` directly in dbt rather than depending on this table.)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `data/species_maps.py` `_group_colors` / `_write_group_svg`: deterministic
  HSL→hex coloring + WA-county-background SVG renderer — reuse at genus
  granularity for subfamily maps (D-06). Existing checklist-county fill logic
  carries over for PAGE-04.
- `stg_inat__genus_taxon_ids.sql`: proven dbt `read_csv('../raw/taxa.csv.gz', …)`
  pattern with rank/ancestry — template for ancestor-taxon_id resolution (D-02).
- `domain.slugify()`: single slug function; basis for the collision check (D-07).
- `_data/species.js`: pagination wiring for one-page-per-taxon — clone for the
  subfamily list once it reads the dbt rollup.

### Established Patterns
- Higher-rank URLs use raw capitalized names; only species slugs are lowercased.
  Keep this for subfamily (`/species/subfamily/{Name}/`).
- Fail-loud gates (Phase 129 orphan assertion; dbt `enforced` contracts) — the
  collision check (D-07) should match this style.
- `species.sql` proves dbt slug can't be byte-reproducible in SQL → slug stays a
  Python post-step. The collision check likely belongs in the page-generation /
  Python build step where all final URLs are known, not in dbt.

### Integration Points
- New dbt rollup model → `_data/species.js` → `.njk` templates (genus/tribe/
  subgenus rebuilt onto it; new `_pages/subfamily.njk`).
- `species_maps.py` gains a subfamily group-map pass; output consumed by
  `_pages/subfamily.njk` (`/data/species-maps/subfamily/{Name}.svg`).
- `data/nightly.sh` S3 sync: any NEW artifact (the rollup + subfamily SVGs) must
  be included in the pull/push + the build's `public/data/` deployment.

</code_context>

<specifics>
## Specific Ideas

- Subfamily page format should read as "the tribe page, grouped" — tribe heading
  with its rolled-up counts, genera nested with their `specimen · observation`
  counts (mirrors `tribe.njk`'s per-genus count line), genus swatches matching
  the by-genus map.
- Metadata line for subfamily pages: count of tribes and/or genera + records,
  consistent with existing pages' "N {children} · N records" pattern (exact
  wording at planner's discretion).

</specifics>

<deferred>
## Deferred Ideas

- **Complex-rank pages (PAGE-05):** dropped in Phase 129 (0 complex occurrences);
  complex nodes deep-link to a filtered map view. Revisit only if complex-rank
  occurrence volume becomes meaningful.
- **`/species` browse tree (Phase 133):** the expandable bee-only taxonomy tree
  replacing the flat index — depends on this phase's rollup + Phase 130.

None other — discussion stayed within phase scope.

</deferred>

---

*Phase: 132-page-rebuild-subfamily-pages*
*Context gathered: 2026-06-02*
