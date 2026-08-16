# 0035 — Level IV ecoregions are places

Date: 2026-08-16
Status: Accepted
Issues: beeatlas-8gcw

## Context

BeeAtlas already carried EPA Level III ecoregions: 9 polygons covering WA, drawn
as a map overlay and multi-selectable through `FilterState.selectedEcoregions`
against the scalar `occurrences.ecoregion_l3` column. Peter asked for the Level IV
refinement — 57 polygons in WA — to be filterable *and* to get pages.

Two existing mechanisms could carry it, and they are not interchangeable:

- **The Level III mechanism.** A scalar column on `marts/occurrences`, a
  `FilterState` field, an option list read from the DB. It has no notion of a page,
  a per-region species list or a collection-timing histogram, and adding a column
  to the occurrences contract triggers the documented release sequence
  (data-before-code, one-time `SKIP_INTEGRATION_GATE`).
- **The place mechanism.** A row in `geographies.places`, joined by `ST_Within`
  into the `occurrence_places` bridge. That single row already buys membership
  filtering, a `/places/<slug>.html` page, a per-place SVG map, the species-by-genus
  and month-histogram panels, autocomplete, search, and a `?place=` deep link.

## Decision

**A Level IV ecoregion is a place**, `kind = 'ecoregion_l4'`, loaded into
`geographies.places` by `places_load` alongside the hand-authored sites.

Consequences that follow from it, and the choices inside it:

- **`geographies.places` gains `kind`, `l3_name` and `code`, and `land_owner`
  becomes nullable.** Nobody owns an ecoregion; the place page omits the line
  rather than inventing an owner. `kind` — not the absence of a field — is what the
  templates and the frontend branch on.
- **Slugs and titles carry the EPA code**: `1d-volcanics`, "1d. Volcanics". Several
  Level IV names ("Volcanics", "Outwash", "Valley Foothills") name nothing standing
  alone, the code is how the EPA itself cites them, and the prefix namespaces these
  away from the site slugs so a future collecting site cannot collide with one.
  Slugs are immutable after first publish, so this was decided before shipping.
- **Level III stays exactly as it is.** It is not re-expressed as places. It is a
  cheap scalar column, it is multi-select where places are single-select, and its 9
  values are a genuinely different granularity of question. The cost is that
  "filter by ecoregion" now means two things — [CONTEXT.md](../../CONTEXT.md) names
  both so nobody has to guess.
- **Its own map overlay** (`bm=ecoregions_l4`), not the existing Places overlay.
  57 statewide polygons drawn over the 181 small collecting sites would bury them.
  The overlay is its own artifact, `ecoregions_l4.clean.geojson`, published from the
  `marts/ecoregions_l4_geo` dbt mart — which reads `geographies.places`, not the raw
  ecoregion layer, so the overlay's slugs are provably the same slugs the bridge,
  the pages and the `place=` param use. One geometry, one identity.
- **Labels come from a derived point source.** MapLibre anchors a polygon label to
  every polygon of a MultiPolygon, and these are dissolved from the EPA's per-patch
  file — "Loess Islands" is 58 patches, so labelling the polygons stamped the state
  with 58 copies of its name. `src/polygon-label.ts` derives one anchor per feature
  from the already-fetched GeoJSON.

## Rejected alternatives

- **A second scalar column (`ecoregion_l4`) mirroring Level III.** Cheapest to
  filter, but it cannot produce a page, and pages were half the request. It would
  also have changed the occurrences contract for a value the bridge can already
  answer.
- **A third region overlay with its own everything** (its own filter dimension,
  its own page type). All of that already exists as places; a parallel
  implementation would have to be kept in step with it forever.
- **Folding the polygons into `places.geojson`.** One fewer artifact and one fewer
  toggle, at the cost of the Places overlay: the sites are the thing you look at
  that overlay to find.

## Consequences

- Nearly every occurrence now has at least one bridge row, where before only those
  inside a curated site did: `occurrence_places` went from ~21k rows to ~122k.
- That coverage surfaced a latent upstream defect. One checklist source record has
  a null `ObjectID`, so it reaches `int_combined` with no identity and no `occ_id`;
  it had never reached the bridge because it fell in no named place. It now would,
  and would break the bridge's `not_null(occ_id)` contract. `occurrence_places.sql`
  drops identity-less rows — they are unjoinable by construction — and the upstream
  question is tracked separately.
- The place pages for large ecoregions carry heavier SVG maps than any site does
  (Central Puget Lowland is ~584 KB raw, ~59 KB gzipped by Apache), because the map
  plots one circle per distinct coordinate.
