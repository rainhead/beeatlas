---
phase: 55
slug: dem-acquisition-module
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-15
---

# Phase 55 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest >= 9.0.2 |
| **Config file** | `data/pyproject.toml` (`[tool.pytest.ini_options]`) |
| **Quick run command** | `cd data && uv run pytest tests/test_dem_pipeline.py -x` |
| **Full suite command** | `cd data && uv run pytest` |
| **Estimated runtime** | ~5 seconds (no network; synthetic fixture) |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/test_dem_pipeline.py -x`
- **After every plan wave:** Run `cd data && uv run pytest`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 55-01-01 | 01 | 0 | ELEV-01 | — | N/A | unit | `cd data && uv run pytest tests/test_dem_pipeline.py -x` | ❌ W0 | ⬜ pending |
| 55-01-02 | 01 | 1 | ELEV-01a | — | N/A | unit | `cd data && uv run pytest tests/test_dem_pipeline.py::test_ensure_dem_caches -x` | ❌ W0 | ⬜ pending |
| 55-01-03 | 01 | 1 | ELEV-01b | — | N/A | unit | `cd data && uv run pytest tests/test_dem_pipeline.py::test_sample_elevation_inbounds -x` | ❌ W0 | ⬜ pending |
| 55-01-04 | 01 | 1 | ELEV-01c | — | N/A | unit | `cd data && uv run pytest tests/test_dem_pipeline.py::test_sample_elevation_nodata -x` | ❌ W0 | ⬜ pending |
| 55-01-05 | 01 | 1 | ELEV-01d | — | N/A | unit | `cd data && uv run pytest tests/test_dem_pipeline.py::test_sample_elevation_oob -x` | ❌ W0 | ⬜ pending |
| 55-01-06 | 01 | 1 | ELEV-01e | — | N/A | unit | `cd data && uv run pytest tests/test_dem_pipeline.py::test_nodata_from_file -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_dem_pipeline.py` — stubs for ELEV-01a through ELEV-01e
- [ ] `data/dem_pipeline.py` — module under test (stub with function signatures)
- [ ] `data/tests/conftest.py` — add `dem_fixture` (function-scoped, uses `tmp_path`)
- [ ] Add `seamless-3dep>=0.4.1` and `rasterio>=1.5.0` to `data/pyproject.toml` `[project.dependencies]`
- [ ] Install: `cd data && uv sync`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `ensure_dem` actually downloads a real GeoTIFF from USGS | ELEV-01 | Requires network + large download (~500MB); not suitable for CI | Run `python -c "from dem_pipeline import ensure_dem; p = ensure_dem('/tmp/dem_cache'); print(p, p.exists())"` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
