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
manifest.generated_at = 'local';

mkdirSync(join(root, 'public', 'data'), { recursive: true });
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('wrote public/data/manifest.json (local dev)');
