// Build-time notes data feed for the species detail page (Phase 179).
// Reads public/data/notes.json (produced by data/notes_harvest.py) and exposes
// a Record<canonical_name, Note[]> where each Note is:
//   { id, html, byline: { display_name, login, collector_url|null }, created, updated }
// Notes are approved-only, newest-first (producer side, D-10).
//
// The loader is ABSENCE-TOLERANT: if notes.json does not yet exist (first code
// deploy before the first nightly data run) or if JSON.parse fails, the loader
// returns {} so npm run dev, npm test, and the CI build all succeed (D-13).
//
// Default-export ONLY: Eleventy 3 auto-unwraps the default export of a
// _data/*.js file iff the module has no other named exports. Adding a named
// export here would cause Eleventy to expose the module namespace, hiding the
// data table behind `notes.default` (same pitfall as _data/photos.js).

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const notesPath = join(repoRoot, 'public/data/notes.json');

let result = {};
if (existsSync(notesPath)) {
  try {
    result = JSON.parse(readFileSync(notesPath, 'utf8'));
  } catch (err) {
    console.warn(`_data/notes.js: WARNING — could not parse ${notesPath} (${err}); returning {}`);
  }
}

export default result;
