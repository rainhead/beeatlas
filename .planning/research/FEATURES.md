# Feature Research

**Domain:** Biodiversity data unification — collapsing two separate occurrence sources into a single unified model
**Researched:** 2026-04-16
**Confidence:** HIGH (derived from first-party codebase analysis; domain conventions consistent with Darwin Core and GBIF occurrence model practices)

## Feature Landscape

### Table Stakes (Users Expect These)

Features that the unified model must preserve or the product regresses.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| All occurrences visible on one layer | Two-layer toggle was a workaround for separate data; unified model makes one layer the natural state | MEDIUM | `EcdysisSource` + `SampleSource` collapse to one `OccurrenceSource`; both style functions survive (cluster for specimen rows, dot for sample-only rows) |
| Map point appearance still conveys record type | Users have learned specimen clusters (recency-colored) vs sample dots (teal); visual distinction must survive the merge | MEDIUM | Three render modes by null pattern: ecdysis_id non-null → cluster; ecdysis_id null → dot; both non-null → cluster (specimen data takes precedence for visual encoding) |
| Sidebar shows all available fields for a clicked point | Users expect to see the full record — not silently truncated | LOW | Conditional section rendering by null pattern; already the pattern for `elevation_m`; extend to source-level sections ("Specimen", "Collection event") |
| Taxon filter still works | Taxon columns exist only on ecdysis rows; filter must not break sample-only rows | LOW | Current D-01 rule (`taxon filter → samplesClauses 1=0`) becomes: taxon clause applied only where `ecdysis_id IS NOT NULL`; sample-only rows excluded when taxon filter active |
| Collector filter still works | Both sources have a collector/observer field; unified model must preserve this | MEDIUM | `buildFilterSQL` currently produces separate `recordedBy` and `observer` clauses; in a unified table: `(recordedBy IN (...) OR observer IN (...))` on a single row |
| URL state preserves selected occurrence across reload | `o=` param encodes selected IDs; format `ecdysis:N` and `inat:N` must remain parseable | LOW | ID assignment rule: `ecdysis:N` when ecdysis_id non-null; `inat:N` when ecdysis_id null; linked rows get `ecdysis:N` |
| Schema gate validates occurrences.parquet | CI must reject deploys with missing or wrong-typed columns | LOW | `validate-schema.mjs` currently checks two files; replace with single `occurrences.parquet` expected-columns check |
| Table view renders all records consistently | `bee-table` currently switches column defs by `layerMode`; unified model removes the hard split | MEDIUM | Single column superset; null cells render as empty/dash; `layerMode` toggle may collapse or become a column-visibility control |
| CSV export includes source provenance | Downloaded CSV must be self-describing about which data source(s) contributed | LOW | Add a `source` derived column (`ecdysis`, `inat`, `linked`) based on null pattern; no additional UI needed |

### Differentiators (Competitive Advantage)

Features that become possible once the data is unified that were impossible or awkward with two separate tables.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Linked record shows specimen + sample data in one sidebar view | A specimen with `host_observation_id` currently requires clicking through to iNat to see the plant; unified detail surfaces plant name, quality grade, and observation link alongside specimen fields | LOW | `inat_host`, `inat_quality_grade`, `host_observation_id` already in ecdysis.parquet and rendered; unification means sample fields (observer, date, specimen_count) also appear in the same panel for linked rows |
| Filter counts reflect true occurrence count | Current summary shows "N specimens / M samples" as separate totals; unified model enables "N occurrences (X with specimens)" | LOW | `DataSummary` and `FilteredSummary` interfaces need new fields; sidebar count display simplifies |
| Cross-source queries unlock future analytics | "How many of my samples have at least one determined specimen?" becomes a single SQL query | MEDIUM | Enables future TAB-03 (common floral hosts by month and region); requires linked rows to carry both specimen and sample columns in the same SQLite row |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Remove layer mode toggle entirely | Unified model implies one layer, one view | Sample-only records (iNat dots) have fundamentally different data density than specimen clusters; rendering them identically loses spatial context about where individual bees vs collection events are | Keep visual distinction between specimen-carrying and sample-only rows; assess whether `layerMode` toggle becomes a "show sample-only events" on/off rather than a layer switch |
| Render all null fields as "unknown" or "not recorded" | Feels complete and explicit | Noisy for sparse records; 9,500 iNat sample rows have no taxon, no collector label, no field number; every null field showing "not recorded" creates cluttered detail views | Omit entire field rows when null; section headers ("Specimen data", "Collection event") collapse when all fields in section are null |
| Merge lat/lon from both sources to a single coordinate | Tempting when both sources are "linked" | Sample coordinates are floral host locations (where the plant was); specimen coordinates are where the bee was caught — usually similar but semantically distinct | Use ecdysis lat/lon for specimen-carrying rows; keep iNat lat/lon for sample-only rows; a single point per occurrence using the most precise available coordinate |
| One unified `occurrences` SQLite table with all 20+ columns via `SELECT *` | Architecturally clean | Mixed-schema rows cause every query to drag unnecessary nulls; filter SQL complexity grows because every clause needs IS NULL guards | Keep explicit SELECT lists; use column null pattern in OL feature properties to drive rendering decisions |

## Feature Dependencies

```
occurrences.parquet (pipeline: full outer join ecdysis + samples on host_observation_id)
    └──required by──> OccurrenceSource (single OL VectorSource)
                          └──required by──> unified OL VectorLayer + style dispatch
                          └──required by──> filter.ts: single occurrencesWhere clause
                          └──required by──> bee-occurrence-detail (unified sidebar component)

occurrences.parquet
    └──required by──> schema gate update (validate-schema.mjs)

filter.ts unified WHERE clause
    └──replaces──> dual {ecdysisWhere, samplesWhere} return type
    └──required by──> queryVisibleIds → single Set<string>
    └──required by──> queryTablePage → single table query
    └──required by──> queryAllFiltered → single table query
    └──required by──> queryFilteredCounts → single table query

bee-occurrence-detail
    └──replaces──> bee-specimen-detail + bee-sample-detail
    └──required by──> bee-sidebar (simplifies: always renders bee-occurrence-detail)

unified OL VectorLayer
    └──required by──> bee-map: removes speicmenLayer / sampleLayer distinction
    └──required by──> bee-atlas: _selectedSamples + _selectedSampleEvent unify
```

### Dependency Notes

- **Join key decision:** The full outer join key is `host_observation_id` (ecdysis) = `observation_id` (iNat). Linked rows have both non-null; `ecdysis_id` takes precedence for OL feature ID and `o=` URL param. Sample-only rows use `inat:N`.

- **buildFilterSQL return type change is a wide blast radius:** Every call site in `filter.ts` that destructures `{ ecdysisWhere, samplesWhere }` must be updated to `{ occurrencesWhere }`. This includes `queryVisibleIds`, `queryTablePage`, `queryAllFiltered`, `queryFilteredCounts`. The test suite for `buildFilterSQL` (13 tests in `filter.test.ts`) must be updated in lockstep.

- **Collector filter cross-source semantics:** `CollectorEntry` has separate `recordedBy` and `observer` fields today. In a unified table, a linked row has both; the WHERE clause becomes `(recordedBy IN (...) OR observer IN (...))`. The collector autocomplete query currently hits `ecdysis` and `samples` separately — needs to become a UNION or a single query against `occurrences` with DISTINCT on both columns.

- **_layerMode on bee-atlas:** Currently drives `'specimens' | 'samples'` for table pagination and CSV export. In the unified model this may become `'all' | 'specimens-only' | 'samples-only'` or be removed entirely. Assess during implementation; do not over-engineer.

## MVP Definition

### Launch With (v2.7)

Minimum viable product — collapse the data model without regressing visible behavior.

- [ ] Pipeline: `export_occurrences_parquet()` full outer join producing `occurrences.parquet`; ecdysis-side or sample-side columns null when that source has no match; `export_ecdysis_parquet()` and `export_samples_parquet()` removed
- [ ] Schema gate: `validate-schema.mjs` EXPECTED updated for `occurrences.parquet`; old file entries removed
- [ ] Frontend SQLite: `loadAllTables()` loads single `occurrences` table; `ecdysis` and `samples` table references renamed or aliased throughout
- [ ] Frontend map: `OccurrenceSource` replaces `EcdysisSource` + `SampleSource`; style dispatches on `ecdysis_id` null status (non-null → cluster, null → dot)
- [ ] Frontend filter: `buildFilterSQL` returns single `{ occurrencesWhere }`; all call sites updated; test suite updated
- [ ] Frontend sidebar: `bee-occurrence-detail` replaces `bee-specimen-detail` + `bee-sample-detail`; renders "Specimen" section when `ecdysis_id` non-null, "Collection event" section when `observation_id` non-null
- [ ] Frontend coordinator: `bee-atlas` unifies `_selectedSamples` + `_selectedSampleEvent` into single `_selectedOccurrence`

### Add After Validation (v2.7.x)

- [ ] Table view: single column set replacing `SPECIMEN_COLUMN_DEFS` / `SAMPLE_COLUMN_DEFS` split; null-cell display
- [ ] CSV export: add `source` derived column
- [ ] Filter counts: `DataSummary` sidebar display updated to "N occurrences" framing

### Future Consideration (v2.8+)

- [ ] Completeness indicator on map points (visual encoding of data richness per record)
- [ ] Source-type filter dimension ("specimen-only", "sample-only", "linked") — low demand until linked record count is larger
- [ ] Collector deduplication improvement — unified model surfaces cross-source name mismatches more clearly but the fix requires pipeline-side person reconciliation

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| occurrences.parquet pipeline join | HIGH | MEDIUM | P1 |
| Schema gate update | HIGH | LOW | P1 |
| OccurrenceSource + style dispatch | HIGH | MEDIUM | P1 |
| buildFilterSQL unified WHERE | HIGH | MEDIUM | P1 |
| bee-occurrence-detail unified sidebar | HIGH | LOW | P1 |
| bee-atlas coordinator unification | HIGH | LOW | P1 |
| Table view unified columns | MEDIUM | MEDIUM | P2 |
| CSV source column | LOW | LOW | P2 |
| Filter counts redesign | MEDIUM | LOW | P2 |
| Completeness indicator (map visual) | MEDIUM | HIGH | P3 |
| Source-type filter dimension | LOW | MEDIUM | P3 |

## Existing Component Inventory (Change Surface)

| Component / Module | Current Role | Change in v2.7 |
|--------------------|-------------|----------------|
| `data/export.py` — `export_ecdysis_parquet()` | Exports ecdysis.parquet (~46k rows, 21 cols) | Replace with `export_occurrences_parquet()` doing full outer join |
| `data/export.py` — `export_samples_parquet()` | Exports samples.parquet (~9.5k rows, 10 cols) | Remove; logic folded into occurrences export |
| `scripts/validate-schema.mjs` | Gates both parquet files | Update EXPECTED for `occurrences.parquet`; remove old entries |
| `frontend/src/features.ts` — `EcdysisSource` | Loads ecdysis rows into OL | Replace with `OccurrenceSource` |
| `frontend/src/features.ts` — `SampleSource` | Loads sample rows into OL | Remove |
| `frontend/src/sqlite.ts` — `loadAllTables()` | Loads two parquet files into two SQLite tables | Load single occurrences.parquet into single `occurrences` table |
| `frontend/src/filter.ts` — `buildFilterSQL()` | Returns `{ecdysisWhere, samplesWhere}` | Return single `{occurrencesWhere}` |
| `frontend/src/filter.ts` — `queryVisibleIds()` | Queries two tables, returns `{ecdysis, samples}` sets | Query one table, return `{occurrences}` set |
| `frontend/src/filter.ts` — `queryTablePage()` | Switches table by layerMode | Single table query; layerMode effect TBD |
| `frontend/src/filter.ts` — `queryAllFiltered()` | Switches table by layerMode | Single table query |
| `frontend/src/filter.ts` — `queryFilteredCounts()` | Queries ecdysis only | Query occurrences WHERE ecdysis_id IS NOT NULL for specimen counts |
| `frontend/src/bee-specimen-detail.ts` | Renders specimen cluster detail | Replace with `bee-occurrence-detail` |
| `frontend/src/bee-sample-detail.ts` | Renders sample event detail | Remove; logic folded into `bee-occurrence-detail` |
| `frontend/src/bee-sidebar.ts` | Switches between specimen/sample detail components | Simplify: always renders `bee-occurrence-detail` |
| `frontend/src/bee-atlas.ts` — `_layerMode` | `'specimens' \| 'samples'` toggle | Assess for removal or semantic change |
| `frontend/src/bee-atlas.ts` — `_selectedSamples` + `_selectedSampleEvent` | Two parallel selection state paths | Unify into single `_selectedOccurrence` |
| `frontend/src/bee-map.ts` — `speicmenLayer` + `sampleLayer` | Two OL VectorLayer instances | Replace with single `occurrenceLayer` |
| `frontend/src/bee-table.ts` | Switches column defs by `layerMode` | Single column set; null cells display as dash |
| `frontend/src/style.ts` | `makeClusterStyleFn` + `makeSampleDotStyleFn` | Unified style dispatches on `ecdysis_id` null status |
| `frontend/src/tests/filter.test.ts` | 13 tests for `buildFilterSQL` (dual WHERE) | Must update to test single `occurrencesWhere` |

## Sources

- First-party codebase analysis: `features.ts`, `filter.ts`, `bee-specimen-detail.ts`, `bee-sample-detail.ts`, `bee-sidebar.ts`, `bee-atlas.ts`, `bee-table.ts`, `export.py`, `validate-schema.mjs`
- Darwin Core occurrence standard: column nullability, full outer join as canonical merge pattern for multi-source occurrence data (HIGH confidence — well-established standard)
- GBIF occurrence model: specimen records, human observation records, and combined records are standard types; null columns per source are the accepted representation (HIGH confidence)

---
*Feature research for: BeeAtlas v2.7 — Unified Occurrence Model*
*Researched: 2026-04-16*
