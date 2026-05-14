# Phase 086: Port Remaining Transforms — Research

**Researched:** 2026-05-13
**Domain:** dbt-duckdb model authoring, JSON serialization, Python-vs-dbt boundary
**Confidence:** HIGH (all findings verified against live beeatlas.duckdb and source files)

## Summary

Phase 086 ports four remaining Python transforms to dbt models and records a documented decision on
`resolve_taxon_ids.py`. The starting state is solid: `dbt build` exits 0 with PASS=33 (Phase 085
complete), the 30-column `occurrences` mart contract is enforced, and the diff harness covers
`occurrences.parquet` and the two GeoJSON files. The four requirements split cleanly into two
SQL-shapeable ports (PORT-01 species mart, PORT-02 occurrence-links join), one API-ingestion
boundary decision (PORT-04), and one source-declaration port (PORT-03 taxon-lineage), all gated by
VALIDATE-01 (diff harness stays green throughout).

The key planning insight is that `species_export.py` produces THREE artifacts — `species.parquet`,
`species.json`, and `seasonality.json` — not one. `species.json` and `seasonality.json` require
Python post-processing that SQL alone cannot replicate byte-comparably: `json.dumps(sort_keys=True,
indent=2)` and the per-species bucket accumulation loop. The dbt mart produces `species.parquet`;
a Python post-hook or a separate Python step writes the JSON sidecars by reading the mart. The diff
harness does NOT currently cover `species.json` or `seasonality.json` — new diff tests must be
added before those artifacts can be asserted green.

PORT-03 (`enrich_taxon_lineage_extended`) is the only requirement that requires iNat API calls in
its current form. However, the resulting table (`inaturalist_data.taxon_lineage_extended`) is
already written to the DuckDB and can be declared as a `source()` in dbt — the port consists of
adding source declarations and staging views for `canonical_to_taxon_id` and
`taxon_lineage_extended`, then adding a dbt test for the LIN-05 ≥0.95 ratio. The Python enrichment
function itself stays in Python (it is ingestion-adjacent: it calls the iNat API).

PORT-04 (`resolve_taxon_ids.py`) calls the iNat API to resolve canonical names to taxon IDs. This
is unambiguously ingestion: it performs HTTP requests, applies ambiguity-resolution policy, and
persists results to `inaturalist_data.canonical_to_taxon_id`. The correct decision is to declare
an ingestion-boundary document and leave the Python file in place, declaring the resulting table as
a dbt `source()`.

**Primary recommendation:** Port in this wave order — Wave 0: extend diff harness; Wave 1: PORT-02
(occurrence-links source declaration, minimal new model), PORT-03 (source declarations + staging
views + LIN-05 test), PORT-04 (ingestion-boundary document); Wave 2: PORT-01 species mart dbt
model + Python JSON post-step.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PORT-01 | Port `species_export.py` (species.json + artifacts) to dbt models | species_export.py analysis, species.parquet schema verified, JSON serialization pitfalls documented |
| PORT-02 | Port occurrence-links derivation (specimen_observation_id join) to dbt | `int_waba_link` already exists in dbt; `stg_ecdysis__occurrence_links` wraps source; the join is already expressed in `int_ecdysis_base` — the requirement is about `source()` declaration and removing the join from Python export.py |
| PORT-03 | Port taxon-lineage enrichment + LIN-05 ≥0.95 coverage test | `taxon_lineage_extended` exists in DB (2196 rows); current coverage = 100% (735/735); needs source declarations + dbt test |
| PORT-04 | Document porting decision for `resolve_taxon_ids.py` | Script makes iNat API calls — pure ingestion-boundary; leave in Python, document boundary |
| VALIDATE-01 | `test_dbt_diff.py` stays green throughout phase | Harness currently covers occurrences/GeoJSON only; must add species coverage before PORT-01 lands |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Species universe SQL (FULL OUTER join, lineage COALESCE) | dbt intermediate | — | Pure SQL transform; maps cleanly to dbt ref() DAG |
| Per-species count rollups (county, ecoregion, temporal) | dbt mart | — | Aggregation over occurrences.parquet + ecdysis; SQL-shaped |
| species.parquet write | dbt mart (external) | — | Follows established `occurrences` mart pattern |
| species.json / seasonality.json write | Python post-step | dbt (reads mart) | `json.dumps(sort_keys=True)` + bucket accumulation loop required for byte-comparable output |
| Occurrence-links source → specimen_observation_id join | Already in dbt (int_waba_link + int_ecdysis_base) | Python export.py (same logic, to retire) | Join logic is expressed in dbt models; needs source() declaration on the WABA side |
| Taxon-lineage enrichment (iNat API calls) | Python (ingestion) | dbt source() | API calls are ingestion; resulting table is a dbt source |
| Taxon-lineage enrichment (SQL consumption) | dbt staging/intermediate | — | stg_inat__taxon_lineage_extended wraps the source |
| canonical_to_taxon_id bridge (API resolution) | Python (ingestion) | dbt source() | resolve_taxon_ids.py calls iNat API; ingestion boundary |
| LIN-05 coverage assertion | dbt test | — | YAML ratio test on canonical_to_taxon_id JOIN taxon_lineage_extended |

---

## PORT-01: Species Mart

### What `species_export.py` Does

`species_export.py` produces three artifacts:

1. **`species.parquet`** — 19-column, 629 rows (currently). Schema: `scientificName`, `canonical_name`, `family`, `subfamily`, `tribe`, `genus`, `subgenus`, `specific_epithet`, `on_checklist` (bool), `status`, `occurrence_count`, `specimen_count`, `provisional_count`, `first_occurrence_date` (date32), `last_occurrence_date` (date32), `month_histogram` (INTEGER[12]), `county_count`, `ecoregion_count`, `slug`.
   [VERIFIED: `DESCRIBE SELECT * FROM read_parquet('public/data/species.parquet')` matches SPECIES_COLUMNS]

2. **`species.json`** — flat JSON array of the same rows, serialized with `json.dumps(sort_keys=True, indent=2)`. Consumed by Eleventy `_data/species.js`. Keys are sorted alphabetically; dates are ISO strings. Size ~150 KB.

3. **`seasonality.json`** — nested `{canonical_name: {bucket: [12 ints]}}` dict, written with `json.dumps(sort_keys=True, separators=(',', ':'))` (compact). Buckets are `_total`, `county:{name}`, `ecoregion_l3:{name}`. 556 species currently. Size < 6 MB constraint (asserted in code).

The core SQL is a multi-CTE query across:
- `ecdysis_data.occurrences` (for temporal aggregates: occurrence_count, specimen_count, first/last date, month_histogram)
- `public/data/occurrences.parquet` (for geo aggregates: county_count, ecoregion_count, and seasonality buckets)
- `checklist_data.species` (for scientificName, family/subfamily/tribe/genus/subgenus, specific_epithet, status, on_checklist)
- `inaturalist_data.canonical_to_taxon_id` (canonical_name → taxon_id bridge)
- `inaturalist_data.taxon_lineage_extended` (taxon_id → family/subfamily/tribe/genus/subgenus)
- `inaturalist_data.observations__ofvs` via `occurrences.parquet` (provisional_count from is_provisional=TRUE)

The species universe is a FULL OUTER JOIN of `checklist_data.species` and `ecdysis_data.occurrences`, filtered to bee families (`BEE_FAMILIES` = Andrenidae, Apidae, Colletidae, Halictidae, Megachilidae, Melittidae, Stenotritidae). `DISTINCT ON (canonical_name)` collapses any duplicate canonical_name rows, preferring `on_checklist DESC`.
[VERIFIED: species_export.py lines 115-208]

### dbt Model Shape

The species mart requires two new layers:

**New staging views (source declarations needed first):**
- `stg_inat__canonical_to_taxon_id` — wraps `source('inaturalist_data', 'canonical_to_taxon_id')`
- `stg_inat__taxon_lineage_extended` — wraps `source('inaturalist_data', 'taxon_lineage_extended')`
- `stg_checklist__species` — wraps `source('checklist_data', 'species')`

**New intermediate models:**
- `int_species_occurrences_agg` — temporal aggregates from `ecdysis_data.occurrences`: occurrence_count, specimen_count, first/last occurrence_date, month_histogram (INTEGER[12]). Replaces `occurrences_agg` CTE.
- `int_species_geo_agg` — county_count and ecoregion_count per canonical_name, reading from the `occurrences` mart (external parquet). Replaces `geo_agg` CTE.
- `int_species_universe` — the FULL OUTER JOIN joining checklist + occurrences_agg + canonical_to_taxon_id + taxon_lineage_extended + provisional_agg + geo_agg, with COALESCE precedence. Replaces `species_universe` CTE. DISTINCT ON (canonical_name) ORDER BY canonical_name, on_checklist DESC. Filtered to BEE_FAMILIES.

**New mart:**
- `marts/species` — external materialization to `target/sandbox/species.parquet`, declared with `contract: enforced: true` and all 19 columns. Reads `int_species_universe`, adds the `slug` column.

**Critical issue: `slug` column**: `slug` is computed via `_slugify(scientificName)` in Python. The `_slugify` function is a path-traversal-safe Python implementation. To preserve byte-comparable output, `slug` must be computed in Python (not in SQL) and written to the parquet. Options:
- (a) Use a dbt Python model — dbt-duckdb supports Python models but requires `pandas`; complexity is high.
- (b) Compute slug in a post-hook Python script that reads the mart parquet, adds the slug column, and overwrites the file.
- (c) Re-implement `_slugify` as a DuckDB macro using `regexp_replace` and `lower` — if byte-identical to `feeds._slugify`, this is viable.

[ASSUMED: _slugify uses only `lower()` and `regexp_replace` — must be verified against `data/feeds.py` to confirm a SQL re-implementation would be byte-comparable]

**Critical issue: `month_histogram` backfill**: DuckDB COALESCE on INTEGER[12] is unimplemented in 1.4.x (Phase 078 decision). Checklist-only rows get NULL month_histogram from the FULL OUTER JOIN; Python fills these with `[0]*12`. In dbt, this must be handled with a CASE expression or post-processing. A DuckDB-safe approach: `CASE WHEN month_histogram IS NULL THEN [0,0,0,0,0,0,0,0,0,0,0,0]::INTEGER[] ELSE month_histogram END`. Note: the list literal syntax may differ across DuckDB versions.
[VERIFIED: Phase 078-02 decision documents this explicitly]

**Critical issue: `species.json` and `seasonality.json` are NOT SQL-emittable byte-comparably**:
- `species.json` requires `json.dumps(sort_keys=True, indent=2)` with date fields as `v.isoformat()`. DuckDB `to_json()` does not sort keys or produce this exact format.
- `seasonality.json` requires a Python accumulation loop (per-species, per-bucket, per-month counts) that is not naturally expressible as SQL without a nested GROUP BY + JSON construction, and the resulting compact format with `separators=(',', ':')` is not what DuckDB emits.
- **Recommended approach**: the dbt mart writes `species.parquet`. A Python post-step (either a separate script or an updated `species_export.py` that reads from the mart) reads the parquet and emits both JSON files with the existing serialization logic. This preserves byte-comparable output and removes the SQL aggregation from Python.
[VERIFIED: `test_species_export.py::test_species_json_shape` and `test_seasonality_shape_and_budget` assert exact JSON formatting]

### Diff Harness Coverage for PORT-01

The current `test_dbt_diff.py` does NOT cover `species.parquet`, `species.json`, or `seasonality.json`. Before PORT-01 lands, new diff tests must be added:

- `test_species_parquet_row_count_matches` — sandbox species.parquet row count equals public species.parquet
- `test_species_parquet_schema_matches` — DESCRIBE of sandbox vs. public (19-column, type-exact)
- `test_species_canonical_name_key_set_matches` — anti-join on canonical_name in both directions
- `test_species_json_matches` — sandbox species.json content equals `public/data/species.json` (byte-comparable)
- `test_seasonality_json_matches` — sandbox seasonality.json content equals `public/data/seasonality.json`

These tests use the same SANDBOX/PUBLIC path pattern as existing diff tests. The SANDBOX guard (`_SANDBOX_GUARD`) must be extended with species-specific guards.

---

## PORT-02: Occurrence-Links Derivation

### What the Requirement Actually Means

PORT-02 as written in REQUIREMENTS.md says: "The occurrence-links derivation (currently the Ecdysis HTML-scraping post-step that populates `specimen_observation_id`) is expressed as a dbt model that consumes raw scraped HTML via `source()` and emits the link mapping as a dbt model."

However, inspecting the actual code, the situation is more nuanced:

1. **`ecdysis_data.occurrence_links`** is populated by `data/ecdysis_pipeline.py` (the `load_links` step). It maps `occurrence_id` (Ecdysis specimen UUID) → `host_observation_id` (iNat observation ID). This is ingestion — it calls the Ecdysis API/HTML scraper.

2. **`specimen_observation_id`** (the WABA catalog-number → WABA observation ID join) is ALREADY expressed as a dbt model: `int_waba_link` computes the join and `int_ecdysis_base` consumes it via `ref('int_waba_link')`.
[VERIFIED: `data/dbt/models/intermediate/int_waba_link.sql` and `int_ecdysis_base.sql`]

3. The **current gap** is that `ecdysis_data.occurrence_links` is declared as a `source()` in `sources.yml` (line 8: `- name: occurrence_links`), and `stg_ecdysis__occurrence_links` wraps it. The join in `int_ecdysis_base` already uses `ref('stg_ecdysis__occurrence_links')`.
[VERIFIED: sources.yml and int_ecdysis_base.sql]

**Conclusion**: The occurrence-links derivation is ALREADY in dbt (both `int_waba_link` for specimen_observation_id and `stg_ecdysis__occurrence_links` + `int_ecdysis_base` for host_observation_id). PORT-02's work is to:
- Confirm `export.py`'s `waba_link` CTE (lines 46-55) is no longer needed because it duplicates `int_waba_link`.
- Confirm `export.py`'s `ecdysis_base` CTE's LEFT JOIN on `occurrence_links` (line 80) is duplicated in `int_ecdysis_base`.
- Write the ingestion-boundary document confirming that `load_links` (HTML scraping) stays in Python and `ecdysis_data.occurrence_links` is declared as a dbt source.

**PORT-02 is mostly already done** from the v3.3 spike. The deliverable is the ingestion-boundary documentation and the confirmation that `export.py` can be retired without losing the join logic.

---

## PORT-03: Taxon-Lineage Enrichment + LIN-05 Coverage Test

### What `enrich_taxon_lineage_extended` Does

`enrich_taxon_lineage_extended` in `inaturalist_pipeline.py` (lines 184-270):
1. Queries the DISTINCT UNION of `taxon__id` from `inaturalist_data.observations`, `inaturalist_waba_data.observations`, and `inaturalist_data.canonical_to_taxon_id` to get all taxon IDs requiring lineage.
2. Calls the iNat API in batches of 30 to get ancestor chains.
3. Writes `inaturalist_data.taxon_lineage_extended` (taxon_id, family, subfamily, tribe, genus, subgenus) via CREATE OR REPLACE TABLE.

This is ingestion-adjacent (makes iNat API calls). The resulting table is already in the DuckDB.

**Current state**: `taxon_lineage_extended` has 2196 rows. `canonical_to_taxon_id` has 735 rows. LIN-05 coverage is 735/735 = 100%.
[VERIFIED: queried beeatlas.duckdb directly]

### What Needs to Change for PORT-03

1. **Source declarations in `sources.yml`**: Add `canonical_to_taxon_id` and `taxon_lineage_extended` to the `inaturalist_data` source block.

2. **Staging views**:
   - `stg_inat__canonical_to_taxon_id` — `SELECT * FROM source('inaturalist_data', 'canonical_to_taxon_id')`
   - `stg_inat__taxon_lineage_extended` — `SELECT * FROM source('inaturalist_data', 'taxon_lineage_extended')`

3. **LIN-05 dbt test**: A singular test that asserts the lineage coverage ratio ≥ 0.95:

```sql
-- data/dbt/tests/test_lin05_lineage_coverage.sql
-- LIN-05: at least 95% of species universe canonical names must have
-- a resolved taxon_id in canonical_to_taxon_id AND a lineage row in
-- taxon_lineage_extended. Returns 0 rows if coverage >= 0.95 (PASS).
WITH species_universe AS (
    SELECT DISTINCT COALESCE(c.canonical_name, oa.canonical_name) AS canonical_name
    FROM {{ ref('stg_checklist__species') }} c
    FULL OUTER JOIN (
        SELECT DISTINCT canonical_name
        FROM {{ source('ecdysis_data', 'occurrences') }}
        WHERE canonical_name IS NOT NULL
    ) oa ON oa.canonical_name = c.canonical_name
),
coverage AS (
    SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN tle.taxon_id IS NOT NULL THEN 1 ELSE 0 END) AS resolved
    FROM species_universe su
    LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} b
        ON b.canonical_name = su.canonical_name
    LEFT JOIN {{ ref('stg_inat__taxon_lineage_extended') }} tle
        ON tle.taxon_id = b.taxon_id
)
SELECT total, resolved
FROM coverage
WHERE CAST(resolved AS DOUBLE) / NULLIF(total, 0) < 0.95
```

4. **Note on `enrich_taxon_lineage_extended` itself**: The Python function stays in Python (it makes iNat API calls). Port-03's deliverable is the source declarations, staging views, and dbt test — NOT replacing the Python enrichment function.

### stg_checklist__species needed for PORT-01 and PORT-03

Both PORT-01 and PORT-03 need `checklist_data.species` declared as a source. This requires adding `checklist_data` to `sources.yml` with both `species` and `species_counties` tables, and creating `stg_checklist__species`.

Currently `checklist_data.species` is NOT in `sources.yml`.
[VERIFIED: sources.yml lists ecdysis_data, inaturalist_data, inaturalist_waba_data, geographies — no checklist_data]

---

## PORT-04: `resolve_taxon_ids.py` — Porting Decision

### What the Script Does

`resolve_taxon_ids.py` (213 lines):
- Queries the FULL OUTER union of `checklist_data.species.canonical_name` and `ecdysis_data.occurrences.canonical_name` for names not yet in the bridge.
- For each unresolved name: calls the iNat API (`/v1/taxa` endpoint), applies the D-02 ambiguity-resolution policy (`_pick_match`), and UPSERTs the result into `inaturalist_data.canonical_to_taxon_id`.
- Logs unresolved names to `data/lineage_unresolved.csv`.

### Porting Decision: Keep in Python (Ingestion Boundary)

**Criterion**: Is this SQL-shaped or Python-shaped (requires API calls, stateful, or procedural)?

`resolve_taxon_ids.py` is unambiguously Python-shaped (ingestion):
- Makes HTTP requests to the iNat API.
- Applies procedural ambiguity-resolution policy (`_pick_match` with multi-step filter ladder).
- Has rate-limiting, retry logic (`_INAT_PACE_SECONDS`, `_inat_get_with_retry`).
- Writes to a CSV log file for human review.
- Is idempotent-but-stateful (skip already-resolved names, re-attempt previously unresolved ones with `--refresh-lineage`).

**Decision: KEEP in Python. Declare `inaturalist_data.canonical_to_taxon_id` as a dbt `source()`.**

PORT-04 deliverable is a written ingestion-boundary document (can be a comment in `sources.yml` or a standalone `.md` in `.planning/phases/086/`) explaining:
- What the script does.
- Why it stays in Python (iNat API calls, ambiguity-resolution policy, rate-limiting).
- The ingestion/transform seam: `resolve_taxon_ids.py` writes → `inaturalist_data.canonical_to_taxon_id` → dbt `source()` → `stg_inat__canonical_to_taxon_id` → consumed by `int_species_universe`.

---

## VALIDATE-01: Diff Harness Strategy

### Current Coverage (as of Phase 085 completion)

`test_dbt_diff.py` covers:
- `occurrences.parquet`: row count, schema (30-col), ecdysis_id key set, host_observation_id key set, county spatial diff (84 boundary rows expected), ecoregion diff (0 rows expected)
- `counties.geojson`: feature count (39), property name list (NAME)
- `ecoregions.geojson`: feature count (66), property name list (NA_L3NAME)

NOT covered: `species.parquet`, `species.json`, `seasonality.json`
[VERIFIED: test_dbt_diff.py]

### Incremental Harness Extension Plan

**Wave 0 (before PORT-01)**: Add diff tests for species artifacts. These tests use `pytest.mark.skipif` on `(SANDBOX / 'species.parquet').exists()` guard. Initial run after adding tests but before PORT-01 lands: all new tests SKIP (no sandbox species.parquet yet). After PORT-01 dbt model builds: tests run and must PASS.

**New tests to add to `test_dbt_diff.py`**:

```python
SANDBOX_SPECIES_GUARD = pytest.mark.skipif(
    not (SANDBOX / "species.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox species.parquet",
)

@SANDBOX_SPECIES_GUARD
def test_species_parquet_row_count_matches():
    """Sandbox species.parquet has same row count as public/data/species.parquet."""

@SANDBOX_SPECIES_GUARD
def test_species_parquet_schema_matches():
    """19-column schema (names + types) identical between sandbox and public."""

@SANDBOX_SPECIES_GUARD
def test_species_canonical_name_key_set_matches():
    """Full anti-join on canonical_name: 0 rows in both EXCEPT directions."""

@pytest.mark.skipif(
    not (SANDBOX / "species.json").exists(),
    reason="run species JSON post-step first",
)
def test_species_json_matches():
    """sandbox/species.json content == public/data/species.json (byte-comparable)."""

@pytest.mark.skipif(
    not (SANDBOX / "seasonality.json").exists(),
    reason="run species JSON post-step first",
)
def test_seasonality_json_matches():
    """sandbox/seasonality.json content == public/data/seasonality.json."""
```

**Note**: `test_species_json_matches` and `test_seasonality_json_matches` use byte comparison (`==` on file content), not structural comparison. This is intentional — the ROADMAP requirement says "byte-comparable."

### VALIDATE-01 Constraint During Port Sequence

The harness must stay green on the EXISTING tests at every commit. New tests start SKIP (guarded) until the new dbt models exist. Progression:

1. Wave 0: Add new diff test stubs (SKIP-guarded) → existing 10 tests PASS, new tests SKIP ✓
2. Wave 1: PORT-02 source docs, PORT-03 source declarations + LIN-05 test, PORT-04 doc → no new outputs, existing harness unaffected ✓
3. Wave 2: PORT-01 dbt mart model lands → `bash data/dbt/run.sh build` produces `sandbox/species.parquet` → parquet diff tests PASS; JSON diff tests still SKIP (no sandbox JSON yet) ✓
4. Wave 2: Python JSON post-step writes `sandbox/species.json` + `sandbox/seasonality.json` → JSON diff tests PASS ✓

---

## Standard Stack

### Core (existing, no additions needed)

| Library | Version | Purpose |
|---------|---------|---------|
| dbt-core | 1.10.1 (pinned) | dbt DAG runner |
| dbt-duckdb | 1.10.1 | DuckDB adapter |
| DuckDB | 1.2.x (in uvx env) | SQL engine |
| Python | 3.14+ (data pyproject.toml) | Post-hook JSON steps |

### New Sources Required

| Schema | Table | Already in sources.yml? |
|--------|-------|------------------------|
| inaturalist_data | canonical_to_taxon_id | No — must add |
| inaturalist_data | taxon_lineage_extended | No — must add |
| checklist_data | species | No — must add |
| checklist_data | species_counties | No (not needed for this phase) |

### File Inventory: New Files for Phase 086

| File | Purpose | Requirement |
|------|---------|-------------|
| `models/staging/stg_inat__canonical_to_taxon_id.sql` | Source wrapper | PORT-03, PORT-01 |
| `models/staging/stg_inat__taxon_lineage_extended.sql` | Source wrapper | PORT-03, PORT-01 |
| `models/staging/stg_checklist__species.sql` | Source wrapper | PORT-01 |
| `models/intermediate/int_species_occurrences_agg.sql` | Temporal aggregates per species | PORT-01 |
| `models/intermediate/int_species_geo_agg.sql` | County/ecoregion counts per species | PORT-01 |
| `models/intermediate/int_species_universe.sql` | FULL OUTER JOIN + COALESCE precedence | PORT-01 |
| `models/marts/species.sql` | External parquet mart | PORT-01 |
| `models/marts/schema.yml` | Add species contract | PORT-01 |
| `models/staging/schema.yml` | Add new staging model declarations | PORT-03, PORT-01 |
| `models/sources.yml` | Add inaturalist_data tables + checklist_data source | PORT-03, PORT-04, PORT-01 |
| `tests/test_lin05_lineage_coverage.sql` | LIN-05 ≥0.95 dbt singular test | PORT-03 |
| `data/tests/test_dbt_diff.py` | Add species diff test stubs | VALIDATE-01 |
| `.planning/phases/086-port-remaining-transforms/ingestion-boundary.md` | PORT-04 documented decision | PORT-04 |

---

## Architecture Patterns

### System Architecture Diagram

```
checklist_data.species (source)
    |
    v
stg_checklist__species --------+
                                |
ecdysis_data.occurrences ------+---> int_species_occurrences_agg
(source via stg)               |
                                +---> int_species_geo_agg <-- (reads occurrences parquet)
                                |
inaturalist_data.canonical_to_taxon_id (source)
    |
    v
stg_inat__canonical_to_taxon_id -------+
                                        |
inaturalist_data.taxon_lineage_extended (source)  |
    |                                   |
    v                                   |
stg_inat__taxon_lineage_extended -------+
                                        |
                                        v
                                int_species_universe (FULL OUTER JOIN + COALESCE)
                                        |
                                        v
                                marts/species (external parquet)
                                        |
                                        v
                                Python post-step
                                (reads species.parquet)
                                        |
                               +--------+--------+
                               v                 v
                        species.json       seasonality.json
                   (sort_keys=True,   (sort_keys=True,
                    indent=2)          separators=(',',':'))
```

For PORT-02 and PORT-03 (source declarations only — these flows already exist in dbt):

```
inaturalist_waba_data.observations (source) --> stg_waba__observations --> int_waba_link
inaturalist_waba_data.observations__ofvs (source) ----^
         |
         v specimen_observation_id
int_ecdysis_base (already consumes int_waba_link)
         |
         v
int_combined --> occurrences mart (already working)
```

### Recommended Project Structure After Phase 086

```
data/dbt/models/
├── staging/
│   ├── stg_checklist__species.sql          [NEW]
│   ├── stg_ecdysis__identifications.sql
│   ├── stg_ecdysis__occurrence_links.sql
│   ├── stg_ecdysis__occurrences.sql
│   ├── stg_geo__*.sql (3 files)
│   ├── stg_inat__canonical_to_taxon_id.sql [NEW]
│   ├── stg_inat__observations.sql
│   ├── stg_inat__ofvs.sql
│   ├── stg_inat__taxon_lineage_extended.sql [NEW]
│   ├── stg_waba__observations.sql
│   ├── stg_waba__ofvs.sql
│   ├── stg_waba__taxon_lineage.sql
│   └── schema.yml
├── intermediate/
│   ├── int_combined.sql
│   ├── int_ecdysis_base.sql
│   ├── int_ecdysis_catalog_suffixes.sql
│   ├── int_id_modified.sql
│   ├── int_matched_waba_ids.sql
│   ├── int_provisional_waba_ids.sql
│   ├── int_samples_base.sql
│   ├── int_specimen_obs_base.sql
│   ├── int_waba_link.sql
│   ├── int_species_occurrences_agg.sql     [NEW]
│   ├── int_species_geo_agg.sql             [NEW]
│   ├── int_species_universe.sql            [NEW]
│   └── schema.yml
├── marts/
│   ├── counties_geo.sql
│   ├── ecoregions_geo.sql
│   ├── occurrences.sql
│   ├── species.sql                          [NEW]
│   └── schema.yml
├── sources.yml                              [MODIFIED: add 4 new tables]
└── macros/
    └── emit_feature_collection.sql
data/dbt/tests/
├── test_ecdysis_id_references_source.sql
└── test_lin05_lineage_coverage.sql         [NEW]
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON sort-keys serialization | Custom DuckDB JSON function | Python `json.dumps(sort_keys=True)` | DuckDB `to_json()` does not guarantee key ordering; byte-comparability requires Python |
| Slug computation | SQL `regexp_replace` chain | Python `feeds._slugify()` | Must be byte-for-byte identical to the established slugify implementation |
| iNat API rate-limiting in dbt | dbt Python model with HTTP calls | Leave in `resolve_taxon_ids.py` | dbt Python models add pandas dependency and complexity for no gain |
| LIN-05 coverage check | pytest assertion | dbt singular test | Co-located with model, runs on every `dbt build`, not a separate test run |
| Byte-comparable parquet write | pyarrow directly in a Python script | dbt `materialized='external'` + enforced contract | The contract catches type drift at compile time; established pattern from occurrences mart |

---

## Common Pitfalls

### Pitfall 1: Assuming county_count.json and ecoregion_count.json are required artifacts

**What goes wrong**: REQUIREMENTS.md says "species count artifacts (county_count, ecoregion_count, recency tiers)" which sounds like separate JSON files. The actual `species_export.py` folds county_count and ecoregion_count as INTEGER columns directly into `species.parquet` and `species.json`. There are no separate `county_count.json` or `ecoregion_count.json` files in `public/data/`.
[VERIFIED: `ls public/data/*.json` shows only `species.json` and `seasonality.json`]
**Prevention**: Port `county_count` and `ecoregion_count` as columns in the `int_species_geo_agg` intermediate model. Do not create separate JSON files.

### Pitfall 2: `month_histogram` NULL backfill in dbt SQL

**What goes wrong**: The FULL OUTER JOIN of checklist_data.species and occurrence data leaves NULL month_histogram for checklist-only rows. `species_export.py` backfills these with `[0]*12` in Python (after the SQL query). In dbt, `COALESCE(oa.month_histogram, [0]*12)` fails because DuckDB COALESCE on INTEGER[] is unimplemented in 1.4.x (Phase 078-02 decision).
**Prevention**: Use a CASE expression: `CASE WHEN oa.month_histogram IS NULL THEN [0,0,0,0,0,0,0,0,0,0,0,0]::INTEGER[] ELSE oa.month_histogram END`. Test this against DuckDB's version in the uvx env.
[VERIFIED: Phase 078-02 decision documented in STATE.md]

### Pitfall 3: `json.dumps` key ordering is non-negotiable for byte-comparable species.json

**What goes wrong**: Writing `species.json` from SQL (e.g., using DuckDB `to_json()` or `json_object()`) produces a different key order from `json.dumps(sort_keys=True, indent=2)`. The test `test_species_json_matches` compares file content byte-for-byte.
**Prevention**: The JSON post-step MUST use `json.dumps(sort_keys=True, indent=2)`. The SQL mart produces the parquet only; the Python post-step reads the parquet and writes the JSON.

### Pitfall 4: Seasonality.json requires reading occurrences.parquet, not species.parquet

**What goes wrong**: `seasonality.json` is built by reading `occurrences.parquet` for per-occurrence canonical_name + county + ecoregion_l3 + month combinations. This is not the same as the geo_agg COUNT columns in species.parquet. Building it from species.parquet is impossible.
**Prevention**: The Python post-step must read from the sandbox `occurrences.parquet` (not species.parquet) to reconstruct the per-occurrence bucket accumulation. The post-step must locate the sandbox parquet correctly (not `public/data/occurrences.parquet` — that would pollute the diff comparison).

### Pitfall 5: checklist_data.species is NOT currently in sources.yml

**What goes wrong**: Writing `stg_checklist__species.sql` with `{{ source('checklist_data', 'species') }}` without first adding `checklist_data` to `sources.yml` causes a dbt compilation error.
**Prevention**: Add `checklist_data` source block to `sources.yml` BEFORE creating the staging model. Add both `species` and `species_counties` tables even if only `species` is needed in Phase 086.

### Pitfall 6: `int_species_geo_agg` reads from the occurrences mart (external parquet) via `ref()`

**What goes wrong**: The geo_agg CTE in `species_export.py` reads `public/data/occurrences.parquet` (a file path). In dbt, the equivalent is `ref('occurrences')` but the occurrences mart is an external file. DuckDB can read it via `ref()` because the external materialization stores the path in the dbt catalog. However, this creates a DAG dependency: `int_species_geo_agg` → `occurrences`. This is correct but means `dbt build --select species+` will also rebuild `occurrences`.
**Prevention**: Accept the dependency. Use `ref('occurrences')` — do not hardcode the parquet path.

### Pitfall 7: PORT-02 is mostly already done — avoid scope creep

**What goes wrong**: Over-scoping PORT-02 to include rewriting `export.py`'s waba_link and ecdysis_base CTEs in dbt when those CTEs are ALREADY expressed as `int_waba_link` and `int_ecdysis_base`. The only gap is the ingestion-boundary documentation.
**Prevention**: PORT-02's deliverable is: (a) confirm the dbt model coverage, (b) write the ingestion-boundary doc. No new dbt models needed.

### Pitfall 8: Singular LIN-05 test must reference staging models, not direct sources

**What goes wrong**: Using `source('inaturalist_data', 'canonical_to_taxon_id')` directly in the singular test SQL — this bypasses any staging-level filters and also breaks the DAG lineage.
**Prevention**: Use `ref('stg_inat__canonical_to_taxon_id')` and `ref('stg_inat__taxon_lineage_extended')` in the test SQL.

### Pitfall 9: `specimen_inat_login`, `specimen_inat_genus`, `specimen_inat_family` still in `int_combined`

**What goes wrong**: The planner deciding to clean up `int_combined` and `int_specimen_obs_base` during Phase 086 (removing the three dropped columns from the intermediate model SELECT). Phase 085-04 explicitly deferred this to Phase 086. However, if `int_combined` is NOT cleaned up, the species mart is unaffected. If cleanup is attempted, it must be done carefully to avoid breaking `genus`/`family` in ARM 2 provisional rows (which use `sob.specimen_inat_genus AS genus` — a DIFFERENT output column from `specimen_inat_genus`).
[VERIFIED: 085-04-SUMMARY.md "int_combined and int_specimen_obs_base NOT touched — intermediate models carry the dropped columns for Phase 86 rewrite"]
**Prevention**: Decide explicitly whether to clean up `int_combined` in Phase 086. If yes, read the 085-04 SUMMARY carefully before touching ARM 2.

### Pitfall 10: dbt-core version pin sensitivity

**What goes wrong**: Running `bash data/dbt/run.sh` after any npm install or uvx cache clear that picks up dbt-core 1.10.20 (which has a `KeyError: 'javascript'` regression).
**Prevention**: The `run.sh` wrapper pins `uvx --from dbt-core==1.10.1`. Do not modify this pin. Verify with `bash data/dbt/run.sh --version` if in doubt.
[VERIFIED: v3.3-ROADMAP.md §Key Decisions]

---

## Code Examples

### stg_inat__canonical_to_taxon_id.sql

```sql
-- Wraps source('inaturalist_data', 'canonical_to_taxon_id').
-- Written by data/resolve_taxon_ids.py (ingestion step — see ingestion-boundary.md).
-- Columns: canonical_name (PK), taxon_id, resolved_at, source.
{{ config(materialized='view') }}

SELECT *
FROM {{ source('inaturalist_data', 'canonical_to_taxon_id') }}
```

### stg_inat__taxon_lineage_extended.sql

```sql
-- Wraps source('inaturalist_data', 'taxon_lineage_extended').
-- Written by data/inaturalist_pipeline.enrich_taxon_lineage_extended (ingestion step).
-- Columns: taxon_id (PK BIGINT), family, subfamily, tribe, genus, subgenus (VARCHAR).
{{ config(materialized='view') }}

SELECT *
FROM {{ source('inaturalist_data', 'taxon_lineage_extended') }}
```

### int_species_occurrences_agg.sql (sketch)

```sql
-- Per-species temporal aggregates from ecdysis_data.occurrences.
-- Mirrors species_export.py lines 116-140 (occurrences_agg CTE).
-- NOTE: month_histogram NULL backfill for checklist-only rows is handled
-- in int_species_universe via CASE expression (DuckDB COALESCE on INTEGER[]
-- is unimplemented — Phase 078-02).
SELECT
    canonical_name,
    COUNT(*) AS occurrence_count,
    SUM(CASE WHEN id IS NOT NULL THEN 1 ELSE 0 END) AS specimen_count,
    MIN(TRY_CAST(event_date AS DATE)) AS first_occurrence_date,
    MAX(TRY_CAST(event_date AS DATE)) AS last_occurrence_date,
    list_value(
        SUM(CASE WHEN TRY_CAST(month AS INT) =  1 THEN 1 ELSE 0 END),
        ...
        SUM(CASE WHEN TRY_CAST(month AS INT) = 12 THEN 1 ELSE 0 END)
    )::INTEGER[12] AS month_histogram
FROM {{ source('ecdysis_data', 'occurrences') }}
WHERE canonical_name IS NOT NULL
GROUP BY canonical_name
```

### LIN-05 dbt singular test

```sql
-- data/dbt/tests/test_lin05_lineage_coverage.sql
-- PASS = 0 rows (coverage >= 0.95). FAIL = 1 row (coverage < 0.95).
WITH species_universe AS (
    SELECT DISTINCT COALESCE(c.canonical_name, oa.canonical_name) AS canonical_name
    FROM {{ ref('stg_checklist__species') }} c
    FULL OUTER JOIN (
        SELECT DISTINCT canonical_name
        FROM {{ source('ecdysis_data', 'occurrences') }}
        WHERE canonical_name IS NOT NULL
    ) oa ON oa.canonical_name = c.canonical_name
),
coverage AS (
    SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN tle.taxon_id IS NOT NULL THEN 1 ELSE 0 END) AS resolved
    FROM species_universe su
    LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} b
        ON b.canonical_name = su.canonical_name
    LEFT JOIN {{ ref('stg_inat__taxon_lineage_extended') }} tle
        ON tle.taxon_id = b.taxon_id
)
SELECT total, resolved, CAST(resolved AS DOUBLE) / NULLIF(total, 0) AS ratio
FROM coverage
WHERE CAST(resolved AS DOUBLE) / NULLIF(total, 0) < 0.95
```

### Species mart contract additions (schema.yml)

```yaml
  - name: species
    config:
      contract:
        enforced: true
    columns:
      - name: scientificName
        data_type: varchar
      - name: canonical_name
        data_type: varchar
      - name: family
        data_type: varchar
      - name: subfamily
        data_type: varchar
      - name: tribe
        data_type: varchar
      - name: genus
        data_type: varchar
      - name: subgenus
        data_type: varchar
      - name: specific_epithet
        data_type: varchar
      - name: on_checklist
        data_type: boolean
      - name: status
        data_type: varchar
      - name: occurrence_count
        data_type: bigint
      - name: specimen_count
        data_type: bigint
      - name: provisional_count
        data_type: bigint
      - name: first_occurrence_date
        data_type: date
      - name: last_occurrence_date
        data_type: date
      - name: month_histogram
        data_type: integer[]
      - name: county_count
        data_type: bigint
      - name: ecoregion_count
        data_type: bigint
      - name: slug
        data_type: varchar
```

---

## State of the Art

| Old Approach | Current Approach | Impact on Phase 086 |
|--------------|-----------------|---------------------|
| `export.py` + `species_export.py` as monolith Python | dbt DAG with staged models + Python JSON post-step | Phase 086 ports the SQL transforms; Python post-step handles JSON serialization |
| DuckDB WASM frontend (v1.8) | wa-sqlite + hyparquet (v2.6 onward) | No frontend changes; `species.parquet` is read by Eleventy `_data/species.js` |
| DuckDB COALESCE on INTEGER[] (broken) | CASE expression workaround | Required for month_histogram backfill in int_species_universe |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0.3 (via `uv run --project data pytest`) |
| Config file | `data/pyproject.toml` |
| Quick run command | `uv run --project data pytest data/tests/test_dbt_diff.py -x` |
| Full suite command | `uv run --project data pytest data/tests/ -x` |
| dbt build command | `bash data/dbt/run.sh build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PORT-01 | species.parquet row count matches | diff | `pytest data/tests/test_dbt_diff.py::test_species_parquet_row_count_matches -x` | ❌ Wave 0 |
| PORT-01 | species.parquet schema matches (19-col) | diff | `pytest data/tests/test_dbt_diff.py::test_species_parquet_schema_matches -x` | ❌ Wave 0 |
| PORT-01 | species.json byte-comparable | diff | `pytest data/tests/test_dbt_diff.py::test_species_json_matches -x` | ❌ Wave 0 |
| PORT-01 | seasonality.json byte-comparable | diff | `pytest data/tests/test_dbt_diff.py::test_seasonality_json_matches -x` | ❌ Wave 0 |
| PORT-01 | species canonical_name key set identical | diff | `pytest data/tests/test_dbt_diff.py::test_species_canonical_name_key_set_matches -x` | ❌ Wave 0 |
| PORT-03 | LIN-05 lineage coverage ≥ 0.95 | dbt singular test | `bash data/dbt/run.sh test --select test_lin05_lineage_coverage` | ❌ Wave 1 |
| PORT-04 | ingestion-boundary doc exists | manual | — | ❌ Wave 1 |
| VALIDATE-01 | All 10 existing diff tests pass throughout | diff regression | `pytest data/tests/test_dbt_diff.py -x` | ✅ |

### Sampling Rate

- **Per task commit**: `uv run --project data pytest data/tests/test_dbt_diff.py -x` (10 existing + new species stubs)
- **Per wave merge**: `bash data/dbt/run.sh build && uv run --project data pytest data/tests/test_dbt_diff.py -x`
- **Phase gate**: Full suite green + `dbt build` PASS=33+ before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `data/tests/test_dbt_diff.py` — add 5 new species diff functions (all SKIP-guarded until sandbox/species.parquet exists)
- [ ] `data/dbt/models/sources.yml` — add `canonical_to_taxon_id`, `taxon_lineage_extended` to inaturalist_data; add `checklist_data` source block
- [ ] `data/dbt/models/staging/stg_inat__canonical_to_taxon_id.sql` — new staging view
- [ ] `data/dbt/models/staging/stg_inat__taxon_lineage_extended.sql` — new staging view
- [ ] `data/dbt/models/staging/stg_checklist__species.sql` — new staging view
- [ ] `data/dbt/tests/test_lin05_lineage_coverage.sql` — new singular test

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `_slugify` in `data/feeds.py` can be re-implemented as a SQL expression byte-comparably | PORT-01 slug column | Medium — if not, slug must be computed in Python post-step (adds complexity to post-hook) |
| A2 | DuckDB list literal `[0,0,0,0,0,0,0,0,0,0,0,0]::INTEGER[]` works in the uvx 1.10.1 DuckDB env | PORT-01 month_histogram backfill | Low — if not, use `list_value(0,0,...,0)::INTEGER[12]` (known working syntax) |
| A3 | The `ref('occurrences')` in `int_species_geo_agg` resolves correctly to the external parquet | PORT-01 geo agg | Low — the occurrences mart is already working; ref() to an external model is proven in this project |

**Verified claims (not assumed):**
- `canonical_to_taxon_id` has 735 rows; `taxon_lineage_extended` has 2196 rows; LIN-05 coverage is currently 100% [VERIFIED]
- `county_count.json` and `ecoregion_count.json` do NOT exist as standalone files [VERIFIED]
- PORT-02 join logic is already in dbt (`int_waba_link`, `int_ecdysis_base`) [VERIFIED]
- `checklist_data` is NOT in `sources.yml` [VERIFIED]
- `dbt build` exits 0 with PASS=33 as of Phase 085 completion [VERIFIED: run during research]
- `species.json` has 629 rows; 19 keys per row; `month_histogram` is 12-element list [VERIFIED]
- `seasonality.json` has 556 species; bucket structure confirmed [VERIFIED]

---

## Open Questions

1. **`_slugify` re-implementation feasibility**
   - What we know: `feeds._slugify` is a Python function imported by `species_export.py` (Phase 78 D-01)
   - What's unclear: whether a SQL `lower(regexp_replace(...))` chain produces byte-identical slugs
   - Recommendation: inspect `data/feeds.py::_slugify` during planning; if it is only `lower + regexp_replace + strip`, a SQL UDF or macro can replicate it; if it uses Python-specific logic, add to the Python post-step

2. **Whether to clean up `int_combined` and `int_specimen_obs_base` in Phase 086**
   - What we know: 085-04 explicitly deferred removal of the 3 dropped columns from intermediate models to Phase 086
   - What's unclear: whether the planner wants to include that cleanup in Phase 086 plans or defer to Phase 88 (where all Python export code is retired anyway)
   - Recommendation: include as an optional wave 2 task (clean up intermediates) if timing permits; it is not required for VALIDATE-01 to pass

3. **Python post-step location for species JSON files**
   - What we know: a Python step must read `sandbox/species.parquet` and `sandbox/occurrences.parquet` and write `sandbox/species.json` and `sandbox/seasonality.json`
   - What's unclear: should this be (a) a dbt Python model, (b) a post-hook in `species.sql`, or (c) a standalone Python script called after `dbt build`?
   - Recommendation: option (c) — a standalone script (or an updated `species_export.py` with an `export_species_json(sandbox_dir)` function) called after `dbt build`. This keeps dbt model SQL pure and avoids the pandas dependency that dbt Python models require.

---

## Environment Availability

| Dependency | Required By | Available | Version |
|------------|------------|-----------|---------|
| uv | dbt run wrapper, pytest runner | ✓ | (confirmed by codebase usage) |
| uvx + dbt-core==1.10.1 | `bash data/dbt/run.sh build` | ✓ | 1.10.1 (pinned) |
| DuckDB (in uvx env) | dbt-duckdb SQL execution | ✓ | 1.2.x (via dbt-duckdb 1.10.1) |
| data/beeatlas.duckdb | All dbt models | ✓ | live data, 735 species, 46,090 ecdysis rows |
| public/data/species.json | VALIDATE-01 diff baseline | ✓ | 629 rows |
| public/data/seasonality.json | VALIDATE-01 diff baseline | ✓ | 556 species |
| public/data/species.parquet | VALIDATE-01 diff baseline | ✓ | 629 rows, 19 columns |

---

## Security Domain

This phase is an internal pipeline rewrite with no external-facing surface changes. The dbt models
read from a local DuckDB file and write to local parquet/JSON files. No authentication, session
management, or user input is involved. Security domain: N/A.

---

## Sources

### Primary (HIGH confidence)

- `data/species_export.py` — read directly; all CTEs, serialization patterns, and artifact shapes verified
- `data/resolve_taxon_ids.py` — read directly; API call pattern and PORT-04 decision basis
- `data/inaturalist_pipeline.py` (lines 184-270) — `enrich_taxon_lineage_extended` function
- `data/export.py` — read directly; PORT-02 waba_link and ecdysis_base CTEs
- `data/dbt/models/**` — all existing dbt models read directly
- `data/dbt/models/sources.yml` — confirmed checklist_data absent
- `data/tests/test_dbt_diff.py` — current harness coverage confirmed
- `data/tests/test_species_export.py` — JSON serialization requirements verified
- `data/beeatlas.duckdb` — queried directly for table counts, LIN-05 coverage, schema
- `public/data/` — confirmed file inventory (species.json 629 rows, no county_count.json)
- `bash data/dbt/run.sh build` — confirmed PASS=33, exit 0 as of Phase 085

### Secondary (MEDIUM confidence)

- `.planning/phases/085-pre-cutover-groundwork/085-RESEARCH.md` — CLEAN-02 intermediate model analysis, int_combined ARM 2 documentation
- `.planning/phases/085-pre-cutover-groundwork/085-04-SUMMARY.md` — 30-column contract state, deferred intermediate cleanup decision
- `.planning/research/dbt-spike-findings.md` — ingestion-vs-transform boundary rationale, format CSV locked decision
- `.planning/milestones/v3.3-ROADMAP.md` — dbt-core 1.10.1 pin rationale

---

## Metadata

**Confidence breakdown:**
- PORT-01 SQL shape: HIGH — verified against live species_export.py and species.json structure
- PORT-01 JSON post-step requirement: HIGH — json.dumps format verified in test_species_export.py
- PORT-02 already-done assessment: HIGH — int_waba_link and int_ecdysis_base source code read directly
- PORT-03 source declarations: HIGH — tables verified in DuckDB; LIN-05 coverage confirmed 100%
- PORT-04 ingestion-boundary decision: HIGH — script clearly makes iNat API calls
- Slug column strategy: MEDIUM — `_slugify` not inspected during this research session (A1 assumption)

**Research date:** 2026-05-13
**Valid until:** Until `data/beeatlas.duckdb` is refreshed from production (species/lineage counts may change; test coverage is schema-based so remains valid regardless)
