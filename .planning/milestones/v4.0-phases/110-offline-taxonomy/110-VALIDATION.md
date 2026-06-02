---
phase: 110
slug: offline-taxonomy
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-23
---

# Phase 110 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest >= 9.0.2 |
| **Config file** | `data/pyproject.toml` (`testpaths = ["tests"]`) |
| **Quick run command** | `cd data && uv run pytest tests/test_taxa_pipeline.py -x` |
| **Full suite command** | `cd data && uv run pytest` |
| **Estimated runtime** | ~10 seconds (quick); ~60 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest tests/test_taxa_pipeline.py -x`
- **After every plan wave:** Run `cd data && uv run pytest`
- **Before `/gsd:verify-work`:** Full suite must be green + `bash data/dbt/run.sh build` green + `npm test` green
- **Max feedback latency:** 10 seconds (quick run)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 110-W0-01 | 01 | 0 | TAX-01, TAX-02 | — | N/A | unit | `uv run pytest tests/test_taxa_pipeline.py -x` | ❌ W0 | ⬜ pending |
| 110-01-01 | 01 | 1 | TAX-01 | — | HTTPS only; trusted S3 source | unit | `uv run pytest tests/test_taxa_pipeline.py::test_download_uses_304 -x` | ❌ W0 | ⬜ pending |
| 110-01-02 | 01 | 1 | TAX-01 | — | N/A | unit | `uv run pytest tests/test_taxa_pipeline.py::test_download_writes_sidecar -x` | ❌ W0 | ⬜ pending |
| 110-01-03 | 01 | 1 | TAX-02 | — | N/A | unit | `uv run pytest tests/test_taxa_pipeline.py::test_lineage_schema -x` | ❌ W0 | ⬜ pending |
| 110-01-04 | 01 | 1 | TAX-02 | — | N/A | unit | `uv run pytest tests/test_taxa_pipeline.py::test_lineage_null_ranks -x` | ❌ W0 | ⬜ pending |
| 110-02-01 | 02 | 2 | TAX-03 | — | N/A | smoke | `bash data/dbt/run.sh build` | — | ⬜ pending |
| 110-02-02 | 02 | 2 | TAX-03 | — | N/A | smoke | `npm test` | — | ⬜ pending |
| 110-03-01 | 03 | 2 | TAX-04 | — | N/A | manual | Review nightly.sh diff for taxa pull/push | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/test_taxa_pipeline.py` — stubs for TAX-01 (ETag caching) and TAX-02 (ancestry walk)
- [ ] Small CSV fixture for ancestry walk tests (inline fixture or `data/tests/fixtures/mini_taxa.tsv.gz`)
- [ ] Decision resolved on `test_taxon_lineage_extended.py` / `test_taxon_lineage.py` disposition (delete recommended per research; resolve before enricher deletion task)

*Existing infrastructure (pytest, conftest.py) is already in place — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `nightly.sh` taxa.csv.gz pull/push | TAX-04 | Shell script change; runs only in cron on maderas server | Read nightly.sh diff; confirm `aws s3 cp` pull before pipeline and push in EXIT trap; verify `taxa_cache.json` also synced |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
