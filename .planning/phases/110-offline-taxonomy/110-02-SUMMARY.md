---
phase: 110-offline-taxonomy
plan: "02"
subsystem: data-pipeline
tags: [python, dbt, duckdb, taxa, offline-taxonomy]

requires:
  - phase: 110-01
    provides: [taxa_pipeline.download_taxa_csv, taxa_pipeline.load_taxon_lineage_extended]

provides:
  - "Deleted enrich_taxon_lineage_extended from inaturalist_pipeline.py"
  - "Deleted enrich_taxon_lineage from waba_pipeline.py and its call site"
  - "run.py STEPS rewired: taxa-download + taxon-lineage-extended via taxa_pipeline"
  - "stg_waba__taxon_lineage.sql delegates to stg_inat__taxon_lineage_extended via ref()"
  - "sources.yml: inaturalist_waba_data.taxon_lineage source removed (D-02)"
  - "Dead HTTP-mock test files removed (test_taxon_lineage.py, test_taxon_lineage_extended.py)"

affects: [110-03, nightly-pipeline, dbt-models]

tech-stack:
  added: []
  patterns: [dbt-ref-staging-to-staging, offline-first-taxonomy]

key-files:
  created: []
  modified:
    - data/inaturalist_pipeline.py
    - data/waba_pipeline.py
    - data/run.py
    - data/taxa_pipeline.py
    - data/tests/conftest.py
    - data/dbt/models/staging/stg_waba__taxon_lineage.sql
    - data/dbt/models/sources.yml

key-decisions:
  - "D-01 implemented: stg_waba__taxon_lineage is now a 3-col view on stg_inat__taxon_lineage_extended (taxon_id, genus, family)"
  - "D-02 implemented: inaturalist_waba_data.taxon_lineage removed from sources.yml"
  - "run.py STEPS now has taxa-download before taxon-lineage-extended (two separate steps)"
  - "Dead test files deleted; test_taxa_pipeline.py from Plan 01 covers replacement logic"

requirements-completed: [TAX-03]

duration: 8min
completed: "2026-05-24"
---

# Phase 110 Plan 02: Offline Taxonomy Cutover Summary

**Deleted two live /v2/taxa enrichers and rewired run.py STEPS to the offline taxa_pipeline; stg_waba__taxon_lineage now delegates to stg_inat__taxon_lineage_extended via dbt ref() — TAX-03 satisfied, dbt build 44/44 green.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-24T17:15:00Z
- **Completed:** 2026-05-24T17:23:00Z
- **Tasks:** 2
- **Files modified:** 7 (2 deleted)

## Accomplishments

- Deleted `enrich_taxon_lineage_extended` (97 lines) from `inaturalist_pipeline.py` including the `TARGET_RANKS` constant
- Deleted `enrich_taxon_lineage` (52 lines) from `waba_pipeline.py` and removed its call site in `load_observations`
- Rewired `run.py` to import from `taxa_pipeline` and split the old single STEPS entry into two: `taxa-download` then `taxon-lineage-extended`
- Rewrote `stg_waba__taxon_lineage.sql` per D-01: `SELECT taxon_id, genus, family FROM ref('stg_inat__taxon_lineage_extended')`
- Removed `taxon_lineage` from `inaturalist_waba_data` source block in `sources.yml` per D-02
- Deleted `test_taxon_lineage.py` and `test_taxon_lineage_extended.py` (dead HTTP-mock suites)

## Task Commits

1. **Task 1: Rewrite dbt model + remove sources.yml entry (D-01, D-02)** - `80fb915` (feat)
2. **Task 2: Delete enrichers, rewire run.py, delete dead tests, prove green** - `b977084` (feat)

## Files Created/Modified

- `data/dbt/models/staging/stg_waba__taxon_lineage.sql` — Rewritten: 9 lines → 7 lines; source() → ref()
- `data/dbt/models/sources.yml` — Removed taxon_lineage from inaturalist_waba_data block; updated comment
- `data/inaturalist_pipeline.py` — Deleted TARGET_RANKS + enrich_taxon_lineage_extended (~98 lines removed)
- `data/waba_pipeline.py` — Deleted enrich_taxon_lineage + call site (~54 lines removed)
- `data/run.py` — Swapped import + split STEPS entry into two (net +1 line); updated docstring
- `data/taxa_pipeline.py` — Cleaned docstring references to deleted function name (cosmetic)
- `data/tests/conftest.py` — Cleaned comment referencing deleted function name (cosmetic)
- `data/tests/test_taxon_lineage_extended.py` — DELETED (780-line HTTP-mock suite)
- `data/tests/test_taxon_lineage.py` — DELETED (~150-line HTTP-mock suite)

## Decisions Made

- Cleaned comment references to `enrich_taxon_lineage` in `taxa_pipeline.py` docstrings and `conftest.py` to satisfy the literal grep acceptance criterion (zero matches under data/*.py).
- The `inaturalist_waba_data.taxon_lineage` table seeded in `conftest.py` lines 282-289 was retained — the fixture creates it explicitly for session-scoped tests; it is harmless and the PATTERNS.md explicitly noted it can remain.

## Deviations from Plan

None - plan executed exactly as written. The comment cleanup in `taxa_pipeline.py` and `conftest.py` was a minor additional step to meet the zero-matches acceptance criterion for `grep -rn "enrich_taxon_lineage" data/ --include='*.py'`.

## Issues Encountered

None. The `inaturalist_data.taxon_lineage_extended` table already existed in the local `beeatlas.duckdb` (2201 rows, populated during Plan 01 development), so the dbt build ran against real data without needing a fresh download.

Pre-existing test failures (unrelated to this plan):
- `test_dbt_diff.py`: 3 failures comparing stale sandbox vs public/data artifacts (require full nightly pipeline run with current data)
- `npm test`: 4 test files in other agent worktrees fail (build-output.test.ts and data-species.test.ts in `.claude/worktrees/agent-*`)

## Verification Results

| Gate | Result | Detail |
|------|--------|--------|
| `grep -rn "enrich_taxon_lineage" data/ --include='*.py'` | CLEAN | Zero matches |
| `grep -rn "inaturalist_waba_data.*taxon_lineage" data/dbt/` | CLEAN | Zero matches |
| `uv run pytest` | 134 passed, 3 failed (pre-existing) | All new tests pass |
| `bash data/dbt/run.sh build` | PASS=44 WARN=0 ERROR=0 | 6.48s |
| `npm test` | 1332 passed, 58 skipped, 4 files failed (pre-existing) | |

## Known Stubs

None.

## Threat Flags

None — no new network endpoints or trust boundary surfaces introduced.

## Self-Check: PASSED

- [x] `data/dbt/models/staging/stg_waba__taxon_lineage.sql` contains `ref('stg_inat__taxon_lineage_extended')`: CONFIRMED
- [x] `data/dbt/models/sources.yml` has no `taxon_lineage` under `inaturalist_waba_data`: CONFIRMED
- [x] `data/inaturalist_pipeline.py` has 0 matches for `def enrich_taxon_lineage_extended`: CONFIRMED
- [x] `data/waba_pipeline.py` has 0 matches for `def enrich_taxon_lineage`: CONFIRMED
- [x] `data/run.py` imports from `taxa_pipeline`: CONFIRMED
- [x] `data/tests/test_taxon_lineage_extended.py` does not exist: CONFIRMED
- [x] `data/tests/test_taxon_lineage.py` does not exist: CONFIRMED
- [x] Task 1 commit 80fb915: FOUND
- [x] Task 2 commit b977084: FOUND
- [x] dbt build: PASS=44, WARN=0, ERROR=0: CONFIRMED
- [x] pytest: 134 passed: CONFIRMED
- [x] npm test: 1332 passed: CONFIRMED
