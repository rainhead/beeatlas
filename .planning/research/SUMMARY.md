# Research Summary: BeeAtlas v3.7 — Places

**Researched:** 2026-05-17 | **Confidence:** HIGH

---

## Executive Summary

Every new sub-problem in v3.7 has a direct analogue already running in production. The county/ecoregion spatial join, filter chip, Mapbox boundary layer, Eleventy pagination, and `_data/*.js` loader are established patterns the Places feature extends rather than invents. **No new libraries, npm packages, Lit components, or AWS resources are needed.**

The key risks are concentrated in three areas: geometry quality (invalid polygons / wrong CRS silently produce zero results), the dbt schema contract (must update atomically), and slug stability (static hosting offers no redirect path once published). All three are detectable early and preventable with targeted validation.

---

## Stack Additions

**None.** All stack needs covered by existing tools:

| Need | Solution | Precedent |
|------|----------|-----------|
| TOML source file | `content/places.toml` + Python `tomllib` | `content/species-photos.toml` |
| Spatial join | DuckDB `ST_Within` LEFT JOIN | `occurrences.sql` county/ecoregion CTEs |
| GeoJSON export | `places_export.py` | `species_export.py` |
| Static pages | Eleventy pagination | `_pages/species-detail.njk` (672 pages) |
| Map overlay | Mapbox GL JS source + fill/line layers | county/ecoregion boundary layers |
| Filter chip | `place_slug IN (...)` SQL clause | county IN-clause in `filter.ts` |
| URL round-trip | `place=` param in `url-state.ts` | `counties=` / `ecor=` params |

---

## Feature Table Stakes

**Must have (v3.7):**
- `/places/` index + `/places/{slug}/` static pages (name, owner, permit table, specimen count, SVG occurrence map, deep-link to filtered map)
- `place_slug` column in `occurrences.parquet` via `ST_Within` join
- `places.geojson` (geometry + slug, for Mapbox) + `places.json` (metadata + counts, for Eleventy) exports committed to git
- Toggleable place boundaries overlay on map (distinct color from county/ecoregion)
- Place filter chip — ghost occurrences outside polygon, like county/ecoregion
- `place=` URL param with deep-link from place pages

**Permit data model:** Permits are an array per place. Two tiers exist:
- Project-level permits (e.g. WDFW SCP — statewide, governs WABA activity broadly)
- Site-level authorizations (land manager approvals per location)
WDFW also acts as a landowner; whether collection on WDFW lands is covered by the SCP or requires a separate entry needs clarification during data-entry.

Each permit record: `issuing_authority`, `permit_number`, `expiry_date` (nullable), `status` (active/inactive/no-expiry).

**Defer to v3.8+:** per-place species breakdown, multiple simultaneous place filter chips, collector notes / access concerns (requires auth).

---

## Architecture

**Data flow:**
```
content/places.toml (slug, name, owner, permits[], geometry_wkt)
  → places_pipeline.py → geographies.places (DuckDB)
  → occurrences.sql (place_slug via ST_Within LEFT JOIN, no fallback)
  → places_export.py → places.geojson (Mapbox) + places.json (Eleventy)
  → _data/places.js + _pages/places/*.njk → /places/ static pages
  → filter.ts / url-state.ts / bee-map.ts → filter chip + boundary layer
```

**Critical divergences from county/ecoregion analogue:**
1. **No nearest-polygon fallback** — `place_slug IS NULL` is correct (most occurrences aren't at any named place)
2. **`promoteId: 'slug'`** (not `generateId: true`) — stable feature IDs across source reloads
3. **Two export artifacts** — slim `places.geojson` for Mapbox; metadata-rich `places.json` for Eleventy (geometry excluded)
4. **dbt contract: 31 columns** — `place_slug` added atomically to `occurrences.sql` + `schema.yml`

---

## Critical Pitfalls

1. **Invalid/wrong-CRS geometries → silent zero occurrences** — WA GIS portals default to State Plane; `ST_Within` silently fails. Prevention: pytest `is_valid.all()` + `crs.to_epsg() == 4326` assertions; `mapshaper -clean`.

2. **Nearest-polygon fallback copied from county CTE** — assigns every non-place occurrence to its closest park. Prevention: explicit `LEFT JOIN` with no fallback; pytest fixture asserting a distant point → `place_slug IS NULL`.

3. **dbt contract violation** — `place_slug` in SQL but not `schema.yml` breaks nightly pipeline. Prevention: atomic change per `project_schema_validation.md` procedure.

4. **Slug instability** — static hosting = no redirects. Prevention: `slug` is a curated TOML field, never auto-generated; uniqueness + regex validation in `run.py`.

5. **`generateId` → unstable feature IDs after source reload** — use `promoteId: 'slug'` instead.

---

## Open Questions for Requirements

- **Overlap semantics:** Prohibit overlapping place polygons (recommended) vs. smallest-area wins?
- **`boundaryMode` design:** Extend `'off'|'counties'|'ecoregions'` to add `'places'` (mutual exclusion) vs. separate toggle (can show places + counties simultaneously)?
- **GPS drift buffer:** `ST_DWithin` ~0.0001° (~9m) tolerance — confirm against collector GPS accuracy.

---

## Recommended Phase Order

1. **Data model + source file** — TOML schema, slug policy, geometry validation, seed entries
2. **Pipeline + dbt** — `place_slug` column, spatial join, dual export, `run.py` step ordering
3. **Eleventy pages** (parallel with 4) — `/places/` index + per-place pages, SVG occurrence maps
4. **Frontend** (parallel with 3) — filter chip, URL state, map boundary layer
