# Phase 142: Verify Budget, Green Suite & Nightly Wiring - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-06
**Phase:** 142-verify-budget-green-suite-nightly-wiring
**Areas discussed:** Nightly failure policy, Clean-checkout proof, Budget-miss contingency, Green-suite randomization, Nightly gate scope

---

## Nightly failure policy (TTIER-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Soft: log + continue + still publish | Log failures loudly but don't abort; data still builds/publishes/pings healthcheck. | |
| Hard gate: fail run, block publish | Failing integration test exits non-zero before publish; stale data stays live, healthcheck ping skipped. | ✓ |
| Split: test after publish, non-zero exit only | Publish first, then test; failure exits non-zero but data already live. | |

**User's choice:** Hard gate: fail run, block publish
**Notes:** Dataset-validation failures treated as deploy blockers. Surfaced sequencing implication (gate must run after dbt build, before publish; `test_dbt_diff` baseline = last night's live data = correct regression semantics) — captured as D-01a.

---

## Clean-checkout proof (TPERF-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Committed reusable script | Checked-in worktree/clone-with-assets-stripped script that asserts green; reusable by Phase 143 CI. | ✓ |
| One-time manual proof in BASELINE.md | Manual clean run recorded once; Phase 143 re-derives its own. | |

**User's choice:** Committed reusable script
**Notes:** Continuous verifiability over a stale claim; becomes the reuse seam for the Phase 143 CI gate.

---

## Budget-miss contingency (TPERF-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Pursue TFIXTURE-05 stretch to get under | Broaden session/module-scoped fixtures to remaining DuckDB builders until < 5 min. | ✓ |
| Accept + document, defer optimization | Record real number, leave TFIXTURE-05 to a future phase. | |
| Decide when we see the number | Don't pre-commit; planner notes both branches. | |

**User's choice:** Pursue TFIXTURE-05 stretch to get under
**Notes:** Hard gate must stay honest — budget is non-negotiable. Pulls TFIXTURE-05 into scope conditionally (smallest set needed to cross 5 min).

---

## Green-suite randomization (TFIX-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Default random seed, single run | Prove green under one default pytest-randomly run, as devs/CI experience it. | ✓ |
| Pin a seed for reproducibility | Record exact seed; reproducible but masks order-dependence. | |
| Sweep a few seeds to stress ordering | Run several seeds to hunt residual order hazards. | |

**User's choice:** Default random seed, single run
**Notes:** Relies on Phase 141 D-08 having closed the known order-dependent fixture hazard.

---

## Nightly gate scope (TTIER-03)

| Option | Description | Selected |
|--------|-------------|----------|
| All @integration tests | Every tagged test gates publish (dbt diff, 50k count, full LCA, scaffold/export/higher-taxa). | ✓ |
| All, but diff failures advisory | Diff (`test_dbt_diff`) logged-but-non-blocking; integrity checks hard-block. | |
| Decide during planning | Planner proposes per-test block-vs-advisory split. | |

**User's choice:** All @integration tests
**Notes:** Any single failure blocks the data refresh; honors the "dataset failure is a deploy blocker" intent. Accepts that an intended schema/data change tripping `test_dbt_diff` will block the refresh until reconciled.

---

## Claude's Discretion

- Worktree-vs-clone mechanism and exact asset-stripping list for the D-02 clean-checkout script.
- Exact insertion point in `nightly.sh` and how to make the dbt sandbox + `public/data` baseline available pre-publish for `test_dbt_diff`.
- How much of the TFIXTURE-05 set to convert (smallest set crossing 5 min).
- BASELINE.md after-numbers presentation.

## Deferred Ideas

- CI gate (TCI-01/02) — Phase 143; reuses the D-02 clean-checkout script.
- Remainder of TFIXTURE-05 not needed to hit the budget — future optimization.
- Reviewed-not-folded todos (keyword false-positives, all web-frontend): genus-page-subgenera-breakout, pluralization-sweep-web-copy, table-rank-column, cluster-selection-visual-feedback.
