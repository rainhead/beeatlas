---
phase: 141
slug: built-asset-fixtures-red-test-fixes-silent-skip-elimination
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-06
---

# Phase 141 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (Python 3.14+, run via `uv`) |
| **Config file** | `data/pyproject.toml` `[tool.pytest.ini_options]` (`addopts = -m "not integration"`) |
| **Quick run command** | `cd data && uv run pytest tests/<touched_file>.py -m 'not integration' -q` (per touched file; each must finish in seconds — env hard-kills long commands) |
| **Full suite command** | `cd data && uv run pytest -m 'not integration' -q` (fast tier); `cd data && uv run pytest -m integration -q` (dataset tier, real built data) |
| **Estimated runtime** | fast tier target < 5 min (Phase 142 verifies); per-touched-file scoped runs ~5–10 s |

> **Host constraint:** this environment SIGKILLs long-running Bash commands. Run validation **scoped to one touched test file at a time** in the fast tier; never run the whole repo suite or `-m integration` from the orchestrator. The integration tier is verified in nightly (Phase 142, TTIER-03).

---

## Sampling Rate

- **After every task commit:** Run the scoped fast-tier command for the touched test file.
- **After every plan wave:** Run the fast tier for all files touched in the wave (one file per invocation).
- **Before `/gsd:verify-work`:** Fast tier green on a clean checkout (the milestone gate).
- **Max feedback latency:** ~10 s per scoped file run.

---

## Per-Task Verification Map

> Populated by the planner per task. Each fast-tier task's `<verify><automated>` must be a scoped, seconds-scale pytest command for the touched file (clean-checkout green); each genuine full-data check is tagged `@pytest.mark.integration` and verified only in the dataset tier.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner fills) | | | TFIXTURE-03 / TFIX-01..04 / TTIER-02 | T-141-* / — | N/A (test-only) | unit/integration | `cd data && uv run pytest ...` | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/tests/conftest.py` — silent-skip guard hook (D-05): fail the fast tier if a non-`integration` test skips on a missing built asset.
- [ ] `data/tests/fixtures/` — new distilled CSVs (source-of-truth) for the parquet builder fixtures (D-01).

*Existing pytest infrastructure (markers, addopts, fixtures dir) is already in place from Phases 139–140.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Clean-checkout fast run reports 0 silent asset-driven skips | TFIX-04 | The "no silent skip" property is asserted by the D-05 conftest guard itself; a one-time clean-checkout run confirms the guard fires correctly | On a clean checkout (no `dbt/target`, no `public/data/*.parquet`): `cd data && uv run pytest -m 'not integration' -q` → guard must error on any asset-driven skip, else 0 skips in summary |

*Most behaviors have automated per-file verification; the clean-checkout property is the one cross-cutting check.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (conftest guard + fixture CSVs)
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s (scoped per-file runs)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
