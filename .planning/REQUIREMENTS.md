# Requirements: Washington Bee Atlas

**Defined:** 2026-02-18
**Core Value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.

## v1 Requirements

### Data Pipeline

- [ ] **PIPE-01**: Download script (`data/ecdysis/download.py`) runs end-to-end with `db=164` — main block calls `make_dump`, `argparse` fixed, db parameter passed
- [ ] **PIPE-02**: Occurrences processor (`data/ecdysis/occurrences.py`) produces valid Parquet — `pdb.set_trace()` removed, `__main__` block receives zip path correctly
- [ ] **PIPE-03**: Parquet output includes all fields required for popup and filters — `scientificName`, `family`, `genus`, `specificEpithet`, `year`, `month`, `recordedBy`, `fieldNumber` (host plant/sample identifier)

### Infrastructure

- [ ] **INFRA-01**: S3 bucket and CloudFront distribution defined in CDK TypeScript (`infra/`) using `S3BucketOrigin.withOriginAccessControl()`
- [ ] **INFRA-02**: OIDC IAM role defined in CDK, scoped to `repo:rainhead/beeatlas` — no stored AWS access keys
- [ ] **INFRA-03**: GitHub Actions workflow builds frontend on all pushes; deploys to S3 and invalidates CloudFront on push to `main`

### Map

- [ ] **MAP-01**: Specimen points render as clusters at low zoom levels — existing `clusterStyle` wired to `ol/source/Cluster`
- [ ] **MAP-02**: Clicking a specimen point or cluster shows sample details in a sidebar — species, collector, date, host plant (fieldNumber)

### Filtering

- [ ] **FILTER-01**: User can filter displayed specimens by taxon at species, genus, or family level
- [ ] **FILTER-02**: User can filter displayed specimens by year range

### Navigation

- [ ] **NAV-01**: URL encodes current map view (center, zoom) and active filter state so collectors can share links

## v2 Requirements

### Host Plants

- **PLANT-01**: iNaturalist host plant observations downloaded for Washington Bee Atlas project (pyinaturalist `page='all'`, validated against `total_results`)
- **PLANT-02**: Host plant data converted to `inat.parquet` for frontend consumption
- **PLANT-03**: Toggleable host plant layer on the map (second VectorLayer)

### Navigation

- **NAV-02**: Location search — type a city or county name to pan/zoom (Nominatim/OSM geocoder, no API key)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Tribe-level filtering | Tribe not present in Ecdysis DarwinCore export |
| Server-side API or backend | Static hosting constraint — all data client-side |
| User accounts / saved filters | URL sharing covers the use case |
| Multi-source data (GBIF, OSU Museum) | Experimental; Ecdysis is the specimen source of truth for v1 |
| Real-time data refresh | Static Parquet updated per pipeline run is correct |
| Heat map / analytics | Map is the analytical surface; charts are scope creep |

## Traceability

*Populated during roadmap creation.*

| Requirement | Phase | Status |
|-------------|-------|--------|
| PIPE-01 | — | Pending |
| PIPE-02 | — | Pending |
| PIPE-03 | — | Pending |
| INFRA-01 | — | Pending |
| INFRA-02 | — | Pending |
| INFRA-03 | — | Pending |
| MAP-01 | — | Pending |
| MAP-02 | — | Pending |
| FILTER-01 | — | Pending |
| FILTER-02 | — | Pending |
| NAV-01 | — | Pending |

**Coverage:**
- v1 requirements: 11 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 11 ⚠️

---
*Requirements defined: 2026-02-18*
*Last updated: 2026-02-18 after initial definition*
