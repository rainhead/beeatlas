# Requirements: Washington Bee Atlas

**Defined:** 2026-03-11
**Core Value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.

## v1.3 Requirements

Requirements for the Specimen-Sample Linkage milestone. Each maps to roadmap phases.

### Links Pipeline (LINK)

- [x] **LINK-01**: Pipeline reads all occurrenceIDs from `ecdysis_wa.parquet` and fetches each Ecdysis individual record page at max 20 req/sec, caching raw HTML to disk
- [x] **LINK-02**: Pipeline skips HTTP fetch for occurrenceIDs already present in `links.parquet` (first-level skip) or already in the local HTML cache (second-level skip, parse without fetching)
- [x] **LINK-03**: Pipeline extracts iNat observation ID from `#association-div a[target="_blank"]` href; records null if the element is absent
- [x] **LINK-04**: Pipeline produces `links.parquet` with columns `occurrenceID` (string) and `inat_observation_id` (Int64, nullable), covering all occurrenceIDs

### S3 Cache (LCACHE)

- [x] **LCACHE-01**: Pipeline restores `links.parquet` from S3 at build start (graceful miss); syncs HTML cache directory from S3 using `aws s3 sync` (downloads only missing files)
- [x] **LCACHE-02**: Pipeline uploads `links.parquet` to S3 and syncs HTML cache to S3 (`aws s3 sync`, uploads only new files) after successful run
- [x] **LCACHE-03**: npm scripts expose `cache-restore-links`, `fetch-links`, and `cache-upload-links` as top-level commands

### Pipeline Integration (PIPE)

- [x] **PIPE-04**: `build-data.sh` includes the links pipeline steps (cache restore → fetch → cache upload)

## Future Requirements

### Frontend Display

- **MAP-03**: Sample markers (iNat collection events) rendered as a distinct layer on the map
- **MAP-04**: Clicking a sample marker shows the iNat observation details in the sidebar
- **LINK-05**: Sidebar shows iNat observation link for a clicked specimen when a linkage exists

## Out of Scope

| Feature | Reason |
|---------|--------|
| Frontend display of specimen-sample links | Deferred to v1.4 — pipeline must exist before UI can consume it |
| Re-fetching already-cached links | Links are permanent; cached once, never re-fetched |
| iNat API-based linkage | Symbiota (Ecdysis) has no associations API; HTML scraping confirmed as only method |
| OR project (id=18521) | Out of scope; stub exists in projects.py |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| LINK-01 | Phase 11 | Complete |
| LINK-02 | Phase 11 | Complete |
| LINK-03 | Phase 11 | Complete |
| LINK-04 | Phase 11 | Complete |
| LCACHE-01 | Phase 12 | Complete |
| LCACHE-02 | Phase 12 | Complete |
| LCACHE-03 | Phase 12 | Complete |
| PIPE-04 | Phase 12 | Complete |

**Coverage:**
- v1.3 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 after roadmap creation (v1.3 Phase 11–12)*
