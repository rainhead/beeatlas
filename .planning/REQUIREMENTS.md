# Requirements: Washington Bee Atlas

**Defined:** 2026-03-12
**Core Value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.

## v1.4 Requirements

### Map Layer

- [x] **MAP-03**: User can see iNat collection events rendered as simple dot markers on the map as a distinct layer
- [x] **MAP-04**: User can toggle between specimen clusters and sample dots (exclusive — one layer visible at a time; sidebar clears on switch)
- [ ] **MAP-05**: Clicking a sample dot shows observer, date, specimen count, and a link to the iNat observation in the sidebar

### Linkage

- [x] **LINK-05**: Specimen sidebar shows a clickable iNat observation link when a linkage exists in links.parquet

## Future Requirements

### Map Layer

- **MAP-06**: URL encoding of selected sample marker (`inat=` param) — defer until collectors confirm they share sample links
- **MAP-07**: Combined specimens + samples view — click disambiguation is non-trivial; defer until collectors request it
- **MAP-08**: Sample dot size-encoded by specimen count — defer until basic layer ships and feedback received

## Out of Scope

| Feature | Reason |
|---------|--------|
| Filter controls (taxon/date) active in sample mode | Sample data has no taxon column; filters are hidden when sample layer is active |
| Tribe-level filtering | Tribe not present in Ecdysis DarwinCore export |
| Server-side API or backend | Static hosting constraint — all data client-side |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| MAP-03 | Phase 13 (partial — source), Phase 14 (complete) | Complete |
| MAP-04 | Phase 14 | Complete |
| MAP-05 | Phase 15 | Pending |
| LINK-05 | Phase 15 | Complete |

**Coverage:**
- v1.4 requirements: 4 total
- Mapped to phases: 4
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-12*
*Last updated: 2026-03-12 after roadmap creation (Phases 13–15)*
