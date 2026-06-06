# Phase 140: Checklist & Taxonomy Fixture Distillation - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminate the two dominant per-test parse costs in the `data/` **build-time tier** by replacing full-dataset parsing with small committed fixtures, and build the checklist DuckDB once per file instead of per test:

1. **TFIXTURE-01** — a tiny committed checklist sample (distilled from `checklist_records_full.csv`) replaces full-file parsing in the fast tier; the checklist DuckDB is built once (module-scoped), not per test.
2. **TFIXTURE-02** — `resolve_checklist_names` fast-tier tests run against a tiny committed ancestry fixture instead of the 39 MB `raw/taxa.csv.gz`.
3. **TFIXTURE-04** — committed fixtures live in `data/tests/fixtures/` with provenance recorded.

**This phase covers the build-time (validates-code) tier only.** The full-data validation checks (e.g. the 50k-row count) remain `@pytest.mark.integration` and continue to run against the real datasets in the nightly tier — they are NOT replaced by samples.

**NOT in this phase** (later v4.8 phases): dbt `target/`/`public/` parquet fixtures (TFIXTURE-03, Phase 141); fixing the ~19 red tests / silent-skip elimination (TFIX-01..04, Phase 141); bulk integration tagging (TTIER-02, Phase 141); measured after-numbers / budget verification (Phase 142); CI gate (Phase 143). Stretch TFIXTURE-05 (broadening session-scope to other per-test DuckDB builders) is out unless needed to hit budget — defer.
</domain>

<decisions>
## Implementation Decisions

### Checklist sample wiring (TFIXTURE-01)
- **D-01:** Fast-tier checklist tests get data via a **small committed sample CSV read through the real `load_checklist()` CSV→DuckDB path** — NOT by seeding rows directly into the DB. Rationale: keep the CSV-parse + insert + transform code under fast-tier coverage; only the dataset shrinks. `load_checklist()` is pointed at the sample (env/path override is the expected seam — researcher to confirm; today `load_checklist()` resolves paths from module-level constants/`DB_PATH` env on reload).
- **D-02:** The sample replaces the full-file loader **only in the fast tier**. The existing full-data assertions (50,646-row count, etc.) stay as `@pytest.mark.integration` tests reading the real `checklist_records_full.csv` — they are not pointed at the sample.

### DuckDB build scope & in-memory mechanics
- **D-03:** Build the checklist DuckDB **once per test file (module-scoped)** rather than per test. Module scope (not whole-session) was chosen to limit blast radius vs the current per-test reload/isolation pattern.
- **D-04:** Use an **in-memory** DuckDB via a **shared-connection fixture**: the module-scoped fixture creates ONE in-memory connection, and `load_checklist()` plus all verification asserts use that SAME connection object. (DuckDB cannot share a `:memory:` database across independent `connect()` calls, so a shared cursor/connection is required — a named temp-file DB was explicitly NOT chosen.)
- **D-05 (planner flag, not a user question):** D-04 implies a **production-code seam**: `load_checklist()` likely needs to accept an injected connection (dependency injection) instead of only connecting via `DB_PATH`. Researcher MUST identify the cleanest seam (param/optional arg vs a thin wrapper) and confirm `ecdysis_data.occurrences` bootstrap (the fixture pre-creates it today) still works on the shared in-memory connection. Keep the production change minimal and behavior-preserving for the real nightly path.

### Taxonomy ancestry fixture (TFIXTURE-02)
- **D-06:** Replace the 39 MB `raw/taxa.csv.gz` ancestry parse with a **tiny committed `taxa.csv.gz` subset** containing only the taxa rows the tests need — read through the real ancestry-parse code path (smaller, not bypassed). Structured/JSON injection was NOT chosen, to keep the gz-parse path covered.
- **D-07:** Acceptance bar: the fast tier MUST pass with the real `raw/taxa.csv.gz` **absent from disk** (per TFIXTURE-02 accept criterion). The code must resolve to the fixture, not the real file, in the fast tier.

### Coverage & assertion policy (SC#4)
- **D-08:** Distill the sample to **minimal: one row per branch the tests actually assert on** (every `coord_flag` and `date_quality` branch). Smallest sample that preserves every assertion's intent.
- **D-09:** Rewrite count/structure assertions to the **sample's exact known counts** — no assertion may silently lose coverage by testing a smaller set without updating its expectation. Every rewritten assertion should be traceable to a sample row.

### Provenance documentation (TFIXTURE-04)
- **D-10:** Record provenance via **per-fixture docstrings / header comments** (CSV header comment or loader/fixture docstring) at each fixture, stating which real rows/taxa it was distilled from and which branch invariants it preserves. (A central README was NOT chosen.) Fixtures live in `data/tests/fixtures/`.

### Claude's Discretion
- The exact `load_checklist()` connection-injection seam and ancestry-path override mechanism (D-05/D-07) — pick the least-invasive, behavior-preserving approach; document it.
- Whether one or both of the two integration-tagged tests (`test_checklist_records_full_row_count`, `test_checklist_records_full_schema`) need any adjustment to coexist with the new sample fixtures (they should keep reading the real CSV).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 139 baseline & two-tier framing (direct predecessor)
- `.planning/phases/139-baseline-two-tier-scaffold/139-CONTEXT.md` — locked "validates code vs validates data" framing; `integration` marker; stock `-m integration` opt-in only.
- `data/tests/BASELINE.md` — living baseline doc: the two dominant cost contributors this phase targets (checklist CSV reparse; taxa.csv.gz parse), per-tier estimate targets (`< 5 min` build-time, `~10 min` nightly stretch). Phase 142 updates it with after-numbers.

### Requirements
- `.planning/REQUIREMENTS.md` — TFIXTURE-01, TFIXTURE-02, TFIXTURE-04 (this phase) and their accept criteria; TFIXTURE-03/TFIX-*/TTIER-02 (Phase 141, out of scope); TFIXTURE-05 (deferred stretch).

### Files to modify / distill from
- `data/tests/test_checklist_pipeline.py` — `checklist_db` fixture (function-scoped today, ~line 23) + ~25 tests calling `mod.load_checklist()`; the dominant fast-tier cost.
- `data/tests/test_resolve_checklist_names.py` — `checklist_resolver_db` fixture (~line 62; already seeds inline checklist rows) and the taxa.csv.gz ancestry parse this phase replaces.
- `data/checklist_pipeline.py` — `load_checklist()` (CSV→DuckDB loader; site of the connection seam in D-05).
- `data/resolve_checklist_names.py` — ancestry resolution reading `raw/taxa.csv.gz`.
- `data/checklists/checklist_records_full.csv` (50,646 rows / 7.1 MB) — source for the distilled sample.
- `data/raw/taxa.csv.gz` (39 MB) — source for the distilled ancestry subset.

### Project conventions
- `CLAUDE.md` — Python 3.14+, `uv run`, static-hosting/no-server invariant, `cd data && uv run pytest`.
- `.planning/codebase/TESTING.md` — existing test-suite conventions.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `checklist_resolver_db` fixture already demonstrates the inline-seed + `monkeypatch DB_PATH` + module reload pattern — a reference for how fixtures redirect paths, though D-01 keeps the checklist path going through the real CSV loader rather than inline seeds.
- The `@pytest.mark.integration` marker + `addopts = "-m 'not integration'"` from Phase 139 is the harness this phase's fast-tier samples plug into.

### Established Patterns
- Tests monkeypatch `DB_PATH` and `importlib.reload()` the module so module-level path constants pick up the patched env. The shared-in-memory-connection decision (D-04) breaks this per-test reconnect assumption and is the main rewrite surface.
- `checklist_db` pre-creates `ecdysis_data.occurrences` to mirror prod ordering (T-76-04) — the new shared-connection fixture must preserve this bootstrap.

### Integration Points
- `load_checklist()` connection seam (D-05) is where production code meets the test fixture; keep the real nightly path unchanged.
</code_context>

<specifics>
## Specific Ideas

- "Module-scoped and in-memory" with a shared connection — the user explicitly wants in-memory speed, accepting the test-rewrite cost of threading one connection through `load_checklist()` and the asserts (D-04/D-05).
- Minimal one-row-per-branch sampling (D-08) — bias hard toward the smallest representative fixture.
</specifics>

<deferred>
## Deferred Ideas

- **TFIXTURE-05 (stretch):** broaden session/module-scoped DB + cached `INSTALL spatial` to other per-test DuckDB builders (`test_inactive_remap.py`, `test_places_*`, `test_species_maps.py`, `test_higher_taxa.py`). Pursue only if needed to hit the budget after TFIXTURE-01/02 — Phase 142 territory.

### Reviewed Todos (not folded)
- `data-test-suite-environmental-deps.md` (matched 0.6) — already tagged `resolves_phase: 141`; the dbt-built-asset half belongs to Phase 141 (TFIXTURE-03), not here.
- `genus-page-subgenera-breakout.md`, `pluralization-sweep-web-copy.md`, `table-rank-column.md`, `cluster-selection-visual-feedback.md` — frontend/web-copy items, out of this Python-test-fixture phase's domain.
</deferred>

---

*Phase: 140-checklist-taxonomy-fixture-distillation*
*Context gathered: 2026-06-06*
