---
phase: 142
slug: verify-budget-green-suite-nightly-wiring
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-06
---

# Phase 142 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (uv-managed, Python 3.14) |
| **Config file** | `data/pyproject.toml` (`[tool.pytest.ini_options]`, `addopts = -m 'not integration'`) |
| **Quick run command** | `cd data && uv run pytest -q` (fast tier) |
| **Full suite command** | `cd data && uv run pytest -m integration -q` (slow/integration tier) |
| **Estimated runtime** | fast tier ~16 s; integration tier minutes (real built data) |

---

## Sampling Rate

- **After every task commit:** Run `cd data && uv run pytest -q` (fast tier — ~16 s)
- **After every plan wave:** Run the fast tier, plus the clean-checkout script (`data/scripts/verify-clean-checkout.sh`) once it exists
- **Before `/gsd:verify-work`:** Fast tier green under a randomized `pytest-randomly` run; clean-checkout script exits 0; integration tier green on maderas against real built data
- **Max feedback latency:** ~20 s for the fast tier

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 142-XX-01 | TBD | 1 | TFIX-05 | — | N/A | suite | `cd data && uv run pytest -q` (0 failures/errors, randomized) | ✅ | ⬜ pending |
| 142-XX-02 | TBD | 1 | TPERF-02 | — | N/A | timing | `cd data && uv run pytest -q` finishes < 5 min (measured, recorded in BASELINE.md) | ✅ | ⬜ pending |
| 142-XX-03 | TBD | 1 | TPERF-03 | — | N/A | script | `bash data/scripts/verify-clean-checkout.sh` exits 0 (assets stripped, no network/AWS) | ❌ W0 | ⬜ pending |
| 142-XX-04 | TBD | 2 | TTIER-03 | T-142-01 | Integration tier runs after build, before publish; non-zero exit observable | integration | `cd data && uv run pytest -m integration -x` gates publish in `nightly.sh` | ✅ | ⬜ pending |
| 142-XX-05 | TBD | 2 | TTIER-03 | — | Slow tier green on real data (incl. test_dbt_diff steady-state, test_at_least_13_fuzzy_candidates) | integration | `cd data && uv run pytest -m integration -q` on maderas | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Plan/Task IDs are placeholders — the planner assigns final IDs.*

---

## Wave 0 Requirements

- [ ] Add `pytest-randomly` to `data/pyproject.toml [dependency-groups.dev]` + `uv sync` (enables D-04 randomized green proof) — NOT present today.
- [ ] `data/scripts/verify-clean-checkout.sh` — new clean-checkout proof script (D-02); does not exist yet.
- [ ] Confirm the integration-tier red tests (`test_dbt_diff` post-Phase-131-schema, `test_at_least_13_fuzzy_candidates`) reproduce, before fixing — empirical Wave 0 step.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Integration tier surfaces failure in the live nightly log | TTIER-03 (criterion 3) | Requires an actual maderas nightly cron run; can't be asserted in unit test | After wiring, run `bash data/nightly.sh` on maderas (or inspect the next cron log); confirm a forced integration failure produces a non-zero exit / logged error and blocks the publish step |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (pytest-randomly install, clean-checkout script, red-test repro)
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s (fast tier)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
