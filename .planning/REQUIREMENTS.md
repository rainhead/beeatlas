# Requirements: Washington Bee Atlas — v4.8 Fast, Honest Test Suite

**Defined:** 2026-06-05
**Core Value:** Tighten learning cycles for volunteer collectors and convey liveness/togetherness; surface existing data (Ecdysis + iNaturalist + checklist) in ways hard to achieve elsewhere. A fast, trustworthy test suite is a force-multiplier on every future data milestone (notably the paused v4.7).

Cut the `data/` pytest suite from >40 min to <5 min **and** make it green and honest. Grounded in a static analysis of the suite (263 tests across 25 files, collection 2.3 s): the dominant cost is **per-test reparsing of committed data** (`test_checklist_pipeline.py` reparses the 50,646-row / 7.1 MB `checklist_records_full.csv` and reinserts ~50k rows on each of ~25 tests; `test_resolve_checklist_names.py` parses the 39 MB `raw/taxa.csv.gz` ~5 s × 7) — not the assumed un-checked-in-asset brittleness. Un-checked-in built-asset deps mostly degrade to **silent `skipif` skips**, so a green run does not mean coverage ran. ~19 tests are currently red from fixture drift (not slowness).

## v1 Requirements

### Baseline & Performance (TPERF)

- [x] **TPERF-01**: A reproducible runtime baseline is captured and committed — total wall-clock for the current suite plus per-file/per-fixture durations (`pytest --durations`) — documenting the starting point the >40 min claim refers to and pinpointing the dominant contributors.
  - *Accept:* a `data/tests/BASELINE.md` (or equivalent) records measured totals and the top time sinks; reproducible via a documented command.
- [ ] **TPERF-02**: The fast default suite (`cd data && uv run pytest`) completes in **< 5 minutes**.
  - *Accept:* timed run on the dev host finishes under 5 min with the default marker deselection active.
- [ ] **TPERF-03**: The fast suite runs **green on a clean checkout** with no un-checked-in built assets, no network, and no AWS/S3 — i.e. `git clone` + `uv sync` + `uv run pytest` passes with nothing else built.
  - *Accept:* verified in a fresh clone / clean worktree (no `dbt/target`, no `public/data`, no `raw/taxa.csv.gz`, no `beeatlas.duckdb`).

### Fixture Distillation (TFIXTURE)

- [x] **TFIXTURE-01**: A small committed sample distilled from `checklist_records_full.csv` — covering every `coord_flag` and `date_quality` branch the tests assert on — replaces full-file parsing in the fast tier, and the checklist DuckDB is built **once** (session/module-scoped), not per test.
  - *Accept:* `test_checklist_pipeline.py` fast-tier tests no longer call the full-file loader; the file runs in seconds; assertions are rewritten against the sample's known counts.
- [x] **TFIXTURE-02**: `resolve_checklist_names` fast-tier tests run against a small committed ancestry fixture instead of the 39 MB `raw/taxa.csv.gz`.
  - *Accept:* the fast tier passes with `raw/taxa.csv.gz` absent; per-test cost drops from ~5 s to sub-second.
- [x] **TFIXTURE-03**: Tests that depend on un-checked-in dbt `target/sandbox/*.parquet` and `public/data/*.parquet` run against committed fixtures (small parquet or in-test builder) so they **execute** on a clean checkout rather than `skipif`-skipping.
  - *Accept:* on a clean checkout, the formerly-skipped scaffold/diff/higher-taxa/species-export assertions now run and pass in the fast tier.
- [x] **TFIXTURE-04**: Committed test fixtures live in a dedicated, documented location (e.g. `data/tests/fixtures/`) with provenance noted (which real rows each sample was distilled from and what cases it covers).
  - *Accept:* fixtures directory exists; a short README/docstring records provenance and the invariants each fixture preserves.

### Honest Coverage & Greening (TFIX)

- [x] **TFIX-01**: The ~16 `test_resolve_taxon_ids.py` failures are fixed — the `resolver_db` fixture provides `dbt_sandbox.occurrence_synonyms` (matching `resolve_taxon_ids.py:_names_to_resolve`) and the tests assert real resolution behavior.
- [ ] **TFIX-02**: The 2 `test_dbt_diff.py` failures are resolved — replaced by fixture-based comparison, or converted to a **loud, explicit** skip-when-stale (never a silent pass).
- [ ] **TFIX-03**: The `test_resolve_checklist_names` fuzzy-candidate failure (`test_at_least_13_fuzzy_candidates`) is fixed.
- [x] **TFIX-04**: No fast-tier test silently skips due to a missing un-checked-in asset; any remaining conditional skips are **reported** (visible in summary) and confined to the slow tier.
  - *Accept:* a clean-checkout fast run reports 0 silent asset-driven skips.
- [ ] **TFIX-05**: The full fast suite is green (0 failures, 0 errors) on a clean checkout.

### Two-Tier Structure (TTIER)

- [x] **TTIER-01**: A `slow`/`integration` pytest marker is registered and `addopts` deselects it by default, so `uv run pytest` runs only the fast tier; an explicit opt-in (e.g. `-m slow` or `--run-slow`) runs the heavy tier.
- [x] **TTIER-02**: Genuine full-data checks — the 50,646-row count assertion, full `taxa.csv.gz` LCA, sandbox-vs-public parquet diff — are tagged into the slow tier and still pass when run against real built data.
- [ ] **TTIER-03**: `nightly.sh` runs the slow/integration tier on maderas against real built data and surfaces failures (non-zero exit / logged).
  - *Accept:* `nightly.sh` invokes the slow tier; a failure there is observable in the nightly log.

### CI Gate (TCI)

- [ ] **TCI-01**: A GitHub Actions job runs the fast pytest suite (`uv` + Python 3.14, `cd data && uv run pytest`) on push and pull request, failing the build on any test failure. (Python tests are not in CI today — CI is frontend-only.)
- [ ] **TCI-02**: The CI job enforces the runtime budget — the build fails (or is flagged) if the fast suite exceeds the < 5 min target, preventing silent regression.

## Future Requirements

- **TFIXTURE-05** (stretch): Broaden adoption of the session-scoped `fixture_db` / cached `INSTALL spatial` to the remaining per-test DuckDB builders (`test_inactive_remap.py`, `test_places_*`, `test_species_maps.py`, `test_higher_taxa.py`) for incremental ~0.5–1 s/test savings — pursue only if needed to hit the budget after TFIXTURE-01..03.
- A shared "tiny canonical DuckDB" builder unifying the per-file ad-hoc DB construction into one well-documented fixture module.

## Out of Scope

- **Frontend (Vitest) test suite** — this milestone is Python (`data/`) only. The TS suite is separately healthy (v1.9).
- **Resuming or completing v4.7 functional work** — v4.7 stays paused; no checklist-point features are built here.
- **Changing the dbt 33-column contract or dbt models** — dbt's contract is enforced separately at `bash data/dbt/run.sh build`; this milestone does not alter models, only how tests obtain/sample their data.
- **Rewriting production pipeline logic** beyond the minimal seams needed to inject fixtures (e.g. an env/constant override for a data path). No behavioral change to `run.py`/`export.py` outputs.
- **Making the slow/integration tier itself < 5 min** — full-data checks are allowed to be slow; they live in the nightly tier by design.

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TPERF-01 | Phase 139: Baseline & Two-Tier Scaffold | Complete |
| TTIER-01 | Phase 139: Baseline & Two-Tier Scaffold | Complete |
| TFIXTURE-01 | Phase 140: Checklist & Taxonomy Fixture Distillation | Complete |
| TFIXTURE-02 | Phase 140: Checklist & Taxonomy Fixture Distillation | Complete |
| TFIXTURE-04 | Phase 140: Checklist & Taxonomy Fixture Distillation | Complete |
| TFIXTURE-03 | Phase 141: Built-Asset Fixtures, Red-Test Fixes & Silent-Skip Elimination | Complete |
| TFIX-01 | Phase 141: Built-Asset Fixtures, Red-Test Fixes & Silent-Skip Elimination | Complete |
| TFIX-02 | Phase 141: Built-Asset Fixtures, Red-Test Fixes & Silent-Skip Elimination | Pending |
| TFIX-03 | Phase 141: Built-Asset Fixtures, Red-Test Fixes & Silent-Skip Elimination | Pending |
| TFIX-04 | Phase 141: Built-Asset Fixtures, Red-Test Fixes & Silent-Skip Elimination | Complete |
| TTIER-02 | Phase 141: Built-Asset Fixtures, Red-Test Fixes & Silent-Skip Elimination | Complete |
| TFIX-05 | Phase 142: Verify Budget, Green Suite & Nightly Wiring | Pending |
| TPERF-02 | Phase 142: Verify Budget, Green Suite & Nightly Wiring | Pending |
| TPERF-03 | Phase 142: Verify Budget, Green Suite & Nightly Wiring | Pending |
| TTIER-03 | Phase 142: Verify Budget, Green Suite & Nightly Wiring | Pending |
| TCI-01 | Phase 143: CI Gate | Pending |
| TCI-02 | Phase 143: CI Gate | Pending |
