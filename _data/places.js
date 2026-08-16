// Build-time data feed for the place pages. Read by Eleventy's data cascade
// and exposed to _pages/places.njk and _pages/place-detail.njk as the `places` global.
//
// Contract (PPAGE-01, PPAGE-02): exports { placesArray, sites, ecoregionGroups }.
// - placesArray: array of place objects in pipeline order (slug, name, kind,
//   land_owner, l3_name, code, specimen_count, sample_count fields); no sort applied
//   here — pipeline order is authoritative. It paginates EVERY place page, both kinds.
// - sites / ecoregionGroups: the /places.html index split by kind (beeatlas-8gcw).
//   Level IV ecoregions are places in every pipeline sense but read as a different
//   kind of thing on the index, so they get their own section, nested under the
//   Level III ecoregion each belongs to.
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
import { buildDataDir } from '../lib/build-data-dir.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const dataDir = buildDataDir(repoRoot);

const placesArray = JSON.parse(readFileSync(join(dataDir, 'places.json'), 'utf8'));

const detailsPath = join(dataDir, 'place_details.json');
const details = existsSync(detailsPath)
  ? JSON.parse(readFileSync(detailsPath, 'utf8'))
  : (console.warn(`[places.js] ${detailsPath} absent — place pages render without species/timing (fetch from S3 for full data)`), []);

const detailBySlug = new Map(details.map((d) => [d.slug, d]));
for (const place of placesArray) {
  const d = detailBySlug.get(place.slug);
  if (d) {
    place.species_by_genus = d.species_by_genus;
    place.collection_months = d.collection_months;
    place.dated_total = d.dated_total;
    place.peak_month = d.peak_month;
    place.target_hosts = d.target_hosts;
  }
}

const ECOREGION_L4 = 'ecoregion_l4';

/**
 * Order two EPA Level IV codes the way they are read: 2f, 9a, 10a, 10b, 77c.
 * Lexically '10a' sorts before '2f', which looks like a bug in a numbered list.
 */
function byCode(a, b) {
  const num = (code) => parseInt(String(code ?? '').match(/\d+/)?.[0] ?? '0', 10);
  return num(a.code) - num(b.code) || String(a.code ?? '').localeCompare(String(b.code ?? ''));
}

const sites = placesArray.filter((p) => p.kind !== ECOREGION_L4);

// [{ l3_name, ecoregions: [...] }], Level III alphabetical, Level IV by code within.
const byL3 = new Map();
for (const p of placesArray.filter((p) => p.kind === ECOREGION_L4)) {
  const key = p.l3_name ?? '';
  if (!byL3.has(key)) byL3.set(key, []);
  byL3.get(key).push(p);
}
const ecoregionGroups = [...byL3.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([l3_name, ecoregions]) => ({ l3_name, ecoregions: ecoregions.sort(byCode) }));

export default { placesArray, sites, ecoregionGroups };
