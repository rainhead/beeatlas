# Feature Landscape — v3.7 Places Tab

**Domain:** Curated collecting-location directory with permit tracking and map integration for a citizen science bee atlas
**Researched:** 2026-05-17
**Confidence:** HIGH for iNat/eBird place-page conventions (web research + official docs fetched), WA permit fields (WDFW page fetched + WA Native Bee Society), and Mapbox GL JS polygon filtering (official docs + GitHub issues); MEDIUM for permit metadata field norms (inferential from NPS/WDFW permit guidance, no authoritative collector field-data standard found); LOW for what other entomology atlases expose on per-site pages (no direct comparanda found — field is sparse)

> Scope: ONLY the new Places tab / feature set for v3.7. Existing SPA, species pages, and occurrence pipeline are context, not research subjects.

---

## How "Place" Features Work in Citizen Science Tools

### iNaturalist Places

iNat Places are geographic boundaries stored in the database. A place page shows:
- Polygon boundary on a map
- Species checklist (taxa observed or known to be present)
- Establishment means per taxon (native / introduced / endemic)
- Parent / child place hierarchy
- Observation count

**What iNat does well:** Linking occurrence data to a named geography. Checklist-based species tracking. Nested place hierarchies (state → county → reserve).

**What iNat does poorly:** No operational metadata (permit info, access restrictions, land manager contact). Boundaries are community-curated and inconsistent. Place checklist counts can lag reality due to indexing quirks (documented bug: "place checklist doesn't show all research grade species"). No per-place specimen count distinct from observation count.

**Relevance to v3.7:** iNat's place-polygon model is the reference for what to store (GeoJSON boundary, checklist-style occurrence count). Its absence of operational metadata is precisely the gap v3.7 fills for bee atlas volunteers.

### eBird Hotspots

eBird hotspots are shared birding locations with a dedicated About page. Relevant fields:

| Section | Fields |
|---------|--------|
| Plan Your Visit | Entrance fees, permit requirements, operating hours, directions, parking, accessibility |
| How to Bird Here | Notable trails, key habitats, target species, birding strategies |
| About This Place | History, ownership and management, conservation context |
| Hotspot Features | Structured boolean flags: restrooms, beginner-friendly, restricted access, seasonal closure |
| Links | Official website + supplemental URLs |

**What eBird does well:** Structured operational metadata (restricted access flag, fee, hours). Community-wiki authoring model. Hotspot Groups aggregate related sub-sites under one overview.

**What eBird does poorly for bees:** No permit tracking per se — "restricted access" is a yes/no flag, not a structured permit record with number, issuing agency, expiration. No specimen counts (birding is observational, not lethal-collection). No polygon boundaries at the hotspot level (eBird hotspots are points).

**Relevance to v3.7:** The "restricted access" flag is table-stakes on any collecting-site directory. eBird's structured content sections (Plan Your Visit / How to Bird Here / About) map well to a Bee Atlas place page, adapted for collectors rather than birders.

### GBIF

GBIF does not have a "place page" concept. Occurrence search can be filtered by country, admin region, or a dataset's locality field, but there is no curated location directory. Not a relevant comparand.

### iDigBio

iDigBio similarly has no site/place directory. Records have lat/lon and locality text, but there is no aggregate place entity. Not relevant.

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Place name + slug + static page at `/places/{slug}/` | Any directory needs per-place pages; this is the URL structure that makes sharing work | LOW | Eleventy pagination from a places data file; matches species-page pattern already shipped |
| Land owner / managing agency | Every collecting permit is issued by or contingent on approval from the land manager; volunteers need to know who manages the land before planning a trip | LOW | One string field: e.g. "WA DNR", "WDFW", "NPS - Hanford Reach", "Clallam County Parks" |
| Active / inactive permit status | Volunteers must know whether the program has current authorization to collect at this site; wrong status = regulatory violation | LOW | Boolean or enum: `active` / `expired` / `no-permit-needed` / `access-denied` |
| Permit expiration date | An active permit becomes inactive on a specific date; volunteers use this to understand validity window | LOW | ISO date field; `null` if no permit required or open-ended |
| Specimen count per place | Conveys how productive the site has been; volunteers choose sites partly by prior collection volume | MEDIUM | Requires spatial join: `ST_Within(occurrence.lat/lon, place.polygon)` in pipeline → `specimen_count` column on places export |
| Place boundary polygon on map (toggleable layer) | Without visible boundaries, the place filter is not spatially grounded for the user | MEDIUM | places.geojson with polygon geometries; Mapbox GL JS fill + stroke layer, toggle via chip or button |
| Place filter chip on main map (ghost/dim occurrences outside polygon) | Core use case: volunteers want to see "what has been collected at this site?" by restricting the view to the polygon | MEDIUM | Filter pattern: collect IDs of occurrences within polygon, apply dim/ghost to points outside; extends existing filter chip system |
| /places/ index page | Without an index, individual place pages are undiscoverable | LOW | Eleventy template listing all places with name, land owner, active status, specimen count |
| Deep-link from place page to filtered map view | Closes the loop: collector reads about a site, clicks "View on map", arrives at main map filtered to that place | LOW | URL param `pl={slug}` encodes the place filter; `bee-atlas` restores it on load |

### Differentiators (Worth Doing in v3.7 if Cheap)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Issuing agency on permit record | Distinguishes "WDFW SCP" from "NPS research permit" from "State Parks Special Use Permit"; different agencies have different renewal processes | LOW | One string field alongside permit status; e.g. "WDFW", "NPS", "WA State Parks" |
| Permit number | Volunteers often need to cite the permit number when reporting collections; having it in the atlas saves a look-up | LOW | String field; nullable. Not all sites need one. |
| Multiple permit records per place | A site on both DNR land and WDFW-managed area may require two separate permits | LOW | Permits as an array of objects in the data model, not a single flat field |
| Access notes (free text) | Operational details that don't fit structured fields: gate codes, seasonal road closures, "park at trailhead 2, not trailhead 1" | LOW | Unstructured text field rendered as a prose paragraph on the place page; markdown acceptable |
| Place active/inactive filtering on /places/ index | Volunteers planning trips only care about active sites; inactive ones are reference only | LOW | Filter toggle on the index page |
| Specimen count by taxon for a place | "This site is productive for Osmia" is more useful than a raw total | HIGH | Requires per-place species aggregation; join complexity and storage cost are significant. Defer. |
| iNat link-out from place page | The iNat project already tracks WABA observations; linking to `inaturalist.org/observations?place_id=...` gives volunteers a complementary view | LOW | One URL field per place, or computed from iNat API |
| "Collecting season" annotation | Some sites are only accessible / productive May–August (flowering phenology + permit windows); surfacing this helps trip planning | LOW | Start-month / end-month fields; rendered as a calendar strip on the place page |

### Anti-Features (Explicitly Do Not Build)

| Feature | Why Requested | Why Problematic | What to Do Instead |
|---------|---------------|-----------------|-------------------|
| User-submitted place edits (wiki-style) | eBird uses community-wiki for hotspot content | Static hosting constraint eliminates server-side write path; also, permit data is legally sensitive and must be authoritative | Hand-curate in a TOML/JSON file in the repo; PR-based edit process is the right governance model |
| Per-place comments / trip reports | eBird hotspot "How to Bird Here" is community-edited | Cold-start problem; managing legally-sensitive access information via community edits is a liability; Facebook/iNat projects already serve this social function | Access notes field (free text, maintainer-curated) covers the informational need |
| Map layer showing all WA public lands | Seems like context for the Places tab | Not scoped to bee collecting; WA DNR public lands GeoJSON is ~50 MB; loads the map with irrelevant geometry | Places layer only shows the 20–100 hand-curated polygons |
| Real-time permit status check via agency API | "Always current" | No public API exists for WDFW/NPS permit status; scraping is brittle; permits change infrequently | Nightly pipeline re-reads a local TOML; maintainer updates TOML when permits change; GitHub PR = audit trail |
| Species rarity / difficulty ratings per place | Appealing for planning | Requires significant editorial effort and will drift; volunteers already have species pages | Link from place page to species pages filtered by ecoregion; let existing data answer the question |
| GPS track upload / trail map embed | eBird does this | Scope creep; not a bee-collecting concern (bees are not trail-bound); adds storage + CDN complexity | Access notes field can reference a trail map URL |
| Permit application wizard / form submission | Natural extension of permit tracking | Far outside static-hosting constraint; also not the atlas's role — the atlas records what's collected, not administers permits | Permit agency website URL field; link out to agency |
| Specimen count broken down by year | Useful for trend analysis | Requires substantially more pipeline complexity (per-place per-year join); better served by a future analytics milestone | Total specimen count is sufficient for v3.7 |

---

## Feature Dependencies

```
[Pipeline spatial join: place_name in occurrences]
    └──required by──> [Specimen count per place]
    └──required by──> [Place filter chip (ghost outside polygon)]

[places.geojson export with polygon + metadata]
    └──required by──> [Map: toggleable place boundaries layer]
    └──required by──> [Place filter chip]
    └──required by──> [/places/ index: live specimen count]

[Eleventy place pages]
    └──required by──> [/places/{slug}/ static page]
    └──required by──> [/places/ index page]
    └──requires──> [places data source (TOML or JSON in repo)]

[URL param pl={slug}]
    └──required by──> [Deep-link from place page to filtered map]
    └──required by──> [Place filter chip state encoded in URL]
    └──must coexist with──> [Existing URL params: bm=, counties=, ecor=, taxon=, sel=]
```

### Dependency Notes

- **Specimen count requires spatial join first:** The pipeline must assign `place_name` (or `place_slug`) to each occurrence row before `places.geojson` can be exported with accurate counts. This is the first pipeline step to implement.
- **Place filter chip depends on places.geojson being loaded at runtime:** The chip must know the polygon to do inside/outside classification. The GeoJSON is fetched at startup alongside counties/ecoregions.
- **Place filter and county/ecoregion filters must coexist:** The existing AND-across-types / OR-within-type semantics apply; a place filter should AND with any active county or taxon filter, not replace it.
- **`pl=` URL param must not conflict with `sel=`:** The selection rectangle and place filter are compatible (select within the already-filtered view); both should encode simultaneously. This differs from the `sel=` / `o=` mutual exclusivity already in the codebase.

---

## Permit Data Model

This is the core novel data structure for v3.7. Based on WA permit practice:

```
Place {
  slug: string                  # URL-safe identifier, stable
  name: string                  # Display name
  land_owner: string            # Managing agency: "WA DNR", "NPS", "WDFW", "Clallam County Parks"
  polygon: GeoJSON Polygon      # Boundary; source: hand-digitized or from agency GIS
  active: boolean               # Whether any permit is currently active
  access_notes: string|null     # Markdown prose; operational details
  collecting_season_start: int|null  # Month (1-12); null = year-round
  collecting_season_end: int|null
  inat_place_url: string|null   # Link to iNat place or project
  permits: [
    {
      issuing_agency: string    # "WDFW", "NPS", "WA State Parks"
      permit_number: string|null
      status: "active"|"expired"|"pending"
      issued_date: ISO date|null
      expiration_date: ISO date|null
      notes: string|null        # e.g., "Annual renewal required; contact Area Manager"
    }
  ]
}
```

**Why permits as an array:** WA sites frequently require both a WDFW Scientific Collection Permit AND a separate land-manager authorization (e.g., a State Parks Special Use Permit). These are distinct instruments with distinct expiration dates. Flattening them to one field would lose this.

**What the WDFW SCP tracks (verified from WDFW page and WA Native Bee Society guidance):** Permit is issued per project (temporal + geographic scope). Annual report required within 45 days of expiration. Does not authorize entry onto private or restricted public land — so the site's access authorization is a SEPARATE instrument from the SCP. Both must be active.

**What the NPS tracks (for Hanford Reach, etc.):** NPS research permits use year/park-acronym/sequential format. Must be renewed annually; zero-take policy in NPS units without explicit permit.

---

## Spatial Filter UX: Ghosting Points Outside a Polygon

This is the key interactive behavior. Evidence from research:

**Pattern:** When a place filter is active, occurrences within the polygon render at full opacity; occurrences outside render at ~25% opacity ("ghosted"). The polygon boundary itself renders as a stroke with a light fill, making the active zone obvious.

**Mapbox GL JS implementation approach:** No native "inverted polygon fill" in Mapbox GL JS style spec as of 2026 (GitHub issue #6267, open). Two practical approaches:

1. **Point opacity via `circle-opacity` expression:** Load all occurrences; when place filter is active, set `circle-opacity` to `["case", ["in", ["get", "id"], ["literal", [... ids within polygon ...]]], 1.0, 0.2]`. This requires knowing all IDs within the polygon — i.e., the spatial join must happen at query time.

2. **Two-layer approach:** A "ghost" layer renders all points at low opacity unconditionally; a "live" layer renders only points within the polygon at full opacity using a filter. The ghost layer is always present; the live layer activates when a place filter is set.

The two-layer approach is cleaner for Mapbox GL JS because `setFilter` is synchronous (no expression evaluation per frame). It extends naturally to the existing layer architecture where specimen and sample layers are already separate.

**ID-based filter alternative:** Run a DuckDB query `WHERE ST_Within(point, polygon)` in-browser at place-selection time; collect the result as a Set of IDs; apply as a `visibleIds`-style filter. This matches the existing filter-query pattern (`_filterQueryGeneration` guard, `visibleEcdysisIds` Set). **This is the recommended approach** — it reuses the existing filter architecture rather than adding a new Mapbox layer management pattern.

**Performance:** A polygon point-in-polygon query over ~45K points in wa-sqlite with a pre-indexed spatial column runs in <100ms. However, BeeAtlas currently does NOT use spatial SQL — it uses pre-joined `county` / `ecoregion_l3` columns. For place filtering, the polygon is small (park scale), and there are only 20–100 places. Options:
- Pre-join at pipeline time: add `place_slug` column to `occurrences.parquet` (same pattern as `county`). Fast at runtime; ~0ms filter cost. Requires pipeline spatial join.
- Client-side point-in-polygon: use Mapbox's `queryRenderedFeatures` or turf.js `booleanPointInPolygon`. Works without pipeline changes; higher runtime cost (~100–500ms for 45K points in JS). Viable for 20–100 small polygons.

**Recommendation:** Pre-join at pipeline time (add `place_slug` to `occurrences.parquet`). This is the same approach used for county and ecoregion. Runtime filter is a Set lookup — O(1) per feature. The `places.geojson` export also gets an accurate `specimen_count` from the same join. One pipeline change, two benefits.

---

## MVP Definition

### Launch With (v3.7)

Core loop: volunteer plans a trip to a known site → views the place page (permit status, land owner, access notes) → clicks "View on map" → map filtered to that site's polygon.

- [x] Places data file in repo (TOML or GeoJSON with properties) for 20–100 sites
- [x] Pipeline spatial join: `place_slug` column added to `occurrences.parquet`
- [x] `places.geojson` export with polygon + `name`, `slug`, `land_owner`, `active`, `specimen_count` properties
- [x] Nightly pipeline produces `places.geojson` uploaded to S3
- [x] Eleventy generates `/places/` index from `places.geojson` (or `places.json`)
- [x] Eleventy generates `/places/{slug}/` static pages with name, land owner, permits table, access notes, specimen count, link to map
- [x] Map: toggleable place boundaries layer (fill-opacity 0.05, stroke, toggle chip)
- [x] Map: place filter (ghosting occurrences outside polygon via `place_slug` Set filter)
- [x] URL param `pl={slug}` encodes active place filter; restored on page load

### Add After Validation (v3.7.x)

- [ ] Collecting season (start/end month) displayed on place page and index — data model supports it; LOW effort
- [ ] iNat place URL link-out — LOW effort once data field exists
- [ ] "Permit expires soon" warning (30-day lookahead) on the index — LOW; useful for admins

### Future Consideration (v3.8+)

- [ ] Per-place species breakdown (which species have been collected here) — HIGH pipeline complexity; HIGH user value for experienced collectors
- [ ] Multiple place filter chips (OR semantics: show occurrences at site A OR site B) — current architecture assumes single place filter
- [ ] Place pages showing seasonality charts based on place-filtered data — requires per-place pre-computed aggregates
- [ ] Automatic permit expiration monitoring / GitHub issue creation — operational tooling, not atlas feature

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Place static pages with permit/owner info | HIGH — directly answers "can I collect here?" | LOW | P1 |
| /places/ index | HIGH — discoverability | LOW | P1 |
| Spatial join → specimen count | HIGH — productivity signal | MEDIUM | P1 |
| Map: places layer (boundaries) | HIGH — spatial orientation | MEDIUM | P1 |
| Map: place filter chip (ghost outside) | HIGH — core interactive use case | MEDIUM | P1 |
| URL param pl= with restore | MEDIUM — shareability | LOW | P1 |
| Permit number + issuing agency fields | MEDIUM — collectors need this for reporting | LOW | P1 (data model only, LOW cost) |
| Multiple permits per place | MEDIUM — some sites require two permits | LOW (data model) | P1 |
| Access notes (free text) | MEDIUM — operational detail not captured by structured fields | LOW | P1 |
| Collecting season dates | LOW-MEDIUM — useful for planning | LOW | P2 |
| iNat place link-out | LOW — supplementary | LOW | P2 |
| Active/inactive filter on index | LOW — most users want all sites | LOW | P2 |
| Per-place species breakdown | HIGH — valuable for experienced collectors | HIGH | P3 |

---

## Competitor Feature Analysis

| Feature | iNaturalist Places | eBird Hotspots | Our Approach |
|---------|-------------------|----------------|--------------|
| Polygon boundary on map | Yes (community-curated, inconsistent quality) | No (point only) | Yes — hand-digitized, authoritative |
| Specimen / occurrence count | Observation count (checklist-based, can lag) | Checklist count (species, not specimens) | Pipeline spatial join → exact specimen count |
| Land owner / managing agency | No | Partial ("ownership and management" in About) | Explicit structured field |
| Permit status | No | "Restricted access" boolean only | Full permit record (status, agency, number, expiry) |
| Permit number | No | No | Yes — nullable string field |
| Multiple permits per site | No | No | Yes — permits array |
| Access notes | No | Yes (Plan Your Visit section, community-edited) | Yes — maintainer-curated free text |
| Collecting season | No | Seasonal closure flag only | Optional start/end month fields |
| Deep-link to filtered occurrence map | Filters observations within place via URL | Links to species checklists | `pl={slug}` URL param; restores filter on load |
| Community-editable | Yes (requires 50+ verifiable obs) | Yes (wiki-style) | No — PR-based maintainer edit |

---

## Sources

- [What is an iNaturalist Place?](https://help.inaturalist.org/en/support/solutions/articles/151000175028-what-is-an-inaturalist-place-) — fetched; fields and two-type model confirmed
- [iNaturalist community forum: Explore vs. Places boundary differences](https://forum.inaturalist.org/t/explore-vs-places-different-boundaries-why/21358) — evidence that place boundary quality varies
- [eBird Hotspot About Pages](https://support.ebird.org/en/support/solutions/articles/48001281732-ebird-hotspot-about-pages) — fetched; three-section content model, structured boolean features confirmed
- [eBird Community-sourced Hotspot Descriptions and Hotspot Groups](https://ebird.org/news/new-hotspot-about-pages-and-groups) — Plan Your Visit / How to Bird Here / About This Place sections; Hotspot Groups model
- [Scientific Collection Permits — WDFW](https://wdfw.wa.gov/licenses/environmental/scientific-collection) — fetched; per-project permit, annual report requirement, land access restriction confirmed
- [Can I catch bees? WA Native Bee Society](https://www.wanativebeesociety.org/post/can-i-catch-bees-in-washington) — WA permit landscape: WDFW SCP + separate land-manager authorization required; specific agencies (WDFW, DNR, State Parks, NPS, county parks) named
- [NPS Research and Collecting Permit Overview](https://www.nps.gov/subjects/science/research-and-collecting-permit-overview.htm) — year/acronym/sequential permit ID format; zero-take policy without permit
- [Washington Bee Atlas collecting land access (via news search)](https://www.myclallamcounty.com/2026/03/30/washington-bee-atlas-needs-volunteers-in-the-field-collecting-bees/) — confirms WDFW, DNR, Clallam County Parks have granted WABA access; named sites include Ginkgo Petrified Forest, Wanapum, Hanford Reach
- [Mapbox GL JS issue #6267: fill-region / inverted polygon](https://github.com/mapbox/mapbox-gl-js/issues/6267) — no native inverted-polygon support confirmed; workaround via world-with-hole polygon documented
- [Mapbox GL JS: Filter features within map view example](https://docs.mapbox.com/mapbox-gl-js/example/filter-features-within-map-view/) — `setFilter` approach for boundary-based feature filtering confirmed

---
*Feature research for: v3.7 Places tab — collecting location directory with permit tracking and map integration*
*Researched: 2026-05-17*
