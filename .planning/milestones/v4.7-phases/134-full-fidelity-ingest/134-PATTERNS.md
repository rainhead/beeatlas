# Phase 134: Full-Fidelity Ingest - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 4 (1 new, 3 modified)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/checklists/checklist_records_full.csv` | data asset | file-I/O | `data/checklists/wa_bee_checklist_records.tsv` | role-match (different format/schema) |
| `data/checklist_pipeline.py` (extend in-place) | service | batch / file-I/O | `data/checklist_pipeline.py` — `_load_checklist_records()` (lines 127-162) | exact (same module, mirror the existing loader) |
| `data/tests/test_checklist_pipeline.py` (extend in-place) | test | CRUD | `data/tests/test_checklist_pipeline.py` — `checklist_db` fixture + idempotency test (lines 17-43, 161-179) | exact (same file, same fixture pattern) |
| `data/pyproject.toml` (extend in-place) | config | — | `data/pyproject.toml` lines 1-14 | exact (same file, append to `dependencies`) |

---

## Pattern Assignments

### `data/checklist_pipeline.py` — new `_load_checklist_records_full()` loader

**Analog:** `data/checklist_pipeline.py` — `_load_checklist_records()` (the old 4-col loader, left UNTOUCHED per D-10).

**Path constant pattern** (lines 22-24):
```python
DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
CHECKLIST_PATH = Path(__file__).parent / "checklists" / "wa_bee_checklist.tsv"
CHECKLIST_RECORDS_PATH = Path(__file__).parent / "checklists" / "wa_bee_checklist_records.tsv"
```
New constant follows the same form:
```python
CHECKLIST_RECORDS_FULL_PATH = Path(__file__).parent / "checklists" / "checklist_records_full.csv"
```

**Core loader pattern** (lines 127-162) — this is the direct template for the new loader:
```python
def _load_checklist_records(con: duckdb.DuckDBPyConnection) -> None:
    """Load individual occurrence records from wa_bee_checklist_records.tsv
    into checklist_data.checklist_records (scientificName, county, year, month).
    ...
    """
    records: list[tuple] = []
    with CHECKLIST_RECORDS_PATH.open(newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            sci = (row.get("species") or "").strip()
            cty = (row.get("county") or "").strip()
            yr_str = (row.get("year") or "").strip()
            mo_str = (row.get("month") or "").strip()
            if not sci:
                continue
            year = int(yr_str) if yr_str.isdigit() else None
            month = int(mo_str) if mo_str.isdigit() else None
            records.append((sci, cty, year, month))

    con.execute("""
        CREATE OR REPLACE TABLE checklist_data.checklist_records (
            scientificName VARCHAR,
            county VARCHAR,
            year BIGINT,
            month BIGINT
        )
    """)
    con.executemany(
        "INSERT INTO checklist_data.checklist_records VALUES (?, ?, ?, ?)",
        records,
    )
    count = con.execute("SELECT count(*) FROM checklist_data.checklist_records").fetchone()[0]
    print(f"checklist_records: {count} individual occurrence records loaded")  # noqa: T201
```

**New loader must mirror this exactly, with these differences:**
- CSV source (comma-delimited, not TSV): `csv.DictReader(f)` (no `delimiter=`)
- CSV header columns: `ObjectID, Family, Genus, Scientific Name, Locality, Latitude, Longitude, Date, recordedBy, County_join, x, y`
- Table name: `checklist_data.checklist_records_full`
- Schema: 12+ columns including `ObjectID BIGINT`, `family VARCHAR`, `genus VARCHAR`, `verbatim_name VARCHAR`, `locality VARCHAR`, `latitude DOUBLE`, `longitude DOUBLE`, `recordedBy VARCHAR`, `year BIGINT`, `month BIGINT`, `day BIGINT`, `date_quality VARCHAR`, `coord_flag VARCHAR`
- Python-side validation: coord_flag assignment + date parsing before `records.append()`
- Log breakdown of coord_flag reasons per D-04 (same `print(f"...")  # noqa: T201` convention)

**BUILD-OUTPUT logging convention** (lines 62, 121-124, 162, 236):
```python
print(f"checklist_records: {count} individual occurrence records loaded")  # noqa: T201
print(  # noqa: T201
    f"reconcile: {overrides_applied} synonym overrides applied; "
    f"{len(unmatched)} unmatched (warn-only); see {UNMATCHED_PATH.name}"
)
print(f"checklist: {species_count} species, {sc_count} county records")  # noqa: T201
```
Pattern: `print(f"...")  # noqa: T201` inline or as a call-with-parentheses for multi-line strings.
New loader logs two lines: one summary count and one per-reason coord breakdown.

**Entry point wiring** (lines 165-242) — new loader is called from `load_checklist()` alongside the existing `_load_checklist_records()`:
```python
def load_checklist() -> None:
    """..."""
    con = duckdb.connect(DB_PATH)
    try:
        con.execute("CREATE SCHEMA IF NOT EXISTS checklist_data")
        # ... existing species / species_counties loading ...
        _load_checklist_records(con)          # D-10: LEFT UNTOUCHED
        _load_checklist_records_full(con)     # NEW: append after existing call
        _update_occurrences_canonical_name(con)
        reconcile(con)
    finally:
        con.close()
```
The `finally: con.close()` block is invariant — single connection opened in `load_checklist()` and passed into all private helpers.

**`run.py` integration** (lines 84-91): `load_checklist` is already wired as the `"checklist"` STEPS entry — no `run.py` change needed since the new loader is called from inside `load_checklist()`.

---

### `data/tests/test_checklist_pipeline.py` — new tests for `_load_checklist_records_full`

**Analog:** `data/tests/test_checklist_pipeline.py` — `checklist_db` fixture + existing test functions.

**Isolated-DuckDB fixture** (lines 17-43):
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
    # Pre-create ecdysis_data.occurrences (mirrors prod ordering invariant).
    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute("CREATE TABLE ecdysis_data.occurrences (scientific_name VARCHAR)")
    con.close()
    # Redirect synonyms + unmatched paths to tmp so tests don't clobber repo files.
    monkeypatch.setattr(
        checklist_pipeline, "SYNONYMS_PATH", tmp_path / "checklist_synonyms.csv"
    )
    monkeypatch.setattr(
        checklist_pipeline, "UNMATCHED_PATH", tmp_path / "checklist_unmatched.csv"
    )
    return db_path, checklist_pipeline
```

New tests for the full loader also need to redirect `CHECKLIST_RECORDS_FULL_PATH` to a `tmp_path` CSV fixture, following the same `monkeypatch.setattr(checklist_pipeline, "CHECKLIST_RECORDS_FULL_PATH", ...)` pattern used for `SYNONYMS_PATH` and `UNMATCHED_PATH`.

**Schema assertion pattern** (lines 46-73):
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

**Row-count assertion pattern** (lines 76-93):
```python
def test_load_checklist_populates_species_rows(checklist_db):
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        n = con.execute("SELECT count(*) FROM checklist_data.species").fetchone()[0]
        n_null = con.execute(
            "SELECT count(*) FROM checklist_data.species WHERE canonical_name IS NULL"
        ).fetchone()[0]
    finally:
        con.close()
    assert n > 100, f"expected >100 distinct species, got {n}"
    assert n_null == 0, "every row must have canonical_name populated (D-04)"
```

**Idempotency test pattern** (lines 161-179):
```python
def test_load_checklist_is_idempotent(checklist_db):
    """CREATE OR REPLACE — running twice must not raise and must yield same row counts."""
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        n1 = con.execute("SELECT count(*) FROM checklist_data.species").fetchone()[0]
    finally:
        con.close()
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        n2 = con.execute("SELECT count(*) FROM checklist_data.species").fetchone()[0]
    finally:
        con.close()
    assert n1 == n2
```

New tests to add (all using `checklist_db` fixture + `monkeypatch.setattr` for `CHECKLIST_RECORDS_FULL_PATH`):
- `test_checklist_records_full_row_count` — assert ~50,646 rows from the real CSV (SC#1)
- `test_checklist_records_full_coord_flag_no_zero_valid` — assert zero rows with `coord_flag='valid'` and `(latitude=0 OR longitude=0)` (SC#2)
- `test_checklist_records_full_date_parsing_pre1900` — assert `1812-06-18` parses to `year=1812, month=6, day=18, date_quality='full'` (SC#3)
- `test_checklist_records_full_date_parsing_mdy` — assert a `M/D/YYYY` date like `6/14/1905` parses to `year=1905, month=6, day=14` (SC#3)
- `test_checklist_records_full_null_date_tagged_none` — assert empty-date rows have `date_quality='none'` and `year IS NULL` (SC#3)
- `test_checklist_records_full_is_idempotent` — two runs yield same row count (mirrors existing idempotency test)
- `test_checklist_records_full_schema` — assert exact column list via `information_schema.columns`

---

### `data/pyproject.toml` — add three new dependencies

**Analog:** `data/pyproject.toml` lines 1-14 (the file itself).

**Current dependencies block** (lines 1-14):
```toml
[project]
name = "beeatlas-data"
version = "0.1.0"
description = "dlt pipelines for Washington Bee Atlas data ingestion"
readme = "README.md"
requires-python = ">=3.14"
dependencies = [
    "dlt[duckdb]>=1.23.0",
    "duckdb>=1.4,<2",
    "pyarrow>=12",
    "requests",
    "beautifulsoup4",
    "boto3>=1.42.78",
]

[dependency-groups]
dev = [
    "pytest>=9.0.2",
    "dbt-duckdb==1.10.1",
]
```

Append to `dependencies` list (D-11):
```toml
    "dateparser",
    "pygbif",
    "rapidfuzz",
```

No version pins specified in CONTEXT.md; use bare names matching the existing `"requests"` and `"beautifulsoup4"` unpinned style. If `dateparser`'s `regex` wheel fails on 3.14 at `uv sync` time, surface as a SC#4 blocker (D-11 watch item).

---

### `data/checklists/checklist_records_full.csv` — committed source data file

**Analog:** `data/checklists/wa_bee_checklist_records.tsv` (same directory, same LFS tracking).

**LFS routing** (`.gitattributes` line 2):
```
*.csv filter=lfs diff=lfs merge=lfs -text
```
The `*.csv` glob already routes all CSV files through git-LFS. Committing `data/checklists/checklist_records_full.csv` requires no `.gitattributes` change — LFS tracking is automatic.

Source: `/home/peter/final_checklist_records.csv` (50,646 rows).
Header: `ObjectID, Family, Genus, Scientific Name, Locality, Latitude, Longitude, Date, recordedBy, County_join, x, y`.

---

## Shared Patterns

### `CREATE OR REPLACE TABLE` idempotency
**Source:** `data/checklist_pipeline.py` lines 149-156 (`_load_checklist_records`) and lines 203-217 (`load_checklist` species table)
**Apply to:** `checklist_records_full` table DDL
```python
con.execute("""
    CREATE OR REPLACE TABLE checklist_data.checklist_records (
        scientificName VARCHAR,
        county VARCHAR,
        year BIGINT,
        month BIGINT
    )
""")
```
Full refresh on every run — no incremental cursor, no UPSERT.

### `executemany` bulk insert
**Source:** `data/checklist_pipeline.py` lines 157-160
**Apply to:** `checklist_records_full` insert
```python
con.executemany(
    "INSERT INTO checklist_data.checklist_records VALUES (?, ?, ?, ?)",
    records,
)
```
Build `records: list[tuple]` in Python, then `executemany` in one call. Do NOT issue per-row `execute()`.

### `print(f"...")  # noqa: T201` build-output logging
**Source:** `data/checklist_pipeline.py` lines 62, 124, 162, 236
**Apply to:** new `_load_checklist_records_full()` summary + coord breakdown log lines
```python
print(f"checklist_records: {count} individual occurrence records loaded")  # noqa: T201
```
The `# noqa: T201` comment is mandatory — the linter flags bare `print` calls without it.

### `try/finally con.close()` connection lifecycle
**Source:** `data/checklist_pipeline.py` lines 168-242
**Apply to:** already handled in the existing `load_checklist()` — new loader receives `con` as a parameter, same as existing private helpers. No new connection management needed.

### `monkeypatch.setenv("DB_PATH", ...)` + `importlib.reload(checklist_pipeline)`
**Source:** `data/tests/test_checklist_pipeline.py` lines 25-30
**Apply to:** all new test functions (via the existing `checklist_db` fixture — no new fixture needed if tests reuse it)
```python
db_path = str(tmp_path / "checklist.duckdb")
monkeypatch.setenv("DB_PATH", db_path)
import importlib
import checklist_pipeline
importlib.reload(checklist_pipeline)
```
The reload is critical — `DB_PATH` is a module-level constant resolved at import time. Without reload, the monkeypatch has no effect.

---

## No Analog Found

None. All four files have direct analogs in the codebase.

---

## Metadata

**Analog search scope:** `data/checklist_pipeline.py`, `data/tests/test_checklist_pipeline.py`, `data/pyproject.toml`, `data/checklists/`, `.gitattributes`
**Files read:** 6
**Pattern extraction date:** 2026-06-04
