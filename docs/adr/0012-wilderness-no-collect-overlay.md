# ADR 0012: Wilderness No-Collect Overlay

**Status:** Accepted (implemented 2026-07-06; issue beeatlas-2vj; amended 2026-08-22 — simplification retention raised 5% → 50%)

---

## Context

BeeAtlas volunteers need to know where collecting is *prohibited*. Designated
federal wilderness (the National Wilderness Preservation System) bans specimen
collection. The map already had a **Regions** control toggling three reference
overlays — Counties, Ecoregions, Places — each backed by a hashed GeoJSON
artifact declared in `data/artifacts.toml` and rendered as a fill+line layer.

A wilderness layer superficially resembles `places.toml`, and the original
ticket framed it that way. But the semantics are inverted: every `places.toml`
entry is a location where BeeAtlas *can* collect (it carries `permits[]`, and
place membership drives the "bees found here" pages). Folding "off-limits" areas
into that permitted-place set would be misleading.

## Decision

**Ship wilderness as a distinct, display-only *no-collect* overlay** — a fourth
Regions mode, not a `places.toml` entry — sourced from **PAD-US 4.1** and scoped
to **Washington** (configurable for later expansion).

- **Separate overlay, warning styling.** New `boundaryMode: 'wilderness'` with a
  constant red fill/outline (`src/style.ts` `wilderness*LayerSpec`). Unlike the
  county/ecoregion/place layers it has **no click-to-select feature-state** and
  adds **no `FilterState` field** — it is purely informational ("you can't
  collect here"), so it sidesteps the required-field filter contract.

- **Source = PAD-US Designation feature class, via the GDB download.** The
  National Wilderness Preservation System polygons live in PAD-US's *Designation*
  feature class (`Des_Tp = 'WA'` = "Wilderness Area"). USGS's live ArcGIS REST
  service (`PADUS_Public_Access`) flattens overlaps to the Fee representation and
  drops the wilderness designation (Olympic appears only as the NPS "Olympic
  National Park" polygon), so it is unusable here. The per-state File Geodatabase
  download (`PADUS4_1_State_WA_GDB_KMZ.zip`, ScienceBase, name-addressable by
  state code) carries the full Designation class. This matches the existing
  `geographies_pipeline.py` "download → DuckDB, changes rarely, run manually"
  pattern rather than the `places.toml` curation pattern.

- **Read via pyogrio, not DuckDB `ST_Read`.** The state GDB's Designation layer
  is `PADUS4_1Designation_State_WA` (state-suffixed; the unsuffixed name does not
  exist), and it contains ~645 designations of which ~112 are the WA wilderness
  units (31 distinct names). Scanning the whole layer in DuckDB crashes: some
  non-wilderness designations carry geometry types DuckDB can't decode
  ("Unsupported geometry type in WKB"), and `ST_Read` has no attribute-filter
  pushdown to skip them. pyogrio (bundled GDAL) pushes `where="Des_Tp='WA'"` into
  GDAL so only the ~112 clean wilderness features are ever read; DuckDB then
  reprojects their WKB from USGS Albers (ESRI:102039) to EPSG:4326 and
  `ST_MakeValid`s the few self-intersecting source polygons. pyogrio is a
  uv-managed dependency — no reliance on a system GDAL install.

- **Olympic carve-out.** BeeAtlas has a collecting relationship with Olympic
  National Park, so the wilderness inside it is excluded from the overlay
  (`stg_geo__wilderness` drops `Unit_Nm` matching "Olympic Wilderness" / its
  post-2017 name "Daniel J. Evans Wilderness").

- **Standard boundary chain.** `geographies.padus_wilderness` (DuckDB) →
  `stg_geo__wilderness` (Olympic carve-out) →
  `wilderness_geo` mart (dissolve by name, `emit_feature_collection` post-hook) →
  `topology_postprocess` (mapshaper `-clean`/`-simplify` at 50%; see the 2026-08-22
  amendment) → `wilderness.geojson` → contract-driven hash/upload/manifest →
  runtime fetch.

- **`baseline_diff = false` for the initial ship.** A brand-new artifact has no
  S3 baseline, so enrolling it in the nightly drift-diff gate would deadlock the
  first deploy (see `project_occurrences_contract_release_sequence`). Matches how
  `places.geojson` is treated; promote to `true` in a follow-up.

- **Not precached for offline.** Wilderness is left out of the prime denominator
  (`prime-orchestrator.ts`) to avoid changing the load-bearing offline asset set;
  the overlay lazy-loads when selected. A missing manifest key resolves to `null`
  → empty FeatureCollection, so the frontend ships safely before the first
  nightly publishes the artifact.

## Operator step (one-time, on maderas)

The `wilderness_geo` dbt model reads `geographies.padus_wilderness`, which the
nightly does **not** load (it is a ~260 MB/state download that changes rarely).
Before the first nightly build that includes the model, run:

```bash
cd data && uv run python geographies_pipeline.py wilderness
```

Otherwise `bash data/dbt/run.sh build` fails on the missing source table (same
sequencing as counties/ecoregions), unless the `on-run-start` guard in
`dbt_project.yml` has created the empty table (in which case the overlay is
simply empty until this runs). If a future PAD-US release renames the layer,
`pyogrio.list_layers(<gdb>)` fails loudly and shows the current layer names.

## Rejected alternatives

- **Wilderness as `places.toml` entries** (the ticket's original framing) —
  conflates permitted collecting locations with prohibited zones; pollutes the
  "bees found here" place model. Rejected.
- **Wilderness.net / NWPS REST layer** — a clean live source of the same
  polygons, but the source decision was PAD-US. Noted as the fallback if the
  PAD-US GDB path proves brittle on maderas.
- **PAD-US live REST (`PADUS_Public_Access`)** — drops the wilderness designation
  via overlap flattening (verified: `Des_Tp='Wilderness Area'` returns 0). Unusable.

## Amendment (2026-08-22): simplification retention 5% → 50%

The original 5% mapshaper retention was chosen to hold the artifact "to the
tens-of-KB range like ecoregions". That framing was wrong for this layer:
ecoregion boundaries are informational, but the wilderness overlay tells
volunteers where collecting is **prohibited**, so positional error is a real
hazard, not a cosmetic one.

Measured against the raw mart (max Hausdorff deviation of the simplified
boundary from the true PAD-US line, excluding the two offshore-island
multipolygons where dropped islets dominate the metric):

| Retention | Raw size | Gzipped | Median deviation | Worst deviation |
|---|---|---|---|---|
| 5% (old) | 435 KB | 174 KB | ~235 m | **~7.0 km** (Mount Rainier) |
| 10% | 862 KB | 341 KB | ~101 m | ~470 m (Stephen Mather) |
| 25% | 2.1 MB | 824 KB | ~22 m | ~123 m (Mount Rainier) |
| **50% (new)** | **4.2 MB** | **1.6 MB** | **~3 m** | **~57 m** (Tatoosh, Rainier) |
| 100% (clean only) | 8.5 MB | 3.1 MB | — | — |

The 5% worst case was dominated by the large multipolygon park wildernesses
(Mount Rainier, Stephen Mather), where `keep-shapes` preserved every piece but
starved the big rings of vertices. At 50% the worst-case error (~57 m) is
comparable to consumer GPS error under canopy, i.e. the map is no longer the
weakest link. The cost — ~1.6 MB over the wire — is acceptable because the
overlay lazy-loads only when the user selects the Wilderness regions mode and
is not in the offline precache set (see "Not precached for offline" above).

Even at 50%, the rendered line remains a display approximation of the legal
boundary; near an edge, ground truth (signage, official GPS data) governs.
