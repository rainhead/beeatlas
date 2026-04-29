# Phase 66: Provisional Rows in Pipeline — Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Pipeline-only phase. `waba_pipeline.py` gains taxon ancestor fields; `export.py` gains a third join arm (iNat specimen observations) and emits provisional occurrence rows for unmatched WABA observations. No frontend changes — sidebar display is Phase 67.

</domain>

<decisions>
## Implementation Decisions

### Schema: New and Renamed Columns in occurrences.parquet

- **D-01:** `observer` (existing) renamed to `host_inat_login` — the iNat login of the collection-event (host sample) observer. Breaking rename; `validate-schema.mjs` and all frontend references must be updated.
- **D-02:** `specimen_inat_login` (new, VARCHAR nullable) — `user__login` from `inaturalist_waba_data.observations`. Populated for all rows where a WABA observation is linked (including non-provisional Ecdysis-matched rows); null for rows with no WABA observation.
- **D-03:** `specimen_inat_taxon_name` (new, VARCHAR nullable) — `taxon__name` from `inaturalist_waba_data.observations`.
- **D-04:** `specimen_inat_genus` (new, VARCHAR nullable) — `name` from `observations__taxon__ancestors` where `rank = 'genus'`.
- **D-05:** `specimen_inat_family` (new, VARCHAR nullable) — `name` from `observations__taxon__ancestors` where `rank = 'family'`.
- **D-06:** `is_provisional` (new, BOOLEAN non-nullable) — `TRUE` for unmatched WABA observation rows; `FALSE` for all other rows (Ecdysis-only, sample-only, fully matched).

These six are the only new columns in Phase 66. File size impact should be logged after the first export run.

### Three-Way Outer Join Structure

- **D-07:** `export.py` `joined` CTE becomes a three-arm structure:
  - **ARM 1** (`ecdysis_base`): unchanged — Ecdysis specimens with links to host and WABA observations.
  - **ARM 2** (`specimen_obs_base`): new CTE selecting from `inaturalist_waba_data.observations` LEFT JOINed with `observations__taxon__ancestors`. For ARM 1 rows, this is a LEFT JOIN on `specimen_observation_id = waba.id`. For provisional rows (unmatched WABA obs), ARM 2 is the primary source.
  - **ARM 3** (`samples_base`): unchanged for ARM 1 rows. For provisional rows, joined via `host_observation_id` parsed from OFV 1718.
- **D-08:** ARM 2 LEFT JOINed onto ALL Ecdysis rows, not just provisional — so `specimen_inat_login`, `specimen_inat_taxon_name`, etc. are populated for any Ecdysis row that has a `specimen_observation_id`.
- **D-09:** The FULL OUTER JOIN (ARM 1 × ARM 3) is preserved for existing rows. Provisional rows are added via UNION ALL: ARM 2 WHERE unmatched, LEFT JOINed to ARM 3 via OFV 1718 `host_observation_id`.

### waba_pipeline.py: Taxon Ancestors

- **D-10:** Add `taxon.ancestors.rank,taxon.ancestors.name` to `DEFAULT_FIELDS`. dlt will normalize this into a child table (likely `inaturalist_waba_data.observations__taxon__ancestors`) with `_dlt_root_id`, `rank`, `name`, `_dlt_list_idx`. The export SQL joins this table filtering `rank = 'genus'` and `rank = 'family'` to populate D-04 and D-05.

### OFV 1718 Parsing

- **D-11:** OFV field_id=1718 ("Associated observation") stores a full iNat URL, e.g. `https://www.inaturalist.org/observations/163069968`. Export SQL extracts the observation ID as: `CAST(regexp_extract(ofv1718.value, '([0-9]+)$', 1) AS BIGINT)`.

### PROV-01 Scope

- **D-12:** `waba_pipeline.py` already captures all OFVs via `ofvs.field_id,ofvs.value` — field_id=1718 values are already persisted in `inaturalist_waba_data.observations__ofvs`. No pipeline code change needed for PROV-01 beyond D-10 (ancestors). Test fixture must include an OFV 1718 row on the unmatched WABA observation.

### Provisional Row Definition

- **D-13:** A WABA observation is "unmatched" (provisional) when it has no catalog-number OFV (field_id=18116) whose value resolves to an existing Ecdysis catalog number. The existing `waba_link` CTE captures matched catalog numbers. Provisional rows are identified by anti-join: WABA observations whose `id` is not the `specimen_observation_id` of any row in `waba_link`. This correctly excludes all WABA observations that catalog a known Ecdysis specimen (including cases where multiple observers photograph the same specimen).

### Test Fixtures

- **D-14:** `conftest.py` fixture additions needed:
  - `inaturalist_waba_data.observations` table gains `taxon__name` and `taxon__rank` columns.
  - New `inaturalist_waba_data.observations__taxon__ancestors` table with `_dlt_root_id`, `rank`, `name`, `_dlt_list_idx` columns.
  - A second unmatched WABA observation (no OFV 18116, or OFV 18116 with a catalog number absent from Ecdysis) to produce a provisional row in tests.
  - An OFV 1718 row on the unmatched WABA observation pointing to the known iNat host sample (observation_id=999999 from existing fixture) to exercise the ARM 3 join for provisional rows.

### Claude's Discretion

- SQL structure for the UNION ALL / three-way join (CTE naming, ordering of arms) — implementation detail for the planner.
- Whether to use a separate `matched_waba_ids` CTE or inline the anti-join for D-13.
- Handling of `_row_id` across UNION ALL arms for the county/ecoregion spatial join (must produce unique IDs across all arms).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pipeline
- `data/export.py` — current three-CTE export structure (ecdysis_base, samples_base, joined); spatial join pattern with county_fallback and eco_fallback
- `data/waba_pipeline.py` — DEFAULT_FIELDS, dlt REST API config, observations table schema
- `data/tests/conftest.py` — fixture DB structure and seed data; session-scoped fixture pattern
- `data/tests/test_export.py` — existing export test patterns (monkeypatched ASSETS_DIR, EXPECTED_OCCURRENCES_COLS list)
- `data/tests/fixtures.py` — WKT polygon constants; test coordinate values

### Schema Gate
- `scripts/validate-schema.mjs` — EXPECTED columns list; must be updated to include new columns and renamed `host_inat_login`

### Requirements
- `.planning/REQUIREMENTS.md` §PROV — PROV-01 through PROV-05 acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `waba_link` CTE in `export.py`: existing pattern for joining WABA OFVs to Ecdysis catalog numbers — reuse as the source of truth for "matched" WABA observations (D-13).
- `samples_base` CTE: OFV join pattern (`sc._dlt_root_id = op._dlt_id AND sc.field_id = 8338`) — follow same pattern for OFV 1718 join.
- County/ecoregion fallback pattern (`with_county` → `county_fallback` → `final_county`): must cover provisional rows too; `_row_id` must be unique across UNION ALL arms.

### Established Patterns
- dlt child tables: `inaturalist_data.observations__ofvs` uses `_dlt_root_id` → `observations._dlt_id` linkage. `observations__taxon__ancestors` will follow the same pattern.
- Export assertion: `assert null_county == 0` and `assert null_eco == 0` — provisional rows with valid lat/lon from the WABA observation must pass through the spatial fallback.
- `monkeypatch.setattr(export_mod, 'ASSETS_DIR', export_dir)` — test isolation pattern.

### Integration Points
- `inaturalist_waba_data.observations`: gains `taxon__name`, `taxon__rank` columns from D-10; existing `_dlt_id` is the join key for the new ancestors child table.
- `validate-schema.mjs` EXPECTED list: `observer` → `host_inat_login` plus five new columns.
- Frontend `parquet.ts` and sidebar components: `observer` rename will require updates (out of scope for Phase 66 — note for Phase 67).

</code_context>

<specifics>
## Specific Ideas

- User wants to observe occurrences.parquet file size delta after adding the new columns. The existing export already prints file size — just compare before/after.
- dlt table name for taxon ancestors is unconfirmed (`observations__taxon__ancestors` is the expected dlt normalization pattern but should be verified against actual dlt output or dlt docs before finalizing the export SQL).

</specifics>

<deferred>
## Deferred Ideas

- Displaying iNat community ID confidence (num_identification_agreements / num_identification_disagreements) — future milestone per REQUIREMENTS.md.
- Distinct map symbols for provisional rows — explicitly out of scope for v2.8 per REQUIREMENTS.md.
- Determination status filter — deferred capability.

</deferred>

---

*Phase: 66-provisional-rows-in-pipeline*
*Context gathered: 2026-04-20*
