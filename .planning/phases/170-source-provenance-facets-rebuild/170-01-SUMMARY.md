---
phase: 170-source-provenance-facets-rebuild
plan: 01
subsystem: database
tags: [dbt, duckdb, contract, occurrences, tier, record_type, provenance, facets, data-leg]

# Dependency graph
requires:
  - phase: 165-source-arm-rebuild
    provides: "five-arm int_combined (ecdysis/waba_sample/waba_specimen/inat_obs/checklist) with per-arm source + is_provisional constants"
  - phase: 167-collector-identity-column
    provides: "collector_inat_login column + the two severity-scoped not_null tests (waba error / ecdysis_drift warn) whose where-clauses this plan rewrites"
provides:
  - "marts/occurrences `tier` column (atlas/other) — replaces source as the filter/symbology organizing facet"
  - "marts/occurrences `record_type` column (specimen/provisional_sample/waba_specimen/inat_expert/checklist) — drives the detail card"
  - "the arm→tier→record_type mapping materialized once, only in int_combined.sql (D-05)"
  - "geo_blob `tier` at _GEO_COLS index 6 (was source) — positionally coupled to features.ts row[6], consumed by Plan 02"
  - "occurrences contract bumped 38→39 columns"
affects: [170-02-frontend-facets, 171-per-collector-event-stream, 172-accomplishment-view]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Materialize the coarser facet (tier) as its own column so downstream SQL/URL never recompute the arm→tier mapping (D-05)"
    - "record_type spellings chosen for clean card dispatch: ecdysis→specimen, waba_sample→provisional_sample, waba_specimen→waba_specimen, inat_obs→inat_expert, checklist→checklist (D-02)"

key-files:
  created: []
  modified:
    - data/dbt/models/intermediate/int_combined.sql
    - data/dbt/models/marts/occurrences.sql
    - data/dbt/models/marts/schema.yml
    - data/dbt/tests/assert_id_date_parse_complete.sql
    - data/collectors_export.py
    - data/sqlite_export.py

key-decisions:
  - "record_type spellings: specimen / provisional_sample / waba_specimen / inat_expert / checklist (D-02, Claude's discretion)"
  - "waba_sample → tier=atlas (D-03 — provisional floral-host sample is socially Atlas work)"
  - "inat_obs record_type value renamed inat_expert; occ_id prefix inat_obs: untouched (D-06/D-07)"
  - "Only tier (not record_type) rides the geo_blob — page-weight budget; the card reads record_type from the full wa-sqlite row query (D-08 / Open Q1)"

patterns-established:
  - "occurrences contract is the gate: dropping source + adding tier/record_type is a 38→39 contract change requiring data-before-code S3 publish (D-04)"

requirements-completed: [PROV-01]

# Metrics
duration: ~6min
completed: 2026-06-27
---

# Phase 170 Plan 01: Source → Provenance Facets Rebuild (Data Leg) Summary

**Decomposed the overloaded `source` enum on `marts/occurrences` into two orthogonal materialized columns — `tier` (atlas/other) and `record_type` (specimen/provisional_sample/waba_specimen/inat_expert/checklist) — with the arm→tier mapping living once in the five `int_combined` arms; dbt contract bumped 38→39, local build green.**

## Performance

- **Duration:** ~6 min (data-leg tasks; Task 3 operator checkpoint pending)
- **Started:** 2026-06-27T02:08:00Z (approx)
- **Completed (Tasks 1-2):** 2026-06-27T02:13:00Z
- **Tasks:** 2 of 3 complete (Task 3 is a blocking operator checkpoint — see below)
- **Files modified:** 6

## Accomplishments
- `marts/occurrences` now exposes `tier` (atlas/other) and `record_type`, with **no `source` column** (D-04). Contract enforced at 39 columns (`bash data/dbt/run.sh build` exits 0).
- Each of the five `int_combined` arms projects a hardcoded `tier` + `record_type` literal — the **only** place the arm→tier mapping lives (D-05). `waba_sample`→`atlas` (D-03); `inat_obs`→`inat_expert` (D-06).
- The `occ_id` prefix literal `inat_obs:` and `occurrence_places.sql` are byte-unchanged (D-07).
- Export predicates rewritten in `tier`/`record_type` terms with collector counts verified unchanged (124 collectors, 889 samples, status denom 43441 = identified 15106 + awaiting 28335 — no silent zero-out, Pitfall 3 cleared).
- geo_blob `_GEO_COLS` index 6 swapped `source`→`tier` (only `tier` rides the blob, page-weight budget).

## Task Commits

Each task was committed atomically:

1. **Task 1: Project tier + record_type in int_combined + occurrences; update contract** — `92b5e3cd` (feat)
2. **Task 2: Rewrite source predicates in collectors_export.py and sqlite_export.py _GEO_COLS** — `b4456021` (refactor)
3. **Task 3: One-time data-before-code S3 publish** — ⏸ **BLOCKING OPERATOR CHECKPOINT — not yet executed** (human-action gate, cannot be automated)

## Files Created/Modified
- `data/dbt/models/intermediate/int_combined.sql` — 5 arms each project `'<tier>' AS tier, '<record_type>' AS record_type` (drop `'<arm>' AS source`)
- `data/dbt/models/marts/occurrences.sql` — `j.source` → `j.tier, j.record_type`
- `data/dbt/models/marts/schema.yml` — dropped occurrences `source` contract row; added `tier` + `record_type` (38→39 cols); rewrote both `not_null` where-clauses (`record_type in ('provisional_sample','waba_specimen')` / `record_type = 'specimen'`)
- `data/dbt/tests/assert_id_date_parse_complete.sql` — `m.source = 'ecdysis'` → `m.record_type = 'specimen'` (deviation, below)
- `data/collectors_export.py` — 5 `o.source` predicates → `o.record_type` (`waba_sample`→`provisional_sample`); counts unchanged
- `data/sqlite_export.py` — `_GEO_COLS` index 6 `source`→`tier`; header comment updated; only `tier` on geo_blob

## record_type spellings (chosen — D-02 Claude's discretion)

| Arm | tier | record_type |
|---|---|---|
| ecdysis | `atlas` | `specimen` |
| waba_sample | `atlas` (D-03) | `provisional_sample` |
| waba_specimen | `atlas` | `waba_specimen` |
| inat_obs | `other` | `inat_expert` (D-06) |
| checklist | `other` | `checklist` |

These 5 `record_type` values are distinct and drive the 5 detail-card variants cleanly (Plan 02). Plan 02 must document these in `docs/domain-model.md`.

## Decisions Made
- record_type spellings as tabled above (D-02 discretion). `provisional_sample` chosen over `waba_sample` to name the record nature (a provisional floral-host sample) rather than the project, mirroring the social reframe.
- Carried **only `tier`** on the geo_blob (not `record_type`) — the map symbology needs only `tier` (D-08); the detail card reads `record_type` from the full wa-sqlite row query, not map feature properties (Open Q1 recommendation).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `assert_id_date_parse_complete.sql` referenced the dropped `source` column**
- **Found during:** Task 1 (first `bash data/dbt/run.sh build`)
- **Issue:** The singular test `data/dbt/tests/assert_id_date_parse_complete.sql:33` filters `WHERE m.source = 'ecdysis'` against `marts/occurrences`. Dropping `source` produced a `Binder Error: Values list "m" does not have a column named "source"` — the build failed (PASS=85 ERROR=1). This consumer was NOT in the plan's listed sites (the plan named `schema.yml`'s two not_null where-clauses but not this separate singular test).
- **Fix:** Rewrote the predicate `m.source = 'ecdysis'` → `m.record_type = 'specimen'` (the ecdysis arm's record_type). Semantically identical — the test still scopes to ecdysis specimen rows.
- **Files modified:** `data/dbt/tests/assert_id_date_parse_complete.sql`
- **Verification:** `bash data/dbt/run.sh build` re-run → PASS=92 WARN=3 ERROR=0. The 3 warnings are all pre-existing and unchanged in count (lineage coverage 1, duplicate occ_ids 2, ecdysis collector drift 2767).
- **Committed in:** `92b5e3cd` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for the build to pass — the test is a direct downstream consumer of the dropped column. No scope creep; the fix is a mechanical, semantics-preserving predicate rewrite consistent with the rest of the data leg.

## Issues Encountered
None beyond the deviation above. The local `data/beeatlas.duckdb` (1.2 GB, 2026-06-25) was populated, so the dbt build and the collectors-export validation ran fully locally — no Ecdysis auth gate hit (the `project_local_uat_stale_occurrences_db` gotcha did not apply this run).

## ⏸ BLOCKING CHECKPOINT — Task 3: One-time data-before-code S3 publish (D-04)

**This is an operator-only human-action gate. Claude cannot run it** (no CLI on the nightly host; auth/operator gates are never auto-approved). The data leg is locally green and committed, but the new occurrences contract (tier + record_type, no source, 38→39 cols) **must publish to S3 ALONE before Plan 02's frontend deploys** — the contract change deadlocks two ship gates against stale S3 (`project_occurrences_contract_release_sequence`).

**Operator action on maderas, from repo root, EXACTLY ONCE:**
```bash
SKIP_INTEGRATION_GATE=1 bash data/nightly.sh
# if Ecdysis auth is down (Phase 163 blocker), reuse cached ZIP:
ECDYSIS_CACHE_TTL_SECONDS=99999999 SKIP_INTEGRATION_GATE=1 bash data/nightly.sh
```
Then confirm S3 carries the new `occurrences.parquet` (has `tier` + `record_type`, no `source`), `occurrences.db`, and a fresh `manifest.json`. **Never leave `SKIP_INTEGRATION_GATE` set.** Resume signal: type "published".

## Coupling note for Plan 02 (Wave B)
The `_GEO_COLS` index-6 swap (`source`→`tier`) is **positionally coupled to `features.ts` row[6]**. Plan 02's `features.ts` reader change MUST ship S3-then-deploy in lockstep with this data leg — a desync silently mis-colors the map (reads `year` as tier). Only `tier` rides the geo_blob; `record_type` reaches the card via the full row query.

## Next Phase Readiness
- Data leg locally complete and committed; **gated on the operator S3 publish (Task 3)** before Plan 02 deploys.
- Plan 02 (frontend, one atomic commit) is clear to be planned/built but MUST NOT deploy until "published" is confirmed.

## Self-Check: PASSED

All 6 modified files present; both task commits (`92b5e3cd`, `b4456021`) found in git history.

---
*Phase: 170-source-provenance-facets-rebuild*
*Completed (data leg, Tasks 1-2): 2026-06-27*
