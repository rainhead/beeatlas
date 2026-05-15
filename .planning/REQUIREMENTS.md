# Requirements: Washington Bee Atlas v3.6

**Defined:** 2026-05-15
**Core Value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.

## v3.6 Requirements

Replace the monolithic /species/ all-cards page with a proper per-taxon page architecture: a searchable family→genus index as entry point, plus individual pages for tribes, genera, subgenera, and species.

### URL Routing

- [ ] **URL-01**: Each species has a dedicated page at `/species/{Genus}/{specificEpithet}/` where Genus preserves original capitalization and specificEpithet is lowercase (hyphens permitted in epithet)
- [ ] **URL-02**: Each genus has a dedicated page at `/species/{Genus}/`
- [ ] **URL-03**: Each subgenus has a dedicated page at `/species/{Genus}/{Subgenus}/` (both capitalized, distinguishing it from lowercase specific epithets)
- [ ] **URL-04**: Each tribe has a dedicated page at `/species/tribe/{TribeName}/`
- [ ] **URL-05**: The existing `/species/` all-cards single-page layout (tree-nav + per-species card wall) is replaced entirely by the new index page

### Index Page

- [ ] **IDX-01**: `/species/` lists all species grouped by family, then by genus within each family
- [ ] **IDX-02**: A type-to-filter text input narrows the displayed genera and species as the user types
- [ ] **IDX-03**: Clicking a genus name navigates to `/species/{Genus}/`
- [ ] **IDX-04**: Clicking a species name navigates to `/species/{Genus}/{specificEpithet}/`

### Genus Pages

- [ ] **GEN-01**: Genus page lists all species belonging to that genus with specimen counts
- [ ] **GEN-02**: Genus page displays a static SVG occurrence map with each species rendered in a distinct color
- [ ] **GEN-03**: Each species entry on the genus page links to its individual species page

### Subgenus Pages

- [ ] **SUBG-01**: Subgenus page lists species belonging to that subgenus with specimen counts
- [ ] **SUBG-02**: Subgenus page displays a multi-color static SVG occurrence map for species in the subgenus
- [ ] **SUBG-03**: Each species entry links to its individual species page

### Tribe Pages

- [ ] **TRIBE-01**: Tribe page lists all genera belonging to that tribe
- [ ] **TRIBE-02**: Tribe page displays a multi-color static SVG occurrence map for all species in the tribe
- [ ] **TRIBE-03**: Each genus entry links to its genus page

### Species Pages

- [ ] **SPE-01**: Each species in the WA checklist has a dedicated static page at `/species/{Genus}/{specificEpithet}/`
- [ ] **SPE-02**: Species page displays photo(s) from `content/species-photos.toml` (fallback when none)
- [ ] **SPE-03**: Species page displays a static SVG occurrence map for that species alone
- [ ] **SPE-04**: Species page displays a seasonality visualization

### Pipeline & Build

- [ ] **PIPE-01**: Eleventy generates one static page per species, genus, subgenus, and tribe from `species.json` data
- [ ] **PIPE-02**: `species_maps.py` generates multi-color SVG occurrence maps for genus, subgenus, and tribe pages (each species assigned a distinct color within the group)
- [ ] **PIPE-03**: `species_export.py` updates the `slug` field to the new hierarchical path format (`Genus/specificEpithet`); `content/species-photos.toml` keys are migrated to match

## Future Requirements

*(none defined yet)*

## Out of Scope

| Feature | Reason |
|---------|--------|
| Subfamily pages | Subfamily level adds depth without surfacing data volunteers use; genus is the practical browsing unit |
| Interactive Mapbox maps on taxon pages | Static SVG maps match the existing per-species pattern and add zero JS weight |
| Server-side redirects from old `/species/#slug` anchors | Static hosting; internal old-URL links will be updated as part of the slug migration |
| Real-time filter on taxon pages (county/ecoregion) | Out of scope for v3.6 — static maps only; can be added later |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| URL-01 | Phase 94 | Pending |
| URL-02 | Phase 94 | Pending |
| URL-03 | Phase 95 | Pending |
| URL-04 | Phase 95 | Pending |
| URL-05 | Phase 96 | Pending |
| IDX-01 | Phase 96 | Pending |
| IDX-02 | Phase 96 | Pending |
| IDX-03 | Phase 96 | Pending |
| IDX-04 | Phase 96 | Pending |
| GEN-01 | Phase 94 | Pending |
| GEN-02 | Phase 94 | Pending |
| GEN-03 | Phase 94 | Pending |
| SUBG-01 | Phase 95 | Pending |
| SUBG-02 | Phase 95 | Pending |
| SUBG-03 | Phase 95 | Pending |
| TRIBE-01 | Phase 95 | Pending |
| TRIBE-02 | Phase 95 | Pending |
| TRIBE-03 | Phase 95 | Pending |
| SPE-01 | Phase 94 | Pending |
| SPE-02 | Phase 94 | Pending |
| SPE-03 | Phase 94 | Pending |
| SPE-04 | Phase 94 | Pending |
| PIPE-01 | Phase 94 | Pending |
| PIPE-02 | Phase 93 | Pending |
| PIPE-03 | Phase 92 | Pending |

**Coverage:**
- v3.6 requirements: 25 total
- Mapped to phases: 25 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-15*
*Last updated: 2026-05-15 after initial definition*
