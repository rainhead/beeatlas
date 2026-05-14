---
phase: 088-production-cutover
plan: 02
subsystem: data
tags: [dbt-cutover, run.py, transform-path, migrations-retired, python-deletion]

# Dependency graph
requires:
  - phase: 086-port-remaining-transforms
    provides: species_export.py rewired to consume data/dbt/target/sandbox (Phase 86 Plan 05)
  - phase: 087-incremental-materialization-experiment
    provides: full-refresh-only dbt build idiom (no incremental anywhere)
  - phase: 088
    plan: 01
    provides: validate-schema.mjs retired; dbt 30-col contract is the canonical schema gate
provides:
  - data/run.py orchestrates bash data/dbt/run.sh build via _run_dbt_build STEPS entry
  - _apply_migrations function + callsite removed (both migrations obviated by dbt staging models)
  - data/export.py deleted; Python transform path retired
  - Migration → dbt mapping captured (CUTOVER-02 doc deliverable input for Wave 3)
  - test_dbt_diff.py 16/16 PASS post-cutover (including test_occurrences_schema_matches at 30 cols)
affects: [088-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Subprocess wrapper around dbt: subprocess.run(['bash', _DBT_SCRIPT, 'build'], check=True) — CalledProcessError propagates to main()'s per-step traceback handler for meaningful failure messages"
    - "Two-phase artifact ownership: dbt produces canonical 18-col species.parquet to sandbox/; species_export.py reads sandbox + appends slug to write the 19-col public/data file"
    - "Pre-cutover dbt-build safety gate before destructive deletion: confirm PASS=N against live S3-pulled DuckDB before removing migration code"

key-files:
  created:
    - .planning/phases/088-production-cutover/088-02-SUMMARY.md
  modified:
    - data/run.py
    - data/tests/test_dbt_diff.py
  deleted:
    - data/export.py
    - data/tests/test_export.py
    - data/tests/test_species_export.py
    - data/tests/test_species_maps.py

key-decisions:
  - "Adopted plan's Task 4 fallback driver (_run_dbt_build + species_export.main) over full run.py invocation to avoid expensive dlt API ingestion against live iNat/Ecdysis. CUTOVER-01 verification is about the transform path; the ingestion path is unchanged from prior phases."
  - "Deleted three test files (test_export.py, test_species_export.py, test_species_maps.py) alongside data/export.py — they imported the retired module and would ImportError-fail pytest collection. Coverage is replaced by dbt's 14 data tests + test_dbt_diff.py 16 sandbox/public parity assertions."
  - "Fixed pre-existing bug in test_species_parquet_schema_matches (Phase 86 Plan 01 d1a52a5): test compared sandbox vs public schemas directly, ignoring that species_export.py appends slug. Bug was masked until both artifacts coexisted post-Wave-2."

patterns-established:
  - "_run_dbt_build canonical shape: subprocess.run(check=True) + 3-artifact shutil.copy2 loop. The artifact list is the contract — species.parquet is owned by species_export.py, not _run_dbt_build."

requirements-completed: [CUTOVER-01, CUTOVER-02]

# Metrics
duration: 8min
completed: 2026-05-14
---

# Phase 088 Plan 02: dbt is the Sole Transform Producer

**Rewrote `data/run.py` so `bash data/dbt/run.sh build` is the only path that produces `occurrences.parquet`, `counties.geojson`, and `ecoregions.geojson`; deleted `data/export.py` and its three orphaned test files; deleted `_apply_migrations` (both migrations are now obviated by dbt staging models).**

## Performance

- **Duration:** ~8 min wall (most of it dbt build × 2 + pytest)
- **Started:** 2026-05-14T15:39:00Z
- **Completed:** 2026-05-14T15:47:00Z
- **Tasks:** 4 (1 verification + 3 modifying)
- **Files changed:** 2 modified, 4 deleted
- **Commits:** 3

## Pre-Cutover Safety (Task 1)

Ran `bash data/dbt/run.sh build` against the live S3-pulled DuckDB before deleting `_apply_migrations`:

```
Finished running 2 external models, 4 table models, 14 data tests, 24 view models in 1.90s.
Completed successfully
Done. PASS=44 WARN=0 ERROR=0 SKIP=0 NO-OP=0 TOTAL=44
```

This confirmed both migrations are unnecessary against the current schema:
- Phase 48 rename (`inat_observation_id` → `host_observation_id`): if the column were missing, `stg_ecdysis__occurrence_links.sql` would binder-error at compile time.
- Phase 47 `geom` column: `stg_geo__*.sql` selects `ST_GeomFromText(geometry_wkt) AS geom`, obviating the ALTER TABLE step entirely.

## Accomplishments

### `data/run.py` rewrite

- Added stdlib imports `shutil`, `subprocess`.
- Removed `from export import main as export_all`.
- Added module-level constants `_DBT_SCRIPT`, `_DBT_SANDBOX`, `_EXPORT_DIR` (anchored to `Path(__file__).parent` — Pitfall 5 cwd-safe).
- Added `_run_dbt_build()`:
  - `subprocess.run(["bash", str(_DBT_SCRIPT), "build"], check=True)`
  - `_EXPORT_DIR.mkdir(parents=True, exist_ok=True)`
  - `shutil.copy2` of `occurrences.parquet`, `counties.geojson`, `ecoregions.geojson` from sandbox → `_EXPORT_DIR`
  - Does NOT copy `species.parquet` — `species_export.py` reads sandbox directly and writes its own 19-col version with `slug` appended (Phase 86 Plan 05 contract).
- Replaced `("export", export_all)` with `("dbt-build", _run_dbt_build)` in `STEPS`.
- Deleted entire `_apply_migrations` function (48 lines) and its `_apply_migrations()` call from `main()`.

### `data/export.py` deleted

- 332-line DuckDB CTE export retired in favor of the dbt mart (`models/marts/occurrences.sql`).
- Three test files imported the module and had to be deleted as well (see Deviations).

### End-to-end smoke (Task 4)

Ran the plan's fallback driver to avoid expensive dlt API ingestion:

```
cd data && uv run python -c "from run import _run_dbt_build; _run_dbt_build()"
cd data && uv run python species_export.py
```

Results:
- dbt build: PASS=44 WARN=0 ERROR=0 SKIP=0 NO-OP=0 TOTAL=44 (1.82s)
- species_export: 629 species rows, 442,356 bytes species.json, 265,660 bytes seasonality.json
- `cd data && uv run pytest tests/test_dbt_diff.py -x` → **16/16 PASS**, including:
  - `test_occurrences_row_count_matches` (was the load-bearing CUTOVER-01 gate)
  - `test_occurrences_schema_matches` (30 cols sandbox == public — now true post-cutover; was the FAIL pre-cutover)
  - `test_occurrences_ecdysis_key_set_matches`
  - `test_species_parquet_schema_matches` (post-fix; see Deviations)

Artifact mtimes (Pre → Post):

| File | Pre-cutover mtime | Post-cutover mtime |
|------|-------------------|--------------------|
| `public/data/occurrences.parquet` | 2026-05-04T16:36:58 | 2026-05-14T08:41:32 |
| `public/data/counties.geojson` | 2026-05-04T16:36:58 | 2026-05-14T08:41:31 |
| `public/data/ecoregions.geojson` | 2026-05-04T16:36:58 | 2026-05-14T08:41:31 |
| `public/data/species.parquet` | 2026-05-07T12:11:01 | 2026-05-14T08:41:37 |
| `public/data/species.json` | 2026-05-07T12:11:01 | 2026-05-14T08:41:37 |
| `public/data/seasonality.json` | 2026-05-07T12:11:01 | 2026-05-14T08:41:37 |

All six freshly produced by dbt + species_export.

## Migration → dbt Mapping (for Wave 3 cutover log)

| Migration | Invariant | dbt Replacement |
|-----------|-----------|-----------------|
| Rename `ecdysis_data.occurrence_links.inat_observation_id` → `host_observation_id` (Phase 48) | Column is named `host_observation_id` | `models/staging/stg_ecdysis__occurrence_links.sql` selects from `source('ecdysis_data', 'occurrence_links')`; binder error at compile time if column missing |
| Add `geom GEOMETRY` to `geographies.{us_counties,ecoregions,us_states}` (Phase 47) | Geographies have typed `geom` column | `models/staging/stg_geo__*.sql` selects `ST_GeomFromText(geometry_wkt) AS geom` — migration OBVIATED, not replaced |

Wave 3 (`088-CUTOVER-LOG.md`) paste-ready.

## Task Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Pre-cutover dbt build (no commit — verification gate only) | — |
| 2 | Rewrite data/run.py (add `_run_dbt_build`, swap STEPS, delete `_apply_migrations`) | `b8d0722` |
| 3 | Delete data/export.py + 3 dependent test files | `5c1c01a` |
| 4 | End-to-end smoke; fix pre-existing test_dbt_diff bug exposed by cutover | `e1787b7` |

## Decisions Made

- **Fallback driver in Task 4** — used `_run_dbt_build` + `species_export.py` directly instead of full `run.py` invocation to avoid hours of dlt re-ingestion. The Wave 2 contract is the transform path; ingestion is untouched by this plan.
- **Delete tests alongside source** — `data/tests/test_export.py`, `test_species_export.py`, `test_species_maps.py` all `import export`. With `data/export.py` gone they would ImportError-fail pytest collection. Their assertions cover the retired Python CTE path; equivalent coverage now lives in dbt's 14 data tests + `test_dbt_diff.py`'s 16 parity assertions.
- **Fix pre-existing bug in test_dbt_diff.py** — `test_species_parquet_schema_matches` asserted `s_cols == p_cols`, but sandbox is 18 cols and public is 19 (with `slug` appended). Bug was masked by `SANDBOX_SPECIES_PARQUET_GUARD` until both artifacts coexisted post-Wave-2. Replaced assertion with `p_cols[:-1] == s_cols and p_cols[-1] == ('slug', 'VARCHAR')`.

## Deviations from Plan

### [Rule 3 — Blocking issue] Three orphan test files deleted alongside data/export.py

- **Found during:** Task 3 sanity grep
- **Issue:** `data/tests/test_export.py`, `data/tests/test_species_export.py`, `data/tests/test_species_maps.py` all `import export as ...`. The plan's grep only scanned `data/*.py` (top-level), missing `data/tests/*.py`. Leaving these in place would ImportError-fail Task 4's pytest gate.
- **Fix:** Deleted all three in the same commit as `data/export.py` (`5c1c01a`).
- **Files removed:** `data/tests/test_export.py` (251 lines), `data/tests/test_species_export.py` (250 lines), `data/tests/test_species_maps.py` (216 lines).
- **Coverage replacement:** dbt's 14 data tests (`PASS=14` in every build) + `test_dbt_diff.py` 16 sandbox/public parity assertions.

### [Rule 1 — Bug] Fixed test_species_parquet_schema_matches in test_dbt_diff.py

- **Found during:** Task 4 (pytest gate)
- **Issue:** Test added in Phase 86 Plan 01 (commit `d1a52a5`) compared sandbox/species.parquet schema directly to public/data/species.parquet, but sandbox is 18 cols and public is 19 (species_export.py appends `slug` via `feeds._slugify`). Bug was masked by SKIP guard until both artifacts coexisted.
- **Fix:** Rewrote assertion to `p_cols[:-1] == s_cols and p_cols[-1] == ('slug', 'VARCHAR')`; updated docstring.
- **Files modified:** `data/tests/test_dbt_diff.py`
- **Commit:** `e1787b7`

## Issues Encountered

None beyond the two deviations above. dbt build was clean (PASS=44 twice), and the artifact-copy step landed all three files at the expected paths on the first try.

## User Setup Required

None.

## Next Phase Readiness

Wave 3 (Plan 088-03) prerequisites:
- `data/nightly.sh` smoke against the new run.py (nightly.sh wraps run.py; no edits needed unless nightly references `_apply_migrations` or `export.py` — quick grep recommended in Wave 3).
- Frontend smoke (`npm run dev`) to confirm the dbt-produced 30-col occurrences.parquet renders correctly (load times, layer rendering, sidebar fields).
- `088-CUTOVER-LOG.md` documenting the retired Python transform path + the migration mapping table above (CUTOVER-02 doc deliverable).

The Python transform path is fully retired. dbt + `species_export.py` (Phase 86 dbt-sandbox consumer) own all 6 artifacts in `public/data/`.

## Self-Check: PASSED

Verified post-write:
- `test ! -f data/export.py` → file gone ✓
- `! grep -q "_apply_migrations" data/run.py` → 0 matches ✓
- `! grep -q "from export import" data/run.py` → 0 matches ✓
- `grep -q "def _run_dbt_build" data/run.py` → present ✓
- `grep -q "\"dbt-build\"" data/run.py` → present ✓
- Commits `b8d0722`, `5c1c01a`, `e1787b7` all present in `git log` ✓
- `cd data && uv run pytest tests/test_dbt_diff.py -x` → 16 passed in 0.42s ✓
- All 6 artifacts in `public/data/` have mtimes newer than pre-cutover baseline ✓

---
*Phase: 088-production-cutover*
*Completed: 2026-05-14*
