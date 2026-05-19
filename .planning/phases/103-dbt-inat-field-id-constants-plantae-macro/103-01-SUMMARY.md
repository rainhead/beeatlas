---
phase: 103-dbt-inat-field-id-constants-plantae-macro
plan: 01
subsystem: database
tags: [dbt, jinja2, macros, sql, refactor]

# Dependency graph
requires: []
provides:
  - "data/dbt/macros/inat_field_ids.sql — five named macros for iNat OFV field IDs and Plantae predicate"
  - "Four intermediate dbt models updated to use named macros instead of anonymous integer literals"
  - "Plantae CASE expression centralized into single is_plant_taxon(alias) macro"
affects:
  - "Any future intermediate model that joins on iNat OFV field IDs (use macros, not literals)"
  - "Future refactoring of staging model comments to reference macro names"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "dbt integer-constant macro: {% macro name() %}NNNN{% endmacro %} — body is bare literal on one line"
    - "dbt parameterized expression macro: trim markers {%- -%} suppress whitespace around CASE expression"
    - "Inter-macro comment convention: comments between macro blocks, never inside macro body"

key-files:
  created:
    - "data/dbt/macros/inat_field_ids.sql — five macros: inat_ofv_specimen_count, inat_ofv_sample_id, inat_ofv_catalog_suffix, inat_ofv_host_obs_url, is_plant_taxon"
  modified:
    - "data/dbt/models/intermediate/int_samples_base.sql — uses is_plant_taxon('op'), inat_ofv_specimen_count(), inat_ofv_sample_id()"
    - "data/dbt/models/intermediate/int_waba_link.sql — uses inat_ofv_catalog_suffix()"
    - "data/dbt/models/intermediate/int_combined.sql — uses inat_ofv_host_obs_url(); alias ofv1718 retained"
    - "data/dbt/models/intermediate/int_ecdysis_base.sql — uses is_plant_taxon('inat')"

key-decisions:
  - "All five macros in a single file (inat_field_ids.sql) for domain cohesion; dbt supports multi-macro files"
  - "Alias ofv1718 NOT renamed in int_combined.sql — cosmetic scope creep deferred per RESEARCH open questions"
  - "Staging model comments referencing field IDs left as-is — documentation only, not load-bearing SQL"
  - "test_dbt_diff.py row count mismatch (47,953 sandbox vs 47,876 public) is pre-existing nightly drift — same failure on unmodified main repo; behavioral parity confirmed by comparing worktree vs main repo sandbox (identical 47,953 rows)"

patterns-established:
  - "Integer-constant dbt macro: zero-arg macro with bare literal body; call site uses {{ macro_name() }} in JOIN conditions"
  - "Parameterized expression macro: single-arg with trim markers; call site omits column alias (alias assigned by consuming model)"

requirements-completed: [DBT-01, DBT-02]

# Metrics
duration: 5min
completed: 2026-05-18
---

# Phase 103 Plan 01: dbt iNat Field ID Constants & Plantae Macro Summary

**Named dbt macros replace four anonymous OFV field-ID integer literals (8338/9963/18116/1718) and a duplicated Plantae CASE expression across four intermediate models; dbt build PASS=46, behavioral parity confirmed**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-18T01:05:00Z
- **Completed:** 2026-05-18T01:09:55Z
- **Tasks:** 2 (1 with files, 1 verification-only)
- **Files modified:** 5

## Accomplishments

- Created `data/dbt/macros/inat_field_ids.sql` with five named Jinja2 macros replacing all anonymous OFV field-ID literals in intermediate models
- Eliminated the duplicated `CASE WHEN taxon__iconic_taxon_name = 'Plantae'` expression — now lives in exactly one file (`macros/inat_field_ids.sql`), consumed via `{{ is_plant_taxon('alias') }}` in two models
- `bash data/dbt/run.sh build` exits 0 with PASS=46 WARN=0 ERROR=0 after all SQL changes; behavioral parity confirmed by comparing worktree sandbox (47,953 rows) against pre-change main repo sandbox (47,953 rows) — identical

## Task Commits

Each task was committed atomically:

1. **Task 1: Author macros and substitute call sites in four intermediate models** - `349d99a` (refactor)
2. **Task 2: Regression gate — run dbt diff test** - (verification only, no commit — Task 1 commit covers all file changes)

**Plan metadata:** (committed below)

## Files Created/Modified

- `data/dbt/macros/inat_field_ids.sql` — New file: five macros (four integer-constant, one parameterized expression)
- `data/dbt/models/intermediate/int_samples_base.sql` — Three substitutions: is_plant_taxon('op'), inat_ofv_specimen_count(), inat_ofv_sample_id()
- `data/dbt/models/intermediate/int_waba_link.sql` — One substitution: inat_ofv_catalog_suffix()
- `data/dbt/models/intermediate/int_combined.sql` — One substitution: inat_ofv_host_obs_url(); alias ofv1718 retained
- `data/dbt/models/intermediate/int_ecdysis_base.sql` — One substitution: is_plant_taxon('inat')

## Decisions Made

- All five macros in a single file (`inat_field_ids.sql`) for domain cohesion — dbt supports multi-macro files, and grouping keeps the iNat OFV domain concept together
- Alias `ofv1718` NOT renamed in `int_combined.sql` — RESEARCH.md explicitly defers this cosmetic change as out of scope for DBT-01/DBT-02
- Staging model header comments that reference field IDs by number are documentation-only and left unchanged — RESEARCH open question resolved as out of scope

## Deviations from Plan

None — plan executed exactly as written. The `test_dbt_diff.py` failure documented under Issues Encountered is a pre-existing environment condition, not a deviation.

## Issues Encountered

**test_dbt_diff.py row count drift (pre-existing, not caused by this change):**
- `test_occurrences_row_count_matches` fails in both the worktree (with macros) and the unmodified main repo: sandbox=47,953 rows, public/data=47,876 rows
- Root cause: the production `beeatlas.duckdb` has been updated by nightly runs since the last public/data export; the diff test compares against a stale baseline
- Behavioral parity is conclusively confirmed: worktree sandbox and main repo sandbox both produce exactly 47,953 rows — the macro refactoring changes zero rows

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 103 requirements DBT-01 and DBT-02 are complete
- Anonymous integer literals no longer appear in any intermediate model JOIN condition
- The `is_plant_taxon` macro is the single authoritative home for the Plantae predicate
- Any future model needing these field IDs should use the macros in `data/dbt/macros/inat_field_ids.sql`
- The `test_dbt_diff.py` baseline drift should be resolved by the next nightly run that updates `public/data/`

---
*Phase: 103-dbt-inat-field-id-constants-plantae-macro*
*Completed: 2026-05-18*

## Self-Check: PASSED

- `data/dbt/macros/inat_field_ids.sql`: FOUND
- `data/dbt/models/intermediate/int_samples_base.sql`: FOUND (modified)
- `data/dbt/models/intermediate/int_waba_link.sql`: FOUND (modified)
- `data/dbt/models/intermediate/int_combined.sql`: FOUND (modified)
- `data/dbt/models/intermediate/int_ecdysis_base.sql`: FOUND (modified)
- Task 1 commit `349d99a`: VERIFIED
