// Build-time floral-host data feed for the species detail page (Phase 175).
// Reads public/data/species_hosts.json (produced by data/species_export.py) and
// exposes a Record<canonical_name, HostFamily[]> where each HostFamily is:
//   { family: string, sample_count: number, genera: { genus: string, sample_count: number }[] }
// Families and genera are ordered by sample_count desc (producer side).
//
// The loader is ABSENCE-TOLERANT: if species_hosts.json does not yet exist
// (first code deploy before the first nightly data run) or if JSON.parse fails,
// the loader returns {} so npm run dev, npm test, and the CI build all succeed.
//
// Default-export ONLY: Eleventy 3 auto-unwraps the default export of a
// _data/*.js file iff the module has no other named exports. Adding a named
// export here would cause Eleventy to expose the module namespace, hiding the
// data table behind `species_hosts.default` (same pitfall as _data/photos.js).

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const speciesHostsPath = join(repoRoot, 'public/data/species_hosts.json');

let result = {};
if (existsSync(speciesHostsPath)) {
  try {
    result = JSON.parse(readFileSync(speciesHostsPath, 'utf8'));
  } catch (err) {
    console.warn(`_data/species_hosts.js: WARNING — could not parse ${speciesHostsPath} (${err}); returning {}`);
  }
}

export default result;
