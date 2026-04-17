# Requirements — v2.7 Unified Occurrence Model

## Milestone Goal

Collapse separate ecdysis/iNat parquet files and frontend layers into a single `occurrences.parquet`. Column nullability conveys which sources contributed to each row.

---

## Active Requirements

### Pipeline

- [ ] **OCC-01**: `export.py` produces `occurrences.parquet` from a full outer join of ecdysis specimens and iNat samples; specimen-side columns are null for sample-only rows; sample-side columns are null for specimen-only rows; `validate-schema.mjs` updated in the same commit
- [ ] **OCC-03**: COALESCE unifies coordinate columns (`ecdysis.lat`/`lon` vs `samples.latitude`/`longitude`) into canonical `lat`/`lon`; `date` column standardized to VARCHAR ISO format in export SQL

### Frontend — Data Layer

- [ ] **OCC-05**: `sqlite.ts` loads `occurrences.parquet` into a single `occurrences` SQLite table; `ecdysis` and `samples` tables removed
- [ ] **OCC-06**: `buildFilterSQL` returns a single WHERE clause string for the `occurrences` table; `queryVisibleIds`, `queryTablePage`, `queryAllFiltered`, `queryFilteredCounts` all updated; all existing filter tests pass with unified table
- [ ] **OCC-07**: `OccurrenceSource` replaces `EcdysisSource` and `SampleSource`; OL feature IDs follow existing convention (`ecdysis:<int>` for specimen-backed rows, `inat:<int>` for sample-only rows)

### Frontend — UI

- [ ] **OCC-08**: `<bee-occurrence-detail>` component replaces `<bee-specimen-detail>` and `<bee-sample-detail>`; renders specimen columns, sample columns, or both based on nullability (null-omit pattern)
- [ ] **OCC-09**: `bee-atlas` coordinator and `bee-map` updated for single occurrence layer; `layerMode` toggle removed or simplified to eliminate layer-switching behavior
- [ ] **OCC-10**: `<bee-table>` updated for unified `occurrences` schema; specimen vs sample column sets merged into unified column display

---

## Future Requirements

- Post-export row-count assertions (verify no unlinked specimens dropped, no join fanout duplication) — deferred; can be added as a follow-up
- Sample-only elevation from DEM pipeline — iNat samples have coordinates but elevation_m is always null; requires separate DEM sampling work
- Collector filter UI unification (currently two separate filter paths for `recordedBy` and `observer`) — implicit in OCC-06 but collector autocomplete UI unchanged for now

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Source-type filter dimension | Not needed — taxon filter already excludes sample-only rows naturally |
| Completeness indicator badge | Over-engineering; null columns convey completeness already |
| CSV `source` column | Cosmetic; deferred to post-v2.7 |
| S3 cleanup of old parquet files | Operational task; out of scope for this milestone |

---

## Traceability

| REQ-ID | Phase | Plans |
|--------|-------|-------|
| OCC-01 | — | — |
| OCC-03 | — | — |
| OCC-05 | — | — |
| OCC-06 | — | — |
| OCC-07 | — | — |
| OCC-08 | — | — |
| OCC-09 | — | — |
| OCC-10 | — | — |
