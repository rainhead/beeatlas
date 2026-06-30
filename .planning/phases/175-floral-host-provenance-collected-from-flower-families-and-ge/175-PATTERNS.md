# Phase 175: Floral Host Provenance ("Collected from") - Pattern Map

**Mapped:** 2026-06-30
**Files analyzed:** 8 (5 new, 3 modified)
**Analogs found:** 8 / 8 (every file has a strong in-repo analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/host_plant_lineage.py` (NEW; or add fn to `taxa_pipeline.py`) | pipeline step | transform (ancestry walk) | `data/taxa_pipeline.py::load_taxon_lineage_extended` | exact |
| `data/run.py` (MOD — register step) | orchestrator | batch | `run.py` STEPS `("taxon-lineage-extended", …)` | exact |
| `data/dbt/models/sources.yml` (MOD — add source table) | dbt source decl | config | `inaturalist_data.taxon_lineage_extended` entry (line 17) | exact |
| `data/dbt/models/staging/stg_inat__host_plant_lineage.sql` (NEW) | dbt staging view | transform | `staging/stg_inat__taxon_lineage_extended.sql` | exact |
| `data/dbt/models/intermediate/int_species_host_plants.sql` (NEW) | dbt intermediate | CRUD/aggregate | `intermediate/int_species_universe.sql` agg CTEs | role-match |
| `data/species_export.py` (MOD — add sidecar producer) | sidecar exporter | file-I/O | `species_export.py` seasonality.json / photos.json blocks | exact |
| `_data/species_hosts.js` (NEW) | Eleventy _data loader | file-I/O | `_data/photos.js` (sidecar) + `_data/species.js` (public/data JSON) | exact |
| `_pages/species-detail.njk` (MOD — "Collected from" block) | template | request-response | the `<section class="traits">` block, lines 28-59 | exact |
| `.github/workflows/deploy.yml` + `data/nightly.sh` (MOD — publish/fetch) | CI/config | config | species.json/seasonality.json manifest+fetch | exact |

---

## Pattern Assignments

### `data/host_plant_lineage.py` (pipeline step, ancestry-walk transform)

**Analog:** `data/taxa_pipeline.py::load_taxon_lineage_extended` (lines 86-168) — THE direct model.

**Core ancestry-walk + PIVOT pattern** (`taxa_pipeline.py:111-162`):
```python
con.execute("""
    CREATE OR REPLACE TABLE inaturalist_data.taxon_lineage_extended AS
    WITH all_active_bees AS (
        SELECT taxon_id, ancestry, rank, name
        FROM read_csv(?, delim='\t', header=true, compression='gzip',
                      columns={'taxon_id':'BIGINT','ancestry':'VARCHAR',
                               'rank_level':'INTEGER','rank':'VARCHAR',
                               'name':'VARCHAR','active':'VARCHAR'})
        WHERE active = 'true'
          AND (ancestry LIKE '%/630955/%' OR ancestry LIKE '%/630955'
               OR taxon_id = 630955)
    ),
    ancestor_ids AS (
        SELECT b.taxon_id AS target_taxon_id,
               CAST(unnest(string_split(b.ancestry, '/')) AS BIGINT) AS ancestor_id
        FROM all_active_bees b
    ),
    ancestor_rows AS (
        SELECT ai.target_taxon_id, anc.rank, anc.name
        FROM ancestor_ids ai
        JOIN all_active_bees anc ON anc.taxon_id = ai.ancestor_id
        WHERE anc.rank IN ('family','subfamily','tribe','genus','subgenus')
    ),
    self_rows AS ( ... rank IN (...) ),    -- genus/family taxa not in own ancestry
    all_rows AS ( ancestor_rows UNION ALL self_rows ),
    pivoted AS (
        PIVOT all_rows ON rank IN ('family',...,'subgenus')
            USING first(name) GROUP BY target_taxon_id
    )
    SELECT target_taxon_id AS taxon_id, family, subfamily, tribe, genus, subgenus
    FROM pivoted
""", [str(TAXA_PATH)])
```

**Key adaptations (the only real new logic in this phase):**
1. **Replace the Anthophila filter** (`ancestry LIKE '%/630955/%'`) with a **seed-set filter on the observed host taxon_ids**. Per CONTEXT the walk is bounded to ~915 host taxa, NOT all of Plantae. Source the seed set from the DB:
   ```sql
   -- distinct host plant taxon ids actually linked as floral hosts
   SELECT DISTINCT o.taxon__id
   FROM inaturalist_data.observations o
   JOIN ecdysis_data.occurrence_links l ON l.host_observation_id = o.id
   WHERE o.taxon__id IS NOT NULL
   ```
   Then keep a taxa.csv.gz row if `taxon_id IN (seed)` OR `any unnested ancestry id IN seed` — but the simplest mirror is: load ALL plant rows reachable, restrict the final result to the seed taxon_ids. Match the anti-patterns block in the docstring (`active = 'true'` string, `LIKE '%/N/%' OR '%/N'`, self_rows arm included).
2. **Output columns** can be narrowed to `(taxon_id, family, genus)` (CONTEXT only needs family + genus), or keep the full rank pivot for symmetry — Claude's discretion (naming/shape is explicitly delegated).
3. **Table name**: `inaturalist_data.host_plant_lineage` (CONTEXT suggestion).
4. Keep the `CREATE SCHEMA IF NOT EXISTS inaturalist_data`, `db_path` param default, and the `print(f"... {count} rows")` tail (`taxa_pipeline.py:110, 163-166`).

**LOCAL-DEV FLAG:** `data/raw/taxa.csv.gz` (37 MB) is NOT present locally (only the nightly `download-taxa` step fetches it). The family arm cannot be fully validated locally without a one-time download. The genus arm IS checkable from the DB (genus = first token of `taxon__name`). Plan verification accordingly (validate SQL shape locally; defer family-coverage assertion to nightly), per CONTEXT and `project_local_dbt_build_not_runnable`.

---

### `data/run.py` (orchestrator — register the new step)

**Analog:** the existing `taxon-lineage-extended` registration.

- Import alongside `taxa_pipeline` (line 41): `from host_plant_lineage import load_host_plant_lineage`.
- Add to `STEPS` (line 124) — must run AFTER `taxa-download` (needs taxa.csv.gz) and AFTER `inaturalist`/`ecdysis-links` (needs the host link + observations tables to compute the seed set), and BEFORE `dbt-build` (line 127) so the staging view has its source:
  ```python
  ("taxon-lineage-extended", load_taxon_lineage_extended),
  ("host-plant-lineage", load_host_plant_lineage),   # NEW — right after, before places-validation/dbt-build
  ```
- Step signature is zero-arg `Callable` (see `main()` loop `fn()`, line 148). Keep the same `db_path=None` default pattern as `load_taxon_lineage_extended`.

---

### `data/dbt/models/sources.yml` (MOD) + `stg_inat__host_plant_lineage.sql` (NEW)

**Source decl analog** (`sources.yml:10-17`): add under the `inaturalist_data` source:
```yaml
      - name: host_plant_lineage  # written by host_plant_lineage.load_host_plant_lineage (Phase 175 plant taxonomy)
```

**Staging view analog** (`stg_inat__taxon_lineage_extended.sql`, full file):
```sql
{{ config(materialized='view') }}
SELECT *
FROM {{ source('inaturalist_data', 'taxon_lineage_extended') }}
```
Adaptation: one-line clone pointing at `source('inaturalist_data', 'host_plant_lineage')`, with the header comment naming its producer and consumer (`int_species_host_plants`). Trivial.

---

### `data/dbt/models/intermediate/int_species_host_plants.sql` (NEW — per-bee host aggregate)

**Analogs:**
- `int_species_universe.sql` (lines 14-99) — the aggregate-CTE idiom (`GROUP BY canonical_name`, `COALESCE` synonym join, `::BIGINT` casts).
- `int_ecdysis_base.sql:20,30` — the `host_observation_id` linkage and the `LEFT JOIN stg_inat__observations inat ON inat.id = links.host_observation_id` join.
- `int_samples_base.sql` — sample model (the `host_observation_id` is the **sample proxy** for distinct-sample counting).

**Linkage pattern to copy** (`int_ecdysis_base.sql:28-30`):
```sql
FROM {{ ref('stg_ecdysis__occurrences') }} o
LEFT JOIN {{ ref('stg_ecdysis__occurrence_links') }} links ON links.occurrence_id = o.occurrence_id
LEFT JOIN {{ ref('stg_inat__observations') }} inat ON inat.id = links.host_observation_id
```

**Aggregate idiom to copy** (`int_species_universe.sql:79-86` inat_obs_count_agg — note the synonym COALESCE):
```sql
SELECT
    COALESCE(syn.accepted_name, io.canonical_name) AS canonical_name,
    COUNT(*) AS inat_obs_count
FROM {{ source('inat_obs_data', 'observations') }} io
LEFT JOIN {{ ref('int_synonyms') }} syn ON syn.synonym = io.canonical_name
WHERE io.canonical_name IS NOT NULL
GROUP BY 1
```

**Key adaptations:**
- Group by bee `canonical_name` × `(family, genus)`. `family` comes from `stg_inat__host_plant_lineage` joined on `inat.taxon__id`; `genus` = `tle.genus` OR `split_part(inat.taxon__name, ' ', 1)` when the host is at species rank (CONTEXT: "genus = first token, or the name itself at genus rank"). Mirror the genus-fallback idiom in `int_species_universe.sql:111-115`.
- **Sample count = `COUNT(DISTINCT links.host_observation_id)`** (the sample proxy — NOT raw specimen rows). This is the load-bearing aggregation choice (CONTEXT §Aggregation). Order each species' rows by sample count desc.
- Confirm bee `canonical_name` is already synonym-resolved upstream (CONTEXT says it is in the occurrence path; verify during planning — and if any raw arm is used, add the `int_synonyms` COALESCE as above; see `feedback_checklist_synonymy_gap`).
- Materialization: `view` is fine (it is read once by species_export); `int_species_universe` uses `table` only because of a FULL OUTER JOIN re-eval cost — not applicable here.

**NO contract change:** this is a private intermediate consumed by `species_export.py`, NOT a mart. The enforced `marts/species` and `marts/occurrences` contracts stay UNTOUCHED (the whole reason CONTEXT chose a sidecar over a species column).

---

### `data/species_export.py` (MOD — add the `species_hosts.json` sidecar producer)

**Analog:** the `seasonality.json` block (lines 338-375) and `photos.json` block (lines 377-404) inside `export_species_parquet`. THE direct sidecar pattern.

**photos.json producer** (lines 384-404) — nested-dict-keyed-by-canonical_name, the closest shape:
```python
photos: dict[str, list[dict]] = {}
try:
    photos_rows = con.execute("""SELECT canonical_name, ... ORDER BY canonical_name""").fetchall()
    for canon, url, license_ in photos_rows:
        photos.setdefault(canon, []).append({...})
except Exception as exc:  # noqa: BLE001
    print(f"  photos.json: WARNING — ... ({exc}); writing empty dict")
photos_out = ASSETS_DIR / "photos.json"
photos_out.write_text(json.dumps(photos, sort_keys=True, indent=2), encoding='utf-8')
print(f"  photos.json: {len(photos):,} species, {photos_out.stat().st_size:,} bytes")
```

**Key adaptations:**
- Read the new `int_species_host_plants` aggregate. NOTE `species_export.py` reads from **dbt sandbox parquet** (`DBT_SANDBOX_DIR/...parquet`), not the raw DB — so the intermediate must be materialized to a sandbox parquet, OR read the underlying tables from `DB_PATH` con. Decide in planning: simplest is to have the intermediate also write an external parquet (mirror how `occurrences.parquet`/`species.parquet` land in sandbox via `run.py:90-95`), then read it here like `_build_higher_taxa` reads `higher_taxa.parquet` (lines 158-168).
- Build nested `{canonical_name: [{family, genera:[{genus, count}], count}, ...]}` (shape is Claude's discretion per CONTEXT).
- Use the **idempotent write idiom**: `json.dumps(..., sort_keys=True, indent=2)` (matches species.json/photos.json) — byte-for-byte stable across runs is required by the nightly diff gate (`feedback_min_coalesce_aggregation`-adjacent; see Pitfall #6 comment line 325).
- Add a size assert mirroring seasonality (line 373) if budget matters.
- Update the module docstring (lines 5-11) to list the new sidecar, like the existing five.
- Graceful degradation when the parquet is absent (local dev): warn-and-write-empty, do NOT hard-fail — mirror the `photos.json` try/except and the species_traits.parquet warn path (lines 269-273).

---

### `_data/species_hosts.js` (NEW — Eleventy loader)

**Analogs:** `_data/photos.js` (sidecar default-export shape) + `_data/species.js:12-22` (reading a generated JSON from `public/data/`).

**public/data JSON read** (`species.js:16-22`):
```js
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const speciesJsonPath = join(repoRoot, 'public/data/species.json');
const raw = JSON.parse(readFileSync(speciesJsonPath, 'utf8'));
```

**Default-export-only contract** (`photos.js:11-15, 45`): Eleventy 3 auto-unwraps the default export ONLY if the module has NO named exports. Export the lookup map directly:
```js
export default result;   // Record<canonical_name, hosts>
```

**Key adaptations:**
- Read `public/data/species_hosts.json`, key by `canonical_name` (the detail page can look it up via `sp.canonical_name`).
- This loader reads at BUILD time, so the file MUST exist at build (see deploy.yml note below). For local dev without a full pipeline run, guard with a try/exists check returning `{}` so `npm run dev`/`npm test` don't crash (consistent with the graceful-degradation theme).
- Do NOT add named exports (would hide the table behind `species_hosts.default` per the photos.js Pitfall comment).

---

### `_pages/species-detail.njk` (MOD — "Collected from" block)

**Analog:** the `<section class="traits">` fact-sheet block (lines 28-59) and the `checklist-attribution` paragraph (lines 21-27). Placement: inside `.hero-meta`, near/after the Traits section (CONTEXT: "near the existing Traits fact-sheet … visually consistent with v7.0 traits styling").

**Conditional-render + quantify idiom to copy** (lines 33-59 condensed):
```njk
{%- set hosts = species_hosts[sp.canonical_name] -%}
{%- if hosts and hosts.length > 0 -%}
<section class="collected-from">
  <h2>Collected from</h2>
  {%- for fam in hosts | slice(0, FAMILY_CAP) -%}
    <p>{{ fam.family }} · {{ fam.genera | map('genus') | join(', ') }}</p>
  {%- endfor -%}
  {%- if hosts.length > FAMILY_CAP -%}
  <p class="more">(+{{ hosts.length - FAMILY_CAP }} more families)</p>
  {%- endif -%}
</section>
{%- endif -%}
```
**Target layout (user-approved, CONTEXT lines 68-75):**
```
Collected from
  Asteraceae · Solidago, Grindelia, Ericameria, Cirsium
  Rosaceae · Rosa, Rubus
  (+4 more families)
```

**Key adaptations:**
- `sp` is the paginated species row (front-matter `pagination.data: species.speciesList`, `alias: sp`, line 3-5). The host data is a SEPARATE `_data` global (`species_hosts`), looked up by `sp.canonical_name` — exactly how `photos[sp.scientificName]` is looked up at line 16.
- Caps: "+N more families" and likely a genus-per-family cap (`| slice`) — exact caps are Claude's discretion (CONTEXT line 82).
- Use the existing `quantify` filter (`eleventy.config.js:33`) if showing counts numerically (discretion). The block must render for the 534 covered species and be omitted entirely otherwise (the `{%- if hosts … -%}` guard handles this — same pattern as `hasHostBees` line 32).
- Reuse existing traits CSS classes / structure; do NOT invent a new UI pattern without checking (`feedback_no_unrequested_ui_patterns`).

---

### `.github/workflows/deploy.yml` + `data/nightly.sh` (MOD — publish + build-time fetch)

Because `_data/species_hosts.js` reads `public/data/species_hosts.json` at BUILD time, the sidecar must be (a) uploaded hashed in nightly and (b) pulled in deploy BEFORE the Eleventy build — exactly like species.json/seasonality.json/higher_taxa.json. Do NOT commit the generated JSON (`feedback_no_committed_data_artifacts`).

**nightly.sh publish analog** (lines 313-337):
```bash
species_name=$(_upload_hashed "$EXPORT_DIR/species.json" "species")
...
photos_name=$(_upload_hashed "$EXPORT_DIR/photos.json" "photos")
# manifest:
#   "species": "$species_name",
#   "photos": "$photos_name",
```
Add `species_hosts_name=$(_upload_hashed "$EXPORT_DIR/species_hosts.json" "species_hosts")` and a `"species_hosts": "$species_hosts_name",` manifest key. Also add it to the manifest-pull baseline map (`nightly.sh:157-160`) so the integration diff gate covers it.

**deploy.yml fetch analog** (lines 46-52):
```bash
HIGHER_TAXA_FILE=$(jq -r .higher_taxa /tmp/manifest.json)
aws s3 cp s3://.../data/$HIGHER_TAXA_FILE public/data/higher_taxa.json
```
Add the parallel `SPECIES_HOSTS_FILE` fetch to `public/data/species_hosts.json`.

**Release sequencing:** no `marts/occurrences` or `marts/species` contract change here (sidecar only), so the two-gate deadlock in `project_occurrences_contract_release_sequence` does NOT apply. But this DOES touch deploy.yml/nightly.sh/_data — so the plan-check MUST include "does CI build on a clean checkout with the new manifest key?" (`feedback_ci_is_verification_surface`). First nightly after deploy will be the first to publish `species_hosts.json`; guard `_data/species_hosts.js` to tolerate its absence so the code deploy doesn't red-build before the data run (data-before-code, or absence-tolerant loader).

---

## Shared Patterns

### Synonym-resolved bee canonical_name
**Source:** `int_species_universe.sql:79-86` (`COALESCE(syn.accepted_name, x.canonical_name)` + `LEFT JOIN int_synonyms`)
**Apply to:** `int_species_host_plants.sql` — only if reading a raw arm; if sourcing from the already-resolved occurrence path, no extra join needed (verify in planning). See `feedback_checklist_synonymy_gap`.

### Idempotent JSON sidecar write
**Source:** `species_export.py:328-336` (`json.dumps(..., sort_keys=True, indent=2)` + size print + assert)
**Apply to:** the `species_hosts.json` producer — byte-stability is required by the nightly diff gate.

### Default-export-only Eleventy _data loader
**Source:** `_data/photos.js:11-15, 45`
**Apply to:** `_data/species_hosts.js` — no named exports.

### Conditional fact-sheet block with quantify
**Source:** `_pages/species-detail.njk:32-59` (`{%- if has… -%}` guard + `| quantify`)
**Apply to:** the "Collected from" block.

### Hashed-upload + manifest + deploy-fetch for build-time JSON
**Source:** `nightly.sh:313-337` + `deploy.yml:46-52`
**Apply to:** `species_hosts.json` (3-file change: nightly publish, manifest key + baseline map, deploy fetch).

---

## No Analog Found

None. Every file maps to a strong existing analog. The single piece of genuinely NEW logic is the **seed-set filter** that replaces the Anthophila ancestry filter in the lineage walk (walk plant ancestry for the observed host taxon_id set instead of `LIKE '%/630955/%'`) — and even that is a targeted edit to an exact-match analog, not net-new structure.

## Metadata

**Analog search scope:** `data/` (pipeline + dbt models/staging,intermediate), `_data/`, `_pages/`, `.github/workflows/`, `data/nightly.sh`
**Files scanned:** ~14 (taxa_pipeline, run, species_export, sources.yml, 2 staging, 3 intermediate, species.js, photos.js, species-detail.njk, deploy.yml, nightly.sh)
**Pattern extraction date:** 2026-06-30
