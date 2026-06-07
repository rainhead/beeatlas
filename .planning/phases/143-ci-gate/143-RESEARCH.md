# Phase 143: CI Gate - Research

**Researched:** 2026-06-07
**Domain:** GitHub Actions workflow authoring — Python/uv CI setup
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 — Separate, fully independent workflow:** New `.github/workflows/python-tests.yml`. Runs in parallel with `deploy.yml`, no AWS/OIDC, no built assets. A Python-test failure shows a red check but does NOT block the frontend S3 deploy.
- **D-02 — `on: push: branches: ['**']`, no `pull_request`:** Mirrors `deploy.yml` exactly; push-only. Single-maintainer, same-repo workflow.
  - **D-02a:** TCI-01's literal "pull request" wording is a deliberate deviation — push-on-all-branches satisfies intent.
- **D-03 — Hard fail via `timeout-minutes: 5` on the pytest step (not the whole job):** Excludes setup/`uv sync` time from the budget gate.

### Claude's Discretion
- Run `uv sync --frozen` + `uv run pytest` **inline** in the workflow steps (not via `verify-clean-checkout.sh` — the worktree+strip dance is redundant in CI where the checkout is already clean).
- Use `astral-sh/setup-uv` with caching + Python 3.14 pin.
- Whether to add `--durations=N` for slow-test diagnostics.
- Exact job name / check-list label wording.
- Exact placement of `timeout-minutes` (on the pytest step per D-03).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TCI-01 | A GitHub Actions job runs the fast pytest suite (`uv` + Python 3.14, `cd data && uv run pytest`) on push and pull request, failing the build on any test failure. | Covered by D-02/D-02a: push-only trigger satisfies intent. Confirmed via `astral-sh/setup-uv@v8.2.0` + `uv sync --frozen` + `uv run pytest`. |
| TCI-02 | The CI job enforces the runtime budget — build fails if the fast suite exceeds the <5 min target. | Confirmed via `timeout-minutes: 5` on the pytest step (step-level timeout kills only that step, fails the job). |
</phase_requirements>

---

## Summary

Phase 143 is a single-file authoring task: write `.github/workflows/python-tests.yml`. All architectural decisions are locked from CONTEXT.md. Research focuses on exact YAML mechanics — action versions, flag semantics, and pitfalls that could silently break the gate.

The workflow uses `astral-sh/setup-uv@v8.2.0` (latest stable as of 2026-06-07, SHA `fac544c07dec837d0ccb6301d7b5580bf5edae39`) with `working-directory: data`, which causes the action to automatically read `data/.python-version` (= `3.14`) and resolve Python from the runner's toolcache or install it via uv. Python 3.14 is confirmed stable and available on `ubuntu-latest` (3.14.5 in the runner image manifest). The `uv sync --frozen` flag is the correct CI choice (accepts the lockfile as-is without re-resolving); `--locked` is stricter but correct too — the planner may choose either. A cold uv cache on the first run causes packages to be downloaded from PyPI, which is fine: the `enable-cache: true` default on GitHub-hosted runners means subsequent runs are fast. The `timeout-minutes: 5` on the pytest step (not the job) is confirmed to kill only that step and fail the job — step-level timeout is a real GitHub Actions feature despite one misleading search result.

**Primary recommendation:** Write the workflow with `astral-sh/setup-uv@v8.2.0`, `working-directory: data`, `enable-cache: true`, `uv sync --frozen`, `uv run pytest --tb=short -q --durations=10` with `timeout-minutes: 5` on the pytest step. Optionally add a concurrency group keyed on `github.ref` to cancel superseded runs. Verify end-to-end with `gh run watch --exit-status $(gh run list -w python-tests.yml -L 1 --json databaseId -q '.[0].databaseId')`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fast pytest suite execution | CI runner (GitHub Actions) | — | Code-validation tests run at build time against the repo checkout |
| Python version resolution | `astral-sh/setup-uv` (runner setup) | Runner toolcache (Python 3.14.5) | setup-uv reads `.python-version` from `working-directory`; falls back to uv-managed install |
| Dependency install | uv (`uv sync --frozen`) | uv package cache (GH Actions cache) | Lockfile is committed (`data/uv.lock`); frozen sync is deterministic |
| Budget enforcement | GitHub Actions step `timeout-minutes` | — | Native runner enforcement, no custom script needed |
| Test failure signal | pytest exit code → GitHub Actions job failure | — | Standard: non-zero exit = red check |

## Standard Stack

### Core Actions

| Action | Version | Purpose | Source |
|--------|---------|---------|--------|
| `actions/checkout` | `v6` | Checkout the repo | [VERIFIED: deploy.yml uses `@v6`; latest tag is v6.0.3] |
| `astral-sh/setup-uv` | `v8.2.0` (SHA `fac544c0...`) | Install uv, pin Python 3.14, enable cache | [VERIFIED: `gh release list --repo astral-sh/setup-uv`] |

### Tools Invoked Inline

| Tool | Command | Purpose |
|------|---------|---------|
| `uv sync` | `uv sync --frozen` | Install all deps per lockfile, no re-resolve |
| `uv run pytest` | `uv run pytest --tb=short -q --durations=10` | Run fast tier; print slowest 10 tests for diagnostics |

**Installation:** No `npm install` — this workflow has no Node.js steps.

## Package Legitimacy Audit

No new external packages are installed by this phase. The workflow uses only:
- `actions/checkout@v6` — GitHub first-party action [VERIFIED: official GitHub org]
- `astral-sh/setup-uv@v8.2.0` — official action from the uv project maintainers [VERIFIED: gh release list --repo astral-sh/setup-uv; github.com/astral-sh/setup-uv]

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
*No third-party packages are introduced. Slopcheck not run (no npm/PyPI installs).*

## Architecture Patterns

### System Architecture Diagram

```
git push (any branch)
        |
        v
GitHub Actions trigger: on.push.branches ['**']
        |
        +---> deploy.yml (build job) ---------> deploy job (main only)
        |                                        [independent; Python failure does NOT block this]
        |
        +---> python-tests.yml (new)
                |
                v
              [checkout]
                |
                v
              [setup-uv: working-directory=data, enable-cache=true]
              reads data/.python-version (3.14) -> Python 3.14.5 from toolcache/uv
                |
                v
              [uv sync --frozen, working-directory=data]
              installs from data/uv.lock -> uv package cache (GH Actions)
                |
                v
              [uv run pytest --tb=short -q --durations=10]
              timeout-minutes: 5 (wall-clock; excludes prior setup steps)
              addopts from pyproject.toml: -m 'not integration'  (fast tier auto-selected)
              D-05 guard: asset-driven skips in fast tier -> FAIL (not skip)
                |
                +-- exit 0 -> green check on commit
                +-- exit non-0 -> red check on commit (test failure)
                +-- timeout at 5:00 -> step killed, red check (budget exceeded)
```

### Recommended Project Structure

```
.github/
└── workflows/
    ├── deploy.yml              # existing frontend CI (unchanged)
    ├── photo-availability.yml  # existing sibling workflow (unchanged)
    └── python-tests.yml        # NEW — only file created by this phase
```

### Pattern 1: uv-based Python CI with setup-uv

**What:** Use `astral-sh/setup-uv` with `working-directory: data` so the action reads `data/.python-version` automatically, then run `uv sync --frozen` + `uv run pytest` inline. No `actions/setup-python` needed.

**When to use:** Any repo with a uv-managed Python subproject under a subdirectory.

**Example — complete python-tests.yml:**
```yaml
# Source: astral-sh/setup-uv README (github.com/astral-sh/setup-uv), deploy.yml pattern
name: Python tests

on:
  push:
    branches: ['**']

# Optional but recommended: cancel superseded runs on the same branch.
# deploy.yml omits this; adding it here avoids wasted runner minutes
# when commits are pushed quickly.
concurrency:
  group: python-tests-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    name: Fast pytest suite (data/)
    runs-on: ubuntu-latest
    permissions:
      contents: read
    defaults:
      run:
        working-directory: data

    steps:
      - uses: actions/checkout@v6

      - name: Set up uv + Python 3.14
        uses: astral-sh/setup-uv@fac544c07dec837d0ccb6301d7b5580bf5edae39  # v8.2.0
        with:
          enable-cache: true
          working-directory: data   # reads data/.python-version -> sets UV_PYTHON=3.14

      - name: Install dependencies
        run: uv sync --frozen

      - name: Run fast pytest suite
        timeout-minutes: 5
        run: uv run pytest --tb=short -q --durations=10
```

**Key notes on this YAML:**
- `defaults.run.working-directory: data` sets the cwd for all `run:` steps AND satisfies the "cd data" intent of TCI-01, without repeating `working-directory` on every step.
- `enable-cache: true` is the default on GitHub-hosted runners but explicit is clearer.
- The `cache-dependency-glob` default already includes `**/uv.lock` — no customization needed.
- `timeout-minutes: 5` on the pytest step only; `uv sync` and setup are excluded from the budget (D-03).
- `--durations=10` prints the 10 slowest tests whenever the suite runs, providing free diagnostics if the budget is approached. Add only if the planner agrees the marginal output is worth it.
- No `pull_request` trigger (D-02).
- No AWS, no OIDC, no secrets required.

### Anti-Patterns to Avoid

- **Putting `timeout-minutes: 5` on the job instead of the step:** The job timeout would include setup time (uv install, package cache restore) which can be 30–120 s on a cold cache. The budget is for the fast suite itself, not CI overhead — D-03 is explicit on this.
- **Using `uv sync --locked` when the lockfile might genuinely drift:** `--frozen` skips re-resolution silently; `--locked` fails the build if `pyproject.toml` changes without a matching `uv lock` update. Either is valid; `--frozen` is the exact flag used in `verify-clean-checkout.sh` for consistency. The planner may prefer `--locked` for strictness.
- **Adding `actions/setup-python`:** Unnecessary. `setup-uv` with `working-directory: data` reads `data/.python-version` and sets `UV_PYTHON=3.14`. uv installs the interpreter if it's not in the toolcache (it is — Python 3.14.5 is in the ubuntu-latest manifest).
- **Using `working-directory: data` only on the pytest step:** Must be consistent across `uv sync` and `uv run pytest`; `defaults.run.working-directory` is cleaner than per-step repetition.
- **Calling `data/scripts/verify-clean-checkout.sh` from CI:** The script creates a git worktree and strips built assets to simulate a clean checkout. In CI, the checkout already lacks those assets — the script's worktree dance is redundant and adds complexity. Run inline per Claude's Discretion.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Python install | Custom `apt install python3.14` or PPA | `astral-sh/setup-uv` + uv managed Python | uv handles interpreter download, toolcache hit, and PATH wiring |
| Cache key computation | Manual `actions/cache` with custom hash | `setup-uv` `enable-cache: true` | Auto-keys on OS, arch, Python version, and `uv.lock` hash |
| Budget enforcement | Custom `time` wrapper script | `timeout-minutes: 5` on step | Native GitHub Actions enforcement; no script to maintain |
| Parallel-run deduplication | No action | `concurrency.cancel-in-progress: true` | Cancels superseded pushes on the same branch automatically |

**Key insight:** GitHub Actions + uv already solve every problem in this phase. The workflow is 30 lines of YAML, not a script.

## Runtime State Inventory

> SKIPPED — this is a greenfield phase (new file only). No renaming, migration, or runtime state involved.

## Common Pitfalls

### Pitfall 1: timeout-minutes on a Step Is NOT Universally Documented

**What goes wrong:** One search result claimed step-level `timeout-minutes` is "ignored" (incorrect). Another source explicitly confirms it kills only that step and fails the job.

**Why it happens:** Older GitHub Actions documentation was ambiguous about step-level vs. job-level timeout. The behavior has been step-level since at least 2020.

**How to avoid:** Use step-level `timeout-minutes: 5` on the pytest step as designed in D-03. Confirmed by [CITED: notes.kodekloud.com/docs/GitHub-Actions/GitHub-Actions-Core-Concepts/Timeout-for-Jobs-and-Steps/page]: "A step-level timeout limits just the problematic step without affecting other steps in the job. When a step exceeds its threshold, it is automatically canceled and the job fails."

**Warning signs:** If the step-level timeout does not appear to work (suite runs indefinitely), fall back to the job-level `timeout-minutes` or use `timeout` command inside the run step.

### Pitfall 2: setup-uv Cache Miss on First Run (cold runner)

**What goes wrong:** The first push to a new branch downloads all Python packages from PyPI (~30 deps + transitive). This is not an error — it's expected cold-cache behavior. The verify-clean-checkout.sh header explicitly warned about this for the local case.

**Why it happens:** `enable-cache: true` restores the uv cache if a matching cache key exists. On the very first run against a new `uv.lock` hash, no cache exists. uv downloads packages. The cache is then uploaded so subsequent runs hit it.

**How to avoid:** This is expected and fine. The `uv sync --frozen` step may take 60–90 s on the first run. It's excluded from the `timeout-minutes: 5` budget (which sits on the pytest step only). Warm runs will be much faster.

**Warning signs:** If `uv sync` exceeds 5 minutes on a warm cache, investigate the cache key — it should include `uv.lock` hash.

### Pitfall 3: D-05 Guard May Fire Unexpectedly in CI

**What goes wrong:** The conftest.py `_zero_inat_pacing` autouse fixture patches `inaturalist_pipeline._INAT_PACE_SECONDS` if the module is importable. If any test inadvertently triggers network access to iNaturalist (via the patched module), the rate limiter is zeroed — but in CI there's no network access to iNat by design. This is not a pitfall.

**The real D-05 pitfall:** The D-05 guard converts asset-driven skips in non-`@integration` tests to failures. Review of all `skipif`-guarded tests confirms every one is also `@pytest.mark.integration`, meaning `addopts = -m 'not integration'` deselects them before the guard fires. There is no fast-tier test that can trigger a D-05 failure from a skip.

**Why confirmed safe:** Verified by grepping: `test_dbt_scaffold.py`, `test_dbt_diff.py`, `test_higher_taxa.py` all have `pytestmark = pytest.mark.integration`; `test_species_export.py` and `test_species_maps.py` `skipif` guards are on `@integration`-marked tests. The guard signatures (`"data/dbt/run.sh build"`, `"run species-export first"`, etc.) only appear in `@integration`-marked test bodies.

**How to avoid:** No action needed. D-05 is not a CI risk.

### Pitfall 4: pytest-randomly Ordering

**What goes wrong:** `pytest-randomly>=4.1.0` is in dev deps. It randomizes test order on every run using a seed derived from the timestamp. If two tests have hidden ordering dependencies, CI could fail non-deterministically.

**Why it happens:** The suite was designed assuming randomized ordering (Phases 139–142); ordering issues should already be fixed. But the random seed changes each run.

**How to avoid:** If a CI run fails with a random ordering that passes locally, inspect `pytest --randomly-seed=<seed>` to reproduce. The seed is printed in the pytest header. No YAML change needed; this is informational for diagnosis.

**Warning signs:** A test failure that disappears on re-run without code changes suggests an ordering issue.

### Pitfall 5: Python 3.14 Resolution Path

**What goes wrong:** Specifying `python-version: "3.14"` in setup-uv sets `UV_PYTHON=3.14`. uv will check `UV_PYTHON_INSTALL_DIR` (uv-managed Python) first, then the system Python, then download from Astral's managed Python builds. The runner toolcache Python 3.14 (used by `actions/setup-python`) is a separate path.

**The important distinction:** `setup-uv` with `working-directory: data` reads `data/.python-version` (contains `3.14`) and sets `UV_PYTHON=3.14` without using `actions/setup-python`. uv then installs its own managed Python 3.14 if not found in `UV_PYTHON_INSTALL_DIR`. Python 3.14.5 is available in uv's managed build catalog.

**How to avoid:** No `actions/setup-python` step needed. The `working-directory: data` input on `setup-uv` is sufficient. [VERIFIED: setup-uv README: "This controls where we look for `pyproject.toml`, `uv.toml` and `.python-version` files which are used to determine the version of uv and python to install."]

**Warning signs:** If `uv sync` errors with "No interpreter found for Python 3.14", check that `working-directory: data` is set on the setup-uv step.

### Pitfall 6: Working-directory Scope

**What goes wrong:** If `working-directory: data` is set only on the setup-uv step but not on the `uv sync` and `uv run pytest` steps, `uv sync` runs from the repo root — where there is no `pyproject.toml`, causing it to fail or install the wrong deps.

**How to avoid:** Use `defaults.run.working-directory: data` at the job level. This sets the cwd for ALL `run:` steps in the job. The setup-uv action has its own `working-directory` input that must be set separately (it's an action input, not a run-step cwd).

**Correct YAML structure:**
```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: data   # applies to all `run:` steps
    steps:
      - uses: actions/checkout@v6
      - uses: astral-sh/setup-uv@fac544c0...
        with:
          working-directory: data   # this input is separate from defaults.run
          enable-cache: true
      - name: Install dependencies
        run: uv sync --frozen       # runs from data/ via defaults.run
      - name: Run fast pytest suite
        timeout-minutes: 5
        run: uv run pytest --tb=short -q --durations=10
```

## Code Examples

### Complete python-tests.yml (ready to commit)

```yaml
# Source: CONTEXT.md D-01..D-03, astral-sh/setup-uv README, deploy.yml trigger pattern
name: Python tests

on:
  push:
    branches: ['**']

concurrency:
  group: python-tests-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    name: Fast pytest suite (data/)
    runs-on: ubuntu-latest
    permissions:
      contents: read
    defaults:
      run:
        working-directory: data

    steps:
      - uses: actions/checkout@v6

      - name: Set up uv + Python 3.14
        uses: astral-sh/setup-uv@fac544c07dec837d0ccb6301d7b5580bf5edae39  # v8.2.0
        with:
          enable-cache: true
          working-directory: data

      - name: Install dependencies
        run: uv sync --frozen

      - name: Run fast pytest suite
        timeout-minutes: 5
        run: uv run pytest --tb=short -q --durations=10
```

**Notes on this exact YAML:**

- `fac544c07dec837d0ccb6301d7b5580bf5edae39` is the commit SHA for `v8.2.0` [VERIFIED: `gh api repos/astral-sh/setup-uv/git/ref/tags/v8.2.0`]. The comment `# v8.2.0` preserves human readability.
- `--frozen` matches the flag used in `data/scripts/verify-clean-checkout.sh` for consistency. Prefer `--locked` if the planner wants stricter lockfile staleness detection.
- `--durations=10` is discretionary (Claude's Discretion). If the output is too noisy, remove it; it does not affect pass/fail.
- `concurrency.cancel-in-progress: true` is a recommendation, not a requirement from CONTEXT.md. The planner may omit it to match `deploy.yml`'s no-concurrency style.
- `permissions.contents: read` is the minimal permission (checkout only; no secrets, no AWS).

### Verifying the CI run end-to-end (success criterion 4)

```bash
# Step 1: push a branch
git push origin HEAD:ci-gate-test

# Step 2: watch the run until completion
WORKFLOW="python-tests.yml"
RUN_ID=$(gh run list -R rainhead/beeatlas -w "$WORKFLOW" -b ci-gate-test -L 1 \
  --json databaseId -q '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status

# Step 3: view logs if failed
gh run view "$RUN_ID" --log-failed

# Step 4: confirm check appears on the commit
gh run list -R rainhead/beeatlas -w "$WORKFLOW" --json conclusion,headBranch,status
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `actions/setup-python` + pip | `astral-sh/setup-uv` (single action) | 2023–2024 | One action handles uv install, Python version pin, and cache |
| `setup-uv@v1/v2/v3` | `setup-uv@v8.2.0` | Ongoing | Major versions introduced breaking input changes; always pin to a major version or SHA |
| Manual `actions/cache` for uv | `enable-cache: true` on setup-uv | 2024 | Built-in cache management; auto-keys on OS, arch, Python, uv.lock hash |

**Deprecated / outdated:**
- `setup-uv@v1–v4` actions: older major versions with different input names. Always use current major (v8.x).
- `pip install -r requirements.txt` pattern: replaced by `uv sync --frozen` for uv-managed projects.

## --frozen vs --locked Decision Note

Both flags are correct for CI. The difference:

| Flag | Behavior | CI Recommendation |
|------|----------|------------------|
| `--frozen` | Installs from lockfile, skips checking if lockfile is up-to-date | Fastest; exact match to `verify-clean-checkout.sh` |
| `--locked` | Installs from lockfile, fails if lockfile would change | Stricter; detects developer forgot to run `uv lock` after editing `pyproject.toml` |

**Recommendation:** Use `--frozen` for consistency with `verify-clean-checkout.sh`. The CONTEXT.md mentions `--frozen` explicitly. The planner may use `--locked` if stricter validation is preferred.

[CITED: docs.astral.sh/uv/concepts/projects/sync/]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `timeout-minutes: 5` on a step kills only that step and fails the job | Common Pitfalls #1 | If wrong (behaves as job-level), setup time is included in budget; could cause false timeouts on cold-cache runs. Use `timeout` shell command as fallback. |
| A2 | Python 3.14 is available in uv's managed Python catalog without extra flags | Pitfall #5 | If wrong, `uv sync` would fail with "No interpreter found". Fix: add explicit `uv python install 3.14` step before `uv sync`. |

**All other key claims are VERIFIED or CITED from official sources.**

## Open Questions

1. **concurrency group: include or omit?**
   - What we know: `deploy.yml` has no concurrency group. `photo-availability.yml` has one. Including it avoids wasted runner minutes when commits are pushed quickly on a branch.
   - What's unclear: Whether the planner wants consistency with `deploy.yml` (no concurrency) or with `photo-availability.yml` (has concurrency).
   - Recommendation: Include it (`cancel-in-progress: true`). For a Python-test workflow triggered on every push, cancelling superseded runs is good hygiene and costs nothing.

2. **`--frozen` vs `--locked`: which flag?**
   - What we know: Both work. `--frozen` matches `verify-clean-checkout.sh`. `--locked` is what the official uv GitHub Actions docs example uses.
   - What's unclear: Whether the planner prefers strict lockfile-staleness detection.
   - Recommendation: Use `--frozen` for consistency with the local proof script.

3. **`--durations=10`: include or omit?**
   - What we know: It adds 10 lines to pytest output showing the slowest tests. Useful for budget monitoring. Does not affect pass/fail.
   - What's unclear: Whether the planner wants the extra output noise.
   - Recommendation: Include it — the suite is near the budget limit and diagnostics are valuable.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `gh` CLI | End-to-end verification (criterion 4) | Yes | 2.93.0 | — |
| `git` | Push test branch | Yes | system | — |
| GitHub Actions runner | Workflow execution | Yes | ubuntu-latest | — |
| Python 3.14 (runner) | pytest execution | Yes (3.14.5, stable) | 3.14.5 | uv downloads managed Python 3.14 |

**Missing dependencies with no fallback:** None.

## Validation Architecture

> `workflow.nyquist_validation: true` — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (configured in `data/pyproject.toml`) |
| Config file | `data/pyproject.toml` (`[tool.pytest.ini_options]`) |
| Quick run command | `cd data && uv run pytest --tb=short -q` |
| Full suite command | `cd data && uv run pytest -m integration` (nightly only) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| TCI-01 | GitHub Actions job runs `uv run pytest` on push, fails on test failure | manual (observe CI run) | `gh run watch <run-id> --exit-status` | Wave 0: create `python-tests.yml` |
| TCI-02 | CI job fails if fast suite exceeds 5 min | manual (observe CI timeout behavior) | `gh run view <run-id> --log` (check for timeout message) | same workflow |

**Both requirements are verified by end-to-end observation of a real CI run** (success criterion 4 in CONTEXT.md). There is no unit test for the CI workflow itself.

### Sampling Rate
- **Per task commit:** N/A (single task; commit the workflow, push, observe)
- **Phase gate:** Green CI run observed on a real push before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `.github/workflows/python-tests.yml` — the only deliverable; must exist before CI can run

*(No test-infrastructure gaps — the pytest suite itself was verified green on a clean checkout in Phase 142.)*

## Security Domain

> `security_enforcement` not explicitly set to false — section included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth in this workflow |
| V3 Session Management | No | Stateless CI job |
| V4 Access Control | Yes (minimal) | `permissions: contents: read` — minimal GH token scope |
| V5 Input Validation | No | No user input processed |
| V6 Cryptography | No | No secrets used |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Supply chain via action version float | Tampering | Pin `astral-sh/setup-uv` to commit SHA with version comment |
| Exfiltration via test code with network | Information Disclosure | Fast suite confirmed: tests touch no network (iNat pacing patched to 0; no S3/AWS) |

**Note on SHA pinning:** The workflow pins `astral-sh/setup-uv` to a commit SHA (`fac544c0...`) with a `# v8.2.0` comment. `actions/checkout@v6` uses a floating major-version tag (matching `deploy.yml`'s convention). Consistency with `deploy.yml` takes precedence here.

## Sources

### Primary (HIGH confidence)
- [VERIFIED: `gh release list --repo astral-sh/setup-uv`] — latest version v8.2.0, SHA confirmed via `gh api`
- [CITED: github.com/astral-sh/setup-uv README] — `working-directory` input reads `.python-version`; `enable-cache` default; `cache-dependency-glob` default includes `uv.lock`
- [CITED: github.com/astral-sh/setup-uv docs/caching.md] — cache key construction; cold cache behavior; `cache-python` option
- [VERIFIED: deploy.yml in repo] — trigger syntax `on: push: branches: ['**']`; `actions/checkout@v6` usage; no concurrency group
- [VERIFIED: data/pyproject.toml] — `addopts = -m 'not integration'`; `requires-python = ">=3.14"` 
- [VERIFIED: data/.python-version] — contains `3.14`
- [VERIFIED: data/scripts/verify-clean-checkout.sh] — uses `uv sync --frozen`; asset strip list confirms CI checkout is already clean
- [VERIFIED: `gh api repos/actions/python-versions/contents/versions-manifest.json`] — Python 3.14.5 stable, available for linux-22.04-x64
- [CITED: docs.astral.sh/uv/concepts/projects/sync/] — `--frozen` skips lockfile up-to-date check; `--locked` asserts lockfile unchanged

### Secondary (MEDIUM confidence)
- [CITED: notes.kodekloud.com/docs/GitHub-Actions/...Timeout-for-Jobs-and-Steps/page] — step-level `timeout-minutes` kills only that step, fails the job; confirmed as real behavior
- [CITED: docs.astral.sh/uv/guides/integration/github/] — `uv sync --locked --all-extras --dev` as CI pattern; `enable-cache: true` recommendation

### Tertiary (LOW confidence)
- One WebSearch result (fixdevs.com) incorrectly stated step-level `timeout-minutes` is "ignored." This is wrong and contradicted by the KodeKloud source and general GitHub Actions behavior. Flagged and discarded.

## Metadata

**Confidence breakdown:**
- Action versions: HIGH — verified via `gh release list` and `gh api`
- `timeout-minutes` step semantics: MEDIUM — confirmed by secondary source; primary docs didn't expose clearly in fetched content
- Python 3.14 availability: HIGH — verified against actions/python-versions manifest
- Cache behavior on cold runner: MEDIUM — inferred from uv docs + setup-uv caching docs; first run downloads, subsequent hits cache
- `--frozen` vs `--locked`: HIGH — both confirmed valid; difference documented from official uv docs

**Research date:** 2026-06-07
**Valid until:** 2026-09-07 (stable GitHub Actions ecosystem; re-verify setup-uv version before use if >90 days)
