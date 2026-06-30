---
gsd_state_version: 1.0
milestone: v7.0
milestone_name: Species Trait Annotations
status: Awaiting next milestone
stopped_at: Milestone v7.0 shipped (PR #39 merged) and archived
last_updated: "2026-06-30T04:07:36.956Z"
last_activity: 2026-06-30 — Milestone v7.0 completed and archived
progress:
  total_phases: 2
  completed_phases: 2
  total_plans: 3
  completed_plans: 3
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-29 — v6.0 My Work shipped)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Milestone complete

## Current Position

Phase: 175 — Floral Host Provenance ("Collected from") — PLANNED (2 plans, 2 waves), plan-check PASSED
Plan: 175-01 (data pipeline) → 175-02 (frontend + release wiring)
Status: Ready for /gsd-execute-phase 175
Last activity: 2026-06-30 — Completed quick task 260629-tqw: checklist_record_count (all checklist records) + "0 checklist records" contradiction fix

## Milestone Overview

**v7.0 Species Trait Annotations (Phases 173–174) — SHIPPED 2026-06-30 (PR #39 merged)**

Annotate species with curated ecological traits (sociality, diet breadth + host plant, nesting, native status, cuckoo host bee) from license-clean sources, and surface them on the species index + detail pages with per-trait provenance. Phase 173 (the `species_traits` mart + a latent-synonymy-bug fix) shipped ad-hoc on branch `species-trait-annotations`; Phase 174 (site integration) shipped via PR [#39](https://github.com/rainhead/beeatlas/pull/39), merged to main. Archive: [.planning/milestones/v7.0-ROADMAP.md](milestones/v7.0-ROADMAP.md).

| Phase | Name | Status |
|-------|------|--------|
| 173 | Species Trait Data Layer | Complete (ad-hoc) |
| 174 | Surface Traits in the Site | Complete |

**Progress:** [██████████] 100%

## Deferred Items

Items acknowledged and deferred at v7.0 milestone close on 2026-06-30:

| Category | Item | Status |
|----------|------|--------|
| todo | checklist-count-zero-but-on-checklist | ✅ resolved 2026-06-30 (quick task 260629-tqw) |
| todo | rebuild-source-into-facets | open (medium, pre-existing) |
| todo | 144-code-review-deferred | open (low, pre-existing) |
| todo | 165-code-review-deferred | open (pre-existing) |
| uat_gaps | 16 HUMAN-UAT items across phases 145+ | open (pre-existing tech debt) |
| context_question | 1 open context question | open (pre-existing) |
| operator | one-time `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` on maderas | pending (refresh S3 species.json baseline post-merge) |

Prior milestone: **v6.0 My Work — Progress & Provenance** (Phases 167–172 incl. 171.1) — SHIPPED 2026-06-28. Archive: [.planning/milestones/v6.0-ROADMAP.md](milestones/v6.0-ROADMAP.md) · Audit: [.planning/v6.0-MILESTONE-AUDIT.md](v6.0-MILESTONE-AUDIT.md)

## Accumulated Context

### Roadmap Evolution

- Phase 175 added 2026-06-30: Floral Host Provenance — "Collected from" flower families & genera per bee species from sample data. Decisions + data findings locked in `175-CONTEXT.md`.

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

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260629-tqw | checklist_record_count (all checklist records, incl. non-georeferenced) + fix contradictory "0 checklist records" line | 2026-06-30 | e946cbfd | [260629-tqw-data-fix-count-all-checklist-records-inc](./quick/260629-tqw-data-fix-count-all-checklist-records-inc/) |

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

Last session: 2026-06-30T00:56:24.510Z
Stopped at: Phase 174 UI-SPEC approved
Resume file: None

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
