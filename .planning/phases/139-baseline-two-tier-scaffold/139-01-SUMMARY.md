---
phase: 139-baseline-two-tier-scaffold
plan: "01"
subsystem: testing
tags: [pytest, markers, two-tier, baseline, pyproject]

# Dependency graph
requires: []
provides:
  - "integration pytest marker registered in data/pyproject.toml with addopts default deselection"
  - "2 dataset-validation tests tagged @pytest.mark.integration in test_checklist_pipeline.py"
  - "data/tests/BASELINE.md: per-tier estimates, < 5 min and ~10 min targets, dominant cost contributors, honest ~19-failure red inventory"
affects:
  - 140-fixture-distillation
  - 141-systematic-tagging
  - 142-budget-verification
  - 143-ci-gate

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-tier pytest split: build-time (validates code) vs nightly/integration (validates datasets)"
    - "addopts = -m 'not integration' for default deselection; opt-in via -m integration"
    - "Marker registration in [tool.pytest.ini_options].markers (single pytest config home)"

key-files:
  created:
    - data/tests/BASELINE.md
  modified:
    - data/pyproject.toml
    - data/tests/test_checklist_pipeline.py

key-decisions:
  - "Marker named 'integration' (not 'slow') — emphasizes validates-datasets purpose (D-05)"
  - "Opt-in is stock -m integration only — no custom --run-integration flag (D-06)"
  - "Baseline is an estimate, not a full timed run — ~40 min suite not paid (D-01)"
  - "Tagged exactly 2 tests (row count + schema); bulk tagging deferred to Phase 141 (D-07)"
  - "BASELINE.md framed as living doc; Phase 142 updates with measured after-numbers (D-08)"

patterns-established:
  - "Decision criterion for integration marker: 'validates data' not 'is slow'"
  - "BASELINE.md location: data/tests/BASELINE.md"

requirements-completed:
  - TPERF-01
  - TTIER-01

# Metrics
duration: 3min
completed: 2026-06-05
---

# Phase 139 Plan 01: Baseline & Two-Tier Scaffold Summary

**`integration` pytest marker + addopts default deselection scaffolded; BASELINE.md anchors v4.8 with per-tier estimates, < 5 min / ~10 min targets, dominant cost contributors, and honest ~19-failure red inventory**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-05T23:44:36Z
- **Completed:** 2026-06-05T23:47:19Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- `integration` marker registered in `data/pyproject.toml`; `addopts = -m "not integration"` makes stock `cd data && uv run pytest` run the build-time tier only
- Two dataset-validation tests tagged `@pytest.mark.integration` in `test_checklist_pipeline.py` (row-count and schema assertions for the 50,646-row checklist CSV); two-tier harness proven with `--collect-only` — zero suite runtime paid
- `data/tests/BASELINE.md` committed: approximate per-tier estimates, both hard targets (< 5 min CI gate, ~10 min nightly stretch), three dominant cost contributors, honest ~19-failure red inventory by file, reproduce command, and living-doc framing for Phase 142 update

## Task Commits

Each task was committed atomically:

1. **Task 1: Register integration marker and default-deselect via addopts** - `cbc2aef` (feat)
2. **Task 2: Tag 2 dataset-validation tests @pytest.mark.integration** - `2d0f583` (feat)
3. **Task 3: Create BASELINE.md living doc** - `1ce7cc7` (docs)

## Files Created/Modified

- `data/pyproject.toml` - Added `markers` array and `addopts = -m "not integration"` to `[tool.pytest.ini_options]`
- `data/tests/test_checklist_pipeline.py` - Added `@pytest.mark.integration` above `test_checklist_records_full_row_count` and `test_checklist_records_full_schema`
- `data/tests/BASELINE.md` - New: per-tier estimates, targets, cost contributors, red inventory, reproduce command

## Decisions Made

- Used `integration` marker name (not `slow` or `nightly`) — emphasizes "validates real datasets" purpose, per CONTEXT.md D-05
- Stock `-m integration` opt-in only — no custom `--run-integration` flag (D-06); kept pytest interface minimal
- Baseline captured as estimates from known dominant costs, not a full ~40-min timed run (D-01/D-02)
- Tagged exactly 2 tests to prove the mechanism; systematic tagging is Phase 141 (D-07)
- `data/tests/BASELINE.md` as the living doc location (D-08); Phase 142 updates with measured numbers

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. All changes are Python config and documentation.

## Next Phase Readiness

- Two-tier harness is ready; Phase 140 (fixture distillation) and Phase 141 (systematic tagging + red-test fixes) can both build on the `integration` marker
- BASELINE.md provides the before-anchor; Phase 142 will update it with measured after-numbers once Phases 140-141 land
- No blockers

## Self-Check

- `data/pyproject.toml` modified: verified via `git log` (cbc2aef)
- `data/tests/test_checklist_pipeline.py` modified: verified via `git log` (2d0f583)
- `data/tests/BASELINE.md` created: verified via `git log` (1ce7cc7)
- All 3 task commits confirmed present in git history

---
*Phase: 139-baseline-two-tier-scaffold*
*Completed: 2026-06-05*
