# Requirements: Washington Bee Atlas — v1.9 Frontend Architecture Refactor

**Defined:** 2026-04-03
**Core Value:** Collectors can see where bees have been collected and where target host plants grow, enabling informed planning of future collecting events.

## v1.9 Requirements

### Component Architecture

- [ ] **ARCH-01**: `<bee-atlas>` custom element exists as root component; owns layer mode, selection, filter state, summaries, and boundary mode — bee-map no longer owns non-map state
- [ ] **ARCH-02**: `<bee-map>` accepts filter results, layer mode, boundary mode, and selection as properties; emits events for map interactions (clicks, view changes) only
- [ ] **ARCH-03**: bee-atlas handles events from bee-map and bee-sidebar; updates state and propagates results back down without bee-map and bee-sidebar knowing about each other

### URL State

- [ ] **URL-01**: `url-state.ts` module exports typed serialize/deserialize functions for all app state (view, filters, selection, layer mode, boundary mode); no component or DOM dependencies — pure module
- [ ] **URL-02**: bee-atlas reads URL state on init and writes on state change; popstate handled in bee-atlas; `_restored*` properties eliminated from bee-map

### Sidebar Decomposition

- [ ] **DECOMP-01**: `<bee-filter-controls>` component encapsulates taxon, date (year/month), county, and ecoregion filter inputs; emits a single `filter-changed` event with full filter state
- [ ] **DECOMP-02**: `<bee-specimen-detail>` component renders specimen cluster detail given a list of specimens as a property
- [ ] **DECOMP-03**: `<bee-sample-detail>` component renders sample observation detail given a sample event as a property
- [ ] **DECOMP-04**: bee-sidebar reduced to a layout container that composes the above sub-components and routes events

### Global State Elimination

- [ ] **STATE-01**: `filter.ts` has no module-level mutable exports — `filterState`, `visibleEcdysisIds`, `visibleSampleIds` are not module-level variables; filter logic is owned by bee-atlas or an encapsulated class
- [x] **STATE-02**: OL sources and layers in bee-map.ts are instance properties on `<bee-map>`; bee-map.ts has no module-level side effects on import
- [x] **STATE-03**: `region-layer.ts` has no module-level eager-loading side effects; county and ecoregion sources initialized as instance properties within their owning component

### Test Infrastructure

- [ ] **TEST-01**: Vitest + happy-dom installed and configured in `frontend/`; `npm test` script runs the suite and exits non-zero on failure
- [ ] **TEST-02**: `url-state.ts` covered by round-trip tests: serialize state → deserialize URL params → same typed state object
- [ ] **TEST-03**: filter SQL builder covered by unit tests for all field combinations (taxon, year, month, county, ecoregion — individually and combined)
- [ ] **TEST-04**: At least one decomposed Lit component (`<bee-filter-controls>`, `<bee-specimen-detail>`, or `<bee-sample-detail>`) has a render test verifying correct DOM output given known props

## Future Requirements

### Tabular Views

- **TAB-01**: User can view a list of determinations (identifications) for their specimens ordered by recency — requires iNat determination data in pipeline
- **TAB-02**: User can view specimens collected last season on land owned by a named organization — requires land ownership data source
- **TAB-03**: User can view common floral hosts by month and region — cross-table aggregation query on ecdysis data

## Out of Scope

| Feature | Reason |
|---------|--------|
| New user-facing features | Pure refactoring milestone — correctness and parity is the bar |
| Backend / pipeline changes | Frontend architecture only |
| Performance optimization | Separate concern; refactoring for structure, not speed |
| Full component test coverage | Establishing infrastructure + representative tests; full coverage is future work |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | Phase 36 | Pending |
| ARCH-02 | Phase 36 | Pending |
| ARCH-03 | Phase 36 | Pending |
| URL-01 | Phase 35 | Pending |
| URL-02 | Phase 35 | Pending |
| DECOMP-01 | Phase 37 | Pending |
| DECOMP-02 | Phase 37 | Pending |
| DECOMP-03 | Phase 37 | Pending |
| DECOMP-04 | Phase 37 | Pending |
| STATE-01 | Phase 34 | Pending |
| STATE-02 | Phase 34 | Complete |
| STATE-03 | Phase 34 | Complete |
| TEST-01 | Phase 33 | Pending |
| TEST-02 | Phase 38 | Pending |
| TEST-03 | Phase 38 | Pending |
| TEST-04 | Phase 38 | Pending |

**Coverage:**
- v1.9 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-04-03 — traceability populated during roadmap creation*
