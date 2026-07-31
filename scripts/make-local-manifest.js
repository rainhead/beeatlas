// Writes public/data/manifest.json with unhashed local filenames for `npm run
// dev` — the dev-server counterpart of scripts/postbuild-data.mjs, which writes
// the hashed production manifest into _site/data/ (Model Y: the slim manifest
// carries only the runtime artifacts the client fetches; build-baked data is
// inlined by 11ty and never published).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNTIME_ARTIFACTS } from '../lib/runtime-artifacts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'public', 'data', 'manifest.json');

const manifest = {};
for (const [key, { source }] of Object.entries(RUNTIME_ARTIFACTS)) manifest[key] = source;

// Dev twin of postbuild-data.mjs's derived taxon_pages artifact (beeatlas-dt7):
// unhashed, written beside the other dev data. Non-fatal for the same reason —
// a dev without species.json still gets a working app, just without taxa links.
try {
  const { default: speciesData } = await import('../_data/species.js');
  writeFileSync(join(root, 'public', 'data', 'taxon-pages.json'),
                JSON.stringify(speciesData.taxonPages) + '\n');
  manifest.taxon_pages = 'taxon-pages.json';
  console.log(`wrote public/data/taxon-pages.json (${Object.keys(speciesData.taxonPages).length} taxa)`);
} catch (err) {
  console.warn(`! taxon_pages: not derived (${err.message}) — taxa pane links disabled in dev`);
}

manifest.generated_at = 'local';
// Matches the published manifest's shape (beeatlas-4uj); 'dev' is what bee-header
// shows when the build id came from a working copy rather than a publish.
manifest.build_id = 'dev';

mkdirSync(join(root, 'public', 'data'), { recursive: true });
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('wrote public/data/manifest.json (local dev)');
