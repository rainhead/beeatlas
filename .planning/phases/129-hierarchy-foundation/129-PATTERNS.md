# Phase 129: Hierarchy Foundation - Pattern Map

**Mapped:** 2026-06-02
**Files analyzed:** 2 (both are modifications of existing files)
**Analogs found:** 2 / 2

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/sqlite_export.py` | pipeline transform | batch (DuckDB→SQLite) | `data/sqlite_export.py` itself (existing body) + `data/taxa_pipeline.py` | exact (self + role-match) |
| `data/tests/test_sqlite_export.py` | test | batch | `data/tests/test_sqlite_export.py` itself (existing 5 tests) | exact (self-extension) |

---

## Pattern Assignments

### `data/sqlite_export.py` — new `_build_taxon_hierarchy()` function

**Primary analog:** `data/sqlite_export.py` lines 25–49 (existing `generate_sqlite` body)
**Secondary analog:** `data/taxa_pipeline.py` lines 108–166 (`load_taxon_lineage_extended`)

---

#### Imports pattern (lines 1–17 of `sqlite_export.py`)

```python
import json
import os
import sqlite3 as _sqlite3
from pathlib import Path

import duckdb

_DBT_SANDBOX = Path(__file__).parent / "dbt" / "target" / "sandbox"
_EXPORT_DIR = Path(os.environ.get(
    "EXPORT_DIR",
    str(Path(__file__).parent.parent / "public" / "data"),
))
```

`DB_PATH` is also needed for PASS 3 (checklist → `canonical_to_taxon_id`). Pattern from `taxa_pipeline.py` line 20:

```python
DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
```

Add `DB_PATH` at module level in `sqlite_export.py` alongside the existing `_DBT_SANDBOX` and `_EXPORT_DIR` constants. `TAXA_PATH` is defined in `taxa_pipeline.py` (line 23) but `sqlite_export.py` will need its own reference:

```python
_TAXA_PATH = Path(__file__).parent / "raw" / "taxa.csv.gz"
DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
```

---

#### ATTACH pattern — how new tables get into `occurrences.db` (lines 40–48 of `sqlite_export.py`)

```python
con = duckdb.connect(":memory:")
try:
    con.execute("INSTALL sqlite; LOAD sqlite;")
    con.execute(f"ATTACH '{dst_db}' AS out (TYPE sqlite)")
    con.execute(
        f"CREATE TABLE out.occurrences AS SELECT * FROM read_parquet('{src_parquet}')"
    )
    con.execute("DETACH out")
finally:
    con.close()
```

`_build_taxon_hierarchy` receives the already-open `con` (with `out` already ATTACHed, `occurrences` already written). Its signature:

```python
def _build_taxon_hierarchy(con: duckdb.DuckDBPyConnection, dst_db: Path) -> None:
    """Append taxa (and optional taxa_closure) tables to already-ATTACHed occurrences.db."""
    # con already has ATTACH '...' AS out (TYPE sqlite)
    # occurrences table already written
    ...
```

The `DETACH out` call stays in `generate_sqlite` after `_build_taxon_hierarchy` returns.

---

#### Core PASS 1 pattern — Anthophila taxa from `taxa.csv.gz` (analog: `taxa_pipeline.py` lines 113–126)

```python
# taxa_pipeline.py: the Anthophila filter + active string guard
WITH all_active_bees AS (
    SELECT taxon_id, ancestry, rank, name
    FROM read_csv(?, delim='\t', header=true, compression='gzip',
                  columns={'taxon_id':'BIGINT','ancestry':'VARCHAR',
                           'rank_level':'INTEGER','rank':'VARCHAR',
                           'name':'VARCHAR','active':'VARCHAR'})
    WHERE active = 'true'
      AND (ancestry LIKE '%/630955/%' OR ancestry LIKE '%/630955'
           OR taxon_id = 630955)
)
```

PASS 1 for hierarchy adapts this with a rank filter and `lineage_path` extraction instead of an ancestry PIVOT. Key DuckDB SQL expression for `lineage_path` (from RESEARCH.md Pattern 2):

```sql
'/' || regexp_extract(
    ancestry || '/' || CAST(taxon_id AS VARCHAR),
    '(630955(?:/[0-9]+)*)$',
    1
) || '/' AS lineage_path
```

Full PASS 1 SQL target:

```sql
CREATE TABLE out.taxa AS
SELECT
    taxon_id,
    rank,
    name,
    '/' || regexp_extract(
        ancestry || '/' || CAST(taxon_id AS VARCHAR),
        '(630955(?:/[0-9]+)*)$',
        1
    ) || '/' AS lineage_path,
    1 AS is_anthophila
FROM read_csv(
    ?,
    delim=chr(9), header=true, compression='gzip',
    columns={
        taxon_id: BIGINT, ancestry: VARCHAR, rank_level: BIGINT,
        rank: VARCHAR, name: VARCHAR, active: VARCHAR
    }
)
WHERE active = 'true'
  AND (ancestry LIKE '%/630955/%' OR ancestry LIKE '%/630955' OR taxon_id = 630955)
  AND rank IN ('family', 'subfamily', 'tribe', 'genus', 'subgenus', 'complex', 'species')
```

Pass this as a parameterized query with `[str(_TAXA_PATH)]` — same pattern as `taxa_pipeline.py` line 161.

---

#### Core PASS 2 pattern — bycatch taxa (analog: `sqlite_export.py` lines 59–68, the `_sqlite3` block)

PASS 2 finds `taxon_id` values in `out.occurrences` not yet in `out.taxa` (the non-bee bycatch), then inserts them with `is_anthophila=0` and `lineage_path=NULL`:

```sql
INSERT OR IGNORE INTO out.taxa
SELECT
    taxon_id,
    rank,
    name,
    NULL AS lineage_path,
    0 AS is_anthophila
FROM read_csv(
    ?,
    delim=chr(9), header=true, compression='gzip',
    columns={taxon_id: BIGINT, ancestry: VARCHAR, rank_level: BIGINT,
             rank: VARCHAR, name: VARCHAR, active: VARCHAR}
)
WHERE taxon_id IN (
    SELECT DISTINCT taxon_id FROM out.occurrences
    WHERE taxon_id IS NOT NULL
      AND taxon_id NOT IN (SELECT taxon_id FROM out.taxa)
)
-- NOTE: No active='true' filter here (Pitfall 5 in RESEARCH.md)
```

---

#### Core PASS 3 pattern — checklist zero-occurrence species (analog: `taxa_pipeline.py` lines 108–162)

PASS 3 reads checklist canonical names, resolves them to `taxon_id` via `canonical_to_taxon_id` in `beeatlas.duckdb`, then loads those taxa from `taxa.csv.gz` if not already in `out.taxa`. Uses a second DuckDB connection to `beeatlas.duckdb`:

```python
# Pattern: open a second connection to beeatlas.duckdb for canonical_to_taxon_id
db_con = duckdb.connect(DB_PATH, read_only=True)
try:
    checklist_ids = db_con.execute("""
        SELECT DISTINCT c.taxon_id
        FROM read_parquet(?) cl
        JOIN inaturalist_data.canonical_to_taxon_id c
          ON c.canonical_name = cl.canonical_name
    """, [str(_DBT_SANDBOX / "checklist.parquet")]).fetchall()
finally:
    db_con.close()
```

Then insert those taxon_ids from `taxa.csv.gz` with `INSERT OR IGNORE INTO out.taxa` using the same `read_csv` pattern as PASS 1, filtered to `taxon_id IN (...)`.

---

#### Index creation pattern (analog: `sqlite_export.py` lines 59–68, the `_sqlite3.connect` block)

```python
# Existing pattern: use stdlib sqlite3 for post-export DDL
with _sqlite3.connect(dst_db) as idx_con:
    actual = {row[1] for row in idx_con.execute("PRAGMA table_info(occurrences)").fetchall()}
    # ... geo_blob construction ...
    idx_con.execute("CREATE TABLE geo_blob(data TEXT NOT NULL)")
    idx_con.execute("INSERT INTO geo_blob(data) VALUES (?)", (geo_json,))
```

Add index creation for `taxa` in the same `_sqlite3.connect` block (or a separate `with _sqlite3.connect(dst_db) as idx_con:` call inside `_build_taxon_hierarchy`):

```python
with _sqlite3.connect(dst_db) as idx_con:
    idx_con.execute("CREATE INDEX IF NOT EXISTS idx_taxa_lineage ON taxa(lineage_path)")
    idx_con.execute("CREATE INDEX IF NOT EXISTS idx_taxa_is_anthophila ON taxa(is_anthophila)")
```

---

#### Orphan assertion pattern (analog: error pattern in `taxa_pipeline.py` line 70–74)

`taxa_pipeline.py` raises `ValueError` for corrupted downloads:

```python
if TAXA_PATH.read_bytes()[:2] != b"\x1f\x8b":
    ...
    raise ValueError(
        f"taxa.csv.gz is not a GZIP stream after download ..."
    )
```

Orphan assertion follows the same `ValueError` hard-fail pattern (from RESEARCH.md Code Examples):

```python
def _assert_no_orphan_taxon_ids(db_path: Path) -> None:
    """Fail the pipeline if any non-null occurrence taxon_id has no taxa entry."""
    with _sqlite3.connect(db_path) as con:
        (count,) = con.execute(
            """
            SELECT COUNT(*) FROM occurrences
            WHERE taxon_id IS NOT NULL
              AND taxon_id NOT IN (SELECT taxon_id FROM taxa)
            """
        ).fetchone()
    if count > 0:
        raise ValueError(
            f"Hierarchy build incomplete: {count} occurrence taxon_id values "
            f"have no entry in taxa table."
        )
```

Call `_assert_no_orphan_taxon_ids(dst_db)` from `generate_sqlite()` after `_build_taxon_hierarchy` returns and before the `_sqlite3` index block.

---

#### `generate_sqlite` call-site integration

Extend the existing `generate_sqlite` function to call `_build_taxon_hierarchy` between the DETACH and the existing `_sqlite3` block:

```python
# After: con.execute("DETACH out")  (line 47)
# Before: the with _sqlite3.connect(dst_db) as idx_con: block (line 59)

_build_taxon_hierarchy(con, dst_db)   # <-- new call; con still open, re-ATTACHed inside
_assert_no_orphan_taxon_ids(dst_db)   # <-- new call; hard-fail gate

# Then the existing _sqlite3.connect block for geo_blob + index creation continues
```

---

### `data/tests/test_sqlite_export.py` — new hierarchy test functions

**Analog:** `data/tests/test_sqlite_export.py` lines 1–162 (the entire existing file)

---

#### Import/fixture pattern (lines 1–39)

```python
import sqlite3
from pathlib import Path

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq
import pytest
```

The existing `src_parquet` fixture (lines 26–39) produces a parquet with only 4 columns. The hierarchy tests need a richer fixture: a parquet with a `taxon_id` column (some bee, some bycatch, some NULL) plus a mini `taxa.csv.gz`-equivalent fixture.

New fixture pattern (extend the existing file, do not replace it):

```python
# Hierarchy fixture: mini taxa CSV rows (in-memory, written as gzip TSV to tmp_path)
TAXA_ROWS = [
    # taxon_id, ancestry, rank_level, rank, name, active
    (630955, "48460/1/47120/372739/47158/184884/47157", 33, "superfamily", "Anthophila", "true"),
    (47221,  "48460/1/47120/372739/47158/184884/47157/630955", 30, "family", "Apidae", "true"),
    (52775,  "48460/1/47120/372739/47158/184884/47157/630955/47221", 20, "genus", "Apis", "true"),
    (47219,  "48460/1/47120/372739/47158/184884/47157/630955/47221/52775", 10, "species", "Apis mellifera", "true"),
    # bycatch: Vespidae (non-bee)
    (52747,  "48460/1/47120/372739/47158/184884/47157", 30, "family", "Vespidae", "true"),
]

@pytest.fixture
def taxa_csv_gz(tmp_path: Path) -> Path:
    """Write a mini taxa.csv.gz fixture and return its path."""
    import gzip, csv, io
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter='\t')
    writer.writerow(["taxon_id", "ancestry", "rank_level", "rank", "name", "active"])
    for row in TAXA_ROWS:
        writer.writerow(row)
    gz_path = tmp_path / "taxa.csv.gz"
    with gzip.open(gz_path, 'wt') as f:
        f.write(buf.getvalue())
    return gz_path
```

Occurrence parquet must include a `taxon_id` column and at least one bycatch `taxon_id`:

```python
PARQUET_WITH_TAXON_ROWS = [
    # lat, lon, scientificName, year, taxon_id
    (47.5, -120.8, "Apis mellifera", 2024, 47219),   # bee
    (47.6, -121.0, "Vespula squamosa", 2023, 52747),  # bycatch
    (48.1, -122.3, "Bombus vosnesenskii", 2024, None), # NULL taxon_id (ok)
]

@pytest.fixture
def src_parquet_with_taxon(tmp_path: Path) -> Path:
    """Parquet fixture that includes a taxon_id column."""
    table = pa.table({
        "lat": pa.array([r[0] for r in PARQUET_WITH_TAXON_ROWS], type=pa.float64()),
        "lon": pa.array([r[1] for r in PARQUET_WITH_TAXON_ROWS], type=pa.float64()),
        "scientificName": pa.array([r[2] for r in PARQUET_WITH_TAXON_ROWS], type=pa.string()),
        "year": pa.array([r[3] for r in PARQUET_WITH_TAXON_ROWS], type=pa.int32()),
        "taxon_id": pa.array([r[4] for r in PARQUET_WITH_TAXON_ROWS], type=pa.int64()),
    })
    path = tmp_path / "occurrences_with_taxon.parquet"
    pq.write_table(table, path)
    return path
```

---

#### Test function pattern (analog: lines 48–75 — `test_creates_occurrences_table`, `test_row_count_matches`)

All new tests follow the same 4-line body pattern: call `generate_sqlite`, open `sqlite3.connect(dst)`, query, assert, close.

```python
def test_taxa_table_exists(src_parquet_with_taxon: Path, taxa_csv_gz: Path, tmp_path: Path) -> None:
    from sqlite_export import generate_sqlite

    dst = tmp_path / "occurrences.db"
    generate_sqlite(src_parquet_with_taxon, dst, taxa_path=taxa_csv_gz)  # taxa_path injected for test

    con = sqlite3.connect(dst)
    tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    con.close()
    assert "taxa" in tables, f"Expected 'taxa' table, got: {tables}"
```

`generate_sqlite` needs an optional `taxa_path` parameter (defaults to `_TAXA_PATH`) for testability. This follows the same overridability pattern as `monkeypatch.setattr(sqlite_export, "_DBT_SANDBOX", sandbox_dir)` in `test_main_uses_sandbox_and_export_dir` (lines 138–161).

```python
def test_zero_orphan_taxon_ids(src_parquet_with_taxon: Path, taxa_csv_gz: Path, tmp_path: Path) -> None:
    from sqlite_export import generate_sqlite

    dst = tmp_path / "occurrences.db"
    generate_sqlite(src_parquet_with_taxon, dst, taxa_path=taxa_csv_gz)

    con = sqlite3.connect(dst)
    (count,) = con.execute(
        "SELECT COUNT(*) FROM occurrences WHERE taxon_id IS NOT NULL "
        "AND taxon_id NOT IN (SELECT taxon_id FROM taxa)"
    ).fetchone()
    con.close()
    assert count == 0, f"Found {count} orphan taxon_id values"
```

```python
def test_orphan_assertion_raises(src_parquet_with_taxon: Path, tmp_path: Path) -> None:
    """If taxa table is empty, orphan assertion must raise ValueError."""
    from sqlite_export import _assert_no_orphan_taxon_ids
    import sqlite3 as stdlib_sqlite3

    dst = tmp_path / "bare.db"
    # Create occurrences + empty taxa manually
    con = stdlib_sqlite3.connect(dst)
    con.execute("CREATE TABLE occurrences (taxon_id INTEGER)")
    con.execute("INSERT INTO occurrences VALUES (99999)")
    con.execute("CREATE TABLE taxa (taxon_id INTEGER PRIMARY KEY)")
    con.commit()
    con.close()

    with pytest.raises(ValueError, match="orphan"):
        _assert_no_orphan_taxon_ids(dst)
```

```python
def test_is_anthophila_flag(src_parquet_with_taxon: Path, taxa_csv_gz: Path, tmp_path: Path) -> None:
    from sqlite_export import generate_sqlite

    dst = tmp_path / "occurrences.db"
    generate_sqlite(src_parquet_with_taxon, dst, taxa_path=taxa_csv_gz)

    con = sqlite3.connect(dst)
    bee_flags = {row[0] for row in con.execute(
        "SELECT DISTINCT is_anthophila FROM taxa WHERE taxon_id = 47219"
    ).fetchall()}
    bycatch_flags = {row[0] for row in con.execute(
        "SELECT DISTINCT is_anthophila FROM taxa WHERE taxon_id = 52747"
    ).fetchall()}
    con.close()
    assert bee_flags == {1}, f"Bee taxon should have is_anthophila=1, got {bee_flags}"
    assert bycatch_flags == {0}, f"Bycatch taxon should have is_anthophila=0, got {bycatch_flags}"
```

---

## Shared Patterns

### DuckDB parameterized query with list argument

**Source:** `data/taxa_pipeline.py` line 161
**Apply to:** All `con.execute(sql, [...])` calls in `_build_taxon_hierarchy` that pass file paths

```python
con.execute(
    """...""",
    [str(TAXA_PATH)],   # path passed as positional parameter, not f-string interpolation
)
```

### `ValueError` hard-fail for pipeline gate

**Source:** `data/taxa_pipeline.py` lines 70–74
**Apply to:** `_assert_no_orphan_taxon_ids`

```python
raise ValueError(
    f"taxa.csv.gz is not a GZIP stream after download ..."
)
```

### `_sqlite3.connect` block for post-ATTACH DDL

**Source:** `data/sqlite_export.py` lines 59–68
**Apply to:** Index creation in `_build_taxon_hierarchy` and orphan assertion

```python
with _sqlite3.connect(dst_db) as idx_con:
    # stdlib sqlite3 for DDL that DuckDB ATTACH doesn't need to own
```

### `monkeypatch.setattr` for module-level path constants in tests

**Source:** `data/tests/test_sqlite_export.py` lines 143–146
**Apply to:** `taxa_path` injection in hierarchy tests (via parameter, not monkeypatch, but same motivation)

```python
monkeypatch.setattr(sqlite_export, "_DBT_SANDBOX", sandbox_dir)
monkeypatch.setattr(sqlite_export, "_EXPORT_DIR", export_dir)
```

### `active = 'true'` string guard

**Source:** `data/taxa_pipeline.py` line 123
**Apply to:** PASS 1 SQL in `_build_taxon_hierarchy` (PASS 2 deliberately omits this filter — see Pitfall 5 in RESEARCH.md)

```python
WHERE active = 'true'   # string literal, NOT boolean TRUE
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `VERIFICATION.md` (phase artifact) | documentation | n/a | Manual document; no code analog exists |

---

## Metadata

**Analog search scope:** `data/sqlite_export.py`, `data/taxa_pipeline.py`, `data/tests/test_sqlite_export.py`
**Files scanned:** 3
**Pattern extraction date:** 2026-06-02
