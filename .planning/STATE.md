---
gsd_state_version: 1.0
milestone: v5.0
milestone_name: Offline Field Mode
status: planning
last_updated: "2026-06-10T20:34:57.372Z"
last_activity: 2026-06-10
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-08 — v4.7 and v4.8 both complete; no active milestone)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Milestone complete

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-06-10 — Milestone v5.0 started

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
- **Session-coalesced viewport history (v4.10/Phase 146)**: `_viewportSessionActive` flag on `<bee-atlas>` gates pushState vs replaceState; `_replaceUrlState()` resets it for all non-viewport writes; `_mapMoveDebounce` timer removed (immediate push; flag bounds entry count).

### Blockers/Concerns

None open.

## Deferred Items

**v4.10 close (2026-06-09):** 3 items acknowledged and deferred; WR-02 since resolved (commit `09ebe94` + dependabot entry) —

| Category | Item | Status |
|----------|------|--------|
| uat | `145-HUMAN-UAT.md` | ✅ resolved (2026-06-09) — WR-02 answered: `directory: "/"` github-actions Dependabot does NOT cover composite actions (the composite `actions/cache` lagged deploy.yml's by a patch). Mitigated: manually pinned to v5.0.5 + added a dedicated `directory: "/.github/actions/install-lychee"` Dependabot entry |
| verification | `145-VERIFICATION.md` | human_needed at close; the only open item (WR-02) is now resolved — see UAT row above. Report left as the contemporaneous record |
| todo | `144-code-review-deferred.md` | open — pre-existing, re-surfaced from v4.9 close (see below); non-blocking |

---

**v4.9 close (2026-06-09):** 1 item acknowledged and deferred —

| Category | Item | Status |
|----------|------|--------|
| todo | `144-code-review-deferred.md` | open — WR-04 (CSV-export `rows[0]` headers) + 3 info findings from the Phase 144 code review; non-blocking, promote into a future milestone |

---

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

Last session: 2026-06-09T18:40:09.862Z
Stopped at: Phase 146 context gathered
Resume file: None

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
