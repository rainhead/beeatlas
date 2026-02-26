# Phase 4: Filtering - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Add taxon and date-range filter controls that narrow the visible specimens on the map without reloading the page. Filters apply in-browser to the already-loaded specimen data. Sharing filter state via URL is a separate phase (Phase 5).

</domain>

<decisions>
## Implementation Decisions

### Sidebar layout
- Sidebar is unified: filter controls (top) → summary stats → specimen listing
- Summary stats show filtered vs. total counts, e.g., "Genera: 3 of 80", "Specimens: 142 of 4,800"
- Specimen listing below the summary only populates when the user clicks a cluster or point on the map
- When a cluster is clicked, the listing shows only the specimens from that cluster that match the active filter
- No tabs — filters, stats, and listing coexist in a single scrollable sidebar

### Map behavior when filters are applied
- Non-matching specimen points and clusters are **dimmed/ghosted** (reduced opacity), not hidden entirely
- Matching points render at full opacity and remain clickable
- Non-matching points are not clickable
- This preserves geographic context while highlighting the filtered subset
- Note: roadmap success criteria say "hides" non-matching points; user preference is to ghost them instead

### Taxon filter
- Text input with dropdown autocomplete suggestions as the user types
- Suggestions include all taxonomy levels mixed together (family, genus, species), each labeled by rank
- Selecting a taxon filters to that taxon AND all its descendants (e.g., selecting genus "Bombus" includes all Bombus species)
- Single selection only — selecting a new taxon replaces the previous one
- Clearing the input removes the taxon filter

### Date filter — year range
- Two plain number inputs: "From" year and "To" year
- Open-ended: filling only "From" means that year to present; filling only "To" means all years up to that year
- Both empty = no year filter active

### Date filter — month filter
- Checkboxes for each of the 12 months (non-contiguous selection allowed, e.g., May + September)
- No months checked = no month filter active

### Filter combination
- Taxon and date filters combine with AND logic: specimens must match both to be shown at full opacity

### Claude's Discretion
- Visual design of the dimmed/ghosted state (opacity level, color treatment)
- Exact layout and spacing of filter controls within the sidebar
- How the summary stats section is styled
- Whether the "From"/"To" year inputs have min/max constraints based on dataset range

</decisions>

<specifics>
## Specific Ideas

- Summary line format like: "Genera: 3 of 80 · Specimens: 142 of 4,800" (when filter active)
- The filter + click-on-cluster workflow acts as a two-level drill-down: filter narrows the map, click drills into a location

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-filtering*
*Context gathered: 2026-02-22*
