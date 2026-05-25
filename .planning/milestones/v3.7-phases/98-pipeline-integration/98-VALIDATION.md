---
phase: 98
slug: pipeline-integration
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-17
approved: 2026-05-25
---

# Phase 98 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (uv run pytest) |
| **Config file** | data/pyproject.toml |
| **Quick run command** | `cd data && uv run pytest tests/ -x -q` |
| **Full suite command** | `cd data && uv run pytest tests/ -v` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/ -x -q`
- **After every plan wave:** Run `cd data && uv run pytest tests/ -v`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 98-01-01 | 01 | 1 | PPIPE-01 | — | N/A | integration | `cd data && uv run pytest tests/test_places_load.py -v` | ✅ | ✅ green |
| 98-01-02 | 01 | 1 | PPIPE-02 | — | N/A | integration | `cd data && bash data/dbt/run.sh build` | ✅ | ✅ green |
| 98-01-03 | 01 | 1 | PPIPE-03 | — | N/A | contract | `cd data && bash data/dbt/run.sh build` | ✅ | ✅ green |
| 98-02-01 | 02 | 1 | PPIPE-04 | — | N/A | integration | `cd data && uv run pytest tests/test_places_export.py -v` | ✅ | ✅ green |
| 98-02-02 | 02 | 1 | PPIPE-05 | — | N/A | manual | check git ls-files public/data/places.geojson | ✅ | ✅ green |
| 98-03-01 | 03 | 2 | PPAGE-03 | — | N/A | integration | `cd data && uv run pytest tests/test_places_maps.py -v` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `data/tests/test_places_load.py` — stubs for PPIPE-01 (geographies.places table creation)
- [x] `data/tests/test_places_export.py` — stubs for PPIPE-04 (places.geojson and places.json export)
- [x] `data/tests/test_places_maps.py` — stubs for PPAGE-03 (per-place SVG map generation)

*Existing infrastructure (pytest, conftest.py, fixture_db) covers all framework needs.*

---

## Historical Note

The Wave 0 checkboxes above appeared as `- [ ]` (unchecked) and the task rows showed `❌ W0` in the original draft of this validation document. Those markers reflected **planning-time state** — the test files did not yet exist when the VALIDATION.md was first authored (2026-05-17).

The Wave 0 RED tests were in fact written during execution, in compliance with the TDD gate:

- `0ae75a5` — `test(98-01): add failing pytest stubs` → produces `data/tests/test_places_load.py` (4 tests, RED)
- `fcd5e52` — `test(98-02): add failing pytest stubs` → produces `data/tests/test_places_export.py` (3 tests, RED)
- `3f9eea9` — `test(98-03): add failing pytest stubs for places_maps (RED)` → produces `data/tests/test_places_maps.py` (2 tests, RED)

All 9 tests pass as of Phase 115 verification (2026-05-25). The ❌ W0 and `wave_0_complete: false` markers have been corrected retroactively to reflect actual execution state.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| places.geojson and places.json committed to git | PPIPE-05 | Requires git commit in the repo | `git ls-files public/data/places.geojson public/data/places.json` — both must appear |
| `npm run build` succeeds in CI without running pipeline | PPIPE-05 | Requires clean checkout + npm build | Run `npm run build` and confirm it uses committed places files |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** retroactively approved 2026-05-25 (Phase 115)
