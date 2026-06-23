---
phase: 160-overlap-capable-place-model-many-to-many-membership
plan: 03
subsystem: data-pipeline (per-place exports — counts + SVG maps)
tags: [places, bridge, many-to-many, double-count, exports, svg-maps]
requires:
  - "data/dbt/models/marts/occurrence_places.sql (the 160-02 bridge mart)"
  - "occurrence_places.parquet bridge artifact in EXPORT_DIR (shipped by 160-02 run.py copy loop)"
  - "src/occurrence.ts occIdFromRow priority (occ_id CASE coupling)"
provides:
  - "places_export._query_counts(con, occ_parquet, bridge_parquet) — bridge-JOIN per-place counts (double-count, D-05)"
  - "places.json specimen_count/sample_count sourced from the occurrence_places bridge"
  - "places_maps.generate_place_maps per-place SVG points via the bridge JOIN"
affects: [160-04]
tech-stack:
  added: []
  patterns:
    - "Option-B synthetic occ_id CASE rebuilt inline over occurrences.parquet, JOINed to the bridge on occ_id (mirrors src/occurrence.ts:23-30 occIdFromRow)"
    - "Double-count by construction: an occurrence in A∩B has two bridge rows, so it counts toward / plots on both places (D-05)"
key-files:
  created: []
  modified:
    - data/places_export.py
    - data/places_maps.py
decisions:
  - "_query_counts gained a bridge_parquet argument (no global path lookup) — export_places passes ASSETS_DIR / 'occurrence_places.parquet' alongside occurrences.parquet, each with its own FileNotFoundError guard"
  - "occ_id CASE inlined in both files rather than factored into a shared helper — keeps the SQL self-contained and the coupling-to-occIdFromRow comment local to each query (matches the documented positional-coupling pattern in this codebase)"
  - "test_sqlite_export.py failures (16) are out of scope — a 160-02 sqlite_export.py defect (missing bridge fixture), not caused by this plan; logged to deferred-items.md"
metrics:
  duration: ~6m
  completed: 2026-06-23
---

# Phase 160 Plan 03: Wave 2 exports — bridge-driven counts + maps (D-05 double-count) Summary

Rewired the two per-place export functions to consume the `occurrence_places`
bridge from 160-02 instead of the dropped scalar `place_slug` column. Per-place
specimen/sample counts (`places.json`) and per-place SVG map points now come from
`occurrences JOIN occurrence_places` on the Option-B synthetic `occ_id`. An
occurrence belonging to two overlapping places has two bridge rows, so it counts
toward — and plots on — both places (D-05/SC-3). This turns the 160-01
double-count fixtures GREEN.

## What Was Built

**Task 1 — bridge-driven counts (commit `6aee4672`):**
- `places_export._query_counts` now takes `(con, occ_parquet, bridge_parquet)`.
  It builds an `occ` CTE over `read_parquet(occ_parquet)` computing the Option-B
  `occ_id` (ecdysis → inat → inat_obs → checklist, mirroring `src/occurrence.ts:23-30`),
  JOINs `read_parquet(bridge_parquet) b ON b.occ_id = occ.occ_id`, and `GROUP BY
  b.place_slug`. The specimen/sample count predicates are unchanged from the
  pre-rewrite logic (`COUNT(CASE WHEN ecdysis_id IS NOT NULL …)` and
  `COUNT(DISTINCT CASE WHEN sample_id IS NOT NULL …)`) — only the source moved
  from a scalar column to a JOIN. Added a `FileNotFoundError` guard for the bridge
  parquet mirroring the occurrences guard.
- `export_places` now passes `ASSETS_DIR / "occurrence_places.parquet"` as the
  bridge path.

**Task 2 — bridge-driven SVG map points (commit `863edf42`):**
- `places_maps.generate_place_maps` points query rewritten to the same `occ`-CTE +
  bridge-JOIN shape, selecting `b.place_slug, occ.lon, occ.lat` WHERE lon/lat are
  non-null. The existing `by_slug` defaultdict grouping and the `_write_species_svg`
  loop are verbatim — a point whose occurrence is in two places now lands in both
  `by_slug` lists → both SVGs (D-05). Added a bridge-parquet existence guard.
- Updated the module + function docstrings to reference the bridge rather than the
  removed `place_slug` column.

## Verification Results

- `cd data && uv run pytest tests/test_places_export.py tests/test_occurrence_places.py` → **9 passed** (acceptance suite GREEN, including `test_places_json_counts` double-count: place-a specimen=1/sample=1, place-b specimen=2/sample=1 — the shared `ecdysis:42` increments both places).
- `cd data && uv run pytest tests/test_places_export.py tests/test_places_validation.py tests/test_occurrence_places.py` → **19 passed**.
- `EXPORT_DIR=public/data uv run python -c "import places_maps; places_maps.main()"` against the real 160-02 bridge + occurrences parquets → `place-maps/: 88 files, 0 total points clipped`, no error. SVGs written to `public/data/place-maps/` (gitignored generated artifacts).
- `grep place_slug` in both files: only the bridge column `b.place_slug` remains; no occurrences-column `place_slug` read survives.

## Deviations from Plan

**1. [Out of scope] `cd data && uv run python run.py` not run end-to-end (network auth)**
- **Found during:** Task 2 verification.
- **Issue:** The plan's `run.py` verify step starts with `load_ecdysis`, which downloads from `ecdysis.org` and returns 401 without credentials in this environment (the same environmental block noted in the 160-02 SUMMARY and the wave note).
- **Fix:** Exercised the exact code path 160-03 touches without the network steps — invoked `generate_place_maps` directly against the real `public/data/occurrences.parquet` + `occurrence_places.parquet` (both produced by 160-02). It regenerated 88 SVGs cleanly. The pytest fixtures cover `_query_counts` end-to-end. The nightly's full run on maderas has credentials.
- **Files modified:** none (verification-only deviation).

**2. [Out of scope — deferred] `test_sqlite_export.py` 16 failures**
- **Found during:** full-suite verification (`uv run pytest`).
- **Issue:** `_duckdb.IOException: No files found … occurrence_places.parquet` at `sqlite_export.py:442`. The 160-02 change added `CREATE TABLE out.occurrence_places AS SELECT * FROM read_parquet(...)`, but `tests/test_sqlite_export.py` fixtures don't emit a sibling bridge parquet.
- **Why not fixed:** Outside this plan's `<files>` (only `places_export.py` + `places_maps.py`). The defect lives in `sqlite_export.py` / its tests, owned by 160-02; my commits do not touch that file or cause these failures. Logged to `deferred-items.md`.
- **Files modified:** none.

## Threat Flags

None. Per the plan threat register: T-160-04 (double-counted totals) is accepted —
D-05 explicitly intends per-place totals to exceed the global occurrence count.
No packages installed (T-160-SC N/A). Both queries run over machine-generated
parquet with no user-influenced value — no injection surface.

## Self-Check: PASSED

- FOUND: data/places_export.py (modified — _query_counts bridge JOIN + bridge-path arg)
- FOUND: data/places_maps.py (modified — points query bridge JOIN + guard)
- FOUND commit: 6aee4672 (Task 1)
- FOUND commit: 863edf42 (Task 2)
- Acceptance suite GREEN: tests/test_places_export.py + tests/test_occurrence_places.py (9 passed)
