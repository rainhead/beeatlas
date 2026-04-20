---
phase: 66
slug: provisional-rows-in-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-20
---

# Phase 66 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.0.2 |
| **Config file** | `data/pyproject.toml` |
| **Quick run command** | `uv run pytest data/tests/test_export.py -x` |
| **Full suite command** | `uv run pytest data/tests/ -v` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest data/tests/test_export.py -x`
- **After every plan wave:** Run `uv run pytest data/tests/ -v`
- **Before `/gsd-verify-work`:** Full suite must be green + `node scripts/validate-schema.mjs` passing + `uv run python data/export.py` succeeds (spatial null assertions)
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 66-pipeline-01 | pipeline | 1 | PROV-01 | — | N/A | manual | `uv run python data/waba_pipeline.py` | ✅ | ⬜ pending |
| 66-export-01 | export | 1 | PROV-02, PROV-03 | — | N/A | integration | `uv run pytest data/tests/test_export.py::test_provisional_rows_appear -x` | ❌ W0 | ⬜ pending |
| 66-export-02 | export | 1 | PROV-04 | — | N/A | integration | `uv run pytest data/tests/test_export.py::test_provisional_rows_appear -x` | ❌ W0 | ⬜ pending |
| 66-export-03 | export | 1 | PROV-05 | — | N/A | integration | `uv run pytest data/tests/test_export.py::test_matched_waba_not_provisional -x` | ❌ W0 | ⬜ pending |
| 66-schema-01 | schema | 2 | PROV-05 | — | N/A | schema gate | `node scripts/validate-schema.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/conftest.py` — add `taxon__name`/`taxon__rank` cols to `inaturalist_waba_data.observations`; add `observations__taxon__ancestors` table; add second unmatched WABA obs (id=888888); add OFV 1718 row on unmatched obs; add ancestor rows for both WABA obs
- [ ] `data/tests/test_export.py` — add `test_provisional_rows_appear` and `test_matched_waba_not_provisional` stubs; update `EXPECTED_OCCURRENCES_COLS` (rename `observer` → `host_inat_login`, add 5 new cols)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Taxon ancestors ingested into `observations__taxon__ancestors` | PROV-01 | dlt pipeline run creates table at runtime; cannot be unit tested without running pipeline | Run `uv run python data/waba_pipeline.py`; then verify: `python -c "import duckdb; c=duckdb.connect('data/beeatlas.duckdb'); print(c.execute('SELECT count(*) FROM inaturalist_waba_data.observations__taxon__ancestors').fetchone())"` |
| File size delta after export | (informational) | Requires actual parquet output from production DB | Compare `ls -la frontend/public/data/occurrences.parquet` before and after |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
