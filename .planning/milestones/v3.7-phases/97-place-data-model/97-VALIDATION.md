---
phase: 97
slug: place-data-model
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-18
approved: 2026-05-18
---

# Phase 97: Place Data Model — Validation

This VALIDATION.md was authored retroactively in Phase 115 (2026-05-25) because no VALIDATION.md was created at the time of Phase 97 execution. The content is derived from `97-VERIFICATION.md` (the contemporaneous verification report, status: passed, score: 5/5) and the two plan SUMMARY files (`097-01-SUMMARY.md`, `097-02-SUMMARY.md`). All PLC-01..04 behavior was confirmed by `uv run pytest tests/test_places_validation.py -v` (6 passed in 0.89s) on 2026-05-18. This file covers Phase 97 requirements (PLC-01..04) only; the five PPIPE requirements (Phase 98) are covered by 98-VALIDATION.md.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (uv run pytest) |
| **Config file** | data/pyproject.toml |
| **Quick run command** | `cd data && uv run pytest tests/test_places_validation.py -x -q` |
| **Full suite command** | `cd data && uv run pytest tests/ -v` |
| **Estimated runtime** | ~1 second (places_validation suite) |

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. The 6-test `test_places_validation.py` suite (`test_valid_places_pass`, `test_invalid_slug_chars`, `test_duplicate_slug`, `test_invalid_wkt`, `test_non_wgs84_coords`, `test_overlapping_polygons`) was created during Plan 097-02 execution as the verification suite for all PLC-03/04 boundary cases — no new test files needed beyond what 097-02 already wrote.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 97-01-01 | 01 | 1 | PLC-01 | — | N/A | manual+source | grep -c '\[\[places\]\]' content/places.toml | ✅ | ✅ green |
| 97-01-02 | 01 | 1 | PLC-02 | — | N/A | source | grep -E 'issuing_authority\|type' content/places.toml | ✅ | ✅ green |
| 97-01-03 | 01 | 1 | PLC-03 | — | N/A | unit | cd data && uv run pytest tests/test_places_validation.py::test_invalid_slug_chars tests/test_places_validation.py::test_duplicate_slug tests/test_places_validation.py::test_invalid_wkt tests/test_places_validation.py::test_non_wgs84_coords -v | ✅ | ✅ green |
| 97-01-04 | 01 | 1 | PLC-04 | — | N/A | unit | cd data && uv run pytest tests/test_places_validation.py::test_overlapping_polygons -v | ✅ | ✅ green |
| 97-02-01 | 02 | 1 | PLC-03, PLC-04 | — | N/A | unit | cd data && uv run pytest tests/test_places_validation.py -v | ✅ | ✅ green |
| 97-02-02 | 02 | 1 | PLC-01..04 | — | N/A | integration | cd data && uv run python -c "import sys; sys.path.insert(0, '.'); from places_validation import validate_places_step; validate_places_step()" | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| content/places.toml curation accuracy (real WA coords, plausible land_owner values) | PLC-01 | Requires human knowledge of WA geography and ownership | Reviewed at Phase 97 completion (2026-05-18); confirmed in 97-VERIFICATION.md "Behavioral Spot-Checks" |
| validate_places integrates with run.py STEPS at the correct position (before dbt-build) | PLC-03, PLC-04 | Requires inspecting run.py STEPS ordering | Confirmed in 97-VERIFICATION.md "Required Artifacts" row for data/run.py (line 40 import; line 86 STEPS entry) |

## Validation Sign-Off

- [x] Per-task verification map complete
- [x] All listed tests green via `cd data && uv run pytest tests/test_places_validation.py -v` (6 passed in 0.89s per 97-VERIFICATION.md)
- [x] Manual verifications confirmed by 97-VERIFICATION.md (status: passed, score: 5/5)
- [x] Wave 0 covered by Plan 097-02's `test_places_validation.py` (no separate Wave 0 plan needed)
- [x] Phase 97 VERIFICATION.md cross-referenced as source of truth

Approval: retroactively approved 2026-05-25 (Phase 115)
