---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Mapbox GL JS Migration
status: planning
last_updated: "2026-04-27T02:00:00.000Z"
last_activity: 2026-04-27 — Phase 72 planned (2 plans in 2 waves)
progress:
  total_phases: 8
  completed_phases: 6
  total_plans: 18
  completed_plans: 16
  percent: 89
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-17 — v2.7 milestone complete)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.
**Current focus:** v2.9 complete — next milestone: v3.0 Plants Tab (Phases 71–72)

## Current Position

Phase: 72 — Boundaries and Interaction
Plan: 0/2
Status: Ready to execute
Last activity: 2026-04-27 — Phase 72 planned (2 plans in 2 waves)

```
Progress: [████████████████████] 100% (3/3 plans)
```

## Accumulated Context

### Decisions

- Added specimen_inat_quality_grade as second alias (sob.quality_grade) in both ARM 1 and ARM 2 of combined CTE so final SELECT can reference j.specimen_inat_quality_grade uniformly
- Renamed CollectorEntry.observer to host_inat_login to match parquet column name; collector SQL filter updated to host_inat_login IN
- bee-filter-panel placed inside .content alongside bee-map (not inside bee-map shadow DOM) to preserve pure presenter invariant; right: calc(0.5em + 6rem) clears Regions button
- bee-sidebar :host position: absolute follows identical pattern to bee-filter-panel; portrait media query resets to position: static so sidebar re-enters flex flow on portrait screens
- features.ts outputs [lon, lat] WGS84 coordinates (not projected EPSG:3857) for Mapbox GL JS which expects WGS84 natively
- region-layer.ts stubs export only loadBoundaries and makeRegionStyleFn; removed exports cause expected bee-map.ts errors until Plan 02
- Filter-based selection highlighting (setFilter on selected-ring layer) chosen over feature-state to avoid promoteId conflicts with cluster IDs
- TypeScript accessToken cast required: verbatimModuleSyntax + nodenext resolves mapbox-gl default import to module namespace type; runtime property exists but TS cannot see it
- County/ecoregion filter options loaded from SQLite DISTINCT queries in bee-atlas._loadCountyEcoregionOptions, decoupled from map source events

### Pending Todos

None.

### Blockers/Concerns

CR-01 (pre-existing from Phase 67): bee-filter-controls.ts uses `observer` field in CollectorToken but filter.ts CollectorEntry defines `host_inat_login` — collector filtering by iNat username silently non-functional until resolved.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260421-t1a | Table mode improvements (filter button, selection highlight, links column, collector coalesce, field# fallback) | 2026-04-21 | c9c1b8c | [260421-t1a-table-mode-improvements](./quick/260421-t1a-table-mode-improvements/) |
| 260421-qk1 | Drop atom feeds for counties and ecoregions | 2026-04-21 | c1f196e | [260421-qk1-drop-county-ecoregion-feeds](./quick/260421-qk1-drop-county-ecoregion-feeds/) |
| 260422-sc1 | Fix specimen count mismatch between map filter panel and table view | 2026-04-22 | 78ccd3e | [260422-sc1-fix-specimen-count-mismatch](./quick/260422-sc1-fix-specimen-count-mismatch/) |
