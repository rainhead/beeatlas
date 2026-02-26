# Phase 3: Core Map - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire specimen clustering to the existing OpenLayers map and add a click-to-detail sidebar. Specimen points cluster at low zoom; clicking a cluster or individual point opens a sidebar showing sample details. Filtering controls and URL sharing are later phases.

</domain>

<decisions>
## Implementation Decisions

### Cluster appearance
- Size encodes specimen count — larger circle = more specimens in cluster
- Color encodes recency of the most recent specimen in the cluster, three tiers:
  - Within last 6 weeks (fresh)
  - This year but older than 6 weeks
  - Before this year
- Recency tiers computed at page load time from today's date (not a fixed reference date)
- Count number always displayed inside every cluster (no threshold)
- Individual specimen points (not clustered): same 3-tier recency color, fixed small size
- Symbology will be revised over time — keep implementation easy to adjust

### Cluster click behavior
- Clicking a cluster opens the sidebar with a sample list; no zoom-in
- Clicking a single specimen point opens the sidebar showing just that specimen's sample
- Specimens are organized by **sample** — the grouping unit is (date + collector + host plant)
- Each sample entry shows: date, collector, host plant (fieldNumber) as a header, with species names listed below it
- When a cluster has multiple samples, they are ordered most-recent-first

### Sidebar design
- Layout mirrors salishsea.io (https://github.com/salish-sea/salishsea-io/blob/main/src/salish-sea.ts):
  - Desktop: fixed 25rem right panel, `border-left: 1px solid #cccccc`
  - Mobile: panel moves below map at `max-aspect-ratio: 1` breakpoint, map at `50svh`, panel fills remaining space
- Default state (nothing clicked): shows summary statistics — total specimen count, species/genus/family counts, date range of the dataset
- Panel must be structured to accommodate filter and search controls in Phase 4 (don't hard-code a specimen-only layout)
- Dismiss specimen details: clicking elsewhere on the map OR a close/back control inside the panel — both return to the summary statistics view

### Claude's Discretion
- Exact color values for the 3 recency tiers
- Close/back control placement and styling within the sidebar
- Spacing, typography, and visual polish

</decisions>

<specifics>
## Specific Ideas

- Sidebar layout reference: salishsea.io uses `display: flex; flex-direction: row` on `<main>`, with `obs-panel` at `width: 25rem` and `border-left`. Mobile flips to `flex-direction: column` via `@media (max-aspect-ratio: 1)`.
- The panel is always present in the DOM (not conditionally rendered); show/hide is a state toggle on top of that layout.
- "I will revise the symbology over time" — keep cluster style code easy to change (no magic numbers buried in render logic).

</specifics>

<deferred>
## Deferred Ideas

- Filter controls (taxon, date range) in the sidebar default state — Phase 4
- Search in the sidebar — Phase 4 or later

</deferred>

---

*Phase: 03-core-map*
*Context gathered: 2026-02-20*
