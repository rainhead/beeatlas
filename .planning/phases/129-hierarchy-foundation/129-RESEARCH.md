# Phase 129: Hierarchy Foundation — Research

**Researched:** 2026-06-02
**Domain:** DuckDB→SQLite taxon hierarchy build, materialized-path schema, wa-sqlite benchmark methodology, two-pass bycatch load, nightly-gate hard fail, VERIFICATION.md reporting
**Confidence:** HIGH — all findings from direct codebase inspection and live data queries

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Complex pages dropped from v4.6 entirely. Complex-rank nodes are hierarchy-resident, name-resolving, filterable. Phase 129 STILL reports the complex-rank occurrence/species count in VERIFICATION.md to satisfy HIER-06 — the count does not reopen the page decision.
- **D-02:** Default to materialized path (`lineage_path` + `instr()` scan). Switch to nested-set lft/rgt ONLY on a clear benchmark failure. Do not default to nested-set or run a no-prior bake-off.
- **D-03:** Benchmark bar is perceptual (~100 ms), not a hard 50 ms. Run the Apidae (~4000-descendant) descendant query in real wa-sqlite/Firefox; ship materialized path unless it is clearly sluggish on a mid-range device. Supersedes ROADMAP criterion #2 "<50 ms" wording.
- **D-04:** Hierarchy covers: (a) every `taxon_id` referenced by occurrences (bees AND non-bee bycatch), and (b) every checklist bee species (incl. zero-occurrence ones). Do NOT include the full active-Anthophila set.
- **D-05:** Non-bee bycatch resolves to its finest available rank (species → genus → family). Bycatch gets `is_anthophila = 0`. Never appears in bee-only surfaces.

### Claude's Discretion

- Exact table shape: one materialized-path table (`taxon_hierarchy`) vs. `taxon_hierarchy` + `taxon_closure`. Decision follows from D-02 structure choice and benchmark result; research prescribes the D-02 default schema.
- Flag name (`is_anthophila` vs `is_bee`): requirements use `is_anthophila`; locked by precedent in CONTEXT.md/REQUIREMENTS.md.
- Two-pass load mechanics: Anthophila via existing `taxa_pipeline.py` approach; bycatch via targeted ancestry walk.
- Orphan-assertion implementation details: hard-fail gate, mechanism is Claude's discretion.

### Deferred Ideas (OUT OF SCOPE)

- Dedicated complex pages (PAGE-05) — dropped from v4.6.
- Floral host hierarchy — explicitly out of milestone scope.
- Non-bee bycatch in tree/autocomplete/pages — hierarchy-resident for name resolution only.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HIER-01 | `taxon_id`-keyed taxon hierarchy in `occurrences.db`, covering occurrences + checklist (bees + bycatch), supporting descendant-by-any-rank queries | Materialized-path `taxa` table written by `_build_taxon_hierarchy` in `sqlite_export.py`; two-pass load; `instr(lineage_path, '/id/')` query pattern |
| HIER-02 | Hierarchy resolves any occurrence's `taxon_id` to name, rank, ancestry — including complex-rank and bycatch — so map points remain renderable | `taxa` table has `taxon_id`, `rank`, `name`, `lineage_path`, `is_anthophila`; bycatch at finest available rank per D-05 |
| HIER-03 | Hierarchy shipped in `occurrences.db`; descendant queries efficient in wa-sqlite; structure chosen by benchmarking Apidae (~4000 spp.) | Benchmark task first in phase; materialized-path default per D-02; ~100 ms perceptual bar per D-03; benchmark must run in real Firefox |
| HIER-04 | Uses active taxa; respects v4.5 synonym/inactive bridge; post-build assertion detects orphans and fails nightly gate | Orphan assertion: `SELECT count(*) FROM occurrences WHERE taxon_id IS NOT NULL AND taxon_id NOT IN (SELECT taxon_id FROM taxa)` → must be 0; `active = 'true'` string guard; synonym bridge already in `int_combined.sql` |
| HIER-05 | Non-bee bycatch carries `is_anthophila = 0`; never leaks into bee-only surfaces; all hierarchy joins/keys use `taxon_id`, never names | `is_anthophila` column in `taxa` table; bycatch two-pass load; UNIQUE constraint on `taxon_id` |
| HIER-06 | Report count of complex-rank and bycatch occurrences/species; document PAGE-05 decision (dropped per D-01) | Query against live data: 0 complex-rank occurrences in current data; 2,020 bycatch occurrence rows / 106 distinct bycatch taxon_ids; PAGE-05 dropped per D-01 |
</phase_requirements>

---

## Summary

Phase 129 is a pipeline-only phase that adds `taxa` (and optionally `taxa_closure`) tables to `occurrences.db`. The work is well-understood additive pipeline work: a new `_build_taxon_hierarchy` function in `sqlite_export.py` reads `taxa.csv.gz` via DuckDB and writes the hierarchy tables after the occurrences table is created. No frontend change occurs; nothing reads the new tables until Phase 130.

**The single blocking question is resolved before any schema is finalized**: run the materialized-path `instr()` descendant query for Apidae (~4,959 species) in real wa-sqlite/Firefox and confirm it is perceptually acceptable (<~100 ms). Per D-02 the default is materialized path; the benchmark is a sanity check, not a gate that is expected to fail. If it fails clearly, nested-set lft/rgt is the fallback.

**Live data findings from this research session:**
- Active Anthophila taxa: 17,343 rows in `taxon_lineage_extended`; 14,965 species-rank taxa in `taxa.csv.gz`
- Apidae descendant species count: **4,959** (exceeds the ~4,000 figure in prior research — materialized-path full-scan `instr()` may be tighter than estimated)
- Complex-rank occurrences: **0** (no occurrences have a complex-rank `taxon_id` in current data)
- Complex-rank bee taxa in `taxa.csv.gz`: **148** (hierarchy-resident but no observed occurrences today)
- Bycatch: **106 distinct non-bee `taxon_id` values**, **2,020 occurrence rows**, spanning genus/species/family/order/suborder/superfamily/subfamily ranks
- Distinct occurrence `taxon_id` values: **629** total (523 bee + 106 bycatch)
- Checklist species with `canonical_name`: **526 distinct** (checklist parquet has no `taxon_id` column today; taxon_ids must be resolved via `canonical_to_taxon_id`)
- Current `occurrences.db` size: **26.5 MB**

**Primary recommendation:** Proceed directly to the wa-sqlite benchmark (Task 1), confirm materialized path passes the ~100 ms bar, then build the `taxa` table with the schema described below.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Hierarchy table build | Pipeline (DuckDB/Python `sqlite_export.py`) | — | `_build_taxon_hierarchy` runs inside `generate_sqlite()` after occurrences table is written; same DuckDB→SQLite ATTACH pattern already in use |
| Two-pass taxon load (Anthophila + bycatch) | Pipeline (DuckDB SQL inside `sqlite_export.py`) | `taxa_pipeline.py` (ancestry walk pattern to reuse) | Anthophila walk is proven in `taxa_pipeline.py`; bycatch walk is a targeted adaptation |
| Orphan assertion / nightly gate hard fail | Pipeline (post-build assertion in `sqlite_export.py` or `run.py`) | pytest (test_sqlite_export.py) | Assertion runs after `generate_sqlite()` completes; raises `ValueError` to fail the pipeline |
| Benchmark (wa-sqlite latency) | Frontend (manual browser test) | — | Static-hosting constraint; no server-side benchmark is valid for WASM performance |
| Complex/bycatch count reporting | Pipeline (DuckDB query against `occurrences.parquet`) | VERIFICATION.md (documented output) | One-off query run during phase; result recorded for HIER-06 |
| `taxa` table delivery to browser | `occurrences.db` (embedded table, same file) | — | Consistent with geo_blob precedent; single HTTP fetch; same SQLite session |

---

## Standard Stack

### Core (no new libraries)

All work is achievable with existing tooling. [VERIFIED: direct codebase inspection]

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| DuckDB | 1.5.2 | Build hierarchy tables via `read_csv('taxa.csv.gz')` + `ATTACH ... AS out (TYPE sqlite)` | Already used in `sqlite_export.py` for exact same export pattern |
| Python `sqlite3` | bundled with Python 3.14+ | Create indexes on the new `taxa` table after ATTACH export | Already used in `sqlite_export.py` for `geo_blob` construction |
| `taxa.csv.gz` | iNat Open Data (downloaded by `download_taxa_csv()`) | Source for all hierarchy rows | Already downloaded nightly; `ancestry` column is the materialized path |
| pytest + uv | existing | Pipeline assertions | Already used in `data/tests/test_sqlite_export.py` |

**Installation:** None. No new packages.

---

## Package Legitimacy Audit

No external packages are added in this phase. The phase extends existing Python modules only.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
taxa.csv.gz (already on disk — downloaded by taxa_pipeline.py)
    │
    ▼
_build_taxon_hierarchy(con: duckdb.DuckDBPyConnection, dst_db: Path)
    │
    ├─ PASS 1: Anthophila taxa
    │   DuckDB: read_csv(taxa.csv.gz) WHERE active='true' AND ancestry LIKE '%/630955/%'
    │   → SELECT taxon_id, rank, name, lineage_path (regex extract), is_anthophila=1
    │   → INSERT INTO out.taxa
    │
    ├─ PASS 2: Bycatch taxa (non-bee occurrence taxon_ids)
    │   DuckDB: SELECT DISTINCT taxon_id FROM out.occurrences
    │           WHERE taxon_id IS NOT NULL
    │           AND taxon_id NOT IN (SELECT taxon_id FROM out.taxa)
    │   → For each bycatch taxon_id: read ancestry from taxa.csv.gz
    │   → INSERT INTO out.taxa WITH is_anthophila=0, lineage_path=NULL
    │
    ├─ PASS 3: Checklist bee species (zero-occurrence)
    │   DuckDB: SELECT DISTINCT canonical_name FROM read_parquet(checklist.parquet)
    │   → LEFT JOIN canonical_to_taxon_id → taxon_id
    │   → For each resolved taxon_id NOT already in out.taxa:
    │     read from taxa.csv.gz → INSERT with is_anthophila=1, lineage_path set
    │
    ├─ INDEX: CREATE INDEX idx_taxa_lineage ON taxa(lineage_path)
    │         CREATE INDEX idx_taxa_is_anthophila ON taxa(is_anthophila)
    │
    └─ ORPHAN ASSERTION:
        SELECT COUNT(*) FROM occurrences WHERE taxon_id IS NOT NULL
          AND taxon_id NOT IN (SELECT taxon_id FROM taxa)
        → Must equal 0; raise ValueError if not

occurrences.db (now contains: occurrences, geo_blob, taxa tables)
    ↓ nightly.sh S3 upload (no frontend change this phase)
```

### Recommended Project Structure

No new files; `sqlite_export.py` gains one function:

```
data/
├── sqlite_export.py        MODIFIED — add _build_taxon_hierarchy()
├── tests/
│   └── test_sqlite_export.py  MODIFIED — add hierarchy tests (Wave 0)
```

The `taxa` table lives in `occurrences.db` alongside `occurrences` and `geo_blob`.

### Pattern 1: materialized-path taxa table schema (D-02 default)

```sql
-- Source: STACK.md + CONTEXT.md D-02
CREATE TABLE taxa (
    taxon_id     INTEGER PRIMARY KEY,
    rank         TEXT NOT NULL,     -- 'family'|'subfamily'|'tribe'|'genus'|'subgenus'|'complex'|'species'
    name         TEXT NOT NULL,     -- canonical scientific name at this taxon's own rank
    lineage_path TEXT,              -- '/630955/.../self_id/' for bee taxa; NULL for bycatch
    is_anthophila INTEGER NOT NULL  -- 1 for Anthophila clade; 0 for bycatch
);
CREATE INDEX idx_taxa_lineage ON taxa(lineage_path);
CREATE INDEX idx_taxa_is_anthophila ON taxa(is_anthophila);
```

**Descendant query pattern (wa-sqlite):**

```sql
-- All descendants of Apidae (taxon_id = 47221), including self:
SELECT taxon_id FROM taxa
WHERE taxon_id = 47221
   OR instr(lineage_path, '/47221/') > 0
```

**Why `instr()` not `LIKE`:** `instr(lineage_path, '/47221/')` correctly boundaries-checks the ID without false-matching `/147221/`. Both work at 17K rows; `instr()` is the documented project choice.

### Pattern 2: lineage_path extraction in DuckDB

[CITED: STACK.md §Lineage Path Format, verified against live taxa.csv.gz]

```python
# DuckDB SQL to compute lineage_path from the ancestry column in taxa.csv.gz
# ancestry is already a slash-delimited ancestor-ID string, NOT including self.
# lineage_path = '/630955/.../self_id/' (bee-clade segment only, both ends slashed)
lineage_path_expr = (
    "'/' || regexp_extract("
    "    ancestry || '/' || CAST(taxon_id AS VARCHAR),"
    "    '(630955(?:/[0-9]+)*)$', 1"
    ") || '/'"
)
```

This extracts everything from `630955` to the taxon itself (inclusive) and wraps it with slashes. Verified working against `Apis mellifera` in taxa.csv.gz.

**Edge case — `active = 'true'` string guard:**

```python
# MUST use string literal 'true', NOT boolean TRUE
# Boolean comparison matches zero rows (silent failure)
WHERE active = 'true'
```

[CITED: taxa_pipeline.py line 123, PITFALLS.md Integration Gotchas]

### Pattern 3: two-pass bycatch load

The bycatch pass must handle taxa at multiple ranks (genus, species, family, order, suborder, superfamily, subfamily) — all confirmed in live data above. Key logic:

```python
# PASS 2: for each bycatch taxon_id not already in the hierarchy,
# read its own row from taxa.csv.gz (taxon_id, rank, name)
# lineage_path = NULL (bycatch; not needed for descendant queries)
# is_anthophila = 0

bycatch_taxon_ids_query = """
SELECT DISTINCT taxon_id FROM occurrences
WHERE taxon_id IS NOT NULL
  AND taxon_id NOT IN (SELECT taxon_id FROM taxa)
"""
# Then for each bycatch taxon_id, read from read_csv(taxa.csv.gz)
# filtering taxon_id IN (list).
# Store at finest available rank per D-05 (no roll-up to genus).
```

**Note on bycatch rank coverage (from live data):** bycatch taxa in current occurrences span genus (41), species (37), family (18), order (7), suborder (1), superfamily (1), subfamily (1). The two-pass approach handles all of these uniformly: each bycatch `taxon_id` is stored at its OWN rank, as its OWN row, with `is_anthophila=0`.

### Pattern 4: ATTACH export inside sqlite_export.py

Existing pattern in `sqlite_export.py` (lines 41-49) to extend:

```python
def _build_taxon_hierarchy(con: duckdb.DuckDBPyConnection, dst_db: Path) -> None:
    """Append taxa table to already-ATTACHed occurrences.db."""
    # con already has: ATTACH '...' AS out (TYPE sqlite)
    # occurrences table already written
    # ... DuckDB SQL to build taxa ...
    pass
```

The function receives the open DuckDB connection with `out` already ATTACH'd. This keeps the build in one DuckDB session.

**Index creation via Python sqlite3 (not DuckDB ATTACH):**

DuckDB's SQLite extension supports `CREATE INDEX` but it is simpler to create indexes via the stdlib `sqlite3` connection that is already used for `geo_blob` construction (lines 59-68 of current `sqlite_export.py`). Both approaches work; use the existing `_sqlite3.connect(dst_db)` block.

### Pattern 5: checklist species coverage (PASS 3)

[VERIFIED: direct data query this session]

The checklist parquet (526 distinct `canonical_name` values) has **no `taxon_id` column**. Taxon IDs for checklist species are in `inaturalist_data.canonical_to_taxon_id` in `beeatlas.duckdb` (919 rows, all with `taxon_id`). The hierarchy build must join through this table to resolve checklist `canonical_name` → `taxon_id`, then load those species-level rows from `taxa.csv.gz`.

PASS 3 pseudo-code:

```python
# Read checklist canonical names from checklist.parquet
# Join to inaturalist_data.canonical_to_taxon_id via beeatlas.duckdb
# For each resolved taxon_id NOT already in out.taxa (from PASS 1):
#   read from taxa.csv.gz; INSERT with is_anthophila=1, lineage_path set
```

**Important:** `sqlite_export.py` currently reads only from `taxa.csv.gz` (via DuckDB) and `occurrences.parquet`. For PASS 3, it needs access to either:
- `checklist.parquet` (available in `_DBT_SANDBOX`) AND `canonical_to_taxon_id` in `beeatlas.duckdb`, OR
- A pre-joined parquet produced by a new dbt staging model.

**Recommended approach:** Add a DuckDB query inside `_build_taxon_hierarchy` that reads `checklist.parquet` and joins to the `canonical_to_taxon_id` table from the main `beeatlas.duckdb` connection. This keeps PASS 3 in the same DuckDB session. The `generate_sqlite()` function accepts a `src_parquet` path; pass `db_path` as an additional argument or use a module-level `DB_PATH` (already defined as `os.environ.get("DB_PATH", ...)`).

### Pattern 6: fallback if materialized-path fails benchmark

If the Apidae `instr()` scan in Firefox is clearly sluggish (subjective ~100 ms bar per D-03), the fallback is nested-set lft/rgt:

```sql
-- Nested-set schema (fallback only; do not use unless benchmark fails)
CREATE TABLE taxa (
    taxon_id  INTEGER PRIMARY KEY,
    rank      TEXT NOT NULL,
    name      TEXT NOT NULL,
    lft       INTEGER NOT NULL,
    rgt       INTEGER NOT NULL,
    is_anthophila INTEGER NOT NULL
);
CREATE INDEX idx_taxa_lft_rgt ON taxa(lft, rgt);

-- Descendant query:
SELECT t.taxon_id FROM taxa t
JOIN taxa parent ON parent.taxon_id = :ancestor_id
WHERE t.lft >= parent.lft AND t.rgt <= parent.rgt
```

Build requires a DuckDB WITH RECURSIVE to assign lft/rgt. STACK.md confirms DuckDB 1.5.2 supports `WITH RECURSIVE`. [CITED: STACK.md §Version Compatibility]

### Anti-Patterns to Avoid

- **Querying by name, not taxon_id:** `WHERE name = 'Bombus'` returns two rows (genus and subgenus). ALL hierarchy lookups must use `taxon_id`. [CITED: PITFALLS.md Pitfall 1]
- **Loading hierarchy on the `tablesReady` boot path:** The v4.3 win reduced `tablesReady` from 930 ms to 250 ms. This phase does NOT change the frontend. Phase 130 will load `taxonCache` lazily. [CITED: CONTEXT.md §Established Patterns]
- **Running the benchmark server-side (DuckDB):** Server-side latency does not predict WASM/JS latency. Must test in Firefox. [CITED: PITFALLS.md Pitfall 3, CONTEXT.md §Specific Ideas]
- **Missing the `active = 'true'` string guard:** Using `WHERE active = TRUE` (boolean) silently matches zero rows in DuckDB. [CITED: taxa_pipeline.py line 123]
- **Using `regexp_extract` without the `|| '/' ||` self-ID trick:** The `ancestry` column in `taxa.csv.gz` does NOT include the taxon's own ID. The expression must append `'/' || CAST(taxon_id AS VARCHAR)` before running the regex. [CITED: STACK.md §Lineage Path Format]
- **Encoding bycatch without lineage_path:** Bycatch taxa can have `lineage_path = NULL`. This is correct and expected; descendant queries on bycatch taxa are never needed (they are not in the bee tree). [CITED: CONTEXT.md D-05]
- **Assuming checklist.parquet has taxon_id:** It does not. [VERIFIED: live data query this session]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Read gzip-compressed TSV | Custom Python gzip parser | `read_csv('taxa.csv.gz', compression='gzip')` in DuckDB | Already proven in `taxa_pipeline.py` and `stg_inat__genus_taxon_ids.sql` |
| Write SQLite from DuckDB | Separate sqlite3 INSERT loop | `ATTACH '...' AS out (TYPE sqlite)` + `CREATE TABLE out.taxa AS SELECT ...` | Already used in `sqlite_export.py` lines 41-49 |
| Ancestry tree traversal | Python tree walk | `regexp_extract(ancestry || '/' || taxon_id, '(630955(?:/[0-9]+)*)$', 1)` | DuckDB handles this in SQL; no Python loop needed |
| Pipeline orchestration | New orchestrator | `run.py` STEPS list | Already wires `sqlite_export`; no change to STEPS needed |

**Key insight:** The entire hierarchy build is DuckDB SQL over `taxa.csv.gz`. No new libraries, no Python tree structures. The complexity budget is one new function in `sqlite_export.py`.

---

## Common Pitfalls

### Pitfall 1: Benchmark run in DuckDB instead of Firefox

**What goes wrong:** Tester measures `instr()` latency in a DuckDB Python script. DuckDB is orders of magnitude faster than wa-sqlite WASM. The test passes easily, but the browser experience is slow.
**Why it happens:** It is faster to run a Python script than to open a browser.
**How to avoid:** The benchmark MUST run in Firefox against the actual wa-sqlite WASM build. The procedure: (1) run `npm run dev`, (2) open the site in Firefox, (3) open DevTools console, (4) run a JS snippet that calls `sqlite3.exec(db, 'SELECT taxon_id FROM taxa WHERE taxon_id = 47221 OR instr(lineage_path, \'/47221/\') > 0', ...)` with `performance.now()` wrapping, (5) record the elapsed time.
**Warning signs:** Benchmark result is < 5 ms. Real wa-sqlite on a mid-range device should be 20-150 ms for a 17K-row scan.

### Pitfall 2: Orphan bycatch taxa not caught until runtime

**What goes wrong:** The bycatch two-pass load misses some `taxon_id` values. After Phase 130 cuts over to `taxon_id`-keyed name resolution, map points for those bycatch occurrences display no name.
**Why it happens:** Bycatch `taxon_id` values span multiple ranks; the query to find "all non-bee taxon_ids in occurrences" must check against the complete Anthophila set, not just `taxon_lineage_extended` (which is a PIVOT result, not a direct `taxon_id` list).
**How to avoid:** The orphan assertion after build: `SELECT COUNT(*) FROM occurrences WHERE taxon_id IS NOT NULL AND taxon_id NOT IN (SELECT taxon_id FROM taxa)` must be 0. Run this assertion inside `_build_taxon_hierarchy` and raise `ValueError` if it is non-zero.
**Warning signs:** Assertion shows > 0 orphans after the PASS 2 bycatch load. Inspect the missing `taxon_id` values to understand which ranks were missed.

### Pitfall 3: Checklist species added twice (once from PASS 1, once from PASS 3)

**What goes wrong:** PASS 1 loads all active Anthophila including species-level rows. PASS 3 loads checklist species. If a checklist species is already in PASS 1, `INSERT OR IGNORE` or the `NOT IN (SELECT taxon_id FROM out.taxa)` guard prevents a duplicate. Without this guard, `UNIQUE PRIMARY KEY` violation terminates the build.
**How to avoid:** The PASS 3 DuckDB INSERT should use `INSERT OR IGNORE INTO out.taxa` or filter with `WHERE taxon_id NOT IN (SELECT taxon_id FROM out.taxa)`. The `INTEGER PRIMARY KEY` on `taxa.taxon_id` makes duplicates a hard error without this guard.

### Pitfall 4: `taxon_lineage_extended` is genus/subgenus only, not species

**What goes wrong:** `taxon_lineage_extended` stores 17,343 rows covering family through subgenus. It does NOT store species-level rows. PASS 1 that reads from `taxon_lineage_extended` would miss all species. The correct PASS 1 reads from `taxa.csv.gz` directly.
**How to avoid:** PASS 1 must use `read_csv('taxa.csv.gz', ...)` filtered to active Anthophila, not `taxon_lineage_extended`. The `_build_taxon_hierarchy` function does NOT read `taxon_lineage_extended` — that table is a pivot artifact without the raw `ancestry` string needed to compute `lineage_path`. [VERIFIED: taxa_pipeline.py — `ancestry` string is discarded after the PIVOT]

### Pitfall 5: Bycatch `taxon_id` lookup fails for inactive or missing taxa

**What goes wrong:** A bycatch occurrence has a `taxon_id` that was valid when the occurrence was ingested but is now inactive (iNat taxonomy change). `taxa.csv.gz` does not contain inactive taxa when filtered with `active = 'true'`. The PASS 2 lookup returns no row.
**How to avoid:** Remove the `active = 'true'` filter in PASS 2. Bycatch taxa that are in occurrences should be stored regardless of active status — they were valid when ingested. The orphan assertion after build will catch any remaining gaps.

### Pitfall 6: Complex-rank taxa excluded from hierarchy

**What goes wrong:** The PASS 1 query filters ranks to `IN ('family', 'subfamily', 'tribe', 'genus', 'subgenus', 'species')` and misses `rank = 'complex'`. Complex taxa (148 in `taxa.csv.gz`) are hierarchy-resident per D-01.
**How to avoid:** Include `'complex'` in the rank filter. The full set of ranks to include for Anthophila: family, subfamily, tribe, genus, subgenus, complex, species. (Subspecies, subtribe, variety, hybrid, form — omit; these are not in the HIER-01 scope and inflate the table.)

---

## Code Examples

### Orphan assertion (post-build hard fail)

```python
# Source: PITFALLS.md Pitfall 5 + CONTEXT.md §Claude's Discretion
def _assert_no_orphan_taxon_ids(db_path: Path) -> None:
    """Fail the pipeline if any non-null occurrence taxon_id has no taxa entry."""
    with _sqlite3.connect(db_path) as con:
        (count,) = con.execute(
            """
            SELECT COUNT(*) FROM occurrences
            WHERE taxon_id IS NOT NULL
              AND taxon_id NOT IN (SELECT taxon_id FROM taxa)
            """
        ).fetchone()
    if count > 0:
        raise ValueError(
            f"Hierarchy build incomplete: {count} occurrence taxon_id values "
            f"have no entry in taxa table. "
            f"Run the bycatch pass again or inspect the missing IDs."
        )
```

### wa-sqlite benchmark JS snippet (copy-paste into Firefox DevTools)

```javascript
// Run in Firefox DevTools console after the page loads (tablesReady must have fired).
// Requires accessing the worker's sqlite3 API — adapt to the actual getDB() pattern.
// Simpler: add a one-off benchmark button to bee-atlas.ts during testing.
const t0 = performance.now();
await sqlite3.exec(
  db,
  "SELECT taxon_id FROM taxa WHERE taxon_id = 47221 OR instr(lineage_path, '/47221/') > 0",
  (row) => { /* collect rows */ }
);
const t1 = performance.now();
console.log(`Apidae descendant query: ${(t1 - t0).toFixed(1)} ms`);
```

**Note:** The benchmark cannot be run until `taxa` table exists in `occurrences.db`. The correct order is: (1) build `occurrences.db` with new `taxa` table, (2) serve it via `npm run dev`, (3) benchmark in Firefox. The benchmark is the first user-facing verification task, not a pre-build task.

### lineage_path computation in DuckDB SQL

```sql
-- Source: STACK.md §Lineage Path Format (verified against live taxa.csv.gz)
-- ancestry column in taxa.csv.gz does NOT include the taxon itself.
-- We append the taxon's own ID, then extract the bee-clade segment.
SELECT
    taxon_id,
    rank,
    name,
    '/' || regexp_extract(
        ancestry || '/' || CAST(taxon_id AS VARCHAR),
        '(630955(?:/[0-9]+)*)$',
        1
    ) || '/' AS lineage_path
FROM read_csv(
    'raw/taxa.csv.gz',
    delim = chr(9), header = true, compression = 'gzip',
    columns = {
        taxon_id: BIGINT, ancestry: VARCHAR, rank_level: BIGINT,
        rank: VARCHAR, name: VARCHAR, active: VARCHAR
    }
)
WHERE active = 'true'
  AND (ancestry LIKE '%/630955/%' OR ancestry LIKE '%/630955' OR taxon_id = 630955)
  AND rank IN ('family', 'subfamily', 'tribe', 'genus', 'subgenus', 'complex', 'species')
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Recursive CTE descendant query at filter time | Precomputed `lineage_path` + `instr()` full-scan | Phase 129 (this phase) | Avoids WASM CTE recursion latency; uses static materialized path already in `taxa.csv.gz` |
| String column filter (`genus =`, `family =`) | `taxon_id`-keyed descendant query | Phase 130 (next phase) | Phase 129 is additive; no frontend change this phase |
| Hierarchy not in DB | `taxa` table embedded in `occurrences.db` | Phase 129 | Single HTTP fetch; same SQLite session as occurrence queries |

**Deprecated/outdated:**
- `taxon_lineage_extended` for hierarchy source: still used for other pipeline steps but is NOT the source for `_build_taxon_hierarchy`. The hierarchy reads `taxa.csv.gz` directly to preserve the `ancestry` string needed for `lineage_path` computation.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Checklist parquet has no `taxon_id` column (requires `canonical_to_taxon_id` join for PASS 3) | Architecture Patterns, Pattern 5 | VERIFIED this session: `checklist.parquet` columns confirmed to have no `taxon_id`; resolved |
| A2 | `beeatlas.duckdb` `canonical_to_taxon_id` has 919 rows covering all resolved checklist species | Architecture Patterns, Pattern 5 | VERIFIED this session; 526 checklist species + some have multiple forms |
| A3 | Apidae descendant count is ~4,959 species (not ~4,000 as in prior research) | Common Pitfalls, Summary | VERIFIED: live query returned 4,959 active Apidae species. ~100 ms bar still likely adequate but benchmark is required |
| A4 | Complex-rank occurrences = 0 in current data | Phase Requirements (HIER-06), Summary | VERIFIED: DuckDB query returned 0 complex-rank occurrence rows |
| A5 | Bycatch: 106 distinct taxon_ids, 2,020 occurrence rows, multiple ranks | Summary, Architecture Patterns | VERIFIED: live query this session |

**If this table is empty for verified items:** All assumptions above were validated against live data this session.

---

## Open Questions

1. **Apidae benchmark result (blocking D-02 fallback decision)**
   - What we know: `instr()` at 17,343 rows = ~110 ms worst-case per STACK.md `6.4 μs × 17K` estimate. Apidae has 4,959 descendants (larger than 4,000 estimate). wa-sqlite WASM in Firefox on a mid-range machine may be slower than the Python-based estimate.
   - What's unclear: actual Firefox/wa-sqlite latency. Could be 30 ms (fine) or 200 ms (clearly sluggish).
   - Recommendation: Make this the first task in Phase 129. Do NOT finalize the schema until the benchmark is run. If the benchmark fails (~>150 ms, clearly sluggish), switch to nested-set lft/rgt — the build is one DuckDB recursive CTE step and the fallback is well-documented.

2. **PASS 3 database connection (checklist.parquet + canonical_to_taxon_id)**
   - What we know: `generate_sqlite()` currently opens a fresh `:memory:` DuckDB connection; `sqlite_export.py` defines `DB_PATH` via env var.
   - What's unclear: whether `_build_taxon_hierarchy` should open a second DuckDB connection to `beeatlas.duckdb` to access `canonical_to_taxon_id`, or whether a parquet export of `canonical_to_taxon_id` should be added to `_DBT_SANDBOX` by a new dbt model.
   - Recommendation: Use a DuckDB connection to `beeatlas.duckdb` inside `_build_taxon_hierarchy`. This is the simplest approach and follows the existing `DB_PATH` pattern. A dbt export would be cleaner but adds a new parquet artifact and dbt model.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `taxa.csv.gz` | All hierarchy build passes | Checked-in pipeline downloads it | ~37 MB gzip TSV | Re-download via `download_taxa_csv()` |
| `beeatlas.duckdb` | PASS 3 checklist→taxon_id join | Available at `data/beeatlas.duckdb` | DuckDB 1.5.2 | Build from pipeline first |
| Firefox (mid-range device) | wa-sqlite benchmark | Available (dev machine) | Any recent version | Use Chrome as secondary; document which browser |
| `npm run dev` | wa-sqlite benchmark | Available | — | `npm run build` + serve static |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest (existing) |
| Config file | `data/pyproject.toml` |
| Quick run command | `cd data && uv run pytest tests/test_sqlite_export.py -x` |
| Full suite command | `cd data && uv run pytest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HIER-01 | `taxa` table present in `occurrences.db` with expected columns | unit | `pytest tests/test_sqlite_export.py::test_taxa_table_exists -x` | No — Wave 0 |
| HIER-01 | Every occurrence `taxon_id` has a `taxa` entry (zero orphans) | unit | `pytest tests/test_sqlite_export.py::test_zero_orphan_taxon_ids -x` | No — Wave 0 |
| HIER-02 | `taxa` rows have non-null `name` and `rank` for all referenced `taxon_id` values | unit | `pytest tests/test_sqlite_export.py::test_taxa_name_rank_non_null -x` | No — Wave 0 |
| HIER-03 | Descendant query for Apidae returns > 0 rows and all have `is_anthophila = 1` | unit | `pytest tests/test_sqlite_export.py::test_apidae_descendant_query -x` | No — Wave 0 |
| HIER-03 | wa-sqlite Apidae benchmark latency | manual | Firefox DevTools (see §Code Examples) | — |
| HIER-04 | Active-taxa guard: inactive taxon_ids not in hierarchy (except bycatch where allowed) | unit | `pytest tests/test_sqlite_export.py::test_active_taxa_only -x` | No — Wave 0 |
| HIER-04 | Orphan assertion raises `ValueError` when a taxon_id is missing | unit | `pytest tests/test_sqlite_export.py::test_orphan_assertion_raises -x` | No — Wave 0 |
| HIER-05 | Bycatch taxa have `is_anthophila = 0`; bee taxa have `is_anthophila = 1` | unit | `pytest tests/test_sqlite_export.py::test_is_anthophila_flag -x` | No — Wave 0 |
| HIER-05 | Known bycatch genus (e.g., `taxon_id = genus Crabro`) present in taxa with `is_anthophila = 0` | unit | `pytest tests/test_sqlite_export.py::test_bycatch_present_in_taxa -x` | No — Wave 0 |
| HIER-06 | Complex-rank count and bycatch count queryable from `taxa` | unit | `pytest tests/test_sqlite_export.py::test_complex_and_bycatch_counts -x` | No — Wave 0 |

### Sampling Rate

- **Per task commit:** `cd data && uv run pytest tests/test_sqlite_export.py -x`
- **Per wave merge:** `cd data && uv run pytest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/test_sqlite_export.py` — add hierarchy test functions (10 new test cases above)
- [ ] Hierarchy fixture: a mini `taxa.csv.gz`-like CSV fixture with known Anthophila + bycatch rows for deterministic testing

**Existing infrastructure coverage:** `test_sqlite_export.py` already has a `src_parquet` pytest fixture and 5 tests covering occurrences table creation/row count/column names/overwrite/main(). The Wave 0 work extends this file; no new conftest.py needed.

### VERIFICATION.md Required Content (HIER-06 + phase gate)

The phase VERIFICATION.md must record:
1. **Structure chosen:** materialized-path `lineage_path` (or nested-set if benchmark failed, with latency evidence)
2. **Benchmark result:** Apidae descendant query latency in Firefox (browser, device, elapsed ms)
3. **Complex-rank count:** 0 occurrence rows with complex-rank `taxon_id` in current data; 148 complex-rank taxa exist in `taxa.csv.gz` and are hierarchy-resident
4. **Bycatch count:** 106 distinct bycatch `taxon_id` values; 2,020 bycatch occurrence rows; PAGE-05 dropped per D-01
5. **Zero orphan assertion:** `SELECT COUNT(*) FROM occurrences WHERE taxon_id IS NOT NULL AND taxon_id NOT IN (SELECT taxon_id FROM taxa)` = 0
6. **`occurrences.db` size before/after:** baseline 26.5 MB; expected to increase slightly (taxa table ~1-2 MB)

---

## Security Domain

This phase has no authentication, session management, access control, or cryptography concerns. It is a pipeline-only change with no HTTP endpoints. ASVS V5 Input Validation applies minimally: the `active = 'true'` string guard and the `taxon_id NOT IN (...)` orphan assertion are the validation controls.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection + live data queries)

- `data/sqlite_export.py` — existing ATTACH pattern, `_GEO_COLS`, `geo_blob` construction [VERIFIED]
- `data/taxa_pipeline.py` — `ANTHOPHILA_ID = 630955`, `active = 'true'` guard, ancestry walk pattern [VERIFIED]
- `data/tests/test_sqlite_export.py` — existing test fixture shape for Wave 0 extension [VERIFIED]
- `data/dbt/models/marts/schema.yml` — 37-column occurrences contract; `taxon_id` at line 81 [VERIFIED]
- `data/dbt/models/intermediate/int_combined.sql` — `taxon_id` populated at lines 46, 106, 189 [VERIFIED]
- `src/sqlite-worker.ts` — wa-sqlite WASM boot sequence, `tablesReady` signal, benchmark pattern [VERIFIED]
- Live DuckDB queries this session:
  - Active Anthophila ranks: species=14,965; complex=148; genus=521; etc. [VERIFIED]
  - Apidae descendants (species): 4,959 [VERIFIED]
  - Complex-rank occurrence rows: 0 [VERIFIED]
  - Bycatch: 106 distinct taxon_ids, 2,020 rows, genus/species/family/order/suborder/superfamily/subfamily ranks [VERIFIED]
  - `taxon_lineage_extended` row count: 17,343 [VERIFIED]
  - `checklist.parquet` columns: no `taxon_id` column [VERIFIED]
  - `canonical_to_taxon_id`: 919 rows [VERIFIED]
  - `occurrences.db` current size: 26.5 MB [VERIFIED]

### Secondary (MEDIUM confidence — prior milestone research files)

- `.planning/research/STACK.md` — materialized-path argument, `instr()` latency math (~110 ms worst-case), lineage_path format [CITED]
- `.planning/research/ARCHITECTURE.md` — `_build_taxon_hierarchy` placement, lazy taxonCache load, closure-table schema proposal [CITED]
- `.planning/research/PITFALLS.md` — Pitfall 1 (name non-uniqueness), Pitfall 3 (wa-sqlite CTE performance), Pitfall 5 (bycatch orphans, two-pass load) [CITED]
- `.planning/research/SUMMARY.md` — synthesis, structure-decision gate, phase ordering [CITED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all tooling already in production use
- Architecture: HIGH — `_build_taxon_hierarchy` placement is prescriptive; build mechanics proven from existing `sqlite_export.py` and `taxa_pipeline.py` patterns
- Pitfalls: HIGH — all pitfalls identified from live code and live data queries; complex/bycatch counts confirmed from current `occurrences.parquet`
- Benchmark methodology: HIGH — benchmark procedure is well-defined; result is unknown until run

**Research date:** 2026-06-02
**Valid until:** 2026-07-02 (30 days; stable pipeline stack)
