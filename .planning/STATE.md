---
gsd_state_version: 1.0
milestone: v4.7
milestone_name: Checklist Records as Point Data
status: ready_to_plan
stopped_at: Phase 134 complete (2/2) — ready to discuss Phase 135
last_updated: 2026-06-04T19:10:52.460Z
last_activity: 2026-06-04 -- Phase 134 execution started
progress:
  total_phases: 16
  completed_phases: 0
  total_plans: 2
  completed_plans: 2
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-04 — milestone v4.6 complete; v4.7 roadmap defined)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Phase 135 — name reconciliation

## Current Position

Phase: 135
Plan: Not started
Status: Ready to plan
Last activity: 2026-06-04

Progress: [----------] 0% (0/5 phases complete)

## Milestone Overview

**v4.7 Checklist Records as Point Data — Phases 134–138**

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 134 | Full-Fidelity Ingest | ING-01, ING-02, ING-03 | Not started |
| 135 | Name Reconciliation | RCN-01..07 | Not started |
| 136 | Deduplication | DUP-01, DUP-02, DUP-03 | Not started |
| 137 | Promotion into Occurrences | PRO-01, PRO-02, PRO-03, PRO-04 | Not started |
| 138 | Frontend Points & Detail Card | UIX-01, UIX-02, UIX-03, UIX-04 | Not started |

**Coverage:** 21/21 requirements mapped (ING-01..03, RCN-01..07, DUP-01..03, PRO-01..04, UIX-01..04)

## Accumulated Context

### Decisions

**v4.7 architectural decisions (recorded at roadmap creation):**

- **Human-review gates at Phases 135 and 136**: Phase 136 must not start until the curator reviews `checklist_name_resolution_audit.csv` and promotes GBIF/ITIS matches into `occurrence_synonyms.csv`. Phase 137 must not start until the curator reviews `dedup_candidate_pairs.csv` and marks confirmed duplicates. These gates exist because taxonomic over-matching and dedup false-merge are the two credibility-critical failure modes for a scientific atlas.
- **External authority is build-time-only**: GBIF and ITIS are consulted once via `checklist_resolution.py` (not part of `run.py`/`nightly.sh`); results baked into a committed DuckDB cache; nightly makes zero taxonomy network calls.
- **Dedup preference: false-split over false-merge**: For a scientific atlas, displaying a record twice (false split) is recoverable by users; suppressing a distinct specimen (false merge) is not. The conservative cross-source flag requires exact canonical_name + non-year-only date + coordinates within ~1 km + normalized collector (all four AND; NULL on any field = ineligible).
- **Phase 137 atomic commit**: `sqlite_export._GEO_COLS` and `src/features.ts` column indices are positionally coupled and not type-checked. They must ship as one commit. A one-position slip produces silent data corruption for every row in the database.
- **Phase 111 isolation test retirement**: The existing pytest asserting checklist exclusion from `occurrences.parquet` must be explicitly replaced (not skipped, not deleted) with a new assertion that `source='checklist'` rows exist, with a comment referencing the v4.7 reversal.
- **dbt contract bump**: 33 → 34 columns minimum (adds `checklist_id INTEGER`). ARMs 1–3 must cast `NULL::INTEGER AS checklist_id` in `int_combined` to avoid DuckDB UNION type errors.
- **County-fill layer removal**: The Phase 112 `checklist-county-fill` Mapbox layer is removed from the main map in Phase 138. The static `checklist.parquet` mart (county presence) is unchanged and continues to feed species-page county SVG maps.
- **`locality` column decision deferred to Phase 138**: Whether `locality` becomes a 35th contract column (vs. supplementary lookup) will be decided during Phase 138 planning to avoid premature contract commitment.

### Roadmap Evolution

v4.7 roadmap defined 2026-06-04: 5 phases (134–138), 21/21 requirements mapped.

Research context: `.planning/research/SUMMARY.md` (HIGH confidence), `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md`

Source CSV confirmed present: `/home/peter/final_checklist_records.csv` (50,646 rows). First task of Phase 134 is committing it to `data/checklists/`.

### Pending Todos

- Verify `dateparser` Python 3.14 compatibility via `uv add dateparser` before committing to `data/pyproject.toml` (Phase 134 start task)
- Confirm ITIS SQLite file size before deciding caching strategy on maderas (Phase 135 start task)
- Confirm DuckDB `jaro_winkler_similarity()` exact function name in >=1.4 before writing `int_checklist_dedup.sql` (Phase 136 start task)
- Decide `locality` column placement in dbt contract (Phase 138 planning)

### Blockers/Concerns

None open. Human-review gates at Phases 135 and 136 are expected workflow steps, not blockers.

## Deferred Items

Carried forward from v4.6 milestone close (2026-06-04) — 28 open items, all pre-existing / non-blocking:

| Category | Item | Status |
|----------|------|--------|
| quick_tasks | 22 legacy quick-task dirs | scanner cruft (empty dates, missing completion marker) |
| todo | cluster-selection-visual-feedback | medium (frontend, unrelated) |
| todo | data-test-suite-environmental-deps | medium (pre-existing pytest env deps) |
| todo | genus-page-subgenera-breakout | medium (captured in Phase 132 verify) |
| todo | pluralization-sweep-web-copy | low |
| todo | table-rank-column | low (captured in Phase 131 verify) |
| nyquist | Phases 129 / 131 / 132 partial Nyquist | accepted — phases shipped + verified |
| security | Phase 133 SECURITY.md | not generated — threats T-133-07/08/09 mitigated + verified in code; `/gsd:secure-phase 133` to formalize |
| verification | Phase 110 / 111 / 113 VERIFICATION.md | human_needed (v4.0 phases) |
| uat | Phase 110 HUMAN-UAT.md | partial — 2 open scenarios (v4.0) |

## Quick Tasks Completed

| Date | Slug | Description |
|---|---|---|
| 2026-05-26 | inat-obs-show-species-in-sidebar | iNat expert obs: show species name + quality badge in sidebar |
| 2026-05-27 | 260527-ko5 | Move sqlite and data loading into a worker thread; profile before/after |
| 2026-05-27 | pst | Replace string-escape INSERT with wa-sqlite prepared statements |
| 2026-05-28 | syn-occurrence-synonymy-mechanism | Occurrence-side synonymy mechanism; map Agapostemon texanus → subtilior (Portman et al. 2024) |

## Session Continuity

Last session: 2026-06-04T17:00:43.611Z
Stopped at: Phase 134 context gathered
Resume file: .planning/phases/134-full-fidelity-ingest/134-CONTEXT.md

## Operator Next Steps

- Run `/gsd:plan-phase 134` to plan Phase 134: Full-Fidelity Ingest
