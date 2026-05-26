---
phase: 117
slug: inat-obs-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-25
---

# Phase 117 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2+ (data/pyproject.toml dev group) |
| **Config file** | `data/pyproject.toml` `[tool.pytest.ini_options]` with `testpaths = ["tests"]` |
| **Quick run command** | `cd data && uv run pytest tests/test_inat_obs_pipeline.py -x` |
| **Full suite command** | `cd data && uv run pytest tests/ -x` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/test_inat_obs_pipeline.py -x`
- **After every plan wave:** Run `cd data && uv run pytest tests/ -x`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 117-01-01 | 01 | 0 | PIPE-01..04 | — | CSV schema validated on open | manual | Verify CSV header matches expected columns | ❌ W0 | ⬜ pending |
| 117-01-02 | 01 | 0 | PIPE-01..04 | — | N/A | manual | `data/raw/inat_expert_obs.csv` committed to git | ❌ W0 | ⬜ pending |
| 117-01-03 | 01 | 0 | PIPE-01..04 | — | N/A | setup | `data/tests/test_inat_obs_pipeline.py` stub created | ❌ W0 | ⬜ pending |
| 117-02-01 | 02 | 1 | PIPE-01 | — | N/A | integration | `uv run pytest tests/test_inat_obs_pipeline.py::test_schema_has_12_columns -x` | ❌ W0 | ⬜ pending |
| 117-02-02 | 02 | 1 | PIPE-02 | — | N/A | integration | `uv run pytest tests/test_inat_obs_pipeline.py::test_canonical_name_non_null -x` | ❌ W0 | ⬜ pending |
| 117-02-03 | 02 | 1 | PIPE-03 | — | N/A | integration | `uv run pytest tests/test_inat_obs_pipeline.py::test_dedup_excludes_specimen_obs -x` | ❌ W0 | ⬜ pending |
| 117-02-04 | 02 | 1 | PIPE-04 | — | N/A | integration | `uv run pytest tests/test_inat_obs_pipeline.py::test_floral_host_mapping -x` | ❌ W0 | ⬜ pending |
| 117-03-01 | 03 | 2 | PIPE-05 | — | N/A | manual | nightly.sh dry-run confirms inat_obs_name and manifest entry present | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/raw/inat_expert_obs.csv` — committed CSV export; required before tests or pipeline code can run
- [ ] `data/tests/test_inat_obs_pipeline.py` — test stubs for PIPE-01 through PIPE-04
- [ ] No new framework install needed — pytest already in dev dependencies

*Wave 0 must complete before Wave 1 pipeline implementation tasks begin.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| inat_obs.parquet accessible via CloudFront | PIPE-05 | Requires live S3 upload + CDN path; not reproducible in unit test | Run `nightly.sh` in staging; verify `manifest.json` contains `"inat_obs"` key with hashed filename |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
