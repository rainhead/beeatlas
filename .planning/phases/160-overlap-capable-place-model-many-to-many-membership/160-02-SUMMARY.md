---
phase: 160-overlap-capable-place-model-many-to-many-membership
plan: 02
subsystem: data-pipeline (dbt marts + validation + sqlite export)
tags: [places, bridge, many-to-many, dbt-contract, sqlite, pipeline]
requires:
  - "data/dbt/models/intermediate/int_combined.sql (the four identity columns + lon/lat)"
  - "src/occurrence.ts occIdFromRow priority (occ_id CASE coupling)"
  - "geographies.places source (ST_Within join surface)"
provides:
  - "data/dbt/models/marts/occurrence_places.sql — many-to-many (occ_id, place_slug) bridge mart"
  - "occurrence_places.parquet bridge artifact (copied to EXPORT_DIR)"
  - "out.occurrence_places SQLite table + idx_occ_places(place_slug, occ_id) in occurrences.db"
  - "occurrences mart contract without scalar place_slug"
  - "overlap-capable places_validation (ST_Overlaps guard removed)"
affects: [160-03, 160-04]
tech-stack:
  added: []
  patterns:
    - "External-parquet bridge mart sourced from the existing ST_Within join, minus DISTINCT ON"
    - "Option-B synthetic occ_id CASE coupled to src/occurrence.ts occIdFromRow"
    - "Second SQLite table built from a sibling parquet (src_parquet.parent) before DETACH; index after DETACH (WR-04)"
key-files:
  created:
    - data/dbt/models/marts/occurrence_places.sql
  modified:
    - data/dbt/models/marts/occurrences.sql
    - data/dbt/models/marts/schema.yml
    - data/places_validation.py
    - data/run.py
    - data/sqlite_export.py
    - scripts/make-local-manifest.js
    - scripts/validate-db.mjs
decisions:
  - "Bridge parquet path resolved as a sibling of src_parquet (src_parquet.parent / 'occurrence_places.parquet') — no new injectable arg; main() locates occurrences in _DBT_SANDBOX, run.py copy loop lands both in EXPORT_DIR"
  - "occurrences contract is now 36 columns after dropping place_slug; the dbt contract (the schema gate) enforces it — the CONTEXT '33→32' was an estimate, the load-bearing fact is place_slug gone from both SQL projection and schema.yml in lockstep"
  - "Removed the now-dead valid_geometries accumulator along with the ST_Overlaps block (it was consumed only by the overlap check; the WKT/WGS84 checks run inline in the loop)"
metrics:
  duration: ~4m
  completed: 2026-06-23
---

# Phase 160 Plan 02: Wave 1 pipeline — occurrence_places bridge (dbt-green gate) Summary

Converted the one-place-per-occurrence partition into a many-to-many `occurrence_places` bridge: created the bridge mart (Option-B synthetic `occ_id`), dropped the scalar `place_slug` from the occurrences mart, removed the overlap-rejection validation guard, threaded the bridge parquet through the copy loop, shipped it as an indexed second table inside `occurrences.db`, and added it to both hardcoded JS whitelists. The dbt build — the schema gate for the whole phase — is green, unblocking 160-03/160-04.

## What Was Built

**Task 1 — bridge mart + contract changes (commit `4be19e99`):**
- New `data/dbt/models/marts/occurrence_places.sql`: `materialized='external'`, one row per `(occ_id, place_slug)` membership via `ST_Within` INNER JOIN with **no `DISTINCT ON`**. The `occ_id` CASE (ecdysis → inat → inat_obs → checklist) mirrors `src/occurrence.ts:23-30` verbatim, documented as positionally coupled in a header comment. `_row_id` is internal-only (not projected). `ORDER BY occ_id, place_slug` for determinism.
- `occurrences.sql`: dropped the `wa_places`/`with_place`/`place_dedup` CTEs, the `fp.place_slug` projection, and the `LEFT JOIN place_dedup` line.
- `schema.yml`: removed `place_slug` from the occurrences contract; added an enforced `occurrence_places` contract with `occ_id` and `place_slug`, both `not_null`.

**Task 2 — overlap-capable validation (commit `d9e36e84`):**
- Removed the pairwise `ST_Overlaps` block (former check #6) and the now-dead `valid_geometries` accumulator from `places_validation.py`. Updated the docstring to drop check #6 and note the D-03 rationale. Slug/duplicate/permit/WKT-validity/WGS84-bounds checks untouched.

**Task 3 — ship the bridge (commit `a89ea025`):**
- `run.py`: added `occurrence_places.parquet` to the `_run_dbt_build` copy loop.
- `sqlite_export.py`: `CREATE TABLE out.occurrence_places` from `src_parquet.parent / "occurrence_places.parquet"` before `DETACH`; `CREATE INDEX idx_occ_places ON occurrence_places(place_slug, occ_id)` after DETACH (WR-04 ordering) via the stdlib sqlite3 handle in `_create_taxa_indexes`.
- `scripts/make-local-manifest.js` and `scripts/validate-db.mjs`: added `'occurrence_places'` to the table arrays.

## Verification Results

- `bash data/dbt/run.sh build` → PASS=90 WARN=1 ERROR=0 (the WARN is the pre-existing `test_lin05_lineage_coverage`, out of scope). Both contracts enforced; `occurrence_places` mart built.
- occurrences.parquet = 36 columns, `place_slug` absent; occurrence_places.parquet schema = `[occ_id, place_slug]`.
- `uv run pytest tests/test_occurrence_places.py tests/test_places_validation.py` → 16 passed (6 bridge recipe GREEN + 10 validation GREEN including the inverted `test_overlapping_polygons`).
- `grep -n 'ST_Overlaps' data/places_validation.py` → only the docstring note remains (code guard gone).
- `uv run python -m sqlite_export` → built `occurrences.db` (29.2 MB) with tables `[geo_blob, occurrence_places, occurrences, taxa]`; `occurrence_places` has 10,655 membership rows and index `idx_occ_places`; sample rows confirm prefixed occ_id format (`checklist:10060` etc.).
- `node scripts/make-local-manifest.js && node scripts/validate-db.mjs` → `ok occurrences.db (tables: geo_blob, occurrences, occurrence_places)`, exit 0.

## Deviations from Plan

**1. [Rule 3 - Environment] Full `uv run python run.py` blocked at step 1 (network auth)**
- **Found during:** Task 3 verification.
- **Issue:** The plan's verify command runs the full pipeline, but its first step `load_ecdysis` downloads from `ecdysis.org` and returned `401 Unauthorized` in this environment (no Ecdysis credentials). Unrelated to any 160-02 change.
- **Fix:** Exercised the exact code paths 160-02 touches without the network steps: the dbt build (already produced the bridge parquet in the sandbox against the existing local `beeatlas.duckdb`), then `uv run python -m sqlite_export` (the `generate-sqlite` step), then the run.py copy-loop result (bridge parquet → `public/data/`), then both JS validators. All green. The nightly's full run on maderas has credentials.
- **Files modified:** none (verification-only deviation).

**2. [Note] occurrences contract is 36 columns, not the CONTEXT-estimated 32**
- The CONTEXT/plan said "33→32"; the actual occurrences mart projects 36 columns after dropping `place_slug`. The dbt contract enforced cleanly at 36 (schema.yml occurrences block lists 36). What the acceptance gate actually requires — `place_slug` dropped from BOTH the SQL projection and the schema.yml contract, in lockstep, with a green build — is satisfied. Recorded as a decision, not a defect.

## Threat Flags

None. Per the plan threat register: T-160-02 (overlap removal) is accepted — only the OVERLAP check went; WKT-validity, WGS84-bounds, and slug-regex still reject malformed/out-of-range/bad-slug geometry. T-160-03 (occ_id drift) is mitigated by the header-comment coupling doc + the GREEN `test_occurrence_places.py` recipe + the `not_null` contract. No new packages installed (T-160-SC N/A). The bridge table schema is derived from machine-generated parquet — no injection surface.

## Self-Check: PASSED

- FOUND: data/dbt/models/marts/occurrence_places.sql
- FOUND: data/dbt/models/marts/occurrences.sql (modified — place_slug removed)
- FOUND: data/dbt/models/marts/schema.yml (modified — occurrence_places contract added)
- FOUND: data/places_validation.py (modified — ST_Overlaps guard removed)
- FOUND: data/run.py, data/sqlite_export.py, scripts/make-local-manifest.js, scripts/validate-db.mjs (modified)
- FOUND commit: 4be19e99 (Task 1)
- FOUND commit: d9e36e84 (Task 2)
- FOUND commit: a89ea025 (Task 3)
