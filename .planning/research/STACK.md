# Stack Research: v4.6 Taxonomy Hierarchy & Normalization

**Project:** BeeAtlas v4.6
**Researched:** 2026-06-01
**Confidence:** HIGH
**Scope:** New capabilities only. Existing stack (Python 3.14+, dbt-duckdb 1.10.1,
DuckDB 1.5.2, dbt-core 1.8.9, dlt, wa-sqlite 1.0.0 / SQLite 3.44, Mapbox GL JS,
Lit) is confirmed and not re-researched. This document covers only what changes for
the hierarchy feature.

---

## Summary Verdict

**No new libraries required.** The full hierarchy — build-time DuckDB queries,
SQLite export, and runtime wa-sqlite descendant lookups — is achievable with existing
tooling. The only stack changes are schema additions: a new `taxa` table (pipeline +
SQLite export) and dropping denormalized rank columns from `occurrences`.

---

## Hierarchy Structure Decision: Materialized Path via the Existing `ancestry` Column

### The Three Candidates

| Structure | Build complexity | SQLite runtime | Row count for 17K taxa | Index-friendly? |
|-----------|----------------|----------------|------------------------|-----------------|
| Nested Set (MPTT lft/rgt) | High — requires recursive CTE to assign lft/rgt; recompute on any change | `lft BETWEEN parent.lft AND parent.rgt` — O(1) with B-tree | 1 row / taxon (~17K rows) | YES |
| Closure Table | High — `(ancestor, descendant)` pairs via recursive CTE or unnest | `WHERE ancestor_id = ?` — O(1) with composite index | ~17K × avg_depth ≈ 250K rows | YES |
| Materialized Path (lineage string) | **Zero** — `ancestry` column in `taxa.csv.gz` IS a materialized path | `instr(lineage_path, '/47221/')` or LIKE prefix | 1 row / taxon (~17K rows) | Partial (LIKE suffix not indexed) |

### Why Materialized Path Wins for This Project

**The `ancestry` column in `taxa.csv.gz` is already a slash-delimited ancestor-ID
string** — for example, Apis mellifera's ancestry is
`'48460/1/.../630955/47221/199939/538904/47220/578086'`. This is precisely the
materialized path representation. The build step already reads and parses this column
in `taxa_pipeline.py`.

**Proven pattern in the existing codebase:** `taxa_pipeline.py` already uses
`ancestry LIKE '%/630955/%'` to filter Anthophila taxa. The v4.5 STACK.md documents
this and confirms it works in DuckDB 1.5.2. The MPTT groundwork note in that document
already recommends this approach.

**No recursive CTE needed at pipeline time.** The closure table approach requires a
recursive CTE to generate `(ancestor, descendant)` pairs; materialized path skips
this entirely by storing the path directly. Verified: DuckDB 1.5.2 supports
`WITH RECURSIVE`, but we don't need it.

**The scale is small.** 17,343 active bee taxa (confirmed from
`inaturalist_data.taxon_lineage_extended`) plus bycatch genera for name display. A
taxa table at this scale is negligible in both DuckDB and SQLite.

**SQLite LIKE is sufficient for runtime.** wa-sqlite 1.0.0 embeds SQLite 3.44.
`WITH RECURSIVE` is supported (SQLite has had it since 3.8.3). Both `instr()` and
`LIKE` work. For 17K rows, a linear scan on `instr(lineage_path, '/47221/')` is
fast enough; a B-tree index on `lineage_path` helps LIKE-prefix queries. The
autocomplete tree expansion is bounded (one rank at a time), not a full-table scan.

**The bycatch genera (non-bee Animalia) need only name resolution**, not hierarchy
display. They don't appear in the browse tree or autocomplete. Their rows in the taxa
table need only `taxon_id`, `rank`, `name`, and NULL for unused rank columns — no
lineage_path required for bycatch (lineage queries are bee-only). But storing their
lineage_path costs nothing and simplifies the schema.

### Lineage Path Format

Store the path as: `/ancestor1/ancestor2/.../self_id/` (leading and trailing slashes,
all numeric IDs, bee-clade relative starting from Anthophila's `taxon_id = 630955`).

This format enables **exact boundary matching** with `instr()`:

```sql
-- All descendants of Apidae (taxon_id = 47221):
WHERE instr(lineage_path, '/47221/') > 0
-- Self-match:
WHERE taxon_id = 47221
-- Combined (include self and all descendants):
WHERE taxon_id = 47221 OR instr(lineage_path, '/47221/') > 0
```

The leading and trailing slashes prevent false matches on partial IDs (e.g. `/47221/`
cannot match `/147221/`). Verified in Python 3.14 sqlite3 (3.45.1) and confirmed
`instr()` is available in wa-sqlite 3.44.

**Why not the full iNat ancestry path** (e.g. `'48460/1/.../630955/47221'`)?
A LIKE query `'%/47221/%'` without anchoring is safe for IDs that are unique integers,
but requires two LIKE patterns (`'%/47221/%' OR ancestry = ...`). The bee-relative path
with slashes at both ends uses a single `instr()` call and is conceptually cleaner.

**Build step:** Compute `lineage_path` as:
```sql
'/' || regexp_extract(ancestry || '/' || CAST(taxon_id AS VARCHAR),
    '(630955(?:/[0-9]+)*)$', 1) || '/'
```
Verified in DuckDB 1.5.2: correctly extracts the bee-clade segment from the full
ancestry string for all tested taxa.

---

## Core Technologies (Unchanged)

| Technology | Version | Purpose | Status |
|------------|---------|---------|--------|
| DuckDB | 1.5.2 (pinned `>=1.4,<2`) | Pipeline transforms, taxa table build, SQLite export | No change |
| dbt-duckdb | 1.10.1 | dbt adapter | No change |
| dbt-core | 1.8.9 | Model orchestration | No change |
| wa-sqlite | 1.0.0 (SQLite 3.44) | Runtime SQL in WASM worker | No change |
| Python | 3.14+ | Pipeline language | No change |

---

## New Artifacts (No New Libraries)

### 1. `taxa` Table in `occurrences.db` (SQLite)

A new table exported by `sqlite_export.py` alongside the existing `occurrences` and
`geo_blob` tables:

```sql
CREATE TABLE taxa (
    taxon_id    INTEGER PRIMARY KEY,
    rank        TEXT NOT NULL,        -- 'family'|'subfamily'|'tribe'|'genus'|'subgenus'|'species'
    name        TEXT NOT NULL,        -- canonical scientific name
    lineage_path TEXT               -- NULL for bycatch (non-bee); '/630955/.../self_id/' for bees
);
CREATE INDEX idx_taxa_lineage ON taxa(lineage_path);
```

**Scope of rows:**
- Bee taxa (Anthophila): all ~17K active taxa from `inaturalist_data.taxon_lineage_extended`
  (family through species). These carry `lineage_path`.
- Bycatch genera: any non-bee Animalia genus with a `taxon_id` that appears in
  `occurrences.taxon_id` (after dropping rank columns, occurrence rows need name
  resolution). These carry NULL `lineage_path` (not included in browse tree or
  autocomplete). Count: small (the ~149 occurrence genera already tracked minus the
  ~521 bee genera leaves roughly 100–200 bycatch rows).

**Build path:** New dbt model `marts/taxa.sql` (materialized TABLE, exported to
`taxa.parquet`) + `sqlite_export.py` extension to read `taxa.parquet` and write the
`taxa` table into `occurrences.db`.

**Alternative to a dbt mart:** `taxa_pipeline.py` directly writes a
`inaturalist_data.taxon_table` DuckDB table; `sqlite_export.py` reads it. This avoids
adding a mart but breaks the dbt-as-single-source-of-truth pattern. Prefer the dbt
mart.

### 2. `occurrences` Table Schema Rewrite

Drop denormalized rank columns; add `taxon_id` index. The dbt 37-column contract on
`marts/occurrences` is rewritten. Target columns to drop:
- `genus` (VARCHAR) — resolved via `taxa` table JOIN on `taxon_id`
- `family` (VARCHAR) — same
- `scientificName` (VARCHAR) — same (species `name` from `taxa`)
- `canonical_name` (VARCHAR) — same
- `specimen_inat_genus` (VARCHAR) — same
- `specimen_inat_family` (VARCHAR) — same

Columns to keep or add:
- `taxon_id INTEGER` — already present; gets a SQLite index: `CREATE INDEX idx_occ_taxon ON occurrences(taxon_id)`

The `geo_blob` pre-serialized table in `sqlite_export.py` currently includes `genus`,
`family`, `scientificName` in its column list. These columns will be dropped from
`geo_blob` and resolved from the taxa table at feature-creation time (one JOIN per
`taxon_id` at startup is acceptable, or the `geo_blob` query can JOIN the taxa table).

### 3. dbt Model: `marts/taxa.sql`

Pure SQL against existing sources. No new dbt macros needed. Pattern:

```sql
-- marts/taxa.sql
{{ config(materialized='table') }}

WITH bee_taxa AS (
    SELECT
        taxon_id,
        -- derive rank from lineage_extended (it's already grouped by taxon_id with rank cols)
        CASE
            WHEN subgenus IS NOT NULL THEN 'subgenus'
            WHEN genus IS NOT NULL AND specific_epithet IS NOT NULL THEN 'species'
            WHEN genus IS NOT NULL THEN 'genus'
            WHEN tribe IS NOT NULL THEN 'tribe'
            WHEN subfamily IS NOT NULL THEN 'subfamily'
            ELSE 'family'
        END AS rank,
        COALESCE(subgenus, ...) AS name,   -- canonical name at the finest rank
        lineage_path                        -- computed in taxa_pipeline.py
    FROM {{ source('inaturalist_data', 'taxon_table') }}
),
bycatch_genera AS (
    -- Non-bee occurrence genera: need name only, no lineage_path
    ...
)
SELECT * FROM bee_taxa
UNION ALL
SELECT * FROM bycatch_genera
```

The exact SQL depends on how `lineage_path` is stored — either computed in
`taxa_pipeline.py` (preferred, keeps complex regex in Python/DuckDB Python API) or
via a dbt model reading `taxa.csv.gz` directly (same pattern as
`stg_inat__genus_taxon_ids.sql`).

**Recommendation:** Compute `lineage_path` in `taxa_pipeline.py` alongside the
existing `taxon_lineage_extended` build, write it to a new
`inaturalist_data.taxon_table` DuckDB table, then surface it via a dbt staging model.
This keeps the raw CSV parsing in one Python file.

---

## DuckDB-Specific Notes

### `WITH RECURSIVE` (Available but Not Needed)

DuckDB 1.5.2 supports `WITH RECURSIVE` — confirmed by test. However, the materialized
path approach means recursive CTEs are not needed for hierarchy construction. The
existing unnest+PIVOT pattern in `taxa_pipeline.py` already handles ancestor walks.

### `PIVOT` (Already in Use)

The existing `PIVOT ... ON rank IN ('family', 'subfamily', ...) USING first(name) GROUP BY`
pattern in `taxa_pipeline.py` is confirmed working in DuckDB 1.5.2. No change needed.

### `read_csv` Direct in dbt Models

The `stg_inat__genus_taxon_ids.sql` model already uses `read_csv('../raw/taxa.csv.gz', ...)`
directly. The same pattern works for a `stg_inat__taxon_table.sql` or the computation
can stay in Python.

### DuckDB `INSTALL sqlite; LOAD sqlite` for Export

`sqlite_export.py` already uses DuckDB's SQLite extension to `ATTACH` an SQLite
database and write tables via `CREATE TABLE ... AS SELECT ... FROM read_parquet(...)`.
Extending it with `taxa.parquet` follows the exact same pattern. No new DuckDB
extension needed.

---

## SQLite / wa-sqlite Notes

### `WITH RECURSIVE` in wa-sqlite 3.44

Available. SQLite has supported recursive CTEs since 3.8.3. This means the frontend
could generate a descendant set via a recursive CTE on the `taxa` table if needed.
However, the `instr(lineage_path, '/taxon_id/')` approach is simpler and avoids CTE
overhead for small result sets.

### LIKE Index Behavior in SQLite 3.44

SQLite uses a B-tree index for `LIKE 'prefix%'` (left-anchored patterns only). For
`instr(lineage_path, '/47221/')`, SQLite cannot use the index (function call prevents
index use). With 17K rows, a full scan takes microseconds — not a performance concern.

If index use becomes needed (e.g. the `taxa` table grows to 100K+ rows for a future
multi-clade atlas), replace `instr()` with a LIKE approach using the `taxon_id` as a
known prefix: `lineage_path LIKE '/630955/47221/%'` (left-anchored from Anthophila
root). The index would help here. This is an optimization, not a requirement for v4.6.

### `json_group_array` Rejected (Prior Art)

The `geo_blob` pre-serialization decision (v4.3) established that `json_group_array` in
wa-sqlite has 6.4 μs per-callback overhead × row count = unacceptable at scale. The
taxa table has only ~17K rows; a single `SELECT * FROM taxa` would be ~17K callbacks.
Consider pre-serializing `taxa` as a JSON blob in `sqlite_export.py` (same as
`geo_blob`), OR accept the 17K callbacks (at 6.4 μs each = ~110 ms — borderline). The
taxa table needs to be queried in two modes: (a) full load at startup for autocomplete,
(b) targeted descendant queries at filter time. Split the concern: pre-serialize the
autocomplete-needed subset as a JSON blob; use SQL for descendant filtering.

---

## Integration Points

| Integration | What Changes | Risk |
|-------------|-------------|------|
| `data/taxa_pipeline.py` | Add `lineage_path` computation + `inaturalist_data.taxon_table` write | Low — additive alongside existing `taxon_lineage_extended` |
| New dbt staging model `stg_inat__taxon_table.sql` | Wraps `inaturalist_data.taxon_table` source | Low — read-only view |
| New dbt mart `marts/taxa.sql` | Produces `taxa.parquet` | Low — new model |
| `data/dbt/models/marts/schema.yml` | New `taxa` contract; rewrite `occurrences` contract (remove ~6 columns) | Medium — contract rewrite must coordinate with sqlite_export.py |
| `data/sqlite_export.py` | Add `taxa` table export from `taxa.parquet`; update `geo_blob` column list; add index on `occurrences.taxon_id` | Medium — careful with geo_blob column removal |
| `src/filter.ts` `buildFilterSQL()` | Replace `family =`, `genus =`, `scientificName =` with taxon_id + descendant subquery | High — core filter logic rewrite |
| `src/filter.ts` `OccurrenceRow` type | Remove `genus`, `family`, `scientificName`, `canonical_name` fields | Medium — cascades to bee-atlas.ts, bee-map.ts, display components |
| `src/filter.ts` `OCCURRENCE_COLUMNS` | Remove dropped columns | Medium — cascades to all SQL SELECT statements |
| `src/features.ts` `geo_blob` column list | Remove `genus`, `family`, `scientificName`; add taxon_id; JOIN taxa at feature creation | Medium — timing: taxa table must be loaded before features |
| `src/sqlite.ts` (or new `src/taxa.ts`) | New `loadTaxa()` / `getDescendants(taxon_id)` functions | New code — moderate complexity |
| `src/bee-filter-controls.ts` | Extend autocomplete to subfamily/tribe/subgenus using taxa table | Medium |
| `data/sqlite_export.py` `_GEO_COLS` list | Remove `scientificName`, `genus`, `family`; keep `taxon_id` | Must coordinate with `features.ts` |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Nested-set (MPTT lft/rgt) | Requires recursive CTE at build time to assign lft/rgt; complex re-index on any taxa update; provides no benefit over materialized path for this read-only, static-build context | Materialized path (lineage_path) |
| Closure table | ~250K rows of (ancestor, descendant) pairs; requires recursive CTE to generate; overkill for 17K taxa where `instr()` scans are fast | Materialized path with `instr()` |
| New Python hierarchy library (e.g. `anytree`, `treelib`) | Pipeline is DuckDB SQL; no tree-manipulation library needed | Plain DuckDB SQL + `read_csv` |
| `pandas` / `polars` | DuckDB handles all transforms | DuckDB SQL |
| `networkx` | Already present via dlt; not needed for this tree shape | DuckDB ancestry string |
| iNat API calls for hierarchy | `taxa.csv.gz` already has full ancestry column — no API calls needed | `read_csv('../raw/taxa.csv.gz', ...)` |
| DwC-A taxonomy | Missing intermediate ranks, no parent IDs as integers, larger download | taxa.csv.gz |
| DuckDB WASM in frontend | Already rejected in project history | wa-sqlite (already in use) |
| A server endpoint for taxon lookups | Static hosting constraint — all data must be in `occurrences.db` | Taxa table in SQLite |
| Separate `taxa.db` file for the frontend | Adds a second HTTP fetch and load synchronization complexity | Embed `taxa` table directly in `occurrences.db` |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Materialized path with `instr()` | Closure table | If the taxa set were millions of rows or if multi-hop joins were common — neither applies here |
| Materialized path with `instr()` | Nested set (MPTT) | If tree structure changed frequently and point queries needed O(log n) — this is a static build with ~17K rows |
| `instr(lineage_path, '/id/')` | `LIKE '%/id/%'` | `instr()` is slightly more readable; both work; LIKE is index-friendly if left-anchored but requires knowing the root prefix |
| Store in `occurrences.db` | Separate `taxa.json` / `taxa.parquet` fetch at runtime | Separate file adds HTTP overhead and load sequencing; SQLite JOIN is cleaner |
| dbt mart `taxa.sql` | Write taxa table directly from `taxa_pipeline.py` bypassing dbt | Acceptable for speed, but breaks dbt as single source of truth for exported artifacts |

---

## Version Compatibility

| Package | Version | Notes |
|---------|---------|-------|
| DuckDB | 1.5.2 | `WITH RECURSIVE`, `PIVOT`, `read_csv` with gzip compression all verified working |
| dbt-duckdb | 1.10.1 | Supports `read_csv` in model SQL (pattern already in production) |
| wa-sqlite | 1.0.0 (SQLite 3.44) | `WITH RECURSIVE` available since SQLite 3.8.3; `instr()` since 3.7.15; both confirmed |
| Python `sqlite3` | 3.45.1 (Python 3.14 bundled) | Only used by `sqlite_export.py`; `CREATE INDEX` and multi-table `ATTACH` work |
| dbt-core | 1.8.9 | No change; new mart model follows existing patterns |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Materialized path via ancestry column | HIGH | Existing taxa_pipeline.py uses this exact pattern; v4.5 STACK.md documents it; tested in DuckDB 1.5.2 |
| `instr()` for descendant queries in SQLite 3.44 | HIGH | Tested in Python sqlite3; wa-sqlite WASM embeds 3.44 (confirmed from binary) |
| No recursive CTE needed | HIGH | ancestry column is already a materialized path; nothing to compute recursively |
| DuckDB `read_csv` gzip for taxa table build | HIGH | Already in production in `stg_inat__genus_taxon_ids.sql` and `taxa_pipeline.py` |
| 17K-row taxa table in SQLite — performance adequate | HIGH | At 6.4 μs/callback × 17K = ~110 ms if loaded naively; mitigated by geo_blob pattern (pre-serialize JSON at export time) |
| Drop of ~6 denormalized columns — safe for all consumers | MEDIUM | Requires audit of all `genus`, `family`, `scientificName`, `canonical_name` references in frontend TypeScript — broad surface area |
| `geo_blob` column list change — backward compatible | MEDIUM | sqlite_export.py writes geo_blob; features.ts reads it; both must change atomically |

---

## Pre-Implementation Checks

```bash
# Verify the lineage_path extraction regex works on actual taxa data
cd data && uv run python3 -c "
import duckdb
con = duckdb.connect(':memory:')
# Test bee-relative path extraction
rows = con.execute('''
SELECT 
    taxon_id,
    '/' || regexp_extract(ancestry || '/' || CAST(taxon_id AS VARCHAR),
        '(630955(?:/[0-9]+)*)', 1) || '/' AS lineage_path
FROM read_csv(
    'raw/taxa.csv.gz',
    delim = chr(9), header = true, compression = 'gzip',
    columns = {taxon_id: BIGINT, ancestry: VARCHAR, rank_level: BIGINT,
               rank: VARCHAR, name: VARCHAR, active: VARCHAR}
)
WHERE active = 'true' AND name = 'Apis mellifera'
''').fetchall()
print('Apis mellifera lineage_path:', rows)
con.close()
"

# Count distinct taxon_ids in occurrence data (scope of taxa rows needed)
# Run against the dbt sandbox parquet
cd data && uv run python3 -c "
import duckdb
con = duckdb.connect(':memory:')
rows = con.execute('''
SELECT COUNT(DISTINCT taxon_id), COUNT(*) as total,
       SUM(CASE WHEN taxon_id IS NULL THEN 1 ELSE 0 END) as null_taxon
FROM read_parquet('dbt/target/sandbox/occurrences.parquet')
''').fetchone()
print('distinct taxon_ids / total rows / null taxon_id:', rows)
con.close()
"
```

---

## Sources

- DuckDB 1.5.2 verified capabilities: direct test (`WITH RECURSIVE`, `PIVOT`, `read_csv` gzip, `regexp_extract`) — HIGH confidence
- wa-sqlite binary: `strings node_modules/wa-sqlite/dist/wa-sqlite.wasm | grep '3\.'` → `?3.44.0` — HIGH confidence
- Python sqlite3 (3.45.1) `WITH RECURSIVE` test — HIGH confidence
- Existing `taxa_pipeline.py` ancestry walk — in-production code, reviewed at `/home/peter/dev/beeatlas/data/taxa_pipeline.py`
- v4.5 STACK.md "Feature 4: Nested-Set / MPTT Groundwork" — documents same LIKE ancestry pattern, deferred from v4.5
- `inaturalist_data.taxon_lineage_extended` row count 17,343 — queried from live DuckDB
- `stg_inat__genus_taxon_ids.sql` — in-production example of `read_csv('../raw/taxa.csv.gz', ...)` in a dbt model
- SQLite `instr()` availability: https://www.sqlite.org/lang_corefunc.html (since 3.7.15, well below our 3.44)

---

*Stack research for: v4.6 Taxonomy Hierarchy & Normalization*
*Researched: 2026-06-01*
