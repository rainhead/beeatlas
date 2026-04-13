# Requirements: v2.4 Header Navigation & Toolbar

**Milestone goal:** Reorganize the UI into a header-driven layout with navigational data-layer tabs, a map/table view toggle, and a persistent filter toolbar, replacing the sidebar's navigation and filter roles.

---

## v2.4 Requirements

### Header Navigation

- [ ] **HDR-01**: User can switch between Specimens and Samples data layers via header nav tabs; active tab is visually distinct
- [ ] **HDR-02**: Header nav tabs collapse to a hamburger menu on narrow viewports
- [ ] **HDR-03**: Species and Plants appear as greyed-out disabled placeholders in the nav to signal the roadmap
- [ ] **HDR-04**: User can toggle between Map and Table view via an icon pair on the right side of the header

### Filter Toolbar

- [ ] **FILT-08**: All filter controls (taxon, year, month, county, ecoregion) are presented in a persistent toolbar below the header, replacing their current sidebar placement
- [ ] **FILT-09**: CSV download button appears in the filter toolbar

### Sidebar

- [ ] **SIDE-01**: Sidebar is hidden by default; appears when user clicks a map feature (specimen cluster or sample dot)
- [ ] **SIDE-02**: User can dismiss the sidebar; it returns to hidden state

---

## Future Requirements (deferred)

- Feed subscription links in sidebar — deferred; no replacement surface defined yet
- Toolbar filter controls on narrow viewports (scroll vs. collapse) — deferred to implementation decision

## Out of Scope

| Feature | Reason |
|---------|--------|
| Filter persistence across sessions | URL sharing covers the use case |
| Drag-to-resize sidebar | Out of scope for this milestone |
| Animated sidebar transitions | Deferred; can be added as polish |

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| HDR-01 | Phase 52 | pending |
| HDR-02 | Phase 52 | pending |
| HDR-03 | Phase 52 | pending |
| HDR-04 | Phase 52 | pending |
| FILT-08 | Phase 53 | pending |
| FILT-09 | Phase 53 | pending |
| SIDE-01 | Phase 54 | pending |
| SIDE-02 | Phase 54 | pending |
