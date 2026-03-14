# Project Research Summary

**Project:** Washington Bee Atlas — v1.5 Geographic Regions
**Domain:** Polygon-based geographic region filtering added to existing static OpenLayers + Parquet map app
**Researched:** 2026-03-14
**Confidence:** HIGH

## Executive Summary

v1.5 Geographic Regions adds county and ecoregion filtering to the Washington Bee Atlas specimen map. The approach is fully determined by the existing architecture: all spatial work happens at pipeline build time using geopandas, and the frontend reads pre-joined string columns from Parquet via O(1) Set lookups. No new dependencies are required — geopandas 1.1.2, pyogrio, pyarrow 22, ol 10.7.0, and Vite are all already installed. The two boundary GeoJSON datasets are either already in the repo (CEC NA Level III ecoregions) or downloadable in a single `gpd.read_file(url)` call (Census TIGER WA counties). Both must be simplified to 0.005–0.01 degrees before bundling to keep frontend asset sizes under 400 KB each.

The key structural recommendation is a strict pipeline-first build order. The frontend cannot validate region filtering until `county` and `ecoregion_l3` columns exist in both `ecdysis.parquet` and `samples.parquet`. The four implementation phases — pipeline spatial join, frontend data layer, map integration, sidebar UI — each have hard dependencies on the prior phase, and none can be parallelized meaningfully. The architecture follows six well-defined patterns that are already established in the codebase; the largest new concept is a single `region-layer.ts` module that isolates VectorLayer construction and source swapping.

The primary risks are a non-standard CRS in the ecoregion shapefile (requires explicit `.to_crs('EPSG:4326')` before any spatial join), approximately 408 coastal points (~0.9%) that fall in polygon gaps and need a nearest-polygon fallback, and a click-handler priority bug where polygon hits must be checked after specimen/sample hits to preserve existing click behavior. All three risks are known, bounded, and prevented by specific, tested code patterns documented in PITFALLS.md.

## Key Findings

### Recommended Stack

All required technology is already installed. The Python pipeline uses geopandas `gpd.sjoin()` with `predicate='within'` for point-in-polygon assignment, plus `.to_crs('EPSG:4326')` for CRS alignment before any join. GeoJSON files are exported from the pipeline and bundled via Vite `?url` import, which defers the HTTP fetch until the boundary layer first becomes visible — the correct pattern for separate cacheable assets of this size (150–400 KB each). The frontend uses OL's `GeoJSON` format class, `VectorSource`, and `VectorLayer` — all already imported elsewhere in the codebase.

**Core technologies:**
- `geopandas 1.1.2` + `pyogrio 0.12.1`: spatial join and GeoJSON export — already installed; `gpd.sjoin()` + `.to_crs()` is the complete new API surface
- `pyarrow 22`: nullable string columns (`county`, `ecoregion_l3`) in Parquet output — already installed
- `ol 10.7.0`: `VectorLayer`/`VectorSource`/`GeoJSON` format for boundary overlay — already installed; only new import is `ol/format/GeoJSON.js`
- `vite 6.2.x`: `?url` suffix import for GeoJSON assets — no config changes needed
- `@types/geojson 7946.0.16`: `FeatureCollection` type for GeoJSON assets — already installed

### Expected Features

**Must have (table stakes):**
- Region filter applies to both specimen and sample layers — both Parquet files need the new columns
- Multi-select for county and ecoregion with removable chips — single-select is insufficient for field collectors
- AND semantics across region types (county AND ecoregion), OR semantics within a type (King OR Pierce)
- Region filter ANDs with existing taxon/date filters — no new filter logic architecture needed
- Active filter visually reflected in sidebar chips — no visual feedback feels broken to users
- "Clear all" clears region filter too — partial clear is a common UX complaint
- Map position unchanged when filter is applied — explicitly required in PROJECT.md
- URL encoding of region filter state — enables sharing filtered views

**Should have (differentiators):**
- Exclusive 3-state boundary toggle (off / counties / ecoregions) — mutual exclusion prevents visual conflict between overlapping polygon types
- Click a visible polygon to add it to the active filter — faster than typing for spatially-oriented users
- Region type label on chips ("King (county)" vs "Blue Mountains (ecoregion)") — prevents ambiguity when both types are active simultaneously

**Defer (v2+):**
- Selected polygon highlighted distinctly on map — sidebar chips are sufficient confirmation at launch
- Arbitrary draw-a-polygon region filter — named regions cover the real use case; draw interaction is significant complexity
- Filter result count per region in sidebar — requires cross-cutting count logic; defer until basic filter ships

### Architecture Approach

The architecture is a clean additive extension of the existing system. A new `data/geodata/` directory holds authoritative GeoJSON boundary files used by both the pipeline (for spatial join) and the frontend (for map display), enforcing a single source of truth. A shared `data/ecdysis/regions.py` module exposes `spatial_join_regions(gdf)` so both `occurrences.py` and `inat/download.py` add the same columns via the same code path. On the frontend, a new `region-layer.ts` module encapsulates the OL VectorLayer with source-swapping logic (`regionLayer.setSource(countySource | ecoregionSource)`), keeping `bee-map.ts` from growing further. The FilterState singleton in `filter.ts` gains two Sets and must be updated atomically across all three consumer files.

**Major components:**
1. `data/ecdysis/regions.py` (NEW) — shared `spatial_join_regions()` helper called by both pipeline scripts
2. `data/geodata/` (NEW) — authoritative GeoJSON boundary files; pipeline reads here, build script copies to frontend assets
3. `frontend/src/region-layer.ts` (NEW) — `countySource`, `ecoregionSource`, single `regionLayer` with source swapping, `BoundaryMode` type, polygon style with transparent fill
4. `frontend/src/filter.ts` (MODIFY) — add `selectedCounties: Set<string>`, `selectedEcoregions: Set<string>`; extend `isFilterActive()` and `matchesFilter()`
5. `frontend/src/bee-map.ts` (MODIFY) — import regionLayer, add `boundaryMode` state, extend singleclick pre-check, extend URL encode/decode, derive and pass region options to sidebar
6. `frontend/src/bee-sidebar.ts` (MODIFY) — boundary toggle, county and ecoregion multi-select autocomplete, extend `FilterChangedEvent`

### Critical Pitfalls

1. **CRS mismatch (ecoregion shapefile)** — The CEC NA L3 shapefile uses a non-EPSG spherical Lambert AEA CRS (`Sphere_ARC_INFO_Lambert_Azimuthal_Equal_Area`). Always call `.to_crs('EPSG:4326')` on the ecoregion GeoDataFrame before `gpd.sjoin()`. Failure produces silent wrong results (0 matches or geographically scrambled assignments).

2. **408 coastal points fall outside all ecoregion polygons** — Confirmed on live data: ~0.9% of WA specimens cluster at coastal coordinates where ecoregion boundaries do not reach the shoreline. Add a nearest-polygon fallback after the initial `within` join for null rows; do not accept nulls as correct for points inside the WA bounding box.

3. **Polygon click swallows specimen clicks** — The singleclick handler must check specimen/sample hits FIRST, then fall through to polygon hit-detection only when no specimen hit is found. Checking polygon first causes region filter to trigger instead of the specimen detail panel when the boundary overlay is visible.

4. **Unfilled polygon has no interior hit detection** — OpenLayers only detects clicks on rendered pixels. A stroke-only polygon style leaves the interior unclickable. Always include `new Fill({ color: 'rgba(0, 0, 0, 0)' })` in the polygon style (transparent but hit-detectable).

5. **FilterState must be updated atomically** — Adding region fields to `FilterState` without simultaneously updating `isFilterActive()`, `matchesFilter()`, `buildSearchParams()`, `parseUrlParams()`, and the `FilterChangedEvent` interface produces a filter that shows active in the UI but has zero effect on the map.

## Implications for Roadmap

Based on research, the phase structure is dictated by hard sequential dependencies. No phases can be usefully parallelized.

### Phase 1: Pipeline Spatial Join

**Rationale:** The frontend cannot validate region filtering without `county` and `ecoregion_l3` columns in both Parquet files. This phase has no frontend dependencies and is independently testable against real data.
**Delivers:** `ecdysis.parquet` and `samples.parquet` with region columns; WA county and ecoregion GeoJSON files in `data/geodata/`; `build-data.sh` updated to copy GeoJSON to frontend assets; CI schema validation updated
**Addresses:** Pipeline spatial join (P1), GeoJSON boundary files (P1)
**Avoids:**
- CRS mismatch — call `.to_crs('EPSG:4326')` before sjoin; assert both inputs report the same CRS
- 408 coastal nulls — add nearest-polygon fallback; assert `ecoregion_l3.isna().sum() == 0` after fallback
- Unsimplified GeoJSON — apply `simplify(0.005)` during export; verify both files under 400 KB
- `intersects` performance trap — use `within` + fallback, not `intersects` (4.3s vs 0.03s on live data)

### Phase 2: Frontend Data Layer

**Rationale:** Validates that Parquet columns parse correctly and filter logic is sound before any UI is wired up. Each piece is testable via browser console against real loaded data.
**Delivers:** Region columns read from Parquet and set as OL feature properties; `FilterState` extended with `selectedCounties` and `selectedEcoregions`; `isFilterActive()` and `matchesFilter()` extended; `region-layer.ts` module created with polygon styling
**Implements:** FilterState singleton extension, `region-layer.ts` module, Vite `?url` GeoJSON import, source-swapping VectorLayer pattern
**Avoids:**
- FilterState partial update — extend `isFilterActive()`, `matchesFilter()`, `isFilterActive()` in the same commit; do not add the field without updating the functions
- Unfilled polygon — include transparent fill in polygon style from the start; test by clicking interior of a polygon before proceeding to Phase 3

### Phase 3: Map Integration

**Rationale:** Polygon click-to-filter is the primary discovery mechanism and must be validated before building the sidebar multi-select UI that mirrors the same state. URL state must be complete before sidebar state restore is implemented.
**Delivers:** `regionLayer` added to OL map layer stack; `boundaryMode` @state; singleclick handler extended with specimen-first polygon pre-check; URL params `bm`, `counties`, `ecor` encoded and decoded; `countyOptions`/`ecoregionOptions` derived from loaded Parquet data and passed to sidebar as @property
**Implements:** Polygon click pre-check pattern (specimen-first), region options from Parquet data, URL state extension
**Avoids:**
- Polygon click swallowing specimen clicks — explicit specimen-first hit-detection order; do not check `regionLayer.getFeatures()` first
- Region overlay toggle conflated with specimen/samples toggle — keep `boundaryMode` state independent of `layerMode`

### Phase 4: Sidebar UI

**Rationale:** UI last — autocomplete options depend on Parquet data loaded and passed from Phase 3; polygon click confirmed working before building the sidebar that mirrors the same filter state.
**Delivers:** Boundary toggle (Off / Counties / Ecoregions) in sidebar; county and ecoregion multi-select autocomplete with removable chips; `FilterChangedEvent` extended with new fields; `_clearFilters()` extended to reset region Sets; URL-restore properties for region state
**Implements:** Multi-select chip UI (requires custom rendered list — `<datalist>` is single-select only), `FilterChangedEvent` extension, sidebar URL-restore pattern
**Avoids:**
- Partial clear — "Clear filters" button must reset `selectedCounties` and `selectedEcoregions`
- Region Lit `@state` divorced from FilterState singleton — must mirror region selections to `filterState` singleton so `clusterStyle` in `style.ts` sees the correct state
- No visual feedback — chips must show region type label ("county" / "ecoregion") to disambiguate when both types are active

### Phase Ordering Rationale

- Pipeline-first is non-negotiable: frontend cannot read columns that don't exist in the Parquet files
- Data layer before UI: filter logic correctness is verifiable independently via browser console before UI is built
- Map click before sidebar: primary interaction pattern validated before secondary UI that mirrors the same state
- URL params in Phase 3 (not Phase 4): URL state must be present before sidebar restore logic is written in Phase 4
- Each phase is independently deployable and testable before the next begins

### Research Flags

All phases have well-documented, codebase-verified patterns. No phases require `/gsd:research-phase`.

- **Phase 1:** geopandas sjoin is fully documented; all data sources are in the repo or single-step downloadable; exact pitfalls are identified with measured data (408 nulls confirmed, sjoin timing confirmed)
- **Phase 2:** Extends existing FilterState singleton pattern; OL VectorSource/VectorLayer already used in codebase; new module follows established pattern
- **Phase 3:** Extends existing singleclick handler with documented priority pattern; URL encoding follows established pattern in `bee-map.ts`
- **Phase 4:** Extends existing sidebar with custom multi-select chip component; the chip pattern is standard HTML/CSS with no obscure APIs

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All claims verified against actual repo source files and live data; no new packages required |
| Features | HIGH | Existing codebase inspected directly; OL Select API verified; UX patterns cross-referenced from multiple sources |
| Architecture | HIGH | All architectural decisions derived from direct inspection of current source files; no external research required |
| Pitfalls | HIGH | Most pitfalls verified on live data (408 coastal nulls measured, sjoin timing measured, CRS confirmed on actual zip file) |

**Overall confidence:** HIGH

### Gaps to Address

- **GeoJSON property name for ecoregions:** The singleclick handler needs the exact GeoJSON property name for the region name. For counties, the Census TIGER `NAME` field is confirmed. For ecoregions, the CEC NA L3 shapefile uses `NA_L3NAME` — but ARCHITECTURE.md uses `US_L3NAME` as a placeholder. Confirm the actual property name against the generated `data/geodata/epa_l3_ecoregions_wa.geojson` before writing the click handler.

- **Multi-select chip UI implementation:** The existing sidebar uses `<datalist>` for single-select taxon autocomplete. Multi-select requires a custom rendered list with chips and an input. The exact HTML/CSS structure is not specified in research — this is a local design decision to make during Phase 4. No library is needed, but the implementation surface is open.

- **CI schema validation update:** `scripts/validate-schema.mjs` must be updated to include `county` and `ecoregion_l3` in expected column lists for both Parquet files. This is a two-line change but is easy to omit; include it as an explicit task in Phase 1.

## Sources

### Primary (HIGH confidence)
- `data/pyproject.toml` — package versions confirmed (geopandas 1.1.2, pyogrio 0.12.1, pyarrow 22)
- `data/NA_CEC_Eco_Level3.zip` — read with geopandas; 11 WA ecoregions verified after reproject + dissolve; CRS confirmed as non-EPSG spherical Lambert AEA
- `data/ecdysis/occurrences.py`, `data/inat/download.py`, `data/inat/observations.py` — pipeline structure confirmed
- `frontend/src/bee-map.ts`, `bee-sidebar.ts`, `parquet.ts`, `filter.ts`, `style.ts` — full architecture confirmed via direct inspection
- `frontend/package.json` — ol 10.7.0, @types/geojson 7946.0.16, vite 6.2.3
- Live ecdysis.parquet — 46,090 rows; 408 coastal nulls measured; `within` sjoin = 0.03s, `intersects` = 4.3s
- geopandas.org sjoin API docs — `predicate='within'` vs `intersects` boundary behavior
- OpenLayers hit detection (PR #7750) — polygon fill requirement for interior hit-detection confirmed in OL docs

### Secondary (MEDIUM confidence)
- openlayers.org API docs — GeoJSON format `readFeatures` with `featureProjection`
- vite.dev/guide/assets — JSON/GeoJSON inline vs `?url` behavior
- US Census TIGER cartographic boundary file naming and FIPS code for Washington (53)
- Map UI patterns (mapuipatterns.com) — spatial filter and feature selection patterns
- Faceted search UX — AND across dimensions, OR within multi-select (Foursquare docs, design literature)

---
*Research completed: 2026-03-14*
*Ready for roadmap: yes*
