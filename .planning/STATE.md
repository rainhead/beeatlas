---
gsd_state_version: 1.0
milestone: v6.0
milestone_name: My Work — Progress & Provenance
status: ready_to_plan
stopped_at: Phase 171.1 context gathered
last_updated: "2026-06-28T02:03:14.889Z"
last_activity: 2026-06-27
progress:
  total_phases: 39
  completed_phases: 19
  total_plans: 43
  completed_plans: 43
  percent: 49
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-24 — v5.2 Place Coverage Expansion shipped)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Phase 171.1 — Collector Data Delivery Rebuild

## Current Position

Phase: 171.1
Plan: Not started
Status: ready_to_plan
Last activity: 2026-06-27

## Milestone Overview

**v6.0 My Work — Progress & Provenance (Phases 167–172)**

Goal: Stand up the first "work" surface — a bookmarkable, no-auth, public per-collector page showing the collection→ID lifecycle as an event stream and accomplishments as coverage/breadth — on a rebuilt occurrence model that replaces `source` with orthogonal facets and a temporal status lifecycle.

Roadmap: [.planning/milestones/v6.0-ROADMAP.md](milestones/v6.0-ROADMAP.md)

| Phase | Name | Dependencies | Status |
|-------|------|--------------|--------|
| 167 | Collector Identity Column | Phase 165 | Complete |
| 168 | Temporal Lifecycle Dates | Phase 167 | Complete |
| 169 | Per-Collector Static Pages | Phase 167 | Complete |
| 170 | Source → Provenance Facets Rebuild | Phase 165, 167 | Complete |
| 171 | Per-Collector Event Stream | Phase 168, 170 | Complete |
| 171.1 | Collector Data Delivery Rebuild (INSERTED) | Phase 171 | Not started |
| 172 | Accomplishment View | Phase 169, 171 | Not started |

**Progress:** [████████░░] 83% (5/6 + inserted 171.1)

## Accumulated Context

### Roadmap Evolution

- Phase 171.1 inserted after Phase 171: Collector Data Delivery Rebuild — fixes Phase 171 defect: 29MB+ artifact committed to git instead of S3/manifest pattern (URGENT)

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
- [Phase 168]: id_date column shipped to local mart (dbt contract 37 to 38): VARCHAR parse of ecdysis date_identified in int_combined ARM 1 (26,565 kept; year-only + full ISO verbatim, garbage NULLed); ARMs 2-5 NULL; assert_id_date_parse_complete warn singular test. Awaiting operator SKIP_INTEGRATION_GATE nightly to land in live S3 (Task 4, gated behind Phase 167 37-col landing).
- [Phase 170-01]: marts/occurrences source decomposed → tier (atlas/other) + record_type (specimen/provisional_sample/waba_specimen/inat_expert/checklist); arm→tier mapping lives only in int_combined.sql; contract 38→39. Data leg locally green (PASS=92); AWAITING operator SKIP_INTEGRATION_GATE nightly to land in S3 before Plan 02 deploys (D-04).
- [Phase 170-02]: Frontend leg shipped as ONE atomic commit 4513a170 (PROV-01/02/03). FilterState.hiddenSources→hiddenTiers; tier= URL param + src= 5→2 back-compat (parse-only, lossy by design); tier-driven symbology (atlas recency / other muted #7a8a99, D-08); record_type-driven detail card (inat_obs→inat_expert, D-09/D-10 — card is record_type-driven NOT tier-driven, deliberate); features.ts geo_blob index 6 = tier; OCC_ID_SQL_CASE exported + PROV-03 occ_id-coupling Vitest assertion (3-site equality, occ_id prefix inat_obs: unchanged per D-07). tsc --noEmit 0; 877 tests pass. NOT pushed — gated on Plan 01 Task 3 operator S3 publish.

### Pending Todos

- `144-code-review-deferred.md` — WR-04 (CSV-export `rows[0]` headers) + 3 info findings; non-blocking, promote into a future milestone.
- Phase 163 (Ecdysis auth-session fix) — promoted to active, 163-01 plan exists but execution pending. ⚠ BLOCKS NIGHTLY until resolved.

### Blockers/Concerns

- Phase 163 (Ecdysis auth) ⚠ blocks nightly pipeline. Decouple: `ECDYSIS_CACHE_TTL_SECONDS=99999999 bash data/nightly.sh` reuses cached ZIP as immediate workaround.
- [Phase 168 Task 4] Awaiting operator SKIP_INTEGRATION_GATE=1 bash data/nightly.sh on maderas to land id_date (38 cols) in live S3; gated behind Phase 167 37-col S3 landing (D-12, confirmed live per commit 69821883).
- Phase 170-01 Task 3 / 170-02 push gate: BLOCKING operator checkpoint — run one-time SKIP_INTEGRATION_GATE=1 bash data/nightly.sh on maderas to publish occurrences contract (tier+record_type, no source, 38→39 cols) to S3 ALONE. The frontend leg (170-02, commit 4513a170) is committed locally but MUST NOT be pushed/deployed until 'published' is confirmed — the deploy validate-db gate reads the freshly-published S3 occurrences.db (project_occurrences_contract_release_sequence). Resume signal: 'published'.

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

Last session: 2026-06-28T02:03:14.881Z
Stopped at: Phase 171.1 context gathered
Resume file: .planning/phases/171.1-collector-data-delivery-rebuild/171.1-CONTEXT.md

## Operator Next Steps

1. **Resolve Phase 163** (Ecdysis auth — blocks nightly): plan and execute 163-01.
2. **Start v6.0 Phase 167**: `/gsd-plan-phase 167` — Collector Identity Column (dbt contract bump 36→37, data-before-code S3 sequence).
3. Phase 168 (Temporal Lifecycle Dates) follows 167 — separate dbt contract bump, same S3 sequence.
4. Phases 169 (Per-Collector Pages) and 170 (Facets Rebuild) can run in parallel after 167.
