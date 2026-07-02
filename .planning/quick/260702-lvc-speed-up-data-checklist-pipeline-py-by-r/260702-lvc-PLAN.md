---
phase: quick-260702-lvc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - data/checklist_pipeline.py
  - data/tests/test_checklist_pipeline.py
autonomous: true
requirements: [QUICK-260702-lvc]
tags: [duckdb, pyarrow, performance, data-pipeline]

must_haves:
  truths:
    - "load_checklist() populates the same 5 tables with byte-identical row sets, column order, and types as before"
    - "checklist_records_full (50,646 rows, 14 cols) loads via a set-based DuckDB insert, not row-by-row executemany"
    - "The fast-tier test_checklist_pipeline.py suite stays green (schema, canonical_name, coord_flag, date_quality, idempotency)"
    - "A throwaway 50k-row micro-benchmark shows the new insert path >=10x faster than executemany"
  artifacts:
    - path: "data/checklist_pipeline.py"
      provides: "_bulk_insert helper + set-based UPDATE for canonical_name; all 5 executemany sites replaced"
      contains: "_bulk_insert"
    - path: "data/tests/test_checklist_pipeline.py"
      provides: "New fast-tier test covering the set-based occurrences canonical_name UPDATE"
  key_links:
    - from: "data/checklist_pipeline.py"
      to: "pyarrow"
      via: "pa.table(...) built from records, registered on the connection, INSERT INTO T SELECT ... FROM it"
      pattern: "import pyarrow"
    - from: "data/checklist_pipeline.py"
      to: "checklist_data.checklist_records_full"
      via: "INSERT INTO ... SELECT ... FROM registered arrow relation"
      pattern: "INSERT INTO"
---

<objective>
Speed up `data/checklist_pipeline.py` by replacing the 5 row-by-row `con.executemany(...)`
call sites with a fast, DuckDB-native bulk-load path built on **pyarrow** (already a
direct dependency — `pyarrow>=12`, installed as 24.0.0; NO new dependency added).

The measured bottleneck: the two `@integration` tests each spend ~318s inside
`load_checklist()`, dominated by two ~50,646-row `executemany` inserts
(`checklist_records` 4 cols and `checklist_records_full` 14 cols). `load_checklist()` is a
production `run.py` nightly step, so this is a real nightly speedup, not just a test win.

Purpose: cut the nightly `checklist` step from minutes to seconds while preserving EXACT
semantics — same row set, same column order, same value types (VARCHAR/DOUBLE/BIGINT),
same NULL handling, same `CREATE OR REPLACE` idempotency.

Output: a `_bulk_insert(con, table, columns, records)` helper + a set-based `UPDATE ... FROM`
for the occurrences canonical_name map, replacing all 5 executemany sites; the fast-tier
suite stays green; one new fast-tier test guards the UPDATE conversion.
</objective>

<execution_context>
Quick task (not a full phase). No worktree — run on the main tree per
`project_execute_phase_no_worktrees` memory. The full pipeline / `@integration` tier
CANNOT run locally (Ecdysis auth + real data + `project_local_dbt_build_not_runnable`);
local verification = the fast-tier `test_checklist_pipeline.py` suite + a throwaway
micro-benchmark. The nightly `data/dbt/run.sh build` on maderas is the real end-to-end gate.
</execution_context>

<context>
@data/checklist_pipeline.py
@data/tests/test_checklist_pipeline.py
@data/pyproject.toml
@CLAUDE.md
</context>

<mechanism>
## The bulk mechanism (chosen; do not re-litigate)

pyarrow is a **direct dependency** (`pyproject.toml` line 11: `pyarrow>=12`; runtime 24.0.0)
and duckdb is 1.5.3. The canonical zero-extra-dependency path is:

1. Transpose the existing `records: list[tuple]` into named columns and build a
   `pa.Table` whose column **names match the target table's columns** and whose column
   **order matches the CREATE OR REPLACE TABLE column order**.
2. `con.register("_bulk_arrow", arrow_tbl)` — registers the arrow table as a view on THIS
   connection (works on the shared in-memory test connection and the nightly DB_PATH
   connection alike).
3. `con.execute(f"INSERT INTO {table} ({cols}) SELECT {cols} FROM _bulk_arrow")` — a single
   set-based insert. DuckDB casts each arrow column to the target column's declared type
   during INSERT..SELECT, so the **existing CREATE OR REPLACE TABLE schema is the source of
   truth for types** — VARCHAR/DOUBLE/BIGINT are preserved because the table DDL is
   unchanged; only the INSERT mechanism changes.
4. `con.unregister("_bulk_arrow")` in a `finally` so a second `load_checklist(con=con)` call
   (idempotency test) does not collide on the view name.

Why explicit `({cols}) SELECT {cols}` and named arrow columns (not `SELECT *`): it makes
column mapping order-independent and bulletproof against any arrow/DDL drift.

Type-fidelity notes for the executor:
- pyarrow infers per-column types from the actual data: mixed int/None -> int64 -> BIGINT;
  mixed float/None -> double -> DOUBLE; str/None -> string -> VARCHAR; all-None -> null type,
  which DuckDB casts to the declared column type (all NULLs) without error.
- Keep the `if not records: return` guard so an empty list is a no-op, exactly like
  `executemany([], ...)` today.
- Building the arrow table: `cols_data = list(zip(*records))` then
  `pa.table({name: pa.array(col) for name, col in zip(columns, cols_data)})`. Verify against
  the installed duckdb/pyarrow by running the fast-tier tests + the micro-benchmark.
</mechanism>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add _bulk_insert helper and convert the 4 executemany INSERT sites</name>
  <files>data/checklist_pipeline.py</files>
  <read_first>
    - data/checklist_pipeline.py lines 309-345 (_load_checklist_records: builds `records`
      list of 4-tuples; CREATE OR REPLACE TABLE checklist_data.checklist_records
      [scientificName, county, year, month]; executemany at ~339)
    - data/checklist_pipeline.py lines 452-504 (_load_checklist_records_full: builds 14-tuple
      `records`; CREATE OR REPLACE TABLE checklist_data.checklist_records_full at ~477 with
      column order ObjectID, family, genus, verbatim_name, canonical_name, locality, latitude,
      longitude, recordedBy, year, month, day, date_quality, coord_flag; executemany at ~495;
      note the post-insert coord-flag breakdown reads r[13] — leave that untouched)
    - data/checklist_pipeline.py lines 544-592 (load_checklist inner block: species_rows
      11-tuples + CREATE OR REPLACE TABLE checklist_data.species [scientificName PK, family,
      subfamily, tribe, genus, subgenus, specific_epithet, status CHECK, source_citation,
      notes, canonical_name NOT NULL] + executemany at ~578; species_counties 2-tuples +
      CREATE OR REPLACE TABLE checklist_data.species_counties [scientificName, county] +
      executemany at ~590)
    - data/tests/test_checklist_pipeline.py lines 75-141 (checklist_sample_db module-scoped
      fixture that loads all 4 tables from 8-row fixtures via load_checklist(con=con)) and
      lines 144-259, 469-603 (the fast-tier assertions these inserts must keep green)
  </read_first>
  <action>
    Add a module-level helper `_bulk_insert(con: duckdb.DuckDBPyConnection, table: str,
    columns: list[str], records: list[tuple]) -> None` near the top of
    data/checklist_pipeline.py (after the imports). Add `import pyarrow as pa` to the module
    imports. Implement per <mechanism>: early-return when `records` is empty; transpose
    `records` to columns; build `pa.table({name: pa.array(col) for name, col in zip(columns,
    zip(*records))})`; `con.register("_bulk_arrow", arrow_tbl)`; execute
    `INSERT INTO {table} ({', '.join(columns)}) SELECT {', '.join(columns)} FROM _bulk_arrow`;
    `con.unregister("_bulk_arrow")` in a finally.

    Replace these 4 `con.executemany(...)` INSERT calls with `_bulk_insert(...)`, passing the
    exact column names from each table's CREATE OR REPLACE TABLE (order MUST match the DDL):
      1. `checklist_data.checklist_records` (~line 339) -> columns
         ["scientificName", "county", "year", "month"], records = the 4-tuple `records` list.
      2. `checklist_data.checklist_records_full` (~line 495) -> columns
         ["ObjectID", "family", "genus", "verbatim_name", "canonical_name", "locality",
          "latitude", "longitude", "recordedBy", "year", "month", "day", "date_quality",
          "coord_flag"], records = the 14-tuple `records` list. Leave the post-insert
         coord-flag breakdown (the `r[13]` sums at ~508-515) exactly as-is.
      3. `checklist_data.species` (~line 578) -> columns ["scientificName", "family",
         "subfamily", "tribe", "genus", "subgenus", "specific_epithet", "status",
         "source_citation", "notes", "canonical_name"], records = `species_rows`.
      4. `checklist_data.species_counties` (~line 590) -> columns ["scientificName", "county"],
         records = `species_counties`.

    Do NOT touch any CREATE OR REPLACE TABLE DDL (schema/types/constraints are the source of
    truth and stay identical). Do NOT touch the CSV/TSV parsing, canonical_name mapping, or
    the `print(...)` count/breakdown lines. This is an insert-mechanism swap only. Do NOT
    convert the UPDATE at ~297 in this task — that is Task 2.
  </action>
  <behavior>
    - checklist_records_full keeps its 14-column schema and same row count after load
    - species keeps PRIMARY KEY + CHECK(status IN ('verified','likely-to-occur')) enforcement
      (a set-based INSERT..SELECT respects constraints identically to VALUES)
    - canonical_name on species rows still equals normalize_scientific_name(scientificName)
    - coord_flag / date_quality domain and per-branch counts in the 8-row sample unchanged
    - load_checklist(con=con) called twice is idempotent (CREATE OR REPLACE + unregistered view)
    - an empty records list inserts nothing (no-op), matching executemany([]) today
  </behavior>
  <verify>
    <automated>cd /Users/rainhead/dev/beeatlas/data && uv run pytest tests/test_checklist_pipeline.py -p no:randomly -q</automated>
  </verify>
  <acceptance_criteria>
    1. `cd data && uv run pytest tests/test_checklist_pipeline.py -q` -> all fast-tier tests
       PASS (integration tier stays deselected by the pyproject `-m 'not integration'` default).
       This includes the schema, species-count (n==6), species_counties (n==8), canonical_name,
       genus/epithet-split, coord_flag coverage (null_coord==1), date_quality, and both
       idempotency assertions.
    2. Micro-benchmark (THROWAWAY — write to /tmp, do NOT commit): a scratch script that builds
       a ~50,000-row list of 14-tuples matching the checklist_records_full shape (ints, floats,
       strings, and some None values across the coordinate/date columns), creates a
       `:memory:` DuckDB with the exact 14-column CREATE OR REPLACE TABLE DDL, and times ONLY
       the insert for (a) the old `con.executemany("INSERT ... VALUES (14 ?s)", rows)` path vs
       (b) the new `_bulk_insert(...)` path, into two separate tables. It prints both elapsed
       times and asserts the new path is >=10x faster than executemany AND completes in <2s.
       Expected result: executemany takes seconds; the arrow path is sub-second (typically
       50-200x faster). Delete the script after running.
  </acceptance_criteria>
  <done>
    All 4 INSERT executemany sites call `_bulk_insert`; `import pyarrow as pa` present; fast-tier
    suite green; throwaway 50k-row benchmark shows the arrow insert >=10x faster (<2s) than
    executemany. No DDL, parsing, or logging changed.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Convert the occurrences canonical_name UPDATE to a single set-based UPDATE ... FROM</name>
  <files>data/checklist_pipeline.py, data/tests/test_checklist_pipeline.py</files>
  <read_first>
    - data/checklist_pipeline.py lines 274-306 (_update_occurrences_canonical_name: ADD COLUMN
      IF NOT EXISTS canonical_name; SELECT DISTINCT scientific_name WHERE NOT NULL AND != '';
      builds `mapping: list[(canonical_name, scientific_name)]`; executemany UPDATE at ~297
      running one UPDATE per distinct scientific_name; then a count + print)
    - data/tests/test_checklist_pipeline.py lines 75-141 (checklist_sample_db bootstraps
      ecdysis_data.occurrences with ZERO rows, so this UPDATE currently runs over 0 rows in the
      fast tier — value-correctness of the UPDATE is NOT covered today; this task adds coverage)
    - data/tests/conftest.py lines 39-50 (the fixture ecdysis_data.occurrences column list —
      note the fixture_con table has many columns; the sample fixture's occurrences has only
      `scientific_name VARCHAR`. Your new test creates its own minimal occurrences table.)
  </read_first>
  <action>
    In `_update_occurrences_canonical_name`, replace the row-by-row
    `con.executemany("UPDATE ecdysis_data.occurrences SET canonical_name = ? WHERE
    scientific_name = ?", mapping)` (~line 297) with a single set-based UPDATE driven by a
    registered arrow relation:
      - Guard `if mapping:` as today.
      - Split the map into two columns: canonical values and scientific_name keys
        (`canon_col, sci_col = zip(*mapping)`).
      - Build `pa.table({"canonical_name": pa.array(canon_col), "scientific_name":
        pa.array(sci_col)})`, `con.register("_canon_map", arrow_tbl)`.
      - Execute a single statement:
        `UPDATE ecdysis_data.occurrences AS o SET canonical_name = m.canonical_name
         FROM _canon_map AS m WHERE o.scientific_name = m.scientific_name`
      - `con.unregister("_canon_map")` in a finally.
    Semantics are identical: `mapping` has exactly one row per DISTINCT scientific_name (the
    source SELECT is DISTINCT and filters NULL/''), so the join updates every occurrence row
    whose scientific_name matches to that canonical value — the same rows the executemany loop
    touched. Occurrences with NULL/'' scientific_name do not join and keep canonical_name
    unchanged, exactly as before. Leave the ADD COLUMN IF NOT EXISTS, the DISTINCT SELECT, the
    `mapping` construction (`normalize_scientific_name`), and the final count/print untouched.

    Reuse pyarrow via `pa` (already imported in Task 1). You MAY reuse the `_bulk_insert`
    registration idiom, but this is an UPDATE..FROM, not an INSERT — write it inline.

    Add ONE new fast-tier test to data/tests/test_checklist_pipeline.py (append near the other
    checklist_sample_db tests; do NOT modify any existing test or the two @integration bodies):
    `test_update_occurrences_canonical_name_maps_distinct_names`. It builds a fresh in-memory
    duckdb, points the module fixture paths at the committed sample fixtures (or simply calls
    the helper directly), creates `ecdysis_data.occurrences (scientific_name VARCHAR,
    canonical_name VARCHAR)`, inserts a few rows with duplicate scientific_names (e.g. two rows
    of 'Bombus melanopygus mixtus', one 'Andrena fulva (Müller, 1766)', one NULL
    scientific_name), calls `checklist_pipeline._update_occurrences_canonical_name(con)`, and
    asserts: every non-NULL-scientific_name row's canonical_name ==
    normalize_scientific_name(scientific_name) (so both 'Bombus melanopygus mixtus' rows get
    'bombus melanopygus'); the NULL-scientific_name row keeps canonical_name NULL. This guards
    the set-based UPDATE that the existing fast tier does not exercise with real rows.
  </action>
  <behavior>
    - Two occurrence rows sharing a scientific_name both receive the same canonical_name
    - A trinomial scientific_name folds to its binomial canonical_name (via normalize)
    - An authority-bearing name canonicalizes with authority stripped
    - A row with NULL/'' scientific_name is left with canonical_name unchanged (NULL)
    - Running load_checklist(con=con) twice remains idempotent (view unregistered each call)
  </behavior>
  <verify>
    <automated>cd /Users/rainhead/dev/beeatlas/data && uv run pytest tests/test_checklist_pipeline.py -p no:randomly -q</automated>
  </verify>
  <acceptance_criteria>
    1. `cd data && uv run pytest tests/test_checklist_pipeline.py -q` -> all fast-tier tests
       PASS, including the NEW `test_update_occurrences_canonical_name_maps_distinct_names`.
    2. Run once more with the randomizer to catch order-dependence (pytest-randomly is a dev
       dep): `cd data && uv run pytest tests/test_checklist_pipeline.py -q` (default addopts) —
       green. The new test must be self-contained (its own connection + occurrences table), so
       it does not perturb the module-scoped checklist_sample_db fixture.
    3. `grep -n "executemany" data/checklist_pipeline.py` returns ZERO matches (all 5 sites
       converted).
  </acceptance_criteria>
  <done>
    `_update_occurrences_canonical_name` uses a single `UPDATE ... FROM _canon_map`; zero
    `executemany` remain in checklist_pipeline.py; the new fast-tier UPDATE test passes; full
    fast-tier suite green under both default and no:randomly runs.
  </done>
</task>

</tasks>

<verification>
- `cd data && uv run pytest tests/test_checklist_pipeline.py -q` — fast-tier suite green
  (existing assertions unchanged + 1 new UPDATE test).
- `grep -c "executemany" data/checklist_pipeline.py` — expect 0.
- Throwaway 50k-row micro-benchmark (Task 1) — arrow insert >=10x faster than executemany,
  <2s. Not committed.
- Local `@integration` and full `dbt build` CANNOT run here (Ecdysis auth + real data). The
  real end-to-end gate is the nightly `data/dbt/run.sh build` on maderas, where the two
  ~318s checklist tests should now run in seconds.
</verification>

<success_criteria>
- All 5 `con.executemany(...)` sites in data/checklist_pipeline.py replaced with pyarrow-backed
  bulk operations (4 INSERT..SELECT + 1 UPDATE..FROM).
- Zero new production dependency (pyarrow already direct in pyproject.toml).
- Exact-semantics preserved: same tables, same column order, same declared types, same NULL
  handling, same CREATE OR REPLACE idempotency; verified by the unchanged fast-tier assertions
  plus one new UPDATE-coverage test.
- Demonstrated speedup: throwaway 50k-row benchmark shows the arrow insert path >=10x faster.
</success_criteria>

<output>
Optimization complete when both tasks pass their acceptance criteria and `grep` confirms zero
`executemany` remain. No SUMMARY.md required for a quick task; report results inline.
</output>
