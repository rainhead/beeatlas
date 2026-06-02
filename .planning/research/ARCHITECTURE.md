# Architecture Research

**Domain:** BeeAtlas v4.6 — Taxonomy Hierarchy & Normalization
**Researched:** 2026-06-01
**Confidence:** HIGH — all findings from direct codebase inspection

---

## Current State Inventory (v4.5 Baseline)

### Existing Taxon Infrastructure (what v4.6 extends)

```
taxa.csv.gz (iNat Open Data S3, ~37 MB gzipped TSV)
    ↓ taxa_pipeline.load_taxon_lineage_extended
inaturalist_data.taxon_lineage_extended
    columns: taxon_id BIGINT, family, subfamily, tribe, genus, subgenus VARCHAR
    scope:   ALL active Anthophila (bees only — monophyletic via ANTHOPHILA_ID=630955)
    note:    ancestry string discarded after PIVOT; no rank column; no species rows

stg_inat__genus_taxon_ids  (dbt VIEW, reads taxa.csv.gz directly)
    columns: genus_name VARCHAR (lowercase, unique within Animalia), taxon_id INTEGER
    scope:   ALL active Animalia genera (bees + wasp/fly bycatch)
    purpose: genus-rank taxon_id backfill in int_combined ARM 1/2/3 (Phase 128)

stg_inat__canonical_to_taxon_id (dbt VIEW over inaturalist_data.canonical_to_taxon_id)
    columns: canonical_name VARCHAR (PK), taxon_id INTEGER, resolved_at, source
    scope:   species-level bridge populated by resolve_taxon_ids.py (iNat API calls)
    purpose: canonical_name → taxon_id for species-level occurrences
```

### Current occurrences Contract (37 columns, enforced by dbt schema.yml)

Columns that carry redundant taxon text strings scheduled for removal in v4.6:
- `scientificName` VARCHAR — ecdysis DarwinCore field; NULL for ARM 2 provisional, ARM 3 iNat obs
- `genus` VARCHAR — present in ARM 1 ecdysis, ARM 2 provisional (specimen_inat_genus); NULL in ARM 3
- `family` VARCHAR — present in ARM 1 ecdysis, ARM 2 provisional (specimen_inat_family); NULL in ARM 3
- `canonical_name` VARCHAR — normalized binomial (post-synonymy resolution); foundation for taxon_id join
- `specimen_inat_taxon_name` VARCHAR — raw iNat text from WABA observer; superseded by taxon_id
- `specimen_inat_genus` VARCHAR — redundant with genus for ARM 2 rows
- `specimen_inat_family` VARCHAR — redundant with family for ARM 2 rows

Columns that STAY (non-taxon-name data with other purposes):
- `taxon_id INTEGER` — already present (Phase 128 TID-02); the v4.6 resolution key
- `source` VARCHAR — ecdysis/waba_sample/inat_obs discriminator; needed for rendering
- `canonical_name` — **keep**: used as the join key for taxon lookup; also the display fallback
  for the ~21k unidentified ecdysis rows that carry NULL taxon_id

Note on `canonical_name` removal: it is the sole text identifier for unidentified rows
(NULL taxon_id) and the join key for taxon→name resolution. It cannot be dropped until
every occurrence row that needs a name has a non-null taxon_id, which is not achievable
for the ~21k truly-unidentified Ecdysis specimens. Keep `canonical_name` in the contract.

### geo_blob Column Layout (load-bearing for frontend)

`sqlite_export.py` pre-serializes this fixed column list into `geo_blob.data`:
```
[lat, lon, ecdysis_id, observation_id, specimen_observation_id,
 year, scientificName, genus, family, source]
```
`features.ts._buildGeoJSONFromRaw` reads these by positional index (row[6]=scientificName,
row[7]=genus, row[8]=family). These columns are used to:
1. Build `taxaOptions` (family/genus/species Set deduplication → autocomplete)
2. Build the GeoJSON features array with `occId` and `recencyTier`

When `genus` and `family` are dropped from `occurrences`, this column list must change.
The geo_blob is the tightest coupling point between the pipeline column contract and the
frontend — it is not validated by TypeScript types, only by positional array access.

### Current Filter Execution Path

```
User selects taxon → FilterState.{taxonName, taxonRank}
    ↓ buildFilterSQL (filter.ts)
SQL WHERE clause:
    family = 'Halictidae'          (taxonRank='family')
    genus = 'Bombus'               (taxonRank='genus')
    scientificName = 'Bombus griseocollis'  (taxonRank='species')
    ↓ sqlite3.exec on occurrences table in MemoryVFS
Set<occId>  →  Mapbox style callback Set.has()
```

The `buildFilterSQL` taxon branch (filter.ts lines 232-240) directly uses the string columns
`family`, `genus`, `scientificName`. All three must be replaced by taxon_id-keyed descendant
queries against a hierarchy table to unlock sub-family/tribe/subgenus filtering.

---

## The New Taxon Hierarchy: What It Is and Where It Lives

### Structure Decision: Closure Table in occurrences.db

A closure table (one row per ancestor-descendant pair) is the correct structure for this
architecture because:

1. **wa-sqlite queries are SQL without recursive CTEs.** SQLite supports `WITH RECURSIVE`
   but it requires wa-sqlite's exec path to run multi-statement queries, and performance
   is unpredictable in WASM at ~92k occurrence rows × recursive traversal. A closure table
   converts `"all descendants of Bombus"` into a single `SELECT taxon_id FROM taxon_closure
   WHERE ancestor_id = 559244` — one non-recursive JOIN.

2. **The hierarchy is static per pipeline run.** There is no insert/update workload at
   runtime. Closure tables are expensive to maintain dynamically but trivially built at
   pipeline time.

3. **The hierarchy is small.** Active Anthophila = ~20k taxa at most. Closure table at
   depth ≤ 8 levels = at most ~160k rows. At species level, most taxa have ≤ 6 ancestors
   in the family→subfamily→tribe→genus→subgenus→species chain. Total rows well under 500k.
   This fits easily in the MemoryVFS alongside the ~92k occurrence rows.

4. **Bycatch (non-bee aculeates) must be representable.** The hierarchy covers all taxa
   referenced by `taxon_id` in occurrences — not just Anthophila. Bycatch genera need name
   resolution but get no browse tree or pages. The closure table includes bycatch rows
   transparently; the bee-only presentation filter (`WHERE is_anthophila`) is applied at
   the query layer, not the table layer.

### Closure Table Schema

```sql
-- taxon_hierarchy: one row per taxon (name + rank metadata, keyed by taxon_id)
CREATE TABLE taxon_hierarchy (
    taxon_id     INTEGER PRIMARY KEY,
    name         TEXT NOT NULL,       -- canonical name at this rank (e.g. "Bombus", "griseocollis")
    rank         TEXT NOT NULL,       -- 'family'|'subfamily'|'tribe'|'genus'|'subgenus'|'species'
    parent_id    INTEGER,             -- NULL for family-level (top of our hierarchy)
    is_anthophila INTEGER NOT NULL    -- 1 if within Anthophila clade, 0 for bycatch
);

-- taxon_closure: one row per (ancestor, descendant) pair including self-pairs
CREATE TABLE taxon_closure (
    ancestor_id   INTEGER NOT NULL,
    descendant_id INTEGER NOT NULL,
    depth         INTEGER NOT NULL    -- 0 = self, 1 = direct child, etc.
);
CREATE INDEX tc_ancestor ON taxon_closure(ancestor_id);
CREATE INDEX tc_descendant ON taxon_closure(descendant_id);
```

The self-pairs (depth=0) allow uniform queries: `WHERE ancestor_id = X` always returns
X itself plus all descendants, making "show me all Bombus occurrences" and "show me all
Apidae occurrences" use the same SQL pattern.

### Where the Hierarchy Lives: Inside occurrences.db (not a separate file)

The hierarchy ships as additional tables inside `occurrences.db`, not as a separate
Parquet or SQLite artifact. Reasons:

1. **Single fetch.** The worker already fetches `occurrences.db` in full before seeding
   MemoryVFS. A second SQLite file means a second fetch, a second MemoryVFS entry, and
   a second open_v2 call. The hierarchy (~500k rows) adds modest size vs. the existing
   occurrence data.

2. **Same SQLite session.** Closure table queries and occurrence queries JOIN in the same
   `sqlite3.exec` call. No cross-file JOIN plumbing needed.

3. **Single pipeline artifact.** `sqlite_export.py` already produces `occurrences.db`.
   Extending it to populate `taxon_hierarchy` + `taxon_closure` is one additional step
   in the same DuckDB→SQLite export, not a new artifact in the pipeline.

4. **Consistent with geo_blob pattern.** The precedent of pre-computing derived tables
   inside occurrences.db (geo_blob) is already established. Hierarchy tables follow
   the same pattern.

### What Does NOT Ship in occurrences.db

- The full `taxa.csv.gz` dump (460k+ taxa). Only taxa that appear as `taxon_id` values
  in the occurrences table, plus their ancestors up to family, enter `taxon_hierarchy`.
- Species pages' display data (occurrence counts, month histograms). That stays in
  `species.parquet` / `species.json`.

---

## Full Data Flow: Pipeline to Frontend

### Pipeline DAG (new + modified components)

```
taxa.csv.gz (already downloaded by taxa-download step)
    │
    ├─→ [EXISTING] taxa_pipeline.load_taxon_lineage_extended
    │       → inaturalist_data.taxon_lineage_extended
    │         (taxon_id, family, subfamily, tribe, genus, subgenus — Anthophila only)
    │
    ├─→ [EXISTING] stg_inat__genus_taxon_ids (dbt VIEW)
    │       → genus_name → taxon_id for Animalia (bycatch coverage)
    │
    ├─→ [MODIFIED] int_combined.sql
    │       DROP from SELECT list: genus, family, scientificName,
    │                             specimen_inat_taxon_name, specimen_inat_genus,
    │                             specimen_inat_family
    │       KEEP: taxon_id (already present), canonical_name (keep — see note above)
    │
    ├─→ [MODIFIED] marts/occurrences.sql + schema.yml
    │       New smaller contract: ~29 columns (37 minus 7 dropped + 1 added canonical_name is kept)
    │       Drop genus, family, scientificName, specimen_inat_taxon_name,
    │            specimen_inat_genus, specimen_inat_family from contract
    │
    ├─→ [MODIFIED] sqlite_export.py
    │       After writing occurrences table, populate taxon_hierarchy + taxon_closure:
    │       1. Extract distinct taxon_ids from occurrences table
    │       2. Read taxa.csv.gz via DuckDB to resolve name/rank/parent chain
    │          for each referenced taxon_id + ancestors up to family
    │       3. INSERT into taxon_hierarchy
    │       4. Compute closure table from parent_id chain
    │       5. INSERT into taxon_closure + CREATE INDEX
    │       6. Update geo_blob column list (drop genus/family, add taxon_id)
    │
    └─→ [EXISTING] species_export.py (unchanged contract)
            Uses species.parquet from dbt sandbox; taxon_id already present
            higher_rank_taxon_ids.json: still valid (genus/subgenus/tribe → taxon_id by name)

ARTIFACT: occurrences.db (extended with taxon_hierarchy + taxon_closure tables)
    ↓ nightly.sh S3 upload
    ↓ CloudFront
ARTIFACT: occurrences.parquet (new smaller schema, ~8 fewer columns)
    ↓ nightly.sh S3 upload
    ↓ CloudFront
```

### geo_blob Rewrite (load-bearing change)

The current geo_blob column list is hardcoded in `sqlite_export.py` (`_GEO_COLS`) and
read by positional index in `features.ts._buildGeoJSONFromRaw`. This must change:

Old `_GEO_COLS`:
```python
["lat", "lon", "ecdysis_id", "observation_id", "specimen_observation_id",
 "year", "scientificName", "genus", "family", "source"]
```

New `_GEO_COLS` (after dropping string columns):
```python
["lat", "lon", "ecdysis_id", "observation_id", "specimen_observation_id",
 "year", "taxon_id", "source"]
```

Correspondingly, `features.ts._buildGeoJSONFromRaw` loses the genus/family/species Set
population logic. `taxaOptions` can no longer be built from the geo_blob (which only has
`taxon_id`, not names). Instead, `taxaOptions` for the autocomplete must be built from
a separate query against `taxon_hierarchy` after the DB loads:

```typescript
// New: build taxaOptions from taxon_hierarchy table (bee taxa only)
SELECT taxon_id, name, rank FROM taxon_hierarchy WHERE is_anthophila = 1
```

This also resolves the v4.6 requirement to extend autocomplete to subfamily/tribe/subgenus
(previously impossible because those ranks had no columns in occurrences).

### Runtime Name Resolution: taxon_id → name

When an occurrence row is displayed in the pane/table/detail card, its taxon name must
be resolved. Currently names come from `genus`, `family`, `scientificName` columns on the
occurrence row itself. After the column drop, name resolution requires:

```sql
SELECT name, rank FROM taxon_hierarchy WHERE taxon_id = ?
```

This is a single-row lookup on an indexed PK. The resolved name should be cached in a
`Map<number, {name: string, rank: string}>` in the frontend rather than re-queried per
row. Loading strategy:

1. At DB open time, execute `SELECT taxon_id, name, rank FROM taxon_hierarchy` once.
2. Store as `_taxonCache: Map<number, TaxonInfo>` in sqlite.ts or a new taxon.ts module.
3. All occurrence display code calls `_taxonCache.get(row.taxon_id)` instead of reading
   `row.genus` / `row.family` / `row.scientificName`.

The `OccurrenceRow` TypeScript interface in `filter.ts` must be updated to remove the
dropped columns and add `taxon_id: number | null`. The `OCCURRENCE_COLUMNS` constant
must similarly be updated.

**Name non-uniqueness constraint:** Names in `taxon_hierarchy` are rank-scoped
(e.g., "Bombus" appears as both a genus row and a subgenus row with different `taxon_id`
values). All lookups are keyed by `taxon_id`, never by name. The `taxon_id` on each
occurrence row is the authoritative disambiguation key — no name matching at runtime.

---

## Frontend Filtering: The Descendant Query Pattern

### Current Pattern (string column match)

```typescript
// filter.ts buildFilterSQL — current
if (f.taxonRank === 'genus') {
  occurrenceClauses.push(`genus = '${escaped}'`);
}
```

### New Pattern (closure table JOIN)

```typescript
// filter.ts buildFilterSQL — v4.6
if (f.taxonId !== null) {
  // All descendants of taxon_id (including itself) via closure table.
  // Self-pair (depth=0) means this covers exact matches too.
  occurrenceClauses.push(
    `taxon_id IN (SELECT descendant_id FROM taxon_closure WHERE ancestor_id = ${f.taxonId})`
  );
}
```

`FilterState` gains `taxonId: number | null` replacing `taxonName/taxonRank`.
The autocomplete resolves a user's text input to a `taxon_id` by querying `taxon_hierarchy`.
The `taxonRank` field is no longer needed for filtering (the closure handles all ranks).

The `taxonName` field may be kept for display purposes (the chip label), but the actual
filter predicate is always `taxon_id`-keyed. URL state (`taxon=` param) must migrate from
storing the text name + rank to storing `taxon_id` as an integer (with a fallback for
old URL round-trips that still have string names).

### Filter Race Guard (unchanged)

The existing `_filterQueryGeneration` counter in `bee-atlas.ts` applies unchanged. The
closure-table query is still async SQLite, so stale results must still be discarded.

---

## Page Generation: Hierarchy-Derived Rollups

### Current Pattern (string-column GROUP BY in species_export.py)

Species pages read `species.parquet` which carries denormalized `family`, `subfamily`,
`tribe`, `genus`, `subgenus` columns populated from `taxon_lineage_extended` JOIN in
`int_species_universe.sql`. Genus pages show all species in that genus by grouping on
the `genus` column.

### New Pattern (taxon_id GROUP BY against hierarchy)

After the column drop, `species.parquet` still carries `taxon_id` (species-level). The
species_export.py rollup for genus/tribe/subfamily pages must be recomputed by:

1. Looking up the ancestor taxon_id for each species via taxon_hierarchy parent chain
2. Grouping species by their ancestor taxon_id at the relevant rank

This means `int_species_universe.sql` must continue to emit the hierarchy rank names
(family, subfamily, tribe, genus, subgenus) for page generation — but these can come
from a JOIN to `taxon_lineage_extended` on `taxon_id` rather than from denormalized
columns in `int_combined`. The `species` mart keeps its current rank columns for the
page generator; they are just sourced differently.

**Key insight:** The `species` mart does NOT need to drop its rank columns — only the
`occurrences` mart drops denormalized strings. The `species` mart is for page generation
and species index, not for map point rendering. Its rank columns are still the cleanest
source for Eleventy templates.

New subfamily pages: `int_species_universe.sql` already provides `subfamily` from
`taxon_lineage_extended`. The Eleventy template generator needs a new grouping key for
subfamily, mirroring the existing tribe page pattern.

---

## Component Inventory: New vs. Modified

### Pipeline Layer

| Component | Status | Change Description |
|-----------|--------|--------------------|
| `data/taxa_pipeline.py` | UNCHANGED | No change needed; hierarchy built from taxa.csv.gz in sqlite_export step |
| `data/sqlite_export.py` | MODIFIED | Add `_build_taxon_hierarchy` function: extract referenced taxon_ids, resolve lineage from taxa.csv.gz, write `taxon_hierarchy` + `taxon_closure` + indexes to occurrences.db. Update `_GEO_COLS` to drop genus/family/scientificName, add taxon_id |
| `data/dbt/models/intermediate/int_combined.sql` | MODIFIED | Remove `genus`, `family`, `scientificName`, `specimen_inat_taxon_name`, `specimen_inat_genus`, `specimen_inat_family` from each ARM's SELECT list |
| `data/dbt/models/marts/occurrences.sql` | UNCHANGED (or trivially modified) | If occurrences.sql merely SELECTs `*` from int_combined + spatial columns, the dropped columns vanish automatically; update if there's an explicit SELECT list |
| `data/dbt/models/marts/schema.yml` | MODIFIED | Remove dropped columns from occurrences contract; update column count. Species mart contract UNCHANGED |
| `data/dbt/models/intermediate/int_species_universe.sql` | UNCHANGED | Keeps all rank columns for page generation; already gets them from taxon_lineage_extended JOIN |
| `data/species_export.py` | MODIFIED | Extend to generate new subfamily grouping data; update `higher_rank_taxon_ids.json` if needed |
| `data/run.py` | UNCHANGED | STEPS list order unchanged; sqlite_export already runs as "generate-sqlite" |

### Frontend Layer

| Component | Status | Change Description |
|-----------|--------|--------------------|
| `src/filter.ts` | MODIFIED | `FilterState`: replace `taxonName/taxonRank` with `taxonId: number \| null`, keep `taxonName` for display label only. `buildFilterSQL`: replace string column matches with closure table subquery. `OccurrenceRow` interface: remove dropped columns, add `taxon_id`. `OCCURRENCE_COLUMNS`: update list |
| `src/features.ts` | MODIFIED | `_buildGeoJSONFromRaw`: update positional column layout; remove genus/family/species Set logic; taxaOptions now built from taxon_hierarchy query, not geo_blob |
| `src/sqlite.ts` | MODIFIED | Add `loadTaxonCache()` function (runs once after tablesReady, queries taxon_hierarchy, returns `Map<number, TaxonInfo>`). Export the cache or a lookup function |
| `src/sqlite-worker.ts` | UNCHANGED | Worker just executes SQL; no worker-level changes for hierarchy |
| `src/bee-atlas.ts` | MODIFIED | On data loaded: build taxaOptions from taxon_hierarchy query. Replace taxonName/taxonRank filter state with taxonId. URL state: migrate `taxon=` param from name+rank to taxon_id integer |
| `src/bee-filter-controls.ts` | MODIFIED | Autocomplete queries taxon_hierarchy for matches; selection emits taxon_id. Chip display uses resolved name from taxon cache |
| `src/url-state.ts` | MODIFIED | `taxon=` param: encode as integer taxon_id (e.g. `taxon=559244`). Add backward-compatible parse for old name-format URLs |
| `src/bee-pane.ts` or occurrence detail components | MODIFIED | Name display: `taxonCache.get(row.taxon_id)?.name` instead of `row.genus` / `row.scientificName` |
| `src/occurrence.ts` | UNCHANGED | ID construction/parsing unaffected |

### Eleventy/Page Generation Layer

| Component | Status | Change Description |
|-----------|--------|--------------------|
| `_data/species.js` | UNCHANGED | Reads species.json which still has rank name columns |
| Genus/tribe/subgenus Eleventy templates | UNCHANGED | Still driven by rank name columns from species.json |
| Subfamily Eleventy templates | NEW | New template at `/species/subfamily/{SubfamilyName}/` mirroring tribe template pattern |
| `data/species_maps.py` | MODIFIED | Add subfamily map generation (same multi-color SVG pattern as tribe maps) |

---

## Build Order (Dependency-Respecting Sequence)

```
Phase A: Foundation — hierarchy structure in the pipeline
  1. Extend sqlite_export.py with _build_taxon_hierarchy + _build_taxon_closure
     (reads taxa.csv.gz via DuckDB after occurrences table is written)
  2. Update _GEO_COLS in sqlite_export.py (taxon_id replaces genus/family/scientificName)
  3. Verify occurrences.db now contains taxon_hierarchy + taxon_closure + updated geo_blob
  4. Add pytest tests: hierarchy table exists, closure self-pairs correct, bycatch in hierarchy

Phase B: Occurrences contract normalization — pipeline side
  5. Modify int_combined.sql: remove 7 denormalized string columns from all 3 ARMs
  6. Update marts/schema.yml: remove those columns from enforced contract
  7. Run dbt build — verify contract passes with smaller column count
  8. Verify occurrences.parquet schema (parquet-tools / pytest)
  9. Verify occurrences.db occurrences table matches new schema

Phase C: Frontend cutover — filter + name resolution
  10. Update OccurrenceRow interface in filter.ts (remove dropped columns, add taxon_id)
  11. Update OCCURRENCE_COLUMNS constant in filter.ts
  12. Add taxonId: number | null to FilterState; keep taxonName for chip display label
  13. Rewrite buildFilterSQL taxon branch to use closure table subquery
  14. Update features.ts _buildGeoJSONFromRaw column layout
  15. Add loadTaxonCache() to sqlite.ts; populate Map<number, TaxonInfo>
  16. Update bee-atlas.ts: taxaOptions from taxon_hierarchy query; taxon filter state
  17. Update bee-filter-controls.ts: autocomplete against taxon_hierarchy
  18. Update url-state.ts: taxon_id integer encoding + backward-compat parse
  19. Update occurrence display components: name from taxon cache
  20. Vitest: filter SQL generation, taxon cache lookup, url-state round-trip

Phase D: Page rebuild — hierarchy-based rollups
  21. Add subfamily grouping to species_export.py / int_species_universe.sql
  22. Add subfamily page template + Eleventy pagination
  23. Add subfamily map generation to species_maps.py
  24. Verify genus/tribe/subgenus page totals match pre-normalization values
  25. New: subfamily pages render correctly

Phase E: Browse tree — bee-only expandable tree
  26. New frontend component: `<bee-species-tree>` reading taxon_hierarchy (is_anthophila=1)
  27. Default expand to family → genus → species
  28. Lazy-expand subfamily/tribe/subgenus on click
  29. Per-node occurrence/specimen split (JOIN closure table → occurrences)
  30. Type-to-filter auto-expand
  31. Checklist-only nodes (occurrence_count = 0 but species has checklist entry)
```

**Dependency rationale:**
- Phase A must precede Phase C (frontend needs the tables in the DB to query)
- Phase B must precede Phase C (OccurrenceRow interface must match actual columns)
- Phase B can run in parallel with Phase A (different files, same pipeline run)
- Phase D can begin as soon as Phase B completes (species mart unchanged; uses existing rank columns)
- Phase E requires Phase C (tree uses closure table; shares filter infrastructure)
- Phases A+B together constitute one deployable pipeline change; Phase C is the frontend cutover

---

## Key Architectural Decisions

**Closure table in occurrences.db, not a separate artifact.** Single fetch, same SQLite
session for all queries, consistent with the geo_blob pre-computation pattern already
established in v4.3. The hierarchy is static per pipeline run; closure table build cost
is acceptable at export time.

**`taxon_hierarchy` contains ALL taxa referenced by occurrences (bees + bycatch), not just
Anthophila.** Bycatch genera need name resolution after genus/family columns drop. The
`is_anthophila` flag gates tree/autocomplete presentation without requiring separate tables.

**`canonical_name` stays in the occurrences contract.** It is the display fallback for
~21k unidentified Ecdysis specimens (NULL taxon_id) and the synonym resolution join key.
Removing it would require a new display strategy for the unidentified rows.

**`species` mart keeps rank name columns.** Only the `occurrences` mart drops denormalized
strings. The species mart feeds Eleventy page generation which legitimately needs rank
name strings (family, subfamily, tribe, genus, subgenus). Dropping them from the species
mart would require restructuring all page templates for no payload benefit (species.json
is not a runtime-loaded artifact; it's consumed at build time by Eleventy).

**geo_blob column list change is a load-bearing pipeline↔frontend contract.** The positional
array layout in `_buildGeoJSONFromRaw` is not TypeScript-typed. The change must be applied
atomically: update `_GEO_COLS` in `sqlite_export.py` and `_buildGeoJSONFromRaw` column
positions in `features.ts` in the same deployment. A mismatch produces silent data
corruption (wrong values in wrong positions), not a thrown error.

**taxaOptions built from taxon_hierarchy, not geo_blob.** The geo_blob only has taxon_id
after the column drop; names must come from the hierarchy table. This change also unlocks
subfamily/tribe/subgenus in the autocomplete for free (all ranks present in taxon_hierarchy
with is_anthophila=1).

**URL param `taxon=` migrates from name string to integer taxon_id.** Old URLs with
name-format params should be parsed with a fallback that queries taxon_hierarchy by name
to resolve the id. This avoids breaking bookmarked URLs from before v4.6.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Separate hierarchy SQLite file

**What people do:** Write `taxonomy.db` as a separate SQLite artifact, fetch it in the
worker alongside `occurrences.db`, and maintain two open_v2 connections.

**Why it's wrong:** Doubles the fetch count and WASM setup cost. Cross-file JOINs in
wa-sqlite require ATTACH, which adds complexity. The hierarchy is small enough to embed
in the existing DB.

**Do this instead:** Add `taxon_hierarchy` and `taxon_closure` tables to `occurrences.db`
inside `sqlite_export.py`.

### Anti-Pattern 2: Building the hierarchy in a new dbt model

**What people do:** Create `marts/taxon_hierarchy.sql` as an external parquet, then write
a separate Python step to convert it to SQLite tables.

**Why it's wrong:** The hierarchy's natural home is the SQLite DB where it will be queried.
A Parquet intermediate adds a conversion step with no benefit. The hierarchy is a derivative
of `taxa.csv.gz` + the set of taxon_ids actually in `occurrences` — exactly what
`sqlite_export.py` knows at export time.

**Do this instead:** Build the hierarchy inside `sqlite_export.py` after the occurrences
table is written, using a fresh DuckDB connection to read `taxa.csv.gz`.

### Anti-Pattern 3: Filtering by taxon name in the closure query

**What people do:** Query `SELECT descendant_id FROM taxon_closure tc JOIN taxon_hierarchy th
ON th.taxon_id = tc.ancestor_id WHERE th.name = 'Bombus'`.

**Why it's wrong:** Name is not unique within a kingdom. "Bombus" as a genus and as a
subgenus have different taxon_ids. Querying by name can return the wrong ancestor_id
or multiple rows, producing wrong results for subgenus-named-like-genus cases.

**Do this instead:** The autocomplete always resolves to a `taxon_id` before the filter
is applied. The closure query uses only integer IDs: `WHERE ancestor_id = 559244`.

### Anti-Pattern 4: Removing `canonical_name` from occurrences

**What people do:** Drop `canonical_name` along with `genus`, `family`, `scientificName`
to maximize the column count reduction.

**Why it's wrong:** ~21k Ecdysis specimens are genuinely unidentified (NULL taxon_id).
With no `canonical_name` and no `taxon_id`, these rows have no textual taxon reference at
all. The occurrence detail card would display nothing for "species". Additionally,
`canonical_name` is the join key used by `int_synonyms` and `int_combined` for synonym
resolution — removing it from the output would break downstream model references.

**Do this instead:** Keep `canonical_name`. Drop only the columns that are fully superseded
by `taxon_id` for identified rows: `genus`, `family`, `scientificName`,
`specimen_inat_taxon_name`, `specimen_inat_genus`, `specimen_inat_family`.

### Anti-Pattern 5: Migrating taxaOptions population to a SQLite-worker `tables-ready` message

**What people do:** Pre-compute taxaOptions inside the SQLite worker and send them as part
of the `tables-ready` message, so the main thread has them immediately.

**Why it's wrong:** The worker already has a fixed boot sequence; adding another async
DuckDB query to the boot path increases the tablesReady latency (the v4.3 win was reducing
this from 930ms to 250ms). taxaOptions don't need to be ready at tablesReady — they're
needed when the user opens the autocomplete.

**Do this instead:** Query `taxon_hierarchy` lazily, the first time the user focuses the
taxon autocomplete, and cache the result. Or query it as a non-blocking background task
after tablesReady resolves.

---

## Integration Points Summary

| Boundary | Left Side | Right Side | Contract |
|----------|-----------|------------|----------|
| sqlite_export.py → occurrences.db | Python writes tables | wa-sqlite worker reads | Table names: `occurrences`, `geo_blob`, `taxon_hierarchy`, `taxon_closure`. Indexes on closure. |
| occurrences.db → features.ts | geo_blob data TEXT | _buildGeoJSONFromRaw positional | Column order in `_GEO_COLS` must match positional index constants in features.ts |
| filter.ts → occurrences table | SQL WHERE clause | SQLite occurrences schema | Column names in WHERE must exist in occurrences table |
| filter.ts → taxon_closure table | SQL subquery | SQLite taxon_closure schema | `ancestor_id`, `descendant_id` column names |
| int_combined → occurrences contract | dbt SELECT list | schema.yml enforced contract | Column names and types must match exactly |
| url-state.ts → FilterState | taxon param | taxonId integer | taxon_id integer encoding; backward-compat for old name+rank URLs |
| taxon_hierarchy → bee-atlas taxaOptions | is_anthophila=1 query | autocomplete suggestions | Rows are rank-named, keyed by taxon_id; names displayed but never used as filter keys |

---

*Architecture research for: BeeAtlas v4.6 Taxonomy Hierarchy & Normalization*
*Researched: 2026-06-01*
