# Phase 165: Duplicate occurrence rows sharing one occ_id — Research

**Researched:** 2026-06-24
**Domain:** dbt data model (int_combined), iNaturalist project membership, catalog-number matching, domain documentation
**Confidence:** HIGH (all findings verified against live DuckDB `data/beeatlas.duckdb` and source SQL)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Same physical iNat observation entering two arms and colliding on one `occ_id` is **one occurrence** (collapse at data layer, not display layer).
- **D-02:** Collapse/correctness belongs at **data layer (`int_combined` / upstream intermediates)**. One corrected model fixes every surface.
- **D-03:** `is_provisional` / "provisional" / "sample" = **member of the WABA "plant images & sample IDs" iNat project** (`project_id=166376`, slug `washington-bee-atlas-waba-plant-images-sample-ids-1854c0dc-0780-41e9-93f7-1f582b4df096`). Floral-host / sample observations; by definition never join other sources.
- **D-04:** Today's "WABA" = `field:WABA=` obs (bee specimens). `int_provisional_waba_ids` = those catalog-field obs NOT matched to Ecdysis. Wrong population — root cause of the bug.
- **D-05:** Obs 320276469 is a bee observation that should match Ecdysis by catalog number but doesn't, so it falls into provisional and collides. Fix is the match, not display dedup.
- **D-06:** Document each `int_combined` arm and what real-world thing it represents, including the `occIdFromRow` ID-prefix vocabulary and priority order coupled across `src/occurrence.ts`, `src/filter.ts`, `occurrence_places.sql`.
- **D-07:** `docs/domain-model.md` (standalone, human-readable), linked from `CLAUDE.md`. Not an ADR.
- **D-08:** Reconciliation (if any legitimate cross-arm merge survives correction) is per-column, not blanket-precedence.
- **D-09:** Add a dbt uniqueness assertion on synthetic `occ_id` at the mart layer. Form: a singular test.

### Claude's Discretion
- Exact dbt restructuring of the provisional arm (new int model vs. reworking `int_provisional_waba_ids` / `int_matched_waba_ids`) — planner's call.
- The precise mechanics of the catalog-number match fix (D-05) — research/plan.

### Deferred Ideas (OUT OF SCOPE)
- Display-layer dedup (roadmap options a/b/c).
- "Same specimen, two different occ_ids" (distinct from this phase — no collision, deferred).
</user_constraints>

---

## Summary

This phase delivers two things: (1) a human-first domain model document (`docs/domain-model.md`), and (2) a corrected data model that eliminates the root cause of duplicate `occ_id` rows in `int_combined`.

**Root cause confirmed by DuckDB query:** Two separate collision shapes exist in the current data. Shape A: obs 320276469 appears as both `waba_sample` (ARM 2, `is_provisional=true`) and `inat_obs` (ARM 3), both resolving to `occ_id='inat_obs:320276469'`. The cause is `int_waba_link`'s `MIN(waba.id) GROUP BY catalog_suffix` — when two WABA obs share the same catalog field value, only the lower-ID obs gets matched; obs 320276469 loses to obs 320276018 and falls through to `int_provisional_waba_ids`. Shape B: obs 351027987 (a floral-host plant in the WABA project) appears in ARM 1 as a sample-only row (via `int_samples_base`) AND in ARM 2 as `waba_sample` (its bee specimen 365626484 referenced it via OFV 1718), both resolving to `occ_id='inat:351027987'`.

**The D-03 fix eliminates both collisions structurally.** Under the corrected definition, ARM 2 is sourced from `inaturalist_data.observations__observation_projects WHERE project_id=166376`, anti-joined against `int_samples_base`. This produces ~33 plant/sample observations (currently invisible) as the new provisional set — none of which are bee-specimen observations, so they cannot collide with ARM 3. The 34 current bee-specimen `waba_sample` rows (all of which lack Ecdysis matches) would be removed from ARM 2. Only one of the 34 (obs 320276469) can be rescued by a D-05 catalog-match fix; the other 33 will be temporarily invisible until their Ecdysis records are uploaded. This is an intended regression per D-04.

**Primary recommendation:** Restructure ARM 2 in `int_combined` to source from project membership (`inaturalist_data.observations__observation_projects` WHERE `project_id=166376`, ANTI-JOIN `int_samples_base`). Fix the `MIN(waba.id)` deduplication in `int_waba_link` to match ALL WABA obs sharing a catalog suffix (not just the lowest-ID one). Add a singular dbt test asserting occ_id uniqueness on `int_combined`. Write `docs/domain-model.md` and link it from `CLAUDE.md`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| ARM definition / is_provisional | Data pipeline (dbt intermediate) | — | D-02 locked: correctness at data layer |
| Catalog-number match | Data pipeline (dbt intermediate) | — | `int_waba_link` owns the WABA→Ecdysis join |
| occ_id uniqueness guard | Data pipeline (dbt test) | — | Singular test on `int_combined` |
| Domain documentation | `docs/domain-model.md` | `CLAUDE.md` (link) | D-07 locked |
| ID-prefix vocabulary enforcement | `src/occurrence.ts` (TS) + `src/filter.ts` + `occurrence_places.sql` | — | Positional coupling documented in source; no change expected in this phase |

---

## Research Question 1: The Provisional Arm Correction

### Current ARM 2 mechanics [VERIFIED: beeatlas.duckdb]

`int_provisional_waba_ids` (`data/dbt/models/intermediate/int_provisional_waba_ids.sql`):
```sql
SELECT id AS waba_obs_id
FROM stg_waba__observations
WHERE id NOT IN (SELECT waba_obs_id FROM int_matched_waba_ids)
```

`int_matched_waba_ids` (`data/dbt/models/intermediate/int_matched_waba_ids.sql`) joins `int_waba_link` to `int_ecdysis_catalog_suffixes`.

`int_waba_link` (`data/dbt/models/intermediate/int_waba_link.sql`):
```sql
SELECT CAST(ofv.value AS BIGINT) AS catalog_suffix,
       MIN(waba.id) AS specimen_observation_id
FROM stg_waba__observations waba
JOIN stg_waba__ofvs ofv ON ofv._dlt_root_id = waba._dlt_id
    AND ofv.field_id = 18116 AND ofv.value != ''
GROUP BY catalog_suffix
```

The `MIN(waba.id)` is the bug for D-05: two WABA obs with the same catalog field → only the lower ID is matched; the other falls into provisional ARM 2.

### Where project membership lives [VERIFIED: beeatlas.duckdb]

`data/projects_pipeline.py` loads `inaturalist_data.observations__observation_projects` (columns: `observation_uuid`, `project_id`, `_dlt_root_id`, `_dlt_parent_id`, `_dlt_list_idx`, `_dlt_id`).

The WABA plant-images project is `project_id=166376` (`inaturalist_data.projects` confirms: title="Washington Bee Atlas (WaBA): Plant images/Sample IDs", slug matches D-03). Project membership is ingested via `inaturalist_pipeline.py` using `project_id=166376` in `data/.dlt/config.toml`.

**Critical distinction:** Two separate DuckDB schemas hold different iNat data:
- `inaturalist_data`: the project 166376 pipeline (plant/sample images) — ~11,841 obs, ~11,838 are members of project 166376
- `inaturalist_waba_data`: the `field:WABA=` pipeline (bee specimens) — 1,417 obs, all have field 18116

These two populations are **entirely disjoint** in the current DB. The new ARM 2 pulls from `inaturalist_data` (already loaded); no new ingestion required.

### What the new ARM 2 population looks like [VERIFIED: beeatlas.duckdb]

```
Project 166376 observations total:                       11,838
  Already in int_samples_base (have specimen_count OFV): 11,806  → already in ARM 1 via FOJ
  Not in int_samples_base (lack specimen_count OFV):         33  → would become new ARM 2
    Of these 33, have coordinates (mappable):                28
    Of these 33, lack coordinates (not mappable):             5
```

The 33 provisional plant-image obs that lack a specimen count OFV are currently invisible (not in ARM 1 via `int_samples_base`, not in ARM 2 as currently defined). Under D-03, they become the new `is_provisional=TRUE` set.

Sample rows from the 33 (obs 177291250 Hoplitis, 208960044 Balsamorhiza hookeri, 270648560 Anthophila, etc.) — a mix of plants and unidentified insects — all lack the `field_id=8338` (specimen count) OFV. They represent records uploaded to the WABA project that are incomplete (missing sample metadata).

### Current ARM 2 rows that would be removed [VERIFIED: beeatlas.duckdb]

`int_combined WHERE source='waba_sample'` currently has **34 rows** — all are bee-specimen observations from `inaturalist_waba_data`. All 34 have `specimen_observation_id` populated (the bee obs ID). All 34 have `canonical_name` set (bee species names like osmia, megachile, anthophora). ALL 34 are unmatched in `int_ecdysis_catalog_suffixes`:
- 33 lack any matching Ecdysis catalog suffix at all (their catalog numbers are not yet in Ecdysis — pending Ecdysis upload)
- 1 (obs 320276469) has a matching Ecdysis suffix but is shadowed by the `MIN()` bug

**After D-03 + D-05:** obs 320276469 gets rescued (becomes ARM 1 via Ecdysis match). The other 33 lose their representation in `int_combined` until their Ecdysis records are uploaded. This is accepted per D-04.

### Impact on `marts/occurrences` schema [VERIFIED: beeatlas.duckdb]

The column count stays 36 — no columns added or removed. The dbt contract in `data/dbt/models/marts/schema.yml` (36 declared columns + 2 geo columns `county`/`ecoregion_l3` added by `occurrences.sql`) is unchanged. This is a **data-only change** (row content changes, schema does not), which simplifies the release relative to the full deadlock scenario in `project_occurrences_contract_release_sequence`. However, `test_dbt_diff.py::test_occurrences_schema_matches` compares the sandbox parquet against live S3 — it checks column schema (names + types) which is stable, but also row-count drift. The removal of 34 `waba_sample` rows (and addition of ~28 new provisional rows) is a ~5-row net delta on ~60,000+ occurrence rows — well within the `[-2%, +5%]` tolerance.

The `source` column value for new ARM 2 rows: the planner must decide whether to keep `'waba_sample'` (confusing since these aren't WABA observations) or rename to `'provisional'`. This is Claude's discretion.

---

## Research Question 2: The Catalog-Number Match Gap (D-05)

### Root cause of the 320276469 collision [VERIFIED: beeatlas.duckdb]

Obs 320276469 and obs 320276018 **both** carry `field_id=18116, value='25000848'` (the catalog number). `int_waba_link` uses `MIN(waba.id) GROUP BY catalog_suffix`, so only obs 320276018 (the lower ID) is treated as the matched observation. Obs 320276469 (ID 320276469 > 320276018) is not in `int_matched_waba_ids` and falls into `int_provisional_waba_ids`.

Ecdysis record `WSDA_25000848` exists in `int_ecdysis_catalog_suffixes` with `catalog_suffix=25000848`. `int_ecdysis_catalog_suffixes` extracts the suffix as `CAST(regexp_extract(catalog_number, '[0-9]+$', 0) AS BIGINT)` — `WSDA_25000848` → `25000848`. The suffix extraction and casting work correctly.

The fix is to **remove the `MIN()` deduplication** in `int_waba_link`. Instead of `MIN(waba.id) AS specimen_observation_id GROUP BY catalog_suffix`, return ALL WABA obs for each matching catalog suffix. This means `int_matched_waba_ids` becomes a set of ALL `waba_obs_id` values that have a matching Ecdysis suffix, not just the lowest-ID one.

**Before fix:** `int_waba_link` is a 1:1 map (catalog_suffix → 1 obs_id). `int_matched_waba_ids` matches only the `MIN` obs per catalog number.

**After fix:** `int_waba_link` becomes a 1:N map (catalog_suffix → all obs with that suffix). `int_matched_waba_ids` matches all WABA obs sharing a catalog number with any Ecdysis record.

**Impact scope:** Only obs 320276469 (the one case where two WABA obs share a catalog suffix that IS in Ecdysis) is affected. The `MIN()` removal causes no other change in the current dataset.

### Match path trace [VERIFIED: code + data]

```
stg_waba__observations.id (e.g. 320276469)
  → stg_waba__ofvs WHERE field_id=18116 (value='25000848')
  → int_waba_link: CAST(ofv.value AS BIGINT)=25000848, MIN(waba.id)=320276018  ← BUG HERE
  → int_matched_waba_ids: waba_obs_id=320276018 (320276469 excluded)
  → int_provisional_waba_ids: 320276469 IS in provisional set
  → int_combined ARM 2: waba_sample row with is_provisional=TRUE
```

After fix:
```
int_waba_link: returns rows for BOTH 320276018 AND 320276469
int_matched_waba_ids: waba_obs_id IN (320276018, 320276469)
int_provisional_waba_ids: 320276469 NOT in provisional set
```

Obs 320276469 would then be absent from ARM 2. Its ARM 3 row (in `inat_obs_data.observations` — obs 320276469 is present there with `obs_id`) remains. Under the D-03 correction, the provisional ARM 2 only includes project-membership obs, so the collision is doubly eliminated.

---

## Research Question 3: occ_id Collision Surface

### All possible collision shapes [VERIFIED: beeatlas.duckdb]

`occIdFromRow` priority (`src/occurrence.ts:23-30`, `src/filter.ts:108-114`, `occurrence_places.sql:43-48`):
1. `ecdysis:N` — when `ecdysis_id IS NOT NULL`
2. `inat:N` — when `observation_id IS NOT NULL` (sample host obs)
3. `inat_obs:N` — when `specimen_observation_id IS NOT NULL`
4. `checklist:N` — when `checklist_id IS NOT NULL`

**Shape A: `inat_obs:N` — ARM 2 × ARM 3** [VERIFIED: live in data]
Both rows have `ecdysis_id=NULL` and `observation_id=NULL`, so the ID falls to `specimen_observation_id`. ARM 2 (`waba_sample`) carries `specimen_observation_id=<bee obs id>`. ARM 3 (`inat_obs`) also carries `specimen_observation_id=<same bee obs id>`. Collision. Example: `inat_obs:320276469`.

Shape A requires: `ecdysis_id NULL` on both rows AND `observation_id NULL` on both rows AND same `specimen_observation_id`.

**Shape B: `inat:N` — ARM 1 (sample-only) × ARM 2 (waba_sample)** [VERIFIED: live in data]
A plant obs in `int_samples_base` brings a sample-only ARM 1 row with `observation_id=351027987`. The same obs is referenced as `host_observation_id` in a waba_sample ARM 2 row (via OFV 1718), so `observation_id=351027987` in ARM 2 as well. Both have `ecdysis_id=NULL`. Collision on `inat:351027987`.

Shape B requires: `ecdysis_id NULL` on both AND same `observation_id`.

**Shape C: `ecdysis:N` — ARM 1 fan-out from duplicate OFV** [VERIFIED: live in data, OUT OF SCOPE]
Obs 288589692 has a duplicate `field_id=9963` (sample_id) OFV row in `inaturalist_data.observations__ofvs`. `int_samples_base` LEFT-JOINs on sample_id OFV and fans out to 2 rows. Since this obs matches two Ecdysis records (6317352 and 6317353), each Ecdysis record × each OFV row = 2 rows per ecdysis_id. `ecdysis:6317352` and `ecdysis:6317353` each appear twice. This is a data quality issue in the `observations__ofvs` staging table, not an arm collision — different root cause, separate phase.

**After D-03 + D-05, what collisions remain?**
- Shape A: eliminated (no waba_sample bee-specimen rows in new ARM 2)
- Shape B: eliminated (waba_sample rows with `observation_id` sourced from host OFV disappear; new ARM 2 plant obs use their own `observation_id` which is NOT in `int_samples_base` by definition of the anti-join)
- Shape C: still present (independent data quality issue)

The dbt uniqueness test (D-09) on occ_id will **fail Shape C** as well. That's a good signal — the test surfaces all collision types, not just the ones fixed in this phase.

---

## Research Question 4: Regression Guard (D-09)

### occ_id storage [VERIFIED: code]

`occ_id` is NOT a stored column in `marts/occurrences.sql` or `int_combined.sql`. It is recomputed on the fly via the CASE expression (same as `OCC_ID_SQL_CASE` in `src/filter.ts`). However, `occurrence_places.sql` DOES output `occ_id` as a column (it is the primary output), and the `occurrence_places` contract (`data/dbt/models/marts/schema.yml`) declares `occ_id` with `not_null` test but NO `unique` test.

### Cleanest uniqueness assertion form [VERIFIED: test patterns in data/dbt/tests/]

The existing singular test pattern (`data/dbt/tests/*.sql`) returns rows that violate the invariant; 0 rows = PASS. The cleanest form for D-09 is a new singular test at `data/dbt/tests/test_no_duplicate_occ_ids.sql`:

```sql
-- Fails (returns rows) if any synthetic occ_id appears more than once in int_combined.
-- occ_id is not a stored column; the CASE expression below mirrors occurrence_places.sql
-- and src/occurrence.ts occIdFromRow priority: ecdysis → inat → inat_obs → checklist.
WITH occ_ids AS (
    SELECT
        CASE
            WHEN ecdysis_id IS NOT NULL THEN 'ecdysis:' || ecdysis_id
            WHEN observation_id IS NOT NULL THEN 'inat:' || observation_id
            WHEN specimen_observation_id IS NOT NULL THEN 'inat_obs:' || specimen_observation_id
            WHEN checklist_id IS NOT NULL THEN 'checklist:' || checklist_id
        END AS occ_id
    FROM {{ ref('int_combined') }}
)
SELECT occ_id, COUNT(*) as dup_count
FROM occ_ids
WHERE occ_id IS NOT NULL
GROUP BY occ_id
HAVING COUNT(*) > 1
```

**Note:** Shape C duplicates (from the OFV fan-out bug) will also be surfaced by this test. The test should be set to `severity: warn` initially so it doesn't block the build on the OFV data quality issue, which is a separate fix. Once Shape C is separately resolved, escalate to error.

**Alternative: uniqueness test on `occurrence_places`** — `occ_id` is stored there. But `occurrence_places` can have multiple rows per `occ_id` (one per place), so uniqueness applies to `(occ_id, place_slug)` — a dbt built-in test on the pair makes sense to also add, but it does not test the occ_id uniqueness directly. The singular test on `int_combined` is the right primary guard.

---

## Research Question 5: The Domain Model Document (D-07)

### Existing domain documentation to consolidate from [VERIFIED: code]

- `CLAUDE.md` "Domain Vocabulary" section: defines Specimen, Sample, Floral host, Observation, Occurrence record, Collection event. The new doc must be consistent with these definitions and linked from this section.
- `CLAUDE.md` "Architecture Invariants" section: documents ID format (`ecdysis:<int>` / `inat:<int>`), style cache bypass, filter race guard. The new doc expands the ID prefix vocabulary beyond the two mentioned in CLAUDE.md.
- `docs/adr/` — the only existing `docs/` artifact is `docs/adr/0001-mapbox-basemap-cache.md`. This establishes the precedent for a human-readable `docs/` file, but `docs/domain-model.md` is NOT an ADR (no Decision/Status header) — it's reference material.
- `int_combined.sql` header comment (lines 1-10): mentions ARM 1/2/3 but doesn't define them semantically.
- `src/occurrence.ts` (lines 1-30): JSDoc on `occIdFromRow` is the authoritative TS definition of the ID-prefix vocabulary. The new doc should reference this as the authoritative definition, not repeat it.

### Content the new doc must cover (per D-06 + D-07)

1. The 4 `int_combined` arms and the real-world thing each represents:
   - ARM 1 `ecdysis`: catalogued physical specimens (FULL OUTER JOIN Ecdysis × iNat sample records)
   - ARM 2 `waba_sample` (provisional): iNat obs that are members of the WABA plant-images project but lack a specimen count OFV — plant/sample images uploaded to iNat before sample metadata is complete
   - ARM 3 `inat_obs`: expert-curated bee observations from a separate iNat observation pipeline (project-independent, high confidence)
   - ARM 4 `checklist`: museum/collection checklist records (collapsed, approximate coordinates)

2. The corrected `is_provisional` definition (D-03): project 166376 membership, not "unmatched WABA catalog obs"

3. The `occIdFromRow` ID-prefix vocabulary and its positional coupling (`src/occurrence.ts:23-30`, `src/filter.ts:108-114`, `occurrence_places.sql:43-48`): change all three together

4. "When are two rows the same occurrence?" rule:
   - Same `occ_id` = same occurrence (after the D-03/D-05 correction, this should never happen)
   - Same physical bee specimen can have two different occ_ids (ARM 1 `ecdysis:N` and ARM 3 `inat_obs:M`) — this is known, deferred per CONTEXT

5. `isSampleOnly` vs `isProvisional` vs `isSpecimenBacked` distinction in `src/occurrence.ts:73-94`

---

## Research Question 6: Release Sequencing

### Schema change classification [VERIFIED: code + memory]

This phase changes **data content only** — same 36 columns in `marts/occurrences.sql` + `schema.yml`, same column types. It does NOT trigger the dbt contract deadlock (no column add/drop/rename → `test_occurrences_schema_matches` compares column names and types, which are stable).

However, the row count changes (34 `waba_sample` rows removed, ~28 new provisional rows added). The `[-2%, +5%]` tolerance in `test_dbt_diff.py` covers this.

**Release order** (from `project_occurrences_contract_release_sequence` memory):
- "Data-before-code" order is needed when the frontend code parses new columns that old S3 data lacks. Here the frontend code doesn't change (no new columns, no new field names). The release can be standard: push code + data together, normal nightly picks it up.
- The one-time `SKIP_INTEGRATION_GATE=1` is NOT required for this phase (no schema/contract change).
- `src/sqlite.ts` `CREATE TABLE occurrences` does NOT need updating (column set unchanged).

**The safe sequencing:**
1. Land the dbt model changes (ARM 2 restructure, D-05 catalog-match fix, D-09 test)
2. Write `docs/domain-model.md` + update `CLAUDE.md` link — these are code changes, not data
3. Run `bash data/dbt/run.sh build` locally — must pass the new uniqueness test
4. Run `cd data && uv run pytest` — `test_dbt_diff.py` runs locally against stale `public/data/` parquet; the row count delta is within tolerance
5. Push — next nightly picks up the new dbt models and publishes the corrected parquet
6. No `SKIP_INTEGRATION_GATE=1` needed

---

## Standard Stack

This phase is a pure data/documentation phase. No new npm packages or Python packages are installed.

### Affected files (dbt layer)

| File | Change Type | Notes |
|------|-------------|-------|
| `data/dbt/models/intermediate/int_waba_link.sql` | Edit | Remove `MIN()`, return all obs per catalog_suffix |
| `data/dbt/models/intermediate/int_matched_waba_ids.sql` | Edit | Join via revised `int_waba_link` (no MIN, so join becomes 1:N → int_matched_waba_ids is now a set of all matching waba_obs_ids) |
| `data/dbt/models/intermediate/int_provisional_waba_ids.sql` | Replace | New definition: project 166376 membership anti-join int_samples_base |
| `data/dbt/models/intermediate/int_combined.sql` ARM 2 | Edit | Source from new `int_provisional_waba_ids`; column projection must match plant-obs column set |
| `data/dbt/tests/test_no_duplicate_occ_ids.sql` | New | D-09 uniqueness guard |
| `data/dbt/models/intermediate/schema.yml` | Edit | Note the new `int_provisional_waba_ids` semantics |

### Affected files (documentation)

| File | Change Type | Notes |
|------|-------------|-------|
| `docs/domain-model.md` | New | D-07: human-first domain reference |
| `CLAUDE.md` | Edit | Link to `docs/domain-model.md` from Domain Vocabulary section |

### No affected files (frontend)

`src/occurrence.ts`, `src/filter.ts`, `src/filter.ts OCC_ID_SQL_CASE` — NO CHANGE. The occ_id priority order is unchanged. The `isProvisional()` function reads `row.is_provisional` which is still a boolean — no semantic change for the frontend. The column set is unchanged.

---

## Architecture Patterns

### New ARM 2 structure (plant/sample provisional observations)

```sql
-- New int_provisional_waba_ids: project-membership-based, anti-joined against int_samples_base
SELECT obs.id AS observation_id
FROM stg_inat__observations obs  -- wraps inaturalist_data.observations
JOIN inaturalist_data.observations__observation_projects op
    ON op.observation_uuid = obs.uuid
    AND op.project_id = 166376
WHERE obs.id NOT IN (SELECT observation_id FROM int_samples_base)
  AND obs.longitude IS NOT NULL
  AND obs.latitude IS NOT NULL
```

ARM 2 in `int_combined` would then join this back to `stg_inat__observations` to get coordinates, date, taxon for the new provisional row. Column projection for the new ARM 2:

| Column | Value |
|--------|-------|
| `ecdysis_id` | NULL |
| `observation_id` | the plant obs id (gives `inat:N` occ_id) |
| `specimen_observation_id` | NULL |
| `is_provisional` | TRUE |
| `canonical_name` | NULL (or the plant taxon__name — planner's discretion per D-08) |
| `source` | `'waba_sample'` (keep) or `'provisional'` (rename — planner's choice) |
| `specimen_inat_login`, `specimen_inat_taxon_name` | NULL |
| `image_url`, `obs_url`, `user_login`, `license` | NULL (plant obs in inaturalist_data don't carry these) |
| `host_inat_login` | the plant obs `user__login` |
| `lon`, `lat`, `date`, `year`, `month` | from the plant obs coordinates/date |

### Revised int_waba_link (D-05 fix)

```sql
-- Remove MIN() GROUP BY — return all WABA obs per catalog suffix
SELECT
    CAST(ofv.value AS BIGINT) AS catalog_suffix,
    waba.id AS specimen_observation_id        -- no MIN(), no GROUP BY
FROM stg_waba__observations waba
JOIN stg_waba__ofvs ofv ON ofv._dlt_root_id = waba._dlt_id
    AND ofv.field_id = 18116
    AND ofv.value != ''
```

`int_matched_waba_ids` remains the same SQL (join `int_waba_link` to `int_ecdysis_catalog_suffixes`), but now returns all matching waba_obs_ids, not just one per catalog number.

### occ_id uniqueness test (D-09)

Location: `data/dbt/tests/test_no_duplicate_occ_ids.sql`. Pattern: singular test (returns violating rows; 0 = PASS). See the SQL in Research Question 4 above.

Recommend `severity: warn` initially to avoid blocking builds on Shape C (OFV fan-out issue, out of scope). Escalate to error after Shape C is separately addressed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| occ_id uniqueness assertion | Custom Python assertion script | dbt singular test (established pattern: `data/dbt/tests/*.sql`) |
| Project membership lookup | New pipeline step | `inaturalist_data.observations__observation_projects` already populated by `projects_pipeline.py` |
| Column-expression uniqueness in dbt | Generic dbt `unique` test (can't apply to CASE expression) | Singular test — established project pattern in `data/dbt/tests/` |

---

## Common Pitfalls

### Pitfall 1: Removing MIN() fans out ARM 1 FULL OUTER JOIN
**What goes wrong:** `int_waba_link` currently produces 1 row per catalog_suffix (via `MIN()`). ARM 1 in `int_combined` joins `int_specimen_obs_base sob ON sob.waba_obs_id = e.specimen_observation_id` where `e.specimen_observation_id` comes from `int_ecdysis_base`. After removing `MIN()`, `int_waba_link` has multiple rows per catalog_suffix. If ARM 1 joins through this path, ARM 1 rows could fan out.
**Why it happens:** `int_waba_link` is used by `int_matched_waba_ids` which is used by `int_provisional_waba_ids`. ARM 1 joins `int_specimen_obs_base` on `e.specimen_observation_id` (from Ecdysis, not from WABA link). The fan-out risk is only in `int_matched_waba_ids`. With the fix, `int_matched_waba_ids` returns a set of `waba_obs_id` values — it's an ANTI-JOIN source in `int_provisional_waba_ids`. No fan-out.
**How to avoid:** After the fix, verify `int_matched_waba_ids` is only used as a filter set (WHERE waba.id NOT IN ...), not joined to carry columns.
**Warning signs:** ARM 2 row count increasing dramatically after fix.

### Pitfall 2: New ARM 2 column nulls cause downstream issues
**What goes wrong:** Current ARM 2 rows have `canonical_name`, `taxon_id`, `specimen_inat_login`, `specimen_inat_taxon_name` populated. New ARM 2 rows would have these NULL (plant images don't carry bee species data). Any query that expects `is_provisional=TRUE` rows to always have `canonical_name` would break.
**Why it happens:** `species.sql` reads from `int_combined` but filters on `canonical_name IS NOT NULL` implicitly (via joins). `int_species_occurrences_agg` reads directly from `ecdysis_data.occurrences`. Provisional rows with NULL canonical_name simply don't appear in species counts.
**How to avoid:** Verify `is_provisional=TRUE` rows are treated correctly in all mart queries that read `int_combined`. Specifically: `species.sql` → `int_species_universe.sql` → `int_species_occurrences_agg.sql` (reads Ecdysis directly, not int_combined — safe).

### Pitfall 3: The uniqueness test fires on Shape C (OFV fan-out)
**What goes wrong:** The new `test_no_duplicate_occ_ids.sql` detects `ecdysis:6317352` and `ecdysis:6317353` as duplicates (from the separate OFV fan-out bug). If `severity: error`, the dbt build fails.
**Why it happens:** `inaturalist_data.observations__ofvs` for obs 288589692 has 2 rows for `field_id=9963` (sample_id). `int_samples_base` LEFT-JOINs and fans out 2 rows per Ecdysis record.
**How to avoid:** Set the uniqueness test to `severity: warn` initially. Document in the test SQL that Shape C (OFV fan-out) is a known false positive until separately fixed.

### Pitfall 4: `stg_waba__observations.id` uniqueness test conflicts
**What goes wrong:** `data/dbt/models/staging/schema.yml` asserts `stg_waba__observations.id` is unique. After fixing `int_waba_link` to no longer use `MIN()`, the staging test still passes (stg_waba__observations really is unique per id). But the planner must not confuse this with `int_waba_link` returning multiple rows — the staging uniqueness is at the observation level, not the link level.
**How to avoid:** No action needed; clarify in PR description that staging uniqueness is undisturbed.

### Pitfall 5: ARM 2 `observation_id` collides with ARM 1 for the 33 new provisional rows
**What goes wrong:** If the 33 new provisional obs somehow also have a specimen_count OFV, they'd be in `int_samples_base` AND in the new ARM 2 → Shape B collision re-emerges.
**How it's avoided:** The new ARM 2 is defined as an ANTI-JOIN against `int_samples_base`. By construction, any obs in both would be excluded from ARM 2. The D-09 test catches this if the ANTI-JOIN is mis-implemented.

---

## Code Examples

### Collision confirmation query [VERIFIED: beeatlas.duckdb]

```sql
-- Run against data/beeatlas.duckdb to confirm collisions
WITH occ_ids AS (
    SELECT
        CASE
            WHEN ecdysis_id IS NOT NULL THEN 'ecdysis:' || ecdysis_id
            WHEN observation_id IS NOT NULL THEN 'inat:' || observation_id
            WHEN specimen_observation_id IS NOT NULL THEN 'inat_obs:' || specimen_observation_id
            WHEN checklist_id IS NOT NULL THEN 'checklist:' || checklist_id
        END AS occ_id,
        source
    FROM dbt_sandbox.int_combined
)
SELECT occ_id, COUNT(*) as cnt, STRING_AGG(source, ', ') as sources
FROM occ_ids WHERE occ_id IS NOT NULL
GROUP BY occ_id HAVING COUNT(*) > 1;
-- Returns 4 rows: inat_obs:320276469, ecdysis:6317353, inat:351027987, ecdysis:6317352
```

### Verify new ARM 2 population size [VERIFIED: beeatlas.duckdb]

```sql
SELECT COUNT(*)
FROM inaturalist_data.observations obs
JOIN inaturalist_data.observations__observation_projects op ON op.observation_uuid = obs.uuid
LEFT JOIN dbt_sandbox.int_samples_base s ON s.observation_id = obs.id
WHERE op.project_id = 166376 AND s.observation_id IS NULL
AND obs.longitude IS NOT NULL AND obs.latitude IS NOT NULL;
-- Returns 28 (mappable provisional rows)
```

### Verify D-05 fix scope [VERIFIED: beeatlas.duckdb]

```sql
-- Count WABA obs that have matching Ecdysis catalog suffix but are currently unmatched
SELECT COUNT(DISTINCT waba.id)
FROM inaturalist_waba_data.observations waba
JOIN inaturalist_waba_data.observations__ofvs ofv ON ofv._dlt_root_id = waba._dlt_id
    AND ofv.field_id = 18116 AND ofv.value != ''
JOIN dbt_sandbox.int_ecdysis_catalog_suffixes ecs
    ON ecs.catalog_suffix = CAST(ofv.value AS BIGINT)
WHERE waba.id NOT IN (SELECT waba_obs_id FROM dbt_sandbox.int_matched_waba_ids);
-- Returns 1 (obs 320276469 is the only case today)
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (dbt) | dbt-core 1.10.1 / dbt-duckdb 1.10.1 (via `bash data/dbt/run.sh build`) |
| Framework (Python) | pytest via `uv run pytest` in `data/` |
| Framework (frontend) | Vitest 4.1.8 via `npm test` |
| Quick run (dbt) | `bash data/dbt/run.sh build --select int_combined+ int_provisional_waba_ids int_waba_link int_matched_waba_ids` |
| Full suite | `bash data/dbt/run.sh build && cd data && uv run pytest -x` |

### Phase Requirements → Test Map

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|--------------|
| No duplicate occ_ids in int_combined | dbt singular test | `bash data/dbt/run.sh test --select test_no_duplicate_occ_ids` | No — Wave 0 |
| ARM 2 no longer contains waba_sample bee-specimen rows | dbt SQL assertion | `bash data/dbt/run.sh build --select int_combined` + manual verify | — |
| obs 320276469 moves from provisional to matched | dbt query / manual | `duckdb data/beeatlas.duckdb -c "SELECT * FROM dbt_sandbox.int_matched_waba_ids WHERE waba_obs_id=320276469"` | — |
| occurrence_places (occ_id, place_slug) both not null | dbt schema test (existing) | `bash data/dbt/run.sh test --select occurrence_places` | Yes |
| occIdFromRow priority unchanged | Vitest unit test | `npm test -- src/tests/occurrence.test.ts` | Yes |
| dbt contract (36 cols) still passes | dbt contract | `bash data/dbt/run.sh build` | Yes |
| domain-model.md exists and links from CLAUDE.md | manual check | grep CLAUDE.md | No — Wave 0 |

### Wave 0 Gaps

- [ ] `data/dbt/tests/test_no_duplicate_occ_ids.sql` — covers D-09 (uniqueness guard); must be created before the dbt model changes
- [ ] Review existing `src/tests/occurrence.test.ts` — currently tests `provisionalRow()` with `observation_id=NULL`; after D-03 the new provisional rows will have `observation_id` set. The `occIdFromRow` test for `provisionalRow()` returns `null` (because `observation_id=NULL`). After the fix, provisional rows have `observation_id != NULL`, so they'd get `inat:N` occ_id, not `null`. The existing test fixture `provisionalRow()` sets `observation_id=null` — this remains valid as a test case, but a new test case should cover a provisional row WITH `observation_id` set (new ARM 2 behavior). Consider adding: `test('returns inat:N for a provisional row that has observation_id', () => { expect(occIdFromRow({ ...BASE_ROW, observation_id: 351027987, is_provisional: true })).toBe('inat:351027987') })`.

---

## Open Questions (RESOLVED)

> **All three resolved by the CONTEXT.md three-category refinement (D-10..D-13), 2026-06-24.**
> The "accept the regression / no frontend change" recommendation below is **SUPERSEDED**:
> the 33 specimens are KEPT as a new `source='waba_specimen'` arm (`is_provisional=FALSE`),
> which makes this a frontend change too. Specifically:
> - **Q1 → KEEP + DOCUMENT.** The 33 are not dropped; they become category 2 (`waba_specimen`),
>   and the pipeline-lag state is documented in `docs/domain-model.md` (D-06/D-10).
> - **Q2 → NEW VALUE.** `source` for the bee specimens = `waba_specimen` (D-12); `waba_sample`
>   is reserved for provisional plant/sample project members only (D-11).
> - **Q3 → OUT OF SCOPE.** Shape C (OFV fan-out) stays out of scope; the D-09 test is
>   `severity: warn` so it does not block the build (note it for a backlog item).

1. **Should the 33 data-regressed bee specimens be noted in the domain model?**
   - What we know: 34 current ARM 2 specimens will be removed from int_combined under D-03. 33 have no Ecdysis match. They'll be invisible until Ecdysis upload catches up.
   - What's unclear: Should `docs/domain-model.md` mention this lag state ("bee specimens with WABA catalog field but no Ecdysis record are temporarily invisible in the pipeline")?
   - Recommendation: Yes, mention it as a known pipeline state to prevent future confusion.

2. **Source column value for new ARM 2 rows**
   - What we know: current `source='waba_sample'` refers to the WABA bee-specimen pipeline, which is wrong for new ARM 2 (plant obs from project 166376 pipeline)
   - What's unclear: rename to `'provisional'` or keep `'waba_sample'`?
   - Recommendation: Rename to `'waba_sample'` kept for backward compat with any existing filter tests on `source`. But planner should check if any frontend filtering uses `source='waba_sample'` — if so, it's a frontend change too.

3. **Shape C (OFV fan-out) scope**
   - What we know: `ecdysis:6317352` and `ecdysis:6317353` appear twice due to duplicate sample_id OFV in `inaturalist_data.observations__ofvs` for obs 288589692. This is a separate data quality bug.
   - What's unclear: Is this in or out of scope for Phase 165?
   - Recommendation: Out of scope per CONTEXT "fix the model" framing. D-09 test should use `severity: warn` to not block on this existing issue.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| DuckDB CLI | Local data inspection | Yes | via `duckdb` command | — |
| dbt-duckdb (via uvx) | `bash data/dbt/run.sh build` | Yes (via uvx) | 1.10.1 | — |
| Python 3.14 (data/) | `uv run pytest` | Yes | 3.14 (project) | — |
| Node.js (npm test) | Vitest frontend tests | Yes (via .nvmrc) | per .nvmrc | — |

---

## Sources

### Primary (HIGH confidence — verified against live data/code)
- `data/beeatlas.duckdb` — queried directly for all collision findings, row counts, and project membership
- `data/dbt/models/intermediate/int_combined.sql` — ARM definitions, column projections
- `data/dbt/models/intermediate/int_waba_link.sql` — `MIN()` bug location confirmed
- `data/dbt/models/intermediate/int_provisional_waba_ids.sql` — current definition
- `data/dbt/models/intermediate/int_matched_waba_ids.sql` — match path
- `data/dbt/models/intermediate/int_ecdysis_catalog_suffixes.sql` — suffix extraction logic
- `data/dbt/models/intermediate/int_specimen_obs_base.sql` — bee-obs projection
- `data/dbt/models/intermediate/int_samples_base.sql` — sample-obs projection (plant-images pipeline)
- `data/dbt/models/marts/occurrence_places.sql` — occ_id CASE expression (positional coupling)
- `data/dbt/models/marts/schema.yml` — 36-column contract, existing tests
- `data/dbt/models/staging/schema.yml` — existing staging uniqueness tests
- `data/dbt/models/staging/stg_waba__observations.sql` — confirms waba source
- `data/dbt/models/staging/stg_inat__observations.sql` — confirms inat source
- `data/dbt/macros/inat_field_ids.sql` — OFV field IDs (8338=specimen_count, 9963=sample_id, 18116=catalog_suffix, 1718=host_obs_url)
- `src/occurrence.ts` — occIdFromRow, isProvisional, isSampleOnly, isSpecimenBacked
- `src/filter.ts:108-114` — OCC_ID_SQL_CASE (positional coupling)
- `data/projects_pipeline.py` — project membership ingestion
- `data/waba_pipeline.py` — WABA source definition (field:WABA=)
- `data/inaturalist_pipeline.py` — project 166376 pipeline
- `data/.dlt/config.toml` — confirms project_id=166376
- `data/dbt/tests/` — singular test pattern confirmed
- `src/tests/occurrence.test.ts` — existing occIdFromRow test coverage
- `data/tests/test_dbt_diff.py` — integration gate logic and tolerances
- Project memories: `project_occurrences_contract_release_sequence.md`, `project_schema_validation.md`

---

## Metadata

**Confidence breakdown:**
- Root cause of 320276469 collision: HIGH — traced through int_waba_link MIN() logic, confirmed in DuckDB
- Root cause of 351027987 collision: HIGH — ARM1×ARM2 on observation_id, confirmed in DuckDB
- New ARM 2 population size (33/28): HIGH — direct DuckDB query
- D-05 fix scope (1 obs affected today): HIGH — direct DuckDB query
- Release sequencing (no SKIP_INTEGRATION_GATE needed): HIGH — data-only change, column count stable
- D-09 test form (singular test, severity:warn): HIGH — matches existing project test patterns
- Source column rename decision: LOW — planner's call (no clear project precedent found)

**Research date:** 2026-06-24
**Valid until:** 2026-07-24 (30 days — stable domain, dbt model shapes won't change independently)
