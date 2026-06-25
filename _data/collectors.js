// Build-time data feed for the collector pages. Read by Eleventy's data cascade
// and exposed to _pages/collectors.njk and _pages/collector-detail.njk as the `collectors` global.
//
// Contract (PAGE-01, D-09): exports { collectorsArray }.
// - collectorsArray: array of collector objects in pipeline order (login, display_name,
//   recordedBy, host_inat_login, specimen_count, sample_count, species_count,
//   status_denominator, status_identified, status_awaiting fields);
//   no sort applied here — pipeline order is authoritative.
//
// Pitfall #8: this module reads collectors.json only (never columnar store files)
// so Eleventy's HMR stays sub-100ms. Asserted by src/tests/data-collectors.test.ts.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const collectorsArray = JSON.parse(readFileSync(join(repoRoot, 'public/data/collectors.json'), 'utf8'));

export default { collectorsArray };
