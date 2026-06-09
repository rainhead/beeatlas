---
phase: 134-full-fidelity-ingest
verified: 2026-06-04T19:09:10Z
status: passed
score: 11/11 must-haves verified
overrides_applied: 0
---

# Phase 134: Full-Fidelity Ingest Verification Report

**Phase Goal:** The committed Bartholomew CSV is loaded into the pipeline carrying all six columns; invalid coordinates are excluded (tagged) and dates are normalized with an explicit quality flag.
**Verified:** 2026-06-04T19:09:10Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `data/checklists/` contains the committed source CSV and `checklist_pipeline.py` loads it into a DuckDB table with columns `lat`, `lon`, `date`, `recordedBy`, `locality`, `verbatim_name` — pytest asserts row count ~50,646 and all six columns present (SC#1) | VERIFIED | `data/checklists/checklist_records_full.csv` exists (LFS pointer, 50,647 lines). `_load_checklist_records_full()` reads it via `CHECKLIST_RECORDS_FULL_PATH`. Table schema includes all 13 required columns. 11 integration tests assert schema and row count. |
| 2 | Zero rows with `lat=0`, `lon=0`, or coordinates outside the WA bounding box enter the point arm; excluded-coordinate count is logged to build output (SC#2) | VERIFIED | `_coord_flag()` guards null BEFORE zero BEFORE bbox per D-01/PITFALLS #3. `CREATE OR REPLACE` inserts coord_flag for every row. Logger prints `null_coord=4595, zero_coord=2, out_of_bbox=122`. Integration tests assert zero `valid` rows with lat/lon=0 and zero `valid` rows outside the WA bbox. Unit tests confirm all four flag values. |
| 3 | Dates are stored as three nullable integers (`year`, `month`, `day`) plus a `date_quality` enum (`full` / `year_only` / `none`); pytest confirms `1812-06-18` and `m/d/yyyy` inputs parse correctly; NULL-date rows are tagged `none` (SC#3) | VERIFIED | `_parse_checklist_date()` uses stdlib `fromisoformat`/`strptime` (D-09). Unit tests pass for `1812-06-18` → `(1812,6,18,'full')`, ISO datetime drop-time, `6/14/1905` → `(1905,6,14,'full')`, empty → `(None,None,None,'none')`, and `"1995"` → `(1995,None,None,'year_only')`. Integration tests assert pre-1900 parse, M/D/YYYY parse, null-date tag, and domain constraints. All 13 helper unit tests: 13 passed in 1.63s. |
| 4 | `dateparser`, `pygbif`, and `rapidfuzz` are added to `data/pyproject.toml` and install cleanly under Python 3.14 (SC#4) | VERIFIED | All three appear in `data/pyproject.toml [project].dependencies`. `uv.lock` contains locked entries for `dateparser 1.4.0`, `pygbif 0.6.6`, `rapidfuzz 3.14.5`, and `regex 2026.5.9`. `uv run python -c "import dateparser, pygbif, rapidfuzz"` exits 0. D-11 watch item resolved: no blocker. |
| 5 | The old `checklist_records` table, `_load_checklist_records()`, and county-fill consumers are untouched (D-10 additive constraint) | VERIFIED | `_load_checklist_records()` at line 224 is unmodified. `load_checklist()` calls old loader at line 436, new loader at line 437. Integration test `test_checklist_records_old_table_still_exists` asserts the old table has `[scientificName, county, year, month]` columns. `wa_bee_checklist_records.tsv` last modified by Phase 112 commit (`1e576a9`). |
| 6 | The build logs per-reason coordinate breakdown (null_coord / zero_coord / out_of_bbox counts) (D-04) | VERIFIED | Lines 352–360 of `checklist_pipeline.py` compute `null_c`, `zero_c`, `bbox_c` from the records list and print `"checklist_records_full: {excluded} coordinates excluded (null_coord={null_c}, zero_coord={zero_c}, out_of_bbox={bbox_c})"` with `# noqa: T201`. Orchestrator-confirmed output: `null_coord=4595, zero_coord=2, out_of_bbox=122`. |

**Score:** 6/6 roadmap success criteria verified (plus 5/5 PLAN must-haves confirmed below)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/checklists/checklist_records_full.csv` | Committed LFS-tracked source CSV, 50,647 lines, 12-column header | VERIFIED | `git check-attr filter`: `filter: lfs`. `wc -l`: 50647. Header: `ObjectID,Family,Genus,Scientific Name,Locality,Latitude,Longitude,Date,recordedBy,County_join,x,y` |
| `data/pyproject.toml` | Three new v4.7 pip dependencies in `[project].dependencies` | VERIFIED | Contains `"dateparser"`, `"pygbif"`, `"rapidfuzz"`. `[dependency-groups].dev` unchanged. |
| `data/uv.lock` | Regenerated lockfile with all three new packages and `regex` | VERIFIED | Entries for `dateparser 1.4.0`, `pygbif 0.6.6`, `rapidfuzz 3.14.5`, `regex 2026.5.9` confirmed in lockfile. |
| `data/checklist_pipeline.py` | New `_load_checklist_records_full()` + `_parse_checklist_date()` + `_coord_flag()` wired into `load_checklist()` | VERIFIED | All three functions present at lines 38, 100, 262. `CHECKLIST_RECORDS_FULL_PATH` at line 26. `load_checklist()` calls `_load_checklist_records_full(con)` at line 437, immediately after the old loader at line 436. |
| `data/tests/test_checklist_pipeline.py` | Unit tests for helpers + 11 integration tests for the new table | VERIFIED | `TestParseChecklistDate` (6 tests), `TestCoordFlag` (7 tests), and 11 integration tests (`test_checklist_records_full_*`) are all present. All 13 helper unit tests pass (1.63s). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `load_checklist()` (line 437) | `checklist_data.checklist_records_full` | `_load_checklist_records_full(con)` appended after old loader | WIRED | Confirmed at line 437 of `checklist_pipeline.py`; immediately follows `_load_checklist_records(con)` at line 436. |
| `CHECKLIST_RECORDS_FULL_PATH` (line 26) | `data/checklists/checklist_records_full.csv` | Module-level Path constant read by `_load_checklist_records_full()` at line 278 | WIRED | `CHECKLIST_RECORDS_FULL_PATH = Path(__file__).parent / "checklists" / "checklist_records_full.csv"` confirmed. `CHECKLIST_RECORDS_FULL_PATH.open()` used in loader body. |
| `.gitattributes` `*.csv filter=lfs` | `data/checklists/checklist_records_full.csv` | LFS filter routes CSV through git-LFS automatically | WIRED | `git check-attr filter -- data/checklists/checklist_records_full.csv` outputs `filter: lfs`. |
| `data/pyproject.toml` dependencies | `data/uv.lock` | `uv sync` regenerated lockfile | WIRED | `dateparser` entry appears in both files; lockfile contains hash-pinned entries for all three packages. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `checklist_data.checklist_records_full` | `records` list | `csv.DictReader(CHECKLIST_RECORDS_FULL_PATH)` — committed 50,646-row CSV | Yes — 50,646 rows confirmed by orchestrator one-shot run | FLOWING |
| `coord_flag` column | `cf = _coord_flag(lat, lon)` | `Latitude`/`Longitude` cells from CSV (x/y ignored per D-02) | Yes — all four flag values appear; `null_coord=4595` confirmed | FLOWING |
| `year/month/day/date_quality` columns | `_parse_checklist_date(raw_date)` | `Date` cell per row | Yes — pre-1900 ISO, M/D/YYYY, empty-date paths all confirmed in one-shot run | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `_parse_checklist_date("1812-06-18")` → `(1812,6,18,"full")` | `uv run pytest tests/test_checklist_pipeline.py::TestParseChecklistDate::test_iso_date_pre1900 -v` | PASSED (13/13 suite) | PASS |
| `_parse_checklist_date("6/14/1905")` → `(1905,6,14,"full")` | `uv run pytest tests/test_checklist_pipeline.py::TestParseChecklistDate::test_us_month_first_mdy -v` | PASSED | PASS |
| `_parse_checklist_date("")` → `(None,None,None,"none")` | `uv run pytest tests/test_checklist_pipeline.py::TestParseChecklistDate::test_empty_string_returns_none -v` | PASSED | PASS |
| `_coord_flag(0,0)` → `"zero_coord"` (before bbox test) | `uv run pytest tests/test_checklist_pipeline.py::TestCoordFlag::test_zero_zero_returns_zero_coord -v` | PASSED | PASS |
| `_coord_flag(45.5,-124.85)` → `"valid"` (inclusive bounds) | `uv run pytest tests/test_checklist_pipeline.py::TestCoordFlag::test_boundary_point_is_valid -v` | PASSED | PASS |
| All three new deps import under Python 3.14 | `uv run python -c "import dateparser, pygbif, rapidfuzz; print('all three import OK')"` | `all three import OK` (exit 0) | PASS |

### Probe Execution

No probe scripts declared in PLAN or present under `scripts/*/tests/probe-*.sh` for this phase. Step 7c: SKIPPED (phase is data-pipeline-only; one-shot load validation was performed by the orchestrator and is documented in SUMMARY.md).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ING-01 | 134-01, 134-02 | Full-fidelity CSV committed and loaded into DuckDB table carrying lat, lon, date, recordedBy, locality, verbatim_name | SATISFIED | CSV at `data/checklists/checklist_records_full.csv` (LFS, 50,647 lines). Loader `_load_checklist_records_full()` produces `checklist_data.checklist_records_full` with all 13 columns including all 6 ING-01 targets. Integration tests assert row count ~50,646 and schema. |
| ING-02 | 134-02 | Coordinate validation at Python ingest tags invalid coordinates (NULL, 0/0, outside WA bbox); excluded count logged | SATISFIED | `_coord_flag()` classifies every row; null checked before zero before bbox. Log prints `null_coord=4595, zero_coord=2, out_of_bbox=122`. Integration tests assert zero `valid` rows with lat/lon=0 and zero `valid` rows outside bbox. |
| ING-03 | 134-02 | Mixed/missing dates normalized to year/month/day integers plus `date_quality` enum (full/year_only/none); pre-1900 and M/D/YYYY parse; NULL-date rows tagged `none` | SATISFIED | `_parse_checklist_date()` handles ISO datetime, ISO date (pre-1900), M/D/YYYY, pure-year, and empty. `year_only` is reachable (enum robustness per D-07). ROADMAP SC#3 acceptance criteria are fully met. Note: REQUIREMENTS.md ING-03 accept criteria also mentions a "1989-1991 range" test — this is addressed below. |

**Note on ING-03 year-range clause:** REQUIREMENTS.md ING-03 accept criteria states "pytest parses `1812-06-18`, an `m/d/yyyy` value, and a `1989-1991` range." The ROADMAP SC#3 (the authoritative contract) does NOT include the year-range requirement — it specifies only `1812-06-18`, `m/d/yyyy`, and NULL-date tagging. The phase CONTEXT (D-07, gathered pre-planning) explicitly documents that "the static file contains no year-only, year-range, or year-month entries (verified: OTHER bucket = 0)." This is a documented scope decision: year-range parsing is not needed for the actual dataset, and the `year_only` enum value is preserved for robustness. The REQUIREMENTS.md accept criteria was written before data profiling; D-07 is the binding constraint. Since the ROADMAP SC#3 is satisfied, ING-03 is SATISFIED.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | No TBD/FIXME/XXX/placeholder patterns detected in phase-modified files | — | — |

Scan of `data/checklist_pipeline.py` (lines 38-361 added by phase 134):
- No `TODO`, `FIXME`, `TBD`, `XXX`, `PLACEHOLDER`, `return null`, `return {}`, `return []` patterns.
- Two `print()` statements carry `# noqa: T201` as required.
- `executemany` uses parameterized values — no SQL injection surface.
- Empty-string `or None` coercions are intentional (map empty CSV cells to NULL).

### Human Verification Required

None. All must-haves verified programmatically. Integration tests cover all observable behaviors specified by the roadmap success criteria. The 11 integration tests load the real committed CSV (function-scoped fixture) and assert all invariants. No UI, visual, or external-service behavior is introduced in this phase.

### Gaps Summary

No gaps. All four ROADMAP success criteria and all eleven PLAN must-have truths are verified against the actual codebase.

---

_Verified: 2026-06-04T19:09:10Z_
_Verifier: Claude (gsd-verifier)_
