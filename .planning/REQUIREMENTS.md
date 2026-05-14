# Milestone v3.4 Requirements — dbt Full Rewrite

**Milestone goal:** Cut over the BeeAtlas data pipeline from `data/export.py` + ad-hoc Python transforms to `data/dbt/` as the canonical producer of `occurrences.parquet`, `counties.geojson`, `ecoregions.geojson`, `species.json`, and the species count artifacts. After v3.4, `dbt build` is the only way these outputs are produced. `_apply_migrations()` and `scripts/validate-schema.mjs` are retired; their invariants live in dbt contracts and tests. The frontend continues to consume an unchanged `occurrences.parquet` schema (slimmed from 33 to 30 columns by dropping three unused `specimen_inat_*` fields).

**Risk posture:** Solo user — breakage during cutover is acceptable. Safety nets during the transition: the `data/tests/test_dbt_diff.py` harness from v3.3 stays as the merge gate, the 30-column dbt contract is the runtime gate post-cutover.

**Scope discipline:** This is a *rewrite* milestone, not a *feature* milestone. No new user-facing capability. Requirements describe internal pipeline structure and cutover mechanics.

## Out of Scope

| Item | Reason |
|------|--------|
| New end-user features | This is an internal pipeline rewrite |
| `samples.parquet` as a separate output | Single `occurrences.parquet` remains canonical (decided in v3.3) |
| 84-row ST_Within county-boundary nondeterminism | Deferred; documented as known semantic divergence in both implementations |
| Anti-entropy / ingestion | dlt pipelines stay in Python; dbt consumes them as `source()` declarations |
| Multi-state expansion | Still future |
| Nightly-failure notification | Captured at `.planning/todos/pending/nightly-run-failure-notification.md` — natural follow-on after `nightly.sh` is rewritten |
| `is_provisional` → `source_type` enum refactor | Considered and deferred; would require coordinated frontend change |
| Frontend changes | `occurrences.parquet` schema stays stable from the frontend's perspective; only the 3 unused columns are dropped |

## v3.4 Requirements

### Port Remaining Transforms (PORT)

- [ ] **PORT-01**: `data/species_export.py` (producing `species.json` + species count artifacts) is replaced by dbt models with declared `ref()` / `source()` dependencies. The species universe query (currently `COALESCE(checklist.scientificName, occurrences.canonical_name)`) is expressed as a dbt model; per-species count rollups (county_count, ecoregion_count, recency tiers) live in dbt marts. Outputs are byte-comparable to current `public/data/species.json`.
- [ ] **PORT-02**: The occurrence-links derivation (currently the Ecdysis HTML-scraping post-step that populates `specimen_observation_id`) is expressed as a dbt model that consumes raw scraped HTML via `source()` and emits the link mapping as a dbt model. Python scraping remains (it's ingestion), but the *join + projection* into occurrences becomes dbt.
- [ ] **PORT-03**: Taxon-lineage enrichment (currently `enrich_taxon_lineage_extended` Python module) is expressed as dbt models. The bridge table population (resolve-taxon-ids) and the UNION arm that walks the bridge live as dbt sources / models. LIN-05 coverage (≥0.95 ratio) is enforced via a dbt test.
- [ ] **PORT-04**: `resolve_taxon_ids.py` is audited and a porting decision recorded. If the logic is SQL-shaped, port to a dbt model. If it requires iNat API calls (Python-shaped ingestion), leave it as a dlt-adjacent pipeline step and declare the explicit ingestion-vs-transform boundary in the dbt sources.yml.

### Production Cutover (CUTOVER)

- [ ] **CUTOVER-01**: `data/run.py` invokes `bash data/dbt/run.sh build` (or equivalent) instead of `export.py` and `species_export.py`. After cutover, the only Python in the transform path is dlt ingestion. `data/run.py` exits non-zero on dbt failure with a useful error message.
- [ ] **CUTOVER-02**: `_apply_migrations()` is deleted. Every invariant it enforced is verifiably covered by a dbt contract column, generic test, or singular test. A side-by-side comparison documenting each migration → dbt-replacement mapping is recorded in the phase summary.
- [ ] **CUTOVER-03**: `scripts/validate-schema.mjs` is deleted, the `validate-schema` npm script is removed from `package.json`, the `npm run build` chain no longer references it, and the GitHub Actions workflow is updated accordingly. The dbt 30-column contract on `occurrences` is the sole schema gate.
- [ ] **CUTOVER-04**: `data/nightly.sh` is restructured to interpret dbt exit codes correctly. Either (a) the v3.3 awkward-fit tests are resolved per TEST-01/02 below and dbt exits 0 cleanly, or (b) `dbt build --exclude test:<known-fail>` is used with the excluded tests documented inline. The script distinguishes "true failure" from "documented awkward-fit" without ambiguity.

### Test Surface Resolution (TEST)

- [ ] **TEST-01**: The `stg_inat__observations.id` `not_null` awkward-fit (1 null id) is resolved by one of: (a) filtering the null row at staging with a documented WHERE clause, (b) fixing the iNat pipeline upstream to ensure non-null IDs, or (c) converting the failing test into a singular tripwire test whose intentional failure is excluded from `dbt build` exit semantics. The chosen approach and rationale are recorded.
- [ ] **TEST-02**: The `int_ecdysis_base.ecdysis_id` `relationships` cross-type ERROR (DuckDB cannot auto-cast `WSDA_2303966` VARCHAR to INT32) is resolved by replacing the generic `relationships` test with a custom singular test that performs an explicit `CAST(ecdysis_id AS VARCHAR) = catalog_number` check. The new test passes against production data.
- [x] **TEST-03**: `materialized='incremental'` is tested on dbt-duckdb with external materializations on at least one model in the slice (a known unknown in v3.3 findings). Observed behavior — does incremental work? does it actually speed up nightly builds? — is documented. If incremental does not work for external materializations, the limitation is documented and the cron continues to run full rebuilds.

### Artifact Cleanup (CLEAN)

- [ ] **CLEAN-01**: The `emit_feature_collection` Jinja macro using `FORMAT CSV, DELIMITER '', QUOTE '', HEADER false` is replaced. Acceptable alternatives: (a) `FORMAT GDAL, DRIVER 'GeoJSON'` if output is byte-comparable to current `counties.geojson` / `ecoregions.geojson`, or (b) a Python post-hook that reads the dbt model output and writes GeoJSON via `json.dumps()`. The replacement is documented and the diff harness confirms output parity.
- [ ] **CLEAN-02**: Drop `specimen_inat_login`, `specimen_inat_family`, `specimen_inat_genus` from `occurrences.parquet`. The dbt `marts/occurrences` model SELECT no longer projects them, the `schema.yml` contract is updated from 33 columns to 30, and `src/sqlite.ts` lines 88–92 column declarations are removed. Frontend tests pass; the column-drop is verified by `data/tests/test_dbt_diff.py` schema assertion (which will need updating to reflect the new 30-column contract — this is intentional, not a regression).

### Transitional Validation (VALIDATE)

- [ ] **VALIDATE-01**: Until cutover (CUTOVER-01), `data/tests/test_dbt_diff.py` continues to pass against current `public/data/` outputs. This catches silent regressions in dbt models during port phases. The test is updated for the 30-column schema once CLEAN-02 lands. **At cutover this requirement becomes vacuous** (both sides come from dbt) and the diff harness is retired or repurposed as a regression fixture.
- [ ] **VALIDATE-02**: At cutover, `occurrences.parquet` produced by dbt loads cleanly into the wa-sqlite frontend without any frontend code change beyond the 3 dropped columns in `src/sqlite.ts`. End-to-end smoke check: `npm run dev`, observe map renders, filters work, table populates, species page works. Documented in cutover phase summary.

## Future Requirements

(Conditional on v3.4 outcomes — to be defined in v3.5+ if observations warrant.)

- `is_provisional` → `source_type` enum refactor (3-way: `ecdysis_specimen` / `inat_sample` / `provisional_waba`) with coordinated frontend change.
- Host-field rationalization (`floralHost` / `sample_host` / `inat_host` / `host_inat_login` / `recordedBy`).
- 84-row ST_Within county-boundary nondeterminism fix (`SELECT MIN(county)` or explicit fallback).
- Nightly-run failure notification (Healthchecks.io-style dead-man's switch).
- Multi-state expansion (`STATE_FIPS` configurable, county/ecoregion loaders parameterized).
- Resolution of 077/081/082 verification + UAT gaps deferred from v3.2.

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| PORT-01 | Phase 86 | Pending |
| PORT-02 | Phase 86 | Pending |
| PORT-03 | Phase 86 | Pending |
| PORT-04 | Phase 86 | Pending |
| CUTOVER-01 | Phase 88 | Pending |
| CUTOVER-02 | Phase 88 | Pending |
| CUTOVER-03 | Phase 88 | Pending |
| CUTOVER-04 | Phase 88 | Pending |
| TEST-01 | Phase 85 | Pending |
| TEST-02 | Phase 85 | Pending |
| TEST-03 | Phase 87 | Complete |
| CLEAN-01 | Phase 85 | Pending |
| CLEAN-02 | Phase 85 | Pending |
| VALIDATE-01 | Phase 86 | Pending |
| VALIDATE-02 | Phase 88 | Pending |

**Coverage:** 15 requirements covering all 9 PROJECT.md deliverables plus 2 transitional safety-net requirements. Phase assignments will be filled in by the roadmapper.
