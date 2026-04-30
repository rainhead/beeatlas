---
gsd_state_version: 1.0
milestone: v3.1
milestone_name: Eleventy Build Wrapper
status: Phase 75 planned; ready to execute
last_updated: "2026-04-30T08:35:00.000Z"
last_activity: 2026-04-30 — Phase 75 planned (2 plans, 2 waves); plan-checker passed with 1 trivial blocker (research marker) and 1 procedural warning (VALIDATION.md), both fixed inline
progress:
  total_phases: 2
  completed_phases: 1
  total_plans: 5
  completed_plans: 3
  percent: 60
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-29 — v3.1 Eleventy Build Wrapper scoped)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** v3.1 Eleventy Build Wrapper — pure infrastructure milestone; rehouse Vite SPA inside Eleventy build pipeline; no URL or content changes

## Current Position

Phase: 75 of 75 — authoring-scaffold (planned, ready to execute)
Plan: 075-01-PLAN.md (wave 1), 075-02-PLAN.md (wave 2, depends on 075-01)
Status: Phase 75 plans created; ready for /gsd-execute-phase 75
Last activity: 2026-04-30 — Phase 75 planned: research found Vite plugin auto-handles multi-entry via HTML script-tag rewriting (no rollupOptions.input needed); bee-header.ts self-registers via @customElement decorator with no SPA-coupled imports; orphan page at _pages/scaffold-check.njk + permalink override sidesteps Eleventy underscore-prefix ambiguity

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
