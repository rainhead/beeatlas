---
phase: 134-full-fidelity-ingest
plan: 02
type: execute
requirements: [ING-01, ING-02, ING-03]
status: complete
---

# Plan 134-02 Summary: Full-fidelity checklist loader

## What was built

Extended `data/checklist_pipeline.py` with the full-fidelity occurrence loader (ING-01/02/03):

- **`_parse_checklist_date(raw) -> (year, month, day, date_quality)`** — stdlib-first date
  normalizer (D-05/D-07/D-09). Handles ISO datetime (`1991-07-12T00:00:00`, time dropped),
  ISO date (`1812-06-18`, pre-1900 works — uses `date.fromisoformat`, not strftime), M/D/YYYY
  (`6/14/1905`, parsed US month-first deterministically), pure year (`1995` → `year_only`), and
  empty/unparseable (→ `none` with NULL y/m/d). `date_quality` is restricted to the enum
  `full` / `year_only` / `none`.
- **`_coord_flag(lat, lon) -> str`** — coordinate classifier (D-01/D-03). Tests null FIRST, then
  exact-zero (`0/0` → `zero_coord`, Gulf-of-Guinea guard, BEFORE bbox), then tight WA bbox
  membership (`lat ∈ [45.5, 49.0]`, `lon ∈ [-124.85, -116.9]`, inclusive). Returns one of
  `valid` / `null_coord` / `zero_coord` / `out_of_bbox`.
- **`_load_checklist_records_full(con)`** — reads the committed `checklist_records_full.csv` via
  `csv.DictReader` (comma-delimited), builds a `records` list calling the two helpers per row,
  `CREATE OR REPLACE TABLE checklist_data.checklist_records_full` with explicit typed columns, and
  bulk-inserts via `executemany`. Uses `Latitude`/`Longitude` only (ignores redundant `x`/`y`, D-02);
  `verbatim_name` is the raw `Scientific Name` with authority intact, unmodified (D-12); preserves
  `ObjectID`/`family`/`genus` for traceability. Logs a summary count + a per-reason coord-exclusion
  breakdown (D-04).
- Wired into `load_checklist()` with a single added call immediately after `_load_checklist_records(con)`
  — strictly additive (D-10); the old loader, `checklist_records` table, and `run.py` are untouched.

Added integration + unit tests in `data/tests/test_checklist_pipeline.py` (helper unit tests written
RED→GREEN; table integration tests reuse the `checklist_db` fixture).

## Verification

Validated the loader in a single full `load_checklist()` run (all invariants the test suite asserts):

| Check | Result |
|-------|--------|
| Row count | 50,646 (BETWEEN 50000–51000, SC#1) |
| Schema (13 cols incl. ObjectID/family/genus + coord_flag + y/m/d/date_quality) | PASS (D-12) |
| No `valid` row with lat=0/lon=0 | PASS (SC#2) |
| No `valid` row outside WA bbox | PASS (SC#2) |
| `coord_flag` domain | all in valid enum; `null_coord`=4595 |
| Coord exclusion breakdown logged | `null_coord=4595, zero_coord=2, out_of_bbox=122` (excluded=4719, D-04) |
| `date_quality` domain | all in (full/year_only/none) |
| `1812-06-18` (pre-1900 ISO) | → (1812, 6, 18, full) (SC#3) |
| `6/14/1905` (M/D/YYYY) | → (1905, 6, 14, full) (SC#3) |
| empty date → `none` + year NULL | PASS (SC#3) |
| Old `checklist_records` table intact | `[scientificName, county, year, month]` (D-10) |

Module imports cleanly. `ruff` is not a project dependency in this environment, so the planned
`ruff check` could not run; the two new `print` lines carry `# noqa: T201` as specified.

## Deviations

- **Recovery path:** The executor agent completed both tasks' implementation but was interrupted
  during its self-check (the orchestrator's tool result was lost). Task 1 was already committed
  (`b35c479`); Task 2's implementation was complete but uncommitted in the worktree. The orchestrator
  validated correctness via a one-shot single-load script (above), then committed Task 2 (`b6243da`)
  and this SUMMARY.
- **Test performance (flagged, not fixed):** The 11 new `checklist_records_full` integration tests use
  the function-scoped `checklist_db` fixture, so each re-runs the full `load_checklist()` (a ~3-min
  50k-row `executemany`). Running them all serially takes ~35 min, which stalled the executor's
  self-check. The tests are correct; this is a suite-performance concern (candidate: a module-scoped
  load shared across the read-only assertions). Left for a follow-up decision.

## Pre-existing, out of scope

18 failures in `tests/test_dbt_diff.py` and `tests/test_resolve_taxon_ids.py` predate phase 134
(introduced phases 126/127; require a dbt-built `dbt_sandbox.occurrence_synonyms` in the fixture DB).
Untouched by this phase.
