# Phase 69: Table Drawer — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 069-table-drawer
**Areas discussed:** Drawer height & layout, Trigger mechanism, Row → map linking, Filter panel coexistence

---

## Drawer Height & Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed strip (~15-20%) | Map strip always visible at top of drawer area | ✓ |
| Half and half | Map takes top 50%, table bottom 50% | |
| User-resizable | Drag handle at top edge of table | |

**User's choice:** Fixed strip (~15-20%)
**Notes:** Simple, no resize logic needed.

---

## Trigger Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Keep header icon buttons | Existing map/table icon buttons toggle drawer | ✓ |
| Bottom edge handle / FAB | New pull-up handle or floating button at bottom of map | |

**User's choice:** Keep header icon buttons
**Notes:** No new UI element needed.

---

## Row → Map Linking

| Option | Description | Selected |
|--------|-------------|----------|
| No linking | Table rows independent of map | |
| Highlight point on map | Row click highlights corresponding point | |
| Pan map to row location | Row click pans map strip to center on occurrence | ✓ |

**User's choice:** Pan map to row location
**Notes:** Sidebar never shows in table mode (user-stated constraint). Row click pans only — no sidebar open.

---

## Filter Panel Coexistence

| Option | Description | Selected |
|--------|-------------|----------|
| Filter stays on map strip | Filter panel visible in map strip when drawer open | |
| Filter auto-closes when drawer opens | Filter collapses but trigger remains | |
| Filter moves to table header | Filter trigger relocates to table toolbar | |

**User's choice:** (Not formally selected — user clarified) Filter panel is hidden in table mode, consistent with the principle that sidebar also never shows in table mode. Table mode is a clean mode.
**Notes:** User stated: "The sidebar should never show in table mode." Same principle applied to filter panel.

---

## Claude's Discretion

- Drawer CSS approach (position: absolute vs flex split vs CSS transform)
- Pan zoom level on row click (preserve current zoom vs snap to close-up)
- Drawer open/close animation

## Deferred Ideas

None.
