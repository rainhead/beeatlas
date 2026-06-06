# Phase 140: Checklist & Taxonomy Fixture Distillation - Pattern Map

**Mapped:** 2026-06-06
**Files analyzed:** 7 (2 new fixture files + 5 modified source/test files)
**Analogs found:** 6 / 7 (fixtures/ directory has no direct analog — new pattern)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/checklist_pipeline.py` | service | CRUD + file-I/O | self (modify in-place) | self |
| `data/resolve_checklist_names.py` | service | file-I/O + transform | self (modify in-place) | self |
| `data/tests/test_checklist_pipeline.py` | test | CRUD | self (modify in-place) + `data/tests/conftest.py` lines 545-564 | self + session-scoped analog |
| `data/tests/test_resolve_checklist_names.py` | test | file-I/O | `data/tests/test_checklist_pipeline.py` `checklist_db` fixture (lines 23-45) | role-match |
| `data/tests/fixtures/checklist_sample.csv` | fixture data | file-I/O | `data/tests/fixtures.py` (committed WKT constants with provenance docstring) | data-match |
| `data/tests/fixtures/taxa_subset.csv.gz` | fixture data | file-I/O | `data/tests/fixtures.py` (committed constants with provenance docstring) | data-match |
| `data/tests/fixtures/` (directory) | config | — | `data/tests/fixtures.py` (existing committed test data module) | partial |

---

## Pattern Assignments

### `data/checklist_pipeline.py` (service, CRUD + file-I/O — MODIFY)

**Change:** Add optional `con` parameter to `load_checklist()`. When `None`, the function creates and closes its own connection (nightly path, unchanged). When provided, it uses the injected connection without closing it.

**Analog:** self — the existing `load_checklist()` body at lines 518-597 is the only reference. The modification pattern follows the `_owns_connection` guard idiom from RESEARCH.md Pattern 2.

**Current signature** (`data/checklist_pipeline.py` lines 518-521):
```python
def load_checklist() -> None:
    """Read the WA bee checklist TSV and populate checklist_data.species
    + checklist_data.species_counties + checklist_data.checklist_records."""
    con = duckdb.connect(DB_PATH)
```

**Target signature — minimal diff to apply:**
```python
def load_checklist(con: "duckdb.DuckDBPyConnection | None" = None) -> None:
    """Read the WA bee checklist TSV and populate checklist_data.species
    + checklist_data.species_counties + checklist_data.checklist_records."""
    _owns_connection = con is None
    if _owns_connection:
        con = duckdb.connect(DB_PATH)
```

**Current finally block** (`data/checklist_pipeline.py` lines 595-597):
```python
    finally:
        con.close()
```

**Target finally block — guard the close:**
```python
    finally:
        if _owns_connection:
            con.close()
```

**Module-level constants to know** (`data/checklist_pipeline.py` lines 29-33):
```python
DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
CHECKLIST_PATH = Path(__file__).parent / "checklists" / "wa_bee_checklist.tsv"
CHECKLIST_RECORDS_PATH = Path(__file__).parent / "checklists" / "wa_bee_checklist_records.tsv"
CHECKLIST_RECORDS_FULL_PATH = Path(__file__).parent / "checklists" / "checklist_records_full.csv"
TAXA_PATH = Path(__file__).parent / "raw" / "taxa.csv.gz"
```

**Cache global to reset** (`data/checklist_pipeline.py` lines 44):
```python
_TAXA_ANCESTRY: dict[str, dict] | None = None
```

The module-scoped fixture must set `mod._TAXA_ANCESTRY = None` before calling `load_checklist(con=con)` to prevent stale cache from a previous test run reading the real `taxa.csv.gz`.

---

### `data/resolve_checklist_names.py` (service, file-I/O + transform — MODIFY)

**Change:** Extract the inline `taxa_path` local variable into a module-level `TAXA_PATH` constant so tests can monkeypatch it.

**Analog:** `data/checklist_pipeline.py` lines 33 — identical pattern (module-level `TAXA_PATH = Path(__file__).parent / "raw" / "taxa.csv.gz"`).

**Current inline construction** (`data/resolve_checklist_names.py` lines 268-269):
```python
    taxa_path = str(Path(__file__).parent / "raw" / "taxa.csv.gz")
    taxa = _load_anthophila_ancestry(taxa_path)
```

**Target — add constant near top of file** (after line 40, alongside `AUDIT_CSV`/`FUZZY_REVIEW_CSV`/`GBIF_SEED_CSV`):
```python
TAXA_PATH = str(Path(__file__).parent / "raw" / "taxa.csv.gz")
```

**Target — use the constant in `resolve_checklist_names()`** (replace lines 268-269):
```python
    taxa = _load_anthophila_ancestry(TAXA_PATH)
```

**Existing constants block for placement context** (`data/resolve_checklist_names.py` lines 37-42):
```python
DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
AUDIT_CSV = Path(__file__).parent / "checklist_name_resolution_audit.csv"
FUZZY_REVIEW_CSV = Path(__file__).parent / "checklist_fuzzy_review.csv"
GBIF_SEED_CSV = Path(__file__).parent / "dbt" / "seeds" / "gbif_checklist_synonyms.csv"
# ADD HERE:
# TAXA_PATH = str(Path(__file__).parent / "raw" / "taxa.csv.gz")
```

Note: `TAXA_PATH` in `resolve_checklist_names.py` is `str` (not `Path`) because `_load_anthophila_ancestry()` passes it to `gzip.open()` which accepts both, but keeping it `str` matches the current usage.

---

### `data/tests/test_checklist_pipeline.py` (test, CRUD — MODIFY)

**Primary change:** Replace the per-test function-scoped `checklist_db` fixture (lines 23-45) with a module-scoped `checklist_sample_db` fixture using direct `setattr` + `request.addfinalizer`. Rewrite ~20 tests to accept `checklist_sample_db` instead of `checklist_db`. Keep `checklist_db` unchanged for the two `@pytest.mark.integration` tests.

**Analog 1 — existing `checklist_db` fixture** (`data/tests/test_checklist_pipeline.py` lines 23-45):
```python
@pytest.fixture
def checklist_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "checklist.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)
    import importlib
    import checklist_pipeline
    importlib.reload(checklist_pipeline)
    # Pre-create ecdysis_data.occurrences (mirrors prod ordering invariant).
    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute("CREATE TABLE ecdysis_data.occurrences (scientific_name VARCHAR)")
    con.close()
    return db_path, checklist_pipeline
```

**Analog 2 — session-scoped fixture pattern** (`data/tests/conftest.py` lines 545-564):
```python
@pytest.fixture(scope="session")
def fixture_db(tmp_path_factory):
    """Create a test DuckDB with all schemas and seed data. Returns path to DB file."""
    db_path = str(tmp_path_factory.mktemp("db") / "test.duckdb")
    con = duckdb.connect(db_path)
    con.execute("INSTALL spatial; LOAD spatial;")
    _create_schemas(con)
    _create_tables(con)
    _seed_data(con)
    con.close()
    return db_path

@pytest.fixture(scope="session")
def fixture_con(fixture_db):
    """Return a connection to the fixture DB with spatial loaded."""
    con = duckdb.connect(fixture_db, read_only=False)
    con.execute("LOAD spatial;")
    yield con
    con.close()
```

**Analog 3 — monkeypatch setattr pattern** (`data/tests/test_resolve_checklist_names.py` lines 86-95):
```python
    monkeypatch.setattr(resolve_checklist_names, "_GBIF_PACE_SECONDS", 0.0)
    monkeypatch.setattr(
        resolve_checklist_names, "AUDIT_CSV", tmp_path / "audit.csv"
    )
    monkeypatch.setattr(
        resolve_checklist_names, "FUZZY_REVIEW_CSV", tmp_path / "fuzzy_review.csv"
    )
    monkeypatch.setattr(
        resolve_checklist_names, "GBIF_SEED_CSV",
        tmp_path / "gbif_checklist_synonyms.csv"
    )
```

**Target module-scoped fixture — copy this pattern:**

The new `checklist_sample_db` fixture combines: (a) the ecdysis bootstrap from `checklist_db`, (b) the `scope="session"` / yield pattern from `conftest.py fixture_con`, and (c) direct `setattr` + `request.addfinalizer` instead of function-scoped `monkeypatch` (see RESEARCH.md Pitfall 1 — `monkeypatch` is function-scoped and cannot be used in a module-scoped fixture):

```python
FIXTURES_DIR = Path(__file__).parent / "fixtures"

@pytest.fixture(scope="module")
def checklist_sample_db(request):
    """Module-scoped in-memory DuckDB loaded from the committed checklist sample.

    Distilled from checklist_records_full.csv (2026-06-06). Covers all coord_flag
    and date_quality branches. Built once per test file; all non-integration tests
    share one connection.

    Does NOT monkeypatch checklist_db — the two @pytest.mark.integration tests
    (test_checklist_records_full_row_count, test_checklist_records_full_schema)
    continue to use checklist_db unmodified.
    """
    import importlib
    import checklist_pipeline as mod

    # Save originals for teardown (request.addfinalizer restores them).
    old_crfp = mod.CHECKLIST_RECORDS_FULL_PATH
    old_taxa = mod.TAXA_PATH
    old_cache = mod._TAXA_ANCESTRY

    mod.CHECKLIST_RECORDS_FULL_PATH = FIXTURES_DIR / "checklist_sample.csv"
    mod.TAXA_PATH = FIXTURES_DIR / "taxa_subset.csv.gz"
    mod._TAXA_ANCESTRY = None  # force re-read from fixture gz, not real file

    con = duckdb.connect(":memory:")
    # Bootstrap ecdysis_data.occurrences (T-76-04 prod ordering invariant).
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute("CREATE TABLE ecdysis_data.occurrences (scientific_name VARCHAR)")

    mod.load_checklist(con=con)

    def teardown():
        mod.CHECKLIST_RECORDS_FULL_PATH = old_crfp
        mod.TAXA_PATH = old_taxa
        mod._TAXA_ANCESTRY = old_cache
        con.close()

    request.addfinalizer(teardown)
    return con
```

**Test body pattern — before (per-test reconnect):**
```python
def test_load_checklist_populates_species_rows(checklist_db):
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        n = con.execute("SELECT count(*) FROM checklist_data.species").fetchone()[0]
    finally:
        con.close()
    assert n > 100, f"expected >100 distinct species, got {n}"
```

**Test body pattern — after (shared connection, exact sample count):**
```python
def test_load_checklist_populates_species_rows(checklist_sample_db):
    con = checklist_sample_db
    n = con.execute("SELECT count(*) FROM checklist_data.species").fetchone()[0]
    n_null = con.execute(
        "SELECT count(*) FROM checklist_data.species WHERE canonical_name IS NULL"
    ).fetchone()[0]
    n_status = con.execute(
        "SELECT count(*) FROM checklist_data.species WHERE status <> 'verified'"
    ).fetchone()[0]
    assert n > 0, f"expected species rows, got {n}"   # real TSV still used; count unchanged
    assert n_null == 0
    assert n_status == 0
```

Note: `checklist_data.species` and `checklist_data.species_counties` are populated from `wa_bee_checklist.tsv` (the real committed TSV, which is small and NOT replaced by the sample). Only `CHECKLIST_RECORDS_FULL_PATH` is swapped. Tests asserting `n > 100` species remain valid.

**Idempotency test pattern — shared connection, call load twice:**
```python
def test_load_checklist_is_idempotent(checklist_sample_db, request):
    import checklist_pipeline as mod
    con = checklist_sample_db
    n1 = con.execute("SELECT count(*) FROM checklist_data.species").fetchone()[0]
    c1 = con.execute("SELECT count(*) FROM checklist_data.species_counties").fetchone()[0]
    mod.load_checklist(con=con)   # second call — CREATE OR REPLACE is idempotent
    n2 = con.execute("SELECT count(*) FROM checklist_data.species").fetchone()[0]
    c2 = con.execute("SELECT count(*) FROM checklist_data.species_counties").fetchone()[0]
    assert n1 == n2
    assert c1 == c2
```

**Count assertions to rewrite** (from RESEARCH.md §4):

| Test | Current assertion | New assertion |
|------|------------------|---------------|
| `test_checklist_records_full_coord_flag_coverage` | `null_coord_count > 1000` | `null_coord_count == 1` |
| `test_checklist_records_full_null_date_tagged_none` | `n_none > 1000` | `n_none == 4` (rows 3,4,7,8) |
| `test_load_checklist_populates_species_rows` | `n > 100` | keep as-is (real TSV still used) |
| `test_load_checklist_creates_species_counties_table` | `n > 100` | keep as-is (real TSV still used) |

**Integration tests — leave unchanged** (`data/tests/test_checklist_pipeline.py` lines 363-399):
Both `@pytest.mark.integration` tests keep `checklist_db` fixture and `mod.load_checklist()` with no injected connection. The `importlib.reload()` inside `checklist_db` resets all module-level constants from source, overwriting any `setattr` from the module-scoped fixture — no conflict.

---

### `data/tests/test_resolve_checklist_names.py` (test, file-I/O — MODIFY)

**Change:** Monkeypatch `resolve_checklist_names.TAXA_PATH` to point at `data/tests/fixtures/taxa_subset.csv.gz` inside `checklist_resolver_db`. This is a small addition to the existing fixture.

**Primary analog — existing `checklist_resolver_db` fixture** (`data/tests/test_resolve_checklist_names.py` lines 62-135):

The existing fixture already demonstrates the exact `monkeypatch.setattr` pattern for module-level constants:

```python
@pytest.fixture
def checklist_resolver_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "checklist_resolver.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)

    import resolve_checklist_names
    importlib.reload(resolve_checklist_names)

    # Zero pacing and redirect file outputs to tmp_path.
    monkeypatch.setattr(resolve_checklist_names, "_GBIF_PACE_SECONDS", 0.0)
    monkeypatch.setattr(
        resolve_checklist_names, "AUDIT_CSV", tmp_path / "audit.csv"
    )
    monkeypatch.setattr(
        resolve_checklist_names, "FUZZY_REVIEW_CSV", tmp_path / "fuzzy_review.csv"
    )
    monkeypatch.setattr(
        resolve_checklist_names, "GBIF_SEED_CSV",
        tmp_path / "gbif_checklist_synonyms.csv"
    )
    # [seed DB schema + rows...]
    return tmp_path, resolve_checklist_names
```

**Addition — one new `setattr` line to insert** after the existing `monkeypatch.setattr` block (copy the same pattern):
```python
FIXTURES_DIR = Path(__file__).parent / "fixtures"

# Inside checklist_resolver_db, after importlib.reload:
monkeypatch.setattr(
    resolve_checklist_names, "TAXA_PATH",
    str(FIXTURES_DIR / "taxa_subset.csv.gz")
)
```

This follows the identical pattern to `AUDIT_CSV`/`FUZZY_REVIEW_CSV`/`GBIF_SEED_CSV` redirections already in the fixture. Because the fixture is function-scoped, standard `monkeypatch` works without scope mismatch (unlike the module-scoped `checklist_sample_db` in `test_checklist_pipeline.py`).

**D-07 compliance:** After this change, `mod.resolve_checklist_names(refresh=True)` reads `taxa_subset.csv.gz` (2 rows) instead of `raw/taxa.csv.gz` (39 MB). The fast tier passes even if `raw/taxa.csv.gz` is absent.

---

### `data/tests/fixtures/checklist_sample.csv` (fixture data, file-I/O — CREATE)

**No direct codebase analog** — the existing `data/tests/fixtures.py` (WKT polygon constants) is the closest pattern for committed test data with provenance documentation, but that is a Python module rather than a CSV file.

**Pattern to follow — `data/tests/fixtures.py` docstring style** (lines 1-7):
```python
"""Shared WKT polygon constants for test fixtures.

Real production polygons fetched from beeatlas.duckdb 2026-03-29.
All three polygons contain the canonical test coordinates:
  - Test specimen: lat=47.608, lon=-120.912 (inside CHELAN_WKT and NORTH_CASCADES_WKT)
  - Test iNat obs: lon=-120.8, lat=47.5    (inside CHELAN_WKT and NORTH_CASCADES_WKT)
"""
```

**For CSV files, use a comment header row** (D-10 — per-fixture docstring/header comment):
```
# Distilled from data/checklists/checklist_records_full.csv (2026-06-06).
# Branch coverage: one row per coord_flag value (valid, null_coord, zero_coord, out_of_bbox),
# one row per date_quality value (full/ISO-datetime, full/pre-1900, full/M-D-YYYY, none),
# one synthetic row for year_only (0 rows in real CSV — kept for branch coverage per D-08),
# one slash-compound verbatim_name row (ObjectID 1386).
# ObjectID provenance: 1 (valid+full/ISO), 3 (null_coord+full/ISO), 17423 (zero_coord+none),
# 8702 (out_of_bbox+none), 31311 (valid+full/pre-1900), 1668 (valid+full/M-D-YYYY),
# 1386 (valid+none+slash), 99999 (synthetic year_only).
# Note: ObjectID 147 is valid (lon=-117.2137 is inside WA eastern boundary -116.9 check:
# -124.85 <= -117.2137 <= -116.9 → TRUE). Do not use it for out_of_bbox.
```

**CSV schema** — must match the 12-column header that `_load_checklist_records_full()` reads via `csv.DictReader` (`data/checklist_pipeline.py` lines 396-515, verified):
```
ObjectID,Family,Genus,Scientific Name,Locality,Latitude,Longitude,Date,recordedBy,County_join,x,y
```

**Minimal 8-row content** (from RESEARCH.md §4, with bbox correction from Open Question #3 — ObjectID 147 is `valid` not `out_of_bbox`; use ObjectID 8702 as the sole confirmed `out_of_bbox` row):

| ObjectID | coord_flag | date_quality | Notes |
|----------|-----------|--------------|-------|
| 1 | valid | full (ISO datetime) | Agapostemon angelicus, lat=47.3075 |
| 3 | null_coord | full (ISO datetime) | empty lat/lon |
| 17423 | zero_coord | none | lat=0, lon=0, empty date |
| 8702 | out_of_bbox | none | lat=49.00003811 > 49.0 |
| 31311 | valid | full (pre-1900) | year=1812 |
| 1668 | valid | full (M/D/YYYY) | 6/14/1905 |
| 1386 | valid | none | slash: Agapostemon angelicus/texanus |
| 99999 | valid | year_only | synthetic, date=`1995` |

**Exact counts after load:**

| Assertion | Count |
|-----------|-------|
| `checklist_records_full` total rows | 8 |
| `coord_flag='valid'` | 5 (ObjectIDs 1, 31311, 1668, 1386, 99999) |
| `coord_flag='null_coord'` | 1 (ObjectID 3) |
| `coord_flag='zero_coord'` | 1 (ObjectID 17423) |
| `coord_flag='out_of_bbox'` | 1 (ObjectID 8702) |
| `date_quality='full'` | 3 (ObjectIDs 1, 3, 31311, 1668 = 4) |
| `date_quality='none'` | 3 (ObjectIDs 17423, 8702, 1386 = 3) |
| `date_quality='year_only'` | 1 (ObjectID 99999) |

Note: ObjectID 3 has empty lat/lon (null_coord) but a non-empty date (`1957-08-06T00:00:00`) → `date_quality='full'`. Recount: `full` = ObjectIDs 1, 3, 31311, 1668 = 4 rows; `none` = ObjectIDs 17423, 8702, 1386 = 3 rows; `year_only` = ObjectID 99999 = 1 row. Total = 8.

---

### `data/tests/fixtures/taxa_subset.csv.gz` (fixture data, file-I/O — CREATE)

**No direct codebase analog** — must be authored as a tab-delimited gz matching the schema that `_load_anthophila_ancestry()` reads.

**Schema** — tab-delimited, 6 columns, from `data/resolve_checklist_names.py` lines 66-98:
```
taxon_id\tancestry\trank_level\trank\tname\tactive
```

**Minimum content** — exactly 2 rows (from RESEARCH.md §6):
```
270393  48460/1/47120/372739/47158/184884/47201/124417/326777/47222/630955/49707/134106/335597/1597677/50086/606634  10  species  Agapostemon angelicus  true
1581468 48460/1/47120/372739/47158/184884/47201/124417/326777/47222/630955/49707/134106/335597/1597677/50086/606634/1581466  10  species  Agapostemon texanus  true
```

These two rows provide the angelicus/texanus LCA at node 606634 (subgenus Agapostemon). Both ancestry strings verified from live `data/raw/taxa.csv.gz`.

**Provenance comment** — record in the fixture function docstring in `test_checklist_pipeline.py` and `test_resolve_checklist_names.py` (cannot embed a comment in a gz file; use the fixture docstring per D-10):
```
Distilled from data/raw/taxa.csv.gz (2026-06-06).
Contains only the two Anthophila species needed for the angelicus/texanus LCA test:
  Agapostemon angelicus (taxon_id=270393, ancestry: .../50086/606634)
  Agapostemon texanus  (taxon_id=1581468, ancestry: .../50086/606634/1581466)
LCA = 606634 (subgenus Agapostemon). Ancestry strings verified from live taxa.csv.gz.
```

**How `checklist_pipeline._load_taxa_ancestry()` reads it** (`data/checklist_pipeline.py` lines 61-78):
```python
with gzip.open(str(TAXA_PATH), "rt", newline="") as f:
    reader = csv.reader(f, delimiter="\t")
    next(reader)  # skip header
    for row in reader:
        taxon_id, ancestry, _rank_level, rank, name, active = row[:6]
```

**How `resolve_checklist_names._load_anthophila_ancestry()` reads it** (`data/resolve_checklist_names.py` lines 76-95):
```python
with gzip.open(taxa_path, "rt", encoding="utf-8") as fh:
    reader = csv.DictReader(fh, delimiter="\t")
    for row in reader:
        ancestry = row.get("ancestry", "") or ""
        active = str(row.get("active", "")).lower()
        rank = str(row.get("rank", "")).lower()
```

Both readers expect the same tab-delimited gz with a header row. The gz must be created by the implementer (a short Python script using `gzip.open(..., "wt")` + `csv.writer(..., delimiter="\t")`).

---

## Shared Patterns

### Pattern A: Module-Level Constant for Monkeypatching

**Source:** `data/checklist_pipeline.py` lines 29-33 (CHECKLIST_PATH, TAXA_PATH, etc.)
**Also:** `data/resolve_checklist_names.py` lines 37-40 (AUDIT_CSV, FUZZY_REVIEW_CSV, GBIF_SEED_CSV)
**Apply to:** Adding `TAXA_PATH` to `resolve_checklist_names.py`

```python
# Pattern: declare path as module-level constant so monkeypatch.setattr
# (or direct setattr) can override it without importlib.reload.
TAXA_PATH = str(Path(__file__).parent / "raw" / "taxa.csv.gz")
```

### Pattern B: `monkeypatch.setattr` on Module Attribute (function-scoped)

**Source:** `data/tests/test_resolve_checklist_names.py` lines 86-95
**Apply to:** Adding `TAXA_PATH` redirect to `checklist_resolver_db`

```python
monkeypatch.setattr(
    resolve_checklist_names, "TAXA_PATH",
    str(FIXTURES_DIR / "taxa_subset.csv.gz")
)
```

### Pattern C: `setattr` + `request.addfinalizer` (module-scoped)

**Source:** RESEARCH.md Pattern 1 (no existing module-scoped fixture in codebase — `conftest.py` uses session-scope)
**Apply to:** `checklist_sample_db` fixture in `test_checklist_pipeline.py`

The `conftest.py` session-scoped fixture (`fixture_db` lines 545-555) is the closest structural analog. For module scope, `monkeypatch` cannot be used directly — use direct `setattr` with `request.addfinalizer` for restoration:

```python
@pytest.fixture(scope="module")
def checklist_sample_db(request):
    old_val = mod.SOME_PATH
    mod.SOME_PATH = FIXTURES_DIR / "fixture_file"
    request.addfinalizer(lambda: setattr(mod, "SOME_PATH", old_val))
    ...
    return con
```

### Pattern D: ecdysis_data.occurrences Bootstrap

**Source:** `data/tests/test_checklist_pipeline.py` lines 40-44
**Apply to:** `checklist_sample_db` fixture

```python
# Pre-create ecdysis_data.occurrences (mirrors prod ordering invariant T-76-04).
con.execute("CREATE SCHEMA ecdysis_data")
con.execute("CREATE TABLE ecdysis_data.occurrences (scientific_name VARCHAR)")
```

Must be done BEFORE `mod.load_checklist(con=con)` — `_update_occurrences_canonical_name()` called at end of `load_checklist()` requires the table to exist.

### Pattern E: Shared Connection Query (no per-test reconnect)

**Source:** `data/tests/conftest.py` lines 558-564 (`fixture_con` — tests call `fixture_con.execute(...)` directly)
**Apply to:** All non-integration tests in `test_checklist_pipeline.py` after migration

```python
# Before (per-test reconnect):
def test_foo(checklist_db):
    db_path, mod = checklist_db
    mod.load_checklist()
    con = duckdb.connect(db_path, read_only=True)
    try:
        result = con.execute("SELECT ...").fetchone()
    finally:
        con.close()

# After (shared connection):
def test_foo(checklist_sample_db):
    con = checklist_sample_db
    result = con.execute("SELECT ...").fetchone()
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `data/tests/fixtures/` (directory) | config | — | No `fixtures/` subdirectory exists yet; `data/tests/fixtures.py` is a Python module, not a directory |

The `fixtures.py` module pattern (provenance docstring + committed data) directly applies to the CSV and gz files, but the directory and file format are new.

---

## Metadata

**Analog search scope:** `data/tests/`, `data/checklist_pipeline.py`, `data/resolve_checklist_names.py`, `data/tests/conftest.py`
**Files read:** 7 source files (test files, production modules, conftest)
**Pattern extraction date:** 2026-06-06
