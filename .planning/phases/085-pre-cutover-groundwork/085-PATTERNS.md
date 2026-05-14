# Phase 85: Pre-Cutover Groundwork — Pattern Map

**Mapped:** 2026-05-13
**Files analyzed:** 9 new/modified files
**Analogs found:** 8 / 9 (1 greenfield: singular dbt test)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `data/dbt/models/staging/stg_inat__observations.sql` | model (staging) | transform | `data/dbt/models/staging/stg_ecdysis__occurrences.sql` | exact |
| `data/dbt/models/staging/schema.yml` | config (test decl) | — | `data/dbt/models/intermediate/schema.yml` | exact |
| `data/dbt/tests/test_*.sql` | test (singular) | — | none in project; dbt convention applies | greenfield |
| `data/dbt/models/intermediate/schema.yml` | config (test decl) | — | `data/dbt/models/staging/schema.yml` | exact |
| `data/dbt/macros/emit_feature_collection.sql` | macro | transform | itself (modify in place) | self |
| `data/dbt/models/marts/occurrences.sql` | model (mart) | CRUD | itself (drop columns from SELECT) | self |
| `data/dbt/models/marts/schema.yml` | config (contract) | — | itself (drop 3 column entries) | self |
| `data/tests/test_dbt_diff.py` | test (pytest) | batch | itself (update count literal) | self |
| `src/sqlite.ts` | utility (loader) | CRUD | itself (drop 3 column declarations) | self |

---

## Pattern Assignments

### `data/dbt/models/staging/stg_inat__observations.sql` (staging model, transform)
**REQ:** TEST-01 — add WHERE filter to exclude the 1 null `id` row, or document as tripwire.

**Analog:** `data/dbt/models/staging/stg_ecdysis__occurrences.sql` (lines 1-12)

**Staging filter pattern:**
```sql
-- Wraps source('ecdysis_data', 'occurrences') with the lat-NULL filter from
-- export.py line 84. This filter is load-bearing: without it, NULL-lat rows
-- would flow into the downstream spatial join in the occurrences mart and break
-- ST_Within / ST_Distance calls that require non-null coordinate inputs.
-- Column rename/casting happens in int_ecdysis_base (Plan 03) — this layer
-- passes all columns through unchanged.
{{ config(materialized='view') }}

SELECT *
FROM {{ source('ecdysis_data', 'occurrences') }}
WHERE decimal_latitude IS NOT NULL AND decimal_latitude != ''
```

**Apply:** Add `WHERE id IS NOT NULL` to `stg_inat__observations.sql` to filter the one null-id row before it reaches `int_ecdysis_base`'s LEFT JOIN (`inat.id = links.host_observation_id`). Keep the inline comment explaining it is load-bearing. The current file is only 11 lines; replace with a SELECT * + WHERE clause following the ecdysis staging model shape exactly.

**Current file shape** (lines 1-11 of `stg_inat__observations.sql`):
```sql
{{ config(materialized='view') }}

SELECT *
FROM {{ source('inaturalist_data', 'observations') }}
```

---

### `data/dbt/models/staging/schema.yml` (test declaration, generic tests)
**REQ:** TEST-01 — adjust `not_null` entry on `id` column now that the upstream null row is filtered.

**Analog:** This file itself is the pattern. The existing description block (lines 19-29) shows how "awkward-fit" findings are inline-commented:

```yaml
  - name: stg_inat__observations
    columns:
      - name: id
        description: >
          iNaturalist observation ID. TEST-01 outcome (awkward-fit): not_null FAILS
          with 1 null id; unique PASSES (10,846 rows, all distinct). The iNat pipeline
          does not guarantee non-null source IDs — the not_null failure IS the finding.
          See .planning/phases/084-tests-diff-findings/084-TEST-FINDINGS.md.
        data_tests:
          - not_null    # OBSERVED FAIL (1 null id) — awkward-fit finding, kept as a tripwire
          - unique      # PASSED: 10,846 distinct / 10,846 rows
```

**Apply:** If TEST-01 is resolved by filtering upstream, update the description comment to note the filter was applied and remove the "OBSERVED FAIL" annotation from `not_null`. Keep the `# VERIFIED` comment style used in stg_ecdysis__occurrences (line 10: `# VERIFIED unique: 46,090 rows, 46,090 distinct catalog_numbers`). If the tripwire-only approach is chosen, leave the comment as-is.

---

### `data/dbt/tests/test_*.sql` (singular test, greenfield)
**REQ:** TEST-02 — replace the cross-type `relationships` test on `int_ecdysis_base.ecdysis_id` with a custom singular test that casts before comparing.

**Note:** `data/dbt/tests/` does not exist yet — this is the first singular test in the project. The only file currently in `data/dbt/macros/` is `scaffold_assert.sh` and `emit_feature_collection.sql`; no singular tests anywhere.

**dbt singular test convention** (from dbt docs + `dbt_project.yml` `test-paths` default):
- File lives in `data/dbt/tests/` (dbt default `test-paths: ["tests"]`; `dbt_project.yml` does not override this)
- File name: `test_<descriptive_name>.sql`
- Pass semantic: the query must return **0 rows** to pass. Any row returned is a test failure.
- The test is run by `dbt test` automatically.

**Pattern to implement (no existing project analog — use dbt convention directly):**
```sql
-- Singular test: assert every ecdysis_id in int_ecdysis_base references a row in stg_ecdysis__occurrences (by id, not catalog_number — see RESEARCH.md §TEST-02)
-- in stg_ecdysis__occurrences after explicit CAST to VARCHAR.
-- CORRECTED 2026-05-14 — see 085-RESEARCH.md §TEST-02. An earlier draft of
-- this pattern joined to `catalog_number`, but ecdysis_id (e.g. 5594060)
-- and catalog_number (e.g. WSDA_2303966) are different namespaces. The
-- correct referenced column is stg_ecdysis__occurrences.id (VARCHAR like
-- '5594060'). VERIFIED: this query returns 0 rows against live data.
--
-- Replaces the generic `relationships` test that ERRORed with
-- "Conversion Error: Could not convert string 'WSDA_2303966' to INT32".
-- Pass = 0 rows returned.
SELECT ib.ecdysis_id
FROM {{ ref('int_ecdysis_base') }} ib
WHERE ib.ecdysis_id IS NOT NULL
  AND CAST(ib.ecdysis_id AS VARCHAR) NOT IN (
    SELECT id FROM {{ ref('stg_ecdysis__occurrences') }}
  )
```

**Suggested filename:** `data/dbt/tests/test_ecdysis_id_references_source.sql`

---

### `data/dbt/models/intermediate/schema.yml` (test declaration)
**REQ:** TEST-02 — remove (or replace) the `relationships` generic test on `int_ecdysis_base.ecdysis_id`.

**Current failing entry** (lines 19-27):
```yaml
  - name: int_ecdysis_base
    columns:
      - name: ecdysis_id
        data_tests:
          - relationships:
              to: ref('stg_ecdysis__occurrences')
              field: catalog_number
              # NOTE: ecdysis_id is INTEGER; catalog_number is VARCHAR — type mismatch.
              # Expected to ERROR with BinderError (INTEGER vs VARCHAR comparison).
              # Documented as awkward-fit: relationships test requires explicit CAST
              # for cross-type keys. The error IS the TEST-01 finding.
```

**Apply:** Delete the `relationships` block entirely (the singular test in `data/dbt/tests/` replaces it). Keep the `int_ecdysis_base` model entry if it has other tests, or remove it if it had no other tests. Follow the inline comment convention from `staging/schema.yml`: add a comment on the removal, e.g.:
```yaml
  - name: int_ecdysis_base
    columns:
      - name: ecdysis_id
        # TEST-02: relationships test removed (INTEGER vs VARCHAR BinderError).
        # Replaced by singular test data/dbt/tests/test_ecdysis_id_references_source.sql.
```

---

### `data/dbt/macros/emit_feature_collection.sql` (macro, transform)
**REQ:** CLEAN-01 — replace the `FORMAT CSV` workaround with a GDAL driver or accept current approach.

**Invocation pattern** (both call sites are identical in shape):

`data/dbt/models/marts/counties_geo.sql` (lines 6-10):
```sql
{{ config(
    materialized='table',
    post_hook=[
      emit_feature_collection(this, 'NAME', 'target/sandbox/counties.geojson')
    ]
) }}
```

`data/dbt/models/marts/ecoregions_geo.sql` (lines 6-9):
```sql
{{ config(
    materialized='table',
    post_hook=[
      emit_feature_collection(this, 'NA_L3NAME', 'target/sandbox/ecoregions.geojson')
    ]
) }}
```

**Current macro body** (full file, lines 11-25 of `emit_feature_collection.sql`):
```sql
{% macro emit_feature_collection(model_relation, property_name, out_path) %}
COPY (
  SELECT json_object(
    'type', 'FeatureCollection',
    'features', (
      SELECT to_json(list({
        'type': 'Feature',
        'properties': {{ "{" }} {{ "'" ~ property_name ~ "'" }}: name {{ "}" }},
        'geometry': ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.001))::JSON
      }))
      FROM {{ model_relation }}
    )
  )::VARCHAR
) TO '{{ out_path }}' (FORMAT CSV, DELIMITER '', QUOTE '', HEADER false)
{% endmacro %}
```

**Key constraint for CLEAN-01:** The `FORMAT CSV` with empty DELIMITER/QUOTE/HEADER is the only DuckDB COPY format that writes a raw scalar VARCHAR verbatim. `FORMAT JSON` wraps in `{"col_name": value}`. A GDAL GeoJSON driver path (`FORMAT GDAL, DRIVER 'GeoJSON'`) writes a different FeatureCollection structure with `crs` and `id` fields that may not match what the frontend expects. A Python post-hook (`on-run-end`) is also an option but would be greenfield (no Python dbt models exist in this project).

**Recommendation for planner:** The macro body modification (if any) is contained entirely within this one file. Both call sites in `counties_geo.sql` and `ecoregions_geo.sql` pass `this` (the materialized table relation) + a string — changing the COPY format does not change those call sites. The simplest safe change is to document and keep the `FORMAT CSV` approach with an explanatory comment, or test the GDAL path. No Python models exist; a Python post-hook in `dbt_project.yml` or within the model config would be greenfield.

---

### `data/dbt/models/marts/occurrences.sql` (mart model, CRUD)
**REQ:** CLEAN-02 — drop 3 columns from SELECT: `specimen_inat_login`, `specimen_inat_genus`, `specimen_inat_family`.

**Current SELECT block** (lines 68-84):
```sql
SELECT
    j.ecdysis_id, j.catalog_number,
    j.lon, j.lat, j.date, j.year, j.month,
    j.scientificName, j.recordedBy, j.fieldNumber, j.genus, j.family,
    j.floralHost, j.host_observation_id, j.inat_host, j.inat_quality_grade,
    j.modified, j.specimen_observation_id, j.elevation_m,
    j.observation_id, j.host_inat_login, j.specimen_count, j.sample_id,
    j.sample_host,
    j.specimen_inat_login, j.specimen_inat_taxon_name,
    j.specimen_inat_genus, j.specimen_inat_family, j.specimen_inat_quality_grade,
    j.is_provisional,
    j.canonical_name,
    fc.county, fe.ecoregion_l3
```

**Apply:** Remove `j.specimen_inat_login,` from line 76, `j.specimen_inat_genus,` from line 78, and `j.specimen_inat_family,` from line 78. The 3 columns come from `int_combined`, which gets them from `int_specimen_obs_base` (lines 3-5 of that file select `specimen_inat_login`, `specimen_inat_genus`, `specimen_inat_family` from the WABA obs + taxon_lineage join). Dropping from the mart SELECT does NOT require changing `int_specimen_obs_base` or `int_combined` — those CTEs can still carry the columns; they just won't appear in the final SELECT.

**Upstream check:** `int_combined.sql` ARM 1 (line 34-37) and ARM 2 (lines 73-76) both select `specimen_inat_login`, `specimen_inat_genus`, `specimen_inat_family`. These do NOT need to be modified for CLEAN-02 — the columns are simply not surfaced in the mart SELECT. The planner should confirm no other downstream model references these columns before removing them from `int_combined`.

---

### `data/dbt/models/marts/schema.yml` (contract config)
**REQ:** CLEAN-02 — drop 3 column entries from the 33-column enforced contract → 30 columns.

**Contract addition history:** Added all-at-once in commit `43c78fde` (Phase 084), not column-by-column. The diff shows a single `+74` line block. Removals should follow the same granularity: delete the 3 contiguous column entries as a single edit.

**Entries to remove** (lines 57-63 of current `schema.yml`):
```yaml
      - name: specimen_inat_login
        data_type: varchar
      - name: specimen_inat_genus
        data_type: varchar
      - name: specimen_inat_family
        data_type: varchar
```

Note: `specimen_inat_taxon_name` and `specimen_inat_quality_grade` are **not** being dropped; preserve those.

---

### `data/tests/test_dbt_diff.py` (pytest, schema assertion)
**REQ:** CLEAN-02 — update schema assertion from 33 to 30 columns.

**Column count is asserted implicitly** — the test at lines 52-74 (`test_occurrences_schema_matches`) compares the ordered list of `(column_name, data_type)` pairs between sandbox and public parquet. There is NO hardcoded `== 33` literal in the test body. The docstring on line 54 says "33 cols" in its comment.

**Apply:** The test itself does not need a numeric change — it compares sandbox vs. public, so once the public parquet is regenerated with 30 columns it will automatically pass with 30 columns. The only edit needed is the docstring comment on line 54:
```python
    """Column names AND types from DESCRIBE match exactly between sandbox and public (33 cols).
```
→ update the `33 cols` to `30 cols`.

---

### `src/sqlite.ts` (SQLite loader, CRUD)
**REQ:** CLEAN-02 — remove 3 column declarations from the CREATE TABLE statement.

**Column block shape** (lines 66-100, single `CREATE TABLE occurrences (...)` statement):
The 3 columns to drop are declared at lines 88-91 (1-based within the file):
```typescript
    specimen_inat_login TEXT,
    specimen_inat_taxon_name TEXT,   // keep this one — NOT in drop list
    specimen_inat_genus TEXT,
    specimen_inat_family TEXT,
```

Wait — re-checking: the drop list is `specimen_inat_login`, `specimen_inat_genus`, `specimen_inat_family`. `specimen_inat_taxon_name` is kept.

**Lines to remove** (from the `Read` at offset 80):
- Line 88 (offset-relative): `specimen_inat_login TEXT,`
- Line 90: `specimen_inat_genus TEXT,`
- Line 91: `specimen_inat_family TEXT,`

The column at line 89 (`specimen_inat_taxon_name TEXT,`) is preserved. The surrounding columns (`sample_host TEXT,` before and `specimen_inat_quality_grade TEXT,` after) remain; ensure trailing comma handling stays valid after the deletions.

---

## Shared Patterns

### dbt test annotation convention
**Source:** `data/dbt/models/staging/schema.yml` (all entries), `data/dbt/models/intermediate/schema.yml`
**Apply to:** All schema.yml modifications

Inline comments after test names encode verification status:
```yaml
data_tests:
  - not_null    # VERIFIED: <N> rows, all non-null
  - unique      # VERIFIED unique: <N> rows, <N> distinct values
  - not_null    # OBSERVED FAIL (<reason>) — awkward-fit finding, kept as a tripwire
```

### dbt staging filter pattern
**Source:** `data/dbt/models/staging/stg_ecdysis__occurrences.sql` (lines 1-12)
**Apply to:** `stg_inat__observations.sql`

Convention: inline comment explains WHY the filter is load-bearing (what breaks without it), then `SELECT * FROM source WHERE <condition>`. No column aliasing or casting at this layer — that belongs in intermediate models.

### Contract update granularity
**Source:** commit `43c78fde` (Phase 084)
**Apply to:** `data/dbt/models/marts/schema.yml`

Columns were added/removed as a single atomic block in one commit, not incrementally. The 3 column entry deletions should be a single edit with a single commit.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `data/dbt/tests/test_*.sql` | test (singular) | — | No singular dbt tests exist in this project yet — first one. Use dbt convention: `tests/` directory, SQL that returns 0 rows to pass. |

---

## Notes / Surprises

1. **`data/dbt/tests/` does not exist.** The only item found at `data/dbt/macros/` level is `scaffold_assert.sh` (a shell script, not a dbt test). The singular test for TEST-02 is the first dbt singular test in the project. The planner must create the directory before placing the file.

2. **No Python dbt models anywhere.** All models are `.sql`. A Python post-hook for CLEAN-01 would be genuinely greenfield. The safest path is keeping `FORMAT CSV` with better comments, or testing the GDAL driver in a sandbox run before committing.

3. **`test_dbt_diff.py` has no hardcoded `33` literal** in assertions — the 33-column comment in the docstring is the only reference. The test logic compares sandbox vs. public dynamically, so updating the docstring count is the only code change needed once both parquet files are regenerated.

4. **`specimen_inat_taxon_name` is NOT in the drop list** but sits between the two genus/family columns being dropped in `src/sqlite.ts`. Take care not to accidentally drop it when removing the surrounding lines.

5. **`int_combined.sql` does not need modification for CLEAN-02.** The 3 columns can stay in intermediate CTEs; they are only dropped from the mart's final SELECT. However, if the planner wants a clean upstream, they optionally can be removed from `int_specimen_obs_base.sql` → `int_combined.sql` as a follow-up — that is out of Phase 85 scope.

6. **iNat pipeline upstream fix (TEST-01 option B).** If filtering at the staging layer is not preferred, the upstream fix lives in `data/inaturalist_pipeline.py`. The null `id` row is produced by the `_transform` function (lines 52-67) or ingested from the API response. The dlt resource uses `primary_key: "uuid"` (line 107), not `id` — so a null `id` from the API is possible. An upstream filter could be added as a `processing_steps` map entry that filters out rows where `item.get("id") is None`, parallel to the existing `_transform` step at line 147.

---

## Metadata

**Analog search scope:** `data/dbt/models/`, `data/dbt/macros/`, `data/dbt/tests/`, `data/tests/`, `src/`
**Files scanned:** 18 source files read
**Pattern extraction date:** 2026-05-13
