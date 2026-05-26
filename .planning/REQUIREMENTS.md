# Milestone v4.2 Requirements: iNaturalist Expert Observations

## Pipeline & Data Model

- [x] **PIPE-01**: Pipeline ingests committed iNat CSV export into `inat_obs_data.observations` DuckDB staging table; 12 columns: `obs_id`, `observed_on`, `lat`, `lon`, `canonical_name`, `scientific_name`, `user_login`, `image_url`, `license`, `floral_host`, `quality_grade`, `obs_url`
- [x] **PIPE-02**: `canonical_name` resolved by applying the D-04 canonicalization algorithm (`data/canonical_name.py`) to `scientific_name` from the CSV
- [x] **PIPE-03**: Rows whose `id` matches an existing `specimen_observation_id` in the Ecdysis dbt model are excluded from `inat_obs_data.observations` (deduplicate against Ecdysis-linked obs)
- [x] **PIPE-04**: `floral_host` populated from the "field:associated species with names lookup" column (raw value stored; NULL when absent)
- ~~**PIPE-05**~~: *(superseded)* A separate `inat_obs.parquet` is not published. iNat obs reach the frontend via `occurrences.parquet` as ARM 3 (see OCC-01).
- [ ] **OCC-01**: `int_combined` gains ARM 3 from `inat_obs_data.observations`; `occurrences.parquet` gains a `source` column (`'ecdysis'`, `'waba_sample'`, `'inat_obs'`) and iNat-specific nullable columns (`image_url`, `obs_url`, `user_login`, `license`); dbt column contract expands accordingly
- [ ] **OCC-02**: `int_species_universe` tracks `inat_obs_count` as a distinct column (separate from `specimen_count` and `occurrence_count`)
- [ ] **OCC-03**: `species.parquet` / `species.json` export includes `inat_obs_count` per species

## Map Display & Source Filter

- [ ] **MAP-01**: Expert iNat observations render as points on the Mapbox map with a visual style distinct from Ecdysis specimen clusters and WABA sample points
- [ ] **MAP-02**: Source filter in the filter panel allows showing/hiding occurrences by source (Ecdysis specimens, WABA samples, iNat expert observations) independently
- [ ] **MAP-03**: Source filter state is encoded in the URL and restored on page load

## Occurrence Detail View

- [ ] **DET-01**: Clicking an expert iNat observation in the occurrence detail view shows: observer login, observed date, floral host (if present), image (if CC-licensed), and a link to the observation on iNaturalist.org

## Species Pages

- [ ] **SPE-01**: Species-detail pages display "N specimens · N community observations" in place of the single "N records" label; `specimen_count` drives the first figure, `inat_obs_count` the second
- [ ] **SPE-02**: Genus, subgenus, and tribe pages show the same source-aware count breakdown per species entry
- [ ] **SPE-03**: `species.json` export includes a list of `{ url, license }` objects per species from expert iNat observations (no display change this milestone; data stored for future carousel)

---

## Future Requirements

- [ ] **PIPE-F01**: nightly.sh auto-refresh — export query run on schedule, new CSV ingested automatically (manual periodic export is the v4.2 design)
- [ ] **PIPE-F02**: Floral host taxonomy resolution — canonicalize `floral_host` to a plant `canonical_name` for structured querying
- [ ] **MAP-F01**: Filter by observer — show only observations by a specific user_login
- [ ] **MAP-F02**: Quality grade as a secondary filter (research / needs_id / casual)
- [ ] **SPE-F01**: Photo carousel on species pages using stored `image_url` values

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Automated CSV export via iNat API | Manual periodic export is the deliberate design; avoids API dependency and auth complexity |
| Photo carousel UI | Deferred to a dedicated milestone; photos stored for future use |
| Associating iNat obs with WABA sample plant observations | "Associated species" = floral host, not WABA sample link; WABA association is via specimen_observation_id deduplication only |
| iNat obs for non-bee taxa or non-WA geoprivacy | Export query constrains to taxon_id=630955 (Anthophila) and geoprivacy=open in Washington |
| All observation identifications / ID history | MVP shows current community ID only |

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| PIPE-01 | Phase 117 | Complete |
| PIPE-02 | Phase 117 | Complete |
| PIPE-03 | Phase 117 | Complete |
| PIPE-04 | Phase 117 | Complete |
| PIPE-05 | — | Superseded by OCC-01 |
| OCC-01 | Phase 118 | Pending |
| OCC-02 | Phase 118 | Pending |
| OCC-03 | Phase 118 | Pending |
| MAP-01 | Phase 119 | Pending |
| MAP-02 | Phase 119 | Pending |
| MAP-03 | Phase 119 | Pending |
| DET-01 | Phase 119 | Pending |
| SPE-01 | Phase 120 | Pending |
| SPE-02 | Phase 120 | Pending |
| SPE-03 | Phase 120 | Pending |
