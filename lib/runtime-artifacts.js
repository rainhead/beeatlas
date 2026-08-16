// The runtime data contract (stelis ADR 0007 Amendment, Model Y): the artifacts
// the CLIENT fetches at runtime via manifest.json + resolveDataUrl. Everything
// else the data build produces is either inlined by 11ty at build time
// (_data/*.js) or internal to the data pipeline — neither is published.
//
// Consumed by scripts/postbuild-data.mjs (hash + publish into _site/data) and
// scripts/make-local-manifest.js (unhashed dev manifest). The keys mirror the
// Manifest interface in src/manifest.ts — change them together.
//
//   source   — filename in the build data dir (lib/build-data-dir.js)
//   basename — hashed-name prefix: <basename>-<12-hex>.<source ext>

export const RUNTIME_ARTIFACTS = {
  occurrences_db: { source: 'occurrences.db', basename: 'occurrences' },
  counties: { source: 'counties.clean.geojson', basename: 'counties' },
  ecoregions: { source: 'ecoregions.clean.geojson', basename: 'ecoregions' },
  // EPA Level IV ecoregions (beeatlas-8gcw). Its own overlay rather than part of
  // `places`, even though these ARE places: 57 statewide polygons would bury the
  // 181 small collecting sites they'd be drawn over.
  ecoregions_l4: { source: 'ecoregions_l4.clean.geojson', basename: 'ecoregions_l4' },
  wilderness: { source: 'wilderness.clean.geojson', basename: 'wilderness' },
  places: { source: 'places.geojson', basename: 'places' },
  places_meta: { source: 'places.json', basename: 'places_meta' },
  // beeatlas-0of.2: county/ecoregion -> taxon presence for the static /species/
  // pickers. Fetched lazily on first use, so /species/ still loads no data on paint.
  taxon_presence: { source: 'taxon_presence.json', basename: 'taxon_presence' },
};
