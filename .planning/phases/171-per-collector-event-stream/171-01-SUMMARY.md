---
phase: 171-per-collector-event-stream
plan: "01"
subsystem: data-pipeline
tags: [event-feed, collectors, duckdb, slug-resolution, pagination]
dependency_graph:
  requires:
    - 170-01 (occurrences.parquet with record_type column — Phase 170 schema)
    - 169-01 (collectors.json baseline with 10 keys)
    - species-export (public/data/species.parquet with slug column)
  provides:
    - public/data/collector_event_pages.json (committed, ~19 MB, 1,081 sub-pages)
    - public/data/collectors.json extended with first_page_events + pagination metadata
    - data/collectors_events_export.py (export_collector_events, export_collectors_events_step)
    - STREAM-01/02/03 data substrate for Plan 02 (Eleventy templates + _data/collectors.js)
  affects:
    - data/run.py (new STEPS entry after collectors-export)
    - .gitignore (new allowlist exception for collector_event_pages.json)
tech_stack:
  added: []
  patterns:
    - DuckDB UNION ALL batch query with ecdysis_data.identifications JOIN via coreid=CAST(ecdysis_id AS VARCHAR)
    - Python-side rank-aware slug resolution (species → Genus/epithet, genus → Genus, synonym map)
    - 2D pre-flattened pagination (first_page_events in collectors.json + flat sub-page descriptors)
key_files:
  created:
    - data/collectors_events_export.py
    - public/data/collector_event_pages.json
    - data/tests/test_collectors_events_export.py
  modified:
    - data/run.py
    - .gitignore
    - public/data/collectors.json
    - src/tests/data-collectors.test.ts
decisions:
  - "Used record_type column (Phase 170 schema, from dbt sandbox) for collector gate; local public/data/occurrences.parquet was stale (pre-Phase-170) so sandbox copy was used to generate artifacts"
  - "Slug resolution done in Python (not SQL) for uniform rank-awareness; species_by_name and genus_map built from species.parquet; synonyms from occurrence_synonyms.csv"
  - "ORDER BY ecdysis_id ASC NULLS LAST (not CAST to INTEGER) — DuckDB rejects CAST expression in UNION ORDER BY"
  - "collector_event_pages.json: 1,081 sub-pages at 100 events/page (~19 MB actual vs ~24 MB RESEARCH estimate)"
metrics:
  duration: "12m"
  completed_date: "2026-06-27"
  tasks_completed: 2
  files_changed: 7
requirements: [STREAM-01, STREAM-02, STREAM-03]
---

# Phase 171 Plan 01: Per-Collector Event Feed Export Summary

Batch DuckDB event-feed export joining ecdysis identifications with the occurrences mart, producing a reverse-chronological Collected + Identified event stream per WABA collector, pre-chunked into static sub-pages with rank-aware species slug resolution.

## What Was Built

**`data/collectors_events_export.py`**: New export module that:
1. Runs a single batch DuckDB `UNION ALL` query (Collected arm from `read_parquet(occurrences.parquet)` UNION Identified arm via `JOIN ecdysis_data.identifications ON coreid = CAST(ecdysis_id AS VARCHAR)`) for all WABA collectors in one pass.
2. Resolves each event's species name to a rank-aware slug in Python using `species.parquet` (species match → `Genus/epithet`, subspecies strip + retry, genus match → `Genus`, else null), with Phase 123 `texanus→subtilior` synonym normalization.
3. Chunks events at `CHUNK_SIZE=100` (env-configurable); writes first chunk to `collectors.json` record, pages 2+ to `collector_event_pages.json` flat array.
4. Preserves all existing keys in `collectors.json` (display_name, specimen_count, etc. untouched).

**Artifacts committed:**
- `public/data/collectors.json`: 124 collectors, ~2.4 MB, extended with `first_page_events`, `total_event_pages`, `total_event_count`.
- `public/data/collector_event_pages.json`: 1,081 sub-page descriptors, ~19 MB; committed via `.gitignore` allowlist `!/public/data/collector_event_pages.json`.

**Tests:**
- `data/tests/test_collectors_events_export.py`: 7 pytest golden-fixture tests covering event count, sort order, waba_specimen is_pending, chunk bound, rank-aware slug resolution, and sub-page shape. Run RED in Task 1, GREEN after Task 2.
- `src/tests/data-collectors.test.ts`: Extended with Phase 171 describe block reading committed artifacts directly (not via `_data/collectors.js` loader); STREAM-01/02/03 shape assertions. 9/9 tests pass.

## Deviations from Plan

**[Rule 1 - Bug] DuckDB UNION ORDER BY with CAST expression rejected**
- **Found during:** Task 2 first run
- **Issue:** `ORDER BY login, sort_ts DESC NULLS LAST, CAST(ecdysis_id AS INTEGER) ASC` fails with `BinderException` — DuckDB cannot use a CAST expression in ORDER BY on a UNION ALL result
- **Fix:** Changed to `ORDER BY login, sort_ts DESC NULLS LAST, ecdysis_id ASC NULLS LAST` (ecdysis_id is already int64; explicit NULLS LAST for waba_specimen rows with NULL ecdysis_id)
- **Files modified:** `data/collectors_events_export.py`
- **Commit:** 9f2eb175

**[Rule 3 - Blocking] Local occurrences.parquet stale (pre-Phase-170 schema)**
- **Found during:** Task 2 export run
- **Issue:** `public/data/occurrences.parquet` (gitignored, not committed) had old `source` column; Phase 170-01 renamed it to `record_type` in the dbt mart but the local public/data copy was not updated
- **Fix:** Copied `data/dbt/target/sandbox/occurrences.parquet` (Phase 170 schema) to `public/data/occurrences.parquet` for the export run. This is a local-only update (file is gitignored); production will use the correct schema once Phase 170-01's nightly S3 publish completes (blocking operator checkpoint in STATE.md)
- **Files modified:** `public/data/occurrences.parquet` (local only, not committed)

## Output Summary

| Artifact | Size | Notes |
|----------|------|-------|
| `public/data/collectors.json` | ~2.4 MB | 124 collectors, extended in place |
| `public/data/collector_event_pages.json` | ~19 MB | 1,081 sub-pages at 100 events/page |
| `data/collectors_events_export.py` | new | 321 lines |
| `data/tests/test_collectors_events_export.py` | new | 7 tests, all GREEN |

RESEARCH estimated ~24 MB for collector_event_pages.json; actual is ~19 MB (local data slightly different from nightly S3 data at research time).

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns beyond what the threat model covers. All Ecdysis determiner/species strings flow into the committed JSON artifact as raw values; HTML escaping is enforced in Plan 02 via Nunjucks auto-escaping (T-171-01 disposition: mitigate, addressed in Plan 02). No new PII (T-171-02 disposition: accept, operator decision 2026-06-24).

## Test Gates

- `cd data && uv run pytest -m "not integration"`: **256 passed, 9 skipped** ✓
- `npm test`: **881 passed** ✓

## Self-Check: PASSED

Files exist:
- `data/collectors_events_export.py` ✓
- `data/tests/test_collectors_events_export.py` ✓
- `public/data/collectors.json` ✓ (with first_page_events)
- `public/data/collector_event_pages.json` ✓ (1,081 sub-pages)

Commits exist:
- f8b6bfd8: test(171-01): RED scaffold ✓
- 9f2eb175: feat(171-01): collectors_events_export.py ✓
