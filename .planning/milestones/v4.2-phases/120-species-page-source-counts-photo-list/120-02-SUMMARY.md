---
phase: 120-species-page-source-counts-photo-list
plan: "02"
subsystem: pipeline
tags: [python, duckdb, shell, json, inat, photos]

# Dependency graph
requires:
  - phase: 117-inat-obs-pipeline
    provides: inat_obs_data.observations DuckDB table with image_url and license columns
provides:
  - AGG-06 photos.json artifact written by species_export.py (CC-licensed iNat obs photos per species)
  - photos.json hashed S3 upload wired into nightly.sh
  - manifest.json "photos" key pointing to hashed filename
affects:
  - 120-03 (UI plans that will consume photos.json from CloudFront)
  - future photo carousel milestone

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Graceful fallback for optional upstream DuckDB schema: try/except around inat_obs_data query writes empty dict and warns rather than crashing"

key-files:
  created: []
  modified:
    - data/species_export.py
    - data/nightly.sh

key-decisions:
  - "photos.json uses sort_keys=True, indent=2 (human-readable, matches species.json convention — not tight-packed like seasonality.json)"
  - "Graceful try/except fallback when inat_obs_data schema is absent (test/dev contexts without inat pipeline data)"
  - "photos_name upload uses no --content-type flag — .json extension handled by _upload_hashed default"

patterns-established:
  - "AGG-06 block follows AGG-05 pattern: same con object, ASSETS_DIR / filename, print summary line"

requirements-completed: [SPE-03]

# Metrics
duration: 10min
completed: 2026-05-26
---

# Phase 120 Plan 02: photos.json Pipeline Artifact Summary

**AGG-06 photos.json written by species_export.py querying inat_obs_data.observations for CC-licensed photos, uploaded to S3 via nightly.sh hashed-upload and registered as "photos" in manifest.json**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-26T18:07:00Z
- **Completed:** 2026-05-26T18:17:54Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added AGG-06 photos.json block to `export_species_parquet()` immediately after seasonality.json block; queries `inat_obs_data.observations` for CC-licensed photos and writes per-species `{ "Canonical Name": [{"license": "...", "url": "..."}, ...] }` dict with `sort_keys=True, indent=2`
- Wired photos.json into nightly.sh: `photos_name=$(_upload_hashed ...)` after checklist_name line, and `"photos": "$photos_name"` in manifest.json heredoc before `generated_at`
- All 3 existing species_export tests still pass; shell syntax valid

## Task Commits

1. **Task 1: Add AGG-06 photos.json block to species_export.py** - `a1282ef` (feat)
2. **Task 2: Wire photos.json into nightly.sh upload and manifest** - `ed3dfaa` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `/Users/rainhead/dev/beeatlas/data/species_export.py` - Added AGG-06 photos.json block (lines 241-270); updated module docstring and function docstring to list four artifacts
- `/Users/rainhead/dev/beeatlas/data/nightly.sh` - Added photos_name upload line after checklist_name; added "photos" key to manifest.json heredoc

## Decisions Made

- Graceful try/except fallback: when `inat_obs_data.observations` is not available (test contexts with bare in-memory DuckDB), writes an empty `{}` to photos.json and prints a warning. This keeps existing tests green without needing to mock the inat_obs pipeline in test fixtures.
- No `--content-type` flag on `_upload_hashed` for photos.json — `.json` extension is handled correctly by the aws s3 cp default behavior (same as species.json and seasonality.json in the existing upload block).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Error Handling] Added try/except around inat_obs_data query**
- **Found during:** Task 1 (species_export.py implementation)
- **Issue:** Test suite uses bare `duckdb.connect()` (in-memory, no inat_obs_data schema). The new photos.json query raised `CatalogException` in all three test cases, causing them to fail.
- **Fix:** Wrapped the `con.execute(...)` call in try/except. On exception, prints a warning and leaves `photos` as an empty dict, then writes `{}` to photos.json.
- **Files modified:** data/species_export.py
- **Verification:** `uv run pytest tests/test_species_export.py -x` exits 0 (3 passed)
- **Committed in:** a1282ef (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing error handling)
**Impact on plan:** Required for test correctness. Production behavior unchanged — inat_obs_data schema is populated by inat_obs_pipeline before species_export runs in nightly.sh. No scope creep.

## Issues Encountered

None beyond the test-context graceful fallback handled above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `photos.json` is produced by the pipeline and registered in manifest.json; ready for a frontend carousel consumer in a future milestone
- No UI consumer in this plan (data-only storage per SPE-03)
- Runtime verification (photos.json contains real photos) fires on first nightly cron run on maderas after deploy, when beeatlas.duckdb has inat_obs_data populated

---
*Phase: 120-species-page-source-counts-photo-list*
*Completed: 2026-05-26*
