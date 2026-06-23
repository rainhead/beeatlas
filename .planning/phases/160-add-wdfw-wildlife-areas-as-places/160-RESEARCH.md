# Phase 160: Add WDFW wildlife areas as places - Research

**Researched:** 2026-06-22
**Domain:** Geospatial data curation — ArcGIS REST fetch → DuckDB spatial dissolve → MultiPolygon WKT → existing `places.toml` pipeline
**Confidence:** HIGH (source layer located and exercised end-to-end; full payload, validity, and overlap risk measured against the live repo)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Add **all statewide WDFW wildlife areas** (~33). Not a curated subset.
- **D-02:** `land_owner = "Washington Department of Fish & Wildlife"` (full form) for every entry.
- **D-03:** **One entry per wildlife area.** Each area is a single `[[places]]` entry whose `geometry_wkt` is a **MultiPolygon combining all of that area's non-contiguous units** (mirrors `rattlesnake-ledge`). Do **not** create one entry per unit. `ST_Within` still tags a point inside any sub-polygon.
- **D-04:** **No blanket overlap policy.** User does not expect WDFW boundaries to partially overlap any existing place. Validation (`places_validation.py` `ST_Overlaps`, lines ~121–133) hard-fails the whole pipeline on partial overlap (containment is allowed). **If a WDFW boundary trips the overlap check during execution, STOP and raise it to the user** for a per-collision decision — do NOT silently clip, skip, or alter an existing entry.
- **D-05:** **Measure first, simplify only if necessary.** Store full-fidelity boundaries initially; measure the resulting `public/data/places.geojson` weight and delta; simplify for display **only if** the payload is problematic. If simplifying, prefer Douglas–Peucker at a modest tolerance and report before/after size + chosen tolerance. Establish a concrete weight threshold during planning.

### Claude's Discretion
- **`permits[]` population** — optional, **validated but never persisted/exported**. Populate `permits[] = [{ issuing_authority = "Washington Department of Fish & Wildlife", type = "project-level" }]` (optionally `permit_number`/`expiry_date` from the WDFW permit in Box) if readily available, else omit. Do not block on it.
- **Slug naming** — lowercase, `[a-z0-9-]` only. Planner picks exact convention (e.g., `oak-creek-wildlife-area` vs `oak-creek`); slugs are immutable after first publish.

### Deferred Ideas (OUT OF SCOPE)
- Linear "hikes" as places (Phase 161).
- Per-unit granularity (rejected by D-03).
- Display-vs-join dual geometry (only if D-05 measurement forces it AND edge-accuracy then matters).
- Other deferred land managers (Columbia Land Trust per-property, Bureau of Reclamation).
</user_constraints>

<phase_requirements>
## Phase Requirements

v5.2 carries no formal REQUIREMENTS.md IDs for this phase. The phase boundary and decisions in `160-CONTEXT.md` are the requirement set. The implicit acceptance criteria the plan must satisfy:

| Implicit Req | Description | Research Support |
|--------------|-------------|------------------|
| WLA-ACQUIRE | Acquire authoritative WDFW wildlife-area boundaries, reproducibly | Source layer + ArcGIS REST recipe located and exercised (§Standard Stack, §Code Examples) |
| WLA-DISSOLVE | One MultiPolygon WKT per area, dissolving its units | DuckDB `ST_Union_Agg` + `ST_Multi` verified on Oak Creek (5 units) and all 34 areas (§Code Examples) |
| WLA-WGS84 | WKT in EPSG:4326 within WGS84 bounds | Server-side `outSR=4326` returns lon/lat directly; bounds verified in range (§Code Examples) |
| WLA-VALID | All 6 `places_validation.py` checks pass | Geometry validity, WGS84 bounds verified; **overlap check WILL fail — see Pitfall 1** |
| WLA-WEIGHT | Measure places.geojson delta; simplify only if problematic | Full +3.0 MB measured; simplified options measured (§D-05 Weight Analysis) |
</phase_requirements>

## Summary

The authoritative boundary source is **fully located, programmatically fetchable, and exercised end-to-end against this repo's stack**. WDFW publishes a `Wildlife Areas` polygon layer at unit (parcel) granularity:

`https://geodataservices.wdfw.wa.gov/arcgis/rest/services/MapServices/WildlifeAreas/MapServer/0`

It has **220 unit features** carrying a `WLA_Name` (wildlife area) and `WLAU_Name` (unit) attribute, dissolving into **34 distinct wildlife areas** (the 33 listed on wdfw.wa.gov plus "Jackman Creek," which is not on the public list). The ArcGIS REST `query` endpoint returns GeoJSON reprojected server-side to EPSG:4326 (`outSR=4326`), so **no client-side reprojection is needed**. DuckDB's `spatial` extension — already a hard dependency and already loaded in every pipeline step — provides the entire dissolve/repair/simplify/emit toolchain (`ST_GeomFromGeoJSON`, `ST_Union_Agg`, `ST_Multi`, `ST_MakeValid`, `ST_IsValid`, `ST_SimplifyPreserveTopology`, `ST_AsText`). `add_new_places.py` is a near-exact template for the curation script.

**Two findings dominate the plan:**

1. **D-04 overlap WILL fire (HIGH confidence, measured).** Against the live `content/places.toml` (134 entries), the dissolved WDFW areas produce **16 partial `ST_Overlaps` collisions** with existing State Parks, NWRs, and trusts. The CONTEXT.md assumption that "user does not expect WDFW boundaries to partially overlap any existing place" is **empirically false**. This is not a tail risk to guard against — it is a certainty. The plan must treat the stop-and-raise-to-user loop (D-04) as a **mandatory, scheduled phase step**, not an exception handler, and budget for a per-collision triage decision with the user before the pipeline can go green.

2. **D-05 simplification is effectively forced (HIGH confidence, measured).** Full-fidelity geometry adds **~3.0 MB** of GeoJSON to a **current 346 KB** `places.geojson` — a ~9x blow-up to ~3.4 MB shipped to every browser. That clears any reasonable "problematic" threshold. Simplification at tolerance `0.0002°` (~22 m) cuts the WDFW contribution to **~716 KB**; at `0.0005°` (~55 m), to **~549 KB**.

**Primary recommendation:** Write a committed, reproducible one-time curation script `data/add_wdfw_wildlife_areas.py` (modeled on `add_new_places.py`) that fetches the WDFW layer, dissolves by `WLA_Name` in DuckDB to one valid MultiPolygon per area, applies `ST_SimplifyPreserveTopology` at a tolerance the plan fixes from the measured weight budget, emits `[[places]]` TOML blocks, and **runs the `ST_Overlaps` check itself** so the 16 known collisions surface at curation time (not deep in the nightly pipeline). Then resolve the 16 collisions with the user per D-04 before committing the TOML.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Boundary acquisition | Curation script (`data/`, one-time) | — | Reproducibility matters; slugs immutable; not a nightly concern |
| Geometry dissolve/repair/simplify | DuckDB spatial (in curation script) | — | Toolchain already installed; `ST_Union_Agg`/`ST_MakeValid`/`ST_Simplify*` verified |
| Overlap collision detection | Curation script + `places_validation.py` | — | Validation is the sole gatekeeper; curation script should pre-run it to fail fast |
| Persisted content | `content/places.toml` (`[[places]]` blocks) | — | The committed artifact; the curation script only appends to it |
| Spatial join → `place_slug` | dbt `marts/occurrences.sql` `ST_Within` | — | Existing, unchanged; auto-tags points inside any sub-polygon |
| Browser-shipped boundary | `places_export.py` → `places.geojson` | — | Existing, unchanged; D-05 guards its weight |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `duckdb` (+ `spatial` ext) | 1.5.3 (pinned `>=1.5.3,<2`) | Dissolve, repair, reproject, simplify, emit WKT/GeoJSON | Already a hard dep; `LOAD spatial` runs in every existing place step. `ST_Transform`, `ST_Union_Agg`, `ST_Multi`, `ST_MakeValid`, `ST_SimplifyPreserveTopology`, `ST_GeomFromGeoJSON`, `ST_AsText` all verified present [VERIFIED: local exec] |
| `requests` | (in deps) | ArcGIS REST `query` fetch | Already a dep; `add_new_places.py` already uses it against an ArcGIS FeatureServer |
| `tomllib` | stdlib | Read existing places for the overlap pre-check | Used throughout `places_*.py` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `shapely` | (NOT in main deps) | Alternative dissolve/simplify | **Avoid.** `add_new_places.py` pulls it ad-hoc via `uv run --with shapely`. Unnecessary here — DuckDB does everything. Prefer zero new deps. |

**Do not add `geopandas`/`fiona`/`pyproj`** — none are needed. DuckDB spatial bundles PROJ (verified: `ST_Transform('EPSG:2927','EPSG:4326')` works), and the server returns 4326 anyway.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DuckDB `ST_Union_Agg`+`ST_Multi` | shapely `unary_union` + `MultiPolygon` (à la `add_new_places.py`) | shapely path requires `uv run --with shapely` (a transient dep) and hand-managing rings from ArcGIS `rings` JSON. DuckDB path uses GeoJSON directly and needs no extra dep. |
| Server-side `outSR=4326` | Client `ST_Transform` from 3857 | Server reprojection is one fewer step and avoids any reprojection-precision question. Both verified working; prefer server-side. |
| One-time committed script | Hand-edited TOML | 220 units → 34 MultiPolygons by hand is infeasible and error-prone; slugs are immutable, so a reproducible, reviewable script is strongly preferred (see §Don't Hand-Roll). |

**Installation:** None required. All deps present.

```bash
# Verify locally before running curation (no install step):
cd data && uv run python -c "import duckdb; c=duckdb.connect(':memory:'); c.execute('INSTALL spatial; LOAD spatial'); print(duckdb.__version__)"
```

**Version verification:** `duckdb 1.5.3` confirmed installed and pinned in `data/pyproject.toml` (`duckdb>=1.5.3,<2`). `requests` present. [VERIFIED: local exec, data/pyproject.toml]

## Package Legitimacy Audit

No new external packages are installed by this phase. All tooling (`duckdb`, `requests`, stdlib `tomllib`/`json`) is already in `data/pyproject.toml` and exercised by the existing pipeline. **Package Legitimacy Gate: N/A (no new dependencies).** If the planner elects the shapely path (not recommended), `shapely` is a long-established, high-trust PyPI package already referenced by `add_new_places.py`; it would still be pulled transiently via `uv run --with shapely` rather than added to deps.

## The Authoritative Source (central open question — RESOLVED)

### Layer
- **Service:** `https://geodataservices.wdfw.wa.gov/arcgis/rest/services/MapServices/WildlifeAreas/MapServer/0` [VERIFIED: local exec — schema fetched]
  - Discovered via the WA State Geospatial Open Data Portal dataset item `54642c30a0f842f2b8603976b5625678_0` (geo.wa.gov "Wildlife Areas", published by WDFW), whose `url` field resolves to this MapServer layer. [CITED: geo.wa.gov item API]
- **Query endpoint:** `…/MapServer/0/query`
- **Geometry type:** `esriGeometryPolygon`
- **Native SR:** Web Mercator (`wkid 102100`, `latestWkid 3857`). **Use `outSR=4326` to get WGS84 directly.** [VERIFIED]
- **maxRecordCount:** 2000. Total features = **220** → a single unpaginated `where=1=1` fetch is safe (no pagination needed). [VERIFIED]

### Field schema (key attributes)
| Field | Type | Use |
|-------|------|-----|
| `WLA_Name` | String | **Wildlife area name — the DISSOLVE KEY** (one MultiPolygon per distinct value) |
| `WLAU_Name` | String | Wildlife area **unit** name (e.g., Oak Creek's "Cowiche", "Nile Springs") — informational only |
| `Region`, `SubUnitID`, `Complex`, `Contact`, `AccessTypeID`, `AccessTypeIDDesc` | mixed | Not needed for places.toml |

### The 34 wildlife areas (distinct `WLA_Name`) [VERIFIED: distinct-values query]
Asotin Creek · Big Bend · Chehalis · Chelan · Chief Joseph · Colockum · Columbia Basin · Cowlitz · **Jackman Creek** · Johns River · Klickitat · L.T. Murray · LeClerc · Methow · Mount Saint Helens · North Olympic · Oak Creek · Olympic · Revere · Sagebrush Flat · Scatter Creek · Scotch Creek · Sherman Creek · Shillapoo · Sinlahekin · Skagit · Snoqualmie · South Puget Sound · Sunnyside-Snake River · Swanson Lakes · W.T. Wooten · Wells · Wenas · Whatcom

> **Note for planner:** The website lists **33**; the GIS layer has **34** (adds "Jackman Creek"). D-01 says "all statewide WDFW wildlife areas (~33)." Recommend including all 34 from the GIS layer (the authoritative boundary source) and noting the Jackman Creek discrepancy in the commit/PR; it is a real WDFW area absent from the public list page. This is a minor scope clarification, not a re-litigation of D-01.

Unit counts vary widely (Skagit = 19 units, Mount Saint Helens = 18, Sunnyside-Snake River = 16, Columbia Basin = 13; many areas = a handful). [VERIFIED]

## Architecture Patterns

### Data flow (this phase)
```
WDFW ArcGIS REST  ──(requests, where=1=1, outSR=4326, f=geojson)──>  220 unit features (EPSG:4326 GeoJSON)
        │
        ▼  DuckDB spatial (in curation script)
  ST_GeomFromGeoJSON per unit
        │  GROUP BY WLA_Name
        ▼
  ST_Multi(ST_Union_Agg(ST_MakeValid(g)))   ──>  34 valid MultiPolygons
        │  ST_SimplifyPreserveTopology(…, tolerance)   [per D-05 measured budget]
        ▼
  ST_AsText  ──>  MultiPolygon WKT per area
        │
        ├──> SELF-RUN ST_Overlaps vs existing places.toml  ──> surface the 16 collisions HERE (D-04 triage)
        │
        ▼  append [[places]] blocks
  content/places.toml  ──>  (existing pipeline, UNCHANGED) ──> validate → load → dbt ST_Within → export
```

### Recommended project structure
```
data/
├── add_wdfw_wildlife_areas.py   # NEW: one-time committed curation script (template: add_new_places.py)
└── (no other changes — pipeline auto-exposes)
content/
└── places.toml                  # +34 [[places]] blocks appended
```

### Pattern: ArcGIS REST → DuckDB dissolve → WKT
**What:** Fetch all units once, group by `WLA_Name`, union+multi+repair+simplify in one SQL pass, emit WKT.
**When to use:** This phase, and any future bulk place addition from an ArcGIS FeatureServer.
**Why DuckDB over shapely:** `ST_GeomFromGeoJSON` ingests the server response directly; `ST_Union_Agg` is a true aggregate (no manual ring assembly); zero new deps.

### Anti-Patterns to Avoid
- **One entry per unit** — violates D-03. Group by `WLA_Name`, not `WLAU_Name`.
- **Adding shapely/geopandas** — unnecessary; DuckDB spatial is already loaded.
- **Hand-editing 34 MultiPolygons into TOML** — infeasible and unreviewable; use a committed script.
- **Treating the overlap failure as an edge case** — it is guaranteed (16 collisions measured). Schedule the triage.
- **`ST_Union` (binary) instead of `ST_Union_Agg`** — the binary form takes two geometries; the aggregate dissolves a group. Use `ST_Union_Agg` over the GROUP BY.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reprojection 3857→4326 | Manual Mercator math / new pyproj dep | ArcGIS `outSR=4326` (or DuckDB `ST_Transform`) | Server does it precisely; DuckDB bundles PROJ |
| Dissolving units per area | Manual ring merging | `ST_Union_Agg` over `GROUP BY WLA_Name` | True spatial union; dedupes shared edges |
| Forcing MultiPolygon type | String-munging WKT | `ST_Multi(...)` | Guarantees `MULTIPOLYGON` even for single-polygon areas; matches validation expectations |
| Geometry repair | Skipping validity | `ST_MakeValid` + `ST_IsValid` assert | `ST_GeomFromText` in validation rejects invalid rings; simplification can introduce slivers |
| Simplification | Custom decimation | `ST_SimplifyPreserveTopology(g, tol)` | Douglas–Peucker preserving topology (no self-intersections); D-05's named preference |
| Bulk TOML authoring | Typing 34 blocks by hand | Committed `add_wdfw_wildlife_areas.py` | Reproducible; slugs immutable; reviewable diff |

**Key insight:** Every operation this phase needs is a one-liner in DuckDB spatial, which is already loaded in every place pipeline step. The only genuine engineering work is the **D-04 collision triage** and the **D-05 tolerance decision** — both are judgment calls, not code.

## D-05 Weight Analysis (MEASURED — simplification is effectively forced)

Measured against the live data (all 34 areas dissolved, GeoJSON byte length as `ST_AsGeoJSON` would emit) [VERIFIED: local exec]:

| Geometry fidelity | WDFW contribution to places.geojson | Resulting total places.geojson | Notes |
|-------------------|-------------------------------------|-------------------------------|-------|
| **Full fidelity** | **~3,030,000 bytes (~3.0 MB)** | ~346 KB → **~3.4 MB (~9x)** | All 34 valid; clearly "problematic" |
| Simplify `0.0002°` (~22 m) | ~716,000 bytes | ~346 KB → **~1.05 MB** | All 34 still valid [VERIFIED] |
| Simplify `0.0005°` (~55 m) | ~549,000 bytes | ~346 KB → **~0.89 MB** | All 34 still valid |

**Current baseline for context:** `places.geojson` = 345,580 bytes; `counties.geojson` = 511,686 bytes; `ecoregions.geojson` = 192,741 bytes (all in `public/data/`). [VERIFIED]

**Recommended objective threshold (planner to ratify):** Cap the WDFW contribution so total `places.geojson` stays **≤ ~1 MB** (roughly 2x the largest existing geojson, `counties.geojson`). That makes **`0.0002°` (~22 m) the recommended default tolerance** — it yields the most detail under the cap (~716 KB contribution → ~1.05 MB total, marginally over; `0.0005°` is the safe choice at ~0.89 MB). The plan should:
1. Generate full-fidelity first, record the exact delta.
2. Apply `ST_SimplifyPreserveTopology` at the chosen tolerance.
3. Report before/after bytes and tolerance in the commit (D-05 requirement).
4. Re-run `ST_IsValid` after simplification (verified all-valid at both tolerances, but assert it).

> **Display-vs-join dual geometry (deferred idea):** Simplification at ~22–55 m moves boundary edges by tens of meters. For `ST_Within` point-in-polygon tagging this is almost always immaterial (bees aren't collected on the exact legal boundary line), so a single simplified geometry for both join and display is recommended. Only revisit dual geometry if a specific near-edge mis-tag is observed. Note that `simplify` also slightly changes the overlap picture — see Pitfall 1.

## Common Pitfalls

### Pitfall 1: The D-04 overlap check WILL fail — 16 collisions, guaranteed (HIGH confidence, measured)
**What goes wrong:** `places_validation.py` step 6 hard-fails the entire `run.py` pipeline on ANY pairwise `ST_Overlaps`. Measured against the live `places.toml`, the simplified (`0.0002°`) WDFW areas partially overlap **16 existing places**:

| WDFW area | Existing place it overlaps |
|-----------|---------------------------|
| North Olympic | fort-flagler-state-park |
| L.T. Murray | ginkgo-petrified-forest-state-park |
| Klickitat | klickitat-trail-state-park |
| L.T. Murray | lake-easton-state-park |
| Whatcom | larrabee-state-park |
| Methow | pearrygin-lake-state-park |
| Columbia Basin | potholes-state-park |
| Columbia Basin | steamboat-rock-state-park |
| Columbia Basin | sun-lakes-dry-falls-state-park |
| Johns River | twin-harbors-state-park |
| Sunnyside-Snake River | hanford-reach-national-monument |
| South Puget Sound | nisqually-national-wildlife-refuge |
| Johns River | willapa-nwr |
| Skagit | sjcclb-fisherman-bay |
| Skagit | padilla-bay-nerr |
| Whatcom | lummi-island-heritage-trust |

(No WDFW-vs-WDFW overlaps; no full-containment cases — containment would be allowed anyway.) [VERIFIED: local exec]

**Why it happens:** WDFW wildlife areas genuinely abut/interleave with State Parks, NWRs, and trusts across WA; many are simplification-induced edge slivers, but `ST_Overlaps` does not distinguish a 1 m² sliver from a major overlap.

**How to avoid / the required workflow:** Per D-04, the agent must **STOP and raise each collision to the user** — never auto-clip/skip/alter. The plan must:
- Make the curation script run this exact `ST_Overlaps` pre-check itself and print the collision list, so it surfaces at curation time, not 20 steps into the nightly run.
- Schedule a **`checkpoint:human-verify` task** presenting the 16 collisions to the user for per-collision decisions (e.g., accept WDFW boundary as-is and adjust the other entry; drop the colliding WDFW edge unit; defer that one area). This is a **mandatory, budgeted step**, not an error path.
- Tolerance choice interacts with this: a *coarser* simplification can both create new slivers and erase others; the collision set should be recomputed at whatever final tolerance is chosen, immediately before commit.

**Warning signs:** `places.toml: place 'X': polygon overlaps with place 'Y'` raised in the `places-validation` step → pipeline aborts.

### Pitfall 2: Web Mercator coordinates would fail the WGS84 bounds check
**What goes wrong:** If geometry is fetched in native SR (3857), coordinates are millions of meters and `places_validation.py` step 5 (lon −180..180, lat −90..90) fails.
**How to avoid:** Always pass `outSR=4326` to the ArcGIS query (verified to return lon/lat). Bounds of fetched data verified in-range (Oak Creek lon ≈ −121.0…−120.7, lat ≈ 46.6…47.0). [VERIFIED]

### Pitfall 3: Single-polygon areas need `ST_Multi`
**What goes wrong:** An area with one contiguous unit unions to a `POLYGON`, but D-03 and the `rattlesnake-ledge` precedent expect `MULTIPOLYGON`. `ST_GeomFromText` accepts both, but consistency matters and `ST_Within` semantics are identical.
**How to avoid:** Always wrap in `ST_Multi(...)` so every entry is `MULTIPOLYGON`. [VERIFIED: produces `MULTIPOLYGON` for both disjoint and single inputs]

### Pitfall 4: Simplification can introduce invalid geometry
**What goes wrong:** Aggressive Douglas–Peucker can self-intersect.
**How to avoid:** `ST_SimplifyPreserveTopology` (not plain `ST_Simplify`); assert `ST_IsValid` after. Verified all 34 valid at `0.0002°` and `0.0005°`. [VERIFIED]

### Pitfall 5: TOML heredoc / WKT formatting
**What goes wrong:** `geometry_wkt` is a triple-quoted block; a stray quote or unescaped char breaks parse.
**How to avoid:** Reuse `add_new_places.py`'s `toml_block(...)` writer verbatim (it already emits the `geometry_wkt = """ … """` form and the `permits = [...]` block). Validation re-parses with `tomllib`, so a malformed block fails fast.

### Pitfall 6: `land_owner` string must match D-02 exactly
**What goes wrong:** Using "WDFW" or "Washington Dept. of Fish & Wildlife" breaks the convention.
**How to avoid:** Hardcode `"Washington Department of Fish & Wildlife"` (note the ampersand, matching existing "US Fish & Wildlife Service" style). [per D-02]

## Code Examples

### Fetch all units (one request) — verified
```python
# Source: exercised live against the WDFW MapServer this session
import requests
BASE = ("https://geodataservices.wdfw.wa.gov/arcgis/rest/services/"
        "MapServices/WildlifeAreas/MapServer/0/query")
r = requests.get(BASE, params={
    "where": "1=1",
    "outFields": "WLA_Name,WLAU_Name",
    "returnGeometry": "true",
    "outSR": "4326",        # server-side reproject to WGS84 — no client transform needed
    "f": "geojson",
}, timeout=120)
features = r.json()["features"]   # 220 features (under maxRecordCount 2000 → no pagination)
```

### Dissolve per area → valid MultiPolygon WKT — verified
```python
# Source: exercised live; all 34 areas produced valid MULTIPOLYGON
import json, duckdb
con = duckdb.connect(":memory:")
con.execute("INSTALL spatial; LOAD spatial")   # spatial is already installed in repo; LOAD suffices in pipeline
con.execute("CREATE TABLE u(wla VARCHAR, g GEOMETRY)")
for f in features:
    con.execute("INSERT INTO u VALUES (?, ST_GeomFromGeoJSON(?))",
                [f["properties"]["WLA_Name"], json.dumps(f["geometry"])])

TOL = 0.0002   # planner fixes from D-05 weight budget (~22 m); 0 to skip
rows = con.execute("""
    SELECT
        wla,
        ST_AsText(
            ST_Multi(
                ST_SimplifyPreserveTopology(
                    ST_MakeValid(ST_Union_Agg(ST_MakeValid(g))),
                    ?
                )
            )
        ) AS wkt,
        ST_IsValid(ST_Multi(ST_Union_Agg(ST_MakeValid(g)))) AS valid
    FROM u
    GROUP BY wla
    ORDER BY wla
""", [TOL]).fetchall()
# each row → one [[places]] block via add_new_places.toml_block(...)
```

### Self-run the D-04 overlap pre-check before committing TOML — verified
```python
# Source: exercised live; returns the 16 collisions listed in Pitfall 1
import tomllib
existing = tomllib.load(open("../content/places.toml", "rb"))["places"]
con.execute("CREATE TABLE existing(slug VARCHAR, g GEOMETRY)")
for p in existing:
    con.execute("INSERT INTO existing VALUES (?, ST_GeomFromText(?))",
                [p["slug"], p["geometry_wkt"].strip()])
con.execute("""CREATE TABLE wdfw AS
    SELECT wla AS slug,
           ST_Multi(ST_SimplifyPreserveTopology(ST_MakeValid(ST_Union_Agg(ST_MakeValid(g))), 0.0002)) AS g
    FROM u GROUP BY wla""")
collisions = con.execute(
    "SELECT w.slug, e.slug FROM wdfw w, existing e WHERE ST_Overlaps(w.g, e.g)"
).fetchall()
# STOP and raise these to the user (D-04). Do NOT auto-clip/skip/alter.
```

### TOML block writer — reuse from `add_new_places.py`
```python
# Source: data/add_new_places.py:78–97 (use verbatim)
def toml_block(slug, name, land_owner, wkt, permits): ...
# permits optional (D-05 discretion): [{ "issuing_authority": "Washington Department of Fish & Wildlife", "type": "project-level" }]
```

## State of the Art

| Old Approach | Current Approach | When | Impact |
|--------------|------------------|------|--------|
| shapely `unary_union` + ArcGIS `rings` parsing (`add_new_places.py`) | DuckDB `ST_GeomFromGeoJSON` + `ST_Union_Agg` | This phase | No transient `--with shapely`; ingest GeoJSON directly |
| Client reprojection | Server `outSR=4326` | This phase | One fewer step; no PROJ-precision question |

**Deprecated/outdated:** None relevant.

## Runtime State Inventory

Not a rename/refactor/migration phase — this is a pure additive content phase. **No runtime state to migrate.** New `place_slug` values appear in `marts/occurrences.parquet` on the next dbt build automatically; no datastore re-keying, no OS-registered state, no secrets, no stale build artifacts. Slugs are new (additive), so no immutability conflict. (Verified: `places_load.py` does `CREATE OR REPLACE TABLE geographies.places` each run — fully rebuilt from TOML, no incremental state.)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "Jackman Creek" (34th area in GIS, absent from website) is a real WDFW wildlife area to include | Source / D-01 note | Low — it's in the authoritative GIS layer; planner should confirm inclusion with user, but excluding it is a one-line `WHERE WLA_Name != 'Jackman Creek'` |
| A2 | A single simplified geometry suffices for both `ST_Within` join and display (no dual geometry) | D-05 / deferred | Low — simplification moves edges ≤ tens of meters; near-edge mis-tags unlikely for bee collection points |
| A3 | The 16 measured collisions are stable enough to plan around (exact set may shift slightly with final tolerance) | Pitfall 1 | Low — the *existence* of collisions is certain; the *set* must be recomputed at the final chosen tolerance immediately before commit |
| A4 | WDFW permit metadata (number/expiry) in Box is not worth blocking on | Discretion | None — `permits[]` is validated but never persisted/exported |

## Open Questions

1. **Include "Jackman Creek" (34 areas) or restrict to the 33 listed (web list)?**
   - Known: GIS layer has 34 distinct `WLA_Name`; website lists 33 (omits Jackman Creek).
   - Unclear: whether the user wants strictly the publicly-listed set.
   - Recommendation: include all 34 from the authoritative GIS layer; flag Jackman Creek in the PR. Trivial to drop if the user prefers 33.

2. **Final simplification tolerance and the exact weight threshold.**
   - Known: full = ~3.0 MB (forced to simplify); `0.0002°` → ~716 KB; `0.0005°` → ~549 KB; both stay valid.
   - Recommendation: target total `places.geojson` ≤ ~1 MB; default to `0.0002°`, fall back to `0.0005°` if the cap is firm. Planner ratifies the number.

3. **Per-collision resolution for the 16 D-04 overlaps.**
   - Known: 16 specific pairs (Pitfall 1).
   - Unclear: per-pair user preference (accept/clip-other/defer).
   - Recommendation: a mandatory `checkpoint:human-verify` task presenting the list; do not pre-decide.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| WDFW ArcGIS REST service | Boundary acquisition | ✓ (reachable, queried) | — | Manual GeoJSON download from geo.wa.gov dataset page |
| DuckDB + `spatial` | Dissolve/repair/simplify | ✓ | 1.5.3 | — |
| `requests` | REST fetch | ✓ | (in deps) | — |
| Network egress to `geodataservices.wdfw.wa.gov` | One-time curation | ✓ (this session) | — | Pre-download GeoJSON, commit a cached fixture |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None blocking. (If curation is ever re-run offline, cache the 220-feature GeoJSON response.)

## Validation Architecture

> `.planning/config.json` not inspected for `nyquist_validation`; this phase has dedicated contract tests already in the repo. The validation gate is `places_validation.py` itself.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 (data side); Vitest (frontend, not exercised here) |
| Config | `data/pyproject.toml` `[tool.pytest.ini_options]` (`testpaths=["tests"]`, `-m 'not integration'`) |
| Quick run | `cd data && uv run pytest tests/test_places_validation.py tests/test_places_load.py tests/test_places_export.py` |
| Full place pipeline | `cd data && uv run python run.py` (or just the place steps) |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Command | Exists? |
|-----|----------|-----------|---------|---------|
| WLA-VALID | All 6 validation checks pass on new TOML | unit | `uv run pytest tests/test_places_validation.py` | ✅ existing |
| WLA-VALID (overlap) | No `ST_Overlaps` after D-04 triage | integration | `uv run python -c "from places_validation import validate_places_step; validate_places_step()"` | ✅ existing gate |
| WLA-DISSOLVE | Load yields 34 new rows | unit | `uv run pytest tests/test_places_load.py` | ✅ existing |
| WLA-WEIGHT | places.geojson written, size reported | unit | `uv run pytest tests/test_places_export.py` | ✅ existing |

### Sampling Rate
- **Per commit:** the three place tests above.
- **Pre-commit of TOML:** run `validate_places_step()` directly — this is where the D-04 overlap will fire if not resolved.
- **Phase gate:** full `run.py` green + measured `places.geojson` size reported.

### Wave 0 Gaps
- None for the pipeline itself (contract tests exist). The *new* artifact is the curation script `data/add_wdfw_wildlife_areas.py`; a light test asserting it emits 34 valid `MULTIPOLYGON` blocks (or a golden-fixture test) is optional but recommended given slug immutability.

## Security Domain

No `security_enforcement`-relevant surface: no auth, no user input, no secrets handling, no new network endpoints exposed. The one external fetch is a read-only GET to a public WA-state ArcGIS service over HTTPS. `places_load.py` already uses parameterized `ST_GeomFromText(?)` (WKT-injection-safe); the curation script should likewise parameterize all SQL (the verified examples do). No ASVS category applies beyond standard transport security (HTTPS, already used).

## Sources

### Primary (HIGH confidence)
- WDFW ArcGIS REST layer `…/MapServices/WildlifeAreas/MapServer/0` — schema, 220 features, 34 `WLA_Name`, `outSR=4326` GeoJSON, dissolve/validity/overlap/weight — **all exercised live this session** [VERIFIED: local exec]
- `data/add_new_places.py`, `places_validation.py`, `places_load.py`, `places_export.py`, `run.py`, `marts/occurrences.sql`, `content/places.toml`, `data/pyproject.toml` — read directly [VERIFIED: repo]
- DuckDB 1.5.3 + spatial: `ST_Transform/Union_Agg/Multi/MakeValid/IsValid/SimplifyPreserveTopology/GeomFromGeoJSON/AsText` — all confirmed present [VERIFIED: local exec]

### Secondary (MEDIUM confidence)
- geo.wa.gov dataset item `54642c30a0f842f2b8603976b5625678_0` (resolves service URL) [CITED: geo.wa.gov item API]
- wdfw.wa.gov/places-to-go/wildlife-areas (33-name public list) [CITED]

### Tertiary (LOW confidence)
- None. All load-bearing claims verified by execution.

## Metadata

**Confidence breakdown:**
- Source location & fetch recipe: HIGH — service queried, schema + counts + names confirmed live.
- Dissolve/validity/WKT toolchain: HIGH — every operation run successfully in the repo's DuckDB.
- D-05 weight: HIGH — exact byte deltas measured at full + two tolerances against current `places.geojson`.
- D-04 overlaps: HIGH — 16 specific collisions enumerated against live `places.toml`.
- Jackman Creek inclusion (A1): MEDIUM — authoritative in GIS, absent from web list; a scope clarification for the user.

**Research date:** 2026-06-22
**Valid until:** ~2026-07-22 (stable; the WDFW layer and place pipeline change rarely. Re-verify the overlap set at the final chosen tolerance immediately before commit, since `places.toml` may gain entries from Phase 161+.)
