# Requirements: v2.8 Liveness — Provisional Specimen Records

## Milestone Goal

Surface specimen-adjacent records that exist before Ecdysis ingestion, giving the map a feeling of live activity.

## v1 Requirements

### PROV — Provisional Specimen Records (Pipeline)

- [x] **PROV-01**: `waba_pipeline.py` DEFAULT_FIELDS includes OFV field_id 1718 (associated observation URL); value persisted in `inaturalist_waba_data.observations__ofvs` — validated Phase 66
- [x] **PROV-02**: `export.py` adds WABA provisional rows to `occurrences.parquet` — WABA observations with no Ecdysis catalog-number match (not matched via `waba_link`); these rows have `ecdysis_id = null` and `is_provisional = true` — validated Phase 66
- [x] **PROV-03**: Provisional rows carry `scientificName`, `genus`, and `family` derived from the iNat taxon; `specimen_observation_id` = the WABA observation ID itself; `observer` = iNat user login (column named `specimen_inat_login`) — validated Phase 66
- [x] **PROV-04**: Provisional rows with OFV 1718 populated carry `host_observation_id` parsed from the associated observation URL; where the host observation is a known sample, sample context columns (`specimen_count`, `sample_id`) are populated via join to `samples_base` — validated Phase 66
- [x] **PROV-05**: `occurrences.parquet` schema gains `is_provisional BOOLEAN` column; `validate-schema.mjs` updated; 2 pytest integration tests confirm provisional rows appear in export and are excluded when a catalog-number Ecdysis match exists — validated Phase 66

### SID — Sidebar Display

- [ ] **SID-01**: `bee-occurrence-detail` renders sample-only rows (`ecdysis_id` null, `is_provisional` falsy) with an "identification pending" label; specimen count displayed as "N specimens collected"
- [ ] **SID-02**: `bee-occurrence-detail` renders WABA provisional rows (`is_provisional` true) with a provisional identification label and a link to the WABA observation (`specimen_observation_id`); 1 Vitest render test covers this row type

## Future Requirements

- Distinct map rendering for provisional/undetermined rows (deferred — no special treatment in v2.8)
- Filter by determination status (provisional / identified / pending)
- iNat identification agreement counts in sidebar (num_identification_agreements / num_identification_disagreements)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Special map symbols for provisional rows | Not needed in v2.8 per user decision |
| Determination status filter | Separate capability, deferred |
| iNat community ID confidence display | Deferred to future milestone |

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| PROV-01 | Phase 66 | Complete |
| PROV-02 | Phase 66 | Complete |
| PROV-03 | Phase 66 | Complete |
| PROV-04 | Phase 66 | Complete |
| PROV-05 | Phase 66 | Complete |
| SID-01 | Phase 67 | Pending |
| SID-02 | Phase 67 | Pending |
