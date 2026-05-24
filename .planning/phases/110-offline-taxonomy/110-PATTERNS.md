# Phase 110: Offline Taxonomy - Pattern Map

**Mapped:** 2026-05-23
**Files analyzed:** 11 (7 modified/deleted, 4 new)
**Analogs found:** 10 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/taxa_pipeline.py` | pipeline module | file-I/O + batch transform | `data/checklist_pipeline.py` | role-match |
| `data/raw/taxa.csv.gz` | data artifact | file-I/O | `data/raw/ecdysis_cache/` (directory) | partial-match |
| `data/raw/taxa_cache.json` | config/sidecar | file-I/O | `data/geographies_pipeline.py` `.url` sidecar | partial-match |
| `data/inaturalist_pipeline.py` | pipeline module | CRUD | self (deletion from existing file) | exact |
| `data/waba_pipeline.py` | pipeline module | CRUD | self (deletion from existing file) | exact |
| `data/run.py` | orchestrator | batch | self (STEPS list modification) | exact |
| `data/dbt/models/staging/stg_waba__taxon_lineage.sql` | dbt staging view | transform | `data/dbt/models/staging/stg_inat__taxon_lineage_extended.sql` | exact |
| `data/dbt/models/sources.yml` | config | N/A | self (removal of one source entry) | exact |
| `data/tests/test_taxon_lineage_extended.py` | test | N/A | DELETE — no analog needed | N/A |
| `data/tests/test_taxon_lineage.py` | test | N/A | DELETE — no analog needed | N/A |
| `data/tests/test_taxa_pipeline.py` | test | unit | `data/tests/test_checklist_pipeline.py` | role-match |
| `data/nightly.sh` | shell orchestrator | file-I/O | self (DuckDB S3 pull/push pattern, lines 81–90) | exact |

---

## Pattern Assignments

### `data/taxa_pipeline.py` (new pipeline module, file-I/O + batch transform)

**Analog:** `data/checklist_pipeline.py` — same pattern: standalone module with module-level path constants, a `duckdb.connect` / `try` / `finally` / `con.close()` frame, `CREATE OR REPLACE TABLE`, and a `print(f"... {count} rows")` progress line. `geographies_pipeline.py` supplies the HTTP streaming + sidecar caching sub-pattern.

**Module-level constants pattern** (`checklist_pipeline.py` lines 22–26):
```python
import os
from pathlib import Path

import duckdb

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
CHECKLIST_PATH = Path(__file__).parent / "checklists" / "wa_bee_checklist.tsv"
```

For `taxa_pipeline.py`, replace with:
```python
import json
import os
from pathlib import Path

import duckdb
import requests

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
RAW_DIR = Path(__file__).parent / "raw"
TAXA_URL = "https://inaturalist-open-data.s3.amazonaws.com/taxa.csv.gz"
TAXA_PATH = RAW_DIR / "taxa.csv.gz"
TAXA_CACHE_PATH = RAW_DIR / "taxa_cache.json"
ANTHOPHILA_ID = 630955
```

**HTTP download with streaming + sidecar caching pattern** (`geographies_pipeline.py` lines 40–80):
```python
def _download(name: str, url: str) -> Path:
    CACHE_DIR.mkdir(exist_ok=True)
    dest = CACHE_DIR / f"{name}.zip"
    url_marker = dest.with_suffix(".zip.url")
    if dest.exists():
        cached_url = url_marker.read_text().strip() if url_marker.exists() else None
        if cached_url == url:
            print(f"  Using cached {dest}")  # noqa: T201
            return dest
        ...
    tmp = dest.with_suffix(".tmp")
    ...
    resp = requests.get(url, headers=headers, stream=True, timeout=30)
    ...
    with open(tmp, mode) as f:
        for chunk in resp.iter_content(chunk_size=1024 * 1024):
            f.write(chunk)
```

For `download_taxa_csv()`, adapt to ETag/Last-Modified instead of URL-sidecar, following the same atomic tmp-then-rename write pattern. The RESEARCH.md Pattern 1 provides the exact implementation verified against the live endpoint.

**DuckDB connect / try / finally pattern** (`checklist_pipeline.py` lines 126–202):
```python
def load_checklist() -> None:
    con = duckdb.connect(DB_PATH)
    try:
        con.execute("CREATE SCHEMA IF NOT EXISTS checklist_data")
        ...
        con.execute("""
            CREATE OR REPLACE TABLE checklist_data.species (
                scientificName VARCHAR PRIMARY KEY,
                ...
            )
        """)
        con.executemany("INSERT INTO checklist_data.species VALUES (...)", rows)
        count = con.execute("SELECT count(*) FROM checklist_data.species").fetchone()[0]
        print(f"checklist: {count} species, ...")  # noqa: T201
    finally:
        con.close()
```

For `load_taxon_lineage_extended()`, use the same frame with `db_path: str | None = None` parameter (matching the pattern in `inaturalist_pipeline.py` lines 184–276), defaulting to `DB_PATH`. Use `CREATE OR REPLACE TABLE` (not `CREATE TABLE IF NOT EXISTS` — full refresh from CSV every run).

**DuckDB read_csv with gzip + PIVOT pattern** (RESEARCH.md Pattern 2, verified):
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
    self_rows AS (
        SELECT taxon_id AS target_taxon_id, rank, name
        FROM all_active_bees
        WHERE rank IN ('family','subfamily','tribe','genus','subgenus')
    ),
    all_rows AS (SELECT * FROM ancestor_rows UNION ALL SELECT * FROM self_rows)
    PIVOT all_rows
        ON rank IN ('family','subfamily','tribe','genus','subgenus')
        USING first(name)
        GROUP BY target_taxon_id
""", [str(TAXA_PATH)])
```

**CRITICAL:** The PIVOT produces `target_taxon_id` as the key column. The final table needs `taxon_id`. Wrap the PIVOT in a CTE and rename: `SELECT target_taxon_id AS taxon_id, family, subfamily, tribe, genus, subgenus FROM pivoted`.

**Progress print pattern** (consistent with all pipeline modules):
```python
count = con.execute(
    "SELECT count(*) FROM inaturalist_data.taxon_lineage_extended"
).fetchone()[0]
print(f"taxon_lineage_extended: {count} rows")  # noqa: T201
```

---

### `data/inaturalist_pipeline.py` (deletion of `enrich_taxon_lineage_extended`)

**What to delete** (lines 180–276):
- `TARGET_RANKS` constant (line 181)
- `enrich_taxon_lineage_extended()` function (lines 184–276)

**After deletion,** `run.py`'s import `from inaturalist_pipeline import enrich_taxon_lineage_extended` (line 30) also breaks — that import must be removed simultaneously (see `run.py` entry below).

The remaining file structure (imports, `_inat_get_with_retry`, `_transform`, `DEFAULT_FIELDS`, `inaturalist_source`, `load_observations`, `if __name__ == "__main__"`) is unchanged.

---

### `data/waba_pipeline.py` (deletion of `enrich_taxon_lineage` + its call)

**Two deletions required:**

1. The function body at lines 109–160 (`enrich_taxon_lineage`).
2. The call at line 184: `enrich_taxon_lineage(DB_PATH)` inside `load_observations`. Removing the function without removing the call causes a silent runtime error (NameError at execution, not import time — the function is called, not imported externally).

The `load_observations` function tail (lines 163–184) becomes:
```python
def load_observations(full_reload: bool = False) -> None:
    pipeline = dlt.pipeline(...)
    ...
    load_info = pipeline.run(source)
    print(load_info)  # noqa: T201
    load_info.raise_on_failed_jobs()
    # enrich_taxon_lineage(DB_PATH) <-- DELETE THIS LINE
```

---

### `data/run.py` (STEPS modification)

**Current STEPS list** (lines 79–98) — two changes:

1. **Remove import** (line 30): `from inaturalist_pipeline import enrich_taxon_lineage_extended`
2. **Add import** at the top import block: `from taxa_pipeline import download_taxa_csv, load_taxon_lineage_extended`
3. **Replace STEPS entry** (line 88):
   ```python
   # Before:
   ("taxon-lineage-extended", enrich_taxon_lineage_extended),

   # After (two entries; taxa-download must precede taxon-lineage-extended):
   ("taxa-download", download_taxa_csv),
   ("taxon-lineage-extended", load_taxon_lineage_extended),
   ```

**STEPS ordering invariant** (from `run.py` docstring + existing ordering): `taxa-download` must come before `taxon-lineage-extended`. Both should replace the single current `taxon-lineage-extended` entry at line 88 — no other STEPS reordering needed.

---

### `data/dbt/models/staging/stg_waba__taxon_lineage.sql` (rewrite, D-01)

**Current file** (full file, 9 lines):
```sql
-- Wraps source('inaturalist_waba_data', 'taxon_lineage').
-- Used by int_specimen_obs_base (Plan 03) via:
--   LEFT JOIN taxon_lineage tl ON tl.taxon_id = waba.taxon__id
-- Provides genus and family columns for the specimen_inat_genus / specimen_inat_family
-- fields of the specimen_obs_base CTE (export.py:114-115).
{{ config(materialized='view') }}

SELECT *
FROM {{ source('inaturalist_waba_data', 'taxon_lineage') }}
```

**Analog for ref() pattern** (`stg_inat__taxon_lineage_extended.sql`, full file):
```sql
{{ config(materialized='view') }}

SELECT *
FROM {{ source('inaturalist_data', 'taxon_lineage_extended') }}
```

**Rewritten file** (per D-01 — `ref()` replacing `source()`):
```sql
-- Rewritten Phase 110 D-01: was source('inaturalist_waba_data','taxon_lineage');
-- delegates to stg_inat__taxon_lineage_extended, selecting the 3 cols
-- that int_specimen_obs_base consumes (taxon_id, genus, family).
{{ config(materialized='view') }}

SELECT taxon_id, genus, family
FROM {{ ref('stg_inat__taxon_lineage_extended') }}
```

**Why `SELECT taxon_id, genus, family` not `SELECT *`:** `stg_inat__taxon_lineage_extended` has 6 columns (taxon_id, family, subfamily, tribe, genus, subgenus). `int_specimen_obs_base` only JOINs on taxon_id and projects genus + family. Selecting all 6 is harmless but the 3-column projection documents the contract explicitly (D-01 intent).

---

### `data/dbt/models/sources.yml` (remove inaturalist_waba_data.taxon_lineage, D-02)

**Current file** (lines 18–24 — the block to remove):
```yaml
  - name: inaturalist_waba_data
    schema: inaturalist_waba_data
    tables:
      - name: observations
      - name: observations__ofvs
      - name: taxon_lineage          # <-- REMOVE THIS LINE
```

After removal, `inaturalist_waba_data` source retains `observations` and `observations__ofvs` only.

---

### `data/tests/test_taxon_lineage_extended.py` and `data/tests/test_taxon_lineage.py` (DELETE)

Both files test functions being deleted. Disposition: **delete both files.** The dbt schema tests in `stg_inat__taxon_lineage_extended`'s `schema.yml` enforce `not_null` + `unique` on `taxon_id`. The new `test_taxa_pipeline.py` covers the replacement logic.

Also update `data/tests/conftest.py`: the `_zero_inat_pacing` autouse fixture (lines 567–588) patches `_INAT_PACE_SECONDS` on `inaturalist_pipeline` — this can remain (the function and constant still exist after deleting `enrich_taxon_lineage_extended`; only the enricher is removed). The `inaturalist_waba_data.taxon_lineage` table seeded in `conftest.py` lines 110–114 can remain for now (the session fixture seed is harmless — the table won't exist in production DuckDB after Phase 110, but the test fixture creates it explicitly).

---

### `data/tests/test_taxa_pipeline.py` (new test file)

**Analog:** `data/tests/test_checklist_pipeline.py` — same isolation pattern: `tmp_path`, `monkeypatch.setenv("DB_PATH", ...)`, `importlib.reload(module)`, isolated DuckDB, `try` / `finally` / `con.close()`.

**Fixture pattern** (`test_checklist_pipeline.py` lines 17–43):
```python
@pytest.fixture
def checklist_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "checklist.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)
    import importlib
    import checklist_pipeline
    importlib.reload(checklist_pipeline)
    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute("CREATE TABLE ecdysis_data.occurrences (scientific_name VARCHAR)")
    con.close()
    monkeypatch.setattr(checklist_pipeline, "SYNONYMS_PATH", tmp_path / "...")
    return db_path, checklist_pipeline
```

For `test_taxa_pipeline.py`, the fixture should:
1. Set `DB_PATH` env var to tmp DuckDB path
2. Redirect `TAXA_PATH` and `TAXA_CACHE_PATH` to `tmp_path` (via `monkeypatch.setattr(taxa_pipeline, "TAXA_PATH", ...)`)
3. Create a mini `taxa.csv.gz` fixture inline (5–10 rows, valid Anthophila lineage) for ancestry walk tests
4. Use `unittest.mock.patch` for HTTP layer in download tests

**Mini CSV fixture pattern** (inline in test, analogous to test_checklist_pipeline.py's reliance on the real TSV file at `data/checklists/`):
```python
import gzip
import io

MINI_TAXA_TSV = (
    "taxon_id\tancestry\trank_level\trank\tname\tactive\n"
    "630955\t48460/1/47120/372739/47158/184884/47219\t57\tsuperfamily\tAnthophila\ttrue\n"
    "52775\t48460/1/47120/372739/47158/184884/47219/630955\t30\tfamily\tApidae\ttrue\n"
    "84734\t48460/1/47120/372739/47158/184884/47219/630955/52775\t20\tgenus\tBombus\ttrue\n"
    "52776\t48460/1/47120/372739/47158/184884/47219/630955/52775/84734\t10\tspecies\tBombus melanopygus\ttrue\n"
)

@pytest.fixture
def mini_taxa_gz(tmp_path):
    path = tmp_path / "taxa.csv.gz"
    with gzip.open(path, "wb") as f:
        f.write(MINI_TAXA_TSV.encode())
    return path
```

**Test skeleton for ETag caching** (pattern from `geographies_pipeline.py` logic + RESEARCH.md Pattern 1):
```python
from unittest.mock import patch, MagicMock

def test_download_uses_304(tmp_path, monkeypatch):
    import importlib
    import taxa_pipeline
    importlib.reload(taxa_pipeline)
    monkeypatch.setattr(taxa_pipeline, "TAXA_PATH", tmp_path / "taxa.csv.gz")
    monkeypatch.setattr(taxa_pipeline, "TAXA_CACHE_PATH", tmp_path / "taxa_cache.json")

    # Pre-create file + sidecar so conditional branch fires
    (tmp_path / "taxa.csv.gz").write_bytes(b"fake")
    (tmp_path / "taxa_cache.json").write_text('{"etag": "abc", "last_modified": "Mon, 27 Apr 2026 12:48:16 GMT"}')

    mock_resp = MagicMock()
    mock_resp.status_code = 304
    with patch("taxa_pipeline.requests.get", return_value=mock_resp) as mock_get:
        taxa_pipeline.download_taxa_csv()
    # Assert If-None-Match header was sent
    _, kwargs = mock_get.call_args
    assert kwargs["headers"]["If-None-Match"] == "abc"
    # Assert file unchanged (304 means skip write)
    assert (tmp_path / "taxa.csv.gz").read_bytes() == b"fake"
```

**Test skeleton for ancestry walk schema** (pattern from `test_checklist_pipeline.py`):
```python
def test_lineage_schema(tmp_path, monkeypatch, mini_taxa_gz):
    import importlib
    import taxa_pipeline
    importlib.reload(taxa_pipeline)
    db_path = str(tmp_path / "test.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)
    monkeypatch.setattr(taxa_pipeline, "TAXA_PATH", mini_taxa_gz)

    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA inaturalist_data")
    con.close()

    taxa_pipeline.load_taxon_lineage_extended()

    con = duckdb.connect(db_path, read_only=True)
    try:
        cols = [r[0] for r in con.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema='inaturalist_data' AND table_name='taxon_lineage_extended' "
            "ORDER BY ordinal_position"
        ).fetchall()]
    finally:
        con.close()
    assert cols == ["taxon_id", "family", "subfamily", "tribe", "genus", "subgenus"]
```

---

### `data/nightly.sh` (S3 sync for taxa.csv.gz, TAX-04)

**Analog:** The existing DuckDB pull/push pattern (lines 81–90). Copy structure verbatim, adapting paths and keys.

**Existing DuckDB EXIT trap** (line 81):
```bash
trap 'if [[ -f "$DB_PATH" ]]; then echo "--- backing up DuckDB (trap) --- sha256=$(_hash "$DB_PATH")"; aws --profile "$AWS_PROFILE" s3 cp --no-progress "$DB_PATH" "s3://$BUCKET/$DB_S3_KEY" || true; fi' EXIT
```

**Existing DuckDB pull** (lines 84–90):
```bash
echo "--- pulling DuckDB from S3 ---"
_t0=$(date +%s)
if ! aws --profile "$AWS_PROFILE" s3 cp --no-progress "s3://$BUCKET/$DB_S3_KEY" "$DB_PATH" 2>/dev/null; then
    echo "No existing DuckDB in S3 (first run), starting fresh."
else
    echo "sha256=$(_hash "$DB_PATH") ($(_elapsed $_t0))"
fi
```

**New variable declarations to add** (in variable block alongside `DB_S3_KEY`, line 38):
```bash
TAXA_S3_KEY="raw/taxa.csv.gz"
TAXA_CACHE_S3_KEY="raw/taxa_cache.json"
TAXA_PATH="$SCRIPT_DIR/raw/taxa.csv.gz"
TAXA_CACHE_PATH="$SCRIPT_DIR/raw/taxa_cache.json"
```

**New pull block** (after DuckDB pull, before "running pipelines" section at line 92):
```bash
echo "--- pulling taxa.csv.gz from S3 ---"
if ! aws --profile "$AWS_PROFILE" s3 cp --no-progress \
    "s3://$BUCKET/$TAXA_S3_KEY" "$TAXA_PATH" 2>/dev/null; then
    echo "No cached taxa.csv.gz in S3 (first run or expired), will download from iNat."
fi
# Pull sidecar alongside archive so ETag conditional GET fires on next run
aws --profile "$AWS_PROFILE" s3 cp --no-progress \
    "s3://$BUCKET/$TAXA_CACHE_S3_KEY" "$TAXA_CACHE_PATH" 2>/dev/null || true
```

**EXIT trap extension** (extend the existing trap, line 81, to also push taxa files):
```bash
trap '
if [[ -f "$DB_PATH" ]]; then
    echo "--- backing up DuckDB (trap) --- sha256=$(_hash "$DB_PATH")"
    aws --profile "$AWS_PROFILE" s3 cp --no-progress "$DB_PATH" "s3://$BUCKET/$DB_S3_KEY" || true
fi
if [[ -f "$TAXA_PATH" ]]; then
    aws --profile "$AWS_PROFILE" s3 cp --no-progress "$TAXA_PATH" "s3://$BUCKET/$TAXA_S3_KEY" || true
fi
if [[ -f "$TAXA_CACHE_PATH" ]]; then
    aws --profile "$AWS_PROFILE" s3 cp --no-progress "$TAXA_CACHE_PATH" "s3://$BUCKET/$TAXA_CACHE_S3_KEY" || true
fi
' EXIT
```

---

## Shared Patterns

### DuckDB connect / try / finally
**Source:** `data/checklist_pipeline.py` lines 126–202 and `data/inaturalist_pipeline.py` lines 203–276
**Apply to:** `taxa_pipeline.load_taxon_lineage_extended`
```python
con = duckdb.connect(db_path)
try:
    ...
finally:
    con.close()
```

### Module-level DB_PATH with env override
**Source:** All pipeline modules (e.g., `checklist_pipeline.py` line 22, `waba_pipeline.py` line 10)
**Apply to:** `taxa_pipeline.py`
```python
DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
```

### Progress print with row count
**Source:** All pipeline modules
**Apply to:** `taxa_pipeline.load_taxon_lineage_extended`, `taxa_pipeline.download_taxa_csv`
```python
print(f"taxa.csv.gz: downloaded {size_mb:.1f} MB")  # noqa: T201
print(f"taxon_lineage_extended: {count} rows")       # noqa: T201
```

### Atomic file write (tmp then rename)
**Source:** `data/geographies_pipeline.py` lines 78–84 (tmp suffix pattern)
**Apply to:** `taxa_pipeline.download_taxa_csv`
```python
tmp_path = TAXA_PATH.with_suffix(".gz.tmp")
with open(tmp_path, "wb") as f:
    for chunk in resp.iter_content(chunk_size=1024 * 1024):
        f.write(chunk)
tmp_path.rename(TAXA_PATH)
```

### Test isolation: monkeypatch + importlib.reload
**Source:** `data/tests/test_checklist_pipeline.py` lines 17–43, `data/tests/test_taxon_lineage_extended.py` lines 21–59
**Apply to:** `data/tests/test_taxa_pipeline.py` — all fixtures
```python
@pytest.fixture
def taxa_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "taxa.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)
    import importlib
    import taxa_pipeline
    importlib.reload(taxa_pipeline)
    monkeypatch.setattr(taxa_pipeline, "TAXA_PATH", tmp_path / "taxa.csv.gz")
    monkeypatch.setattr(taxa_pipeline, "TAXA_CACHE_PATH", tmp_path / "taxa_cache.json")
    return db_path, taxa_pipeline
```

### dbt ref() for staging-to-staging view
**Source:** All dbt intermediate models (e.g., `int_specimen_obs_base.sql`, `int_species_universe.sql`)
**Apply to:** `stg_waba__taxon_lineage.sql` rewrite
```sql
FROM {{ ref('stg_inat__taxon_lineage_extended') }}
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `data/raw/taxa.csv.gz` | data artifact | file-I/O | No existing pipeline module downloads a gzip-compressed TSV from a public S3 bucket with ETag caching — geographies_pipeline is closest but uses URL-sidecar caching, not ETag |

---

## Critical Implementation Notes (from RESEARCH.md anti-patterns)

1. **`active = 'true'` not `active = true`:** The `active` column in taxa.csv.gz is a string; DuckDB will accept `'true'` when the column is declared `VARCHAR`.
2. **Include self in ancestry walk:** A genus taxon does not list itself in its own ancestry string. The `UNION ALL self_rows` arm is mandatory.
3. **Anthophila filter uses anchored LIKE:** `LIKE '%/630955/%' OR LIKE '%/630955'` not `LIKE '%630955%'` (would false-match `1630955`).
4. **PIVOT column rename:** Wrap PIVOT output in a CTE and `SELECT target_taxon_id AS taxon_id, ...` for the final table.
5. **ETag sidecar must be synced:** Both `taxa.csv.gz` and `taxa_cache.json` must round-trip through S3 or every nightly run re-downloads 37MB.
6. **run.py import must be updated:** Remove `from inaturalist_pipeline import enrich_taxon_lineage_extended`; add `from taxa_pipeline import download_taxa_csv, load_taxon_lineage_extended`.
7. **waba_pipeline.py call site:** Delete both the function body (lines 109–160) AND the call `enrich_taxon_lineage(DB_PATH)` at line 184 of `load_observations`.

---

## Metadata

**Analog search scope:** `data/` (pipeline modules), `data/tests/` (test modules), `data/dbt/models/` (dbt models)
**Files scanned:** `inaturalist_pipeline.py`, `waba_pipeline.py`, `checklist_pipeline.py`, `geographies_pipeline.py`, `run.py`, `nightly.sh`, `stg_inat__taxon_lineage_extended.sql`, `stg_waba__taxon_lineage.sql`, `sources.yml`, `tests/conftest.py`, `tests/test_checklist_pipeline.py`, `tests/test_taxon_lineage_extended.py`, `tests/test_taxon_lineage.py`, `data/.gitignore`
**Pattern extraction date:** 2026-05-23
