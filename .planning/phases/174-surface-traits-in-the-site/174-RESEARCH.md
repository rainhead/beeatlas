# Phase 174: Surface Traits in the Site — Research

**Researched:** 2026-06-29
**Domain:** Static-site data layer (dbt/Python/Eleventy/Nunjucks) — trait data delivery and template rendering
**Confidence:** HIGH (all findings verified from source files in this codebase)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Merge traits into `species.json` (not a separate sidecar). One fetch, no new manifest key, no new deploy.yml line.
- **D-02:** Fields per species row: `sociality` + `sociality_source`, `nesting` + `nesting_source`, `diet_breadth` + `diet_breadth_source`, `host_plant_family` (+ `host_plant_detail`), `native_status`, `host_bees` (+ `host_bee_count`). Absent traits stay NULL/absent — never inferred or blanked.
- **D-03 (open — researcher/planner to resolve the HOW):** merge mechanism: (a) widen the dbt `species` mart vs (b) read `species_traits.parquet` in `species_export.py` and merge by `canonical_name`. **Researcher recommendation: Path B.** See §D-03 Mechanism below.
- **D-04:** Detail page = definition list "Traits" section; omit absent traits; new block in `_pages/species-detail.njk`.
- **D-05:** Cleptoparasite host bees render as links to host `/species/` or genus page where a generated page exists; plain text otherwise. Resolve at build time in `_data/species.js`.
- **D-06:** Index badges = sociality + diet-specialist ONLY on `/species/` index tree leaf nodes.
- **D-07:** Badges also on species rows on genus / subgenus / tribe pages. Thread fields through `makeSpeciesNode`/`fullTree`, `genusList`, `subgenusList`, and the tribe path in `_data/species.js`.
- **D-08:** Provenance via native `title=` tooltip. Map `*_source` values to human-readable strings.
- **D-09:** Friendly domain labels (e.g. sociality "Parasitic" → "Cleptoparasitic"; diet "specialist" + `host_plant_family` → "Specialist (Asteraceae)"). Small label map.

### Claude's Discretion
- Exact placement and CSS of the detail-page "Traits" block.
- Visual form of index badges (icon vs short text vs colored pill) and legend.
- The precise label-map wording (D-09) and source-string copy (D-08).
- The merge mechanism per D-03.

### Deferred Ideas (OUT OF SCOPE)
- Trait-based filtering/faceting on the map or species index.
- Per-trait map symbology.
- Nesting and native badges on the index (detail-page-only per D-06).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRAIT-UI-01 | Detail page displays available traits — sociality, diet breadth (with host plant family for specialists), nesting, native status — omitting absent ones | D-04 definition-list block in species-detail.njk; `sp.*` fields from merged species.json |
| TRAIT-UI-02 | Cleptoparasitic species show host bee(s) on detail page | D-05 host-bee link resolution in `_data/species.js`; `host_bees` field from species.json |
| TRAIT-UI-03 | Species list/index surfaces trait labels as scannable badges | D-06 index badges; `makeSpeciesNode` threading; species.njk leaf row update |
| TRAIT-UI-04 | Each surfaced trait exposes provenance/source via tooltip | D-08 `title=` on each trait element; `*_source` fields from species.json |
| TRAIT-UI-05 | Trait data reaches frontend via `species.json` fetch-at-build pattern — no committed artifacts | D-01/D-03 Path B delivery; `nightly.sh` SKIP_INTEGRATION_GATE for transition nightly |
</phase_requirements>

---

## Summary

Phase 173 shipped the `species_traits` dbt mart (one row per `canonical_name` with 14 columns of ecological trait labels and provenance). Phase 174 merges those traits into `species.json` and renders them on the detail page and species index. All findings in this document are verified from source files.

**D-03 resolved: use Path B** — add `materialized='external'` to `species_traits.sql` so the mart emits `species_traits.parquet` into the sandbox directory, then read and merge it in `species_export.py` by `canonical_name`. This leaves the dbt `species` mart contract and `SPECIES_COLUMNS` completely unchanged. The output `species.parquet` stays at 22 columns; `species.json` gains the 11 trait fields automatically because `_jsonify_rows()` serializes all dict keys, not just `SPECIES_COLUMNS`.

The only deployment complication: `test_species_json_matches` in `test_dbt_diff.py` (tagged `@integration`) will fail on the first post-deployment nightly because the new species.json has trait fields that the S3 baseline does not. Resolution is the established `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` pattern from `project_occurrences_contract_release_sequence`.

**Primary recommendation:** Plan the work in four waves: (1) data pipeline (species_traits.parquet emission + species_export.py merge), (2) `_data/species.js` host-bee resolution and makeSpeciesNode trait threading, (3) detail-page Traits section, (4) index and genus/subgenus badge rendering.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Trait data emission | Pipeline (dbt) | Python (species_export.py) | species_traits mart already exists; only needs `materialized='external'` to become a readable parquet |
| Trait merge into species.json | Pipeline (Python) | — | species_export.py already owns the species.json write path; merge by canonical_name is a simple Python join step |
| Host-bee link resolution | Build-time data layer (_data/species.js) | — | Resolution uses byScientificName and higherTaxaByRankName already in this module; Nunjucks templates cannot call arbitrary JS |
| Trait threading into tree nodes | Build-time data layer (_data/species.js) | — | makeSpeciesNode/genusList/subgenusList builders own the shape of data tree nodes consumed by templates |
| Detail-page Traits block | Frontend Server (Eleventy template) | CSS | species-detail.njk reads `sp.*` fields directly; no JS needed |
| Index badges | Frontend Server (Eleventy template) | CSS | species.njk renderNode macro reads node.* fields; zero JS (D-08 uses title= not tooltip JS) |
| Genus/subgenus species-row badges | Frontend Server (Eleventy template) | CSS | genus.njk/subgenus.njk read sp.* fields spread from genusList/subgenusList |
| Provenance tooltip | Frontend Server (Eleventy template) | — | Native HTML `title=` attribute; zero JS per D-08 |

---

## D-03 Mechanism: Path B (Python-side merge) — VERIFIED RECOMMENDATION

### Why Path B beats Path A

**Path A: widen the dbt `species` mart**
- Requires modifying `data/dbt/models/marts/species.sql` to add `LEFT JOIN species_traits`
- Requires adding 11–12 new column entries to the `species` contract in `schema.yml` (currently 21 columns, `contract: enforced: true`)
- Requires expanding `SPECIES_COLUMNS` list (22 → 33) in `species_export.py`
- Requires expanding the pyarrow schema (22 type declarations → 33)
- `test_species_parquet_schema_matches` in `test_dbt_diff.py` hard-asserts `sandbox.parquet has 21 cols + 1 slug = 22 public cols` — would need rewriting
- A dbt contract change triggers the data-before-code release sequence (memory: `project_occurrences_contract_release_sequence`)
- Fixture `data/tests/fixtures/species_fixture.csv` (21 cols) and `sandbox_parquet` fixture in `test_species_export.py` would both need updating

**Path B: read species_traits.parquet in Python (RECOMMENDED)**
- Add one config block to `data/dbt/models/marts/species_traits.sql` (`materialized='external'` + sandbox location)
- In `species_export.py`: read `DBT_SANDBOX_DIR/species_traits.parquet`, build a dict keyed on `canonical_name`, merge fields into each species_row dict
- `SPECIES_COLUMNS` is NOT changed — the output `species.parquet` stays 22 columns
- `_jsonify_rows(species_rows)` already serializes ALL dict keys, so trait fields automatically appear in `species.json` without further changes
- `test_species_parquet_schema_matches` passes unchanged (sandbox parquet stays 21 cols; public parquet stays 22 cols)
- `species_fixture.csv` is unchanged (only 21 mart cols)
- Only new test infrastructure: a `species_traits_fixture.csv` for the sandbox fixture to produce `species_traits.parquet`

**One shared complication (both paths):** `test_species_json_matches` (in `test_dbt_diff.py`, tagged `@integration`, runs in the nightly integration gate) compares `sandbox/species.json` byte-for-byte with `public/data/species.json` (the S3 baseline). The first post-deployment nightly will fail this test because the new species.json has trait fields the S3 baseline does not. **Resolution: `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` for the one-time transition nightly.** This is the documented pattern in `nightly.sh` (line 246–250) for any intentional schema extension.

### species_traits.parquet emission (needed for Path B)

`species_traits.sql` currently has no `{{ config(...) }}` block — it is a regular (non-external) dbt model. Add:

```sql
{{ config(
    materialized='external',
    location='target/sandbox/species_traits.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}
```

This matches the pattern used in `species.sql` and `higher_taxa.sql`. [VERIFIED: direct inspection of species.sql and higher_taxa.sql]

### species_export.py merge code pattern

After `species_rows` is built (post slug computation), insert:

```python
traits_parquet = DBT_SANDBOX_DIR / 'species_traits.parquet'
if traits_parquet.exists():
    trait_rows = con.execute(
        f"SELECT * FROM read_parquet('{traits_parquet}')"
    ).fetchall()
    trait_cols = [d[0] for d in con.description]
    traits_by_name = {
        dict(zip(trait_cols, r))['canonical_name']: dict(zip(trait_cols, r))
        for r in trait_rows
    }
    _TRAIT_FIELDS = [
        'sociality', 'sociality_source', 'nesting', 'nesting_source',
        'diet_breadth', 'diet_breadth_source', 'host_plant_family',
        'host_plant_detail', 'native_status', 'host_bees', 'host_bee_count',
    ]
    for r in species_rows:
        t = traits_by_name.get(r['canonical_name'], {})
        for field in _TRAIT_FIELDS:
            r[field] = t.get(field)
else:
    print("  WARNING: species_traits.parquet not found — trait fields omitted from species.json")
```

The `else` branch gracefully degrades (traits absent → fields are None in JSON) so local dev without a full dbt build doesn't hard-fail.

---

## Standard Stack

No new external packages. All work uses existing project tools.

| Tool | Version | Role |
|------|---------|------|
| dbt (DuckDB adapter) | existing | Add `materialized='external'` to species_traits.sql |
| pyarrow | existing | No new schema changes; parquet write stays 22 cols |
| Eleventy 3.x + Nunjucks | existing | Template additions for detail page + index badges |
| `src/lib/quantify.js` | existing | `quantify` filter already registered; no new filters strictly required |

## Package Legitimacy Audit

No new packages installed in this phase.

---

## Architecture Patterns

### System Architecture Diagram

```
dbt build
  species_traits.sql ──[new: materialized='external']──> sandbox/species_traits.parquet
  species.sql ────────────────────────────────────────> sandbox/species.parquet (21 cols, unchanged)

species_export.py
  read sandbox/species.parquet (21 cols)
  add slug → species_rows (22 fields each)
  [NEW] read sandbox/species_traits.parquet
  [NEW] merge 11 trait fields into species_rows by canonical_name
  serialize _jsonify_rows(species_rows) → public/data/species.json (22 + 11 = 33 fields/species)
  write SPECIES_COLUMNS-only → public/data/species.parquet (22 cols, unchanged)

nightly.sh
  upload species.json (hashed) → S3 → manifest.json updated

deploy.yml
  download species.json from S3 via manifest (no new line needed — species key already exists)

Eleventy build-time
  _data/species.js reads species.json
  [NEW] flat rows now carry trait fields
  [NEW] host_bees split + resolved into resolvedHostBees [{name, slug/genusName, type}]
  [NEW] makeSpeciesNode adds sociality, sociality_source, diet_breadth,
        diet_breadth_source, host_plant_family
  genusList/subgenusList species entries inherit traits via {...sp} spread (no code change)

Templates
  species-detail.njk: [NEW] <dl class="traits"> section
  species.njk renderNode: [NEW] badge spans on species leaves
  genus.njk: [NEW] badge spans on species list items (sp.sociality/sp.diet_breadth already accessible via spread)
  subgenus.njk: [NEW] badge spans on species list items (same)
```

### Recommended Project Structure Changes

No new directories. Changes are additions to existing files:

```
data/dbt/models/marts/
  species_traits.sql           # add materialized='external' config block
data/
  species_export.py            # add trait merge step
data/tests/
  fixtures/
    species_traits_fixture.csv # NEW: minimal trait fixture for sandbox_parquet
  test_species_export.py       # update sandbox_parquet fixture; add trait field tests
_data/
  species.js                   # add host-bee resolution; update makeSpeciesNode
_pages/
  species-detail.njk           # add Traits dl section
  species.njk                  # add badges to species leaf node
  genus.njk                    # add badges to species list items
  subgenus.njk                 # add badges to species list items
src/styles/
  taxon-pages.css              # add .trait-badge, .trait-dl styles
src/tests/
  data-species.test.ts         # add trait field threading assertions
```

---

## species_traits Mart: Exact Column Set

[VERIFIED: direct inspection of `data/dbt/models/marts/species_traits.sql`]

The mart selects from `{{ ref('species') }}` as the outer driver (so every atlas species gets a row, even those with no traits), left-joining the three seed CTEs.

| Column | SQL expression | Nullable | Values |
|--------|---------------|----------|--------|
| `canonical_name` | `s.canonical_name` | NO (all atlas species) | |
| `genus` | `s.genus` | species-dependent | |
| `family` | `s.family` | species-dependent | |
| `sociality` | `COALESCE(NULLIF(bg.sociality,''), NULLIF(gb.sociality,''))` | YES | "Social"/"Solitary"/"Parasitic" |
| `sociality_source` | CASE on which CTE supplied it | YES | "beegap-species"/"genus-backbone" |
| `nesting` | `COALESCE(NULLIF(bg.nesting,''), NULLIF(gb.nesting,''))` | YES | "Ground"/"Cavity"/"Wood"/"Host Nest"/"Multiple"/"Open" |
| `nesting_source` | CASE | YES | "beegap-species"/"genus-backbone" |
| `diet_breadth` | CASE: Fowler > Bee-Gap | YES | "specialist"/"generalist" |
| `diet_breadth_source` | CASE | YES | "fowler"/"beegap-species" |
| `host_plant_family` | `NULLIF(sp.host_plant_family,'')` | YES | e.g. "Asteraceae" |
| `host_plant_detail` | `sp.host_plant_detail` | YES | free text |
| `native_status` | `NULLIF(bg.native,'')` | YES | "Native"/"Introduced" |
| `host_bees` | `STRING_AGG(DISTINCT p.host_taxon, ', ' ORDER BY p.host_taxon)` | YES | comma-joined taxon names |
| `host_bee_count` | `COUNT(DISTINCT p.host_taxon)` | YES | integer |

**Critical notes:**
- `WHERE s.specific_epithet IS NOT NULL` — genus-only records are excluded from species_traits
- Sociality "Parasitic" is Bee-Gap's label for cleptoparasites; display as "Cleptoparasitic" (D-09)
- Diet breadth absence is NOT inferred as generalist (explicit NULL-not-inferred rule in the mart comment)
- `host_bees` taxon names are post-synonymy-normalization (`COALESCE(syn.accepted_name, p.parasite)` on the parasite key, but host_taxon values themselves are raw Bee-Gap strings)
- `genus` and `family` from species_traits duplicate columns already in species.json — omit them from the merge; only the 11 trait-specific columns listed in D-02 are needed

---

## dbt `species` Mart Contract

[VERIFIED: `data/dbt/models/marts/schema.yml` and `data/dbt/models/marts/species.sql`]

The `species` mart has `contract: enforced: true` with exactly 21 columns. The Python post-step adds `slug` to reach 22 final columns in the public parquet.

`test_species_parquet_schema_matches` in `test_dbt_diff.py` hard-asserts:
- Sandbox parquet has N columns
- Public parquet has N+1 columns (slug appended)
- `p_cols[-1] == ('slug', 'VARCHAR')`

Under Path B, neither the sandbox parquet nor its column count changes. This test needs no update.

**`species_traits` has NO contract in schema.yml** — it is not listed. Adding `materialized='external'` to it does not require adding it to `schema.yml`. [VERIFIED: grep of schema.yml found no `species_traits` entry]

---

## `_data/species.js`: Host-Bee Resolution

[VERIFIED: direct inspection of `_data/species.js`]

Two lookups are already available by the time resolution code would run:

| Lookup | What it contains | How to use for host-bee resolution |
|--------|-----------------|-------------------------------------|
| `byScientificName` | `{ [scientificName]: speciesRow }` | Match genus+epithet host taxon names (e.g. "Andrena accepta") to their slug |
| `higherTaxaByRankName['genus']` | `{ [genusName]: genusRow }` | Match genus-only host taxon names (e.g. "Andrena") to their genus page |

Resolution logic (runs once after `byScientificName` is built, before export):

```javascript
// Resolve host_bees strings to typed link targets.
// host_bees is a comma-joined string of host taxon names (some genus-only, some species-level).
// Produces sp.resolvedHostBees: Array<{name, slug?, genusName?, type: 'species'|'genus'|'text'}>
function resolveHostBees(hostBees) {
  if (!hostBees) return null;
  return hostBees.split(', ').map(name => {
    const trimmed = name.trim();
    const speciesMatch = byScientificName[trimmed];
    if (speciesMatch && speciesMatch.slug) {
      return { name: trimmed, slug: speciesMatch.slug, type: 'species' };
    }
    const genusMatch = higherTaxaByRankName['genus']?.[trimmed];
    if (genusMatch) {
      return { name: trimmed, genusName: trimmed, type: 'genus' };
    }
    return { name: trimmed, type: 'text' };
  });
}

for (const sp of flat) {
  sp.resolvedHostBees = resolveHostBees(sp.host_bees);
}
```

**Nunjucks template** (species-detail.njk, within the Traits dl):

```nunjucks
{%- if sp.resolvedHostBees and sp.resolvedHostBees.length > 0 -%}
<dt>Host bees</dt>
<dd>
  {%- for hb in sp.resolvedHostBees -%}
  {%- if not loop.first %}, {% endif -%}
  {%- if hb.type === "species" -%}
    <a href="/species/{{ hb.slug }}/index.html"><em>{{ hb.name }}</em></a>
  {%- elif hb.type === "genus" -%}
    <a href="/species/{{ hb.genusName }}/index.html"><em>{{ hb.name }}</em></a>
  {%- else -%}
    <em>{{ hb.name }}</em>
  {%- endif -%}
  {%- endfor -%}
</dd>
{%- endif -%}
```

**Note on host_taxon name case:** The `host_bees` string in the mart comes from `STRING_AGG(DISTINCT p.host_taxon, ...)` where `p.host_taxon` is the raw value from the `bee_parasite_hosts` seed. Bee-Gap uses mixed case (e.g., "Andrena accepta", "Andrena"). `byScientificName` keys on `scientificName` which is also mixed-case (e.g., "Andrena accepta"). The lookup is case-sensitive — if Bee-Gap spellings and iNat names differ, no match. The synonymy normalization in the mart applies to the PARASITE key, not to `host_taxon` values. For the WA cuckoo bee fauna, the overlap between Bee-Gap host names and atlas-accepted names should be high (most hosts are common WA genera), but some may fall through to plain-text. This is by design: D-05 explicitly calls for plain-text fallback.

---

## `_data/species.js`: makeSpeciesNode Trait Threading

[VERIFIED: direct inspection of `_data/species.js` lines 370–382]

**Current `makeSpeciesNode`:**
```javascript
function makeSpeciesNode(sp) {
  return {
    rank: 'species',
    name: sp.scientificName,
    taxon_id: sp.taxon_id ?? null,
    specimen_count: sp.specimen_count ?? 0,
    inat_obs_count: sp.inat_obs_count ?? 0,
    occurrence_count: sp.occurrence_count ?? 0,
    slug: sp.slug,
    scientificName: sp.scientificName,
    children: [],
  };
}
```

Add badge fields (D-07):
```javascript
function makeSpeciesNode(sp) {
  return {
    rank: 'species',
    name: sp.scientificName,
    taxon_id: sp.taxon_id ?? null,
    specimen_count: sp.specimen_count ?? 0,
    inat_obs_count: sp.inat_obs_count ?? 0,
    occurrence_count: sp.occurrence_count ?? 0,
    slug: sp.slug,
    scientificName: sp.scientificName,
    // Trait badges for D-07 (species.njk leaf nodes)
    sociality: sp.sociality ?? null,
    sociality_source: sp.sociality_source ?? null,
    diet_breadth: sp.diet_breadth ?? null,
    diet_breadth_source: sp.diet_breadth_source ?? null,
    host_plant_family: sp.host_plant_family ?? null,
    children: [],
  };
}
```

**genusList and subgenusList — no code change needed:**
The `speciesOnly` array in both builders is constructed as:
```javascript
.map(sp => ({ ...sp, hexColor: colorByCanon[sp.canonical_name] }));
```
This spreads the ENTIRE sp row dict (which after Path B will include all 11 trait fields). The genus.njk and subgenus.njk templates access `sp.sociality`, `sp.diet_breadth`, etc. directly from the spread object — no builder change needed.

**tribeList — D-07 "tribe path" clarification:**
`tribeList` in `_data/species.js` collects GENERA per tribe (occurrence counts per genus), not species. `tribe.njk` renders genus-level `<li>` items, not species rows. **D-07's "tribe path" threading has no effect on tribe.njk** because the tribe page has no species rows to badge. See Open Questions §1.

---

## D-04/D-09: Detail Page Traits Section

### Trait label mapping (D-09)

| Field | Raw value | Display label |
|-------|-----------|---------------|
| `sociality` | "Social" | "Social" |
| `sociality` | "Solitary" | "Solitary" |
| `sociality` | "Parasitic" | "Cleptoparasitic" (domain vocab per CLAUDE.md) |
| `diet_breadth` | "specialist" + `host_plant_family` present | "Specialist ({host_plant_family})" |
| `diet_breadth` | "specialist" + `host_plant_family` absent | "Specialist" |
| `diet_breadth` | "generalist" | "Generalist" |
| `nesting` | "Ground"/"Cavity"/"Wood"/"Host Nest"/"Multiple"/"Open" | as-is (already title-cased) |
| `native_status` | "Native" | "Native" |
| `native_status` | "Introduced" | "Introduced" |

### Source label mapping (D-08)

| Raw `*_source` | Display string (title= tooltip) |
|---------------|----------------------------------|
| "beegap-species" | "Bee-Gap 2017, species-level" |
| "genus-backbone" | "Genus backbone (inferred from genus)" |
| "fowler" | "Fowler & Droege specialist list" |

### Recommended detail-page Traits block

Placement: after `<p class="metadata">` and `<p class="checklist-attribution">`, before the `.taxon-action` links. This matches the fact-sheet pattern and keeps action affordances at the bottom.

```nunjucks
{%- set hasSociality = sp.sociality -%}
{%- set hasDiet = sp.diet_breadth -%}
{%- set hasNesting = sp.nesting -%}
{%- set hasNative = sp.native_status -%}
{%- set hasHostBees = sp.resolvedHostBees and sp.resolvedHostBees.length > 0 -%}
{%- if hasSociality or hasDiet or hasNesting or hasNative or hasHostBees -%}
<section class="traits">
  <h2 class="traits-heading">Traits</h2>
  <dl class="traits-dl">
    {%- if hasSociality -%}
    <dt title="Source: {%- if sp.sociality_source === 'beegap-species' -%}Bee-Gap 2017, species-level{%- elif sp.sociality_source === 'genus-backbone' -%}Genus backbone (inferred from genus){%- endif -%}">Sociality</dt>
    <dd>{%- if sp.sociality === 'Parasitic' -%}Cleptoparasitic{%- else -%}{{ sp.sociality }}{%- endif -%}</dd>
    {%- endif -%}
    {# ... diet, nesting, native, host bees rows ... #}
  </dl>
</section>
{%- endif -%}
```

The inline `{%- if -%}` on each `<dt>`/`<dd>` pair omits absent traits (D-04 contract). The `title=` attribute on `<dt>` carries the source string (D-08). No JS needed; `title=` is native browser behavior.

### Label-mapping approach

For D-09, recommend implementing the label mapping as Nunjucks inline conditionals (not a new Eleventy filter). The mapping is small (3 sociality values, 2 diet values) and only used in templates. Nunjucks `if/elif/else` is readable at this scale. A Nunjucks macro in `_includes/trait-macros.njk` can encapsulate both the `<dt>/<dd>` pair and the label/tooltip logic, imported into all four templates that need it.

If the mapping grows complex, promote to an Eleventy filter in `eleventy.config.js` (same pattern as `quantify`).

---

## D-06/D-07: Index Badges

### species.njk leaf node badge placement

Current species leaf:
```nunjucks
<li data-rank="species" data-name="{{ node.scientificName | lower }}">
  <a class="node-name" href="...">...</a>
  <span class="node-counts">...</span>
  <a class="node-map" ...>Map</a>
</li>
```

The flex row has `.node-name` (`flex: 1 1 auto`) then `.node-counts` and `.node-map` (`flex: 0 0 auto`). Badges insert between `.node-name` and `.node-counts`:

```nunjucks
<li data-rank="species" data-name="{{ node.scientificName | lower }}">
  <a class="node-name" href="...">...</a>
  {%- if node.sociality -%}
  <span class="node-badge"
        title="Sociality · Source: {% if node.sociality_source === 'beegap-species' %}Bee-Gap 2017{% else %}Genus backbone{% endif %}">
    {%- if node.sociality === 'Parasitic' -%}Clepto{%- else -%}{{ node.sociality }}{%- endif -%}
  </span>
  {%- endif -%}
  {%- if node.diet_breadth === 'specialist' -%}
  <span class="node-badge node-badge--specialist"
        title="Diet · Specialist{% if node.host_plant_family %} ({{ node.host_plant_family }}){% endif %} · Source: {% if node.diet_breadth_source === 'fowler' %}Fowler & Droege{% else %}Bee-Gap 2017{% endif %}">
    Specialist
  </span>
  {%- endif -%}
  <span class="node-counts">...</span>
  <a class="node-map" ...>Map</a>
</li>
```

Short text badges ("Clepto", "Solitary", "Social", "Specialist") are readable at `0.75rem` and stay compact in the dense tree. The `title=` tooltip carries the full provenance (D-08).

### New CSS for badges

> ⚠ SUPERSEDED — the authoritative CSS contract is `174-UI-SPEC.md` (§CSS Contract).
> This early sketch is **wrong in two ways**: (1) it scopes `.node-badge` to
> `.species-index`, but the badge MUST be unscoped because genus/subgenus pages use
> `.taxon-page`, NOT `.species-index`; (2) padding `0.1rem 0.35rem` is off the 4px grid.
> Use UI-SPEC's unscoped `.node-badge { padding: 0.25rem 0.5rem }`. Do NOT copy the block below.

```css
/* SUPERSEDED — see 174-UI-SPEC.md CSS Contract; do NOT scope to .species-index, do NOT copy */
.species-index .node-badge { /* WRONG SCOPE — UI-SPEC uses unscoped .node-badge */
  flex: 0 0 auto;
  font-size: 0.75rem;
  padding: 0.1rem 0.35rem; /* WRONG — off-grid; UI-SPEC uses 0.25rem 0.5rem */
  border-radius: 3px;
  background: var(--surface-subtle, #f5f5f5);
  border: 1px solid var(--border, #ddd);
  color: var(--text-muted, #666);
  white-space: nowrap;
  cursor: help; /* signals title= tooltip */
}
.species-index .node-badge--specialist {
  border-color: var(--accent, #2c7a2c);
  color: var(--accent, #2c7a2c);
}
```

### genus.njk / subgenus.njk species-row badges

In `genus.njk`, within each `{%- for sp in sg.species -%}` and `{%- for sp in genus.species -%}` block, the existing `<li>` has a swatch, name link, and count span. Since `genusList` spreads the full sp row, `sp.sociality`, `sp.diet_breadth`, `sp.sociality_source`, `sp.diet_breadth_source`, `sp.host_plant_family` are all accessible. Same pattern as the index badge, using the same CSS classes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Taxonomic name pluralization | Custom logic | `quantify` filter (already exists) | Handles irregular nouns; consistent across all copy |
| Species.json fetching | New fetch mechanism | Existing `deploy.yml` manifest fetch (species key already exists) | D-01 explicitly requires no new manifest key |
| Tooltip/popover UI for provenance | JS tooltip component | Native HTML `title=` attribute | D-08 explicitly says "zero JS, no new tooltip component" |
| Host-bee link generation at runtime | Client-side JS resolver | Build-time resolution in `_data/species.js` | Static hosting constraint; no server runtime |

---

## Common Pitfalls

### Pitfall 1: Adding trait fields to SPECIES_COLUMNS

**What goes wrong:** Adding trait column names to `SPECIES_COLUMNS` in `species_export.py` causes the parquet schema write to expect those columns, but the dbt mart parquet only has 21 columns — the query `SELECT {mart_cols} FROM read_parquet(...)` would either fail or silently NULL the missing columns.
**Why it happens:** Confusing Path A (widen dbt mart) with Path B (merge in Python).
**How to avoid:** Under Path B, `SPECIES_COLUMNS` stays exactly as-is. Trait fields enter `species_rows` via the merge step and appear in JSON via `_jsonify_rows()`. They never go through the pyarrow schema write.

### Pitfall 2: Forgetting the transition nightly requires SKIP_INTEGRATION_GATE

**What goes wrong:** First nightly after deployment fails the `test_species_json_matches` integration gate and aborts before uploading the new species.json to S3.
**Why it happens:** The gate compares the freshly-generated species.json (with trait fields) against the S3 baseline (without trait fields) — they differ.
**How to avoid:** The operator runs `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` once. After that, the S3 baseline has trait fields and the gate passes normally.

### Pitfall 3: host_bees lookup case sensitivity

**What goes wrong:** `byScientificName["Andrena accepta"]` works but `byScientificName["andrena accepta"]` does not. If Bee-Gap host_taxon names have different capitalization from atlas `scientificName` values, the resolution falls through to plain text.
**Why it happens:** `byScientificName` keys on `scientificName` (title-case genus, lowercase epithet), while Bee-Gap names may differ by case or authority.
**How to avoid:** The fallback to plain text is correct per D-05; don't add case-insensitive lookups without first checking actual coverage. For the genus-only hosts (single token), `higherTaxaByRankName['genus']` is keyed on title-case genus names which should match well.

### Pitfall 4: diet_breadth "specialist" without host_plant_family

**What goes wrong:** Rendering "Specialist (null)" or "Specialist (undefined)" for Fowler-sourced specialists whose `host_plant_family` is absent.
**Why it happens:** The mart: `NULLIF(sp.host_plant_family, '') AS host_plant_family` — this CAN be NULL for a specialist row if Fowler records are incomplete.
**How to avoid:** Nunjucks conditional: `{% if sp.host_plant_family %}Specialist ({{ sp.host_plant_family }}){% else %}Specialist{% endif %}`.

### Pitfall 5: Tribe page has no species rows — D-07 "tribe path" threading is moot

**What goes wrong:** Spending time adding badges to `tribe.njk` when the template has no `{%- for sp in ... -%}` species loop.
**Why it happens:** D-07 mentions "tribe path" but `tribeList` aggregates at genus level; `tribe.njk` shows genus items, not species items.
**How to avoid:** See Open Questions §1. Planning decision needed.

### Pitfall 6: makeSpeciesNode omission breaks species.njk badges while genus.njk works

**What goes wrong:** genus.njk badges work (genusList uses `{...sp}` spread → trait fields included automatically) but species.njk badges don't (makeSpeciesNode explicitly lists fields → new fields must be added).
**Why it happens:** The two code paths differ in how they construct the species object.
**How to avoid:** Explicitly add all 5 badge fields to `makeSpeciesNode`. No change needed to genusList/subgenusList.

### Pitfall 7: `species_traits.parquet` absent in test sandbox breaks new merge step

**What goes wrong:** `test_slug_hierarchical` and other `sandbox_parquet`-fixture tests fail because `export_species_parquet` now tries to read `species_traits.parquet` from `DBT_SANDBOX_DIR` but the fixture only builds `species.parquet` and `occurrences.parquet`.
**How to avoid:** Add `species_traits_fixture.csv` to `data/tests/fixtures/` and extend the `sandbox_parquet` fixture in `test_species_export.py` to produce `species_traits.parquet`. The fixture needs only the 11 trait columns plus `canonical_name`. Make the merge step gracefully skip (warn, not crash) if `species_traits.parquet` is absent.

---

## Test / Validation Surface

### Existing tests — impact analysis

| Test file | Test | Impact under Path B |
|-----------|------|---------------------|
| `test_species_export.py::test_slug_hierarchical` | Slug format | No change needed |
| `test_species_export.py::test_no_old_slug_format` | Slug format | No change needed |
| `test_species_export.py::test_inat_obs_count_in_species` | Column present in output | No change needed (`inat_obs_count` stays in SPECIES_COLUMNS) |
| `test_dbt_diff.py::test_species_parquet_schema_matches` | Sandbox 21 cols + public 22 cols | **No change needed** (parquet schema unchanged under Path B) |
| `test_dbt_diff.py::test_species_json_matches` | Byte-stable species.json | **Fails on transition nightly** — needs `SKIP_INTEGRATION_GATE=1` once |
| `src/tests/data-species.test.ts` | All existing tests | None broken (new fields are additive; existing field assertions still pass) |
| `src/tests/validate-species.test.ts` | Photo manifest validation | No change needed |

### New tests needed

**`data/tests/test_species_export.py`:**
- `sandbox_parquet` fixture: add `species_traits.parquet` generation from new `species_traits_fixture.csv`
- `test_trait_fields_in_species_json`: after `export_species_parquet()`, assert that at least one row in output `species.json` has a non-null `sociality` field
- `test_trait_fields_absent_gracefully`: assert that when `species_traits.parquet` is absent, `export_species_parquet()` completes without raising and all rows have `None` for trait fields

**`src/tests/data-species.test.ts`:**
- `makeSpeciesNode species leaf carries sociality and diet_breadth fields`: in `fullTree`, find a species leaf from a known-trait species (e.g., Bombus species which are "Social" from genus backbone); assert `node.sociality` is a string or null (not undefined, meaning the field was explicitly included)
- `genusList species spread carries trait fields`: since genusList uses `{...sp}`, verify that after the pipeline runs, a species in genusList with a known sociality value has it present (data-dependent; can be guarded with skip if field absent)

---

## Validation Architecture

**Framework:** Vitest (JS) + pytest (Python)
**Config:** `vitest.config.ts` / `pyproject.toml` (`addopts = -m "not integration"`)

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Command | File Exists? |
|--------|----------|-----------|---------|-------------|
| TRAIT-UI-01 | Trait fields present in species.json | unit (Python) | `cd data && uv run pytest tests/test_species_export.py -x` | Existing file, new tests needed |
| TRAIT-UI-02 | host_bees → resolvedHostBees resolution | unit (JS) | `npm test` | Existing file, new tests needed |
| TRAIT-UI-03 | makeSpeciesNode carries badge fields | unit (JS) | `npm test` | Existing file, new tests needed |
| TRAIT-UI-04 | title= attribute renders in HTML | manual UAT (HTML inspect) | — | Manual only |
| TRAIT-UI-05 | No committed public/data/ artifacts | N/A — process | `git status` after run | N/A |

**Per-task commit:** `npm test` (fast Vitest suite) + `cd data && uv run pytest -m "not integration"` (fast Python suite)
**Per-wave merge:** Same commands, both must be green
**Phase gate:** Both suites green + manual UAT of trait rendering on detail page + badges on /species/ tree + provenance tooltip inspectable

### Wave 0 Gaps

- New test file NOT needed; add tests to existing `test_species_export.py` and `data-species.test.ts`
- New fixture file: `data/tests/fixtures/species_traits_fixture.csv` (canonical_name + 11 trait columns, ~3–5 rows covering sociality/diet/nesting/native/host_bees variations)
- Fixture setup update: `sandbox_parquet` in `test_species_export.py` needs to write `species_traits.parquet` to sandbox dir

---

## Environment Availability

All required tools are pre-existing on the developer machine and in CI. No new dependencies.

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| dbt-duckdb | species_traits.parquet emission | Yes | existing nightly + local dev |
| pyarrow | species_export.py | Yes | existing |
| Eleventy 3.x | template rendering | Yes | existing |
| Nunjucks | template syntax | Yes | existing (Eleventy's default) |

**Missing dependencies with no fallback:** None.

---

## Security Domain

No new authentication, sessions, user input, or cryptography. Species traits are read-only build-time data from committed seeds. ASVS does not apply to this static data-display phase.

---

## Open Questions (RESOLVED)

> All three questions were closed during planning (Phase 174 plan-check). Plans
> 174-01..03 implement the recommended answer for each:
> - **Q1 RESOLVED:** tribe.njk has no species rows → no badge work there; D-07's tribe mention is a no-op (planner confirmed; tribe.njk excluded from badge tasks).
> - **Q2 RESOLVED:** warn-and-proceed with null trait fields when `species_traits.parquet` is absent in local dev (no hard-fail).
> - **Q3 RESOLVED:** keep the raw "Social" label (no eusocial remap).

### 1. D-07 "tribe pages" — what does this mean for tribe.njk?  *(RESOLVED: exclude tribe.njk — no species rows to badge; planner confirmed)*

**What we know:** `tribe.njk` iterates `tribe.genera` (genus rows, not species rows). There are no species `<li>` items on the tribe page. D-07 says "species rows on genus / subgenus / tribe pages."

**What's unclear:** Does D-07 intend:
  (a) Adding a per-species listing to `tribe.njk` (new HTML section, tribeList builder changes to carry per-species data), or
  (b) "tribe pages" is a loose reference meaning "the data layer that feeds tribe pages" — and since tribe.njk has no species rows, there's nothing to badge there, and D-07's tribe mention is moot?

**Recommendation:** Implement (b) — no change to tribe.njk. The tribeList builder in `_data/species.js` carries genera only and the template renders genera only. Adding a species listing to tribe.njk is a scope expansion beyond what species-detail pages and genus/subgenus pages require. Flag for planner to confirm.

### 2. species_traits.parquet graceful-degradation in local dev  *(RESOLVED: warn-and-proceed, no hard-fail)*

**What we know:** `species_traits.parquet` will not exist in local dev unless the developer runs `bash data/dbt/run.sh build` first.

**What's unclear:** Should the merge step (a) hard-fail with a helpful `FileNotFoundError` matching the pattern in `export_species_parquet` for `species.parquet` and `occurrences.parquet`, or (b) warn and proceed with null trait fields?

**Recommendation:** Warn and proceed (option b). The species export is still useful without traits (the rest of the site works). A developer running `uv run python species_export.py` locally should see a clear warning but not a hard failure. A `FileNotFoundError` would be too aggressive since local dev often skips the full dbt build.

### 3. Sociality label for "Social" — eusocial distinction?  *(RESOLVED: keep "Social" as-is)*

**What we know:** Bee-Gap uses "Social" (not "Eusocial"). The domain vocabulary in CLAUDE.md does not mention eusocial. The CONTEXT.md D-09 only prescribes the "Parasitic" → "Cleptoparasitic" remap.

**What's unclear:** Should "Social" display as "Social" or "Eusocial"?

**Recommendation:** Keep "Social" (as-is from the source). The Bee-Gap label is "Social" and the project hasn't specified an eusocial distinction. Do not remap unless the domain expert (user) requests it.

---

## Sources

### Primary (HIGH confidence — verified from source files in this session)

- `data/dbt/models/marts/species_traits.sql` — exact column set, nullable fields, source enum values, NULL-not-inferred rule
- `data/dbt/models/marts/schema.yml` — species mart contract (21 cols), confirmed no `species_traits` contract
- `data/dbt/models/marts/species.sql` — confirmed species mart is 21-col external parquet, selects from int_species_universe
- `data/species_export.py` — `SPECIES_COLUMNS` (22 items), `_jsonify_rows`, the two-path design, `DBT_SANDBOX_DIR` pattern
- `_data/species.js` — `byScientificName`, `higherTaxaByRankName`, `makeSpeciesNode`, genusList/subgenusList spread pattern, fullTree builder
- `_pages/species-detail.njk` — current detail page structure; metadata, checklist-attribution, taxon-action placement
- `_pages/species.njk` — `renderNode` macro; species leaf structure; flex row with node-name/node-counts/node-map
- `_pages/genus.njk` — species list rendering with `{...sp}` spread confirmation
- `_pages/subgenus.njk` — same spread confirmation
- `_pages/tribe.njk` — confirmed: genera only, no species rows
- `src/styles/taxon-pages.css` — existing CSS classes; confirmed no existing badge/chip/dl class
- `eleventy.config.js` — `quantify` as the only custom filter; no existing `traitLabel` or similar
- `data/tests/test_species_export.py` — `sandbox_parquet` fixture; existing assertions; test_species_parquet_schema_matches contract
- `data/tests/test_dbt_diff.py` — `pytestmark = pytest.mark.integration`; `test_species_json_matches` byte-stability
- `src/tests/data-species.test.ts` — existing assertions; none check for absence of extra fields
- `data/nightly.sh` — `SKIP_INTEGRATION_GATE=1` pattern documented at lines 244–260
- `scripts/validate-db.mjs` — confirmed: checks only `occurrences.db` SQLite tables, not species.json columns
- `data/tests/fixtures/species_fixture.csv` — confirmed 21 col headers matching SPECIES_COLUMNS[:-1]
- `.planning/config.json` — `nyquist_validation: true`

### Secondary (MEDIUM confidence)

- Memory `project_occurrences_contract_release_sequence` — established `SKIP_INTEGRATION_GATE=1` pattern for transition nightlies; applicable here for the species.json field expansion

---

## Metadata

**Confidence breakdown:**
- D-03 mechanism (Path B): HIGH — verified from direct inspection of species_export.py, schema.yml, test_dbt_diff.py
- species_traits column set: HIGH — verified from species_traits.sql
- makeSpeciesNode threading: HIGH — verified from _data/species.js source
- genusList/subgenusList spread — no code change needed: HIGH — verified from spread operator in species.js
- tribe.njk has no species rows: HIGH — verified from tribe.njk template
- host-bee resolution approach: HIGH — verified from byScientificName/higherTaxaByRankName lookups in species.js
- Transition nightly pattern: HIGH — verified from nightly.sh SKIP_INTEGRATION_GATE documentation
- CSS badge design: MEDIUM — design proposal not yet validated by user; discretionary per CONTEXT.md

**Research date:** 2026-06-29
**Valid until:** 2026-07-30 (stable codebase; no fast-moving ecosystem dependencies)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | host_taxon names from bee_parasite_hosts are in mixed case matching atlas `scientificName` format for WA taxa | Host-bee resolution | Low; fallback to plain text is correct per D-05 |
| A2 | "Social" from Bee-Gap should display as "Social" (not "Eusocial") | Label mapping D-09 | Low; user can clarify; no remap planned |
| A3 | tribe.njk "tribe path" in D-07 means threading in the data layer is sufficient; no species listing is needed on tribe pages | D-07 tribe pages | Medium; if user expects tribe.njk species badges, plan must add a species listing to tribe.njk — new work |
