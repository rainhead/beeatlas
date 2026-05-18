# Pitfalls Research: v3.8 Conceptual Tidying — Domain Model Extraction

**Domain:** Pure structural refactoring — extracting domain predicates, entity constructors, and
field-mapping logic into named modules across a three-language codebase (Python pipeline, dbt/SQL,
TypeScript frontend). No new features.
**Researched:** 2026-05-18
**Confidence:** HIGH — all pitfalls grounded in the actual BeeAtlas codebase (files read directly:
`src/filter.ts`, `src/features.ts`, `src/url-state.ts`, `src/style.ts`, `data/canonical_name.py`,
`data/checklist_pipeline.py`, `data/dbt/models/marts/occurrences.sql`,
`data/dbt/models/marts/schema.yml`, `data/dbt/models/intermediate/int_combined.sql`,
`src/tests/arch.test.ts`, `PROJECT.md`, `CLAUDE.md`).

---

## Pitfall Summary Table

| # | Pitfall | Risk | Most Relevant Phase |
|---|---------|------|---------------------|
| 1 | Refactoring bleeds into feature work — "while I'm here" additions | CRITICAL | Every phase |
| 2 | dbt 31-column contract broken by intermediate model restructuring | CRITICAL | SQL predicate phases |
| 3 | Cross-language predicate drift — Python and TypeScript diverge after extraction | HIGH | Any phase touching shared predicates |
| 4 | Filter regression from `buildFilterSQL` restructuring | HIGH | TypeScript filter phases |
| 5 | Over-abstraction: shared utilities harder to understand than inline code | HIGH | Any module-split phase |
| 6 | Test complexity increases instead of decreasing after extraction | MEDIUM | Any phase that touches tests |
| 7 | URL state regression from `parseParams`/`buildParams` refactoring | HIGH | URL state phases |
| 8 | Architecture boundary tests break when file locations change | MEDIUM | Any module reorganization phase |
| 9 | `canonical_name` diverges between Python `canonicalize()` and SQL column | HIGH | Species/checklist phases |
| 10 | `OccurrenceRow`/`OCCURRENCE_COLUMNS` out of sync with dbt mart columns | HIGH | Any TS ↔ SQL alignment phase |
| 11 | Style cache bypass logic silently dropped during `recencyTier` extraction | MEDIUM | Style/recency phases |
| 12 | `is_provisional` semantics assumed inline, broken when centralized | MEDIUM | ARM-1/ARM-2 boundary phases |

---

## Critical Pitfalls

### Pitfall 1: Refactoring bleeds into feature work — "while I'm here" additions

**What goes wrong:**
While extracting a domain predicate (e.g., "is this occurrence a specimen?"), the implementer
notices a related gap — "we should also classify provisional occurrences differently" — and
adds new behavior alongside the extraction. The refactoring commit now mixes structural change
(safe, pure rename/move) with semantic change (new logic). Test failures become ambiguous:
did the extraction break something, or did the new behavior change the output?

In this codebase the risk is acute because `filter.ts`, `features.ts`, `int_combined.sql`, and
`checklist_pipeline.py` all contain business logic that has obvious gaps and missing cases.
The temptation to close those gaps mid-refactoring is high.

**Why it happens in this codebase:**
- `filter.ts` `queryVisibleIds` produces IDs using `ecdysis:` and `inat:` prefixes inline.
  These prefix-construction rules are scattered; any "centralization" of them could be tempted
  to also fix the `is_provisional` edge case at the same time.
- `int_combined.sql` ARM-2 (provisional WABA rows) has `canonical_name = NULL`. A refactoring
  phase that extracts "what fields does a provisional occurrence have?" could be tempted to
  also add a canonical_name derivation for ARM-2 rows.
- `species_export.py` `BEE_FAMILIES` constant could be tempted to grow during centralization
  (add Stenotritidae, update comment) even if that's a content change, not a structural one.

**Prevention:**
- **Refactoring commits must be behavior-preserving.** Before merging any refactoring phase,
  diff the old and new outputs: `pytest` suite passes with identical coverage; SQLite query
  results for the same input are byte-identical.
- **"Noticed a gap" → file a TODO comment with a ticket reference, do not fix it.**
  The GSD milestone has an explicit out-of-scope mechanism. Use it.
- **Plans must state the exact lines being moved** (not "improve the logic"). When the plan
  says "extract lines 74–82 of filter.ts into a named function," the review checks only that
  those lines moved and no logic changed.
- Each refactoring phase plan must list `behavior_preserved: true` in its success criteria.

**Detection:**
- PR diff shows added branches, new conditionals, changed default values, or new constants with
  real values (not just renamed ones).
- Test output changes (different counts, different SQL output) when old and new code run on the
  same fixture.

---

### Pitfall 2: dbt 31-column contract broken by intermediate model restructuring

**What goes wrong:**
The `data/dbt/models/marts/schema.yml` enforces a `contract: enforced: true` on the
`occurrences` mart (31 columns: ecdysis_id, catalog_number, lon, lat, date, year, month,
scientificName, recordedBy, fieldNumber, genus, family, floralHost, host_observation_id,
inat_host, inat_quality_grade, modified, specimen_observation_id, elevation_m, observation_id,
host_inat_login, specimen_count, sample_id, sample_host, specimen_inat_taxon_name,
specimen_inat_quality_grade, is_provisional, canonical_name, county, ecoregion_l3, place_slug).

A refactoring that reorganizes `int_combined.sql` — e.g., extracting ARM-1 / ARM-2 logic into
named sub-models, or renaming intermediate columns — can accidentally drop or rename a column
that the mart's final SELECT passes through. dbt's contract check catches the mismatch and
fails the build, but only if `dbt build` is run. If the implementer runs only unit tests and
skips `dbt build`, the pipeline fails silently on the next nightly run.

**Why it happens in this codebase:**
- `int_combined.sql` contains both ARM-1 (Ecdysis FULL OUTER JOIN iNat samples) and ARM-2
  (provisional WABA rows). These arms have different column semantics (e.g., `ecdysis_id` is
  NULL in ARM-2; `is_provisional` is always TRUE in ARM-2). Splitting them into separate
  intermediate models is a natural refactoring target — but the UNION ALL must produce exactly
  the same 31+ column list.
- `int_ecdysis_base.sql` currently does the column alias renaming (e.g., `scientific_name →
  scientificName`, `recorded_by → recordedBy`). Moving this aliasing to a different layer
  changes column names visible to downstream models.
- The dbt contract is enforced by `dbt build`, not by pytest. Developers may run only `pytest`
  during iteration and not discover the contract violation until the nightly run.

**Prevention:**
- **Run `bash data/dbt/run.sh build` before every commit** that touches any `.sql` file under
  `data/dbt/`. This is the only gate that catches contract violations.
- **Never rename a column in any intermediate model without tracing every SELECT that references
  it downstream** (use grep through all `.sql` files).
- **Do not split `int_combined.sql`** without explicitly verifying the UNION ALL column list
  is identical across both arms (column name, position, data type). Use a dbt test:
  `assert column_count(int_combined) = 31`.
- Follow the `project_schema_validation.md` memory file procedure for any occurrences column
  change — it was designed exactly for this scenario.
- Add a phase-level check: after any dbt restructuring phase, run `dbt build` as a mandatory
  verification step before marking the phase complete.

**Detection:**
- `dbt build` exits nonzero with "Schema contract violation" or "Column not found in SELECT".
- Nightly pipeline fails silently; `occurrences.parquet` on S3 is stale (last modified
  timestamp does not advance).
- pytest suite passes (because Python tests don't run dbt) while dbt itself fails.

---

## High-Priority Pitfalls

### Pitfall 3: Cross-language predicate drift — Python and TypeScript diverge after extraction

**What goes wrong:**
A domain predicate exists in both Python (pipeline) and TypeScript (frontend). Extracting it to
a named function in one language without updating the other creates a divergence. The two
implementations silently produce different results for edge cases.

Concrete examples in this codebase:
- **`is_provisional`**: `int_combined.sql` sets `is_provisional = TRUE` for ARM-2 rows (WABA
  obs with no Ecdysis match). The frontend `filter.ts` `OccurrenceRow` has `is_provisional:
  boolean`. If a refactoring adds a new condition for provisionality in SQL (e.g., "also treat
  catalog-number-only rows as provisional") without updating the frontend display logic, the
  map shows provisional dots incorrectly.
- **`occId` construction**: `features.ts` constructs `ecdysis:${id}` or `inat:${id}` inline.
  `filter.ts` `queryVisibleIds` constructs the same IDs. If a refactoring centralizes one but
  not the other, a query might return `ecdysis:12345` while the map feature is keyed as
  `inat:12345` — invisible mismatch (the feature is always "unfiltered" for one source arm).
- **`canonicalize()`**: `canonical_name.py` implements D-04 (5-step algorithm). The dbt staging
  model `stg_ecdysis__occurrences` does not re-canonicalize — it passes `canonical_name` through
  from the pre-computed column. But the TypeScript species page uses `canonical_name` from the
  parquet as a JOIN key. If a refactoring in Python changes step 3 of D-04 without a full
  pipeline rerun, the JOIN key in the parquet is stale.

**Why it happens in this codebase:**
- Python pipeline → dbt SQL → TypeScript frontend is a unidirectional pipeline, not a shared
  module. There is no code-generation or schema-sharing mechanism that enforces consistency.
  Each language has its own implementation of any shared concept.
- The only cross-language contract is the parquet schema (31 columns), enforced by dbt. Logic
  expressed in column values (e.g., `is_provisional`, `canonical_name`) is NOT enforced.
- The CLAUDE.md architecture invariants cover component state boundaries in the frontend but
  say nothing about Python ↔ TypeScript semantic alignment.

**Prevention:**
- **For each extracted predicate, explicitly decide: which language is authoritative?**
  - `canonical_name`: Python `canonicalize()` is authoritative. The SQL column is derived from
    it. The TypeScript reads the SQL column. Never re-implement in TypeScript.
  - `is_provisional`: SQL (dbt) is authoritative. The TypeScript reads the boolean. Never
    re-implement as a TypeScript function.
  - `occId` prefixes: TypeScript is authoritative. The prefix convention is a frontend concern;
    the pipeline never uses `ecdysis:` or `inat:` prefixes.
- **Document the authority assignment in a code comment at the extraction site.** Example:
  `// AUTHORITATIVE: this predicate is computed in SQL (int_combined.sql is_provisional).`
  `// TypeScript only reads the result — do not re-implement here.`
- **Add a cross-language integration test** for any predicate where drift would be silent:
  run the Python pipeline on a fixture, export parquet, read it in TypeScript test, assert the
  TypeScript interpretation matches the Python/SQL computation.

**Detection:**
- Provisional occurrences appear in non-provisional queries (or vice versa).
- Species JOIN returns 0 results for a known species (canonical_name mismatch).
- `visibleIds` Set includes/excludes IDs that don't match what the map features expect.

---

### Pitfall 4: Filter regression from `buildFilterSQL` restructuring

**What goes wrong:**
`buildFilterSQL` in `filter.ts` is the core of all filter logic: taxon, year, month, county,
ecoregion, place, collector, elevation. It returns a SQL WHERE clause string. A refactoring that
extracts individual filter clauses into named helpers can break the overall logic in subtle ways:

- Changing the AND/OR combination order (county and ecoregion are separately ANDed; a refactoring
  that groups them into a "region clause" might introduce an implicit OR between them).
- Null semantics: the month filter uses `month IN (${monthList})` which naturally excludes
  `NULL` months (sample-only rows). A refactoring that wraps this in a helper and adds
  `IS NOT NULL` protection changes the semantics.
- The collector filter uses `recordedBy IN (...) OR host_inat_login IN (...)` — a single OR
  clause combining two arms. Splitting into separate clauses and then ANDing them would
  silently exclude all occurrences that have only one arm populated.
- The elevation filter has three branches (both bounds, min only with null-inclusive semantics,
  max only with null-inclusive semantics). A simplification that loses the null-inclusive cases
  would silently exclude unelation-tagged specimens when an elevation range is active.

**Why it happens in this codebase:**
- `buildFilterSQL` is 80 lines of carefully written SQL-string construction with documented
  null semantics comments. The test suite covers 13 cases in `filter.test.ts`. But the tests
  check SQL string output, not actual query results — a regression that produces valid SQL with
  wrong semantics would pass the unit tests.
- The function is pure (no side effects), making it a natural refactoring target. But "pure"
  does not mean "simple" — the null semantics comments are load-bearing.

**Prevention:**
- **The filter tests must be expanded before any `buildFilterSQL` refactoring begins.** Add
  integration tests that run actual SQLite queries against a fixture database and assert
  result counts. Unit tests (SQL string matching) are insufficient to catch semantic regressions.
- **Refactor one clause at a time.** Extract the taxon clause helper, run the full test suite,
  verify identical SQL output. Then extract the month clause. Never extract multiple clauses
  in the same commit.
- **Document the null semantics in the extracted function's JSDoc**, not just at the call site.
  "month IN (...): NULL month rows are naturally excluded — this is intentional for sample-only
  rows" must travel with the extracted function.
- **The AND/OR combination logic must stay in `buildFilterSQL`**, not be distributed into the
  extracted helpers. Helpers should return a clause string; the combinator stays at the top level.

**Detection:**
- Filter test SQL strings change (any change is a regression signal, not just failures).
- Integration test: applying a month filter produces different result counts than before the
  refactoring.
- Collector-filtered queries return 0 results for collectors who only have Ecdysis records (OR
  collapsed to AND).

---

### Pitfall 5: Over-abstraction — shared utilities harder to understand than inline code

**What goes wrong:**
The refactoring creates a new module (e.g., `occurrence-predicates.ts`) containing functions
like `isSpecimen(row: OccurrenceRow): boolean`, `isProvisional(row: OccurrenceRow): boolean`,
`occurrenceSourceId(row: OccurrenceRow): string`. These are thin wrappers around one or two
properties. The resulting code is:

```typescript
// Before (inline, 1 line):
if (row.ecdysis_id != null) { ... }

// After (2 files, 1 function call, 1 import):
if (isSpecimen(row)) { ... }  // requires reading occurrence-predicates.ts to understand
```

The indirection adds a file to read without adding conceptual clarity, because `ecdysis_id !=
null` is self-documenting for anyone who understands the data model. Readers now need to check
whether `isSpecimen` has any logic beyond the property check — it doesn't, but they can't know
that without reading it.

**Why it happens in this codebase:**
- The milestone goal is "named, testable predicates" — this is a legitimate goal when the
  predicates have real logic (e.g., `canonicalize()`, `recencyTier()`, `buildFilterSQL()`).
  But it can produce pure-rename extractions that add noise instead of clarity.
- `OccurrenceRow` has 31 fields. The temptation to wrap every discriminator (`ecdysis_id !=
  null`, `observation_id != null`, `is_provisional`, `canonical_name != null`) in a named
  predicate is real, but most of these are better left inline.
- The rule of three applies: extract when the same expression appears in three or more places.
  A predicate used once should stay inline; a predicate used in five files earns extraction.

**Prevention:**
- **Extract only when there is real logic** (non-trivial computation, multi-step algorithm,
  or branching) **or when the same expression appears in 3+ independent call sites.**
  Property access is not logic.
- **Test the "simpler code" criterion explicitly.** Before extracting a predicate, write out
  both the before and after versions. If the after version requires the reader to open an
  additional file to understand what the function does, the extraction adds indirection without
  adding clarity. Don't extract it.
- **Prefer well-named local variables over extracted functions for single-use predicates.**
  `const isSpecimen = row.ecdysis_id != null;` is better than a module-level function when
  used only in one place.
- Functions worth extracting in this codebase: `canonicalize()` (real algorithm, multi-step),
  `buildFilterSQL()` (already extracted, justified by complexity), `recencyTier()` (already
  extracted, justified by time-dependent logic), `isFilterActive()` (already extracted,
  justified by 10-field conjunction). New functions need the same justification.

**Detection:**
- The extracted function body is a single `return` statement with one property access or
  one-line comparison.
- The function is called from only one location.
- Reading the call site is LESS clear after extraction (reader must open a second file).

---

### Pitfall 6: Test complexity increases instead of decreasing after extraction

**What goes wrong:**
The milestone goal includes "test simplification: tests compensating for scattered logic may
be dropped or rewritten as refactoring brings structure; better-structured code, not necessarily
more coverage."

The failure mode: instead of deleting or simplifying integration tests that compensated for
scattered logic, the refactoring adds new unit tests for each extracted function. The result
is MORE tests with higher total complexity — more fixtures, more mock setup, more assertion
files — even though the underlying logic didn't change.

A related failure: the existing `filter.test.ts` (13 tests) mocks `sqlite.ts` to avoid DB
setup. After extraction, a new `predicates.test.ts` is added with similar mocks. Now there
are two test files for related logic, with overlapping mock infrastructure and no clear
boundary between what each file tests.

**Why it happens in this codebase:**
- The refactoring goal says "add tests for extracted predicates." This is correct for functions
  with real logic (`canonicalize()` already has `test_canonical_name.py` — 16 tests). But for
  trivial extractions (thin wrappers), the tests become more complex than the code.
- The existing `arch.test.ts` pattern (source analysis via `readFileSync`) is powerful but
  brittle: it checks import strings rather than runtime behavior. Adding new architectural
  boundaries via new modules means adding more `arch.test.ts` cases — but each new boundary
  check is another regex pattern to maintain.

**Prevention:**
- **For each extracted function, ask: does the new unit test cover logic not already covered
  by existing integration/component tests?** If the integration test already exercises the
  extracted function indirectly, adding a new unit test for it is redundant duplication.
- **Drop integration tests that exist only because logic was scattered.** If a test was written
  to verify "the filter in bee-atlas.ts correctly handles the nulls in filter.ts" and the
  refactoring moves that logic to a single well-named function, the integration test can be
  replaced by a simpler unit test — not supplemented.
- **Keep mock infrastructure shared and minimal.** Do not duplicate the `sqlite.ts` mock
  from `filter.test.ts` into a new file. Extend the existing file or use a shared mock fixture.
- **Before adding any test file, check whether an existing test file already has the right
  scope.** New test files should correspond to new conceptual modules, not new functions.

**Detection:**
- Total test count increases by more than 10% without a corresponding decrease in integration
  test complexity.
- New test files repeat mock setup already present in existing test files.
- An extracted function's test duplicates assertions already in a higher-level test.

---

### Pitfall 7: URL state regression from `parseParams`/`buildParams` refactoring

**What goes wrong:**
`url-state.ts` `parseParams` and `buildParams` are the URL serialization contract (LINK-04).
They are tested by 20+ round-trip tests in `url-state.test.ts`. A refactoring that extracts
sub-parsers (e.g., `parseViewState`, `parseFilterState`, `parseSelectionState`) can introduce
regressions if:

- A field is silently dropped during the extraction (a parameter parsed in one place stops
  being included in the result).
- The `hasFilter` detection logic (which decides whether to include a `filter` sub-object)
  is moved but a field check is missed — resulting in `filter` being absent when it should
  be present, or present when it should be absent.
- The `placeImplied` logic (`selectedPlace !== null → bm='places'`) is split from the
  `boundaryMode` parsing and the implication is lost.

URL state regressions are particularly damaging because they break shareable links — a user
pastes a URL that was valid before the refactoring and the filter state is silently dropped.

**Why it happens in this codebase:**
- `parseParams` is 140 lines of careful null-safe parsing with validation (coordinate bounds,
  zoom range, month range, ID prefix checks). It is already well-organized and the 20+
  round-trip tests provide good coverage.
- The function is large enough to be a refactoring target but dense enough that any extraction
  must be exact. The `placeImplied` logic on line 220 couples `selectedPlace` and
  `boundaryMode` — an extraction that splits them would need to reconstruct that coupling.
- `buildParams` has the inverse coupling: `sel=` and `o=` are mutually exclusive (enforced by
  the three-way ternary). Any extraction that separates selection type handling could remove
  that mutual exclusion check.

**Prevention:**
- **Run the full `url-state.test.ts` suite after every change to `url-state.ts`.** The 20+
  round-trip tests are the safety net; they catch dropped fields immediately.
- **Do not split `parseParams` into sub-functions** unless each sub-function receives and
  returns exactly the fields it handles, with no cross-field coupling. The `placeImplied`
  coupling is a strong signal that the function is already at the right level of abstraction.
- **If extraction is needed, use a single extraction pass with a behavior-preserving refactoring
  tool** (TypeScript LSP rename/extract) rather than manual copy-paste. Manual extraction is
  more likely to drop a field.
- **Add a round-trip test for the `placeImplied` edge case** before any refactoring: a URL
  with `place=rattlesnake-ledge` and no explicit `bm=` should produce `boundaryMode='places'`.
  This edge case is the most likely to break under extraction.

**Detection:**
- `url-state.test.ts` failures (any failure is a regression, not a test to update).
- A URL with `?place=slug` in the bar correctly shows the place filter but the map doesn't
  switch to Places mode (placeImplied logic lost).
- A URL with `sel=` and `o=` both present in the output (mutual exclusion broken).

---

### Pitfall 8: Architecture boundary tests break when file locations change

**What goes wrong:**
`src/tests/arch.test.ts` enforces import boundaries using `readFileSync` + regex on source
file content. It checks:
- `src/species/**` cannot import mapbox-gl, wa-sqlite, filter.ts, bee-map.ts, bee-atlas.ts
- `src/lib/spa-link.ts` cannot import from a forbidden list + url-state.ts
- `src/entries/species-index.ts` has a strict allowlist

A refactoring that moves domain logic into a new module (e.g., `src/domain/occurrence.ts`) and
then imports it from `bee-atlas.ts` could accidentally make the new module path appear in
`src/species/seasonality-viz.ts` through a transitive import — which would not be caught by
the arch tests (they check direct imports, not transitive ones).

Conversely, a refactoring that renames `filter.ts` to `src/domain/filter.ts` would break
the arch test's hardcoded path `'../filter.ts'` — a false failure that obscures real failures.

**Why it happens in this codebase:**
- The arch tests use string matching (`spec === bad || spec.startsWith(bad + '/')`) on the raw
  import specifiers. A rename changes the specifier, breaking the pattern without changing the
  actual behavior.
- The arch tests were designed for the current file structure. Any reorganization requires
  updating the forbidden path list — an easy step to miss.

**Prevention:**
- **Update `arch.test.ts` as the first step in any phase that moves source files**, before the
  move. Verify the tests still pass with the updated paths on the new location.
- **Any new module that contains SPA-level dependencies** (mapbox-gl, wa-sqlite, filter.ts)
  must be added to the `FORBIDDEN` list in `arch.test.ts` immediately.
- **Do not rename existing modules** without checking whether their paths appear in arch tests,
  url-state tests, or any other test that uses `readFileSync` string matching.
- **After any file move, run `npm test` before considering the move complete.** The arch tests
  are the primary signal for boundary violations introduced by file moves.

**Detection:**
- `arch.test.ts` failures with "forbidden static imports" on a module that previously passed.
- An arch test that should fail (module importing a forbidden dep) passes because the forbidden
  path string is stale after a rename.

---

### Pitfall 9: `canonical_name` diverges between Python `canonicalize()` and SQL column

**What goes wrong:**
`canonical_name.py` implements the D-04 5-step algorithm and is the authoritative source for
`canonical_name` values in `ecdysis_data.occurrences`. `checklist_pipeline.py` calls
`canonicalize()` and UPDATE-sets the column on every run. The dbt models read this column
directly — they do not re-canonicalize.

A refactoring that moves `canonicalize()` to a new location (e.g., `data/domain/taxon.py`)
and updates the import in `checklist_pipeline.py` is safe. A refactoring that modifies the
D-04 algorithm (even "fixing" it) produces new `canonical_name` values without rerunning
the pipeline, creating a divergence between the live parquet and the new code.

The D-04 algorithm has a specific constraint: `_INFRA_MARKERS` is locked to exactly 5 markers.
Any addition requires a CONTEXT.md amendment (documented in `canonical_name.py` line 38–39).

**Why it happens in this codebase:**
- `canonical_name` is the JOIN key between `checklist_data.species` and
  `ecdysis_data.occurrences` for the species mart. If the key changes in Python but not in
  the parquet (because the pipeline hasn't rerun), species pages show 0 occurrences for all
  species.
- `canonical_name.py` is already well-bounded and tested (16 tests in `test_canonical_name.py`).
  It does not need refactoring for its own sake. Any refactoring touching it risks the D-04
  constraint.

**Prevention:**
- **Treat `canonical_name.py` as a locked contract module** during v3.8. Do not modify the
  algorithm. Only permitted change: moving the file to a new location (import path update).
- **If a move is necessary**, update all imports and run `pytest data/tests/test_canonical_name.py`
  to verify the algorithm is unchanged.
- **Do not add new canonical_name logic in SQL.** The SQL column is always derived from
  Python. Any canonicalization that happens in SQL is a second implementation that will drift.
- If `_INFRA_MARKERS` must change (outside v3.8 scope), require a full pipeline rerun after
  the change before considering the work complete.

**Detection:**
- Species pages show 0 occurrences after a pipeline run (JOIN on `canonical_name` fails).
- `test_canonical_name.py` assertions change (any change to expected output is a D-04 violation).
- `checklist_unmatched.csv` count increases dramatically (more names fail to match after
  a canonicalization change).

---

### Pitfall 10: `OccurrenceRow`/`OCCURRENCE_COLUMNS` out of sync with dbt mart columns

**What goes wrong:**
`filter.ts` exports both:
- `OccurrenceRow` (TypeScript interface with 31 fields)
- `OCCURRENCE_COLUMNS` (constant array of column names used in SQL SELECT)

These must match the 31-column dbt mart contract exactly. A refactoring that extracts entity
construction logic (e.g., "move `OccurrenceRow` to a dedicated `types.ts`") can introduce
a desync if:
- A field is added to `OccurrenceRow` but not to `OCCURRENCE_COLUMNS` (TypeScript type has it
  but the SQL SELECT doesn't fetch it — the field is always `undefined`).
- A field is removed from `OCCURRENCE_COLUMNS` but not from `OccurrenceRow` (the SQL no longer
  fetches it; the type still declares it — silent data loss on every fetch).
- A field is renamed in the interface (`scientificName` → `scientificname`) but the SQL column
  is still `scientificName` — case mismatch in SQLite (case-insensitive) may not surface
  as an error, but TypeScript property accesses break.

**Why it happens in this codebase:**
- `OCCURRENCE_COLUMNS` is a `const` array that is used literally in SQL queries
  (`SELECT ${OCCURRENCE_COLUMNS.join(', ')} FROM occurrences`). It is the bridge between the
  TypeScript type system and the SQL schema. The two are not linked by any compile-time check.
- SQLite (wa-sqlite) returns column values as an array indexed by column name. If the column
  name in SQLite doesn't match the interface field name, the field is silently `undefined`.
- The only runtime check is whether the parquet file has the column — not whether TypeScript
  reads it correctly.

**Prevention:**
- **`OccurrenceRow` and `OCCURRENCE_COLUMNS` must always move together.** If one moves to a
  new file, the other must move to the same file in the same commit.
- **Add a compile-time check** (or a Vitest test) that `OCCURRENCE_COLUMNS` is a subset of
  `keyof OccurrenceRow`. TypeScript cannot enforce this at compile time without a helper type,
  but a test can: `OCCURRENCE_COLUMNS.forEach(col => expect(col in emptyRow).toBe(true))`.
- **Do not rename fields in `OccurrenceRow`** without also updating `OCCURRENCE_COLUMNS` and
  verifying the dbt mart schema.yml uses the same name.
- Treat `OCCURRENCE_COLUMNS` as the canonical list; `OccurrenceRow` must agree with it.

**Detection:**
- Occurrence fields are `undefined` in the sidebar detail view after a refactoring.
- TypeScript compiler reports type errors on `row.scientificName` (field not in type).
- SQLite returns columns not present in the interface (new columns added to SQL but not TS).

---

## Moderate Pitfalls

### Pitfall 11: Style cache bypass logic silently dropped during `recencyTier` extraction

**What goes wrong:**
`style.ts` exports `recencyTier(year, month)` and `RECENCY_COLORS`. The CLAUDE.md architecture
invariants state: "OL style functions must bypass the cache when `filterState` is active or
`selectedOccIds` is non-empty. Cache only when nothing is selected or filtered."

A refactoring that moves style-related logic (coloring, tier classification) into a dedicated
module could accidentally move the cache key computation without moving the cache bypass check,
or vice versa. The bypass check is in `bee-map.ts` (Mapbox GL JS layer paint expressions), not
in `style.ts`. Moving `recencyTier` without moving the bypass guard leaves the guard disconnected
from the function it guards.

**Prevention:**
- **`recencyTier` and `RECENCY_COLORS` stay in `style.ts`** unless the entire cache bypass
  logic also moves. Do not split them across files.
- If `style.ts` is refactored, grep `bee-map.ts` for every reference to `style.ts` exports
  and verify each reference's surrounding logic (the bypass check) is still coherent.
- The `feedback_style_cache_selection.md` memory item documents a previous bug caused by cache
  bypass removal — reference it before any style.ts change.

**Detection:**
- After a filter is applied, occurrence points that should be dimmed appear with their original
  colors (cache bypass lost; stale cached styles returned).
- Selected clusters don't highlight correctly (same root cause).

---

### Pitfall 12: `is_provisional` semantics assumed inline, broken when centralized

**What goes wrong:**
ARM-2 of `int_combined.sql` sets `is_provisional = TRUE` for unmatched WABA observations.
Several places in the frontend assume this without an explicit function:
- `features.ts` uses `obj.ecdysis_id != null` to classify specimens for summary stats.
- `filter.ts` `queryFilteredCounts` counts only `ecdysis_id IS NOT NULL` rows.
- The sidebar detail uses `is_provisional` to show a badge.

These are three separate, partially-redundant ways of expressing "is this a real Ecdysis record?"
vs "is this provisional?" A refactoring that centralizes these into a named predicate must handle
the fact that `ecdysis_id != null` and `is_provisional = false` are correlated but NOT equivalent
in the current schema: ARM-1 rows have both `ecdysis_id != null` AND `is_provisional = false`;
ARM-2 rows have `ecdysis_id = null` AND `is_provisional = true`. But a future occurrence type
could have `ecdysis_id = null` AND `is_provisional = false` (pure iNat sample, not provisional
at all). Conflating the two checks in a "centralized predicate" would break when that new type
appears.

**Prevention:**
- **Do not conflate `ecdysis_id IS NOT NULL` with `is_provisional = false`.** These are
  correlated today but semantically distinct. Each check site should use the semantically
  correct field for its purpose.
- If a predicate is extracted, it must express the correct semantic: `isEcdysisSpecimen(row)`
  checks `ecdysis_id != null`; `isProvisional(row)` checks `is_provisional`. Do not unify them.
- Before extracting either predicate, verify all call sites agree on which field they should
  be using (some sites may be using the wrong proxy today — that's a separate bug to log, not
  to "fix" during the refactoring).

**Detection:**
- Provisional occurrences appear in "specimen-only" queries or counts.
- iNat-only samples (not provisional) are shown with a provisional badge.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Extract entity type definitions (OccurrenceRow, FilterState) to shared types file | Pitfall 10 (OCCURRENCE_COLUMNS desync) | Move OccurrenceRow and OCCURRENCE_COLUMNS together; add test |
| Extract `isFilterActive` and filter clauses into helpers | Pitfall 4 (filter regression), Pitfall 5 (over-abstraction) | Expand integration tests first; keep clause combinator inline |
| Split `int_combined.sql` into ARM-1 and ARM-2 sub-models | Pitfall 2 (dbt contract), Pitfall 12 (is_provisional) | Run `dbt build` after every SQL change; document ARM semantics |
| Move `canonicalize()` to a domain subpackage | Pitfall 9 (canonical_name drift) | Only move the file; do NOT modify the algorithm |
| Extract taxon predicates in TypeScript | Pitfall 3 (cross-language drift), Pitfall 5 (over-abstraction) | Only extract if used in 3+ call sites; SQL is authoritative for is_provisional |
| Reorganize src/ directory structure | Pitfall 8 (arch tests), Pitfall 7 (url-state paths) | Update arch.test.ts first; run npm test before any move |
| Refactor `buildFilterSQL` into clause helpers | Pitfall 4 (filter regression) | Add integration tests before extraction; null semantics must travel with clause functions |
| Unify `occId` construction | Pitfall 3 (cross-language), Pitfall 5 (over-abstraction) | Confirm single call-site pattern; document which language owns the prefix convention |
| Consolidate `recencyTier` / `RECENCY_COLORS` usage | Pitfall 11 (style cache bypass) | Verify cache bypass guard moves with the function; test selected-filter repaint |
| Simplify or delete tests compensating for scattered logic | Pitfall 6 (test complexity) | Verify integration coverage before deleting; don't add unit tests for trivial extractions |

---

## "Looks Done But Isn't" Checklist

For every refactoring phase in v3.8, before marking COMPLETE:

- [ ] **Behavior preserved**: old and new code produce identical output for all pytest fixtures
- [ ] **dbt contract intact**: `bash data/dbt/run.sh build` exits 0 with no schema warnings
- [ ] **`npm test` passes**: all Vitest tests (filter, url-state, arch, etc.) pass without modification
- [ ] **No new features**: diff contains zero new branches, no new conditionals, no new constants
  with non-trivial values
- [ ] **Authority documented**: any extracted predicate has a comment stating which language owns
  the authoritative computation
- [ ] **OCCURRENCE_COLUMNS and OccurrenceRow in sync**: if either changed, both changed in the
  same commit
- [ ] **Arch tests updated**: if file locations changed, arch.test.ts updated in the same commit
- [ ] **Cross-language drift checked**: for any predicate that exists in multiple languages,
  both implementations produce the same result for the same input
- [ ] **Test count delta is neutral or negative**: refactoring should not increase total test
  complexity; deleting compensating integration tests is acceptable if a targeted unit test
  replaces them

---

## Sources

- BeeAtlas codebase read directly: `src/filter.ts` (buildFilterSQL, OccurrenceRow,
  OCCURRENCE_COLUMNS, isFilterActive, queryVisibleIds — null semantics, collector OR logic,
  elevation three-branch logic); `src/features.ts` (inline occId construction, ecdysis_id
  null-check for summary stats); `src/url-state.ts` (parseParams placeImplied coupling,
  buildParams sel/o mutual exclusion); `src/style.ts` (recencyTier, RECENCY_COLORS);
  `data/canonical_name.py` (D-04 algorithm, _INFRA_MARKERS lock);
  `data/checklist_pipeline.py` (_update_occurrences_canonical_name — UPDATE path, not dbt);
  `data/dbt/models/marts/occurrences.sql` (31-column final SELECT);
  `data/dbt/models/marts/schema.yml` (contract enforced: true, all 31 column names and types);
  `data/dbt/models/intermediate/int_combined.sql` (ARM-1 FULL OUTER JOIN, ARM-2 UNION ALL,
  is_provisional=TRUE for ARM-2); `src/tests/arch.test.ts` (readFileSync boundary enforcement,
  forbidden path strings, static + dynamic import regex).
- Project memory: `project_schema_validation.md` (dbt contract change procedure);
  `feedback_style_cache_selection.md` (prior bug: cache bypass removal caused incorrect styling);
  `CLAUDE.md` architecture invariants (style cache bypass requirement; filter race guard;
  ID format `ecdysis:` and `inat:` prefixes are load-bearing).
- `PROJECT.md` Key Decisions table: `buildFilterSQL()` returns plain SQL string (not
  parameterized); `visibleIds Set` replaces per-feature matchesFilter(); `bee-atlas` coordinator
  does not import OpenLayers.
- Research: [How to Avoid Scope Creep During Refactoring](https://andreigridnev.com/blog/2019-01-20-four-tips-to-avoid-scope-creep-during-refactoring/);
  [Don't make Clean Code harder to maintain, use the Rule of Three](https://understandlegacycode.com/blog/refactoring-rule-of-three/);
  [dbt Model contracts](https://docs.getdbt.com/docs/mesh/govern/model-contracts);
  [The False Promise of dbt Contracts](https://www.tobikodata.com/blog/the-false-promise-of-dbt-contracts);
  [An Empirical Investigation into the Impact of Refactoring on Regression Testing](https://web.cs.ucla.edu/~miryung/Publications/icsm2012-RefRT.pdf).

---

*Pitfalls research for: BeeAtlas v3.8 Conceptual Tidying — Domain Model Extraction*
*Researched: 2026-05-18*
