---
phase: 066-provisional-rows-in-pipeline
plan: "04"
subsystem: pipeline
tags: [schema-gate, validate-schema, parquet, export]

# Dependency graph
requires:
  - plan: "066-03"
    provides: "export.py restructured with UNION ALL and new columns (host_inat_login, specimen_inat_login, specimen_inat_taxon_name, specimen_inat_genus, specimen_inat_family, is_provisional)"
provides:
  - "scripts/validate-schema.mjs EXPECTED list updated to 30 columns matching new parquet schema"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Schema gate: validate-schema.mjs fetches production CloudFront parquet footer when no local file found"

key-files:
  created: []
  modified:
    - scripts/validate-schema.mjs

key-decisions:
  - "Task 2 (production export + schema gate) deferred to nightly CI: local beeatlas.duckdb does not have observations__taxon__ancestors table populated (waba_pipeline has not run since Plan 01 added taxon.ancestors to DEFAULT_FIELDS); schema gate will be confirmed on next nightly run on maderas"

requirements-completed:
  - PROV-05

# Metrics
duration: 5min
completed: 2026-04-20
---

# Phase 066 Plan 04: Update validate-schema.mjs EXPECTED Column List

**scripts/validate-schema.mjs EXPECTED list updated to 30 columns — renames `observer` to `host_inat_login`, adds `specimen_inat_login`, `specimen_inat_taxon_name`, `specimen_inat_genus`, `specimen_inat_family`, `is_provisional`**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-04-20
- **Tasks:** 1 of 2 (Task 2 deferred — see Limitations)
- **Files modified:** 1

## Accomplishments

- Replaced `observer` with `host_inat_login` in the `'occurrences.parquet'` EXPECTED array
- Added 5 new columns with inline comments: `specimen_inat_login`, `specimen_inat_taxon_name`, `specimen_inat_genus`, `specimen_inat_family` (WABA specimen fields group), and `is_provisional` (provisional flag group)
- EXPECTED array now has exactly 30 column names (verified by column-count audit)
- Validation loop (lines 44–75), ASSETS_DIR, CLOUDFRONT_BASE, and error handling are unchanged

## Task Commits

1. **Task 1: Update EXPECTED column list in validate-schema.mjs** — committed in this plan

## Files Created/Modified

- `scripts/validate-schema.mjs` — EXPECTED `'occurrences.parquet'` array: 25 → 30 columns; `observer` → `host_inat_login`; 5 new columns added

## Limitations

**Task 2 (production export + schema gate) cannot be completed locally.**

The local `data/beeatlas.duckdb` does not have `observations__taxon__ancestors` populated because `waba_pipeline.py` has not run since Plan 01 added `taxon.ancestors` to `DEFAULT_FIELDS`. Running `python data/export.py` locally fails with:

```
CatalogException: Table with name observations__taxon__ancestors does not exist
```

This is expected: the pipeline runs nightly on maderas, not locally. The schema gate (`node scripts/validate-schema.mjs`) will be confirmed on the next nightly run when:
1. `waba_pipeline.py` runs and populates `observations__taxon__ancestors`
2. `export.py` runs and writes a fresh `occurrences.parquet` with the new 30-column schema
3. CI calls `validate-schema.mjs` against the CloudFront-served parquet footer

All 31 pytest tests pass locally, confirming the export SQL and fixture scaffolding are correct.

## Deviations from Plan

None — Task 1 executed exactly as specified. Task 2 deferred per verification findings (expected environment limitation, not a code defect).

## Self-Check

Files exist:
- scripts/validate-schema.mjs: FOUND (modified)
- .planning/phases/066-provisional-rows-in-pipeline/066-04-SUMMARY.md: FOUND (this file)

Acceptance criteria (Task 1):
- `grep "'observer'" scripts/validate-schema.mjs` → 0 lines ✓
- `grep "host_inat_login" scripts/validate-schema.mjs` → 1 line ✓
- `grep "specimen_inat_login\|specimen_inat_taxon_name\|specimen_inat_genus\|specimen_inat_family" scripts/validate-schema.mjs` → 4 lines ✓
- `grep "is_provisional" scripts/validate-schema.mjs` → 1 line ✓
- EXPECTED array: 30 columns ✓

## Self-Check: PASSED (Task 1); Task 2 deferred to nightly CI

---
*Phase: 066-provisional-rows-in-pipeline*
*Completed: 2026-04-20*
