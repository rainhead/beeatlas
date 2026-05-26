# Phase 118: Occurrence Model Extension — Research

**Researched:** 2026-05-25
**Domain:** dbt SQL model extension (DuckDB), Python species export, UNION ALL ARM pattern
**Confidence:** HIGH — entire codebase is readable and the pattern is established by ARM 1 and ARM 2

## Summary

Phase 118 extends the three-file dbt pipeline (intermediate models + two marts) to incorporate the iNat expert observations that Phase 117 loaded into `inat_obs_data.observations`. The change has three distinct but tightly-coupled pieces: (1) a new ARM 3 UNION arm in `int_combined.sql` that pulls from `inat_obs_data.observations`; (2) expanded column contracts in the `occurrences` mart schema (both the SQL SELECT list in `occurrences.sql` and the `schema.yml` contract); and (3) a new `inat_obs_count` column in `int_species_universe.sql` / `species.sql` / `species_export.py` / `species.json`.

The Nyquist gate (TDD) pattern requires a Wave 0 RED phase before any implementation. Phase 117 established the pytest pattern for iNat pipeline tests; this phase follows the same pattern for dbt-output assertions (using the `_SANDBOX_GUARD` pattern from `test_dbt_scaffold.py` / `test_species_export.py`).

**Primary recommendation:** Follow the exact ARM 1 / ARM 2 UNION ALL structure for ARM 3. Add `source` column to all three UNION arms (not just ARM 3). Expand the dbt column contract via `schema.yml` only — never modify the Python `SPECIES_COLUMNS` list without also updating the PyArrow schema and `species.json` projection.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| ARM 3 SQL (iNat obs → int_combined) | dbt intermediate layer | — | int_combined owns the UNION ALL of all occurrence sources; ARM 1 and ARM 2 are already there |
| Column contract expansion (occurrences mart) | dbt mart layer (schema.yml) | — | dbt enforces the 31-column contract; expanding adds `source` + 4 nullable iNat columns |
| inat_obs_count per species | dbt intermediate layer (int_species_universe) | Python post-step (species_export.py) | Universe SQL computes the count; species_export.py must extend SPECIES_COLUMNS and PyArrow schema |
| Source discriminator wiring in existing arms | dbt intermediate layer | — | ARM 1 ('ecdysis') and ARM 2 ('waba_sample') source literals are added in int_combined, not downstream |
| inat_obs_data source declaration | dbt sources.yml | — | inat_obs_data.observations must be declared before it can be ref'd |
| Nyquist tests (RED → GREEN) | data/tests/ (pytest) | — | test_dbt_scaffold.py + test_species_export.py patterns |

## Standard Stack

No new packages introduced. All tooling is already present.

### Core (existing, no changes needed)
| Component | Version | Purpose |
|-----------|---------|---------|
| dbt-core + dbt-duckdb | 1.10.1 (pinned in run.sh) | SQL pipeline transforms |
| DuckDB | (via dbt-duckdb) | SQL engine |
| PyArrow | (existing in data/.venv) | species.parquet write with correct column types |
| pytest | (existing) | Nyquist gates |

### New dbt Source Declaration Required
`inat_obs_data.observations` (created by `data/inat_obs_pipeline.py`, Phase 117) is NOT yet declared in `data/dbt/models/sources.yml`. ARM 3 references this table directly — the source declaration must precede the model.

## Package Legitimacy Audit

No new packages to install. Section omitted.

## Architecture Patterns

### System Architecture Diagram

```
inat_obs_data.observations   ecdysis_data.occurrences   inaturalist_waba_data.observations
         |                           |                           |
         v                           v                           v
    [ARM 3 NEW]                 [ARM 1]                     [ARM 2]
  iNat expert obs            Ecdysis specimens          Provisional WABA
         |                           |                           |
         +---------------------------+---------------------------+
                                     |
                            int_combined (TABLE)
                                     |
                            occurrences.sql (mart)
                         (spatial join + source column)
                                     |
                           occurrences.parquet
                                     |
                    +----------------+----------------+
                    |                                 |
          int_species_geo_agg              int_species_occurrences_agg
                    |                    + inat_obs_count_agg [NEW CTE]
                    |                                 |
                    +----------------+----------------+
                                     |
                           int_species_universe
                          (adds inat_obs_count column)
                                     |
                             species.sql (mart)
                                     |
                             species.parquet (19 SQL cols)
                                     |
                           species_export.py
                          (adds slug, inat_obs_count → JSON)
                                     |
                      species.parquet (20 cols) + species.json
```

### Recommended Project Structure

No new files or directories. All changes are in-place edits to existing files:

```
data/dbt/models/
  sources.yml                       # ADD: inat_obs_data source
  intermediate/
    int_combined.sql                # ADD: ARM 3 + source literal in ARM 1 and ARM 2
    int_species_universe.sql        # ADD: inat_obs_count_agg CTE + column
  intermediate/schema.yml           # ADD: inat_obs_count not_null test if desired
  marts/
    occurrences.sql                 # ADD: source column to SELECT list
    schema.yml                      # ADD: source (varchar, not_null), image_url,
                                    #      obs_url, user_login, license (all varchar nullable)
    species.sql                     # ADD: inat_obs_count to SELECT
  staging/
    (no new staging model needed — ARM 3 references source directly)
data/
  species_export.py                 # ADD: inat_obs_count to SPECIES_COLUMNS + PyArrow schema
data/tests/
  test_dbt_scaffold.py              # ADD: 3 Wave 0 RED assertions
  test_species_export.py            # ADD: 1 Wave 0 RED assertion for inat_obs_count
```

### Pattern 1: ARM 3 in int_combined.sql

**What:** UNION ALL arm selecting from `inat_obs_data.observations` with NULL-filled columns for Ecdysis-specific fields.
**When to use:** Whenever a new occurrence source must enter the unified model.

**Key structural rules:**
- ARM 3 must produce EXACTLY the same column list as ARM 1 and ARM 2 (including the `source` literal column that will be added to all three arms in this phase)
- NULL-fill ALL Ecdysis/WABA-specific columns that have no iNat analog
- Use `YEAR(observed_on)` and `MONTH(observed_on)` for year/month (not VARCHAR extraction)
- `obs_url` maps to `inat_obs_data.observations.obs_url`
- `canonical_name` is already canonicalized by Phase 117's `inat_obs_pipeline.py`
- `floral_host` → `floralHost` (camelCase in the existing contract)
- `is_provisional` = FALSE (these are expert-curated observations, not provisional)

```sql
-- Source: int_combined.sql, based on ARM 1/ARM 2 structure [ASSUMED - pattern observed in codebase]
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
    NULL                               AS specimen_inat_taxon_name,
    NULL                               AS specimen_inat_quality_grade,
    FALSE                              AS is_provisional,
    io.canonical_name,
    'inat_obs'                         AS source
FROM {{ source('inat_obs_data', 'observations') }} io
```

**CRITICAL: `source` column must be added to ARM 1 and ARM 2 as well:**
- ARM 1: `'ecdysis' AS source`
- ARM 2: `'waba_sample' AS source`

### Pattern 2: inat_obs_count CTE in int_species_universe.sql

**What:** A new CTE that counts `inat_obs_data.observations` rows per `canonical_name`, analogous to `checklist_count_agg`.
**When to use:** Whenever a new source contributes to per-species counts.

```sql
-- Source: int_species_universe.sql, following checklist_count_agg pattern [ASSUMED - pattern observed]
inat_obs_count_agg AS (
    SELECT canonical_name, COUNT(*) AS inat_obs_count
    FROM {{ source('inat_obs_data', 'observations') }}
    WHERE canonical_name IS NOT NULL
    GROUP BY canonical_name
)
```

Then in `species_universe` SELECT: `COALESCE(ioa.inat_obs_count, 0)::BIGINT AS inat_obs_count`
And in the LEFT JOIN: `LEFT JOIN inat_obs_count_agg ioa ON ioa.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)`

### Pattern 3: Schema.yml Column Contract Extension

**What:** Add 5 columns to the `occurrences` model contract and 1 column to the `species` model contract.
**When to use:** Every time a mart column changes.

New occurrences columns to add to `schema.yml`:
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

New species column:
```yaml
- name: inat_obs_count
  data_type: bigint
```

**CONTRACT ENFORCEMENT NOTE:** [VERIFIED - observed in codebase] The dbt contract with `enforced: true` will FAIL the build if the SELECT list and schema.yml diverge. Both must be updated atomically. When adding `source` to `occurrences.sql`'s SELECT, the column must appear in `schema.yml` before `dbt build` will succeed.

### Pattern 4: species_export.py SPECIES_COLUMNS Extension

**What:** Add `inat_obs_count` to the `SPECIES_COLUMNS` list AND the PyArrow schema in `species_export.py`.

The current list (line 49) has 20 entries (`slug` is the 20th, added by Python). The dbt mart has 19. Adding `inat_obs_count` means:
- dbt `species.sql` emits 20 columns (was 19)
- `species_export.py` reads 20 from dbt + adds `slug` → 21 total in `species.parquet` / `species.json`
- `SPECIES_COLUMNS` list must be extended with `'inat_obs_count'`
- PyArrow schema must add `('inat_obs_count', pa.int64())`

The `mart_cols` computation at line 117 (`SPECIES_COLUMNS[:-1]`) excludes `slug`, which means the new column must be inserted BEFORE `slug` in `SPECIES_COLUMNS`.

### Pattern 5: sources.yml New Source Declaration

`inat_obs_data` schema (DuckDB schema written by `inat_obs_pipeline.py`) must be declared in `data/dbt/models/sources.yml`:

```yaml
- name: inat_obs_data
  schema: inat_obs_data
  tables:
    - name: observations
```

### Anti-Patterns to Avoid

- **Staging model for inat_obs_data:** ARM 3 can reference `{{ source('inat_obs_data', 'observations') }}` directly. A staging model is unnecessary unless the raw schema needs transformation — here the schema is already clean (canonicalize was done in Python).
- **Reading from occurrences.parquet for inat_obs_count:** The `inat_obs_count_agg` CTE should read from `inat_obs_data.observations` directly, not from the occurrences mart. Reading from `ref('occurrences')` would create a circular DAG dependency (species depends on occurrences, occurrences depends on int_combined, int_combined depends on inat_obs_data).
- **Forgetting genus/family in ARM 3:** iNat observations don't carry denormalized genus/family. Set these to NULL. The species pages derive genus/family from the lineage tables via canonical_name. ARM 3's genus/family NULLs are acceptable — the occurrences mart does not require those columns to be non-null.
- **Incorrect type casting for specimen_observation_id:** ARM 1 and ARM 2 produce `specimen_observation_id` as BIGINT. ARM 3 uses `io.obs_id` which is already BIGINT in `inat_obs_data.observations`. No cast needed but must not emit as VARCHAR.
- **Missing NULL in int_combined for ARM 3 spatial coordinates:** `lat` and `lon` from `inat_obs_data.observations` are DOUBLE. The fallback logic in `occurrences.sql` (county_fallback, eco_fallback) handles NULL coordinates with correlated subqueries — but ARM 3 rows should generally have non-NULL coordinates because the CSV was geoprivacy=open. A WHERE clause like `WHERE io.lat IS NOT NULL AND io.lon IS NOT NULL` is likely safe but the planner should decide. Check if ARM 2 does the same (it does: `WHERE sob.longitude IS NOT NULL AND sob.latitude IS NOT NULL`).
- **Breaking test_dbt_scaffold.py count assertions:** The scaffold test `test_occurrences_has_rows_and_zero_null_county_or_eco` asserts `total >= 2`. ARM 3 rows without coordinates would NOT be assigned a county/eco (the fallback does spatial queries which may return non-null for all points within WA). Rows outside WA bbox should be excluded or will be fallback-joined to the nearest WA county (acceptable for iNat observations within WA since the export was geo-filtered to WA).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Type-safe parquet schema | Custom dict → parquet | PyArrow explicit schema (existing pattern in species_export.py) | DuckDB's INTEGER[12] type is not auto-handled by parquet writers |
| Slug computation | SQL LOWER/REPLACE | Python `domain.slugify` (existing) | Unicode normalization cannot be byte-identically replicated in SQL |
| inat_obs_count in JSON | Custom aggregation script | Extend SPECIES_COLUMNS + PyArrow schema (existing pattern) | The existing export_species_parquet function already handles all columns in the list |

## Common Pitfalls

### Pitfall 1: Forgetting to add `source` to ARM 1 and ARM 2
**What goes wrong:** ARM 3 gets `source='inat_obs'` but ARM 1 and ARM 2 have no `source` column. The UNION ALL fails because column counts differ.
**Why it happens:** Focus on the new arm; forgetting the requirement that ALL arms must have identical column lists.
**How to avoid:** The `source` literal must be the final (or consistent positional) column in all three arms. Add it to ARM 1 and ARM 2 first, then write ARM 3.
**Warning signs:** `dbt build` fails with "UNION ALL column count mismatch" or "type mismatch at column N".

### Pitfall 2: Schema.yml contract failure on build
**What goes wrong:** `dbt build` errors with "Contract mismatch: found column X in SQL but not in contract" or vice versa.
**Why it happens:** Adding a column to `occurrences.sql` SELECT list without updating `schema.yml`, or vice versa.
**How to avoid:** Edit `schema.yml` and `occurrences.sql` in the same commit; run `bash data/dbt/run.sh build` to verify.
**Warning signs:** Any dbt build failure mentioning "contract" or "column count".

### Pitfall 3: species_export.py SPECIES_COLUMNS position error
**What goes wrong:** `inat_obs_count` is appended AFTER `slug` in `SPECIES_COLUMNS`, but `mart_cols = ', '.join(SPECIES_COLUMNS[:-1])` reads `N-1` columns. If `inat_obs_count` is positioned after `slug`, the `[:-1]` slice will drop `inat_obs_count` instead of `slug`.
**Why it happens:** `slug` must always be the last entry in `SPECIES_COLUMNS` because it is the Python-added column excluded from the dbt mart read by `[:-1]`.
**How to avoid:** Insert `'inat_obs_count'` at position -2 (second to last), before `'slug'`.
**Warning signs:** `inat_obs_count` absent from `species.json` even though dbt mart has it; `slug` being read as `inat_obs_count`.

### Pitfall 4: DuckDB INTEGER[12] COALESCE limitation
**What goes wrong:** Attempting `COALESCE(month_histogram, ...)` on an `INTEGER[12]` column fails in DuckDB 1.4.x.
**Why it happens:** DuckDB limitation (documented in `int_species_universe.sql` comment).
**How to avoid:** Use `CASE WHEN ... IS NULL THEN ... ELSE ... END` (already the pattern for month_histogram). The new `inat_obs_count` is BIGINT, so COALESCE is fine: `COALESCE(ioa.inat_obs_count, 0)::BIGINT`.
**Warning signs:** Error "COALESCE on array types is not supported".

### Pitfall 5: observed_on column type from inat_obs_data
**What goes wrong:** `YEAR(observed_on)` fails if `observed_on` is stored as VARCHAR in `inat_obs_data.observations` (not DATE).
**Why it happens:** The Python pipeline uses `row.get("observed_on") or None` — the DuckDB CREATE TABLE declares `observed_on DATE`. If the Python insert passes a string, DuckDB may or may not auto-cast to DATE.
**How to avoid:** Check the CREATE TABLE in `inat_obs_pipeline.py` — it declares `observed_on DATE`. Python inserts a string `row.get("observed_on")`. DuckDB's INSERT with `?` bindings should auto-cast CSV strings like "2024-06-01" to DATE. Verify by querying `typeof(observed_on)` from `inat_obs_data.observations`. If VARCHAR, use `TRY_CAST(io.observed_on AS DATE)` and `YEAR(TRY_CAST(...))`.
**Warning signs:** `YEAR()` function error or NULL year/month in ARM 3 rows.

### Pitfall 6: Coordinate WHERE clause for ARM 3
**What goes wrong:** Including rows with NULL lat/lon from `inat_obs_data.observations` into `int_combined`. The spatial fallback pipeline handles them but assigns the nearest WA county regardless of actual location — a NULL-coordinate row gets assigned an arbitrary county.
**Why it happens:** The iNat CSV export used `geoprivacy=open` so nearly all rows have coordinates, but edge cases exist.
**How to avoid:** Add `WHERE io.lat IS NOT NULL AND io.lon IS NOT NULL` to ARM 3 (consistent with ARM 2's explicit coordinate filter). Cross-check with row counts in pytest assertions.
**Warning signs:** Row count in `occurrences.parquet` (filtered to source='inat_obs') differs from `SELECT COUNT(*) FROM inat_obs_data.observations WHERE lat IS NOT NULL AND lon IS NOT NULL`.

## Code Examples

### Verified: Current ARM 1 source column template

ARM 1 currently ends with (no `source` column — this phase adds it):
```sql
    FALSE          AS is_provisional,
    e.canonical_name
FROM {{ ref('int_ecdysis_base') }} e
```

After this phase, it becomes:
```sql
    FALSE          AS is_provisional,
    e.canonical_name,
    'ecdysis'      AS source
FROM {{ ref('int_ecdysis_base') }} e
```

Source: `data/dbt/models/intermediate/int_combined.sql` lines 39-43 [VERIFIED: read directly]

### Verified: Current occurrences.sql SELECT list

The current final SELECT in `occurrences.sql` ends with:
```sql
    j.specimen_inat_taxon_name, j.specimen_inat_quality_grade,
    j.is_provisional,
    j.canonical_name,
    fc.county, fe.ecoregion_l3,
    fp.place_slug
```

Phase 118 adds after `j.canonical_name`:
```sql
    j.source,
    j.image_url,
    j.obs_url,
    j.user_login,
    j.license,
```

ARM 1 and ARM 2 will emit NULL for `image_url`, `obs_url`, `user_login`, `license`. ARM 3 emits actual values.

Source: `data/dbt/models/marts/occurrences.sql` lines 84-99 [VERIFIED: read directly]

### Verified: checklist_count_agg pattern (template for inat_obs_count_agg)

```sql
-- Source: data/dbt/models/intermediate/int_species_universe.sql lines 40-46 [VERIFIED: read directly]
checklist_count_agg AS (
    SELECT canonical_name, COUNT(*) AS checklist_count
    FROM {{ ref('checklist') }}
    WHERE canonical_name IS NOT NULL
    GROUP BY canonical_name
),
```

`inat_obs_count_agg` follows the same structure but reads from `{{ source('inat_obs_data', 'observations') }}`.

## Runtime State Inventory

> Omitted: this is not a rename/refactor phase. No runtime state to inventory.

## Open Questions

1. **Should ARM 3 filter `WHERE lat IS NOT NULL AND lon IS NOT NULL`?**
   - What we know: ARM 2 has this filter; Phase 117 CSV export used `geoprivacy=open`; `inat_obs_data.observations` has 45,354 rows (44,533 after Ecdysis dedup per Phase 117 state).
   - What's unclear: Whether any rows in the CSV have null coordinates.
   - Recommendation: Include the WHERE filter for consistency with ARM 2. The planner should add a pytest assertion verifying ARM 3 row count equals `SELECT COUNT(*) FROM inat_obs_data.observations WHERE lat IS NOT NULL AND lon IS NOT NULL`.

2. **Should iNat obs contribute to `occurrence_count` in int_species_occurrences_agg?**
   - What we know: `int_species_occurrences_agg` currently reads from `source('ecdysis_data', 'occurrences')` directly. `occurrence_count` has always been Ecdysis-only.
   - What's unclear: The requirement says `inat_obs_count` is a NEW column — it does not say `occurrence_count` should change. OCC-02 says "distinct column separate from specimen_count and occurrence_count".
   - Recommendation: Leave `occurrence_count` and `int_species_occurrences_agg` unchanged. Add `inat_obs_count` as a completely parallel count from `inat_obs_data.observations`. This preserves backward compatibility with existing queries that use `occurrence_count`.

3. **What data_type for `specimen_observation_id` in ARM 3?**
   - What we know: `inat_obs_data.observations.obs_id` is declared as BIGINT. `schema.yml` declares `specimen_observation_id` as `bigint`.
   - Recommendation: Pass `io.obs_id AS specimen_observation_id` directly; no cast needed.

## Environment Availability

Step 2.6: All required tools are available locally.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| dbt-duckdb | ARM 3 SQL model | via uvx in run.sh | 1.10.1 (pinned) | — |
| DuckDB | inat_obs_data.observations | via Python venv | (embedded in duckdb package) | — |
| inat_expert_obs.csv | Phase 117 prerequisite | committed at data/raw/ | 45,354 rows | — |
| inat_obs_data.observations | ARM 3 source | populated by Phase 117 inat-obs step | ~44,533 rows post-dedup | — |
| pytest | Nyquist tests | available in data/.venv | (existing) | — |

**Missing dependencies:** None.

## Validation Architecture

Nyquist validation is enabled (`workflow.nyquist_validation: true` in `.planning/config.json`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest |
| Config file | `data/pyproject.toml` (existing) |
| Quick run command | `cd data && uv run pytest tests/test_dbt_scaffold.py tests/test_species_export.py -x` |
| Full suite command | `cd data && uv run pytest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OCC-01 | ARM 3 in int_combined; source column in all arms | integration (post-build) | `cd data && uv run pytest tests/test_dbt_scaffold.py::test_occurrences_source_column -x` | Wave 0 |
| OCC-01 | occurrences.parquet contains iNat rows with source='inat_obs' | integration (post-build) | `cd data && uv run pytest tests/test_dbt_scaffold.py::test_inat_obs_rows_in_occurrences -x` | Wave 0 |
| OCC-01 | ARM 1 and ARM 2 rows have source='ecdysis'/'waba_sample' (no NULL source) | integration (post-build) | `cd data && uv run pytest tests/test_dbt_scaffold.py::test_source_no_nulls -x` | Wave 0 |
| OCC-02/03 | inat_obs_count column present and non-null in species.parquet/species.json | integration (post-build) | `cd data && uv run pytest tests/test_species_export.py::test_inat_obs_count_in_species -x` | Wave 0 |

### Sampling Rate

- **Per task commit:** `cd data && uv run pytest tests/test_dbt_scaffold.py tests/test_species_export.py -x -q`
- **Per wave merge:** `cd data && uv run pytest`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/test_dbt_scaffold.py` — add 3 new test functions (OCC-01 assertions)
- [ ] `tests/test_species_export.py` — add 1 new test function (OCC-02/03 assertion)

All tests use `_SANDBOX_GUARD` (`pytest.mark.skipif` when sandbox parquet absent) so they fail to collect (RED) until `dbt build` produces output, then turn GREEN when the implementation is correct.

*(Framework and existing tests present; Wave 0 adds new test functions to existing files)*

## Security Domain

This phase is a pure data pipeline change — no HTTP endpoints, no authentication, no user input beyond the already-committed CSV. ASVS categories do not apply. Security enforcement omitted.

## Sources

### Primary (HIGH confidence)
- `data/dbt/models/intermediate/int_combined.sql` — current ARM 1 and ARM 2 structure [VERIFIED: read directly]
- `data/dbt/models/intermediate/int_species_universe.sql` — checklist_count_agg pattern for inat_obs_count_agg [VERIFIED: read directly]
- `data/dbt/models/marts/occurrences.sql` — SELECT list to extend [VERIFIED: read directly]
- `data/dbt/models/marts/schema.yml` — column contract (31 columns) to expand [VERIFIED: read directly]
- `data/dbt/models/marts/species.sql` — 19-column species mart to extend [VERIFIED: read directly]
- `data/dbt/models/sources.yml` — no inat_obs_data entry yet [VERIFIED: read directly]
- `data/inat_obs_pipeline.py` — schema of inat_obs_data.observations (12 columns) [VERIFIED: read directly]
- `data/species_export.py` — SPECIES_COLUMNS list (20 entries) and PyArrow schema [VERIFIED: read directly]
- `data/.planning/STATE.md` — locked decisions (source discriminators, unified model) [VERIFIED: read directly]
- `data/.planning/REQUIREMENTS.md` — OCC-01, OCC-02, OCC-03 [VERIFIED: read directly]

### Secondary (MEDIUM confidence)
- Column type for `observed_on` in `inat_obs_data.observations` — declared as `DATE` in CREATE TABLE in `inat_obs_pipeline.py`; actual DuckDB type depends on Python insert behavior with string values [ASSUMED — verify with `typeof()` query before writing YEAR()/MONTH()]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `observed_on` in `inat_obs_data.observations` is stored as DATE (not VARCHAR) so `YEAR()` and `MONTH()` work directly | Code Examples / Pitfall 5 | ARM 3 emits NULL year/month; must use `TRY_CAST(io.observed_on AS DATE)` wrapper |
| A2 | iNat ARM 3 rows should be filtered `WHERE lat IS NOT NULL AND lon IS NOT NULL` | Open Questions | Rows without coordinates assigned nearest WA county — may be acceptable, but inconsistent with ARM 2 behavior |
| A3 | `occurrence_count` in `int_species_occurrences_agg` should remain Ecdysis-only | Open Questions | Phase 120 UI shows "N specimens · N community observations"; if occurrence_count grew, the display math would be wrong |

**Note:** A1 can be resolved by running `SELECT typeof(observed_on) FROM inat_obs_data.observations LIMIT 1` against `data/beeatlas.duckdb` before writing int_combined.sql ARM 3.

## Metadata

**Confidence breakdown:**
- SQL ARM 3 structure: HIGH — existing ARM 1/ARM 2 are templates; column shapes are known
- Schema.yml extension: HIGH — contract enforcement is tested and documented
- species_export.py changes: HIGH — SPECIES_COLUMNS pattern is established; pitfall 3 (position) is documented
- sources.yml declaration: HIGH — required and straightforward
- inat_obs_count aggregation: HIGH — follows checklist_count_agg pattern exactly
- observed_on type: MEDIUM — declared DATE in Python but actual storage type unverified

**Research date:** 2026-05-25
**Valid until:** This research reflects a stable codebase; valid until the dbt model structure changes (next 60 days safe)

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OCC-01 | `int_combined` gains ARM 3 from `inat_obs_data.observations`; all three arms include a `source` literal; `occurrences.parquet` gains `source` (non-null) + iNat-specific nullable columns; dbt contract expands | ARM 3 SQL pattern documented; sources.yml declaration required; schema.yml expansion specified; all three arms' source literals identified |
| OCC-02 | `int_species_universe` tracks `inat_obs_count` as a distinct column | `inat_obs_count_agg` CTE pattern documented; reads from `inat_obs_data.observations` directly (not from occurrences mart to avoid circular DAG) |
| OCC-03 | `species.parquet` / `species.json` include `inat_obs_count` per species | `SPECIES_COLUMNS` extension and PyArrow schema addition documented; position pitfall (before `slug`) called out explicitly |
</phase_requirements>
