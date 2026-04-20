# Phase 68: Filter Panel Redesign — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 068-filter-panel-redesign
**Areas discussed:** Collapsed trigger, Filter panel layout, Discovery, Filter input style

---

## Collapsed Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Full-width toolbar row | Current behavior — always visible at top | |
| Floating icon + count overlay | Magnifying-glass icon with specimen count, over the map | ✓ |
| Header button | Toggle in `<bee-header>` | |

**User's choice:** Floating control over the map with magnifying-glass icon and specimen count. Active state via coloring when any filter is applied. Tap to open/close.

---

## Filter Panel Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Flat list of inputs | Current arrangement — all controls inline | |
| What / Who / Where / When sections | Grouped by dimension, each with an icon | ✓ |
| Accordion by filter type | Each filter type collapsible individually | |

**User's choice:** Four sections in order — What (taxon), Who (collector), Where (county/ecoregion/elevation), When (year/month). Each section denoted by an icon.

---

## Discovery

| Option | Description | Selected |
|--------|-------------|----------|
| Dynamic hints (top genera/counties in view) | Show most-common values in current viewport | |
| Icon-based section headers only | Structure communicates what's filterable | ✓ |
| Onboarding tooltips | First-run hints | |

**User's choice:** Icon-based what/who/where/when structure is sufficient. No dynamic hints needed.

---

## Filter Input Style / Memory

| Option | Description | Selected |
|--------|-------------|----------|
| Custom suggestion caching | Persist recent filter terms | |
| Browser native history | Rely on `<input>` autofill from browser | ✓ |
| No suggestions | Just the programmatic datalist from loaded data | |

**User's choice:** No custom caching. Browser native history + programmatic datalists from loaded data are sufficient.

---

## Claude's Discretion

- Elevation placement: under "Where"
- Download button: move to table view only
- Panel position on map: Claude decides
- Panel open direction: Claude decides
