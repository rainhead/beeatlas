---
phase: "157"
plan: "02"
subsystem: ui
tags: [uat, human-verify, checkpoint, ui-hint, SC-1, SC-2, SC-4]
dependency_graph:
  requires:
    - 157-01 region control relocation (SUMMARY present, 828 tests green)
  provides:
    - "157-HUMAN-UAT.md operator checklist (3 pane states x 2 layouts + attribution-bleed regression + boundary-toggle behavior)"
    - "Blocking human-verify checkpoint (no auto-advance)"
  affects:
    - .planning/phases/157-regions-dropdown-obscured-by-filter-button/157-HUMAN-UAT.md
tech_stack:
  added: []
  patterns:
    - "Blocking HUMAN-UAT for UI-hint phases — autonomous:false / auto_advance:false (feedback_uat_ui_phases)"
key_files:
  created:
    - .planning/phases/157-regions-dropdown-obscured-by-filter-button/157-HUMAN-UAT.md
  modified: []
key-decisions:
  - "Mirrored the 153-HUMAN-UAT prose format (scenario steps + per-layout pass/fail) rather than the terse verify-work template; added a machine-readable ## Summary / ## Gaps block for /gsd-progress + /gsd-audit-uat parsing"
  - "Scenario 3 (table pane) carries the SC-2 attribution-not-bleeding check and is marked non-deferrable — it is the Phase 108 regression guard"
  - "Each pixel scenario (1-3) has separate Wide and Narrow (max-aspect-ratio:1 portrait) pass/fail rows; narrow-layout trigger documented (portrait window or Firefox Responsive Design Mode)"
requirements-completed: [SC-1, SC-2, SC-4]
duration: "inline (subagent spawn 529-overloaded; orchestrator executed)"
completed: "2026-06-21"
---

# Phase 157 Plan 02: Operator UAT checklist + blocking human-verify checkpoint

**Authored `157-HUMAN-UAT.md` — a four-scenario operator checklist (collapsed / list / table pane states, each in wide + narrow layouts, plus the Mapbox-attribution-not-bleeding regression check and a boundary-toggle behavior sanity check). The phase now halts for a blocking human-verify checkpoint and does not auto-advance.**

## What changed

- Created `157-HUMAN-UAT.md` mirroring the `153-HUMAN-UAT.md` format:
  - Prerequisites (npm test/build green, `npm run dev` → `/app`).
  - Layout note explaining how to trigger the narrow (`@media (max-aspect-ratio: 1)`) bottom-pane layout.
  - Scenario 1 — collapsed map: all four region options fully visible/clickable, filter button beside (not under) the menu (SC-1, SC-4).
  - Scenario 2 — list pane expanded: menu fully above the list column (SC-1).
  - Scenario 3 — table pane expanded: menu fully above the table **and** Mapbox bottom-right attribution still visible and NOT bleeding over the table pane (SC-1, SC-2 — Phase 108 regression guard, marked non-deferrable).
  - Scenario 4 — boundary-toggle behavior unchanged (Counties/Ecoregions/Places/Off + leaving-'places' clears selected place).
  - `## Summary` / `## Gaps` machine-readable sections + a Verdict block.

## Must-haves verification

- ✅ `157-HUMAN-UAT.md` exists with the four scenarios, each pixel scenario in both wide and narrow layouts, explicit pass/fail checkboxes.
- ✅ The table-mode row explicitly includes the attribution-not-bleeding check (SC-2 regression guard).
- ✅ `autonomous: false` / `auto_advance: false` — blocking checkpoint; the phase does not auto-advance past UAT.

## Notes / deviations

- **Execution path:** subagent spawn returned `529 Overloaded`; the orchestrator authored the doc inline (a markdown-only plan, no code).
- **Awaiting operator:** the phase is intentionally NOT marked verified/complete. Operator runs the checklist in a browser, records pass/fail, signs off, then `/gsd-verify-work 157` (or reports gaps → `/gsd-plan-phase 157 --gaps`).

## Self-Check: PASSED
