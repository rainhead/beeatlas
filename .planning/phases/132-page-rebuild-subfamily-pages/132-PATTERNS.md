# Phase 132: Page Rebuild & Subfamily Pages - Pattern Map

**Mapped:** 2026-06-02
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/dbt/models/staging/stg_inat__higher_rank_taxon_ids.sql` | staging model | transform | `data/dbt/models/staging/stg_inat__genus_taxon_ids.sql` | exact |
| `data/dbt/models/marts/higher_taxa.sql` | mart model | CRUD | `data/dbt/models/marts/species.sql` | role-match |
| `data/dbt/models/marts/schema.yml` (extended) | config | — | `data/dbt/models/marts/schema.yml` (existing species block) | exact |
| `_pages/subfamily.njk` | template | request-response | `_pages/tribe.njk` | role-match |
| `_data/species.js` (modified) | data provider | transform | `_data/species.js` (existing tribeList block) | exact |
| `data/species_maps.py` (modified) | utility | batch | `data/species_maps.py` `_generate_group_maps` tribe pass | exact |
| `data/species_export.py` (modified) | utility | batch | `data/species_export.py` `_build_higher_rank_taxon_ids` + `export_species_parquet` | exact |
| `data/nightly.sh` (modified) | config | — | `data/nightly.sh` `_upload_hashed` + manifest block | exact |
| `scripts/fetch-data.sh` + `scripts/make-local-manifest.js` (modified) | config | — | same files (existing download list + manifest keys) | exact |

---

## Pattern Assignments

### `data/dbt/models/staging/stg_inat__higher_rank_taxon_ids.sql` (staging model, transform)

**Analog:** `data/dbt/models/staging/stg_inat__genus_taxon_ids.sql`

**Full analog file** (lines 33–62):
```sql
{{ config(materialized='view') }}

WITH animal_genera AS (
    SELECT
        lower(name)        AS genus_name,
        taxon_id::INTEGER  AS taxon_id
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
    WHERE rank = 'genus'
      AND active = 'true'
      AND list_contains(string_split(ancestry, '/'), '1')  -- kingdom = Animalia (taxon 1)
)

SELECT genus_name, ANY_VALUE(taxon_id) AS taxon_id
FROM animal_genera
GROUP BY genus_name
HAVING COUNT(*) = 1  -- exclude cross-phylum homonyms
```

**Adaptation for higher-rank view:** This new staging view extends the same
`read_csv('../raw/taxa.csv.gz', ...)` pattern to `rank IN ('subfamily', 'tribe', 'subgenus')`
(genus is already handled by `stg_inat__genus_taxon_ids`). Switch ancestry filter from
Animalia (`'1'`) to Anthophila (`'630955'`) — bee higher ranks only. Keep `name` as-is
(capitalized, not lowercased) since higher-rank names are used as URL path segments.

**Key differences from genus analog:**
- Filter: `AND list_contains(string_split(ancestry, '/'), '630955')` (not `'1'`)
- Ranks: `WHERE rank IN ('subfamily', 'tribe', 'subgenus')`
- Output columns: `name` (capitalized), `rank`, `taxon_id::INTEGER`
- No homonym dedup needed (tribal/subfamily names are unique within Anthophila per A1; add a `unique` dbt test on `(name, rank)` pair as safety net)

**Corresponding `schema.yml` entry** (model: `stg_inat__genus_taxon_ids`, staging/schema.yml lines 44–55):
```yaml
  - name: stg_inat__genus_taxon_ids
    columns:
      - name: genus_name
        data_tests:
          - not_null
          - unique
```
Mirror this `unique` test for the new staging view on `name` within each `rank`.

---

### `data/dbt/models/marts/higher_taxa.sql` (mart model, CRUD)

**Analog:** `data/dbt/models/marts/species.sql`

**Full analog** (lines 1–38):
```sql
-- Species mart: 21-column external parquet (species.parquet).
-- slug column is intentionally OMITTED — it requires unicodedata.normalize('NFKD')
{{ config(
    materialized='external',
    location='target/sandbox/species.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}

SELECT
    scientificName,
    canonical_name,
    ...
    taxon_id
FROM {{ ref('int_species_universe') }}
```

**Adaptation for higher_taxa mart:**
```sql
{{ config(
    materialized='external',
    location='target/sandbox/higher_taxa.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}
```

The mart reads `{{ ref('species') }}` (the 21-col species mart) joined against the new
`{{ ref('stg_inat__higher_rank_taxon_ids') }}` view via name-match (safe because names
are unique per rank within Anthophila, per A1). `GROUP BY ancestor_taxon_id` with `SUM`
aggregation for counts. One row per higher-rank taxon; no slug column (same reason as
species mart — slug requires Python). Columns follow the shape in RESEARCH.md §Pattern 2.

**Join pattern for ancestor resolution** (from RESEARCH.md §Pattern 1):
```sql
-- For genus: join existing stg_inat__genus_taxon_ids on lower(sp.genus) = gtids.genus_name
-- For tribe/subfamily/subgenus: join new stg_inat__higher_rank_taxon_ids on
--   sp.tribe = htids.name WHERE htids.rank = 'tribe'  (etc.)
-- GROUP BY ancestor_taxon_id — never fan out rows before aggregating
```

---

### `data/dbt/models/marts/schema.yml` (extended — higher_taxa contract)

**Analog:** existing `species` block in `data/dbt/models/marts/schema.yml` (lines 87–136)

**Pattern to replicate** (species contract, lines 87–136):
```yaml
  - name: species
    config:
      contract:
        enforced: true
    columns:
      - name: canonical_name
        data_type: varchar
      - name: occurrence_count
        data_type: bigint
      - name: taxon_id
        data_type: integer
        constraints:
          - type: not_null
```

**New block to append** (from RESEARCH.md §dbt Contract Shape):
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

### `_pages/subfamily.njk` (template, request-response)

**Analogs:** `_pages/tribe.njk` (primary — lists children) and `_pages/genus.njk` (swatch
pattern for species list). The subfamily page is "the tribe page, grouped" per CONTEXT.md.

**Pagination frontmatter pattern** from `_pages/tribe.njk` (lines 1–10):
```njk
---
pagination:
  data: species.tribeList
  size: 1
  alias: tribe
permalink: "/species/tribe/{{ tribe.tribe }}/"
eleventyComputed:
  title: "{{ tribe.tribe }} — BeeAtlas"
layout: default.njk
---
```

**Adaptation for subfamily.njk:**
```njk
---
pagination:
  data: species.subfamilyList
  size: 1
  alias: subfamily
permalink: "/species/subfamily/{{ subfamily.subfamily }}/"
eleventyComputed:
  title: "{{ subfamily.subfamily }} — BeeAtlas"
layout: default.njk
---
```

**Body structure pattern** — breadcrumb + h1 + metadata + media-grid from `_pages/tribe.njk`
(lines 11–35):
```njk
<article class="taxon-page">
  <nav class="breadcrumb">
    {{ tribe.family }}<span class="sep">/</span>{{ tribe.tribe }}
  </nav>
  <h1>{{ tribe.tribe }}</h1>
  <p class="metadata">{{ tribe.generaCount }} genera · {{ tribe.totalOccurrences }} records</p>
  <div class="media-grid">
    <img loading="lazy"
         src="/data/species-maps/tribe/{{ tribe.tribe }}.svg"
         alt="Occurrence map for tribe {{ tribe.tribe }}"
         style="aspect-ratio: 15/8; width: 100%;">
    <ul class="species-list">
    {%- for g in tribe.genera -%}
      <li>
        <a href="/species/{{ g.genus }}/index.html"><em>{{ g.genus }}</em></a>
        <span class="count">{{ g.specimen_count }} specimens · {{ g.inat_obs_count }} community observations</span>
      </li>
    {%- endfor -%}
    </ul>
  </div>
  {%- if tribe.taxon_id -%}
  <a class="taxon-action" href="https://www.inaturalist.org/taxa/{{ tribe.taxon_id }}">View on iNaturalist →</a>
  {%- endif -%}
</article>
<script type="module" src="/src/entries/taxon-page.ts"></script>
```

**Adaptation for subfamily.njk (D-04 nested layout):**
- Map src: `/data/species-maps/subfamily/{{ subfamily.subfamily }}.svg`
- Metadata line: `{{ subfamily.tribesCount }} tribes · {{ subfamily.generaCount }} genera · {{ subfamily.totalOccurrences }} records` (or elide tribes count for tribe-less cases per D-05)
- Genus swatch: copy `<span class="swatch" style="background: {{ g.hexColor }};">` from `_pages/genus.njk` line 25 — subfamily data object carries `hexColor` per genus
- Nested structure: iterate `subfamily.tribes`, each tribe as `<h2>` linking to `/species/tribe/{tribe}/`; nest `for g in tribe.genera` beneath; D-05: if `subfamily.tribes` is empty, render `subfamily.genera` flat with no heading wrapper
- iNat link: same `{%- if subfamily.taxon_id -%}` guard pattern from `_pages/tribe.njk` line 31

---

### `_data/species.js` (modified — rewire onto higher_taxa.json + add subfamilyList)

**Analog:** existing file, specifically the `tribeList` block (lines 229–265) and file header
(lines 1–25).

**File header — current `readFileSync` pattern** (lines 13–24):
```javascript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const speciesJsonPath = join(repoRoot, 'public/data/species.json');
const seasonalityJsonPath = join(repoRoot, 'public/data/seasonality.json');
const higherRankTaxonIdsPath = join(repoRoot, 'public/data/higher_rank_taxon_ids.json');

const raw = JSON.parse(readFileSync(speciesJsonPath, 'utf8'));
const higherRankTaxonIds = JSON.parse(readFileSync(higherRankTaxonIdsPath, 'utf8'));
```

**Rewire:** Replace `higherRankTaxonIdsPath` / `higherRankTaxonIds` with:
```javascript
const higherTaxaPath = join(repoRoot, 'public/data/higher_taxa.json');
const higherTaxa = JSON.parse(readFileSync(higherTaxaPath, 'utf8'));
// Index by rank + name for O(1) lookup:
// higherTaxaByRankName['genus']['Andrena'] -> { taxon_id: ..., specimen_count: ..., ... }
const higherTaxaByRankName = {};
for (const row of higherTaxa) {
  if (!higherTaxaByRankName[row.rank]) higherTaxaByRankName[row.rank] = {};
  higherTaxaByRankName[row.rank][row.name] = row;
}
```

**taxon_id lookup pattern** — current usage at lines 154, 223, 262:
```javascript
// CURRENT:
taxon_id: higherRankTaxonIds.genus[g.genus] ?? null,
taxon_id: higherRankTaxonIds.subgenus[g.subgenus] ?? null,
taxon_id: higherRankTaxonIds.tribe[t.tribe] ?? null,

// NEW:
taxon_id: higherTaxaByRankName['genus']?.[g.genus]?.taxon_id ?? null,
taxon_id: higherTaxaByRankName['subgenus']?.[g.subgenus]?.taxon_id ?? null,
taxon_id: higherTaxaByRankName['tribe']?.[t.tribe]?.taxon_id ?? null,
```

**tribeList build pattern** (lines 229–265) — copy as template for `subfamilyList`:
```javascript
const tribeMap = {};
for (const sp of flat) {
  if (!sp.tribe || sp.tribe.trim() === '') continue;
  if (!tribeMap[sp.tribe]) {
    tribeMap[sp.tribe] = {
      tribe: sp.tribe,
      family: sp.family,
      generaMap: {},
    };
  }
  if (!tribeMap[sp.tribe].generaMap[sp.genus]) {
    tribeMap[sp.tribe].generaMap[sp.genus] = { occurrence_count: 0, specimen_count: 0, inat_obs_count: 0 };
  }
  tribeMap[sp.tribe].generaMap[sp.genus].occurrence_count += sp.occurrence_count;
  tribeMap[sp.tribe].generaMap[sp.genus].specimen_count += (sp.specimen_count || 0);
  tribeMap[sp.tribe].generaMap[sp.genus].inat_obs_count += (sp.inat_obs_count || 0);
}
const tribeList = Object.values(tribeMap)
  .sort((a, b) => a.tribe.localeCompare(b.tribe))
  .map(t => {
    const genera = Object.entries(t.generaMap)
      .filter(([, counts]) => counts.occurrence_count > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([genus, counts]) => ({ genus, ...counts }));
    const totalOccurrences = genera.reduce((acc, g) => acc + g.occurrence_count, 0);
    return {
      tribe: t.tribe,
      family: t.family,
      genera,
      generaCount: genera.length,
      totalOccurrences,
      taxon_id: higherRankTaxonIds.tribe[t.tribe] ?? null,  // <- rewire to higherTaxaByRankName
    };
  })
  .filter(t => t.totalOccurrences > 0);
```

**`hslToHex` pattern** (lines 82–96) — call at genus granularity for subfamily swatches (D-06).
For subfamily, `hslToHex` receives `i * 360 / N` where `N` = number of genera in the subfamily
(sorted alphabetically), matching Python `_group_colors(genera_for_subfamily)`:
```javascript
// Phase 93 D-01 color formula (lines 82-96) — must use same sort order as Python:
function hslToHex(h, s, l) { /* ... unchanged ... */ }
// For subfamily: genus color index i is position in sorted(uniqueGenera)
```

**Export line** (line 267) — append `subfamilyList`:
```javascript
// CURRENT:
export default { tree, flat, byScientificName, counties, ecoregionL3, speciesList, genusList, subgenusList, tribeList };
// NEW:
export default { tree, flat, byScientificName, counties, ecoregionL3, speciesList, genusList, subgenusList, tribeList, subfamilyList };
```

---

### `data/species_maps.py` (modified — add subfamily pass to `_generate_group_maps`)

**Analog:** `data/species_maps.py`, `_generate_group_maps` tribe pass (lines 379–395).

**Tribe pass to copy** (lines 379–395):
```python
    # Tribe maps: tribe/<Tribe>.svg
    tribe_dir = maps_dir / "tribe"
    for tribe_name in sorted(tribe_members.keys()):
        members = tribe_members[tribe_name]
        species_points = {c: occ_by_canon.get(c, []) for c in members}
        colors = _group_colors(members)
        for c in members:
            if c in unresolved:
                colors[c] = _UNRESOLVED_COLOR
        total_clipped += _write_group_svg(tribe_name, species_points, colors, backdrop, tribe_dir)
        n_tribe += 1
```

**Adaptation for subfamily pass (D-06 — color by GENUS not species):**

First, extend the SQL query at line 315 to include `subfamily`:
```python
    rows = con.execute(
        f"""
        SELECT canonical_name, genus, subgenus, tribe, specific_epithet, subfamily
        FROM read_parquet('{species_parquet}')
        WHERE occurrence_count > 0
        ORDER BY canonical_name
        """
    ).fetchall()
```

Add `subfamily_members` and `genus_of` dicts in the membership build loop (lines 330–342):
```python
    subfamily_members: dict[str, list[str]] = defaultdict(list)
    genus_of: dict[str, str] = {}   # canonical_name -> genus

    for canonical_name, genus, subgenus, tribe, specific_epithet, subfamily in rows:
        # ... existing genus/subgenus/tribe logic unchanged ...
        if subfamily:
            subfamily_members[subfamily].append(canonical_name)
        if genus:
            genus_of[canonical_name] = genus
```

Add subfamily pass after tribe pass, before the final `print(...)`:
```python
    # Subfamily maps: subfamily/<Subfamily>.svg  (colored by GENUS — D-06)
    subfamily_dir = maps_dir / "subfamily"
    n_subfamily = 0
    for subfamily_name in sorted(subfamily_members.keys()):
        members = subfamily_members[subfamily_name]
        # Collect unique genera for this subfamily (sorted alphabetically — must match
        # the sort order species.js uses for hslToHex to produce matching hex values).
        genera_in_sf = sorted(set(genus_of[c] for c in members if c in genus_of))
        genus_colors = _group_colors(genera_in_sf)   # one color per genus
        # Map each species to its genus color; unresolved -> _UNRESOLVED_COLOR
        colors = {}
        for c in members:
            if c in unresolved:
                colors[c] = _UNRESOLVED_COLOR
            else:
                colors[c] = genus_colors.get(genus_of.get(c, ''), _UNRESOLVED_COLOR)
        species_points = {c: occ_by_canon.get(c, []) for c in members}
        total_clipped += _write_group_svg(subfamily_name, species_points, colors, backdrop, subfamily_dir)
        n_subfamily += 1
```

Update the final `print(...)` (line 391) to include `n_subfamily`.

**`_write_group_svg` call convention** (lines 261–291):
- `slug_path`: pass plain `subfamily_name` string (e.g. `"Apinae"`) → output at `subfamily_dir/Apinae.svg`
- `species_points`: `dict[canonical_name, list[tuple[float, float]]]` — all members including unresolved
- `colors`: `dict[canonical_name, hex_string]` — keyed by species `canonical_name`, value is genus hex
- `backdrop`: deepcopied per call inside `_write_group_svg` — pass the shared `backdrop` object
- `out_dir`: `subfamily_dir`

---

### `data/species_export.py` (modified — add `_build_higher_taxa`, retire `_build_higher_rank_taxon_ids`, add collision check)

**Analog:** `data/species_export.py`, existing functions `_build_higher_rank_taxon_ids` (lines 85–105)
and `export_species_parquet` artifact-write block (lines 299–318).

**`_build_higher_rank_taxon_ids` pattern to supersede** (lines 85–105):
```python
def _build_higher_rank_taxon_ids(con: duckdb.DuckDBPyConnection) -> dict:
    taxa_csv = str(Path(__file__).parent / "raw" / "taxa.csv.gz")
    rows = con.execute(
        "SELECT name, rank, taxon_id "
        "FROM read_csv(?, delim=chr(9), header=true, compression='gzip') "
        "WHERE rank IN ('genus', 'subgenus', 'tribe') AND active = true",
        [taxa_csv]
    ).fetchall()
    result: dict = {"genus": {}, "subgenus": {}, "tribe": {}}
    for name, rank, tid in rows:
        if rank in result:
            result[rank][name] = int(tid)
    return result
```

**New `_build_higher_taxa` pattern** — reads `DBT_SANDBOX_DIR/higher_taxa.parquet` (produced by
the new dbt mart), writes `ASSETS_DIR/higher_taxa.json`. Follow the `export_species_parquet`
artifact-write pattern (lines 217–228):
```python
def _build_higher_taxa(con: duckdb.DuckDBPyConnection) -> list[dict]:
    """Read dbt higher_taxa.parquet, emit higher_taxa.json. Returns rows for collision check."""
    higher_taxa_parquet = DBT_SANDBOX_DIR / 'higher_taxa.parquet'
    if not higher_taxa_parquet.exists():
        raise FileNotFoundError(
            f"species_export requires {higher_taxa_parquet}; "
            f"run `bash data/dbt/run.sh build` first"
        )
    rows = con.execute(
        f"SELECT * FROM read_parquet('{higher_taxa_parquet}') ORDER BY rank, name"
    ).fetchall()
    cols = [d[0] for d in con.description]
    higher_taxa_rows = [dict(zip(cols, r)) for r in rows]

    out = ASSETS_DIR / "higher_taxa.json"
    out.write_text(
        json.dumps(higher_taxa_rows, sort_keys=True, indent=2),
        encoding='utf-8',
    )
    print(f"  higher_taxa.json: {len(higher_taxa_rows):,} rows, {out.stat().st_size:,} bytes")
    assert len(higher_taxa_rows) > 0, "higher_taxa.json must be non-empty"
    return higher_taxa_rows
```

**Collision check pattern** — new function, called from `export_species_parquet` after slug
computation. Pattern: fail-loud `assert` matching the nightly gate philosophy (Phase 129 orphan
assertion). `AssertionError` propagates to `run.py`'s traceback handler cleanly:
```python
def _check_slug_collisions(higher_taxa_rows: list[dict], species_rows: list[dict]) -> None:
    """Hard-fail if any two distinct taxa produce the same public URL (D-07)."""
    seen: dict[str, tuple] = {}  # url -> (taxon_id, rank, name)
    # Higher-rank URLs use raw capitalized names (not slugified) — see URL_SCHEME in RESEARCH.md
    rank_url = {
        'genus':     lambda t: f"/species/{t['name']}/",
        'subgenus':  lambda t: f"/species/{t['genus']}/{t['name']}/",
        'tribe':     lambda t: f"/species/tribe/{t['name']}/",
        'subfamily': lambda t: f"/species/subfamily/{t['name']}/",
    }
    for row in higher_taxa_rows:
        url = rank_url[row['rank']](row)
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
        if url in seen and seen[url] != key:
            raise AssertionError(
                f"Slug collision between species {key!r} and {seen[url]!r} at URL {url!r}"
            )
        seen[url] = key
```

**Artifact-write block pattern** (lines 299–318) — call sequence to copy in `export_species_parquet`:
```python
    # ---- D-03: higher_rank_taxon_ids.json (RETIRED) → higher_taxa.json ---------
    higher_taxa_rows = _build_higher_taxa(con)
    _check_slug_collisions(higher_taxa_rows, species_rows)
    # Remove old _build_higher_rank_taxon_ids call + higher_rank_taxon_ids.json write
```

**Post-write verify pattern** (lines 207–215) — copy for higher_taxa:
```python
    assert len(higher_taxa_rows) > 0, "higher_taxa.json: must be non-empty"
    subfamily_count = sum(1 for r in higher_taxa_rows if r['rank'] == 'subfamily')
    assert subfamily_count == 12, f"higher_taxa.json: expected 12 bee subfamilies, got {subfamily_count}"
```

---

### `data/nightly.sh` (modified — swap higher_rank_taxon_ids for higher_taxa)

**Analog:** existing `nightly.sh` `_upload_hashed` call block (lines 168–184) and manifest
template (lines 186–202).

**Current upload line to replace** (line 178):
```bash
higher_rank_name=$(_upload_hashed "$EXPORT_DIR/higher_rank_taxon_ids.json" "higher_rank_taxon_ids")
```

**New line (same `_upload_hashed` function, different artifact name):**
```bash
higher_taxa_name=$(_upload_hashed "$EXPORT_DIR/higher_taxa.json" "higher_taxa")
```

**Current manifest template entry to replace** (line 193):
```bash
  "higher_rank_taxon_ids": "$higher_rank_name",
```

**New manifest entry:**
```bash
  "higher_taxa": "$higher_taxa_name",
```

**No change needed** for `species-maps/` S3 sync (line 209) — the recursive sync already
covers `species-maps/subfamily/` since it syncs the entire directory:
```bash
aws --profile "$AWS_PROFILE" s3 cp --recursive --no-progress "$EXPORT_DIR/species-maps/" "s3://$BUCKET/data/species-maps/"
```
CloudFront invalidation path `/data/species-maps/*` (line 219) also already covers new SVGs.

---

### `scripts/fetch-data.sh` + `scripts/make-local-manifest.js` (modified)

**Analog:** `scripts/fetch-data.sh` download loop (lines 22–25) and `scripts/make-local-manifest.js`
manifest object (lines 11–23).

**`fetch-data.sh` — current download list** (line 22):
```bash
for f in occurrences.parquet counties.geojson ecoregions.geojson species.json seasonality.json; do
```
Add `higher_taxa.json` to this list (or add a separate `aws s3 cp` call). Note `fetch-data.sh`
does NOT currently download `higher_rank_taxon_ids.json` — A4 from RESEARCH.md confirms this
was an open question; the new file should be added.

**`make-local-manifest.js` — current object** (lines 11–23):
```javascript
writeFileSync(outPath, JSON.stringify({
  occurrences: 'occurrences.parquet',
  occurrences_db: 'occurrences.db',
  occurrences_db_tables: ['geo_blob', 'occurrences'],
  species: 'species.json',
  seasonality: 'seasonality.json',
  counties: 'counties.geojson',
  ecoregions: 'ecoregions.geojson',
  places: 'places.geojson',
  places_meta: 'places.json',
  checklist: 'checklist.parquet',
  generated_at: 'local',
}, null, 2) + '\n');
```
Add `higher_taxa: 'higher_taxa.json'` to this object. Remove `higher_rank_taxon_ids` if it
was ever added (it is NOT currently in this file — confirmed clean).

---

## Shared Patterns

### External Parquet Materialization (dbt mart)
**Source:** `data/dbt/models/marts/species.sql` lines 8–13
**Apply to:** `higher_taxa.sql`
```sql
{{ config(
    materialized='external',
    location='target/sandbox/higher_taxa.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}
```

### Enforced Contract (dbt schema.yml)
**Source:** `data/dbt/models/marts/schema.yml` lines 87–92
**Apply to:** `higher_taxa` entry in same file
```yaml
    config:
      contract:
        enforced: true
```

### Artifact JSON Write Pattern (Python export)
**Source:** `data/species_export.py` lines 217–229
**Apply to:** `_build_higher_taxa` write block
```python
out.write_text(
    json.dumps(rows, sort_keys=True, indent=2),
    encoding='utf-8',
)
print(f"  artifact.json: {len(rows):,} rows, {out.stat().st_size:,} bytes")
assert len(rows) > 0, "artifact.json must be non-empty"
```

### Fail-Loud Assert Gate
**Source:** `data/species_export.py` line 215; `data/species_maps.py` line 424 (FileNotFoundError)
**Apply to:** `_check_slug_collisions` and `_build_higher_taxa`
```python
raise AssertionError(f"descriptive message with all context: {values!r}")
```

### Eleventy Pagination Frontmatter
**Source:** `_pages/tribe.njk` lines 1–10 (and genus.njk, subgenus.njk)
**Apply to:** `_pages/subfamily.njk`
```njk
pagination:
  data: species.<listName>
  size: 1
  alias: <alias>
permalink: "/species/<prefix>/{{ <alias>.<nameField> }}/"
eleventyComputed:
  title: "{{ <alias>.<nameField> }} — BeeAtlas"
layout: default.njk
```

### iNaturalist Link Guard
**Source:** `_pages/tribe.njk` lines 31–33; `_pages/genus.njk` lines 38–40
**Apply to:** `_pages/subfamily.njk`
```njk
{%- if subfamily.taxon_id -%}
<a class="taxon-action" href="https://www.inaturalist.org/taxa/{{ subfamily.taxon_id }}">View on iNaturalist →</a>
{%- endif -%}
```

### Color-by-Group HSL Pattern
**Source:** `data/species_maps.py` `_group_colors` lines 138–164; `_data/species.js` `hslToHex` lines 82–96
**Apply to:** subfamily pass in `_generate_group_maps`; subfamily swatch coloring in `species.js`
- Python: `_group_colors(sorted_genus_list)` — input is **genera** (not species), sorted alphabetically
- JS: `hslToHex(i * 360 / N, 70, 50)` where `N = uniqueGeneraForSubfamily.length`, `i` = genus position in sorted order
- **Critical:** both sides must use the same sorted genus list as input so swatch colors match map dot colors (RESEARCH.md Pitfall 2)

### `read_csv` from taxa.csv.gz
**Source:** `data/dbt/models/staging/stg_inat__genus_taxon_ids.sql` lines 38–55
**Apply to:** `stg_inat__higher_rank_taxon_ids.sql`
```sql
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
```
Path note: `../raw/taxa.csv.gz` resolves from dbt's CWD (`data/dbt/`) to `data/raw/taxa.csv.gz`.

---

## No Analog Found

All files have close analogs in the codebase. No entries in this section.

---

## Metadata

**Analog search scope:** `data/dbt/models/`, `_pages/`, `_data/`, `data/*.py`, `data/nightly.sh`,
`scripts/`
**Files read:** 14
**Pattern extraction date:** 2026-06-02
