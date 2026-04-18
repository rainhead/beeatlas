# Phase 62: Pipeline Join - Research

**Researched:** 2026-04-17
**Domain:** DuckDB SQL, Python data pipeline, Parquet schema validation
**Confidence:** HIGH

## Summary

Phase 62 replaces two separate export functions (`export_ecdysis_parquet`, `export_samples_parquet`) with a single `export_occurrences_parquet` function that performs a full outer join on `ecdysis.host_observation_id = samples.observation_id`. The existing spatial join CTE logic (county, ecoregion) is duplicated across both functions — this phase collapses that duplication by running spatial joins once over the unified coordinate set.

The implementation is entirely internal to `data/export.py` and `scripts/validate-schema.mjs`. No other files require changes. The existing test infrastructure in `data/tests/test_export.py` covers the pattern: tests call the export function, read back the parquet, and assert on schema + row counts. New tests for `export_occurrences_parquet` follow the same fixture-based approach using `fixture_con` and `export_dir`.

The column list for `occurrences.parquet` must satisfy both downstream consumers: Phase 63 (`sqlite.ts`) and Phase 64 (`OccurrenceSource`). The planner has discretion over the complete column list, `year`/`month` handling for sample-only rows, and exact CTE structure within the single-query constraint.

**Primary recommendation:** Write `export_occurrences_parquet` as a single SQL CTE chain; place specimen-side CTEs first (reusing existing ecdysis CTE structure), then add the outer join, then COALESCE coordinates, then spatial joins over the unified point set, then `COPY ... TO`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `export_ecdysis_parquet()` and `export_samples_parquet()` are deleted; `ecdysis.parquet` and `samples.parquet` are no longer produced after this phase.
- **D-02:** `validate-schema.mjs` is updated in Phase 62 (same commit) to validate `occurrences.parquet` and remove the old `ecdysis.parquet`/`samples.parquet` entries. CI gate stays in sync with the pipeline change.
- **D-03:** The full outer join and spatial joins (county, ecoregion) are expressed as a single SQL query in one `COPY ... TO` call. No Python helper for SQL fragments — single-pass, county/ecoregion CTEs run once over the unified coordinate set.
- **D-04:** Join key: `ecdysis.host_observation_id = samples.observation_id` (full outer join). Specimens without a linked sample row and samples without a linked specimen row each appear as their own row with nulls on the other side.
- **D-05:** Coordinate precedence for joined rows: `COALESCE(ecdysis.longitude, samples.lon)` → `lat`, `COALESCE(ecdysis.latitude, samples.lat)` → `lon`. Ecdysis coordinates are preferred as the more authoritative source.
- **D-06:** Post-export assertions match existing pattern: zero null county, zero null ecoregion_l3. Print row count, null counts, and file size.

### Claude's Discretion
- Complete column list for `occurrences.parquet` (all ecdysis-only columns null for sample-only rows; all sample-only columns null for specimen-only rows; `year`/`month` handling)
- Whether to compute `year`/`month` for sample rows from `date`
- Exact SQL CTE structure within the single-query constraint

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OCC-01 | `export.py` produces `occurrences.parquet` from a full outer join of ecdysis specimens and iNat samples; specimen-side columns are null for sample-only rows; sample-side columns are null for specimen-only rows; `validate-schema.mjs` updated in the same commit | Full outer join pattern documented below; existing spatial CTE structure maps directly to unified query |
| OCC-03 | COALESCE unifies coordinate columns (`ecdysis.lat`/`lon` vs `samples.latitude`/`longitude`) into canonical `lat`/`lon`; `date` column standardized to VARCHAR ISO format in export SQL | COALESCE pattern from D-05; ecdysis already exports `date` as `o.event_date VARCHAR`; samples export `observed_on DATE` — cast to VARCHAR at SELECT time |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Full outer join of ecdysis + iNat samples | Data pipeline (Python/DuckDB) | — | Pure offline ETL step; no runtime component involved |
| Coordinate COALESCE | Data pipeline (SQL) | — | Applied once at export time; frontend reads canonical lat/lon columns |
| Spatial join (county, ecoregion) | Data pipeline (SQL) | — | Expensive computation done once; results stored as parquet columns |
| Schema gate (CI) | Node script (`validate-schema.mjs`) | — | Runs pre-build; catches schema drift before frontend build |
| Test coverage of export | pytest (`data/tests/test_export.py`) | — | Existing fixture-based integration tests; new tests follow same pattern |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| duckdb (Python) | Current in `data/uv.lock` | SQL execution, parquet write | Already in use; `COPY ... TO (FORMAT PARQUET)` is the established pattern [VERIFIED: data/export.py] |
| pytest | Current in `data/pyproject.toml` | Test runner | Established project test runner [VERIFIED: data/tests/] |
| hyparquet | Current in frontend deps | Parquet schema reading in `validate-schema.mjs` | Already used by validate-schema.mjs [VERIFIED: scripts/validate-schema.mjs] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| duckdb spatial extension | Bundled with duckdb | ST_Point, ST_Within, ST_Distance | Required for county/ecoregion spatial joins; already loaded in export.py [VERIFIED: data/export.py:305] |

**No new packages required.** All dependencies are already installed.

## Architecture Patterns

### System Architecture Diagram

```
ecdysis_data.occurrences ─────────────────────────────┐
ecdysis_data.occurrence_links ────────────────────────┤
inaturalist_data.observations (sample records) ───────┤
inaturalist_data.observations__ofvs (specimen_count) ─┤
inaturalist_waba_data.* (WABA link) ──────────────────┤
                                                       ▼
                                          [full outer join on
                                           host_observation_id = observation_id]
                                                       │
                                                       ▼
                                          [COALESCE coordinates → pt]
                                                       │
                                                       ▼
                                          [spatial join → county]
                                          [spatial join → ecoregion_l3]
                                                       │
                                                       ▼
                                         COPY ... TO occurrences.parquet
                                                       │
                                                       ▼
                                    validate-schema.mjs (CI gate)
```

### Recommended Project Structure
```
data/
├── export.py              # export_occurrences_parquet() replaces two functions
├── tests/
│   └── test_export.py     # new tests for export_occurrences_parquet; old ecdysis/samples tests removed
scripts/
└── validate-schema.mjs    # EXPECTED dict updated for occurrences.parquet
```

### Pattern 1: Full Outer Join in Single CTE Chain

**What:** Both source tables are fully represented in CTEs before the join; the join uses `FULL OUTER JOIN`; COALESCE resolves coordinates and IDs for spatial CTE inputs.

**When to use:** Any time two record sets with partial overlap must be unified into one output with nulls on non-contributing sides.

**Example — structural sketch:**
```sql
-- Source: data/export.py patterns [VERIFIED: data/export.py]
WITH wa_counties AS (...),   -- reused verbatim from existing CTEs
wa_eco AS (...),             -- reused verbatim from existing CTEs
ecdysis_base AS (
    SELECT
        CAST(o.id AS INTEGER) AS ecdysis_id,
        o.catalog_number,
        CAST(o.decimal_longitude AS DOUBLE) AS ecdysis_lon,
        CAST(o.decimal_latitude AS DOUBLE) AS ecdysis_lat,
        o.event_date AS date,
        CAST(o.year AS INTEGER) AS year,
        CAST(o.month AS INTEGER) AS month,
        -- ... all specimen-side columns ...
        links.host_observation_id
    FROM ecdysis_data.occurrences o
    -- ... LEFT JOINs for id_modified, waba_link, occurrence_links ...
    WHERE o.decimal_latitude IS NOT NULL AND o.decimal_latitude != ''
),
samples_base AS (
    SELECT
        ws.id AS observation_id,   -- this is the join key
        ws.user__login AS observer,
        ws.observed_on::VARCHAR AS sample_date,
        ws.longitude AS sample_lon,
        ws.latitude AS sample_lat,
        CAST(sc.value AS INTEGER) AS specimen_count,
        TRY_CAST(sid.value AS INTEGER) AS sample_id
    FROM inaturalist_data.observations ws
    JOIN inaturalist_data.observations__ofvs sc ON ...
    LEFT JOIN inaturalist_data.observations__ofvs sid ON ...
    WHERE ws.longitude IS NOT NULL AND ws.latitude IS NOT NULL
),
joined AS (
    SELECT
        e.ecdysis_id,
        e.catalog_number,
        COALESCE(e.ecdysis_lon, s.sample_lon) AS lon,
        COALESCE(e.ecdysis_lat, s.sample_lat) AS lat,
        COALESCE(e.date, s.sample_date) AS date,
        e.year,
        e.month,
        -- specimen-side columns (null for sample-only rows)
        e.scientificName, e.recordedBy, e.fieldNumber, e.genus, e.family,
        e.floralHost, e.host_observation_id, e.inat_host, e.inat_quality_grade,
        e.modified, e.specimen_observation_id, e.elevation_m,
        -- sample-side columns (null for specimen-only rows)
        s.observation_id,
        s.observer,
        s.specimen_count,
        s.sample_id
    FROM ecdysis_base e
    FULL OUTER JOIN samples_base s ON e.host_observation_id = s.observation_id
),
occ_pt AS (
    SELECT *, ST_Point(lon, lat) AS pt FROM joined
),
with_county AS (...),   -- same county fallback logic, keyed on (ecdysis_id, observation_id)
with_eco AS (...),      -- same ecoregion fallback logic
...
SELECT j.*, fc.county, fe.ecoregion_l3
FROM joined j
JOIN final_county fc ON ...
JOIN final_eco fe ON ...
```

**Key concerns about the join key CTE:**
- The county/ecoregion CTE fallback logic in the existing code uses `occurrence_id` (ecdysis internal UUID) and `_dlt_id` (iNat DLT internal UUID) as keys. After the full outer join, a single stable row key is needed for the fallback subqueries. Since both ecdysis_id and observation_id can be NULL (opposite sides), the CTE must use a composite or COALESCE key, or restructure to avoid correlated subquery lookups by occurrence_id.

**Anti-pattern:** Do not attempt to reuse the original `occurrence_id` (UUID) or `_dlt_id` as the spatial CTE row key after the join — these are internal pipeline IDs that are NULL on the non-contributing side.

### Pattern 2: Coordinate Column Naming

**What:** The two existing parquets use different coordinate column names (`longitude`/`latitude` in ecdysis, `lon`/`lat` in samples). The unified schema must pick one convention.

**Decision D-05 choice:** Output columns are named `lat` and `lon` (samples convention), populated by COALESCE from ecdysis coordinates first.

**Impact on validate-schema.mjs:** The `EXPECTED['occurrences.parquet']` array must list `lat` and `lon`, not `latitude`/`longitude`.

### Pattern 3: Date Column Normalization

**What:** Ecdysis exports `event_date` as VARCHAR (`o.event_date AS date`). iNat observations use `observed_on DATE`. Both must produce ISO format VARCHAR in the output column.

**Current ecdysis behavior:** `o.event_date AS date` — already VARCHAR, already ISO format (e.g., `'2024-06-15'`). [VERIFIED: data/export.py:109, conftest.py seed data]

**For sample-only rows:** `ws.observed_on` is a DATE column. Cast with `CAST(ws.observed_on AS VARCHAR)` → produces `'2024-06-15'` in DuckDB. [ASSUMED — DuckDB DATE::VARCHAR produces ISO format; verify during implementation]

**year/month for sample rows:** Since sample-only rows will have NULL `year`/`month` (no ecdysis columns), the planner may decide to compute `YEAR(ws.observed_on)` and `MONTH(ws.observed_on)` for sample rows via COALESCE. This is within Claude's discretion.

### Pattern 4: validate-schema.mjs Update

**What:** `EXPECTED` dict in `validate-schema.mjs` is a plain JS object. Update requires:
1. Remove `'ecdysis.parquet'` key and its column array
2. Remove `'samples.parquet'` key and its column array
3. Add `'occurrences.parquet'` key with unified column array
4. Update local-file detection: `existsSync(join(ASSETS_DIR, 'ecdysis.parquet'))` → `existsSync(join(ASSETS_DIR, 'occurrences.parquet'))`

[VERIFIED: scripts/validate-schema.mjs:38]

### Anti-Patterns to Avoid

- **Splitting the query into multiple COPY calls:** D-03 explicitly requires a single query; splitting would require temporary tables or intermediate parquet files.
- **Running spatial joins twice (once per source):** The whole point of unification is running spatial joins once over the COALESCE coordinate set.
- **Keeping `export_ecdysis_parquet` / `export_samples_parquet` as helpers:** D-01 says delete them, not refactor them into helpers.
- **Reusing `occurrence_id` (ecdysis UUID) as the unified row key in spatial fallback CTEs:** This UUID is NULL for sample-only rows; a composite key or restructured join is needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parquet schema assertion | Custom parquet reader | `duckdb.execute("DESCRIBE SELECT * FROM read_parquet(...)")` | Already the project pattern; DuckDB reads parquet natively [VERIFIED: data/tests/test_export.py:43] |
| County/ecoregion spatial join | Custom point-in-polygon | DuckDB spatial extension ST_Within + fallback CTE | Already implemented and tested; copy verbatim from existing CTEs |
| Full outer join | Python-side merge with pandas | DuckDB `FULL OUTER JOIN` in SQL | DuckDB handles this natively; no Python-side data manipulation needed |

**Key insight:** The existing spatial CTE logic (~50 lines per function, duplicated) is battle-tested and should be ported verbatim — only the row key and entry point change.

## Runtime State Inventory

> This is a code/data pipeline change, not a rename/refactor/migration of runtime state.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `ecdysis.parquet` and `samples.parquet` in `frontend/public/data/` are build artifacts regenerated by the pipeline | No data migration; old files are overwritten/removed on next pipeline run |
| Live service config | `scripts/validate-schema.mjs` references both filenames — must be updated in same commit per D-02 | Code edit |
| OS-registered state | None — nightly cron runs `data/run.py` which calls `export.main()`; no task-level references to file names | None |
| Secrets/env vars | None | None |
| Build artifacts | `data/ecdysis.parquet` and `data/samples.parquet` exist locally (seen in `ls data/`) — stale after this phase | Will be superseded; old local files can be deleted manually or ignored |

**Note on production S3:** The existing parquet files on S3/CloudFront (`ecdysis.parquet`, `samples.parquet`) will remain until the next pipeline run overwrites them. `validate-schema.mjs` falls back to CloudFront when no local file exists; after the code change, the CloudFront fallback will look for `occurrences.parquet` — which won't exist until the pipeline runs. This is acceptable per REQUIREMENTS.md "S3 cleanup of old parquet files" being out of scope.

## Common Pitfalls

### Pitfall 1: Spatial CTE Row Key After Full Outer Join

**What goes wrong:** The existing county/ecoregion fallback CTEs use `occurrence_id` (ecdysis UUID) or `_dlt_id` (iNat UUID) as the correlated subquery key. After a full outer join, rows may have one of these as NULL.

**Why it happens:** The fallback CTE uses a correlated subquery like `WHERE ws2._dlt_id = eco_dedup._dlt_id` — this silently drops rows where the key is NULL.

**How to avoid:** In the unified query, key the spatial CTEs on a stable non-null identifier. Options:
  - Generate a synthetic row key with `ROW_NUMBER() OVER () AS _row_id` in the `joined` CTE, then propagate it through spatial CTEs.
  - Alternatively, rewrite the fallback CTEs to avoid correlated subqueries (use a lateral join or ranked window function instead).

**Warning signs:** Test case where a sample-only row (ecdysis_id IS NULL) ends up with NULL county or ecoregion_l3, causing the zero-null assertion to fail.

### Pitfall 2: Duplicate Rows from Full Outer Join Fan-out

**What goes wrong:** If a single `samples.observation_id` links to multiple ecdysis specimens (one sample matched by multiple specimens), the full outer join multiplies rows.

**Why it happens:** The join is `ecdysis.host_observation_id = samples.observation_id`; if multiple ecdysis specimens link to the same iNat observation, one sample row fans out to N specimen rows. This is likely correct behavior (each specimen is its own row), but may surprise if the expectation was one row per sample.

**How to avoid:** The post-export row count print (D-06) will surface unexpected counts. No special handling required per project scope — this behavior preserves existing ecdysis row-per-specimen semantics.

**Warning signs:** Suspiciously high row count compared to sum of ecdysis + sample counts.

### Pitfall 3: validate-schema.mjs Local File Detection

**What goes wrong:** The script checks `existsSync(join(ASSETS_DIR, 'ecdysis.parquet'))` to decide local vs. CloudFront mode. After this phase, that file no longer exists locally, so CI may silently fall back to CloudFront validation against the old schema.

**Why it happens:** The detection logic is filename-specific [VERIFIED: scripts/validate-schema.mjs:38].

**How to avoid:** Update the detection to check `occurrences.parquet` in the same commit (D-02).

### Pitfall 4: samples_base Observation ID Type Mismatch

**What goes wrong:** `inaturalist_data.observations.id` is `BIGINT` (see conftest.py fixture schema); `ecdysis_data.occurrence_links.host_observation_id` is also `BIGINT`. The join should work directly. However, `observations__ofvs` uses `_dlt_root_id VARCHAR` as the foreign key, not `id BIGINT`. The samples CTE must join via `_dlt_root_id = op._dlt_id`, not `id`.

**Why it happens:** The existing `export_samples_parquet` already handles this correctly (joins on `_dlt_root_id`); the pattern must be preserved in `samples_base` CTE.

**How to avoid:** Copy the `with_specimen` CTE structure from `export_samples_parquet` verbatim as `samples_base`.

## Code Examples

### Existing COPY pattern (reuse verbatim)
```python
# Source: data/export.py lines 27-135 [VERIFIED]
out = str(ASSETS_DIR / "occurrences.parquet")
con.execute(f"""
COPY (
WITH wa_counties AS (...),
...
SELECT ...
) TO '{out}' (FORMAT PARQUET)
""")
```

### Existing post-export verification pattern (adapt for unified schema)
```python
# Source: data/export.py lines 138-155 [VERIFIED]
row = con.execute(f"""
SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN county IS NULL THEN 1 ELSE 0 END) AS null_county,
    SUM(CASE WHEN ecoregion_l3 IS NULL THEN 1 ELSE 0 END) AS null_eco
FROM read_parquet('{out}')
""").fetchone()
total, null_county, null_eco = row
print(f"  occurrences.parquet: {total:,} rows, {null_county} null county, {null_eco} null ecoregion, "
      f"{(ASSETS_DIR / 'occurrences.parquet').stat().st_size:,} bytes")
assert null_county == 0, f"occurrences.parquet has {null_county} rows with null county"
assert null_eco == 0, f"occurrences.parquet has {null_eco} rows with null ecoregion_l3"
```

### Test pattern (existing, adapt for occurrences)
```python
# Source: data/tests/test_export.py lines 37-49 [VERIFIED]
def test_occurrences_parquet_schema(fixture_con, export_dir, monkeypatch):
    monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)
    export_mod.export_occurrences_parquet(fixture_con)

    parquet_path = str(export_dir / 'occurrences.parquet')
    schema = duckdb.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{parquet_path}')"
    ).fetchall()
    actual_cols = [row[0] for row in schema]
    for col in EXPECTED_OCCURRENCES_COLS:
        assert col in actual_cols, f"Missing column: {col}"
```

### validate-schema.mjs EXPECTED update
```javascript
// Source: scripts/validate-schema.mjs EXPECTED dict [VERIFIED]
const EXPECTED = {
  'occurrences.parquet': [
    // specimen-side (null for sample-only rows)
    'ecdysis_id', 'catalog_number', 'scientificName', 'recordedBy', 'fieldNumber',
    'genus', 'family', 'floralHost',
    'host_observation_id', 'inat_host', 'inat_quality_grade',
    'modified', 'specimen_observation_id', 'elevation_m',
    'year', 'month',
    // sample-side (null for specimen-only rows)
    'observation_id', 'observer', 'specimen_count', 'sample_id',
    // unified columns (always populated via COALESCE)
    'lat', 'lon', 'date',
    'county', 'ecoregion_l3',
  ],
};
// NOTE: exact column list is Claude's discretion — planner finalizes
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Two separate parquets (ecdysis.parquet + samples.parquet) | Single occurrences.parquet | Phase 62 | Frontend phases 63-65 can use one table; spatial joins run once |
| Duplicate spatial CTE logic (~50 lines × 2) | Single spatial CTE pass over unified coordinates | Phase 62 | Eliminates ~50 lines of duplication |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | DuckDB `CAST(observed_on AS VARCHAR)` produces ISO format `'YYYY-MM-DD'` | Pattern 3 | date column format wrong; downstream frontend date parsing breaks |
| A2 | No sample row has multiple ecdysis specimens linked via the same host_observation_id; row count stays predictable | Pitfall 2 | Row count higher than expected; downstream table pages show duplicate samples |

## Open Questions (RESOLVED)

1. **Unified row key for spatial CTE fallbacks**
   - What we know: Existing fallback CTEs use `occurrence_id` (ecdysis UUID) or `_dlt_id` (iNat UUID) as correlated subquery keys.
   - What's unclear: Whether to use `ROW_NUMBER()` or restructure the fallback to avoid correlated subqueries entirely (window function approach is cleaner but more divergent from existing pattern).
   - Recommendation: Use `ROW_NUMBER() OVER () AS _row_id` in the `joined` CTE — minimal change from existing pattern, clearly propagated through spatial CTEs.
   - RESOLVED: Use `ROW_NUMBER() OVER () AS _row_id` in the `joined` CTE (adopted in Plan 02 CTE 7).

2. **year/month for sample-only rows**
   - What we know: CONTEXT.md says this is Claude's discretion.
   - What's unclear: Whether Phase 63+ frontend code will need year/month for sample rows (e.g., for date range filter).
   - Recommendation: Compute `YEAR(ws.observed_on)` / `MONTH(ws.observed_on)` for sample rows using COALESCE with ecdysis year/month — zero cost, forward-compatible.
   - RESOLVED: Compute `COALESCE(e.year, YEAR(s.sample_date_raw)) AS year` and `COALESCE(e.month, MONTH(s.sample_date_raw)) AS month` (adopted in Plan 02 CTE 7).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| duckdb (Python) | export.py SQL execution | ✓ | In uv.lock | — |
| duckdb spatial extension | County/ecoregion joins | ✓ | Bundled with duckdb | — |
| pytest | Test runner | ✓ | In pyproject.toml | — |
| node / hyparquet | validate-schema.mjs | ✓ | In frontend package.json | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (uv run pytest) |
| Config file | `data/pyproject.toml` |
| Quick run command | `cd /Users/rainhead/dev/beeatlas/data && uv run pytest tests/test_export.py -x` |
| Full suite command | `cd /Users/rainhead/dev/beeatlas/data && uv run pytest` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OCC-01 | `export_occurrences_parquet` writes file with all expected columns | unit | `uv run pytest tests/test_export.py::test_occurrences_parquet_schema -x` | ❌ Wave 0 |
| OCC-01 | Output has at least 1 row with non-null county and ecoregion_l3 | unit | `uv run pytest tests/test_export.py::test_occurrences_parquet_has_rows -x` | ❌ Wave 0 |
| OCC-01 | Old `export_ecdysis_parquet` / `export_samples_parquet` functions removed | unit | `uv run pytest tests/test_export.py -k "not ecdysis_parquet and not samples_parquet" -x` | ❌ Wave 0 (old tests deleted) |
| OCC-01 | `validate-schema.mjs` passes with new occurrences.parquet | integration | `cd /Users/rainhead/dev/beeatlas && node scripts/validate-schema.mjs` | ✅ (file exists, needs content update) |
| OCC-03 | Joined rows have non-null lat/lon from COALESCE | unit | `uv run pytest tests/test_export.py::test_occurrences_coalesce_coords -x` | ❌ Wave 0 |
| OCC-03 | date column is VARCHAR ISO format | unit | `uv run pytest tests/test_export.py::test_occurrences_date_format -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd /Users/rainhead/dev/beeatlas/data && uv run pytest tests/test_export.py -x`
- **Per wave merge:** `cd /Users/rainhead/dev/beeatlas/data && uv run pytest`
- **Phase gate:** Full suite green + `node scripts/validate-schema.mjs` passes before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `data/tests/test_export.py` — replace `test_ecdysis_parquet_*` and `test_samples_parquet_*` tests with `test_occurrences_parquet_*` tests covering OCC-01 and OCC-03
- [ ] Fixture: add a sample-only seed row to `conftest.py` (current seed has `test-obs-1` linked to ecdysis specimen `5594569` via `host_observation_id = 163069968` — but the iNat observation id is `999999`, not `163069968`; this means the existing seed produces a specimen-only row and a sample-only row after the outer join, which is sufficient to test both null sides)

**Fixture note [VERIFIED: data/tests/conftest.py seed data]:** The existing fixture already has:
- Ecdysis specimen with `host_observation_id = 163069968` (links to iNat)
- iNat observation with `id = 999999`
- These do NOT match (163069968 ≠ 999999), so the full outer join will produce:
  - 1 specimen-only row (ecdysis_id=5594569, observation_id=NULL)
  - 1 sample-only row (ecdysis_id=NULL, observation_id=999999)
- This is actually ideal for testing both null-side paths without adding new seed data.

## Security Domain

> This phase has no authentication, access control, cryptography, or user-facing input. Security section is not applicable.

## Sources

### Primary (HIGH confidence)
- `data/export.py` — complete current implementation read directly [VERIFIED]
- `data/tests/test_export.py` — complete test file read directly [VERIFIED]
- `data/tests/conftest.py` — fixture schemas and seed data read directly [VERIFIED]
- `scripts/validate-schema.mjs` — complete current implementation read directly [VERIFIED]
- `.planning/phases/62-pipeline-join/62-CONTEXT.md` — locked decisions read directly [VERIFIED]
- `.planning/REQUIREMENTS.md` — OCC-01, OCC-03 requirements read directly [VERIFIED]

### Tertiary (LOW confidence / ASSUMED)
- DuckDB `CAST(DATE AS VARCHAR)` produces ISO format — marked [ASSUMED], verify at implementation time

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use, no new dependencies
- Architecture: HIGH — direct read of existing source files; pattern is clear
- Pitfalls: HIGH — spatial CTE row-key issue is derived from direct code reading; fan-out issue is a known SQL join behavior
- Test strategy: HIGH — test infrastructure fully read; Wave 0 gaps clearly identified

**Research date:** 2026-04-17
**Valid until:** 2026-05-17 (stable domain — DuckDB SQL patterns, no fast-moving external APIs)
