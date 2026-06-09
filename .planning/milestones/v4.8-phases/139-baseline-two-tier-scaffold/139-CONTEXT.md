# Phase 139: Baseline & Two-Tier Scaffold - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Two deliverables, both pure scaffolding/measurement — no fixture distillation, no red-test fixing (those are Phases 140–142):

1. **BASELINE.md** (TPERF-01) — a committed document recording the current `data/` pytest runtime as a per-tier *estimate* plus targets, and the dominant cost contributors. This is the before/after anchor the milestone is judged against.
2. **Two-tier marker scaffold** (TTIER-01) — register an `integration` pytest marker, deselect it by default via `addopts`, so `cd data && uv run pytest` runs only the build-time (code-validation) tier. Opt into the dataset tier with `-m integration`. Label 1–2 obvious dataset tests to prove the mechanism works end-to-end.

**Conceptual framing (drives everything downstream):** The split is **build-time vs nightly**, not "fast vs slow" in the abstract:
- **Build-time tier** = validates *code*. Fast, runs on push/PR (CI, Phase 143) and in local dev.
- **Nightly/integration tier** = validates *datasets* against real built artifacts. Runs in `nightly.sh` on maderas (Phase 142, TTIER-03).

The marker decision criterion is therefore **"does this test validate code or validate data?"** — not "is it slow." A slow code test gets fixtures (stays build-time); a dataset-validation test gets the `integration` marker regardless of speed.

</domain>

<decisions>
## Implementation Decisions

### Baseline measurement
- **D-01:** Baseline is captured as an **estimate, not a full timed run.** Do NOT pay the ~40-min full-suite run. Derive each tier's rough baseline from the known mega-offenders + collection time. Record figures as explicitly approximate. (Rationale: the user judges baselines as guesstimate-acceptable; targets are what matter.)
- **D-02:** Estimate inputs are the already-identified dominant costs — `test_checklist_pipeline.py` reparsing the 50,646-row / 7.1 MB `checklist_records_full.csv` and reinserting ~50k rows on each of ~25 tests; `test_resolve_checklist_names.py` parsing the 39 MB `raw/taxa.csv.gz` (~5 s × 7) — plus the ~2.3 s collection time. No new profiling run required, though timing the 2–3 dominant files individually is acceptable if cheap and it sharpens the estimate.

### Targets (the part that matters)
- **D-03:** **Build-time tier target: < 5 min** (TPERF-02, locked by requirements). This is the CI-enforced gate (Phase 143, TCI-02).
- **D-04:** **Nightly/integration tier target: ~10 min** — a documented *stretch goal*, NOT a CI-enforced gate. This is tighter than REQUIREMENTS (which list "make slow tier < 5 min" as out-of-scope and allow the dataset tier to be slow). Recorded as a target to keep the nightly cron lean, but it must not be enforced in a way that fights genuine full-data checks. If a real dataset check needs more than 10 min, that's allowed — the number is aspirational.

### Marker design
- **D-05:** Marker name is **`integration`** (`@pytest.mark.integration`). Chosen over `slow`/`nightly` because it emphasizes "validates real built artifacts." (Requirements listed `slow`/`integration` only as examples — `integration` is the locked choice.)
- **D-06:** Default deselection via `addopts = -m "not integration"` in `data/pyproject.toml` `[tool.pytest.ini_options]`. Opt-in to the dataset tier with stock `-m integration`. **No custom `--run-slow`/`--run-integration` flag** — stock pytest only, keep it simple. The marker must also be registered (in `[tool.pytest.ini_options].markers` or via `pytest_configure`) to avoid the unregistered-marker warning.

### Tagging scope for THIS phase
- **D-07:** Label **1–2 unambiguous dataset tests** with `@pytest.mark.integration` (e.g. the 50,646-row count assertion) — enough to verify that the build-time tier really skips them AND `-m integration` really runs them. **Systematic/bulk tagging is deferred to Phase 141 (TTIER-02)** — do not tag all offenders here. The goal in 139 is a *proven* mechanism, not full migration.

### BASELINE.md shape (Claude's discretion, locked)
- **D-08:** Location `data/tests/BASELINE.md`. Records: per-tier baseline estimates, the two targets (build < 5 min, nightly ~10 min), the dominant cost contributors, the current red-test inventory (~19 known failures, so the baseline is honest that the suite is partly red), and a documented reproduce command. Treat it as a **living doc** — Phase 142 updates it with measured after-numbers when verifying the budget.

### Claude's Discretion
- Exact wording/structure of BASELINE.md beyond D-08's required contents.
- Which specific 1–2 tests get the `integration` label in D-07 (pick the clearest dataset-validation cases — the 50k-row count is the obvious first).
- Whether to time the 2–3 dominant files individually to sharpen the estimate (cheap, optional per D-02).

### Reviewed Todos (not folded)
- **data-test-suite-environmental-deps.md** — "Data test suite has environmental dependencies (dbt build + slow checklist test)." Matched on keywords but is tagged `resolves_phase 141`; its substance (dbt/built-asset deps, slow checklist test fixtures) belongs to Phases 140–141, not the 139 scaffold. Reviewed, left for 141.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone requirements (read first)
- `.planning/REQUIREMENTS.md` — v4.8 requirement categories. Phase 139 satisfies **TPERF-01** (baseline doc) and **TTIER-01** (marker + addopts deselect). TPERF-02 (< 5 min build target) and TTIER-02/03 (tagging + nightly wiring) are later phases but define the structure 139 scaffolds toward. Note the **Out of Scope** list — no model/contract changes, Python-only.

### pytest config & fixtures (where the scaffold lands)
- `data/pyproject.toml` §`[tool.pytest.ini_options]` — currently only sets `testpaths = ["tests"]`. The `markers` registration and `addopts = -m "not integration"` go here.
- `data/tests/conftest.py` — already uses `@pytest.fixture(scope="session")` in places (precedent for the session-scoping work in Phase 140; not changed in 139). Also where `pytest_configure`/`pytest_addoption` would go if a hook approach is chosen for marker registration.

### Cost-estimate sources (for BASELINE.md figures)
- `data/tests/test_checklist_pipeline.py` — the dominant cost: reparses `checklist_records_full.csv` (50,646 rows / 7.1 MB) + reinserts ~50k rows on each of ~25 tests.
- `data/tests/test_resolve_checklist_names.py` — parses 39 MB `raw/taxa.csv.gz` (~5 s × 7); also the home of `test_at_least_13_fuzzy_candidates` (red, fixed in Phase 141).
- `data/tests/test_resolve_taxon_ids.py` — ~16 of the ~19 red tests (stale `resolver_db` fixture; fixed Phase 141).
- `data/tests/test_dbt_diff.py` — 2 red tests (stale sandbox-vs-public parquet; fixed Phase 141).

### Nightly tier destination (context for the integration tier)
- `data/nightly.sh` — where the `integration` tier will be invoked in Phase 142 (TTIER-03). Not modified in 139, but the marker is designed so `nightly.sh` can later run `uv run pytest -m integration`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `data/tests/conftest.py` session-scoped fixtures — existing precedent for the expensive-build-once pattern Phase 140 will lean on; 139 doesn't touch them but confirms the pattern is already idiomatic here.

### Established Patterns
- `[tool.pytest.ini_options]` in `data/pyproject.toml` is the single pytest config home (no `pytest.ini`/`tox.ini`/`setup.cfg`). All marker/addopts config goes there.
- No markers or `addopts` exist today — clean slate, no migration of existing marker usage needed.

### Integration Points
- `data/pyproject.toml` — marker registration + `addopts` deselection.
- 1–2 test files — the proof-of-mechanism `@pytest.mark.integration` labels.
- `data/tests/BASELINE.md` — new committed doc.

</code_context>

<specifics>
## Specific Ideas

- The user's framing in their own words: the suite splits into **"build time (validating code)"** and **"nightly (validating datasets)."** Use this vocabulary in BASELINE.md and the marker docs — it's the durable mental model, clearer than "fast/slow."
- "Guesstimate baselines are okay, targets are more important" — bias effort toward stating crisp targets, not toward precise measurement.

</specifics>

<deferred>
## Deferred Ideas

- **Systematic tagging of all full-data tests** (50k-row count, full `taxa.csv.gz` LCA, sandbox-vs-public diff) → Phase 141 (TTIER-02). 139 only tags 1–2 to prove the mechanism.
- **Fixture distillation + session-scoped DuckDB builds** → Phase 140 (TFIXTURE-01/02/04).
- **Built-asset fixtures + red-test fixes + silent-skip elimination** → Phase 141.
- **Measured after-numbers / budget verification** → Phase 142 (updates BASELINE.md, TPERF-02/03).
- **CI gate enforcing the < 5 min budget** → Phase 143 (TCI-01/02).

### Reviewed Todos (not folded)
- **data-test-suite-environmental-deps.md** — environmental deps (dbt build + slow checklist test); tagged `resolves_phase 141`, belongs to 140–141. Considered, deferred.

</deferred>

---

*Phase: 139-baseline-two-tier-scaffold*
*Context gathered: 2026-06-05*
