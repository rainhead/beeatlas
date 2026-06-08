---
gsd_state_version: 1.0
milestone: v4.7
milestone_name: Checklist Records as Point Data
status: executing
stopped_at: Phase 136 plan 03 complete — DUP-02 candidate generation GREEN (int_dedup_candidates + write_dedup_candidates)
last_updated: "2026-06-08T18:45:00.000Z"
last_activity: 2026-06-08
progress:
  total_phases: 23
  completed_phases: 7
  total_plans: 22
  completed_plans: 21
  percent: 30
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-08 — v4.8 complete; v4.7 resumed as active milestone)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** Phase 136 — deduplication

## Current Position

Phase: 136 (deduplication) — EXECUTING
Plan: 4 of 4 (136-03 complete — DUP-02 GREEN + candidate CSV writer)
Status: Ready to execute Wave 4 (136-04)
Last activity: 2026-06-08

## Milestone Overview

**v4.7 Checklist Records as Point Data — Phases 134–138** 🔄 ACTIVE (resumed 2026-06-08)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 134 | Full-Fidelity Ingest | ING-01, ING-02, ING-03 | Complete (2026-06-04) |
| 135 | Name Reconciliation | RCN-01..07 | In Progress (4/5 plans — 135-05 pending) |
| 136 | Deduplication | DUP-01, DUP-02, DUP-03 | Not started |
| 137 | Promotion into Occurrences | PRO-01, PRO-02, PRO-03, PRO-04 | Not started |
| 138 | Frontend Points & Detail Card | UIX-01, UIX-02, UIX-03, UIX-04 | Not started |

**Coverage:** 21/21 requirements mapped (ING-01..03, RCN-01..07, DUP-01..03, PRO-01..04, UIX-01..04)

---

**v4.8 Fast, Honest Test Suite — Phases 139–143** ✅ SHIPPED 2026-06-08 (archived: `.planning/milestones/v4.8-ROADMAP.md`)

All 5 phases complete (139–143), 17/17 requirements. See archive for detail.

## Accumulated Context

### ⏸ v4.7 PAUSED (2026-06-05) — resumable

v4.7 "Checklist Records as Point Data" was paused mid-execution to run v4.8 (the slow/red `data/` test suite was impeding iteration). **State at pause:** Phase 134 done; Phase 135 (name-reconciliation) in progress, plan 1 of 5; context gathered in `.planning/phases/135-name-reconciliation/135-CONTEXT.md`. Phase dirs `134-*`/`135-*` and v4.7 requirements (`.planning/REQUIREMENTS-v4.7-paused.md`) are preserved on disk. v4.7 reserved phases 134–138; v4.8 continues at **phase 139**. The v4.7 decisions/todos/overview below are retained for resumption — they do **not** apply to v4.8.

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

**136-02 decisions:**

- **CTE keyed pattern for NULL-safe GROUP BY**: COALESCE(recordedBy, CAST(ObjectID AS VARCHAR)) in a CTE `keyed` avoids GROUP BY expression-mismatch between SELECT and GROUP BY; each NULL-recordedBy row gets a unique per-ObjectID key so NULL-collector rows never collapse together (D-03).
- **MIN(recordedBy) for NULL-safe survivor field**: Since rows in a group are exact-match duplicates, MIN(recordedBy) returns the shared value; for pure-NULL-collector groups it returns NULL, correctly preserving NULL through the collapse.
- **tok.isalpha() guard in initials rule**: Prevents numeric length-1 tokens from spuriously matching as initials in _collectors_match; only single alphabetic characters qualify as initials (D-05).

**136-03 decisions:**

- **ecdysis_dated CTE uses ecdysis_date column**: `int_ecdysis_base` aliases `o.event_date AS ecdysis_date`; SQL model and test fixture aligned to that actual output name (Rule 1 fix during implementation).
- **Collector filter applied in Python, not SQL**: `_collectors_match` token-set + initials logic applied in `write_dedup_candidates()` after SQL join; raw collector strings carried in the SQL model for Python to filter (D-05).
- **Bounding-box prefilter before haversine**: `ABS(lat diff) <= 0.012, ABS(lon diff) <= 0.016` advisory optimization guards the expensive `ST_Distance_Sphere` call without changing correctness.

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

Acknowledged at v4.8 milestone close (2026-06-08) — 25 open items (24 quick-tasks + 1 UAT), all pre-existing / non-blocking; superset carried from v4.6 close (2026-06-04):

| Category | Item | Status |
|----------|------|--------|
| quick_tasks | 24 legacy quick-task dirs | scanner cruft (empty dates, missing completion marker) |
| uat | Phase 142 HUMAN-UAT.md | blocked, 0 pending scenarios — both items accepted by operator 2026-06-07, phase marked complete |
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
| 2026-06-08 | 260607-s5r | Add a rank column to the occurrences table view (closes table-rank-column todo) |
| 2026-06-08 | pluralization-sweep-web-copy | Apply quantify() across species-detail/places/place-detail njk + bee-pane button (closes pluralization-sweep-web-copy todo) |
| 2026-06-08 | 260607-syt | Break out subgenera on genus pages — group species list by subgenus (closes genus-page-subgenera-breakout todo) |

## Session Continuity

Last session: 2026-06-08T18:45:00.000Z
Stopped at: Phase 136 plan 03 complete — DUP-02 candidate generation GREEN (int_dedup_candidates + write_dedup_candidates)
Resume file: None

## Operator Next Steps

- Execute Wave 4 (status model + gate): `/gsd:execute-phase 136` → plan 136-04
  - Implements `int_checklist_dedup_status.sql` (LEFT JOIN through decisions) and `check_dedup_gate()` Python gate
