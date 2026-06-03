# Phase 131: Occurrence Normalization — Research

**Researched:** 2026-06-02
**Domain:** dbt mart column drop, geo_blob rewrite, frontend migration (wa-sqlite, Lit, TypeScript)
**Confidence:** HIGH — all findings verified directly against source files

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01** — Drop `speciesCount`/`genusCount`/`familyCount` from `DataSummary` interface and `_loadSummaryFromSQLite` query entirely (they are never rendered). The query becomes `COUNT(*) + MIN/MAX(year)` only.

**D-02** — `totalSpecimens` unaffected.

**D-03** — `geo_blob` carries no taxon identity. Features are matched by `occId` only; feature properties are `{ occId, recencyTier, source }`.

**D-04** — New `geo_blob` layout (7 fields): `[lat, lon, ecdysis_id, observation_id, specimen_observation_id, year, source]`.

**D-05** — Record-only size measurement (no new automated gate). Capture pre/post DB byte size, gzipped transfer weight, and in-browser `tablesReady` timing in VERIFICATION.md.

**D-06** — Full cleanup of dead string-column paths:
- `bee-atlas.ts:351-359` species/genus/family count query
- `features.ts:22-78` Sets, `summary` build, legacy `taxaOptions` build
- `filter.ts:300-329` `queryFilteredCounts` + `FilteredCounts` (zero consumers)
- `bee-map.ts:467` `data-loaded` event payload shrinks to bare signal
- `bee-atlas._onDataLoaded` stops setting `_summary` from the event

**D-07** — Live display consumers migrated to `taxon_id`-resolved names:
- `bee-table.ts:43` Species column `dataField: 'scientificName'`
- `bee-occurrence-detail.ts:236-237` `_renderProvisional` → `row.specimen_inat_taxon_name`
- **Resolution approach: OPEN — see Primary Research Finding below**

**D-08** — Mechanical drops: remove dropped columns from `OccurrenceRow` (`filter.ts:50,53,54,67`) and `OCCURRENCE_COLUMNS` (`filter.ts:81,82,85`); update `filter.test.ts` and `build-geojson.test.ts`.

### Claude's Discretion
None — all areas resolved by user decisions or this research.

### Deferred Ideas (OUT OF SCOPE)
- Migrate checklist filter off name+rank strings to `taxon_id`
- Drop unused intermediate columns beyond `specimen_inat_genus`/`specimen_inat_family`
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NORM-01 | Drop 4 denormalized rank columns from occurrences mart; retain `canonical_name`; enforce contract at every dbt build | dbt contract mechanics verified: schema.yml entries L23-32 (scientificName, genus, family) + L57-58 (specimen_inat_taxon_name) to remove; occurrences.sql L86,91 to trim |
| NORM-02 | occurrences.db and geo_blob updated atomically; measurable transfer-weight + DB-size reduction recorded | geo_blob rewrite verified: `_GEO_COLS` L457-460 to 7-field layout; measurement procedure specified |
| NORM-03 | Every downstream consumer audited and migrated; `species` mart and page gen unaffected | Consumer audit complete (see below); `bee-table.ts` Species column + `bee-occurrence-detail.ts` _renderProvisional are the live consumers requiring migration |
</phase_requirements>

---

## Summary

Phase 131 is a deletion phase: 4 denormalized rank-string columns (`scientificName`, `genus`, `family`, `specimen_inat_taxon_name`) are removed from the dbt occurrences mart and all dependent surfaces. The work is safe because Phase 130 already switched the map filter, detail cards, and autocomplete to `taxon_id`-keyed paths.

The change has four substrates: (1) dbt model + schema.yml (pipeline side), (2) `sqlite_export.py` `_GEO_COLS` + `features.ts` decode (geo_blob rewrite, the headline size win), (3) dead-code deletion in `bee-atlas.ts`, `features.ts`, `filter.ts` (D-01/D-06), and (4) live display migration in `bee-table.ts` and `bee-occurrence-detail.ts` (D-07). All four substrates must ship atomically to avoid a broken intermediate state.

The single technically novel question is D-07 name resolution for `bee-table.ts` — this component does not currently receive `taxonCache`, and `queryTablePage`/`queryListPage` both join through `OCCURRENCE_COLUMNS` which is a flat string list. The research recommendation below gives a concrete, evidence-backed answer.

**Primary recommendation:** Use a SQL JOIN to the `taxa` table inside `queryTablePage` / `queryListPage` to inject `taxa.name AS display_name` into each result row. This is strictly superior to threading `taxonCache` to `bee-table.ts` for this phase.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Drop mart columns / update dbt contract | Pipeline (dbt) | — | Schema lives in data/dbt; enforced at build time |
| geo_blob rewrite (7-field layout) | Pipeline (sqlite_export.py) | Frontend (features.ts) | Export produces the blob; frontend decodes it — must change together atomically |
| Dead-path deletion (counts, taxaOptions) | Frontend (bee-atlas.ts, features.ts, filter.ts) | — | JS module state; no persistence side effects |
| Species column name resolution (bee-table) | API/query layer (filter.ts queryTablePage) | — | Name resolution belongs in the data layer, not the presenter |
| Provisional name resolution (bee-occurrence-detail) | Presenter (bee-occurrence-detail.ts) | — | Already receives taxonCache from bee-pane (threaded from bee-atlas); pattern already in place for _renderCollectorGroup |
| Size measurement | Human/manual | — | Browser timing + file stat; no automated gate (D-05) |

---

## D-07 Name Resolution: Primary Research Finding

### The Problem

Two display consumers lose their name source when the 4 mart columns drop:

1. **`bee-table.ts:43`** — `dataField: 'scientificName'`, rendered as `(row as any)[col.dataField]` (L382). The table renders the raw `OccurrenceRow` field by name. `bee-table` has NO `taxonCache` property and receives rows from `queryTablePage` via `bee-atlas` → `bee-pane` → `bee-table`.

2. **`bee-occurrence-detail.ts:236-237`** — `_renderProvisional` reads `row.specimen_inat_taxon_name`. This component DOES already receive `taxonCache` (threaded from `bee-atlas._taxonCache` → `bee-pane.taxonCache` → `bee-occurrence-detail.taxonCache`). The pattern is already in use in `_renderCollectorGroup` (L189: `const info = row.taxon_id != null ? this.taxonCache?.get(row.taxon_id) : null`).

### Option A: SQL JOIN inside `queryTablePage` / `queryListPage`

`queryTablePage` and `queryListPage` both build their `SELECT` from `OCCURRENCE_COLUMNS.join(', ')` plus a `FROM occurrences WHERE ...`. The `taxa` table lives in the same `occurrences.db` file. A LEFT JOIN on `taxon_id` can inject `taxa.name AS display_name` without touching the mart schema:

```sql
SELECT o.taxon_id, o.lat, ..., t.name AS display_name
FROM occurrences o
LEFT JOIN taxa t ON t.taxon_id = o.taxon_id
WHERE ...
```

`display_name` would be NULL for `taxon_id IS NULL` rows (the ~21k genuinely-unidentified Ecdysis specimens), which `bee-table.ts`'s existing `nullLabel: 'No Determination'` already handles correctly (L43, L384).

**For `queryListPage`:** `queryListPage` rows go to `bee-occurrence-detail` which already has `taxonCache` for its primary `_renderCollectorGroup`. The `_renderProvisional` branch is triggered by `row.is_provisional` for waba_sample rows — these rows DO have `taxon_id` (the iNat community taxon). Injecting `display_name` from the JOIN handles this uniformly.

**Impact on existing query structure:**
- `queryTablePage` at `filter.ts:172-213`: replace `const selectCols = OCCURRENCE_COLUMNS.join(', ')` with `const selectCols = OCCURRENCE_COLUMNS.join(', o.') + ', t.name AS display_name'` (minor surgery; the FROM changes to `occurrences o LEFT JOIN taxa t ON t.taxon_id = o.taxon_id`).
- Same for `queryListPage` at `filter.ts:401+` and `queryAllFiltered` at `filter.ts:150+`.
- `OccurrenceRow` gains `display_name: string | null`.
- `bee-table.ts` column def changes to `dataField: 'display_name'`.
- `bee-occurrence-detail.ts:236-237` changes to use `row.display_name` instead of `row.specimen_inat_taxon_name`.

**Pros:**
- Self-contained — no component prop threading change.
- `taxa` is in the same SQLite file, so the JOIN is local (same connection, wa-sqlite in-process).
- No cache-timing dependency: names are present in every result row from the first query, regardless of when `_taxonCache` finishes loading.
- `taxon_id IS NULL` → NULL → `nullLabel: 'No Determination'` — D-07 rule honored automatically.
- Consistent: both `bee-table` and `bee-occurrence-detail._renderProvisional` use the same path.
- `queryAllFiltered` (CSV download) also benefits: CSV will include resolved names.

**Cons:**
- Adds one LEFT JOIN to every `queryTablePage`, `queryListPage`, and `queryAllFiltered` call.
- `OCCURRENCE_COLUMNS` constant can no longer be used as a simple `join(', ')` in these three functions — needs structural adjustment to prefix `o.` and append the join column. **Mitigated:** only 3 call sites; the constant is still the source of truth for the column list, just assembled differently at query time.

### Option B: Thread `taxonCache` to `bee-table.ts`

This would follow the same pattern as `bee-occurrence-detail`. It requires:
- Adding `@property({ attribute: false }) taxonCache: Map<number, TaxonCacheEntry> | null = null` to `BeeTable`.
- Threading `_taxonCache` from `bee-atlas` → `bee-pane` → `bee-table` (new prop on `bee-pane`).
- Changing the Species column `valueFn` to look up `taxonCache.get(row.taxon_id)?.name ?? null`.
- Handling the timing window: `_taxonCache` loads lazily in `_loadSummaryFromSQLite`, which fires from `_onDataLoaded`. `queryTablePage` is also triggered from `_onDataLoaded` (L1036-1039). The cache loads asynchronously inside `_loadSummaryFromSQLite` — there is a window where the table pane renders with rows before `_taxonCache` is populated.
  - **Evidence:** `bee-atlas.ts:66-67` confirms `_taxonCache` is NOT `@state()` ("only `_taxaOptions` drives re-renders"). If `_taxonCache` were threaded to `bee-table` as a `@property`, a reassignment would trigger re-render, but the first render (before cache load completes) would show all species cells as "No Determination" for a brief flash. In practice Phase 130 D-08 confirmed the lazy cache loads fast (~3.5 ms for the query), but the structural timing dependency is more fragile than a JOIN.

**Pros:**
- Consistent with Phase 130's D-07 pattern for `bee-occurrence-detail`.

**Cons:**
- Adds new component prop (`taxonCache`) to `bee-table` and `bee-pane` — more code surface than the JOIN.
- Cache-timing flash: first table render after boot could briefly show "No Determination" for all rows until cache populates.
- Does not simplify `_renderProvisional` (that consumer still needs to change separately).
- Breaks the "pure presenter" contract more deeply — `bee-table` would need to know about `TaxonCacheEntry`.

### Recommendation: Option A (SQL JOIN)

**Rationale:**
1. **No timing dependency.** The JOIN is synchronous with the query — names appear in the first render.
2. **Fewer component changes.** No new props on `bee-table` or `bee-pane`.
3. **Single migration path for both D-07 consumers.** Both `bee-table` and `_renderProvisional` read `row.display_name` — one field, same null semantics.
4. **Consistent with architecture invariants.** `bee-table` stays a pure presenter; name resolution moves to the data layer.
5. **Local JOIN cost is negligible.** `taxa` has 940 rows in the same SQLite file; `taxon_id` is the PK; the JOIN is a B-tree lookup on an indexed key.
6. **`queryAllFiltered` (CSV export) also gets resolved names** at no extra cost — a user downloading a CSV will see species names, not blank cells.

**Implementation note for the JOIN restructuring:** The cleanest approach is to change the three query functions to use an explicit column list with `o.` prefix rather than `OCCURRENCE_COLUMNS.join(', ')`. Introduce a helper `_occurrenceSelect()` that returns the prefixed form. `OCCURRENCE_COLUMNS` itself stays unchanged (it is still the authoritative column list for `OccurrenceRow`; the display_name addition is an augmentation, not a mart column).

---

## Standard Stack

No new packages. All work is internal to the existing stack. [VERIFIED: codebase grep]

| Component | Current Version | Role in This Phase |
|-----------|----------------|-------------------|
| dbt (DuckDB adapter) | project standard | Contract enforcement |
| wa-sqlite / sqlite3 | project standard | In-DB JOIN for name resolution |
| Lit 3.x | project standard | Component updates |
| Vitest | project standard | Test updates |

**Installation:** None required.

---

## Package Legitimacy Audit

> Not applicable — no new packages installed in this phase.

---

## Architecture Patterns

### System Architecture Diagram

```
Pipeline (nightly.sh)
  └── dbt build
        └── occurrences mart: DROP 4 cols (37→33)
              └── sqlite_export.py
                    ├── occurrences table (33 cols → SQLite)
                    ├── taxa table (unchanged)
                    └── geo_blob: [lat, lon, ecdysis_id, observation_id,
                                   specimen_observation_id, year, source]  ← 3 strings removed

Browser (wa-sqlite worker)
  └── tablesReady
        ├── features.ts loadOccurrenceGeoJSON()
        │     └── _buildGeoJSONFromRaw(rows)  ← decode indexes 0-6 only
        │           └── bee-map data-loaded { geojson }  ← no summary/taxaOptions
        └── bee-atlas._loadSummaryFromSQLite()
              ├── summary: COUNT(*) + MIN/MAX(year)  ← no species/genus/family counts
              └── _taxonCache + _taxaOptions (lazy, unchanged)

queryTablePage / queryListPage / queryAllFiltered
  └── SELECT o.*, t.name AS display_name
      FROM occurrences o LEFT JOIN taxa t ON t.taxon_id = o.taxon_id
      WHERE ...
        └── OccurrenceRow.display_name → bee-table Species column
                                       → bee-occurrence-detail._renderProvisional
```

### Recommended Project Structure

No new directories. Changes are scattered across existing files per the audit below.

---

## Consumer Audit: Verified Complete

All references to the 4 dropped columns in non-test `src/` have been confirmed by grep. Summary:

### Dead — Delete

| Location | What | Decision |
|----------|------|----------|
| `bee-atlas.ts:351-359` | `COUNT(DISTINCT scientificName/genus/family)` in summary query | D-01 |
| `bee-atlas.ts:368-374` | `speciesCount/genusCount/familyCount` in `this._summary = { ... }` | D-01 |
| `bee-atlas.ts:1016` | `this._summary = e.detail.summary` (replaced by `_loadSummaryFromSQLite`) | D-06 |
| `features.ts:22-78` | `species/genera/families` Sets, `summary` build, `taxaOptions` build | D-06 |
| `features.ts:16-19` (return type) | Remove `summary: DataSummary; taxaOptions: TaxonOption[]` from return type | D-06 |
| `features.ts:83-85` (async signature) | Remove `summary` + `taxaOptions` from return type of `loadOccurrenceGeoJSON` | D-06 |
| `filter.ts:300-329` | `queryFilteredCounts` + `FilteredCounts` interface (zero consumers) | D-06 |
| `filter.ts:362-366` | `speciesCount/genusCount/familyCount` from `DataSummary` interface | D-01 |
| `bee-map.ts:378` | `const { geojson, summary, taxaOptions }` → destructure only `{ geojson }` | D-06 |
| `bee-map.ts:467` | `this._emit('data-loaded', { summary, taxaOptions })` → `this._emit('data-loaded', {})` | D-06 |
| `bee-atlas.ts:1015` | `_onDataLoaded` event type `CustomEvent<{ summary: DataSummary; taxaOptions: TaxonOption[] }>` → `CustomEvent<Record<string, never>>` (or just `CustomEvent`) | D-06 |

### Live — Migrate

| Location | What | Migration |
|----------|------|-----------|
| `filter.ts:50` | `OccurrenceRow.scientificName: string \| null` | Remove field; add `display_name: string \| null` |
| `filter.ts:53` | `OccurrenceRow.genus: string \| null` | Remove field |
| `filter.ts:54` | `OccurrenceRow.family: string \| null` | Remove field |
| `filter.ts:67` | `OccurrenceRow.specimen_inat_taxon_name: string \| null` | Remove field |
| `filter.ts:81` | `OCCURRENCE_COLUMNS` `'scientificName'` entry | Remove |
| `filter.ts:82` | `OCCURRENCE_COLUMNS` `'genus'`, `'family'` entries | Remove |
| `filter.ts:85` | `OCCURRENCE_COLUMNS` `'specimen_inat_taxon_name'` entry | Remove |
| `filter.ts:172-213` (`queryTablePage`) | `SELECT OCCURRENCE_COLUMNS` | Restructure to `o.` prefix + LEFT JOIN taxa |
| `filter.ts:401+` (`queryListPage`) | `SELECT OCCURRENCE_COLUMNS` | Same restructure |
| `filter.ts:150-170` (`queryAllFiltered`) | `SELECT OCCURRENCE_COLUMNS` | Same restructure |
| `bee-table.ts:43` | `dataField: 'scientificName'` | Change to `dataField: 'display_name'` |
| `bee-occurrence-detail.ts:236-237` | `row.specimen_inat_taxon_name` in `_renderProvisional` | Change to `row.display_name` |

### Mechanical in Tests

| Location | What | Update |
|----------|------|--------|
| `filter.test.ts:256` | `expect(OCCURRENCE_COLUMNS).toContain('scientificName')` | Remove or invert |
| `filter.test.ts:318,322` | SQL contains `scientificName` assertion | Update to `display_name` |
| `filter.test.ts:449` | `scientificName: 'Bombus'` in mock result | Remove field |
| `build-geojson.test.ts` | Entire file tests deleted `_buildGeoJSONFromRaw` API | Rewrite for new 7-field layout + `{ geojson }` only return |
| `bee-table.test.ts:12` | `OCCURRENCE_COLUMNS` mock includes `scientificName`, `genus`, `family`, `specimen_inat_taxon_name` | Remove those, add `display_name` |
| `bee-table.test.ts:151,221` | `scientificName: 'Bombus vosnesenskii'` in row fixtures | Change to `display_name: 'Bombus vosnesenskii'` |
| Multiple test files | `genusCount`, `familyCount`, `speciesCount` in `DataSummary` mock objects | Remove fields from mocks |

### Audited, Unaffected

| Location | Why Unaffected |
|----------|----------------|
| `bee-map.ts:733-744` | Reads `checklist.parquet` columns (`scientificName`, `genus`, `family`) — separate artifact, not the occurrences mart. No change. |
| `src/lib/spa-link.ts:14,17,25` | `scientificName` / `genus` / `family` appear as rank labels and URL parameter names, not mart column reads. No change. |
| `src/taxa.ts:8,12-13,20-21` | `genus`, `family`, `subgenus` are rank string constants in RANK_ORDER. No change. |
| `src/url-state.ts` comments | References to `scientificName` in comments only (legacy URL format description). No change. |
| `src/entries/species-index.ts:17,19-20` | `family-section`, `genus-row` are HTML class names for the static `/species` page, not mart columns. No change. |
| `data/dbt/models/marts/species` | Keeps `scientificName`, `genus`, `family` — NORM-03 explicitly excludes this mart. |
| `data/dbt/models/intermediate/int_specimen_obs_base.sql:12-13` | `specimen_inat_genus`, `specimen_inat_family` — dead intermediate columns to delete (cleanup, not mart contract change). |

---

## dbt Contract Drop Mechanics

**Current state (verified):** [VERIFIED: codebase read]
- `data/dbt/models/marts/schema.yml` — 37 column entries for `occurrences` model (L4-93).
- `data/dbt/models/marts/occurrences.sql` — final SELECT at L83-101.
- Dropped columns in schema.yml: `scientificName` (L23-24), `genus` (L29-30), `family` (L31-32), `specimen_inat_taxon_name` (L57-58). Remove these 4 entries → 33 columns remain.
- Dropped columns in occurrences.sql SELECT: L86 `j.scientificName, ... j.genus, j.family` and L91 `j.specimen_inat_taxon_name`. Remove these from the SELECT list.
- `canonical_name` entry (L63-64 in schema.yml) is RETAINED. The `not_null` test `where` clause at L93 references `canonical_name` — leave intact.
- `taxon_id` entry and its `not_null` test (L81-93) are RETAINED.
- `data/dbt/models/intermediate/int_specimen_obs_base.sql:12-13` — delete `tl.genus AS specimen_inat_genus` and `tl.family AS specimen_inat_family` (dead — these columns feed nothing downstream in the mart).

**Contract enforcement mechanism:** `bash data/dbt/run.sh build` runs `dbt build` which enforces `contract: enforced: true` — the mart SELECT must match the schema.yml column list exactly. Dropping a column from schema.yml but not the SELECT (or vice versa) fails the build. [VERIFIED: codebase, CLAUDE.md]

**OCCURRENCE_COLUMNS discrepancy note:** `filter.ts` `OCCURRENCE_COLUMNS` currently has 36 entries (it does NOT include `canonical_name`, which is a mart column but not selected for the paged queries). After dropping the 4 columns and adding `display_name` (from the JOIN, not the mart), it will still have 33 entries. `display_name` is a query-level alias, not a mart column — it does not appear in schema.yml.

---

## geo_blob Rewrite Mechanics

**Current state (verified):** [VERIFIED: codebase read]

`data/sqlite_export.py` L453-460:
```python
# Column order: [lat, lon, ecdysis_id, observation_id, specimen_observation_id,
#                year, scientificName, genus, family, source]
_GEO_COLS = [
    "lat", "lon", "ecdysis_id", "observation_id", "specimen_observation_id",
    "year", "scientificName", "genus", "family", "source",
]
```

`src/features.ts` L14-15 (comment) and L27-39 (decode):
```typescript
// Column layout: [lat, lon, ecdysis_id, observation_id, specimen_observation_id,
//                 year, scientificName, genus, family, source]
// ...
const scientificName = row[6] as string | null;
const genus = row[7] as string | null;
const family = row[8] as string | null;
const source = row[9] as string | null;
```

**New 7-field layout (D-04):**

| Index | Field |
|-------|-------|
| 0 | lat |
| 1 | lon |
| 2 | ecdysis_id |
| 3 | observation_id |
| 4 | specimen_observation_id |
| 5 | year |
| 6 | source |

**Changes required:**
- `sqlite_export.py:455-456` — update layout comment to 7 fields.
- `sqlite_export.py:457-460` — `_GEO_COLS` becomes `["lat", "lon", "ecdysis_id", "observation_id", "specimen_observation_id", "year", "source"]`.
- `features.ts:14-15` — update layout comment.
- `features.ts:39` — `const source = row[6] as string | null` (index 9 → 6).
- `features.ts:36-38` — remove `const scientificName = row[6]`, `const genus = row[7]`, `const family = row[8]`.
- Remove `species/genera/families` Set usage (L22-24, L47-50) and `summary`/`taxaOptions` build (L62-78) per D-06.

**The `select_expr` NULL-fallback** (sqlite_export.py:463) tolerates absent columns gracefully, but the dropped names must be removed from `_GEO_COLS` itself, not left to NULL-fallback — leaving them would preserve zero-value strings in the blob, negating the size win.

**Size win estimate:** `~90k rows × 3 strings × ~15 bytes avg per string ≈ ~4 MB` reduction in the `geo_blob` TEXT column — the headline transfer-weight win. Exact measurement captured in VERIFICATION.md.

---

## NORM-02 Measurement Procedure

**How to capture the before/after baseline (D-05, record-only):**

**Step 1 — Pre-change baseline (run before any code change):**
```bash
# DB byte size
ls -la data/export/occurrences.db
# Gzipped transfer weight
gzip -c data/export/occurrences.db | wc -c
```

**Step 2 — Post-change (run after `bash data/dbt/run.sh build` + pipeline re-run):**
Same commands. Record results in VERIFICATION.md with date.

**Step 3 — `tablesReady` browser timing:**
The existing benchmark instrumentation logs `tablesReady` to the browser console (`features.ts:87-90`, `bee-atlas.ts:1023`). Load the app before and after the change, record the `[BENCHMARK] loadOccurrenceGeoJSON buffer transfer: N ms` and `[BENCHMARK] data-loaded: N ms` values from the console. Target: `tablesReady` does not regress from the v4.3 baseline of ~250 ms.

The timing is not automatable in the nightly pipeline (browser context required). VERIFICATION.md captures a one-time manual measurement. [ASSUMED: "~250 ms" is the documented baseline; exact current value should be re-measured as the pre-change baseline]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Taxon name lookup in table rows | Custom JS name-resolution in bee-table | SQL LEFT JOIN taxa in queryTablePage | JOIN is local (same SQLite file), indexed on PK, zero network cost |
| Schema enforcement for dropped columns | JS assertion at app startup | dbt contract (`enforced: true`) | Already enforced at every `dbt build`; adding a JS layer is redundant |
| Size regression gate | Hardcoded DB-size ceiling in nightly.sh | dbt column contract | A size ceiling fights legitimate data growth; contract prevents column re-addition |

---

## Common Pitfalls

### Pitfall 1: geo_blob positional index mismatch (highest risk)
**What goes wrong:** `sqlite_export.py` and `features.ts` disagree on which positional index holds `source`. The app silently renders wrong `recencyTier` or wrong `source` badges on every map point — no thrown error.
**Why it happens:** `_GEO_COLS` and the `row[N]` decode in `features.ts` are coupled by convention (positional JSON array), not by named schema.
**How to avoid:** Change both files in the same commit. Update the layout comments in both files. The `build-geojson.test.ts` rewrite must exercise the new 7-field positional layout explicitly.
**Warning signs:** `recencyTier` is always `'earlier'` (year defaults to index 5 = source string → `Number('ecdysis') = NaN`), or `source` is always empty string.

### Pitfall 2: `_summary` set from stale event payload
**What goes wrong:** After D-06 removes `summary` from the `data-loaded` event payload, `_onDataLoaded` still reads `e.detail.summary` and assigns it (because TypeScript sees a narrowed interface but not a runtime null).
**Why it happens:** `bee-atlas.ts:1016` (`this._summary = e.detail.summary`) still runs and overwrites the authoritative `_loadSummaryFromSQLite` result.
**How to avoid:** Remove the `this._summary = e.detail.summary` line entirely; `_loadSummaryFromSQLite` is the sole source of truth for `_summary`. [VERIFIED: code confirms `_loadSummaryFromSQLite` already sets `_summary` independently]

### Pitfall 3: `DataSummary` mock breakage in tests
**What goes wrong:** `speciesCount`, `genusCount`, `familyCount` are removed from `DataSummary`, but test fixtures in `bee-atlas.test.ts`, `bee-pane.test.ts`, `bee-header.test.ts`, `bee-table.test.ts`, `build-geojson.test.ts` all construct `DataSummary` objects with these fields. TypeScript will error on the extras; Vitest's strict type checking will surface them.
**Why it happens:** Many test files construct `DataSummary` inline and mock `features.ts`/`filter.ts` with these fields.
**How to avoid:** Treat the test sweep as a required wave. The `build-geojson.test.ts` needs a full rewrite (tests the old 10-field `_buildGeoJSONFromRaw` return shape). Other test files need field removal from mock objects.

### Pitfall 4: `OCCURRENCE_COLUMNS` used verbatim in JOIN query
**What goes wrong:** `queryTablePage` changes to `SELECT o.col1, o.col2, ... t.name AS display_name FROM occurrences o LEFT JOIN taxa t ...` but `OCCURRENCE_COLUMNS.join(', ')` (without `o.` prefix) is still used — SQLite rejects ambiguous column names when the JOIN introduces a column with the same name as an occurrence column.
**Why it happens:** `taxa` table has `taxon_id`, `rank`, `name` — `taxon_id` also exists in `occurrences`. Without prefixing, `SELECT taxon_id` is ambiguous.
**How to avoid:** Use `OCCURRENCE_COLUMNS.map(c => 'o.' + c).join(', ') + ', t.name AS display_name'` in the JOIN queries. `OCCURRENCE_COLUMNS` constant itself does not change.

### Pitfall 5: `_renderProvisional` null handling
**What goes wrong:** After migrating `_renderProvisional` from `row.specimen_inat_taxon_name` to `row.display_name`, the existing null branch (`html\`<span class="hint">identification pending</span>\``) still works correctly — but only if `display_name` is NULL when `taxon_id` is NULL. If the JOIN accidentally returns an empty string `''` instead of NULL, the branch never fires.
**Why it happens:** `LEFT JOIN taxa t ON t.taxon_id = o.taxon_id` where `o.taxon_id IS NULL` → `t.name` is NULL. This is correct SQLite LEFT JOIN semantics.
**How to avoid:** Verify the null branch with a test row that has `taxon_id = NULL`. [VERIFIED: SQLite LEFT JOIN with NULL key produces NULL for joined columns]

---

## Code Examples

### New geo_blob layout (sqlite_export.py)
```python
# Source: verified against sqlite_export.py L453-470
# Column order: [lat, lon, ecdysis_id, observation_id, specimen_observation_id,
#                year, source]
_GEO_COLS = [
    "lat", "lon", "ecdysis_id", "observation_id", "specimen_observation_id",
    "year", "source",
]
```

### New geo_blob decode (features.ts)
```typescript
// Source: verified against features.ts L27-59
const ecdysis_id = row[2];
const observation_id = row[3];
const specimen_observation_id = row[4];
const year = Number(row[5]);
const source = row[6] as string | null;
// No scientificName, genus, family — removed
```

### New queryTablePage SELECT pattern
```typescript
// Source: derived from filter.ts L172-213 + JOIN recommendation
const selectCols = OCCURRENCE_COLUMNS.map(c => `o.${c}`).join(', ') + ', t.name AS display_name';
// ...
`SELECT ${selectCols} FROM occurrences o LEFT JOIN taxa t ON t.taxon_id = o.taxon_id
 WHERE ${occurrenceWhere} ORDER BY ${orderBy} LIMIT ${PAGE_SIZE} OFFSET ${offset}`
```

### New _renderProvisional (bee-occurrence-detail.ts)
```typescript
// Source: derived from bee-occurrence-detail.ts L235-238 + D-07 decision
private _renderProvisional(row: OccurrenceRow) {
  const taxonEl = row.display_name
    ? html`<em>${row.display_name}</em>`
    : html`<span class="hint">identification pending</span>`;
  // ...
}
```

### Slimmed _loadSummaryFromSQLite query (bee-atlas.ts)
```typescript
// Source: derived from bee-atlas.ts L351-359 + D-01 decision
await sqlite3.exec(db, `
  SELECT COUNT(*) AS total_specimens,
         MIN(year) AS earliest_year,
         MAX(year) AS latest_year
  FROM occurrences
  WHERE ecdysis_id IS NOT NULL
`, ...);
// Remove speciesCount/genusCount/familyCount from result assignment
```

---

## Runtime State Inventory

> Phase is a code + dbt change, not a rename/rebrand. The dropped column names exist in dbt schema, SQL queries, and TypeScript source only — not as user-visible identifiers, OS registrations, or external service config.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `occurrences.parquet` and `occurrences.db` are regenerated at each pipeline run — no persistent records to migrate | Regenerate via pipeline |
| Live service config | None — nightly pipeline regenerates `occurrences.db` from scratch; no external service config references the dropped column names | None |
| OS-registered state | None — nightly.sh crontab and service registrations do not reference column names | None |
| Secrets/env vars | None — `DB_PATH`, `EXPORT_DIR` reference file paths, not column names | None |
| Build artifacts | `data/beeatlas.duckdb` (local dev DuckDB) will be stale after dbt model change — re-run `bash data/dbt/run.sh build` to refresh | Re-run dbt build |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (happy-dom environment) |
| Config file | `vite.config.ts` `test:` section |
| Quick run command | `npm test` (`vitest run`) |
| Full suite command | `npm test` (no separate slow suite) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NORM-01 | dbt contract 37→33, `dbt build` exits 0 | integration (pipeline) | `bash data/dbt/run.sh build` | N/A (dbt, not vitest) |
| NORM-01 | `OCCURRENCE_COLUMNS` excludes dropped column names | unit | `npm test -- --grep "OCCURRENCE_COLUMNS"` | Exists: `filter.test.ts` (needs update) |
| NORM-01 | `OccurrenceRow` type lacks dropped fields | unit (TypeScript) | `npm run typecheck` | Implicit via `tsc --noEmit` |
| NORM-02 | DB byte size + gzip weight + tablesReady timing | manual | See Measurement Procedure above | New: VERIFICATION.md (manual) |
| NORM-03 | `_buildGeoJSONFromRaw` returns `{ geojson }` only, new 7-field layout | unit | `npm test -- --grep "_buildGeoJSONFromRaw"` | Exists: `build-geojson.test.ts` (needs full rewrite) |
| NORM-03 | `queryTablePage` includes `display_name` from JOIN | unit | `npm test -- --grep "queryTablePage"` | Exists: `filter.test.ts` (needs new test) |
| NORM-03 | `bee-table` Species column uses `display_name` field | unit | `npm test -- --grep "bee-table"` | Exists: `bee-table.test.ts` (fixture update) |
| NORM-03 | No remaining `src/` references to dropped column names (grep audit) | audit | `grep -r "scientificName\|specimen_inat_taxon_name" src/ --include="*.ts" \| grep -v test` | Wave 0 script |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test && npm run typecheck`
- **Phase gate:** `npm test && npm run typecheck && bash data/dbt/run.sh build`

### Wave 0 Gaps

- [ ] `src/tests/build-geojson.test.ts` — needs full rewrite for 7-field layout + `{ geojson }` return shape (currently tests the removed 10-field layout and `summary`/`taxaOptions`)
- [ ] New test in `filter.test.ts` — assert `queryTablePage` SQL contains LEFT JOIN taxa and `display_name`
- [ ] Confirm `filter.test.ts:256` (`expect(OCCURRENCE_COLUMNS).toContain('scientificName')`) is updated

---

## Security Domain

> This phase drops columns and restructures queries. No new authentication, sessions, or user-controlled inputs.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Minimal — `taxon_id` is an integer PK from the DB, never user-provided string in the JOIN ON clause | Integer interpolation (existing pattern, T-130-01) |
| V6 Cryptography | No | — |

**No new injection surface:** The JOIN adds `ON t.taxon_id = o.taxon_id` — both sides are DB-origin integers, not user-controlled strings.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| geo_blob includes scientificName/genus/family per point | geo_blob is 7-field positional, name-free | This phase | ~4 MB transfer weight reduction |
| DataSummary carries speciesCount/genusCount/familyCount | DataSummary carries totalSpecimens/earliestYear/latestYear only | This phase | Dead code removed; no rendered behavior change |
| bee-table Species column reads `row.scientificName` | Species column reads `row.display_name` (JOIN-resolved) | This phase | Names resolve correctly for all `taxon_id`-keyed rows |
| `_renderProvisional` reads `row.specimen_inat_taxon_name` | Reads `row.display_name` | This phase | Consistent name source for provisional WABA sample rows |

**Deprecated/outdated after this phase:**
- `_buildGeoJSONFromRaw` summary/taxaOptions return — removed
- `queryFilteredCounts` + `FilteredCounts` — removed (zero consumers)
- `DataSummary.speciesCount/genusCount/familyCount` — removed

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `tablesReady` pre-change baseline is ~250 ms | Measurement Procedure | Measurement in VERIFICATION.md captures the real baseline; risk is documentation only |
| A2 | Average string length per dropped geo_blob column is ~15 bytes → ~4 MB savings | geo_blob rewrite | Actual savings may be higher or lower; VERIFICATION.md captures the real number |

**All structural code claims in this research are VERIFIED against the current codebase by direct file reads and grep.**

---

## Open Questions

1. **`_onDataLoaded` event type after payload trim**
   - What we know: the event type is currently `CustomEvent<{ summary: DataSummary; taxaOptions: TaxonOption[] }>`.
   - What's unclear: whether the planner prefers `CustomEvent<Record<string, never>>`, `CustomEvent<{}>`, or removes the generic entirely.
   - Recommendation: Change to `CustomEvent` (untyped) or a new empty-payload type; the event is a bare signal after D-06.

2. **`queryAllFiltered` (CSV download) JOIN inclusion**
   - What we know: `queryAllFiltered` in `filter.ts:150-170` also uses `OCCURRENCE_COLUMNS.join(', ')`.
   - What's unclear: whether the planner should also add `display_name` to the CSV export (users downloading a CSV would benefit from resolved species names).
   - Recommendation: Yes, add the JOIN to `queryAllFiltered` as well — consistent with the other two page-query functions.

---

## Environment Availability

> Step 2.6 — no new external tools required for this phase. dbt and Python are the existing pipeline tools; Vitest is the existing test runner. No new dependencies.

---

## Sources

### Primary (HIGH confidence — verified by direct file read)
- `data/sqlite_export.py:453-470` — geo_blob build, `_GEO_COLS`, layout comment
- `src/features.ts:1-100` — `_buildGeoJSONFromRaw` decode, layout comment, return shape
- `src/filter.ts:40-90, 150-215, 300-370, 400-460` — `OccurrenceRow`, `OCCURRENCE_COLUMNS`, `queryTablePage`, `queryListPage`, `queryFilteredCounts`
- `src/bee-atlas.ts:345-437, 1015-1043` — `_loadSummaryFromSQLite`, `_onDataLoaded`, `_taxonCache` loading
- `src/bee-table.ts:41-57, 380-386` — `OCCURRENCE_COLUMN_DEFS`, render loop
- `src/bee-occurrence-detail.ts:1-50, 175-254` — `taxonCache` property, `_renderCollectorGroup`, `_renderProvisional`
- `src/bee-pane.ts:55-73, 1192` — `taxonCache` threading, `bee-occurrence-detail` usage
- `src/bee-map.ts:370-467` — `loadOccurrenceGeoJSON` call, `data-loaded` event
- `src/taxa.ts` — `TaxonCacheEntry`, `buildTaxonOptions`, `resolveTaxonDisplayName`
- `data/dbt/models/marts/schema.yml:1-93` — 37-column contract, `taxon_id` not_null test
- `data/dbt/models/marts/occurrences.sql:83-101` — final SELECT
- `data/dbt/models/intermediate/int_specimen_obs_base.sql:1-16` — dead `specimen_inat_genus`/`specimen_inat_family`
- `.planning/phases/131-occurrence-normalization/131-CONTEXT.md` — all D-01 through D-08 decisions
- `.planning/phases/130-map-filter-cutover/130-CONTEXT.md` — D-07/D-08 guardrails
- `vite.config.ts:17-23` — Vitest configuration

### Secondary (MEDIUM confidence)
- grep audit of `src/` non-test files for `scientificName`, `genus`, `family`, `specimen_inat_taxon_name` — confirms CONTEXT.md consumer list is complete, with one addition: `bee-map.ts:733-744` reads checklist.parquet (confirmed unaffected, separate artifact)

---

## Metadata

**Confidence breakdown:**
- Consumer audit: HIGH — grep-verified against current source
- D-07 recommendation: HIGH — code paths traced end-to-end; timing concern verified by `@state` annotation
- geo_blob rewrite: HIGH — both files read directly
- dbt contract mechanics: HIGH — schema.yml read directly; column count verified
- Measurement procedure: MEDIUM — procedure is straightforward; actual numbers captured at execution time

**Research date:** 2026-06-02
**Valid until:** 60 days (stable codebase; no fast-moving dependencies)
