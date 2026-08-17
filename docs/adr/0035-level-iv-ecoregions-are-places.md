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
  inside a curated site did: `occurrence_places` went from ~21k rows to ~100k.
- **The collector coverage map moved to Level IV** (beeatlas-dflu, 2026-08-16), which
  this record made possible and the Level III map's saturation made worth doing: one
  L3 region is up to a third of the state, so a collector in a single region got a map
  that said "somewhere in eastern Washington". Coverage now comes from the bridge
  rather than the `ecoregion_l3` column, and the fields are named `ecoregion_l4_*` so
  the level is on the face of them. Two measured constraints came with it — the
  simplification tolerance has to be gentler than Level III's (per-feature
  simplification tears shared borders, and 57 regions have far more shared border than
  9), and the stroke has to be a hairline (57 outlines at the old weight read as a
  mosaic). Both are documented where they live, in `data/build_coverage_basemaps.py`
  and `src/styles/places.css`.
- **Checklist records get no place membership at all**, which this change forced a
  decision on. A checklist record's coordinate is a county-level placeholder — 683
  King County records sit on one pin in downtown Seattle — and `src/filter.ts` has
  always dropped those rows from the place filter and the bounds filter for exactly
  that reason. They were nonetheless IN the bridge, harmlessly: a placeholder pin
  rarely lands inside a curated site, so the wrong rows were few and the two
  consumers that read membership directly (the detail card's place list, the
  per-place SVG) almost never saw one. Statewide ecoregion coverage ended that —
  all 21,703 checklist rows gained a membership, and a county-level assertion
  started rendering as one specific Level IV ecoregion. Being a *large* polygon is
  no defence: a county spans several Level IV ecoregions, so the pin still picks
  one. The rule now lives in the bridge, where every consumer inherits it, rather
  than in each consumer. Seven places lose their only membership this way; all
  seven already published zero specimens and zero samples, so no page changes.
- That coverage surfaced a latent upstream defect. One checklist source record has
  a null `ObjectID`, so it reaches `int_combined` with no identity and no `occ_id`;
  it had never reached the bridge because it fell in no named place. It now would,
  and would break the bridge's `not_null(occ_id)` contract. `occurrence_places.sql`
  drops identity-less rows — they are unjoinable by construction — and the upstream
  question is beeatlas-cmsf. Dropping them also retires the alarm that found it, so
  the tripwire moved upstream of the filter:
  `tests/assert_occurrence_identity_gap_bounded.sql` fails if the count ever exceeds
  the one row known today.
- **Shipping it needs one out-of-band step.** The geography layers are producerless
  in the Stelis graph, so the nightly never loads them: a serving host needs
  `uv run python geographies_pipeline.py ecoregions_l4` BEFORE the first nightly
  that carries this code. `places_load` degrades to zero ecoregion places when the
  table is absent, which makes the failure a quietly incomplete publish rather than
  an error — deliberate (a fresh checkout should still build) but worth naming.
- The place pages for large ecoregions carry heavier SVG maps than any site does
  (Central Puget Lowland is ~584 KB raw, ~59 KB gzipped by Apache), because the map
  plots one circle per distinct coordinate.
