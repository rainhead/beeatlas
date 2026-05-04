// Build-time photo manifest feed for the species page.
// Reads content/species-photos.toml (Phase 79 output) and exposes a
// Record<scientificName, { description, photos[] }> with photos sorted
// by `ordering` ascending per PAGE-03.
//
// @iarna/toml's TOML.parse is synchronous -- verified at
// node_modules/@iarna/toml/toml.js. Eleventy 3.x caches the export across
// page builds, so this 15K-line parse runs once per `npm run dev` startup
// (Pitfall 5).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import TOML from '@iarna/toml';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const tomlPath = join(repoRoot, 'content/species-photos.toml');

const manifest = TOML.parse(readFileSync(tomlPath, 'utf8'));
const speciesTable = manifest.species ?? {};

const result = {};
for (const [name, entry] of Object.entries(speciesTable)) {
  const description = typeof entry.description === 'string'
    ? entry.description.trim()
    : '';
  const photos = (entry.photos ?? [])
    .slice()
    .sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0));
  result[name] = { description, photos };
}

export default result;
