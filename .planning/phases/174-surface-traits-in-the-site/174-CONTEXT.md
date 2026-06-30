# Phase 174: Surface Traits in the Site - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Take the existing `species_traits` mart (Phase 173 — one row per `canonical_name`
carrying sociality, nesting, diet breadth + host plant family, native status, and
cleptoparasite host bee(s), each with a `*_source` provenance column) and surface
it on the site:

1. The **species detail page** (`_pages/species-detail.njk`) shows a species'
   available traits, omitting traits with no data.
2. The **species index** surfaces scannable trait markers without opening each species.
3. Every surfaced trait exposes its **provenance** (species-level vs genus-backbone /
   Fowler-derived).
4. Trait data rides the established `species.json` fetch-at-build delivery path —
   no committed pipeline artifacts, static hosting preserved.

**Out of scope (new capabilities → their own phase):** trait *filtering/faceting* on
the map or index; per-trait map symbology; editing/curating trait values; phenology
(Phase 166); any new trait sources beyond the three Phase 173 seeds.
</domain>

<decisions>
## Implementation Decisions

### Data delivery
- **D-01:** **Merge traits into `species.json`** (not a separate sidecar). The
  `species_traits` mart is 1:1 with species (`canonical_name`), so each species row
  in `species.json` gains trait fields and templates read `sp.sociality` etc.
  directly — one fetch, no new manifest key, no new `deploy.yml` line.
- **D-02:** Fields to carry per species row: `sociality` + `sociality_source`,
  `nesting` + `nesting_source`, `diet_breadth` + `diet_breadth_source`,
  `host_plant_family` (+ `host_plant_detail`), `native_status`, `host_bees`
  (+ `host_bee_count`). Absent traits stay NULL/absent — never inferred or blanked.
- **D-03 (open — researcher/planner to resolve the HOW):** the *mechanism* of the
  merge is not locked. Two candidate paths: (a) widen the dbt `species` mart to
  `LEFT JOIN species_traits` so `species.parquet` carries the columns (extends
  `SPECIES_COLUMNS` + the pyarrow schema + the parquet contract), or (b) read
  `species_traits.parquet` in `species_export.py` and merge by `canonical_name`
  after reading the species mart. Pick whichever keeps the contract/diff-harness
  changes smallest and idempotent. `species_traits` already `ref('species')`, so a
  dbt-side join is natural. Note: `species_traits` is NOT currently emitted as an
  external parquet — that may need adding for path (b).

### Detail page
- **D-04:** Render traits as a **definition list / labeled rows** ("Traits" section:
  Sociality → Solitary · Nesting → Ground · Diet → Specialist (Asteraceae) · Native).
  Omit any row whose trait is absent. Place it as a new block on
  `_pages/species-detail.njk` (a fact-sheet section near the metadata line; exact
  position is Claude's discretion within the existing layout/CSS).
- **D-05:** **Cleptoparasite host bee(s) render as links** to the host's
  `/species/` (or genus) page where a generated page exists; fall back to **plain
  text** when the host name doesn't resolve to a generated page (genus-only records,
  non-WA taxa). `host_bees` is a comma-joined string of host taxon names — split it,
  resolve each name to a slug/page at build time via the existing
  species/higher-taxa lookups in `_data/species.js`.

### Index surfacing
- **D-06:** On the species index, surface **two highest-signal markers only**:
  a **sociality** indicator and a **diet-breadth "specialist"** marker. Nesting and
  native status are detail-page-only (keeps the dense tree readable).
- **D-07:** Surface these badges on **both** the `/species/` index tree leaf nodes
  AND the species rows on **genus / subgenus / tribe** pages. This means threading
  the two badge fields through every species-listing builder in `_data/species.js`
  (`makeSpeciesNode`/`fullTree`, `genusList`, `subgenusList`, and the tribe path) —
  plan for the extra surface area.

### Provenance
- **D-08:** Expose per-trait provenance via a **native `title=` tooltip** on each
  trait (e.g. "Source: Bee-Gap, species-level" vs "Genus backbone — inferred from
  genus" vs "Fowler & Droege specialist list"). Zero JS, no new tooltip component.
  Map each `*_source` value (`beegap-species`, `genus-backbone`, `fowler`) to a
  human-readable source string. Satisfies TRAIT-UI-04 (user can distinguish
  species-level from genus/Fowler-derived) without a heavy component.

### Trait labels
- **D-09:** Display **friendly domain labels**, not raw seed values. Map e.g.
  sociality `Parasitic` → "Cleptoparasitic"; diet `specialist` + `host_plant_family`
  → "Specialist (Asteraceae)"; `generalist` → "Generalist"; keep `Native` /
  `Introduced`; nesting values title-cased. A small label map (data layer or
  template filter). Stay faithful to the sources while reading well to a visitor —
  honor the project's domain-vocabulary care (see CLAUDE.md Domain Vocabulary).

### Claude's Discretion
- Exact placement and CSS of the detail-page "Traits" block within the existing
  layout.
- Visual form of the two index badges (icon vs short text vs colored pill) and any
  icon legend — as long as they stay compact in the leaf row and don't crowd the
  name · counts · Map line.
- The precise label-map wording (D-09) and the source-string copy (D-08), guided by
  the trait sources and domain vocabulary.
- The merge mechanism per D-03.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & goal
- `.planning/ROADMAP.md` §"Phase 174: Surface Traits in the Site" — goal + 5 success criteria.
- `.planning/REQUIREMENTS.md` — TRAIT-UI-01 … TRAIT-UI-05 (the locked requirements).

### Trait data source (Phase 173)
- `data/dbt/models/marts/species_traits.sql` — the mart: column names, source
  precedence (beegap-species → genus-backbone; Fowler wins diet breadth), the exact
  `*_source` enum values, NULL-not-inferred rule, clepto `host_bees`/`host_bee_count`.
- Memory `project_species_trait_sources` — trait-source rationale (Fowler beats
  Bee-Gap for diet breadth; sociality genus-stable; diet breadth species-only).

### Delivery pattern (fetch-at-build, no committed artifacts)
- `data/species_export.py` — builds `species.parquet` + `species.json`
  (`SPECIES_COLUMNS`, the pyarrow schema, the JSON projection). The merge lands here
  or upstream in the dbt `species` mart.
- `_data/species.js` — Eleventy data layer: builds `flat`, `byScientificName`,
  `fullTree`/`makeSpeciesNode`, `genusList`, `subgenusList`, `tribeList`. Trait
  fields must thread into the species-listing builders (D-07) and host-bee links
  resolve here (D-05).
- `.github/workflows/deploy.yml` §"Fetch build-time data from S3" — confirms
  `species.json` is already fetched via manifest (no new fetch line needed under D-01).
- `data/nightly.sh` (manifest section ~L121) + `scripts/make-local-manifest.js` —
  the `species` manifest key maps to hashed `species.json`; no new key under D-01.
- Memory `feedback_no_committed_data_artifacts` + `project_schema_validation` —
  never commit regenerated `public/data/`; the dbt contract is the schema gate. If
  D-03 path (a) widens the `species` mart parquet, follow the
  `project_occurrences_contract_release_sequence` data-before-code release ordering.

### Templates to modify
- `_pages/species-detail.njk` — add the "Traits" definition-list block (D-04, D-05, D-08, D-09).
- `_pages/species.njk` — index tree leaf badges (D-06, D-07).
- `_pages/genus.njk`, `_pages/subgenus.njk`, `_pages/tribe.njk` — species-row badges (D-07).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Sidecar-join precedent:** `photos.json` and `seasonality.json` are built by
  `species_export.py` and merged at build time keyed by name — proves the join
  pattern, though D-01 chose the simpler in-`species.json` merge instead.
- **`_data/species.js` name→page resolution:** `byScientificName`,
  `higherTaxaByRankName`, and the slug scheme (`/species/{Genus}/{epithet}/`,
  `/species/{Genus}/` for genus) give the host-bee link resolver (D-05) everything
  it needs at build time.
- **`domain.slugify` / slug fields** already on every species row — host-bee linking
  reuses these.

### Established Patterns
- **Species index is a collapsible `<details>` tree**, not a table. Species are
  `<li>` leaf nodes rendered by the `renderNode` macro (`node.rank === "species"`)
  with `node-name` · `node-counts` · `node-map`. Badges insert into that leaf row.
- **`fullTree` leaf nodes are built by `makeSpeciesNode`** in `_data/species.js`,
  which currently copies only name/counts/slug/taxon_id — trait fields must be added
  there (and to `genusList`/`subgenusList`/tribe species maps) for D-07.
- **`SPECIES_COLUMNS` + pyarrow schema + dbt contract** must stay in lockstep if the
  merge widens `species.parquet` (D-03 path a).

### Integration Points
- `species_traits` mart ↔ species export (merge point, D-03).
- `_data/species.js` species-listing builders ↔ index/genus/subgenus/tribe templates
  (badge threading, D-07).
- `_pages/species-detail.njk` ↔ merged trait fields on `sp.*` (D-04, D-05).
</code_context>

<specifics>
## Specific Ideas

- Diet-breadth detail row should read "Specialist (Asteraceae)" — combine
  `diet_breadth` with `host_plant_family` when present (D-09).
- Sociality "Parasitic" must display as "Cleptoparasitic" to match the project's
  domain vocabulary (clepto species are the ones with `host_bees`).
- Provenance tooltip must let a visitor tell a genus-backbone (lower-confidence,
  inherited) label from a species-level one (D-08) — this is the core of TRAIT-UI-04.
</specifics>

<deferred>
## Deferred Ideas

- **Trait-based filtering / faceting** on the map or species index (e.g. "show only
  specialists" / "ground-nesters") — a new capability, its own future phase.
- **Per-trait map symbology** (coloring occurrences by trait) — future phase.
- **Nesting & native badges on the index** — intentionally deferred to detail-only
  (D-06) to keep the tree readable; could revisit if the leaf row proves to have room.

None of these block Phase 174.
</deferred>

---

*Phase: 174-surface-traits-in-the-site*
*Context gathered: 2026-06-29*
