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

// Phase 82 PERF-03 / D-09: derive a width-descriptor srcset from the
// iNat URL pattern (.../photos/<id>/<size>.<ext>). Stable enough that
// we avoid extending the TOML schema for three URLs per photo.
//
// Recognized size tokens: square (75 px), small (240 px), medium (500 px),
// large (~1024 px), original.
//
// Hero default = medium (500w) per D-09.
// Non-iNat URLs (no recognized size token) → no srcset.

const SIZE_TOKENS = ['square', 'small', 'medium', 'large', 'original'];
// Match a trailing /<size>.<ext> segment with the size token captured.
const SIZE_RE = new RegExp(`/(${SIZE_TOKENS.join('|')})(\\.[a-zA-Z0-9]+)$`);

export function deriveSrcset(url) {
  if (typeof url !== 'string') return { src: url, srcset: '' };
  const m = url.match(SIZE_RE);
  if (!m) return { src: url, srcset: '' };
  const ext = m[2];
  const swap = (size) => url.replace(SIZE_RE, `/${size}${ext}`);
  const square = swap('square');
  const small = swap('small');
  const medium = swap('medium');
  return {
    src: medium,
    srcset: `${square} 75w, ${small} 240w, ${medium} 500w`,
  };
}

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
    .sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0))
    .map(p => {
      const { src, srcset } = deriveSrcset(p.url);
      return { ...p, src, srcset };
    });
  result[name] = { description, photos };
}

export default result;
