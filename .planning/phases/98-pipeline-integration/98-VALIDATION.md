---
phase: 98
slug: pipeline-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-17
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
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 98-01-01 | 01 | 1 | PPIPE-01 | — | N/A | integration | `cd data && uv run pytest tests/test_places_load.py -v` | ❌ W0 | ⬜ pending |
| 98-01-02 | 01 | 1 | PPIPE-02 | — | N/A | integration | `cd data && bash data/dbt/run.sh build` | ✅ | ⬜ pending |
| 98-01-03 | 01 | 1 | PPIPE-03 | — | N/A | contract | `cd data && bash data/dbt/run.sh build` | ✅ | ⬜ pending |
| 98-02-01 | 02 | 1 | PPIPE-04 | — | N/A | integration | `cd data && uv run pytest tests/test_places_export.py -v` | ❌ W0 | ⬜ pending |
| 98-02-02 | 02 | 1 | PPIPE-05 | — | N/A | manual | check git ls-files public/data/places.geojson | ✅ | ⬜ pending |
| 98-03-01 | 03 | 2 | PPAGE-03 | — | N/A | integration | `cd data && uv run pytest tests/test_places_maps.py -v` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_places_load.py` — stubs for PPIPE-01 (geographies.places table creation)
- [ ] `data/tests/test_places_export.py` — stubs for PPIPE-04 (places.geojson and places.json export)
- [ ] `data/tests/test_places_maps.py` — stubs for PPAGE-03 (per-place SVG map generation)

*Existing infrastructure (pytest, conftest.py, fixture_db) covers all framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| places.geojson and places.json committed to git | PPIPE-05 | Requires git commit in the repo | `git ls-files public/data/places.geojson public/data/places.json` — both must appear |
| `npm run build` succeeds in CI without running pipeline | PPIPE-05 | Requires clean checkout + npm build | Run `npm run build` and confirm it uses committed places files |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
