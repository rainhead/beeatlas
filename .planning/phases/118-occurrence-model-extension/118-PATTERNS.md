# Phase 118: Occurrence Model Extension — Pattern Map

**Mapped:** 2026-05-25
**Files analyzed:** 8 modified files (no new files)
**Analogs found:** 8 / 8 (all files are self-analogs — each file is being extended in-place using patterns already present within it)

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `data/dbt/models/sources.yml` | config | — | `data/dbt/models/sources.yml` (existing source blocks) | self-extension |
| `data/dbt/models/intermediate/int_combined.sql` | model | UNION ALL / batch | `data/dbt/models/intermediate/int_combined.sql` ARM 1 and ARM 2 | self-extension |
| `data/dbt/models/marts/occurrences.sql` | model | CRUD / batch | `data/dbt/models/marts/occurrences.sql` (existing SELECT list) | self-extension |
| `data/dbt/models/marts/schema.yml` | config | — | `data/dbt/models/marts/schema.yml` (existing column blocks) | self-extension |
| `data/dbt/models/intermediate/int_species_universe.sql` | model | batch / aggregation | `data/dbt/models/intermediate/int_species_universe.sql` (`checklist_count_agg` CTE) | self-extension |
| `data/dbt/models/marts/species.sql` | model | batch | `data/dbt/models/marts/species.sql` (existing SELECT list) | self-extension |
| `data/species_export.py` | service | batch / transform | `data/species_export.py` (`SPECIES_COLUMNS`, PyArrow schema block) | self-extension |
| `data/tests/test_dbt_scaffold.py` | test | integration | `data/tests/test_dbt_scaffold.py` (`_CHECKLIST_GUARD` + DuckDB query pattern) | self-extension |
| `data/tests/test_species_export.py` | test | integration | `data/tests/test_species_export.py` (`_SANDBOX_GUARD` + `export_species_parquet` call) | self-extension |

## Pattern Assignments

### `data/dbt/models/sources.yml` (config)

**Analog:** Existing source blocks in the same file (lines 1–37).

**Pattern — add new source block** (append after line 37, after `geographies` block):
```yaml
  - name: inat_obs_data
    schema: inat_obs_data
    tables:
      - name: observations
```

The four existing sources follow identical structure: `name` = schema name, `schema` = DuckDB schema name, `tables` list. No description fields or test blocks on source tables in this file.

---

### `data/dbt/models/intermediate/int_combined.sql` (model, UNION ALL / batch)

**Analog:** ARM 1 (lines 9–43) and ARM 2 (lines 47–86) within the same file.

**Step A — add `source` literal to ARM 1** (lines 39–41, before `FROM`):
```sql
    FALSE                                          AS is_provisional,
    e.canonical_name,
    'ecdysis'                                      AS source
FROM {{ ref('int_ecdysis_base') }} e
```

**Step B — add `source` literal to ARM 2** (lines 78–80, before `FROM`):
```sql
    TRUE                                           AS is_provisional,
    NULL                                           AS canonical_name,
    'waba_sample'                                  AS source
FROM {{ ref('int_provisional_waba_ids') }} p
```

**Step C — append ARM 3 after line 86** (immediately after ARM 2's WHERE clause):
```sql
UNION ALL

-- ARM 3: iNat expert observations (Phase 118)
SELECT
    NULL                               AS ecdysis_id,
    NULL                               AS catalog_number,
    io.lon,
    io.lat,
    CAST(io.observed_on AS VARCHAR)    AS date,
    YEAR(io.observed_on)               AS year,
    MONTH(io.observed_on)              AS month,
    io.scientific_name                 AS scientificName,
    NULL                               AS recordedBy,
    NULL                               AS fieldNumber,
    NULL                               AS genus,
    NULL                               AS family,
    io.floral_host                     AS floralHost,
    NULL::BIGINT                       AS host_observation_id,
    NULL                               AS inat_host,
    io.quality_grade                   AS inat_quality_grade,
    NULL                               AS modified,
    io.obs_id                          AS specimen_observation_id,
    NULL::INTEGER                      AS elevation_m,
    NULL::BIGINT                       AS observation_id,
    NULL                               AS host_inat_login,
    NULL::INTEGER                      AS specimen_count,
    NULL::INTEGER                      AS sample_id,
    NULL                               AS sample_host,
    NULL                               AS specimen_inat_login,
    NULL                               AS specimen_inat_taxon_name,
    NULL                               AS specimen_inat_genus,
    NULL                               AS specimen_inat_family,
    NULL                               AS specimen_inat_quality_grade,
    FALSE                              AS is_provisional,
    io.canonical_name,
    'inat_obs'                         AS source
FROM {{ source('inat_obs_data', 'observations') }} io
WHERE io.lat IS NOT NULL AND io.lon IS NOT NULL
```

**Column count invariant:** ARM 3 must produce the same column count as ARM 1 and ARM 2 after they gain `source`. ARM 1 currently emits 31 columns (lines 9–40) plus the new `source` = 32. ARM 2 also ends at 32 with the new `source`. ARM 3 must also emit 32.

Note: ARM 1 includes `specimen_inat_login`, `specimen_inat_genus`, `specimen_inat_family` (lines 34–37 via `sob.*` aliases). These three columns must appear in ARM 3 as NULL to maintain column alignment.

**WHERE clause pattern** (from ARM 2 line 86):
```sql
WHERE sob.longitude IS NOT NULL AND sob.latitude IS NOT NULL
```
ARM 3 mirrors this: `WHERE io.lat IS NOT NULL AND io.lon IS NOT NULL`

---

### `data/dbt/models/marts/occurrences.sql` (model, batch)

**Analog:** Existing final SELECT list (lines 83–99).

**Current SELECT tail** (lines 91–99):
```sql
    j.specimen_inat_taxon_name, j.specimen_inat_quality_grade,
    j.is_provisional,
    j.canonical_name,
    fc.county, fe.ecoregion_l3,
    fp.place_slug
FROM joined j
```

**Phase 118 inserts 5 columns after `j.canonical_name`** (line 94, before `fc.county`):
```sql
    j.canonical_name,
    j.source,
    j.image_url,
    j.obs_url,
    j.user_login,
    j.license,
    fc.county, fe.ecoregion_l3,
    fp.place_slug
```

ARM 1 and ARM 2 will emit NULL for `image_url`, `obs_url`, `user_login`, `license` (those columns are not present in the ARM 1/ARM 2 sources — add them as explicit NULLs in int_combined ARM 1 and ARM 2 if they are not already emitted). ARM 3 emits actual values from `inat_obs_data.observations`.

---

### `data/dbt/models/marts/schema.yml` (config)

**Analog:** Existing column blocks for `occurrences` model (lines 8–71) and `species` model (lines 73–115).

**Current `occurrences` model ends at** (lines 68–71):
```yaml
      - name: place_slug
        data_type: varchar
```

**Append 5 columns to `occurrences` after `place_slug`**:
```yaml
      - name: source
        data_type: varchar
      - name: image_url
        data_type: varchar
      - name: obs_url
        data_type: varchar
      - name: user_login
        data_type: varchar
      - name: license
        data_type: varchar
```

**Current `species` model ends at** (lines 113–115):
```yaml
      - name: checklist_count
        data_type: bigint
```

**Append 1 column to `species` after `checklist_count`**:
```yaml
      - name: inat_obs_count
        data_type: bigint
```

**Contract enforcement:** `enforced: true` is set on both models (lines 5–7, 75–77). Schema.yml and the SQL SELECT list must be updated atomically. Any mismatch causes `dbt build` to fail with a contract error.

---

### `data/dbt/models/intermediate/int_species_universe.sql` (model, aggregation)

**Analog:** `checklist_count_agg` CTE (lines 40–47) and its LEFT JOIN pattern (line 120–121).

**Template CTE to copy** (lines 40–47):
```sql
checklist_count_agg AS (
    -- Separate CTE for total checklist_count — does NOT filter by month IS NOT NULL
    -- so that all checklist records (including those with unknown month) are counted.
    SELECT canonical_name, COUNT(*) AS checklist_count
    FROM {{ ref('checklist') }}
    WHERE canonical_name IS NOT NULL
    GROUP BY canonical_name
),
```

**New CTE to add** (insert after `checklist_count_agg`, before `provisional_agg`):
```sql
inat_obs_count_agg AS (
    SELECT canonical_name, COUNT(*) AS inat_obs_count
    FROM {{ source('inat_obs_data', 'observations') }}
    WHERE canonical_name IS NOT NULL
    GROUP BY canonical_name
),
```

**Template column in `species_universe` SELECT** (line 107):
```sql
        COALESCE(cca.checklist_count, 0)::BIGINT AS checklist_count
```

**New column to add** (after `checklist_count` in the SELECT list):
```sql
        COALESCE(ioa.inat_obs_count, 0)::BIGINT AS inat_obs_count
```

Note: `COALESCE` is safe for BIGINT (the INTEGER[12] COALESCE limitation in the file header comment does not apply here — only to the `INTEGER[12]` array type).

**Template LEFT JOIN** (lines 120–121):
```sql
    LEFT JOIN checklist_count_agg cca
        ON cca.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
```

**New LEFT JOIN to add** (after the `checklist_count_agg` join):
```sql
    LEFT JOIN inat_obs_count_agg ioa
        ON ioa.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
```

---

### `data/dbt/models/marts/species.sql` (model, batch)

**Analog:** Existing SELECT list (lines 15–35).

**Current SELECT ends with** (lines 32–35):
```sql
    ecoregion_count,
    checklist_count
FROM {{ ref('int_species_universe') }}
```

**Phase 118 adds one column before `FROM`**:
```sql
    ecoregion_count,
    checklist_count,
    inat_obs_count
FROM {{ ref('int_species_universe') }}
```

The file header comment on line 7 must be updated: "19 SQL columns + 1 Python-added slug = 20 final columns" → "20 SQL columns + 1 Python-added slug = 21 final columns".

---

### `data/species_export.py` (service, batch/transform)

**Analog:** `SPECIES_COLUMNS` list (lines 49–55) and PyArrow schema block (lines 149–170).

**Current `SPECIES_COLUMNS`** (lines 49–55):
```python
SPECIES_COLUMNS = [
    'scientificName', 'canonical_name', 'family', 'subfamily', 'tribe',
    'genus', 'subgenus', 'specific_epithet', 'on_checklist', 'status',
    'occurrence_count', 'specimen_count', 'provisional_count',
    'first_occurrence_date', 'last_occurrence_date', 'month_histogram',
    'county_count', 'ecoregion_count', 'checklist_count', 'slug',
]
```

**Phase 118 inserts `'inat_obs_count'` at position -2** (second to last, before `'slug'`):
```python
SPECIES_COLUMNS = [
    'scientificName', 'canonical_name', 'family', 'subfamily', 'tribe',
    'genus', 'subgenus', 'specific_epithet', 'on_checklist', 'status',
    'occurrence_count', 'specimen_count', 'provisional_count',
    'first_occurrence_date', 'last_occurrence_date', 'month_histogram',
    'county_count', 'ecoregion_count', 'checklist_count', 'inat_obs_count', 'slug',
]
```

**Position invariant:** `slug` must remain the final entry. `mart_cols = ', '.join(SPECIES_COLUMNS[:-1])` at line 117 excludes `slug` from the dbt mart read — inserting `inat_obs_count` before `slug` ensures it is included in the `[:-1]` slice.

**Current PyArrow schema block** (lines 149–170):
```python
    schema = pa.schema([
        ('scientificName', pa.string()),
        ...
        ('checklist_count', pa.int64()),
        ('slug', pa.string()),
    ])
```

**Phase 118 inserts one entry before `('slug', ...)`**:
```python
        ('checklist_count', pa.int64()),
        ('inat_obs_count', pa.int64()),
        ('slug', pa.string()),
```

The docstring on `export_species_parquet` (lines 86–97) references "19 cols" and "20 cols including slug" — update to "20 cols" / "21 cols including slug".

---

### `data/tests/test_dbt_scaffold.py` (test, integration)

**Analog:** `_CHECKLIST_GUARD` decorator pattern (lines 117–121) and DuckDB query structure (lines 48–59).

**Guard pattern to copy** (lines 117–121):
```python
_CHECKLIST_GUARD = pytest.mark.skipif(
    not (SANDBOX / "checklist.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce checklist.parquet",
)
```

**Phase 118 adds an occurrences guard** (copy and adapt):
```python
_OCCURRENCES_GUARD = pytest.mark.skipif(
    not (SANDBOX / "occurrences.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)
```

**DuckDB query pattern to copy** (lines 48–59):
```python
    parquet_path = str(SANDBOX / "occurrences.parquet")
    row = duckdb.execute(f"""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN county IS NULL THEN 1 ELSE 0 END) AS null_county,
            ...
        FROM read_parquet('{parquet_path}')
    """).fetchone()
    total, null_county, ... = row
    assert total >= 2, f"..."
```

**Three new test functions to add** (OCC-01 assertions, append to end of file):

```python
_OCCURRENCES_GUARD = pytest.mark.skipif(
    not (SANDBOX / "occurrences.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)

@_OCCURRENCES_GUARD
def test_occurrences_source_column():
    """occurrences.parquet has a non-null source column (OCC-01)."""
    parquet_path = str(SANDBOX / "occurrences.parquet")
    row = duckdb.execute(f"""
        SELECT COUNT(*) FROM read_parquet('{parquet_path}') WHERE source IS NULL
    """).fetchone()
    assert row[0] == 0, f"occurrences.parquet has {row[0]} rows with null source"


@_OCCURRENCES_GUARD
def test_inat_obs_rows_in_occurrences():
    """occurrences.parquet contains rows with source='inat_obs' (OCC-01)."""
    parquet_path = str(SANDBOX / "occurrences.parquet")
    row = duckdb.execute(f"""
        SELECT COUNT(*) FROM read_parquet('{parquet_path}') WHERE source = 'inat_obs'
    """).fetchone()
    assert row[0] > 0, "Expected inat_obs rows in occurrences.parquet"


@_OCCURRENCES_GUARD
def test_source_no_nulls():
    """All rows in occurrences.parquet have source in ('ecdysis', 'waba_sample', 'inat_obs') (OCC-01)."""
    parquet_path = str(SANDBOX / "occurrences.parquet")
    row = duckdb.execute(f"""
        SELECT COUNT(*) FROM read_parquet('{parquet_path}')
        WHERE source NOT IN ('ecdysis', 'waba_sample', 'inat_obs')
    """).fetchone()
    assert row[0] == 0, f"Found {row[0]} rows with unexpected source values"
```

---

### `data/tests/test_species_export.py` (test, integration)

**Analog:** `_SANDBOX_GUARD` decorator + `export_species_parquet` call pattern (lines 24–27, 31–45).

**Guard pattern** (lines 24–27):
```python
_SANDBOX_GUARD = pytest.mark.skipif(
    not (SANDBOX / "species.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox species.parquet",
)
```

**Function call pattern** (lines 31–36):
```python
@_SANDBOX_GUARD
def test_slug_hierarchical(tmp_path, monkeypatch):
    monkeypatch.setattr(se_mod, 'ASSETS_DIR', tmp_path)
    monkeypatch.setenv('DBT_SANDBOX_DIR', str(SANDBOX))
    con = duckdb.connect()
    export_species_parquet(con)
```

**New test function to add** (OCC-02/03 assertion, append to end of file):

```python
@_SANDBOX_GUARD
def test_inat_obs_count_in_species(tmp_path, monkeypatch):
    """inat_obs_count column is present and non-null in species.parquet/species.json (OCC-02/03)."""
    monkeypatch.setattr(se_mod, 'ASSETS_DIR', tmp_path)
    monkeypatch.setenv('DBT_SANDBOX_DIR', str(SANDBOX))
    con = duckdb.connect()
    export_species_parquet(con)
    row = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{tmp_path}/species.parquet')"
        " WHERE inat_obs_count IS NULL"
    ).fetchone()
    assert row[0] == 0, f"species.parquet has {row[0]} rows with null inat_obs_count"
    assert 'inat_obs_count' in SPECIES_COLUMNS, "inat_obs_count must be in SPECIES_COLUMNS"
```

---

## Shared Patterns

### DuckDB `read_parquet` query in pytest
**Source:** `data/tests/test_dbt_scaffold.py` lines 48–59  
**Apply to:** All three new `test_dbt_scaffold.py` test functions  
Pattern: `duckdb.execute(f"... FROM read_parquet('{parquet_path}')").fetchone()` — always pass `str(SANDBOX / "file.parquet")` as the path argument. Never use f-string interpolation of `SANDBOX` directly (must be cast to `str`).

### `_SANDBOX_GUARD` / `_CHECKLIST_GUARD` decorator
**Source:** `data/tests/test_species_export.py` lines 24–27; `data/tests/test_dbt_scaffold.py` lines 117–121  
**Apply to:** All new test functions  
Pattern: define a module-level `pytest.mark.skipif` bound to a Path existence check, then apply it as a decorator. This ensures Wave 0 tests are RED (skip-to-collect) until `dbt build` produces the artifact.

### dbt contract atomicity (schema.yml + SQL SELECT)
**Source:** `data/dbt/models/marts/schema.yml` lines 5–7 (`enforced: true`)  
**Apply to:** Every change to `occurrences.sql` or `species.sql`  
Pattern: adding a column to the SELECT list and to the `schema.yml` column list must happen in the same commit. The build fails if they diverge.

### COALESCE with `::BIGINT` cast for new count columns
**Source:** `data/dbt/models/intermediate/int_species_universe.sql` line 107  
**Apply to:** `inat_obs_count` in the `species_universe` SELECT  
Pattern: `COALESCE(ioa.inat_obs_count, 0)::BIGINT` — mirrors `COALESCE(cca.checklist_count, 0)::BIGINT`. Safe for BIGINT; the CASE-not-COALESCE restriction documented in the file header applies only to `INTEGER[12]` array columns.

### `{{ source('schema', 'table') }}` reference
**Source:** `data/dbt/models/intermediate/int_combined.sql` line 83 (`{{ ref('stg_waba__ofvs') }}`); `data/dbt/models/marts/occurrences.sql` line 73 (`{{ source('geographies', 'places') }}`)  
**Apply to:** ARM 3 in `int_combined.sql`; `inat_obs_count_agg` CTE in `int_species_universe.sql`  
Pattern: `{{ source('inat_obs_data', 'observations') }}` — the source name must match the `name:` key in `sources.yml`, not the DuckDB schema name (they are the same here, but the reference is to the dbt source declaration).

## No Analog Found

None. All modified files are self-extensions — each file already contains the pattern that the new code must follow.

## Metadata

**Analog search scope:** `data/dbt/models/` (all SQL and YAML), `data/species_export.py`, `data/tests/`  
**Files read:** 9 (all primary sources verified directly, no assumptions about content)  
**Pattern extraction date:** 2026-05-25
