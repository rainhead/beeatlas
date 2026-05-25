# Requirements: Washington Bee Atlas v4.0

**Defined:** 2026-05-23
**Core Value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.

## v4.0 Requirements

### TAX — Offline Taxonomy

- [x] **TAX-01**: Pipeline downloads `taxa.csv.gz` from iNat AWS Open Data with ETag/Last-Modified caching; no re-download when archive is unchanged
- [x] **TAX-02**: DuckDB ancestry walk via `unnest(string_split(ancestry,'/'))` produces `taxon_lineage_extended` with identical schema to current (family, subfamily, tribe, genus, subgenus per taxon_id)
- [x] **TAX-03**: Live `/v2/taxa` enricher functions removed from pipeline; `dbt build` and `npm test` pass after deletion
- [x] **TAX-04**: Taxa archive cached at `data/raw/taxa.csv.gz`; synced to/from S3 by `nightly.sh` to persist across nightly runs

### CHECK — Checklist Pipeline

- [x] **CHECK-01**: Pipeline reads committed checklist CSV, parses specific epithet from Scientific Name (strips author+year), normalizes date formats, applies TRIM() to varchar fields, spatial-joins county and ecoregion_l3
- [x] **CHECK-02**: `checklist.parquet` produced with columns: `canonical_name, scientificName, genus, specific_epithet, family, lat (nullable), lon (nullable), year (nullable), month (nullable), county, ecoregion_l3, source='checklist'`
- [x] **CHECK-03**: `checklist.parquet` uploaded to S3/CloudFront as part of nightly pipeline export
- [x] **CHECK-04**: Pytest assertions pass: row count ≥ 2000, no null `canonical_name`, no null `specific_epithet`, `TRIM(family) = family`

### MAP — Checklist Map Layer

- [x] **MAP-01**: "Checklist records" toggle appears in filter panel alongside Specimens and Samples toggles
- [x] **MAP-02**: When enabled, checklist records render as a county-fill overlay (green fill on counties GeoJSON source), visually distinct from WABA specimen points; county presence derived from checklist.parquet coordinates
- [x] **MAP-03**: Checklist layer responds to taxon filter only; year, month, and collector filters have no effect on the checklist layer
- [x] **MAP-04**: `cl=1` URL param encodes checklist layer visibility; restored on page load

### SPEC — Species Page Expansion

- [x] **SPEC-01**: All 565 checklist species appear in the species index and have dedicated taxon pages, including species with zero WABA records
- [x] **SPEC-02**: Checklist-only species appear on genus and subgenus pages alongside WABA species
- [x] **SPEC-03**: Species pages show occurrence map including checklist record points (visually distinct from WABA occurrence points)
- [x] **SPEC-04**: Species pages show attribution for checklist records: "N checklist records · Bartholomew et al. 2024"
- [x] **SPEC-05**: Seasonality histogram draws from all sources (WABA + checklist); suppressed only when the species has zero records from any source

### EXT — Extensibility

- [x] **EXT-01**: `source='checklist'` column present in `checklist.parquet`; pipeline architecture documented to support future sources (other Bee Atlas programs, GBIF) as additional parquet files with the same `source` field convention

## Future Requirements

### Data Sources

- **FUTURE-01**: GBIF records for WA bees as additional occurrence source
- **FUTURE-02**: Ecdysis records from other state/regional Bee Atlas programs
- **FUTURE-03**: OSU or other regional museum specimen collections

### Checklist Layer Enhancements

- **FUTURE-04**: GPS-level point display for historical records with sub-county precision
- **FUTURE-05**: Collector names on species pages for checklist records
- **FUTURE-06**: CSV export including checklist records

## Out of Scope

| Feature | Reason |
|---------|--------|
| Showing checklist records in table view | Table is WABA-only; checklist records have different provenance and fields |
| Per-record detail on checklist point click | Historical records have limited metadata; locality string not useful for volunteers |
| Nightly re-download of checklist CSV | Published paper dataset; one-time static import is appropriate |
| iNat DwC-A zip archive | AWS Open Data `taxa.csv.gz` is the correct source — has `ancestry` column; DwC-A uses URL-form IDs and lacks subfamily/tribe |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TAX-01 | Phase 110 | Complete |
| TAX-02 | Phase 110 | Complete |
| TAX-03 | Phase 110 | Complete |
| TAX-04 | Phase 110 | Complete |
| CHECK-01 | Phase 111 | Complete |
| CHECK-02 | Phase 111 | Complete |
| CHECK-03 | Phase 111 | Complete |
| CHECK-04 | Phase 111 | Complete |
| EXT-01 | Phase 111 | Complete |
| MAP-01 | Phase 112 | Complete |
| MAP-02 | Phase 112 | Complete |
| MAP-03 | Phase 112 | Complete |
| MAP-04 | Phase 112 | Complete |
| SPEC-01 | Phase 113 | Complete |
| SPEC-02 | Phase 113 | Complete |
| SPEC-03 | Phase 113 | Complete |
| SPEC-04 | Phase 113 | Complete |
| SPEC-05 | Phase 113 | Complete |

**Coverage:**
- v4.0 requirements: 18 total
- Mapped to phases: 18 (100%)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-23*
*Last updated: 2026-05-23 — traceability complete after roadmap creation*
