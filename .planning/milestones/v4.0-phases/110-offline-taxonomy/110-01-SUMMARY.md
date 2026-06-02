---
phase: 110
plan: "01"
subsystem: data-pipeline
tags: [python, duckdb, taxa, offline-taxonomy, tdd]
dependency_graph:
  requires: []
  provides: [taxa_pipeline.download_taxa_csv, taxa_pipeline.load_taxon_lineage_extended]
  affects: [inaturalist_data.taxon_lineage_extended]
tech_stack:
  added: []
  patterns: [etag-caching, duckdb-ancestry-walk, duckdb-pivot, tdd-nyquist]
key_files:
  created:
    - data/taxa_pipeline.py
    - data/tests/test_taxa_pipeline.py
  modified:
    - data/.gitignore
decisions:
  - "Scope: all active Anthophila (not just observed taxa) — Phase 111 needs lineage for checklist-only species"
  - "New module taxa_pipeline.py (not extension of inaturalist_pipeline.py) — mirrors checklist_pipeline.py pattern"
  - "PIVOT column rename: target_taxon_id AS taxon_id in final SELECT (not CTE alias)"
metrics:
  duration: "2 minutes"
  completed: "2026-05-24"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 1
requirements_completed: [TAX-01, TAX-02]
---

# Phase 110 Plan 01: taxa_pipeline Downloader and Ancestry Walk Summary

Create `data/taxa_pipeline.py` with ETag-cached download from iNat AWS Open Data and DuckDB ancestry walk producing `inaturalist_data.taxon_lineage_extended`. Nyquist-compliant TDD: five RED tests committed before GREEN implementation.

## One-liner

`taxa_pipeline.py` with ETag/304 caching for taxa.csv.gz and DuckDB PIVOT ancestry walk over all active Anthophila producing a 6-column `taxon_lineage_extended` table.

## What Was Built

### Functions Added

**`download_taxa_csv() -> None`** (lines 28–71, ~44 lines)
- Reads `TAXA_CACHE_PATH` sidecar JSON for cached ETag/Last-Modified
- Sends `If-None-Match` + `If-Modified-Since` headers on subsequent calls
- Returns early on HTTP 304 (no file write)
- Atomic write on 200: streams to `.gz.tmp`, then renames to `TAXA_PATH`
- Writes sidecar `taxa_cache.json` with `{"etag": ..., "last_modified": ...}`

**`load_taxon_lineage_extended(db_path: str | None = None) -> None`** (lines 74–141, ~68 lines)
- Opens DuckDB at `db_path` (defaults to `DB_PATH`)
- `CREATE SCHEMA IF NOT EXISTS inaturalist_data`
- `CREATE OR REPLACE TABLE inaturalist_data.taxon_lineage_extended` via PIVOT SQL
- Filters `active = 'true'` (string), scope: `ancestry LIKE '%/630955/%' OR '%/630955' OR taxon_id = 630955`
- UNION ALL self_rows arm for genus/family/tribe taxa (ancestry omits self)
- Final SELECT aliases `target_taxon_id AS taxon_id` for downstream JOIN compatibility
- Prints row count

### Module-level Constants

`DB_PATH`, `RAW_DIR`, `TAXA_URL`, `TAXA_PATH`, `TAXA_CACHE_PATH`, `ANTHOPHILA_ID = 630955`

## Tests

Five pytest functions in `data/tests/test_taxa_pipeline.py` (272 lines):

| Test | Coverage |
|------|----------|
| `test_download_uses_304` | TAX-01: conditional headers sent; 304 skips file write |
| `test_download_writes_sidecar` | TAX-01: 200 response writes archive + sidecar JSON |
| `test_lineage_schema` | TAX-02: 6-column ordered schema `['taxon_id','family','subfamily','tribe','genus','subgenus']` |
| `test_lineage_null_ranks` | TAX-02: absent ranks emit NULL (Apidae family row; Bombus melanopygus species row) |
| `test_lineage_includes_self` | TAX-02: Bombus genus (84734) appears with `genus='Bombus'` via UNION ALL self_rows arm |

All 5 pass. Full suite: 134 passed, 22 skipped (no regressions).

## Deviations from Plan

None — plan executed exactly as written.

The PIVOT SQL was implemented exactly as in RESEARCH.md Pattern 2, with the `target_taxon_id AS taxon_id` alias in the final `SELECT` outside the PIVOT clause (not a CTE wrap). Both approaches are equivalent; the inline alias is slightly more concise.

## Threat Model Compliance

T-110-02 (Tampering / DuckDB read_csv): mitigated — `read_csv` called with explicit `columns={...}` type spec and bound parameter `[str(TAXA_PATH)]` (not f-string interpolation).

T-110-03 (DoS / 37MB download): mitigated — ETag/Last-Modified conditional GET implemented; on 304 function returns without writing.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints or trust boundary surfaces beyond those documented in the plan's threat model.

## Self-Check: PASSED

- [x] `data/taxa_pipeline.py` exists: FOUND
- [x] `data/tests/test_taxa_pipeline.py` exists: FOUND
- [x] Task 1 commit e03a4e7: FOUND
- [x] Task 2 commit 994205c: FOUND
- [x] Five tests pass: CONFIRMED (134 passed, 22 skipped)
- [x] `.gitignore` contains `raw/taxa.csv.gz` and `raw/taxa_cache.json`: CONFIRMED
