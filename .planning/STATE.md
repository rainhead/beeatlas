---
gsd_state_version: 1.0
milestone: v3.2
milestone_name: Species Tab
status: Phase 76 verified complete; ready to plan Phase 77 (Lineage Coverage Expansion)
last_updated: "2026-05-03T00:00:00.000Z"
last_activity: 2026-05-03 — inserted Phase 77 (Lineage Coverage Expansion) between Data Foundation and Pipeline Outputs after researcher surfaced ~31% iNat lineage coverage; renumbered downstream phases (Pipeline Outputs → 78, Photo Manifest → 79, Page Scaffolding → 80, Filter UX & Nav → 81, Hardening → 82); LIN-01..LIN-05 added to REQUIREMENTS.md
progress:
  total_phases: 12
  completed_phases: 1
  total_plans: 6
  completed_plans: 6
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-02 — v3.2 Species Tab milestone started)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** v3.2 Species Tab — bee species exploration page (taxonomic nav, image-forward cards, occurrence maps, seasonality viz). Scoping in `.planning/seeds/species-tab.md`.

## Current Position

Phase: Phase 76 complete; next is Phase 77 (Lineage Coverage Expansion). Old Phase 77 (Pipeline Outputs) is now Phase 78; downstream phases bumped accordingly.
Plan: 076-01..06 complete (6/6); UAT passed
Status: Verified end-to-end — pipeline runs clean in 170s, all 5 SCs satisfied
Last activity: 2026-05-03 — inserted Phase 77 (Lineage Coverage Expansion) after researcher surfaced ~31% iNat lineage coverage gap during /gsd-plan-phase 77; existing Pipeline Outputs work preserved as Phase 78 (`.planning/phases/078-pipeline-outputs/`); ready to discuss/plan new Phase 77.

## Accumulated Context

### Decisions

(decisions log cleared at v3.0 close — full history in .planning/PROJECT.md Key Decisions table)

### Pending Todos

- Cluster blob selection visual feedback — `.planning/todos/pending/cluster-selection-visual-feedback.md`
- Boundary edge gap/overlap rendering (from Phase 73 verification, commit 193a57b)

### Blockers/Concerns

CR-01 (pre-existing from Phase 67): bee-filter-controls.ts uses `observer` field in CollectorToken but filter.ts CollectorEntry defines `host_inat_login` — collector filtering by iNat username silently non-functional until resolved.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260421-t1a | Table mode improvements (filter button, selection highlight, links column, collector coalesce, field# fallback) | 2026-04-21 | c9c1b8c | [260421-t1a-table-mode-improvements](./quick/260421-t1a-table-mode-improvements/) |
| 260421-qk1 | Drop atom feeds for counties and ecoregions | 2026-04-21 | c1f196e | [260421-qk1-drop-county-ecoregion-feeds](./quick/260421-qk1-drop-county-ecoregion-feeds/) |
| 260422-sc1 | Fix specimen count mismatch between map filter panel and table view | 2026-04-22 | 78ccd3e | [260422-sc1-fix-specimen-count-mismatch](./quick/260422-sc1-fix-specimen-count-mismatch/) |

## Deferred Items

Items acknowledged and deferred at v3.1 milestone close on 2026-04-30:

| Category | Item | Status |
|----------|------|--------|
| debug | selection-ring-not-displaying | diagnosed |
| quick_task | 1-store-full-observation-json-in-cache-wit | missing |
| quick_task | 260408-roy-move-region-overlay-control-from-sidebar | missing |
| quick_task | 260408-tkd-add-occurrence-observation-id-columns-to | missing |
| quick_task | 260408-tvl-show-recent-filters-when-filter-input-is | missing |
| quick_task | 260411-pru-unidentified-specimens-like-5611752-are- | missing |
| quick_task | 260412-dl6-in-the-frontend-in-the-specimen-table-vi | missing |
| quick_task | 260412-due-re-add-sort-controls-to-the-specimen-tab | missing |
| quick_task | 260412-kpe-schema-validation-is-failing-on-build-de | missing |
| quick_task | 260421-qk1-drop-county-ecoregion-feeds | missing |
| quick_task | 260421-t1a-table-mode-improvements | missing |
| quick_task | 260422-sc1-fix-specimen-count-mismatch | missing |
| todo | boundary-edge-gaps.md | low |
| todo | cluster-selection-visual-feedback.md | medium |
