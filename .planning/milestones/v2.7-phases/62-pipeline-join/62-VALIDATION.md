---
phase: 62
slug: pipeline-join
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 62 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest |
| **Config file** | `data/pyproject.toml` |
| **Quick run command** | `cd /Users/rainhead/dev/beeatlas/data && uv run pytest tests/test_export.py -x` |
| **Full suite command** | `cd /Users/rainhead/dev/beeatlas/data && uv run pytest` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd /Users/rainhead/dev/beeatlas/data && uv run pytest tests/test_export.py -x`
- **After every plan wave:** Run `cd /Users/rainhead/dev/beeatlas/data && uv run pytest`
- **Before `/gsd-verify-work`:** Full suite must be green + `node scripts/validate-schema.mjs` passes
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 62-01-01 | 01 | 0 | OCC-01 | — | N/A | unit | `uv run pytest tests/test_export.py::test_occurrences_parquet_schema -x` | ❌ W0 | ⬜ pending |
| 62-01-02 | 01 | 0 | OCC-01 | — | N/A | unit | `uv run pytest tests/test_export.py::test_occurrences_parquet_has_rows -x` | ❌ W0 | ⬜ pending |
| 62-01-03 | 01 | 0 | OCC-03 | — | N/A | unit | `uv run pytest tests/test_export.py::test_occurrences_coalesce_coords -x` | ❌ W0 | ⬜ pending |
| 62-01-04 | 01 | 0 | OCC-03 | — | N/A | unit | `uv run pytest tests/test_export.py::test_occurrences_date_format -x` | ❌ W0 | ⬜ pending |
| 62-01-05 | 01 | 1 | OCC-01 | — | N/A | integration | `node scripts/validate-schema.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_export.py` — replace `test_ecdysis_parquet_*` and `test_samples_parquet_*` tests with `test_occurrences_parquet_*` tests covering OCC-01 and OCC-03 (schema, row count, null-side behavior, coord COALESCE, date format)

*Fixture note: existing conftest.py seed already produces 1 specimen-only row and 1 sample-only row after the outer join (ecdysis host_observation_id=163069968 ≠ iNat id=999999) — no new fixture data needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `ecdysis.parquet` and `samples.parquet` are no longer produced after pipeline run | OCC-01 | Requires running full pipeline against real data source | Run `data/run.py`; confirm only `occurrences.parquet` exists in `frontend/public/data/` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
