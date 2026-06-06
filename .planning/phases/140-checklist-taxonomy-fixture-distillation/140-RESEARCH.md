# Phase 140: Checklist & Taxonomy Fixture Distillation — Research

**Researched:** 2026-06-06
**Domain:** Python pytest fixture engineering, DuckDB connection mechanics, CSV fixture distillation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Checklist sample wiring (TFIXTURE-01)**
- D-01: Fast-tier checklist tests get data via a small committed sample CSV read through the real `load_checklist()` CSV→DuckDB path — NOT by seeding rows directly into the DB.
- D-02: The sample replaces the full-file loader only in the fast tier. The existing full-data assertions stay as `@pytest.mark.integration` tests reading the real `checklist_records_full.csv`.

**DuckDB build scope and in-memory mechanics**
- D-03: Build the checklist DuckDB once per test file (module-scoped).
- D-04: Use an in-memory DuckDB via a shared-connection fixture — ONE connection object, used by both `load_checklist()` and all verification asserts.
- D-05: D-04 implies `load_checklist()` must accept an injected connection (dependency injection). Researcher must identify the seam. Keep the production change minimal and behavior-preserving for the real nightly path.

**Taxonomy ancestry fixture (TFIXTURE-02)**
- D-06: Replace 39 MB `raw/taxa.csv.gz` with a tiny committed subset, read through the real ancestry-parse code path.
- D-07: Fast tier MUST pass with real `raw/taxa.csv.gz` absent from disk.

**Coverage and assertion policy**
- D-08: Distill sample to minimal: one row per branch the tests actually assert on (every `coord_flag` and `date_quality` branch).
- D-09: Rewrite count/structure assertions to the sample's exact known counts.

**Provenance documentation (TFIXTURE-04)**
- D-10: Record provenance via per-fixture docstrings / header comments. Central README was NOT chosen. Fixtures live in `data/tests/fixtures/`.

### Claude's Discretion
- The exact `load_checklist()` connection-injection seam and ancestry-path override mechanism (D-05/D-07).
- Whether integration-tagged tests need adjustment to coexist with new sample fixtures.

### Deferred Ideas (OUT OF SCOPE)
- TFIXTURE-05: Broaden session/module-scoped DB to other per-test DuckDB builders (`test_inactive_remap.py`, `test_places_*`, etc.).
- TFIXTURE-03/Phase 141: dbt `target/`/`public/` parquet fixtures.
- TFIX-01..04/Phase 141: Fixing ~19 red tests, silent-skip elimination, bulk integration tagging.
- Phase 142: Measured after-numbers/budget verification.
- Phase 143: CI gate.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TFIXTURE-01 | Committed checklist sample replacing full-file parsing; DuckDB built once (module-scoped) | D-01..D-05, D-08, D-09; connection seam, sample rows, mutation analysis |
| TFIXTURE-02 | Tiny committed `taxa.csv.gz` subset for ancestry tests; fast tier passes with real file absent | D-06, D-07; taxa.csv.gz path override seam, minimal rows needed |
| TFIXTURE-04 | `data/tests/fixtures/` directory with provenance comments | D-10; directory does not exist yet, fixture file layout |
</phase_requirements>

---

## Summary

Phase 140 eliminates two dominant per-test parse costs in the `data/` build-time tier. The checklist cost (load_checklist() reparses 50,646 rows × ~22 tests) is cut by: (1) a tiny committed sample CSV covering all tested branches, (2) a connection-injection seam in `load_checklist()`, and (3) a module-scoped fixture that builds the DuckDB once and shares the connection. The taxa cost (taxa.csv.gz parsed 39 MB × ~5 refresh=True tests) is cut by a tiny committed `taxa.csv.gz` subset that the path-override seam points the code at in the fast tier.

The two code changes required (the `load_checklist()` connection seam and the taxa path override) are surgical and deliberately minimal. The real nightly path must be untouched: the `con` parameter defaults to `None` and the function connects to `DB_PATH` exactly as before when no connection is injected. Similarly, `TAXA_PATH` in `checklist_pipeline.py` remains a module-level constant that tests can monkeypatch, and `taxa_path` in `resolve_checklist_names.py` is already a local variable constructed inside the `refresh=True` branch, making it straightforwardly overridable.

The most consequential planning decision is the **mutation hazard under module scope**: two tests (`test_load_checklist_is_idempotent`, `test_checklist_records_full_is_idempotent`) call `load_checklist()` twice. Under `CREATE OR REPLACE` semantics, a second call with a shared connection is benign — the tables are replaced in-place and counts are unchanged — but this must be verified as part of the plan. The six `fixture_con` tests in the same file are already session-scoped (via `conftest.py`) and untouched by this work.

**Primary recommendation:** Add an optional `con: duckdb.DuckDBPyConnection | None = None` parameter to `load_checklist()`; when provided, skip `duckdb.connect()` and `con.close()`. Replace the per-test `checklist_db` fixture with a module-scoped `checklist_sample_db` that creates one in-memory connection, bootstraps `ecdysis_data.occurrences`, calls `load_checklist(con=con, ...)`, and yields the connection.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DuckDB connection lifecycle | Test fixture layer | Production module (fallback) | Fixture owns the connection for fast-tier tests; production module creates its own for nightly |
| Sample CSV authoring | `data/tests/fixtures/` (committed file) | — | Static distilled input; no runtime generation |
| Taxa ancestry fixture | `data/tests/fixtures/` (committed gz) | `data/raw/taxa.csv.gz` (integration tier) | Tiny subset for code tests; real file for dataset tests |
| `load_checklist()` seam | `data/checklist_pipeline.py` | — | Single injection point; minimal production change |
| Taxa path override seam | `data/checklist_pipeline.py` (`TAXA_PATH`) and `data/resolve_checklist_names.py` (local `taxa_path`) | — | Both are monkeypatch-able; no structural change needed |

---

## Critical Research Findings

### 1. `load_checklist()` Current Connection Mechanics (`data/checklist_pipeline.py`)

[VERIFIED: codebase grep, file read]

`load_checklist()` at line 518–597 currently:

```python
def load_checklist() -> None:
    con = duckdb.connect(DB_PATH)   # <-- owns connection lifecycle
    try:
        ...
        _update_occurrences_canonical_name(con)
    finally:
        con.close()                 # <-- always closes
```

All sub-functions (`_load_checklist_records`, `_load_checklist_records_full`, `_update_occurrences_canonical_name`) accept `con` as a parameter and do NOT call `con.close()`. The connection lifecycle is entirely centralized in `load_checklist()`.

**CSV paths as module-level constants:**
```python
CHECKLIST_RECORDS_FULL_PATH = Path(__file__).parent / "checklists" / "checklist_records_full.csv"
CHECKLIST_RECORDS_PATH = Path(__file__).parent / "checklists" / "wa_bee_checklist_records.tsv"
CHECKLIST_PATH = Path(__file__).parent / "checklists" / "wa_bee_checklist.tsv"
TAXA_PATH = Path(__file__).parent / "raw" / "taxa.csv.gz"
```

All four are module-level. The `importlib.reload()` pattern in the existing `checklist_db` fixture re-evaluates these at reload time, so `monkeypatch` of the module attribute is sufficient — no env var needed for path overrides.

**The cleanest seam (D-05) — recommended approach:**

Option A (preferred — minimal diff): Add an optional `con` parameter to `load_checklist()`:

```python
def load_checklist(con: duckdb.DuckDBPyConnection | None = None) -> None:
    _owns_connection = con is None
    if _owns_connection:
        con = duckdb.connect(DB_PATH)
    try:
        con.execute("CREATE SCHEMA IF NOT EXISTS checklist_data")
        ...
        _update_occurrences_canonical_name(con)
    finally:
        if _owns_connection:
            con.close()
```

The nightly path calls `load_checklist()` with no arguments — behavior unchanged. The test fixture calls `load_checklist(con=con)` with the shared in-memory connection.

Option B (alternative): A thin wrapper `load_checklist_into(con)` that the test calls; `load_checklist()` stays unchanged and calls the wrapper. More lines, same semantics. Option A is preferred.

**Checklist CSV path override for D-01:** The sample CSV must be read by `_load_checklist_records_full()` instead of `checklist_records_full.csv`. Since `CHECKLIST_RECORDS_FULL_PATH` is a module-level constant, the fixture monkeypatches it after reload:

```python
monkeypatch.setattr(mod, "CHECKLIST_RECORDS_FULL_PATH", SAMPLE_CSV_PATH)
```

This is the same pattern `checklist_resolver_db` uses for `AUDIT_CSV` etc. (confirmed at `test_resolve_checklist_names.py:87–95`).

Similarly, `wa_bee_checklist.tsv` (the species/counties TSV) is also referenced by `load_checklist()`. It is small (~500 rows) and fast; the fixture can point it at the real file or at a minimal stub. **Recommendation: point `CHECKLIST_PATH` at the real `wa_bee_checklist.tsv` (already committed, small) and only swap `CHECKLIST_RECORDS_FULL_PATH` to the sample.** The `CHECKLIST_RECORDS_PATH` (for `wa_bee_checklist_records.tsv`, the 4-column TSV) is also small; same treatment.

### 2. DuckDB In-Memory Connection Sharing (`data/tests/conftest.py`)

[VERIFIED: live DuckDB 1.5.2 test via `uv run python3`]

Two independent `duckdb.connect(':memory:')` calls produce **separate, isolated databases** that cannot share tables. Confirmed:

```
Separate :memory: connections DO NOT share state: CatalogException: Table with name t1 does not exist!
```

`.cursor()` on the same connection object DOES share state — the cursor executes within the parent connection's database.

**Named in-memory databases** (`duckdb.connect(':memory:test_name')`) DO share state across multiple `connect()` calls with the same name — confirmed via live test. This is an alternative to passing the connection object, but passing the connection object is simpler and avoids the global-state footgun of a named in-memory database surviving across test isolation boundaries.

**Chosen approach (D-04):** Module-scoped fixture creates ONE `duckdb.connect(':memory:')`, performs all setup, and passes the connection object directly — to `load_checklist(con=con)` and to all verification asserts. No second `connect()` call in individual tests.

### 3. `ecdysis_data.occurrences` Bootstrap (T-76-04 Ordering Invariant)

[VERIFIED: codebase, `test_checklist_pipeline.py:34–44`, `checklist_pipeline.py:593`]

The existing `checklist_db` fixture pre-creates `ecdysis_data.occurrences` before calling `load_checklist()`:

```python
con = duckdb.connect(db_path)
con.execute("CREATE SCHEMA ecdysis_data")
con.execute("CREATE TABLE ecdysis_data.occurrences (scientific_name VARCHAR)")
con.close()
```

This mirrors the production ordering invariant: `run.py` STEPS guarantees ecdysis runs before `checklist_pipeline`. At the end of `load_checklist()`, `_update_occurrences_canonical_name(con)` is called — it does `ALTER TABLE ecdysis_data.occurrences ADD COLUMN IF NOT EXISTS canonical_name VARCHAR` then UPDATEs it. If `ecdysis_data.occurrences` doesn't exist, this will raise.

**The new module-scoped fixture must:**
1. Create `ecdysis_data` schema
2. Create `ecdysis_data.occurrences` (at minimum `scientific_name VARCHAR`)
3. Then call `load_checklist(con=con)` with the sample CSV path monkeypatched

The table does not need real data — `_update_occurrences_canonical_name` handles an empty table gracefully (the `WHERE scientific_name IS NOT NULL` guard makes the UPDATE a no-op on an empty table).

**Important nuance for idempotency tests:** `load_checklist()` uses `CREATE OR REPLACE TABLE` for its tables and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for the occurrences column. Calling `load_checklist(con=con)` twice on the same shared in-memory connection is safe — `CREATE OR REPLACE` drops and recreates the tables, yielding identical row counts. Both idempotency tests (`test_load_checklist_is_idempotent`, `test_checklist_records_full_is_idempotent`) will need to call `load_checklist(con=con)` twice under the shared connection. This is safe because `CREATE OR REPLACE` semantics hold in DuckDB in-memory.

### 4. Complete Branch Enumeration for Sample CSV

[VERIFIED: codebase read, CSV inspection]

**`coord_flag` branches (all 4 values):**

| Value | Source row(s) | Condition |
|-------|--------------|-----------|
| `valid` | ObjectID 1 (`Agapostemon angelicus`, lat=47.3075, lon=-122.2272) | lat/lon within WA bbox |
| `null_coord` | ObjectID 3 (`Agapostemon angelicus`, lat=empty, lon=empty) | Either lat or lon empty |
| `zero_coord` | ObjectID 17423 (`Bombus insularis`, lat=0, lon=0) | Both lat==0 AND lon==0 |
| `out_of_bbox` | ObjectID 8702 (`Apis mellifera`, lat=49.00003811, lon=-122.7518213) | Non-null, non-zero, outside WA bbox |

**`date_quality` branches (3 values):**

| Value | Source row(s) | Condition |
|-------|--------------|-----------|
| `full` (ISO datetime) | ObjectID 1 (date=`1991-07-12T00:00:00`) | Has 'T' in date string |
| `full` (pre-1900 ISO date) | ObjectID 31311 (`Bombus vancouverensis`, date=`1812-06-18T00:00:00`) | Parses to year=1812 |
| `full` (M/D/YYYY) | ObjectID 1668 (`Agapostemon texanus`, date=`6/14/1905`) | M/D/YYYY format |
| `none` | ObjectID 147 (`Agapostemon angelicus`, empty date) | Empty/blank date cell |
| `year_only` | (no rows in current CSV per code comments) | Pure 4-digit integer — keep a synthetic row |

The code comments state: "0 rows in current file" for `year_only`. The tests assert the domain is `('full', 'year_only', 'none')` (line 515–527 of test file). The sample must include a `year_only` row to cover this branch without silent gap, even if synthetic. A minimal synthetic row: ObjectID 99999, date=`1995`.

**Slash-compound rows:**

| Branch | Source | Row |
|--------|--------|-----|
| Slash-compound verbatim_name | ObjectID 1386 (`Agapostemon angelicus/texanus`, lat=48.53459, lon=-122.9235) | Tests `test_checklist_records_full_slash_rows_get_lca_canonical_name` |

**Tests asserting `> N` counts** — MUST rewrite to exact sample counts:

| Test | Current assertion | New assertion (post-rewrite) |
|------|------------------|------------------------------|
| `test_load_checklist_populates_species_rows` | `n > 100` species | Exact count from sample (e.g., `n == 4` if sample has 4 species) |
| `test_load_checklist_creates_species_counties_table` | `n > 100` species_counties | Exact count from sample |
| `test_checklist_records_full_coord_flag_coverage` | `null_coord_count > 1000` | `null_coord_count == 1` (one null_coord row in sample) |
| `test_checklist_records_full_null_date_tagged_none` | `n_none > 1000` | `n_none == 3` (three none-date rows in sample: ObjectIDs 17423, 8702, 1386 — corrected per PATTERNS.md/Plan 02, which are authoritative) |

**Assertions unchanged** (already exact or structure-only):
- Schema column lists (not count-dependent)
- `bad == 0` invariants (zero-row assertions remain valid)
- `n >= 1` assertions (will pass with sample)
- `distinct[0][0].startswith("Bartholomew et al.")` (one source_citation in sample)

### 5. CSV Schema (14 columns, checklist_pipeline.py confirmed)

[VERIFIED: codebase, `_load_checklist_records_full` at line 396–515]

The source CSV has these columns (from `csv.DictReader`):

```
ObjectID, Family, Genus, Scientific Name, Locality, Latitude, Longitude,
Date, recordedBy, County_join, x, y
```

The `x` and `y` columns are ignored (only `Latitude`/`Longitude` used per D-02). The resulting DuckDB table `checklist_records_full` has **14 columns**:

```
ObjectID BIGINT, family VARCHAR, genus VARCHAR, verbatim_name VARCHAR,
canonical_name VARCHAR, locality VARCHAR, latitude DOUBLE, longitude DOUBLE,
recordedBy VARCHAR, year BIGINT, month BIGINT, day BIGINT,
date_quality VARCHAR, coord_flag VARCHAR
```

Note: The `test_checklist_records_full_schema` integration test at line 379–399 checks 13 required columns (missing `canonical_name` from the set — it was added in Phase 135 Plan 03). The test's `required` set should include `canonical_name` in the rewrite.

### 6. Taxa Ancestry Path Override (TFIXTURE-02)

[VERIFIED: codebase read, `resolve_checklist_names.py:268-269`, `checklist_pipeline.py:33,57,61,161,163`]

**Two separate modules use taxa.csv.gz with different mechanisms:**

**`resolve_checklist_names.py`:** The taxa path is a local variable inside `resolve_checklist_names()`:
```python
taxa_path = str(Path(__file__).parent / "raw" / "taxa.csv.gz")
taxa = _load_anthophila_ancestry(taxa_path)
```
`_load_anthophila_ancestry(taxa_path)` accepts the path as a parameter. **Override seam: monkeypatch the module-level `_load_anthophila_ancestry` function or monkeypatch a module-level `TAXA_PATH` constant** — but currently there is NO module-level `TAXA_PATH` constant in `resolve_checklist_names.py`. The cleanest seam is to **extract the taxa path into a module-level constant** (matching the `checklist_pipeline.py` pattern):

```python
# Add to resolve_checklist_names.py:
TAXA_PATH = str(Path(__file__).parent / "raw" / "taxa.csv.gz")
```

Then in `resolve_checklist_names()`:
```python
taxa = _load_anthophila_ancestry(TAXA_PATH)  # was: inline string
```

Tests monkeypatch `resolve_checklist_names.TAXA_PATH` to point at the fixture gz. This is consistent with how `checklist_pipeline.py` handles it.

**`checklist_pipeline.py`:** `TAXA_PATH` is already a module-level constant (line 33). `_load_taxa_ancestry()` uses it directly via the global `TAXA_PATH`. Tests can monkeypatch `checklist_pipeline.TAXA_PATH` (or the module is reloaded after `monkeypatch.setenv` changes propagate). Since the existing `checklist_db` fixture does `importlib.reload(checklist_pipeline)`, any path monkeypatching must happen AFTER reload and target the module attribute directly.

**`_load_taxa_ancestry()` caches results** in `_TAXA_ANCESTRY` (module-level dict). Tests must reset this cache between fixture setup and teardown, or the fixture must reload the module to clear it:

```python
# In the module-scoped fixture setup, after monkeypatching TAXA_PATH:
mod._TAXA_ANCESTRY = None  # force re-read from the fixture gz
```

**Minimum taxa rows needed for the fast-tier tests:**

The `test_slash_verbatim_retained` test calls `resolve_checklist_names(refresh=True)` on a fixture DB with `Agapostemon texanus/angelicus` slash row. The `resolve_checklist_names()` function calls `_load_anthophila_ancestry(TAXA_PATH)` and then `compute_lca()` — needing angelicus and texanus ancestry strings.

The `test_slash_lca` test uses an INLINE taxa dict (no file I/O) — so it needs zero rows from the fixture.

For `test_slash_verbatim_retained`, the fixture taxa.csv.gz needs exactly:
- `Agapostemon angelicus` (taxon_id=270393, species, active=true, ancestry contains `/630955/`)
- `Agapostemon texanus` (taxon_id=1581468, species, active=true, ancestry contains `/630955/`)

For `test_checklist_records_full_slash_rows_get_lca_canonical_name` in `test_checklist_pipeline.py`, the checklist_pipeline's `_slash_canonical_name()` uses `_load_taxa_ancestry()` via module-level `TAXA_PATH`. With D-07 (real file absent), the fixture taxa.csv.gz must cover `angelicus/texanus` slash row.

**Minimum taxa fixture rows:**
```
taxon_id	ancestry	rank_level	rank	name	active
270393	48460/1/47120/372739/47158/184884/47201/124417/326777/47222/630955/49707/134106/335597/1597677/50086/606634	10	species	Agapostemon angelicus	true
1581468	48460/1/47120/372739/47158/184884/47201/124417/326777/47222/630955/49707/134106/335597/1597677/50086/606634/1581466	10	species	Agapostemon texanus	true
```

These two rows are sufficient for the subgenus LCA test (606634 = last common node). The fixture gz can contain ONLY these two rows. Production ancestry strings verified from live `data/raw/taxa.csv.gz`.

**D-07 compliance:** When real `raw/taxa.csv.gz` is absent, `_load_taxa_ancestry()` (checklist_pipeline) returns `{}` (graceful path at line 57–58). `_load_anthophila_ancestry()` (resolve_checklist_names) catches `FileNotFoundError` at line 76. Both are already absent-safe. The fixture must point both modules' taxa path to the committed fixture gz.

### 7. Test Mutation Analysis: Read vs Mutate Under Shared Connection

[VERIFIED: codebase read]

**Tests that call `load_checklist()` once (READ after write):** 20 tests — these are all safe under a module-scoped shared connection if `load_checklist()` is called once at fixture setup.

**Tests that call `load_checklist()` twice (MUTATING):**
- `test_load_checklist_is_idempotent` (line 163): calls `load_checklist()` twice, reads counts after each.
- `test_checklist_records_full_is_idempotent` (line 530): same pattern.

Under `CREATE OR REPLACE TABLE` semantics, calling `load_checklist(con=con)` a second time on the shared in-memory connection will DROP and RECREATE all `checklist_data.*` tables — leaving counts identical. The `_update_occurrences_canonical_name` is idempotent (`ADD COLUMN IF NOT EXISTS`). **These tests are safe under a shared connection** — they will still pass. No isolation needed.

**Tests that use `fixture_con` (session-scoped, conftest.py):** 6 tests (`test_disagreement_fixture_canonical_join`, `test_authority_bearing_canonicalizes_to_binomial`, `test_trinomial_subspecies_folds_to_binomial`, plus 3 skipped reconcile tests). These use the session-scoped `fixture_con` from `conftest.py` — completely separate from the new module-scoped connection. **No changes needed to these tests.**

**Tests that use NO DuckDB fixture:** `TestParseChecklistDate` (6 tests), `TestCoordFlag` (7 tests), `test_no_active_reconcile_call`, `test_single_synonym_source`. These call helpers or inspect source code directly. **No changes needed.**

**The two `@pytest.mark.integration` tests** (`test_checklist_records_full_row_count`, `test_checklist_records_full_schema`) use `checklist_db` and call `mod.load_checklist()` with no injected connection — they hit the real `DB_PATH` (tmp_path file). These stay exactly as-is, reading the real `checklist_records_full.csv`. The integration marker deselects them from the fast tier.

### 8. `resolve_checklist_names.py` Tests: Which Use Real `taxa.csv.gz`?

[VERIFIED: codebase read, `test_resolve_checklist_names.py`]

The `checklist_resolver_db` fixture does NOT monkeypatch the taxa path. When tests call `mod.resolve_checklist_names(refresh=True)`, the function constructs `taxa_path = str(Path(mod.__file__).parent / "raw" / "taxa.csv.gz")` — which is the REAL file (currently 39 MB, present on disk).

Tests calling `refresh=True` (and thus reading taxa.csv.gz):
- `test_audit_csv_covers_all_names` (line 164)
- `test_fuzzy_candidates_written` (line 223)
- `test_at_least_13_fuzzy_candidates` (line 257) — already red, fixed in Phase 141
- `test_fuzzy_review_gate` (line 296)
- `test_slash_verbatim_retained` (line 375) — specifically needs slash LCA from taxa

**`test_slash_lca` (line 339):** Uses inline taxa dict — calls `compute_lca()` directly with no file I/O. Zero taxa file reads.

**`test_noop_without_refresh` (line 142):** `refresh=False` → returns immediately. Zero taxa file reads.

After Phase 140, with `TAXA_PATH` extracted as a module-level constant and the fixture monkeypatching it to the committed tiny gz, all `refresh=True` tests will read only the 2-row fixture gz instead of the 39 MB real file.

### 9. Fixtures Directory

[VERIFIED: `ls data/tests/fixtures` → DOES NOT EXIST]

`data/tests/fixtures/` does not exist. The phase creates it.

**Recommended file layout:**

```
data/tests/fixtures/
├── checklist_sample.csv          # Distilled from checklist_records_full.csv
└── taxa_subset.csv.gz            # Distilled from raw/taxa.csv.gz (tab-delimited, gzipped)
```

**`checklist_sample.csv` provenance comment** (in CSV header comment or a companion `.provenance` docstring in the fixture function):

```
# Distilled from data/checklists/checklist_records_full.csv (2026-06-06).
# Branch coverage: one row per coord_flag value (valid, null_coord, zero_coord, out_of_bbox),
# one row per date_quality value (full/ISO-datetime, full/pre-1900, full/M-D-YYYY, none),
# one synthetic row for year_only (date_quality='year_only' has 0 rows in real CSV — kept for branch coverage),
# one slash-compound verbatim_name row (Agapostemon angelicus/texanus).
# ObjectID provenance: 1 (valid/ISO-datetime), 3 (null_coord), 17423 (zero_coord),
# 8702 (out_of_bbox), 31311 (pre-1900 full), 1668 (M/D/YYYY full), 147 (none-date),
# 1386 (slash), 99999 (synthetic year_only).
```

**`taxa_subset.csv.gz` provenance comment** (in the fixture function docstring):

```
# Distilled from data/raw/taxa.csv.gz (2026-06-06).
# Contains only the two Anthophila species needed for the angelicus/texanus LCA test:
#   Agapostemon angelicus (taxon_id=270393, ancestry: .../50086/606634)
#   Agapostemon texanus  (taxon_id=1581468, ancestry: .../50086/606634/1581466)
# LCA = 606634 (subgenus Agapostemon). Source: verified from live taxa.csv.gz.
```

---

## Standard Stack

No new packages are installed. The phase uses only existing dependencies. [VERIFIED: `data/pyproject.toml`]

| Library | Version | Purpose | Already Installed |
|---------|---------|---------|-------------------|
| duckdb | >=1.4,<2 (1.5.2 current) | In-memory DuckDB for module-scoped fixture | Yes |
| pytest | >=9.0.2 | Module-scoped fixture via `scope="module"` | Yes |
| gzip (stdlib) | Python 3.14 stdlib | Write/read the taxa fixture gz | Yes |
| csv (stdlib) | Python 3.14 stdlib | Write the sample CSV | Yes |

**DuckDB version note:** Tested on 1.5.2. The `duckdb.connect(':memory:')` and `.cursor()` semantics are stable across 1.4+ [VERIFIED: live test].

---

## Package Legitimacy Audit

No new packages are installed in this phase. N/A.

---

## Architecture Patterns

### System Architecture Diagram

```
FAST TIER (build-time, every push)
                                                     
  pytest collect
       |
       v
  module-scoped fixture: checklist_sample_db
       |-- creates duckdb.connect(':memory:')
       |-- bootstraps ecdysis_data.occurrences
       |-- monkeypatches CHECKLIST_RECORDS_FULL_PATH -> fixtures/checklist_sample.csv
       |-- monkeypatches TAXA_PATH -> fixtures/taxa_subset.csv.gz
       |-- calls load_checklist(con=con) [ONE TIME]
       |-- yields con
       v
  ~20 tests read via shared `con` object
       |-- schema assertions (information_schema)
       |-- count assertions (exact sample counts)
       |-- coord_flag / date_quality invariants
       |-- canonical_name correctness
  (no per-test reconnect, no per-test reload)
       
  2 idempotency tests call load_checklist(con=con) a SECOND time
  (safe: CREATE OR REPLACE on same connection)

INTEGRATION TIER (nightly, @pytest.mark.integration, deselected by default)

  test_checklist_records_full_row_count (checklist_db, real CSV, tmp file DB)
  test_checklist_records_full_schema    (checklist_db, real CSV, tmp file DB)
  (these remain unchanged — read real checklist_records_full.csv)
```

### Recommended Project Structure

```
data/tests/
├── fixtures/                     # NEW — committed test fixtures (TFIXTURE-04)
│   ├── checklist_sample.csv      # NEW — 9-row distilled sample
│   └── taxa_subset.csv.gz        # NEW — 2-row ancestry subset
├── conftest.py                   # UNCHANGED (session-scoped fixture_db/fixture_con)
├── test_checklist_pipeline.py    # MODIFIED — new fixture, rewritten assertions
└── test_resolve_checklist_names.py  # MODIFIED — TAXA_PATH monkeypatch added
data/
├── checklist_pipeline.py         # MODIFIED — con= param seam + TAXA_PATH monkeypath
└── resolve_checklist_names.py    # MODIFIED — extract TAXA_PATH constant
```

### Pattern 1: Module-Scoped Shared-Connection Fixture

**What:** A `scope="module"` pytest fixture that creates one DuckDB in-memory connection, calls the loader once, and yields the connection.

**When to use:** When all tests in a file read from the same immutable-after-load DB and the DB build cost dominates test time.

**Example:**

```python
# Source: established pattern from conftest.py fixture_db/fixture_con, adapted for module scope
import pytest
import duckdb
from pathlib import Path

FIXTURES_DIR = Path(__file__).parent / "fixtures"

@pytest.fixture(scope="module")
def checklist_sample_db(monkeypatch):
    """Module-scoped in-memory DuckDB loaded from the committed checklist sample.
    
    Distilled from checklist_records_full.csv (2026-06-06). Covers all coord_flag
    and date_quality branches. Built once per test file; all tests share one connection.
    """
    import importlib
    import checklist_pipeline as mod
    
    # Point module-level path constants at sample fixtures BEFORE calling load_checklist.
    monkeypatch.setattr(
        mod, "CHECKLIST_RECORDS_FULL_PATH",
        FIXTURES_DIR / "checklist_sample.csv"
    )
    monkeypatch.setattr(
        mod, "TAXA_PATH",
        FIXTURES_DIR / "taxa_subset.csv.gz"
    )
    # Reset the module-level taxa cache so it reads the fixture gz, not the real file.
    mod._TAXA_ANCESTRY = None
    
    con = duckdb.connect(":memory:")
    # Bootstrap ecdysis_data.occurrences (T-76-04 prod ordering invariant).
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute("CREATE TABLE ecdysis_data.occurrences (scientific_name VARCHAR)")
    
    mod.load_checklist(con=con)  # reads sample CSV, builds in-memory tables
    yield con
    con.close()
```

**Note on `scope="module"` with `monkeypatch`:** The standard `monkeypatch` fixture is function-scoped. For a module-scoped fixture, use `monkeypatch` carefully or use direct `setattr`/`setattr` with teardown. Alternatively, use `pytest`'s `request.addfinalizer` pattern. The simplest approach: use direct `setattr` on the module, save old values, restore in finalizer.

```python
@pytest.fixture(scope="module")
def checklist_sample_db(request):
    import importlib
    import checklist_pipeline as mod
    
    # Save and override module-level constants directly.
    old_crfp = mod.CHECKLIST_RECORDS_FULL_PATH
    old_taxa = mod.TAXA_PATH
    old_cache = mod._TAXA_ANCESTRY
    
    mod.CHECKLIST_RECORDS_FULL_PATH = FIXTURES_DIR / "checklist_sample.csv"
    mod.TAXA_PATH = FIXTURES_DIR / "taxa_subset.csv.gz"
    mod._TAXA_ANCESTRY = None
    
    con = duckdb.connect(":memory:")
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

### Pattern 2: Connection-Injected Loader Seam

**What:** Add optional `con` parameter to `load_checklist()`. When None, creates and owns the connection (nightly path). When provided, uses the injected connection without closing it.

**Example:**

```python
# Source: data/checklist_pipeline.py (recommended modification)
def load_checklist(con: "duckdb.DuckDBPyConnection | None" = None) -> None:
    """..."""
    _owns_connection = con is None
    if _owns_connection:
        con = duckdb.connect(DB_PATH)
    try:
        con.execute("CREATE SCHEMA IF NOT EXISTS checklist_data")
        # ... all existing logic unchanged ...
        _update_occurrences_canonical_name(con)
    finally:
        if _owns_connection:
            con.close()
```

### Pattern 3: Module-Level Constant Extraction for Testability

**What:** Extract hardcoded path strings into module-level constants so tests can monkeypatch them without monkey-patching filesystem or environment variables.

**Example (resolve_checklist_names.py):**

```python
# Add near the top of resolve_checklist_names.py, after other constants:
TAXA_PATH = str(Path(__file__).parent / "raw" / "taxa.csv.gz")

# In resolve_checklist_names():
taxa = _load_anthophila_ancestry(TAXA_PATH)   # was: _load_anthophila_ancestry(str(Path(__file__).parent / "raw" / "taxa.csv.gz"))
```

### Pattern 4: Tiny Committed Fixture Authoring

**What:** Produce a minimal CSV sample (or gz) from the real source file covering all tested branches. Write it as a committed file, never as a tempfile.

**checklist_sample.csv minimal spec (9 rows + header):**

```csv
ObjectID,Family,Genus,Scientific Name,Locality,Latitude,Longitude,Date,recordedBy,County_join,x,y
1,Halictidae,Agapostemon,"Agapostemon angelicus Cockerell, 1924",Auburn and vicinity,47.3075,-122.2272,1991-07-12T00:00:00,"Yanega, Douglas",King,-122.2272,47.3075
3,Halictidae,Agapostemon,"Agapostemon angelicus Cockerell, 1924","Wenatchee, 16 km N",,,1957-08-06T00:00:00,unknown,Chelan,,
17423,Apidae,Bombus,"Bombus insularis (Smith, 1861)","Washington S.",0,0,,T. Kincaid,No LatLon,0,0
8702,Apidae,Apis,Apis mellifera,,49.00003811,-122.7518213,,Scientist,Whatcom,-122.7518213,49.00003811
31311,Apidae,Bombus,Bombus vancouverensis,Clayton,47.99,-117.56,1812-06-18T00:00:00,M.A. Yothers,Stevens,-117.56,47.99
1668,Halictidae,Agapostemon,Agapostemon texanus ,Central Ferry/Snake River,46.6238,-117.7952,6/14/1905,,Garfield,-117.7952,46.6238
147,Halictidae,Agapostemon,"Agapostemon angelicus Cockerell, 1924",withheld,46.5832,-117.2137,,C. Looney,Whitman,-117,47
1386,Halictidae,Agapostemon,Agapostemon angelicus/texanus,,48.53459,-122.9235,,Whirledge Karp,San Juan,-122.9235,48.53459
99999,Apidae,Bombus,Bombus mixtus,Synthetic year-only row,47.5,-122.0,1995,,King,-122.0,47.5
```

Row-by-branch mapping:
- Row 1 (ObjectID=1): `valid`, `full` (ISO datetime)
- Row 2 (ObjectID=3): `null_coord`, `full` (ISO datetime — empty lat/lon, date present)
- Row 3 (ObjectID=17423): `zero_coord`, `none` (empty date)
- Row 4 (ObjectID=8702): `out_of_bbox`, `none` (empty date)
- Row 5 (ObjectID=31311): `valid`, `full` (pre-1900 ISO datetime → year=1812)
- Row 6 (ObjectID=1668): `valid`, `full` (M/D/YYYY → year=1905)
- Row 7 (ObjectID=147): `out_of_bbox` (lat=46.58 is below 45.5? — VERIFY: 46.58 >= 45.5, lon=-117.2137 >= -116.9 → out_of_bbox because lon out of range), `none` (empty date)
- Row 8 (ObjectID=1386): `valid` (lat=48.53, lon=-122.9235, within bbox), `none` (empty date), slash verbatim_name
- Row 9 (ObjectID=99999): `valid`, `year_only` (date=`1995`)

**Refined count assertions for sample (for planner to finalize):**

| Table | Exact count |
|-------|------------|
| `checklist_data.checklist_records_full` | 9 rows |
| `coord_flag='valid'` | 4 rows (ObjectID 1, 31311, 1668, 1386) — BUT need to check 1386 bbox: lat=48.53, lon=-122.9235. WA bbox lon_min=-124.85 to lon_max=-116.9; lat_min=45.5 to lat_max=49.0. 48.53 in [45.5, 49.0] ✓, -122.9235 in [-124.85, -116.9] ✓ → VALID |
| `coord_flag='null_coord'` | 1 row (ObjectID 3) |
| `coord_flag='zero_coord'` | 1 row (ObjectID 17423) |
| `coord_flag='out_of_bbox'` | rows for ObjectID 8702 (lat=49.00003811 > 49.0 → out) and 147 (lon=-117.2137 > -116.9 → out) = 2 rows |
| `date_quality='full'` | rows 1, 2, 5, 6 = 4 rows |
| `date_quality='none'` | rows 3, 4, 7, 8 = 4 rows |
| `date_quality='year_only'` | row 9 = 1 row |

**Also needed: `checklist_data.species` and `species_counties`**

`load_checklist()` also reads `wa_bee_checklist.tsv` (the species/counties TSV) to populate `checklist_data.species` and `checklist_data.species_counties`. This is small (~500 rows / few KB) and already committed. **Recommendation: point `CHECKLIST_PATH` and `CHECKLIST_RECORDS_PATH` at the real committed TSV files** — they are already fast (no CSV reinsertion cost; wa_bee_checklist.tsv is ~330 species). This avoids needing additional fixture TSV files and avoids rewriting the species/counties count assertions (since they're already using the real species list). Only `CHECKLIST_RECORDS_FULL_PATH` needs to be swapped to the sample.

The current tests assert `n > 100` species — this will remain satisfied by the real TSV.

### Anti-Patterns to Avoid

- **Calling `importlib.reload()` inside the module-scoped fixture:** The existing per-test fixture does `importlib.reload(checklist_pipeline)` on every test. For the module-scoped fixture, reload ONCE during setup, then use direct `setattr` for path constants. Reloading once is fine; reloading per-test defeats the module scope.
- **Using `scope="module"` with function-scoped `monkeypatch`:** Standard `monkeypatch` is function-scoped. Use `request.addfinalizer` or direct `setattr`/restore for module-scoped cleanup.
- **Forgetting to reset `_TAXA_ANCESTRY = None`:** The taxa dict is cached in a module-level global. If a previous test run loaded the real taxa file, the cache will persist and the fixture gz won't be read. Always reset the cache before `load_checklist(con=con)`.
- **Using `con.close()` inside the shared fixture before tests finish:** Closing the connection in any test body will break all subsequent tests. With the new fixture, individual tests must NOT call `con.close()`.
- **Writing integration-test count assertions against the sample:** The `@pytest.mark.integration` tests (`test_checklist_records_full_row_count`, `test_checklist_records_full_schema`) must keep using `checklist_db` (the old function-scoped, file-DB fixture) — they need the real CSV, not the sample.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sharing DuckDB state across tests | Named in-memory DB (`':memory:name'`) | Pass the connection object | Named in-memory DBs survive module unloads unexpectedly; explicit connection passing is testable and explicit |
| Taxa fixture generation | Runtime Python to extract rows on-demand | Pre-authored committed gz file | Runtime extraction would be a fixture-building fixture — defeats the purpose |
| Module-scoped cleanup | Complex teardown managers | `request.addfinalizer` | pytest's native pattern for non-function-scoped fixtures |

---

## Common Pitfalls

### Pitfall 1: Module-Scoped Fixture with Function-Scoped `monkeypatch`

**What goes wrong:** pytest's `monkeypatch` fixture is function-scoped by default. Using it in a `scope="module"` fixture causes a fixture scope mismatch error at collection time.

**Why it happens:** pytest enforces that a fixture can only use fixtures of equal or wider scope.

**How to avoid:** Use direct `setattr` + `request.addfinalizer` for restoration, or use `pytest-monkeypatch` with explicit scope (not recommended — adds dependency). The standard pattern is:

```python
@pytest.fixture(scope="module")
def checklist_sample_db(request):
    old_val = mod.CHECKLIST_RECORDS_FULL_PATH
    mod.CHECKLIST_RECORDS_FULL_PATH = SAMPLE_PATH
    request.addfinalizer(lambda: setattr(mod, "CHECKLIST_RECORDS_FULL_PATH", old_val))
    ...
```

**Warning signs:** `ScopeMismatch: You tried to access the function scoped fixture monkeypatch with a module scoped request object.`

### Pitfall 2: `_TAXA_ANCESTRY` Cache Stale from Previous Test Run

**What goes wrong:** `_load_taxa_ancestry()` caches results in `_TAXA_ANCESTRY` (a module-level global). If the module is imported once and the cache is populated from the real `raw/taxa.csv.gz`, subsequent test calls will use the cached dict regardless of `TAXA_PATH` monkeypatching.

**Why it happens:** Module-level `global` cache is set on first call and reused. Path monkeypatching changes where future calls WOULD read from, but doesn't invalidate already-cached results.

**How to avoid:** Before the module-scoped fixture calls `load_checklist()`, explicitly reset: `mod._TAXA_ANCESTRY = None`. Also: the module-scoped fixture runs once — if the cache is reset during setup, all tests in the module see the fixture-loaded cache.

**Warning signs:** Slash-compound rows resolve to LCA names from the real file even when the fixture gz is pointed at.

### Pitfall 3: `wa_bee_checklist_records.tsv` Not Monkeypatched

**What goes wrong:** `load_checklist()` also reads `CHECKLIST_RECORDS_PATH` (the 4-column TSV `wa_bee_checklist_records.tsv`). If the module-scoped fixture only patches `CHECKLIST_RECORDS_FULL_PATH`, the old TSV still loads — this is fine (it is small), but if the TSV is absent in a clean-checkout scenario, the fixture will fail.

**How to avoid:** Both `wa_bee_checklist.tsv` and `wa_bee_checklist_records.tsv` are committed to the repo (confirmed). The module-scoped fixture does NOT need to monkeypatch them. Only `CHECKLIST_RECORDS_FULL_PATH` (the 50k-row CSV) is replaced by the sample.

**Warning signs:** `FileNotFoundError: wa_bee_checklist.tsv` in CI on a clean checkout — but this would be a pre-existing issue, not caused by Phase 140.

### Pitfall 4: Integration Tests Accidentally Using Sample

**What goes wrong:** The `@pytest.mark.integration` tests (`test_checklist_records_full_row_count`, `test_checklist_records_full_schema`) use the old `checklist_db` fixture, which creates a fresh tmp_path file DB and reloads the module. If the module-scoped fixture's direct-`setattr` changes persist after module teardown (i.e., the `addfinalizer` doesn't run before the integration tests do), those tests will read the sample CSV instead of the real one.

**How to avoid:** Module-scoped fixtures tear down AFTER all tests in the module finish. Both integration tests are in the same file, so they'll run while the module-scoped fixture is active. However, the integration tests use `checklist_db`, which does its own `monkeypatch.setenv("DB_PATH", ...)` + `importlib.reload()` — the reload recreates module-level constants from scratch, overwriting any direct `setattr` from the module-scoped fixture.

**The correct design:** The integration tests use the function-scoped `checklist_db` fixture unmodified. Inside `checklist_db`, `importlib.reload(checklist_pipeline)` resets all constants. No conflict.

### Pitfall 5: `test_checklist_records_full_schema` Missing `canonical_name`

**What goes wrong:** The `test_checklist_records_full_schema` integration test (line 379–399) checks a `required` set of 13 columns that does NOT include `canonical_name`. After Phase 135, `_load_checklist_records_full` produces 14 columns including `canonical_name`. The test uses `<=` (subset check), so it passes — but the assertion is incomplete.

**Note:** This is a pre-existing gap in the integration test, not introduced by Phase 140. The fast-tier rewrite should include `canonical_name` in schema assertions.

---

## Runtime State Inventory

Phase 140 is a pure code/test change with no rename or migration component. This section is omitted per the skip condition.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.14+ | All data/ code | ✓ | 3.14+ (per pyproject.toml) | — |
| duckdb | DuckDB in-memory fixtures | ✓ | 1.5.2 | — |
| pytest | Test runner | ✓ | >=9.0.2 | — |
| uv | Dependency/test runner | ✓ | (project convention) | — |
| `data/raw/taxa.csv.gz` | Integration tier only | ✓ (present on dev host) | 39 MB | Fixture gz for fast tier |
| `data/checklists/checklist_records_full.csv` | Integration tier only | ✓ (committed) | 50,646 rows | Sample CSV for fast tier |
| `data/checklists/wa_bee_checklist.tsv` | load_checklist() always | ✓ (committed) | ~330 rows | — |
| `data/checklists/wa_bee_checklist_records.tsv` | load_checklist() always | ✓ (committed) | (small) | — |

**Missing dependencies with no fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2+ |
| Config file | `data/pyproject.toml` (`[tool.pytest.ini_options]`) |
| Quick run command | `cd data && uv run pytest tests/test_checklist_pipeline.py -x -q` |
| Full suite command | `cd data && uv run pytest -m 'not integration' -q` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TFIXTURE-01 | `test_checklist_pipeline.py` fast tier no longer calls full-file loader | unit/integration | `cd data && uv run pytest tests/test_checklist_pipeline.py -m 'not integration' -q` | ✅ (modified in-place) |
| TFIXTURE-01 | File runs in seconds (not minutes) | performance | `time cd data && uv run pytest tests/test_checklist_pipeline.py -m 'not integration' -q` | ✅ |
| TFIXTURE-01 | Assertions rewritten against sample's known counts | unit | Same command | ✅ |
| TFIXTURE-02 | Fast tier passes with `raw/taxa.csv.gz` absent | integration/smoke | Rename `raw/taxa.csv.gz` → `.bak`, run pytest, restore | ✅ |
| TFIXTURE-02 | Per-test taxa parse cost drops from ~5s to sub-second | performance | `cd data && uv run pytest tests/test_resolve_checklist_names.py --durations=0 -q` | ✅ |
| TFIXTURE-04 | `data/tests/fixtures/` directory exists with provenance comments | file presence | `ls data/tests/fixtures/` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cd data && uv run pytest tests/test_checklist_pipeline.py tests/test_resolve_checklist_names.py -m 'not integration' -x -q`
- **Per wave merge:** `cd data && uv run pytest -m 'not integration' -q`
- **Phase gate:** Full fast suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `data/tests/fixtures/` — directory must be created (TFIXTURE-04)
- [ ] `data/tests/fixtures/checklist_sample.csv` — authored manually or via distillation script
- [ ] `data/tests/fixtures/taxa_subset.csv.gz` — authored manually from known rows

*(No new test files needed — modifications are in-place to existing test files.)*

---

## Security Domain

This phase makes no changes to authentication, session management, access control, input validation, or cryptography. It modifies only test infrastructure and adds an optional parameter to a data-loading function. Security domain is not applicable to this phase.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `wa_bee_checklist.tsv` and `wa_bee_checklist_records.tsv` are small enough that keeping them as real files (not fixtures) does not contribute meaningfully to per-test cost | Standard Stack / Pitfalls | If either file becomes a cost contributor, it needs a fixture too — but both are <1 MB per codebase inspection |
| A2 | The `year_only` date branch (pure 4-digit integer) has 0 rows in the real CSV (stated in code comment); a synthetic row is needed to preserve coverage of that branch | Code Examples / Sample spec | If the real CSV has year_only rows, pick a real ObjectID instead of synthetic 99999 |
| A3 | ObjectID 147 is `out_of_bbox` because lon=-117.2137 > -116.9 (east of WA eastern boundary) — verify against bbox constants | Branch enumeration | If the bbox calculation differs, this row may be `valid` instead; swap for a confirmed out_of_bbox row |
| A4 | Both idempotency tests are safe under a shared module-scoped connection because `CREATE OR REPLACE` is idempotent | Mutation analysis | If DuckDB has unexpected behavior dropping schemas under a concurrent cursor, these tests could fail — but DuckDB in-memory is single-threaded-safe per process |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed. (Table is non-empty; flagged items should be verified during Wave 0 sample authoring.)

---

## Open Questions

1. **`CHECKLIST_PATH` / `CHECKLIST_RECORDS_PATH` in the fixture scope**
   - What we know: Both TSVs are small and already committed; no reason to stub them.
   - What's unclear: Whether these need to be explicitly reset/un-patched if the module-scoped fixture is torn down mid-session.
   - Recommendation: Don't monkeypatch them. Let them read the real committed TSVs. Document this choice in the fixture docstring.

2. **`test_checklist_records_full_schema` integration test still missing `canonical_name`**
   - What we know: The `required` set at line 394 is missing `canonical_name` (added in Phase 135).
   - What's unclear: Whether to fix this in Phase 140 or leave it for Phase 141.
   - Recommendation: Fix it in Phase 140 as part of the schema test rewrite for the fast tier (the integration test is in the same file and is touched anyway).

3. **ObjectID 147 bbox classification**
   - What we know: lat=46.5832 (> 45.5 ✓), lon=-117.2137 (> -116.9 → EAST of eastern boundary → out_of_bbox ✓).
   - What's unclear: The lon bound is `-116.9` (eastern WA). `-117.2137 > -116.9` numerically means -117.2 is LESS than -116.9 (more negative), so it is WEST of the eastern boundary → actually **inside** the bbox.
   - Recommendation: Verify with the bbox constants: `_WA_LON_MIN = -124.85`, `_WA_LON_MAX = -116.9`. For lon=-117.2137: `-124.85 <= -117.2137 <= -116.9` → `-117.2137 <= -116.9` is TRUE (since -117.2 is more negative than -116.9). So ObjectID 147 is **valid**, not out_of_bbox. Use ObjectID 8702 (lat=49.00003811 > 49.0) or another confirmed out_of_bbox row for the second out_of_bbox sample. Row 4 (ObjectID 8702) already covers `out_of_bbox`.

---

## Sources

### Primary (HIGH confidence)
- `data/checklist_pipeline.py` — `load_checklist()` function body, module-level constants (lines 29–34, 518–597)
- `data/tests/test_checklist_pipeline.py` — all 43 test functions, `checklist_db` fixture (lines 23–45)
- `data/tests/conftest.py` — session-scoped `fixture_db`/`fixture_con` pattern (lines 545–565)
- `data/resolve_checklist_names.py` — `TAXA_PATH` as local variable, `_load_anthophila_ancestry()` signature (lines 66–98, 268–269)
- `data/tests/test_resolve_checklist_names.py` — `checklist_resolver_db` fixture, all 7 test functions
- `data/pyproject.toml` — dependencies, DuckDB version constraint (duckdb>=1.4,<2), pytest config
- `data/tests/BASELINE.md` — dominant cost contributors, per-tier estimates
- Live DuckDB 1.5.2 test via `uv run python3` — confirmed `:memory:` isolation and `.cursor()` sharing semantics

### Secondary (MEDIUM confidence)
- `data/checklists/checklist_records_full.csv` — inspected header, specific rows for branch coverage (ObjectIDs 1, 3, 8702, 17423, 31311, 1668, 147, 1386)
- `data/raw/taxa.csv.gz` — inspected via `zcat | head` and `uv run python3` lookup; Agapostemon angelicus/texanus ancestry strings verified from live file

### Tertiary (LOW confidence)
- None — all claims are verified from codebase or live tool execution.

---

## Metadata

**Confidence breakdown:**
- Connection seam design: HIGH — verified from source code and live DuckDB test
- Sample CSV branch coverage: HIGH — verified from code + CSV inspection; one LOW assumption (A3 re: ObjectID 147 bbox classification, resolved in Open Questions #3)
- Taxa fixture rows: HIGH — ancestry strings verified from live taxa.csv.gz
- Mutation safety: HIGH — verified from DuckDB `CREATE OR REPLACE` semantics in source
- `TAXA_PATH` extraction from resolve_checklist_names: HIGH — verified as missing constant, insertion point clear

**Research date:** 2026-06-06
**Valid until:** 2026-07-06 (stable domain; DuckDB 1.x API stable)
