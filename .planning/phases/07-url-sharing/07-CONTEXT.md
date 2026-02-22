# Phase 7: URL Sharing - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Encode map view state (center, zoom, active filters, selected specimen) into the URL query string so collectors can copy and share links that restore the exact view another collector sees. A fresh load with no params shows the default Washington state view.

Link preview server-side rendering (OG meta tags) is explicitly out of scope — the query string format is chosen to make that possible in a future phase.

</domain>

<decisions>
## Implementation Decisions

### URL format
- Use query string params, NOT hash/fragment — required for future server-side link preview generation (hash is invisible to servers)
- Follow SalishSea.io's param conventions as a template: `x`, `y`, `z` for map center + zoom; `o` for selected occurrence

### Filter params
- Encode filter state loosely following SalishSea style, adapted to BeeAtlas filter shape
- Example: `taxon=Bombus&yr0=2018&yr1=2022&months=3,4,5`
- Researcher should confirm exact param names that cleanly cover all filter dimensions (taxon text, year range, month checkboxes)

### Selected occurrence encoding
- Param: `o` (matching SalishSea)
- Value format: `ecdysis:{id}` — the Ecdysis occurrence ID, namespaced with a `ecdysis:` prefix
- Namespace prefix is intentional for forward compatibility: future non-Ecdysis data sources can use their own prefix without collision
- Researcher should identify which Parquet column holds the Ecdysis occurrence ID

### History behavior
- Match SalishSea exactly: `replaceState` during continuous interactions (panning, dragging, live filter changes)
- `pushState` after 500ms debounce on settle — back button navigates between settled views
- `popstate` event listener syncs browser back/forward navigation to app state
- Flag to prevent redundant URL updates when restoring from history

### Claude's Discretion
- Exact debounce implementation
- Default view coordinates (Washington state at full extent — pick sensible lat/lng/zoom)
- How to handle invalid/corrupted URL params on load (graceful fallback to default)

</decisions>

<specifics>
## Specific Ideas

- SalishSea.io (https://github.com/salish-sea/salishsea-io/blob/main/src/salish-sea.ts) is the direct template — same OpenLayers stack, same URL param approach, same selection state for occurrences. Researcher should study this implementation closely.
- The `ecdysis:` namespace prefix on occurrence IDs is a deliberate forward-compatibility design — it's not overengineering, it's a stated requirement.

</specifics>

<deferred>
## Deferred Ideas

- Link preview server (OG meta tag generation via Lambda or CloudFront Function) — future phase; query string format is chosen now to enable this cleanly

</deferred>

---

*Phase: 07-url-sharing*
*Context gathered: 2026-02-22*
