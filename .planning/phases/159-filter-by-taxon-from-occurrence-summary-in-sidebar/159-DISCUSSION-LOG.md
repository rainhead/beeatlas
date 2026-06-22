# Phase 159: Filter by taxon from occurrence summary in sidebar - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-22
**Phase:** 159-filter-by-taxon-from-occurrence-summary-in-sidebar
**Areas discussed:** Affordance, Rank, Combine with active filter, Table-view scope

---

## Affordance (taxon name is already an external link)

| Option | Description | Selected |
|--------|-------------|----------|
| Separate filter glyph | Keep name linking out; add a small dedicated filter glyph beside it | |
| Name filters, icon links out | Repurpose the name as the filter trigger; demote external record to a small icon link | ✓ |
| Hover-revealed action | Show a "Filter to this" affordance only on hover/focus | |

**User's choice:** Name filters, icon links out
**Notes:** Applies across all five render paths in `bee-occurrence-detail`. Reuse the existing `📷` / "View on iNaturalist" icon-link pattern for the demoted external link; no brand-new UI pattern.

---

## Rank (below-species clicks)

| Option | Description | Selected |
|--------|-------------|----------|
| Roll up to species | Filter at the parent species of an infraspecific ID | |
| Exact taxon clicked | Filter at the precise taxon_id, including subspecies | ✓ |

**User's choice:** Exact taxon clicked
**Notes:** Higher-rank clicks (genus/family) still include descendants via the existing hierarchical `lineage_path` clause — only the clicked rank changes, not the resolution logic.

---

## Combine with active filter

| Option | Description | Selected |
|--------|-------------|----------|
| Set taxon, keep the rest | Replace only the taxon dimension; preserve collector/year/place/etc. (intersect) | ✓ |
| Replace whole filter | Clear other dimensions and filter to just this taxon | |

**User's choice:** Set taxon, keep the rest
**Notes:** FilterState holds dimensions independently; emit current state with taxon swapped.

---

## Table-view scope

| Option | Description | Selected |
|--------|-------------|----------|
| Sidebar list only | Scope to bee-occurrence-detail this phase | ✓ |
| Sidebar and table | Add the affordance to the table's Species cell too | |

**User's choice:** Sidebar list only
**Notes:** Table rows already click-to-select; cell-level filter needs its own interaction design — deferred.

---

## Claude's Discretion

- Exact glyph/markup and hover/focus styling for the repurposed name + demoted icon link, constrained to existing component patterns.
- Derived decision (D-08): taxon-filter click leaves active point-selection untouched (filter/selection separation) — flagged for planner confirmation.

## Deferred Ideas

- Click-to-filter in the table/drawer view (row-select vs cell-filter interaction).
- A future "roll up to species" toggle if exact below-species filtering proves too narrow.
