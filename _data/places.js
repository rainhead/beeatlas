// Build-time data feed for the place pages. Read by Eleventy's data cascade
// and exposed to _pages/places.njk and _pages/place-detail.njk as the `places` global.
//
// Contract (PPAGE-01, PPAGE-02): exports { placesArray }.
// - placesArray: array of place objects in pipeline order (slug, name, land_owner,
//   specimen_count, sample_count fields); no sort applied here — pipeline order is authoritative.
//
// Pitfall #8: this module reads places.json only (never columnar store files)
// so Eleventy's HMR stays sub-100ms. Asserted by src/tests/data-places.test.ts.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const placesArray = JSON.parse(readFileSync(join(repoRoot, 'public/data/places.json'), 'utf8'));

export default { placesArray };
