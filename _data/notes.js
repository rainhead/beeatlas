// Build-time notes data feed for the species detail page (Phase 179).
// Reads the per-species notes/ dir (produced by data/notes_harvest.py — one
// notes/<canonical_name>.json per species with approved notes, the keyed unit a
// Stelis targeted rebuild touches) and exposes a Record<canonical_name, Note[]>
// where each Note is:
//   { id, html, body_md, byline: { display_name, login, collector_url|null }, created, updated }
// Notes are approved-only, newest-first (producer side, D-10). The key is the
// filename stem — the same mapping the retired notes.json roll-up used
// (beeatlas-6x9: the monolith's only consumer was this loader, so the loader
// now reads the keyed files directly and the assemble step is gone).
//
// The loader is ABSENCE-TOLERANT: if notes/ does not yet exist (first code
// deploy before the first nightly data run) the loader returns {}, and a file
// that fails to parse is skipped with a warning — so npm run dev, npm test, and
// the CI build all succeed (D-13).
//
// Default-export ONLY: Eleventy 3 auto-unwraps the default export of a
// _data/*.js file iff the module has no other named exports. Adding a named
// export here would cause Eleventy to expose the module namespace, hiding the
// data table behind `notes.default` (same pitfall as _data/photos.js).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { buildDataDir } from '../lib/build-data-dir.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const notesDir = join(buildDataDir(repoRoot), 'notes');

const result = {};
if (existsSync(notesDir)) {
  for (const file of readdirSync(notesDir).sort()) {
    if (!file.endsWith('.json')) continue;
    const path = join(notesDir, file);
    try {
      result[basename(file, '.json')] = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      console.warn(`_data/notes.js: WARNING — could not parse ${path} (${err}); skipping`);
    }
  }
}

export default result;
