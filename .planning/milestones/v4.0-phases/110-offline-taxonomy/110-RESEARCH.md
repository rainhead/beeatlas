# Phase 110: Offline Taxonomy - Research

**Researched:** 2026-05-23
**Domain:** Python pipeline / DuckDB / iNaturalist Open Data
**Confidence:** HIGH

## Summary

Phase 110 replaces two live iNaturalist API enrichers with a local taxa.csv.gz ancestry walk. The iNat Open Data archive lives at `https://inaturalist-open-data.s3.amazonaws.com/taxa.csv.gz` (public bucket, no credentials needed). It is a **tab-separated** CSV with 6 columns: `taxon_id`, `ancestry`, `rank_level`, `rank`, `name`, `active`. The `ancestry` column contains `/`-separated taxon IDs as a string (e.g., `48460/1/47120/372739/47158/184884/47219`) — the taxon itself is NOT included, only its ancestors. The `active` column is the **string** `'true'` or `'false'`, not a boolean. The file is 37MB gzipped (verified via HTTP HEAD).

DuckDB 1.5.2 (installed in the data env) reads gzip-compressed files directly via `read_csv(..., compression='gzip')` — no manual decompression needed. The ancestry walk uses `unnest(string_split(ancestry, '/'))` as required by TAX-02, joined back to the taxa table to pivot ranks into columns. The taxon itself must also be included in the pivot (a genus taxon ID won't have itself in its ancestry string).

ETag/Last-Modified caching is a new pattern for this codebase — no existing pipeline uses HTTP conditional requests. The closest analogue is `geographies_pipeline.py`'s URL-sidecar approach; for taxa.csv.gz the pattern is: store `ETag` and `Last-Modified` from the response headers in a sidecar file at `data/raw/taxa_cache.json`, send `If-None-Match` + `If-Modified-Since` on subsequent requests, skip re-download on HTTP 304.

The two enricher functions to delete are `enrich_taxon_lineage_extended` (inaturalist_pipeline.py line 184) and `enrich_taxon_lineage` (waba_pipeline.py line 109). The STEPS list in run.py must replace the `taxon-lineage-extended` entry with the new CSV loader. `stg_waba__taxon_lineage.sql` must be rewritten from a `source()` to a `ref()` call per D-01. The `inaturalist_waba_data.taxon_lineage` source declaration in sources.yml must be removed per D-02.

**Primary recommendation:** Create a new `taxa_pipeline.py` module (analogous to `checklist_pipeline.py`) containing `download_taxa_csv` (ETag-cached download to `data/raw/taxa.csv.gz`) and `load_taxon_lineage_extended` (DuckDB CREATE OR REPLACE TABLE from the CSV ancestry walk). Register both as a single STEPS entry that replaces `taxon-lineage-extended`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `stg_waba__taxon_lineage` is rewritten as a dbt view on `stg_inat__taxon_lineage_extended`, selecting `taxon_id, genus, family`. No new Python step; `int_specimen_obs_base` is unchanged — it still JOINs `stg_waba__taxon_lineage`, which now sources from `taxon_lineage_extended`.
- **D-02:** The `inaturalist_waba_data.taxon_lineage` source declaration in `data/dbt/models/sources.yml` must be removed (the table will no longer exist in DuckDB after `enrich_taxon_lineage` is deleted).

### Claude's Discretion

- **Exact dbt ref pattern** for the rewritten `stg_waba__taxon_lineage` — use `{{ ref('stg_inat__taxon_lineage_extended') }}` or another clean approach; planner decides what's idiomatic.
- **Taxon scope** in the new `taxon_lineage_extended` — the enricher currently filters to observed taxon IDs; with taxa.csv.gz, the planner should determine whether to load all active bees (Anthophila) or all active taxa. Phase 111 (Checklist) needs lineage for species not yet in observations, so scope must be at least all WA bee species.
- **Module placement** for the taxa.csv.gz downloader + DuckDB loader — new module vs. extension of `inaturalist_pipeline.py`; follow existing pipeline patterns.
- **Test migration** — `data/tests/test_taxon_lineage_extended.py` mocks HTTP requests to the live API; these tests become dead after Phase 110. Planner decides whether to delete them (rely on dbt schema tests for contract coverage) or port to a CSV-fixture approach.

### Deferred Ideas (OUT OF SCOPE)

- **Cluster blobs selection visual feedback** (open todo, score 0.2) — unrelated to Phase 110; not folded.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TAX-01 | Pipeline downloads `taxa.csv.gz` from iNat AWS Open Data with ETag/Last-Modified caching; no re-download when archive is unchanged | Verified: S3 URL is `https://inaturalist-open-data.s3.amazonaws.com/taxa.csv.gz`; HTTP HEAD confirms ETag + Last-Modified headers are present; caching pattern documented below |
| TAX-02 | DuckDB ancestry walk via `unnest(string_split(ancestry,'/'))` produces `taxon_lineage_extended` with identical schema (family, subfamily, tribe, genus, subgenus per taxon_id) | Verified: DuckDB 1.5.2 supports read_csv with gzip; ancestry walk + PIVOT SQL tested and produces correct output; schema matches current table definition |
| TAX-03 | Live `/v2/taxa` enricher functions removed from pipeline; `dbt build` and `npm test` pass after deletion | Documented: 2 functions + 2 test files + sources.yml entry; dbt schema tests on `stg_inat__taxon_lineage_extended` are unaffected since it stays pointed at the same DuckDB table |
| TAX-04 | Taxa archive cached at `data/raw/taxa.csv.gz`; synced to/from S3 by `nightly.sh` to persist across nightly runs | Verified: `data/raw/` is the established raw cache directory (ecdysis_cache lives there); nightly.sh S3 pattern is `aws s3 cp --no-progress`; taxa.csv.gz S3 key should be `raw/taxa.csv.gz` |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| taxa.csv.gz download with ETag caching | Pipeline (Python) | nightly.sh (S3 sync) | Network I/O with HTTP conditional requests belongs in Python; S3 persistence belongs in shell wrapper |
| DuckDB ancestry walk / lineage population | Pipeline (Python) | dbt staging | Python CREATE OR REPLACE TABLE; dbt views sit on top unchanged |
| stg_waba__taxon_lineage rewrite | dbt staging | — | Pure SQL model swap: source() → ref(); no Python involvement |
| enricher deletion | Pipeline (Python) | run.py STEPS | Delete function bodies; update STEPS entry |
| nightly.sh S3 sync for taxa.csv.gz | nightly.sh (bash) | — | Follows existing db/beeatlas.duckdb pull-at-start / EXIT-trap-push pattern |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| duckdb | 1.5.2 | Read taxa.csv.gz, ancestry walk, CREATE OR REPLACE TABLE | Already in pipeline env; `read_csv` supports gzip natively |
| requests | (pinned via dlt) | HTTP download with ETag/Last-Modified | Already used throughout pipeline for iNat API calls |

### No New Dependencies

This phase requires no new Python packages. `duckdb` reads gzipped CSV files natively. `requests` already handles HTTP headers. No `boto3` needed (taxa.csv.gz is a public URL, not an S3 bucket operation).

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| json (stdlib) | 3.14+ | Store ETag/Last-Modified sidecar (`data/raw/taxa_cache.json`) | For the caching sidecar file |
| pathlib (stdlib) | 3.14+ | File path manipulation | Consistent with all other pipeline modules |

---

## Package Legitimacy Audit

No new packages are installed in this phase. All dependencies are already present.

---

## Architecture Patterns

### System Architecture Diagram

```
nightly.sh pull:
  S3 raw/taxa.csv.gz --> data/raw/taxa.csv.gz
  (if not present; first run only)

run.py STEPS:
  taxa-download  --> download_taxa_csv()
    |  data/raw/taxa_cache.json (ETag sidecar)
    |  HTTP HEAD / conditional GET to inaturalist-open-data.s3.amazonaws.com/taxa.csv.gz
    |  saves: data/raw/taxa.csv.gz
    v
  taxon-lineage-extended  --> load_taxon_lineage_extended()
    |  read_csv('data/raw/taxa.csv.gz', compression='gzip')
    |  unnest(string_split(ancestry, '/')) ancestry walk
    |  PIVOT on rank IN ('family','subfamily','tribe','genus','subgenus')
    v  CREATE OR REPLACE TABLE inaturalist_data.taxon_lineage_extended

dbt build:
  stg_inat__taxon_lineage_extended  -->  SELECT * FROM source('inaturalist_data','taxon_lineage_extended')
  stg_waba__taxon_lineage           -->  SELECT taxon_id,genus,family FROM ref('stg_inat__taxon_lineage_extended')
  int_specimen_obs_base             -->  LEFT JOIN ref('stg_waba__taxon_lineage') [unchanged]
  int_species_universe              -->  LEFT JOIN ref('stg_inat__taxon_lineage_extended') [unchanged]

nightly.sh EXIT trap:
  data/raw/taxa.csv.gz --> S3 raw/taxa.csv.gz
```

### Recommended Project Structure

```
data/
├── taxa_pipeline.py        # NEW: download_taxa_csv() + load_taxon_lineage_extended()
├── raw/
│   ├── taxa.csv.gz         # NEW: local cache (gitignored)
│   └── taxa_cache.json     # NEW: ETag/Last-Modified sidecar (gitignored)
│   └── ecdysis_cache/      # existing
├── inaturalist_pipeline.py # MODIFIED: delete enrich_taxon_lineage_extended
├── waba_pipeline.py        # MODIFIED: delete enrich_taxon_lineage; remove enrich_taxon_lineage call from load_observations
├── run.py                  # MODIFIED: replace 'taxon-lineage-extended' entry
├── dbt/models/staging/
│   └── stg_waba__taxon_lineage.sql  # REWRITTEN: source() → ref()
├── dbt/models/sources.yml  # MODIFIED: remove inaturalist_waba_data.taxon_lineage
└── tests/
    ├── test_taxon_lineage_extended.py  # DELETE or rewrite
    └── test_taxon_lineage.py           # DELETE or rewrite
```

### Pattern 1: ETag/Last-Modified Download Caching

**What:** Store the server's ETag and Last-Modified values after a successful download. On subsequent runs, send `If-None-Match` + `If-Modified-Since` headers; skip download on HTTP 304.

**When to use:** Large files from static sources (taxa.csv.gz is 37MB gzipped, changes monthly per iNat Open Data update cadence).

**Example:**
```python
# Source: verified via HTTP HEAD against inaturalist-open-data.s3.amazonaws.com
import json
import requests
from pathlib import Path

RAW_DIR = Path(__file__).parent / "raw"
TAXA_URL = "https://inaturalist-open-data.s3.amazonaws.com/taxa.csv.gz"
TAXA_PATH = RAW_DIR / "taxa.csv.gz"
TAXA_CACHE_PATH = RAW_DIR / "taxa_cache.json"


def download_taxa_csv() -> None:
    """Download taxa.csv.gz with ETag/Last-Modified caching.

    Skips download if server returns 304 Not Modified.
    Writes sidecar taxa_cache.json with ETag + Last-Modified for next run.
    """
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    headers = {}
    if TAXA_PATH.exists() and TAXA_CACHE_PATH.exists():
        cache = json.loads(TAXA_CACHE_PATH.read_text())
        if etag := cache.get("etag"):
            headers["If-None-Match"] = etag
        if last_modified := cache.get("last_modified"):
            headers["If-Modified-Since"] = last_modified

    resp = requests.get(TAXA_URL, headers=headers, stream=True, timeout=60)

    if resp.status_code == 304:
        print(f"taxa.csv.gz: unchanged (304), using cached copy")  # noqa: T201
        return
    resp.raise_for_status()

    # Atomic write: download to .tmp, then rename
    tmp_path = TAXA_PATH.with_suffix(".gz.tmp")
    with open(tmp_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=1024 * 1024):
            f.write(chunk)
    tmp_path.rename(TAXA_PATH)

    sidecar = {
        "etag": resp.headers.get("ETag"),
        "last_modified": resp.headers.get("Last-Modified"),
    }
    TAXA_CACHE_PATH.write_text(json.dumps(sidecar))
    size_mb = TAXA_PATH.stat().st_size / 1024**2
    print(f"taxa.csv.gz: downloaded {size_mb:.1f} MB")  # noqa: T201
```

### Pattern 2: DuckDB Ancestry Walk (PIVOT)

**What:** For each target taxon ID, unnest the ancestry string, join back to the taxa table to get rank/name, then PIVOT into one column per rank.

**When to use:** Producing denormalized lineage rows from a hierarchical path string — this is TAX-02.

**Verified working against DuckDB 1.5.2:**
```python
# Source: tested in data env, uv run python3
con.execute("""
    CREATE OR REPLACE TABLE inaturalist_data.taxon_lineage_extended AS
    WITH all_active_bees AS (
        -- All active taxa descended from Anthophila (taxon_id=630955).
        -- ancestry column is /  -separated ancestor IDs, NOT including self.
        -- Filter: active='true' (string, not bool); ancestry contains Anthophila.
        SELECT taxon_id, ancestry, rank, name
        FROM read_csv(?, delim='\t', header=true, compression='gzip',
                      columns={'taxon_id':'BIGINT','ancestry':'VARCHAR',
                                'rank_level':'INTEGER','rank':'VARCHAR',
                                'name':'VARCHAR','active':'VARCHAR'})
        WHERE active = 'true'
          AND (ancestry LIKE '%/630955/%' OR ancestry LIKE '%/630955'
               OR taxon_id = 630955)
    ),
    -- Unnest ancestor IDs from ancestry string
    ancestor_ids AS (
        SELECT
            b.taxon_id AS target_taxon_id,
            CAST(unnest(string_split(b.ancestry, '/')) AS BIGINT) AS ancestor_id
        FROM all_active_bees b
    ),
    -- Join ancestor IDs back to taxa table for rank/name
    ancestor_rows AS (
        SELECT ai.target_taxon_id, anc.rank, anc.name
        FROM ancestor_ids ai
        JOIN all_active_bees anc ON anc.taxon_id = ai.ancestor_id
        WHERE anc.rank IN ('family','subfamily','tribe','genus','subgenus')
    ),
    -- Include the taxon itself (it may be genus or family rank)
    self_rows AS (
        SELECT taxon_id AS target_taxon_id, rank, name
        FROM all_active_bees
        WHERE rank IN ('family','subfamily','tribe','genus','subgenus')
    ),
    all_rows AS (
        SELECT * FROM ancestor_rows
        UNION ALL
        SELECT * FROM self_rows
    )
    PIVOT all_rows
        ON rank IN ('family','subfamily','tribe','genus','subgenus')
        USING first(name)
        GROUP BY target_taxon_id
""", [str(TAXA_PATH)])
```

**Schema produced:** `(target_taxon_id BIGINT, family VARCHAR, subfamily VARCHAR, tribe VARCHAR, genus VARCHAR, subgenus VARCHAR)` — identical to current `taxon_lineage_extended` table schema (column order: taxon_id first, then the five rank columns).

**Important:** The PIVOT column name is `target_taxon_id` (not `taxon_id`) — the final SELECT or table DDL must alias it. Use `CREATE OR REPLACE TABLE ... AS SELECT target_taxon_id AS taxon_id, ...` or add a wrapper CTE.

### Pattern 3: stg_waba__taxon_lineage Rewrite (D-01)

**What:** Replace `source()` reference to the deleted table with a `ref()` to the iNat staging model.

**Verified idiomatic dbt pattern for this codebase:**
```sql
-- data/dbt/models/staging/stg_waba__taxon_lineage.sql
-- Rewritten per Phase 110 D-01: was source('inaturalist_waba_data','taxon_lineage');
-- now delegates to stg_inat__taxon_lineage_extended, selecting the 3 cols
-- that int_specimen_obs_base consumes (taxon_id, genus, family).
{{ config(materialized='view') }}

SELECT taxon_id, genus, family
FROM {{ ref('stg_inat__taxon_lineage_extended') }}
```

### Pattern 4: nightly.sh S3 Sync for taxa.csv.gz (TAX-04)

**What:** Pull taxa.csv.gz from S3 at start (if missing), push after pipeline (in EXIT trap).

**Modeled after the existing DuckDB sync pattern (lines 81–89 of nightly.sh):**
```bash
# In variable declarations:
TAXA_S3_KEY="raw/taxa.csv.gz"
TAXA_PATH="$SCRIPT_DIR/raw/taxa.csv.gz"

# Pull at start (after DuckDB pull, before pipelines):
echo "--- pulling taxa.csv.gz from S3 ---"
if ! aws --profile "$AWS_PROFILE" s3 cp --no-progress \
    "s3://$BUCKET/$TAXA_S3_KEY" "$TAXA_PATH" 2>/dev/null; then
    echo "No cached taxa.csv.gz in S3 (first run or expired), will download from iNat."
fi

# In EXIT trap (alongside DuckDB backup):
if [[ -f "$TAXA_PATH" ]]; then
    aws --profile "$AWS_PROFILE" s3 cp --no-progress \
        "$TAXA_PATH" "s3://$BUCKET/$TAXA_S3_KEY" || true
fi
```

**Key detail:** The ETag sidecar (`raw/taxa_cache.json`) must also be synced — otherwise the ETag is lost between nightly runs and every run re-downloads 37MB. Either sync the sidecar separately or use the EXIT trap approach.

### Anti-Patterns to Avoid

- **Don't filter by observed taxon IDs:** The current enricher only fetches lineage for taxa already in observations. The new loader must load all active Anthophila so Phase 111 (Checklist) can look up lineage for checklist-only species not yet observed in WABA.
- **Don't use `active = true` (bool):** The `active` column in taxa.csv.gz is a **string** (`'true'`/`'false'`), not a boolean. DuckDB's `read_csv` infers it correctly when the column type is specified as `VARCHAR`. Filter with `WHERE active = 'true'`.
- **Don't forget to include self in the ancestry walk:** The ancestry column contains ancestor IDs only — a genus taxon does not list itself in its own ancestry. Include a `UNION ALL self_rows` arm for taxa whose own rank is in TARGET_RANKS.
- **Don't use `LIKE '%630955%'`:** Use `LIKE '%/630955/%' OR LIKE '%/630955'` — the simpler form could false-match a taxon ID that contains `630955` as a substring (e.g., `1630955`).
- **Don't lose the ETag sidecar between S3 pulls:** Sync `raw/taxa_cache.json` alongside `raw/taxa.csv.gz` so the conditional GET fires on subsequent nightly runs.
- **Don't leave `taxon_lineage` source in sources.yml:** After D-02, `inaturalist_waba_data.taxon_lineage` no longer exists; `dbt build` will fail with a missing source error if the declaration remains.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gzip decompression | Custom decompressor | `read_csv(..., compression='gzip')` | DuckDB handles it natively |
| Hierarchy traversal | Recursive CTE | `unnest(string_split(ancestry, '/'))` + JOIN | ancestors are explicit in the ancestry column; no recursion needed |
| Column pivoting | Conditional aggregation CASE WHEN | `PIVOT ... ON rank IN (...)` | DuckDB 1.5.2 has native PIVOT; cleaner and faster |

---

## Common Pitfalls

### Pitfall 1: PIVOT column naming vs. final table schema
**What goes wrong:** The PIVOT produces `target_taxon_id` as the group key column (named from the CTE). The final `taxon_lineage_extended` table needs `taxon_id` as the column name (to match the existing PRIMARY KEY schema and all downstream JOINs).
**Why it happens:** DuckDB PIVOT uses the GROUP BY column name as-is.
**How to avoid:** Either alias in the CTE (`b.taxon_id AS target_taxon_id` → then alias back) or wrap the PIVOT in a SELECT that renames `target_taxon_id AS taxon_id`.
**Warning signs:** `dbt build` fails with column mismatch, or downstream JOINs on `taxon_id` return zero rows.

### Pitfall 2: ETag sidecar not synced — re-downloads 37MB every night
**What goes wrong:** `raw/taxa_cache.json` is created locally but not pushed to S3. The next nightly run pulls `taxa.csv.gz` from S3 but finds no sidecar, so sends no conditional headers, re-downloads 37MB.
**Why it happens:** The sidecar is a separate file from the archive.
**How to avoid:** Sync both `taxa.csv.gz` and `taxa_cache.json` in nightly.sh. Or store ETag inside the DuckDB (in a metadata table) — but the sidecar approach matches the geographies caching pattern.

### Pitfall 3: STEPS ordering — taxa download before lineage load
**What goes wrong:** `load_taxon_lineage_extended` runs before `download_taxa_csv`, finds no file, fails with FileNotFoundError.
**Why it happens:** Two STEPS entries needed; order matters.
**How to avoid:** In run.py STEPS, insert `('taxa-download', download_taxa_csv)` immediately before `('taxon-lineage-extended', load_taxon_lineage_extended)`.

### Pitfall 4: test_taxon_lineage_extended.py / test_taxon_lineage.py not deleted
**What goes wrong:** Tests still import and call the deleted enricher functions; pytest errors on import.
**Why it happens:** The test files mock HTTP to the live API; after deletion of the enrichers, the import itself fails.
**How to avoid:** Either delete both test files (preferred if dbt schema tests provide contract coverage) or port to CSV-fixture approach before deletion. Decide before the deletion task executes.

### Pitfall 5: waba_pipeline.py still calls enrich_taxon_lineage
**What goes wrong:** `enrich_taxon_lineage` is deleted from waba_pipeline.py but `load_observations` in that file still calls `enrich_taxon_lineage(DB_PATH)` at line 184. Import succeeds but runtime fails.
**Why it happens:** The function is called inside `load_observations`, not just defined.
**How to avoid:** When deleting `enrich_taxon_lineage`, also remove the call at the end of `load_observations` in waba_pipeline.py.

### Pitfall 6: run.py still imports enrich_taxon_lineage_extended
**What goes wrong:** After deleting the function from inaturalist_pipeline.py, run.py line 30 (`from inaturalist_pipeline import enrich_taxon_lineage_extended`) fails on import.
**Why it happens:** run.py imports the function directly; the import must be updated when the STEPS entry changes.
**How to avoid:** Remove the import line and add `from taxa_pipeline import download_taxa_csv, load_taxon_lineage_extended` (or whatever the new module is named).

---

## Code Examples

### Verified: taxa.csv.gz HTTP Headers

```
URL: https://inaturalist-open-data.s3.amazonaws.com/taxa.csv.gz
Last-Modified: Mon, 27 Apr 2026 12:48:16 GMT
ETag: "6e0b96192862ff4ff1379b07e0fef6ca"
Content-Length: 39065030 (37MB gzipped)
Content-Encoding: gzip
```
[VERIFIED: HTTP HEAD against S3 endpoint, 2026-05-23]

### Verified: taxa.csv.gz Column Headers

```
taxon_id[TAB]ancestry[TAB]rank_level[TAB]rank[TAB]name[TAB]active
```
- Delimiter: TAB (`\t`)
- `taxon_id`: integer string
- `ancestry`: `/`-separated ancestor taxon IDs (NOT including self)
- `rank_level`: integer (10=species, 20=genus, 30=family, ...)
- `rank`: string (e.g., `species`, `genus`, `family`, `subfamily`, `tribe`, `subgenus`)
- `active`: string `'true'` or `'false'` (NOT a SQL boolean)

[VERIFIED: partial download + gzip decompression, 2026-05-23]

### Verified: DuckDB read_csv with gzip

```python
# DuckDB 1.5.2 — tested in data env
result = con.execute("""
    SELECT * FROM read_csv('data/raw/taxa.csv.gz',
        delim='\t', header=true, compression='gzip',
        columns={'taxon_id':'BIGINT','ancestry':'VARCHAR',
                 'rank_level':'INTEGER','rank':'VARCHAR',
                 'name':'VARCHAR','active':'VARCHAR'})
    WHERE active = 'true'
    LIMIT 5
""").fetchall()
```
[VERIFIED: uv run python3 in data/, 2026-05-23]

### Verified: Ancestry Walk PIVOT

```python
# Produces correct family/genus/etc columns; tested with mini dataset
# key: UNION ALL self_rows is required to include genus/family taxa themselves
# PIVOT column order: target_taxon_id, family, subfamily, tribe, genus, subgenus
```
[VERIFIED: uv run python3 in data/, 2026-05-23]

---

## Taxa Scope Decision (Claude's Discretion)

**Recommendation: Filter to all active Anthophila (taxon_id=630955), not just observed taxa.**

Rationale:
- The current enricher scope (only observed taxa IDs) was a workaround for API rate limits — those limits don't apply to a local CSV read.
- Phase 111 needs lineage for all 565 checklist species, including those with zero WABA observations.
- The `int_species_universe` model joins `stg_inat__taxon_lineage_extended` on `ctt.taxon_id` (from `stg_inat__canonical_to_taxon_id`) — if a checklist species has no entry in `taxon_lineage_extended`, its lineage columns come back NULL (COALESCE fallback exists for genus via `split_part`, but not for family/subfamily/tribe).
- Filtering to Anthophila (`ancestry LIKE '%/630955/%' OR ancestry LIKE '%/630955'`) is cheap (string scan on 37MB); no need to restrict further.
- Anthophila taxon ID: **630955** [VERIFIED: iNaturalist website URL `https://www.inaturalist.org/taxa/630955`]

---

## Test Disposition (Claude's Discretion)

**Recommendation: Delete `test_taxon_lineage_extended.py` and `test_taxon_lineage.py`; add a new `test_taxa_pipeline.py`.**

Rationale:
- `test_taxon_lineage_extended.py` (430 lines) is entirely about mocking iNat HTTP requests to test the API enricher. After enricher deletion, it has no subject.
- `test_taxon_lineage.py` (339 lines) similarly mocks HTTP for the waba enricher.
- The dbt schema tests in `schema.yml` already enforce `not_null` + `unique` on `taxon_id` in `stg_inat__taxon_lineage_extended`.
- New `test_taxa_pipeline.py` should test: (1) ETag caching logic with a small CSV fixture, (2) ancestry walk correctness with a multi-row fixture, (3) `load_taxon_lineage_extended` populates `taxon_lineage_extended` with correct schema.

---

## Runtime State Inventory

This is a code-deletion + replacement phase, not a rename. No persistent string identifiers change. The table name `inaturalist_data.taxon_lineage_extended` is preserved (new loader populates the same table).

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `inaturalist_data.taxon_lineage_extended` in DuckDB — currently populated by the enricher | CREATE OR REPLACE by new loader; existing rows replaced on first run |
| Stored data | `inaturalist_waba_data.taxon_lineage` in DuckDB — created by `enrich_taxon_lineage` | Table will be absent after waba enricher deletion; `stg_waba__taxon_lineage` dbt view must be updated before `dbt build` runs |
| Live service config | None — no external service configuration references these tables | None |
| OS-registered state | None | None |
| Secrets/env vars | None — no env var references either enricher by name | None |
| Build artifacts | `data/dbt/target/` compiled SQL referencing `inaturalist_waba_data.taxon_lineage` as source | Re-running `dbt build` after sources.yml update regenerates compiled SQL |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| duckdb Python package | load_taxon_lineage_extended | Yes | 1.5.2 | — |
| requests Python package | download_taxa_csv | Yes | (via dlt deps) | — |
| internet access to inaturalist-open-data.s3.amazonaws.com | download_taxa_csv (first run) | Yes | — | S3 cache (TAX-04) |
| S3 bucket (for nightly sync) | nightly.sh TAX-04 | Yes (same bucket as DuckDB) | — | — |
| uv | pipeline execution | Yes | installed | — |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest >= 9.0.2 |
| Config file | `data/pyproject.toml` (`testpaths = ["tests"]`) |
| Quick run command | `cd data && uv run pytest tests/test_taxa_pipeline.py -x` |
| Full suite command | `cd data && uv run pytest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TAX-01 | ETag caching skips re-download on 304 | unit | `uv run pytest tests/test_taxa_pipeline.py::test_download_uses_304 -x` | No — Wave 0 |
| TAX-01 | First download writes taxa.csv.gz and sidecar | unit | `uv run pytest tests/test_taxa_pipeline.py::test_download_writes_sidecar -x` | No — Wave 0 |
| TAX-02 | Ancestry walk produces correct 6-col schema | unit | `uv run pytest tests/test_taxa_pipeline.py::test_lineage_schema -x` | No — Wave 0 |
| TAX-02 | NULL emitted for absent ranks | unit | `uv run pytest tests/test_taxa_pipeline.py::test_lineage_null_ranks -x` | No — Wave 0 |
| TAX-03 | dbt build passes after enricher deletion | smoke | `bash data/dbt/run.sh build` | — |
| TAX-03 | npm test passes | smoke | `npm test` | — |
| TAX-04 | nightly.sh taxa sync adds pull/push calls | manual | review nightly.sh diff | — |

### Sampling Rate
- **Per task commit:** `cd data && uv run pytest tests/test_taxa_pipeline.py -x`
- **Per wave merge:** `cd data && uv run pytest`
- **Phase gate:** Full suite green + `bash data/dbt/run.sh build` green + `npm test` green

### Wave 0 Gaps

- [ ] `data/tests/test_taxa_pipeline.py` — covers TAX-01, TAX-02 (ETag caching + ancestry walk unit tests)
- [ ] Small CSV fixture for ancestry walk tests (inline or `tests/fixtures/mini_taxa.csv.gz`)
- [ ] Decision on `test_taxon_lineage_extended.py` / `test_taxon_lineage.py` disposition (delete vs. port) — must resolve before enricher deletion task

---

## Security Domain

This phase downloads a file from an AWS S3 public bucket over HTTPS. No authentication, no user input, no secrets. ASVS categories are not applicable.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | No | — |
| V5 Input Validation | Minimal | taxa.csv.gz is a trusted iNat dataset; DuckDB read_csv type declarations prevent injection |
| V6 Cryptography | No | — |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| iNat /v2/taxa API with 30-taxon batches + rate limiting | Local taxa.csv.gz ancestry walk | Phase 110 | Eliminates rate-limit risk; pipeline no longer requires internet for lineage step after first download |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Anthophila taxon ID is 630955 | Taxon Scope, Code Examples | Wrong ID → all bee taxa filtered out; lineage table empty → dbt build succeeds but produces no lineage data |
| A2 | taxa.csv.gz updates occur monthly (iNat Open Data cadence) | Common Pitfalls | If update cadence is faster, ETag-based caching still works correctly (just more frequent re-downloads) |
| A3 | `inaturalist_waba_data.taxon_lineage` table will be absent after enricher deletion (not just empty) | Runtime State Inventory | If another code path creates it, dbt source declaration removal causes a dbt freshness false alarm but not a build failure |

**Anthophila ID note:** The ID 630955 was confirmed via iNaturalist URL structure (`https://www.inaturalist.org/taxa/630955-Anthophila`) and cross-referenced with the REQUIREMENTS.md note that Anthophila is the filtering scope for Phase 111. The smoke test did not fetch all taxa data to directly verify an ancestor chain, but the ID is widely cited in the iNat community.

---

## Open Questions

1. **ETag sidecar format for taxa.csv.gz nightly sync**
   - What we know: nightly.sh currently syncs DuckDB (single file) via `aws s3 cp`; the sidecar `taxa_cache.json` is a new file
   - What's unclear: Should the sidecar go in `data/raw/` (co-located with the archive) or in `data/` (co-located with `last_fetch.txt`)?
   - Recommendation: `data/raw/taxa_cache.json` (co-located with taxa.csv.gz for clarity); add it to `data/.gitignore`

2. **taxa.csv.gz S3 key in project bucket vs. pulling direct from iNat**
   - What we know: nightly.sh S3 bucket is the CloudFront/site bucket; DuckDB key is `db/beeatlas.duckdb`
   - What's unclear: Should taxa.csv.gz use `raw/taxa.csv.gz` key in the same bucket, or always re-download from iNat on first run? The ETag caching means re-download from iNat costs 37MB only when changed — acceptable.
   - Recommendation: TAX-04 says "synced to/from S3 by nightly.sh" — use `raw/taxa.csv.gz` key in the project bucket. This avoids internet dependency for the lineage step when S3 has the cached copy.

---

## Sources

### Primary (HIGH confidence)
- HTTP HEAD + partial download against `https://inaturalist-open-data.s3.amazonaws.com/taxa.csv.gz` — column headers, ETag, Last-Modified, file size (verified 2026-05-23)
- Direct DuckDB 1.5.2 testing in `data/` env — `read_csv(compression='gzip')`, PIVOT, ancestry walk correctness
- Codebase source readings: `inaturalist_pipeline.py`, `waba_pipeline.py`, `run.py`, `nightly.sh`, `data/.gitignore`, `data/dbt/models/sources.yml`, `stg_inat__taxon_lineage_extended.sql`, `stg_waba__taxon_lineage.sql`, `int_specimen_obs_base.sql`, `conftest.py`

### Secondary (MEDIUM confidence)
- iNaturalist Open Data GitHub README — confirms taxa.csv.gz is one of six tab-separated files in the dataset
- iNaturalist website URL `https://www.inaturalist.org/taxa/630955` — Anthophila taxon ID

### Tertiary (LOW confidence)
- iNat Open Data monthly update cadence — inferred from community discussion, not official documentation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all tools verified in-env
- Architecture: HIGH — smoke-tested CSV structure, DuckDB patterns, and codebase read
- Pitfalls: HIGH — derived from direct code inspection of enricher call sites and test files
- ETag caching pattern: HIGH — HTTP HEAD confirms headers; pattern is standard HTTP

**Research date:** 2026-05-23
**Valid until:** 2026-08-23 (iNat Open Data schema is stable; ETag pattern is standard; DuckDB API stable)
