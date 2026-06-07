---
phase: 143
slug: ci-gate
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-07
---

# Phase 143 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (config in `data/pyproject.toml`); GitHub Actions for the deliverable itself |
| **Config file** | `data/pyproject.toml` (`[tool.pytest.ini_options]`, `addopts = -m "not integration"`) |
| **Quick run command** | `cd data && uv run pytest --tb=short -q` |
| **Full suite command** | `bash data/scripts/verify-clean-checkout.sh` (clean-checkout proof) |
| **Estimated runtime** | < 5 min (the budget the CI gate enforces) |

> The deliverable is a CI workflow, not application code. Its correctness is
> verified by observing a real GitHub Actions run (success criterion 4), not by a
> unit test of the YAML. There is no automated unit test for the workflow itself —
> this is inherent to the phase, not a gap.

---

## Sampling Rate

- **After the workflow is committed:** push the branch and observe the run via `gh run watch`.
- **Phase gate (before `/gsd:verify-work`):** one green CI run observed end-to-end on a real push.
- **Max feedback latency:** one CI run (~2–4 min cold-cache; faster warm).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 143-01-01 | 01 | 1 | TCI-01 | — | N/A | manual (observe CI) | `gh run watch <run-id> --exit-status` | ❌ W0 (`python-tests.yml`) | ⬜ pending |
| 143-01-02 | 01 | 1 | TCI-02 | — | N/A | manual (observe CI) | `gh run view <run-id> --log` (timeout/over-budget → red) | ❌ W0 (same workflow) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> Both requirements are satisfied by the same deliverable (`python-tests.yml`) and
> verified by the same end-to-end observation of a real CI run. TCI-02's "over-budget
> → red" path is structurally enforced by `timeout-minutes: 5` on the pytest step
> (D-03) — verifiable by inspecting the committed YAML even without provoking a real
> timeout, which the planner should note as the practical acceptance for TCI-02.

---

## Wave 0 Requirements

- [ ] `.github/workflows/python-tests.yml` — the sole deliverable; must exist before CI can run.

*No test-infrastructure gaps — the fast pytest suite was verified green on a clean checkout in Phase 142; this phase only adds the CI surface that runs it.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CI runs the fast suite on push and goes red on test failure | TCI-01 | The behavior is a GitHub Actions run; no in-repo unit test can assert "CI ran on push" | Push a branch; `gh run list --workflow=python-tests.yml`; `gh run watch <id> --exit-status` → exit 0 on green |
| CI fails when the fast suite exceeds 5 min | TCI-02 | Provoking a real >5 min run is destructive/slow; structural enforcement is the practical proof | Inspect committed YAML: `timeout-minutes: 5` is on the pytest step. Optionally confirm a green run stays well under budget via `gh run view <id> --log` timing |

---

## Validation Sign-Off

- [ ] Deliverable workflow committed and present at `.github/workflows/python-tests.yml`
- [ ] One green CI run observed end-to-end on a real push (`gh run watch ... --exit-status` → 0)
- [ ] `timeout-minutes: 5` confirmed on the pytest step in the committed YAML (TCI-02 structural proof)
- [ ] Python test check is visible in the check list alongside the frontend build job
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
