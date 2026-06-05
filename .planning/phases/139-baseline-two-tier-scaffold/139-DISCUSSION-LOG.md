# Phase 139: Baseline & Two-Tier Scaffold - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-05
**Phase:** 139-baseline-two-tier-scaffold
**Areas discussed:** Baseline method & cost (user-selected); Marker design and Tagging scope (Claude's-discretion areas, confirmed with user)

---

## Baseline method & cost

User reframed the whole model mid-discussion: the split is **build-time (validating code)** vs **nightly (validating datasets)** — so each tier needs its own baseline + target, and *"guesstimate baselines are okay, targets are more important."* This redirected the baseline-cost question away from precise measurement.

### Baseline rigor

| Option | Description | Selected |
|--------|-------------|----------|
| Estimate, no full run | Skip the ~40-min run; estimate each tier from known mega-offenders + collection time | ✓ |
| Time offenders, sum the rest | Time the 2-3 dominant files individually, guesstimate the remainder | |
| One full run anyway | Pay the ~40-min run for a real measured total | |

**User's choice:** Estimate, no full run.
**Notes:** Baselines are guesstimate-acceptable; effort belongs on targets.

### Nightly tier target

| Option | Description | Selected |
|--------|-------------|----------|
| Soft ceiling ~15 min | Aim under ~15 min, soft goal | |
| No numeric target | Nightly allowed to take as long as it takes | |
| Tight ~10 min | Hold nightly to ~10 min stretch target | ✓ |

**User's choice:** Tight ~10 min.
**Notes:** Recorded as a stretch target (not a CI-enforced gate) — tighter than REQUIREMENTS, which allow the dataset tier to be slow. Build-time tier target stays locked at < 5 min (TPERF-02).

---

## Marker design (Claude's discretion, confirmed)

| Option | Description | Selected |
|--------|-------------|----------|
| nightly | `@pytest.mark.nightly`; matches the run-in-nightly.sh model | |
| slow | `@pytest.mark.slow`; conventional idiom | |
| integration | `@pytest.mark.integration`; emphasizes "tests real built artifacts" | ✓ |

**User's choice:** `integration`.
**Notes:** Paired with `addopts = -m "not integration"` in `data/pyproject.toml`, opt-in via stock `-m integration`, no custom flag (Claude's-discretion default, unobjected).

---

## Tagging scope (Claude's discretion, confirmed)

First framing ("Scaffold + prove wiring / Pure scaffold / Tag all") drew "I have no idea what you're asking about." Re-asked in plain language (does 139 label any tests, or just build the labeling machinery?).

| Option | Description | Selected |
|--------|-------------|----------|
| Label 1-2 to prove it works | Set up skip-by-default AND label 1-2 obvious dataset tests to verify the mechanism; bulk labeling in Phase 141 | ✓ |
| Machinery only, label nothing | Configure skip-by-default, label nothing until Phase 141 | |

**User's choice:** Label 1-2 to prove it works.
**Notes:** Systematic tagging stays in Phase 141 (TTIER-02). 139 only proves the skip/opt-in mechanism.

---

## Claude's Discretion

- BASELINE.md exact structure (required contents fixed in CONTEXT D-08): `data/tests/BASELINE.md`, per-tier estimates + targets + dominant contributors + ~19 red-test inventory + reproduce command; living doc updated in Phase 142.
- Which specific 1-2 tests receive the `integration` label (50,646-row count is the obvious first).
- Whether to time the dominant files individually to sharpen the estimate (cheap, optional).

## Deferred Ideas

- Systematic full-data tagging → Phase 141 (TTIER-02).
- Fixture distillation + session-scoped DuckDB → Phase 140 (TFIXTURE-01/02/04).
- Built-asset fixtures, red-test fixes, silent-skip elimination → Phase 141.
- Measured after-numbers / budget verification → Phase 142 (TPERF-02/03).
- CI gate enforcing the budget → Phase 143 (TCI).
- Reviewed todo `data-test-suite-environmental-deps.md` (tagged `resolves_phase 141`) — not folded.
