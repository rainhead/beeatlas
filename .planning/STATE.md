---
gsd_state_version: 1.0
milestone: v3.1
milestone_name: Eleventy Build Wrapper
status: planning
last_updated: "2026-04-29T00:00:00.000Z"
last_activity: 2026-04-29 — v3.1 Eleventy Build Wrapper milestone started
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-29 — v3.1 Eleventy Build Wrapper scoped)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** v3.1 Eleventy Build Wrapper — pure infrastructure milestone; rehouse Vite SPA inside Eleventy build pipeline; no URL or content changes

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-29 — Milestone v3.1 started

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
