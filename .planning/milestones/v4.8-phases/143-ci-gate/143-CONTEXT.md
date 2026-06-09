# Phase 143: CI Gate - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning

<domain>
## Phase Boundary

The CI capstone of the v4.8 test-suite milestone. Phases 139–142 built the two-tier
scaffold, distilled fixtures, greened the suite, wired the `@integration` tier into
`nightly.sh`, and proved the fast suite green on a clean checkout. This phase makes the
**fast (`-m "not integration"`) tier run automatically in GitHub Actions** so Python
tests are no longer invisible in CI.

Delivers (per ROADMAP §143 / TCI-01, TCI-02):
- **TCI-01** — a GitHub Actions job runs `cd data && uv run pytest` (Python 3.14 + uv) on
  push, failing the build on any test failure or error.
- **TCI-02** — the job enforces the <5 min runtime budget, failing when the fast suite
  exceeds it (preventing silent regression).
- A green CI run confirmed end-to-end on a real push to a branch (ROADMAP success
  criterion 4 — a verification step, not just config authoring).

NOT in scope: changing the test suite itself, the marker split, the integration/nightly
tier, or any frontend CI (`deploy.yml`). This phase only adds the CI surface that runs the
already-built fast tier. The milestone ends here.
</domain>

<decisions>
## Implementation Decisions

### Workflow placement & deploy coupling
- **D-01 — Separate, fully independent workflow:** Create a new
  `.github/workflows/python-tests.yml`. It runs in parallel with `deploy.yml`, needs **no
  AWS/OIDC** and **no built assets** (the fast tier touches no network and no S3). A
  Python-test failure shows a **red check** on the commit/PR but does **NOT** block the
  frontend S3 deploy — `deploy.yml`'s deploy job continues to gate only on its own `build`
  job. Rationale: the `data/` pipeline tests validate pipeline *code* and are orthogonal to
  the frontend build/deploy; coupling them would let a data-test failure wrongly block a
  frontend release (and vice-versa). Cleanest separation of concerns; mirrors the existing
  one-workflow-per-concern layout (`deploy.yml`, `photo-availability.yml`).

### Trigger events
- **D-02 — `on: push: branches: ['**']`, no `pull_request`:** Mirror `deploy.yml`'s
  trigger style exactly. Every branch push runs the fast suite once; no double-runs. This
  is a single-maintainer, same-repo workflow (no fork-PR traffic to cover), so a
  pushed branch *is* the PR branch and a `pull_request` event would only add redundant
  duplicate runs.
  - **D-02a — TCI-01 wording note (deliberate):** TCI-01 literally says "on push **and
    pull request**." The chosen push-only trigger satisfies the intent (every change to
    every branch is gated before merge) but not the literal `pull_request` event. This is
    an intentional, recorded deviation — the verifier should treat push-on-all-branches as
    meeting TCI-01, not flag the missing `pull_request` event as a gap.

### Budget enforcement (TCI-02)
- **D-03 — Hard fail via `timeout-minutes: 5` on the pytest step:** Put `timeout-minutes:
  5` on the step that runs `uv run pytest` (not the whole job). If the fast suite exceeds
  the budget, GitHub kills the step and the build goes red — an unambiguous hard gate, no
  custom timing script. Because the timeout sits on the **pytest step only**, the budget
  measures the suite runtime itself, excluding `setup-uv` / `uv sync` setup time (which is
  the right thing to gate — "the fast suite" is what TPERF-02/TCI-02 bound). Chosen over a
  measure-and-warn approach because the milestone's whole point is a **hard** <5 min line;
  a warning would allow silent budget creep.

### Claude's Discretion
- **Clean-checkout reuse (the un-selected gray area):** CI's checkout is already free of
  built assets (`dbt/target`, `public/data`, `raw/taxa.csv.gz`, `beeatlas.duckdb` are all
  un-checked-in), so the worktree-create + asset-strip dance in
  `data/scripts/verify-clean-checkout.sh` is **redundant in CI**. Run `uv sync --frozen` +
  `uv run pytest` **inline** in the workflow steps rather than invoking the script. CI thus
  naturally exercises the same clean-checkout contract TPERF-03 proves locally; the script
  remains the local/dev proof and the canonical home of the strip-list. (Planner may still
  choose to call the script if it proves DRYer — but the default is inline.)
- CI YAML mechanics: `astral-sh/setup-uv` (with built-in cache enabled), Python 3.14 pin
  (via `data/.python-version` / `requires-python`), `uv sync --frozen` against the
  committed `data/uv.lock`, `working-directory: data`. Whether to add `--durations=N` for
  slow-test diagnostics. Job name / check-list label wording.
- Exact placement of `timeout-minutes` (pytest step vs a dedicated run step) as long as it
  gates the suite runtime per D-03.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — TCI-01, TCI-02 definitions + accept criteria (§"CI Gate
  (TCI)"); TPERF-02 (<5 min budget the CI gate enforces); the **Out of Scope** list
  (Python-only, no model/contract changes).
- `.planning/ROADMAP.md` §"Phase 143: CI Gate" — goal + 4 success criteria (note criterion
  2's "fails (or is flagged as a warning-level failure)" wording — D-03 chooses the hard
  fail; criterion 4 requires an end-to-end green run on a real push).

### Existing CI to mirror / coexist with
- `.github/workflows/deploy.yml` — the existing frontend CI (build → deploy-on-main →
  lighthouse). Trigger style to mirror (`on: push: branches: ['**']`, line 3–5). Uses
  `setup-node@v6` with `node-version-file: .nvmrc`; the new workflow's `setup-uv` +
  Python-3.14 pin is the analog. The deploy job gates only on `build` (line 83–84) — D-01
  keeps Python tests out of that chain.
- `.github/workflows/photo-availability.yml` — sibling-workflow precedent (independent,
  non-blocking, own trigger). Confirms the one-workflow-per-concern layout D-01 follows.

### The fast suite the CI gate runs
- `data/pyproject.toml` §`[tool.pytest.ini_options]` — `addopts = -m "not integration"`
  (default deselects the nightly tier) + `requires-python = ">=3.14"`. CI runs the bare
  `uv run pytest`; the addopts give it the fast tier automatically.
- `data/uv.lock` + `data/.python-version` (`3.14`) — what `uv sync --frozen` + the Python
  pin resolve against in CI.
- `data/scripts/verify-clean-checkout.sh` — the Phase-142 (D-02) local clean-checkout
  proof. Its header explicitly anticipates Phase 143 reuse; its asset-strip list
  (`dbt/target`, `public/data`, `raw/taxa.csv.gz`, `beeatlas.duckdb`) documents exactly
  what a clean CI checkout already lacks. See Claude's Discretion re: inline-vs-invoke.
- `data/nightly.sh` — runs the **integration** tier (`-m integration`) on maderas; the CI
  gate is its build-time counterpart. Not modified here, but read to confirm the
  tier boundary CI respects (CI = code-validation/fast tier only).

### Prior-phase decisions that frame this phase
- `.planning/phases/139-baseline-two-tier-scaffold/139-CONTEXT.md` — build-time-vs-nightly
  framing (D-03 build target <5 min is the CI-enforced gate); marker is `integration`;
  stock pytest only, no custom flag.
- `.planning/phases/142-verify-budget-green-suite-nightly-wiring/142-CONTEXT.md` — D-02
  (the committed clean-checkout script designed for Phase-143 reuse); the verified
  fast-suite green-on-clean-checkout contract CI re-runs continuously.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.github/workflows/deploy.yml` — template for a GitHub Actions workflow in this repo
  (checkout@v6, language-version-file pin, dependency-install + test steps, artifact
  upload). The new `python-tests.yml` mirrors its shape with `setup-uv` instead of
  `setup-node` and no AWS/deploy steps.
- `data/scripts/verify-clean-checkout.sh` — encodes the clean-checkout asset-strip list and
  the `uv sync --frozen` + `uv run pytest` invocation; reference for the CI steps even if
  run inline (D-03 / Claude's Discretion).
- `data/pyproject.toml` `addopts = -m "not integration"` — makes a bare `uv run pytest` the
  fast tier automatically; CI needs no extra marker flags.

### Established Patterns
- One GitHub workflow per concern (`deploy.yml`, `photo-availability.yml`) — D-01's
  separate `python-tests.yml` follows this; independent/non-blocking sibling workflows are
  already the house style.
- Version pinning via committed files (`.nvmrc` for Node; `data/.python-version` = `3.14`
  and `data/uv.lock` for Python) — CI reads these rather than hard-coding versions.

### Integration Points
- New file `.github/workflows/python-tests.yml` — the only artifact created.
- No changes to `deploy.yml`, the test suite, `data/pyproject.toml`, or `nightly.sh`.
- The phase's final success criterion (green run on a real push) requires pushing a branch
  and observing the check — an actual CI run, not just committed YAML.

</code_context>

<specifics>
## Specific Ideas

- Budget is measured on the **pytest step only** (via `timeout-minutes`), not the whole job
  — setup/`uv sync` time is excluded from the <5 min gate, matching "the fast suite"
  semantics of TPERF-02/TCI-02.
- "Honest budget" framing carried from 139–142: <5 min is a **hard line**. If CI trips it,
  fix the suite — don't loosen the gate.
- Same-repo, single-maintainer reality drives D-02 (push-only) — no fork-PR surface to
  defend, so `pull_request` would only duplicate runs.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (The milestone ends with this phase; no v4.8
work remains after the CI gate is green.)

### Reviewed Todos (not folded)
- **table-rank-column.md**, **genus-page-subgenera-breakout.md**,
  **pluralization-sweep-web-copy.md**, **cluster-selection-visual-feedback.md** — surfaced
  only as keyword false-positives (matched "phase"/"alongside"). All are web-frontend/UI
  work, unrelated to the CI-gate / test-suite milestone. Not folded (same disposition as
  Phases 139–142).

</deferred>

---

*Phase: 143-ci-gate*
*Context gathered: 2026-06-07*
