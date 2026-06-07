# Phase 142: Verify Budget, Green Suite & Nightly Wiring - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning

<domain>
## Phase Boundary

The verification + wiring capstone of the v4.8 test-suite milestone. Phases 139–141 built the two-tier scaffold, distilled fixtures, greened the ~19 red tests, and tagged dataset-validation checks `@pytest.mark.integration`. This phase **proves** the result holds and **wires** the slow tier into production.

Delivers (per ROADMAP §142 / TFIX-05, TPERF-02, TPERF-03, TTIER-03):
- **TFIX-05** — the full fast suite is green (0 failures, 0 errors).
- **TPERF-02** — the fast default suite (`cd data && uv run pytest`) completes in **< 5 min** (timed on the dev host per the requirement's accept criterion).
- **TPERF-03** — the fast suite runs **green on a clean checkout**: no un-checked-in built assets (no `dbt/target`, no `public/data`, no `raw/taxa.csv.gz`, no `beeatlas.duckdb`), no network, no AWS/S3.
- **TTIER-03** — `nightly.sh` runs the `@integration` tier on maderas against real built data and surfaces failures.
- Update `data/tests/BASELINE.md` with measured after-numbers (it is the designated living doc for this; 139 D-08 + BASELINE History row already reserve Phase 142 for this).

NOT in scope: CI gate (Phase 143, TCI-01/02 — GitHub Actions running the fast suite + enforcing the budget). TFIXTURE-05 (broadening fixtures) is **conditionally in scope** — pursued only if the measured budget exceeds 5 min (see D-03).
</domain>

<decisions>
## Implementation Decisions

### Nightly integration-tier wiring (TTIER-03)
- **D-01 — Hard gate, blocks publish:** In `nightly.sh`, a failing `@integration` test makes the run exit non-zero **before the S3 push**, so stale data stays live until fixed and the healthcheck ping is skipped (monitoring catches the failure). A dataset-validation failure is a **deploy blocker**, not an advisory log line.
- **D-01a — Gate placement / sequencing:** The integration tier must run **after the dbt build produces fresh artifacts but before the export/publish + CloudFront invalidation**. Rationale: `test_dbt_diff` compares fresh `target/sandbox/*` against the **published** `public/data/*` — when the gate runs pre-publish, "published" = last night's live S3 data, which is the **correct regression-diff baseline** (this run's candidate vs the currently-live dataset). Planner/researcher must confirm where in the nightly flow the dbt sandbox + a local `public/data/` baseline are available (the current `nightly.sh` builds exports to `/tmp/beeatlas-export` and does not obviously retain `public/data/` or `dbt/target/sandbox/` — resolve this sequencing before wiring). The existing EXIT-trap DuckDB/taxa backup should be **preserved on failure** (it protects pipeline progress like `occurrence_links` and is orthogonal to publish).
- **D-01b — Gate scope:** **All** `@integration` tests gate the publish — `test_dbt_diff`, the 50,646-row count assertion, the full `taxa.csv.gz` LCA, and the scaffold/export/higher-taxa dataset checks. Any single failure blocks the data refresh. (User explicitly chose the full set over a block-vs-advisory split, honoring the "a dataset failure is a deploy blocker" intent.)

### Clean-checkout green proof (TPERF-03)
- **D-02 — Committed reusable script:** Prove green-on-clean-checkout with a **checked-in, repeatable script** (fresh `git worktree` or clone with built assets / `raw/taxa.csv.gz` stripped, no network, no AWS) that runs the fast suite and asserts green. Phase 143's CI gate (TCI-01/02) can reuse it. Chosen over a one-time manual proof because it makes TPERF-03 continuously verifiable, not a stale claim. Worktree-vs-clone mechanism and exact asset-stripping list are Claude's discretion (see below).

### Budget measurement & over-budget contingency (TPERF-02)
- **D-03 — Pursue TFIXTURE-05 if over 5 min:** Measure the fast-suite wall-clock (dev host, default marker deselection active). If it lands **over 5 min**, broaden the Phase-140 session/module-scoped fixture pattern to the remaining per-test DuckDB builders (`test_inactive_remap.py`, `test_places_*`, `test_species_maps.py`, `test_higher_taxa.py` — the TFIXTURE-05 stretch set) until it's under. The hard gate must stay honest, so the budget is non-negotiable rather than re-baselined. This pulls the otherwise-deferred TFIXTURE-05 into scope **conditionally** — only as much of it as needed to cross the threshold.
- **D-03a — Measurement-host caveat:** TPERF-02's accept criterion measures on the **dev host**. Beware the known maderas-orchestrator constraint: long Bash runs get SIGKILLed (per project memory). The measurement command must be robust to this — if running on maderas, scope/time carefully; the suite being fast (<5 min) is exactly what makes a clean whole-suite timed run survivable, but don't assume it pre-fix.

### Green-suite proof robustness (TFIX-05)
- **D-04 — Default random seed, single run:** Prove green under **one default `pytest-randomly` randomized run**, as developers and CI actually experience it. Relies on Phase 141 D-08 having closed the order-dependent fixture hazard (`test_checklist_pipeline.py` module- vs function-scoped fixture). Not pinning a seed (would mask order-dependence) and not sweeping multiple seeds (extra runtime not warranted given D-08 already hardened the known hazard).

### Claude's Discretion
- D-02 mechanism: `git worktree` vs fresh clone, and the exact list of assets to strip (`dbt/target`, `public/data`, `raw/taxa.csv.gz`, `beeatlas.duckdb`, any `target/sandbox`) to faithfully simulate a clean checkout.
- D-01a exact insertion point in `nightly.sh` and how to make the dbt sandbox + `public/data` baseline available pre-publish for `test_dbt_diff` (research/planning to resolve).
- How much of the TFIXTURE-05 set to convert under D-03 (smallest set that crosses the 5-min line).
- BASELINE.md after-numbers presentation (update the existing per-tier table + History row; optionally record the integration-tier inventory and the clean-checkout command).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — TFIX-05, TPERF-02/03, TTIER-03 definitions + accept criteria (TPERF lines ~12–18; TTIER-03 + accept; TFIX-05). TFIXTURE-05 stretch definition under "Future Requirements".
- `.planning/ROADMAP.md` §"Phase 142" — goal + the v4.8 phase sequence (139→143).

### Prior-phase decisions to honor
- `.planning/phases/139-baseline-two-tier-scaffold/139-CONTEXT.md` — marker is `@pytest.mark.integration`; default deselect via `addopts = -m "not integration"`; stock pytest only; BASELINE.md is the living doc this phase updates.
- `.planning/phases/140-checklist-taxonomy-fixture-distillation/140-CONTEXT.md` — session/module-scoped shared-connection fixture pattern (the template TFIXTURE-05 broadening under D-03 would follow); read-through-real-code-path, smallest distilled sample, exact-count assertions, per-fixture provenance.
- `.planning/phases/141-built-asset-fixtures-red-test-fixes-silent-skip-elimination/141-CONTEXT.md` — D-04 (`test_dbt_diff` tagged `@integration` for nightly real-data run); D-05 (conftest guard: 0 silent asset-driven skips in the fast tier); D-08 (order-dependent fixture hazard closed — the basis for D-04 here).

### Code under test / to modify
- `data/nightly.sh` — single nightly entry point; the **only** place to wire the integration tier (per CLAUDE.md "Known State"). Note `set -euo pipefail`, the EXIT-trap DuckDB/taxa backup, the export→S3→CloudFront→healthcheck-ping tail.
- `data/pyproject.toml [tool.pytest.ini_options]` — `addopts = "-m 'not integration'"`; `integration` marker registration.
- `data/tests/conftest.py` — Phase 141 D-05 asset-missing-skip guard; relevant to TPERF-03 clean-checkout behavior.
- `data/tests/BASELINE.md` — living doc; update with measured after-numbers (per-tier table + Targets + History row reserved for Phase 142).
- `data/tests/test_dbt_diff.py` — the cross-artifact regression diff gated under D-01b; its fresh-vs-published semantics drive D-01a sequencing.
- Integration-marked files (gate scope, D-01b): `test_checklist_pipeline.py`, `test_dbt_diff.py`, `test_dbt_scaffold.py`, `test_higher_taxa.py`, `test_resolve_checklist_names.py`, `test_species_export.py`, `test_species_maps.py`.
- TFIXTURE-05 candidate set (conditional, D-03): `data/tests/test_inactive_remap.py`, `data/tests/test_places_*.py`, `data/tests/test_species_maps.py`, `data/tests/test_higher_taxa.py`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `data/nightly.sh` — well-structured single entry point with timing helpers (`_ts`, `_elapsed`), an EXIT trap, and a clear export→publish→invalidate→ping tail; the integration-tier invocation slots in before the publish step (D-01a).
- Phase 140's session/module-scoped shared-connection fixture pattern — the proven template for the D-03 TFIXTURE-05 broadening.
- `@pytest.mark.integration` + `addopts = -m "not integration"` (139) — already in place; nightly opt-in is `cd data && uv run pytest -m integration`.
- Phase 141 D-05 conftest asset-missing-skip guard — already enforces "0 silent skips" in the fast tier, which TPERF-03's clean-checkout run will exercise.

### Established Patterns
- Two-tier criterion is "validates code vs validates data" (BASELINE.md), not "is it slow" — the integration tier is exactly the dataset-validation set the nightly gate runs.
- Built assets read via duckdb `read_parquet('<SANDBOX>/...')` against module-level path constants — relevant to making `public/data` / sandbox available for `test_dbt_diff` in nightly.

### Integration Points
- `nightly.sh` runs on maderas (sole execution host); the gate must respect `set -euo pipefail` and the existing failure-handling trap.
- TPERF-03's clean-checkout script and Phase 143's CI gate share the same "fast suite green from nothing" contract — D-02's committed script is the reuse seam.

</code_context>

<specifics>
## Specific Ideas

- `test_dbt_diff`'s "published baseline" semantics are load-bearing for D-01a: running the gate **pre-publish** makes the diff "this run's candidate vs currently-live S3 data" — the correct regression interpretation, not a tautology.
- "Honest budget" framing (carried from 141): the <5 min target is a hard line — if missed, fix the suite (D-03), don't re-baseline the target.
- Hard gate intent (D-01): a red dataset-validation test should stop bad data from going live, accepting the tradeoff that an intended schema/data change tripping `test_dbt_diff` will block the refresh until the diff baseline is reconciled.

</specifics>

<deferred>
## Deferred Ideas

- **CI gate (TCI-01/02)** — Phase 143: GitHub Actions running the fast suite on push/PR + enforcing the <5 min budget. The D-02 clean-checkout script is designed to be reused there.
- **Remainder of TFIXTURE-05** not needed to cross the 5-min line — stays a future optimization (a shared "tiny canonical DuckDB" builder unifying per-file ad-hoc DB construction).

### Reviewed Todos (not folded)
- **genus-page-subgenera-breakout.md**, **pluralization-sweep-web-copy.md**, **table-rank-column.md**, **cluster-selection-visual-feedback.md** — surfaced only as keyword false-positives (matched "phase"/"verify"/"after"). All are web-frontend/UI work, unrelated to the test-suite milestone. Not folded (same disposition as Phase 141).

</deferred>

---

*Phase: 142-verify-budget-green-suite-nightly-wiring*
*Context gathered: 2026-06-06*
