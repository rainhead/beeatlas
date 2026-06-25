---
gsd_state_version: 1.0
milestone: v6.0
milestone_name: My Work — Progress & Provenance
status: verifying
stopped_at: Phase 167 Tasks 1+2 complete; Task 3 awaits operator (SKIP_INTEGRATION_GATE nightly on maderas)
last_updated: "2026-06-25T04:53:10.263Z"
last_activity: 2026-06-25
progress:
  total_phases: 38
  completed_phases: 15
  total_plans: 35
  completed_plans: 35
  percent: 39
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-24 — v5.2 Place Coverage Expansion shipped)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Phase 167 — collector-identity-column

## Current Position

Phase: 167 (collector-identity-column) — EXECUTING
Plan: 1 of 1
Status: Phase complete — ready for verification
Last activity: 2026-06-25

## Milestone Overview

**v6.0 My Work — Progress & Provenance (Phases 167–172)**

Goal: Stand up the first "work" surface — a bookmarkable, no-auth, public per-collector page showing the collection→ID lifecycle as an event stream and accomplishments as coverage/breadth — on a rebuilt occurrence model that replaces `source` with orthogonal facets and a temporal status lifecycle.

Roadmap: [.planning/milestones/v6.0-ROADMAP.md](milestones/v6.0-ROADMAP.md)

| Phase | Name | Dependencies | Status |
|-------|------|--------------|--------|
| 167 | Collector Identity Column | Phase 165 | Not started |
| 168 | Temporal Lifecycle Dates | Phase 167 | Not started |
| 169 | Per-Collector Static Pages | Phase 167 | Not started |
| 170 | Source → Provenance Facets Rebuild | Phase 165, 167 | Not started |
| 171 | Per-Collector Event Stream | Phase 168, 170 | Not started |
| 172 | Accomplishment View | Phase 169, 171 | Not started |

**Progress:** [██████████] 100%

## Accumulated Context

### Decisions

Load-bearing conventions carried from prior milestones:

- **geo_blob ↔ features.ts positional contract**: `_GEO_COLS` and `features.ts` column indices are positionally coupled; changes ship in one atomic commit.
- **`<bee-atlas>` owns all reactive state**: `<bee-map>` and `<bee-pane>` are pure presenters — state goes on `<bee-atlas>`, relayed down as properties.
- **`_filterQueryGeneration` race guard**: async query results must be discarded if the counter has advanced.
- **Style cache bypass**: must bypass when `filterState` is active or `selectedOccIds` non-empty.
- **Static hosting only**: no server runtime — SW, manifest, and CDK `no-cache` behavior are the only moving parts.
- **Session-coalesced viewport history (Phase 146)**: `_viewportSessionActive` flag gates pushState vs replaceState.
- **[Phase 154] mapbox-basemap StaleWhileRevalidate cache**: access_token retained (§1.1/§2.9.4); events.mapbox.com excluded by hostname; /map-sessions/ excluded by path; 7-day TTL (§2.8.1 ceiling: 30 days). docs/adr/0001-mapbox-basemap-cache.md is the ToS record. Web-SDK offline basemap is NOT licensed.
- **[Phase 160] Place bridge keyed on synthetic occ_id (Option B)**: occurrence_places (occ_id, place_slug); occ_id CASE mirrors src/occurrence.ts occIdFromRow priority.
- **[Phase 160-02]** Bridge parquet resolved as a sibling of `src_parquet` in sqlite_export.py; occurrences mart contract is 36 cols after dropping place_slug.
- **[Phase 165-02] D-05**: `MIN(waba.id) GROUP BY catalog_suffix` removed from `int_waba_link` — 1:N catalog-match so all WABA obs sharing a catalog suffix are recognized; fan-out guard via MIN subquery at `int_ecdysis_base` consumer keeps ARM 1 1:1.
- **[Phase 165-02] D-03/D-11**: `waba_sample` (provisional) arm redefined on project_id=166376 membership anti-joined `int_samples_base` (~28 rows, is_provisional=TRUE, specimen fields NULL).
- **[Phase 165-02] D-10/D-12**: `waba_specimen` NEW source arm for the 33 WABA iNat-photo bee specimens not yet in Ecdysis (is_provisional=FALSE, occ_id=inat_obs:N, carries bee species + obs_url).
- **[Phase 165-03] D-13**: `waba_specimen` wired end-to-end in frontend: SourceKey union + VALID_SOURCES in url-state.ts, OccurrenceRow.source + VALID_SOURCES in filter.ts, 5th source toggle in bee-pane.ts (_renderSources layers), _renderWabaSpecimen dispatch in bee-occurrence-detail.ts. waba_sample toggle copy corrected to 'Provisional samples'. All-off guard updated 4 → 5.
- **[v6.0 IDENT-01]** `collector_inat_login` COALESCE priority: `COALESCE(specimen_inat_login, host_inat_login, user_login)` — the five-ARM model from Phase 165 defines all field sources; checklist ARM (free-text `recordedBy`) is excluded per requirements scope.
- **[v6.0 TEMP]** Temporal approach resolved (operator decision 2026-06-24): lifecycle dates read from intrinsic source data (collection/event date, iNat `created_at`, identification dates) — NOT snapshot-diffing. Option A/B/C fork dissolved. No first-run-flood concern for static dates. The two dbt contract bumps (IDENT-01 col, TEMP-01 cols) must be separate nightly runs per `project_occurrences_contract_release_sequence`.
- **[v6.0 PROV]** Source → facets rebuild is high-risk atomic: all three occ_id-coupled consumers (`src/occurrence.ts`, `src/filter.ts`, `data/dbt/models/marts/occurrence_places.sql`) change in one commit; plan must include a positional-coupling Vitest test + `tier=`/`src=` URL back-compat. `tsc --noEmit` is the post-merge gate.
- **[v6.0 PAGE]** Per-collector pages are gated on `collector_identity.csv` — never generated from all distinct `host_inat_login` values (would include casual iNat observers). Public, no auth, no gating per operator decision 2026-06-24.
- **[Phase 167] dbt test disambiguation**: Two `not_null` tests on the same column in dbt 1.10.1 require explicit `name:` keys to avoid compilation error. Added `not_null_occurrences_collector_inat_login_waba` (D-05, error) and `not_null_occurrences_collector_inat_login_ecdysis_drift` (D-06, warn) — this is the required pattern for any future phase adding multiple severity-scoped tests on a single column.
- **[Phase 167] collector_inat_login shipped (dbt contract 36→37)**: Column live in local sandbox/occurrences.parquet and occurrences.db. Awaiting operator `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` on maderas to land in live S3 (Task 3 checkpoint).

### Pending Todos

- `144-code-review-deferred.md` — WR-04 (CSV-export `rows[0]` headers) + 3 info findings; non-blocking, promote into a future milestone.
- Phase 163 (Ecdysis auth-session fix) — promoted to active, 163-01 plan exists but execution pending. ⚠ BLOCKS NIGHTLY until resolved.

### Blockers/Concerns

- Phase 163 (Ecdysis auth) ⚠ blocks nightly pipeline. Decouple: `ECDYSIS_CACHE_TTL_SECONDS=99999999 bash data/nightly.sh` reuses cached ZIP as immediate workaround.

## Deferred Items

Carried forward from v5.2 close (2026-06-24):

| Category | Item | Status |
|----------|------|--------|
| todo | `144-code-review-deferred.md` | open — non-blocking, pre-existing (WR-04 CSV headers + 3 info) |
| uat | Phases 149/151/152/153/154/155/157 HUMAN-UAT.md | passed/approved, 0 pending scenarios — flagged by audit only because status ≠ literal "complete" (not real gaps) |
| nyquist | Phases 129/131/132/134/135/136/138 partial Nyquist | accepted (carried from v4.x) |
| verification | Phase 110/111/113 VERIFICATION.md | human_needed (carried from v4.0) |
| uat | Phase 110 HUMAN-UAT.md | partial — 2 open scenarios (carried from v4.0) |
| place | snoqualmie-pass-to-olallie-meadow-trail | deferred — needs hand-traced GPX |

## Session Continuity

Last session: 2026-06-25T04:53:10.254Z
Stopped at: Phase 167 context gathered
Resume file: None

## Operator Next Steps

1. **Resolve Phase 163** (Ecdysis auth — blocks nightly): plan and execute 163-01.
2. **Start v6.0 Phase 167**: `/gsd-plan-phase 167` — Collector Identity Column (dbt contract bump 36→37, data-before-code S3 sequence).
3. Phase 168 (Temporal Lifecycle Dates) follows 167 — separate dbt contract bump, same S3 sequence.
4. Phases 169 (Per-Collector Pages) and 170 (Facets Rebuild) can run in parallel after 167.
