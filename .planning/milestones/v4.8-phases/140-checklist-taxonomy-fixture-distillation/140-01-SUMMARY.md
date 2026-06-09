---
phase: 140-checklist-taxonomy-fixture-distillation
plan: "01"
subsystem: data-tests
tags: [fixtures, test-infrastructure, duckdb, seam]
dependency_graph:
  requires: []
  provides:
    - data/checklist_pipeline.py:load_checklist(con=None) connection-injection seam
    - data/resolve_checklist_names.py:TAXA_PATH module-level constant
    - data/tests/fixtures/checklist_sample.csv (8-row distilled fixture)
    - data/tests/fixtures/taxa_subset.csv.gz (2-row angelicus/texanus LCA fixture)
  affects:
    - data/tests/test_checklist_pipeline.py (Plan 02 will rewrite tests to use new seam)
    - data/tests/test_resolve_checklist_names.py (Plan 02 will monkeypatch TAXA_PATH)
tech_stack:
  added: []
  patterns:
    - connection-injection seam with _owns_connection guard
    - module-level constant extraction for monkeypatching
    - distilled committed CSV/gz fixtures with provenance documentation
key_files:
  created:
    - data/tests/fixtures/checklist_sample.csv
    - data/tests/fixtures/taxa_subset.csv.gz
    - data/tests/fixtures/README
  modified:
    - data/checklist_pipeline.py
    - data/resolve_checklist_names.py
decisions:
  - "load_checklist() uses Option A seam (optional con param + _owns_connection guard) — minimal diff, nightly path unchanged"
  - "TAXA_PATH extracted as str (not Path) in resolve_checklist_names.py to match existing gzip.open usage"
  - "Provenance stored in data/tests/fixtures/README (sibling file) not as CSV header comments, since csv.DictReader does not skip # lines"
  - "checklist_sample.csv is comment-free; throwaway verification confirms 8 rows load with correct branch counts through real _load_checklist_records_full() code path"
  - "ObjectID 147 confirmed valid (lon=-117.2137 is inside WA eastern boundary at -116.9); ObjectID 8702 is the sole out_of_bbox row"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-06"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 2
---

# Phase 140 Plan 01: Seams and Fixtures Summary

One-liner: Added `load_checklist(con=None)` connection-injection seam and module-level `TAXA_PATH` constant, then authored two committed fixtures covering all 4 coord_flag and 3 date_quality branches plus the angelicus/texanus LCA test.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add connection-injection seam + extract TAXA_PATH | 6f04cbe | data/checklist_pipeline.py, data/resolve_checklist_names.py |
| 2 | Author committed fixtures with provenance | bd812f0 | data/tests/fixtures/checklist_sample.csv, data/tests/fixtures/taxa_subset.csv.gz, data/tests/fixtures/README |

## What Was Built

### Task 1: Production-Code Seams

**`data/checklist_pipeline.py` — connection-injection seam (D-05):**

`load_checklist()` signature changed from `def load_checklist() -> None:` to `def load_checklist(con: "duckdb.DuckDBPyConnection | None" = None) -> None:`. The `_owns_connection = con is None` guard controls whether the function creates and closes its own DB_PATH connection (nightly path, unchanged) or uses an injected connection (test path). The entire try-body is byte-for-byte identical to before.

**`data/resolve_checklist_names.py` — TAXA_PATH constant (D-06):**

Added `TAXA_PATH = str(Path(__file__).parent / "raw" / "taxa.csv.gz")` to the constants block alongside `AUDIT_CSV`/`FUZZY_REVIEW_CSV`/`GBIF_SEED_CSV`. The inline `taxa_path = str(...)` local in `resolve_checklist_names()` was deleted; replaced with `taxa = _load_anthophila_ancestry(TAXA_PATH)`. No other call sites changed.

### Task 2: Committed Fixtures

**`data/tests/fixtures/checklist_sample.csv`** — 8 data rows covering:
- coord_flag: valid (5 rows: ObjectIDs 1, 31311, 1668, 1386, 99999), null_coord (ObjectID 3), zero_coord (ObjectID 17423), out_of_bbox (ObjectID 8702)
- date_quality: full (4 rows: ObjectIDs 1, 3, 31311, 1668), none (3 rows: ObjectIDs 17423, 8702, 1386), year_only (1 synthetic row: ObjectID 99999)
- slash-compound verbatim_name: ObjectID 1386 (`Agapostemon angelicus/texanus`)

Throwaway verification confirmed: 8 rows load through the real `_load_checklist_records_full()` code path with exactly the expected branch counts.

**`data/tests/fixtures/taxa_subset.csv.gz`** — 2-row tab-delimited gz (header + 2 data rows):
- Agapostemon angelicus (taxon_id=270393, ancestry: `.../50086/606634`)
- Agapostemon texanus (taxon_id=1581468, ancestry: `.../50086/606634/1581466`)
- LCA node 606634 verified from live `data/raw/taxa.csv.gz`

**`data/tests/fixtures/README`** — provenance documentation per D-10.

## Verification Results

```
SEAMS_OK (grep checks pass):
  - checklist_pipeline.py contains _owns_connection
  - resolve_checklist_names.py has ^TAXA_PATH = (1 occurrence)
  - resolve_checklist_names.py calls _load_anthophila_ancestry(TAXA_PATH)

FIXTURES_OK (acceptance criteria pass):
  - 8 rows with correct ObjectIDs: [1, 3, 1386, 1668, 8702, 17423, 31311, 99999]
  - taxa_subset.csv.gz: 3 lines total (header + 2 rows), both contain /606634
  - "Distilled from" provenance present in data/tests/fixtures/

Throwaway load verification:
  Total rows: 8
  coord_flag: null_coord=1, out_of_bbox=1, valid=5, zero_coord=1
  date_quality: full=4, none=3, year_only=1

Pre-existing test failure (not caused by this plan):
  test_at_least_13_fuzzy_candidates: FAILED (already red per RESEARCH.md §8; fixed in Phase 141)
  6/7 tests in test_resolve_checklist_names.py: PASS
  13/13 non-DB unit tests in test_checklist_pipeline.py: PASS
```

## Deviations from Plan

### Auto-fixed Issues

None.

### Deliberate Design Choices

**1. Provenance in README not CSV header comments**

The plan noted: "if it does NOT skip comment lines, put the provenance in a sibling `checklist_sample.csv.README` or a leading comment style the DictReader ignores." `csv.DictReader(f)` in `_load_checklist_records_full()` does not filter `#` comment lines — the first `#` line would become the spurious header. Provenance was placed in `data/tests/fixtures/README` (the "Distilled from" string is present in `tests/fixtures/` as required by the `must_haves` artifact). The plan's task-level verify command pre-filters `#` lines before DictReader, consistent with this approach.

## Known Stubs

None. The fixtures are complete committed files; no placeholder data.

## Threat Flags

None. This plan adds only static committed test data and minimal optional parameters with no new trust boundaries.

## Self-Check: PASSED

- [x] `data/checklist_pipeline.py` contains `_owns_connection` — FOUND (commit 6f04cbe)
- [x] `data/resolve_checklist_names.py` has `^TAXA_PATH =` — FOUND (commit 6f04cbe)
- [x] `data/tests/fixtures/checklist_sample.csv` — FOUND (commit bd812f0)
- [x] `data/tests/fixtures/taxa_subset.csv.gz` — FOUND (commit bd812f0)
- [x] `data/tests/fixtures/README` — FOUND (commit bd812f0, contains "Distilled from")
- [x] Commits verified in git log: 6f04cbe, bd812f0
