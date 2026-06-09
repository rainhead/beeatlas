# Phase 141: Built-Asset Fixtures, Red-Test Fixes & Silent-Skip Elimination — Pattern Map

**Mapped:** 2026-06-06
**Files analyzed:** 10 (3 new fixture CSVs + 7 modified test/conftest files)
**Analogs found:** 10 / 10

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `data/tests/fixtures/species_fixture.csv` | fixture data | file-I/O | `data/tests/fixtures/checklist_sample.csv` (provenance header + minimal rows) | exact |
| `data/tests/fixtures/higher_taxa_fixture.csv` | fixture data | file-I/O | `data/tests/fixtures/checklist_sample.csv` (same provenance convention) | exact |
| `data/tests/fixtures/occurrences_fixture.csv` | fixture data | file-I/O | `data/tests/fixtures/checklist_sample.csv` (same provenance convention) | exact |
| `data/tests/test_species_export.py` | test | file-I/O + transform | `data/tests/test_checklist_pipeline.py` `checklist_sample_db` (module-scoped, setattr seam) | role-match |
| `data/tests/test_dbt_synonymy.py` | test | file-I/O | `data/tests/test_species_export.py` (same SANDBOX constant + monkeypatch seam) | exact |
| `data/tests/test_species_maps.py` | test | file-I/O | `data/tests/test_dbt_diff.py` (@integration tagging pattern) | role-match |
| `data/tests/test_resolve_taxon_ids.py` | test | CRUD + request-response | self (extend existing `resolver_db` fixture with 2 schema stubs) | self |
| `data/tests/test_dbt_diff.py` | test | file-I/O | `data/tests/test_checklist_pipeline.py` integration marker pattern (lines 413-430) | role-match |
| `data/tests/test_resolve_checklist_names.py` | test | file-I/O + transform | self (extend `checklist_resolver_db` with `@pytest.mark.integration`) | self |
| `data/tests/test_checklist_pipeline.py` | test | CRUD | self (WR-01/WR-02 hardening — replace reload with save/restore, pin counts) | self |
| `data/tests/conftest.py` | config | event-driven | `data/tests/conftest.py` `_zero_inat_pacing` autouse hook (lines 567-588) | role-match |

---

## Pattern Assignments

### `data/tests/fixtures/species_fixture.csv` (fixture data, file-I/O — CREATE)

**Analog:** `data/tests/fixtures/checklist_sample.csv`

**Provenance header pattern** (from checklist_sample.csv header convention, established in Phase 140 D-10):
```
# Distilled from data/dbt/target/sandbox/species.parquet (2026-06-06).
# Covers: slug assertions (specific_epithet IS NOT NULL), inat_obs_count column presence,
#   _check_slug_collisions (unique genus+epithet pairs), subfamily presence.
# Two rows: one Halictidae, one Apidae — sufficient for collision-clean assertion.
# Columns: all 21 from live parquet (verified via DESCRIBE SELECT * FROM read_parquet(...)).
```

**Minimum column schema** (21 columns, verified from live parquet — RESEARCH §1.1):
```
scientificName,canonical_name,family,subfamily,tribe,genus,subgenus,specific_epithet,on_checklist,status,occurrence_count,specimen_count,provisional_count,first_occurrence_date,last_occurrence_date,month_histogram,county_count,ecoregion_count,checklist_count,inat_obs_count,taxon_id
```

**Minimum row content** (2 rows, from RESEARCH §1.1):
```
Agapostemon subtilior,agapostemon subtilior,Halictidae,Halictinae,Halictini,Agapostemon,,subtilior,true,verified,342,342,0,2010-01-01,2023-12-01,"[0,0,0,12,45,80,90,75,40,0,0,0]",5,2,1,202,1581467
Bombus mixtus,bombus mixtus,Apidae,Apinae,Bombini,Bombus,,mixtus,true,verified,100,50,0,2015-01-01,2023-06-01,"[0,0,0,0,10,30,40,15,5,0,0,0]",8,3,1,50,52775
```

**Pitfall to avoid:** `on_checklist` column is BOOLEAN. Use `read_csv(..., types={'on_checklist': 'BOOLEAN'})` or `CAST(on_checklist AS BOOLEAN)` in the COPY SELECT to avoid silent VARCHAR coercion (RESEARCH Pitfall 3).

---

### `data/tests/fixtures/higher_taxa_fixture.csv` (fixture data, file-I/O — CREATE)

**Analog:** `data/tests/fixtures/checklist_sample.csv`

**Provenance header pattern:**
```
# Distilled from data/dbt/target/sandbox/higher_taxa.parquet (2026-06-06).
# Note: test_higher_taxa_json_written_and_12_subfamilies asserts == 12 subfamilies.
# If this assertion is moved to @integration (open question), fixture needs only >= 2 rows.
# Columns: all 12 from live parquet (verified via DESCRIBE SELECT * FROM read_parquet(...)).
```

**Minimum column schema** (12 columns, verified from live parquet — RESEARCH §1.1):
```
taxon_id,rank,name,family,subfamily,tribe,genus,specimen_count,inat_obs_count,occurrence_count,species_count,member_taxon_ids
```

**Planner decision required (RESEARCH open question #2):** The `== 12` subfamilies assertion needs exactly 12 distinct `rank='subfamily'` rows in this fixture, which requires extracting real subfamily names from the live parquet. If that assertion is moved to `@integration`, 2 rows suffice. Planner should resolve this before writing the fixture.

---

### `data/tests/fixtures/occurrences_fixture.csv` (fixture data, file-I/O — CREATE)

**Analog:** `data/tests/fixtures/checklist_sample.csv`

**Provenance header pattern:**
```
# Distilled from data/dbt/target/sandbox/occurrences.parquet (2026-06-06).
# Covers: test_occurrences_has_agapostemon_subtilior (canonical_name='agapostemon subtilior' COUNT >= 1)
#         test_occurrences_has_no_agapostemon_texanus (canonical_name='agapostemon texanus' COUNT == 0)
# One row: agapostemon subtilior. Zero rows: agapostemon texanus.
# Full 33-column schema not used in CSV — fixture builder uses CREATE TABLE + INSERT approach
# to avoid brittle 33-column CSV. See fixture builder pattern in test_dbt_synonymy.py.
```

**Recommended approach** (from RESEARCH §1.2): Instead of a full 33-column CSV, use an in-fixture CREATE TABLE + INSERT + COPY pattern. Only `canonical_name` is asserted on. The fixture function creates a minimal-schema DuckDB table and COPYs it to parquet:

```python
con = duckdb.connect()
con.execute("CREATE TABLE occ (canonical_name VARCHAR)")
con.execute("INSERT INTO occ VALUES ('agapostemon subtilior')")
con.execute(f"COPY occ TO '{sandbox}/occurrences.parquet' (FORMAT PARQUET)")
```

This avoids maintaining a 33-column CSV stub for a 1-column assertion.

---

### `data/tests/test_species_export.py` (test, file-I/O + transform — MODIFY)

**Analog:** `data/tests/test_checklist_pipeline.py` `checklist_sample_db` fixture (lines 60–126)

**What to add:** A `sandbox_parquet` pytest fixture that builds parquet files from committed CSVs in a tmp dir and redirects the module-level `DBT_SANDBOX_DIR` and `ASSETS_DIR` constants via `monkeypatch.setattr`.

**Key seam — module-level constant** (`data/species_export.py` lines 45–48):
```python
DBT_SANDBOX_DIR = Path(os.environ.get(
    'DBT_SANDBOX_DIR',
    str(Path(__file__).parent / 'dbt' / 'target' / 'sandbox'),
))
```
`monkeypatch.setenv` alone is insufficient — the constant is read once at import. Must use `monkeypatch.setattr(se_mod, 'DBT_SANDBOX_DIR', new_path)`.

**Parquet fixture builder pattern** (from RESEARCH §7 / Phase 140 Pattern B):
```python
FIXTURES_DIR = Path(__file__).parent / "fixtures"

@pytest.fixture
def sandbox_parquet(tmp_path, monkeypatch):
    """Create tmp sandbox with parquet fixtures built from committed CSVs (D-01).

    Distilled CSVs in data/tests/fixtures/ → COPY to tmp_path/sandbox/*.parquet.
    Redirects se_mod.DBT_SANDBOX_DIR (module-level constant) via monkeypatch.setattr.
    monkeypatch.setenv('DBT_SANDBOX_DIR', ...) is insufficient — constant is read at import.
    """
    import duckdb as _duckdb
    import species_export as se_mod

    sandbox = tmp_path / "sandbox"
    sandbox.mkdir()

    con = _duckdb.connect()
    con.execute(f"""
        COPY (
            SELECT * REPLACE (CAST(on_checklist AS BOOLEAN) AS on_checklist)
            FROM read_csv('{FIXTURES_DIR}/species_fixture.csv', header=True, auto_detect=True)
        )
        TO '{sandbox}/species.parquet' (FORMAT PARQUET)
    """)
    con.execute(f"""
        COPY (SELECT * FROM read_csv('{FIXTURES_DIR}/higher_taxa_fixture.csv', header=True, auto_detect=True))
        TO '{sandbox}/higher_taxa.parquet' (FORMAT PARQUET)
    """)
    con.close()

    monkeypatch.setattr(se_mod, 'DBT_SANDBOX_DIR', sandbox)
    monkeypatch.setattr(se_mod, 'ASSETS_DIR', tmp_path)
    return sandbox
```

**Guard removal:** Replace `@_SANDBOX_GUARD` and `@_HIGHER_TAXA_GUARD` decorators on the 7 affected tests with the `sandbox_parquet` fixture parameter. The guards become obsolete once the fixture provides the parquet files.

**Existing test body pattern to preserve** (`data/tests/test_species_export.py` lines 49–63):
```python
@_SANDBOX_GUARD
def test_slug_hierarchical(tmp_path, monkeypatch):
    monkeypatch.setattr(se_mod, 'ASSETS_DIR', tmp_path)
    monkeypatch.setenv('DBT_SANDBOX_DIR', str(SANDBOX))
    con = duckdb.connect()
    export_species_parquet(con)
    rows = duckdb.execute(
        f"SELECT slug, genus, specific_epithet FROM read_parquet('{tmp_path}/species.parquet')"
        " WHERE specific_epithet IS NOT NULL LIMIT 20"
    ).fetchall()
```

After migration, `sandbox_parquet` provides the SANDBOX path; tests drop `monkeypatch.setenv` and `monkeypatch.setattr(se_mod, 'ASSETS_DIR', ...)` (the fixture handles both). The `export_species_parquet(con)` call reads from `se_mod.DBT_SANDBOX_DIR` (now pointing at `tmp_path/sandbox/`) and writes to `se_mod.ASSETS_DIR` (now `tmp_path`).

**`test_taxon_id` disposition** (open question from RESEARCH §8.1): This test reads `SPECIES_JSON` (`public/data/species.json`) via `_SPECIES_JSON_GUARD`. Tag `@pytest.mark.integration` — `species.json` is produced by `species_export.py` which itself needs the sandbox parquet; it's a downstream artifact.

---

### `data/tests/test_dbt_synonymy.py` (test, file-I/O — MODIFY)

**Analog:** `data/tests/test_species_export.py` (same SANDBOX constant pattern + same monkeypatch seam shape)

**Key difference from test_species_export.py:** `SANDBOX` in `test_dbt_synonymy.py` is defined in the test file itself (not in a production module), so the monkeypatch target is the test module:

```python
# From test_dbt_synonymy.py lines 21-30:
SANDBOX = Path(__file__).resolve().parent.parent / "dbt" / "target" / "sandbox"
_SANDBOX_GUARD = pytest.mark.skipif(
    not (SANDBOX / "occurrences.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)
```

**Seam for test file constant** (RESEARCH §1.2, Pitfall 2):
```python
# In the fixture — import the test module and patch its SANDBOX constant:
import tests.test_dbt_synonymy as synonymy_mod   # or use sys.modules
monkeypatch.setattr(synonymy_mod, 'SANDBOX', tmp_sandbox)
```

**Occurrences parquet builder** (minimal-schema in-test approach — RESEARCH §1.2):
```python
@pytest.fixture
def synonymy_sandbox(tmp_path, monkeypatch):
    """tmp sandbox with minimal occurrences.parquet and species.parquet (D-01).

    occurrences.parquet: only canonical_name column needed for the 3 assertions.
    species.parquet: reuse the same species_fixture.csv from test_species_export.
    Patches test_dbt_synonymy.SANDBOX so read_parquet() calls hit tmp_path.
    """
    import duckdb as _duckdb

    sandbox = tmp_path / "sandbox"
    sandbox.mkdir()

    con = _duckdb.connect()
    # occurrences: minimal schema — only canonical_name asserted
    con.execute("CREATE TABLE occ_staging (canonical_name VARCHAR)")
    con.execute("INSERT INTO occ_staging VALUES ('agapostemon subtilior')")
    con.execute(f"COPY occ_staging TO '{sandbox}/occurrences.parquet' (FORMAT PARQUET)")

    # species: reuse committed CSV (inat_obs_count column required)
    con.execute(f"""
        COPY (SELECT * REPLACE (CAST(on_checklist AS BOOLEAN) AS on_checklist)
              FROM read_csv('{FIXTURES_DIR}/species_fixture.csv', header=True, auto_detect=True))
        TO '{sandbox}/species.parquet' (FORMAT PARQUET)
    """)
    con.close()

    import data.tests.test_dbt_synonymy as m
    monkeypatch.setattr(m, 'SANDBOX', sandbox)
    return sandbox
```

**Guard removal:** Drop `@_SANDBOX_GUARD` and `@_SPECIES_GUARD` on all 3 tests. Accept `synonymy_sandbox` as a fixture parameter instead.

---

### `data/tests/test_species_maps.py` (test, file-I/O — MODIFY)

**Analog:** `data/tests/test_checklist_pipeline.py` lines 413–430 (`@pytest.mark.integration` pattern on individual tests)

**Current guard** (lines 347–348):
```python
if not real_parquet.exists():
    pytest.skip("species.parquet not found — run species-export first")
```

**Fix (RESEARCH §1.3, D-05):** Tag the test `@pytest.mark.integration` and remove the inline `pytest.skip`. The `addopts = -m "not integration"` in `data/pyproject.toml` deselects it from the fast tier (deselected, not skipped). The inline skip is an asset-driven skip that would trigger the D-05 conftest guard if left in the fast tier.

**Integration marker pattern** (from `data/tests/test_checklist_pipeline.py` lines 413–430):
```python
@pytest.mark.integration
def test_generate_group_maps_emits_subfamily_svgs(tmp_path, monkeypatch):
    """... real parquet (species.parquet) must exist — runs in nightly integration tier.

    [integration] species.parquet absent — run `uv run python data/species_export.py` first
    """
    import os
    species_parquet = os.environ.get(...)
    real_parquet = Path(species_parquet) / 'species.parquet'
    if not real_parquet.exists():
        pytest.skip("[integration] species.parquet absent — run species-export first")
    ...
```

The remaining `pytest.skip` (after tagging `@integration`) is a **loud guard** for someone who runs `-m integration` without first building — acceptable per D-04 pattern.

---

### `data/tests/test_resolve_taxon_ids.py` (test, CRUD — MODIFY)

**Analog:** self — extend the existing `resolver_db` fixture (lines 49–87)

**Current fixture** (`data/tests/test_resolve_taxon_ids.py` lines 49–87):
```python
@pytest.fixture
def resolver_db(tmp_path, monkeypatch):
    ...
    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA checklist_data")
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute("CREATE SCHEMA inaturalist_data")
    con.execute("CREATE TABLE checklist_data.species (canonical_name TEXT)")
    con.execute("CREATE TABLE ecdysis_data.occurrences (canonical_name TEXT)")
    con.execute("CREATE SCHEMA inat_obs_data")
    con.execute("CREATE TABLE inat_obs_data.observations (canonical_name TEXT)")
    # Bridge created lazily by resolve_taxon_ids via CREATE TABLE IF NOT EXISTS.
    con.close()
    return db_path, resolve_taxon_ids
```

**Fix — add 2 missing schemas** (RESEARCH §2.3, verified working):
```python
    # D-06: dbt_sandbox.occurrence_synonyms — queried by _names_to_resolve UNION arm.
    # Empty table is correct: the UNION arm returns 0 rows, which is expected in isolation.
    con.execute("CREATE SCHEMA dbt_sandbox")
    con.execute("""
        CREATE TABLE dbt_sandbox.occurrence_synonyms (
            synonym TEXT,
            accepted_name TEXT,
            source TEXT
        )
    """)
    # inaturalist_waba_data.observations — queried by 5th UNION arm in _names_to_resolve.
    con.execute("CREATE SCHEMA inaturalist_waba_data")
    con.execute(
        "CREATE TABLE inaturalist_waba_data.observations (taxon__name TEXT)"
    )
```

Insert both blocks immediately after `con.execute("CREATE TABLE inat_obs_data.observations ...")` and before `con.close()`. No other changes needed — the fix is additive.

**Table shape source:** `data/dbt/seeds/occurrence_synonyms.csv` header `synonym,accepted_name,source` (verified). The `_names_to_resolve` SQL queries only `accepted_name` from this table; the `synonym` and `source` columns are structural completeness.

---

### `data/tests/test_dbt_diff.py` (test, file-I/O — MODIFY)

**Analog:** `data/tests/test_checklist_pipeline.py` lines 413–430 (module-level `pytestmark` + per-test `@pytest.mark.integration`)

**Current structure** (`data/tests/test_dbt_diff.py` lines 27–37):
```python
_SANDBOX_GUARD = pytest.mark.skipif(
    not (SANDBOX / "occurrences.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)

@_SANDBOX_GUARD
def test_occurrences_row_count_matches():
    ...
```

**Fix — module-level pytestmark** (RESEARCH §3.3, D-04):
```python
import pytest
pytestmark = pytest.mark.integration
```

Add this at the top of the file (after imports). This is the cleanest approach — no per-test decorator needed; all 15 tests in the file become `@integration` automatically.

**Harden the `_SANDBOX_GUARD`** (keep it as a loud guard for `-m integration` without built assets):
```python
# After pytestmark — guard fires only when explicitly running -m integration without assets.
_SANDBOX_GUARD = pytest.mark.skipif(
    not (SANDBOX / "occurrences.parquet").exists(),
    reason="[integration] sandbox outputs absent — run `bash data/dbt/run.sh build` first",
)
```

The `[integration]` prefix signals this skip is expected in the integration tier when assets are absent — it's loud and actionable, not silent. The D-05 conftest guard should not fail on skips from tests marked `@integration`.

**Inline skipif guards** (for `test_counties_geojson_feature_count_matches`, etc.): replace with `_SANDBOX_GUARD` or a `PUBLIC_GUARD` as appropriate. All remain in the file but the `pytestmark` ensures they're deselected from the fast tier regardless.

---

### `data/tests/test_resolve_checklist_names.py` (test, file-I/O — MODIFY)

**Analog:** self (`checklist_resolver_db` fixture) + `data/tests/test_checklist_pipeline.py` lines 413–430 (`@pytest.mark.integration` pattern)

**Current `test_at_least_13_fuzzy_candidates`** (diagnosed in RESEARCH §4):

Root cause: `checklist_resolver_db` seeds `checklist_data.checklist_records_full` with 4 rows and no `inaturalist_data.canonical_to_taxon_id` bridge table. The fuzzy pool is built from the bridge → empty bridge → 0 candidates.

**Fix (D-07 — fix honestly, RESEARCH §4.2):** Tag `@pytest.mark.integration`. The `>= 13` threshold is correct for the full dataset; it is meaningless against the 4-row fixture.

```python
@pytest.mark.integration
def test_at_least_13_fuzzy_candidates(checklist_resolver_db, monkeypatch):
    """[integration] Requires real DB with populated bridge table.
    ...
    """
```

The `checklist_resolver_db` fixture is function-scoped with `monkeypatch`, so it can still be used in an `@integration` test. No fixture changes needed.

**`TAXA_PATH` redirect** (already present from Phase 140 — verify it's there):
```python
# data/tests/test_resolve_checklist_names.py lines 105-106 (already merged in Phase 140):
monkeypatch.setattr(resolve_checklist_names, "TAXA_PATH",
                    str(FIXTURES_DIR / "taxa_subset.csv.gz"))
```
Confirmed present — no change needed for this line.

---

### `data/tests/test_checklist_pipeline.py` (test, CRUD — MODIFY)

**Analog:** self — WR-01 and WR-02 hardening against the existing `checklist_db` fixture (lines 33–57) and `checklist_sample_db` fixture (lines 60–126)

**WR-01 fix (D-08) — replace importlib.reload with save/restore:**

Current `checklist_db` fixture (lines 33–57):
```python
@pytest.fixture
def checklist_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "checklist.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)
    import importlib
    import checklist_pipeline
    importlib.reload(checklist_pipeline)          # <-- HAZARD: resets all module-level constants
    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute("CREATE TABLE ecdysis_data.occurrences (scientific_name VARCHAR)")
    con.close()
    return db_path, checklist_pipeline
```

**Fix — save/restore pattern** (mirrors `checklist_sample_db` teardown at lines 117–125):
```python
@pytest.fixture
def checklist_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "checklist.duckdb")
    monkeypatch.setenv("DB_PATH", db_path)

    import checklist_pipeline as mod

    # Save module-level constants that importlib.reload used to reset.
    # Use save/restore instead of reload to avoid clobbering checklist_sample_db patches
    # when tests run in random order (WR-01 / D-08).
    old_db_path = mod.DB_PATH

    # Redirect DB_PATH on the module (reload was doing this via env-var re-read).
    mod.DB_PATH = db_path

    con = duckdb.connect(db_path)
    con.execute("CREATE SCHEMA ecdysis_data")
    con.execute("CREATE TABLE ecdysis_data.occurrences (scientific_name VARCHAR)")
    con.close()

    yield db_path, mod

    # Restore.
    mod.DB_PATH = old_db_path
```

Note: `monkeypatch` handles env restoration automatically at function scope teardown. Only `mod.DB_PATH` needs explicit restore because it's a module-level attribute.

**WR-02 fix (D-09) — pin exact counts:**

Current (lines 167, 209):
```python
assert n >= 1, f"expected at least 1 distinct species, got {n}"
assert n >= 1, f"expected at least 1 (species, county) row, got {n}"
```

Fix (exact counts from `wa_bee_checklist_sample.tsv`, verified in 140-REVIEW.md):
```python
assert n == 6, f"expected exactly 6 distinct species in sample fixture, got {n}"
assert n == 8, f"expected exactly 8 (species, county) rows in sample fixture, got {n}"
```

**Context:** These assertions are in `test_load_checklist_populates_species_rows` (line 167) and `test_load_checklist_creates_species_counties_table` (line 209) respectively, both using `checklist_sample_db`.

---

### `data/tests/conftest.py` (config, event-driven — MODIFY)

**Analog:** `data/tests/conftest.py` lines 567–588 (`_zero_inat_pacing` autouse hook — same file, same pattern of a hook function with try/except and conditional patching)

**D-05 hook — add after the `_zero_inat_pacing` fixture** (RESEARCH §5.2, Pitfall 5):

```python
# data/tests/conftest.py — add after _zero_inat_pacing (line ~588)

# D-05: Strings that identify asset-driven skips (built outputs, not platform limits).
# Tests that skip for these reasons must either have a committed fixture or be @integration.
_ASSET_SKIP_SIGNATURES = (
    "run `bash data/dbt/run.sh build`",
    "run species-export first",
    "run `uv run python data/species_export.py`",
)


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """D-05: Fail the fast tier if a non-@integration test skips due to a missing built asset.

    A skip in the fast-tier summary is a defect, not an acceptable degraded pass.
    Only fires on 'setup' and 'call' phases (not 'teardown').
    Does not fire on xfail outcomes (wasxfail attribute present).
    Does not fire on tests marked @pytest.mark.integration (deselected, not skipped).
    """
    outcome = yield
    report = outcome.get_result()

    if not report.skipped:
        return
    if hasattr(report, "wasxfail"):
        return  # xfail — expected failure, not an asset-driven skip
    if any(marker.name == "integration" for marker in item.iter_markers()):
        return  # @integration tests are allowed to skip loudly when assets are absent

    reason = str(getattr(report, "longrepr", ""))
    if any(sig in reason for sig in _ASSET_SKIP_SIGNATURES):
        outcome.force_exception(
            pytest.fail.Exception(
                f"[D-05 GUARD] Asset-driven skip in fast tier (non-@integration test). "
                f"Fix: add a committed fixture (D-01) or tag @pytest.mark.integration.\n"
                f"Original skip reason: {reason}"
            )
        )
```

**Critical implementation note (RESEARCH Pitfall 5):** `pytest_runtest_makereport` must use `@pytest.hookimpl(hookwrapper=True)` and `outcome = yield` to intercept and mutate the report. A plain function (no `hookwrapper=True`) is called but its return value is ignored — the guard would silently do nothing.

**Existing autouse fixture for reference** (lines 567–588):
```python
@pytest.fixture(autouse=True)
def _zero_inat_pacing(monkeypatch):
    """Zero iNat retry/pacing constants so tests don't real-time-sleep."""
    try:
        import inaturalist_pipeline
    except ImportError:
        return
    monkeypatch.setattr(inaturalist_pipeline, "_INAT_PACE_SECONDS", 0.0, raising=False)
    ...
```

The D-05 hook goes in the same file, below this fixture, as a module-level function (not a fixture).

---

## Shared Patterns

### Pattern A: `monkeypatch.setattr` on module-level Path constant (function-scoped fixtures)

**Source:** `data/tests/test_checklist_pipeline.py` lines 86–100 (`checklist_resolver_db`, `checklist_sample_db`); `data/tests/test_resolve_checklist_names.py` lines 89–106
**Apply to:** `sandbox_parquet` (test_species_export.py), `synonymy_sandbox` (test_dbt_synonymy.py)

```python
monkeypatch.setattr(se_mod, 'DBT_SANDBOX_DIR', sandbox)   # Path, not str
monkeypatch.setattr(se_mod, 'ASSETS_DIR', tmp_path)
```

**Key:** `monkeypatch.setenv` alone does NOT work — module-level `Path(os.environ.get(...))` is evaluated once at import. `setattr` on the module object is required.

### Pattern B: DuckDB COPY CSV → Parquet

**Source:** RESEARCH §7 (Architecture Patterns). No existing analog in codebase — new for Phase 141.
**Apply to:** `sandbox_parquet` fixture, `synonymy_sandbox` fixture

```python
con = duckdb.connect()
con.execute(f"""
    COPY (SELECT * FROM read_csv('{csv_path}', header=True, auto_detect=True))
    TO '{parquet_path}' (FORMAT PARQUET)
""")
```

For BOOLEAN columns: `CAST(on_checklist AS BOOLEAN)` in the SELECT to prevent VARCHAR coercion.

### Pattern C: `request.addfinalizer` + direct `setattr` (module-scoped fixtures)

**Source:** `data/tests/test_checklist_pipeline.py` lines 117–125 (`checklist_sample_db` teardown)
**Apply to:** Any future module-scoped fixtures (not needed for Phase 141 — all new fixtures are function-scoped)

```python
def teardown():
    mod.SOME_PATH = old_path
    con.close()
request.addfinalizer(teardown)
```

### Pattern D: `@pytest.mark.integration` + loud guard for nightly-only tests

**Source:** `data/tests/test_checklist_pipeline.py` lines 413–430; `data/pyproject.toml` `addopts = -m "not integration"`
**Apply to:** `test_dbt_diff.py` (all tests via `pytestmark`), `test_species_maps.py::test_generate_group_maps_emits_subfamily_svgs`, `test_resolve_checklist_names.py::test_at_least_13_fuzzy_candidates`, `test_species_export.py::test_taxon_id`

```python
# Module-level (test_dbt_diff.py):
pytestmark = pytest.mark.integration

# Per-test:
@pytest.mark.integration
def test_foo():
    if not asset.exists():
        pytest.skip("[integration] asset absent — run build first")
    ...
```

The `[integration]` prefix in the skip reason is a convention for the D-05 guard to recognize as a legitimate (non-fast-tier) skip.

### Pattern E: `@pytest.hookimpl(hookwrapper=True)` for report mutation

**Source:** Standard pytest API; no existing example in the codebase.
**Apply to:** `pytest_runtest_makereport` hook in `data/tests/conftest.py`

```python
@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    # ... mutate report
```

---

## No Analog Found

No files in Phase 141 are entirely without analog. All patterns have direct precedent in the existing codebase or in Phase 140's established patterns.

---

## Metadata

**Analog search scope:** `data/tests/`, `data/tests/fixtures/`, `data/species_export.py`, `data/tests/conftest.py`, `data/tests/test_checklist_pipeline.py`, `data/tests/test_resolve_taxon_ids.py`, `data/tests/test_dbt_diff.py`, `data/tests/test_dbt_synonymy.py`, `data/tests/test_species_export.py`, `data/tests/test_resolve_checklist_names.py`, `data/tests/test_species_maps.py`
**Files read:** 11 source files
**Pattern extraction date:** 2026-06-06
