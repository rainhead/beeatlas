---
phase: 085-pre-cutover-groundwork
plan: "03"
subsystem: database
tags: [dbt, duckdb, geojson, macros]

# Dependency graph
requires: []
provides:
  - "emit_feature_collection macro documented with CLEAN-01 rationale (FORMAT JSON / FORMAT GDAL / FORMAT CSV)"
affects:
  - "Phase 86+ planners: FORMAT CSV workaround is intentional and traceable — do not revisit"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CLEAN-01 rationale pattern: document WHY alternatives were rejected (tested + structural reasoning)"

key-files:
  created: []
  modified:
    - data/dbt/macros/emit_feature_collection.sql

key-decisions:
  - "D-03 locked: Keep FORMAT CSV workaround in emit_feature_collection — FORMAT GDAL adds incompatible 'name' key to FeatureCollection root; FORMAT JSON wraps scalar incorrectly; Python post-hook not pursued (greenfield cost, zero gain)"
  - "REQUIREMENTS.md CLEAN-01 wording ('replaced') and ROADMAP.md SC#2 ('no longer uses FORMAT CSV') are overridden by D-03; the Phase 85 deliverable for CLEAN-01 is documentation with rationale, not replacement"

patterns-established:
  - "Comment rationale block pattern: WHY NOT X / WHY NOT Y / WHY Z — each with specific structural reason and DuckDB version reference"

requirements-completed:
  - CLEAN-01

# Metrics
duration: 8min
completed: 2026-05-13
---

# Phase 085 Plan 03: emit_feature_collection CLEAN-01 Rationale Summary

**FORMAT CSV workaround in emit_feature_collection locked and documented with three-section rationale: FORMAT JSON wraps scalar incorrectly, FORMAT GDAL adds incompatible "name" key and indented output, FORMAT CSV is the only path that emits raw VARCHAR verbatim**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-13T01:12:00Z
- **Completed:** 2026-05-13T01:14:30Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Replaced brief implementation note in `emit_feature_collection.sql` with a full CLEAN-01 rationale block covering all three alternatives
- Confirmed the macro body (the `FORMAT CSV, DELIMITER '', QUOTE '', HEADER false` clause and Jinja template) is byte-identical to before
- Confirmed `counties_geo` and `ecoregions_geo` dbt models build cleanly
- Confirmed GeoJSON diff harness tests pass (feature counts match, property names match public files)

## Requirement Re-interpretation (D-03 override)

REQUIREMENTS.md CLEAN-01 states the macro should be "replaced"; ROADMAP.md SC#2 says it should "no longer use FORMAT CSV". Both are overridden by locked decision D-03 from the Phase 85 research spike:

- FORMAT GDAL was tested against DuckDB v1.5.2 spatial extension dc1996b and found to add a `"name"` key to the FeatureCollection root, making it structurally incompatible with the `{type, features}` public files.
- FORMAT GDAL also writes indented JSON; the current pipeline writes compact JSON — this would break the diff harness on both structure and whitespace.
- FORMAT JSON wraps the scalar in `{"col_name": value}`, breaking FeatureCollection structure.
- A Python post-hook was not tested and is not being pursued — no Python dbt models exist in the project; greenfield complexity for zero correctness gain.

The Phase 85 deliverable for CLEAN-01 is documentation with rationale. This is intentional and traceable. Phase 86+ planners should treat the FORMAT CSV workaround as intentionally locked, not as technical debt to revisit.

## Task Commits

1. **Task 1: Expand macro header comments with CLEAN-01 rationale** - `55a724d` (docs)

**Plan metadata:** (committed with SUMMARY.md)

## Files Created/Modified

- `data/dbt/macros/emit_feature_collection.sql` - Header comment rewritten with three-section CLEAN-01 rationale; macro body unchanged

## Decisions Made

- D-03 (pre-locked): FORMAT CSV workaround is the correct solution; alternatives were rejected based on researcher testing against DuckDB v1.5.2 spatial dc1996b

## Deviations from Plan

None - plan executed exactly as written. The comment-only edit was made, the macro body is unchanged, and all verification passed.

Note: the dbt models required the `geographies` schema to be populated (via `geographies_pipeline.py`) before the upstream staging models could run. This was resolved by running the pipeline, which downloaded and loaded geographic data. Tests were verified by temporarily symlinking `public/data/` from the main repo (worktree environment does not contain gitignored build artifacts).

## Issues Encountered

- The worktree environment does not contain `public/data/counties.geojson` and `public/data/ecoregions.geojson` (gitignored in the main repo). The diff harness tests were verified by temporarily symlinking the main repo's `public/data/` directory. No files were committed.
- The `geographies` schema was not populated in the worktree's `beeatlas.duckdb`. Running `geographies_pipeline.py` resolved this by downloading and loading geographic source data.

## Threat Flags

None - comment-only edit, no new network endpoints, auth paths, file access patterns, or schema changes.

## Known Stubs

None.

## Self-Check: PASSED

- `data/dbt/macros/emit_feature_collection.sql` exists and contains WHY NOT FORMAT JSON, WHY NOT FORMAT GDAL, WHY FORMAT CSV, and `FORMAT CSV, DELIMITER`
- Commit `55a724d` exists
- dbt run for counties_geo + ecoregions_geo: PASS (5/5 models)
- GeoJSON diff harness tests: 4/4 PASS

## Next Phase Readiness

- CLEAN-01 is resolved and documented; the FORMAT CSV workaround is locked with full rationale
- Phase 86+ planners have a clear record of why alternatives were rejected — no re-investigation needed

---
*Phase: 085-pre-cutover-groundwork*
*Completed: 2026-05-13*
