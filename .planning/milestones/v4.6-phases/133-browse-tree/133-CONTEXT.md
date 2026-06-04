# Phase 133: Browse Tree - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the flat family→genus→species `/species` index (same URL) with an
**expandable, bee-only taxonomy tree**:

- Default expansion chain is **family → genus → species**. Subfamily, tribe,
  and subgenus are optional deeper ranks, NOT forced into the default view.
- Each node shows a **specimen count + community-observation count**, rolled up
  over all descendants.
- A **type-to-filter** input narrows the tree to matching taxon names and
  auto-expands the ancestor chain of each match.
- Every bee node links to its corresponding taxon page and/or a
  descendant-filtered map view. No wasp/fly/other non-bee taxon appears anywhere.

Covers TREE-01, TREE-02, TREE-03, TREE-04.

**In scope:**
- New `_pages/species.njk` tree template (full build-time DOM) + its client
  entry (`src/entries/species-index.ts`) for toggle/filter behavior.
- A "Show all ranks" control + localStorage persistence.
- Per-node count display (specimen · observation) at every rank.
- Node linking (taxon page + descendant-filtered map affordance).

**Out of scope:**
- Changing taxon page templates (genus/subgenus/tribe/subfamily/species) — built
  in Phase 132; this phase only links to them.
- Changing the map filter / URL param scheme — delivered in Phase 130; this
  phase only constructs `/?taxon=…&taxonRank=…` links against it.
- Changing the dbt rollup / data feed shape — `higher_taxa.json` + `species.json`
  already carry everything needed (counts, ranks, taxon_ids, member edges).
- Complex-rank nodes — 0 complex occurrences (dropped Phase 129); not in the data.

</domain>

<decisions>
## Implementation Decisions

### Rendering & expansion mechanism
- **D-01 — Full build-time DOM, JS toggles visibility.** Eleventy renders ALL
  ~800 nodes at build time (603 species + 191 higher-rank rows). Deeper ranks are
  emitted but collapsed/hidden; client JS only toggles visibility and runs the
  filter. Matches today's static-index pattern (no Lit/framework on the index),
  zero fetch, fully crawlable. ~800 nodes is light enough that shipping all
  markup is not a concern. Chosen over hybrid lazy-build and pure client-side.
- **D-02 — Each expandable node is a native `<details>/<summary>`.** Works with
  zero JS (collapse/expand + keyboard + screen-reader for free); JS layers on top
  to drive the rank toggle and to set `open` on ancestor `<details>` for
  filter auto-expand. Progressive enhancement — no-JS users still get a working
  expandable tree. Chosen over a custom `role=tree`/`aria-expanded` widget.

### Surfacing intermediate ranks (TREE-01)
- **D-03 — A single "Show all ranks" toggle.** All-or-nothing flip of the whole
  tree between default depth (family→genus→species) and full depth
  (family→subfamily→tribe→genus→subgenus→species). Because the full DOM is
  already shipped (D-01), the toggle just reveals/hides the pre-rendered
  intermediate nodes. Default state OFF. Chosen over per-rank checkboxes and
  per-node "group by" affordances (simplest mental model).
- **D-04 — Toggle state persisted in `localStorage`.** Remembered across visits
  on the same device (not shareable via link). Scope: the "Show all ranks"
  boolean. Per-node expansion state is session-only (resets per load) unless the
  planner finds persisting it trivial. This is a new persistence pattern for the
  static pages — keep it minimal (one key).
- **D-05 — Branches missing an intermediate rank degrade gracefully.** When
  "Show all ranks" is ON, a branch that lacks a rank (e.g. a species with null
  subgenus, or a tribe-less subfamily) attaches its child directly to the nearest
  present ancestor — no empty intermediate node, no "Other" bucket. Mirrors
  Phase 132 D-05 (tribe-less subfamilies render a flat genus list). Many genera
  have no subgenus (only 113 subgenus rows / 46 genera) and 5 subfamilies are
  tribe-less, so this must be handled, not exceptional.

### Node links (TREE-04)
- **D-06 — Node name → static taxon page; secondary 🗺 affordance →
  descendant-filtered map.** For ranks WITH a static page (species, genus,
  subgenus, tribe, subfamily — all built in Phase 132): the taxon name links to
  its page (`/species/{Genus}/`, `/species/tribe/{Tribe}/`,
  `/species/subfamily/{Name}/`, `/species/{Genus}/{Subgenus}/`,
  `/species/{slug}/` for species). A small secondary control on the node (a map
  pin / "map" link) goes straight to the descendant-filtered map view
  (`/?taxon=<name|id>&taxonRank=<rank>`). Satisfies "taxon page AND/OR map" by
  providing both, page-as-primary. Chosen over name→page-only and name→map-only.
- **D-07 — Family nodes = plain header + 🗺 affordance.** No static page exists
  for family (it was only a grouping header on the old index, no `family.njk`).
  The family name stays a non-link grouping header; only the secondary 🗺
  affordance links to the filtered map (`/?taxon=<Family>&taxonRank=family`). The
  plain-text name visually distinguishes "no page here" from page-backed ranks.
  Chosen over making the family name itself the map link.

### Counts display (TREE-02)
- **D-08 — Each node shows the specimen / community-observation split, rolled up
  over descendants.** Data is already rolled up: `higher_taxa.json` carries
  `specimen_count` + `inat_obs_count` per higher-rank taxon; `species.json`
  carries them per species. Genus/family nodes (which skip intermediate ranks in
  default view) still show fully-rolled-up totals — the rollup is descendant-based,
  not view-based, so skipping a displayed level never changes a node's count.
  Exact rendering format (e.g. "430 specimens · 210 observations" vs compact
  "430 · 210") is at planner/UI-spec discretion, consistent with existing taxon
  pages' "N {children} · N records" convention.

### Claude's Discretion
- **D-09 — Filter scope & behavior (area not selected for discussion; default
  captured to unblock downstream).** Filter matches **scientific names** across
  the **currently-displayed rank set** (genus/species by default; all ranks when
  "Show all ranks" is ON), case-insensitively. On match, auto-expand the ancestor
  chain (`<details>.open = true`) so matches are visible without manual
  expansion (TREE-03). **No common/vernacular-name matching** — `species.json`
  carries no vernacular field. The existing index filter
  (`src/entries/species-index.ts`) is the starting point; extend it from
  genus/species-only to the displayed rank set. Planner may refine whether the
  filter should pierce the rank toggle (match hidden intermediate ranks even when
  OFF) — leaning: respect the toggle to keep the two mechanisms orthogonal.
- **D-10 — Tree data source.** Build the tree from the existing build-time feeds
  (`species.json` + `higher_taxa.json`, both bee-only) via `_data/species.js`.
  The placeholder `tree` builder already in `species.js` (family→subfamily→tribe→
  genus→subgenus) may be hardened/replaced; exact data-shape and whether the
  template walks a nested object or per-rank lists is at planner discretion,
  constrained by D-01 (all nodes emitted at build time) and bee-only sourcing.
- **D-11 — Visual chrome** (control-bar styling, the 🗺 icon, count typography,
  mobile layout, no-JS fallback wording) is a UI-SPEC concern — run
  `/gsd:ui-phase 133` if a design contract is wanted before planning.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & prior decisions
- `.planning/ROADMAP.md` §"Phase 133: Browse Tree" — goal + success criteria.
- `.planning/REQUIREMENTS.md` — TREE-01..04 wording.
- `.planning/phases/132-page-rebuild-subfamily-pages/132-CONTEXT.md` — the
  `higher_taxa.json` rollup this tree consumes (D-01..D-10 there); subfamily
  page layout + URL scheme; bee-only gating (Eumeninae excluded, D-08);
  tribe-less graceful-degradation pattern (D-05) this phase mirrors.
- `.planning/phases/130-map-filter-cutover/130-CONTEXT.md` — the descendant
  filter + `taxon`/`taxonRank` URL param scheme the 🗺 affordance targets.
- `.planning/phases/129-hierarchy-foundation/129-VERIFICATION.md` — `is_anthophila`
  semantics; bycatch (Eumeninae) handling; complex-rank dropped (not in tree).

### Page to replace (same URL)
- `_pages/species.njk` — the current flat family→genus→species index
  (`permalink: /species/index.html`) being replaced by the tree.
- `src/entries/species-index.ts` — the current client filter (genus/species DOM
  visibility toggling); starting point to extend for the tree + rank toggle.
- `src/styles/taxon-pages.css` — shared taxon-page styles imported by the entry.

### Data feed (tree source — already bee-only, build-time)
- `_data/species.js` — Eleventy build-time feed. Reads `public/data/species.json`
  (603 bee species: `specimen_count`, `inat_obs_count`, `occurrence_count`,
  `family/subfamily/tribe/genus/subgenus`, `taxon_id`, `slug`, `on_checklist`,
  `specific_epithet`) and `public/data/higher_taxa.json` (191 rows: 12 subfamily /
  20 tribe / 46 genus / 113 subgenus; each with `specimen_count`, `inat_obs_count`,
  `occurrence_count`, `member_taxon_ids`, `taxon_id`, parent rank-name strings).
  Contains an existing placeholder `tree` builder (`buildTree`/`TAXON_LEVELS`).
- `public/data/species.json`, `public/data/higher_taxa.json` — the artifacts above.

### Taxon pages the tree links to (Phase 132)
- `_pages/genus.njk` (`/species/{Genus}/`), `_pages/subgenus.njk`
  (`/species/{Genus}/{Subgenus}/`), `_pages/tribe.njk` (`/species/tribe/{Tribe}/`),
  `_pages/subfamily.njk` (`/species/subfamily/{Name}/`), `_pages/species-detail.njk`
  (species; already links to `/?taxon=<sci>&taxonRank=species`). No `family.njk`
  exists (D-07).

### Map filter link target (Phase 130)
- `src/bee-atlas.ts` — owns URL param handling (`taxon` accepts name or
  taxon_id; legacy `{name, rank}` resolution via the anthophila taxon cache);
  the `/?taxon=…&taxonRank=…` scheme the 🗺 links build. `taxonRank` values seen:
  `species` (species-detail.njk); genus/tribe/subgenus/subfamily/family supported
  via the cache (all anthophila ranks loaded `WHERE is_anthophila = 1`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/entries/species-index.ts` — existing type-to-filter (DOM visibility
  toggling over `.family-section`/`.genus-row`/`li[data-name]` + empty-state
  message). Extend its match set from genus/species to the displayed rank set
  (D-09) and add the "Show all ranks" toggle + localStorage (D-04).
- `_data/species.js` `buildTree`/`TAXON_LEVELS` + per-rank lists
  (`genusList`/`tribeList`/`subgenusList`/`subfamilyList`, all already carrying
  `specimen_count`/`inat_obs_count` and `taxon_id`) — the tree data is already
  assembled here; harden the placeholder `tree` or feed the template per-rank.
- Native `<details>/<summary>` — no component needed (D-02).

### Established Patterns
- Static index = full server-rendered DOM + a tiny client entry (no framework on
  `/species`). D-01/D-02 keep this pattern.
- Higher-rank URLs use raw capitalized names; species slugs are lowercased
  (`sp.slug`). Tree links must use these exact forms (D-06).
- Counts shown as "N · N" / "N {children} · N records" across existing taxon
  pages — match for tree node counts (D-08).
- Filter has no persistence today; the new localStorage toggle (D-04) is the
  first persistence on the static pages — keep it to one key.

### Integration Points
- `_data/species.js` (tree data) → `_pages/species.njk` (markup) →
  `src/entries/species-index.ts` (toggle + filter behavior).
- 🗺 affordance → `bee-atlas` map via `/?taxon=…&taxonRank=…` (read-only consumer
  of Phase 130's URL contract; no map-side change).
- No new build artifact — consumes existing `species.json` + `higher_taxa.json`,
  so no `data/nightly.sh` S3-sync change required.

</code_context>

<specifics>
## Specific Ideas

- Node shape (from accepted previews): `▾ Bombus  430 · 210  🗺` — `<summary>`
  with name (page link) + count split + trailing map affordance; family is
  `▾ Apidae  1,240 · 800  🗺` with the name as plain text.
- "Show all ranks" rendered as a single toggle in a control bar above the tree,
  beside the existing filter input.

</specifics>

<deferred>
## Deferred Ideas

- **Filter piercing the rank toggle** (matching hidden intermediate ranks even
  when "Show all ranks" is OFF) — captured as a planner refinement under D-09,
  default leans toward respecting the toggle.
- **Per-node expansion persistence / shareable tree-view URL** — D-04 keeps
  persistence to the toggle only; URL-shareable expansion state was considered
  (URL-param option) and not chosen.

None other — discussion stayed within phase scope.

</deferred>

---

*Phase: 133-browse-tree*
*Context gathered: 2026-06-03*
