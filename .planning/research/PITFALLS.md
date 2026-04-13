# Pitfalls Research

**Domain:** Adding a second incremental iNat pipeline (observation field query) alongside an existing one, with a column rename across the full stack
**Researched:** 2026-04-12
**Confidence:** HIGH — all pitfalls derived directly from inspection of the live codebase (`inaturalist_pipeline.py`, `export.py`, `conftest.py`, `validate-schema.mjs`, frontend TypeScript sources). No speculative claims.

---

## Critical Pitfalls

---

### Pitfall 1: Second iNat Pipeline Sharing `pipeline_name="inaturalist"` Corrupts the Incremental Cursor

**What goes wrong:**
If the new WABA observation-field pipeline calls `dlt.pipeline(pipeline_name="inaturalist", ...)`, it shares a `_dlt_pipeline_state` row in DuckDB with the existing `inaturalist_pipeline.py`. dlt stores the incremental cursor (`updated_since` value) keyed by `pipeline_name` + source name + resource name. If both pipelines share `pipeline_name="inaturalist"`, one pipeline's cursor overwrites the other's, causing either duplicate full reloads or missed observations depending on which cursor was last written.

The existing `inaturalist_pipeline.py` and `projects_pipeline.py` both call `dlt.pipeline(pipeline_name="inaturalist", ...)` — this is intentional because projects writes into the same `inaturalist_data` dataset. The new pipeline writes to a different dataset, so sharing the name serves no purpose and creates collision risk.

**Why it happens:**
Developers copy the existing `inaturalist_pipeline.py` as a starting point and keep the `pipeline_name`. It seems reasonable since both hit the iNat API, but dlt treats `pipeline_name` as the global state bucket key.

**How to avoid:**
Name the new pipeline something distinct: `dlt.pipeline(pipeline_name="inaturalist_waba", ...)`. Give it its own `dataset_name` (e.g., `"waba_data"`). This guarantees a separate `_dlt_pipeline_state` row. The existing pipeline's `updated_since` cursor is completely unaffected.

Verify isolation: after one run of each pipeline, query `SELECT pipeline_name, source_name, resource_name FROM _dlt_pipeline_state` and confirm two distinct rows with independent timestamps.

**Warning signs:**
- The existing iNat pipeline fetches all observations from 2000-01-01 on the run after adding the new pipeline
- The new pipeline never fetches incrementally (always does a full reload)
- `_dlt_pipeline_state` has only one row for the iNat family instead of two
- `DELETE FROM _dlt_pipeline_state WHERE pipeline_name = 'inaturalist'` in `load_observations(full_reload=True)` would accidentally delete the WABA cursor too if names overlap

**Phase to address:** New pipeline implementation phase

---

### Pitfall 2: Catalog Number Type Mismatch Silently Drops All Matches in the Export Join

**What goes wrong:**
The Ecdysis `field_number` column contains values like `WSDA_25034236`. The WABA observation field (`field_id=18116`) stores the catalog number as the observer typed it — likely `25034236` (numeric only) or possibly `WSDA_25034236` (full format). The export join must strip the `WSDA_` prefix from `field_number` before comparing. If the join is written as `field_number = ofv_value` without normalization, zero rows match and `specimen_observation_id` is NULL for every specimen.

Additionally, iNat observation field values are stored as `VARCHAR` in `observations__ofvs.value`. If the export attempts `CAST(ofv.value AS BIGINT)` for the join comparison, values with leading zeros (hypothetical: `00123`) silently become `123`, and values that are not purely numeric raise a `ConversionException` that may be swallowed by `TRY_CAST`, producing silent nulls.

**Why it happens:**
The field_number format is domain-specific institutional data. Developers see `25034236` in iNat and `WSDA_25034236` in Ecdysis and assume they need a numeric cast to compare, not realizing the prefix must be stripped from the Ecdysis side.

**How to avoid:**
In the export SQL, normalize both sides to lowercase stripped strings before joining:
```sql
regexp_extract(o.field_number, '(\d+)$', 1) = ofv.value
```
This extracts the trailing numeric suffix from `WSDA_25034236` (yielding `25034236`) and compares it to the ofv VARCHAR value directly — no cast needed, no leading-zero risk. Keep both sides as VARCHAR for the join; avoid any integer cast in the join predicate.

Verify the normalization is correct by checking `field_number` values directly in `ecdysis_data.occurrences` before writing the export query:
```sql
SELECT DISTINCT field_number FROM ecdysis_data.occurrences WHERE field_number LIKE 'WSDA_%' LIMIT 20;
```

**Warning signs:**
- Export produces `specimen_observation_id IS NULL` for all rows in `ecdysis.parquet`
- The new pipeline loaded rows into its table but the export join count is zero
- `TRY_CAST(ofv.value AS BIGINT)` returns NULL for some rows (field values not purely numeric)
- `COUNT(*)` from `waba_data.observations__ofvs WHERE field_id = 18116` is non-zero but the joined count is zero

**Phase to address:** Export phase (after new pipeline is working, before parquet schema validation)

---

### Pitfall 3: Column Rename `inat_observation_id` → `host_observation_id` Has Six Independent Failure Points

**What goes wrong:**
The rename touches: `data/export.py` (SQL SELECT alias), `data/tests/test_export.py` (`EXPECTED_ECDYSIS_COLS` list), `data/tests/conftest.py` (`ecdysis_data.occurrence_links` table DDL column name), `scripts/validate-schema.mjs` (`EXPECTED` object), `frontend/src/features.ts` (DuckDB SELECT and object property), `frontend/src/bee-map.ts` (`f.get('inat_observation_id')`), `frontend/src/filter.ts` (SQL string), and `frontend/src/bee-atlas.ts` (JOIN clause and SELECT). Missing any one of these causes a silent null column or a CI schema gate failure, but not always an obvious error — the frontend may render with no iNat links and no console error.

Count from live codebase inspection:
- `inat_observation_id` appears in 8 frontend `.ts` files (grep: `features.ts`, `bee-map.ts`, `filter.ts`, `bee-atlas.ts` — plus the test files)
- `inat_observation_id` appears in `export.py` SQL (column alias)
- `inat_observation_id` appears in `test_export.py` `EXPECTED_ECDYSIS_COLS`
- `inat_observation_id` appears in `conftest.py` table DDL
- `inat_observation_id` appears in `validate-schema.mjs` `EXPECTED` object
- `inatObservationId` (camelCase) appears in `bee-sidebar.ts`, `bee-specimen-detail.ts`, `bee-atlas.ts`, `bee-sidebar.test.ts` — this is the TypeScript interface property name, derived from the parquet column name via manual mapping in `bee-atlas.ts:789`

The camelCase `inatObservationId` in interfaces and tests is a separate surface area from the snake_case SQL column name.

**Why it happens:**
The column name crosses a type boundary (parquet snake_case → TypeScript camelCase) so there is no single source of truth. A search-and-replace for `inat_observation_id` misses `inatObservationId`, and vice versa.

**How to avoid:**
Treat this as a two-pass rename. Pass 1: snake_case layer — `export.py`, `conftest.py`, `test_export.py`, `validate-schema.mjs`, SQL strings in `.ts` files. Pass 2: camelCase layer — TypeScript interface properties and their usages in `bee-atlas.ts`, `bee-sidebar.ts`, `bee-specimen-detail.ts`, and test fixtures. Run `pytest` after pass 1 to catch Python-side misses. Run `npm test` after pass 2 to catch TypeScript-side misses. Run `node scripts/validate-schema.mjs` after generating a test parquet to confirm the schema gate matches.

Complete rename checklist (from codebase inspection):
- `data/export.py`: SQL alias `links.inat_observation_id` → `host_observation_id`
- `data/export.py`: docstring in `export_ecdysis_parquet`
- `data/export.py`: JOIN `inat ON inat.id = links.inat_observation_id` (this stays — it's a table join condition, not the output column name)
- `data/tests/test_export.py`: `EXPECTED_ECDYSIS_COLS` list entry
- `data/tests/conftest.py`: `occurrence_links` DDL column name
- `scripts/validate-schema.mjs`: `EXPECTED['ecdysis.parquet']` array
- `frontend/src/features.ts`: SQL string and object property
- `frontend/src/bee-map.ts`: `f.get('inat_observation_id')`
- `frontend/src/filter.ts`: SQL string in `buildDataSQL`
- `frontend/src/bee-atlas.ts`: JOIN condition and SELECT list (multiple occurrences)
- `frontend/src/bee-atlas.ts`: TypeScript `inatObservationId` property mapping → `hostObservationId`
- `frontend/src/bee-sidebar.ts`: interface property `inatObservationId` → `hostObservationId`
- `frontend/src/bee-specimen-detail.ts`: template binding `s.inatObservationId`
- `frontend/src/tests/bee-sidebar.test.ts`: fixture data properties

**Warning signs:**
- `pytest` passes but `npm test` fails with `inatObservationId is not defined`
- `npm test` passes but `node scripts/validate-schema.mjs` reports missing column `host_observation_id`
- iNat host links disappear from the specimen sidebar after deploy (silent null from missing parquet column)
- TypeScript compiler passes but runtime `f.get('inat_observation_id')` returns `undefined` (returns undefined, not a compile error, because OL feature property access is untyped)

**Phase to address:** Rename phase — must be a single atomic phase, not split across phases

---

### Pitfall 4: iNat `ofvs` Array Absent or Empty When `field_id=18116` Has No Matches

**What goes wrong:**
When querying the iNat v2 API with `observation_fields[18116]=*` (or equivalent), the `ofvs` array in each result contains only the matching field values, but the array may be absent (`null`) or empty (`[]`) for some observations even when field 18116 exists. The existing `_transform` function in `inaturalist_pipeline.py` handles the `geojson` key with `(item.pop("geojson", None) or {})` — a safe pattern — but does not defensively handle `ofvs` being absent.

More critically: if the query parameter for filtering by field_id is not supported in the v2 API (it's `observation_fields[field_id]=*` in v1 but the parameter name may differ in v2), all WA observations are returned, not just those with field 18116, causing a massive unexpected result set.

**Why it happens:**
The existing pipeline uses `project_id` filtering which is well-documented in the v2 API. Observation field filtering is a different parameter — developers may guess the parameter name from v1 docs or trial and error, getting a plausible-looking result set that is actually unfiltered.

**How to avoid:**
Verify the correct v2 parameter before writing the pipeline. The iNat v2 API supports `field_id[]=18116` or `observation_fields[18116]=*` — confirm by testing:
```
GET https://api.inaturalist.org/v2/observations?field_id[]=18116&per_page=1&fields=id,ofvs.field_id,ofvs.value
```
Check that the result count is the expected small number (~hundreds, not tens of thousands). If the result count matches the WABA project observation count (~3,000+), the filter is not working.

Defensively handle `ofvs` in the new pipeline's transform: `item.get("ofvs") or []`.

**Warning signs:**
- New pipeline fetches >10,000 observations on first run (WABA catalog observations should be in the hundreds)
- The pipeline takes as long as the main iNat pipeline (both fetch similar volumes)
- Observation count from the new pipeline equals the count from the main WABA project pipeline
- `ofvs` field is absent in some result items, causing `KeyError` in transform

**Phase to address:** New pipeline implementation phase (before first production run)

---

### Pitfall 5: Duplicate Observations Between `inaturalist_data` and `waba_data` Confuse the Export Join

**What goes wrong:**
A WABA volunteer may have both: (1) added their specimen observation to the WABA project (already in `inaturalist_data.observations`) AND (2) filled in the WABA catalog field (field_id=18116) with the specimen's catalog number. This means the same iNat observation ID appears in both `inaturalist_data.observations` and the new `waba_data.observations`. The export join for `specimen_observation_id` is correct in this case (it joins on catalog number to get the obs ID), but the `host_observation_id` (formerly `inat_observation_id`) is derived from `occurrence_links` — which was scraped from the Ecdysis HTML page's `#association-div`. These are different links: one is the specimen photographer's link, one is the host plant observer's link. The export must not conflate them.

**Why it happens:**
The two different link types (WABA catalog field = specimen photo link; Ecdysis association div = host plant observation link) look identical in the data model — both are iNat observation IDs stored as BIGINT. A developer might simplify by coalescing them, losing the distinction.

**How to avoid:**
Keep the two columns strictly separate in the export:
- `host_observation_id` comes exclusively from `ecdysis_data.occurrence_links` (scraped Ecdysis HTML)
- `specimen_observation_id` comes exclusively from the WABA catalog field join

Do not COALESCE them or combine them into one column. Verify by finding a specimen that has both links and confirming the two columns contain different observation IDs.

**Warning signs:**
- `specimen_observation_id` and `host_observation_id` have identical values for many rows (not just occasional coincidence)
- Export query uses `COALESCE(specimen_observation_id, host_observation_id)` anywhere
- Specimen sidebar shows the same iNat link for both the specimen photo and the host observation

**Phase to address:** Export phase (requires understanding the semantic distinction before writing SQL)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Reusing `pipeline_name="inaturalist"` for the new pipeline | No config change needed | Cursor collision corrupts incremental state for both pipelines | Never — always use a distinct pipeline_name |
| Casting catalog number to BIGINT for the join | Avoids string normalization logic | Leading zeros lost; non-numeric values crash or return NULL | Never — keep as VARCHAR for join |
| Using observation ID from `inaturalist_data` as `specimen_observation_id` | Avoids new pipeline entirely | Wrong semantic — those are host observations, not specimen photos | Never — they are different data |
| Skipping the `validate-schema.mjs` update until after deploy | One less file to change | CI schema gate passes with wrong column list; next pipeline run breaks frontend silently | Never — schema gate must be updated atomically with export SQL |
| Renaming `inatObservationId` in TypeScript in a separate PR from the parquet rename | Staged rollout | Intermediate state where parquet column exists but TypeScript reads wrong key — silent null for all iNat links in production between deploys | Never — rename must be atomic across all layers |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| iNat v2 API + observation fields | Guessing the `observation_fields[id]=*` parameter from v1 docs | Verify live with `curl` before writing the pipeline; check result count vs expected |
| dlt incremental + multiple pipelines same DB | Same `pipeline_name` for two sources — cursor collision | Give each pipeline a unique `pipeline_name`; different `dataset_name` for schema separation |
| Export SQL + catalog number join | Type-casting `field_number` or ofv value to INTEGER | String normalization only: `regexp_extract(field_number, '(\d+)$', 1) = ofv.value` |
| `conftest.py` test fixtures + column rename | Updating `EXPECTED_ECDYSIS_COLS` in `test_export.py` but forgetting the DDL in `conftest.py` | The DDL in conftest must match the actual dlt-created schema; grep for `inat_observation_id` in all `data/` Python files after rename |
| `validate-schema.mjs` + new parquet column | Adding `specimen_observation_id` to export but not to the `EXPECTED` array | `EXPECTED` is the authoritative checklist; update it in the same commit as the export SQL change |
| OL feature properties + column rename | TypeScript `f.get('inat_observation_id')` returns `undefined` silently (no type error) | The parquet column name and the `f.get()` key must match exactly; no TypeScript type safety here |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full-reload WABA pipeline on every run | Pipeline fetches all WABA obs each nightly run; ~hundreds of API calls instead of a delta | Ensure incremental cursor is active; verify `_dlt_pipeline_state` has a non-initial `updated_since` after first run | From day one if cursor is not persisting |
| Export join with no index on `field_number` | Catalog number join is a full scan of `occurrences` × `observations__ofvs` | DuckDB handles this fine at current scale (~50K specimens × ~hundreds of WABA obs); no action needed | Not a concern until millions of rows |

---

## "Looks Done But Isn't" Checklist

- [ ] **New pipeline cursor isolated:** After first run, query `SELECT pipeline_name, source_name FROM _dlt_pipeline_state` — confirm the new pipeline has its own row distinct from `pipeline_name='inaturalist'`
- [ ] **Catalog number join yields rows:** After export, `SELECT COUNT(*) FROM read_parquet('ecdysis.parquet') WHERE specimen_observation_id IS NOT NULL` — confirm non-zero result
- [ ] **host_observation_id column present:** `validate-schema.mjs` reports `ok ecdysis.parquet` after the rename — not `missing columns: host_observation_id`
- [ ] **inatObservationId → hostObservationId in TypeScript:** Specimen sidebar still shows host plant iNat links after the rename — open a known specimen with a linked host observation and verify the link renders
- [ ] **specimen_observation_id link renders:** Open a specimen known to have a WABA catalog field entry and verify the new `specimen_observation_id` link appears in the sidebar
- [ ] **No TypeScript compile errors:** `cd frontend && npm run build` exits 0 after the camelCase rename
- [ ] **pytest still passes:** `cd data && uv run pytest` exits 0 — specifically `test_ecdysis_parquet_schema` passes with updated `EXPECTED_ECDYSIS_COLS`
- [ ] **Two links semantically distinct:** Find a specimen that has both a host observation link and a specimen photo link; confirm they point to different iNat observation IDs
- [ ] **conftest DDL updated:** `conftest.py` `occurrence_links` DDL column is `host_observation_id BIGINT`, not `inat_observation_id BIGINT` — otherwise `fixture_con` test setup fails silently (wrong column name in test DB)

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Cursor collision between pipelines | MEDIUM | Run `DELETE FROM _dlt_pipeline_state WHERE pipeline_name = 'inaturalist_waba'` (or whichever was misconfigured); fix `pipeline_name`; re-run with `full_reload=True` for the affected pipeline |
| Catalog number join yields zero rows | LOW | Query `ecdysis_data.occurrences` for sample `field_number` values; compare to `waba_data.observations__ofvs` for sample `value` values; adjust normalization function |
| Partial column rename deployed | MEDIUM | Parquet has new column name but frontend reads old name: iNat links disappear for all users. Fix: complete the rename in one atomic commit; re-run pipeline; re-deploy |
| Schema gate blocks CI | LOW | `validate-schema.mjs` exits 1; fix the `EXPECTED` array to match actual parquet columns; re-run CI |
| conftest DDL mismatch after rename | LOW | `pytest` fails with `column not found: inat_observation_id`; update DDL in `conftest.py` to match new column name |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Pipeline cursor collision | New pipeline implementation | `SELECT pipeline_name FROM _dlt_pipeline_state` shows distinct row for new pipeline |
| Catalog number type mismatch | Export phase | `SELECT COUNT(*) FROM ecdysis.parquet WHERE specimen_observation_id IS NOT NULL` > 0 |
| Column rename incomplete | Rename phase (atomic) | `pytest` + `npm test` + `validate-schema.mjs` all pass in same CI run |
| iNat API field filter wrong parameter | New pipeline phase | Observation count from new pipeline << count from main iNat pipeline |
| Duplicate obs semantic confusion | Export phase design | Two columns remain separate in SQL; confirmed distinct IDs in test data |

---

## Sources

- Live codebase: `data/inaturalist_pipeline.py` — cursor storage via `_dlt_pipeline_state`; `load_observations` full_reload deletes state by `pipeline_name`
- Live codebase: `data/export.py` — `links.inat_observation_id` in SELECT; JOIN `inat.id = links.inat_observation_id`
- Live codebase: `data/tests/test_export.py` — `EXPECTED_ECDYSIS_COLS` (Python-side schema gate)
- Live codebase: `data/tests/conftest.py` — `occurrence_links` DDL; `EXPECTED_ECDYSIS_COLS` mirror
- Live codebase: `scripts/validate-schema.mjs` — `EXPECTED['ecdysis.parquet']` (CI schema gate)
- Live codebase: `frontend/src/features.ts`, `bee-map.ts`, `filter.ts`, `bee-atlas.ts` — 8 occurrences of `inat_observation_id` across TypeScript SQL strings and property accessors
- Live codebase: `frontend/src/bee-sidebar.ts`, `bee-specimen-detail.ts`, `bee-atlas.ts` — `inatObservationId` camelCase in TypeScript interfaces and templates
- Live codebase: `data/projects_pipeline.py` — confirms `pipeline_name="inaturalist"` already shared between `inaturalist_pipeline.py` and `projects_pipeline.py` (intentional; both write `inaturalist_data`)
- dlt docs: pipeline state keyed by `pipeline_name` + source name + resource name — [dlt incremental loading](https://dlthub.com/docs/general-usage/incremental-loading)
- PROJECT.md key decisions: "Match iNat ofvs by field_id not name" (field_id=8338 stable); "Parse raw API dicts not pyinaturalist model objects"

---
*Pitfalls research for: v2.3 Specimen iNat Observation Links — second iNat pipeline + column rename*
*Researched: 2026-04-12*
