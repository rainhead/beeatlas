---
phase: 56
slug: export-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-15
---

# Phase 56 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.x (uv) |
| **Config file** | `data/pyproject.toml` (testpaths = ["tests"]) |
| **Quick run command** | `cd data && uv run pytest tests/test_export.py -x -q` |
| **Full suite command** | `cd data && uv run pytest -x` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/test_export.py -x -q`
- **After every plan wave:** Run `cd data && uv run pytest -x`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 56-01-01 | 01 | 1 | ELEV-02 | — | elevation_m column is INT16 (not float) — prevents sentinel leakage as numeric | unit | `cd data && uv run pytest tests/test_export.py -x -q` | ❌ W0 | ⬜ pending |
| 56-01-02 | 01 | 1 | ELEV-03 | — | samples.parquet also gains elevation_m INT16 column | unit | `cd data && uv run pytest tests/test_export.py -x -q` | ❌ W0 | ⬜ pending |
| 56-01-03 | 01 | 1 | ELEV-04 | — | validate-schema.mjs exits non-zero when elevation_m missing | integration | `node scripts/validate-schema.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_export.py` — add tests for elevation_m column (INT16 type, nullable, no sentinel leakage)

*Existing infrastructure covers all other phase requirements (pytest, dem_fixture from Phase 55).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No row has elevation_m < -500 | ELEV-04 (SC-4) | Requires running full export pipeline against real DuckDB with real data | Run `cd data && uv run python export.py` then check `SELECT MIN(elevation_m) FROM read_parquet('frontend/public/data/ecdysis.parquet')` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
