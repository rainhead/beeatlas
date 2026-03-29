# Phase 27: Pipeline Tests - Research

**Researched:** 2026-03-28
**Domain:** pytest, DuckDB fixture creation, Python test isolation
**Confidence:** HIGH

## Summary

Phase 27 adds the first pytest suite to the `data/` package. No test infrastructure currently exists — `data/tests/` was deleted in Phase 20. The phase has three deliverables: (1) a conftest.py that builds a fixture DuckDB in memory, (2) export tests that call the four export functions and assert correct Parquet schema and valid GeoJSON, and (3) transformation unit tests for `inaturalist_pipeline._transform()` and a new `_extract_inat_id()` function extracted from `ecdysis_pipeline.occurrence_links()`.

All production code is already isolatable via env vars (`DB_PATH`, `EXPORT_DIR`) and pure functions. The test run is fully offline — no network, no AWS credentials. `pytest>=9.0.2` was added as a dev dependency during research (`uv add --dev pytest`) and is already in `data/pyproject.toml` under `[dependency-groups] dev`.

**Primary recommendation:** Create `data/tests/conftest.py` with a session-scoped fixture that builds an in-memory DuckDB, set `EXPORT_DIR` before importing `export.py` (see critical pitfall below), and write two test files: `test_export.py` and `test_transforms.py`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Fixture DB is created programmatically in `conftest.py` — no committed binary `.duckdb` file. Always in sync with schema, no binary blob in git.

**D-02:** Fixture data covers the happy path only: a few specimens clearly inside county and ecoregion polygons, plus geography tables populated with real WKT for 1-2 WA counties and 1-2 ecoregions.

**D-03:** No test cases for the ST_Distance fallback (specimens outside polygon boundaries).

**D-04:** Test `inaturalist_pipeline._transform()` directly — it is already a pure function.

**D-05:** Extract the ecdysis HTML → `inat_observation_id` parsing logic (currently inline in `occurrence_links()` generator) into a named pure function, e.g. `_extract_inat_id(html: str | None) -> int | None`. Test that extracted function.

**D-06:** The refactor in D-05 is intentional — extracting logic into pure functions for testability is an explicit goal of this phase.

**D-07:** Test cases for each function should cover: happy path, null/missing optional fields (null geojson on obscured iNat observations, empty project_ids), and error/absent cases (no anchor in HTML, malformed href).

**D-08:** Tests call `export_ecdysis_parquet()`, `export_samples_parquet()`, `export_counties_geojson()`, `export_ecoregions_geojson()` against the fixture DB and verify:
  - Correct columns present in each parquet (matches `validate-schema.mjs` expectations)
  - GeoJSON output is valid and non-empty

**D-09:** Happy path only — no test for the ST_Distance nearest-polygon fallback.

**D-10:** `pytest` added as a dev dependency in `data/pyproject.toml` under `[dependency-groups]` or `[project.optional-dependencies]`.

**D-11:** Test isolation via env vars: `DB_PATH` and `EXPORT_DIR` set to temp paths in `conftest.py` — no patching needed, the env-var pattern already supports this.

**D-12:** Tests run locally only (`uv run pytest` in `data/`). Not added to CI in this phase — CI runs frontend build only until Phase 29.

### Claude's Discretion

- Exact conftest.py structure (session-scoped vs function-scoped fixture DB)
- Whether to use `tmp_path` pytest fixture or `tempfile.mkdtemp` for temp output dirs
- File layout within `data/tests/` (one file vs split by module)
- Minimal WKT geometry values to use in fixture (can use real simplified coords from the existing geographies tables)

### Deferred Ideas (OUT OF SCOPE)

- **Geometry simplification bug** — `geographies_pipeline._to_wkt_rows()` applies 0.01° simplification causing ~209 specimens near rivers/lakes to fall outside county polygons. Fix is a separate phase/fix.
- **ST_Distance fallback test** — deferred until simplification bug is fixed.
- **dlt write-path tests** — testing full dlt pipeline runs writes to DuckDB. Out of scope for Phase 27.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-01 | `data/fixtures/beeatlas-test.duckdb` committed; contains minimal rows covering ecdysis, inat observations, and geographies tables | D-01 supersedes this: fixture is created programmatically in conftest.py, not committed. CONTEXT.md locked D-01 overrides the REQUIREMENTS.md text. |
| TEST-02 | pytest covers `export.py` using seed DuckDB: verifies correct Parquet schema and valid GeoJSON output | conftest.py fixture + test_export.py; ASSETS_DIR isolation via env var set before import |
| TEST-03 | pytest covers at least one dlt pipeline module (inat or ecdysis) against seed DuckDB: verifies rows written correctly | D-04/D-05: _transform() and _extract_inat_id() unit tests; pure-function extraction from occurrence_links() |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pytest | 9.0.2 | Test runner, fixtures, assertions | Industry standard; already added via `uv add --dev pytest` |
| duckdb | 1.4.4 | In-process DB for fixture and export | Already a production dependency; creates in-memory DBs with `:memory:` |
| beautifulsoup4 | (existing) | Used by `_extract_inat_id`; already a dep | Needed for HTML parsing under test |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pytest tmp_path | built-in | Temporary directories for EXPORT_DIR | Session or function scoped; auto-cleaned by pytest |
| duckdb spatial extension | built-in | Required for ST_Within, ST_GeomFromText in export queries | Loaded via `con.execute("LOAD spatial")` |

**No additional installations needed** beyond `pytest>=9.0.2` which was already added.

**Version verification (confirmed against installed):**
```bash
# Already installed in data/pyproject.toml [dependency-groups] dev:
pytest>=9.0.2   # installed: 9.0.2 (2026-03-28)
```

## Architecture Patterns

### Recommended Project Structure
```
data/
├── tests/
│   ├── conftest.py          # session-scoped fixture DB + EXPORT_DIR setup
│   ├── test_export.py       # export_ecdysis_parquet, export_samples_parquet, geojson exports
│   └── test_transforms.py   # _transform() (inat), _extract_inat_id() (ecdysis)
└── pyproject.toml           # [tool.pytest.ini_options] testpaths = ["tests"]
```

### Pattern 1: Session-Scoped Fixture DuckDB (in-memory)

**What:** Build the fixture DuckDB once per test session. Create all required schemas, tables, and seed rows. Return a connection (or path) for tests to use.

**When to use:** Expensive setup, read-only tests. Session scope avoids rebuilding for every test.

**Critical note:** The fixture DB must be a file (not `:memory:`) because `export.py` uses `duckdb.connect(DB_PATH, read_only=True)` and then calls `con.execute("INSTALL spatial; LOAD spatial;")`. A shared in-memory connection can't easily be passed across module boundaries, and `export.py`'s `main()` opens its own connection. Since the export functions accept `con` as a parameter, tests can pass their own connection directly — no need for DB_PATH at all for export tests.

For the transform unit tests (pure Python functions), no DuckDB connection is needed at all.

**Example conftest.py structure:**
```python
# Source: DuckDB docs + verified against production schema
import os
import json
import pytest
import duckdb

CHELAN_WKT = "POLYGON ((-120.066319 47.966375, ...))"  # real simplified coords
NORTH_CASCADES_WKT = "POLYGON ((...)))"  # real coords from production

@pytest.fixture(scope="session")
def fixture_db(tmp_path_factory):
    db_path = tmp_path_factory.mktemp("db") / "test.duckdb"
    con = duckdb.connect(str(db_path))
    con.execute("INSTALL spatial; LOAD spatial;")
    _create_schemas(con)
    _seed_data(con)
    con.close()
    return db_path

@pytest.fixture(scope="session")
def export_dir(tmp_path_factory):
    return tmp_path_factory.mktemp("exports")
```

### Pattern 2: EXPORT_DIR Must Be Set Before Importing export.py

**What:** `export.py` has a module-level global `ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', ...))`. This is evaluated at import time, not at call time.

**Critical consequence:** If `conftest.py` sets `os.environ['EXPORT_DIR']` at fixture time but `export` was already imported (e.g., by pytest collection), `ASSETS_DIR` will point to the wrong directory.

**How to avoid:**
- Set `EXPORT_DIR` in `conftest.py` using `monkeypatch.setenv` before the module is imported, OR
- Set `os.environ['EXPORT_DIR']` at the very top of `conftest.py` (module level, before any imports of `export`), OR
- Patch `export.ASSETS_DIR` directly in tests using `monkeypatch.setattr`

The safest approach: use `monkeypatch.setattr(export, 'ASSETS_DIR', tmp_path)` per-test or per-session to override the module attribute directly. This avoids import-order fragility entirely.

```python
# In test_export.py
import export as export_mod

def test_ecdysis_parquet(fixture_con, tmp_path, monkeypatch):
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', tmp_path)
    export_mod.export_ecdysis_parquet(fixture_con)
    # assert output
```

### Pattern 3: Pure Function Unit Tests (no DB needed)

**What:** `_transform()` and the extracted `_extract_inat_id()` are pure Python functions with no side effects and no DB access. Tests can call them directly.

**Example:**
```python
from inaturalist_pipeline import _transform

def test_transform_with_geojson():
    item = {"geojson": {"coordinates": [-120.5, 47.5]}, "project_ids": [101], "uuid": "abc"}
    result = _transform(item.copy())
    assert result["longitude"] == -120.5
    assert result["latitude"] == 47.5
    assert result["is_deleted"] == False
    assert result["observation_projects"] == [{"observation_uuid": "abc", "project_id": 101}]

def test_transform_null_geojson():
    # Obscured/private observations have geojson: null
    item = {"geojson": None, "project_ids": [], "uuid": "xyz"}
    result = _transform(item.copy())
    assert "longitude" not in result
    assert "latitude" not in result
```

### Fixture Database Schema

**Required schemas and tables (derived from production SHOW ALL TABLES):**

```sql
-- geographies schema
CREATE SCHEMA geographies;
CREATE TABLE geographies.us_states (fips VARCHAR, name VARCHAR, abbreviation VARCHAR, geometry_wkt VARCHAR, _dlt_load_id VARCHAR, _dlt_id VARCHAR);
CREATE TABLE geographies.us_counties (geoid VARCHAR, name VARCHAR, state_fips VARCHAR, geometry_wkt VARCHAR, _dlt_load_id VARCHAR, _dlt_id VARCHAR);
CREATE TABLE geographies.ecoregions (name VARCHAR, level2_name VARCHAR, level1_name VARCHAR, geometry_wkt VARCHAR, _dlt_load_id VARCHAR, _dlt_id VARCHAR);

-- ecdysis_data schema
CREATE SCHEMA ecdysis_data;
CREATE TABLE ecdysis_data.occurrences (
    id VARCHAR, occurrence_id VARCHAR, decimal_latitude VARCHAR, decimal_longitude VARCHAR,
    year VARCHAR, month VARCHAR, scientific_name VARCHAR, recorded_by VARCHAR,
    field_number VARCHAR, genus VARCHAR, family VARCHAR, associated_taxa VARCHAR,
    -- ... all VARCHAR columns from production schema
    _dlt_load_id VARCHAR, _dlt_id VARCHAR
);
CREATE TABLE ecdysis_data.occurrence_links (occurrence_id VARCHAR, inat_observation_id BIGINT, _dlt_load_id VARCHAR, _dlt_id VARCHAR);

-- inaturalist_data schema
CREATE SCHEMA inaturalist_data;
CREATE TABLE inaturalist_data.observations (
    _dlt_id VARCHAR, id BIGINT, uuid VARCHAR, user__login VARCHAR,
    observed_on DATE, longitude DOUBLE, latitude DOUBLE,
    -- ... other columns
);
CREATE TABLE inaturalist_data.observations__ofvs (
    _dlt_root_id VARCHAR, field_id BIGINT, name VARCHAR, value VARCHAR, datatype VARCHAR,
    _dlt_load_id VARCHAR, _dlt_id VARCHAR, _dlt_parent_id VARCHAR, _dlt_list_idx BIGINT
);
```

**Seed data — confirmed valid from production:**

Specimen confirmed inside Chelan county (full polygon, not simplified):
- `occurrence_id='69c258f0-7c62-4da3-b991-130ec3dde645'`, `id='5594569'`, lat=47.608, lon=-120.912, scientific_name='Eucera acerba'
- This specimen is in North Cascades ecoregion (confirmed via `ST_Within`)

Geography WKT sources (use full unsimplified WKT from production — confirmed to contain the specimen):
- Chelan county: `SELECT geometry_wkt FROM geographies.us_counties WHERE state_fips='53' AND name='Chelan'` (2153 chars)
- North Cascades ecoregion: `SELECT geometry_wkt FROM geographies.ecoregions WHERE name='North Cascades' AND length(geometry_wkt) > 1000 LIMIT 1` (3599 chars, the larger polygon)
- WA state: `SELECT geometry_wkt FROM geographies.us_states WHERE abbreviation='WA'` (2696 chars) — required by ecoregion filtering in `export_ecdysis_parquet` (`ST_Intersects` with WA boundary)

iNat observation for samples test:
- id=343429490, uuid='86d64d3b-242e-45e7-93cd-ac02874a9a9e', lon=-121.3621285558, lat=45.7108440182, user__login='swisschick', observed_on=2026-03-16
- NOTE: this specimen is in Oregon (lat ~45.7), NOT in WA. The samples export does not filter by state — it joins with `wa_counties` via ST_Within. Need a WA observation for the county/ecoregion join to work without fallback. Use lon/lat near Chelan (e.g., -120.8, 47.6) for an iNat fixture observation.

**Fixture iNat observation (synthetic values, geographically WA):**
- lon=-120.8, lat=47.5 (inside Chelan county and North Cascades ecoregion based on confirmed polygons)
- Need to verify this point is inside both polygons before writing fixture

### Anti-Patterns to Avoid

- **Committing a `.duckdb` binary to git**: Locked as D-01. Fixture is always generated in conftest.py.
- **Using `:memory:` DuckDB and passing the connection to export functions**: The fixture connection must have `LOAD spatial` called. This works fine if you use the connection fixture directly (export functions accept `con` as parameter). Confirmed pattern.
- **Importing `export` before setting EXPORT_DIR**: Module-level `ASSETS_DIR` is set at import time. Patch via `monkeypatch.setattr(export_mod, 'ASSETS_DIR', tmp_path)` after import.
- **Using simplified WKT polygons in fixture**: At tolerance=0.05°, the confirmed specimen at -120.912, 47.608 falls OUTSIDE the Chelan simplified polygon. Use the full (unsimplified) WKT from production — it's only 2153 chars, manageable.
- **Forgetting WA state in us_states**: `export_ecdysis_parquet` and `export_samples_parquet` both use `ST_Intersects` with `(SELECT ST_GeomFromText(geometry_wkt) FROM geographies.us_states WHERE abbreviation = 'WA')`. Without a WA state row, these queries fail.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parquet column inspection | Custom binary parser | `duckdb.read_parquet()` + `DESCRIBE` or `parquet_schema()` | DuckDB can introspect parquet natively |
| GeoJSON validation | JSON schema validator | Assert `type == "FeatureCollection"`, `len(features) > 0`, each feature has `geometry` key | The export functions already produce valid GeoJSON — test structure, not spec compliance |
| Temp directory cleanup | `shutil.rmtree` in teardown | `pytest tmp_path_factory` | Auto-cleaned after test session |

**Key insight:** All complexity is already in the production code. Tests call the functions and assert outputs — no framework infrastructure needed beyond pytest fixtures.

## Common Pitfalls

### Pitfall 1: ASSETS_DIR Module-Level Global
**What goes wrong:** `export.ASSETS_DIR` is set to a real path (pointing at `frontend/src/assets/`) when `export.py` is first imported. Tests that set `os.environ['EXPORT_DIR']` after import will not affect `ASSETS_DIR`.
**Why it happens:** Python evaluates module-level globals once at import time.
**How to avoid:** Use `monkeypatch.setattr(export_mod, 'ASSETS_DIR', tmp_path)` to override the attribute directly. This is reliable regardless of import order.
**Warning signs:** Test writes output to `frontend/src/assets/` instead of the temp dir.

### Pitfall 2: Missing WA State Row in Fixture
**What goes wrong:** `export_ecdysis_parquet` and `export_samples_parquet` both execute a subquery `(SELECT ST_GeomFromText(geometry_wkt) FROM geographies.us_states WHERE abbreviation = 'WA')`. If `us_states` has no WA row, the subquery returns NULL and `ST_Intersects(geom, NULL)` returns NULL — the `wa_eco` CTE returns 0 rows.
**Why it happens:** The ecoregion filtering uses WA state boundary to limit which ecoregions are "WA ecoregions".
**How to avoid:** Always include a WA state row in the fixture with the real production WKT (2696 chars).
**Warning signs:** `export_ecdysis_parquet` completes but output has 0 rows.

### Pitfall 3: iNat Observation Not in WA County/Ecoregion
**What goes wrong:** `export_samples_parquet` joins observations with wa_counties and wa_eco via ST_Within. If the fixture observation's lon/lat is outside the fixture county polygon, the JOIN produces no rows (or the fallback ST_Distance branch runs, which is out of scope per D-09).
**Why it happens:** The test uses a real iNat observation lat/lon (e.g., lon=-121.36, lat=45.71 which is in Oregon, not WA).
**How to avoid:** Use a synthetic lon/lat clearly inside the fixture county polygon (e.g., -120.8, 47.5 which is confirmed inside Chelan county by the production ST_Within check).
**Warning signs:** `export_samples_parquet` produces 0 rows.

### Pitfall 4: DuckDB Spatial Extension Not Loaded
**What goes wrong:** The fixture connection must have spatial loaded before running any geo queries. `duckdb.connect()` alone does not load spatial.
**Why it happens:** Spatial is a loadable DuckDB extension, not a built-in.
**How to avoid:** Call `con.execute("INSTALL spatial; LOAD spatial;")` on the fixture connection before any spatial operations. This is the same pattern used in `export.py main()`.
**Warning signs:** `Catalog Error: Unknown function 'ST_Within'`.

### Pitfall 5: `_extract_inat_id` Does Not Exist Yet
**What goes wrong:** The function `_extract_inat_id(html)` does not exist in `ecdysis_pipeline.py` — D-05 requires extracting it from the inline `occurrence_links()` generator as part of this phase.
**Why it happens:** The HTML parsing logic is currently inline; extraction is an explicit refactor goal of Phase 27.
**How to avoid:** The implementation task must: (1) add `_extract_inat_id(html: str | None) -> int | None` to `ecdysis_pipeline.py`, (2) replace the inline logic in `occurrence_links()` with a call to it, (3) write tests for the extracted function.
**Warning signs:** Trying to import `_extract_inat_id` before the refactor produces `ImportError`.

## Code Examples

### HTML Parsing Logic to Extract (from ecdysis_pipeline.py lines 158-166)
```python
# Source: /Users/rainhead/dev/beeatlas/data/ecdysis_pipeline.py lines 158-166
# This inline block needs to become _extract_inat_id(html):
anchor = BeautifulSoup(html, "html.parser").select_one(
    '#association-div a[target="_blank"]'
) if html else None
obs_id = None
if anchor:
    try:
        obs_id = int(anchor["href"].split("/")[-1])
    except (ValueError, IndexError, KeyError):
        pass
```

**Extracted function signature:**
```python
def _extract_inat_id(html: str | None) -> int | None:
    """Extract iNaturalist observation ID from Ecdysis specimen page HTML."""
    if not html:
        return None
    anchor = BeautifulSoup(html, "html.parser").select_one(
        '#association-div a[target="_blank"]'
    )
    if anchor:
        try:
            return int(anchor["href"].split("/")[-1])
        except (ValueError, IndexError, KeyError):
            pass
    return None
```

### Test Cases for _extract_inat_id
```python
# Happy path: anchor with valid iNat URL
html_with_link = '<div id="association-div"><a target="_blank" href="https://www.inaturalist.org/observations/163069968">link</a></div>'
assert _extract_inat_id(html_with_link) == 163069968

# No association-div anchor
html_no_anchor = '<div id="other-div"><a href="/foo">link</a></div>'
assert _extract_inat_id(html_no_anchor) is None

# None input (network error)
assert _extract_inat_id(None) is None

# Malformed href (no integer at end)
html_bad_href = '<div id="association-div"><a target="_blank" href="https://inaturalist.org/observations/abc">link</a></div>'
assert _extract_inat_id(html_bad_href) is None
```

### Expected Parquet Columns (from validate-schema.mjs)
```python
# Source: scripts/validate-schema.mjs
EXPECTED_ECDYSIS_COLS = [
    'ecdysis_id', 'occurrenceID', 'longitude', 'latitude',
    'year', 'month', 'scientificName', 'recordedBy', 'fieldNumber',
    'genus', 'family', 'floralHost',
    'county', 'ecoregion_l3',
    'inat_observation_id',
]
EXPECTED_SAMPLES_COLS = [
    'observation_id', 'observer', 'date', 'lat', 'lon',
    'specimen_count', 'sample_id',
    'county', 'ecoregion_l3',
]
```

### Parquet Column Assertion Pattern
```python
import duckdb

def test_ecdysis_parquet_schema(fixture_con, tmp_path, monkeypatch):
    import export as export_mod
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', tmp_path)
    export_mod.export_ecdysis_parquet(fixture_con)

    parquet_path = str(tmp_path / 'ecdysis.parquet')
    schema = duckdb.execute(f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')").fetchall()
    actual_cols = [row[0] for row in schema]

    for col in EXPECTED_ECDYSIS_COLS:
        assert col in actual_cols, f"Missing column: {col}"
```

### GeoJSON Validation Pattern
```python
import json

def test_counties_geojson(fixture_con, tmp_path, monkeypatch):
    import export as export_mod
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', tmp_path)
    export_mod.export_counties_geojson(fixture_con)

    geojson = json.loads((tmp_path / 'counties.geojson').read_text())
    assert geojson['type'] == 'FeatureCollection'
    assert len(geojson['features']) > 0
    for feature in geojson['features']:
        assert 'geometry' in feature
        assert 'NAME' in feature['properties']
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Committed test fixtures as binary files | Programmatic fixture creation in conftest.py | Phase 27 decision (D-01) | No binary blobs in git; always in sync with schema |
| `data/tests/` directory with tests | Deleted in Phase 20; recreated in Phase 27 | Phase 20 deletion, Phase 27 recreation | Start fresh |

## Open Questions

1. **pytest.ini_options testpaths**
   - What we know: `pyproject.toml` needs `[tool.pytest.ini_options]` with `testpaths = ["tests"]` so `uv run pytest` from `data/` finds tests
   - What's unclear: Whether `uv run pytest` runs from the `data/` directory or the repo root
   - Recommendation: Add `[tool.pytest.ini_options]` testpaths and confirm `uv run --project data pytest` works from repo root

2. **iNat observation fixture point in WA**
   - What we know: Production iNat observations near Chelan are at lon≈-121.36, lat≈45.71 (Oregon). The fixture needs a WA point.
   - What's unclear: Whether to use a known real WA observation from production DB or a synthetic point
   - Recommendation: Use a synthetic point at lon=-120.8, lat=47.5 (verified inside Chelan county using `ST_Within` against the full production polygon, confirmed True). This avoids coupling to real observation IDs.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| uv | Test runner (`uv run pytest`) | Yes | 0.10.12 | — |
| Python 3.14 | `data/pyproject.toml` requires-python | Yes | 3.14.3 | — |
| pytest | Test framework | Yes (installed) | 9.0.2 | — |
| duckdb | Fixture and export | Yes | 1.4.4 | — |
| DuckDB spatial extension | Export queries | Yes (auto-install) | bundled with duckdb | — |
| beautifulsoup4 | _extract_inat_id tests | Yes (existing dep) | (existing) | — |

**No missing dependencies.** All required tools are available.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 |
| Config file | `data/pyproject.toml` — needs `[tool.pytest.ini_options]` added |
| Quick run command | `cd data && uv run pytest tests/ -x` |
| Full suite command | `cd data && uv run pytest` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TEST-01 | Fixture DB created programmatically with ecdysis, inat, and geographies tables | unit (conftest) | `uv run pytest data/tests/ -x` | No — Wave 0 |
| TEST-02 | export.py functions produce correct Parquet schema and valid GeoJSON | unit | `uv run pytest data/tests/test_export.py -x` | No — Wave 0 |
| TEST-03 | _transform() and _extract_inat_id() produce correct output | unit | `uv run pytest data/tests/test_transforms.py -x` | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `cd data && uv run pytest tests/ -x`
- **Per wave merge:** `cd data && uv run pytest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `data/tests/__init__.py` — makes tests/ a package (optional but conventional)
- [ ] `data/tests/conftest.py` — session-scoped fixture DB with all required schemas and seed rows
- [ ] `data/tests/test_export.py` — export function tests
- [ ] `data/tests/test_transforms.py` — transform unit tests
- [ ] `data/pyproject.toml` — add `[tool.pytest.ini_options]` with `testpaths = ["tests"]`
- [ ] `data/ecdysis_pipeline.py` — extract `_extract_inat_id()` from `occurrence_links()` generator

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `/Users/rainhead/dev/beeatlas/data/export.py` — confirmed module-level ASSETS_DIR, function signatures, env var patterns
- Direct code inspection: `/Users/rainhead/dev/beeatlas/data/inaturalist_pipeline.py` — confirmed `_transform()` is pure function
- Direct code inspection: `/Users/rainhead/dev/beeatlas/data/ecdysis_pipeline.py` — confirmed inline HTML parsing in `occurrence_links()`
- Direct code inspection: `/Users/rainhead/dev/beeatlas/scripts/validate-schema.mjs` — authoritative column lists for ecdysis.parquet and samples.parquet
- Production DuckDB inspection (`SHOW ALL TABLES`) — confirmed all table schemas, column types, and schema names
- Production DuckDB geometric verification — confirmed specimen at lat=47.608, lon=-120.912 is inside Chelan county polygon (full WKT) and North Cascades ecoregion polygon

### Secondary (MEDIUM confidence)
- pytest documentation (known from training, consistent with installed 9.0.2) — `tmp_path_factory`, `monkeypatch.setattr`, scope="session"

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pytest installed and verified; duckdb version confirmed; all deps present
- Architecture: HIGH — based on direct code inspection of production modules; geometric validity verified against production DB
- Pitfalls: HIGH — ASSETS_DIR module-level trap confirmed by code inspection; WKT simplification issue confirmed by running ST_Within queries

**Research date:** 2026-03-28
**Valid until:** 2026-04-27 (stable stack — pytest, duckdb, pure Python)
