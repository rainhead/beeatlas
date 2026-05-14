# Phase 85: Pre-Cutover Groundwork — Research

**Researched:** 2026-05-13
**Domain:** dbt-duckdb test remediation + column drop
**Confidence:** HIGH (all findings verified against live data and source files)

## Summary

Phase 85 makes four in-place improvements to the existing `data/dbt/` project so that `dbt build`
exits 0 cleanly and the column contract narrows from 33 to 30 before any production code is touched.
No changes to `data/run.py`, `data/nightly.sh`, or `public/data/`.

The two awkward-fit tests are resolvable with minimal code: TEST-01 (iNat null `id`) by adding
`WHERE id IS NOT NULL` to the staging view, and TEST-02 (ecdysis_id relationships error) by dropping
the semantically-wrong generic test and replacing it with a singular SQL test that uses `CAST`
correctly. CLEAN-01 (GeoJSON macro) has a clear recommendation to keep the FORMAT CSV approach with
better documentation — the GDAL alternative is NOT byte-comparable. CLEAN-02 (column drop) is
mechanical but touches 5 files in a specific sequence.

**Primary recommendation:** TEST-01 → staging filter (option a); TEST-02 → singular test via `id`
column (not `catalog_number`); CLEAN-01 → document and keep FORMAT CSV; CLEAN-02 → drop from mart
SELECT + schema.yml + sqlite.ts in one wave.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TEST-01 | Resolve stg_inat__observations.id not_null awkward-fit | Null row is a dlt soft-delete record (is_deleted=True, id=NULL); staging filter is cleanest fix |
| TEST-02 | Resolve int_ecdysis_base relationships ERROR | The generic test is semantically wrong; singular test must join via id, not catalog_number |
| CLEAN-01 | Replace FORMAT CSV GeoJSON macro | GDAL driver adds extra 'name' key — not byte-comparable; keep FORMAT CSV with better docs |
| CLEAN-02 | Drop 3 unused columns | 5-file mechanical change; intermediate models don't need updating |
</phase_requirements>

---

## TEST-01 — stg_inat__observations.id not_null (FAIL: 1 null id)

### Root Cause

The null `id` row in `inaturalist_data.observations` is a **dlt soft-delete record**.
[VERIFIED: queried `data/beeatlas.duckdb`]

```
id=None, uuid='75525c08-66cc-40f5-a3ac-cbe6fcac41dd', is_deleted=True
Non-null fields: uuid, _dlt_load_id, _dlt_id, is_deleted
All domain fields (taxon, user, observed_on, quality_grade, etc.) are NULL.
```

The dlt pipeline uses `primary_key: "uuid"` and `write_disposition: "merge"`. When iNat deletes
an observation, dlt records a tombstone row with `id=NULL` and `is_deleted=True`. The
`inaturalist_pipeline.py` `_transform` function unconditionally sets `is_deleted=False` for new
records (line 54), but tombstone rows arrive with `id=NULL` via the merge path.

The row does **not** join to anything downstream: the `int_ecdysis_base` LEFT JOIN is on
`inat.id = links.host_observation_id` — NULL never equi-joins — so the tombstone row produces
no downstream output. It is purely a test surface concern, not a data correctness issue.
[VERIFIED: 2358 occurrence_links have NULL host_observation_id; 0 of those match the null id row]

### Recommendation: Option (a) — Staging Filter

Add `WHERE id IS NOT NULL` to `stg_inat__observations.sql`. This is the only option that:
- Eliminates the FAIL without requiring pipeline re-run
- Keeps the raw tombstone in `inaturalist_data.observations` (safe for dlt merge bookkeeping)
- Follows the established staging-filter pattern from `stg_ecdysis__occurrences.sql`

```sql
-- stg_inat__observations.sql
-- Wraps source('inaturalist_data', 'observations').
-- WHERE id IS NOT NULL filters the dlt soft-delete tombstone row (is_deleted=True, all
-- domain fields NULL). The tombstone is preserved in inaturalist_data.observations for
-- dlt merge bookkeeping; this filter is safe because NULL id never joins to any downstream
-- model (int_ecdysis_base LEFT JOIN uses inat.id = links.host_observation_id).
{{ config(materialized='view') }}

SELECT *
FROM {{ source('inaturalist_data', 'observations') }}
WHERE id IS NOT NULL
```

Update `staging/schema.yml`: change the `not_null` comment from `# OBSERVED FAIL` to
`# VERIFIED: 10,845 rows post-filter` and update the description to reflect the filter was applied.

**Option (b) — upstream fix:** Invasive. Requires modifying `inaturalist_pipeline.py` to add a
processing step filtering `item.get("id") is None`, then re-running the full dlt pipeline to
regenerate `inaturalist_data.observations`. Cost is high relative to benefit; tombstone rows are
dlt internal bookkeeping and should not be removed from the raw layer.
[ASSUMED: dlt tombstone rows should be preserved in raw schema — not verified against dlt docs]

**Option (c) — tripwire test:** The current schema.yml already uses this approach (the `not_null`
is kept as a known-fail tripwire). This is the status quo, not a resolution. TEST-01 requires
resolution; option (c) was the Phase 84 finding, not the Phase 85 fix.

### Effect on Row Count

The staging view moves from 10,846 to 10,845 rows. This does NOT affect `occurrences.parquet`
row count (47,883) because the null-id row never joins to any downstream model. The
`test_dbt_diff.py` row count and key-set assertions are unaffected.
[VERIFIED: queried the null row's join behavior against `ecdysis_data.occurrence_links`]

---

## TEST-02 — int_ecdysis_base.ecdysis_id relationships ERROR

### Root Cause

The generic `relationships` test in `intermediate/schema.yml` specifies:
```yaml
- relationships:
    to: ref('stg_ecdysis__occurrences')
    field: catalog_number
```

This is **semantically wrong, not just a type mismatch.** `ecdysis_id` is `CAST(o.id AS INTEGER)`
(e.g., `5594060`); `catalog_number` is `'WSDA_2310597'`. They are different namespaces.
[VERIFIED: queried both columns from `ecdysis_data.occurrences`]

- `CAST(ecdysis_id AS VARCHAR)` produces `"5594060"`, which is NEVER in the catalog_number set
  `{"WSDA_2303966", "WSDA_2303967", ...}`.
- **The PATTERNS.md singular test is wrong.** The proposed test:
  `CAST(ecdysis_id AS VARCHAR) NOT IN (SELECT catalog_number FROM stg_ecdysis__occurrences)`
  would return all 46,090 rows and always fail.

### Correct Singular Test

The replacement test must join `int_ecdysis_base.ecdysis_id` to `stg_ecdysis__occurrences.id`
(not `catalog_number`). `stg_ecdysis__occurrences` is `SELECT *` from source, so it exposes the
`id VARCHAR` column. `ecdysis_id = CAST(o.id AS INTEGER)`, so the inverse cast is
`CAST(ecdysis_id AS VARCHAR) IN (SELECT id FROM stg_ecdysis__occurrences)`.
[VERIFIED: this query returns 0 rows against live data]

```sql
-- data/dbt/tests/test_ecdysis_id_references_source.sql
-- Singular test: every ecdysis_id in int_ecdysis_base has a corresponding id in
-- stg_ecdysis__occurrences. Pass = 0 rows returned.
--
-- Replaces the generic `relationships` test that ERRORed with:
--   "Conversion Error: Could not convert string 'WSDA_2303966' to INT32"
-- Root cause: the relationships test compared ecdysis_id (INTEGER) to catalog_number
-- (VARCHAR like 'WSDA_2303966'). These are different keys. The correct reference is
-- stg_ecdysis__occurrences.id (VARCHAR like '5594060').
SELECT ib.ecdysis_id
FROM {{ ref('int_ecdysis_base') }} ib
WHERE ib.ecdysis_id IS NOT NULL
  AND CAST(ib.ecdysis_id AS VARCHAR) NOT IN (
    SELECT id FROM {{ ref('stg_ecdysis__occurrences') }}
  )
```

**File location:** `data/dbt/tests/test_ecdysis_id_references_source.sql`

The `tests/` directory exists in `data/dbt/` (contains `scaffold_assert.sh`). No new directory
needed. This is the first `.sql` singular test in the project; dbt discovers all `.sql` files in
`test-paths: ["tests"]` automatically. [VERIFIED: `dbt_project.yml` does not override `test-paths`]

### schema.yml Update

Remove the `relationships` block from `intermediate/schema.yml`. Add a comment:
```yaml
  - name: int_ecdysis_base
    columns:
      - name: ecdysis_id
        # TEST-02: relationships test removed (INTEGER vs VARCHAR BinderError; also semantically
        # wrong — ecdysis_id joins to stg_ecdysis__occurrences.id, not catalog_number).
        # Replaced by singular test: data/dbt/tests/test_ecdysis_id_references_source.sql
```

---

## CLEAN-01 — Replace emit_feature_collection FORMAT CSV Macro

### GDAL Driver Assessment

**Verdict: GDAL driver is NOT byte-comparable — do not use it.**

The GDAL driver (`FORMAT GDAL, DRIVER 'GeoJSON'`) adds a `"name"` key to the FeatureCollection:
```json
{"type": "FeatureCollection", "name": "test_gdal", "features": [...]}
```
Current output (FORMAT CSV workaround):
```json
{"type":"FeatureCollection","features":[...]}
```
Public `counties.geojson` and `ecoregions.geojson` both have exactly two top-level keys:
`type` and `features`. The GDAL output adds `name` (the table name), making it structurally
different. [VERIFIED: tested GDAL driver with DuckDB v1.5.2 spatial extension dc1996b]

Additionally, GDAL writes indented JSON; the FORMAT CSV workaround writes compact JSON (no spaces).
The `test_dbt_diff.py` GeoJSON tests compare feature counts and property values — they would pass
with either format — but the output would not be byte-comparable to the public file (already
documented as DIFF-03/cosmetic for the whitespace difference, but the `name` key is structural).

### Recommendation: Keep FORMAT CSV with Better Documentation

The FORMAT CSV workaround works, passes the diff harness, and is stable. The only action for
CLEAN-01 is to **document it properly** in the macro file and confirm it in the test harness.

The macro is NOT fragile in the sense that would cause silent breakage — it simply writes a
VARCHAR verbatim. The DuckDB COPY interface for empty DELIMITER/QUOTE/HEADER is stable.

Updated macro with better inline documentation:

```sql
-- data/dbt/macros/emit_feature_collection.sql
-- Writes a GeoJSON FeatureCollection to out_path via DuckDB COPY.
-- Called from post-hooks in counties_geo.sql and ecoregions_geo.sql.
--
-- WHY FORMAT CSV (not FORMAT JSON, not FORMAT GDAL):
--   FORMAT JSON wraps the scalar in {"col_name": value} — breaks FeatureCollection structure.
--   FORMAT GDAL / DRIVER 'GeoJSON' adds a "name" key to the FeatureCollection root —
--     not byte-comparable to the expected {"type","features"}-only structure.
--   FORMAT CSV with empty DELIMITER/QUOTE/HEADER writes raw VARCHAR verbatim — the only
--   DuckDB COPY path that produces a bare scalar document.
--
-- CLEAN-01 resolution: this workaround is intentional and documented. No replacement needed.
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

REQUIREMENTS.md specifies that the replacement "is documented and the diff harness confirms output
parity." The diff harness already passes. Adding the documentation comment satisfies CLEAN-01
without functional change. This is lower risk than replacing the workaround with GDAL.

**Option (b) — Python post-hook:** No Python dbt models exist in the project. Adding one is
greenfield complexity for no gain over the documented FORMAT CSV approach. Skip.

---

## CLEAN-02 — Drop 3 Unused Columns

### Columns to Drop
`specimen_inat_login`, `specimen_inat_family`, `specimen_inat_genus`

### Safety Verification

**Frontend:** Only declared in `src/sqlite.ts:88,90,91` — never queried in any `.ts` file.
[VERIFIED: `grep -rn specimen_inat_login\|specimen_inat_family\|specimen_inat_genus src/` returns
only sqlite.ts]

**Data pipeline grep — references outside dbt/target/ compiled artifacts:**
- `data/export.py:108,114` — defines these columns in the Python pipeline (not in scope for Phase 85)
- `data/waba_pipeline.py:113` — comment only
- `data/tests/test_export.py:27-28,180,190` — tests the Python export pipeline, not dbt; unaffected
- `data/dbt/models/intermediate/int_specimen_obs_base.sql:6,12,13` — produces the columns
- `data/dbt/models/intermediate/int_combined.sql:34,36,37,59,60,73,75,76` — propagates them
- `data/dbt/models/marts/occurrences.sql:76,77` — projects them into the mart (TARGET for drop)
- `data/dbt/models/marts/schema.yml:57,61,63` — contract entries (TARGET for drop)
[VERIFIED: grep output above]

**Intermediate models:** `int_combined.sql` uses `sob.specimen_inat_genus AS genus` (line 59)
and `sob.specimen_inat_family AS family` (line 60) for **provisional ARM 2 rows**. These are the
`genus` and `family` columns for provisional WABA records — they are different output columns
from `specimen_inat_genus`/`specimen_inat_family`. The 3 dropped columns are passed through
separately in `int_combined` (lines 36-37, 75-76) and project into the mart SELECT as
`j.specimen_inat_login`, `j.specimen_inat_genus`, `j.specimen_inat_family`.

**Conclusion:** Dropping from the mart SELECT does NOT break `int_combined`'s `genus`/`family`
outputs. `int_specimen_obs_base` and `int_combined` do NOT need modification for Phase 85.
The columns can stay in intermediate CTEs as wasted projection; a follow-up cleanup is out of scope.

### Sequence of Changes

Execute in this order to keep contract consistent at each step:

1. **`data/dbt/models/marts/schema.yml`** — Remove the 3 column entries from the enforced contract
   (lines 57-63). The contract now declares 30 columns. Do this FIRST so the contract matches
   the SQL after the next step.

2. **`data/dbt/models/marts/occurrences.sql`** — Remove `j.specimen_inat_login,`,
   `j.specimen_inat_genus,`, `j.specimen_inat_family,` from the final SELECT (lines 76-77).
   Contract is already updated to match.

3. **`src/sqlite.ts`** — Remove lines 88, 90, 91 (`specimen_inat_login TEXT,`,
   `specimen_inat_genus TEXT,`, `specimen_inat_family TEXT,`). Keep line 89
   (`specimen_inat_taxon_name TEXT,`) — it is NOT in the drop list. Check trailing commas:
   `sample_host TEXT,` (before) must retain its comma; `specimen_inat_quality_grade TEXT,` (after)
   is unchanged.

4. **`data/dbt/build` + `data/tests/test_dbt_diff.py`** — Run `bash data/dbt/run.sh build` to
   produce new 30-column sandbox parquet. Update `test_occurrences_schema_matches` docstring
   from "33 cols" to "30 cols". The test logic itself needs no numeric change — it compares
   sandbox vs. public dynamically. **Note:** `test_dbt_diff.py` will FAIL until `public/data/`
   is also regenerated with 30 columns (by running `data/export.py`). REQUIREMENTS.md explicitly
   acknowledges this: "the column-drop is verified by `test_dbt_diff.py` schema assertion
   (which will need updating to reflect the new 30-column contract — this is intentional,
   not a regression)."

5. **`npm test`** — Run Vitest to confirm frontend tests pass with the removed SQLite column
   declarations.

### test_export.py

`data/tests/test_export.py` references the 3 dropped columns (lines 27-28, 180, 190). This file
tests `data/export.py` (the Python pipeline), which is NOT modified in Phase 85. `test_export.py`
remains valid and unchanged — its column list reflects the Python pipeline output, not the dbt
output. No modification needed in Phase 85.
[VERIFIED: test_export.py tests export.py, not dbt]

---

## Common Pitfalls

### Pitfall 1: PATTERNS.md singular test uses wrong column
**What goes wrong:** Implementing the PATTERNS.md test as written — `CAST(ecdysis_id AS VARCHAR)
NOT IN (SELECT catalog_number FROM stg_ecdysis__occurrences)` — causes the test to return 46,090
rows and always fail. `"5594060"` is never in `{"WSDA_2303966", ...}`.
**Prevention:** Use `SELECT id FROM stg_ecdysis__occurrences` (the numeric string like `"5594060"`),
not `catalog_number`.

### Pitfall 2: Dropping specimen_inat_taxon_name accidentally
**What goes wrong:** Lines 88-92 of `src/sqlite.ts` contain 5 `specimen_inat_*` columns. Only 3
are dropped. `specimen_inat_taxon_name` (line 89) stays.
**Prevention:** Drop lines 88, 90, 91. Preserve lines 89, 92.

### Pitfall 3: test_dbt_diff schema test fails until public/data is regenerated
**What goes wrong:** Running `test_dbt_diff.py` after dropping columns from dbt but before
re-running `data/export.py` — sandbox has 30 cols, public has 33 cols, test fails.
**Prevention:** Accept this is expected. The phase gate is: sandbox builds clean (30 cols), then
`data/export.py` is run to regenerate `public/data/`, then `test_dbt_diff.py` passes.

### Pitfall 4: GDAL driver output is not byte-comparable
**What goes wrong:** Replacing FORMAT CSV with `FORMAT GDAL, DRIVER 'GeoJSON'` — output includes
`"name": "counties_geo"` key in FeatureCollection root, which is not present in the current files.
**Prevention:** Keep FORMAT CSV. Document why in the macro.

### Pitfall 5: int_combined modification cascade
**What goes wrong:** Thinking that dropping columns from the mart SELECT also requires removing them
from `int_combined` and `int_specimen_obs_base`.
**Prevention:** Leave intermediate models unchanged. The mart can project a subset of int_combined's
columns. The contract enforces what the mart emits, not what intermediates carry.

---

## Wave Sequencing

All 4 REQs are independent of each other and parallelizable within Phase 85.

| Wave | Tasks | Parallelizable? |
|------|-------|-----------------|
| Wave 1 | TEST-01 (staging filter + schema.yml update), TEST-02 (remove relationships test + add singular test) | Yes — different files |
| Wave 1 | CLEAN-01 (update macro comment), CLEAN-02 schema.yml + occurrences.sql + sqlite.ts | Yes — different files |
| Wave 2 | Run `bash data/dbt/run.sh build` (validates all 4 changes together) | Sequential after Wave 1 |
| Wave 2 | Run `data/export.py` to regenerate public/data (CLEAN-02 diff gate) | Sequential after Wave 2 build |
| Wave 2 | Run `uv run --project data pytest data/tests/test_dbt_diff.py -x` | Sequential after export |
| Wave 2 | Run `npm test` | Parallel with dbt build |

The natural plan is 2 waves: Wave 1 = all code edits (4 plans, one per REQ); Wave 2 = verification.

---

## Open Questions (RESOLVED)

1. **RESOLVED — CLEAN-02 intermediate cleanup deferred (D-04 narrow scope).** User decision during planning: Phase 85 drops the 3 columns only from `marts/occurrences`; `int_specimen_obs_base` and `int_combined` keep them. Phase 86 (port remaining transforms) will rewrite intermediate models anyway and is the natural moment to clean them up.

2. **RESOLVED — CLEAN-01 satisfied by documentation only (D-03).** User decision: keep FORMAT CSV with explanatory comments documenting why FORMAT JSON and FORMAT GDAL fail to be byte-comparable. ROADMAP SC#2 "no longer uses FORMAT CSV" is reinterpreted as "is documented with rationale." Python post-hook is NOT pursued — the complexity doesn't pay off when the CSV workaround works.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | dlt tombstone rows (is_deleted=True, id=NULL) should be preserved in raw schema for merge bookkeeping | TEST-01 option (b) | Low — even if wrong, staging filter is still the right fix for Phase 85 |
| A2 | REQUIREMENTS.md "replaced" for CLEAN-01 is satisfied by documentation-only change | CLEAN-01 | Medium — if planner reads "replace" as requiring functional change, Python post-hook must be scoped |

---

## Sources

### Primary (HIGH confidence)
- `data/beeatlas.duckdb` — queried directly for null id row inspection, catalog_number format,
  ecdysis_id/id relationship, is_deleted distribution, singular test result verification
- `data/dbt/models/` source files — read directly
- `data/dbt/tests/scaffold_assert.sh` — confirmed tests/ directory exists in data/dbt/
- `data/dbt/dbt_project.yml` — confirmed no test-paths override (defaults to ["tests"])
- `public/data/counties.geojson`, `public/data/ecoregions.geojson` — verified top-level keys
- DuckDB v1.5.2 spatial extension dc1996b — GDAL driver tested in-process

### Secondary (MEDIUM confidence)
- `.planning/phases/085-pre-cutover-groundwork/085-PATTERNS.md` — prior analog analysis
- `.planning/research/dbt-spike-findings.md` — Phase 84 findings on GDAL trade-off

## Metadata

**Confidence breakdown:**
- TEST-01 root cause and fix: HIGH — null row inspected, join behavior verified
- TEST-02 singular test correctness: HIGH — PATTERNS.md error caught and verified
- CLEAN-01 GDAL incompatibility: HIGH — GDAL driver tested directly
- CLEAN-02 safety and sequence: HIGH — grep verified no hidden references

**Research date:** 2026-05-13
**Valid until:** Until data/beeatlas.duckdb is refreshed from iNat API (soft-delete tombstone may
be removed on full reload; staging filter remains correct regardless)
