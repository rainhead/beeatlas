---
phase: 143-ci-gate
verified: 2026-06-07T00:00:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 1
overrides:
  - must_have: "The Python test check appears in the commit/PR check list alongside the frontend build job, and does NOT block the frontend deploy"
    reason: "Trigger is push-only (no pull_request event), per D-02/D-02a — intentional recorded deviation for single-maintainer same-repo workflow. Push-on-all-branches satisfies TCI-01 intent. No needs: coupling exists; deploy.yml is untouched and its deploy job still gates only on its own build job."
    accepted_by: "peter"
    accepted_at: "2026-06-07T00:00:00Z"
---

# Phase 143: CI Gate Verification Report

**Phase Goal:** Every push automatically runs the fast pytest suite; a failed or slow suite fails the build; Python tests are no longer invisible in CI.
**Verified:** 2026-06-07
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Pushing any branch triggers a GitHub Actions run of the fast pytest suite | VERIFIED | Workflow `on: push: branches: ['**']` confirmed in YAML. Real push of `ci-gate-python-tests` triggered run 27101572396 — `conclusion: success`. |
| 2 | A pytest failure or error makes the run go red (build fails) | VERIFIED | Run 27101490629 went red on first push due to LFS pointer / spatial extension gaps — confirmed `conclusion: failure` via `gh run view`. Fix-at-workflow-level → re-push → green. The mechanism is real; pytest exit non-zero propagates to job failure. |
| 3 | The run uses Python 3.14 + uv against the committed data/uv.lock on a clean checkout (no cached built assets) | VERIFIED | `astral-sh/setup-uv@fac544c07dec837d0ccb6301d7b5580bf5edae39` with `working-directory: data` reads `data/.python-version` (= `3.14`). `uv sync --frozen` installs only from committed `data/uv.lock`. `actions/checkout@v6` with `lfs: true` produces a clean checkout. GitHub-hosted runner has no pre-built assets. |
| 4 | The fast suite is hard-bounded to under 5 minutes; exceeding it kills the step and fails the build | VERIFIED | `timeout-minutes: 5` is on the `Run fast pytest suite` step only (D-03 — not the job). Green run 27101572396 shows the pytest step ran 17s (18:50:31→18:50:48Z), 94% headroom vs the 300s budget. |
| 5 | The Python test check appears in the commit/PR check list alongside the frontend build job, and does NOT block the frontend deploy | PASSED (override) | Push-only trigger per D-02/D-02a (intentional deviation). `deploy.yml` is untouched (zero commits to that file in this phase). No `needs:` coupling exists in either workflow. A red Python run cannot block the frontend S3 deploy. Override accepted — see frontmatter. |
| 6 | A green CI run is observed end-to-end on a real push | VERIFIED | Run 27101572396 (`https://github.com/rainhead/beeatlas/actions/runs/27101572396`): `conclusion: success`, all steps green. `gh run view` JSON confirmed. Total job duration: 33s. |

**Score:** 6/6 truths verified (1 via recorded override)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/python-tests.yml` | Independent Python fast-suite CI workflow containing `astral-sh/setup-uv`, ≥20 lines | VERIFIED | File exists, 55 lines, valid YAML. All structural checks pass (see Key Links). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `.github/workflows/python-tests.yml` | `data/.python-version` | `setup-uv` with `working-directory: data` reads `.python-version` = `3.14` | WIRED | `working-directory: data` on the setup-uv `with:` block confirmed. `data/.python-version` = `3.14`. |
| `.github/workflows/python-tests.yml` | `data/uv.lock` | `uv sync --frozen` installs from committed lockfile | WIRED | Step `Install dependencies: run: uv sync --frozen` present. `--frozen` flag confirmed. |
| `.github/workflows/python-tests.yml` | `data/pyproject.toml addopts (-m 'not integration')` | bare `uv run pytest` auto-selects fast tier | WIRED | `run: uv run pytest --tb=short -q --durations=10` — no marker flag needed; `addopts = "-m 'not integration'"` in `data/pyproject.toml` deselects integration tier automatically. |
| `timeout-minutes: 5` | pytest step only (not the job) | step-level wall-clock budget gate per D-03 | WIRED | `timeout-minutes: 5` appears under `Run fast pytest suite` step, not at job level. Confirmed via YAML parse. |

---

### Data-Flow Trace (Level 4)

Not applicable — phase deliverable is a CI workflow (YAML config), not a component that renders dynamic data.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CI run conclusion | `gh run view 27101572396 -R rainhead/beeatlas --json conclusion,jobs` | `conclusion: success`; job `Fast pytest suite (data/)` all steps green | PASS |
| Pytest step duration vs budget | Timestamps from gh run JSON: start 18:50:31Z, end 18:50:48Z | 17s elapsed, budget 300s; 94% headroom | PASS |
| First run was genuinely red | `gh run view 27101490629 -R rainhead/beeatlas --json conclusion` | `conclusion: failure` | PASS (confirms real fix loop) |
| No AWS/secrets in workflow | `grep -i 'aws\|role-to-assume\|id-token\|secrets\.'` | No matches | PASS |
| No `needs:` coupling | `grep 'needs:' python-tests.yml` | No matches | PASS |
| deploy.yml untouched | `git log -- .github/workflows/deploy.yml` | No commits from Phase 143 branch | PASS |
| No debt markers in workflow | `grep 'TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER'` | No matches | PASS |

---

### Probe Execution

No `probe-*.sh` files are declared for this phase. Step 7c: SKIPPED (CI workflow phase — correctness verified by the real GitHub Actions run above, which is the phase's own acceptance criterion).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TCI-01 | 143-01-PLAN.md | GitHub Actions job runs fast pytest suite on push and pull request, fails on test failure | SATISFIED | Workflow runs on `push: branches: ['**']`; no `pull_request` per D-02a (intentional deviation, push-only satisfies intent); green run 27101572396 observed; first red run 27101490629 confirms failure-propagation is real. |
| TCI-02 | 143-01-PLAN.md | CI job enforces <5 min runtime budget; build fails if exceeded | SATISFIED | `timeout-minutes: 5` on pytest step (structural hard gate); green run ran in 17s (94% headroom); structural enforcement is verifiable without provoking a real timeout. |

No orphaned requirements: REQUIREMENTS.md §CI Gate maps exactly TCI-01 and TCI-02 to Phase 143, and both are satisfied.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | None found |

No `TBD`, `FIXME`, `XXX`, placeholder patterns, empty handlers, or stub returns in `.github/workflows/python-tests.yml`.

---

### Human Verification Required

None. All must-haves are verifiable from the committed YAML and the confirmed GitHub Actions run record. The one item that typically requires human observation (CI run green end-to-end) is settled by the `gh run view` API response (`conclusion: success`) and the step-level timing evidence.

---

## Gaps Summary

No gaps. All 6 must-have truths are verified (5 by direct code and CI evidence; 1 by recorded, intentional override D-02a). Both requirement IDs (TCI-01, TCI-02) are fully satisfied. The artifact is substantive, wired, and proven by a real GitHub Actions run.

---

### Locked-Decision Compliance (CONTEXT.md)

| Decision | Requirement | Status |
|----------|-------------|--------|
| D-01: separate, independent workflow; no needs: coupling; red Python run does not block frontend deploy | `python-tests.yml` created fresh; deploy.yml untouched; no `needs:` in either direction | HONORED |
| D-02/D-02a: `on: push: branches: ['**']`, no `pull_request` | Exact trigger confirmed in YAML | HONORED |
| D-03: `timeout-minutes: 5` on pytest step only, not the job | Confirmed on `Run fast pytest suite` step only | HONORED |
| SHA pin: `astral-sh/setup-uv@fac544c07dec837d0ccb6301d7b5580bf5edae39` with `# v8.2.0` comment | Confirmed in YAML; comment present on same line | HONORED |
| `lfs: true` on checkout | Added in fix commit d006a58 after first red run; confirmed in YAML | HONORED |
| DuckDB spatial pre-install | `Pre-install DuckDB spatial extension` step present; added in d006a58 | HONORED |

---

_Verified: 2026-06-07_
_Verifier: Claude (gsd-verifier)_
