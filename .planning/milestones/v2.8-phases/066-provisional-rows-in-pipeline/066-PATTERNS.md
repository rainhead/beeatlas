# Phase 66: Provisional Rows in Pipeline — Pattern Map

**Mapped:** 2026-04-20
**Files analyzed:** 5
**Analogs found:** 5 / 5 (all files are modifications of existing files — each file is its own analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/waba_pipeline.py` | config/pipeline | batch | `data/waba_pipeline.py` (self) | self |
| `data/export.py` | service | batch/transform | `data/export.py` (self) | self |
| `data/tests/conftest.py` | test fixture | batch | `data/tests/conftest.py` (self) | self |
| `data/tests/test_export.py` | test | request-response | `data/tests/test_export.py` (self) | self |
| `scripts/validate-schema.mjs` | config/gate | batch | `scripts/validate-schema.mjs` (self) | self |

All five files are modifications to existing files. The patterns below are extracted directly from each file's current implementation.

---

## Pattern Assignments

### `data/waba_pipeline.py` — add `taxon.ancestors` to DEFAULT_FIELDS

**Change:** Append `taxon.ancestors.rank,taxon.ancestors.name` to the `DEFAULT_FIELDS` string.

**Imports pattern** (lines 1-7):
```python
import os
from pathlib import Path
from typing import Any, Dict

import dlt
from dlt.sources.rest_api import RESTAPIConfig, rest_api_resources
```

**Core pattern — DEFAULT_FIELDS** (lines 29-41):
```python
DEFAULT_FIELDS = (
    "id,uuid,observed_on,created_at,updated_at,quality_grade,"
    "taxon.id,taxon.name,taxon.rank,"
    "taxon.iconic_taxon_name,taxon.threatened,taxon.endemic,taxon.introduced,"
    "place_guess,geojson.coordinates,"
    "user.id,user.login,"
    "description,obscured,geoprivacy,"
    "positional_accuracy,captive,out_of_range,"
    "num_identification_agreements,num_identification_disagreements,"
    "license_code,"
    "ofvs.uuid,ofvs.field_id,ofvs.name,ofvs.value,ofvs.datatype,"
    "project_ids"
)
```

**After change:** Add `"taxon.ancestors.rank,taxon.ancestors.name,"` before `"ofvs.uuid,..."`. dlt will normalize the `taxon.ancestors` array into a child table named `inaturalist_waba_data.observations__taxon__ancestors` with columns `_dlt_root_id`, `_dlt_parent_id`, `_dlt_id`, `_dlt_list_idx`, `rank`, `name`.

**Join key convention** (verified against production `observations__ofvs`):
```sql
-- _dlt_root_id = parent._dlt_id for write_disposition='merge' child tables
JOIN inaturalist_waba_data.observations__ofvs ofv
    ON ofv._dlt_root_id = waba._dlt_id
    AND ofv.field_id = 18116
```
Apply the same pattern to `observations__taxon__ancestors`.

---

### `data/export.py` — restructure `joined` CTE into UNION ALL + add new columns

**Imports pattern** (lines 1-17 — unchanged):
```python
import json
import os
from pathlib import Path

import duckdb

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
_default_assets = str(Path(__file__).parent.parent / 'frontend' / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))
```

**Existing CTE structure to restructure** (lines 102-118):

The existing `joined` CTE is a single `FULL OUTER JOIN ecdysis_base × samples_base`. It must become two CTEs: `combined` (a UNION ALL of the Ecdysis-arm and the provisional-arm) and `joined` (wraps `combined` with `ROW_NUMBER() OVER ()`).

```sql
-- CURRENT (lines 102-118): one CTE, ROW_NUMBER inside
joined AS (
    SELECT
        ROW_NUMBER() OVER () AS _row_id,
        e.ecdysis_id,
        ...
        s.observation_id, s.observer, s.specimen_count, s.sample_id
    FROM ecdysis_base e
    FULL OUTER JOIN samples_base s ON e.host_observation_id = s.observation_id
)
```

**New structure — `combined` + `joined` wrapping**:
```sql
-- ARM 1: specimen_obs_base (LEFT JOIN ancestors for D-02..D-05)
-- Used within ecdysis_base rows AND as the source for provisional rows
specimen_obs_base AS (
    SELECT
        waba.id                          AS waba_obs_id,
        waba._dlt_id                     AS waba_dlt_id,
        waba.user__login                 AS specimen_inat_login,
        waba.taxon__name                 AS specimen_inat_taxon_name,
        waba.longitude,
        waba.latitude,
        anc_genus.name                   AS specimen_inat_genus,
        anc_family.name                  AS specimen_inat_family
    FROM inaturalist_waba_data.observations waba
    LEFT JOIN inaturalist_waba_data.observations__taxon__ancestors anc_genus
        ON anc_genus._dlt_root_id = waba._dlt_id AND anc_genus.rank = 'genus'
    LEFT JOIN inaturalist_waba_data.observations__taxon__ancestors anc_family
        ON anc_family._dlt_root_id = waba._dlt_id AND anc_family.rank = 'family'
),

-- Provisional row identification: anti-join against Ecdysis catalog suffixes
-- (NOT against waba_link.specimen_observation_id — see RESEARCH.md Pattern 3)
ecdysis_catalog_suffixes AS (
    SELECT DISTINCT CAST(regexp_extract(o.catalog_number, '[0-9]+$', 0) AS BIGINT) AS catalog_suffix
    FROM ecdysis_data.occurrences o
    WHERE o.decimal_latitude IS NOT NULL AND o.decimal_latitude != ''
),
provisional_waba_ids AS (
    SELECT wl.specimen_observation_id AS waba_obs_id
    FROM waba_link wl
    LEFT JOIN ecdysis_catalog_suffixes ecs ON ecs.catalog_suffix = wl.catalog_suffix
    WHERE ecs.catalog_suffix IS NULL
),

combined AS (
    -- ARM 1: Ecdysis rows — FULL OUTER JOIN preserved; WABA specimen fields LEFT JOINed
    SELECT
        e.ecdysis_id,
        e.catalog_number,
        COALESCE(e.ecdysis_lon, s.sample_lon)           AS lon,
        COALESCE(e.ecdysis_lat, s.sample_lat)           AS lat,
        COALESCE(e.ecdysis_date, s.sample_date)         AS date,
        COALESCE(e.year, YEAR(s.sample_date_raw))       AS year,
        COALESCE(e.month, MONTH(s.sample_date_raw))     AS month,
        e.scientificName, e.recordedBy, e.fieldNumber, e.genus, e.family,
        e.floralHost, e.host_observation_id, e.inat_host, e.inat_quality_grade,
        e.modified, e.specimen_observation_id, e.elevation_m,
        s.observation_id, s.user__login AS host_inat_login, s.specimen_count, s.sample_id,
        sob.specimen_inat_login,
        sob.specimen_inat_taxon_name,
        sob.specimen_inat_genus,
        sob.specimen_inat_family,
        FALSE AS is_provisional
    FROM ecdysis_base e
    FULL OUTER JOIN samples_base s ON e.host_observation_id = s.observation_id
    LEFT JOIN specimen_obs_base sob ON sob.waba_obs_id = e.specimen_observation_id

    UNION ALL

    -- ARM 2: Provisional WABA rows — unmatched WABA obs, joined to samples via OFV 1718
    SELECT
        NULL                                            AS ecdysis_id,
        NULL                                            AS catalog_number,
        sob.longitude                                   AS lon,
        sob.latitude                                    AS lat,
        CAST(observed_on AS VARCHAR)                    AS date,
        YEAR(waba.observed_on)                          AS year,
        MONTH(waba.observed_on)                         AS month,
        NULL AS scientificName, NULL AS recordedBy, NULL AS fieldNumber,
        sob.specimen_inat_genus AS genus,
        sob.specimen_inat_family AS family,
        NULL AS floralHost,
        CAST(regexp_extract(ofv1718.value, '([0-9]+)$', 1) AS BIGINT) AS host_observation_id,
        NULL AS inat_host, waba.quality_grade AS inat_quality_grade,
        NULL AS modified,
        waba.id AS specimen_observation_id,
        NULL AS elevation_m,
        s.observation_id, s.user__login AS host_inat_login, s.specimen_count, s.sample_id,
        sob.specimen_inat_login,
        sob.specimen_inat_taxon_name,
        sob.specimen_inat_genus,
        sob.specimen_inat_family,
        TRUE AS is_provisional
    FROM provisional_waba_ids p
    JOIN inaturalist_waba_data.observations waba ON waba.id = p.waba_obs_id
    JOIN specimen_obs_base sob ON sob.waba_obs_id = waba.id
    LEFT JOIN inaturalist_waba_data.observations__ofvs ofv1718
        ON ofv1718._dlt_root_id = waba._dlt_id AND ofv1718.field_id = 1718
    LEFT JOIN samples_base s
        ON s.observation_id = CAST(regexp_extract(ofv1718.value, '([0-9]+)$', 1) AS BIGINT)
    WHERE waba.longitude IS NOT NULL AND waba.latitude IS NOT NULL
),

-- ROW_NUMBER applied to the union result to guarantee global uniqueness
joined AS (
    SELECT ROW_NUMBER() OVER () AS _row_id, *
    FROM combined
)
```

**Downstream spatial CTEs** (lines 119-161 — unchanged in logic):
```sql
occ_pt AS (
    SELECT *, ST_Point(lon, lat) AS pt FROM joined
),
with_county AS ( ... ),
county_fallback AS ( ... ),
final_county AS ( ... ),
with_eco AS ( ... ),
eco_dedup AS ( ... ),
eco_fallback AS ( ... ),
final_eco AS ( ... )
```

**Final SELECT** (lines 162-173 — must add new columns, rename `observer` → `host_inat_login`):
```sql
SELECT
    j.ecdysis_id, j.catalog_number,
    j.lon, j.lat, j.date, j.year, j.month,
    j.scientificName, j.recordedBy, j.fieldNumber, j.genus, j.family,
    j.floralHost, j.host_observation_id, j.inat_host, j.inat_quality_grade,
    j.modified, j.specimen_observation_id, j.elevation_m,
    j.observation_id, j.host_inat_login, j.specimen_count, j.sample_id,
    -- NEW columns:
    j.specimen_inat_login, j.specimen_inat_taxon_name,
    j.specimen_inat_genus, j.specimen_inat_family,
    j.is_provisional,
    fc.county, fe.ecoregion_l3
FROM joined j
JOIN final_county fc ON fc._row_id = j._row_id
JOIN final_eco fe ON fe._row_id = j._row_id
```

**Existing OFV join pattern in `samples_base`** (lines 85-101 — reference for OFV 1718 join):
```sql
samples_base AS (
    SELECT
        op.id AS observation_id,
        op.user__login AS observer,          -- rename to host_inat_login in output
        ...
    FROM inaturalist_data.observations op
    JOIN inaturalist_data.observations__ofvs sc
        ON sc._dlt_root_id = op._dlt_id AND sc.field_id = 8338 AND sc.value != ''
    LEFT JOIN inaturalist_data.observations__ofvs sid
        ON sid._dlt_root_id = op._dlt_id AND sid.field_id = 9963
    WHERE op.longitude IS NOT NULL AND op.latitude IS NOT NULL
)
```

Note: `samples_base` selects `user__login AS observer`. In the final SELECT and in `combined`, this column should be aliased as `host_inat_login` to implement D-01. Either rename the alias in `samples_base` directly, or alias it in `combined`'s SELECT.

**Verification pattern** (lines 176-188 — unchanged):
```python
row = con.execute(f"""
SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN county IS NULL THEN 1 ELSE 0 END) AS null_county,
    SUM(CASE WHEN ecoregion_l3 IS NULL THEN 1 ELSE 0 END) AS null_eco
FROM read_parquet('{out}')
""").fetchone()
total, null_county, null_eco = row
assert null_county == 0, f"occurrences.parquet has {null_county} rows with null county"
assert null_eco == 0, f"occurrences.parquet has {null_eco} rows with null ecoregion_l3"
```

---

### `data/tests/conftest.py` — extend fixture with new tables and rows

**Fixture scope pattern** (lines 220-245 — session-scoped, file-backed DuckDB):
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
```

**Existing WABA observations table schema** (lines 89-95 — add `taxon__name`, `taxon__rank`):
```python
con.execute("""
    CREATE TABLE inaturalist_waba_data.observations (
        _dlt_id VARCHAR, id BIGINT, uuid VARCHAR,
        user__login VARCHAR, observed_on DATE,
        longitude DOUBLE, latitude DOUBLE,
        quality_grade VARCHAR,
        _dlt_load_id VARCHAR
        -- ADD: taxon__name VARCHAR, taxon__rank VARCHAR
    )
""")
```

**Existing WABA OFVs table schema** (lines 97-104 — reference for new ancestors table):
```python
con.execute("""
    CREATE TABLE inaturalist_waba_data.observations__ofvs (
        _dlt_root_id VARCHAR, field_id BIGINT, name VARCHAR,
        value VARCHAR, datatype VARCHAR,
        _dlt_load_id VARCHAR, _dlt_id VARCHAR,
        _dlt_parent_id VARCHAR, _dlt_list_idx BIGINT
    )
""")
```

**New ancestors table** — follow the same `_dlt_root_id` / `_dlt_id` / `_dlt_parent_id` / `_dlt_list_idx` column pattern:
```python
con.execute("""
    CREATE TABLE inaturalist_waba_data.observations__taxon__ancestors (
        _dlt_root_id VARCHAR, rank VARCHAR, name VARCHAR,
        _dlt_list_idx BIGINT, _dlt_id VARCHAR,
        _dlt_parent_id VARCHAR, _dlt_load_id VARCHAR
    )
""")
```

**Existing WABA observation INSERT** (lines 178-191 — add `taxon__name`, `taxon__rank` values):
```python
con.execute("""
    INSERT INTO inaturalist_waba_data.observations VALUES (
        'waba-obs-1', 777777, 'waba-uuid-1',
        'wabauser', '2024-06-15'::DATE,
        -120.8, 47.5,
        'research',
        'waba-load1'
        -- ADD VALUES for taxon__name='Eucera acerba', taxon__rank='species'
    )
""")
```

**New second WABA observation (unmatched/provisional):**
- `_dlt_id='waba-obs-2'`, `id=888888`, `user__login='provisionaluser'`
- `taxon__name='Osmia'`, `taxon__rank='genus'`
- `longitude=-120.8`, `latitude=47.5` (inside Chelan + North Cascades test polygons)
- No OFV 18116 (or OFV 18116 with a catalog number absent from `ecdysis_data.occurrences`)

**New OFV 1718 row on unmatched obs** — follow existing OFV insert pattern (lines 187-192):
```python
# existing pattern:
con.execute("""
    INSERT INTO inaturalist_waba_data.observations__ofvs VALUES (
        'waba-obs-1', 18116, 'WABA', '5594569', 'text',
        'waba-load1', 'waba-ofv-1', 'waba-obs-1', 0
    )
""")
# new OFV 1718 row:
con.execute("""
    INSERT INTO inaturalist_waba_data.observations__ofvs VALUES (
        'waba-obs-2', 1718, 'Associated observation',
        'https://www.inaturalist.org/observations/999999', 'text',
        'waba-load2', 'waba-ofv-2', 'waba-obs-2', 0
    )
""")
```

**New ancestor rows** — one genus+family per WABA obs:
```python
# For waba-obs-1 (matched Eucera acerba):
con.execute("""
    INSERT INTO inaturalist_waba_data.observations__taxon__ancestors VALUES
        ('waba-obs-1', 'genus', 'Eucera', 0, 'anc-1a', 'waba-obs-1', 'waba-load1'),
        ('waba-obs-1', 'family', 'Apidae', 1, 'anc-1b', 'waba-obs-1', 'waba-load1')
""")
# For waba-obs-2 (provisional Osmia):
con.execute("""
    INSERT INTO inaturalist_waba_data.observations__taxon__ancestors VALUES
        ('waba-obs-2', 'genus', 'Osmia', 0, 'anc-2a', 'waba-obs-2', 'waba-load2'),
        ('waba-obs-2', 'family', 'Megachilidae', 1, 'anc-2b', 'waba-obs-2', 'waba-load2')
""")
```

---

### `data/tests/test_export.py` — update column list and add 2 integration tests

**Existing column list** (lines 14-26 — update `'observer'` → `'host_inat_login'`, add 5 new columns):
```python
EXPECTED_OCCURRENCES_COLS = [
    # specimen-side (null for sample-only rows)
    'ecdysis_id', 'catalog_number', 'scientificName', 'recordedBy', 'fieldNumber',
    'genus', 'family', 'floralHost',
    'host_observation_id', 'inat_host', 'inat_quality_grade',
    'modified', 'specimen_observation_id', 'elevation_m',
    'year', 'month',
    # sample-side (null for specimen-only rows)
    'observation_id', 'observer', 'specimen_count', 'sample_id',  # 'observer' → 'host_inat_login'
    # unified (always populated via COALESCE)
    'lat', 'lon', 'date',
    'county', 'ecoregion_l3',
    # NEW:
    # 'host_inat_login', 'specimen_inat_login', 'specimen_inat_taxon_name',
    # 'specimen_inat_genus', 'specimen_inat_family', 'is_provisional',
]
```

**Existing test pattern** (lines 33-46 — copy for new tests):
```python
def test_occurrences_parquet_schema(fixture_con, export_dir, monkeypatch):
    """export_occurrences_parquet writes file with all expected columns."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_occurrences_parquet(fixture_con)

    parquet_path = str(export_dir / 'occurrences.parquet')
    schema = duckdb.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
    ).fetchall()
    actual_cols = [row[0] for row in schema]

    for col in EXPECTED_OCCURRENCES_COLS:
        assert col in actual_cols, f"Missing column in occurrences.parquet: {col}"
```

**Existing test with column-level queries** (lines 94-108 — use same WHERE-filter pattern for new tests):
```python
def test_occurrences_specimen_only_nulls(fixture_con, export_dir, monkeypatch):
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_occurrences_parquet(fixture_con)

    parquet_path = str(export_dir / 'occurrences.parquet')
    rows = duckdb.execute(f"""
        SELECT observer, specimen_count
        FROM read_parquet('{parquet_path}')
        WHERE ecdysis_id IS NOT NULL AND observation_id IS NULL
    """).fetchall()
    assert len(rows) >= 1, "Expected at least 1 specimen-only row"
```

**New test 1 — provisional rows appear** (PROV-02, PROV-03, PROV-04):
```python
def test_provisional_rows_appear(fixture_con, export_dir, monkeypatch):
    """Unmatched WABA observations produce provisional rows."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_occurrences_parquet(fixture_con)
    parquet_path = str(export_dir / 'occurrences.parquet')
    rows = duckdb.execute(f"""
        SELECT is_provisional, ecdysis_id, specimen_observation_id,
               specimen_inat_login, specimen_inat_taxon_name
        FROM read_parquet('{parquet_path}')
        WHERE is_provisional = true
    """).fetchall()
    assert len(rows) >= 1, "Expected at least 1 provisional row"
    for row in rows:
        assert row[1] is None, "Provisional rows must have null ecdysis_id"
        assert row[2] == 888888, "specimen_observation_id = WABA obs id"
        assert row[3] == 'provisionaluser'
```

**New test 2 — matched WABA obs not provisional** (PROV-05):
```python
def test_matched_waba_not_provisional(fixture_con, export_dir, monkeypatch):
    """WABA observations matched to an Ecdysis catalog number are not provisional."""
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_occurrences_parquet(fixture_con)
    parquet_path = str(export_dir / 'occurrences.parquet')
    rows = duckdb.execute(f"""
        SELECT is_provisional FROM read_parquet('{parquet_path}')
        WHERE specimen_observation_id = 777777  -- matched WABA obs
    """).fetchall()
    assert len(rows) >= 1, "Matched WABA obs should produce a row (as non-provisional)"
    for (is_prov,) in rows:
        assert is_prov is False, f"Matched WABA obs should have is_provisional=false, got {is_prov}"
```

---

### `scripts/validate-schema.mjs` — update EXPECTED column list

**Existing EXPECTED object** (lines 22-36 — rename `observer`, add 5 new columns):
```js
const EXPECTED = {
  'occurrences.parquet': [
    // specimen-side (null for sample-only rows)
    'ecdysis_id', 'catalog_number', 'scientificName', 'recordedBy', 'fieldNumber',
    'genus', 'family', 'floralHost',
    'host_observation_id', 'inat_host', 'inat_quality_grade',
    'modified', 'specimen_observation_id', 'elevation_m',
    'year', 'month',
    // sample-side (null for specimen-only rows)
    'observation_id', 'observer',  // <-- rename to 'host_inat_login'
    'specimen_count', 'sample_id',
    // unified (always populated via COALESCE)
    'lat', 'lon', 'date',
    'county', 'ecoregion_l3',
    // NEW — add after 'sample_id':
    // 'specimen_inat_login', 'specimen_inat_taxon_name',
    // 'specimen_inat_genus', 'specimen_inat_family', 'is_provisional',
  ],
};
```

**Validation loop pattern** (lines 44-75 — unchanged, no edits needed):
```js
for (const [filename, expectedCols] of Object.entries(EXPECTED)) {
  ...
  const missing = expectedCols.filter(c => !actualCols.includes(c));
  if (missing.length > 0) {
    console.error(`x ${filename}: missing columns: ${missing.join(', ')}`);
    failed = true;
  } else {
    console.log(`ok ${filename}`);
  }
}
```

---

## Shared Patterns

### dlt Child Table Join Key
**Source:** `data/export.py` lines 46-55 (`waba_link` CTE), `data/tests/conftest.py` lines 97-104
**Apply to:** All SQL joins on `observations__ofvs`, `observations__taxon__ancestors`
```sql
-- Always use _dlt_root_id = parent._dlt_id (not _dlt_parent_id)
JOIN inaturalist_waba_data.observations__ofvs ofv
    ON ofv._dlt_root_id = waba._dlt_id
    AND ofv.field_id = 18116
```

### OFV URL Integer Extraction
**Source:** RESEARCH.md Pattern 4 (verified against production)
**Apply to:** OFV 1718 join in provisional arm of `export.py`
```sql
CAST(regexp_extract(ofv1718.value, '([0-9]+)$', 1) AS BIGINT)
```

### ROW_NUMBER Uniqueness Across UNION ALL
**Source:** RESEARCH.md Pattern 2
**Apply to:** `joined` CTE in `export.py`
```sql
-- Apply ROW_NUMBER to the union result wrapper, not to individual arms
joined AS (
    SELECT ROW_NUMBER() OVER () AS _row_id, *
    FROM combined  -- combined = UNION ALL of all arms
)
```

### Monkeypatch + Export Test Pattern
**Source:** `data/tests/test_export.py` lines 33-46
**Apply to:** Both new integration tests in `test_export.py`
```python
monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
export_mod.export_occurrences_parquet(fixture_con)
parquet_path = str(export_dir / 'occurrences.parquet')
# then query parquet with duckdb.execute(f"... FROM read_parquet('{parquet_path}') ...")
```

### Spatial Assert Pattern
**Source:** `data/export.py` lines 176-188
**Apply to:** Provisional rows must have non-null lat/lon (WHERE clause in provisional CTE) so they survive `assert null_county == 0` and `assert null_eco == 0`
```python
assert null_county == 0, f"occurrences.parquet has {null_county} rows with null county"
assert null_eco == 0, f"occurrences.parquet has {null_eco} rows with null ecoregion_l3"
```

---

## No Analog Found

None — all five files are modifications to existing files with clear self-analogy patterns.

---

## Critical Implementation Notes

### D-13 Correction (from RESEARCH.md Pattern 3)
The provisional row anti-join MUST target `ecdysis_catalog_suffixes`, NOT `waba_link.specimen_observation_id`. Using the waba_link anti-join produces only 1 provisional row in production; the correct approach produces 27.

### Coordinate Guard for Provisional Rows
Provisional rows must include `WHERE waba.longitude IS NOT NULL AND waba.latitude IS NOT NULL` to pass the `assert null_county == 0` / `assert null_eco == 0` assertions that run after every export.

### Pipeline Run Prerequisite
`observations__taxon__ancestors` does not exist until `waba_pipeline.py` is run with the updated `DEFAULT_FIELDS`. The implementation sequence must be: (1) add ancestors to DEFAULT_FIELDS; (2) run pipeline; (3) verify table exists; (4) then write/run export SQL.

### Fixture `waba-obs-2` Scope
The unmatched WABA obs (`id=888888`) must have `longitude=-120.8, latitude=47.5` (inside both `CHELAN_WKT` and `NORTH_CASCADES_WKT` test polygons) so it gets a non-null county and ecoregion in tests.

---

## Metadata

**Analog search scope:** `data/`, `scripts/`
**Files scanned:** 5 (all target files; no additional analogs needed — all files modify themselves)
**Pattern extraction date:** 2026-04-20
