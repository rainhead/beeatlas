// Build-time data feed for the place pages. Read by Eleventy's data cascade
// and exposed to _pages/places.njk and _pages/place-detail.njk as the `places` global.
//
// Contract (PPAGE-01, PPAGE-02): exports { placesArray }.
// - placesArray: array of place objects in pipeline order (slug, name, land_owner,
//   specimen_count, sample_count fields); no sort applied here — pipeline order is authoritative.
// - Each place is enriched by slug from place_details.json (phase-1 cyv): species_by_genus,
//   collection_months (12-int Jan..Dec array), dated_total, peak_month. Absent for places
//   with no atlas occurrences, and for ALL places on a clean checkout without the fetched
//   artifact — the template guards on these fields, so degradation is a bare place page.
//
// places.json is the committed index (always present); place_details.json is a
// build_time_fetch artifact (gitignored, fetched from S3 in CI — like collectors.json),
// so its read is existsSync-guarded and degrades to no enrichment rather than ENOENT.
//
// Pitfall #8: this module reads only .json files (never columnar store files)
// so Eleventy's HMR stays sub-100ms. Asserted by src/tests/data-places.test.ts.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const placesArray = JSON.parse(readFileSync(join(repoRoot, 'public/data/places.json'), 'utf8'));

const detailsPath = join(repoRoot, 'public/data/place_details.json');
const details = existsSync(detailsPath)
  ? JSON.parse(readFileSync(detailsPath, 'utf8'))
  : (console.warn('[places.js] public/data/place_details.json absent — place pages render without species/timing (fetch from S3 for full data)'), []);

const detailBySlug = new Map(details.map((d) => [d.slug, d]));
for (const place of placesArray) {
  const d = detailBySlug.get(place.slug);
  if (d) {
    place.species_by_genus = d.species_by_genus;
    place.collection_months = d.collection_months;
    place.dated_total = d.dated_total;
    place.peak_month = d.peak_month;
  }
}

export default { placesArray };
