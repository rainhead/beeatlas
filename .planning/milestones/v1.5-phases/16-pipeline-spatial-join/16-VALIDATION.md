---
phase: 16
slug: pipeline-spatial-join
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-14
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 |
| **Config file** | none — run from `data/` directory |
| **Quick run command** | `cd data && uv run pytest tests/test_spatial.py -x` |
| **Full suite command** | `cd data && uv run pytest tests/ -x` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/test_spatial.py -x`
- **After every plan wave:** Run `cd data && uv run pytest tests/ -x`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-W0-01 | W0 | 0 | PIPE-05 | unit | `cd data && uv run pytest tests/test_spatial.py::TestAddRegionColumns -x` | ❌ W0 | ⬜ pending |
| 16-W0-02 | W0 | 0 | PIPE-05 | unit | `cd data && uv run pytest tests/test_spatial.py::TestNearestFallback -x` | ❌ W0 | ⬜ pending |
| 16-W0-03 | W0 | 0 | PIPE-06 | unit | `cd data && uv run pytest tests/test_spatial.py::TestInatIntegration -x` | ❌ W0 | ⬜ pending |
| 16-W0-04 | W0 | 0 | PIPE-07 | unit | `cd data && uv run pytest tests/test_spatial.py::TestGeoJSONGeneration -x` | ❌ W0 | ⬜ pending |
| 16-01-01 | 01 | 1 | PIPE-05 | unit | `cd data && uv run pytest tests/test_spatial.py::TestAddRegionColumns -x` | ✅ W0 | ⬜ pending |
| 16-01-02 | 01 | 1 | PIPE-05 | unit | `cd data && uv run pytest tests/test_spatial.py::TestNearestFallback -x` | ✅ W0 | ⬜ pending |
| 16-02-01 | 02 | 1 | PIPE-06 | unit | `cd data && uv run pytest tests/test_spatial.py::TestInatIntegration -x` | ✅ W0 | ⬜ pending |
| 16-03-01 | 03 | 2 | PIPE-07 | unit | `cd data && uv run pytest tests/test_spatial.py::TestGeoJSONGeneration -x` | ✅ W0 | ⬜ pending |
| 16-04-01 | 04 | 2 | PIPE-07 | smoke | `node scripts/validate-schema.mjs` | ✅ exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_spatial.py` — stubs for PIPE-05, PIPE-06, PIPE-07
  - `TestAddRegionColumns` — mock county/ecoregion GDFs, verify columns added with correct values
  - `TestNearestFallback` — point outside polygon gets nearest match (non-null result)
  - `TestInatIntegration` — mock boundary GDFs, verify `main()` output has `county`/`ecoregion_l3`
  - `TestGeoJSONGeneration` — verify file generation logic (mock downloads, check output properties)

*Existing `data/tests/test_inat_download.py` and `test_links_fetch.py` are not affected by this phase.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GeoJSON files present after `npm run build` | PIPE-07 | Requires full build pipeline | Run `npm run build`, check `frontend/src/assets/wa_counties.geojson` and `frontend/src/assets/epa_l3_ecoregions_wa.geojson` exist and are under 400 KB |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
