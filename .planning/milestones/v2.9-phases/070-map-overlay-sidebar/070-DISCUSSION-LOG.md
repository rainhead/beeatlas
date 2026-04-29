# Phase 70: Map Overlay Sidebar — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Phase:** 070-map-overlay-sidebar
**Areas discussed:** Sidebar positioning, Mobile behavior, Visual treatment, Panel sizing, Panel header

---

## Sidebar Positioning

| Option | Description | Selected |
|--------|-------------|----------|
| Right edge, full height | position: absolute; right: 0; top: 0; bottom: 0; width: 25rem | |
| Right edge, below filter panel | Sidebar starts below the filter button, same right offset | ✓ |
| Specimen list panel (user-proposed) | Filter panel gains a specimen list section; transitions to table view | deferred |

**User's choice:** Sidebar anchors below the filter button, right-aligned overlay. Only visible when specimens are selected.

**Notes:** User clarified during discussion that selected specimens are a subset of filtered specimens, which are a subset of loaded specimens. Showing the selected specimens below the filter button preserves that conceptual hierarchy. The earlier "specimen list panel" idea (filter panel expanding to show all filtered specimens with a table transition) was deferred as a future phase — it conflated the filtered list with the selection.

---

## Mobile Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Keep below-map on portrait | Portrait layout unchanged; overlay only for landscape | ✓ |
| Overlay on mobile too | Always overlay regardless of orientation | |

**User's choice:** Keep current portrait behavior (sidebar below map).

---

## Visual Treatment

| Option | Description | Selected |
|--------|-------------|----------|
| Panel with shadow, no scrim | Drop shadow; map fully interactive behind panel | ✓ |
| Semi-transparent scrim | Dim backdrop; click to close | |

**User's choice:** Drop shadow only, no scrim.

---

## Panel Sizing

| Option | Description | Selected |
|--------|-------------|----------|
| Fill remaining height | Grows from below filter button to bottom of .content | ✓ |
| Fixed max-height | Capped height (e.g. 60%) | |

**User's choice:** Fill remaining height with overflow-y: auto.

---

## Panel Header

| Option | Description | Selected |
|--------|-------------|----------|
| "Selected specimens" heading + close button | Replace current close-only header with labeled heading | ✓ |
| Keep current close button only | Minimal header unchanged | |

**User's choice:** "Selected specimens" heading + close button.

---

## Deferred Ideas

- Specimen list panel: filter panel expanding vertically to list filtered specimens, with transition to/from table view — surfaced during positioning discussion; explicitly deferred to a future phase.
