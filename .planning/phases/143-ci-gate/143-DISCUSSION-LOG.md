# Phase 143: CI Gate - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-07
**Phase:** 143-ci-gate
**Areas discussed:** Workflow placement & deploy coupling, Trigger events, Budget enforcement (TCI-02)

*(A 4th candidate area — "Clean-checkout reuse" — was offered but not selected; handled as Claude's Discretion in CONTEXT.md.)*

---

## Workflow placement & deploy coupling

| Option | Description | Selected |
|--------|-------------|----------|
| Separate workflow, fully independent | New `.github/workflows/python-tests.yml`; parallel to deploy.yml, no AWS/OIDC, no built assets; failure shows red check but does NOT block frontend S3 deploy | ✓ |
| Job inside deploy.yml | Add a `python-tests` job to deploy.yml; `deploy: needs: [build, python-tests]` so a red Python suite also blocks the main deploy | |

**User's choice:** Separate workflow, fully independent.
**Notes:** Data-pipeline tests are orthogonal to the frontend build/deploy; keeping them independent avoids cross-blocking. Mirrors the repo's one-workflow-per-concern layout.

---

## Trigger events

| Option | Description | Selected |
|--------|-------------|----------|
| `push:[main]` + `pull_request` | One run per PR (any base) + direct pushes to main; avoids double-runs; satisfies TCI-01 literally | |
| `push:['**']` + `pull_request` | Mirrors deploy.yml all-branch push plus PRs; PR branches run twice per push | |
| `push:['**']` only | Match deploy.yml exactly, no `pull_request` event; one run per branch push, no double-runs; fork PRs not covered | ✓ |

**User's choice:** `push:['**']` only.
**Notes:** Single-maintainer, same-repo workflow — a pushed branch is the PR branch, so a `pull_request` event would only add redundant runs. Recorded D-02a: the literal `pull_request` event in TCI-01's wording is intentionally not implemented; push-on-all-branches meets the intent.

---

## Budget enforcement (TCI-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Hard fail via `timeout-minutes` | `timeout-minutes: 5` on the pytest step; over-budget → GitHub kills the step → build red; no scripting | ✓ |
| Measure & fail with message | Time the run, let it finish, compare elapsed vs budget, exit non-zero with explicit message; friendlier diagnostics | |
| Measure & warn (non-blocking) | Same measurement but emits `::warning::` and stays green (matches roadmap's "warning-level" wording); risk of silent creep | |

**User's choice:** Hard fail via `timeout-minutes: 5` on the pytest step.
**Notes:** Budget sits on the pytest step only, so setup/`uv sync` time is excluded — "the fast suite" runtime is what's gated. Chosen as a genuine hard line over warning, consistent with the milestone's honest-budget framing.

---

## Claude's Discretion

- Clean-checkout reuse: run `uv sync --frozen` + `uv run pytest` **inline** in the workflow (CI checkout already lacks built assets, so `verify-clean-checkout.sh`'s worktree+strip is redundant); script stays the local proof + strip-list home.
- CI YAML mechanics: `astral-sh/setup-uv` (cache on), Python 3.14 pin via committed files, `uv.lock` frozen sync, `working-directory: data`, optional `--durations`, job/check label wording.

## Deferred Ideas

None — discussion stayed within phase scope; the milestone ends with this phase.
