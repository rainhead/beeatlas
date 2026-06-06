# Phase 141: Built-Asset Fixtures, Red-Test Fixes & Silent-Skip Elimination - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the formerly un-checked-in built-asset tests run on a clean checkout, green the ~19 red tests, and eliminate silent asset-driven skips from the fast tier — while tagging the genuine full-data checks into the slow/`integration` tier.

Delivers (per ROADMAP §141 / TFIXTURE-03, TFIX-01..04, TTIER-02):
- Committed fixtures for the dbt `target/sandbox/*.parquet` and `public/data/*.parquet` deps so `test_species_export` / `test_dbt_synonymy` (and the scaffold/higher-taxa/species-export assertions) **execute** on a clean checkout instead of `skipif`-skipping.
- The ~16 `test_resolve_taxon_ids.py` failures fixed via a `resolver_db` fixture providing `dbt_sandbox.occurrence_synonyms`.
- `test_dbt_diff.py` resolved (see D-04).
- `test_at_least_13_fuzzy_candidates` in `test_resolve_checklist_names.py` fixed (the known-red test left red by Phase 140).
- Zero silent asset-driven skips in the fast tier; genuine full-data checks tagged `@pytest.mark.integration`.

NOT in scope: budget verification / <5 min proof / nightly wiring (Phase 142, TTIER-03); CI gate (Phase 143); broadening the session-scoped fixture to other DuckDB builders (TFIXTURE-05, deferred).
</domain>

<decisions>
## Implementation Decisions

### Built-asset parquet fixtures (TFIXTURE-03)
- **D-01:** Parquet fixtures for the export/synonymy tests (`test_species_export.py` → `species.parquet`, `higher_taxa.parquet`; `test_dbt_synonymy.py` → `occurrences.parquet`, `species.parquet`) are **built from committed CSV in-test**: small distilled CSVs live in `data/tests/fixtures/`, and a fixture `COPY`s them to `.parquet` (via duckdb) at the path the code expects (a tmp `SANDBOX`), at test time. **No binary `.parquet` blobs committed to git.** Rationale: diffable provenance, consistent with Phase 140's "read through the real code path, smallest distilled sample, no opaque blobs" philosophy ([[140 D-01/D-06/D-08]]). The ms-scale per-test COPY cost is acceptable.
- **D-01a:** Distill each parquet fixture to the **smallest sample that preserves every assertion's intent**, with exact-count rewrites — no silent coverage loss (carry forward 140 D-08/D-09). Record provenance via per-fixture docstring/CSV-header comment (carry forward 140 D-10).

### test_dbt_diff disposition (TFIX-02)
- **D-04:** `test_dbt_diff.py` is a **cross-artifact regression diff** (fresh dbt `target/sandbox/*` vs already-published `public/data/*` — row count, schema, `ecdysis_id` key-set, county/ecoregion spatial diff, GeoJSON parity). A fixture-based version would be **tautological** (building both sides from one fixture makes the diff trivially 0). Therefore: **tag all `test_dbt_diff` assertions `@pytest.mark.integration`** so they are **deselected** (not skipped) in the fast tier and run for real against built artifacts in nightly. This satisfies TFIX-04 (no silent skip — deselected, not skipped) and TTIER-02 (genuine full-data check tagged). Drop or harden the now-redundant `_SANDBOX_GUARD` `skipif` (keep only as a loud guard for when someone runs `-m integration` without first building).

### Silent-skip elimination mechanism (TFIX-04) — Claude's lean, locked
- **D-05:** Guarantee "0 silent asset-driven skips in the fast tier" with an **automated conftest guard**, not manual discipline: a `conftest.py` hook (e.g. `pytest_runtest_makereport`/`pytest_collection_modifyitems`) that **fails the fast tier if a non-`integration` test would skip because a built asset is missing**. Asset-dependent tests must either (a) run off a committed fixture (D-01), or (b) be tagged `@pytest.mark.integration` and thus deselected from the fast tier. A bare asset-driven `skipif`/`pytest.skip` reaching the fast-tier summary is a failure, not a pass. (Researcher to confirm the cleanest hook; keep it scoped to asset-missing skips, not legitimate platform/marker skips.)

### Red-test fixes (TFIX-01, TFIX-03)
- **D-06:** `resolver_db` fixture provides `dbt_sandbox.occurrence_synonyms` matching `resolve_taxon_ids.py:_names_to_resolve`; the ~16 `test_resolve_taxon_ids.py` tests assert **real resolution behavior** (not just presence). Follows the established committed-fixture + monkeypatch pattern from Phase 140. Researcher to confirm the exact table shape from `resolve_taxon_ids.py`.
- **D-07:** `test_at_least_13_fuzzy_candidates` (TFIX-03) is a genuine diagnosis: determine whether the `>=13` threshold is correct against the now-committed fixture taxa or whether the resolver/fixture data is the cause, then fix so it passes honestly (do not weaken the assertion to mask a real gap). Research/diagnosis territory — no user decision locked.

### WR-01 / WR-02 fixture-ordering hardening (folded from Phase 140 code review) — Claude's lean, locked
- **D-08:** Fix the `test_checklist_pipeline.py` ordering hazard flagged in `140-REVIEW.md` (WR-01): the module-scoped `checklist_sample_db` fixture patches the `checklist_pipeline` module **in place** while the function-scoped `checklist_db` fixture calls `importlib.reload()` on the same module — order-dependent under the installed `pytest-randomly`, one reorder away from a silent false-pass on the tightened `null_coord==1` / `n_none==3` assertions. **Drop `importlib.reload` in favor of the same save/restore discipline** the module-scoped fixture uses (consistent, removes the shared-module-state hazard). Add an autouse integrity assertion only if save/restore alone doesn't fully close it.
- **D-09:** WR-02 (mechanical): pin the two `n >= 1` species / species_counties assertions to the fixture's **exact counts** (6 species, 8 county rows per the review) so they retain regression power, matching the exact-count pattern used elsewhere in the file.

### Claude's Discretion
- Exact conftest hook implementation for D-05 (which pytest hook, how to distinguish asset-missing skips from legitimate skips).
- The exact distilled rows/columns for each parquet fixture CSV (D-01a) — pick the smallest set covering every asserted branch.
- Diagnosis path and fix for TFIX-03 (D-07).
- Whether D-08 needs the autouse guard in addition to save/restore.

### Folded Todos
- **data-test-suite-environmental-deps.md** — "Data test suite has environmental dependencies (dbt build + slow checklist test)." Pre-tagged `resolves_phase: 141`; explicitly reviewed-and-deferred from Phase 139 to here. Its substance — dbt/built-asset deps that force skips, and full-data checks that belong in the slow tier — is exactly this phase's TFIXTURE-03 + TFIX-04 + TTIER-02 scope. Folded.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — TFIXTURE-03, TFIX-01..04, TTIER-02 definitions + accept criteria (lines ~25–42)
- `.planning/ROADMAP.md` §"Phase 141" — goal + 6 success criteria

### Prior-phase decisions to honor
- `.planning/phases/139-baseline-two-tier-scaffold/139-CONTEXT.md` — marker is `@pytest.mark.integration`; default deselect via `addopts = -m "not integration"` in `data/pyproject.toml`; stock pytest only (139 D-05/D-06); marker must be registered
- `.planning/phases/140-checklist-taxonomy-fixture-distillation/140-CONTEXT.md` — fixtures in `data/tests/fixtures/`; read through real code path; smallest distilled sample; exact-count assertions; per-fixture provenance (140 D-01/D-06/D-08/D-09/D-10)
- `.planning/phases/140-checklist-taxonomy-fixture-distillation/140-REVIEW.md` — WR-01 (fixture-ordering hazard) and WR-02 (loose assertions) being folded in via D-08/D-09
- `data/tests/BASELINE.md` — current red-test inventory (~19) + two-tier targets; living doc (139 D-08)

### Code under test
- `data/tests/test_dbt_diff.py` — the cross-artifact diff being tagged `@integration` (D-04)
- `data/tests/test_species_export.py`, `data/tests/test_dbt_synonymy.py` — parquet `skipif` guards (`_SANDBOX_GUARD`, `_SPECIES_GUARD`) to be replaced by CSV-built fixtures (D-01)
- `data/tests/test_resolve_taxon_ids.py` + `data/resolve_taxon_ids.py` (`_names_to_resolve`) — `resolver_db`/`dbt_sandbox.occurrence_synonyms` fix (D-06)
- `data/tests/test_resolve_checklist_names.py::test_at_least_13_fuzzy_candidates` — TFIX-03 (D-07)
- `data/tests/test_checklist_pipeline.py` — WR-01/WR-02 hardening (D-08/D-09)
- `data/tests/test_species_maps.py:347` — `pytest.skip("species.parquet not found ...")` — assess under D-05 (fixture or `@integration`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `data/tests/fixtures/` (Phase 140) — established fixtures dir with provenance convention; new CSV-source fixtures land here.
- Phase 140's module-scoped shared-connection fixture pattern in `test_checklist_pipeline.py` — the template for fixturizing other parquet/DuckDB-dependent tests.
- `@pytest.mark.integration` marker + `addopts = -m "not integration"` (Phase 139) — the deselection mechanism D-04 leans on.

### Established Patterns
- Built assets are read via duckdb `read_parquet('<SANDBOX>/...')` against module-level path constants — fixturizing means pointing those constants at a tmp dir populated by `COPY <committed_csv> TO <tmp>.parquet`.
- `skipif(not <asset>.exists())` is the silent-skip anti-pattern this phase removes (TFIX-04).

### Integration Points
- `data/pyproject.toml [tool.pytest.ini_options]` — marker registration + `addopts`; the new conftest guard (D-05) lives in `data/tests/conftest.py` (or `data/conftest.py`).
- Phase 142 wires the `integration` tier into `nightly.sh`; this phase only tags, it does not wire nightly.

</code_context>

<specifics>
## Specific Ideas

- test_dbt_diff insight surfaced during discussion: it diffs a fresh dbt build against published `public/data/` — its value is entirely cross-artifact, so it MUST run against real built data (nightly), never a self-referential fixture.
- "Honest suite" framing: a skip in the fast-tier summary is treated as a defect (D-05), not an acceptable degraded pass.

</specifics>

<deferred>
## Deferred Ideas

- **TFIXTURE-05** (broaden session/module-scoped fixtures to `test_inactive_remap.py`, `test_places_*`, `test_species_maps.py`, `test_higher_taxa.py`) — stretch, deferred per REQUIREMENTS; pursue only if needed to hit the budget.
- **Nightly wiring of the integration tier (TTIER-03)** and **budget/<5 min verification (TPERF-02/03)** — Phase 142.
- **CI gate (TCI-*)** — Phase 143.

### Reviewed Todos (not folded)
- **genus-page-subgenera-breakout.md**, **pluralization-sweep-web-copy.md** — surfaced only as keyword false-positives (matched "species"/"phase"/"remaining"); both are web-frontend work, unrelated to the test suite. Not folded.

</deferred>

---

*Phase: 141-built-asset-fixtures-red-test-fixes-silent-skip-elimination*
*Context gathered: 2026-06-06*
