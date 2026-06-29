---
gsd_state_version: 1.0
milestone: v6.0
milestone_name: My Work — Progress & Provenance
status: milestone_complete
stopped_at: v6.0 milestone closed, archived, tagged
last_updated: "2026-06-29"
last_activity: 2026-06-29 -- v6.0 milestone complete (archived + tagged)
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 16
  completed_plans: 16
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-29 — v6.0 My Work shipped)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Planning next milestone (no active milestone). Start with `/gsd-new-milestone`.

## Current Position

Milestone: v6.0 — COMPLETE (archived to .planning/milestones/v6.0-*, tagged v6.0)
Phase: 172 — COMPLETE (highest in milestone)
Next: no active milestone — `/gsd-new-milestone`
Last activity: 2026-06-29 -- v6.0 milestone complete

## Milestone Overview

**v6.0 My Work — Progress & Provenance (Phases 167–172 incl. 171.1) — SHIPPED 2026-06-28**

17/17 v1 requirements satisfied; cross-phase integration clean (5/5 seams); audit `tech_debt` (no blockers). Goal delivered: the first bookmarkable, no-auth, public per-collector page showing the collection→ID lifecycle as an event stream and accomplishments as coverage/breadth, on a rebuilt occurrence model (`source` enum → `tier`+`record_type` facets; added `collector_inat_login` + `id_date`; dbt contract 36→39).

Roadmap archive: [.planning/milestones/v6.0-ROADMAP.md](milestones/v6.0-ROADMAP.md) · Audit: [.planning/v6.0-MILESTONE-AUDIT.md](v6.0-MILESTONE-AUDIT.md)

| Phase | Name | Status |
|-------|------|--------|
| 167 | Collector Identity Column | Complete |
| 168 | Temporal Lifecycle Dates | Complete |
| 169 | Per-Collector Static Pages | Complete |
| 170 | Source → Provenance Facets Rebuild | Complete |
| 171 | Per-Collector Event Stream | Complete |
| 171.1 | Collector Data Delivery Rebuild (INSERTED) | Complete |
| 172 | Accomplishment View | Complete |

**Progress:** [██████████] 100%

## Accumulated Context

### Decisions

Load-bearing conventions carried forward (full v6.0 decision log in PROJECT.md / milestone archive):

- **geo_blob ↔ features.ts positional contract**: `_GEO_COLS` and `features.ts` column indices are positionally coupled; changes ship in one atomic commit. **[v6.0 update]** geo_blob index 6 = `tier`.
- **`<bee-atlas>` owns all reactive state**: `<bee-map>` and `<bee-pane>` are pure presenters — state goes on `<bee-atlas>`, relayed down as properties.
- **`_filterQueryGeneration` race guard**: async query results must be discarded if the counter has advanced.
- **Style cache bypass**: must bypass when `filterState` is active or `selectedOccIds` non-empty.
- **Static hosting only**: no server runtime.
- **[Phase 154] mapbox-basemap StaleWhileRevalidate cache**: token retained; 7-day TTL; web-SDK offline basemap NOT licensed. docs/adr/0001 is the ToS record.
- **[Phase 160] Place bridge keyed on synthetic occ_id**: `occurrence_places` (occ_id, place_slug); occ_id CASE mirrors `src/occurrence.ts` priority.
- **[v6.0 PROV] occ_id positional coupling is load-bearing across THREE consumers** (`src/occurrence.ts`, `src/filter.ts`, `data/dbt/models/marts/occurrence_places.sql`): change in one atomic commit guarded by the `OCC_ID_SQL_CASE` export + the 3-site coupling Vitest assertion. `tier`(atlas/other)+`record_type`(specimen/provisional_sample/waba_specimen/inat_expert/checklist) replace the old `source` enum; `tier=` URL with legacy `src=` parse-only back-compat. `tsc --noEmit` is the post-merge gate.
- **[v6.0 IDENT-01] collector_inat_login is host-first**: `COALESCE(host_inat_login, specimen_inat_login, user_login)` — the sample owner wins over a third-party specimen-photo poster (corrected from the original specimen-first ship). Guarded by `assert_collector_prefers_host`. `display_name` = most-recent `recordedBy` (not MIN). See memory `project_collector_identity_prefers_host`.
- **[v6.0 TEMP] id_date only**: lifecycle reads intrinsic source dates (no snapshot-diffing); `posted_date`/iNat `created_at` deliberately dropped (posting is not an event). Collected = pre-existing `date` column; Identified = `id_date` (dirty-parsed Ecdysis `date_identified`).
- **[v6.0] dbt contract changes ship data-before-code**: each bump lands in live S3 via a one-time `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` BEFORE the TS reading it deploys; never stack two unreleased bumps. The deploy `validate-db` gate reads live S3. See memory `project_occurrences_contract_release_sequence`.
- **[v6.0] build-time data is delivered via S3 + manifest.json + deploy.yml, NEVER committed to git** (the `species.json` pattern). "read at build time" ≠ "commit." A clean git status is not a verification PASS for a regenerated artifact. See memory `feedback_no_committed_data_artifacts`.

### Pending Todos

- `144-code-review-deferred.md` — WR-04 (CSV-export `rows[0]` headers) + 3 info findings; non-blocking, pre-existing.
- `165-code-review-deferred.md` — deferred Phase 165 code-review findings; non-blocking.
- `rebuild-source-into-facets.md` — **OBSOLETE** (shipped as Phase 170); close it.

### Blockers/Concerns

- **No active blockers.** The Phase 163 Ecdysis-auth nightly blocker was **RESOLVED 2026-06-24** (authenticated Symbiota session + ZIP guard + cache fallback; operator-verified a real nightly through `generate-sqlite`). The nightly pipeline is unblocked. (Corrected 2026-06-29: STATE had stale-tracked 163 as open through the v6.0 close — it was already complete.)
- **Operational confirmation (NOT a code gap):** the v6.0 data leg (dbt contract 37→38→39 cols + collector pages) lands in live S3 via the operator nightly on maderas. Since the nightly is unblocked (163 fixed 2026-06-24) and the contract bumps (167/168/170) landed afterward — with 171/172 shipping on top of the 39-col contract — the data leg is very likely live. Worth a one-time confirm that the latest nightly published cleanly and prod renders collector pages.

## Deferred Items

Items acknowledged and deferred at v6.0 milestone close (2026-06-29):

| Category | Item | Status |
|----------|------|--------|
| operational | v6.0 live-S3 data landing (39-col contract + collector pages) | likely live (nightly unblocked since 163 fixed 2026-06-24; contracts landed after) — confirm latest nightly published + prod renders pages |
| phase | Phase 166 (seasonality charts) | open — needs a per-taxon page route (none exists yet) |
| todo | `144-code-review-deferred.md` | open — non-blocking, pre-existing |
| todo | `165-code-review-deferred.md` | open — non-blocking |
| todo | `rebuild-source-into-facets.md` | obsolete (shipped as Phase 170) — close |
| nyquist | Phases 167–172 + 171.1 `nyquist_compliant: false` | accepted (partial-Nyquist convention; green suites + operator UAT) |
| process | Phase 167 no standalone VERIFICATION.md | accepted — verified inline in SUMMARY + VALIDATION.md |
| uat | Prior-milestone HUMAN-UAT.md (149/151–155/157/160–162/165/171/172) | passed/approved, 0 pending scenarios — flagged by audit only because status ≠ literal "complete" |
| nyquist | Phases 129/131/132/134/135/136/138 partial Nyquist | accepted (carried from v4.x) |
| verification | Phase 110/111/113 VERIFICATION.md | human_needed (carried from v4.0) |
| uat | Phase 110 HUMAN-UAT.md | partial — 2 open scenarios (carried from v4.0) |
| place | snoqualmie-pass-to-olallie-meadow-trail | deferred — needs hand-traced GPX |

## Session Continuity

Last session: 2026-06-29 (v6.0 milestone close)
Stopped at: v6.0 archived + tagged
Resume file: None

## Operator Next Steps

1. **Confirm v6.0 is live in prod** (optional): verify the latest maderas nightly published the 39-col contract cleanly and the prod site renders collector pages. The nightly is unblocked (Phase 163 fixed 2026-06-24).
2. **Start the next milestone**: `/gsd-new-milestone` — candidates from the deferred-seed backlog: community/shared liveness feed (needs the append-only history table), per-identification enrichment ("IDed by X on date"), "where to go next" planning surface, accomplishment depth (collector dot map / year-over-year).
3. Optional cleanup: close the obsolete `rebuild-source-into-facets.md` todo; promote 999.11 (federal wilderness areas) / 999.7 (Safari private-browsing) from backlog if desired.
