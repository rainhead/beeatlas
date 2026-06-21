# Phase 155: Surface shift-drag rectangle selection in the UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-21
**Phase:** 155-surface-shift-drag-rectangle-selection-in-ui
**Areas discussed:** Scope, Affordance form, Placement

---

## Scope — desktop vs. touch

| Option | Description | Selected |
|--------|-------------|----------|
| Surface desktop only | Pure discoverability of existing shift-drag; no behavior change; mobile keeps near-me | ✓ |
| Add tap-to-draw mode | Button enters a plain-drag "draw a box" mode so touch users can draw bounds too | |
| Surface + mention mobile uses near-me | Surface desktop, adapt affordance to point touch users at near-me | |

**User's choice:** Surface desktop only.
**Notes:** Pure discoverability, no behavior change — truest to the roadmap goal.

## Scope — behavior on touch devices

| Option | Description | Selected |
|--------|-------------|----------|
| Hide on touch | Suppress affordance entirely on touch (pointer/hover media query); no dead UI | ✓ |
| Show everywhere | Render on all devices for consistency even though it can't work on touch | |

**User's choice:** Hide on touch.
**Notes:** Avoid promising a gesture that can't fire on touch. Detect via capability media query.

## Affordance form

| Option | Description | Selected |
|--------|-------------|----------|
| Persistent hint text | Muted line reusing existing `.hint` class; always visible (desktop); lowest friction | ✓ |
| Map control button | Button (reuse `.region-btn`) opening an instruction popover | |
| Hover tooltip on the map | Native title/tooltip surfaced on map hover | |

**User's choice:** Persistent hint text.
**Notes:** Reuses existing pattern; no new UI pattern introduced.

## Affordance form — visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Hide once bounds active | Show only while no bounds set; hide after a box is drawn | |
| Always visible | Persistent on desktop regardless of state | ✓ |
| Hide after first use ever | Onboarding-style suppress via localStorage | |

**User's choice:** Always visible.
**Notes:** Simplest; no persistence state.

## Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Bottom-left of map | Overlaid on map, clear of existing controls | |
| Bottom-center of map | Overlaid bottom-center | |
| Above/near the map, outside it | In surrounding chrome | |
| (Other — user freeform) | Immediately below the location input in the sidebar filters section | ✓ |

**User's choice:** Immediately below the "County, ecoregion, or place" input in the sidebar filters section (`bee-pane.ts`).
**Notes:** Pairs the hint with the near-me crosshair and where active bounds already render (Phase 153) — exactly where bounds are managed.

## Copy

**User's choice (verbatim):** "Shift-drag on map to set bounds"
**Notes:** Aligns with the FILTER/bounds vocabulary established in Phase 156.

---

## Claude's Discretion

- Exact hint styling/spacing, optional emphasis on "Shift" (bold/`<kbd>`), and whether an icon accompanies the text.
- Precise media-query expression for the desktop-only / hide-on-touch gating.
- Conditional Lit render vs. always-render-then-CSS-hide for the touch gating (prefer keeping it out of the DOM/flow on touch if clean).

## Deferred Ideas

- Touch / tap-to-draw bounds mode — new capability, its own phase.
- First-visit onboarding / dismissible hint (localStorage) — rejected in favor of always-on; could revisit if noisy.
