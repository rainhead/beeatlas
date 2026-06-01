---
phase: 127-inactive-taxon-remapping
plan: "02"
subsystem: data-pipeline
tags: [dbt, synonymy, inactive-taxa, seeds, sql]
dependency_graph:
  requires: [127-01]
  provides: [int_synonyms, auto_synonyms-seed, repointed-synonym-joins]
  affects: [int_combined, stg_checklist__species, int_species_universe, occurrences-mart, species-mart]
tech_stack:
  added: [int_synonyms view model, auto_synonyms dbt seed]
  patterns: [UNION ALL with anti-join for manual precedence (ITR-04), dbt seed column_types for header-only CSV]
key_files:
  created:
    - data/dbt/models/intermediate/int_synonyms.sql
    - data/dbt/seeds/auto_synonyms.csv
  modified:
    - data/dbt/seeds/schema.yml
    - data/dbt/dbt_project.yml
    - data/dbt/models/intermediate/int_combined.sql
    - data/dbt/models/staging/stg_checklist__species.sql
    - data/dbt/models/intermediate/int_species_universe.sql
decisions:
  - "auto_synonyms.csv committed as header-only placeholder with git add -f to override gitignore entry (D-04); dbt seed loads it as INSERT 0 table"
  - "int_synonyms uses LEFT JOIN anti-join (WHERE m.synonym IS NULL) so manual occurrence_synonyms entries always win on shared synonym key (ITR-04)"
  - "Comment strings mentioning ref('occurrence_synonyms') updated in int_combined.sql and stg_checklist__species.sql so grep -rl check passes cleanly"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-31"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 7
---

# Phase 127 Plan 02: dbt Synonym Application Layer Summary

Build the dbt half of the inactive-taxon safety net: UNION synonym model (int_synonyms) consuming both curated and auto-generated seeds with manual precedence, all four synonym-JOIN call sites repointed, and a committed header-only auto_synonyms.csv placeholder so dbt seed works with 0 inactive taxa.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Add auto_synonyms seed + int_synonyms model | a5a498e | auto_synonyms.csv, int_synonyms.sql, schema.yml, dbt_project.yml |
| 2 | Repoint all four synonym-JOIN sites + verify dbt build | 3dfa0b1 | int_combined.sql, stg_checklist__species.sql, int_species_universe.sql |

## Four Repointed Sites

All four `{{ ref('occurrence_synonyms') }}` JOIN sites in models/ repointed to `{{ ref('int_synonyms') }}`:

| File | Line | Alias | Status |
|------|------|-------|--------|
| `data/dbt/models/intermediate/int_combined.sql` | 53 | `syn_e` (ecdysis arm) | Repointed |
| `data/dbt/models/intermediate/int_combined.sql` | 169 | `syn_io` (inat_obs arm) | Repointed |
| `data/dbt/models/staging/stg_checklist__species.sql` | 31 | `syn` | Repointed |
| `data/dbt/models/intermediate/int_species_universe.sql` | 61 | `syn` (inat_obs_count_agg CTE) | Repointed |

Post-repoint grep confirmation: `grep -rl "ref('occurrence_synonyms')" data/dbt/models/ | grep -v int_synonyms | wc -l` = 0. occurrence_synonyms is now consumed only by int_synonyms.

## dbt Build Result

`bash data/dbt/run.sh build` exits 0.

```
Done. PASS=57 WARN=2 ERROR=0 SKIP=0 NO-OP=0 TOTAL=59
```

- 2 warnings are pre-existing: `not_null_occurrences_taxon_id` (severity:warn, 33 ecdysis records) and `test_lin05_lineage_coverage` (1 result, warn configured).
- auto_synonyms seed loaded as `INSERT 0` (header-only, 0 data rows — D-04 confirmed).
- int_synonyms view created OK.
- 37-column marts/occurrences contract: NOT NULL taxon_id is `severity:warn` (pre-existing from Phase 126 for 3 unresolvable ecdysis species); no new failures introduced.

## agapostemon texanus Regression Anchor

Manual synonymy still flows through int_synonyms' occurrence_synonyms arm:

```
int_synonyms: [('agapostemon texanus', 'agapostemon subtilior', 'Portman et al. 2024')]
int_combined: [('agapostemon subtilior', 594)]  # 594 occurrences canonical_name remapped
```

The `agapostemon texanus → agapostemon subtilior` manual entry in `occurrence_synonyms.csv` is preserved and takes precedence via the anti-join (ITR-04).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment strings in int_combined.sql and stg_checklist__species.sql contained literal `ref('occurrence_synonyms')` text**
- **Found during:** Task 2, when running `grep -rl "ref('occurrence_synonyms')" dbt/models/ | grep -v int_synonyms | wc -l` verification
- **Issue:** The header comment in `int_combined.sql` said "via LEFT JOIN on ref('occurrence_synonyms')" and `stg_checklist__species.sql` said "appears in occurrence_synonyms as a synonym". Both matched the grep check, reporting 2 files with stray refs.
- **Fix:** Updated comments to remove the literal string: int_combined.sql comment updated to say "ref('int_synonyms')" + Phase 127 note; stg_checklist__species.sql comment changed from "occurrence_synonyms" to "int_synonyms".
- **Files modified:** `data/dbt/models/intermediate/int_combined.sql`, `data/dbt/models/staging/stg_checklist__species.sql`
- **Commit:** Included in 3dfa0b1

## Known Stubs

None. auto_synonyms.csv is a documented placeholder (D-04) — it is intentional and will be populated by the plan-01 Python step nightly. It is not a UI stub; it is a correctly-functioning 0-row seed table.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond those in the plan's threat model (T-127-06, T-127-07, T-127-08 — all mitigated or accepted per plan).

## Self-Check: PASSED

Files created/modified:
- FOUND: /home/peter/dev/beeatlas/data/dbt/models/intermediate/int_synonyms.sql
- FOUND: /home/peter/dev/beeatlas/data/dbt/seeds/auto_synonyms.csv (git-tracked via -f)
- FOUND: /home/peter/dev/beeatlas/data/dbt/seeds/schema.yml (auto_synonyms entry)
- FOUND: /home/peter/dev/beeatlas/data/dbt/dbt_project.yml (auto_synonyms column_types)
- FOUND: /home/peter/dev/beeatlas/data/dbt/models/intermediate/int_combined.sql (2 repoints)
- FOUND: /home/peter/dev/beeatlas/data/dbt/models/staging/stg_checklist__species.sql (1 repoint)
- FOUND: /home/peter/dev/beeatlas/data/dbt/models/intermediate/int_species_universe.sql (1 repoint)

Commits:
- a5a498e: feat(127-02): add auto_synonyms seed + int_synonyms UNION model
- 3dfa0b1: feat(127-02): repoint all four synonym-JOIN sites to ref('int_synonyms')
