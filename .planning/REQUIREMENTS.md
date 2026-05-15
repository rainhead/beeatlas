# Requirements: Washington Bee Atlas

**Defined:** 2026-05-14
**Core Value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.

## v3.5 Requirements

### Selection Drawing

- [ ] **SEL-01**: User can shift-drag on the map to draw a rectangular selection area (Mapbox BoxZoomHandler disabled; custom shift-drag listener)
- [ ] **SEL-02**: A rectangle outline tracks the drag in real-time as visual feedback

### Occurrence Query

- [ ] **SEL-03**: On drag release, occurrences whose lat/lon fall within the rectangle bounds AND pass current active filters are identified
- [ ] **SEL-04**: Sidebar opens showing the matched occurrences (same `bee-occurrence-detail` presentation as a cluster click)
- [ ] **SEL-05**: If zero filter-passing occurrences fall within the bounds, the sidebar is not opened

### URL State

- [ ] **SEL-06**: Rectangle bounds are encoded in the URL as a `sel=west,south,east,north` param (4 decimal places); restored on page load to re-run the query and open the sidebar
- [ ] **SEL-07**: When the sidebar is dismissed (empty-click), the `sel=` param is cleared from the URL

## Future Requirements

### Selection Enhancements

- **SEL-F01**: Mobile touch equivalent of shift-drag selection (touch-and-hold → drag)
- **SEL-F02**: Visual selection rings on individually-selected map points after rectangle release (mirrors cluster-click ring behavior)
- **SEL-F03**: Multi-rectangle selection (add to selection with additional shift-drags)

## Out of Scope

| Feature | Reason |
|---------|--------|
| URL encoding of individual selected occurrence IDs from rectangle | Too many IDs for typical rectangle selection; bounds encoding covers the shareable state instead |
| Selection ring highlights on individual selected points | Visual noise at scale; rectangle may select hundreds of points |
| Mobile touch equivalent | Shift-drag is desktop UX; deferred to Future |
| Rectangle persisting as a drawn shape on the map | Ephemeral gesture; sidebar presence implies active selection |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEL-01 | Phase 89 | Pending |
| SEL-02 | Phase 89 | Pending |
| SEL-03 | Phase 90 | Pending |
| SEL-04 | Phase 90 | Pending |
| SEL-05 | Phase 90 | Pending |
| SEL-06 | Phase 91 | Pending |
| SEL-07 | Phase 91 | Pending |

**Coverage:**
- v3.5 requirements: 7 total
- Mapped to phases: 7
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-14*
*Last updated: 2026-05-14 after initial definition*
