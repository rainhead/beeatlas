# BeeAtlas Data Test Suite — Baseline & Performance Targets

**Status:** Living document. Phase 139 establishes the before-anchor; Phase 142 updates it with measured after-numbers once fixture distillation and systematic tagging land.

---

## Framing: Two-Tier Test Suite

The `data/` pytest suite splits into two tiers based on *what* each test validates — not on how long it takes:

| Tier | Decision criterion | When it runs |
|------|-------------------|--------------|
| **Build-time** | Validates *code* — logic, transforms, schema contracts, unit behavior | Every push / local dev (`cd data && uv run pytest`) |
| **Nightly / integration** | Validates *datasets* — real committed CSV/parquet files, built dbt artifacts | Nightly cron on maderas; opt-in locally with `-m integration` |

The marker decision criterion is **"does this test validate code or validate data?"** — not "is it slow." A slow code test belongs in the build-time tier (and gets fixtures to make it faster, Phase 140). A dataset-validation test gets `@pytest.mark.integration` regardless of speed.

**Implementation:** `addopts = "-m 'not integration'"` in `data/pyproject.toml` deselects the integration tier by default. Run `cd data && uv run pytest -m integration` to opt in.

---

## Per-Tier Measured Runtimes (Phase 142 after-numbers)

Measured on maderas (the dev/production host), 2026-06-07, with `pytest-randomly` randomized order.

| Tier | Before (Phase 139 estimate) | After (Phase 142 measured) | Notes |
|------|----------------------------|---------------------------|-------|
| **Build-time** (all tests minus integration-marked) | ~30–40 min | **18.8 s** | 197 passed / 9 skipped — fixture distillation (Phase 140) eliminated the dominant CSV-reparsing cost |
| **Nightly / integration** | ~5–10 min | not measured in Phase 142 | Dataset-validation tier; runs in nightly cron |
| **Collection time** | ~2.3 s | ~0.4 s | 197 + 57 deselected = 254 tests collected |

Clean-checkout verification command (TPERF-03):

```bash
bash data/scripts/verify-clean-checkout.sh
```

---

## Targets

These targets drive the v4.8 milestone. The baseline numbers above are the before-anchor; Phase 142 measures the after-numbers.

| Tier | Target | Type | Enforced by |
|------|--------|------|-------------|
| Build-time | `< 5 min` | Hard gate | CI (Phase 143, TCI-02) — fails the PR if exceeded |
| Nightly / integration | `~10 min` | Stretch goal | Not CI-enforced; aspirational to keep maderas cron lean; real dataset checks that genuinely need more time are allowed |

---

## Dominant Cost Contributors

Three sources account for the vast majority of build-time suite runtime:

### 1. `test_checklist_pipeline.py` — checklist_records_full.csv reparsing (~25 tests)

Each of the ~25 tests in this file calls `mod.load_checklist()`, which:
- Reparses `data/checklists/checklist_records_full.csv` — 50,646 rows, 7.1 MB — from disk on every test.
- Reinserts ~50k rows into a fresh per-test DuckDB.

This is the single largest cost driver. Phase 140 (TFIXTURE-01/02) will distill a session-scoped DuckDB fixture built once per suite run.

### 2. `test_resolve_checklist_names.py` — taxa.csv.gz parsing (~7 tests)

Each test parses `data/raw/taxa.csv.gz` (39 MB) — approximately 5 seconds per invocation, ~7 tests = ~35 s from this file alone. Also contains `test_at_least_13_fuzzy_candidates` (currently failing; fixed in Phase 141).

### 3. Collection time

~2.3 s to collect 263 tests across 25 test files. Not a target for optimization.

---

## Current Red-Test Inventory (~19 known failures)

**The suite is currently partly red.** These failures are known and tracked — they are NOT fixed in Phase 139. Phase 141 resolves them.

| File | Count | Root cause | Fix phase |
|------|-------|-----------|-----------|
| `test_resolve_taxon_ids.py` | ~16 | Stale `resolver_db` fixture (built against an old snapshot; diverged from current dbt output) | Phase 141 |
| `test_dbt_diff.py` | 2 | Stale sandbox-vs-public parquet comparison (fixture predates recent schema changes) | Phase 141 |
| `test_resolve_checklist_names.py` | 1 (`test_at_least_13_fuzzy_candidates`) | Fuzzy-match candidate count below expected threshold | Phase 141 |

**Total: ~19 known failures.** The BASELINE.md targets above account for a suite that is currently partly red; Phase 142 measurements will run against a green suite (post Phase 141 fixes).

---

## Reproduce Command

To reproduce the build-time tier (fast suite under randomized order, TFIX-05):

```bash
cd data && uv run pytest -m "not integration" -p randomly -q
```

To reproduce the clean-checkout fast-suite proof (TPERF-03):

```bash
bash data/scripts/verify-clean-checkout.sh
```

To opt into the integration (dataset-validation) tier:

```bash
cd data && uv run pytest -m integration -q
```

---

## History

| Phase | Event | Date |
|-------|-------|------|
| 139 | Baseline established (estimates); two-tier marker scaffold created | 2026-06-05 |
| 142 | After-numbers measured: fast tier 197 passed / 9 skipped / 18.8 s, randomized seed (pytest-randomly); pytest-randomly added; clean-checkout script created; test_at_least_13_fuzzy_candidates fixture fixed | 2026-06-07 |
