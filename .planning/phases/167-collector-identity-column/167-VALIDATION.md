---
phase: 167
slug: collector-identity-column
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 167 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | dbt data tests (built-in generic tests) + pytest 7.x |
| **Config file** | `data/dbt/dbt_project.yml` (dbt) + `data/pyproject.toml` (pytest) |
| **Quick run command** | `bash data/dbt/run.sh build` |
| **Full suite command** | `cd data && uv run pytest -x` |
| **Estimated runtime** | dbt build ~60–120s; pytest unit ~few s |

---

## Sampling Rate

- **After every task commit:** Run `bash data/dbt/run.sh build` (contract + data tests)
- **After every plan wave:** Run `cd data && uv run pytest -x`
- **Before `/gsd-verify-work`:** dbt build green AND one `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` confirmed (column live in S3)
- **Max feedback latency:** ~120 seconds (dbt build)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 167-01-* | 01 | 1 | IDENT-01 (column exists) | — | N/A | dbt contract | `bash data/dbt/run.sh build` | ✅ | ⬜ pending |
| 167-01-* | 01 | 1 | IDENT-01 (WABA arms non-null, D-05) | — | N/A | dbt data test (error) | `bash data/dbt/run.sh build` | ❌ W1 (test created in this phase) | ⬜ pending |
| 167-01-* | 01 | 1 | IDENT-01 (ecdysis NULL drift, D-06) | — | N/A | dbt data test (warn) | `bash data/dbt/run.sh build` | ❌ W1 (test created in this phase) | ⬜ pending |
| 167-01-* | 01 | 1 | IDENT-01 (sqlite carry-through) | — | N/A | manual spot-check | `cd data && uv run python sqlite_export.py && uv run python3 -c "import sqlite3; c=sqlite3.connect('public/data/occurrences.db'); print([d[0] for d in c.execute('PRAGMA table_info(occurrences)')])"` | ✅ | ⬜ pending |
| 167-01-* | 01 | 1 | IDENT-01 (schema parity, nightly) | — | N/A | integration | `cd data && uv run pytest data/tests/test_dbt_diff.py::test_occurrences_schema_matches -x` (after SKIP_INTEGRATION_GATE nightly) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* The dbt contract, `test_dbt_diff.py`, and dbt data-test machinery already exist. The two new dbt data tests (D-05 hard-error, D-06 warn) are authored as part of the `schema.yml` edit in Wave 1 — they are deliverables, not pre-existing fixtures.

---

## Observable Baselines (Nyquist signals)

Per-arm `collector_inat_login` non-NULL signal, verified against live `dbt_sandbox.int_combined` (2026-06-24). After the change, `occurrences` must reproduce these:

| source arm | rows | NULL login (expected) | assertion |
|---|---|---|---|
| `waba_sample` | 28 | **0** | D-05 hard-error (must stay 0) |
| `waba_specimen` | 33 | **0** | D-05 hard-error (must stay 0) |
| `ecdysis` | 48,801 | **~2,767** | D-06 warn (logged, non-blocking) |
| `inat_obs` | 28,884 | 0 | (informational) |
| `checklist` | 19,929 | 19,929 (all) | expected — excluded from identity |

Validation query (read-only):
```sql
SELECT source, COUNT(*) AS rows,
  COUNT(*) FILTER (WHERE collector_inat_login IS NULL) AS null_login
FROM read_parquet('data/dbt/target/sandbox/occurrences.parquet')
GROUP BY source ORDER BY source;
```

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Column live in S3 before any consuming code | IDENT-01 (SC-3) | Requires the maderas nightly cron (or a one-time `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh`) — not reproducible in the executor sandbox | After schema.yml change ships: run one `SKIP_INTEGRATION_GATE=1` nightly, then confirm `collector_inat_login` present in the S3 `occurrences.parquet`/`occurrences.db` |

---

## Validation Sign-Off

- [ ] All tasks have automated verify (dbt build) or are flagged manual-only (S3 nightly)
- [ ] Sampling continuity: dbt build runs after each task
- [ ] Wave 0 covers all MISSING references (none required)
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
