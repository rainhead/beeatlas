# Phase 167: Collector Identity Column - Research

**Researched:** 2026-06-25
**Domain:** dbt data contract expansion, SQL COALESCE derivation, S3 release sequencing
**Confidence:** HIGH — every claim below is verified against actual files in the repo.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** COALESCE priority is `COALESCE(specimen_inat_login, host_inat_login, user_login)`.
- **D-02:** Derived column computed in `int_combined.sql` all 5 arms, then projected through `occurrences.sql` final SELECT, and added to `schema.yml` (36→37 columns).
- **D-03:** Per-arm source fields verified in `int_combined.sql` — see table in CONTEXT.md.
- **D-04:** NO `collector_identity.csv` seed. Stale v6.0 research docs propose one; ignore it.
- **D-05:** Hard-error dbt test (`severity: error`) asserting `collector_inat_login IS NOT NULL` for `source IN ('waba_sample','waba_specimen')`.
- **D-06:** Warn dbt test (`severity: warn`) on `source = 'ecdysis' AND collector_inat_login IS NULL`.
- **D-07:** Mechanism is dbt data tests in marts schema, not Python assertions.
- **D-08:** Data-before-code per `project_occurrences_contract_release_sequence`: schema.yml change → one-time `SKIP_INTEGRATION_GATE=1` nightly → column live in S3 → only then any consuming TypeScript.

### Claude's Discretion
- Exact dbt test file layout (singular test SQL vs. a `where`-scoped generic test) — planner's call, provided D-05/D-06 severities and predicates hold.
- Whether the warn-test baseline count is hard-coded as an expected threshold or just logged — planner's call.

### Deferred Ideas (OUT OF SCOPE)
- Per-collector page generation gating — Phase 169.
- Temporal lifecycle dates — Phase 168 (separate contract bump, separate nightly run).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IDENT-01 | Each occurrence carries `collector_inat_login` (COALESCE `specimen_inat_login > host_inat_login > user_login`), projected through `occurrences` mart (dbt contract bump 36→37, shipped data-before-code). | Verified: all three source fields exist in every `int_combined` arm; the mart SELECT and schema.yml need additive edits only; sqlite_export.py carries new columns through automatically. |
</phase_requirements>

---

## Summary

Phase 167 is a pure data-layer addition: one computed column (`collector_inat_login VARCHAR`) must appear in `int_combined.sql` (all five arms), be projected through `occurrences.sql`, and be declared in `schema.yml` (bumping the enforced contract from 36 to 37 columns). Two dbt data tests enforce correctness at build time: a hard-error `not_null` test scoped to the two WABA-named arms (`source IN ('waba_sample','waba_specimen')`), and a warn-severity test that surfaces the known ~2,767 unresolvable `ecdysis` NULLs as a drift metric.

No TypeScript, no seeds, no new pipeline steps. The only deployment wrinkle is the data-before-code S3 release sequence: the dbt-only commit ships first on the maderas cron host via a one-time `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh`, which breaks the nightly integration gate's schema-equality deadlock. After S3 carries the new column, the frontend deploy can then consume it safely (though that consumption is deferred to later phases).

sqlite_export.py requires no edits: it derives the `occurrences` SQLite table schema directly from `SELECT * FROM read_parquet(...)`, so the new parquet column flows through automatically. `_GEO_COLS` is unaffected (it names only the 8 geo-blob columns, none of which change).

**Primary recommendation:** Add `COALESCE(specimen_inat_login, host_inat_login, user_login) AS collector_inat_login` as the last field in each arm of `int_combined.sql`, add `j.collector_inat_login` to the `occurrences.sql` final SELECT, add the contract entry in `schema.yml`, add the two dbt tests, then run `bash data/dbt/run.sh build` to gate-check. Ship via the documented S3 release sequence.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Collector identity derivation | Database / dbt intermediate | — | COALESCE of three source fields lives at the `int_combined` UNION ALL layer where all inputs converge |
| Contract enforcement | Database / dbt mart | — | `schema.yml` enforced contract blocks a mis-typed column at `dbt build` time before any data is written |
| Build-time assertion | Database / dbt test | — | dbt data tests run as part of `bash data/dbt/run.sh build`; no Python layer needed (D-07) |
| SQLite carry-through | Database / sqlite_export.py | — | Schema-agnostic `SELECT *` from parquet means new column flows automatically |
| S3 publish | Deployment / nightly.sh | — | `SKIP_INTEGRATION_GATE=1` one-time bypass breaks the deadlock; subsequent runs pass unaided |

---

## Standard Stack

No new packages required. All work is within the existing dbt + DuckDB pipeline.

| Tool | Version pinned by | Purpose |
|------|------------------|---------|
| dbt-core | `run.sh` via `uvx --from dbt-core==1.10.1` | Contract enforcement, data tests, model builds |
| dbt-duckdb | `run.sh` via `--with dbt-duckdb==1.10.1` | DuckDB adapter for dbt |
| duckdb (Python) | `data/pyproject.toml` (uv) | sqlite_export.py, data pipeline |

[VERIFIED: data/dbt/run.sh lines 40-44] [VERIFIED: data/dbt/profiles.yml]

---

## Package Legitimacy Audit

No new packages are installed in this phase. Audit section is not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
iNat obs data / Ecdysis / WABA project / Checklist
        |
        v
int_specimen_obs_base  -->  specimen_inat_login
int_samples_base       -->  host_inat_login
stg_inat__observations -->  user_login
        |
        v
   int_combined.sql  (5-arm UNION ALL, materialized TABLE)
   COALESCE(specimen_inat_login, host_inat_login, user_login)
   AS collector_inat_login     <-- NEW column, added to all 5 arms
        |
        v
   occurrences.sql (final SELECT j.collector_inat_login)
        |
        +----> occurrences.parquet  (target/sandbox/, then EXPORT_DIR)
        |
        +----> sqlite_export.py   (SELECT * from parquet → SQLite)
               occurrences.db     (collector_inat_login column auto-carried)
        |
        v
   schema.yml  (contract: 36 → 37 columns; dbt tests for D-05/D-06)
        |
        v
   nightly.sh  SKIP_INTEGRATION_GATE=1  -->  S3  -->  CloudFront
```

### Recommended Project Structure

No structural changes — edits are confined to:
```
data/dbt/models/intermediate/int_combined.sql    # add COALESCE col to 5 arms
data/dbt/models/marts/occurrences.sql            # add j.collector_inat_login to final SELECT
data/dbt/models/marts/schema.yml                 # add column + two data tests (D-05, D-06)
```

---

## Exact Mechanics

### 1. dbt Contract Bump (36 → 37 columns) [VERIFIED: data/dbt/models/marts/schema.yml]

The file `/Users/rainhead/dev/beeatlas/data/dbt/models/marts/schema.yml` currently defines 36 columns for the `occurrences` model (confirmed by awk count: 36 entries matching `^\s*  - name:` between `name: occurrences` and `name: occurrence_places`).

The 36 columns in contract order are (lines 9–91):
`ecdysis_id, catalog_number, lon, lat, date, year, month, recordedBy, fieldNumber, floralHost, host_observation_id, inat_host, inat_quality_grade, modified, specimen_observation_id, elevation_m, observation_id, host_inat_login, specimen_count, sample_id, sample_host, specimen_inat_quality_grade, is_provisional, canonical_name, county, ecoregion_l3, source, image_url, obs_url, user_login, license, checklist_id, verbatim_name, locality, collapsed_count, taxon_id`

**Column ordering significance:** The dbt enforced contract (`enforced: true`) checks column names and data types but NOT positional order at the SQL level. However, `test_occurrences_schema_matches` in `data/tests/test_dbt_diff.py` compares the ordered `(column_name, data_type)` list from `DESCRIBE SELECT * FROM read_parquet(...)` — and DuckDB's parquet DESCRIBE reflects the SELECT column order in the model SQL, not the schema.yml order. Therefore the position of `collector_inat_login` in the schema.yml list must match the position it appears in the `occurrences.sql` final SELECT. The safe approach: append it as the 37th entry in schema.yml and append it at the end of the occurrences.sql SELECT (after `collapsed_count` and before or after `taxon_id`).

**Entry to add** (insert after the `taxon_id` entry at line 91 of schema.yml, or append before the `occurrence_places` model at line 93):
```yaml
      - name: collector_inat_login
        data_type: varchar
        data_tests:
          - not_null:
              config:
                severity: error
                where: "source in ('waba_sample', 'waba_specimen')"
          - not_null:
              config:
                severity: warn
                where: "source = 'ecdysis' and collector_inat_login is null"
```

**NOTE on the warn test:** The second `not_null` test above uses a double-negative (not_null where the value IS null), which means it tests for rows that are NULL AND would fire the `not_null` violation. The `where` clause in dbt not_null tests filters which rows the test checks — so `where: "source = 'ecdysis' and collector_inat_login is null"` would restrict the test to already-null rows, which are trivially all null. This logic is inverted. See the Pitfall section for the correct approach.

[VERIFIED: data/dbt/models/marts/schema.yml — line-by-line confirmed]

### 2. dbt Data Test Syntax [VERIFIED: data/dbt/models/marts/schema.yml lines 81-91]

**Existing repo pattern:** The only existing severity-scoped generic test in schema.yml is on `taxon_id` (lines 82–91):
```yaml
- not_null:
    config:
      severity: warn
      where: "canonical_name is not null and canonical_name <> '' and canonical_name not in ('anthidiellum robertsoni', 'lasioglossum aspilurus', 'osmia phaceliae')"
```
This is the canonical pattern in this repo: a `not_null` generic test with `config: where:` scoping inside the column's `data_tests` list.

**For D-05 (hard error, waba arms only):**
```yaml
- not_null:
    config:
      severity: error
      where: "source in ('waba_sample', 'waba_specimen')"
```
This fires as an ERROR if any row with `source in ('waba_sample','waba_specimen')` has a NULL `collector_inat_login`. The `where` clause restricts which rows the test inspects. [VERIFIED: matches the repo's only existing severity-scoped test at schema.yml:88-91]

**For D-06 (warn, ecdysis NULL count):**
The `not_null` generic test with `severity: warn` and `where: "source = 'ecdysis'"` is the correct mechanism:
```yaml
- not_null:
    config:
      severity: warn
      where: "source = 'ecdysis'"
```
This logs the count of ecdysis rows with NULL `collector_inat_login` as a WARNING. It does not block the build. The ~2,767 baseline is documented in CONTEXT.md; the test output surfaces the current count on each run.

**No `dbt_utils` package is installed.** There is no `packages.yml` in `data/dbt/`, no `dbt_packages/` directory. The repo uses only built-in generic tests (`not_null`, `unique`, `relationships`) plus singular SQL tests in `data/dbt/tests/`. `dbt_utils.expression_is_true` is NOT available.

**Singular SQL test alternative** (in `data/dbt/tests/`) — also valid, matches the `test_no_duplicate_occ_ids.sql` pattern:
```sql
{{ config(severity='error') }}
-- Singular dbt test: WABA-named arm rows must resolve collector_inat_login.
-- PASS semantics: returns 0 rows.
SELECT *
FROM {{ ref('occurrences') }}
WHERE source IN ('waba_sample', 'waba_specimen')
  AND collector_inat_login IS NULL
```

**Recommendation (planner's discretion):** The generic `not_null` with `config: where:` pattern is idiomatic for this repo (follows the `taxon_id` precedent), keeps the test co-located with the column declaration, and avoids an extra file. The planner may choose either form for D-05; D-06 similarly fits the generic form.

[VERIFIED: data/dbt/ — no packages.yml, no dbt_packages directory confirmed]

### 3. `int_combined.sql` — COALESCE Fields Available [VERIFIED: data/dbt/models/intermediate/int_combined.sql]

All three inputs to the COALESCE are present in every arm of `int_combined.sql`:

| ARM | Line(s) | `specimen_inat_login` | `host_inat_login` | `user_login` |
|-----|---------|----------------------|-------------------|-------------|
| ARM 1 `ecdysis` | 44, 53 | `sob.specimen_inat_login` (from `int_specimen_obs_base`) | `s.host_inat_login` (from `int_samples_base`) | `NULL AS user_login` |
| ARM 2 `waba_sample` | 102, 98, 110 | `NULL AS specimen_inat_login` | `obs.user__login AS host_inat_login` | `NULL AS user_login` |
| ARM 3 `waba_specimen` | 151, 147, 165 | `sob.specimen_inat_login` | `NULL AS host_inat_login` | `NULL AS user_login` |
| ARM 4 `inat_obs` | 236, 233, 244 | `NULL AS specimen_inat_login` | `NULL AS host_inat_login` | `io.user_login` |
| ARM 5 `checklist` | 297, 293, 305 | `NULL::VARCHAR AS specimen_inat_login` | `NULL::VARCHAR AS host_inat_login` | `NULL::VARCHAR AS user_login` |

The COALESCE expression for each arm (to be added as the last column before `'ecdysis' AS source`):
```sql
COALESCE(specimen_inat_login, host_inat_login, user_login) AS collector_inat_login
```
This is additive — no existing columns change.

**Expected COALESCE resolution per arm:**
- ARM 1 `ecdysis`: `specimen_inat_login` OR `host_inat_login` (whichever is non-null first). The 2,767 rows where both are NULL produce NULL `collector_inat_login` (expected; D-06 warns).
- ARM 2 `waba_sample`: `host_inat_login` (28 rows, all non-null per live count).
- ARM 3 `waba_specimen`: `specimen_inat_login` (33 rows, all non-null per live count).
- ARM 4 `inat_obs`: `user_login` (28,884 rows, all non-null per live count).
- ARM 5 `checklist`: `NULL` (19,929 rows; checklist excluded from identity by requirements scope).

**Important:** `specimen_inat_login` is NOT projected in the `occurrences.sql` final SELECT (confirmed by grep — no match). It is an intermediate field consumed inside `int_combined` for the COALESCE. The mart never exposes the raw field, only `collector_inat_login`. This is the existing pattern documented in CONTEXT.md §Established Patterns and confirmed by inspection. [VERIFIED: data/dbt/models/marts/occurrences.sql — no `specimen_inat_login` in final SELECT]

### 4. `occurrences.sql` Projection [VERIFIED: data/dbt/models/marts/occurrences.sql lines 74-94]

The current final SELECT (36 columns) reads from the `joined` CTE which is `SELECT ROW_NUMBER() OVER () AS _row_id, * FROM int_combined`. The `*` expands to all int_combined columns, so once `collector_inat_login` is added to int_combined, it is available in `joined` as `j.collector_inat_login`.

The executor must add `j.collector_inat_login` to the final SELECT. Logical insertion point: after `j.collapsed_count` (or after `j.taxon_id` — whichever appears last, to match the schema.yml ordering). The current final SELECT ends at line 89 with `j.collapsed_count`. Adding after that:
```sql
j.collapsed_count,
j.collector_inat_login
```
(The `taxon_id` currently follows `collapsed_count` in the SELECT — placing `collector_inat_login` after `taxon_id` as the 37th column is also valid, as long as the schema.yml order matches.)

### 5. `sqlite_export.py` Carry-Through [VERIFIED: data/sqlite_export.py lines 431-437]

sqlite_export.py creates the `occurrences` SQLite table with:
```python
con.execute(
    f"CREATE TABLE out.occurrences AS SELECT * FROM read_parquet('{src_parquet}')"
)
```
This is a schema-agnostic `SELECT *` — the SQLite table schema is derived entirely from the parquet file. No hardcoded column list. **No edit to sqlite_export.py is required.** The new `collector_inat_login` column in `occurrences.parquet` flows through automatically.

`_GEO_COLS` (lines 477-479) is the only explicit column list in the file:
```python
_GEO_COLS = [
    "lat", "lon", "ecdysis_id", "observation_id", "specimen_observation_id",
    "year", "source", "checklist_id",
]
```
`collector_inat_login` is not in this list, nor should it be. The geo_blob serialization is unchanged.

The `_assert_no_orphan_taxon_ids` function (lines 317-401) checks `taxon_id` only, not collector fields. No change needed there either.

[VERIFIED: data/sqlite_export.py — entire file read]

### 6. Data-Before-Code S3 Release Sequence [VERIFIED: data/nightly.sh, memory files]

**The two deadlocking gates:**

1. **Nightly integration gate** — `data/tests/test_dbt_diff.py::test_occurrences_schema_matches` (marked `@integration`, run by `data/nightly.sh` lines 250-258 before the S3 upload). It does strict ordered `(column_name, data_type)` equality between the fresh sandbox parquet and the currently-live S3 parquet. After the schema.yml change, the sandbox has 37 columns, but S3 still has 36 → `INTEGRATION GATE FAILED — aborting publish`. The gate blocks the very publish that would refresh S3.

2. **Deploy validate-db gate** — `scripts/validate-db.mjs` reads `public/data/manifest.json` (pulled from S3) and checks that `occurrences_db_tables` contains `['geo_blob', 'occurrences', 'occurrence_places']`. For THIS phase, no new tables are added to occurrences.db, so the `validate-db` gate does NOT deadlock — it only checks for required tables, not column counts. The deploy-side deadlock only applies when adding/removing tables, not columns.

**Conclusion for Phase 167:** Only gate 1 (nightly integration) deadlocks. Gate 2 (deploy validate-db) is not affected because this phase adds only a column, not a new table.

**Release sequence:**
1. Commit the dbt changes (int_combined.sql + occurrences.sql + schema.yml).
2. On the maderas cron host, run ONE publish with the bypass:
   ```bash
   SKIP_INTEGRATION_GATE=1 bash data/nightly.sh
   ```
   If the Ecdysis auth issue (Phase 163) is also active:
   ```bash
   ECDYSIS_CACHE_TTL_SECONDS=99999999 SKIP_INTEGRATION_GATE=1 bash data/nightly.sh
   ```
3. Verify the new `occurrences.parquet` (37 columns) is live in S3 by checking manifest or inspecting the parquet directly.
4. On the next normal nightly run, the gate compares 37-vs-37 and passes.
5. No deploy action is needed in this phase — no TypeScript consumes `collector_inat_login` yet.

**What the executor runs LOCALLY vs. what happens on maderas:**
- Locally: `bash data/dbt/run.sh build` — this is the dbt contract gate. It must exit 0 with the new column before the change is committed. The local beeatlas.duckdb is used.
- Locally: `cd data && uv run python sqlite_export.py` — regenerates `public/data/occurrences.db` for local UAT. Uses `data/dbt/target/sandbox/occurrences.parquet`. The Ecdysis auth gate blocks a full `uv run python run.py` locally (see memory `project_local_uat_stale_occurrences_db`), but `sqlite_export.py` standalone works as long as the parquet is fresh from `run.sh build`.
- On maderas: `bash data/nightly.sh` (with `SKIP_INTEGRATION_GATE=1` for the one-time publish).

[VERIFIED: data/nightly.sh lines 250-258, scripts/validate-db.mjs, data/tests/test_dbt_diff.py lines 112-140, memory files]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-column severity gating | Custom Python assertion | dbt `not_null` with `config: where:` | Already the pattern for `taxon_id`; runs in the existing `dbt build` gate |
| Schema-agnostic SQLite export | Hardcoded column list | `SELECT * FROM read_parquet(...)` | Already implemented in sqlite_export.py; self-updating |
| S3 publish after schema change | Manual file copy | `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` | Documented pattern; handles DuckDB backup, manifest, CloudFront invalidation |

---

## Common Pitfalls

### Pitfall 1: Incorrect `where` predicate on the D-06 warn test
**What goes wrong:** Writing `where: "source = 'ecdysis' and collector_inat_login is null"` passes the already-null rows into the `not_null` test, which trivially triggers on all of them. The test becomes a tautology rather than a drift detector.
**Why it happens:** The `where` clause in dbt generic tests restricts which rows are tested, not which rows are expected to pass. `not_null` fails on NULL values; filtering to NULL rows means 100% of the tested rows fail on every run — useless as a baseline drift signal.
**How to avoid:** The correct D-06 predicate is `where: "source = 'ecdysis'"` — test all ecdysis rows for non-null. The ~2,767 NULLs in the test output are the drift metric.
**Warning signs:** If the D-06 test immediately shows a count equal to the total ecdysis row count, the predicate is wrong.

### Pitfall 2: Forgetting `collector_inat_login` in the occurrences.sql final SELECT
**What goes wrong:** Adding the column to int_combined and schema.yml but not to occurrences.sql produces a dbt contract binder error: the mart SELECT doesn't emit the column the contract expects.
**Why it happens:** `int_combined` uses `SELECT *` in `joined`, so the column is available as `j.collector_inat_login`, but occurrences.sql uses explicit column names in the final SELECT (not `j.*`).
**How to avoid:** Edit both files in the same task. The final SELECT in occurrences.sql (lines 75-89) is the authoritative column list.

### Pitfall 3: Column order mismatch between schema.yml and occurrences.sql SELECT
**What goes wrong:** `test_occurrences_schema_matches` in test_dbt_diff.py compares the ORDERED list of `(column_name, data_type)` pairs from DESCRIBE. If schema.yml lists `collector_inat_login` at position N but the SELECT emits it at position M, the test can fail with a false schema mismatch.
**Why it happens:** DuckDB's DESCRIBE reflects SELECT column order, not schema.yml order.
**How to avoid:** Append `collector_inat_login` as the last column in BOTH schema.yml and the occurrences.sql SELECT, or ensure the appended positions match. Appending last in both is safest.

### Pitfall 4: Skipping the local `bash data/dbt/run.sh build` gate before committing
**What goes wrong:** The enforced contract catches type mismatches and missing columns at compile time ("Binder Error"). Committing without running this gate risks a broken nightly.
**How to avoid:** Run `bash data/dbt/run.sh build` from the repo root and confirm `PASS=N ERROR=0` (where N increases by the two new tests) before committing.

### Pitfall 5: Combining the contract bump commit with a TypeScript consumer commit in one nightly
**What goes wrong:** If a TypeScript file reading `collector_inat_login` ships in the same nightly as the dbt contract change, the deploy `validate-db` gate could fire against a stale manifest.
**Why it happens:** The deploy pipeline reads from S3, not the local build. S3 lags by one nightly run after a contract change.
**How to avoid:** D-08 is locked — this phase is data-layer only. No TypeScript ships until Phase 169+. The sequence is enforced by the phase boundary.

### Pitfall 6: Running `uv run python run.py` locally to validate
**What goes wrong:** The full `run.py` pipeline calls the Ecdysis ingestion step first, which requires auth credentials not available locally (the auth-session bug in Phase 163 makes this worse). The pipeline exits at the ecdysis step before reaching dbt.
**How to avoid:** Validate locally with `bash data/dbt/run.sh build` only. To regenerate a local `occurrences.db`, run `cd data && uv run python sqlite_export.py` (standalone, requires the parquet from `run.sh build`). Do not run the full `run.py` locally per the `project_local_uat_stale_occurrences_db` memory.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework (data layer) | pytest + dbt data tests |
| Config file | `data/pyproject.toml` (pytest) + `data/dbt/dbt_project.yml` (dbt) |
| Quick run command | `bash data/dbt/run.sh build` (dbt contract + data tests) |
| Full suite command | `cd data && uv run pytest -x` (excludes `@integration` marks) |
| Integration gate | `cd data && uv run pytest -m integration -x --tb=short -q` (requires sandbox + public artifacts) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Notes |
|--------|----------|-----------|-------------------|-------|
| IDENT-01 — column exists | `occurrences.parquet` has `collector_inat_login VARCHAR` column | dbt contract | `bash data/dbt/run.sh build` | Contract `enforced: true` → Binder Error if missing |
| IDENT-01 — WABA arms non-null | `source in ('waba_sample','waba_specimen')` rows have non-null login | dbt data test (error) | `bash data/dbt/run.sh build` | D-05; hard-error stops nightly on regression |
| IDENT-01 — ecdysis NULL drift | `source='ecdysis'` NULL count logged (baseline ~2,767) | dbt data test (warn) | `bash data/dbt/run.sh build` | D-06; warn in build output, not blocking |
| IDENT-01 — sqlite carry-through | `occurrences.db` has `collector_inat_login` column | manual spot-check | `cd data && uv run python sqlite_export.py && uv run python3 -c "import sqlite3; c=sqlite3.connect('public/data/occurrences.db'); print([d[0] for d in c.execute('PRAGMA table_info(occurrences)')])"` | Automatic via SELECT * |
| IDENT-01 — schema parity (nightly) | Sandbox parquet schema matches live S3 schema | integration test | `cd data && uv run pytest data/tests/test_dbt_diff.py::test_occurrences_schema_matches -x` | Deadlocks first post-change nightly; resolved by SKIP_INTEGRATION_GATE |

### Sampling Rate
- **Per task commit:** `bash data/dbt/run.sh build`
- **After SKIP_INTEGRATION_GATE nightly:** `cd data && uv run pytest data/tests/test_dbt_diff.py -x` (against fresh S3 baseline)
- **Phase gate:** dbt build green + one SKIP_INTEGRATION_GATE nightly confirmed before close

### Wave 0 Gaps

None — existing test infrastructure (dbt contract, `test_dbt_diff.py`, dbt data tests) covers all requirements. New dbt data tests are created as part of the schema.yml edit (Wave 1), not pre-existing.

---

## Security Domain

This phase makes no changes to authentication, session handling, user input, or secrets. The `collector_inat_login` field is public data (derived from iNaturalist usernames already public on iNat). No ASVS categories apply.

---

## Runtime State Inventory

Not applicable — this is a data model addition (new computed column in an existing mart), not a rename or migration. No existing stored data uses the key `collector_inat_login`. Existing records simply gain a new column populated by the COALESCE derivation at next nightly build.

**Nothing found in category:** None — verified by inspection of int_combined.sql, occurrences.sql, sqlite_export.py, and schema.yml.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| uvx (dbt invocation) | `bash data/dbt/run.sh build` | ✓ (assumed on maderas and dev machine) | — | None — required |
| dbt-core 1.10.1 + dbt-duckdb 1.10.1 | All dbt operations | ✓ (uvx provisions on demand) | 1.10.1 pinned in run.sh | — |
| Python 3.13 (for uvx) | run.sh explicit `--python 3.13` | ✓ | 3.13.x | Python 3.14 breaks dbt-duckdb (mashumaro class-var) — do NOT use |
| AWS CLI + beeatlas profile | `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` | ✓ on maderas | — | Local dev skips nightly.sh entirely |

---

## State of the Art

No API or library migrations are relevant to this phase. The dbt `not_null` generic test with `config: where:` severity scoping has been the repo pattern since Phase 128 (TID-02).

---

## Assumptions Log

No claims in this research are `[ASSUMED]`. All mechanics were verified against actual repo files:

| # | Claim | Section | Verified via |
|---|-------|---------|-------------|
| — | 36 columns currently in occurrences contract | §Exact Mechanics §1 | `awk` count on schema.yml |
| — | `specimen_inat_login` absent from occurrences.sql final SELECT | §Exact Mechanics §3 | grep confirmed no match |
| — | sqlite_export.py uses `SELECT *` for occurrences table schema | §Exact Mechanics §5 | sqlite_export.py line 436 |
| — | No dbt_utils package installed | §Exact Mechanics §2 | no packages.yml, no dbt_packages/ dir |
| — | validate-db gate checks table names only, not column counts | §Exact Mechanics §6 | scripts/validate-db.mjs full read |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed. (It is empty above.)

---

## Open Questions

None — all mechanics are fully resolved from the existing codebase.

---

## Sources

### Primary (HIGH confidence)
- `data/dbt/models/intermediate/int_combined.sql` — all 5 arms verified for specimen_inat_login, host_inat_login, user_login field assignments
- `data/dbt/models/marts/occurrences.sql` — final SELECT column list confirmed (36 columns, no specimen_inat_login)
- `data/dbt/models/marts/schema.yml` — 36-column contract confirmed, existing test pattern (`taxon_id` not_null with severity/where) documented
- `data/sqlite_export.py` — `SELECT *` schema-agnostic parquet read confirmed (lines 436-437), `_GEO_COLS` list confirmed unchanged
- `data/nightly.sh` — `SKIP_INTEGRATION_GATE` mechanism confirmed (lines 250-258); S3 publish sequence verified
- `data/tests/test_dbt_diff.py` — `test_occurrences_schema_matches` confirmed as the integration gate (lines 113-140)
- `scripts/validate-db.mjs` — `REQUIRED_TABLES` check confirmed (tables only, not column counts)
- `data/dbt/run.sh` — dbt invocation via `uvx --python 3.13 --from dbt-core==1.10.1 --with dbt-duckdb==1.10.1` confirmed (lines 40-44)
- Memory `project_occurrences_contract_release_sequence` — release sequence steps verified against nightly.sh
- Memory `project_schema_validation` — local validation steps confirmed against actual files

### Secondary (MEDIUM confidence)
- CONTEXT.md per-arm live counts (waba_sample 28/0-null, waba_specimen 33/0-null, ecdysis 48801/2767-null, inat_obs 28884/0-null, checklist 19929/all-null) — operator-supplied from live DuckDB query 2026-06-24

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pinned in run.sh, no new packages
- Architecture: HIGH — verified against actual SQL files
- Pitfalls: HIGH — derived from existing test code and documented deadlock patterns
- Release sequence: HIGH — verified against nightly.sh and both gate scripts

**Research date:** 2026-06-25
**Valid until:** 2026-09-01 (stable codebase; only invalidated by contract changes to occurrences.sql or schema.yml)
