---
phase: 085-pre-cutover-groundwork
plan: "04"
subsystem: database
tags: [dbt, duckdb, mart, contract, sqlite, frontend, clean-02]

requires:
  - 085-01
  - 085-02
  - 085-03
provides:
  - Enforced 30-column contract on the occurrences mart (schema.yml + occurrences.sql)
  - Frontend CREATE TABLE occurrences with 30-column declaration (sqlite.ts)
  - Schema gate (validate-schema.mjs) updated to 30-column EXPECTED list
  - test_dbt_diff.py docstring updated to 30 cols
affects:
  - Phase 86 (dbt Full Rewrite — int_specimen_obs_base / int_combined rewrite against narrowed contract)
  - Phase 88 cutover (public/data regeneration will resolve test_dbt_diff.py schema mismatch)

tech-stack:
  added: []
  patterns:
    - "Contract narrowing pattern: drop columns from mart SELECT + schema.yml contract + sqlite.ts loader + schema gate simultaneously to keep all column lists in sync"

key-files:
  created: []
  modified:
    - data/dbt/models/marts/schema.yml
    - data/dbt/models/marts/occurrences.sql
    - src/sqlite.ts
    - data/tests/test_dbt_diff.py
    - scripts/validate-schema.mjs

key-decisions:
  - "LANDMINE respected: specimen_inat_taxon_name preserved in all four files (sits between dropped columns in source order)"
  - "int_combined and int_specimen_obs_base NOT touched — intermediate models carry the dropped columns for Phase 86 rewrite"
  - "validate-schema.mjs updated (Rule 2 deviation) — EXPECTED list must match the new 30-column contract or the schema gate fails after public/data is regenerated"
  - "dbt build verified against main repo database (worktree DuckDB is stub); files copied temporarily, build run, files restored"
  - "test_dbt_diff.py::test_occurrences_schema_matches expected to fail until public/data/occurrences.parquet is regenerated (Phase 88 or cron run)"

patterns-established:
  - "Schema gate (validate-schema.mjs) EXPECTED list must be updated in lock-step with mart contract + sqlite.ts drops"

requirements-completed:
  - CLEAN-02

duration: 20min
completed: 2026-05-14
---

# Phase 085 Plan 04: CLEAN-02 — Drop 3 unused specimen_inat_* columns Summary

**Drop specimen_inat_login, specimen_inat_genus, specimen_inat_family from the mart contract (33 → 30 columns): schema.yml, occurrences.sql, sqlite.ts, validate-schema.mjs, and test_dbt_diff.py docstring all updated; dbt build exits 0 with PASS=33**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-05-14T01:23:00Z
- **Completed:** 2026-05-14T01:44:00Z
- **Tasks:** 3 auto + 1 integration verification
- **Files modified:** 5 (4 planned + 1 deviation)

## Accomplishments

- Removed `specimen_inat_login`, `specimen_inat_genus`, `specimen_inat_family` from `marts/schema.yml` contract (33 → 30 column entries)
- Removed same 3 columns from `marts/occurrences.sql` SELECT projection; `specimen_inat_taxon_name` and `specimen_inat_quality_grade` preserved (LANDMINE respected)
- Removed same 3 columns from `src/sqlite.ts` CREATE TABLE occurrences declaration (30 columns confirmed)
- Updated `scripts/validate-schema.mjs` EXPECTED list to match the new 30-column schema (Rule 2 deviation — critical for schema gate correctness)
- Updated `data/tests/test_dbt_diff.py` docstring: `33 cols` → `30 cols` and `33 columns` → `30 columns` (both occurrences)
- `dbt build` verified in main repo: **PASS=33, WARN=0, ERROR=0, SKIP=0**
- Sandbox `occurrences.parquet` confirmed at exactly 30 columns; drop list absent; preserve list present

## Lines Changed

**data/dbt/models/marts/schema.yml** — removed 6 lines (3 `- name:` + `data_type:` pairs):
```yaml
# Before (lines 57-64):
      - name: specimen_inat_login
        data_type: varchar
      - name: specimen_inat_taxon_name
        data_type: varchar
      - name: specimen_inat_genus
        data_type: varchar
      - name: specimen_inat_family
        data_type: varchar

# After:
      - name: specimen_inat_taxon_name
        data_type: varchar
```

**data/dbt/models/marts/occurrences.sql** — lines 76-77 replaced:
```sql
-- Before:
    j.specimen_inat_login, j.specimen_inat_taxon_name,
    j.specimen_inat_genus, j.specimen_inat_family, j.specimen_inat_quality_grade,

-- After:
    j.specimen_inat_taxon_name, j.specimen_inat_quality_grade,
```

**src/sqlite.ts** — lines 87-92 in CREATE TABLE occurrences, before/after:
```sql
-- Before:
    sample_host TEXT,
    specimen_inat_login TEXT,
    specimen_inat_taxon_name TEXT,
    specimen_inat_genus TEXT,
    specimen_inat_family TEXT,
    specimen_inat_quality_grade TEXT,

-- After:
    sample_host TEXT,
    specimen_inat_taxon_name TEXT,
    specimen_inat_quality_grade TEXT,
```

**scripts/validate-schema.mjs** — EXPECTED list for occurrences.parquet:
```js
// Before:
    'specimen_inat_login', 'specimen_inat_taxon_name',
    'specimen_inat_genus', 'specimen_inat_family', 'specimen_inat_quality_grade',

// After:
    'specimen_inat_taxon_name', 'specimen_inat_quality_grade',
```

**data/tests/test_dbt_diff.py** — docstring lines 53 and 56:
```python
# Before:
"""Column names AND types from DESCRIBE match exactly between sandbox and public (33 cols).
    Verified baseline: 33 columns with identical names and types in both files.

# After:
"""Column names AND types from DESCRIBE match exactly between sandbox and public (30 cols).
    Verified baseline: 30 columns with identical names and types in both files.
```

## Post-build Column List (30 names from DESCRIBE)

```
ecdysis_id, catalog_number, lon, lat, date, year, month, scientificName,
recordedBy, fieldNumber, genus, family, floralHost, host_observation_id,
inat_host, inat_quality_grade, modified, specimen_observation_id, elevation_m,
observation_id, host_inat_login, specimen_count, sample_id, sample_host,
specimen_inat_taxon_name, specimen_inat_quality_grade, is_provisional,
canonical_name, county, ecoregion_l3
```

## Verification Results

| Check | Result |
|-------|--------|
| `dbt build` exit code | 0 |
| dbt PASS count | 33 |
| dbt WARN count | 0 |
| dbt ERROR count | 0 |
| Sandbox parquet column count | 30 |
| specimen_inat_login absent | Yes |
| specimen_inat_genus absent | Yes |
| specimen_inat_family absent | Yes |
| specimen_inat_taxon_name present | Yes |
| specimen_inat_quality_grade present | Yes |
| npm test | 332 PASS, 2 pre-existing suite failures (unrelated) |
| test_dbt_diff.py::test_occurrences_schema_matches | FAIL (expected — see below) |
| test_dbt_diff.py syntax (python3 -m py_compile) | PASS |

## npm test Pre-Existing Failures

`npm test` shows 332 tests PASS, 4 skipped, and 2 suite-level failures that are pre-existing infrastructure limitations unrelated to this plan:

1. **`build-output.test.ts`** — Runs `npm run build` which calls `validate-schema.mjs`. With no local `public/data/`, it falls back to CloudFront. The CloudFront production `occurrences.parquet` does not yet have `canonical_name` (Phase 78 column, not yet deployed), so validation fails. This failure exists at the base commit and is not caused by Plan 04.

2. **`data-species.test.ts`** — Fails because `public/data/species.json` does not exist in the worktree. This is a worktree infrastructure limitation, not a regression.

## diff-harness Schema Test: Expected Failure

`test_dbt_diff.py::test_occurrences_schema_matches` fails when run against the current `public/data/occurrences.parquet` because that file still has 33 columns (including `specimen_inat_login`, `specimen_inat_genus`, `specimen_inat_family`). The sandbox now has 30 columns. The assertion `s_cols == p_cols` fails with:
```
Sandbox only: []
Public only:  [('specimen_inat_login', 'VARCHAR'), ('specimen_inat_genus', 'VARCHAR'), ('specimen_inat_family', 'VARCHAR')]
```

**This is expected and acknowledged in REQUIREMENTS.md.** The public/data regeneration is deferred to a future cron run or Phase 88 cutover. This is NOT a Phase 85 regression.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Drop 3 entries from marts/schema.yml contract | `697aded` | data/dbt/models/marts/schema.yml |
| 2 | Drop 3 columns from marts/occurrences.sql SELECT | `594b4b6` | data/dbt/models/marts/occurrences.sql |
| 3 | Drop columns from sqlite.ts + update diff harness docstring | `7641165` | src/sqlite.ts, data/tests/test_dbt_diff.py, scripts/validate-schema.mjs |

## Deviations from Plan

### Auto-added Critical Functionality

**1. [Rule 2 - Missing Critical] Added scripts/validate-schema.mjs to Task 3 commit**

- **Found during:** Task 3 verification
- **Issue:** `scripts/validate-schema.mjs` EXPECTED list for `occurrences.parquet` still referenced all 3 dropped columns (`specimen_inat_login`, `specimen_inat_genus`, `specimen_inat_family`). Once `public/data/occurrences.parquet` is regenerated with 30 columns (Phase 88 cutover or cron run), the schema gate would FAIL because it would expect columns that no longer exist.
- **Fix:** Removed the 3 dropped columns from the EXPECTED list; preserved `specimen_inat_taxon_name` and `specimen_inat_quality_grade`.
- **Files modified:** `scripts/validate-schema.mjs`
- **Commit:** `7641165` (included with Task 3)

## Phase 85 Roll-up

All four Phase 85 plans complete:

| Plan | Requirement | Status | Key Outcome |
|------|-------------|--------|-------------|
| 085-01 | TEST-01 | Closed | WHERE id IS NOT NULL added to stg_inat__observations; not_null + unique PASS |
| 085-02 | TEST-02 | Closed | ecdysis_id relationship test rewritten as generic macro; ERROR resolved |
| 085-03 | CLEAN-01 | Documented | generic_relationship macro documented in macros/schema.yml |
| 085-04 | CLEAN-02 | Closed | mart contract narrowed 33 → 30 columns; dbt build PASS=33 |

**Phase 85 exit state:** dbt build exits 0 with PASS=33, WARN=0, ERROR=0. The occurrences mart contract is 30 columns. Intermediate models (int_specimen_obs_base, int_combined) carry the dropped columns unchanged — Phase 86 will rewrite those. Ready for Phase 86.

---
*Phase: 085-pre-cutover-groundwork*
*Completed: 2026-05-14*
