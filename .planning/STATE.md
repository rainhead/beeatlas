---
gsd_state_version: 1.0
milestone: v4.9
milestone_name: Map-Init Readiness
status: ready_to_plan
stopped_at: Phase 144 registered — ready to plan
last_updated: "2026-06-09T01:15:04.517Z"
last_activity: 2026-06-08 — Milestone v4.7 completed and archived
progress:
  total_phases: 23
  completed_phases: 10
  total_plans: 28
  completed_plans: 28
  percent: 43
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-08 — v4.7 and v4.8 both complete; no active milestone)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** v4.9 Phase 144 — Map-Init Readiness (`/gsd:plan-phase 144`)

## Current Position

Phase: 144 (Map-Init Readiness)
Plan: Planned — 2 plans (144-01, 144-02), verified by plan-checker (no issues)
Status: Ready to execute (`/gsd:execute-phase 144`)
Last activity: 2026-06-09 — Phase 144 planned (await-taxaReady + intendedFilterActive gate + render decision into bee-map); ready.ts scaffolding (260608-tnc) shipped

### Phase 144 design decisions (from planning discussion 2026-06-09)
- Sync gate: a dedicated `_filterResolving` boolean (NOT `_pendingLegacyTaxon`), feeding a single `intendedFilterActive` getter.
- Scope: behavior-preserving consolidation onto `taxaReady` + `intendedFilterActive` AND harden first occurrence render on `mapReady` (move render decision into bee-map: `render = f(filteredGeoJSON, intendedFilterActive)`).
- Builds on `ready.ts` (quick 260608-tnc). Regression net: `bee-atlas-legacy-taxon.test.ts` (commit 5833b41).

## Milestone Overview

**v4.7 Checklist Records as Point Data — Phases 134–138** ✅ SHIPPED 2026-06-08 (archived: `.planning/milestones/v4.7-ROADMAP.md`)

All 5 phases complete (134–138), 17 plans, 21/21 requirements (ING-01..03, RCN-01..07, DUP-01..03, PRO-01..04, UIX-01..04). Audit passed. The 50,646-row Bartholomew checklist is now a real `source='checklist'` point peer in `occurrences.parquet`, reversing the Phase 111 lock.

---

**v4.8 Fast, Honest Test Suite — Phases 139–143** ✅ SHIPPED 2026-06-08 (archived: `.planning/milestones/v4.8-ROADMAP.md`)

All 5 phases complete (139–143), 17/17 requirements. See archive for detail.

## Accumulated Context

### Decisions

Full per-phase decision logs live in the phase SUMMARYs and the v4.7 archive
(`.planning/milestones/v4.7-ROADMAP.md`) / PROJECT.md milestone section. Load-bearing
conventions that outlive v4.7:

- **External authority is build-time-only**: GBIF/ITIS consulted once at build time, baked into committed seeds; the nightly `run.py`/`nightly.sh` path makes zero taxonomy network calls.
- **Dedup prefers false-split over false-merge**: cross-source flag requires exact canonical_name + non-year-only date + ~1 km coords + normalized collector (all four AND; NULL on any field = ineligible); nothing suppressed without a curator-confirmed `dedup_decisions.csv` entry.
- **geo_blob ↔ features.ts positional contract**: `sqlite_export._GEO_COLS` and `src/features.ts` column indices are positionally coupled and not type-checked; changes ship in one atomic commit (a one-position slip silently corrupts every row).
- **Single dbt synonym subsystem**: checklist reconciliation uses `occurrence_synonyms`/`int_synonyms`; the disjoint Python `checklist_synonyms.csv` path is retired.
- **Internal-link convention**: static pages link to `.../index.html`, never bare directories — production serves from the S3 REST endpoint via OAC (no directory-index resolution). Fixed in `species.njk` at the v4.7 close (commit `4aaa5d0`).

### Blockers/Concerns

None open.

## Deferred Items

The 26 items surfaced by the v4.7 pre-close audit were **resolved at close** (commit
`9eb1afc`): 24 quick-tasks were verified complete and normalized (the audit false-flagged
them via a `gsd-sdk` `audit-open.ts` bug that only reads bare `SUMMARY.md`, not the
`${id}-SUMMARY.md` convention); Phase 138 UAT (v4.7) → complete; Phase 142 UAT (v4.8) →
complete (its resolution-gate blocker was fixed by `5047e8e`). Pre-close audit now reports
0 open items.

Genuinely-carried items (pre-existing, non-blocking, not scanner-tracked):

| Category | Item | Status |
|----------|------|--------|
| nyquist | Phases 129 / 131 / 132 / 134 / 135 / 136 / 138 partial Nyquist | accepted — phases shipped + verified; VALIDATION is a test-coverage formality |
| security | Phase 133 SECURITY.md | not generated — threats mitigated + verified in code; `/gsd:secure-phase 133` to formalize |
| verification | Phase 110 / 111 / 113 VERIFICATION.md | human_needed (v4.0 phases) |
| uat | Phase 110 HUMAN-UAT.md | partial — 2 open scenarios (v4.0) |

## Quick Tasks Completed

| Date | Slug | Description |
|---|---|---|
| 2026-05-26 | inat-obs-show-species-in-sidebar | iNat expert obs: show species name + quality badge in sidebar |
| 2026-05-27 | 260527-ko5 | Move sqlite and data loading into a worker thread; profile before/after |
| 2026-05-27 | pst | Replace string-escape INSERT with wa-sqlite prepared statements |
| 2026-05-28 | syn-occurrence-synonymy-mechanism | Occurrence-side synonymy mechanism; map Agapostemon texanus → subtilior (Portman et al. 2024) |
| 2026-06-08 | 260607-s5r | Add a rank column to the occurrences table view (closes table-rank-column todo) |
| 2026-06-08 | pluralization-sweep-web-copy | Apply quantify() across species-detail/places/place-detail njk + bee-pane button |
| 2026-06-08 | 260607-syt | Break out subgenera on genus pages — group species list by subgenus |
| 2026-06-09 | 260608-tnc | ready.ts readiness barriers (taxaReady/mapReady) — step 1 of 3 for map-init race work; additive, no behavior change |

## Session Continuity

Last session: 2026-06-09
Stopped at: quick task 260608-tnc complete (ready.ts scaffolding); steps 2–3 (await-based resolution + intendedFilterActive) deferred to a small phase
Resume file: None

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
