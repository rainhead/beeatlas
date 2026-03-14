# Pitfalls Research

**Domain:** Adding polygon-based geographic region filtering to an existing OpenLayers+static-Parquet map app (WA Bee Atlas v1.5)
**Researched:** 2026-03-14
**Confidence:** HIGH — most pitfalls verified against live codebase data and actual source files in this repo

---

## Critical Pitfalls

Mistakes that cause silent wrong data, broken filters, or complete rewrites.

---

### Pitfall 1: CRS Mismatch Between Ecdysis Points and EPA Ecoregion Polygons

**What goes wrong:**
The EPA North America CEC Level 3 ecoregion shapefile (`NA_CEC_Eco_Level3.zip`) uses a non-standard Lambert Azimuthal Equal Area CRS (`PROJCS["Sphere_ARC_INFO_Lambert_Azimuthal_Equal_Area"...]`) with a spherical datum that has no EPSG code. Ecdysis specimens have implicit `EPSG:4326` (lon/lat columns). Calling `gpd.sjoin(points, eco_polygons, ...)` without aligning CRS first will either raise a CRS mismatch error or — worse — silently produce wrong results as geopandas compares degree coordinates against meter coordinates.

**Why it happens:**
The shapefile CRS is not recognized as a standard EPSG projection. Developers see "Lambert Azimuthal Equal Area" and assume it maps to `EPSG:102017` or similar, but this specific `Sphere_ARC_INFO` datum is a proprietary Esri spherical approximation. The repo already has this file: `data/NA_CEC_Eco_Level3.zip`. Direct inspection confirms the datum name.

**How to avoid:**
Always call `.to_crs('EPSG:4326')` on the ecoregion GeoDataFrame before joining. This works despite the non-standard CRS because PROJ can handle the reprojection. Verified in this repo: `gpd.read_file('NA_CEC_Eco_Level3.zip').to_crs('EPSG:4326')` succeeds and produces correct WA boundaries. Never call `.sjoin()` without first verifying both inputs report the same `.crs`.

**Warning signs:**
- No error but 0 or nearly 0 matched rows after sjoin
- Matched rows for a few points in odd geographic clusters (LAEA meters interpreted as degrees lands points in the ocean near Africa)
- A `UserWarning: CRS does not match` from geopandas

**Phase to address:** Phase that implements the pipeline spatial join (ecoregion assignment step)

---

### Pitfall 2: 408 Points (~0.9%) Fall Outside All Ecoregion Polygons Due to Coastal Gaps

**What goes wrong:**
`predicate='within'` produces 408 null `ecoregion_l3` values for real WA specimens (confirmed on live ecdysis.parquet, 46,090 rows). These points are not outside Washington — they cluster at coordinates like `(48.098, -123.047)` which is near the Strait of Georgia coastline. The EPA ecoregion polygons do not cover coastal waters or narrow inlet geometries; the nearest polygon boundary is ~28 meters away (0.000281 degrees). With `predicate='within'`, these points silently get `null` with no error.

**Why it happens:**
Ecoregion polygons are delineated along ecological boundaries, not shorelines. Points collected in coastal areas, estuaries, or recording locations placed precisely on a water body fall in polygon gaps. The `within` predicate requires the point to be strictly inside the polygon interior — being on the boundary also returns False.

**How to avoid:**
Use a nearest-polygon fallback for unmatched rows. After the initial `sjoin(predicate='within')`, take the rows where `ecoregion_l3` is null and assign them the name of the nearest polygon using a spatial index distance query. Alternatively, use `predicate='intersects'` (which matches boundary-touching points) but beware it can produce duplicate rows when a point touches two adjacent polygons — handle with `drop_duplicates(subset=['ecdysis_id'], keep='first')`.

**Warning signs:**
- More than 0 null values in `ecoregion_l3` after sjoin on WA data
- Null cluster at lat ~48.0–48.2 (Puget Sound/Olympic Peninsula coast)
- isnull().sum() reports ~408 for the ecoregion column on 46k rows

**Phase to address:** Phase that implements the pipeline spatial join (ecoregion assignment step)

---

### Pitfall 3: Unfiltered Polygon Click Swallows Specimen/Sample Clicks

**What goes wrong:**
The existing singleclick handler in `bee-map.ts` is mode-gated (`layerMode === 'specimens'` vs `'samples'`). A new polygon VectorLayer added on top in the z-order will intercept clicks before `specimenLayer.getFeatures(event.pixel)` can run. Clicking a specimen inside a polygon selects the polygon, not the specimen. The user sees a filter applied instead of a detail panel.

**Why it happens:**
OpenLayers `map.on('singleclick')` fires once for the whole map. `layer.getFeatures(pixel)` checks all features at a pixel regardless of layer order. Without explicit hit-detection logic that checks point/cluster features first and falls back to polygon features, the first non-empty result (from whichever layer has features at that pixel) wins — but only if the code checks them in the wrong order. The common mistake is checking polygon layer hits first because the polygon layer is rendered on top.

**How to avoid:**
In the singleclick handler, always call `specimenLayer.getFeatures(pixel)` (or `sampleLayer` in sample mode) first. Only if that returns empty should the code check polygon layer features for region-click behavior. This is "point-first hit detection": points are smaller targets and should take priority. Order the `await` calls explicitly, not in parallel.

**Warning signs:**
- Clicking on a visible specimen dot opens a region filter instead of showing sample details
- Cluster detail panel never opens when boundary overlay is visible
- Console logs show polygon hit before specimen hit

**Phase to address:** Phase that implements the polygon VectorLayer and click-to-filter behavior

---

### Pitfall 4: Polygon Without Fill Style Has No Interior Hit Detection

**What goes wrong:**
A polygon styled with only a `Stroke` and no `Fill` in OpenLayers only registers clicks on the stroke pixels. Clicking in the polygon interior does nothing. This is a known, documented OpenLayers behavior change (PR #7750) — the interior of an unfilled polygon is not a hit target.

**Why it happens:**
Developers assume a visible outlined polygon is fully clickable. OpenLayers canvas hit detection uses the rendered pixels: no fill = no pixels in the interior = no hit. The `clusterStyle` and `sampleDotStyle` in this codebase use `Fill` objects, so existing layers work — but a new region boundary layer styled for visual appearance (stroke only, transparent interior) will silently fail click detection on the interior.

**How to avoid:**
Always include `new Fill({ color: 'rgba(0, 0, 0, 0)' })` (transparent fill) in the polygon style. This is invisible to the user but marks the interior pixels as hit-detectable. Confirmed by OpenLayers documentation: "Polygons must have a fill style applied to ensure that pixels inside a polygon are detected. The fill can be transparent."

**Warning signs:**
- Clicking inside a region polygon near its center does nothing
- Clicking on the polygon border line works but interior does not
- Works in some browsers (hardware-accelerated canvas differs) but not others

**Phase to address:** Phase that implements the polygon VectorLayer styling

---

### Pitfall 5: FilterState Singleton Does Not Include Region — `isFilterActive` and `matchesFilter` Both Miss It

**What goes wrong:**
The existing `FilterState` interface and singleton in `filter.ts` has no region fields. `isFilterActive()` returns false even with a region active, so the style cache bypasses per-render filter computation and all specimens appear unfiltered. `matchesFilter()` never checks region, so filtered specimens still render at full opacity. Region filter appears to work in the sidebar UI but has zero effect on the map.

**Why it happens:**
`filter.ts` exports a single mutable object (`filterState`) and two pure functions (`isFilterActive`, `matchesFilter`). All three must be updated together. Adding a region field to the interface without updating `isFilterActive` and `matchesFilter` is an easy omission, especially since TypeScript won't catch it (the new field is optional or the functions don't reference it explicitly).

**How to avoid:**
Treat `filter.ts` as an atomic unit. Any change to `FilterState` requires simultaneous updates to:
1. The interface declaration (add `counties: Set<string>` and `ecoregions: Set<string>`)
2. `isFilterActive()` (add `|| f.counties.size > 0 || f.ecoregions.size > 0`)
3. `matchesFilter()` (add county/ecoregion column checks against feature properties)
4. `buildSearchParams()` in `bee-map.ts` (URL serialization)
5. `parseUrlParams()` in `bee-map.ts` (URL deserialization)
6. `_restoreFilterState()` in `bee-map.ts` (popstate restore)
7. The `FilterChangedEvent` interface and `_dispatchFilterChanged()` in `bee-sidebar.ts`

**Warning signs:**
- Region filter shows in sidebar but map doesn't change
- All specimens still render when county filter is active
- `filteredSummary` shows same count as unfiltered total despite active region filter

**Phase to address:** Phase that extends FilterState for region fields

---

### Pitfall 6: URL Serialization Does Not Include Region — Shared URLs Lose Region Filter

**What goes wrong:**
`buildSearchParams()` in `bee-map.ts` serializes taxon, year, month, layer mode, and occurrence IDs. Region filter fields (`counties`, `ecoregions`) are not serialized. Sharing a URL with an active region filter sends the recipient a link that opens without that filter. Back/forward navigation also loses the region state.

**Why it happens:**
The URL param system has a clear extension pattern (`params.set('months', ...)` etc.) but it's easy to forget to extend `buildSearchParams`, `parseUrlParams`, and `_restoreFilterState` in a single atomic change. Adding the sidebar UI without updating URL sync is a half-done implementation.

**How to avoid:**
Define the URL param keys for region at the start of the phase (`counties=King,Snohomish` as comma-separated). Add all three URL functions (`buildSearchParams`, `parseUrlParams`, `_restoreFilterState`) in the same commit. Write a manual test: apply a region filter, copy URL, paste in new tab, verify filter is restored.

**Warning signs:**
- Region filter active but URL bar does not change
- Page reload clears region filter while taxon filter persists
- Back button does not restore region filter

**Phase to address:** Phase that implements URL serialization for region state

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Bundling full WA-clipped ecoregion GeoJSON without simplification | Simplest to generate | 6.5 MB GeoJSON adds ~6 MB to Vite build, slows initial load | Never — use 0.01-degree simplification (~1 km, 224 KB) |
| Using global ecoregion shapefile without clipping to WA | No clipping code needed | 2548 polygon rows for sjoin instead of 79 WA rows; marginal perf hit in pipeline, not user-facing | Acceptable for pipeline; clip before bundling GeoJSON |
| Skipping transparent fill on polygon style | One fewer style object | Click-to-filter only works on polygon borders, not interiors | Never |
| Storing selected regions in Lit `@state` only (not FilterState singleton) | Simpler Lit component | Region filter won't apply to clusterStyle — style function reads filterState directly | Never — must mirror to filterState singleton |
| Using Ecdysis DarwinCore `county` field for county filtering | No spatial join needed | Field is collector-entered free text, inconsistently formatted, often null or wrong county | Only as fallback; spatial join is authoritative |

---

## Integration Gotchas

Common mistakes when connecting the new region layer to existing systems.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OL layer stack | Adding region VectorLayer at end of layers array (renders on top, hits first) | Add with explicit `zIndex` below specimenLayer; check specimen hits before polygon hits in singleclick handler |
| `clusterSource.changed()` repaint trigger | Not calling `changed()` after region filter mutation | Mutate `filterState.counties`/`filterState.ecoregions` then call `clusterSource.changed()` and `this.map?.render()` — same pattern as existing `_applyFilter()` |
| `matchesFilter` feature lookup | Checking `feature.get('county')` before confirming the column exists in Parquet | Add `county` and `ecoregion_l3` to the `columns` array in `ParquetSource` constructor in `parquet.ts`; otherwise `feature.get('county')` is always `undefined` |
| FilterChangedEvent | Not adding `counties`/`ecoregions` to the event interface | `FilterChangedEvent` in `bee-sidebar.ts` must include the new fields; `_applyFilter()` in `bee-map.ts` must read them |
| Lit autocomplete without third-party components | Using a single `<datalist>` like the taxon filter (single-select only) | For multi-select, use a custom rendered list of chips/tags with an `<input>` that filters options and renders checked items as removable tags — no datalist |

---

## Performance Traps

Patterns that work but are noticeably slow or wasteful.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Bundling unsimplified ecoregion GeoJSON | 6.5 MB Vite asset, 3–5s initial load on mobile | Simplify to 0.01 degrees (~1 km) during pipeline GeoJSON export: 224 KB | Every page load |
| Loading GeoJSON inside a Lit `updated()` or render cycle | GeoJSON fetched on every component update | Fetch once in `firstUpdated()` or in module scope; store in a module-level variable | Every re-render |
| `predicate='intersects'` sjoin without dedup | Duplicate specimen rows in output Parquet when points fall on polygon boundaries | Use `predicate='within'` + nearest fallback, or dedup with `drop_duplicates` after intersects | Any point on a shared polygon boundary |
| sjoin against full 2548-row global ecoregion dataset in pipeline | 4.3s vs 0.03s for `within` (confirmed: 0.03s for `within`, 4.3s for `intersects` on live data) | Pre-clip ecoregion GDF to WA bounding box before sjoin; reduces to 79 rows | CI pipeline; cost is bounded but unnecessary |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Map panning/zooming when region filter is applied | Map jumps to WA default center on region selection (if filter logic triggers a map reset) | Requirement explicitly states "map position unchanged when region is selected" — filter must never touch map view |
| Region toggle mode (off/counties/ecoregions) stored only in sidebar | Toggling layer mode clears region selection because `_onLayerChanged` resets selection state | Region overlay toggle is independent of specimen/sample layer mode; keep region state separate from `layerMode` |
| Selecting a region polygon deselects an open specimen detail | User clicks a county to filter, loses the specimen detail they were reviewing | In singleclick handler, polygon-region-click should add to filter without closing sidebar detail unless user clicked an empty area |
| No visual feedback that a polygon is the "selected" region | User clicks King County, nothing highlights, unclear if filter applied | Apply a distinct selected-fill style to active filter regions using OL feature property + style function |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Region filter in sidebar:** Verify filter actually changes map rendering — check `clusterSource.changed()` is called, not just sidebar state updated
- [ ] **County multi-select:** Verify clearing one county from selection doesn't clear all counties — Set mutation semantics must be correct
- [ ] **Spatial join in pipeline:** Verify `county` and `ecoregion_l3` columns exist in the output Parquet — run `parquetReadObjects` in browser console and check feature properties
- [ ] **Click-to-filter on polygon:** Verify clicking polygon interior works (not just border) — requires transparent fill on polygon style
- [ ] **URL serialization:** Verify pasting a region-filtered URL in a new tab restores the filter — test with two regions selected
- [ ] **Samples filtering:** Verify region filter applies to `sampleSource` features too, not just `specimenSource` — both Parquet files need `county` and `ecoregion_l3` columns
- [ ] **`isFilterActive` update:** Verify `filteredSummary` appears in sidebar when only a region filter is active (no taxon/year/month filter) — tests the `isFilterActive` update path
- [ ] **GeoJSON asset size:** Check Vite build output — `*.geojson` should be under 500 KB each; if over 1 MB, simplification was not applied

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| CRS mismatch produced wrong ecoregion assignments in Parquet | MEDIUM | Re-run pipeline with corrected `to_crs('EPSG:4326')` call; re-upload Parquet to S3 and rebuild |
| 408 coastal null ecoregions shipped as null in Parquet | LOW | Add nearest-polygon fallback in pipeline; re-run; CI deploys fix automatically |
| GeoJSON too large shipped in build | MEDIUM | Add simplification step in pipeline GeoJSON export; re-run pipeline; Vite rebuild picks up new file |
| Polygon click swallows specimen clicks | LOW | Reorder hit-detection calls in singleclick handler; no pipeline changes needed |
| FilterState singleton not updated | LOW | Update `filter.ts` + `bee-map.ts` + `bee-sidebar.ts` together; verify with browser test |
| URL region params missing | LOW | Extend `buildSearchParams` + `parseUrlParams`; verify by round-trip URL test |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| CRS mismatch (ecoregion LAEA vs EPSG:4326) | Pipeline: spatial join phase | Assert `result['ecoregion_l3'].isna().sum() < 500` and spot-check Seattle specimens get "Puget Lowland" |
| 408 coastal null ecoregions | Pipeline: spatial join phase | Assert no null ecoregion values for points inside WA bbox |
| Polygon click swallows specimen clicks | Frontend: polygon VectorLayer + click handler phase | Manual test: click a specimen point while county boundary is visible |
| Unfilled polygon has no interior hit detection | Frontend: polygon styling phase | Click center of King County polygon; verify filter is applied |
| FilterState not updated for region | Frontend: filter.ts extension phase | Apply county filter; verify map cluster ghosting matches specimen layer |
| URL region state not serialized | Frontend: URL serialization phase | Apply region filter; copy URL; open in new tab; verify filter restored |
| Unsimplified GeoJSON bloats Vite build | Pipeline: GeoJSON export phase | `ls -la frontend/src/assets/*.geojson` — each file must be under 500 KB |
| Sample source not filtered by region | Frontend: matchesFilter extension phase | In sample mode, apply county filter; verify sample dots outside county disappear |

---

## Sources

- Live codebase audit: `data/ecdysis/occurrences.py`, `frontend/src/filter.ts`, `frontend/src/bee-map.ts`, `frontend/src/parquet.ts`, `frontend/src/style.ts`
- Confirmed CRS of `NA_CEC_Eco_Level3.zip`: `PROJCS["Sphere_ARC_INFO_Lambert_Azimuthal_Equal_Area"]` — non-EPSG spherical datum
- Measured sjoin performance on live 46,090-row ecdysis.parquet: `within`=0.03s, `intersects`=4.3s; 408 coastal nulls confirmed
- Measured GeoJSON sizes for WA ecoregion subset: 6,599 KB unsimplified, 1,044 KB at 0.001°, 224 KB at 0.01°
- [OpenLayers hit detection: polygons without fill](https://github.com/openlayers/openlayers/pull/7750) — confirmed in OL docs
- [geopandas.sjoin predicate semantics](https://geopandas.org/en/stable/docs/reference/api/geopandas.sjoin.html) — `within` vs `intersects` boundary behavior
- [GeoJSON file size optimization](https://open-innovations.org/blog/2023-07-25-tips-for-optimising-geojson-files) — coordinate precision and simplification tradeoffs

---
*Pitfalls research for: v1.5 Geographic Regions — polygon filtering integration into existing BeeAtlas map*
*Researched: 2026-03-14*
