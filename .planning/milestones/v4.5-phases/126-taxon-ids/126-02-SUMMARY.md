---
phase: 126-taxon-ids
plan: 02
subsystem: data-export
tags: [species_export, taxon_id, json, python, pytest]

requires:
  - phase: 126-taxon-ids
    plan: 01
    provides: taxon_id INTEGER in species.parquet (21 cols, 603 rows, 0 null)

provides:
  - taxon_id field in public/data/species.json (every species row, non-null integer)
  - public/data/higher_rank_taxon_ids.json (genus/subgenus/tribe name -> taxon_id lookup, rank-disambiguated)
  - Wave-0 test assertion: test_species_export.py::test_taxon_id guards species.json taxon_id
  - CLAUDE.md column-count note corrected to 37 (D-08)
  - test_dbt_diff.py docstrings corrected to 37/21/22-column

affects:
  - 126-03 (frontend templates need species.json taxon_id and higher_rank_taxon_ids.json for iNat links)

tech-stack:
  added: []
  patterns:
    - _build_higher_rank_taxon_ids(con) queries taxa.csv.gz with rank IN ('genus','subgenus','tribe') AND active=true; active is BOOLEAN not string
    - Rank filter resolves genus/subgenus name collision (Bombus appears in both; T-126-05 mitigation)
    - SPECIES_COLUMNS[:-1] slice naturally includes taxon_id because it precedes slug — no slice logic change
    - pyarrow schema uses pa.int32() for taxon_id (iNat IDs fit INT32 range)
    - _SPECIES_JSON_GUARD skipif(not SPECIES_JSON.exists()) pattern for test_species_export.py

key-files:
  created: []
  modified:
    - data/species_export.py
    - data/tests/test_species_export.py
    - data/tests/test_dbt_diff.py
    - CLAUDE.md

key-decisions:
  - "taxa.csv.gz active column is BOOLEAN (not string 'true'); filter uses active=true not active='true'"
  - "higher_rank_taxon_ids.json written to ASSETS_DIR (gitignored like species.json); committed via pipeline, not tracked in git"
  - "test_dbt_diff.py failures for occurrences.parquet/geojson diffs are pre-existing (require full pipeline run to populate public/data/); unrelated to this plan"

metrics:
  duration: 22min
  completed: 2026-05-31
---

# Phase 126 Plan 02: Species Export Taxon ID Passthrough Summary

**taxon_id added to SPECIES_COLUMNS + pyarrow schema in species_export.py (22 cols), higher_rank_taxon_ids.json built from taxa.csv.gz for genus/subgenus/tribe D-06 links, doc corrections applied**

## Performance

- **Duration:** 22 min
- **Started:** 2026-05-31T21:05:00Z
- **Completed:** 2026-05-31T21:27:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Wave-0 test `test_taxon_id` added to test_species_export.py with `_SPECIES_JSON_GUARD` skipif; confirms every species.json row carries a non-null integer `taxon_id` (TID-03)
- `'taxon_id'` inserted into `SPECIES_COLUMNS` between `'inat_obs_count'` and `'slug'` (22 entries total); `('taxon_id', pa.int32())` added to pyarrow schema
- `_build_higher_rank_taxon_ids(con)` queries `taxa.csv.gz` filtering `rank IN ('genus','subgenus','tribe') AND active=true`; returns rank-separated dict; serialized to `higher_rank_taxon_ids.json`
- `public/data/species.json` carries `taxon_id` (non-null integer) on all 603 species rows
- `public/data/higher_rank_taxon_ids.json` written: 141,490 genera, 6,799 subgenera, 6,041 tribes
- CLAUDE.md "30-column contract" note corrected to "37-column" (D-08)
- test_dbt_diff.py docstrings updated: occurrences "36 cols" → "37 cols"; species "18-column/19-column" → "21-column/22-column"
- All 26 task-relevant tests GREEN (test_species_export.py x4, test_dbt_scaffold.py x19, test_resolution_gate.py x2, plus test_dbt_diff.py species tests x3)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave-0 species.json taxon_id assertion** — `7ed1e8d` (test)
2. **Task 2: Add taxon_id column + higher-rank lookup to species_export.py** — `d512a21` (feat)
3. **Task 3: Correct stale doc + test docstrings (D-08)** — `b0f73d0` (docs)

## Files Created/Modified

- `data/tests/test_species_export.py` — Added `_SPECIES_JSON_GUARD` and `test_taxon_id` assertion; added `json` import
- `data/species_export.py` — `taxon_id` in SPECIES_COLUMNS (22 entries); pyarrow `pa.int32()` entry; `_build_higher_rank_taxon_ids(con)` helper; higher_rank_taxon_ids.json sidecar write with assert; docstrings updated from 21→22 col
- `data/tests/test_dbt_diff.py` — Docstring-only corrections: 36→37 (occurrences), 18/19→21/22 (species); no logic changes
- `CLAUDE.md` — "30-column contract on `marts/occurrences`" → "37-column contract"

## Decisions Made

- `taxa.csv.gz` `active` column is BOOLEAN (not string); DuckDB query uses `active = true` not `active = 'true'` — discovered by inspecting the schema before coding (deviation prevention)
- `higher_rank_taxon_ids.json` is gitignored (in `public/data/*` which is gitignored); consistent with `species.json` treatment; written by pipeline, not tracked in git
- Rank filter (not compound key) is sufficient to disambiguate the Bombus genus/subgenus collision (T-126-05); each rank dict holds only that rank's taxon_id

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] taxa.csv.gz active column is BOOLEAN, not string**
- **Found during:** Task 2 pre-implementation schema check
- **Issue:** PATTERNS.md shows `active = 'true'` (string comparison) but taxa.csv.gz stores `active` as BOOLEAN; DuckDB would return 0 rows with string comparison
- **Fix:** Used `active = true` (boolean) in `_build_higher_rank_taxon_ids` query
- **Files modified:** `data/species_export.py`
- **Verification:** Query returned 141,490 genera, 6,799 subgenera, 6,041 tribes — correct non-empty result

## Known Stubs

None — `taxon_id` flows end-to-end from dbt mart → species_export.py → species.json; `higher_rank_taxon_ids.json` is fully populated from taxa.csv.gz. Frontend template work (D-05, D-06) is in the next plan (126-03).

## Threat Flags

None — taxon_id and higher-rank IDs are public iNat integers (T-126-06: accepted). The rank filter correctly mitigates T-126-05 (genus/subgenus name collision).

## Self-Check

Files exist:
- `data/species_export.py`: contains `taxon_id` in SPECIES_COLUMNS + pa.int32() schema + _build_higher_rank_taxon_ids
- `data/tests/test_species_export.py`: contains test_taxon_id
- CLAUDE.md: contains "37-column contract"

Commits exist: `7ed1e8d`, `d512a21`, `b0f73d0`

## Self-Check: PASSED
