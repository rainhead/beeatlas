# Phase 39: View Mode Toggle - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-07
**Phase:** 39-view-mode-toggle
**Areas discussed:** Toggle control placement, Sidebar in table view

---

## Toggle Control Placement

| Option | Description | Selected |
|--------|-------------|----------|
| In the sidebar | Below Specimens/Samples tabs, above filters. No new layout regions. | ✓ |
| Floating button over the map | Absolutely positioned pill over the map canvas. | |
| Top toolbar (new element) | New `<bee-toolbar>` element above the map+sidebar row. | |

**User's choice:** In the sidebar — `[🗺 Map] [Table]` toggle row below the tab row.
**Notes:** Chosen because it keeps all controls in one panel and requires no new layout regions.

---

## Sidebar in Table View

| Option | Description | Selected |
|--------|-------------|----------|
| Sidebar stays, table fills map area | Table replaces `bee-map`; sidebar visible for filters. | ✓ |
| Table takes full width, sidebar hidden | Entire `bee-atlas` area becomes table; sidebar hidden. | |

**User's choice:** Sidebar stays visible in table view.
**Notes:** "Full content space" in the success criteria is interpreted as the area currently occupied by `bee-map`, not the entire viewport.

---
