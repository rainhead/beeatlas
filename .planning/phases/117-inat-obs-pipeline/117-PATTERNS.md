# Phase 117: iNat Obs Pipeline - Pattern Map

**Mapped:** 2026-05-25
**Files analyzed:** 5 new/modified files
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/inat_obs_pipeline.py` | service | file-I/O + CRUD | `data/checklist_pipeline.py` | exact |
| `data/tests/test_inat_obs_pipeline.py` | test | batch | `data/tests/test_checklist_pipeline.py` | exact |
| `data/run.py` | config | batch | `data/run.py` (self) | self-modification |
| `data/nightly.sh` | config | file-I/O | `data/nightly.sh` (self) | self-modification |
| `data/raw/inat_expert_obs.csv` | config | file-I/O | n/a — committed data file | n/a |

---

## Pattern Assignments

### `data/inat_obs_pipeline.py` (service, file-I/O + CRUD)

**Analog:** `data/checklist_pipeline.py`

**Imports pattern** (`data/checklist_pipeline.py` lines 1-20):
```python
"""Phase 76 checklist loader.

Reads ... and writes:
  - checklist_data.species ...

Both tables use CREATE OR REPLACE — full refresh on every run. No dlt cursor.

Phase 76 / D-01, D-02, D-04, D-05. ...
"""

import csv
import os
from pathlib import Path

import duckdb

from canonical_name import canonicalize

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
CHECKLIST_PATH = Path(__file__).parent / "checklists" / "wa_bee_checklist.tsv"
```

Apply: module-level constants use `os.environ.get("DB_PATH", ...)` and `os.environ.get("EXPORT_DIR", ...)`. Path constants use `Path(__file__).parent / "raw" / "inat_expert_obs.csv"`.

**Schema creation + idempotency pattern** (`data/checklist_pipeline.py` lines 165-170 and 203-220):
```python
def load_checklist() -> None:
    con = duckdb.connect(DB_PATH)
    try:
        con.execute("CREATE SCHEMA IF NOT EXISTS checklist_data")  # guard for first run

        # ... CSV read loop accumulating `rows: list[tuple]` ...

        con.execute("""
            CREATE OR REPLACE TABLE checklist_data.species (
                scientificName VARCHAR PRIMARY KEY,
                ...
                canonical_name VARCHAR NOT NULL
            )
        """)
        con.executemany(
            "INSERT INTO checklist_data.species VALUES (?, ?, ...)",
            species_rows,
        )
    finally:
        con.close()
```

Apply: `CREATE SCHEMA IF NOT EXISTS inat_obs_data` before any table operation. Use `CREATE OR REPLACE TABLE` for full-refresh semantics.

**CSV row iteration + canonicalize pattern** (`data/checklist_pipeline.py` lines 172-201):
```python
with CHECKLIST_PATH.open(newline="") as f:
    reader = csv.DictReader(f, delimiter="\t")
    for row in reader:
        sci = (row.get("species") or "").strip()
        ...
        species_rows.append((
            sci,
            ...
            canonicalize(sci),          # canonical_name (D-04)
        ))
```

Apply: use `csv.DictReader` (not pandas or DuckDB `read_csv_auto`). Use `.get()` with `or None` fallback for optional fields. Call `canonicalize()` inline in the tuple construction.

**Row count + print pattern** (`data/checklist_pipeline.py` lines 234-236):
```python
species_count = con.execute("SELECT count(*) FROM checklist_data.species").fetchone()[0]
sc_count = con.execute("SELECT count(*) FROM checklist_data.species_counties").fetchone()[0]
print(f"checklist: {species_count} species, {sc_count} county records")  # noqa: T201
```

Apply: print row count and dedup count after load, with `# noqa: T201` comment.

**COPY TO PARQUET pattern** — follows `_EXPORT_DIR` env-driven pattern from `feeds.py` / `places_export.py`. The `checklist_pipeline.py` does not write parquet directly (dbt does it), but the `_run_dbt_build()` function in `run.py` (lines 73-79) shows the `_EXPORT_DIR.mkdir(parents=True, exist_ok=True)` + copy pattern. Use:
```python
_EXPORT_DIR.mkdir(parents=True, exist_ok=True)
out_path = _EXPORT_DIR / "inat_obs.parquet"
con.execute(
    f"COPY inat_obs_data.observations TO '{out_path}' (FORMAT PARQUET, CODEC SNAPPY)"
)
print(f"  inat_obs.parquet: {out_path.stat().st_size:,} bytes")  # noqa: T201
```

**Dedup helper function pattern** — new private function, following the `_update_occurrences_canonical_name` helper in `checklist_pipeline.py` (lines 30-62) which takes `con` as argument and encapsulates a distinct concern:
```python
def _load_excluded_ids(con: duckdb.DuckDBPyConnection) -> set[int]:
    """Return set of iNat obs IDs already represented as Ecdysis specimens."""
    try:
        rows = con.execute("""
            SELECT DISTINCT CAST(specimen_observation_id AS BIGINT)
            FROM dbt_sandbox.int_waba_link
            WHERE specimen_observation_id IS NOT NULL
        """).fetchall()
    except duckdb.CatalogException:
        # dbt_sandbox absent on first-ever run; query raw tables
        rows = con.execute("""
            SELECT DISTINCT waba.id
            FROM inaturalist_waba_data.observations waba
            JOIN inaturalist_waba_data.observations__ofvs ofv
                ON ofv._dlt_root_id = waba._dlt_id
            WHERE ofv.field_id = 18116 AND ofv.value != '' AND ofv.value IS NOT NULL
        """).fetchall()
    return {r[0] for r in rows}
```

---

### `data/tests/test_inat_obs_pipeline.py` (test, batch)

**Analog:** `data/tests/test_checklist_pipeline.py`

**Isolated DB fixture pattern** (`data/tests/test_checklist_pipeline.py` lines 17-43):
```python
@pytest.fixture
def checklist_db(tmp_path, monkeypatch):
    """Isolated DuckDB. load_checklist() reads DB_PATH env at call time."""
    db_path = str(tmp_path / "checklist.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)
    # Reload module so module-level DB_PATH constant picks up the patched env.
    import importlib
    import checklist_pipeline
    importlib.reload(checklist_pipeline)
    # Pre-create dependency schemas that production run.py guarantees run first.
    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute("CREATE TABLE ecdysis_data.occurrences (scientific_name VARCHAR)")
    con.close()
    # Redirect file paths to tmp so tests don't clobber repo files.
    monkeypatch.setattr(checklist_pipeline, "SYNONYMS_PATH", tmp_path / "...")
    return db_path, checklist_pipeline
```

Apply: fixture must `monkeypatch.setenv("DB_PATH", ...)`, `monkeypatch.setenv("EXPORT_DIR", ...)`, `importlib.reload(inat_obs_pipeline)`, `monkeypatch.setattr(inat_obs_pipeline, "CSV_PATH", ...)`, and pre-create `inaturalist_waba_data.observations` + `inaturalist_waba_data.observations__ofvs` tables so the dedup query has something to query.

**Schema assertion pattern** (`data/tests/test_checklist_pipeline.py` lines 46-73):
```python
def test_load_checklist_creates_species_table_with_expected_schema(checklist_db):
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        cols = [
            row[0]
            for row in con.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='checklist_data' AND table_name='species' "
                "ORDER BY ordinal_position"
            ).fetchall()
        ]
    finally:
        con.close()
    assert cols == ["scientificName", "family", ...]
```

Apply: use `information_schema.columns` query with `table_schema='inat_obs_data'` and `table_name='observations'` to assert all 12 column names in order.

**Non-null assertion pattern** (`data/tests/test_checklist_pipeline.py` lines 76-92):
```python
def test_load_checklist_populates_species_rows(checklist_db):
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        n_null = con.execute(
            "SELECT count(*) FROM checklist_data.species WHERE canonical_name IS NULL"
        ).fetchone()[0]
    finally:
        con.close()
    assert n_null == 0, "every row must have canonical_name populated (D-04)"
```

Apply directly for `test_canonical_name_non_null`: assert `canonical_name IS NULL AND scientific_name IS NOT NULL` count equals 0.

**Dedup test approach** — seed a known `obs_id` into `inaturalist_waba_data.observations__ofvs` with `field_id=18116`, include the same ID in the test CSV, run `load_inat_obs()`, then assert the ID is absent from `inat_obs_data.observations`. Mirror the waba seed pattern from `data/tests/conftest.py` lines 244-258.

---

### `data/run.py` (config, batch — self-modification)

**Analog:** `data/run.py` itself (lines 82-102)

**STEPS list pattern** (`data/run.py` lines 30-102):
```python
from checklist_pipeline import load_checklist
# ... other imports ...

STEPS: list[tuple[str, Callable]] = [
    ("ecdysis", load_ecdysis),
    ("ecdysis-links", load_links),
    ("inaturalist", load_inaturalist_observations),
    ("waba", load_waba_observations),
    ("projects", load_projects),
    ("anti-entropy", run_anti_entropy),
    ("checklist", load_checklist),
    ...
    ("places-load", load_places_step),
    ("dbt-build", _run_dbt_build),   # <-- inat-obs must come BEFORE this
    ...
]
```

Apply: add `from inat_obs_pipeline import load_inat_obs` to the import block (lines 30-46). Add `("inat-obs", load_inat_obs)` to STEPS between `("places-load", load_places_step)` and `("dbt-build", _run_dbt_build)` (after ecdysis/waba have run, before dbt). Also update the module docstring's pipeline order comment (lines 8-12).

---

### `data/nightly.sh` (config, file-I/O — self-modification)

**Analog:** `data/nightly.sh` itself (lines 138-171)

**`_upload_hashed` call pattern** (`data/nightly.sh` lines 150-157):
```bash
occ_name=$(_upload_hashed "$EXPORT_DIR/occurrences.parquet" "occurrences")
species_name=$(_upload_hashed "$EXPORT_DIR/species.json" "species")
...
checklist_name=$(_upload_hashed "$EXPORT_DIR/checklist.parquet" "checklist")
```

Apply: add after `checklist_name=` line:
```bash
inat_obs_name=$(_upload_hashed "$EXPORT_DIR/inat_obs.parquet" "inat_obs")
```

**manifest.json heredoc pattern** (`data/nightly.sh` lines 159-171):
```bash
cat > "$EXPORT_DIR/manifest.json" <<JSON
{
  "occurrences": "$occ_name",
  "species": "$species_name",
  "seasonality": "$seasonality_name",
  "counties": "$counties_name",
  "ecoregions": "$ecoregions_name",
  "places": "$places_name",
  "places_meta": "$places_meta_name",
  "checklist": "$checklist_name",
  "generated_at": "$(_ts)"
}
JSON
```

Apply: add `"inat_obs": "$inat_obs_name",` before `"generated_at"` line. Key name is `"inat_obs"` (lowercase snake_case, matches parquet filename stem per established convention).

---

## Shared Patterns

### EXPORT_DIR Convention
**Source:** `data/run.py` lines 51-54
**Apply to:** `data/inat_obs_pipeline.py`
```python
_EXPORT_DIR = Path(os.environ.get(
    'EXPORT_DIR',
    str(Path(__file__).parent.parent / 'public' / 'data'),
))
```
Default is `public/data/` at repo root. Nightly sets it to `/tmp/beeatlas-export`.

### DB_PATH Convention
**Source:** `data/checklist_pipeline.py` line 22
**Apply to:** `data/inat_obs_pipeline.py`
```python
DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
```

### `try/finally con.close()` Pattern
**Source:** `data/checklist_pipeline.py` lines 168-242
**Apply to:** `data/inat_obs_pipeline.py`
```python
con = duckdb.connect(DB_PATH)
try:
    # all work here
finally:
    con.close()
```
Never omit the finally block — DuckDB connections hold file locks.

### `importlib.reload()` in Test Fixtures
**Source:** `data/tests/test_checklist_pipeline.py` lines 29-31
**Apply to:** `data/tests/test_inat_obs_pipeline.py`
```python
import importlib
import inat_obs_pipeline
importlib.reload(inat_obs_pipeline)
```
Required because `DB_PATH` and `_EXPORT_DIR` are module-level constants evaluated at import time. The monkeypatch must set env vars before reload.

### `read_only=True` Connection in Test Assertions
**Source:** `data/tests/test_checklist_pipeline.py` lines 49-60
**Apply to:** all assertion blocks in `data/tests/test_inat_obs_pipeline.py`
```python
con = duckdb.connect(db_path, read_only=True)
try:
    cols = [...]
finally:
    con.close()
```

### `canonicalize()` Import and Usage
**Source:** `data/canonical_name.py`; used in `data/checklist_pipeline.py` line 20, 200
**Apply to:** `data/inat_obs_pipeline.py`
```python
from canonical_name import canonicalize
# ...
canonical_name=canonicalize(sci_name),
```
`canonicalize(None)` returns `None`. `canonicalize("")` returns `None`. Any non-empty string returns a non-null lowercase binomial or genus. Do not re-implement.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `data/raw/inat_expert_obs.csv` | data | file-I/O | Committed CSV data file; no code analog needed |

---

## Metadata

**Analog search scope:** `data/` directory — pipeline modules, test suite, nightly.sh
**Files scanned:** 6 (checklist_pipeline.py, run.py, nightly.sh, canonical_name.py, tests/test_checklist_pipeline.py, tests/conftest.py)
**Pattern extraction date:** 2026-05-25
