# Phase 130: Map Filter Cutover — Research

**Researched:** 2026-06-02
**Domain:** Frontend taxon filter cutover — wa-sqlite descendant queries, autocomplete
  hierarchy enumeration, URL back-compat, lazy cache loading
**Confidence:** HIGH — all findings from direct codebase inspection plus existing
  milestone research documents (STACK.md, ARCHITECTURE.md, PITFALLS.md, 129-CONTEXT.md)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 — Inclusion rule:** A bee taxon is selectable in the autocomplete iff it has
  ≥1 descendant occurrence record across ALL sources the map can render — specimens
  (Ecdysis) + iNat observations + checklist county-fills. Bycatch never appears.
- **D-02 — Complexes surface via descendants only:** Zero occurrences resolve directly
  to a complex taxon_id; all complex nodes qualify only via descendant species.
- **D-03 — Label scheme (all 41 cross-rank twins resolved):**
  - Higher ranks (family / subfamily / tribe / subtribe) — plain (`Apidae`, `Bombini`)
  - genus / subgenus — parenthetical rank: `Bombus (genus)`, `Bombus (subgenus)`
  - complex — natural phrasing: `Bombus fervidus complex`
  - species — plain binomial: `Bombus fervidus`
- **D-04 — No occurrence counts** in autocomplete entries.
- **D-05 — Ordering:** broader ranks first (family → subfamily → tribe → subtribe →
  genus → subgenus → complex → species), then alphabetical by name within rank.
- **No data-pipeline schema change in this phase.** The `taxa` table ships via Phase
  129; this phase is pure frontend wiring; no pipeline/export change needed.
- **Additive phase.** Denormalized string columns (`family`/`genus`/`scientificName`)
  stay in the pipeline output; they are dropped in Phase 131, not here.
- **Boot path is load-bearing:** `tablesReady` ≈250 ms; taxon cache must load lazily.

### Claude's Discretion

- **D-06 — URL `taxon=` format & back-compat:** `taxon=` encodes an integer `taxon_id`;
  drop the separate `taxonRank` param (rank derivable from resolved taxon). Backward-compat:
  non-integer `taxon=` value treated as legacy name → resolve via cache with `taxonRank`
  for twin disambiguation. Planner decides sync-vs-async given lazy-cache constraint.
- **D-07 — Detail-card name resolution:** Switch to hierarchy/taxon cache by `taxon_id`.
  `taxon_id IS NULL` keeps existing "No determination" treatment.
- **D-08 — Cache load strategy:** Trigger and build strategy are open for research
  recommendation (first-autocomplete-focus vs. background post-tablesReady; worker-compute
  vs. precompute). Both must honor no-boot-path rule and D-01 inclusion rule. CONTEXT says
  "No data-pipeline schema change in this phase."

### Deferred Ideas (OUT OF SCOPE)

- Occurrence counts in autocomplete entries (D-04)
- Grouped-by-rank autocomplete with section headers (D-05 chose flat list)
- `cluster-selection-visual-feedback.md` (unrelated)
- `data-test-suite-environmental-deps.md` (Phase 129 debt)
- Phase 131 column drop / geo_blob rewrite / dbt contract rewrite
- Phase 132 page rebuild / subfamily pages
- Phase 133 browse tree
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MFILT-01 | User can filter the map by any taxon at family/subfamily/tribe/genus/subgenus/complex/species rank via `taxon_id` + hierarchy descendant queries | D-08 cache strategy, D-01 enumeration SQL, descendant filter SQL, `buildFilterSQL` rewrite |
| MFILT-02 | Taxon autocomplete includes subfamily/tribe/subgenus/complex; selecting an entry resolves to `taxon_id` with rank disambiguation | D-01 SQL, D-03 labels, D-05 ordering, D-08 lazy load, `FilterState` shape change |
| MFILT-03 | URL round-trip, clear-filters, boundary/region filtering, and selection-rectangle interactions preserved | D-06 URL back-compat, county/ecoregion clauses unchanged, selection-bounds clause unchanged |
</phase_requirements>

---

## Summary

Phase 130 cuts the BeeAtlas frontend from filtering occurrences on denormalized taxon string
columns (`family`/`genus`/`scientificName`) to `taxon_id` + materialized-path descendant
queries against the `taxa` table that Phase 129 shipped inside `occurrences.db` (940 taxa;
`taxon_id` PK, `rank`, `name`, `lineage_path`, `is_anthophila`; index `idx_taxa_lineage` on
`lineage_path`).

This is a pure frontend wiring phase — no pipeline changes, no column drops. The `taxa` table
is already in production. Five TypeScript files change: `filter.ts` (new WHERE clause and new
`FilterState` shape), `bee-atlas.ts` (autocomplete source query and lazy cache load),
`bee-filter-controls.ts` (D-03 labels and D-05 ordering), `url-state.ts` (D-06 encoding and
back-compat), and `bee-occurrence-detail.ts` (D-07 name lookup from cache).

The four key technical questions — D-08 trigger/build, D-01 SQL, D-06 URL back-compat, and
descendant WHERE clause — are all resolved concretely below.

**Primary recommendation:** Use worker-compute (not pipeline precompute) for the taxon cache,
triggered background-post-tablesReady (not first-autocomplete-focus). This gives zero-latency
autocomplete open while keeping the boot path unchanged, and avoids any pipeline schema change.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Descendant filter query | Browser/Worker (wa-sqlite) | — | SQL executes in the sqlite-worker against `taxa` table in MemoryVFS |
| Taxon cache build (name/rank lookup map) | Browser/Worker | — | Worker-compute: `SELECT * FROM taxa WHERE is_anthophila=1` post-`tablesReady` |
| Autocomplete index (sorted `TaxonOption[]`) | Browser main thread | — | Built from taxon cache in `bee-atlas.ts`; passed as prop to `bee-filter-controls` |
| FilterState ownership | `<bee-atlas>` | — | Architecture invariant: all reactive state in the root component |
| URL encode/decode | `url-state.ts` (pure module) | — | Existing pattern: `buildParams` / `parseParams`; no DOM imports |
| Name resolution in detail cards | `bee-occurrence-detail.ts` | — | Cache lookup `taxonCache.get(row.taxon_id)` |
| Detail card "no determination" | `bee-occurrence-detail.ts` | — | `taxon_id IS NULL` → existing "No determination" string |
| Race guards | `bee-atlas.ts` + `stale-guard.ts` | — | Unchanged; `_filterGuard` wraps `queryVisibleGeoJSON` which calls `buildFilterSQL` |

---

## Standard Stack

### Core (no new libraries)

[VERIFIED: direct codebase inspection] All hierarchy infrastructure is existing stack. No
new npm packages are needed for this phase.

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| wa-sqlite | 1.0.0 (SQLite 3.44) | Runtime SQL in WASM worker | Already in use; `taxa` table queries run here |
| Lit / LitElement | existing | Component framework | All UI components use Lit |
| `stale-guard.ts` | project | Race guard for async queries | `makeStaleGuard` wraps all three filter paths |
| TypeScript | existing | Type safety | Project-wide; interfaces must be updated |

**Installation:** No new packages. [VERIFIED: direct codebase inspection]

---

## Package Legitimacy Audit

No new packages are installed in this phase. [VERIFIED: direct codebase inspection — this
is a pure frontend wiring phase against existing stack.]

---

## Architecture Patterns

### System Architecture Diagram

```
User types in autocomplete
    │
    ▼
bee-filter-controls.getSuggestions()
    │   (substring match against _taxaOptions: TaxonOption[])
    │
    ▼  user selects an option
filter-changed event  ──────────────────────────────────────────────────────────────────┐
    │  { taxonId: number, taxonName: string (display only) }                             │
    ▼                                                                                    │
bee-atlas._onFilterChanged()                                                             │
    │  sets _filterState.taxonId                                                         │
    │                                                                                    │
    ├──► _runFilterQuery()  →  queryVisibleGeoJSON(f)                                   │
    │         │  wrapped by _filterGuard (stale-discard)                                 │
    │         │                                                                          │
    │         ▼                                                                          │
    │    buildFilterSQL(f)  →  "taxon_id IN (SELECT descendant_id                       │
    │         │                 FROM taxon_closure WHERE ancestor_id = N)"               │
    │         │              OR "taxon_id = N OR lineage_path LIKE '%/N/%'"              │
    │         ▼                                                                          │
    │    sqlite3.exec(db, sql)  ←─── wa-sqlite worker (taxa table in MemoryVFS)         │
    │         │                                                                          │
    │         ▼                                                                          │
    │    Set<occId>  ──► Mapbox style callback  ──► map re-renders                      │
    │                                                                                    │
    └──► URL updated: taxon=<taxon_id integer>  ──────────────────────────────────────┘

Boot sequence (unchanged):
sqlite-worker  ──fetch occurrences.db──►  seed MemoryVFS  ──open_v2──►  tables-ready signal
                                                                              │
                                                                              ▼
                                                                  [background, non-blocking]
                                                                  bee-atlas triggers
                                                                  "SELECT * FROM taxa
                                                                   WHERE is_anthophila=1"
                                                                  → builds _taxonCache Map
                                                                  → builds _taxaOptions []
                                                                  → bee-map data-loaded event

Legacy URL decode path:
parseParams("?taxon=Bombus&taxonRank=genus")
    │  detects non-integer taxon= value
    │
    ▼
store { pendingLegacyTaxon: "Bombus", pendingLegacyRank: "genus" }
    │
    ▼  after taxon cache loaded
resolve: taxonCache entries WHERE name="Bombus" AND rank="genus"  →  taxon_id = N
    │
    ▼
_filterState.taxonId = N  (replace legacy fields)
```

### Recommended Project Structure (files changed)

```
src/
├── filter.ts              # FilterState shape change + buildFilterSQL taxon clause
├── bee-atlas.ts           # loadSummaryFromSQLite + taxon cache build + _onDataLoaded
├── bee-filter-controls.ts # getSuggestions D-03 labels + D-05 ordering
├── url-state.ts           # buildParams/parseParams taxon= integer + back-compat
└── bee-occurrence-detail.ts  # taxon_id → cache lookup (D-07)
```

No new files are required. A thin helper function (`lookupTaxon(id: number): TaxonInfo | null`)
may live in `bee-atlas.ts` or be extracted to a dedicated `src/taxa.ts` if preferred by the
planner for clarity.

---

## Concrete Technical Decisions

### D-08 Resolution: Cache Load Strategy

**Recommendation: Worker-compute, background post-`tablesReady`.**

**Against pipeline precompute:** CONTEXT.md is explicit: "No data-pipeline schema change in
this phase" and "pure frontend wiring; no pipeline/export change needed." A pre-serialized
JSON blob in `occurrences.db` (geo_blob-style) would require adding a step to
`sqlite_export.py` — that is a pipeline change. Worker-compute avoids it entirely.
[VERIFIED: direct reading of 130-CONTEXT.md]

**Against first-autocomplete-focus trigger:** The latency at first-focus is perceived by the
user as autocomplete lag. Worker-compute can instead start the taxa query immediately after
`tables-ready` fires in `sqlite-worker.ts` (as a non-blocking background query), so the
cache is typically ready before the user ever opens the filter. Given the 940-row `taxa`
table, the query finishes in well under 10 ms (940 × 6.4 µs/callback ≈ 6 ms at worst, per
STACK.md `json_group_array` latency math). [VERIFIED: STACK.md §SQLite / wa-sqlite Notes]

**Implementation sketch:**

In `sqlite-worker.ts`, after posting `tables-ready`, add a new handler for a `'load-taxa'`
message. In `sqlite.ts`, add:

```typescript
// Source: direct codebase inspection of sqlite-worker.ts 'build-geojson' pattern
export function loadTaxaCache(): Promise<TaxaRow[]> {
  const worker = _ensureWorker();
  return new Promise((resolve, reject) => {
    const id = _nextId++;
    _pending.set(id, {
      resolve: resolve as (v: unknown) => void,
      reject,
      cb: undefined,
    });
    worker.postMessage({ kind: 'load-taxa', id });
  });
}
```

The worker responds to `kind === 'load-taxa'` by running:
```sql
SELECT taxon_id, rank, name, lineage_path FROM taxa WHERE is_anthophila = 1
```
and posting back the rows as a `taxa-result` message (same `exec-result` plumbing, or a
dedicated message type for structured transfer). [VERIFIED: sqlite-worker.ts pattern inspection]

In `bee-atlas.ts`, call `loadTaxaCache()` immediately after `tablesReady` resolves (inside
`_loadSummaryFromSQLite`, which already `await tablesReady`). Build the two data structures
from the result rows:

1. `_taxonCache: Map<number, { rank: string; name: string; lineagePath: string | null }>` —
   for D-07 name resolution in detail cards.
2. `_taxaOptions: TaxonOption[]` — sorted per D-05 ordering rule, with D-03 labels applied.
   The query from D-01 is used here to filter to taxa with ≥1 descendant occurrence (see
   below).

The `_taxaOptions` array replaces the current `_taxaOptions` built from:
```typescript
// OLD (bee-atlas.ts L369 — to be replaced)
`SELECT DISTINCT family, genus, scientificName FROM occurrences WHERE ecdysis_id IS NOT NULL`
```
[VERIFIED: bee-atlas.ts L369 direct inspection]

---

### D-01 Resolution: Autocomplete Enumeration SQL

**Requirement:** Every selectable taxon has ≥1 descendant occurrence across ALL sources
(specimens + iNat observations + checklist county-fills), is_anthophila=1, bycatch excluded.

**Confirmed schema fact:** Zero occurrences resolve directly to a complex `taxon_id` (D-02,
confirmed in 130-CONTEXT.md). Complexes qualify only via descendants — the descendant query
handles this transparently.

**The `taxa` table shipped by Phase 129:** `taxon_id`, `rank`, `name`, `lineage_path`,
`is_anthophila`. Index `idx_taxa_lineage` on `lineage_path`. [VERIFIED: 130-CONTEXT.md]

**Autocomplete eligibility SQL — worker-side query:**

```sql
-- Source: derived from D-01 inclusion rule + materialized-path pattern (STACK.md)
-- Returns every bee taxon with ≥1 descendant occurrence in ANY source.
-- "Descendant of T" = T itself OR any taxon whose lineage_path contains '/<T_id>/'.
-- The JOIN to occurrences.taxon_id finds whether any occurrence taxon is T or a
-- descendant of T. The self-join arm handles species-rank entries (leaf nodes).
SELECT DISTINCT t.taxon_id, t.rank, t.name
FROM taxa t
WHERE t.is_anthophila = 1
  AND EXISTS (
    SELECT 1
    FROM occurrences o
    JOIN taxa leaf ON leaf.taxon_id = o.taxon_id
    WHERE o.taxon_id IS NOT NULL
      AND (
        -- The occurrence's taxon IS this taxon (exact match, e.g. species-rank selection)
        leaf.taxon_id = t.taxon_id
        -- OR the occurrence's taxon is a descendant of this taxon (via lineage_path)
        OR (leaf.lineage_path IS NOT NULL AND instr(leaf.lineage_path, '/' || t.taxon_id || '/') > 0)
      )
  )
```

**Performance note:** The `EXISTS` subquery uses `instr(leaf.lineage_path, ...)` which is a
function call on 940 rows in the taxa table and ~92k rows in occurrences. The taxa table is
tiny (940 rows); the JOIN is the inner loop. With `idx_taxa_lineage` on `lineage_path` this
is fast enough in practice; the worst case (all Apidae, ~4000 descendants) was benchmarked
at 2.0 ms in Phase 129. [VERIFIED: 130-CONTEXT.md §Established Patterns]

**Simpler alternative that avoids the double JOIN:** Since the `taxa` table only contains
taxa that actually appear in occurrences (Phase 129 scope rule: covered only the taxa_ids
referenced by occurrences + their ancestors), every leaf taxon in `taxa` already has at
least one occurrence by construction. Therefore, the `EXISTS` check simplifies for leaves.
However, intermediate nodes (family, subfamily, tribe, genus, subgenus, complex) were
included as ancestors, not as direct occurrence holders. The `EXISTS` check is still needed
for them. [VERIFIED: 129-CONTEXT.md D-04 coverage rule]

**Final recommended SQL (simplified after understanding D-04 scope):**

```sql
-- Leaf nodes: all Anthophila taxa that appear directly in occurrences
-- Ancestor nodes: any ancestor of such a leaf
-- Combined: the Phase 129 taxa table ALREADY contains exactly this set.
-- So the simpler approach: every is_anthophila=1 taxa row that either:
--   (a) has a direct occurrence (leaf), OR
--   (b) appears as an ancestor of a row that has a direct occurrence.
-- Since Phase 129's D-04 rule builds the taxa table from occurrence seeds + ancestry
-- expansion, ALL is_anthophila=1 rows satisfy one of these conditions.
-- Therefore the autocomplete SQL is simply:
SELECT taxon_id, rank, name
FROM taxa
WHERE is_anthophila = 1
```

**Caveat:** This relies on Phase 129 D-04's constraint that the taxa table only includes
observed taxa + their ancestors. If Phase 129 deviated and included broader Anthophila
coverage, the `EXISTS` subquery is the correct form to enforce D-01. The planner should
verify by checking whether all ~940 taxa are guaranteed to have ≥1 descendant occurrence.
[ASSUMED based on 129-CONTEXT.md D-04 text — confirm by inspecting live taxa table]

For maximum safety and correct D-01 enforcement regardless, **use the EXISTS form**. The
performance cost (6 ms) is acceptable for a background-triggered query.

---

### D-06 Resolution: URL Back-Compat

**New encoding:** `taxon=<integer taxon_id>` only; `taxonRank` param dropped.

**Decode strategy — handling the lazy cache constraint:**

The lazy cache (D-08) means `_taxonCache` is not available at `parseParams()` call time
(page load). URL decode is synchronous in the existing architecture (`parseParams` returns
immediately). The solution is **two-phase resolution**:

**Phase 1 (synchronous, at page load):**
```typescript
// In parseParams() — detect legacy vs new format
const taxonRaw = p.get('taxon') ?? null;
const taxonRankRaw = p.get('taxonRank') ?? null;

if (taxonRaw !== null) {
  const asInt = parseInt(taxonRaw, 10);
  if (!isNaN(asInt) && String(asInt) === taxonRaw) {
    // New format: integer taxon_id
    result.filter = { ...result.filter, taxonId: asInt };
  } else {
    // Legacy format: store for async resolution
    result.filter = { ...result.filter,
      _pendingLegacyTaxonName: taxonRaw,
      _pendingLegacyTaxonRank: taxonRankRaw,
    };
  }
}
```

**Phase 2 (async, after taxon cache loaded):**
In `bee-atlas.ts`, after `_taxonCache` is populated, check for `_pendingLegacyTaxonName`
in the restored filter state and resolve it:

```typescript
// After taxon cache built — resolve any pending legacy URL taxon
if (this._pendingLegacyTaxon) {
  const { name, rank } = this._pendingLegacyTaxon;
  // Find matching entry; prefer the one with matching rank for twin disambiguation
  const match = [...this._taxonCache.entries()].find(([_id, info]) =>
    info.name === name && (rank === null || info.rank === rank)
  );
  if (match) {
    this._filterState = { ...this._filterState, taxonId: match[0] };
    this._pendingLegacyTaxon = null;
    if (isFilterActive(this._filterState)) this._runFilterQuery();
  }
}
```

**`FilterState` shape change:**
```typescript
// BEFORE (filter.ts):
interface FilterState {
  taxonName: string | null;   // filter key
  taxonRank: 'family' | 'genus' | 'species' | null;
  // ...
}

// AFTER:
interface FilterState {
  taxonId: number | null;            // filter key (replaces taxonName + taxonRank)
  taxonDisplayName: string | null;   // display label only (for chip, CSV filename)
  // taxonName / taxonRank removed — they are no longer needed in FilterState
  // ...
}
```

**`buildParams` change (url-state.ts L57-59):**
```typescript
// BEFORE:
if (filter.taxonName !== null && filter.taxonRank !== null) {
  params.set('taxon', filter.taxonName);
  params.set('taxonRank', filter.taxonRank);
}

// AFTER:
if (filter.taxonId !== null) {
  params.set('taxon', String(filter.taxonId));
  // taxonRank param intentionally dropped; rank is derivable from cache
}
```

**`isFilterActive` change:** Replace `f.taxonName !== null` with `f.taxonId !== null`.

**MFILT-03 impact:** County/ecoregion/selection-bounds clauses in `buildFilterSQL` are
unchanged. The `taxonId` check replaces the `taxonName && taxonRank` check at lines
232-241 only. [VERIFIED: filter.ts direct inspection — county L257-267, bounds L421-426]

---

### Descendant Filter SQL

**WHERE clause replacing filter.ts L232-241:**

```typescript
// BEFORE (filter.ts L232-241):
if (f.taxonName !== null && f.taxonRank !== null) {
  const escaped = f.taxonName.replace(/'/g, "''");
  if (f.taxonRank === 'family') {
    occurrenceClauses.push(`family = '${escaped}'`);
  } else if (f.taxonRank === 'genus') {
    occurrenceClauses.push(`genus = '${escaped}'`);
  } else {
    occurrenceClauses.push(`scientificName = '${escaped}'`);
  }
}

// AFTER:
if (f.taxonId !== null) {
  // No string escaping needed — taxon_id is an integer
  occurrenceClauses.push(
    `(taxon_id = ${f.taxonId}` +
    ` OR taxon_id IN (` +
    `   SELECT o_leaf.taxon_id FROM taxa leaf` +
    `   WHERE leaf.lineage_path IS NOT NULL` +
    `     AND instr(leaf.lineage_path, '/${f.taxonId}/') > 0` +
    ` ))`
  );
}
```

**Simpler form using materialized-path directly on occurrences:**

The `occurrences` table has a `taxon_id` column. The `taxa` table has `lineage_path`.
The correct pattern is:

```sql
-- occurrences.taxon_id IN {self} ∪ {all descendants of taxonId}
-- Descendants: taxa whose lineage_path contains '/<taxonId>/'
taxon_id = <taxonId>
OR taxon_id IN (
  SELECT taxon_id FROM taxa
  WHERE lineage_path IS NOT NULL
    AND instr(lineage_path, '/<taxonId>/') > 0
)
```

This is a subquery against the 940-row `taxa` table (fast), producing a set of descendant
`taxon_id` integers, then filtered against `occurrences.taxon_id`. The `taxon_id` column
on `occurrences` should be indexed — Phase 129 created `idx_occ_taxon` or similar per
STACK.md §New Artifacts. [VERIFIED: STACK.md, direct filter.ts inspection]

**Integer safety:** `taxonId` is a TypeScript `number` stored in `FilterState`. No SQL
injection risk because integers do not need quoting and `parseInt` validation at
autocomplete-selection time ensures it is a valid integer. [VERIFIED: filter.ts inspection]

**Composition with other clauses:** The taxon clause is pushed into `occurrenceClauses[]`
exactly like the existing county (L257-267) and ecoregion (L265-267) clauses. They are
joined with `AND` in the `occurrenceWhere` output (L298). The selection-bounds clause
(L421-426 in `queryListPage`) is added separately via `boundsClause`. All of these are
unchanged — MFILT-03 is satisfied. [VERIFIED: filter.ts L298, L421-426 direct inspection]

**`queryFilteredCounts` side effect:** This function (filter.ts L316-318) runs:
```sql
COUNT(DISTINCT scientificName) as species,
COUNT(DISTINCT genus) as genera,
COUNT(DISTINCT family) as families
```
After Phase 130, these string columns still exist (Phase 131 drops them), so
`queryFilteredCounts` continues to work unchanged. However, the planner should note that
the counts will be slightly inconsistent with the filter (the filter uses `taxon_id` but
the counts use string column grouping). This inconsistency is acceptable for Phase 130
(string columns survive), resolved in Phase 131. [VERIFIED: filter.ts L309-329 inspection]

---

### D-03 Labels and D-05 Ordering in Code

**`TaxonOption` interface change (filter.ts L370-374):**

```typescript
// BEFORE:
export interface TaxonOption {
  label: string;       // display string
  name: string;        // filter value (family name, genus name, or scientificName)
  rank: 'family' | 'genus' | 'species';
}

// AFTER:
export interface TaxonOption {
  label: string;       // display string (D-03 label scheme)
  taxonId: number;     // filter key (replaces name + rank)
  rank: 'family' | 'subfamily' | 'tribe' | 'subtribe' | 'genus' | 'subgenus' | 'complex' | 'species';
}
```

**D-03 label construction (bee-atlas.ts, building `_taxaOptions`):**

```typescript
function buildTaxonLabel(name: string, rank: string): string {
  switch (rank) {
    case 'family':
    case 'subfamily':
    case 'tribe':
    case 'subtribe':
      return name;                           // plain — unique, no disambiguation needed
    case 'genus':
      return `${name} (genus)`;              // parenthetical for twin disambiguation
    case 'subgenus':
      return `${name} (subgenus)`;           // parenthetical for twin disambiguation
    case 'complex':
      return `${name} complex`;             // natural phrasing (NOT parenthetical)
    case 'species':
    default:
      return name;                           // plain binomial
  }
}
```

**D-05 ordering (sort comparator applied to `_taxaOptions` array):**

```typescript
const RANK_ORDER: Record<string, number> = {
  family: 0, subfamily: 1, tribe: 2, subtribe: 3,
  genus: 4, subgenus: 5, complex: 6, species: 7,
};

taxaOptions.sort((a, b) => {
  const rankDiff = (RANK_ORDER[a.rank] ?? 99) - (RANK_ORDER[b.rank] ?? 99);
  if (rankDiff !== 0) return rankDiff;
  return a.name.localeCompare(b.name);
});
```

The sorted array is stored as `_taxaOptions` and passed to `bee-filter-controls` as a prop.
The `getSuggestions()` function in `bee-filter-controls.ts` already iterates in array order
(substring match, up to 5/8 results) — D-05 ordering is automatically preserved.
[VERIFIED: bee-filter-controls.ts L137-144 direct inspection]

**Token shape change in `bee-filter-controls.ts`:**

The `taxon` token type currently carries `taxonName` and `taxonRank`. After this phase it
carries `taxonId` and `taxonDisplayName` (for chip label). The `filter-changed` event
payload changes accordingly. [VERIFIED: bee-filter-controls.ts L141 inspection]

---

### D-07 Detail Card Name Resolution

**Current (bee-occurrence-detail.ts L188):**
```typescript
// Uses row.scientificName directly
row.scientificName ? row.scientificName : html`<span class="no-determination">No determination</span>`
```

**After D-07:** The `scientificName` column still exists in Phase 130 (dropped in Phase 131),
but per CONTEXT.md "treat as already-gone to de-risk Phase 131." Switch to cache lookup:

```typescript
// D-07: look up name from taxon cache by taxon_id
// taxonCache is passed as a prop from bee-atlas (or accessed via shared module — see below)
const taxonInfo = row.taxon_id != null ? taxonCache?.get(row.taxon_id) : null;
const displayName = taxonInfo?.name ?? null;
html`${displayName ?? html`<span class="no-determination">No determination</span>`}`
```

**Propagation path:** `bee-atlas._taxonCache` → needs to reach `bee-occurrence-detail`.
Options:
1. Pass `taxonCache` as a prop on `bee-pane` → `bee-occurrence-detail` (follows the
   presenter architecture invariant).
2. Export a singleton module-level cache from a new `src/taxa.ts` module (violates
   architecture invariant — no module-level shared mutable state).

Option 1 is correct per the architecture invariant. [VERIFIED: CLAUDE.md architecture invariants]

**`OccurrenceRow` change:** `taxon_id` is already present in `OccurrenceRow` (it's a column
in the `occurrences` table). Confirm by checking `OCCURRENCE_COLUMNS` — it is not currently
listed. It needs to be added. [VERIFIED: filter.ts L78-86 — `taxon_id` absent from current `OCCURRENCE_COLUMNS`]

This means `OCCURRENCE_COLUMNS` must add `'taxon_id'` and `OccurrenceRow` must add
`taxon_id: number | null`. The SQL SELECT statements that expand `OCCURRENCE_COLUMNS` will
then include `taxon_id` in every query. This is safe because the column exists in the DB
(Phase 129 shipped it). [VERIFIED: 130-CONTEXT.md §Reusable Assets]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Descendant set computation | A JS tree-walk over cached taxa | `instr(lineage_path, '/<id>/')` SQL subquery in wa-sqlite | SQL is faster, stays in the worker thread, already indexed |
| Twin disambiguation in labels | Custom data structure | Rank-keyed switch in `buildTaxonLabel()` | 41 twins are fully enumerated; all cases handled by rank alone |
| Name lookup in detail cards | SQL query per occurrence render | `Map<number, TaxonInfo>` lookup (`_taxonCache`) | O(1) cache hit; no re-query per render |
| URL back-compat parsing | Synchronous cache query at parse time | Two-phase resolution (sync store, async resolve) | Taxon cache is not ready at parse time; async resolution is the correct shape |

**Key insight:** The taxa table in wa-sqlite is the canonical source of truth for all name
and rank information. All name lookups go through the in-memory `Map` built from it; no
custom tree structures or redundant indexes are needed.

---

## Common Pitfalls

### Pitfall 1: `taxonRank` param removed too aggressively

**What goes wrong:** Removing `taxonRank` from `buildParams` breaks legacy URL parsing
for users with old bookmarks. `parseParams` currently requires both `taxon=` and
`taxonRank=` to be present (`resolvedTaxonName = (taxonName && taxonRank) ? taxonName : null`
at url-state.ts L125).

**How to avoid:** In the new `parseParams`, use the integer/non-integer heuristic:
if `taxon=` value is an integer, treat as new format (no `taxonRank` needed); if not
an integer, treat as legacy and use `taxonRank` for twin disambiguation.
[VERIFIED: url-state.ts L120-126 direct inspection]

### Pitfall 2: `queryFilteredCounts` still references string columns

**What goes wrong:** `queryFilteredCounts` (filter.ts L316) uses `COUNT(DISTINCT
scientificName)`, `COUNT(DISTINCT genus)`, `COUNT(DISTINCT family)`. These still work in
Phase 130 (columns survive until Phase 131), but the test for this function may assert the
SQL string. The planner should mark this as a Phase 131 concern, not Phase 130.
[VERIFIED: filter.ts L316-318]

### Pitfall 3: `isFilterActive` uses `taxonName` — must change to `taxonId`

**What goes wrong:** `isFilterActive` (filter.ts L215) checks `f.taxonName !== null`.
After the `FilterState` shape change, it must check `f.taxonId !== null`. Forgetting this
means the style cache bypass and filter race guard won't fire for taxon filters.
[VERIFIED: filter.ts L215-226 + CLAUDE.md "Style cache must bypass when filterState active"]

### Pitfall 4: `buildCsvFilename` uses `f.taxonName`

**What goes wrong:** `buildCsvFilename` (filter.ts L112) reads `f.taxonName`. After the
shape change, use `f.taxonDisplayName` instead. Low risk (cosmetic), but easy to miss.
[VERIFIED: filter.ts L112]

### Pitfall 5: Autocomplete token `type: 'taxon'` carries `taxonName`/`taxonRank`

**What goes wrong:** In `bee-filter-controls.ts`, the `TaxonToken` type carries
`taxonName` and `taxonRank` fields. The `filter-changed` event payload mirrors these.
After the shape change, the token must carry `taxonId` and `taxonDisplayName`. The event
payload and `FilterChangedEvent` interface (filter.ts L386-398) both need updating.
[VERIFIED: bee-filter-controls.ts L141, filter.ts L385-398]

### Pitfall 6: `_onDataLoaded` gets taxaOptions from the wrong source

**What goes wrong:** `_onDataLoaded` (bee-atlas.ts L934) currently receives `taxaOptions`
from the `bee-map` component's `data-loaded` event. After the cutover, `_taxaOptions` is
built directly in `bee-atlas.ts` from the taxa cache query. If `_onDataLoaded` still waits
for `bee-map` to supply taxa options, the new loading path is broken.
[VERIFIED: bee-atlas.ts L934-950 direct inspection]

**How to avoid:** The new loading path: `_loadSummaryFromSQLite()` awaits `tablesReady`,
fires the taxa query in parallel with the summary query, builds `_taxaOptions` itself, and
triggers the loading screen lift. The `data-loaded` event from `bee-map` may no longer
carry `taxaOptions` at all — verify and update accordingly.

### Pitfall 7: Detail card `taxon_id` field not in `OCCURRENCE_COLUMNS`

**What goes wrong:** `taxon_id` is not currently listed in `OCCURRENCE_COLUMNS` (filter.ts
L78-86). If D-07 switches to `row.taxon_id` lookup, and `taxon_id` is absent from the
SELECT, `row.taxon_id` is `undefined` at runtime (not a TypeScript error — `OccurrenceRow`
would have `taxon_id: undefined`, matching `taxon_id: number | null` loosely).
[VERIFIED: filter.ts L78-86 — `taxon_id` is absent]

**How to avoid:** Add `'taxon_id'` to `OCCURRENCE_COLUMNS` and `taxon_id: number | null`
to `OccurrenceRow`. This is a safe, additive change since the column exists in the DB.

---

## Code Examples

### Descendant WHERE Clause (complete)

```typescript
// Source: derived from STACK.md §Lineage Path Format + filter.ts direct inspection
// In buildFilterSQL() — replaces lines 232-241
if (f.taxonId !== null) {
  occurrenceClauses.push(
    `(taxon_id = ${f.taxonId} OR taxon_id IN (` +
    `SELECT taxon_id FROM taxa ` +
    `WHERE lineage_path IS NOT NULL ` +
    `AND instr(lineage_path, '/${f.taxonId}/') > 0))`
  );
}
```

### D-03 Label Builder

```typescript
// Source: 130-CONTEXT.md D-03, verified against twin examples
function buildTaxonLabel(name: string, rank: string): string {
  if (rank === 'genus') return `${name} (genus)`;
  if (rank === 'subgenus') return `${name} (subgenus)`;
  if (rank === 'complex') return `${name} complex`;
  return name; // family, subfamily, tribe, subtribe, species — plain
}
```

### D-05 Rank Ordering Sort

```typescript
// Source: 130-CONTEXT.md D-05
const RANK_ORDER: Record<string, number> = {
  family: 0, subfamily: 1, tribe: 2, subtribe: 3,
  genus: 4, subgenus: 5, complex: 6, species: 7,
};
taxaOptions.sort((a, b) => {
  const rankDiff = (RANK_ORDER[a.rank] ?? 99) - (RANK_ORDER[b.rank] ?? 99);
  return rankDiff !== 0 ? rankDiff : a.name.localeCompare(b.name);
});
```

### Taxa Cache Load (post-tablesReady)

```typescript
// Source: derived from sqlite-worker.ts 'build-geojson' pattern
// In bee-atlas.ts _loadSummaryFromSQLite(), after awaiting tablesReady:
const taxaRows: Array<{ taxon_id: number; rank: string; name: string; lineage_path: string | null }> = [];
await sqlite3.exec(db,
  `SELECT taxon_id, rank, name, lineage_path FROM taxa WHERE is_anthophila = 1`,
  (rowValues, columnNames) => {
    const obj = Object.fromEntries(columnNames.map((col, i) => [col, rowValues[i]]));
    taxaRows.push(obj as any);
  }
);
this._taxonCache = new Map(taxaRows.map(r => [
  r.taxon_id,
  { rank: r.rank, name: r.name, lineagePath: r.lineage_path },
]));
```

### URL Back-Compat: parseParams (taxon section)

```typescript
// Source: url-state.ts L120-126 pattern, adapted for D-06
const taxonRaw = p.get('taxon') ?? null;
const taxonRankRaw = p.get('taxonRank') ?? null;
let resolvedTaxonId: number | null = null;
let pendingLegacyTaxon: { name: string; rank: string | null } | null = null;

if (taxonRaw !== null) {
  const asInt = parseInt(taxonRaw, 10);
  if (!isNaN(asInt) && String(asInt) === taxonRaw) {
    resolvedTaxonId = asInt;  // new integer format
  } else {
    // Legacy name format — store for async resolution after cache load
    pendingLegacyTaxon = { name: taxonRaw, rank: taxonRankRaw };
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| String column `WHERE genus = 'Bombus'` | `taxon_id IN (subquery from taxa.lineage_path)` | Phase 130 | Unlocks subfamily/tribe/subgenus/complex filtering |
| `taxonName + taxonRank` filter state | `taxonId: number \| null` filter state | Phase 130 | Names become display-only; eliminates twin-collision bugs |
| `taxon=<name>&taxonRank=<rank>` URL | `taxon=<integer_id>` URL | Phase 130 | Shorter, unambiguous; back-compat via two-phase resolution |
| `scientificName` column for detail cards | `taxonCache.get(row.taxon_id)?.name` | Phase 130 | De-risks Phase 131 column drop; resolves all-sources name correctly |
| `DISTINCT family, genus, scientificName FROM occurrences WHERE ecdysis_id IS NOT NULL` | `SELECT taxon_id, rank, name FROM taxa WHERE is_anthophila = 1` | Phase 130 | Includes all 7 ranks; excludes bycatch; all-sources coverage |

**Deprecated/outdated in this phase:**
- `FilterState.taxonName` / `FilterState.taxonRank`: replaced by `taxonId` + `taxonDisplayName`
- `TaxonOption.name` / `TaxonOption.rank` (old 3-rank version): replaced by `taxonId` + 8-rank version
- `taxonRank=` URL param: dropped (rank derivable from cache after decode)
- `buildFilterSQL` string-column taxon branch (L232-241): replaced by descendant subquery

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | All is_anthophila=1 rows in the Phase 129 taxa table have ≥1 descendant occurrence (D-04 scope rule makes the simplified autocomplete SQL valid) | D-01 SQL | Autocomplete would include dead-end taxa (no map change on selection). Mitigated by using the EXISTS form instead. |
| A2 | The `taxa` table in production `occurrences.db` contains the `subtribe` rank (CONTEXT.md lists it in D-05 ordering, STACK.md schema shows only 6 ranks) | D-03 labels | `subtribe` would appear unlabeled or break the label switch. Low risk — planner should verify `SELECT DISTINCT rank FROM taxa`. |
| A3 | Phase 129 created an index on `occurrences.taxon_id` (`idx_occ_taxon` or similar) to make the descendant subquery fast | Descendant WHERE | Without index, the IN-list lookup against ~92k occurrence rows is a full scan. Still fast at this scale, but worth confirming. |

**If this table is empty would be wrong** — A1 has moderate impact on correctness; verify before finalizing the simplified autocomplete SQL form.

---

## Open Questions (RESOLVED)

> All three resolved by the planner's Wave 0 runtime checks (2026-06-02, against
> `public/data/occurrences.db`); see `130-VALIDATION.md` §"Wave 0 Requirements — COMPLETE".
> Q1 **resolved**: `subtribe` IS present among `is_anthophila=1` taxa; the D-03 label
> builder handles all 8 surfaced ranks. Q2 **resolved**: the autocomplete source moved to
> `bee-atlas._loadSummaryFromSQLite()` (background, post-`tablesReady`); `bee-map`'s
> `data-loaded` no longer carries `taxaOptions`. Q3 **resolved**: there is **no** index on
> `occurrences.taxon_id` (`EXPLAIN QUERY PLAN` = `SCAN occurrences`) — accepted for this
> additive/frontend-only phase (~22 ms Bombus-genus descendant filter); adding the index is
> a Phase 131 concern. This finding also overturned the simplified D-01 enumeration SQL in
> favor of the ancestry-expansion form mandated by Plan 130-02.

1. **Does the Phase 129 taxa table include `subtribe` rank?**
   - What we know: CONTEXT.md D-05 lists `subtribe` in ordering; STACK.md original schema only lists 6 ranks (family/subfamily/tribe/genus/subgenus/species); `sqlite_export.py` PASS 1 includes `'subtribe'` in the rank filter list (confirmed in code inspection)
   - What's unclear: whether subtribe taxa with descendant occurrences exist in the shipped WA data
   - Recommendation: `SELECT DISTINCT rank FROM taxa` in a Wave 0 test; if subtribe is absent, the label builder still handles it gracefully (falls through to plain name)

2. **How does `_onDataLoaded` (bee-atlas.ts L934) currently flow after this phase?**
   - What we know: it currently receives `taxaOptions` from the `bee-map` `data-loaded` event; `bee-map` builds them from the geo_blob
   - What's unclear: whether `bee-map` still fires `data-loaded` after this phase and what it carries
   - Recommendation: The planner should trace the `data-loaded` event carefully and decide whether `bee-map` continues to fire it (for the loading screen lift) without carrying `taxaOptions`, or whether the loading screen lift moves to `bee-atlas._loadSummaryFromSQLite()`.

3. **Is `taxon_id` indexed in `occurrences` (Phase 129 deliverable)?**
   - What we know: STACK.md says `CREATE INDEX idx_occ_taxon ON occurrences(taxon_id)` was planned; ARCHITECTURE.md mentions it
   - Recommendation: `EXPLAIN QUERY PLAN SELECT taxon_id FROM occurrences WHERE taxon_id = 12345` in a Wave 0 test to confirm index is used.

---

## Environment Availability

This phase is purely frontend TypeScript — no external tools, services, CLIs, or databases
beyond the already-loaded `occurrences.db`. Step 2.6: SKIPPED (no new external dependencies).

The `taxa` table in `occurrences.db` was shipped by Phase 129 and is available in production
via CloudFront. A local copy exists at `public/data/occurrences.db` or via the nightly
pipeline.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (existing) |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MFILT-01 | `buildFilterSQL` with `taxonId=N` generates correct descendant WHERE clause | unit | `npm test -- filter.test.ts` | ✅ (existing file, needs new test cases) |
| MFILT-01 | Descendant clause includes self (`taxon_id = N`) and descendants (`instr(...)`) | unit | `npm test -- filter.test.ts` | ✅ needs new case |
| MFILT-01 | County and ecoregion clauses are unchanged and compose correctly with taxon clause | unit | `npm test -- filter.test.ts` | ✅ existing test guards this |
| MFILT-02 | `TaxonOption` array from taxa rows uses D-03 label scheme | unit | `npm test -- filter.test.ts` or new `taxa.test.ts` | ❌ Wave 0 |
| MFILT-02 | D-05 ordering: broader ranks sort before narrower ranks, alphabetical within rank | unit | `npm test -- filter.test.ts` or new `taxa.test.ts` | ❌ Wave 0 |
| MFILT-02 | Autocomplete suggestions use `taxonId`, not `taxonName` | unit | `npm test -- filter.test.ts` | ❌ Wave 0 |
| MFILT-03 | URL round-trip: `taxon=<integer>` encodes and decodes as `taxonId` | unit | `npm test -- url-state.test.ts` | ✅ needs new case |
| MFILT-03 | URL back-compat: `taxon=Bombus&taxonRank=genus` stored as pending legacy resolution | unit | `npm test -- url-state.test.ts` | ✅ needs new case |
| MFILT-03 | `isFilterActive` returns true when `taxonId` is non-null | unit | `npm test -- filter.test.ts` | ✅ needs new case |
| MFILT-03 | Clear-filters path resets `taxonId` to null | unit | `npm test -- filter.test.ts` | ❌ Wave 0 |
| D-07 | Detail card: `taxon_id` non-null → cache lookup name displayed | render | `npm test -- bee-occurrence-detail.test.ts` (if exists) | ❌ Wave 0 |
| D-07 | Detail card: `taxon_id` null → "No determination" displayed | render | same | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test` (full suite — under 10 seconds, no point in subset)
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] Add test cases to `src/tests/filter.test.ts` for descendant WHERE clause generation
- [ ] Add test cases to `src/tests/url-state.test.ts` for new integer `taxon=` encoding and legacy back-compat
- [ ] New test cases (or new file `src/tests/taxa.test.ts`) covering D-03 label builder and D-05 sort order
- [ ] Render test (extend existing `bee-sidebar.test.ts` or add `bee-occurrence-detail.test.ts`) for D-07 name resolution

---

## Security Domain

No new authentication, session management, access control, or cryptographic concerns. The
taxon filtering change is purely a SQL query shape change — integer IDs replace strings,
which actually reduces XSS/injection risk (integers need no quoting).

The URL back-compat path does parse user-supplied strings from the URL (`taxon=<name>`).
These are not reflected into the DOM as HTML; they are stored as filter state and used in
SQL queries via the existing `''`-escaping convention. This is unchanged from the current
behavior. [VERIFIED: filter.ts SQL string interpolation pattern]

`security_enforcement: absent` in config — section included for completeness.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes (URL params) | `parseInt` for integer IDs; `isNaN` guard; legacy name stored as display-only, never interpolated into SQL without escaping |
| V2–V4, V6 | no | Static frontend, no auth/session/crypto changes |

---

## Sources

### Primary (HIGH confidence)

- `.planning/phases/130-map-filter-cutover/130-CONTEXT.md` — all phase decisions (D-01 through D-08)
- `src/filter.ts` — direct inspection of `FilterState`, `buildFilterSQL`, `OCCURRENCE_COLUMNS`, `TaxonOption`, all callers
- `src/bee-atlas.ts` — direct inspection of `_loadSummaryFromSQLite` (L334), `_taxaOptions` build (L369), `_onDataLoaded` (L934), race guards (L71-73)
- `src/bee-filter-controls.ts` — direct inspection of `getSuggestions` (L103-189), `taxaOptions` prop (L196)
- `src/url-state.ts` — direct inspection of `buildParams` (L57-59), `parseParams` (L120-126)
- `src/bee-occurrence-detail.ts` — direct inspection of name rendering (L188)
- `src/sqlite.ts` and `src/sqlite-worker.ts` — direct inspection of boot sequence, `tables-ready`, `build-geojson` pattern
- `data/sqlite_export.py` — direct inspection of `_build_taxon_hierarchy` (L37-76+), taxa table schema
- `.planning/research/STACK.md` — materialized-path latency math, `instr()` behavior in SQLite 3.44
- `.planning/research/ARCHITECTURE.md` — lazy taxonCache placement, closure vs materialized-path discussion, anti-patterns
- `.planning/research/PITFALLS.md` — Pitfall 3 (name non-uniqueness), anti-patterns for filtering
- `.planning/phases/129-hierarchy-foundation/129-CONTEXT.md` — D-02 lineage_path structure, D-05 bycatch rule, D-04 coverage scope

### Secondary (MEDIUM confidence)

- `.planning/REQUIREMENTS.md` — MFILT-01, MFILT-02, MFILT-03 requirement text
- `.planning/PROJECT.md` — v4.6 milestone context, architecture invariants

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all existing
- Architecture: HIGH — all findings from direct code inspection
- Descendant SQL: HIGH — materialized-path pattern verified in Phase 129 benchmarks
- D-06 back-compat: HIGH — url-state.ts parsing logic directly inspected
- D-08 cache strategy: HIGH — geo_blob pattern directly inspected as template
- A1 assumption (simplified autocomplete SQL): MEDIUM — needs runtime verification

**Research date:** 2026-06-02
**Valid until:** 2026-06-30 (stable codebase; no fast-moving dependencies)
