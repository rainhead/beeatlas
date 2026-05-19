# Requirements: Washington Bee Atlas — v3.9 Sidebar & Table Unification

**Defined:** 2026-05-19
**Core Value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.

## v3.9 Requirements

### Pane Layout

- [ ] **PANE-01**: User sees a persistent toggle button at the pane edge in all three pane states (collapsed, list, table)
- [ ] **PANE-02**: User can open the pane to list state from collapsed, and collapse it from list or table state, via the toggle button
- [ ] **PANE-03**: User can expand the pane to table state via an expand button visible in the pane's list state on desktop
- [ ] **PANE-04**: User can return to list state from table state via a shrink button visible in the table state header
- [ ] **PANE-05**: Pane's list state shows all filter controls (taxon, date, region, collector, place) and occurrence detail when a cluster is selected
- [ ] **PANE-06**: Expand-to-table button is hidden on mobile; pane on mobile behaves as open/close only (no three-state treatment)

### Table in Pane

- [ ] **TABLE-01**: Table view in the pane's table state retains all existing functionality (DuckDB-backed pagination, CSV export, filter state integration)
- [ ] **TABLE-02**: Full-screen `viewMode='table'` that replaces the map is removed; table is accessible only as a pane sub-state

### URL State

- [ ] **URL-01**: Pane state is encoded in the URL and restored on page load (collapsed state omitted from URL; list and table states encoded)
- [ ] **URL-02**: Legacy `?view=table` URLs are parsed as pane table state for backward compatibility

### Map Resize

- [ ] **MAP-01**: Mapbox canvas resizes correctly after any pane state transition (collapsed↔list, list↔table)

## Future Requirements

Not in v3.9 scope. Tracked for future milestones.

### Data Content (deferred from v3.8)

- **TAB-01**: Determinations (identifications) for my specimens listed by recency — requires iNat determination data in pipeline
- **TAB-02**: Specimens collected last season on land owned by a named organization — requires land ownership data source
- **TAB-03**: Common floral hosts by month and region — cross-table aggregation query on ecdysis data

## Out of Scope

| Feature | Reason |
|---------|--------|
| Drag-to-resize pane width | Requires drag handling, keyboard resize, min/max guards, localStorage persistence, extra map.resize() — a complete mini-feature; deferred to future milestone |
| Three-state pane on mobile | Mobile UX is simpler; open/close overlay is appropriate for narrow viewports |
| Saved pane width in localStorage | Not needed for MVP; deterministic widths per state are sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PANE-01 | — | Pending |
| PANE-02 | — | Pending |
| PANE-03 | — | Pending |
| PANE-04 | — | Pending |
| PANE-05 | — | Pending |
| PANE-06 | — | Pending |
| TABLE-01 | — | Pending |
| TABLE-02 | — | Pending |
| URL-01 | — | Pending |
| URL-02 | — | Pending |
| MAP-01 | — | Pending |

**Coverage:**
- v3.9 requirements: 11 total
- Mapped to phases: 0
- Unmapped: 11 ⚠️

---
*Requirements defined: 2026-05-19*
*Last updated: 2026-05-19 after initial definition*
