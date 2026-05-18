# Research Summary: BeeAtlas v3.8 — Conceptual Tidying

**Project:** Washington Bee Atlas — Domain Model Centralization
**Domain:** Pure structural refactoring across Python pipeline, dbt/SQL, and TypeScript frontend
**Researched:** 2026-05-18
**Confidence:** HIGH — all findings from direct codebase inspection; every assertion cites file and line

---

## Executive Summary

v3.8 is a pure refactoring milestone. Domain intelligence — occurrence ID construction, occurrence type discrimination, URL template building, slug canonicalization, and iNat field ID constants — is currently duplicated inline across six TypeScript files, three Python modules, and three dbt intermediate models. No single function owns the `"ecdysis:N"` / `"inat:N"` ID format; no named predicate expresses "is this a specimen-backed occurrence vs. a sample-only vs. a provisional WABA row." The goal is named, testable, single-source-of-truth modules: `src/occurrence.ts`, `data/slugs.py`, and dbt macros for SQL constants.

The existing stack is entirely sufficient. Vitest and pytest are already the right test tools; the `canonical_name.py` + `test_canonical_name.py` pair is the exact structural template every new module should follow. No new libraries, no new npm packages, no schema changes, no AWS changes. Every planned extraction maps to an already-established codebase pattern.

The dominant risks are scope creep ("while I'm here" feature additions during refactoring), dbt contract violations if intermediate SQL is restructured without running `dbt build`, and over-abstraction (wrapping trivial one-line property checks in named functions when they appear at only one call site). Each phase must enforce behavior preservation as a hard gate before completion.

---

## Key Findings

### Stack (no additions)

The existing stack handles all v3.8 needs. No new dependencies are warranted.

**Relevant tools and patterns:**
- **Vitest + happy-dom** — already active; `filter.test.ts` pure-function pattern is the template for new predicate tests
- **pytest** — already in dev deps; `test_canonical_name.py` (no fixture, no DB, pure `import`+`assert`) is the template for Python predicate tests
- **dbt `vars:` block** — standard dbt pattern; not yet used in this project; adding named variables for the four iNat field IDs (8338, 9963, 18116, 1718) is ~4 lines in `dbt_project.yml`, no dependency change
- **`arch.test.ts`** — already enforces import boundaries via `readFileSync`; new domain modules can add boundary checks in the existing `describe` blocks

One lightweight dbt addition worth making: named `vars:` entries for the four iNat observation field IDs that are currently anonymous integers in SQL JOINs. This is the only "new" pattern for the project (not a dependency change).

### Refactoring Targets (ranked by impact)

**Rank 1 — TypeScript occurrence ID and type predicates (HIGH impact, LOW risk)**

The expression `ecdysis_id != null ? 'ecdysis:' + ecdysis_id : 'inat:' + Number(observation_id)` appears at six call sites across `features.ts`, `bee-atlas.ts` (x3), and `bee-table.ts`. The parse inverse (prefix stripping) appears at four sites in `bee-atlas.ts` and `url-state.ts`. The three-way occurrence type classification (`isSpecimenBacked` / `isSampleOnly` / `isProvisional`) is expressed as unnamed inline conditions at render and query sites.

Target: new `src/occurrence.ts` module with `occId(row)`, `parseOccId(id)`, `isSpecimenBacked(row)`, `isSampleOnly(row)`, `isProvisional(row)`, `inatObservationUrl(id)`, `ecdysisOccurrenceUrl(ecdysisId)`. `OccurrenceRow` stays in `filter.ts` as the authoritative type definition; `occurrence.ts` re-exports it. All six TypeScript caller files import from `occurrence.ts`.

A concrete inconsistency this closes: `features.ts:48` casts `Number(obj.observation_id)` when constructing the inat ID, but `bee-table.ts:41` does not. A single function eliminates this silent divergence.

**Rank 2 — Occurrence schema single source (MEDIUM impact, MEDIUM risk)**

The 31-column occurrence schema is written out four times: dbt `schema.yml` (YAML), `sqlite.ts` (SQL DDL string), `filter.ts` `OCCURRENCE_COLUMNS` (TypeScript array), and `filter.ts` `OccurrenceRow` (TypeScript interface). Known drift already exists: `is_provisional` is `BOOLEAN` in dbt but `INTEGER` in SQLite; `canonical_name` is in `OccurrenceRow` but absent from `OCCURRENCE_COLUMNS`. A Vitest test asserting `OCCURRENCE_COLUMNS.every(col => col in emptyOccurrenceRow)` closes part of this gap without restructuring files.

**Rank 3 — `BEE_FAMILIES` dead constant + SQL duplicate (LOW impact, LOW risk)**

`BEE_FAMILIES` in `species_export.py:51-54` is dead code — the actual filter gate is the identical literal in `int_species_universe.sql:73-75`. Delete the Python constant; add a comment in the SQL that this list is the sole definition.

**Rank 4 — iNat field ID constants as named dbt macros (LOW impact, LOW risk)**

Four magic integers (`8338`, `9963`, `18116`, `1718`) appear as anonymous SQL JOIN conditions in three intermediate models. Named dbt macros or `vars:` entries make these discoverable and one-touch to change. Purely additive; no logic change.

**Rank 5 — `_slugify` extracted to `data/slugs.py` (LOW impact, LOW risk)**

`_slugify` is defined in `feeds.py:132-148` and imported by `species_export.py` — coupling an Atom feed generator to slug logic. A `data/slugs.py` module with `general_slug()` and `taxon_slug()` breaks the implicit coupling. The TypeScript `slugify` in `filter.ts` is a different algorithm for CSV filenames only; leave it local.

**Rank 6 — `is_provisional` predicate inconsistency (MEDIUM impact, MEDIUM risk)**

`places_export.py:54` counts specimens as `is_provisional = false OR is_provisional IS NULL`, while `filter.ts:297` counts them as `ecdysis_id IS NOT NULL`. These are semantically distinct and must be addressed with a deliberate domain decision, not a silent unification.

**Rank 7 — Year-bucket / recency-tier constant sharing (LOW impact, LOW risk)**

`style.ts` computes `_thisYear` / `_lastYear`; `bee-filter-panel.ts` independently computes `CY` / `PY`. Sharing a single export from `style.ts` is trivially extractable.

**Rank 8 — Plantae host CASE to dbt macro (LOW impact, LOW risk)**

The same `CASE WHEN taxon__iconic_taxon_name = 'Plantae' THEN taxon__name ELSE NULL END` appears in both `int_ecdysis_base.sql:21` and `int_samples_base.sql:12`. A dbt macro eliminates the duplication. Cosmetic; zero behavior change.

### Architecture Approach

The project has a clear three-layer architecture: dbt SQL produces the parquet; Python pipeline modules produce intermediate data and drive dbt; TypeScript frontend loads parquet into wa-sqlite and runs queries. There is no cross-language module sharing — the parquet schema (31-column dbt contract) is the only enforced cross-layer contract. All domain logic extraction stays within its native language layer. The CLAUDE.md architecture invariant "state ownership in `<bee-atlas>`; `<bee-map>` and `<bee-sidebar>` are pure presenters" is unchanged by v3.8.

The reference implementation for a well-bounded domain module is `canonical_name.py`: single file, docstring stating invariants, pure functions, no I/O, tests requiring zero fixtures.

### Critical Pitfalls

1. **Scope creep — "while I'm here" additions** (CRITICAL): Refactoring commits must be behavior-preserving. Any noticed gap gets a TODO comment; it does not get fixed in the same commit. Plans must cite exact line ranges being moved.

2. **dbt 31-column contract violation** (CRITICAL): Any `.sql` change under `data/dbt/` requires `bash data/dbt/run.sh build` before commit. pytest does not run dbt; a contract violation is invisible to the Python test suite.

3. **Cross-language predicate drift** (HIGH): For each predicate that spans layers, one layer is authoritative — document it in a code comment. `canonical_name`: Python. `is_provisional`: SQL. `occId` prefixes: TypeScript.

4. **Filter regression from `buildFilterSQL` restructuring** (HIGH): The existing 13 unit tests check SQL string output, not query result semantics. The collector OR-clause and elevation null-inclusive semantics are the most likely casualties of naive extraction. `buildFilterSQL` refactoring is out of scope for v3.8.

5. **Over-abstraction** (HIGH): Extract only when there is real logic or 3+ independent call sites. A one-line property access used once should stay inline.

6. **`OccurrenceRow` / `OCCURRENCE_COLUMNS` desync** (HIGH): These two definitions must always move together. Add a Vitest test asserting `OCCURRENCE_COLUMNS.every(col => col in emptyOccurrenceRow)`.

7. **`is_provisional` conflation** (MEDIUM): `ecdysis_id IS NOT NULL` and `is_provisional = false` are correlated today but semantically distinct. Do not unify them in a single predicate.

---

## Implications for Roadmap

### Phase 1 — TypeScript occurrence domain module

**Rationale:** Highest-impact extraction, lowest risk. Pure TypeScript with no dbt or Python involvement. Establishes the extraction template all other phases follow. Closes the `Number()` cast inconsistency and the scattered prefix strings.

**Delivers:** `src/occurrence.ts` with `occId`, `parseOccId`, `isSpecimenBacked`, `isSampleOnly`, `isProvisional`, `inatObservationUrl`, `ecdysisOccurrenceUrl`. All six caller files (`features.ts`, `bee-atlas.ts`, `bee-occurrence-detail.ts`, `bee-table.ts`, `filter.ts`, `bee-map.ts`) updated. `OccurrenceRow` re-exported from `occurrence.ts` (authoritative definition stays in `filter.ts`). Vitest unit tests; `arch.test.ts` boundary check for the new module.

**Avoids:** Pitfalls 1 (scope creep), 3 (cross-language drift), 5 (over-abstraction), 7 (`is_provisional` conflation)

---

### Phase 2 — Python slug module + dead constant removal

**Rationale:** Low risk, independent of Phase 1. Decouples `feeds.py` from slug logic. Deletes the dead `BEE_FAMILIES` Python constant.

**Delivers:** `data/slugs.py` with `general_slug()` and `taxon_slug()`. `feeds.py` and `species_export.py` import from it. `BEE_FAMILIES` deleted from `species_export.py`. pytest unit tests for both slug functions (no fixture, no DB).

**Avoids:** Pitfall 1 (no algorithm changes — the function moves, not evolves)

---

### Phase 3 — dbt iNat field ID constants + Plantae macro

**Rationale:** Purely additive; no logic change. Makes the four load-bearing field IDs named and discoverable. Eliminates the duplicate Plantae CASE expression.

**Delivers:** Four dbt macros or `vars:` entries for iNat field IDs. One `is_plant_taxon` macro replacing the duplicate CASE in `int_ecdysis_base.sql` and `int_samples_base.sql`. `dbt build` mandatory gate after every SQL file change.

**Avoids:** Pitfall 2 (dbt contract violation — `dbt build` required before commit)

---

### Phase 4 — Schema alignment and semantic decisions

**Rationale:** Medium-risk work deferred until Phases 1-3 establish a clean baseline. Addresses `canonical_name` dead-weight in `OCCURRENCE_COLUMNS`, the `is_provisional` semantic inconsistency, and year-bucket constant sharing.

**Delivers:** Vitest test asserting `OCCURRENCE_COLUMNS` subset of `keyof OccurrenceRow`. Deliberate logged decision on `places_export.py` specimen count semantics. `CURRENT_YEAR` / `PREVIOUS_YEAR` shared from `style.ts` to `bee-filter-panel.ts`.

**Avoids:** Pitfalls 6 (schema desync), 7 (`is_provisional` conflation — explicit decision, not silent unification)

---

### Phase Ordering Rationale

- Phases 1-3 are independent (different layers: TypeScript, Python, SQL) and can proceed in any order. Phase 1 is first for highest impact per effort.
- Phase 4 depends on Phases 1-3 being complete: the schema alignment test is cleaner after `OccurrenceRow` re-export is settled (Phase 1), and the `is_provisional` decision is easier after all call sites are visible from named predicates.
- `buildFilterSQL` refactoring is explicitly out of scope for all phases (Pitfall 4: requires integration test expansion first, exceeds this milestone's boundary).

### Research Flags

All phases follow patterns already established in this codebase. No phase needs `--research-phase` during planning.

- **Phase 3:** The only non-established pattern is `vars:` in `dbt_project.yml`. A quick dbt docs check at plan time is sufficient.
- **Phase 4:** The `is_provisional` question is a domain decision, not a research question. Surface it at requirements as an explicit decision item.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Direct inspection; no new dependencies; every tool already active |
| Features (extractions) | HIGH | Exact file paths and line numbers for every scatter site |
| Architecture | HIGH | All referenced files read end-to-end; scatter evidence grounded in direct quotes |
| Pitfalls | HIGH | Grounded in actual codebase files and one prior documented bug (style cache bypass) |

**Overall confidence:** HIGH

### Gaps to Address

- **`is_provisional` semantic inconsistency** (`places_export.py` vs. `filter.ts`): Which definition is correct for place specimen counts? Requires a domain decision; flag for requirements.
- **`canonical_name` in `OCCURRENCE_COLUMNS` absence**: It is in `OccurrenceRow` but not in `OCCURRENCE_COLUMNS`. Clarify whether it is used in a non-filter query path before removing it in Phase 4.
- **dbt `vars:` vs. macros for field IDs**: Both are valid; pick one pattern at Phase 3 plan time for consistency.

---

## Sources

All sources are direct codebase file reads (HIGH confidence). No external research needed for an internal refactoring milestone.

**Files inspected:**
- `src/filter.ts`, `src/features.ts`, `src/bee-atlas.ts`, `src/bee-table.ts`, `src/bee-occurrence-detail.ts`, `src/bee-map.ts`, `src/url-state.ts`, `src/style.ts`, `src/bee-filter-panel.ts`
- `src/sqlite.ts`, `src/tests/filter.test.ts`, `src/tests/arch.test.ts`
- `data/canonical_name.py`, `data/tests/test_canonical_name.py`, `data/tests/conftest.py`
- `data/feeds.py`, `data/species_export.py`, `data/places_export.py`
- `data/dbt/models/marts/occurrences.sql`, `data/dbt/models/marts/schema.yml`
- `data/dbt/models/intermediate/int_combined.sql`, `int_ecdysis_base.sql`, `int_samples_base.sql`, `int_waba_link.sql`, `int_species_universe.sql`
- `data/pyproject.toml`, `vite.config.ts`, `CLAUDE.md`, `PROJECT.md`
- Project memory: `project_schema_validation.md`, `feedback_style_cache_selection.md`

---
*Research completed: 2026-05-18*
*Ready for roadmap: yes*
