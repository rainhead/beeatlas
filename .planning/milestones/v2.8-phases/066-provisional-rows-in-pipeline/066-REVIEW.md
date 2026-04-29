---
phase: 066-provisional-rows-in-pipeline
reviewed: 2026-04-20T21:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - data/export.py
  - data/tests/conftest.py
  - data/tests/test_export.py
  - data/waba_pipeline.py
  - scripts/validate-schema.mjs
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 066: Code Review Report

**Reviewed:** 2026-04-20
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Review covers the full provisional-row feature set: ARM 2 of the `combined` CTE in `export.py`,
the `enrich_taxon_lineage` function in `waba_pipeline.py`, the updated test fixtures in
`conftest.py`, the new provisional-row tests in `test_export.py`, and the schema gate in
`validate-schema.mjs`. The core logic — identifying unmatched WABA observations and emitting
`is_provisional=TRUE` rows joined to `taxon_lineage` for genus/family — is structurally sound
and the test suite exercises the happy path well.

Three warnings follow: a dangerous `NOT IN` / NULL trap in the provisional exclusion filter, a
missing `TRY_CAST` that can crash on a NULL `regexp_extract` result, and a missing assertion in a
test. Three info items cover `enrich_taxon_lineage` connection leak risk, a stale test comment,
and a fragile CloudFront error-detection pattern.

## Warnings

### WR-01: `NOT IN` with subquery that can contain NULLs drops all provisional rows silently

**File:** `data/export.py:131`

**Issue:** `provisional_waba_ids` filters with:
```sql
WHERE waba.id NOT IN (SELECT waba_obs_id FROM matched_waba_ids)
```
`waba_obs_id` is `MIN(waba.id)` from `waba_link`. In practice `waba.id` is always non-null, but
`waba_link` is a CTE that derives `specimen_observation_id` via an inner JOIN — if that join ever
produces zero rows for a group (impossible today but plausible after a schema change), `MIN()` on
an empty set returns `NULL`. A single NULL in the `NOT IN` subquery makes **every** comparison
evaluate to UNKNOWN, causing `provisional_waba_ids` to return zero rows and silently removing all
provisional observations from the export. There is no assertion or row-count check downstream that
would catch this.

**Fix:** Rewrite as `NOT EXISTS`, which is NULL-safe by construction:
```sql
provisional_waba_ids AS (
    SELECT waba.id AS waba_obs_id
    FROM inaturalist_waba_data.observations waba
    WHERE NOT EXISTS (
        SELECT 1 FROM matched_waba_ids m WHERE m.waba_obs_id = waba.id
    )
),
```

---

### WR-02: `CAST(regexp_extract(NULL, ...) AS BIGINT)` can raise instead of returning NULL

**File:** `data/export.py:171` and `data/export.py:188`

**Issue:** In ARM 2 of `combined`, `ofv1718` is a LEFT JOIN. When no OFV 1718 row exists,
`ofv1718.value` is NULL. `regexp_extract(NULL, '([0-9]+)$', 1)` returns an empty string `''` in
DuckDB, and `CAST('' AS BIGINT)` raises a conversion error rather than returning NULL. This means
a provisional WABA observation with no OFV 1718 (a legitimate case — the observation simply has
no linked iNat sample) will crash the entire export query.

The same expression appears twice: once as `host_observation_id` (line 171) and once in the LEFT
JOIN condition for `samples_base` (line 188).

**Fix:** Replace both `CAST(...)` with `TRY_CAST(...)`:
```sql
-- line 171
TRY_CAST(regexp_extract(ofv1718.value, '([0-9]+)$', 1) AS BIGINT) AS host_observation_id,

-- line 188
LEFT JOIN samples_base s
    ON s.observation_id = TRY_CAST(regexp_extract(ofv1718.value, '([0-9]+)$', 1) AS BIGINT)
```
`TRY_CAST` returns NULL on conversion failure, which is the correct semantics (no linked sample).

---

### WR-03: `test_occurrences_sample_only_nulls` does not assert on `family`

**File:** `data/tests/test_export.py:128`

**Issue:** The test name and SELECT statement promise to verify that sample-only rows have both
null `scientificName` **and** null `family`. The loop body only asserts `scientific_name is None`;
the fetched `family` value is silently discarded. ARM 2 (provisional rows) sets `genus` and
`family` from `specimen_inat_genus/family`, and a sample-only ARM 1 row (no ecdysis match) is
supposed to have null `family`. If a regression introduced a non-null `family` on sample-only
rows, this test would not catch it.

**Fix:**
```python
for scientific_name, family in rows:
    assert scientific_name is None, (
        f"Sample-only row should have null scientificName, got {scientific_name!r}"
    )
    assert family is None, (
        f"Sample-only row should have null family, got {family!r}"
    )
```

---

## Info

### IN-01: `enrich_taxon_lineage` leaves DB connection open on HTTP failure

**File:** `data/waba_pipeline.py:128-145`

**Issue:** The batch loop calls `resp.raise_for_status()` which can throw a
`requests.HTTPError`. If that happens mid-loop, execution exits the function immediately, leaving
the DuckDB connection `con` open (no `finally` block, no context manager). On some systems this
prevents subsequent connections to the same file path. More critically, the
`CREATE OR REPLACE TABLE` that rebuilds `taxon_lineage` is never executed, so the next
`export.py` run joins against stale data without any indication that the enrichment step failed.

**Fix:** Wrap the connection in a context manager or add a `try/finally`:
```python
try:
    # ... batch loop ...
finally:
    con.close()
```
Or raise the error to the caller from `load_observations` so the pipeline aborts rather than
proceeding to export with stale lineage data.

---

### IN-02: Stale row-count assertion comment in `test_occurrences_parquet_has_rows`

**File:** `data/tests/test_export.py:67`

**Issue:** The assertion message reads `"at least 2 rows (1 specimen-only + 1 sample-only)"`.
With the provisional-row fixture now seeded in `conftest.py`, the fixture DB produces three rows:
the matched ecdysis specimen, the unmatched iNat sample, and the unmatched provisional WABA
observation. The comment is stale and will mislead future maintainers.

**Fix:**
```python
assert total >= 3, (
    "occurrences.parquet should have at least 3 rows "
    "(1 ecdysis specimen, 1 iNat sample, 1 provisional WABA obs)"
)
```

---

### IN-03: CloudFront 403/404 detection in validate-schema.mjs uses fragile message-string regex

**File:** `scripts/validate-schema.mjs:62`

**Issue:** `!useLocal && /403|404/.test(e.message)` skips validation when the error message
string contains `"403"` or `"404"`. This is a soft skip (warning, not failure) but the pattern
is fragile: a message like `"Timed out after 404ms"` would match, suppressing a real network
error. Conversely, if `hyparquet` changes its error message format, legitimate 404s would start
hard-failing CI.

**Fix:** Tighten the regex to word-boundary match, or check a structured error property if
`hyparquet` exposes one:
```js
} else if (!useLocal && /\b(403|404)\b/.test(e.message)) {
```

---

_Reviewed: 2026-04-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
