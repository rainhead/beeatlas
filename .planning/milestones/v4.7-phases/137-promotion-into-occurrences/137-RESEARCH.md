# Phase 137: Promotion into Occurrences - Research

**Researched:** 2026-06-08
**Domain:** dbt UNION ALL promotion, DuckDB type alignment, SQLite geo_blob positional coupling, Vitest frontend decode
**Confidence:** HIGH — all findings from direct codebase inspection of live files

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** ARM 4 reads `int_checklist_dedup_status`. Filter: `WHERE dedup_status IS DISTINCT FROM 'confirmed'`.
- **D-02:** Belt-and-suspenders `AND lat IS NOT NULL AND lon IS NOT NULL` in ARM 4.
- **D-03:** New column `checklist_id INTEGER` = surviving `ObjectID` from `int_checklist_collapsed`.
- **D-04:** ARMs 1–3 each emit `NULL::INTEGER AS checklist_id`. `schema.yml` gets `checklist_id` as `data_type: integer`. Contract 33 → 34.
- **D-05 (minimal):** Add only `checklist_id` (34 columns). `collapsed_count` and other checklist-only provenance deferred to Phase 138.
- **D-06:** Checklist row populates lat, lon, year, month, recordedBy, canonical_name, taxon_id, source='checklist', checklist_id; `county`/`ecoregion_l3` via existing spatial join; `date` VARCHAR built at available precision from year/month/day + date_quality; all ecdysis/iNat/sample-specific columns NULL with correct casts.
- **D-07:** Retire `test_occurrences_row_count_not_inflated_by_checklist`; keep a re-baselined ceiling guard (raised to absorb ~10K checklist rows); add positive `source='checklist'` assertion; comment referencing v4.7 reversal.
- **D-08:** Append `checklist_id` to `_GEO_COLS` at index 7 (after `source`). Add `else if (checklist_id != null) occId = \`checklist:${checklist_id}\`` branch in `_buildGeoJSONFromRaw`. Single atomic commit covering both files + Vitest test.

### Claude's Discretion
All implementation decisions were delegated. The planner has full discretion on exact SQL for the `date` VARCHAR construction, NULL cast spellings, exact test text, new ceiling value, and Vitest fixture shape — subject to the derived defaults above.

### Deferred Ideas (OUT OF SCOPE)
- Per-source counts UI, detail-card rendering, checklist point styling — Phase 138.
- Surfacing `collapsed_count` into `occurrences.parquet` — Phase 138 if needed.
- Richer checklist provenance in contract (`verbatim_name`, `locality`, `family`, `date_quality`).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PRO-01 | Coord-bearing reconciled collapsed checklist records enter `int_combined`/`occurrences.parquet` as `source='checklist'`; dbt contract passes at new count; no-coord rows excluded | ARM 4 SQL pattern confirmed; type alignment enumerated below |
| PRO-02 | ARMs 1–3 emit correctly-typed NULL casts for `checklist_id`; UNION ALL type-aligns | Exact cast `NULL::INTEGER AS checklist_id` confirmed; column position is last (after `source`) |
| PRO-03 | Phase 111 isolation test explicitly retired with v4.7 comment; suite green | Test location confirmed: `test_dbt_scaffold.py` ~line 202; exact current text documented |
| PRO-04 | `occurrences.db` geo_blob carries checklist identity; `_GEO_COLS` and `features.ts` change atomically; Vitest decode test | Both files confirmed; existing `build-geojson.test.ts` provides fixture pattern to extend |
</phase_requirements>

---

## Summary

Phase 137 is a contained pipeline promotion with no new algorithms. All the hard work (dedup, coordinate validation, name reconciliation) happened in Phases 134–136. This phase threads a new `int_checklist_dedup_status` view into `int_combined` as ARM 4, adds one new INTEGER column (`checklist_id`) to the dbt contract, retires one pytest guard, and extends the geo_blob decode in lockstep between Python and TypeScript.

The two primary risk areas are (1) UNION ALL type alignment across all four ARMs — DuckDB enforces exact positional type matching, and a single mis-typed NULL cast causes a build failure — and (2) the positional coupling between `_GEO_COLS` in `sqlite_export.py` and the decode indices in `src/features.ts`, which must be changed in one atomic commit or silent data corruption results (wrong column values at wrong indices, no runtime error).

The existing `build-geojson.test.ts` Vitest test suite provides a working fixture factory (7-field `toRow` helper) that can be extended to an 8-field layout to validate the `checklist:<N>` occId path. The existing Phase 111 test at `test_dbt_scaffold.py:202` needs to be replaced, not deleted, with a comment and a new positive assertion.

**Primary recommendation:** Execute in two tasks — (1) dbt ARM 4 + schema contract + pytest retirement, (2) geo_blob + features.ts atomic commit + Vitest — with `bash data/dbt/run.sh build` as the gate between them.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| ARM 4 SQL (suppression filter, NULL casts, date VARCHAR) | dbt intermediate (`int_combined`) | — | int_combined is the UNION ALL assembly point; all ARM transforms belong here |
| dbt contract enforcement | dbt marts (`schema.yml` + `occurrences.sql`) | — | schema.yml with `contract: enforced: true` validates column count + types at build |
| Spatial join (county/ecoregion) | dbt marts (`occurrences.sql`) | — | Existing pipeline; checklist rows flow through unchanged |
| geo_blob serialization | Python (`sqlite_export.py`) | — | `_GEO_COLS` list controls column selection and positional encoding |
| occId decode | Frontend (`src/features.ts`) | — | `_buildGeoJSONFromRaw` decodes by index; must stay in sync with `_GEO_COLS` |
| Test retirement / positive assertion | data pytest (`test_dbt_scaffold.py`) | — | Integration-tier test guarded by `@pytest.mark.integration` |
| Vitest decode test | Frontend Vitest (`src/tests/`) | — | Unit test for `_buildGeoJSONFromRaw`; fast tier, no build artifact needed |

---

## Standard Stack

### Core (no new packages — all existing)

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| dbt-duckdb | (existing, Python 3.13 via uvx per `run.sh`) | SQL model compilation + contract enforcement | `bash data/dbt/run.sh build` |
| DuckDB | (existing) | UNION ALL execution, type checking | `NULL::INTEGER` is the correct DuckDB NULL cast syntax [VERIFIED: live code] |
| Vitest | ^4.1.2 | Frontend unit tests for `_buildGeoJSONFromRaw` | `npm test` or `npx vitest run src/tests/build-geojson.test.ts` |
| pytest | (existing, uv-managed) | Integration test for `occurrences.parquet` | Scoped per-file to avoid host SIGKILL |

**No new packages required.** [VERIFIED: direct codebase inspection]

### Package Legitimacy Audit

> This phase installs no new packages. Section not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
int_checklist_dedup_status (view, Phase 136 output)
  — cl.* + dedup_status
  — filtered: WHERE dedup_status IS DISTINCT FROM 'confirmed'
  — belt-and-suspenders: AND lat IS NOT NULL AND lon IS NOT NULL
         |
         v
int_combined (materialized TABLE)
  ARM 1: ecdysis       NULL::INTEGER AS checklist_id  (new cast)
  ARM 2: waba_sample   NULL::INTEGER AS checklist_id  (new cast)
  ARM 3: inat_obs      NULL::INTEGER AS checklist_id  (new cast)
  ARM 4: checklist     ObjectID      AS checklist_id  (new arm)
         |
         v
occurrences.sql (external parquet)
  — spatial join: county, ecoregion_l3, place_slug
  — final SELECT: 33 existing cols + checklist_id = 34 cols
  — drops: specimen_inat_login, specimen_inat_taxon_name (already excluded)
         |
         v
occurrences.parquet  →  sqlite_export.py
                            _GEO_COLS = [lat, lon, ecdysis_id, observation_id,
                                         specimen_observation_id, year, source,
                                         checklist_id]   ← append index 7
                            geo_blob (JSON array of positional tuples)
                                 |
                                 v
                            src/features.ts _buildGeoJSONFromRaw
                                 row[7] = checklist_id
                                 else if (checklist_id != null) occId = `checklist:${checklist_id}`
```

### Recommended Project Structure

No new files required. Modifications only:

```
data/dbt/models/intermediate/
  int_combined.sql         ← add ARM 4; add NULL::INTEGER AS checklist_id to ARMs 1–3
data/dbt/models/marts/
  schema.yml               ← add checklist_id column (data_type: integer) to occurrences
data/tests/
  test_dbt_scaffold.py     ← retire test_occurrences_row_count_not_inflated_by_checklist
data/sqlite_export.py      ← append checklist_id to _GEO_COLS (atomic with features.ts)
src/features.ts            ← add checklist_id decode + occId branch (atomic with export.py)
src/tests/
  build-geojson.test.ts    ← extend existing test with 8-field layout + checklist: path
```

### Pattern 1: UNION ALL NULL Cast (existing pattern, already in ARM 3)

ARM 3 already uses explicit typed NULL casts for source-specific columns:

```sql
-- Source: data/dbt/models/intermediate/int_combined.sql ARM 3
NULL                               AS ecdysis_id,
NULL                               AS catalog_number,
...
NULL::BIGINT                       AS host_observation_id,
NULL::INTEGER                      AS elevation_m,
NULL::BIGINT                       AS observation_id,
...
NULL::INTEGER                      AS sample_id,
```

The `NULL::INTEGER AS checklist_id` cast for ARMs 1–3 follows this exact shape. Untyped `NULL AS checklist_id` is insufficient — DuckDB infers the UNION's column type from the first non-null ARM and may fail or silently cast if ARM 4's INTEGER doesn't align.

### Pattern 2: ARM 4 SELECT column order

The canonical ARM 4 SELECT must emit columns in **the same positional order** as ARMs 1–3. The exact 33-column order from ARM 1 (confirmed by direct inspection) is: [VERIFIED: direct codebase inspection]

```
Position  Column                      ARM 4 value
1         ecdysis_id                  NULL::INTEGER
2         catalog_number              NULL::VARCHAR
3         lon                         cl.lon
4         lat                         cl.lat
5         date                        (built from year/month/day + date_quality — see Pitfall 2)
6         year                        cl.year                (BIGINT from source)
7         month                       cl.month               (BIGINT from source; NULL for year_only)
8         recordedBy                  cl.recordedBy          (VARCHAR)
9         fieldNumber                 NULL::VARCHAR
10        floralHost                  NULL::VARCHAR
11        host_observation_id         NULL::BIGINT
12        inat_host                   NULL::VARCHAR
13        inat_quality_grade          NULL::VARCHAR
14        modified                    NULL::VARCHAR
15        specimen_observation_id     NULL::BIGINT           (do NOT use for checklist_id)
16        elevation_m                 NULL::INTEGER
17        observation_id              NULL::BIGINT
18        host_inat_login             NULL::VARCHAR
19        specimen_count              NULL::INTEGER
20        sample_id                   NULL::INTEGER
21        sample_host                 NULL::VARCHAR
22        specimen_inat_login         NULL::VARCHAR
23        specimen_inat_taxon_name    NULL::VARCHAR
24        specimen_inat_quality_grade NULL::VARCHAR
25        is_provisional              FALSE::BOOLEAN
26        canonical_name              cl.canonical_name       (VARCHAR; already synonym-resolved)
27        taxon_id                    cl.taxon_id::INTEGER
28        image_url                   NULL::VARCHAR
29        obs_url                     NULL::VARCHAR
30        user_login                  NULL::VARCHAR
31        license                     NULL::VARCHAR
32        source                      'checklist'::VARCHAR
33+1      checklist_id                cl.ObjectID::INTEGER    (NEW)
```

**Critical note:** `checklist_id` is column 33 (position 33 + 1 = 34th) and must appear AFTER `source` in all four ARMs. [VERIFIED: direct codebase inspection]

**Also critical:** `specimen_inat_login` and `specimen_inat_taxon_name` ARE in `int_combined` (columns 22 and 23 above) but are intentionally **excluded** from `occurrences.sql`'s final SELECT. ARM 4 must still emit them (as NULL::VARCHAR) at the correct positions 22 and 23 so the UNION ALL aligns — `occurrences.sql` drops them in its SELECT list, not in `int_combined`. [VERIFIED: cross-checking int_combined.sql vs occurrences.sql]

### Pattern 3: date VARCHAR construction for checklist rows (D-06)

Checklist rows have `year` (BIGINT, may be NULL), `month` (BIGINT, NULL for year_only), `day` (BIGINT, NULL for year_only and month_only), and `date_quality` VARCHAR ('full' | 'year_only' | 'none').

The `date` column in `occurrences.parquet` is `VARCHAR`. ARMs 1–3 cast their date columns as `CAST(x AS VARCHAR)` or pass an already-string column. For ARM 4, build `date` at available precision:

```sql
CASE cl.date_quality
    WHEN 'full'      THEN printf('%04d-%02d-%02d', cl.year, cl.month, cl.day)
    WHEN 'year_only' THEN printf('%04d', cl.year)
    ELSE NULL
END AS date,
```

`date_quality = 'none'` (NULL dates) → NULL date VARCHAR. Year-only → `'YYYY'`. Full → `'YYYY-MM-DD'`. This is the only ARM where `date` can be NULL or year-only; downstream filters using `year`/`month` columns (not `date`) are unaffected.

### Pattern 4: geo_blob positional append (existing atomic-commit precedent)

The existing comment in `sqlite_export.py` at line 458 documents the prior atomic change (Phase 131 NORM-02: source moved index 9→6). The new change follows the same shape: [VERIFIED: direct codebase inspection]

```python
# Current (7 columns, positions 0-6):
_GEO_COLS = [
    "lat", "lon", "ecdysis_id", "observation_id", "specimen_observation_id",
    "year", "source",
]

# After (8 columns, positions 0-7):
_GEO_COLS = [
    "lat", "lon", "ecdysis_id", "observation_id", "specimen_observation_id",
    "year", "source", "checklist_id",
]
```

The `select_expr` construction at line 464 (`c if c in actual else f"NULL AS {c}"`) handles the case where `checklist_id` isn't in the SQLite schema — but since `checklist_id` is now a contract column in `occurrences.parquet`, it will be in the `occurrences` SQLite table automatically. [VERIFIED: direct codebase inspection]

### Pattern 5: features.ts occId decode extension

```typescript
// Source: src/features.ts _buildGeoJSONFromRaw (current lines 28-38)
// Current 7-field layout — checklist_id becomes row[7]:
const ecdysis_id = row[2];
const observation_id = row[3];
const specimen_observation_id = row[4];
const year = Number(row[5]);
const source = row[6] as string | null;
// ADD:
const checklist_id = row[7];

let occId: string | null = null;
if (ecdysis_id != null) occId = `ecdysis:${ecdysis_id}`;
else if (observation_id != null) occId = `inat:${observation_id}`;
else if (specimen_observation_id != null) occId = `inat_obs:${specimen_observation_id}`;
else if (checklist_id != null) occId = `checklist:${checklist_id}`;  // NEW
if (occId == null) continue;
```

The `else if` chain position is immaterial for checklist rows (the first three IDs are always NULL for ARM 4 rows). Appending last is cleanest and matches D-08. [VERIFIED: direct codebase inspection]

### Anti-Patterns to Avoid

- **Using `specimen_observation_id` to carry `checklist_id`:** That column is semantically an iNat WABA obs ID. Code in `bee-occurrence-detail.ts` uses it to construct iNat links. Reusing it for checklist would produce broken links (confirmed in existing ARCHITECTURE.md research).
- **Untyped `NULL AS checklist_id` in ARMs 1–3:** DuckDB UNION ALL requires type alignment. `NULL` without a cast is typed by inference; it may silently produce VARCHAR instead of INTEGER, causing the contract check to fail. Always `NULL::INTEGER AS checklist_id`.
- **Omitting `specimen_inat_login` and `specimen_inat_taxon_name` from ARM 4:** These columns exist in `int_combined` (positions 22, 23) but are excluded in `occurrences.sql`'s SELECT. ARM 4 must still emit them as `NULL::VARCHAR` at the correct UNION positions or the positional alignment breaks.
- **Splitting `_GEO_COLS` and `features.ts` into separate commits:** The positional coupling is untyped. A one-index slip puts `checklist_id` in the `source` slot and `source` in the `checklist_id` slot for every row, producing `undefined` occIds for all sources that currently decode from positions 2–4 (no, see below — actually existing positions 0-6 are unchanged; only a new position 7 is added). The failure mode is checklist rows being silently dropped (occId == null → `continue`) rather than corruption of existing rows, but the commit discipline is still required.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| County / ecoregion assignment for checklist points | Spatial join logic in ARM 4 | Existing `occurrences.sql` spatial join (ST_Within + fallback) | Checklist rows flow through unchanged once in `int_combined`; no special-casing needed |
| Column type alignment | Custom type-check script | DuckDB UNION ALL (enforced at build time) | `bash data/dbt/run.sh build` with `contract: enforced: true` in schema.yml is the authoritative gate |
| occId round-trip validation | Custom validator | Extend existing `build-geojson.test.ts` | All fixture machinery already exists; adding one checklist row variant is 5 lines |
| checklist_id uniqueness | Application-level dedup | `ObjectID` from `int_checklist_collapsed` | Phase 136 already ensures lowest-ObjectID survivors; ObjectID is a stable upstream PK |

**Key insight:** This phase is pure assembly — every mechanism exists already. The plan should describe file edits, not algorithm design.

---

## Common Pitfalls

### Pitfall 1: UNION ALL column count mismatch after adding checklist_id

**What goes wrong:** Adding `checklist_id` to ARM 4 without adding `NULL::INTEGER AS checklist_id` to ARMs 1–3 causes DuckDB to raise `UNION ALL requires the same number of columns`. Alternatively, adding it to ARMs 1–3 but at the wrong position (e.g. after `ecdysis_id` instead of after `source`) causes a type error because it no longer aligns with ARM 4's INTEGER column.

**Why it happens:** Each ARM's SELECT is edited independently; it's easy to add the NULL cast to ARMs 1 and 3 but forget ARM 2, or insert it in different positions per ARM.

**How to avoid:** Edit all four ARMs in a single pass of `int_combined.sql`. Verify column count parity: ARM 4 SELECT should list exactly 33 columns before `checklist_id`, matching ARMs 1–3. Use `dbt compile --select int_combined` to verify parse; `dbt build --select int_combined` to verify execution.

**Warning signs:** `dbt build` fails with `UNION ALL requires the same number of columns` or `Type mismatch on column 34: expected INTEGER, got VARCHAR`.

### Pitfall 2: date VARCHAR construction produces wrong types

**What goes wrong:** `int_combined` contract says `date: varchar`. If ARM 4 emits a DATE or TIMESTAMP type instead of a VARCHAR, DuckDB will fail the `contract: enforced: true` check. If ARM 4 emits NULL for `date_quality = 'full'` rows because the CASE expression has a bug, all fully-dated checklist records will have NULL dates.

**Why it happens:** `printf('%04d-%02d-%02d', year, month, day)` returns VARCHAR in DuckDB. But if `day` is NULL (shouldn't happen for `date_quality='full'` rows, but defensive coding matters), it returns NULL. Also: `date_quality` in the source uses lower-case values (`'full'`, `'year_only'`, `'none'`) — a CASE branch using `'FULL'` would never match.

**How to avoid:** Use lower-case CASE values to match the Python loader's output. Add `CAST(... AS VARCHAR)` around the CASE expression to be explicit. Verify with a spot-check: `SELECT date, date_quality, year, month, day FROM int_checklist_dedup_status LIMIT 20`.

**Warning signs:** `occurrences.parquet` has NULL dates for records you'd expect to have full dates. Contract build error `Type mismatch on column 5 (date): expected VARCHAR, got DATE`.

### Pitfall 3: year/month type mismatch (INTEGER vs BIGINT)

**What goes wrong:** The `occurrences` contract defines `year: bigint` and `month: bigint`. ARM 4's `year` and `month` come from `int_checklist_collapsed` → `checklist_records_full`, where they are declared `BIGINT` in the Python loader's `CREATE TABLE` statement. This should align. However, if any intermediate model casts them to `INTEGER` (e.g. `CAST(year AS INTEGER)`), the contract check fails.

**Why it happens:** It's tempting to mirror the `CAST(... AS INTEGER)` patterns seen in `int_ecdysis_base` for year/month. But those casts downcast from INTEGER input; the checklist source is already BIGINT. The UNION ALL's type resolution will upcast INTEGER to BIGINT if any ARM provides BIGINT, but an explicit downcast in ARM 4 would break the contract.

**How to avoid:** Pass `cl.year` and `cl.month` directly without casting. They are already BIGINT from the source. [VERIFIED: checklist_pipeline.py CREATE TABLE schema — `year BIGINT`, `month BIGINT`]

**Warning signs:** Contract build error `Type mismatch on column 6 (year): expected BIGINT, got INTEGER`.

### Pitfall 4: features.ts silently drops checklist rows (occId == null)

**What goes wrong:** A checklist row has NULL ecdysis_id, NULL observation_id, NULL specimen_observation_id, and non-null checklist_id. The current `_buildGeoJSONFromRaw` hits `if (occId == null) continue` and drops the row from the FeatureCollection with no error. After adding `checklist_id` to `_GEO_COLS` without updating `features.ts`, every checklist point is silently absent from the map.

**Why it happens:** The `_GEO_COLS` and `features.ts` changes are in different languages with no shared type contract. Changing one and not the other is the simplest mistake. The existing test `row where all three IDs are null → row is skipped` in `build-geojson.test.ts` would still PASS because checklist rows with checklist_id ARE dropped when checklist_id isn't read at row[7].

**How to avoid:** D-08 mandates a single atomic commit. The Vitest test covering `checklist:<N>` decode must be in the same commit, so CI fails if one file is changed without the other (the test will fail if features.ts isn't updated, or the test won't exist if only features.ts is changed).

**Warning signs:** `occurrences.db` has checklist rows (verified by SQL query), but map shows zero checklist points. `_buildGeoJSONFromRaw` returns a FeatureCollection with fewer features than `SELECT COUNT(*) FROM occurrences WHERE source='checklist'`.

### Pitfall 5: Phase 111 test left as skip instead of replaced

**What goes wrong:** The test `test_occurrences_row_count_not_inflated_by_checklist` is marked `@pytest.mark.skip` or commented out instead of replaced. PRO-03 requires explicit retirement with a comment and a positive assertion. A skipped test is invisible in CI; a future developer sees `SKIP` and doesn't know whether it was intentional or forgotten.

**Why it happens:** "Skip for now" is faster than writing the replacement test. The acceptance criterion says "explicitly retired" — this means the body of the function changes, not just a decorator.

**How to avoid:** Replace the test body entirely. The comment should say something like: "Retired v4.7 (Phase 137): checklist records now intentionally enter int_combined as source='checklist'. The Phase 111 isolation invariant (checklist exclusion) was reversed when coordinates were confirmed present. See STATE.md §Decisions."

**Warning signs:** `pytest data/tests/test_dbt_scaffold.py -v` shows `SKIPPED` for the old test. The positive `source='checklist'` assertion is absent.

### Pitfall 6: `date_quality='none'` rows appear in ARM 4 despite D-01 filter

**What goes wrong:** Rows with `date_quality='none'` (NULL dates, ~6,689 rows) are not suppressed by the `WHERE dedup_status IS DISTINCT FROM 'confirmed'` filter — they have NULL dedup_status (unreviewed/no candidate) and pass. These rows enter `occurrences.parquet` with NULL date, NULL year, NULL month, NULL canonical_name (if the record was also unresolvable). This is actually fine by design (D-06 explicitly allows NULL dates), but the plan must not inadvertently add a filter for `date_quality != 'none'` — doing so would silently drop ~15% of valid checklist points.

**Why it happens:** The WHERE clause in D-01 is specifically `WHERE dedup_status IS DISTINCT FROM 'confirmed'` plus `AND lat IS NOT NULL AND lon IS NOT NULL` — nothing else. Date-quality filtering is not in scope for Phase 137.

**How to avoid:** Do not add `AND date_quality != 'none'` or `AND year IS NOT NULL` to the ARM 4 filter. The contract allows NULL year/month/date for all sources.

---

## Code Examples

### Verified ARM 4 SELECT skeleton (confirmed column order)

```sql
-- Source: confirmed by inspecting int_combined.sql ARM 1–3 column order
-- ARM 4: Checklist records (Phase 137 / PRO-01)
-- Filter: dedup_status IS DISTINCT FROM 'confirmed' per int_checklist_dedup_status header
-- Belt-and-suspenders: lat/lon NOT NULL (already filtered upstream by coord_flag='valid')
SELECT
    NULL::INTEGER                          AS ecdysis_id,
    NULL::VARCHAR                          AS catalog_number,
    cl.lon,
    cl.lat,
    CAST(
        CASE cl.date_quality
            WHEN 'full'      THEN printf('%04d-%02d-%02d', cl.year, cl.month, cl.day)
            WHEN 'year_only' THEN printf('%04d', cl.year)
            ELSE NULL
        END
    AS VARCHAR)                            AS date,
    cl.year,
    cl.month,
    cl.recordedBy,
    NULL::VARCHAR                          AS fieldNumber,
    NULL::VARCHAR                          AS floralHost,
    NULL::BIGINT                           AS host_observation_id,
    NULL::VARCHAR                          AS inat_host,
    NULL::VARCHAR                          AS inat_quality_grade,
    NULL::VARCHAR                          AS modified,
    NULL::BIGINT                           AS specimen_observation_id,
    NULL::INTEGER                          AS elevation_m,
    NULL::BIGINT                           AS observation_id,
    NULL::VARCHAR                          AS host_inat_login,
    NULL::INTEGER                          AS specimen_count,
    NULL::INTEGER                          AS sample_id,
    NULL::VARCHAR                          AS sample_host,
    NULL::VARCHAR                          AS specimen_inat_login,
    NULL::VARCHAR                          AS specimen_inat_taxon_name,
    NULL::VARCHAR                          AS specimen_inat_quality_grade,
    FALSE::BOOLEAN                         AS is_provisional,
    cl.canonical_name,
    cl.taxon_id::INTEGER,
    NULL::VARCHAR                          AS image_url,
    NULL::VARCHAR                          AS obs_url,
    NULL::VARCHAR                          AS user_login,
    NULL::VARCHAR                          AS license,
    'checklist'::VARCHAR                   AS source,
    cl.ObjectID::INTEGER                   AS checklist_id
FROM {{ ref('int_checklist_dedup_status') }} cl
WHERE cl.dedup_status IS DISTINCT FROM 'confirmed'
  AND cl.lat IS NOT NULL
  AND cl.lon IS NOT NULL
```

### Verified schema.yml addition

```yaml
# Source: data/dbt/models/marts/schema.yml — add after the 'license' entry (position 32)
# before 'taxon_id', to maintain alphabetical-ish order. Or add after taxon_id.
# The contract enforces presence and type; order in schema.yml does not matter.
      - name: checklist_id
        data_type: integer
```

### Verified _GEO_COLS change

```python
# Source: data/sqlite_export.py lines 459-462 (confirmed by direct inspection)
_GEO_COLS = [
    "lat", "lon", "ecdysis_id", "observation_id", "specimen_observation_id",
    "year", "source", "checklist_id",  # checklist_id at index 7
]
```

Update the comment above (line 455-458) to read:
```python
# Column order: [lat, lon, ecdysis_id, observation_id, specimen_observation_id,
#                year, source, checklist_id]
# Phase 131 NORM-02: dropped scientificName, genus, family (~4 MB transfer-weight win).
# source moves from index 9 → 6; features.ts _buildGeoJSONFromRaw decode updated in same commit.
# Phase 137: checklist_id appended at index 7; features.ts updated in same commit (positional coupling).
```

### Verified build-geojson.test.ts extension

```typescript
// Source: src/tests/build-geojson.test.ts — extend existing RowOverride + toRow factory

// Updated RowOverride (add checklist_id):
interface RowOverride {
  lat?: number | null; lon?: number | null;
  ecdysis_id?: number | null; observation_id?: number | null;
  specimen_observation_id?: number | null;
  year?: number | null; source?: string | null;
  checklist_id?: number | null;  // NEW
}

// Updated toRow (8-field layout):
function toRow(r: Required<RowOverride>): unknown[] {
  return [r.lat, r.lon, r.ecdysis_id, r.observation_id, r.specimen_observation_id,
          r.year, r.source, r.checklist_id]; // checklist_id at index 7
}

// New factory:
function makeChecklistRow(overrides: RowOverride = {}): unknown[] {
  return toRow({ lat: 47.4, lon: -120.6, ecdysis_id: null, observation_id: null,
    specimen_observation_id: null, year: 1998, source: 'checklist',
    checklist_id: 7777, ...overrides });
}

// New tests to add inside describe('_buildGeoJSONFromRaw'):
it('checklist_id non-null → occId = "checklist:{id}"', () => {
  const row = makeChecklistRow({ checklist_id: 42 });
  const result = _buildGeoJSONFromRaw([row]);
  expect(result.geojson.features).toHaveLength(1);
  expect(result.geojson.features[0]!.properties.occId).toBe('checklist:42');
});

it('checklist row with all three IDs null + non-null checklist_id → not dropped', () => {
  const row = makeChecklistRow();
  const result = _buildGeoJSONFromRaw([row]);
  expect(result.geojson.features).toHaveLength(1);
});

it('checklist row with checklist_id null → row is skipped (all four IDs null)', () => {
  const row = makeChecklistRow({ checklist_id: null });
  const result = _buildGeoJSONFromRaw([row]);
  expect(result.geojson.features).toHaveLength(0);
});
```

**Important:** The existing tests in `build-geojson.test.ts` use 7-field `toRow` and 7-field `makeEcdysisRow` etc. They must ALL be updated to the 8-field layout (adding `checklist_id: null` to every existing factory call) or they will fail because `toRow` now expects 8 fields. The safest approach: add `checklist_id: null` as a default in all existing factory helper calls. [VERIFIED: direct inspection of build-geojson.test.ts]

---

## Runtime State Inventory

> Rename/refactor/migration phases only. Not applicable here — this is a greenfield promotion adding a new ARM. No string renames, no data migrations of existing records.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `bash data/dbt/run.sh build` | PRO-01, PRO-02 | ✓ | dbt-duckdb (uvx Python 3.13 pin) | — |
| `uv run pytest data/tests/test_dbt_scaffold.py` | PRO-03 | ✓ | (existing) | — |
| `npm test` (Vitest) | PRO-04 | ✓ | Vitest ^4.1.2 | — |
| `occurrences.parquet` (dbt build artifact) | PRO-03 integration test | Produced by build | — | Must run build first |

**Missing dependencies with no fallback:** None.

**Note on pytest scope:** Per project memory, the maderas orchestrator SIGKILLs long pytest runs. Run `uv run --project data pytest data/tests/test_dbt_scaffold.py -x` (scoped to that file only) — never `uv run --project data pytest` (whole suite) or `-m integration` across all files. [ASSUMED: memory says per-file fast tier; no test timer verified in this session]

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| dbt framework | `bash data/dbt/run.sh build` (enforces schema.yml contract) |
| Python test framework | pytest, `uv run --project data pytest data/tests/test_dbt_scaffold.py -x` |
| Frontend test framework | Vitest ^4.1.2, `npm test` or `npx vitest run src/tests/build-geojson.test.ts` |
| Quick dbt compile | `bash data/dbt/run.sh compile --select int_combined` (fast, no execution) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRO-01 | `occurrences.parquet` contains `source='checklist'` rows | integration | `uv run --project data pytest data/tests/test_dbt_scaffold.py::test_checklist_source_rows_present -x` | ❌ Wave 0 (new test) |
| PRO-01 | No-coord rows excluded (lat/lon IS NOT NULL in all checklist parquet rows) | integration | `uv run --project data pytest data/tests/test_dbt_scaffold.py::test_checklist_source_rows_present -x` | ❌ Wave 0 |
| PRO-01 | dbt contract test passes at 34 columns | build gate | `bash data/dbt/run.sh build` | ✅ (schema.yml contract enforced) |
| PRO-02 | `checklist_id` is NULL for non-checklist rows, integer for checklist rows | integration | Covered by PRO-01 test + dbt contract | ✅ (contract) |
| PRO-02 | dbt UNION ALL type-aligns | build gate | `bash data/dbt/run.sh build` | ✅ |
| PRO-03 | Old test retired with v4.7 comment | unit (static) | `uv run --project data pytest data/tests/test_dbt_scaffold.py -x` | ✅ (exists; body changes) |
| PRO-03 | New ceiling guard passes (raised threshold) | integration | `uv run --project data pytest data/tests/test_dbt_scaffold.py -x` | ❌ Wave 0 (replacement test body) |
| PRO-04 | `checklist:<N>` occId decoded correctly by `_buildGeoJSONFromRaw` | unit | `npx vitest run src/tests/build-geojson.test.ts` | ❌ Wave 0 (new test cases) |
| PRO-04 | Checklist rows not silently dropped when all three legacy IDs are null | unit | `npx vitest run src/tests/build-geojson.test.ts` | ❌ Wave 0 |

### Observable Signals per Requirement

**PRO-01 signals:**
1. `dbt build` exits 0 (contract passes)
2. `SELECT COUNT(*) FROM read_parquet('...occurrences.parquet') WHERE source='checklist'` returns > 0 (expect ~10K–46K depending on dedup state)
3. `SELECT COUNT(*) FROM read_parquet('...occurrences.parquet') WHERE source='checklist' AND (lat IS NULL OR lon IS NULL)` returns 0

**PRO-02 signals:**
1. `dbt build` exits 0 (type contract enforced)
2. `SELECT checklist_id, source FROM read_parquet('...occurrences.parquet') WHERE source != 'checklist' AND checklist_id IS NOT NULL LIMIT 1` returns 0 rows

**PRO-03 signals:**
1. `pytest data/tests/test_dbt_scaffold.py -v -x` shows NO `SKIPPED` for `test_occurrences_row_count_not_inflated_by_checklist`
2. `grep -n "v4.7\|Phase 137\|reversal" data/tests/test_dbt_scaffold.py` returns the comment line
3. `pytest data/tests/test_dbt_scaffold.py -v -x` is green (0 failures)

**PRO-04 signals:**
1. `npx vitest run src/tests/build-geojson.test.ts` exits 0 with all tests passing including new `checklist:` tests
2. After `sqlite_export.py` runs: `sqlite3 data/export/occurrences.db "SELECT COUNT(*) FROM json_each((SELECT json_parse(data) FROM geo_blob)) WHERE json_extract(value, '$[7]') IS NOT NULL"` returns count matching checklist rows
3. Browser smoke: checklist points appear on map (manual Phase 138 verification; not automated here)

### Sampling Rate

- **Per-task commit:** `npx vitest run src/tests/build-geojson.test.ts` (frontend task) OR `uv run --project data pytest data/tests/test_dbt_scaffold.py -x` (data task)
- **Per-wave merge:** `bash data/dbt/run.sh build` + `uv run --project data pytest data/tests/test_dbt_scaffold.py -x`
- **Phase gate:** Full `bash data/dbt/run.sh build` green + pytest file green + Vitest green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `data/tests/test_dbt_scaffold.py` — replace `test_occurrences_row_count_not_inflated_by_checklist` body; add `test_checklist_source_rows_present` positive assertion (PRO-01, PRO-03)
- [ ] `src/tests/build-geojson.test.ts` — extend `RowOverride`/`toRow` to 8-field layout; add `makeChecklistRow` factory; add three new `it` blocks for `checklist:<N>` decode, no-drop, and null-checklist_id-drops (PRO-04)

---

## Security Domain

> This phase adds new data rows to an existing pipeline. No new authentication, session management, or access control surfaces are introduced. The pipeline remains static-hosting-only.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Minimal | Coord/dedup filters already applied upstream; `lat IS NOT NULL AND lon IS NOT NULL` guard in ARM 4 |
| V6 Cryptography | No | — |
| All others | No | Static pipeline; no server runtime |

**No new threat surfaces introduced by this phase.**

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `pytest data/tests/test_dbt_scaffold.py -x` (scoped per-file) does not SIGKILL on maderas | Validation Architecture | If even this file is too slow, scope further to individual test functions |
| A2 | `date_quality` values in `checklist_records_full` are exactly `'full'`, `'year_only'`, `'none'` (lower-case) | Code Examples §date construction | Wrong case in CASE expression → all dates NULL; verify against Python loader output |

**If this table is empty after A1/A2:** Both are low-risk — A1 is standard practice per project memory; A2 is verified in the Python loader source (`return (dt.year, dt.month, dt.day, "full")` etc., lower-case confirmed).

---

## Open Questions (RESOLVED)

1. **What is the expected `source='checklist'` row count in `occurrences.parquet`?**
   - What we know: ~50,646 raw rows; ~4,595 excluded by `coord_flag='valid'` filter = ~46,051 stg rows; some collapsed by Phase 136 (the 5,184 internal dedup groups); `dedup_candidate_pairs.csv` currently has 0 rows → 0 confirmed suppressions
   - What's unclear: exact post-collapse count (Phase 136 materialized int_checklist_collapsed is available in beeatlas.duckdb if it's been run)
   - **RESOLVED:** The PRO-03 ceiling guard uses ~160,000 (current ~93K rows + ~46K checklist ≈ 140K, plus growth buffer) — do NOT hardcode a brittle exact value. Plan 137-01 instructs the executor to run `bash data/dbt/run.sh build` then `SELECT COUNT(*) FROM int_checklist_collapsed` against the rebuilt local DuckDB to confirm the figure before finalizing the ceiling. (Local DuckDB does not currently have the Phase 136 models materialized — the rebuild is a precondition.)

2. **Does `build-geojson.test.ts` need an update to `toRow` defaults or only new tests?**
   - What we know: All existing `makeEcdysisRow`, `makeInatRow`, `makeSpecimenObsRow` factories call `toRow` with 7 explicit fields; the interface is `Required<RowOverride>`, so adding `checklist_id` to `RowOverride` and making it required in `toRow` means all existing callsites must also pass `checklist_id`. If `checklist_id` is made optional in `RowOverride` but required in `toRow`, a default value of `null` can be provided in each existing factory.
   - What's unclear: Whether the implementer should make `checklist_id?: number | null` optional with `null` default, or required with `null` explicit in each factory call
   - **RESOLVED:** Plan 137-02 adopts the lowest-churn approach — make `checklist_id?: number | null` optional in `RowOverride` with a `null` default in `toRow`'s parameter spread, so existing 7-field factory callsites do not all need editing.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Checklist excluded from `int_combined` (Phase 111 lock) | Checklist promoted as ARM 4 | Phase 137 (this phase) | ~46K new points on the map; Phase 111 test retired |
| 7-field geo_blob `_GEO_COLS` | 8-field (checklist_id at index 7) | Phase 137 | Enables `checklist:<N>` occId decode |
| 33-column `occurrences` dbt contract | 34-column (+ checklist_id INTEGER) | Phase 137 | ARM type-alignment gate catches future regressions |

**Deprecated/outdated:**
- `test_occurrences_row_count_not_inflated_by_checklist`: The Phase 111 invariant ("checklist MUST NOT enter int_combined") is being reversed. The test body will change to a positive assertion with an updated ceiling.

---

## Sources

### Primary (HIGH confidence)

- `data/dbt/models/intermediate/int_combined.sql` — ARM 1/2/3 column order (32 columns), NULL cast patterns, UNION ALL structure
- `data/dbt/models/intermediate/int_checklist_dedup_status.sql` — Phase 136 output; documented Phase 137 consumption contract verbatim
- `data/dbt/models/intermediate/int_checklist_collapsed.sql` — ObjectID, collapsed_count, all available columns
- `data/dbt/models/marts/schema.yml` — 33-column enforced contract (exact column list + types extracted programmatically)
- `data/dbt/models/marts/occurrences.sql` — final SELECT (drops specimen_inat_login + specimen_inat_taxon_name; adds county/ecoregion_l3/place_slug)
- `data/sqlite_export.py` lines 459–472 — `_GEO_COLS` (7-field), positional encoding, atomic-commit comment
- `src/features.ts` lines 14–48 — `_buildGeoJSONFromRaw`, 7-field decode, occId chain, positional coupling comment
- `src/tests/build-geojson.test.ts` — existing Vitest fixture factory, test patterns
- `data/tests/test_dbt_scaffold.py` lines 196–219 — exact Phase 111 test to retire
- `data/checklist_pipeline.py` lines 335–491 — year/month/day BIGINT type confirmation, date_quality enum values
- `.planning/research/ARCHITECTURE.md` — column conformance table, anti-patterns (reuse specimen_observation_id)
- `.planning/phases/137-promotion-into-occurrences/137-CONTEXT.md` — all 8 derived defaults

### Secondary (MEDIUM confidence)

- `.planning/research/PITFALLS.md` — Pitfall 5 (contract drift), Pitfall 4 (silent NULL propagation)
- `src/filter.ts` lines 40–87 — `OccurrenceRow` interface (confirms `source` union type, OCCURRENCE_COLUMNS list)
- `src/occurrence.ts` — `occIdFromRow`, `parseOccId` (confirms existing prefix vocabulary)

---

## Metadata

**Confidence breakdown:**
- ARM 4 SQL pattern: HIGH — column order/types extracted directly from live SQL files
- Type alignment: HIGH — verified against schema.yml column list via Python parsing
- geo_blob/features.ts coupling: HIGH — both files read; atomic-commit precedent confirmed in comments
- Test locations: HIGH — test function names and line numbers confirmed by direct inspection
- Row count estimate: MEDIUM — depends on local DuckDB state (may be stale)

**Research date:** 2026-06-08
**Valid until:** This research is against committed code; valid until any of the referenced files change. Stable for this phase.
