# Requirements: Washington Bee Atlas v4.0

**Defined:** 2026-05-23
**Core Value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.

## v4.0 Requirements

### TAX — Offline Taxonomy

- [ ] **TAX-01**: Pipeline downloads `taxa.csv.gz` from iNat AWS Open Data with ETag/Last-Modified caching; no re-download when archive is unchanged
- [ ] **TAX-02**: DuckDB ancestry walk via `unnest(string_split(ancestry,'/'))` produces `taxon_lineage_extended` with identical schema to current (family, subfamily, tribe, genus, subgenus per taxon_id)
- [x] **TAX-03**: Live `/v2/taxa` enricher functions removed from pipeline; `dbt build` and `npm test` pass after deletion
- [ ] **TAX-04**: Taxa archive cached at `data/raw/taxa.csv.gz`; synced to/from S3 by `nightly.sh` to persist across nightly runs

### CHECK — Checklist Pipeline

- [ ] **CHECK-01**: Pipeline reads committed checklist CSV, parses specific epithet from Scientific Name (strips author+year), normalizes date formats, applies TRIM() to varchar fields, spatial-joins county and ecoregion_l3
- [ ] **CHECK-02**: `checklist.parquet` produced with columns: `canonical_name, scientificName, genus, specific_epithet, family, lat (nullable), lon (nullable), year (nullable), month (nullable), county, ecoregion_l3, source='checklist'`
- [ ] **CHECK-03**: `checklist.parquet` uploaded to S3/CloudFront as part of nightly pipeline export
- [ ] **CHECK-04**: Pytest assertions pass: row count ≥ 2000, no null `canonical_name`, no null `specific_epithet`, `TRIM(family) = family`

### MAP — Checklist Map Layer

- [ ] **MAP-01**: "Checklist records" toggle appears in filter panel alongside Specimens and Samples toggles
- [ ] **MAP-02**: When enabled, checklist records render as clustered points visually distinct from WABA specimens; records without coordinates excluded from map layer
- [ ] **MAP-03**: Checklist layer responds to taxon, year, and month filters (same filter surface as other layers)
- [ ] **MAP-04**: `cl=1` URL param encodes checklist layer visibility; restored on page load

### SPEC — Species Page Expansion

- [ ] **SPEC-01**: All 565 checklist species appear in the species index and have dedicated taxon pages, including species with zero WABA records
- [ ] **SPEC-02**: Checklist-only species appear on genus and subgenus pages alongside WABA species
- [ ] **SPEC-03**: Species pages show occurrence map including checklist record points (visually distinct from WABA occurrence points)
- [ ] **SPEC-04**: Species pages show attribution for checklist records: "N checklist records · Bartholomew et al. 2024"
- [ ] **SPEC-05**: Seasonality histogram draws from all sources (WABA + checklist); suppressed only when the species has zero records from any source

### EXT — Extensibility

- [ ] **EXT-01**: `source='checklist'` column present in `checklist.parquet`; pipeline architecture documented to support future sources (other Bee Atlas programs, GBIF) as additional parquet files with the same `source` field convention

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
| TAX-01 | Phase 110 | Pending |
| TAX-02 | Phase 110 | Pending |
| TAX-03 | Phase 110 | Complete |
| TAX-04 | Phase 110 | Pending |
| CHECK-01 | Phase 111 | Pending |
| CHECK-02 | Phase 111 | Pending |
| CHECK-03 | Phase 111 | Pending |
| CHECK-04 | Phase 111 | Pending |
| EXT-01 | Phase 111 | Pending |
| MAP-01 | Phase 112 | Pending |
| MAP-02 | Phase 112 | Pending |
| MAP-03 | Phase 112 | Pending |
| MAP-04 | Phase 112 | Pending |
| SPEC-01 | Phase 113 | Pending |
| SPEC-02 | Phase 113 | Pending |
| SPEC-03 | Phase 113 | Pending |
| SPEC-04 | Phase 113 | Pending |
| SPEC-05 | Phase 113 | Pending |

**Coverage:**
- v4.0 requirements: 18 total
- Mapped to phases: 18 (100%)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-23*
*Last updated: 2026-05-23 — traceability complete after roadmap creation*
