---
phase: 110-offline-taxonomy
reviewed: 2026-05-23T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - data/taxa_pipeline.py
  - data/tests/test_taxa_pipeline.py
  - data/.gitignore
  - data/inaturalist_pipeline.py
  - data/waba_pipeline.py
  - data/run.py
  - data/dbt/models/staging/stg_waba__taxon_lineage.sql
  - data/dbt/models/sources.yml
  - data/nightly.sh
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 110: Code Review Report

**Reviewed:** 2026-05-23T00:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Phase 110 replaces the live iNat `/v2/taxa` API enricher with an offline DuckDB ancestry walk over the iNaturalist Open Data `taxa.csv.gz` archive. The core logic in `taxa_pipeline.py` is sound: the ETag/Last-Modified conditional GET is correctly implemented, the atomic rename prevents partial files, and the SQL ancestry-walk correctly handles the `taxon_id = 630955` self-inclusion edge case and the `/630955/` anchored-slash false-positive guard.

One critical issue was found: a stale comment in `stg_inat__taxon_lineage_extended.sql` claims the table is written by the removed function `inaturalist_pipeline.enrich_taxon_lineage_extended`, which will mislead anyone tracing the data lineage. Three warnings cover: a healthcheck `curl` failure causing a false pipeline failure under `set -e`; a dead `taxa_db` pytest fixture; and dead seed data in `conftest.py` for the now-retired `inaturalist_waba_data.taxon_lineage` table. Three info items cover missing test coverage for the non-Anthophila exclusion, an `TAXA_PATH` env-var override gap, and a double-upload of taxa files on every successful run.

## Critical Issues

### CR-01: Stale data-lineage comment in `stg_inat__taxon_lineage_extended.sql`

**File:** `data/dbt/models/staging/stg_inat__taxon_lineage_extended.sql:2-3`
**Issue:** The header comment reads "Written by `data/inaturalist_pipeline.enrich_taxon_lineage_extended` (ingestion step — iNat API calls)." That function was removed in Phase 110. The table is now populated by `taxa_pipeline.load_taxon_lineage_extended`. Anyone tracing a lineage bug will follow the comment to a non-existent function, wasting significant time. The comment is the primary documentation for consumers of this view.
**Fix:**
```sql
-- Wraps source('inaturalist_data', 'taxon_lineage_extended').
-- Written by data/taxa_pipeline.load_taxon_lineage_extended (Phase 110 offline
-- taxonomy — offline ancestry walk over iNat Open Data taxa.csv.gz).
-- Columns: taxon_id (PK BIGINT), family, subfamily, tribe, genus, subgenus (VARCHAR).
-- Used by:
--   int_species_universe: LEFT JOIN on taxon_id for lineage backfill
--   test_lin05_lineage_coverage: coverage ratio assertion (PORT-03)
{{ config(materialized='view') }}

SELECT *
FROM {{ source('inaturalist_data', 'taxon_lineage_extended') }}
```

## Warnings

### WR-01: Healthcheck `curl` failure causes false pipeline failure under `set -e`

**File:** `data/nightly.sh:192`
**Issue:** `nightly.sh` runs with `set -euo pipefail` (line 27). The final line is:
```bash
[[ -n "$HEALTHCHECK_URL" ]] && curl -fsS --retry 3 --max-time 10 "$HEALTHCHECK_URL" > /dev/null
```
`curl -f` exits non-zero on HTTP 4xx/5xx; the bare `curl` invocation (without `|| true`) also exits non-zero on DNS failure, network timeout, or connection refused. With `--retry 3` the total wait before failure is up to ~30 seconds. If hc-ping.com is temporarily unreachable when the pipeline has already completed successfully, `set -e` propagates curl's exit code as the script's exit code. Cron receives a non-zero exit and may log/alert a pipeline failure that did not occur. The EXIT trap fires redundantly (DB and taxa files already uploaded) but the false-failure status is reported upstream.
**Fix:**
```bash
[[ -n "$HEALTHCHECK_URL" ]] && curl -fsS --retry 3 --max-time 10 "$HEALTHCHECK_URL" > /dev/null || true
```
The `|| true` ensures that a transient hc-ping.com outage does not pollute the pipeline's exit status.

### WR-02: Dead `taxa_db` fixture in `test_taxa_pipeline.py`

**File:** `data/tests/test_taxa_pipeline.py:57-71`
**Issue:** The `taxa_db` fixture (lines 57–71) is defined but never referenced by any test function in the file. All ancestry-walk tests (`test_lineage_schema`, `test_lineage_null_ranks`, `test_lineage_includes_self`) do their own inline setup rather than using this fixture. Dead fixtures create false confidence (readers assume coverage exists for the fixture's setup path) and add ongoing maintenance surface.
**Fix:** Remove the `taxa_db` fixture entirely. If a shared setup is desired in the future, re-introduce it then.

### WR-03: Dead `inaturalist_waba_data.taxon_lineage` table in `conftest.py`

**File:** `data/tests/conftest.py:111-114` and `data/tests/conftest.py:282-285`
**Issue:** `conftest.py` still creates and seeds the `inaturalist_waba_data.taxon_lineage` table (the old pre-Phase-110 WABA taxon lineage source). After Phase 110, `stg_waba__taxon_lineage` now delegates to `stg_inat__taxon_lineage_extended` and no dbt model references the WABA `taxon_lineage` table. The dead table and its seed rows persist in `conftest.py`, consuming schema-creation time on every test session and misleading future readers about what the data model contains.
**Fix:** Remove the `CREATE TABLE inaturalist_waba_data.taxon_lineage` block (lines 111–114) and the corresponding `INSERT INTO inaturalist_waba_data.taxon_lineage` seed (lines 282–285) from `conftest.py`.

## Info

### IN-01: No test asserts non-Anthophila rows are excluded from output

**File:** `data/tests/test_taxa_pipeline.py:37-38`
**Issue:** The mini TSV fixture includes a Vespa vulgaris row (taxon_id `52850`) with a comment "should be filtered OUT." None of the three ancestry-walk tests query for `taxon_id = 52850` or assert the total row count. If the `ancestry LIKE` filter were accidentally broken to `'%630955%'` (without anchoring slashes), Vespa would still be absent here because its ancestry doesn't contain `630955` at all — but the test gap means a regression in the taxon-ID anchoring (e.g., `1630955`) would not be caught by the dedicated exclusion fixture row.
**Fix:** Add an assertion in `test_lineage_null_ranks` or a dedicated test:
```python
vespa_row = con.execute(
    "SELECT taxon_id FROM inaturalist_data.taxon_lineage_extended WHERE taxon_id = 52850"
).fetchone()
assert vespa_row is None, "Vespa vulgaris must be filtered out of taxon_lineage_extended"
```

### IN-02: `TAXA_PATH` is not overridable via environment variable

**File:** `data/taxa_pipeline.py:23`
**Issue:** `DB_PATH` is env-driven (`os.environ.get("DB_PATH", ...)`), making it overridable at runtime. `TAXA_PATH` (line 23) and `TAXA_CACHE_PATH` (line 24) are module-level constants with no env-var override. `nightly.sh` aligns by keeping taxa files in `data/raw/`, but there is no documented way to redirect the archive download to a different path (e.g., for a different host or test environment) without editing the source. This is a design inconsistency with `DB_PATH`'s pattern and complicates future multi-host deployments.
**Fix:** Mirror the `DB_PATH` pattern:
```python
TAXA_PATH = Path(os.environ.get("TAXA_PATH", str(RAW_DIR / "taxa.csv.gz")))
TAXA_CACHE_PATH = Path(os.environ.get("TAXA_CACHE_PATH", str(RAW_DIR / "taxa_cache.json")))
```

### IN-03: Taxa files are uploaded twice to S3 on every successful run

**File:** `data/nightly.sh:85-96` and `data/nightly.sh:107-116`
**Issue:** The EXIT trap (lines 85–96) unconditionally uploads `taxa.csv.gz` and `taxa_cache.json` to S3 on every exit, including successful exits. After a normal successful run, these files have already been preserved from the prior run pull; the pipeline downloads them only if stale (304 fast-path). The trap re-uploads them even when unchanged, adding two S3 PUT operations to every run. This is not data-loss risk, but wastes time and money on every nightly run. The original intent of the trap was to preserve partial progress on failure.
**Fix:** Check the pipeline's exit code in the trap and skip the taxa upload on clean exit:
```bash
trap '
  _exit_code=$?
  if [[ -f "$DB_PATH" ]]; then
      echo "--- backing up DuckDB (trap) --- sha256=$(_hash "$DB_PATH")"
      aws --profile "$AWS_PROFILE" s3 cp --no-progress "$DB_PATH" "s3://$BUCKET/$DB_S3_KEY" || true
  fi
  if [[ $_exit_code -ne 0 ]]; then
    if [[ -f "$TAXA_PATH" ]]; then
        aws --profile "$AWS_PROFILE" s3 cp --no-progress "$TAXA_PATH" "s3://$BUCKET/$TAXA_S3_KEY" || true
    fi
    if [[ -f "$TAXA_CACHE_PATH" ]]; then
        aws --profile "$AWS_PROFILE" s3 cp --no-progress "$TAXA_CACHE_PATH" "s3://$BUCKET/$TAXA_CACHE_S3_KEY" || true
    fi
  fi
' EXIT
```
Alternatively, note that because taxa.csv.gz is content-addressed by ETag, re-uploading an identical file is harmless and the current approach is simpler. Leave as-is if the operational cost is acceptable.

---

_Reviewed: 2026-05-23T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
