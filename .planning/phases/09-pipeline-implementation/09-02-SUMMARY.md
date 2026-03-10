---
phase: 09-pipeline-implementation
plan: "02"
subsystem: data
tags: [pyinaturalist, pandas, parquet, pyarrow, pytest, bash]

# Dependency graph
requires:
  - phase: 09-01
    provides: "samples.parquet schema stub, npm scripts (fetch-inat, cache-restore, cache-upload)"
provides:
  - "data/inat/download.py: full iNat pipeline — fetch_all, fetch_since, obs_to_row, build_dataframe, merge_delta, main"
  - "scripts/build-data.sh: updated to run iNat download and copy samples.parquet to frontend/src/assets/"
affects:
  - CI pipeline (fetch-inat step now has implementation)
  - 09-03 (validation plan, if any)

# Tech tracking
tech-stack:
  added:
    - pytest (dev dependency added to data/pyproject.toml)
  patterns:
    - "Model attribute access for pyinaturalist objects: obs.id, obs.user.login, obs.observed_on, obs.location — never raw dict access"
    - "obs.to_dict().get('ofvs', []) to get raw ofv dicts for extract_specimen_count"
    - "Incremental fallback: catch any exception from fetch_since, print warning, fall back to full fetch"
    - "Write last_fetch.txt ONLY after to_parquet() returns without error"

key-files:
  created:
    - data/inat/download.py
    - data/tests/test_inat_download.py
  modified:
    - scripts/build-data.sh
    - data/pyproject.toml
    - data/uv.lock

key-decisions:
  - "page='all' pagination used for both full and incremental fetches — pyinaturalist handles iteration automatically"
  - "Incremental fallback is silent-warn + full fetch, not a hard error — prevents pipeline breakage on stale/invalid timestamp"
  - "merge_delta uses keep='last' so delta row overwrites existing row on duplicate observation_id (incremental updates win)"

patterns-established:
  - "TDD: write failing tests first (test commit), then implementation (feat commit)"
  - "merge_delta: pd.concat + drop_duplicates(keep='last') + sort_values + reset_index pattern for parquet merge"

requirements-completed: [INAT-01, INAT-02, CACHE-02]

# Metrics
duration: 15min
completed: 2026-03-10
---

# Phase 09 Plan 02: iNat Download Pipeline Summary

**Full iNaturalist pipeline (fetch_all/fetch_since, obs_to_row, build_dataframe, merge_delta, main) with incremental fallback, typed DataFrame output, and build-data.sh integration**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-10T21:00:00Z
- **Completed:** 2026-03-10T21:15:00Z
- **Tasks:** 2 (plus TDD test commit)
- **Files modified:** 5

## Accomplishments
- Implemented full pyinaturalist pipeline that fetches WA Bee Atlas project observations, extracts required fields via model attribute access, and writes typed parquet
- Incremental mode auto-detected from existence of samples.parquet + last_fetch.txt; falls back to full fetch on any error
- 15 unit tests covering obs_to_row, build_dataframe, merge_delta, and export completeness — all passing
- Wired `uv run python inat/download.py` and parquet copy into scripts/build-data.sh

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for inat/download.py** - `a1ffe67` (test)
2. **Task 1 (GREEN): Implement data/inat/download.py** - `08481ce` (feat)
3. **Task 2: Wire iNat download into build-data.sh** - `59ddc2e` (feat)

## Files Created/Modified
- `data/inat/download.py` - Full pipeline: fetch_all, fetch_since, obs_to_row, build_dataframe, merge_delta, main with progress logging
- `data/tests/test_inat_download.py` - 15 unit tests covering all exported functions
- `scripts/build-data.sh` - Added iNat fetch step and samples.parquet copy to frontend/src/assets/
- `data/pyproject.toml` - Added pytest dev dependency
- `data/uv.lock` - Updated lockfile

## Decisions Made
- Used `page='all'` for both full and incremental fetches — pyinaturalist handles pagination automatically, no manual page iteration needed
- Incremental fallback catches any exception (not just specific ones) to maximize resilience — a failed incremental fetch should never break the build
- `merge_delta` uses `keep='last'` so that delta (new) rows overwrite existing rows on duplicate observation_id, enabling updated specimen counts to propagate

## Deviations from Plan

None - plan executed exactly as written.

Minor note: pytest was not in pyproject.toml; added it as a dev dependency before the TDD RED phase. This is a Rule 3 auto-fix (blocking issue: test framework missing).

## Issues Encountered
- pytest not installed in uv environment; added with `uv add --dev pytest` before running tests.

## User Setup Required
None - no external service configuration required. Pipeline makes unauthenticated requests to iNat API v1 (public project observations endpoint requires no auth key).

## Next Phase Readiness
- `npm run fetch-inat` now calls a fully implemented pipeline
- `npm run build:data` will run both ecdysis and iNat pipelines end-to-end
- Live end-to-end test (requires network) will produce data/samples.parquet with correct 6-column schema
- Ready for Phase 09-03 (validation / CI workflow integration) if applicable

---
*Phase: 09-pipeline-implementation*
*Completed: 2026-03-10*
