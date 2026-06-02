---
gsd_state_version: 1.0
milestone: v4.6
milestone_name: Taxonomy Hierarchy & Normalization
status: executing
stopped_at: Phase 129 context gathered
last_updated: "2026-06-02T17:33:39.093Z"
last_activity: 2026-06-02 -- Phase 129 planning complete
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 3
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-01 — milestone v4.6 started)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** v4.6 Taxonomy Hierarchy & Normalization — hierarchy foundation first (Phase 129)

## Current Position

Phase: 129 — Hierarchy Foundation
Plan: Not started
Status: Ready to execute
Last activity: 2026-06-02 -- Phase 129 planning complete

```
Progress: [░░░░░░░░░░░░░░░░░░░░] 0% (0/5 phases)
```

## Accumulated Context

### Decisions

All v4.5 decisions logged in `.planning/milestones/v4.5-ROADMAP.md` and PROJECT.md Key Decisions table.

**v4.6 Roadmap decisions (2026-06-01):**

- Phases 129–133 continue the v4.5 numbering (v4.5 ended at Phase 128)
- NORM and MFILT are now separate phases (130 and 131) in additive-then-subtractive order: the frontend switches to taxon_id filtering first (Phase 130, additive — old string columns still exist and are ignored), then the old columns are dropped (Phase 131, subtractive — safe because the frontend no longer reads them). Atomicity / safe-intermediate-states is explicitly not a concern this milestone.
- Phase 130 is the first frontend change; it is additive (the denormalized columns still exist). No broken intermediate state is possible.
- Phase 131 is the column-drop. The grep audit and geo_blob rewrite happen here. This is lower risk than the fused approach because Phase 130 already exercises the hierarchy path in production.
- Phase 132 (Page Rebuild & Subfamily Pages) depends on Phase 129 (hierarchy foundation) only — the species mart is unaffected by the occurrences column drop in Phase 131, so Phase 132 can be planned independently of Phase 131.
- Phase 133 (Browse Tree) depends on Phase 130 (filter infrastructure) and Phase 132 (subfamily pages as link destinations).
- Hierarchy structure (closure table vs. nested sets) decided in Phase 129 via latency benchmark: Apidae descendants filter in wa-sqlite/Firefox must be < 50 ms. If over, use nested-set lft/rgt.
- Bycatch handled via two-pass hierarchy load: (1) full Anthophila walk as usual, (2) targeted ancestry walk for bycatch taxon_ids actually present in occurrences.parquet. Bycatch gets is_anthophila=0 flag; appears in hierarchy for name resolution only.
- canonical_name is kept in the occurrences contract — it is the sole textual taxon reference for the ~21k genuinely-unidentified Ecdysis specimens (NULL taxon_id).
- species mart keeps its rank name columns (family, subfamily, tribe, genus, subgenus) — they serve page generation via Eleventy and are not a transfer-weight concern.
- PAGE-05 (complex pages) is conditional: decided in Phase 129 based on complex-rank occurrence count. If < ~50 occurrences, complex nodes deep-link to filtered map view instead.
- URL param `taxon=` migrates from name string to integer taxon_id in Phase 130; old name-format URLs get a backward-compatible fallback parse.

### Roadmap Evolution

- Phase 129: Hierarchy Foundation — starting point for v4.6
- Phase 130: Map Filter Cutover (MFILT-01..03) — additive frontend switch to taxon_id filtering
- Phase 131: Occurrence Normalization (NORM-01..03) — subtractive column drop, safe after Phase 130
- Phase 132: Page Rebuild & Subfamily Pages (PAGE-01..04) — depends on 129; independent of 131
- Phase 133: Browse Tree (TREE-01..04) — depends on 130 and 132

### Pending Todos

None.

### Blockers/Concerns

- Phase 129 has one open technical question: hierarchy structure (closure vs. nested sets). Resolved by latency benchmark at the start of Phase 129 planning before any schema is finalized.
- Phase 131 requires a pre-migration grep audit across src/, data/, _pages/ before any column is removed. The geo_blob positional coupling between sqlite_export.py and features.ts is the highest-risk surface (silent wrong data on mismatch, not a thrown error). Risk is lower than originally modeled because Phase 130 will have already exercised the hierarchy read-path in production.

## Deferred Items

Carried from v4.5 milestone close (all pre-existing, not v4.5 deliverables):

| Category | Item | Status |
|----------|------|--------|
| verification | Phase 110 / 111 / 113 VERIFICATION.md | human_needed (v4.0 phases) |
| uat | Phase 110 HUMAN-UAT.md | partial — 2 open scenarios (v4.0) |
| todo | cluster-selection-visual-feedback | medium priority (frontend, unrelated) |
| quick_tasks | 22 legacy quick-task dirs | missing completion marker (scanner cruft, empty dates) |

## Quick Tasks Completed

| Date | Slug | Description |
|---|---|---|
| 2026-05-26 | inat-obs-show-species-in-sidebar | iNat expert obs: show species name + quality badge in sidebar |
| 2026-05-27 | 260527-ko5 | Move sqlite and data loading into a worker thread; profile before/after |
| 2026-05-27 | pst | Replace string-escape INSERT with wa-sqlite prepared statements |
| 2026-05-28 | syn-occurrence-synonymy-mechanism | Occurrence-side synonymy mechanism; map Agapostemon texanus → subtilior (Portman et al. 2024) |

## Session Continuity

Last session: 2026-06-02T15:36:31.903Z
Stopped at: Phase 129 context gathered
Resume file: .planning/phases/129-hierarchy-foundation/129-CONTEXT.md

## Operator Next Steps

- Run `/gsd:plan-phase 129` to plan and execute Phase 129 (Hierarchy Foundation)
- First task in Phase 129: latency benchmark for descendant query in wa-sqlite (Apidae family, ~4000 species) — this gates the hierarchy structure decision
- Second task: count complex-rank occurrences/species to decide on PAGE-05 (complex pages)
