---
phase: 116-code-quality-fixes
plan: "01"
subsystem: data-pipeline
tags: [validation, places, permits, pytest]
dependency_graph:
  requires: []
  provides: [permit-field-validation]
  affects: [data/places_validation.py, data/tests/test_places_validation.py]
tech_stack:
  added: []
  patterns: [fail-fast validation, pytest tmp_path fixtures]
key_files:
  created: []
  modified:
    - data/places_validation.py
    - data/tests/test_places_validation.py
decisions:
  - Permit validation inserted before geometry checks so invalid permit short-circuits before DuckDB spatial work begins
  - Missing permits key treated as empty list (no error) — conservative default
  - Fail on first missing required field per permit entry (single ValueError per violation)
metrics:
  duration: ~3 minutes
  completed: "2026-05-25"
  tasks_completed: 1
  files_modified: 2
requirements_completed: [CODE-01]
---

# Phase 116 Plan 01: Permit Field Validation Summary

**One-liner:** Added `issuing_authority` and `type` field validation for permit entries in `validate_places()`, with fail-fast behavior before geometry checks.

## What Was Built

`validate_places()` in `data/places_validation.py` now validates each permit entry in a place's `permits` list before executing DuckDB spatial checks. A missing `issuing_authority` or `type` field raises a descriptive `ValueError` identifying the offending place slug and field name. Missing the `permits` key entirely is treated as an empty list (no error).

Four new pytest cases cover: missing `issuing_authority`, missing `type`, empty `permits = []`, and omitted `permits` key.

The module docstring "Checks performed in order" list was updated to include the new step 3 (permit field validation), with geometry and overlap checks renumbered to 4–6.

## Task Commits

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Add permit field validation + 4 tests | 44f64fa | data/places_validation.py, data/tests/test_places_validation.py |

## Verification Results

```
10 passed in 0.71s
```

All 10 tests pass (6 pre-existing + 4 new). `validate_places_step()` against the real `content/places.toml` exits 0 — existing permit records are well-formed.

## Acceptance Criteria Status

- [x] `test_permit_missing_issuing_authority` passes
- [x] `test_permit_missing_type` passes
- [x] `test_empty_permits_list_passes` passes
- [x] `test_place_without_permits_key_passes` passes
- [x] `grep "permit missing required field" data/places_validation.py` returns a match inside `validate_places()`
- [x] `place.get("permits", [])` pattern used — no KeyError on missing key
- [x] Module docstring updated with permit validation step
- [x] Real `content/places.toml` still validates

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — this change only adds validation that rejects malformed input; no new network surface, auth paths, or schema changes.

## Self-Check: PASSED

- `data/places_validation.py` exists and contains "permit missing required field"
- `data/tests/test_places_validation.py` exists and contains all 4 new test names
- Commit `44f64fa` exists in git log
