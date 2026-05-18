# Technology Stack: v3.8 Conceptual Tidying

**Project:** Washington Bee Atlas — Refactoring Milestone
**Researched:** 2026-05-18
**Mode:** Existing stack audit for predicate centralization refactoring

---

## What This Milestone Needs From the Stack

v3.8 is a pure refactoring milestone — no new user-facing behavior, no new data sources. The question is not "what stack should we adopt?" but "what does the existing stack already provide that aids extraction of pure domain predicates, and is anything genuinely missing?"

The short answer: the existing stack is fully sufficient. No new dependencies are justified. The established patterns in `canonical_name.py`, `filter.test.ts`, and `arch.test.ts` are the templates for all v3.8 work.

---

## Existing Stack Assessment

### TypeScript / Vitest (Frontend Predicate Tests)

**Confidence:** HIGH — direct codebase inspection.

Vitest is already configured inline in `vite.config.ts` with `happy-dom` environment. The test suite is substantial: 47+ test files under `src/tests/`. Key patterns already established:

- `filter.test.ts` — pure function tests for `buildFilterSQL`, `isFilterActive`, `buildCsvFilename`. Uses an `emptyFilter()` factory and spread for variants. No DOM, no mocking except `sqlite.ts`.
- `url-state.test.ts` — round-trip tests for `buildParams`/`parseParams`.
- `arch.test.ts` — file-system source analysis using `readFileSync` to enforce import boundary invariants without loading the modules.

Vitest is the right tool for testing extracted predicate functions. Pure predicate functions (e.g., `occurrenceId(row)`, `isSpecimen(row)`, `isSample(row)`) require zero additional setup — no mock, no fixture, no DOM. The `emptyFilter()` helper pattern from `filter.test.ts` is the correct model for any new domain object factory needed in tests.

**What is NOT needed:** No new test runner, no additional assertion library, no snapshot testing framework. Vitest's `expect().toBe()` and `expect().toContain()` are sufficient for all predicate tests.

### Python / pytest (Pipeline Predicate Tests)

**Confidence:** HIGH — direct codebase inspection.

pytest is already in `[dependency-groups] dev` in `pyproject.toml`. The session-scoped `fixture_db` / `fixture_con` DuckDB fixtures in `conftest.py` are the right foundation for integration tests. `test_transforms.py` and `test_canonical_name.py` show the established pattern for pure-function unit tests: no fixture, no DB, just `import` and `assert`.

`canonical_name.py` is the exemplar of what v3.8 wants to produce everywhere: a single-purpose module with a named algorithm, a docstring that states invariants, locked constants with explicit "DO NOT change without amending CONTEXT.md" guards, and a dedicated `tests/test_canonical_name.py` with per-step coverage plus an idempotence test. Every Python predicate extracted in v3.8 should match this structure.

**What is NOT needed:** No additional pytest plugins. `monkeypatch` (used in `conftest.py` for rate-limiting constants) is built into pytest and is the right tool for any import-time module constant that needs patching in tests.

### dbt-duckdb (SQL Predicate Organization)

**Confidence:** HIGH — direct codebase inspection.

dbt provides the contract enforcement mechanism (`schema.yml` with `contract: enforced: true`), already used for the 31-column `occurrences` mart and the `species` mart. The contract is enforced at every `bash data/dbt/run.sh build`.

dbt `tests:` blocks in `schema.yml` can express lightweight SQL-layer predicates (existing examples: `not_null_int_combined_is_provisional`, `unique_stg_inat__observations_id`). For v3.8, the natural approach for SQL invariants is a dbt singular test — a `.sql` file under `data/dbt/tests/` that asserts the condition holds across the model. The existing `test_ecdysis_id_references_source.sql` and `test_lin05_lineage_coverage.sql` show the pattern.

**One lightweight addition worth considering:** The OFV field IDs that define what counts as a "specimen count" (`8338`), a "sample ID" (`9963`), a "WABA catalog link" (`18116`), and a "host observation URL" (`1718`) are magic numbers appearing only as SQL literals and SQL comments. dbt supports `vars:` in `dbt_project.yml` for named constants (`{{ var('ofv_specimen_count_field_id') }}`). This makes the intent named and single-sourced. It is a one-line-per-constant YAML addition, no dependency change.

**What is NOT needed:** No new dbt packages. No dbt macros for predicate centralization — the existing `emit_feature_collection.sql` macro shows the pattern is available, but named CTEs and staging models are the better expression of domain predicates in SQL.

### Lit / LitElement (Frontend Component Boundaries)

**Confidence:** HIGH.

Lit's `@property` and `@state` decorators already enforce the component boundary pattern from v1.9. The `arch.test.ts` import-boundary tests are directly reusable for v3.8: if new domain modules are created (e.g., `src/occurrence.ts`), an additional `describe` block in `arch.test.ts` can verify they contain no imports from `mapbox-gl`, `wa-sqlite`, or component files — keeping them independently testable.

---

## No New Dependencies

Every v3.8 task maps to an already-established pattern:

| Task | Tool | Pattern to Follow |
|------|------|-------------------|
| Extract `occurrenceId(row)` / `parseOccId(id)` to named TS function | TypeScript module | `src/occurrence.ts`; tested like `filter.test.ts` pure functions |
| Extract `isSpecimen(row)` / `isSample(row)` discriminators | TypeScript module | Same; `ecdysis_id != null` is the current inline test |
| Centralize OFV field IDs as named Python constants | New `data/domain.py` | Mirrors `data/config.py`; tested with trivial value-locking assertions |
| Name OFV field IDs in dbt SQL | dbt `vars:` in `dbt_project.yml` | `{{ var('ofv_specimen_count') }}` replacing integer literals |
| Enforce new module boundaries | Vitest + `readFileSync` | Extend or mirror `arch.test.ts` ARCH-04 block |
| Lock domain invariants in SQL | dbt singular tests | Mirrors `test_ecdysis_id_references_source.sql` |

---

## Scattered Domain Logic That v3.8 Should Centralize

The following were found by direct codebase inspection and are the concrete targets:

**TypeScript — `occId` construction (5 sites):**
The expression `ecdysis_id != null ? 'ecdysis:' + ecdysis_id : 'inat:' + Number(observation_id)` appears identically in `features.ts:46-48`, `bee-atlas.ts:748`, `bee-atlas.ts:1006`, `bee-atlas.ts:1026`, and `bee-table.ts:40-41`. The parse inverse (`id.startsWith('ecdysis:')` / `id.slice(...)`) appears in at least three places in `bee-atlas.ts` (lines 473-477, 933-938). A named `occurrenceId(row: OccurrenceRow): string` and `parseOccId(id: string): { source: 'ecdysis' | 'inat'; numericId: number }` pair would be trivially testable with Vitest and would close this.

**TypeScript — specimen vs. sample discrimination (4+ sites):**
`ecdysis_id != null` (specimen check) and `ecdysis_id == null` (sample-only check) appear inline in `bee-occurrence-detail.ts:247-248`, `filter.ts:297`, `filter.ts:318-324`, and `features.ts:55`. These are unnamed predicates. Named `isSpecimen(row)` and `isSample(row)` functions in a domain module would be self-documenting and testable.

**Python — OFV field IDs (4 magic numbers in SQL, 1 in `conftest.py`):**
`8338` (specimen count), `9963` (sample ID), `18116` (WABA catalog number), `1718` (host observation URL) appear as literals in `int_samples_base.sql`, `int_waba_link.sql`, `int_combined.sql`, and in `conftest.py` seed data. A `data/domain.py` module with named constants and a `tests/test_domain.py` that asserts the values are locked would make these discoverable and intentionally guarded.

**Python — `BEE_FAMILIES` tuple (1 site):**
The tuple `('Andrenidae', 'Apidae', 'Colletidae', 'Halictidae', 'Megachilidae', 'Melittidae', 'Stenotritidae')` appears only in `species_export.py:51-54`. It is not imported anywhere else. If pipeline steps other than species export need to filter to bee families, this would be duplicated. Centralizing it to `data/domain.py` is low-risk and improves discoverability.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Existing test tooling (Vitest, pytest) | HIGH | Both active; patterns established; inspected directly |
| Refactoring fit for existing tools | HIGH | Pure function extraction is exactly what both tools are already exercised for |
| dbt vars for SQL constants | MEDIUM | Standard dbt pattern; not currently used in this project; no risk, requires ~4 lines in `dbt_project.yml` |
| No new dependencies needed | HIGH | Every required capability is already present |

---

## Sources

- Direct inspection: `/Users/rainhead/dev/beeatlas/data/pyproject.toml` (pytest in dev deps, Python 3.14+)
- Direct inspection: `/Users/rainhead/dev/beeatlas/vite.config.ts` (Vitest inline config, happy-dom)
- Direct inspection: `/Users/rainhead/dev/beeatlas/src/tests/filter.test.ts` (pure-function test pattern)
- Direct inspection: `/Users/rainhead/dev/beeatlas/src/tests/arch.test.ts` (import boundary test pattern)
- Direct inspection: `/Users/rainhead/dev/beeatlas/data/canonical_name.py` + `data/tests/test_canonical_name.py` (Python predicate module + test exemplar)
- Direct inspection: `/Users/rainhead/dev/beeatlas/data/tests/conftest.py` (OFV field ID hardcoding, fixture pattern)
- Direct inspection: `/Users/rainhead/dev/beeatlas/data/dbt/models/intermediate/int_samples_base.sql`, `int_waba_link.sql`, `int_combined.sql` (magic OFV IDs in SQL)
- Direct inspection: `/Users/rainhead/dev/beeatlas/data/dbt/models/marts/schema.yml` (dbt contract enforcement)
- Direct inspection: `/Users/rainhead/dev/beeatlas/src/filter.ts`, `features.ts`, `bee-atlas.ts`, `bee-table.ts` (scattered `occId` construction and `isSpecimen`/`isSample` predicates)
- Direct inspection: `/Users/rainhead/dev/beeatlas/data/species_export.py:51-54` (BEE_FAMILIES tuple, single-site)
