---
phase: 139-baseline-two-tier-scaffold
verified: 2026-06-05T23:55:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
re_verification: false
---

# Phase 139: Baseline & Two-Tier Scaffold — Verification Report

**Phase Goal:** The current suite's actual runtime is measured and documented; the two-tier marker infrastructure is in place so all subsequent phases have a before/after number and a fast/slow harness.
**Verified:** 2026-06-05T23:55:00Z
**Status:** passed
**Re-verification:** No — initial verification

**Authority note:** Verified against CONTEXT.md locked decisions (D-01..D-08), not stale ROADMAP.md wording. Marker name `integration` (not `slow`), no custom flag, estimate-not-timed-run, 1-2 tags only — all correct per CONTEXT.md.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Stock `cd data && uv run pytest` runs ONLY the build-time tier (integration tests deselected by default) | VERIFIED | `addopts = "-m 'not integration'"` in `data/pyproject.toml` confirmed; `--collect-only` shows 261/263 collected, 2 deselected |
| 2 | `cd data && uv run pytest -m integration` SELECTS the integration-tagged tests, overriding the default deselection | VERIFIED | `--collect-only -q` output: `2/263 tests collected (261 deselected)` — both `test_checklist_records_full_row_count` and `test_checklist_records_full_schema` appear |
| 3 | The integration marker is registered, so no PytestUnknownMarkWarning is emitted | VERIFIED | `uv run pytest -W error::pytest.PytestUnknownMarkWarning -m integration --collect-only -q -k test_checklist_records_full_row_count` collected 1 test, exit 0, no warning |
| 4 | A committed BASELINE.md records per-tier estimate baselines, the two targets, dominant cost contributors, and the ~19-failure red inventory | VERIFIED | `data/tests/BASELINE.md` exists; grep confirms `## Targets`, `< 5 min`, `~10 min`, all three dominant cost contributors named, ~19-failure table present with per-file breakdown |
| 5 | BASELINE.md is honest that the suite is currently partly red (~19 known failures) | VERIFIED | BASELINE.md line 69: "## Current Red-Test Inventory (~19 known failures)" and line 71: "**The suite is currently partly red.**" — explicit, prominent, honest |

**Score:** 5/5 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/pyproject.toml` | integration marker registration + addopts default deselection | VERIFIED | Contains `addopts = "-m 'not integration'"` and `markers = ["integration: validates real datasets/built artifacts (nightly tier); deselected by default"]` under `[tool.pytest.ini_options]` |
| `data/tests/test_checklist_pipeline.py` | 1-2 dataset-validation tests tagged `@pytest.mark.integration` | VERIFIED | Exactly 2 decorators at lines 363 and 378 — `test_checklist_records_full_row_count` and `test_checklist_records_full_schema` |
| `data/tests/BASELINE.md` | committed baseline doc with tier estimates, targets, cost contributors, red inventory | VERIFIED | File exists; contains `## Targets`, `< 5 min`, `~10 min`, ESTIMATES framing (line 24), all 3 cost contributors, red inventory table, reproduce command, living-doc framing |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `data/pyproject.toml` | `data/tests/test_checklist_pipeline.py` | `addopts -m 'not integration'` deselects tagged tests by default | WIRED | `--collect-only` with default addopts: 261 collected, 2 deselected — the 2 integration tests excluded |
| `data/pyproject.toml` | pytest marker registry | `markers = [...]` registration silences unknown-mark warning | WIRED | `-W error::pytest.PytestUnknownMarkWarning` produced no warning; marker fully registered |

---

## Data-Flow Trace (Level 4)

Not applicable. Phase artifacts are pytest configuration and a documentation file — no dynamic data rendering.

---

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `uv run pytest --collect-only` (addopts default) excludes integration tests | `cd data && uv run pytest --collect-only -q` | 261/263 collected, 2 deselected | PASS |
| `-m integration` selects integration tests | `cd data && uv run pytest -m integration --collect-only -q` | 2/263 collected (261 deselected): both row_count + schema tests listed | PASS |
| `-m "not integration"` excludes integration tests | `cd data && uv run pytest -m "not integration" --collect-only -q` | 261/263 collected, 2 deselected | PASS |
| No PytestUnknownMarkWarning for `integration` marker | `cd data && uv run pytest -W error::pytest.PytestUnknownMarkWarning -m integration --collect-only -q -k test_checklist_records_full_row_count` | 1/263 collected, exit 0, no warning | PASS |
| BASELINE.md content gate | `grep -q '## Targets' && grep -q '< 5 min' && grep -q '~10 min'` | All 3 patterns found | PASS |

---

## Probe Execution

Not applicable. No probe scripts declared or conventional for this phase type (config + documentation).

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| TPERF-01 | Reproducible runtime baseline committed — `data/tests/BASELINE.md` records totals and top time sinks; reproducible via documented command | SATISFIED | `data/tests/BASELINE.md` exists with per-tier estimates (marked approximate per D-01), `## Reproduce Command` section with `--durations=10` and per-file commands; living-doc framing explicit |
| TTIER-01 | `integration` pytest marker registered; `addopts` deselects it by default; opt-in via `-m integration` | SATISFIED | `data/pyproject.toml` registers marker + `addopts = "-m 'not integration'"`; proven with `--collect-only` that both directions work; no custom flag (correct per D-06) |

No orphaned requirements. Both Phase 139 requirements (TPERF-01, TTIER-01) are satisfied. TPERF-02 and TTIER-02/03 are correctly assigned to later phases and are not expected here.

**TPERF-01 accept criteria check:** The REQUIREMENTS.md accept criteria say "a `data/tests/BASELINE.md` records measured totals and the top time sinks; reproducible via a documented command." The baseline is estimates rather than a measured timed run — this is explicitly authorized by CONTEXT.md D-01/D-02, which supersedes stale ROADMAP wording. The accept criteria's intent (known starting point + reproduce path) is fully met.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | — | — | — |

Scanned `data/pyproject.toml`, `data/tests/test_checklist_pipeline.py`, and `data/tests/BASELINE.md` for TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER. Zero hits in any modified file.

---

## Human Verification Required

(none)

All observable truths were verifiable programmatically via `--collect-only`, grep, and git log. No UI behavior, real-time behavior, or external service integration involved.

---

## Gaps Summary

No gaps. All 5 must-have truths are VERIFIED, all 3 artifacts are substantive and wired, both requirement IDs are satisfied, and no anti-patterns were found. The two-tier harness is proven working without paying dataset-test runtime.

---

## Scope Fence Honored

Confirmed out-of-scope items were NOT performed:
- No fixture distillation (Phase 140)
- No red-test fixes (Phase 141)
- No bulk tagging — exactly 2 tests tagged (D-07)
- Full ~40-min suite not run — estimates only (D-01)
- `data/nightly.sh` not modified (Phase 142)
- No dbt/model changes
- No custom `--run-integration` flag added (D-06)
- No `conftest.py` modifications for marker registration

---

_Verified: 2026-06-05T23:55:00Z_
_Verifier: Claude (gsd-verifier)_
