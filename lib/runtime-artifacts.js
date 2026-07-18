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
  wilderness: { source: 'wilderness.clean.geojson', basename: 'wilderness' },
  places: { source: 'places.geojson', basename: 'places' },
  places_meta: { source: 'places.json', basename: 'places_meta' },
};
