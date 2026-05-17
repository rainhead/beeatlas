# Requirements: Washington Bee Atlas v3.7 Places

**Defined:** 2026-05-17
**Core Value:** Tighten learning cycles for volunteer collectors; surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants.

## v3.7 Requirements

### PLC — Place Data Model

- [ ] **PLC-01**: Coordinator can define a place via a `content/places.toml` entry with slug, name, land_owner, geometry_wkt (WGS84), and a permits array
- [ ] **PLC-02**: Each permit record carries: issuing_authority, permit_number (optional), expiry_date (nullable ISO date), and type (project-level vs site-level)
- [ ] **PLC-03**: Build fails if any place has an invalid or non-WGS84 geometry, a duplicate slug, or a slug with characters outside `[a-z0-9-]`
- [ ] **PLC-04**: Build fails if any two place polygons overlap (ST_Intersects check at validation time)

### PPIPE — Pipeline Integration

- [ ] **PPIPE-01**: Pipeline loads places.toml into a `geographies.places` DuckDB table before dbt runs
- [ ] **PPIPE-02**: occurrences.parquet gains a `place_slug` column via ST_Within LEFT JOIN; occurrences outside all places get NULL (no nearest-polygon fallback)
- [ ] **PPIPE-03**: dbt `schema.yml` updated to 31 columns atomically with the `place_slug` addition
- [ ] **PPIPE-04**: Pipeline exports `public/data/places.geojson` (slug + geometry only, for Mapbox) and `public/data/places.json` (all metadata + specimen/sample counts, no geometry, for Eleventy)
- [ ] **PPIPE-05**: `places.geojson` and `places.json` committed to git so CI frontend-only builds succeed without running the pipeline

### PMAP — Map and Filter Integration

- [ ] **PMAP-01**: Boundary mode toggle extended to Off / Counties / Ecoregions / Places; mutually exclusive; place boundaries shown in a visually distinct color from counties and ecoregions
- [ ] **PMAP-02**: Clicking a place boundary polygon applies that place as the active filter
- [ ] **PMAP-03**: Place filter chip appears in the filter panel when a place is active; removable; ghosts occurrences outside the polygon (same semantics as county/ecoregion chips)
- [ ] **PMAP-04**: `place=` URL param encodes the active place slug; restored on page load; deep-link from place pages opens the map with that place pre-filtered

### PPAGE — Place Static Pages

- [ ] **PPAGE-01**: `/places.html` index page (or equivalent direct-path URL per Eleventy permalink config) lists all places with name, land owner, permit status summary, and specimen count
- [ ] **PPAGE-02**: Per-place page at a direct-path URL (e.g. `/places/{slug}.html`) shows name, owner, permit table with active/inactive/no-expiry status, specimen count, SVG occurrence map, and a link that opens the main map with that place's filter applied
- [ ] **PPAGE-03**: Per-place SVG occurrence map generated at pipeline time, following the `species_maps.py` pattern

## Future Requirements

### Auth-gated collector features (v3.8+)

- **PCOLL-01**: Authenticated collector can add access notes (parking, locked gates, trail conditions) to a place
- **PCOLL-02**: Authenticated collector can record ideal times to visit (months, times of day)
- **PCOLL-03**: Collector notes visible to all authenticated users of the place page

### Richer place content (v3.8+)

- **PRICH-01**: Per-place species breakdown (top N species by occurrence count)
- **PRICH-02**: Multiple simultaneous place filter chips with OR semantics
- **PRICH-03**: iNaturalist place URL link-out from place pages

## Out of Scope

| Feature | Reason |
|---------|--------|
| Community-editable place metadata | Static hosting + legal sensitivity of permit data; maintainer-curated TOML with git history is the governance model |
| Real-time permit status from agency APIs | No permit APIs exist; nightly pipeline constraint precludes runtime checks |
| All-WA public lands layer | Scope and dataset size; would pull in thousands of polygons beyond curated collecting sites |
| Annual specimen trend charts per place | HIGH pipeline complexity; defer to v3.8+ |
| Nearest-polygon fallback for unmatched occurrences | Semantically wrong for places — most occurrences are not at any named site |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLC-01 | — | Pending |
| PLC-02 | — | Pending |
| PLC-03 | — | Pending |
| PLC-04 | — | Pending |
| PPIPE-01 | — | Pending |
| PPIPE-02 | — | Pending |
| PPIPE-03 | — | Pending |
| PPIPE-04 | — | Pending |
| PPIPE-05 | — | Pending |
| PMAP-01 | — | Pending |
| PMAP-02 | — | Pending |
| PMAP-03 | — | Pending |
| PMAP-04 | — | Pending |
| PPAGE-01 | — | Pending |
| PPAGE-02 | — | Pending |
| PPAGE-03 | — | Pending |

**Coverage:**
- v3.7 requirements: 16 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 16 ⚠️

---
*Requirements defined: 2026-05-17*
*Last updated: 2026-05-17 after initial definition*
