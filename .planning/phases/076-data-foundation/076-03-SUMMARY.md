---
phase: 076-data-foundation
plan: 03
subsystem: data-pipeline

tags: [data-pipeline, checklist, duckdb, taxonomy]

# Dependency graph
requires:
  - phase: 076-data-foundation
    provides: "canonicalize() helper from Plan 02 (D-04 5-step algorithm)"
  - phase: 076-data-foundation
    provides: "checklist TSV vetted by Plan 01 research (Bartholomew et al. 2024)"
provides:
  - "checklist_data.species table (527 distinct WA species, 11-column schema, status='verified')"
  - "checklist_data.species_counties sibling table (2861 per-(species, county) rows)"
  - "load_checklist() pipeline step wired into run.py STEPS at locked CHECK-04 position"
  - "canonical_name materialized on the checklist side of the join (occurrences side ships in Plan 05)"
affects:
  - "076-04 (taxon-lineage) — populates family/subfamily/tribe NULL columns via iNat lineage in Phase 77"
  - "076-05 (occurrences canonical_name + reconciliation) — joins ecdysis_data.occurrences against checklist_data.species on canonical_name"
  - "076-06 (integration tests) — asserts full schema + row content end-to-end"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "csv.DictReader(f, delimiter='\\t') for TSV ingest (RESEARCH.md §Don't Hand-Roll)"
    - "CREATE OR REPLACE TABLE for full-refresh DuckDB pipelines (geographies_pipeline analog)"
    - "try/finally con.close() for new pipeline modules (PATTERNS.md §Shared Patterns)"
    - "DB-level CHECK constraint enforces enum at INSERT (status IN ('verified', 'likely-to-occur'))"

key-files:
  created:
    - "data/checklist_pipeline.py — load_checklist(), 103 LOC"
    - "data/tests/test_checklist_pipeline.py — 8 tests (schema, content, idempotency, source citation)"
  modified:
    - "data/run.py — added import + STEPS tuple between anti-entropy and export"

key-decisions:
  - "Followed PLAN verbatim — verbatim code template from <action> block, no shape changes"
  - "Used CREATE OR REPLACE TABLE (not dlt) per CHECK-02 — idempotent full refresh on every run"
  - "Left family/subfamily/tribe/subgenus/notes as NULL — Plan 04 (Phase 77 TAX-02) will populate from iNat lineage"
  - "Did NOT touch _apply_migrations() — out of scope for this plan"
  - "Did NOT add ecdysis_data.occurrences.canonical_name column or reconcile() — both deferred to Plan 05"

patterns-established:
  - "Phase 76 pipeline modules follow geographies_pipeline.py shape: module-level constants for paths, single load_*() function, __main__ guard, try/finally connection close"
  - "Test fixture uses monkeypatch.setenv('DB_PATH', ...) + importlib.reload(module) to inject isolated DB; works because module reads DB_PATH at import time"

requirements-completed: [CHECK-02, CHECK-03, CHECK-04]

# Metrics
duration: 14min
completed: 2026-05-03
---

# Phase 076 Plan 03: Checklist Loader Summary

**WA bee checklist (Bartholomew et al. 2024) loaded into checklist_data.species (527 species) + checklist_data.species_counties (2861 rows) via CREATE OR REPLACE, wired into run.py between anti-entropy and export.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-05-03T05:31:00Z (approx — worktree branch check)
- **Completed:** 2026-05-03T05:45:43Z
- **Tasks:** 2 (Task 1 TDD: test+impl; Task 2: run.py wire-up)
- **Files modified:** 3 (1 created pipeline, 1 created test, 1 edited run.py)

## Accomplishments

- `data/checklist_pipeline.py` ships `load_checklist()` reading the 2862-row TSV via `csv.DictReader(delimiter='\t')` — produces 527 distinct species + 2861 (species, county) rows
- 11-column locked schema on `checklist_data.species` matches D-04 + CHECK-03 verbatim, with DB-level CHECK on status enum
- Every species row has `canonical_name = canonicalize(scientificName)` and `status = 'verified'` (D-02, D-04)
- `data/run.py` STEPS list grows from 8 to 9 entries with `("checklist", load_checklist)` inserted at the locked CHECK-04 position (between anti-entropy and export)
- 8-test suite (`test_checklist_pipeline.py`) covers schema, row content, canonical_name correctness, sibling table shape, source citation, idempotency, and NULL columns

## Task Commits

Each task was committed atomically:

1. **Task 1 RED — failing tests** — `655ed48` (test)
2. **Task 1 GREEN — load_checklist implementation** — `04db425` (feat)
3. **Task 2 — wire load_checklist into run.py STEPS** — `2825b25` (feat)

_REFACTOR phase skipped — code emerged clean from the verbatim plan template; no cleanup needed._

## Files Created/Modified

- `data/checklist_pipeline.py` — 103 LOC; reads TSV, populates `checklist_data.species` (11 cols incl `canonical_name`) and `checklist_data.species_counties` via `CREATE OR REPLACE`
- `data/tests/test_checklist_pipeline.py` — 178 LOC; 8 isolated-DB tests using `monkeypatch.setenv('DB_PATH', ...)` + `importlib.reload`
- `data/run.py` — +2 lines (import + STEPS tuple); STEPS now `[ecdysis, ecdysis-links, inaturalist, waba, projects, anti-entropy, checklist, export, feeds]`

## Decisions Made

- Followed plan verbatim — the `<action>` block provided a complete code template; no structural deviations
- Inserted `import checklist_pipeline` import in alphabetical-adjacent position to `anti_entropy_pipeline` (matches existing block pattern)
- Test fixture pattern: `monkeypatch.setenv('DB_PATH', ...) + importlib.reload(checklist_pipeline)` — required because the module reads `DB_PATH` at import time

## Verification Results

Smoke test against fresh DuckDB at `/tmp/checklist_smoke.duckdb`:

```
checklist: 527 species, 2861 county records
species=527 null_canon=0 non_verified=0 county_rows=2861
```

- `checklist_data.species`: **527** rows (plan predicted ~527 — exact match)
- `checklist_data.species_counties`: **2861** rows (plan predicted ~2862 — 1 row likely had blank county and was filtered by the `if cty:` guard)
- `canonical_name IS NULL` count: **0** (D-04 satisfied)
- `status <> 'verified'` count: **0** (D-02 satisfied)
- STEPS order assertion: **PASS** — exactly `[ecdysis, ecdysis-links, inaturalist, waba, projects, anti-entropy, checklist, export, feeds]`
- Full pytest sweep: **52/52 passed** (no regressions in canonical_name, export, feeds, transforms tests)
- `_apply_migrations()` modified: **NO** (out of scope confirmed)

## Deviations from Plan

None — plan executed exactly as written. The `<action>` block contained a complete code template that compiled and passed all tests on first run. No Rule 1/2/3 auto-fixes triggered.

## Issues Encountered

- One process error: initial Bash `cd /Users/rainhead/dev/beeatlas && git commit ...` accidentally landed the test commit on the main checkout instead of the worktree (cwd-reset behavior). Reverted with `git -C /Users/rainhead/dev/beeatlas reset --hard HEAD~1` (main was at the same SHA as worktree base, so safe). Re-wrote test file using the worktree absolute path and re-committed inside the worktree branch. No work lost; main was restored to its original state.

## User Setup Required

None — no external service configuration required. Plan adds a Python module + 1 step to the orchestrator; runs locally via `cd data && uv run python run.py`.

## Threat Flags

None — plan only modifies pipeline orchestration and adds a new schema (`checklist_data`). The threat register's two `mitigate` items (T-76-01 path-traversal, T-76-06 status enum) are both addressed by the verbatim implementation: `CHECKLIST_PATH` is a module-level `Path(__file__).parent / ...` literal, and `status VARCHAR CHECK (status IN ('verified', 'likely-to-occur'))` enforces the enum at the DB layer.

## Self-Check: PASSED

- `data/checklist_pipeline.py` — FOUND (103 LOC ≥ 80 minimum)
- `data/tests/test_checklist_pipeline.py` — FOUND
- `data/run.py` — modified (import + STEPS tuple verified by `grep` and `import run` assertions)
- Commit `655ed48` (test) — FOUND in worktree-agent-af7ed568 history
- Commit `04db425` (feat impl) — FOUND
- Commit `2825b25` (feat wire-up) — FOUND

## Next Phase Readiness

- **Plan 05 (occurrences canonical_name + reconciliation):** READY — `checklist_data.species` exists with `canonical_name` populated; Plan 05 can `ALTER TABLE ecdysis_data.occurrences ADD COLUMN canonical_name` and JOIN against this table.
- **Plan 04 (taxon-lineage):** READY in parallel — populates the NULL `family`/`subfamily`/`tribe` columns via Phase 77 TAX-02 enrichment from iNat lineage data.
- **Plan 06 (integration tests):** READY — schema + row content shape stable; integration tests can assert exact column ordering, status enum, canonical_name population, and per-county row preservation.

---
*Phase: 076-data-foundation*
*Completed: 2026-05-03*
