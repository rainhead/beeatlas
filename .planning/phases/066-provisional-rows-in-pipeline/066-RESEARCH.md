# Phase 66: Provisional Rows in Pipeline — Research

**Researched:** 2026-04-20
**Domain:** DuckDB/dlt data pipeline — SQL CTE restructuring, dlt child table normalization
**Confidence:** HIGH (all claims verified against live codebase and real DB)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `observer` renamed to `host_inat_login` — breaking rename; validate-schema.mjs and all frontend references updated (frontend refs deferred to Phase 67).
- **D-02:** `specimen_inat_login` (new, VARCHAR nullable) — `user__login` from WABA observations. Populated for all rows with a linked WABA obs (including non-provisional matched rows).
- **D-03:** `specimen_inat_taxon_name` (new, VARCHAR nullable) — `taxon__name` from WABA observations.
- **D-04:** `specimen_inat_genus` (new, VARCHAR nullable) — `name` from `observations__taxon__ancestors` WHERE `rank = 'genus'`.
- **D-05:** `specimen_inat_family` (new, VARCHAR nullable) — `name` from `observations__taxon__ancestors` WHERE `rank = 'family'`.
- **D-06:** `is_provisional` (new, BOOLEAN non-nullable) — `TRUE` for unmatched WABA observation rows; `FALSE` for all others.
- **D-07:** Three-arm UNION ALL structure: ARM 1 (ecdysis_base) + ARM 2 (new specimen_obs_base for WABA obs) + ARM 3 (samples_base unchanged).
- **D-08:** ARM 2 LEFT JOINed onto ALL Ecdysis rows — populates `specimen_inat_login` etc. for any Ecdysis row with a `specimen_observation_id`.
- **D-09:** FULL OUTER JOIN (ARM 1 × ARM 3) preserved; provisional rows added via UNION ALL.
- **D-10:** Add `taxon.ancestors.rank,taxon.ancestors.name` to `DEFAULT_FIELDS` in `waba_pipeline.py`.
- **D-11:** OFV 1718 URL parsed as: `CAST(regexp_extract(ofv1718.value, '([0-9]+)$', 1) AS BIGINT)`.
- **D-12:** OFV 1718 already persisted in `observations__ofvs` — no pipeline change needed beyond D-10.
- **D-13:** Provisional = WABA observations whose OFV 18116 catalog number does NOT match any Ecdysis catalog suffix. Anti-join target: Ecdysis catalog suffixes, NOT waba_link.specimen_observation_id (see D-13 Correction below).
- **D-14:** conftest.py fixture additions: `taxon__name`/`taxon__rank` on WABA observations table; new `observations__taxon__ancestors` table; second unmatched WABA obs; OFV 1718 row on unmatched obs.

### Claude's Discretion

- SQL CTE naming and ordering for the three-way join
- Whether to use a separate `matched_waba_ids` CTE or inline the anti-join for D-13
- Handling of `_row_id` across UNION ALL arms

### Deferred Ideas (OUT OF SCOPE)

- iNat community ID confidence columns (num_identification_agreements)
- Distinct map symbols for provisional rows
- Determination status filter
- Frontend sidebar display of provisional rows (Phase 67)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROV-01 | `waba_pipeline.py` DEFAULT_FIELDS includes OFV field_id 1718; value persisted in `observations__ofvs` | OFV 1718 already present in DB (98 rows verified); only addition needed is `taxon.ancestors.rank,taxon.ancestors.name` in DEFAULT_FIELDS |
| PROV-02 | `export.py` adds WABA provisional rows with `ecdysis_id = null` and `is_provisional = true` | UNION ALL approach confirmed; correct provisional definition requires Ecdysis catalog anti-join (27 rows in production) |
| PROV-03 | Provisional rows carry scientificName, genus, family from iNat taxon; `specimen_observation_id` = WABA obs ID; `observer` = iNat login | `user__login` and `taxon__name` already in WABA observations; genus/family from `observations__taxon__ancestors` child table after D-10 pipeline run |
| PROV-04 | OFV 1718 populates `host_observation_id`; known sample populates `specimen_count`/`sample_id` | OFV 1718 URL format verified (`https://www.inaturalist.org/observations/NNN`); regex extraction pattern confirmed from CONTEXT |
| PROV-05 | Schema gains `is_provisional BOOLEAN`; validate-schema.mjs updated; 2 pytest integration tests | validate-schema.mjs EXPECTED list identified; monkeypatch pattern confirmed from test_export.py |
</phase_requirements>

---

## Summary

Phase 66 restructures `export.py` to emit provisional occurrence rows for WABA observations that have no matching Ecdysis record. The pipeline (`waba_pipeline.py`) gains taxon ancestor fields; the export SQL gains a third join arm and a UNION ALL to inject provisional rows. Six new/renamed columns are added to `occurrences.parquet`.

All core data is already in the database. The 27 truly provisional observations (WABA catalog numbers not yet in Ecdysis) have coordinates, `user__login`, and `taxon__name`. The `observations__taxon__ancestors` child table does not yet exist — it will be created after the pipeline runs with `taxon.ancestors.rank,taxon.ancestors.name` added to `DEFAULT_FIELDS`.

**Primary recommendation:** Implement in this order: (1) add ancestors to DEFAULT_FIELDS and run pipeline; (2) add `specimen_obs_base` CTE and UNION ALL in export.py; (3) update validate-schema.mjs; (4) add conftest.py fixtures; (5) write two integration tests.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Taxon ancestor ingestion | Pipeline (waba_pipeline.py) | — | dlt REST API field list change; dlt normalizes into child table |
| Provisional row computation | Pipeline export (export.py) | — | SQL anti-join against Ecdysis catalog numbers |
| OFV 1718 host linkage | Pipeline export (export.py) | — | Regex extraction in SQL; join to samples_base |
| Schema gate | CI gate (validate-schema.mjs) | — | Column name list maintained in JS; hyparquet reads parquet footer |
| Test fixtures | Test layer (conftest.py) | — | Session-scoped DuckDB fixture extended with new tables/rows |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dlt | 1.24.0 | Pipeline ingestion; REST API → DuckDB | Already used; `waba_pipeline.py` uses dlt REST API config |
| duckdb | (project version) | SQL export engine | Already used; CTE-based export in export.py |
| pytest | (project version) | Integration tests | Already used; conftest.py session-scoped fixture pattern |

**No new dependencies required.** All work is SQL restructuring and Python test fixture additions.

---

## Architecture Patterns

### System Architecture Diagram

```
iNat API (taxon.ancestors field)
    |
    v
waba_pipeline.py (DEFAULT_FIELDS += ancestors)
    |
    v
inaturalist_waba_data.observations__taxon__ancestors
    [rank, name, _dlt_root_id, _dlt_parent_id, _dlt_list_idx, _dlt_id]
    |
    +--- export.py CTEs ---+
    |                      |
    |  ecdysis_base         |  specimen_obs_base (NEW)
    |  (ARM 1, unchanged)   |  WABA obs + LEFT JOIN ancestors (genus, family)
    |        |              |        |
    |        v              |        v
    |    waba_link           |  provisional_waba_ids CTE (anti-join Ecdysis)
    |  (catalog match)      |        |
    |        |              |        v
    |   LEFT JOIN           |  UNION ALL provisional rows
    |  specimen_obs_base    |  LEFT JOIN samples_base (via OFV 1718 host_obs_id)
    |  for D-02/D-03/D-04  |
    |        |              |
    +--------+--------------+
    |
    v
joined CTE (FULL OUTER JOIN ARM 1 × ARM 3)
UNION ALL provisional rows
    |
    v
occ_pt → with_county → county_fallback → final_county
         → with_eco   → eco_dedup      → final_eco
    |
    v
occurrences.parquet (26 columns: 20 existing + 5 new + 1 renamed)
```

### Recommended Project Structure
```
data/
├── export.py              # Add specimen_obs_base CTE + UNION ALL arm
├── waba_pipeline.py       # Add taxon.ancestors to DEFAULT_FIELDS
└── tests/
    ├── conftest.py        # Add taxon__name/taxon__rank cols, ancestors table, 2nd WABA obs
    ├── fixtures.py        # Unchanged
    └── test_export.py     # Add 2 new tests; update EXPECTED_OCCURRENCES_COLS
scripts/
└── validate-schema.mjs    # Update EXPECTED list: rename observer, add 5 columns
```

### Pattern 1: dlt Child Table for Nested Arrays (Merge Disposition)

**What:** When `write_disposition='merge'`, dlt adds `_dlt_root_id` (in addition to `_dlt_parent_id`) to child tables of type array. `_dlt_root_id` equals the parent `_dlt_id`. This is the join key used throughout the codebase.

**When to use:** Always join child tables using `_dlt_root_id = parent._dlt_id`. This is the existing pattern for `observations__ofvs` and will apply identically to `observations__taxon__ancestors`.

**Example (verified against production DB):**
```sql
-- observations__ofvs join (existing pattern)
JOIN inaturalist_waba_data.observations__ofvs ofv
    ON ofv._dlt_root_id = waba._dlt_id
    AND ofv.field_id = 18116

-- observations__taxon__ancestors join (new, same pattern)
LEFT JOIN inaturalist_waba_data.observations__taxon__ancestors anc_genus
    ON anc_genus._dlt_root_id = waba._dlt_id
    AND anc_genus.rank = 'genus'
LEFT JOIN inaturalist_waba_data.observations__taxon__ancestors anc_family
    ON anc_family._dlt_root_id = waba._dlt_id
    AND anc_family.rank = 'family'
```

**Verified:** dlt 1.24.0 with `write_disposition='merge'` creates both `_dlt_root_id` and `_dlt_parent_id` on child tables. `_dlt_root_id` = `_dlt_parent_id` for single-level nesting (confirmed by checking production `inaturalist_waba_data.observations__ofvs`).

### Pattern 2: _row_id Uniqueness Across UNION ALL

**What:** The `joined` CTE uses `ROW_NUMBER() OVER () AS _row_id`. When joined becomes a UNION ALL, `ROW_NUMBER()` must span both arms, or use arm-specific offsets.

**Recommended approach:** Apply `ROW_NUMBER() OVER ()` to the final union result, not to individual arms. Name the intermediate union CTE `combined` and apply ROW_NUMBER in a wrapping CTE called `joined`.

```sql
combined AS (
    -- ARM 1: Ecdysis rows (FULL OUTER JOIN with samples_base)
    SELECT ... FROM ecdysis_base e
    FULL OUTER JOIN samples_base s ON e.host_observation_id = s.observation_id

    UNION ALL

    -- ARM 2: Provisional WABA rows
    SELECT ... FROM provisional_waba_base p
    LEFT JOIN samples_base s ON p.host_observation_id = s.observation_id
),
joined AS (
    SELECT ROW_NUMBER() OVER () AS _row_id, *
    FROM combined
)
```

### Pattern 3: Provisional Row Definition (D-13 Correction)

**What:** The CONTEXT.md D-13 says "anti-join: WABA observations whose id is NOT the specimen_observation_id of any row in waba_link." This definition produces only 1 provisional row (a second photographer) and MISSES the 27 genuinely unmatched observations.

**Root cause:** `waba_link` groups by `catalog_suffix` and picks `MIN(waba.id)`, so all 27 unmatched WABA observations ARE in `waba_link.specimen_observation_id` (their catalog numbers just don't appear in Ecdysis). The anti-join on `waba_link.specimen_observation_id` therefore excludes them.

**Correct implementation:** Anti-join against Ecdysis catalog suffixes directly:

```sql
ecdysis_catalog_suffixes AS (
    SELECT DISTINCT CAST(regexp_extract(o.catalog_number, '[0-9]+$', 0) AS BIGINT) AS catalog_suffix
    FROM ecdysis_data.occurrences o
    WHERE o.decimal_latitude IS NOT NULL AND o.decimal_latitude != ''
),
provisional_waba_ids AS (
    -- waba_link rows whose catalog_suffix has NO matching Ecdysis record
    SELECT wl.specimen_observation_id AS waba_obs_id
    FROM waba_link wl
    LEFT JOIN ecdysis_catalog_suffixes ecs ON ecs.catalog_suffix = wl.catalog_suffix
    WHERE ecs.catalog_suffix IS NULL
),
provisional_waba_base AS (
    SELECT
        waba.id AS specimen_observation_id,
        waba.user__login AS specimen_inat_login,
        waba.taxon__name AS specimen_inat_taxon_name,
        waba.longitude, waba.latitude,
        ...
    FROM inaturalist_waba_data.observations waba
    WHERE waba.id IN (SELECT waba_obs_id FROM provisional_waba_ids)
)
```

**Verified against production:** This approach yields 27 provisional rows (correct). The waba_link anti-join approach yields 1 (incorrect).

**Note for planner:** This is a corrective finding relative to D-13 as written. The user's intent ("correctly excludes multiple observers photographing the same specimen") is satisfied by this approach — the second photographer (obs 320276469) is excluded because its catalog number DOES appear in Ecdysis.

### Pattern 4: OFV 1718 Host Observation Join for Provisional Rows

```sql
-- OFV 1718 links provisional WABA obs to a host sample observation
LEFT JOIN inaturalist_waba_data.observations__ofvs ofv1718
    ON ofv1718._dlt_root_id = waba._dlt_id
    AND ofv1718.field_id = 1718
-- ARM 3: host sample join
LEFT JOIN samples_base s
    ON s.observation_id = CAST(regexp_extract(ofv1718.value, '([0-9]+)$', 1) AS BIGINT)
```

**Verified:** OFV 1718 stores full URL format `https://www.inaturalist.org/observations/NNN` (confirmed from 98 production rows).

### Anti-Patterns to Avoid

- **ROW_NUMBER on individual UNION arms:** Produces colliding `_row_id` values; county/ecoregion spatial JOINs require globally unique `_row_id` across the full `joined` CTE.
- **Joining ancestors table without rank filter:** Without `AND rank = 'genus'`, a single obs produces multiple ancestor rows; use two separate LEFT JOINs (one for genus, one for family).
- **Using _dlt_parent_id instead of _dlt_root_id:** For `write_disposition='merge'`, both exist and are equal for single-level nesting, but the codebase convention uses `_dlt_root_id`. Match existing pattern.
- **COALESCE-ing Ecdysis scientificName with iNat taxon name:** Ecdysis `scientificName` is expert determination; iNat `taxon__name` is community ID. Keep as separate columns per DISCUSSION-LOG.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Taxon ancestor storage | Custom ancestors table | dlt normalization (DEFAULT_FIELDS += `taxon.ancestors.rank,taxon.ancestors.name`) | dlt handles `_dlt_root_id`, `_dlt_list_idx`, merge/replace logic |
| OFV URL integer extraction | Custom Python parsing | `regexp_extract(value, '([0-9]+)$', 1)` in SQL | DuckDB regex is sufficient; no Python needed |
| Parquet schema validation | Custom column checker | `scripts/validate-schema.mjs` (already exists) | Reuse existing gate; just update EXPECTED list |

---

## Runtime State Inventory

> Skipped: greenfield SQL + fixture additions, no rename/refactor scope.

---

## Common Pitfalls

### Pitfall 1: D-13 Anti-Join Target (CRITICAL)

**What goes wrong:** Using `waba.id NOT IN (SELECT specimen_observation_id FROM waba_link)` produces 1 provisional row, missing the 27 genuinely unmatched observations.

**Why it happens:** `waba_link` already includes unmatched catalog numbers (they get a `specimen_observation_id` entry, just no Ecdysis match). The waba_link anti-join only catches the second photographer of a matched specimen.

**How to avoid:** Anti-join against `ecdysis_catalog_suffixes` (set of catalog suffix integers from `ecdysis_data.occurrences`), not against `waba_link.specimen_observation_id`.

**Warning signs:** Test produces only 1 provisional row when fixture has clearly 2+ unmatched WABA obs.

### Pitfall 2: _dlt_root_id Missing Before Pipeline Run

**What goes wrong:** `observations__taxon__ancestors` does not exist until `waba_pipeline.py` is run with the updated DEFAULT_FIELDS. Export SQL that references this table will fail immediately.

**Why it happens:** The table is created by dlt on first ingestion. Adding to DEFAULT_FIELDS is not enough — a pipeline run must occur.

**How to avoid:** Plan must include: (1) update DEFAULT_FIELDS; (2) run pipeline (`uv run python data/waba_pipeline.py`); (3) verify table exists; (4) then write/run export SQL.

**Warning signs:** `Catalog Error: Table with name "observations__taxon__ancestors" does not exist` on export.

### Pitfall 3: Fixture Missing taxon__name and taxon__rank

**What goes wrong:** The conftest.py `inaturalist_waba_data.observations` table lacks `taxon__name` and `taxon__rank` columns. Export SQL referencing `waba.taxon__name` will fail in tests.

**Why it happens:** Fixture was created before these columns were added to DEFAULT_FIELDS (they exist in production but the fixture predates them).

**How to avoid:** Add `taxon__name VARCHAR, taxon__rank VARCHAR` to the `CREATE TABLE inaturalist_waba_data.observations` statement in conftest.py. Also add values to INSERT statements.

**Warning signs:** `Binder Error: Referenced column "taxon__name" not found` in pytest.

### Pitfall 4: Spatial Join Requirement for Provisional Rows

**What goes wrong:** `assert null_county == 0` and `assert null_eco == 0` fire if provisional rows have null lat/lon. The spatial fallback CTEs require non-null coordinates.

**Why it happens:** The fallback logic computes `ST_Point(lon, lat)` — NULL lat/lon causes a DuckDB error or NULL spatial point that the fallback can't resolve.

**How to avoid:** The `provisional_waba_base` CTE should use `WHERE waba.longitude IS NOT NULL AND waba.latitude IS NOT NULL` (or handle NULL coordinates separately). In production, all 27 provisional WABA obs have non-null coordinates (verified).

**Warning signs:** `null_county` or `null_eco` assertion failure in tests or production export.

### Pitfall 5: samples_base JOIN Key for Provisional Rows

**What goes wrong:** Provisional rows join to `samples_base` via `host_observation_id`, but `samples_base.observation_id` is from `inaturalist_data.observations` (not WABA). The host obs ID extracted from OFV 1718 must match an iNat plant observation in `inaturalist_data`.

**Why it happens:** ARM 3 (samples_base) always comes from `inaturalist_data.observations`, not from WABA data.

**How to avoid:** The fixture's second WABA obs should have OFV 1718 pointing to `observation_id=999999` (the existing `inaturalist_data.observations` test row). This correctly exercises the join path.

---

## Code Examples

### Current `joined` CTE (to be restructured)

```sql
-- Source: data/export.py lines 102-118
joined AS (
    SELECT
        ROW_NUMBER() OVER () AS _row_id,
        e.ecdysis_id,
        e.catalog_number,
        COALESCE(e.ecdysis_lon, s.sample_lon) AS lon,
        COALESCE(e.ecdysis_lat, s.sample_lat) AS lat,
        COALESCE(e.ecdysis_date, s.sample_date) AS date,
        COALESCE(e.year, YEAR(s.sample_date_raw)) AS year,
        COALESCE(e.month, MONTH(s.sample_date_raw)) AS month,
        e.scientificName, e.recordedBy, e.fieldNumber, e.genus, e.family,
        e.floralHost, e.host_observation_id, e.inat_host, e.inat_quality_grade,
        e.modified, e.specimen_observation_id, e.elevation_m,
        s.observation_id, s.observer, s.specimen_count, s.sample_id
    FROM ecdysis_base e
    FULL OUTER JOIN samples_base s ON e.host_observation_id = s.observation_id
)
```

### EXPECTED columns (validate-schema.mjs, must be updated)

Current:
```js
// sample-side
'observation_id', 'observer', 'specimen_count', 'sample_id',
```

After Phase 66:
```js
// sample-side
'observation_id', 'host_inat_login', 'specimen_count', 'sample_id',
// WABA specimen (new)
'specimen_inat_login', 'specimen_inat_taxon_name', 'specimen_inat_genus', 'specimen_inat_family',
// provisional flag (new)
'is_provisional',
```

### Current EXPECTED_OCCURRENCES_COLS (test_export.py, must be updated)

```python
# Source: data/tests/test_export.py lines 14-26
EXPECTED_OCCURRENCES_COLS = [
    'ecdysis_id', 'catalog_number', 'scientificName', 'recordedBy', 'fieldNumber',
    'genus', 'family', 'floralHost',
    'host_observation_id', 'inat_host', 'inat_quality_grade',
    'modified', 'specimen_observation_id', 'elevation_m',
    'year', 'month',
    'observation_id', 'observer', 'specimen_count', 'sample_id',
    'lat', 'lon', 'date',
    'county', 'ecoregion_l3',
]
```

After Phase 66: replace `'observer'` with `'host_inat_login'`; add `'specimen_inat_login'`, `'specimen_inat_taxon_name'`, `'specimen_inat_genus'`, `'specimen_inat_family'`, `'is_provisional'`.

### conftest.py fixture additions required

```python
# 1. Extend CREATE TABLE inaturalist_waba_data.observations
# Add columns: taxon__name VARCHAR, taxon__rank VARCHAR

# 2. New table (session-scoped)
con.execute("""
    CREATE TABLE inaturalist_waba_data.observations__taxon__ancestors (
        _dlt_root_id VARCHAR, rank VARCHAR, name VARCHAR,
        _dlt_list_idx BIGINT, _dlt_id VARCHAR,
        _dlt_parent_id VARCHAR, _dlt_load_id VARCHAR
    )
""")

# 3. Second WABA observation (unmatched — no OFV 18116 or OFV with non-Ecdysis value)
# Insert into inaturalist_waba_data.observations with _dlt_id='waba-obs-2', id=888888
# taxon__name='Osmia', taxon__rank='genus', user__login='provisionaluser'
# lon=-120.8, lat=47.5 (inside test polygons)

# 4. OFV 1718 on the unmatched obs pointing to known host sample
# observations__ofvs: _dlt_root_id='waba-obs-2', field_id=1718, 
# value='https://www.inaturalist.org/observations/999999'

# 5. Ancestor rows for both WABA obs
# observations__taxon__ancestors: _dlt_root_id='waba-obs-1', rank='genus', name='Eucera'
# observations__taxon__ancestors: _dlt_root_id='waba-obs-1', rank='family', name='Apidae'
# observations__taxon__ancestors: _dlt_root_id='waba-obs-2', rank='genus', name='Osmia'
# observations__taxon__ancestors: _dlt_root_id='waba-obs-2', rank='family', name='Megachilidae'
```

### Two Required Integration Tests

```python
# Test 1: Provisional rows appear for unmatched WABA obs
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

# Test 2: Matched WABA obs (catalog number in Ecdysis) absent from provisional rows
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

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Two-arm FULL OUTER JOIN (Ecdysis × samples) | Three-arm with UNION ALL for provisional rows | Phase 66 | Provisional WABA rows appear in occurrences.parquet |
| `observer` = host sample iNat login | `host_inat_login` (renamed) + `specimen_inat_login` (new) | Phase 66 | Breaking schema change; validate-schema.mjs + frontend must be updated |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | After pipeline runs with taxon.ancestors, `_dlt_root_id` will equal `_dlt_parent_id` for single-level nesting in production (as in test) | Pattern 1 | Join SQL would use wrong column; tested with dlt 1.24.0 merge disposition — LOW risk |

**All other claims verified against production DB or live dlt test.**

---

## Open Questions

1. **D-13 Correction Requires User Awareness**
   - What we know: The correct provisional definition uses Ecdysis catalog anti-join (27 rows), not waba_link specimen_observation_id anti-join (1 row).
   - What's unclear: Whether the user is aware this discrepancy exists.
   - Recommendation: Planner should document the corrective interpretation in the plan. No user re-discussion needed — the user's stated intent ("excludes multiple observers of same specimen") is correctly served by the Ecdysis catalog anti-join.

2. **Second Photographer (obs 320276469) Row Fate**
   - What we know: obs 320276469 has OFV 18116 value 25000848 (exists in Ecdysis), but waba_link picks obs 320276018 as `specimen_observation_id` via MIN. So 320276469 is not in waba_link and not provisional — it produces no row in the current or new export.
   - What's unclear: Is this silent omission intentional? The Ecdysis row gets `specimen_observation_id=320276018`; the second photographer is simply dropped.
   - Recommendation: This is pre-existing behavior and out of scope for Phase 66. No action needed.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| dlt | waba_pipeline.py | Yes | 1.24.0 | — |
| duckdb CLI | DB inspection | Yes | (project version) | Python API |
| uv | Test runner | Yes | (project version) | — |
| beeatlas.duckdb | Pipeline run to create ancestors table | Yes (local) | — | — |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 |
| Config file | data/pyproject.toml |
| Quick run command | `uv run pytest data/tests/test_export.py -x` |
| Full suite command | `uv run pytest data/tests/ -v` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROV-01 | taxon ancestors ingested by pipeline | manual (pipeline run) | `uv run python data/waba_pipeline.py` | N/A |
| PROV-02 | provisional rows appear in parquet | integration | `uv run pytest data/tests/test_export.py::test_provisional_rows_appear -x` | Wave 0 |
| PROV-03 | provisional rows have iNat taxon fields | integration | `uv run pytest data/tests/test_export.py::test_provisional_rows_appear -x` | Wave 0 |
| PROV-04 | OFV 1718 populates host_observation_id + sample context | integration | `uv run pytest data/tests/test_export.py::test_provisional_rows_appear -x` | Wave 0 |
| PROV-05 | matched WABA obs absent from provisional rows | integration | `uv run pytest data/tests/test_export.py::test_matched_waba_not_provisional -x` | Wave 0 |
| PROV-05 | validate-schema.mjs passes | schema gate | `node scripts/validate-schema.mjs` | Yes |

### Sampling Rate
- **Per task commit:** `uv run pytest data/tests/test_export.py -x`
- **Per wave merge:** `uv run pytest data/tests/ -v`
- **Phase gate:** Full suite green + `node scripts/validate-schema.mjs` passing + actual `uv run python data/export.py` run (verifies spatial assertions)

### Wave 0 Gaps
- [ ] `data/tests/test_export.py::test_provisional_rows_appear` — covers PROV-02, PROV-03, PROV-04
- [ ] `data/tests/test_export.py::test_matched_waba_not_provisional` — covers PROV-05 inclusion/exclusion

---

## Security Domain

> Not applicable — pipeline-only, static hosting, no authentication, no user input, no network endpoints.

---

## Sources

### Primary (HIGH confidence — verified against live codebase)
- `data/export.py` — exact CTE structure, column list, ROW_NUMBER pattern
- `data/waba_pipeline.py` — exact DEFAULT_FIELDS string, dlt config
- `data/tests/conftest.py` — fixture table schemas, seed data
- `data/tests/test_export.py` — EXPECTED_OCCURRENCES_COLS, monkeypatch pattern
- `scripts/validate-schema.mjs` — EXPECTED column list
- `data/beeatlas.duckdb` — production table schemas, OFV 1718 URL format, provisional count (27), waba_link behavior

### Secondary (HIGH confidence — verified via dlt execution)
- dlt 1.24.0 + `write_disposition='merge'` → `_dlt_root_id` present in child tables (verified by running actual pipeline)
- `observations__taxon__ancestors` confirmed as correct child table name for `taxon.ancestors` nested array (verified by running dlt)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all tools verified installed
- Architecture: HIGH — verified against production DB and dlt behavior
- Pitfalls: HIGH — D-13 discrepancy verified with exact counts from production data
- D-13 correction: HIGH — empirically confirmed (27 vs 1 provisional rows)

**Research date:** 2026-04-20
**Valid until:** 2026-05-20 (stable pipeline; no external API changes anticipated)
