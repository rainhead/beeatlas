---
phase: 108-bee-atlas-cutover-map-resize
plan: 02
subsystem: ui
tags: [mapbox, bee-pane, uat, browser-testing]

requires:
  - phase: 108-bee-atlas-cutover-map-resize
    provides: bee-pane overlay cutover replacing bee-sidebar/bee-filter-panel

provides:
  - MAP-01 browser UAT sign-off
  - Bug fixes surfaced during UAT

affects: []

tech-stack:
  added: []
  patterns: []

key-files:
  modified:
    - src/bee-atlas.ts
    - src/bee-pane.ts
    - src/bee-header.ts
    - src/bee-map.ts
---

## UAT Outcome: APPROVED

Browser: Safari (desktop + simulated iPhone 16 Plus)
Date: 2026-05-20

### MAP-01 Result

Mapbox canvas shows no grey tiles, misaligned controls, or stale tile edges across all pane state transitions (collapsed↔list, list↔table, table→list→collapsed) on both desktop and mobile. The overlay architecture (bee-pane as position:absolute, bee-map dimensions invariant) correctly avoids resize events. No explicit `map.resize()` call is needed.

URL `pane=` param updates correctly on every transition.

### Issues Found and Fixed During UAT

**Attribution/logo above pane (z-index)**
Mapbox internal controls (logo, attribution) were appearing above bee-pane because bee-map lacked a stacking context. Fixed: `position: relative; z-index: 0` on `bee-map` in bee-atlas.ts creates a stacking context that contains Mapbox's internal z-indices, so bee-pane at z-index:1 paints on top.

**Mapbox controls floating high on mobile (y-position)**
The prior `bottom: 60%` rule in bee-map.ts applied unconditionally in portrait mode, leaving controls elevated even when the pane was collapsed. Fixed: removed the rule. Controls now sit at their natural bottom position; the pane covers them when open, which is acceptable.

**Sidebar button order**
The × close button was at the left of the sidebar header. Fixed: reordered to `[Filters title flex:1] [⊞ expand] [× close]` so × is at the top-right.

**Table view missing close button**
The table header had only the shrink (⊟) button. Fixed: added a × close button at the right of the table header.

**Row click centers map hidden behind table**
Clicking a row in table state panned the map to the occurrence, but the table overlay covered it. Fixed: `_onRowPan` in bee-atlas.ts now transitions paneState to 'list' before panning when in table state.

**Map icon removed from header**
The map navigation icon was stripped along with the table icon during 109-02. Fixed: restored as a `/` home link in bee-header.ts.
