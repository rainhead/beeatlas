---
phase: 87
slug: incremental-materialization-experiment
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-13
---

# Phase 87 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `087-RESEARCH.md` `## Validation Architecture`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.x (via `uv run --project data pytest`) + dbt's own test runner |
| **Config file** | `data/pyproject.toml` |
| **Quick run command** | `bash data/dbt/run.sh build --select int_combined+` |
| **Full suite command** | `bash data/dbt/run.sh build && uv run --project data pytest data/tests/ -x` |
| **Estimated runtime** | ~5 seconds quick · ~30 seconds full |

---

## Sampling Rate

- **After every task commit:** Run `bash data/dbt/run.sh build --select int_combined+` (confirms the experimental model still builds)
- **After every plan wave:** Run `bash data/dbt/run.sh build` (full) + `uv run --project data pytest data/tests/test_dbt_diff.py -x`
- **Before `/gsd-verify-work`:** Full suite must be green AND `087-FINDINGS.md` must exist with recommendation
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 87-01-01 | 01 | 1 | TEST-03 | — | N/A (read-only baseline) | smoke | `bash data/dbt/run.sh build --select int_combined+` | ✅ existing | ⬜ pending |
| 87-01-02 | 01 | 1 | TEST-03 | — | N/A | smoke + dbt test | `bash data/dbt/run.sh build --select int_combined+ && bash data/dbt/run.sh test --select int_combined` | ✅ existing | ⬜ pending |
| 87-01-03 | 01 | 1 | TEST-03 | — | N/A | smoke (2nd run observation) | `bash data/dbt/run.sh build --select int_combined+` | ✅ existing | ⬜ pending |
| 87-01-04 | 01 | 2 | TEST-03 | — | N/A | doc existence + content | `test -f .planning/phases/087-incremental-materialization-experiment/087-FINDINGS.md && grep -q '^## Recommendation' .planning/phases/087-incremental-materialization-experiment/087-FINDINGS.md` | ❌ produced in Wave 2 | ⬜ pending |
| 87-01-05 | 01 | 2 | TEST-03 | — | N/A | git cleanliness | `git status data/dbt/models/intermediate/int_combined.sql` returns clean OR a committed revert exists | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* The diff harness (`data/tests/test_dbt_diff.py`) and dbt's own `test` runner are sufficient. No new test files are required.

Optional pre-Wave-1 capture: save a baseline `target/run_results.json` from a pre-change `dbt build` for wall-clock comparison. This is a one-step prep, not a Wave 0 dependency.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Recommendation for Phase 88 is unambiguous ("use incremental" with selector OR "full rebuilds" with reason) | TEST-03 | Requires human judgment on which side the evidence falls | Read `087-FINDINGS.md` `## Recommendation` section; confirm it states one of the two outcomes and references the wall-clock numbers |
| Observed wall-clock numbers are credible (not cached / not on warm fs) | TEST-03 | Cold-vs-warm fs nuance can't be asserted by command | First measurement must include a `sync && purge` or equivalent fs-cache flush; document the flush in the findings |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (N/A — none missing)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
