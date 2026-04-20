---
phase: 066-provisional-rows-in-pipeline
plan: "04"
subsystem: pipeline
tags: [schema-gate, validate-schema, occurrences-parquet, provisional-rows]

# Dependency graph
requires:
  - plan: "066-03"
    provides: "export.py emits provisional rows with host_inat_login, specimen_inat_*, is_provisional"
provides:
  - "scripts/validate-schema.mjs EXPECTED list matches new occurrences.parquet schema (30 columns)"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "validate-schema.mjs EXPECTED array updated as CI gate when schema changes"

key-files:
  created: []
  modified:
    - scripts/validate-schema.mjs

key-decisions:
  - "EXPECTED array now 30 columns: host_inat_login replaces observer; 5 new columns added (specimen_inat_login, specimen_inat_taxon_name, specimen_inat_genus, specimen_inat_family, is_provisional)"

requirements-completed:
  - PROV-05

# Metrics
duration: 10min
completed: 2026-04-20
---

# Phase 066 Plan 04: Update validate-schema.mjs EXPECTED Column List

**validate-schema.mjs EXPECTED list updated from 25 to 30 columns: observer renamed to host_inat_login, plus five new WABA/provisional columns added to match export.py output from Plan 03**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-20T18:30:00Z
- **Completed:** 2026-04-20T18:38:00Z
- **Tasks:** 1 of 2 (Task 2 is checkpoint:human-verify requiring production export run)
- **Files modified:** 1

## Accomplishments

- Renamed `observer` to `host_inat_login` in EXPECTED array (breaking rename from Plan 03)
- Added `specimen_inat_login`, `specimen_inat_taxon_name`, `specimen_inat_genus`, `specimen_inat_family` (WABA specimen fields)
- Added `is_provisional` (provisional flag)
- EXPECTED array now has exactly 30 columns (was 25)
- All 31 pytest tests pass

## Task Commits

1. **Task 1: Update EXPECTED column list in validate-schema.mjs** — `26c16a6` (chore)

## Files Created/Modified

- `scripts/validate-schema.mjs` — EXPECTED['occurrences.parquet'] array updated: observer renamed to host_inat_login; 5 new columns appended

## Decisions Made

- No architectural decisions required — mechanical update per Plan 03 schema changes.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Checkpoint: Task 2 (human-verify)

Task 2 requires running the production export and verifying the schema gate against a locally written `occurrences.parquet`. This is a `checkpoint:human-verify` task.

**Status:** No local `occurrences.parquet` exists (pipeline runs on maderas nightly cron). The schema gate (`node scripts/validate-schema.mjs`) will validate against the production CloudFront parquet when the pipeline next runs on maderas.

**To verify manually:**
```bash
# On maderas or locally if beeatlas.duckdb has current data:
uv run --project data python data/export.py
node scripts/validate-schema.mjs
uv run --project data pytest data/tests/ -v
```

**Pytest status:** All 31 tests pass locally (verified in this execution).

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary changes. Schema gate update only.

## Self-Check

Files exist:
- scripts/validate-schema.mjs: FOUND (modified)
- .planning/phases/066-provisional-rows-in-pipeline/066-04-SUMMARY.md: FOUND

Commits exist:
- 26c16a6 (Task 1): FOUND

Tests: 31/31 passed

## Self-Check: PASSED
