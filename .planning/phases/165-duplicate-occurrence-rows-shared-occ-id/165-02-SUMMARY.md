---
phase: 165-duplicate-occurrence-rows-shared-occ-id
plan: "02"
subsystem: data-pipeline
tags: [dbt, occ-id, dedup, int_combined, waba_specimen, waba_sample, catalog-match, D-05]
dependency_graph:
  requires:
    - 165-01 (test_no_duplicate_occ_ids witness gate)
  provides:
    - data/dbt/models/intermediate/int_waba_link.sql (1:N catalog-match, D-05 fix)
    - data/dbt/models/intermediate/int_ecdysis_base.sql (fan-out guard on waba_link consumer)
    - data/dbt/models/intermediate/int_matched_waba_ids.sql (full set of matched waba_obs_ids)
    - data/dbt/models/intermediate/int_provisional_waba_ids.sql (project-166376 membership, D-03)
    - data/dbt/models/intermediate/int_combined.sql (five-arm model: ecdysis/waba_sample/waba_specimen/inat_obs/checklist)
  affects:
    - dbt build (full, 36-col contract)
    - test_no_duplicate_occ_ids (was 4 rows → 2 rows; Shapes A+B gone, Shape C remains)
tech_stack:
  added: []
  patterns:
    - dbt UNION ALL with explicit ARM numbering and per-column type casts for UNION safety
    - Fan-out guard: 1:N join de-duplicated at consumer via MIN() subquery (not at source)
    - Anti-join pattern for category boundaries (project members NOT IN int_samples_base)
key_files:
  created: []
  modified:
    - data/dbt/models/intermediate/int_waba_link.sql
    - data/dbt/models/intermediate/int_matched_waba_ids.sql
    - data/dbt/models/intermediate/int_ecdysis_base.sql
    - data/dbt/models/intermediate/int_provisional_waba_ids.sql
    - data/dbt/models/intermediate/int_combined.sql
    - data/dbt/models/intermediate/schema.yml
    - data/dbt/models/sources.yml
decisions:
  - "D-05 MIN() removed from int_waba_link — fan-out guard at int_ecdysis_base consumer (MIN subquery) prevents ARM 1 multiplication"
  - "int_provisional_waba_ids redefined on project_id=166376 membership anti-join int_samples_base (~28 mappable rows)"
  - "waba_sample ARM now projects plant/sample columns only — canonical_name/taxon_id NULL (D-08/D-11)"
  - "waba_specimen is the NEW source='waba_specimen' arm (the 33) — is_provisional=FALSE, occ_id=inat_obs:N, carries bee species + obs_url"
  - "obs_url='https://www.inaturalist.org/observations/'||sob.waba_obs_id (D-10 — surface iNat link)"
  - "sources.yml: added observations__observation_projects to inaturalist_data source list (was missing)"
  - "Shape C (ecdysis:6317352/6317353 OFV fan-out) left as warn; backlog item recommended"
metrics:
  duration: "~6 minutes"
  completed: "2026-06-24"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 7
---

# Phase 165 Plan 02: Core Data-Model Correction Summary

Three-arm correction to `int_combined` that eliminates occ_id collision Shapes A and B at the data layer. Removes MIN() bug in `int_waba_link`, redefines `waba_sample` on project membership, adds `waba_specimen` as the first-class category for WABA bee specimens awaiting Ecdysis upload.

## What Was Built

**Task 1 — D-05 catalog-match fix (`cf728efa`):**
- `int_waba_link.sql`: removed `MIN(waba.id) GROUP BY catalog_suffix`; returns ALL WABA obs per catalog suffix (1:N). This allows obs 320276469 (previously shadowed by obs 320276018) to appear in `int_matched_waba_ids` and resolve to its `ecdysis:` row.
- `int_matched_waba_ids.sql`: added `SELECT DISTINCT` defensively; now the full set of matched waba_obs_ids including 320276469.
- `int_ecdysis_base.sql`: replaced the direct `int_waba_link` join with a MIN() subquery (`GROUP BY catalog_suffix`) so ARM 1 ecdysis rows stay exactly 1:1 per ecdysis record. The 1:N link is intentional for matching; ARM 1 needs one representative obs to avoid fan-out (RESEARCH Pitfall 1 — second vector now closed).

**Task 2 — Provisional arm redefinition (`7ac3bdd0`):**
- `int_provisional_waba_ids.sql`: fully replaced. New definition: `stg_inat__observations obs JOIN inaturalist_data.observations__observation_projects op ON op.observation_uuid = obs.uuid AND op.project_id = 166376` anti-joined against `int_samples_base`. Output column renamed `observation_id` (from `waba_obs_id`) — this is now a plant/sample obs id giving `inat:N` occ_id.
- `int_combined.sql` ARM 2: rewritten to source from `int_provisional_waba_ids p JOIN stg_inat__observations obs`. Projects plant/sample columns: `obs.id` as `observation_id`, `obs.user__login` as `host_inat_login`, `obs.longitude/latitude/observed_on` for coordinates/date. All specimen fields NULL (D-11). `canonical_name/taxon_id` NULL (D-08 safe path — plant obs carry no bee species). `is_provisional=TRUE`, `source='waba_sample'`.
- `sources.yml`: added `observations__observation_projects` to the `inaturalist_data` source declaration (missing; dbt compilation failed without it — deviation Rule 3 auto-fix).
- `schema.yml`: added `int_provisional_waba_ids` model note; updated `int_combined` description to list all 5 source values.

**Task 3 — waba_specimen arm (`599d5372`):**
- `int_combined.sql` new ARM 3: sources from `int_specimen_obs_base sob` WHERE `sob.waba_obs_id NOT IN (SELECT waba_obs_id FROM int_matched_waba_ids)` — the 33 unmatched WABA bee specimens after 320276469 moves to the matched set. `source='waba_specimen'`, `is_provisional=FALSE`. `observation_id=NULL` and `host_observation_id=NULL` so occ_id priority falls to `specimen_observation_id=sob.waba_obs_id` → `inat_obs:N`. Reuses the inline `lower(trim(CASE ...))` canonical_name derivation and `stg_inat__canonical_to_taxon_id`/`stg_inat__genus_taxon_ids` backfill joins from the old ARM 2. `obs_url='https://www.inaturalist.org/observations/'||sob.waba_obs_id` (D-10). Same non-bee exclusion (cicindela pugetana, cleridae, encopognathus).

## Verification Results

- `bash data/dbt/run.sh build`: 90 PASS, 2 WARN, 0 ERROR (36-col contract intact; test_lin05_lineage_coverage and test_no_duplicate_occ_ids both severity:warn as expected)
- `bash data/dbt/run.sh test --select test_no_duplicate_occ_ids`: WARN 2 (only Shape C: `ecdysis:6317352`, `ecdysis:6317353` — Shapes A+B gone)
- DuckDB Task 1: `rescued_320276469=1`, `fanned_out_ecdysis_rows=0`
- DuckDB Task 2: `waba_sample_rows=28`, `specimens_in_waba_sample=0`, `provisional_true=28`
- DuckDB Task 3: `waba_specimen_rows=33`, `provisional_true=0`, `have_spec_obs_id=33`
- `uv run pytest -x -q` (data/): 243 passed, 9 skipped

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1: D-05 catalog-match fix | `cf728efa` | int_waba_link.sql, int_matched_waba_ids.sql, int_ecdysis_base.sql |
| Task 2: provisional arm redefinition | `7ac3bdd0` | int_provisional_waba_ids.sql, int_combined.sql (ARM 2), schema.yml, sources.yml |
| Task 3: waba_specimen arm | `599d5372` | int_combined.sql (new ARM 3) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing dbt source declaration for `observations__observation_projects`**
- **Found during:** Task 2 build (`int_provisional_waba_ids.sql` compilation failed)
- **Issue:** `inaturalist_data.observations__observation_projects` was not declared in `data/dbt/models/sources.yml`, causing compilation error: "depends on a source named 'inaturalist_data.observations__observation_projects' which was not found". The table exists in DuckDB (confirmed by RESEARCH), but dbt requires an explicit source declaration.
- **Fix:** Added `observations__observation_projects` to the `inaturalist_data` source in `sources.yml` with a comment explaining it's loaded by `projects_pipeline.py`.
- **Files modified:** `data/dbt/models/sources.yml`
- **Commit:** Included in Task 2 commit `7ac3bdd0`

## Backlog Recommendation: Shape C OFV Fan-out

Shape C (`ecdysis:6317352` / `ecdysis:6317353`) remains as a `severity:warn` warning in `test_no_duplicate_occ_ids`. Root cause: obs 288589692 has a duplicate `field_id=9963` (sample_id) OFV row in `inaturalist_data.observations__ofvs`, causing `int_samples_base` to fan out 2 rows. This is a separate data-quality issue in the OFV staging data, unrelated to the catalog-match gap fixed here.

**Recommended backlog item:** Fix the duplicate `field_id=9963` OFV in `inaturalist_data.observations__ofvs` for obs 288589692 (either by deduplicating in `stg_inat__ofvs` or filtering in `int_samples_base`). Once resolved, escalate `test_no_duplicate_occ_ids` from `severity: warn` to `severity: error`.

## Known Stubs

None. All changes are production data-model corrections, fully wired through to `marts/occurrences`.

## Threat Flags

No new security-relevant surface. `obs_url` in `waba_specimen` rows points to public iNaturalist observation pages (same pattern as existing `inat_obs` arm). No new PII, no new endpoints, no schema changes.

## Self-Check: PASSED

- `data/dbt/models/intermediate/int_waba_link.sql` — exists, no `MIN(` or `GROUP BY catalog_suffix` (confirmed by edit)
- `data/dbt/models/intermediate/int_matched_waba_ids.sql` — exists with `SELECT DISTINCT`
- `data/dbt/models/intermediate/int_ecdysis_base.sql` — exists with MIN() subquery guard
- `data/dbt/models/intermediate/int_provisional_waba_ids.sql` — exists, project_id=166376
- `data/dbt/models/intermediate/int_combined.sql` — exists, 5-arm UNION ALL with waba_specimen
- `cf728efa` — found in git log
- `7ac3bdd0` — found in git log
- `599d5372` — found in git log
- Full build: 90 PASS 2 WARN 0 ERROR (36-col contract intact)
- Dup test: 2 rows warn only (Shape C: ecdysis:6317352, ecdysis:6317353)
