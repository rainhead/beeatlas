// Build-time data feed for the collector pages. Read by Eleventy's data cascade
// and exposed to _pages/collectors.njk and _pages/collector-detail.njk as the `collectors` global.
//
// Contract (PAGE-01, D-09, STREAM-03): exports { collectorsArray, collectorEventPages }.
// - collectorsArray: array of collector objects in pipeline order (login, display_name,
//   recordedBy, host_inat_login, specimen_count, sample_count, species_count,
//   status_denominator, status_identified, status_awaiting, first_page_events,
//   total_event_pages, total_event_count fields); no sort applied here — pipeline order
//   is authoritative.
// - collectorEventPages: flat array of {login, page_num, total_pages, events} descriptors
//   for pages 2+ of the per-collector event feed (STREAM-03). Loaded ONLY when
//   ELEVENTY_RUN_MODE === 'build' (npm run build / CI deploy); returns [] in serve, watch,
//   and vitest so HMR stays sub-100ms (Pitfall 6 / RESEARCH Open Q1).
//
// Pitfall #8: this module reads only .json files — never columnar store files —
// so Eleventy's HMR stays fast. Asserted by src/tests/data-collectors.test.ts.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const collectorsPath = join(repoRoot, 'public/data/collectors.json');
const collectorsArray = existsSync(collectorsPath)
  ? JSON.parse(readFileSync(collectorsPath, 'utf8'))
  : (console.warn('[collectors.js] public/data/collectors.json absent — returning [] (fetch from S3 for full data)'), []);

// collector_event_pages.json is ~19 MB; only load it during a full Eleventy build.
// Eleventy 3.x sets ELEVENTY_RUN_MODE to 'serve' | 'watch' | 'build'. Only 'build'
// (i.e. `npm run build` / CI deploy) needs the sub-page file. Dev HMR and vitest
// imports both see [] because ELEVENTY_RUN_MODE is unset or 'serve'/'watch'.
const collectorEventPages = process.env.ELEVENTY_RUN_MODE === 'build'
  ? JSON.parse(readFileSync(join(repoRoot, 'public/data/collector_event_pages.json'), 'utf8'))
  : [];

export default { collectorsArray, collectorEventPages };
