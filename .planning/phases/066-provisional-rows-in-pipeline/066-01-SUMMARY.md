---
phase: 066-provisional-rows-in-pipeline
plan: 01
subsystem: pipeline
tags: [dlt, duckdb, inaturalist, waba, taxon-ancestors]

# Dependency graph
requires: []
provides:
  - "waba_pipeline.py DEFAULT_FIELDS includes taxon.ancestors.rank and taxon.ancestors.name"
  - "After pipeline run: inaturalist_waba_data.observations__taxon__ancestors child table exists"
affects:
  - 066-03  # export.py uses observations__taxon__ancestors for specimen_inat_genus and specimen_inat_family

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "dlt REST API DEFAULT_FIELDS string: dot-path for nested arrays triggers child table normalization"

key-files:
  created: []
  modified:
    - data/waba_pipeline.py

key-decisions:
  - "Insert taxon.ancestors.rank,taxon.ancestors.name before ofvs line in DEFAULT_FIELDS — preserves field ordering convention"

patterns-established:
  - "dlt child table for nested array: taxon.ancestors in DEFAULT_FIELDS creates observations__taxon__ancestors with _dlt_root_id, rank, name, _dlt_list_idx"

requirements-completed:
  - PROV-01

# Metrics
duration: 5min
completed: 2026-04-20
---

# Phase 66 Plan 01: Add taxon.ancestors to waba_pipeline.py DEFAULT_FIELDS

**`taxon.ancestors.rank,taxon.ancestors.name` added to waba_pipeline.py DEFAULT_FIELDS — after pipeline run, dlt will normalize taxon.ancestors array into observations__taxon__ancestors child table enabling genus/family export joins**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-20T15:52:39Z
- **Completed:** 2026-04-20T15:52:39Z
- **Tasks:** 1 of 2 (Task 2 is a checkpoint:human-action awaiting pipeline run)
- **Files modified:** 1

## Accomplishments

- Added `"taxon.ancestors.rank,taxon.ancestors.name,"` to `DEFAULT_FIELDS` in `data/waba_pipeline.py`, inserted immediately before the ofvs fields line
- This is the prerequisite for Plan 03 (export.py): the `observations__taxon__ancestors` child table only exists after a pipeline run with this field configuration
- Verified: one matching line at line 39, ancestors before ofvs at line 40, git diff shows exactly one insertion

## Task Commits

1. **Task 1: Add taxon.ancestors to DEFAULT_FIELDS** - `689c9f4` (feat)

## Files Created/Modified

- `data/waba_pipeline.py` — Added `taxon.ancestors.rank,taxon.ancestors.name` to DEFAULT_FIELDS string

## Decisions Made

None - followed plan as specified. Single-line insertion exactly per plan interface spec.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Checkpoint: Awaiting Pipeline Run (Task 2)

Task 2 is a `checkpoint:human-action`. The pipeline must be run manually to create the `inaturalist_waba_data.observations__taxon__ancestors` table in `data/beeatlas.duckdb`.

**Command to run:**
```bash
cd /Users/rainhead/dev/beeatlas && uv run --project data python data/waba_pipeline.py
```

**Verification after run:**
```bash
uv run --project data python -c "
import duckdb
c = duckdb.connect('data/beeatlas.duckdb')
count = c.execute('SELECT count(*) FROM inaturalist_waba_data.observations__taxon__ancestors').fetchone()[0]
print(f'observations__taxon__ancestors: {count} rows')
cols = c.execute('DESCRIBE inaturalist_waba_data.observations__taxon__ancestors').fetchall()
print('columns:', [r[0] for r in cols])
"
```

Expected: row count > 0, columns include `rank`, `name`, `_dlt_root_id`.

Signal completion by typing: "pipeline complete"

## Next Phase Readiness

- `data/waba_pipeline.py` committed and ready
- Plan 02 (conftest.py fixtures), Plan 03 (export.py), and Plan 04 (schema gate + tests) are Wave 2 and depend on the pipeline run completing
- Once pipeline run confirms `observations__taxon__ancestors` exists with rows, all remaining plans can proceed

---
*Phase: 066-provisional-rows-in-pipeline*
*Completed: 2026-04-20 (partial — Task 2 checkpoint pending)*
